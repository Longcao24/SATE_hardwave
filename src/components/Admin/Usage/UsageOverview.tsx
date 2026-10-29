// Admin → Usage, the overview: how much the web app is used across every account, and who uses it.
//
// The analytics Worker only knows accounts it has SEEN, so the accounts table is merged with
// device-api's account list — an account that never opened the web app is exactly the one an
// operator needs to notice, and it would otherwise be missing rather than shown at zero.

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, Clock, MousePointerClick, PlayCircle, Search, Upload, Users } from 'lucide-react';
import type { AdminUser } from '@/services/device/deviceTypes';
import type { UsageAccountRow, UsageOverview as Overview } from '@/services/usage/types';
import { ago, dayLabel, fmtMin, weekdayOf } from './format';
import { KindBadge, Kpi, PageLabel, Section, Segmented, ShareBar } from './ui';

type SortKey = 'last_seen' | 'active_min' | 'visits' | 'uploads' | 'errors';
type Row = UsageAccountRow & { seen: boolean; disabled?: boolean };

export function UsageOverview({ data, users, onOpenUser }: {
  data: Overview; users: AdminUser[]; onOpenUser: (uid: string) => void;
}) {
  const [metric, setMetric] = useState<'dau' | 'active_min'>('dau');
  const [sort, setSort] = useState<SortKey>('last_seen');
  const [query, setQuery] = useState('');

  const kpi = useMemo(() => {
    const s = data.series;
    const activeMin = s.reduce((t, x) => t + x.active_min, 0);
    const accountDays = s.reduce((t, x) => t + x.dau, 0);
    return {
      accounts: data.accounts.filter((a) => a.active_min > 0 || a.visits > 0).length,
      activeMin,
      // Per account-day that had any use — averaging over idle days would just measure how many
      // accounts exist, not how long a working session is.
      avg: accountDays ? activeMin / accountDays : 0,
      visits: s.reduce((t, x) => t + x.visits, 0),
      uploads: s.reduce((t, x) => t + x.uploads, 0),
      errors: s.reduce((t, x) => t + x.errors, 0),
      replays: data.accounts.reduce((t, a) => t + (a.replays || 0), 0),
    };
  }, [data]);

  const rows = useMemo<Row[]>(() => {
    const seen = new Map(data.accounts.map((a) => [a.user_id, a]));
    const out: Row[] = data.accounts.map((a) => {
      const u = users.find((x) => x.id === a.user_id);
      return { ...a, email: a.email || u?.email || null, seen: true, disabled: u?.disabled };
    });
    for (const u of users) {
      if (seen.has(u.id)) continue;
      out.push({
        user_id: u.id, email: u.email, active_min: 0, active_days: 0, visits: 0, events: 0,
        first_seen: null, last_seen: null, uploads: 0, failed: 0, errors: 0, replays: 0, seen: false, disabled: u.disabled,
      });
    }
    const q = query.trim().toLowerCase();
    const shown = q ? out.filter((r) => (r.email || '').toLowerCase().includes(q)) : out;
    const val = (r: Row) => (sort === 'last_seen' ? (r.last_seen ? Date.parse(r.last_seen) : 0) : (r[sort] as number) || 0);
    return shown.sort((a, b) => val(b) - val(a) || (a.email || '').localeCompare(b.email || ''));
  }, [data, users, query, sort]);

  const maxPageMin = Math.max(1, ...data.pages.map((p) => p.min));
  const maxEvent = Math.max(1, ...data.events.map((e) => e.n));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <Kpi icon={<Users className="w-4 h-4 text-violet-600" />} label="Active accounts" value={kpi.accounts} sub={`of ${Math.max(users.length, data.accounts.length)} accounts`} />
        <Kpi icon={<Clock className="w-4 h-4 text-blue-600" />} label="Active time" value={fmtMin(kpi.activeMin)} sub="input in the last minute, tab visible" />
        <Kpi icon={<Clock className="w-4 h-4 text-gray-600" />} label="Avg / account / day" value={fmtMin(kpi.avg)} sub="over days the account was used" />
        <Kpi icon={<MousePointerClick className="w-4 h-4 text-gray-600" />} label="Visits" value={kpi.visits} sub="browser tabs opened" />
        <Kpi icon={<Upload className="w-4 h-4 text-green-600" />} label="Uploads" value={kpi.uploads} sub="started in the web app" />
        <Kpi icon={<AlertTriangle className="w-4 h-4 text-red-600" />} label="Errors" value={kpi.errors} sub="shown to a user" tone={kpi.errors ? 'red' : undefined} />
        <Kpi icon={<PlayCircle className="w-4 h-4 text-violet-600" />} label="Recordings" value={kpi.replays} sub="screen recordings" />
      </div>

      <Section title={metric === 'dau' ? 'Accounts active per day' : 'Active minutes per day'}
        hint={`Days in ${data.tz}.`}
        right={<Segmented value={metric} onChange={setMetric} options={[{ id: 'dau', label: 'Accounts' }, { id: 'active_min', label: 'Active time' }]} />}>
        <DayBars series={data.series} metric={metric} />
      </Section>

      <Section title="Accounts" hint="Every account, including those that have never opened the web app (dimmed). Click one for its full report."
        right={
          <div className="flex items-center gap-2 bg-white border rounded-md px-2 w-56">
            <Search className="w-4 h-4 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by email" className="w-full py-1.5 text-sm outline-none bg-transparent" />
          </div>
        }>
        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Account</th>
                <SortTh k="last_seen" sort={sort} setSort={setSort}>Last seen</SortTh>
                <SortTh k="active_min" sort={sort} setSort={setSort}>Active time</SortTh>
                <th className="text-right font-semibold px-3 py-2">Days</th>
                <SortTh k="visits" sort={sort} setSort={setSort}>Visits</SortTh>
                <SortTh k="uploads" sort={sort} setSort={setSort}>Uploads</SortTh>
                <SortTh k="errors" sort={sort} setSort={setSort}>Errors</SortTh>
                <th className="text-right font-semibold px-3 py-2">Rec.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-4 text-gray-500">{query ? 'No account matches.' : 'No accounts yet.'}</td></tr>}
              {rows.map((r) => (
                <tr key={r.user_id} onClick={() => onOpenUser(r.user_id)}
                  className={`hover:bg-gray-50 cursor-pointer ${r.seen && r.last_seen ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900 truncate max-w-[280px]">{r.email || '(no email)'}</div>
                    <div className="text-xs text-gray-400">
                      {r.seen && r.first_seen ? `first seen ${ago(r.first_seen)}` : 'never opened the web app'}
                      {r.disabled ? ' · disabled' : ''}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{r.last_seen ? ago(r.last_seen) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMin(r.active_min)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">{r.active_days}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.visits}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.uploads}{r.failed ? <span className="text-red-600 text-xs"> · {r.failed} failed</span> : null}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${r.errors ? 'text-red-700' : ''}`}>{r.errors}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">{r.replays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Top pages" hint="By active time; views = times the page was opened.">
          {data.pages.length === 0 ? <p className="text-sm text-gray-500">Nothing yet.</p> : (
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs">
                <tr><th className="text-left font-medium pb-1">Page</th><th className="text-right font-medium pb-1">Time</th>
                  <th className="text-right font-medium pb-1 pl-3">Views</th><th className="text-right font-medium pb-1 pl-3">Users</th></tr>
              </thead>
              <tbody>
                {data.pages.map((p) => (
                  <tr key={p.page}>
                    <td className="py-1 pr-3">
                      <PageLabel page={p.page} className="text-gray-800" />
                      <ShareBar value={p.min} max={maxPageMin} />
                    </td>
                    <td className="py-1 text-right tabular-nums align-top">{fmtMin(p.min)}</td>
                    <td className="py-1 pl-3 text-right tabular-nums align-top text-gray-500">{p.views}</td>
                    <td className="py-1 pl-3 text-right tabular-nums align-top text-gray-500">{p.users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
        <Section title="Top events" hint="Clicks, app actions and errors across all accounts.">
          {data.events.length === 0 ? <p className="text-sm text-gray-500">Nothing yet.</p> : (
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs">
                <tr><th className="text-left font-medium pb-1">Event</th><th className="text-right font-medium pb-1">Count</th>
                  <th className="text-right font-medium pb-1 pl-3">Users</th></tr>
              </thead>
              <tbody>
                {data.events.map((e) => (
                  <tr key={`${e.kind}:${e.label}`}>
                    <td className="py-1 pr-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <KindBadge kind={e.kind} />
                        <span className={`truncate ${e.kind === 'error' ? 'text-red-700' : 'text-gray-800'}`} title={e.label}>{e.label}</span>
                      </div>
                      <ShareBar value={e.n} max={maxEvent} tone="blue" />
                    </td>
                    <td className="py-1 text-right tabular-nums align-top">{e.n}</td>
                    <td className="py-1 pl-3 text-right tabular-nums align-top text-gray-500">{e.users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    </div>
  );
}

function SortTh({ k, sort, setSort, children }: { k: SortKey; sort: SortKey; setSort: (k: SortKey) => void; children: React.ReactNode }) {
  return (
    <th className="text-right font-semibold px-3 py-2 whitespace-nowrap">
      <button onClick={() => setSort(k)} className={`inline-flex items-center gap-0.5 uppercase ${sort === k ? 'text-violet-700' : 'hover:text-gray-800'}`}>
        {children}{sort === k && <ArrowDown className="w-3 h-3" />}
      </button>
    </th>
  );
}

/** One bar per day. Plain divs: the series is at most 90 points and needs no chart library. */
function DayBars({ series, metric }: { series: Overview['series']; metric: 'dau' | 'active_min' }) {
  if (!series.length) return <p className="text-sm text-gray-500">No days in this window.</p>;
  const val = (x: Overview['series'][number]) => (metric === 'dau' ? x.dau : x.active_min);
  const max = Math.max(1, ...series.map(val));
  // Label only some days when there are many, or 90 labels overlap into noise.
  const every = series.length <= 14 ? 1 : series.length <= 31 ? 3 : 10;
  return (
    <div>
      <div className="flex items-end gap-px h-36">
        {series.map((x) => {
          const v = val(x);
          const weekend = [0, 6].includes(weekdayOf(x.date));
          return (
            <div key={x.date} className="flex-1 h-full flex flex-col justify-end group relative"
              title={`${dayLabel(x.date)}\n${x.dau} account${x.dau === 1 ? '' : 's'} · ${fmtMin(x.active_min)} active\n${x.visits} visits · ${x.uploads} uploads · ${x.errors} errors`}>
              <div className={`rounded-t ${v ? (weekend ? 'bg-violet-300' : 'bg-violet-500') : 'bg-gray-100'} group-hover:bg-violet-700`}
                style={{ height: v ? `${Math.max(3, (v / max) * 100)}%` : '2px' }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-px mt-1">
        {series.map((x, i) => (
          <div key={x.date} className="flex-1 text-[10px] text-gray-400 text-center whitespace-nowrap overflow-visible">
            {i % every === 0 || i === series.length - 1 ? dayLabel(x.date, false) : ''}
          </div>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-gray-400">Peak {metric === 'dau' ? `${max} accounts` : fmtMin(max)} · lighter bars are weekends</div>
    </div>
  );
}
