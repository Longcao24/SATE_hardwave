// How long a recording is, formatted the one way, for every list that shows a recording.
//
// `recordings.duration` is written from the AI analysis (`analysis.totalDuration`, seconds) and
// is NULL for a row whose audio never got that far — an upload still processing, a `no_text`
// take, or anything stored before the column was populated. That is why this returns `null`
// rather than a string: the existing `formatDuration()` in MainContent renders a missing
// duration as `0:00`, which on a list row is indistinguishable from a recording that really is
// empty. A caller that gets `null` must omit the field, not print a zero.
export function formatLength(seconds?: number | null): string | null {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return null;

  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;

  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}
