import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { type RecordingStats } from '../types';
import { formatDate } from '../utils';

// One metric the clinician can chart over successive sessions. `betterUp` says
// which direction is clinical improvement, so the trend badge reads correctly:
// a rising MLU is progress, a rising error rate is not, and rate is context-only.
type MetricKey = 'errorRate' | 'mluw' | 'ndw' | 'speakingRate' | 'numberOfPauses' | 'totalWords';
interface Metric {
  key: MetricKey;
  label: string;
  short: string;
  unit: string;
  betterUp: boolean | null;      // true = up is good, false = down is good, null = neutral
  format: (v: number) => string;
  describe: string;
}

const METRICS: Metric[] = [
  { key: 'errorRate', label: 'Error rate', short: 'Errors', unit: '/100 words', betterUp: false,
    format: v => v.toFixed(1), describe: 'Errors per 100 words — lower is better' },
  { key: 'mluw', label: 'MLU (words)', short: 'MLU', unit: 'words', betterUp: true,
    format: v => v.toFixed(2), describe: 'Mean length of utterance — a core language-development measure' },
  { key: 'ndw', label: 'Vocabulary', short: 'NDW', unit: 'diff. words', betterUp: true,
    format: v => Math.round(v).toString(), describe: 'Number of different words — vocabulary diversity' },
  { key: 'speakingRate', label: 'Speaking rate', short: 'Rate', unit: 'wpm', betterUp: null,
    format: v => Math.round(v).toString(), describe: 'Words per minute — interpret in context' },
  { key: 'numberOfPauses', label: 'Pauses', short: 'Pauses', unit: 'per session', betterUp: false,
    format: v => Math.round(v).toString(), describe: 'Total pauses — fewer suggests improved fluency' },
  { key: 'totalWords', label: 'Productivity', short: 'Words', unit: 'words', betterUp: true,
    format: v => Math.round(v).toString(), describe: 'Total words produced in the session' },
];

// App palette: primary blue for the single series (identity), semantic
// green/red/slate for the trend (status) — kept separate, per the color rule.
const LINE = '#2563eb';
const GOOD = '#15803d';
const BAD = '#b91c1c';
const NEUTRAL = '#475569';

interface Props {
  recordingStats: RecordingStats[];   // may be any order
  patientName: string;
}

export const ProgressChart: React.FC<Props> = ({ recordingStats, patientName }) => {
  const [metricKey, setMetricKey] = useState<MetricKey>('mluw');
  const [hover, setHover] = useState<number | null>(null);
  const metric = METRICS.find(m => m.key === metricKey)!;

  // Oldest → newest, so the x-axis reads left-to-right in time.
  const points = useMemo(() => {
    return [...recordingStats]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(s => ({ id: s.id, date: s.createdAt, label: s.fileName, value: (s[metricKey] as number) ?? 0 }));
  }, [recordingStats, metricKey]);

  const n = points.length;

  // Trend = first vs last on this metric, coloured by the metric's polarity.
  const trend = useMemo(() => {
    if (n < 2) return null;
    const first = points[0].value;
    const last = points[n - 1].value;
    const delta = last - first;
    const pct = first !== 0 ? (delta / Math.abs(first)) * 100 : 0;
    const rising = delta > 0.0001;
    const falling = delta < -0.0001;
    let good: boolean | null = null;
    if (metric.betterUp !== null && (rising || falling)) good = rising === metric.betterUp;
    return { delta, pct, rising, falling, good };
  }, [points, n, metric.betterUp]);

  // --- SVG geometry ---
  const W = 640, H = 240;
  const padL = 44, padR = 18, padT = 16, padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const vals = points.map(p => p.value);
  const rawMin = Math.min(...vals, 0);
  const rawMax = Math.max(...vals, metric.key === 'errorRate' ? 1 : 1);
  const span = rawMax - rawMin || 1;
  const yMin = rawMin;
  const yMax = rawMax + span * 0.12;          // headroom so the top point isn't clipped
  const yRange = yMax - yMin || 1;

  const x = (i: number) => n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW;
  const y = (v: number) => padT + plotH - ((v - yMin) / yRange) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const areaPath = n > 0
    ? `${linePath} L ${x(n - 1).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${x(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
    : '';

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (yRange * i) / yTicks);

  const trendColor = trend?.good === true ? GOOD : trend?.good === false ? BAD : NEUTRAL;
  const TrendIcon = trend?.rising ? TrendingUp : trend?.falling ? TrendingDown : Minus;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Progress over time</h3>
          <p className="text-sm text-gray-500">{metric.describe}</p>
        </div>
        {trend && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
               style={{ backgroundColor: `${trendColor}14`, color: trendColor }}>
            <TrendIcon className="w-4 h-4" />
            <span>
              {trend.rising ? '+' : ''}{metric.format(trend.delta)} {metric.unit}
              {' · '}
              {trend.good === true ? 'Improving' : trend.good === false ? 'Needs attention'
                : trend.rising ? 'Up' : trend.falling ? 'Down' : 'Stable'}
            </span>
          </div>
        )}
      </div>

      {/* metric selector */}
      <div className="flex flex-wrap gap-2 mb-5">
        {METRICS.map(m => (
          <button
            key={m.key}
            onClick={() => setMetricKey(m.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              m.key === metricKey
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {n < 2 ? (
        <div className="py-10 text-center text-gray-500 text-sm">
          {n === 1
            ? 'One recording so far — the trend line appears from the second session onward.'
            : 'No recordings to chart yet.'}
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
               aria-label={`${metric.label} across ${n} sessions for ${patientName}`}
               onMouseLeave={() => setHover(null)}>
            <defs>
              <linearGradient id="pcFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={LINE} stopOpacity="0.16" />
                <stop offset="100%" stopColor={LINE} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* recessive grid + y labels */}
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="#eef1f4" strokeWidth="1" />
                <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize="11" fill="#94a3b8"
                      style={{ fontVariantNumeric: 'tabular-nums' }}>{metric.format(t)}</text>
              </g>
            ))}

            <path d={areaPath} fill="url(#pcFill)" />
            <path d={linePath} fill="none" stroke={LINE} strokeWidth="2"
                  strokeLinejoin="round" strokeLinecap="round" />

            {/* crosshair on hover */}
            {hover !== null && (
              <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + plotH}
                    stroke={LINE} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
            )}

            {/* markers + hover hit targets */}
            {points.map((p, i) => {
              const emphasized = i === hover || i === n - 1;
              return (
                <g key={p.id}>
                  <circle cx={x(i)} cy={y(p.value)} r={emphasized ? 5 : 3.5}
                          fill="#fff" stroke={LINE} strokeWidth="2" />
                  <rect x={x(i) - plotW / (2 * (n - 1)) - 1} y={padT}
                        width={Math.max(plotW / (n - 1), 12)} height={plotH}
                        fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              );
            })}

            {/* endpoint value label */}
            {n > 0 && (
              <text x={x(n - 1)} y={y(points[n - 1].value) - 10} textAnchor="middle"
                    fontSize="12" fontWeight="600" fill="#16202e"
                    style={{ fontVariantNumeric: 'tabular-nums' }}>
                {metric.format(points[n - 1].value)}
              </text>
            )}

            {/* x labels: first, last, and hovered */}
            {[0, n - 1, ...(hover !== null && hover !== 0 && hover !== n - 1 ? [hover] : [])].map(i => (
              <text key={i} x={x(i)} y={H - 12} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                    fontSize="10.5" fill="#94a3b8">{formatDate(points[i].date)}</text>
            ))}
          </svg>

          {/* tooltip */}
          {hover !== null && (
            <div className="absolute pointer-events-none bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg"
                 style={{
                   left: `${(x(hover) / W) * 100}%`,
                   top: `${(y(points[hover].value) / H) * 100}%`,
                   transform: 'translate(-50%, -130%)',
                   whiteSpace: 'nowrap',
                 }}>
              <div className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {metric.format(points[hover].value)} {metric.unit}
              </div>
              <div className="text-gray-300">{formatDate(points[hover].date)}</div>
              <div className="text-gray-400 max-w-[160px] truncate">{points[hover].label}</div>
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">
        {n} session{n === 1 ? '' : 's'} · oldest to newest, left to right
      </p>
    </div>
  );
};
