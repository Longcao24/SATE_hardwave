// Untranscribed spans of a recording — `recordings.transcript.gaps`.
//
// cf-processor transcribes a long take in pieces; a piece the AI still answers 500 on at the
// smallest split is SKIPPED and recorded as {start, end, reason} (seconds on the take's clock)
// instead of failing the whole take. Below 95 % missing the take is finalized as a normal
// recording, so these spans are the ONLY sign that minutes of it were never transcribed — and
// every metric on the report (MLU, NDW, counts) is computed over what was.
import type { TranscriptGap } from '@/services/DataService/types';

/** The valid gaps of a stored transcript (anything malformed is dropped), sorted by start. */
export function readTranscriptGaps(transcript: unknown): TranscriptGap[] {
  const raw = (transcript as { gaps?: unknown } | null | undefined)?.gaps;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g): g is TranscriptGap =>
      !!g && typeof g === 'object'
      && Number.isFinite((g as TranscriptGap).start) && Number.isFinite((g as TranscriptGap).end)
      && (g as TranscriptGap).end > (g as TranscriptGap).start)
    .map((g) => ({ start: g.start, end: g.end, ...(typeof g.reason === 'string' ? { reason: g.reason } : {}) }))
    .sort((a, b) => a.start - b.start);
}

export const gapSeconds = (gaps: TranscriptGap[]) => gaps.reduce((t, g) => t + (g.end - g.start), 0);

/** "12:03" / "1:02:07" — the same clock the transcript and the player show. */
export function gapClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** "8 min 1 s" / "45 s". */
export function gapLength(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60), r = s % 60;
  return m ? `${m} min${r ? ` ${r} s` : ''}` : `${r} s`;
}
