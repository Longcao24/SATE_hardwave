// Progress for a note that is still being made.
//
// Two shapes, and which one shows is a statement of fact:
//
//   determinate    transcription is one AI call per audio chunk, so "part 3 of 7" is real and
//                  the bar is filled to that fraction.
//   indeterminate  queueing and summarising have no measurable sub-steps, so the bar animates
//                  without claiming a position.
//
// It never fabricates a percentage for a stage it cannot measure. A bar that creeps forward on
// a guess is worse than no bar: it turns "I don't know how long this takes" into a promise.

import { noteProgress, noteStageLabel } from '@/services/notesApiService';

interface Props {
  note: { status: string; chunks_done?: number; chunks_total?: number };
  /** Compact: a slim bar with no label, for a list row. */
  compact?: boolean;
}

export function NoteProgress({ note, compact }: Props) {
  const pct = noteProgress(note);
  const label = noteStageLabel(note);

  const bar = (
    <div
      className={`relative w-full ${compact ? 'h-1' : 'h-1.5'} bg-gray-100 rounded-full overflow-hidden`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      {...(pct !== null ? { 'aria-valuenow': Math.round(pct * 100) } : {})}
      aria-label={label}
    >
      {pct !== null ? (
        <div
          className="absolute inset-y-0 left-0 bg-blue-600 rounded-full transition-[width] duration-500"
          style={{ width: `${Math.max(4, pct * 100)}%` }}
        />
      ) : (
        <div className="absolute inset-0 bg-blue-400 rounded-full animate-pulse" />
      )}
    </div>
  );

  if (compact) return bar;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</span>
        {pct !== null && (
          <span className="text-xs text-gray-500 tabular-nums">{Math.round(pct * 100)}%</span>
        )}
      </div>
      {bar}
      <p className="text-xs text-gray-400 mt-2">
        This keeps running if you leave the page — come back and it will be here.
      </p>
    </div>
  );
}
