// DeviceSessionStatus — read-only list of sessions the recorder uploaded, with
// their live processing state. No manual sync/import step: the server auto-runs
// the AI bridge, so this just shows progress (Received → Processing → Ready).
// Sessions whose audio held no speech are marked "No text in audio" (no report
// is created) and can be deleted from here.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UploadedSession } from '@/services/device/deviceTypes';
import { formatSessionDuration, timeAgo } from '@/hooks/useDevices';
import { CheckCircle2, Loader2, AlertCircle, FileAudio, MicOff, Trash2, Clock, RotateCw, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { deviceApiService } from '@/services/device/deviceApiService';
import { useDeviceContext } from '@/contexts/DeviceProvider';
import { notesApiService, isWorking, noteStageLabel } from '@/services/notesApiService';
import { sessionLabel } from '@/services/recordingName';

interface DeviceSessionStatusProps {
  sessions: UploadedSession[];
}

type Status = 'queued' | 'processing' | 'ready' | 'failed' | 'no_text';

const statusOf = (s: UploadedSession): Status => {
  // Authoritative async state machine when the column is present.
  if (s.status) {
    switch (s.status) {
      case 'queued':
        return 'queued';
      case 'processing':
        return 'processing';
      case 'error':
        return 'failed';
      case 'done':
        return s.no_text ? 'no_text' : 'ready';
    }
  }
  // Legacy fallback (pre-async pipeline rows).
  if (s.no_text) return 'no_text';
  if (s.process_error) return 'failed';
  if (s.processed && s.recording_id) return 'ready';
  return 'processing';
};

export function DeviceSessionStatus({ sessions }: DeviceSessionStatusProps) {
  const navigate = useNavigate();
  const { refresh } = useDeviceContext();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Voice Notes is an opt-in feature an admin turns on per account. Everything below is
  // additive: with it off, this list renders exactly as it always has.
  const [notesOn, setNotesOn] = useState(false);
  const [noteOf, setNoteOf] = useState<Record<string, { id: string; status: string; title: string | null; chunks_done?: number; chunks_total?: number }>>({});
  const [optedOut, setOptedOut] = useState<Set<string>>(new Set());
  const [makingId, setMakingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    notesApiService.access().then((a) => { if (!cancelled) setNotesOn(Boolean(a?.enabled)); });
    return () => { cancelled = true; };
  }, []);

  const loadNotes = useCallback(async () => {
    if (!notesOn || sessions.length === 0) return;
    const res = await notesApiService.bySource(sessions.map((s) => s.id));
    setNoteOf(res.notes);
    setOptedOut(new Set(res.optedOut));
  }, [notesOn, sessions]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  // A note being transcribed will finish on its own; check back until it settles so the
  // button flips from "Making…" to "View note" without a page reload.
  useEffect(() => {
    if (!Object.values(noteOf).some((n) => isWorking(n.status))) return;
    const t = setTimeout(loadNotes, 5000);
    return () => clearTimeout(t);
  }, [noteOf, loadNotes]);

  // Auto-generate a note for a new recording, so nobody has to press anything.
  //
  // ⚠️ RECENT ONLY, and one at a time. This account has 176 sessions; sweeping the whole
  // history on first page load would spend real money on Workers AI and bury the list under a
  // hundred notes nobody asked for. A 24-hour window is what "new recordings get a note"
  // actually means — anything older is still one click away on its own row.
  //
  // It runs while the page is open, which is the honest limit of doing this client-side: the
  // alternative is forwarding from the upload path, and that path is the one that has already
  // destroyed a recording once when it was got wrong.
  const AUTO_NOTE_WINDOW_MS = 24 * 60 * 60 * 1000;
  const autoTried = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!notesOn || makingId) return;
    const now = Date.now();
    const next = sessions.find((s) =>
      statusOf(s) === 'ready' &&
      !noteOf[s.id] &&
      !optedOut.has(s.id) &&        // deleted on purpose — do not undo that
      !autoTried.current.has(s.id) &&
      now - new Date(s.at).getTime() < AUTO_NOTE_WINDOW_MS,
    );
    if (!next) return;
    // Marked before the call, not after: a failure must not be retried on every render.
    autoTried.current.add(next.id);
    (async () => {
      setMakingId(next.id);
      try {
        await notesApiService.fromSession({
          session_id: next.id,
          device_serial: next.device_serial,
          session_number: next.session_number,
          flags: Array.isArray(next.flags) ? next.flags : undefined,
        });
        await loadNotes();
      } catch (err) {
        console.error('Auto meeting note failed:', err);   // the row's button still offers a retry
      } finally {
        setMakingId(null);
      }
    })();
  }, [notesOn, sessions, noteOf, optedOut, makingId, loadNotes, AUTO_NOTE_WINDOW_MS]);

  const handleMakeNote = async (e: React.MouseEvent, s: UploadedSession) => {
    e.stopPropagation();
    const existing = noteOf[s.id];
    if (existing) { navigate(`/notes#${existing.id}`); return; }
    if (makingId) return;
    setMakingId(s.id);
    try {
      const res = await notesApiService.fromSession({
        session_id: s.id,
        device_serial: s.device_serial,
        session_number: s.session_number,
        folder_id: s.patient_id,
        // Carry the flag-button marks across. They live on the clinical session row and are
        // the one thing this hardware records that a phone cannot; a note without them loses
        // exactly the moments the user reached out and marked.
        flags: Array.isArray(s.flags) ? s.flags : undefined,
      });
      navigate(`/notes#${res.id}`);
    } catch (err) {
      console.error('Failed to generate a meeting note:', err);
      window.alert(`Could not generate a meeting note: ${(err as Error).message}`);
    } finally {
      setMakingId(null);
    }
  };

  const handleRetry = async (e: React.MouseEvent, s: UploadedSession) => {
    e.stopPropagation();
    if (retryingId) return;
    setRetryingId(s.id);
    try {
      await deviceApiService.retrySession(s.id);
      await refresh();
    } catch (err) {
      console.error('Failed to retry session:', err);
      window.alert('Could not retry the session. Please try again.');
    } finally {
      setRetryingId(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, s: UploadedSession) => {
    e.stopPropagation();
    if (deletingId) return;
    if (!window.confirm(`Delete session ${s.session_number}? This removes the uploaded audio and cannot be undone.`)) {
      return;
    }
    setDeletingId(s.id);
    try {
      await deviceApiService.deleteSession(s.id);
      await refresh();
    } catch (err) {
      console.error('Failed to delete session:', err);
      window.alert('Could not delete the session. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mt-6">
      <h3 className="text-sm font-bold text-gray-900 mb-1">
        Sessions{sessions.length > 0 && <span className="ml-1.5 font-medium text-gray-400">{sessions.length}</span>}
      </h3>
      <p className="text-xs text-gray-400 mb-3">
        Every take this recorder has uploaded. Processed automatically — no sync needed.
      </p>
      <div className="device-sessions-list">
        {sessions.length === 0 ? (
          <div className="text-center py-8">
            <FileAudio className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">
              No sessions yet. Record on the device — it shows up here automatically.
            </p>
          </div>
        ) : (
          sessions.map((s, i) => {
            const status = statusOf(s);
            const ready = status === 'ready';
            const busy = deletingId === s.id;
            return (
              <div
                key={s.id}
                className={`device-session-row ${i > 0 ? 'border-t border-gray-100' : ''} ${ready ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                onClick={ready ? () => navigate(`/report/${s.recording_id}`) : undefined}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {sessionLabel(s.device_serial, s.session_number)} · {s.patient_id}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatSessionDuration(s.bytes, s.sample_rate)} · {timeAgo(s.at)}
                  </p>
                </div>

                {status === 'queued' && (
                  <span
                    title="Uploaded and waiting for the processor to pick it up."
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 rounded-lg"
                  >
                    <Clock className="w-3 h-3" /> Received · Queued
                  </span>
                )}
                {status === 'processing' && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 rounded-lg">
                    <Loader2 className="w-3 h-3 animate-spin" /> Processing
                  </span>
                )}
                {status === 'ready' && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-50 rounded-lg">
                    <CheckCircle2 className="w-3 h-3" /> Ready · View
                  </span>
                )}
                {status === 'no_text' && (
                  <span
                    title="The AI found no speech in this audio, so no report was created."
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg"
                  >
                    <MicOff className="w-3 h-3" /> No text in audio
                  </span>
                )}
                {status === 'failed' && (
                  <span
                    title={s.process_error || 'Processing failed'}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 rounded-lg"
                  >
                    <AlertCircle className="w-3 h-3" /> Failed
                  </span>
                )}
                {status === 'failed' && (
                  <button
                    type="button"
                    onClick={(e) => handleRetry(e, s)}
                    disabled={retryingId === s.id}
                    title="Re-queue this session for processing"
                    className="ml-2 flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 rounded-lg hover:bg-sky-100 disabled:opacity-50"
                  >
                    {retryingId === s.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RotateCw className="w-3 h-3" />
                    )}
                    Retry
                  </button>
                )}

                {/* A meeting note only makes sense for a recording that HAS speech. The clinical
                    pipeline already decided that: a "No text in audio" session would only
                    produce a hallucinated summary, so it is not offered one. Sessions still
                    processing are not offered one either — wait for that verdict. */}
                {notesOn && ready && (
                  <button
                    type="button"
                    onClick={(e) => handleMakeNote(e, s)}
                    disabled={makingId === s.id}
                    title={
                      noteOf[s.id]
                        ? (isWorking(noteOf[s.id].status)
                            ? noteStageLabel(noteOf[s.id])
                            : 'Open the meeting note for this recording')
                        : 'Transcribe and summarise this recording as a meeting note'
                    }
                    className="ml-2 flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50"
                  >
                    {makingId === s.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    {noteOf[s.id]
                      ? (isWorking(noteOf[s.id].status)
                          // Say which part it is on, so a long recording does not look stuck.
                          ? (noteOf[s.id].chunks_total
                              ? `Note ${noteOf[s.id].chunks_done ?? 0}/${noteOf[s.id].chunks_total}`
                              : 'Note…')
                          : 'View note')
                      : 'Meeting note'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={(e) => handleDelete(e, s)}
                  disabled={busy}
                  title="Delete this session"
                  className="ml-2 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
