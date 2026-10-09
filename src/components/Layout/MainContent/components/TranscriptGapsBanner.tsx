import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { TranscriptGap } from '@/services/DataService/types';
import { gapClock, gapLength, gapSeconds } from '@/services/transcriptGaps';

interface TranscriptGapsBannerProps {
  gaps: TranscriptGap[];
  /** Seek the player to a gap, so the clinician can listen to what was not transcribed. */
  onSeekExact?: (time: number) => void;
}

// Shown whenever the AI could not transcribe part of the take. Deliberately has NO close
// button: a partial transcript that reads as complete is the failure this exists to prevent,
// and every metric on the page is computed over the transcribed part only. Display only — it
// writes nothing, so it is the same in the owner's report and in the read-only oversight view.
export const TranscriptGapsBanner: React.FC<TranscriptGapsBannerProps> = ({ gaps, onSeekExact }) => {
  if (!gaps.length) return null;
  return (
    <div role="alert" className="px-6 py-3 bg-amber-50 border-b border-amber-200">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
        <div className="text-sm text-amber-900">
          <p>
            <b>{gapLength(gapSeconds(gaps))}</b> of this recording could not be transcribed (AI error at{' '}
            {gaps.map((g, i) => (
              <React.Fragment key={`${g.start}-${g.end}`}>
                {i > 0 && ', '}
                {onSeekExact ? (
                  <button type="button" onClick={() => onSeekExact(g.start)}
                    title={g.reason ? `${g.reason} — play from here` : 'Play from here'}
                    className="underline decoration-dotted hover:text-amber-700">
                    {gapClock(g.start)}–{gapClock(g.end)}
                  </button>
                ) : (
                  <span title={g.reason}>{gapClock(g.start)}–{gapClock(g.end)}</span>
                )}
              </React.Fragment>
            ))}
            ).
          </p>
          <p className="text-xs text-amber-800 mt-0.5">
            Metrics on this page cover only the transcribed part. The audio itself is intact.
          </p>
        </div>
      </div>
    </div>
  );
};
