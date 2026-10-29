import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthProvider';
import { retrySessionOnServer } from '@/services/DataService/serverProcessing';

// The clinician's OWN web uploads that have not (successfully) become a recording yet.
//
// A web upload is processed by the backend queue (serverProcessing.ts), so it keeps going after the
// tab is closed — but a recording only appears in the list once it is done, so on return NOTHING
// showed that a file was still queued, had failed, or had come back with no speech. This reads the
// session rows straight from sate_device_sessions with the user's own session: RLS
// ("Users can manage their own sessions", auth.uid() = user_id) already limits it to their rows.

export interface InFlightUpload {
  id: string;
  status: string | null;
  created_at: string;
  processing_started_at: string | null;
  attempts: number | null;
  no_text: boolean | null;
  recording_id: string | null;
  process_error: string | null;
  audio_seconds: number | null;
  bytes: number | null;
  web_meta: { file_name?: string | null; patient_uuid?: string | null } | null;
  not_before: string | null;
}

export type InFlightKind = 'queued' | 'processing' | 'failed' | 'no_speech';

/** A web upload that just finished WITH a recording — the indicator announces these. */
export interface ReadyUpload {
  sessionId: string;
  recordingId: string;
  fileName: string;
}

const SELECT =
  'id, status, created_at, processing_started_at, attempts, no_text, recording_id, process_error, audio_seconds, bytes, web_meta, not_before';
/** Older than this, a failure is history, not something in flight; Admin → Processing still has it. */
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FAST_POLL_MS = 5_000;
const SLOW_POLL_MS = 60_000;

export const inFlightKey = (uid: string | undefined) => ['web-uploads', uid] as const;

export function kindOf(u: InFlightUpload): InFlightKind {
  if (u.status === 'queued') return 'queued';
  if (u.status === 'processing') return 'processing';
  if (u.status === 'done' && u.no_text) return 'no_speech';
  // 'error', and the odd 'done' row with no recording and no no_text flag: either way there is
  // nothing to open, and calling it "no speech" would be a claim the server did not make.
  return 'failed';
}

export const isActive = (u: InFlightUpload) => u.status === 'queued' || u.status === 'processing';

export function uploadFileName(u: { web_meta: InFlightUpload['web_meta'] }) {
  return u.web_meta?.file_name || 'Uploaded file';
}

// ---- "just became ready" detection -------------------------------------------------------------
//
// Done here, inside the query function, because the query runs ONCE per fetch however many
// components read it (sidebar, dashboard, patient page). Detecting the transition in a component
// would announce the same recording once per mounted list.
//
// Only ids SEEN queued/processing by this tab are candidates, so reopening the app never
// announces a file that finished while it was closed (that one is simply in the recordings list).

const lastActive = new Map<string, Set<string>>(); // user id → session ids last seen in flight
const readyListeners = new Set<(r: ReadyUpload[]) => void>();

export function onUploadsReady(fn: (r: ReadyUpload[]) => void) {
  readyListeners.add(fn);
  return () => { readyListeners.delete(fn); };
}

async function fetchInFlight(uid: string): Promise<InFlightUpload[]> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('sate_device_sessions')
    .select(SELECT)
    .eq('user_id', uid)
    .like('device_serial', 'web-%')
    .gte('created_at', since)
    .or('status.in.(queued,processing,error),and(status.eq.done,or(no_text.is.true,recording_id.is.null))')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = (data ?? []) as InFlightUpload[];

  const prev = lastActive.get(uid);
  const nowActive = new Set(rows.filter(isActive).map((r) => r.id));
  lastActive.set(uid, nowActive);

  // Gone from the in-flight set and not in the list as failed/no-speech: it finished with a
  // recording, or it was withdrawn. Ask which — a withdrawn upload has no row any more.
  const listed = new Set(rows.map((r) => r.id));
  const vanished = prev ? [...prev].filter((id) => !listed.has(id)) : [];
  if (vanished.length) {
    const { data: done } = await supabase
      .from('sate_device_sessions')
      .select('id, status, recording_id, web_meta')
      .in('id', vanished);
    const ready = (done ?? [])
      .filter((r) => r.status === 'done' && r.recording_id)
      .map((r) => ({ sessionId: r.id as string, recordingId: r.recording_id as string, fileName: uploadFileName(r) }));
    if (ready.length) readyListeners.forEach((fn) => fn(ready));
  }
  return rows;
}

// ---- dismissals --------------------------------------------------------------------------------
//
// Dismiss only HIDES the row in this browser. It never deletes the session: a failed upload's
// audio is on the server and the operator was mailed about it, so it must stay recoverable.

const DISMISS_KEY = (uid: string) => `sate.webUploads.dismissed.${uid}`;

function readDismissed(uid: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISS_KEY(uid)) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

function writeDismissed(uid: string, ids: string[]) {
  // Capped: every id older than the 7-day window is dead weight, and this is per browser forever.
  try { localStorage.setItem(DISMISS_KEY(uid), JSON.stringify(ids.slice(-200))); } catch { /* private mode */ }
}

const DISMISS_EVENT = 'sate:web-uploads-dismissed';

/**
 * The signed-in user's in-flight web uploads, minus the ones they dismissed in this browser.
 * `patientId` narrows it to uploads made for that patient.
 */
export function useInFlightUploads(patientId?: string | null) {
  const { user } = useAuth();
  const uid = user?.id;
  const queryClient = useQueryClient();

  const { data } = useQuery<InFlightUpload[]>({
    queryKey: inFlightKey(uid),
    queryFn: () => fetchInFlight(uid!),
    enabled: !!uid,
    // Fast only while something is actually moving AND someone can see it; a take is processed in
    // seconds to minutes, and a hidden tab or an idle list does not need a query every 5 s.
    refetchInterval: (q) => {
      const rows = q.state.data;
      return rows?.some(isActive) && !document.hidden ? FAST_POLL_MS : SLOW_POLL_MS;
    },
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 2_000,
  });

  const [dismissed, setDismissed] = useState<string[]>(() => (uid ? readDismissed(uid) : []));
  useEffect(() => {
    if (!uid) return;
    setDismissed(readDismissed(uid));
    // Every list reading this hook (sidebar + dashboard) hides a row the moment any one dismisses it.
    const sync = () => setDismissed(readDismissed(uid));
    window.addEventListener(DISMISS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(DISMISS_EVENT, sync); window.removeEventListener('storage', sync); };
  }, [uid]);

  const dismiss = useCallback((id: string) => {
    if (!uid) return;
    const next = [...readDismissed(uid).filter((x) => x !== id), id];
    writeDismissed(uid, next);
    setDismissed(next);
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }, [uid]);

  const retry = useCallback(async (id: string) => {
    await retrySessionOnServer(id);
    await queryClient.invalidateQueries({ queryKey: inFlightKey(uid) });
  }, [queryClient, uid]);

  const items = useMemo(() => {
    const hidden = new Set(dismissed);
    return (data ?? []).filter((u) =>
      !hidden.has(u.id) && (!patientId || u.web_meta?.patient_uuid === patientId));
  }, [data, dismissed, patientId]);

  return { items, dismiss, retry };
}
