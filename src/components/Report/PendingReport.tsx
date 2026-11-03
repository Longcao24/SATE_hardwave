import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Clock, Loader2, MicOff, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { retrySessionOnServer } from '@/services/DataService/serverProcessing';
import { isNoAudioError } from '@/hooks/useInFlightUploads';

/**
 * A report saved before its upload finished processing (Save-first, 2026-11-02). The row exists with the
 * clinician's name and patient, but no transcript yet. This page says where processing stands and turns
 * into the full report on its own when it is done — the work happens on the server, so closing the tab
 * changes nothing.
 *
 * A failure shows only "Processing failed" + Retry: the cause is for admins (Admin → Processing and the
 * operator mail), not something a clinician can act on.
 */
export interface PendingReportInfo {
  id: string;
  name: string;
  createdAt: string;
  sessionId: string | null;
  noSpeech: boolean;
}

type Stage = 'queued' | 'processing' | 'failed' | 'no_audio' | 'no_speech' | 'removed' | 'ready' | 'loading';

const POLL_MS = 4000;

export function PendingReport({ info, onReady }: { info: PendingReportInfo; onReady: () => void }) {
  const [stage, setStage] = useState<Stage>(info.noSpeech ? 'no_speech' : 'loading');
  const [since, setSince] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [now, setNow] = useState(Date.now());
  const readyFired = useRef(false);
  const queryClient = useQueryClient();

  const check = useCallback(async () => {
    const [{ data: rec, error: recErr }, sess] = await Promise.all([
      supabase.from('recordings').select('pending:transcript->pending, no_speech:transcript->no_speech').eq('id', info.id).maybeSingle(),
      info.sessionId
        ? supabase.from('sate_device_sessions').select('status, created_at, processing_started_at, process_error').eq('id', info.sessionId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    // A read that failed says nothing about the report: keep the stage and try again on the next poll.
    if (recErr || (sess as { error?: unknown }).error) return;
    if (!rec) { setStage('removed'); return; }
    if (rec.no_speech === true) { setStage('no_speech'); return; }
    if (rec.pending !== true) {
      setStage('ready');
      if (!readyFired.current) { readyFired.current = true; onReady(); }
      return;
    }
    const s = (sess as { data: { status: string; created_at: string; processing_started_at: string | null; process_error: string | null } | null }).data;
    if (!s) { setStage('removed'); return; }
    if (s.status === 'error' && isNoAudioError(s.process_error)) setStage('no_audio');
    else if (s.status === 'error') setStage('failed');
    else if (s.status === 'processing' || s.status === 'done') { setStage('processing'); setSince(s.processing_started_at); }
    else { setStage('queued'); setSince(s.created_at); }
  }, [info.id, info.sessionId, onReady]);

  const final = stage === 'no_speech' || stage === 'no_audio' || stage === 'removed' || stage === 'ready';
  useEffect(() => {
    if (info.noSpeech || final) return;
    void check();
    const t = window.setInterval(() => { if (!document.hidden) void check(); }, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const onVis = () => { if (!document.hidden) void check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(t); window.clearInterval(tick); document.removeEventListener('visibilitychange', onVis); };
  }, [check, info.noSpeech, final]);

  const retry = async () => {
    if (!info.sessionId) return;
    setRetrying(true);
    try {
      await retrySessionOnServer(info.sessionId);
      setStage('queued'); setSince(new Date().toISOString());
      queryClient.invalidateQueries({ queryKey: ['recordings'] });   // the list's chip leaves "failed" now
    }
    catch { /* stays failed; the button can be pressed again */ }
    finally { setRetrying(false); }
  };

  const elapsed = (() => {
    const t = since ? Date.parse(since) : NaN;
    if (Number.isNaN(t)) return null;
    const s = Math.max(0, Math.round((now - t) / 1000));
    return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  })();

  const card = {
    loading: { tone: 'border-gray-200 bg-white', icon: <Loader2 className="w-5 h-5 animate-spin text-gray-400" />, title: 'Checking…', text: '' },
    queued: { tone: 'border-sky-200 bg-sky-50', icon: <Clock className="w-5 h-5 text-sky-600" />, title: 'Waiting to be processed',
      text: `Your recording is saved and in line for transcription${elapsed ? ` (waiting ${elapsed})` : ''}. You can leave this page — it will be ready when you come back.` },
    processing: { tone: 'border-amber-200 bg-amber-50', icon: <Loader2 className="w-5 h-5 animate-spin text-amber-600" />, title: 'Processing',
      text: `Transcribing and analysing${elapsed ? ` (${elapsed})` : ''}. This page fills in by itself when it is done; you can leave it in the meantime.` },
    failed: { tone: 'border-red-200 bg-red-50', icon: <AlertCircle className="w-5 h-5 text-red-600" />, title: 'Processing failed',
      text: 'Your recording is saved. The SATE team has been notified. Press Retry to process it again.' },
    no_audio: { tone: 'border-amber-200 bg-amber-50', icon: <MicOff className="w-5 h-5 text-amber-600" />, title: 'No sound in this file',
      text: 'The uploaded file has no audio track (for example a video recorded without sound), so there is nothing to transcribe. Upload the audio recording instead, then delete this report.' },
    no_speech: { tone: 'border-slate-200 bg-slate-50', icon: <MicOff className="w-5 h-5 text-slate-500" />, title: 'No speech detected',
      text: 'Processing finished but found no speech in this recording, so there is no transcript. The SATE team has been notified.' },
    removed: { tone: 'border-slate-200 bg-slate-50', icon: <AlertCircle className="w-5 h-5 text-slate-500" />, title: 'Upload removed',
      text: 'The upload behind this report is no longer on the server. Upload the file again to make a new report.' },
    ready: { tone: 'border-green-200 bg-green-50', icon: <Loader2 className="w-5 h-5 animate-spin text-green-600" />, title: 'Ready — opening the report…', text: '' },
  }[stage];

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-4xl mx-auto p-8">
        <div className="mb-6">
          {/* data-usage-mask: the report name is clinician-typed and can name the child. */}
          <h1 data-usage-mask className="text-2xl font-bold text-gray-900">{info.name}</h1>
          <p className="text-sm text-gray-500 mt-1">Saved {new Date(info.createdAt).toLocaleString()}</p>
        </div>

        <div className={`rounded-xl border p-5 flex gap-3 ${card.tone}`} role="status" aria-live="polite">
          <div className="pt-0.5">{card.icon}</div>
          <div className="flex-1">
            <div className="font-semibold text-gray-900">{card.title}</div>
            {card.text && <p className="text-sm text-gray-700 mt-1">{card.text}</p>}
            {stage === 'failed' && info.sessionId && (
              <button onClick={retry} disabled={retrying} data-track="Pending report: retry"
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                <RotateCcw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} /> Retry
              </button>
            )}
          </div>
        </div>

        {/* Where the transcript will be. */}
        {(stage === 'queued' || stage === 'processing' || stage === 'loading' || stage === 'ready') && (
          <div className="mt-6 space-y-3" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 animate-pulse">
                <div className="h-3 w-24 bg-gray-200 rounded mb-3" />
                <div className="h-3 bg-gray-100 rounded mb-2" style={{ width: `${90 - i * 9}%` }} />
                <div className="h-3 bg-gray-100 rounded" style={{ width: `${60 + i * 6}%` }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
