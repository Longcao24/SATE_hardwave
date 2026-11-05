// Admin → Dashboard (the Admin page's main tab). One window at a time — Today / 7 days / 30 days / All time —
// from device-api GET /admin/dashboard (v43.12), plus the live system state (AI service, queue, open problems)
// from the same /admin/processing the Processing tab reads. Read-only: nothing here changes anything.
// Counts and series only — no file names or transcripts. The one list of accounts is "Online now" (emails
// of who is using the web app this minute, from the analytics Worker), which the Accounts tab shows anyway.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Cpu, FileAudio, FileText, Hourglass, Loader2, PencilLine,
  ShieldCheck, UserPlus, Users, ChevronRight, Radio,
} from 'lucide-react';
import { deviceApiService } from '@/services/device/deviceApiService';
import type { AdminDashboard as Dash, AdminProcessing } from '@/services/device/deviceTypes';
import { analyticsApi } from '@/services/usage/analyticsApi';
import type { OnlineNow } from '@/services/usage/types';
import { pageName } from '@/components/Admin/Usage/format';

export type DashRange = 'today' | '7d' | '30d' | 'all';
export const DASH_RANGES: { id: DashRange; label: string }[] = [
  { id: 'today', label: 'Today' }, { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: 'all', label: 'All time' },
];

/** Start of the window, at the viewer's own local midnight (not UTC's) so a day bar is a calendar day:
 *  Today = since midnight; 7 / 30 days = today and the 6 / 29 days before it. */
function windowStart(r: DashRange): string | undefined {
  if (r === 'all') return undefined;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (r !== 'today') d.setDate(d.getDate() - (r === '7d' ? 6 : 29));
  return d.toISOString();
}

const n = (x: number) => x.toLocaleString();
const hrs = (h: number) => (h >= 10 ? `${Math.round(h).toLocaleString()} h` : h >= 1 ? `${h.toFixed(1)} h` : `${Math.round(h * 60)} min`);
const dur = (s: number | null) => (s == null ? '—' : s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
const mins = (m: number | null) => (m == null ? '—' : m < 1.5 ? `${Math.round(m * 60)} s` : `${m.toFixed(m < 10 ? 1 : 0)} min`);
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : s < 129600 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`;
};

type Go = (tab: 'accounts' | 'processing' | 'usage' | 'recorders') => void;

export function AdminDashboard({ range, onRange, onGo, onPerson, recordersOnline, recordersTotal }: {
  range: DashRange; onRange: (r: DashRange) => void; onGo: Go; onPerson: (uid: string) => void;
  recordersOnline: number; recordersTotal: number;
}) {
  const [d, setD] = useState<Dash | null>(null);
  const [proc, setProc] = useState<AdminProcessing | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The window the numbers on screen belong to; dimmed while another one loads. */
  const [shown, setShown] = useState<DashRange | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setBusy(true); setErr(null);
    const [a, b] = await Promise.allSettled([deviceApiService.adminDashboard(windowStart(range)), deviceApiService.adminProcessing(7)]);
    if (my !== seq.current) return;   // a newer range was picked meanwhile
    if (a.status === 'fulfilled') { setD(a.value); setShown(range); }
    else {
      setD(null);
      const m = String(a.reason?.message || a.reason);
      setErr(m.startsWith('404') ? 'The dashboard needs device-api v43.12 (not deployed yet).' : m.replace(/^\d+ /, ''));
    }
    setProc(b.status === 'fulfilled' ? b.value : null);
    setBusy(false);
  }, [range]);
  useEffect(() => { void load(); }, [load]);
  // The live strip and the numbers refresh every minute while the tab is visible.
  useEffect(() => {
    const t = window.setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  // Who is on the web app now: its own 30 s poll (the rest refreshes every minute). A failure only
  // hides the card — analytics is optional and must never take the dashboard down with it.
  const [online, setOnline] = useState<OnlineNow | null>(null);
  const [onlineErr, setOnlineErr] = useState(false);
  useEffect(() => {
    let live = true;
    let latest = 0;   // the interval and visibilitychange can overlap: only the newest answer is shown
    const poll = () => {
      if (document.hidden) return;
      const my = ++latest;
      analyticsApi.online().then((o) => { if (live && my === latest) { setOnline(o); setOnlineErr(false); } })
        .catch(() => { if (live && my === latest) setOnlineErr(true); });
    };
    poll();
    const t = window.setInterval(poll, 30_000);
    document.addEventListener('visibilitychange', poll);
    return () => { live = false; window.clearInterval(t); document.removeEventListener('visibilitychange', poll); };
  }, []);

  const rangeLabel = DASH_RANGES.find((r) => r.id === range)!.label.toLowerCase();
  const inWindow = range === 'all' ? 'all time' : range === 'today' ? 'today' : `last ${rangeLabel}`;

  return (
    <div className="space-y-5">
      {/* Window picker */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Time window" className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {DASH_RANGES.map((r) => (
            <button key={r.id} role="tab" aria-selected={range === r.id} onClick={() => onRange(r.id)}
              className={`px-3.5 py-1.5 text-sm rounded-md transition-colors ${range === r.id ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              {r.label}
            </button>
          ))}
        </div>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        {d && <span className="text-xs text-gray-400 ml-auto">Updated {new Date(d.generated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
      </div>

      {/* Live system state — always "now", whatever the window. */}
      <LiveStrip proc={proc} onGo={onGo} recordersOnline={recordersOnline} recordersTotal={recordersTotal} />
      <OnlineCard online={online} failed={onlineErr} onPerson={onPerson} />

      {err && <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3">{err}</div>}

      {d && (
        <div className={`space-y-5 transition-opacity ${shown !== range ? 'opacity-40 pointer-events-none' : ''}`} aria-busy={shown !== range}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat icon={<Users className="w-5 h-5" />} label="Active accounts" value={n(d.totals.active_accounts)}
              sub={`of ${n(d.totals.accounts)} accounts · ${inWindow}`} onClick={() => onGo('accounts')} />
            <Stat icon={<UserPlus className="w-5 h-5" />} label="New accounts" value={n(d.totals.new_accounts)} sub={inWindow} />
            <Stat icon={<FileAudio className="w-5 h-5" />} label="Recordings" value={n(d.totals.recordings)}
              sub={`from ${n(d.totals.recording_accounts)} account${d.totals.recording_accounts === 1 ? '' : 's'}`} />
            <Stat icon={<Clock className="w-5 h-5" />} label="Audio" value={hrs(d.totals.audio_hours)} sub="recorded and transcribed" />
            <Stat icon={<ShieldCheck className="w-5 h-5" />} label="SATE reports" value={n(d.totals.sate_reports)} sub="generated" />
            <Stat icon={<Users className="w-5 h-5" />} label="Patients added" value={n(d.totals.patients)} sub={inWindow} />
            <Stat icon={<PencilLine className="w-5 h-5" />} label="Transcript edits" value={n(d.totals.transcript_edits)} sub="saved by clinicians" />
            <Stat icon={<FileText className="w-5 h-5" />} label="Audited accesses" value={n(d.totals.audited_accesses)} sub="oversight views and exports" />
          </div>

          <SeriesCard d={d} />

          <div className="grid lg:grid-cols-2 gap-5">
            <OutcomesCard d={d} onGo={onGo} />
            <SourcesCard d={d} />
          </div>

          <ProcessingCard d={d} />
        </div>
      )}
      {!d && !err && <div className="h-40 flex items-center justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>}
    </div>
  );
}

function Card({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 min-w-0">
      <div className="flex flex-wrap items-start gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Stat({ icon, label, value, sub, onClick }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; onClick?: () => void }) {
  const body = (
    <>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-500 leading-snug">{label}</div>
        <div className="text-2xl font-semibold text-gray-900 tabular-nums mt-1">{value}</div>
        {sub && <div className="text-xs text-gray-400 mt-1 leading-snug">{sub}</div>}
      </div>
      <div className="w-9 h-9 shrink-0 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center">{icon}</div>
    </>
  );
  const cls = 'rounded-xl border border-gray-200 bg-white p-4 flex items-start gap-3 text-left';
  return onClick
    ? <button onClick={onClick} className={`${cls} hover:border-violet-300 transition-colors`}>{body}</button>
    : <div className={cls}>{body}</div>;
}

/** AI service, queue, open problems, recorders — each a link to the tab that explains it. */
function LiveStrip({ proc, onGo, recordersOnline, recordersTotal }: { proc: AdminProcessing | null; onGo: Go; recordersOnline: number; recordersTotal: number }) {
  const last = proc?.ai_probes?.[0];
  const stale = !!last && Date.now() - Date.parse(last.at) > 2.5 * 3600_000;
  const ai = !proc ? { tone: 'gray', text: '—', sub: 'not available' }
    : !last ? { tone: 'gray', text: 'No self-test', sub: 'none in the last 3 days' }
    : !last.ok ? { tone: 'red', text: 'Failing', sub: `self-test ${ago(last.at)} ago · ${last.http_code ? `HTTP ${last.http_code}` : 'no answer'}` }
    : stale ? { tone: 'amber', text: 'Working', sub: `last self-test ${ago(last.at)} ago` }
    : { tone: 'green', text: 'Working', sub: `self-test ${ago(last.at)} ago${last.latency_ms != null ? ` · ${(last.latency_ms / 1000).toFixed(1)} s` : ''}` };
  const st = proc?.stats;
  const waiting = st ? st.queued + st.processing : null;
  const queue = !st ? { tone: 'gray', text: '—', sub: 'not available' }
    : st.stuck > 0 ? { tone: 'red', text: `${waiting} in queue`, sub: `${st.stuck} stuck` }
    : { tone: waiting ? 'amber' : 'green', text: waiting ? `${waiting} in queue` : 'Empty',
        sub: waiting ? `${st.processing} processing · ${st.queued} waiting${st.oldest_queued_at ? ` · oldest ${ago(st.oldest_queued_at)}` : ''}` : 'nothing waiting' };
  const open = proc?.problems ? proc.problems.filter((p) => !p.dismissed).length : null;
  const failed = proc?.problems ? proc.problems.filter((p) => !p.dismissed && p.kind === 'failed').length : 0;
  const probs = open == null ? { tone: 'gray', text: '—', sub: 'not available' }
    : { tone: failed ? 'red' : open ? 'amber' : 'green', text: open ? `${open} open` : 'None', sub: `${failed ? `${failed} failed · ` : ''}last 7 days, as on Processing` };
  const rec = { tone: recordersTotal ? (recordersOnline ? 'green' : 'gray') : 'gray', text: `${recordersOnline} / ${recordersTotal} online`, sub: 'SATE recorders' };

  const item = (icon: React.ReactNode, label: string, s: { tone: string; text: string; sub: string }, tab: Parameters<Go>[0]) => {
    const dot = { green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500', gray: 'bg-gray-300' }[s.tone];
    const ring = s.tone === 'red' ? 'border-red-200 bg-red-50/60' : 'border-gray-200 bg-white';
    return (
      <button onClick={() => onGo(tab)} className={`rounded-xl border ${ring} p-3.5 text-left flex items-start gap-3 hover:border-violet-300 transition-colors min-w-0`}>
        <div className="w-8 h-8 shrink-0 rounded-lg bg-gray-50 text-gray-600 flex items-center justify-center">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500">{label}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-2 h-2 rounded-full ${dot}`} aria-hidden="true" />
            <span className="font-semibold text-gray-900 text-sm">{s.text}</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5 truncate">{s.sub}</div>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300 mt-1 shrink-0" />
      </button>
    );
  };
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Right now</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {item(<Activity className="w-4 h-4" />, 'AI service', ai, 'processing')}
        {item(<Hourglass className="w-4 h-4" />, 'Processing queue', queue, 'processing')}
        {item(<AlertTriangle className="w-4 h-4" />, 'Problems', probs, 'processing')}
        {item(<Cpu className="w-4 h-4" />, 'Recorders', rec, 'recorders')}
      </div>
    </div>
  );
}

/** People using the web app in the last few minutes; each opens that account's Usage page. */
function OnlineCard({ online, failed, onPerson }: { online: OnlineNow | null; failed: boolean; onPerson: (uid: string) => void }) {
  if (!online) {
    return failed
      ? <div className="text-xs text-gray-400">Online now: not available (usage analytics did not answer).</div>
      : null;
  }
  if (online.tracking === false) {
    return <div className="text-xs text-gray-400">Online now: usage tracking is switched off, so nobody is being counted.</div>;
  }
  const people = online.online;
  // Ages against the Worker's own clock (generated_at), not this browser's. last_at is the start of a minute.
  const age = (iso: string) => Math.max(0, Date.parse(online.generated_at) - Date.parse(iso));
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3.5" aria-label="People online now">
      <div className="flex items-center gap-2">
        <span className="relative flex w-2.5 h-2.5" aria-hidden="true">
          {people.length > 0 && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />}
          <span className={`relative inline-flex w-2.5 h-2.5 rounded-full ${people.length ? 'bg-emerald-500' : 'bg-gray-300'}`} />
        </span>
        <Radio className="w-4 h-4 text-gray-500" aria-hidden="true" />
        <span className="font-semibold text-gray-900 text-sm">
          {people.length === 0 ? 'Nobody online' : `${people.length} ${people.length === 1 ? 'person' : 'people'} online`}
        </span>
        <span className="text-xs text-gray-400">web app · active in the last {online.window_min} min{failed ? ' · last update failed' : ''}</span>
      </div>
      {people.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {people.map((p) => (
            <li key={p.user_id} className="min-w-0">
              <button onClick={() => onPerson(p.user_id)} title="Open this account's usage"
                className="max-w-full inline-flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5 text-left hover:border-violet-300 transition-colors">
                <span className="min-w-0 text-sm text-gray-800 truncate">{p.email || p.user_id.slice(0, 8)}</span>
                <span className="text-[11px] rounded bg-gray-100 text-gray-600 px-1.5 shrink-0">{pageName(p.page)}</span>
                <span className="text-[11px] text-gray-400 shrink-0">{age(p.last_at) < 120_000 ? 'now' : `${Math.round(age(p.last_at) / 60_000)} min ago`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Metric = 'recordings' | 'hours' | 'accounts';
const METRICS: { id: Metric; label: string; fmt: (v: number) => string }[] = [
  { id: 'recordings', label: 'Recordings', fmt: (v) => n(v) },
  { id: 'hours', label: 'Audio hours', fmt: (v) => hrs(v) },
  { id: 'accounts', label: 'Recording accounts', fmt: (v) => n(v) },
];

function bucketLabel(iso: string, bucket: Dash['bucket'], long = false) {
  // A day bucket is a calendar date (YYYY-MM-DD in the viewer's time zone): read it as local, not UTC.
  const d = bucket === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  if (bucket === 'hour') return d.toLocaleTimeString([], { hour: 'numeric' });
  if (bucket === 'day') return d.toLocaleDateString([], long ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' });
  // Week starts are Monday 00:00 UTC: label them in UTC, or a viewer west of UTC sees the Sunday before.
  return (long ? 'Week of ' : '') + d.toLocaleDateString([], { timeZone: 'UTC', month: 'short', day: 'numeric', ...(long ? { year: 'numeric' } : {}) });
}

/** One measure at a time over the window (one axis). */
function SeriesCard({ d }: { d: Dash }) {
  const [metric, setMetric] = useState<Metric>('recordings');
  const [hover, setHover] = useState<number | null>(null);
  const m = METRICS.find((x) => x.id === metric)!;
  const vals = d.series.map((s) => s[metric]);
  const max = Math.max(1, ...vals);
  const nice = niceMax(max);
  const W = 760, H = 220, L = 40, R = 8, T = 10, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const bw = pw / Math.max(1, vals.length);
  const gap = Math.min(2, bw * 0.25);
  const every = Math.ceil(vals.length / (d.bucket === 'hour' ? 8 : 10));
  const unit = d.bucket === 'hour' ? 'hour' : d.bucket === 'day' ? 'day' : 'week';
  const total = metric === 'accounts' ? null : vals.reduce((a, b) => a + b, 0);
  return (
    <Card title={`${m.label} per ${unit}`} sub={total != null ? `${m.fmt(total)} in this window` : 'distinct accounts that recorded in each ' + unit}
      right={
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-xs">
          {METRICS.map((x) => (
            <button key={x.id} onClick={() => setMetric(x.id)}
              className={`px-2.5 py-1 rounded-md ${metric === x.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'}`}>{x.label}</button>
          ))}
        </div>
      }>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${m.label} per ${unit}`} onMouseLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((f) => {
            const y = T + ph - f * ph;
            return (
              <g key={f}>
                <line x1={L} x2={W - R} y1={y} y2={y} stroke="#eef0f3" />
                <text x={L - 6} y={y + 3.5} textAnchor="end" fontSize="10" fill="#9ca3af">{m.fmt(nice * f)}</text>
              </g>
            );
          })}
          {vals.map((v, i) => {
            const h = (v / nice) * ph;
            const x = L + i * bw + gap / 2;
            const w = Math.max(1, bw - gap);
            return (
              <g key={i} onMouseEnter={() => setHover(i)}>
                <rect x={L + i * bw} y={T} width={bw} height={ph} fill="transparent" />
                {v > 0 && <path d={roundTop(x, T + ph - h, w, h, Math.min(4, w / 2))} fill={hover === i ? '#6d28d9' : '#8b5cf6'} />}
                {i % every === 0 && (
                  <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#9ca3af">{bucketLabel(d.series[i].start, d.bucket)}</text>
                )}
              </g>
            );
          })}
          <line x1={L} x2={W - R} y1={T + ph} y2={T + ph} stroke="#d1d5db" />
        </svg>
        {hover != null && d.series[hover] && (
          <div className="pointer-events-none absolute top-0 rounded-lg border border-gray-200 bg-white shadow-md px-3 py-2 text-xs"
            style={{ left: `clamp(0px, calc(${((L + (hover + 0.5) * bw) / W) * 100}% - 80px), calc(100% - 170px))` }}>
            <div className="font-medium text-gray-900 mb-1">{bucketLabel(d.series[hover].start, d.bucket, true)}</div>
            <div className="text-gray-600">{n(d.series[hover].recordings)} recordings</div>
            <div className="text-gray-600">{hrs(d.series[hover].hours)} of audio</div>
            <div className="text-gray-600">{n(d.series[hover].accounts)} account{d.series[hover].accounts === 1 ? '' : 's'}</div>
          </div>
        )}
      </div>
    </Card>
  );
}

function niceMax(v: number) {
  if (v <= 1) return v <= 0.5 ? 0.5 : 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v) return k * p;
  return 10 * p;
}
/** A bar with only its top corners rounded (anchored to the baseline). */
function roundTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function OutcomesCard({ d, onGo }: { d: Dash; onGo: Go }) {
  const o = d.outcomes;
  const total = o.done + o.no_speech + o.failed + o.waiting;
  const parts = [
    { label: 'Processed', v: o.done, color: '#10b981' },
    { label: 'No speech', v: o.no_speech, color: '#94a3b8' },
    { label: 'Failed', v: o.failed, color: '#ef4444' },
    { label: 'Waiting', v: o.waiting, color: '#f59e0b' },
  ];
  return (
    <Card title="Processing outcomes" sub="Every upload in the window, from every source"
      right={<button onClick={() => onGo('processing')} className="text-xs text-violet-700 hover:underline">Processing tab</button>}>
      <div className="flex items-end gap-6 mb-4">
        <div>
          <div className="text-3xl font-semibold text-gray-900 tabular-nums">{o.success_rate == null ? '—' : `${o.success_rate}%`}</div>
          <div className="text-xs text-gray-500 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> success rate (finished takes)</div>
        </div>
        <div>
          <div className="text-xl font-semibold text-gray-900 tabular-nums">{dur(d.totals.ready_p50_s)}</div>
          <div className="text-xs text-gray-500">median upload → ready{d.totals.ready_p90_s != null ? ` · p90 ${dur(d.totals.ready_p90_s)}` : ''}</div>
        </div>
      </div>
      {total > 0 ? (
        <>
          <div className="flex h-3 rounded-full overflow-hidden gap-[2px] bg-white" aria-hidden="true">
            {parts.filter((p) => p.v > 0).map((p) => <div key={p.label} style={{ width: `${(p.v / total) * 100}%`, background: p.color }} />)}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            {parts.map((p) => (
              <div key={p.label} className="text-xs">
                <div className="flex items-center gap-1.5 text-gray-500"><span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />{p.label}</div>
                <div className="text-sm font-semibold text-gray-900 tabular-nums mt-0.5">{n(p.v)}</div>
              </div>
            ))}
          </div>
        </>
      ) : <p className="text-sm text-gray-400">No uploads in this window.</p>}
    </Card>
  );
}

function SourcesCard({ d }: { d: Dash }) {
  const max = Math.max(0.0001, ...d.sources.map((s) => s.hours));
  return (
    <Card title="Uploads by source" sub="Which hardware or upload path the audio came from (every upload, including ones that failed or had no speech)">
      {d.sources.length === 0 ? <p className="text-sm text-gray-400">No uploads in this window.</p> : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 text-left">
              <th className="font-medium pb-2">Source</th>
              <th className="font-medium pb-2 text-right pr-3">Uploads</th>
              <th className="font-medium pb-2 w-[45%]">Audio</th>
            </tr>
          </thead>
          <tbody>
            {d.sources.map((s) => (
              <tr key={s.source} className="border-t border-gray-100">
                <td className="py-2 text-gray-900">{s.source}</td>
                <td className="py-2 text-right pr-3 tabular-nums text-gray-700">{n(s.recordings)}</td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${(s.hours / max) * 100}%` }} />
                    </div>
                    <span className="w-16 text-right tabular-nums text-xs text-gray-600">{hrs(s.hours)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/** Upload → ready against recording length, first-attempt takes with speech. */
function ProcessingCard({ d }: { d: Dash }) {
  const pts = d.processing.points;
  const [hover, setHover] = useState<number | null>(null);
  const W = 760, H = 260, L = 44, R = 10, T = 10, B = 34;
  const pw = W - L - R, ph = H - T - B;
  const xMax = useMemo(() => niceMax(Math.max(1, ...pts.map((p) => p.min))), [pts]);
  const yMax = useMemo(() => niceMax(Math.max(1, ...pts.map((p) => p.ready_min))), [pts]);
  const X = (v: number) => L + (v / xMax) * pw;
  const Y = (v: number) => T + ph - (v / yMax) * ph;
  const ticks = (max: number) => [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  const hp = hover != null ? pts[hover] : null;
  return (
    <Card title="Processing time vs recording length"
      sub={`Upload → transcript ready, first-attempt takes with speech (${n(pts.length)})${d.processing.incidents_over_1h ? ` · ${d.processing.incidents_over_1h} over 1 h (queue backlog or outage) not plotted` : ''}`}>
      {pts.length === 0 ? <p className="text-sm text-gray-400">No processed takes in this window.</p> : (
        <div className="grid xl:grid-cols-[1fr_260px] gap-5">
          <div className="relative min-w-0">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Processing time against recording length">
              {ticks(yMax).map((v) => (
                <g key={`y${v}`}>
                  <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="#eef0f3" />
                  <text x={L - 6} y={Y(v) + 3.5} textAnchor="end" fontSize="10" fill="#9ca3af">{+v.toFixed(1)}</text>
                </g>
              ))}
              {ticks(xMax).map((v) => (
                <text key={`x${v}`} x={X(v)} y={T + ph + 14} textAnchor="middle" fontSize="10" fill="#9ca3af">{+v.toFixed(1)}</text>
              ))}
              <text x={L + pw / 2} y={H - 2} textAnchor="middle" fontSize="10" fill="#6b7280">recording length (min)</text>
              <text x={10} y={T + ph / 2} textAnchor="middle" fontSize="10" fill="#6b7280" transform={`rotate(-90 10 ${T + ph / 2})`}>ready after (min)</text>
              <line x1={L} x2={W - R} y1={T + ph} y2={T + ph} stroke="#d1d5db" />
              {pts.map((p, i) => (
                <circle key={i} cx={X(p.min)} cy={Y(p.ready_min)} r={hover === i ? 5 : 4} fill="#8b5cf6" fillOpacity={hover === i ? 1 : 0.55}
                  stroke="#fff" strokeWidth="1.5" />
              ))}
              {/* Hit targets larger than the marks. */}
              {pts.map((p, i) => (
                <circle key={`h${i}`} cx={X(p.min)} cy={Y(p.ready_min)} r={9} fill="transparent"
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
              ))}
            </svg>
            {hp && (
              <div className="pointer-events-none absolute rounded-lg border border-gray-200 bg-white shadow-md px-3 py-2 text-xs"
                style={{ left: `clamp(0px, calc(${(X(hp.min) / W) * 100}% + 10px), calc(100% - 170px))`, top: `${(Y(hp.ready_min) / H) * 100}%` }}>
                <div className="font-medium text-gray-900">{hp.source}</div>
                <div className="text-gray-600">{mins(hp.min)} recording</div>
                <div className="text-gray-600">ready after {mins(hp.ready_min)}</div>
              </div>
            )}
          </div>
          <table className="text-sm self-start">
            <thead>
              <tr className="text-xs text-gray-500 text-left">
                <th className="font-medium pb-2">Length</th>
                <th className="font-medium pb-2 text-right">Takes</th>
                <th className="font-medium pb-2 text-right">Median</th>
                <th className="font-medium pb-2 text-right">p90</th>
              </tr>
            </thead>
            <tbody>
              {d.processing.bands.map((b) => (
                <tr key={b.from_min} className="border-t border-gray-100 tabular-nums">
                  <td className="py-1.5 text-gray-900 whitespace-nowrap">{b.to_min >= 240 ? `${b.from_min} min +` : `${b.from_min}–${b.to_min} min`}</td>
                  <td className="py-1.5 text-right text-gray-600">{b.n}</td>
                  <td className="py-1.5 text-right text-gray-900">{mins(b.median_min)}</td>
                  <td className="py-1.5 text-right text-gray-600">{mins(b.p90_min)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

