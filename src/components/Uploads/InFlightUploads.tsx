// "Processing" — the clinician's own web uploads that are not a recording yet (useInFlightUploads).
//
// Renders NOTHING when there is nothing in flight, so it costs the sidebar / dashboard / patient
// page no space in the normal case. The status wording follows DeviceSessionStatus (Queued /
// Processing / Failed + Retry) so a take reads the same wherever it is shown.

import { useEffect, useState } from 'react';
import { AlertCircle, Clock, Loader2, MicOff, RotateCw, X } from 'lucide-react';
import { useInFlightUploads, kindOf, isActive, uploadFileName, type InFlightUpload } from '@/hooks/useInFlightUploads';

const secondsSince = (iso: string | null | undefined, now: number) =>
  iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 1000)) : 0;

/** "45s" / "12m" / "3h" — how long it has been waiting; precision past a minute is noise. */
const waited = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`);

/** "1:07" / "1:02:09" — a running clock, so it has to tick visibly. */
const clock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};

/** The error as the server wrote it can be a paragraph of HTTP; the row shows a line, the tooltip all. */
const shortError = (e: string | null) => {
  const one = String(e || 'Processing failed').replace(/\s+/g, ' ').trim();
  return one.length > 70 ? `${one.slice(0, 70)}…` : one;
};

interface Props {
  /** Only uploads made for this patient (web_meta.patient_uuid). */
  patientId?: string | null;
  /** 'sidebar' is the compact list; 'card' sits on a page among other cards. */
  variant?: 'sidebar' | 'card';
  /** Outer spacing for the card, which sits in different page layouts. */
  className?: string;
}

export function InFlightUploads({ patientId, variant = 'sidebar', className = 'mb-8' }: Props) {
  const { items, dismiss, retry } = useInFlightUploads(patientId);
  const [now, setNow] = useState(() => Date.now());
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<{ id: string; msg: string } | null>(null);

  // The elapsed clocks only move if something re-renders them; tick only while one is showing.
  const ticking = items.some(isActive);
  useEffect(() => {
    if (!ticking) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [ticking]);

  if (items.length === 0) return null;

  const onRetry = async (id: string) => {
    if (retrying) return;
    setRetrying(id);
    setRetryError(null);
    try {
      await retry(id);
    } catch (e) {
      console.error('Retry of a web upload failed:', e);
      setRetryError({ id, msg: 'Could not reach SATE to retry. Please try again.' });
    } finally {
      setRetrying(null);
    }
  };

  const row = (u: InFlightUpload) => {
    const kind = kindOf(u);
    const name = uploadFileName(u);
    const backoffSec = u.not_before && Date.parse(u.not_before) > now ? Math.round((Date.parse(u.not_before) - now) / 1000) : 0;
    return (
      <li key={u.id} className="rounded-lg border border-gray-200 bg-white p-2">
        <div className="flex items-start gap-2">
          <p className="flex-1 min-w-0 text-sm text-gray-800 truncate" title={name}>{name}</p>
          <button
            type="button"
            data-track="Dismiss upload"
            onClick={() => dismiss(u.id)}
            title={isActive(u)
              ? 'Hide this from the list. It keeps processing and appears in your recordings when done.'
              : 'Hide this from the list. Nothing is deleted.'}
            className="p-0.5 text-gray-400 hover:text-gray-700 rounded flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {kind === 'queued' && (
            <span
              title="Uploaded and waiting for the processor. One processor serves every account, in upload order. You can close this tab — it keeps going."
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold text-sky-700 bg-sky-50 rounded-md"
            >
              <Clock className="w-3 h-3" />
              {backoffSec > 0
                ? `Queued · retrying in ${waited(backoffSec)}`
                : `Queued · waiting ${waited(secondsSince(u.created_at, now))}`}
            </span>
          )}
          {kind === 'processing' && (
            <span
              title="Being transcribed. You can close this tab — it keeps going and appears in your recordings when done."
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold text-amber-700 bg-amber-50 rounded-md"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              Processing · {clock(secondsSince(u.processing_started_at || u.created_at, now))}
            </span>
          )}
          {kind === 'failed' && (
            <>
              <span
                title={u.process_error || 'Processing failed'}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold text-red-700 bg-red-50 rounded-md"
              >
                <AlertCircle className="w-3 h-3" /> Failed
              </span>
              {/* Retry is only offered where the server accepts it (status 'error'); a 'done' row
                  with no recording answers 409, which would make the button look broken. */}
              {u.status === 'error' && (
                <button
                  type="button"
                  data-track="Retry upload"
                  onClick={() => onRetry(u.id)}
                  disabled={retrying === u.id}
                  title="Process this file again. It is already on the server — no need to upload it again."
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold text-sky-700 bg-sky-50 rounded-md hover:bg-sky-100 disabled:opacity-50"
                >
                  {retrying === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                  Retry
                </button>
              )}
            </>
          )}
          {kind === 'no_speech' && (
            <span
              title="The AI found no words in this audio, so no transcript or report was made."
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-md"
            >
              <MicOff className="w-3 h-3" /> No speech found
            </span>
          )}
        </div>

        {kind === 'failed' && (
          <p className="mt-1 text-xs text-gray-500 break-words" title={u.process_error || undefined}>
            {shortError(u.process_error)}
          </p>
        )}
        {kind === 'no_speech' && (
          <p className="mt-1 text-xs text-gray-500">
            No words were detected, so no transcript was made. Check that the file has audible speech.
          </p>
        )}
        {retryError?.id === u.id && <p className="mt-1 text-xs text-red-600">{retryError.msg}</p>}
      </li>
    );
  };

  if (variant === 'card') {
    return (
      <div data-usage-mask className={`bg-white rounded-xl shadow-sm border border-gray-200 ${className}`}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            Processing<span className="ml-1.5 font-medium text-gray-400">{items.length}</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Uploaded files that are not a recording yet. They keep processing if you close SATE.
          </p>
        </div>
        <ul className="p-4 grid gap-2 sm:grid-cols-2">{items.map(row)}</ul>
      </div>
    );
  }

  return (
    <div data-usage-mask className="mb-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Processing<span className="ml-1 text-gray-400">{items.length}</span>
      </h4>
      <ul className="space-y-2">{items.map(row)}</ul>
    </div>
  );
}
