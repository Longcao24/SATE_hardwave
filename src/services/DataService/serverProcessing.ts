import { supabase } from '@/lib/supabase';
import type { TranscriptData, IssueCounts } from './types';
import { countErrors } from './errorCounter';
import { trackAction } from '@/services/usage/tracker';

// A web upload is PROCESSED BY THE BACKEND, exactly like a device take (2026-10-28).
//
// The browser used to POST the file straight to the AI service and wait. When that failed
// (a 5xx, a dropped tunnel, a closed tab) the error existed only in that browser tab: no
// server saw it, nothing retried it, nobody was told, and the file itself was gone — a
// 10-minute upload failed for an hour at UT Dallas and left no trace anywhere.
//
// Now the browser only hands the file over: upload-url → PUT into Storage → register. From
// there it is a row in sate_device_sessions that cf-processor converts (any format → 16 kHz
// mono WAV), transcribes with retries, and finalizes into a recording. A failure ends in
// status 'error', which the status Worker mails to the operator. A failure BEFORE the hand-over
// is written to sate_client_errors, which is mailed the same way. The browser just watches.

const POLL_MS = 4000;
/** After this the tab stops waiting; the recording still appears in the list when it is done. */
const WATCH_LIMIT_MS = 3 * 60 * 60 * 1000;

export interface ServerProcessingResult {
  data: TranscriptData;
  errorCounts: IssueCounts;
  recordingId: string;
  sessionId: string;
}

export interface ServerProcessingOptions {
  patientId?: string;
  source?: string;
  onProgress?: (pct: number) => void;
  onTimeoutWarning?: () => void;
  /** Called as soon as the backend owns the file (so Cancel can withdraw it). */
  onSession?: (sessionId: string) => void;
}

/** A processing failure with the session it belongs to, so the UI can offer Retry. */
export class ServerProcessingError extends Error {
  constructor(message: string, readonly sessionId: string | null, readonly retryable: boolean, readonly original: string) {
    super(message);
  }
}

// Cancel (the clinician closes the form) must stop the upload at ANY point: mid-PUT, between
// the PUT and register, or while the backend works. sessionId only exists after register, so
// the flag lives on the File.
const cancelled = new WeakSet<File>();
const inflight = new WeakMap<File, XMLHttpRequest>();

/** Thrown when the clinician cancelled; not an error to show. */
export class UploadCancelledError extends Error {
  readonly cancelled = true;
  constructor() { super('Upload cancelled'); }
}

/** The clinician cancelled this upload: abort what is in flight; a later step withdraws it. */
export function cancelUpload(file: File) {
  cancelled.add(file);
  inflight.get(file)?.abort();
}

function apiBase() {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/device-api/api`;
}

async function api<T>(path: string, body: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

/** PUT the file to the signed URL, reporting progress (fetch has no upload progress). */
function putFile(url: string, file: File, onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    inflight.set(file, xhr);
    xhr.onloadend = () => { if (inflight.get(file) === xhr) inflight.delete(file); };
    xhr.onabort = () => reject(new UploadCancelledError());
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
      ? resolve()
      : reject(new Error(`Storage upload HTTP ${xhr.status}: ${String(xhr.responseText || '').slice(0, 300)}`));
    xhr.onerror = () => reject(new Error('Storage upload failed: network error'));
    xhr.send(file);
  });
}

/** Best-effort record of a failure that happened before the backend had the file. */
export function reportClientError(context: string, file: File | null, message: string) {
  supabase.from('sate_client_errors')
    .insert({ context, file_name: file?.name ?? null, bytes: file?.size ?? null, message: message.slice(0, 1000) })
    .then(() => {}, () => {});
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Usage analytics: how a watched upload ended. Fixed labels only — never the file's name, which
 * is often a child's. "Still processing" after the watch limit is not an outcome, so it says nothing.
 */
async function trackOutcome(p: Promise<ServerProcessingResult>): Promise<ServerProcessingResult> {
  try {
    const r = await p;
    trackAction('upload:done');
    return r;
  } catch (e) {
    if (e instanceof UploadCancelledError) trackAction('upload:cancel');
    else if (e instanceof ServerProcessingError && e.original === 'no_text') trackAction('upload:no-speech');
    else if (!(e instanceof ServerProcessingError && /watch limit/.test(e.original))) trackAction('upload:failed');
    throw e;
  }
}

/** Upload `file` for backend processing and wait for its recording. */
export function processOnServer(file: File, opts: ServerProcessingOptions = {}): Promise<ServerProcessingResult> {
  trackAction('upload:start');
  return trackOutcome(handOverAndWatch(file, opts));
}

async function handOverAndWatch(file: File, opts: ServerProcessingOptions): Promise<ServerProcessingResult> {
  const { onProgress, onSession } = opts;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new ServerProcessingError('You are signed out. Please sign in again and re-upload.', null, false, 'Not signed in');
  const serial = `web-${session.user.id.replace(/-/g, '').slice(0, 8)}`;
  cancelled.delete(file);
  const checkCancelled = () => { if (cancelled.has(file)) throw new UploadCancelledError(); };

  // 1. Hand the file over. Every failure here is reported: the backend never saw this file.
  let sessionId: string;
  let slotRef: { session_id: string; storage_path: string } | null = null;
  try {
    onProgress?.(2);
    const slot = await api<{ session_id: string; storage_path: string; signed_url: string }>(
      '/sessions/upload-url', { device_serial: serial, format: 'web' });
    slotRef = slot;
    if (!slot.storage_path.endsWith('.web')) {
      throw new Error(`server returned a non-web upload slot (${slot.storage_path}) — device-api is too old`);
    }
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      checkCancelled();
      try {
        await putFile(slot.signed_url, file, (f) => onProgress?.(2 + Math.round(f * 38)));
        lastErr = null;
        break;
      } catch (e) {
        if (e instanceof UploadCancelledError) throw e;
        lastErr = e;
        await sleep(2000 * (attempt + 1));
      }
    }
    if (lastErr) throw lastErr;
    checkCancelled();
    const reg = await api<{ id: string }>('/sessions/register', {
      session_id: slot.session_id,
      storage_path: slot.storage_path,
      device_serial: serial,
      patient_id: 'WEB',
      session_number: Math.floor(Date.now() / 1000),
      web_meta: { file_name: file.name, patient_uuid: opts.patientId || null, source: opts.source || 'web-upload' },
    });
    sessionId = reg.id;
  } catch (e) {
    if (e instanceof UploadCancelledError) {
      // The PUT may have landed before the abort. Register what is there (409 = nothing landed)
      // and withdraw it, so a cancelled file is never left in Storage with no row pointing at it.
      if (slotRef) {
        const s0 = slotRef;
        void api<{ id: string }>('/sessions/register', {
          session_id: s0.session_id, storage_path: s0.storage_path, device_serial: serial,
          patient_id: 'WEB', session_number: Math.floor(Date.now() / 1000),
        }).then((r) => withdrawUpload(r.id), () => {});
      }
      throw e;
    }
    const msg = e instanceof Error ? e.message : String(e);
    reportClientError('web upload', file, msg);
    throw new ServerProcessingError(
      'The file could not be uploaded to SATE. Please check your connection and try again. The SATE team has been notified.',
      null, true, msg);
  }
  // Cancelled while register was in flight: the backend owns it now, so withdraw it.
  if (cancelled.has(file)) { void withdrawUpload(sessionId); throw new UploadCancelledError(); }
  trackAction('upload:handed-over');
  onSession?.(sessionId);
  onProgress?.(42);
  return watch(sessionId, opts, file);
}

/** Put an errored upload back in the queue and wait again. */
export function retryOnServer(file: File, sessionId: string, opts: ServerProcessingOptions = {}): Promise<ServerProcessingResult> {
  trackAction('upload:retry');
  return trackOutcome(requeueAndWatch(file, sessionId, opts));
}

async function requeueAndWatch(file: File, sessionId: string, opts: ServerProcessingOptions): Promise<ServerProcessingResult> {
  cancelled.delete(file);
  try {
    await api(`/sessions/${encodeURIComponent(sessionId)}/retry`, {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 409: it is not in 'error' any more — someone (an admin, another tab) already retried it,
    // or it finished. Watch it instead of failing every Retry click on the same 409.
    if (/HTTP 409/.test(msg)) return watch(sessionId, opts, file);
    // 404: the session is gone. Retrying it cannot work; the next Retry uploads the file again.
    if (/HTTP 404/.test(msg)) {
      throw new ServerProcessingError('The earlier upload is no longer on the server. Click Retry to upload the file again.', null, true, msg);
    }
    throw new ServerProcessingError('Could not reach SATE to retry. Please check your connection and try again.', sessionId, true, msg);
  }
  return watch(sessionId, opts, file);
}

/** Watch the backend do the work, until the session is done or errored. */
async function watch(sessionId: string, opts: ServerProcessingOptions, file: File): Promise<ServerProcessingResult> {
  const { onProgress, onTimeoutWarning } = opts;
  const started = Date.now();
  let warned = false;
  for (;;) {
    await sleep(POLL_MS);
    if (cancelled.has(file)) throw new UploadCancelledError();
    const { data: row, error } = await supabase.from('sate_device_sessions')
      .select('status, recording_id, no_text, process_error')
      .eq('id', sessionId).maybeSingle();
    if (error) continue; // a blip reading status is not a processing failure; keep watching
    if (!row) throw new ServerProcessingError('This upload was removed before it finished processing.', null, false, 'session row gone');
    const elapsed = Date.now() - started;
    if (!warned && elapsed > 120_000) { warned = true; onTimeoutWarning?.(); }
    if (row.status === 'queued') onProgress?.(45);
    if (row.status === 'processing') onProgress?.(Math.min(95, 50 + Math.round(elapsed / 6000)));
    if (row.status === 'done') {
      if (row.no_text || !row.recording_id) {
        throw new ServerProcessingError(
          'No speech was detected in this file, so no transcript could be made. The SATE team has been notified.',
          sessionId, false, 'no_text');
      }
      const { data: rec, error: rErr } = await supabase.from('recordings')
        .select('transcript').eq('id', row.recording_id).single();
      if (rErr || !rec?.transcript) {
        throw new ServerProcessingError('The recording was processed but could not be loaded. Open it from your recordings list.',
          sessionId, false, rErr?.message || 'no transcript');
      }
      const data = rec.transcript as TranscriptData;
      if (cancelled.has(file)) throw new UploadCancelledError();
      onProgress?.(100);
      return { data, errorCounts: countErrors(data.segments || []), recordingId: row.recording_id, sessionId };
    }
    if (row.status === 'error') {
      throw new ServerProcessingError(
        'SATE could not process this file. Your file is saved and the SATE team has been notified, so you do not need to upload it again.',
        sessionId, true, String(row.process_error || 'processing error'));
    }
    if (elapsed > WATCH_LIMIT_MS) {
      throw new ServerProcessingError(
        'This file is still processing. It will appear in your recordings when it is done.',
        sessionId, false, 'still processing after the watch limit');
    }
  }
}

/** The clinician cancelled: withdraw the upload (its session, and any recording made from it). */
export async function withdrawUpload(sessionId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await fetch(`${apiBase()}/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
  }).catch(() => {});
}
