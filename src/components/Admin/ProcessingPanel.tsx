// Admin → Processing: every take the server is working on, across ALL accounts (device-api v38).
//
// What it answers, top to bottom: is the worker alive and keeping up (KPIs + health banner), what
// is it doing right now and in what order (live list, claim order), how well has it been doing
// (success rate per day / per device family), and what failed and why (errors grouped by reason,
// with Retry). Retry is the owner's own Retry, done by an admin and written to the audit trail.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, RotateCcw, Timer, Zap } from 'lucide-react';
import { deviceApiService } from '@/services/device/deviceApiService';
import type { AdminProcessing } from '@/services/device/deviceTypes';

const len = (sec?: number | null) => {
  const s = Math.round(sec || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}h ${m}m` : `${m}:${String(r).padStart(2, '0')}`;
};
const ago = (iso?: string | null) => {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${Math.round(s / 86400)}d`;
};
const pct = (x: number | null | undefined) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);

export function ProcessingPanel() {
  const [days, setDays] = useState(7);
  const [d, setD] = useState<AdminProcessing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    deviceApiService.adminProcessing(days)
      .then((x) => { setD(x); setError(null); })
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setLoading(false));
  }, [days]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!auto) return;
    const t = window.setInterval(load, 15_000);
    return () => window.clearInterval(t);
  }, [auto, load]);

  const reasonOf = (e?: string | null) => String(e || 'unknown')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<id>').replace(/\d+(\.\d+)?/g, 'N').trim().slice(0, 120);
  const errors = useMemo(() => (d?.errors || []).filter((e) => !reason || reasonOf(e.process_error) === reason), [d, reason]);

  const act = async (fn: () => Promise<{ skipped: { id: string; reason: string }[] } & Record<string, any>>, verb: string) => {
    setBusy(true); setNote(null);
    try {
      const r = await fn();
      const okN = (r.retried || r.requeued || []).length;
      setNote(`${okN} ${verb}${r.skipped.length ? ` · ${r.skipped.length} skipped (${[...new Set(r.skipped.map((x) => x.reason))].join(', ')})` : ''}`);
      setSelected(new Set());
      load();
    } catch (e: any) { setNote(String(e.message || e)); }
    finally { setBusy(false); }
  };
  const retry = (ids: string[]) => act(() => deviceApiService.adminRetrySessions(ids), 're-queued');
  const requeue = (ids: string[]) => act(() => deviceApiService.adminRequeueStuck(ids), 'stuck take(s) re-queued');

  if (!d && !error) return <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>;
  const st = d?.stats;
  const workerQuiet = st && st.queued > 0 && (!st.worker_last_finished_at || Date.now() - Date.parse(st.worker_last_finished_at) > 20 * 60_000)
    && st.processing === 0;
  const maxDay = Math.max(1, ...(d?.per_day || []).map((x) => x.done + x.error));

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-white p-0.5">
          {[1, 7, 30].map((n) => (
            <button key={n} onClick={() => setDays(n)}
              className={`px-3 py-1 text-xs rounded-md ${days === n ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {n === 1 ? '24 h' : `${n} days`}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-refresh (15 s)
        </label>
        <button onClick={load} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border bg-white hover:bg-gray-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        {d && <span className="text-xs text-gray-400">updated {ago(d.generated_at)} ago</span>}
        {note && <span className="text-xs text-violet-700 ml-auto">{note}</span>}
      </div>
      {error && <div className="rounded-md bg-red-50 text-red-700 text-sm p-3">{error}</div>}

      {st && (
        <>
          {/* Health */}
          {(st.stuck > 0 || workerQuiet) && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                {st.stuck > 0 && <div><b>{st.stuck}</b> take{st.stuck > 1 ? 's have' : ' has'} been processing for over 90 min — the watchdog will re-queue {st.stuck > 1 ? 'them' : 'it'}, or use Requeue below.</div>}
                {workerQuiet && <div>Takes are waiting but nothing is processing and the worker last finished a job <b>{ago(st.worker_last_finished_at)} ago</b>. The worker or the AI service may be down — check the status page.</div>}
              </div>
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <Kpi icon={<Zap className="w-4 h-4 text-violet-600" />} label="Processing now" value={st.processing}
              sub={st.processing ? len(d!.live.filter((x) => x.status === 'processing').reduce((t, x) => t + x.seconds, 0)) + ' of audio' : 'idle'} />
            <Kpi icon={<Clock className="w-4 h-4 text-blue-600" />} label="In queue" value={st.queued}
              sub={st.queued ? `${len(st.queue_seconds)} · oldest ${ago(st.oldest_queued_at)}` : 'empty'} />
            <Kpi icon={<CheckCircle2 className="w-4 h-4 text-green-600" />} label="Success rate" value={pct(st.success_rate)}
              sub={`${st.done} done · ${st.error} failed`} />
            <Kpi icon={<AlertTriangle className="w-4 h-4 text-red-600" />} label="Unresolved errors" value={st.unresolved_errors}
              sub="all time, waiting for a retry" tone={st.unresolved_errors ? 'red' : undefined} />
            <Kpi icon={<Timer className="w-4 h-4 text-gray-600" />} label="Upload → ready" value={st.turnaround_p50_s == null ? '—' : len(st.turnaround_p50_s)}
              sub={`median · p90 ${st.turnaround_p90_s == null ? '—' : len(st.turnaround_p90_s)}`} />
            <Kpi icon={<Clock className="w-4 h-4 text-gray-600" />} label="Audio processed" value={len(st.audio_seconds_done)}
              sub={`${st.uploaded} uploaded · ${st.no_text} no speech`} />
            <Kpi icon={<RefreshCw className="w-4 h-4 text-gray-600" />} label="Worker last finished" value={ago(st.worker_last_finished_at)}
              sub="ago" />
          </div>

          {/* Live */}
          <Section title={`Live — ${d!.live.length} take${d!.live.length === 1 ? '' : 's'}`}
            hint="Processing first, then the queue in the order the worker will take it (short takes go slightly ahead; a long one is never pushed back more than 6 min).">
            <Table head={['#', 'Status', 'Account', 'Device', 'Length', 'Attempts', 'Uploaded', '']}>
              {d!.live.length === 0 && <Empty cols={8} text="Nothing is queued or processing." />}
              {d!.live.map((r, i) => {
                const backoff = r.not_before && Date.parse(r.not_before) > Date.now();
                return (
                  <tr key={r.id} className={`border-t ${r.stuck ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-2 text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.status === 'processing'
                        ? <span className={`inline-flex items-center gap-1.5 ${r.stuck ? 'text-red-700' : 'text-violet-700'}`}>
                            {r.stuck ? <AlertTriangle className="w-3.5 h-3.5" /> : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {r.stuck ? 'Stuck' : 'Processing'} · {ago(r.processing_started_at)}
                          </span>
                        : <span className="text-blue-700">{backoff ? `Retry in ${ago(new Date(2 * Date.now() - Date.parse(r.not_before!)).toISOString())}` : 'Queued'} · waiting {ago(r.created_at)}</span>}
                      {r.status === 'processing' && r.heartbeat_at && <div className="text-[11px] text-gray-400">heartbeat {ago(r.heartbeat_at)} ago</div>}
                    </td>
                    <td className="px-3 py-2 truncate max-w-[220px]">{r.email || '—'}</td>
                    <td className="px-3 py-2"><div>{r.family}</div><div className="text-[11px] text-gray-400 font-mono">{r.device_serial}</div></td>
                    <td className="px-3 py-2 tabular-nums">{len(r.seconds)}</td>
                    <td className="px-3 py-2 tabular-nums">{r.attempts}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      {r.stuck && <button disabled={busy} onClick={() => requeue([r.id])}
                        className="text-xs px-2 py-1 rounded-md border border-red-300 text-red-700 hover:bg-red-100 disabled:opacity-40">Requeue</button>}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Section>

          {/* Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <Section title="Per day" hint="Takes uploaded that day: finished (green) and failed (red)." className="lg:col-span-3">
              <div className="flex items-end gap-1 h-36 px-1">
                {d!.per_day.map((x) => (
                  <div key={x.day} className="flex-1 flex flex-col items-center justify-end h-full min-w-0"
                    title={`${x.day}: ${x.done} done (${x.no_text} no speech), ${x.error} failed, ${len(x.seconds)} audio`}>
                    <div className="w-full bg-red-400 rounded-t" style={{ height: `${(x.error / maxDay) * 100}%` }} />
                    <div className="w-full bg-green-500" style={{ height: `${(x.done / maxDay) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="flex gap-1 px-1 mt-1">
                {d!.per_day.map((x, i) => (
                  <div key={x.day} className="flex-1 text-[10px] text-gray-400 text-center truncate">
                    {d!.per_day.length <= 7 || i % 5 === 0 ? x.day.slice(5) : ''}
                  </div>
                ))}
              </div>
            </Section>
            <Section title="By device" className="lg:col-span-2">
              <Table head={['Device', 'Done', 'Failed', 'Success', 'Audio']}>
                {d!.per_family.length === 0 && <Empty cols={5} text="No uploads in this window." />}
                {d!.per_family.map((f) => (
                  <tr key={f.family} className="border-t">
                    <td className="px-3 py-1.5">{f.family}</td>
                    <td className="px-3 py-1.5 tabular-nums">{f.done}</td>
                    <td className={`px-3 py-1.5 tabular-nums ${f.error ? 'text-red-600' : ''}`}>{f.error}</td>
                    <td className="px-3 py-1.5 tabular-nums">{pct(f.success_rate)}</td>
                    <td className="px-3 py-1.5 tabular-nums">{len(f.seconds)}</td>
                  </tr>
                ))}
              </Table>
            </Section>
          </div>

          {/* Errors */}
          <Section title={`Failed — ${d!.errors.length} waiting for a retry`}
            hint="Retry re-queues the take from the audio already on the server (attempts reset). The failure being retried is kept in the audit trail.">
            {d!.error_reasons.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button onClick={() => setReason(null)}
                  className={`text-xs px-2 py-1 rounded-full border ${!reason ? 'bg-gray-800 text-white border-gray-800' : 'bg-white'}`}>All</button>
                {d!.error_reasons.map((r) => (
                  <button key={r.reason} onClick={() => setReason(r.reason === reason ? null : r.reason)} title={r.reason}
                    className={`text-xs px-2 py-1 rounded-full border max-w-[360px] truncate ${reason === r.reason ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-800 border-red-200'}`}>
                    {r.n} × {r.reason}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs text-gray-600 inline-flex items-center gap-1.5">
                <input type="checkbox" checked={errors.length > 0 && errors.every((e) => selected.has(e.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(errors.map((x) => x.id)) : new Set())} />
                Select all shown
              </label>
              <button disabled={busy || selected.size === 0} onClick={() => retry([...selected].slice(0, 100))}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-violet-600 text-white disabled:opacity-40">
                <RotateCcw className="w-3.5 h-3.5" /> Retry selected ({selected.size})
              </button>
            </div>
            <Table head={['', 'Account', 'Device', 'Length', 'Tries', 'Uploaded', 'Error', '']}>
              {errors.length === 0 && <Empty cols={8} text="No failed takes." />}
              {errors.map((e) => (
                <tr key={e.id} className="border-t align-top">
                  <td className="px-3 py-2"><input type="checkbox" checked={selected.has(e.id)}
                    onChange={(ev) => { const n = new Set(selected); ev.target.checked ? n.add(e.id) : n.delete(e.id); setSelected(n); }} /></td>
                  <td className="px-3 py-2 truncate max-w-[200px]">{e.email || '—'}</td>
                  <td className="px-3 py-2"><div>{e.family}</div><div className="text-[11px] text-gray-400 font-mono">{e.device_serial}</div></td>
                  <td className="px-3 py-2 tabular-nums">{len(e.seconds)}</td>
                  <td className="px-3 py-2 tabular-nums">{e.attempts}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs text-red-700 max-w-[360px] break-words">{e.process_error || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button disabled={busy} onClick={() => retry([e.id])}
                      className="text-xs px-2 py-1 rounded-md border hover:bg-gray-50 disabled:opacity-40">Retry</button>
                  </td>
                </tr>
              ))}
            </Table>
          </Section>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; tone?: 'red' }) {
  return (
    <div className={`rounded-xl border bg-white p-3 ${tone === 'red' ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="flex items-center gap-1.5 text-xs text-gray-500">{icon}{label}</div>
      <div className={`text-xl font-semibold mt-1 ${tone === 'red' ? 'text-red-700' : 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5 truncate" title={sub}>{sub}</div>}
    </div>
  );
}

function Section({ title, hint, children, className = '' }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-4 ${className}`}>
      <h3 className="font-semibold text-gray-900">{title}</h3>
      {hint && <p className="text-xs text-gray-500 mb-3">{hint}</p>}
      {!hint && <div className="mb-2" />}
      {children}
    </section>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-gray-500 uppercase tracking-wide">
          <tr>{head.map((h, i) => <th key={i} className="text-left font-semibold px-3 py-1.5">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ cols, text }: { cols: number; text: string }) {
  return <tr><td colSpan={cols} className="px-3 py-4 text-sm text-gray-500">{text}</td></tr>;
}
