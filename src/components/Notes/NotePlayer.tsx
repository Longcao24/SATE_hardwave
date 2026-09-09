// The player, at the top where it belongs.
//
// Shape borrowed from Plaud — full-width scrubber, centred transport, ±15 s, speed — because
// that layout is right for audio you are reading along with: the thing you scrub is wide, and
// the controls sit under it rather than competing with the title. Everything visual is SATE:
// the app's Button, blue-600, gray-100 track, rounded-2xl card.
//
// The amber ticks are the recorder's flag button. They are the one thing on this page that no
// phone app can draw, so they stay on the scrubber and not in a list somewhere.

import { RotateCcw, RotateCw, Pause, Play } from 'lucide-react';

const SPEEDS = [1, 1.25, 1.5, 2] as const;

const mmss = (s?: number | null) => {
  const v = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};

interface Props {
  duration: number;
  at: number;
  playing: boolean;
  flags: number[];
  speed: number;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onSpeed: (rate: number) => void;
}

export function NotePlayer({ duration, at, playing, flags, speed, onToggle, onSeek, onSpeed }: Props) {
  const pct = duration > 0 ? Math.min(100, (at / duration) * 100) : 0;

  return (
    <div className="mt-5">
      <div
        className="relative h-2 bg-gray-100 rounded-full cursor-pointer group"
        onClick={(e) => {
          const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          onSeek(((e.clientX - r.left) / r.width) * duration);
        }}
      >
        <div className="absolute inset-y-0 left-0 bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
        {/* Playhead handle: appears on hover so the bar stays calm while you read. */}
        <div
          className="absolute -top-1 w-4 h-4 -ml-2 bg-white border-2 border-blue-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `${pct}%` }}
        />
        {flags.map((ms, i) => (
          <div
            key={i}
            title={`Flagged at ${mmss(ms / 1000)}`}
            className="absolute -top-1 w-0.5 h-4 bg-amber-500 rounded"
            style={{ left: `${duration > 0 ? Math.min(100, (ms / 1000 / duration) * 100) : 0}%` }}
          />
        ))}
      </div>

      <div className="flex items-center mt-3">
        <span className="text-xs text-gray-500 tabular-nums w-28">
          {mmss(at)} <span className="text-gray-300">/</span> {mmss(duration)}
        </span>

        <div className="flex-1 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onSeek(Math.max(0, at - 15))}
            title="Back 15 seconds"
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-full"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            title={playing ? 'Pause' : 'Play'}
            className="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-700 text-white grid place-items-center shadow-sm"
          >
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={() => onSeek(Math.min(duration, at + 15))}
            title="Forward 15 seconds"
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-full"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        <div className="w-28 flex justify-end">
          <button
            type="button"
            onClick={() => onSpeed(SPEEDS[(SPEEDS.indexOf(speed as 1) + 1) % SPEEDS.length])}
            title="Playback speed"
            className="px-2.5 py-1 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 tabular-nums"
          >
            {speed}×
          </button>
        </div>
      </div>
    </div>
  );
}
