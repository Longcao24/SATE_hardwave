// Admin → Usage → one account: when they use the app, where, what they do, each visit step by step,
// the raw event log and their screen recordings.
//
// Every time here is in the ACCOUNT's zone (reported by its own browser), labelled, because "used it
// at 2 AM" means something very different from "used it at 2 AM in New York for someone in Seattle".

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CalendarDays, ChevronDown, ChevronRight, Clock, FileText, Monitor, Play, RefreshCw, Save, Upload } from 'lucide-react';
import { analyticsApi } from '@/services/usage/analyticsApi';
import type { ReplaySummary, UsageEvent, UsageKind, UsageReport, UsageVisit } from '@/services/usage/types';
import { ago, dayLabel, fmtMin, fmtSpan, spanSec, zoned } from './format';
import { DAY_OPTIONS, ErrorBox, KindBadge, Kpi, PageLabel, Section, Segmented, ShareBar, Spinner, friendlyError, stepText } from './ui';
import { ReplayList } from './UsageReplays';

type PTab = 'activity' | 'visits' | 'events' | 'recordings';

export function UsagePerson({ uid, email, report, error, loading, days, setDays, reload, onBack, onPlay }: {
  uid: string;
  /** From device-api's account list, for an account the analytics Worker has never seen. */
  email?: string | null;
  report: UsageReport | null; error: string | null; loading: boolean;
  days: number; setDays: (n: number) => void; reload: () => void;
  onBack: () => void;
  onPlay: (tabId: string) => void;
}) {
  const [tab, setTab] = useState<PTab>('activity');
  const z = zoned(report?.tz);
  const name = report?.email || email || '(no email)';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> All accounts
        </button>
        <div className="ml-auto flex items-center gap-2">
          <Segmented value={days} onChange={setDays} options={DAY_OPTIONS} />
          <button onClick={reload} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border bg-white hover:bg-gray-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="text-lg font-semibold text-gray-900 break-all">{name}</div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{report ? `${z.zone} (${z.zoneName})` : '—'}</span>
          <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />
            first seen {report?.first_seen ? `${z.dateTime(report.first_seen)} (${ago(report.first_seen)})` : '—'}</span>
          <span>last seen {report?.last_seen ? `${z.dateTime(report.last_seen)} (${ago(report.last_seen)})` : '—'}</span>
          {report?.device && <span className="inline-flex items-center gap-1"><Monitor className="w-3.5 h-3.5" />{report.device.w} × {report.device.h}</span>}
        </div>
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}
      {!report && !error && <Spinner label="Loading this account…" />}
      {report && !report.first_seen && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">This account has not opened the web app since usage tracking began.</div>
      )}

      {report && report.first_seen && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <Kpi icon={<Clock className="w-4 h-4 text-blue-600" />} label="Active time" value={fmtMin(report.totals.active_min)}
              sub={`${report.totals.active_days} day${report.totals.active_days === 1 ? '' : 's'} used`} />
            <Kpi icon={<Clock className="w-4 h-4 text-gray-600" />} label="Per day used"
              value={fmtMin(report.totals.active_days ? report.totals.active_min / report.totals.active_days : 0)} />
            <Kpi icon={<Monitor className="w-4 h-4 text-gray-600" />} label="Visits" value={report.totals.visits} sub={`${report.totals.clicks} clicks`} />
            <Kpi icon={<Upload className="w-4 h-4 text-green-600" />} label="Uploads" value={report.totals.uploads}
              sub={`${report.totals.failed} failed · ${report.totals.no_text} no speech`} />
            <Kpi icon={<Save className="w-4 h-4 text-gray-600" />} label="Transcript saves" value={report.totals.saves} />
            <Kpi icon={<FileText className="w-4 h-4 text-violet-600" />} label="SATE reports" value={report.totals.reports} />
            <Kpi icon={<AlertTriangle className="w-4 h-4 text-red-600" />} label="Errors" value={report.totals.errors} tone={report.totals.errors ? 'red' : undefined} />
          </div>

          <div className="flex gap-1 border-b border-gray-200">
            {([['activity', 'Activity'], ['visits', `Visits (${report.visits.length})`], ['events', 'Event log'],
              ['recordings', `Recordings (${report.totals.replays})`]] as [PTab, string][]).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap ${tab === id ? 'border-violet-600 text-violet-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'activity' && <Activity report={report} />}
          {tab === 'visits' && <Visits report={report} onPlay={onPlay} />}
          {tab === 'events' && <EventLog uid={uid} tz={report.tz} />}
          {tab === 'recordings' && <ReplayList uid={uid} tz={report.tz} onPlay={(r: ReplaySummary) => onPlay(r.tab_id)} />}
        </>
      )}
    </div>
  );
}

function Activity({ report }: { report: UsageReport }) {
  const z = zoned(report.tz);
  const days = report.days;
  const maxDay = Math.max(1, ...days.map((d) => d.active_min));
  const maxHour = Math.max(1, ...days.flatMap((d) => d.hours));
  const maxPage = Math.max(1, ...report.pages.map((p) => p.min));
  const uploadDays = days.filter((d) => d.uploads || d.failed || d.saves || d.reports);

  return (
    <div className="space-y-4">
      <Section title="Active time per day" hint={`Days in ${z.zoneName}. Hover a day for its first and last activity.`}>
        {days.length === 0 ? <p className="text-sm text-gray-500">No days in this window.</p> : (
          <>
            <div className="flex items-end gap-px h-32">
              {days.map((d) => (
                <div key={d.date} className="flex-1 h-full flex flex-col justify-end group"
                  title={`${dayLabel(d.date)}\n${fmtMin(d.active_min)} active · ${d.visits} visits\n${d.first ? `${z.time(d.first)} – ${z.time(d.last)} ${z.zoneName}` : 'not used'}`}>
                  <div className={`rounded-t ${d.active_min ? 'bg-violet-500' : 'bg-gray-100'} group-hover:bg-violet-700`}
                    style={{ height: d.active_min ? `${Math.max(3, (d.active_min / maxDay) * 100)}%` : '2px' }} />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-gray-400">
              <span>{dayLabel(days[0].date, false)}</span><span>peak {fmtMin(maxDay)}</span><span>{dayLabel(days[days.length - 1].date, false)}</span>
            </div>
          </>
        )}
      </Section>

      <Section title="When they work" hint={`Active minutes by hour of day, ${z.zoneName}. Darker = more.`}>
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="grid gap-px text-[10px] text-gray-400" style={{ gridTemplateColumns: '84px repeat(24, minmax(0, 1fr))' }}>
              <div />
              {Array.from({ length: 24 }, (_, h) => <div key={h} className="text-center">{h % 3 === 0 ? (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`) : ''}</div>)}
              {[...days].reverse().filter((d) => d.active_min > 0).map((d) => (
                <Fragment key={d.date}>
                  <div className="text-gray-500 pr-2 whitespace-nowrap leading-4">{dayLabel(d.date)}</div>
                  {Array.from({ length: 24 }, (_, h) => {
                    const m = d.hours[h] || 0;
                    return <div key={h} className="h-4 rounded-sm" title={`${dayLabel(d.date)} ${h}:00 — ${m} min`}
                      style={{ background: m ? `rgba(124, 58, 237, ${0.15 + 0.85 * (m / maxHour)})` : '#f3f4f6' }} />;
                  })}
                </Fragment>
              ))}
            </div>
            {!days.some((d) => d.active_min > 0) && <p className="text-sm text-gray-500 mt-2">No active minutes in this window.</p>}
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Pages" hint="Where their active time went.">
          {report.pages.length === 0 ? <p className="text-sm text-gray-500">Nothing yet.</p> : (
            <table className="w-full text-sm">
              <tbody>
                {report.pages.map((p) => (
                  <tr key={p.page}>
                    <td className="py-1 pr-3"><PageLabel page={p.page} className="text-gray-800" /><ShareBar value={p.min} max={maxPage} /></td>
                    <td className="py-1 text-right tabular-nums align-top">{fmtMin(p.min)}</td>
                    <td className="py-1 pl-3 text-right tabular-nums align-top text-gray-500 whitespace-nowrap">{p.views} views</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
        <Section title="What they did" hint="Clicks, app actions and errors.">
          {report.actions.length === 0 ? <p className="text-sm text-gray-500">Nothing yet.</p> : (
            <ul className="text-sm divide-y divide-gray-50 max-h-[360px] overflow-y-auto">
              {report.actions.map((a) => (
                <li key={`${a.kind}:${a.label}`} className="py-1 flex items-center gap-2">
                  <KindBadge kind={a.kind} />
                  <span className={`flex-1 truncate ${a.kind === 'error' ? 'text-red-700' : 'text-gray-800'}`} title={a.label}>{a.label}</span>
                  <span className="tabular-nums text-gray-500">{a.n}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Uploads and work" hint="From what the web app reported doing; per day the account did any.">
        {uploadDays.length === 0 ? <p className="text-sm text-gray-500">No uploads, saves or reports in this window.</p> : (
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className="text-left font-medium pb-1">Day</th>
                <th className="text-right font-medium pb-1">Uploads</th><th className="text-right font-medium pb-1">Ready</th>
                <th className="text-right font-medium pb-1">No speech</th><th className="text-right font-medium pb-1">Failed</th>
                <th className="text-right font-medium pb-1">Saves</th><th className="text-right font-medium pb-1">Reports</th>
              </tr>
            </thead>
            <tbody>
              {[...uploadDays].reverse().map((d) => (
                <tr key={d.date} className="border-t border-gray-50">
                  <td className="py-1">{dayLabel(d.date)}</td>
                  <td className="py-1 text-right tabular-nums">{d.uploads}</td>
                  <td className="py-1 text-right tabular-nums text-green-700">{d.done}</td>
                  <td className="py-1 text-right tabular-nums text-amber-700">{d.no_text}</td>
                  <td className={`py-1 text-right tabular-nums ${d.failed ? 'text-red-700 font-medium' : ''}`}>{d.failed}</td>
                  <td className="py-1 text-right tabular-nums">{d.saves}</td>
                  <td className="py-1 text-right tabular-nums">{d.reports}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function Visits({ report, onPlay }: { report: UsageReport; onPlay: (tabId: string) => void }) {
  const z = zoned(report.tz);
  const [open, setOpen] = useState<string | null>(null);
  const visits = useMemo(() => [...report.visits].sort((a, b) => Date.parse(b.start) - Date.parse(a.start)), [report]);
  return (
    <Section title="Visits" hint={`Each browser tab is one visit, newest first. Times in ${z.zoneName}. Click one for its steps.`}>
      {visits.length === 0 ? <p className="text-sm text-gray-500">No visits in this window.</p> : (
        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 w-6"></th>
                <th className="text-left font-semibold px-3 py-2">Started</th>
                <th className="text-right font-semibold px-3 py-2">Length</th>
                <th className="text-right font-semibold px-3 py-2">Active</th>
                <th className="text-right font-semibold px-3 py-2">Pages</th>
                <th className="text-right font-semibold px-3 py-2">Clicks</th>
                <th className="text-right font-semibold px-3 py-2">Errors</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visits.map((v) => (
                <Fragment key={v.tab_id}>
                  <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(open === v.tab_id ? null : v.tab_id)}>
                    <td className="px-4 py-2 text-gray-400">{open === v.tab_id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{z.dateTime(v.start)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtSpan(spanSec(v.start, v.end))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMin(v.active_min)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{v.pages}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{v.clicks}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${v.errors ? 'text-red-700' : ''}`}>{v.errors}</td>
                    <td className="px-3 py-2 text-right">
                      {v.has_replay && (
                        <button onClick={(e) => { e.stopPropagation(); onPlay(v.tab_id); }}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-violet-200 text-violet-700 hover:bg-violet-50">
                          <Play className="w-3.5 h-3.5" /> Replay
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === v.tab_id && (
                    <tr><td colSpan={8} className="bg-gray-50/60 px-4 py-2"><StepTimeline visit={v} tz={report.tz} /></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function StepTimeline({ visit, tz }: { visit: UsageVisit; tz: string }) {
  const z = zoned(tz);
  if (!visit.steps.length) return <p className="text-xs text-gray-500">No steps recorded.</p>;
  const t0 = Date.parse(visit.start);
  return (
    <ol className="relative border-l border-gray-200 ml-2 space-y-1 py-1">
      {visit.steps.map((s, i) => (
        <li key={i} className="pl-3 relative text-sm flex items-start gap-2">
          <span className={`absolute -left-[4.5px] top-1.5 w-2 h-2 rounded-full ${s.kind === 'error' ? 'bg-red-500' : s.kind === 'view' ? 'bg-blue-500' : s.kind === 'action' ? 'bg-green-500' : 'bg-violet-400'}`} />
          <span className="text-[11px] text-gray-400 tabular-nums w-20 shrink-0 pt-0.5" title={`+${fmtSpan((Date.parse(s.at) - t0) / 1000)}`}>{z.timeSec(s.at)}</span>
          <KindBadge kind={s.kind} />
          <span className="min-w-0 break-words">{stepText(s.kind, s.label)}</span>
        </li>
      ))}
    </ol>
  );
}

const KINDS: { id: '' | UsageKind; label: string }[] = [
  { id: '', label: 'All' }, { id: 'view', label: 'Views' }, { id: 'click', label: 'Clicks' },
  { id: 'action', label: 'Actions' }, { id: 'error', label: 'Errors' }, { id: 'active', label: 'Active' },
];

function EventLog({ uid, tz }: { uid: string; tz: string }) {
  const z = zoned(tz);
  const [kind, setKind] = useState<'' | UsageKind>('');
  const [rows, setRows] = useState<UsageEvent[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback((before?: string) => {
    setLoading(true);
    analyticsApi.events(uid, { kind: kind || undefined, before })
      .then((r) => { setRows((prev) => (before ? [...(prev || []), ...r.events] : r.events)); setNext(r.next_before); setError(null); })
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [uid, kind]);
  useEffect(() => { setRows(null); load(); }, [load]);

  return (
    <Section title="Raw event log" hint={`Exactly what the browser sent, newest first. Times in ${z.zoneName}.`}
      right={<Segmented value={kind} onChange={setKind} options={KINDS} />}>
      {error && <ErrorBox error={error} onRetry={() => load()} />}
      {!rows && !error && <Spinner />}
      {rows && (
        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Time</th>
                <th className="text-left font-semibold px-3 py-2">Kind</th>
                <th className="text-left font-semibold px-3 py-2">Page</th>
                <th className="text-left font-semibold px-3 py-2">Label</th>
                <th className="text-left font-semibold px-3 py-2">Props</th>
                <th className="text-left font-semibold px-3 py-2">Tab</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-mono">
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-4 text-gray-500 font-sans">No events.</td></tr>}
              {rows.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50 align-top">
                  <td className="px-4 py-1 whitespace-nowrap text-gray-500">{z.day(e.at)} {z.timeSec(e.at)}</td>
                  <td className="px-3 py-1 font-sans"><KindBadge kind={e.kind} /></td>
                  <td className="px-3 py-1 whitespace-nowrap"><PageLabel page={e.page} /></td>
                  <td className={`px-3 py-1 break-words max-w-[320px] ${e.kind === 'error' ? 'text-red-700' : ''}`}>{e.label || ''}</td>
                  <td className="px-3 py-1 text-gray-500 break-all max-w-[220px]">{e.props ? JSON.stringify(e.props) : ''}</td>
                  <td className="px-3 py-1 text-gray-400" title={e.tab_id}>{e.tab_id.slice(0, 6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {next && (
            <div className="px-4 pt-3">
              <button disabled={loading} onClick={() => load(next)} className="text-xs px-3 py-1.5 rounded-md border bg-white hover:bg-gray-50">
                {loading ? 'Loading…' : 'Load older'}
              </button>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
