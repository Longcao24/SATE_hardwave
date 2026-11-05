// Admin → Usage: how every account uses the web app (the in-house "PostHog").
//
// Reads the analytics Worker (Cloudflare D1 + R2), never device-api — analytics is a separate
// service on purpose, so an outage there leaves this tab saying so and the rest of /admin working.
//
// The view is in the URL (/admin?tab=usage&user=<uid>&replay=<tab_id>, &report=<recording id> for a report) so a person or a recording
// can be linked to and the browser's Back button walks back through what was opened.

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, PlayCircle, RefreshCw } from 'lucide-react';
import type { AdminUser } from '@/services/device/deviceTypes';
import { analyticsApi } from '@/services/usage/analyticsApi';
import type { UsageOverview as Overview, UsageReport } from '@/services/usage/types';
import { ago } from './format';
import { DAY_OPTIONS, ErrorBox, Segmented, Spinner, friendlyError } from './ui';
import { UsageOverview } from './UsageOverview';
import { UsagePerson } from './UsagePerson';
import { ReplayList, ReplayPlayer } from './UsageReplays';
import { REPLAY_PARAM_SEP, parseReplayParam, type ReplayGroup } from '@/services/usage/replayGroups';

export function UsagePanel({ users }: { users: AdminUser[] }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const uid = params.get('user');
  const replay = params.get('replay');
  // One tab id, or several joined by commas (a grouped visit — see replayGroups.ts).
  const replayIds = parseReplayParam(replay);
  const reportId = params.get('report');
  const view = params.get('view') === 'recordings' ? 'recordings' : 'overview';
  // Every history entry WE push carries state.usageNav. In-app Back goes back in history only from such
  // an entry — its previous entry is then one of ours too, inside /admin. A deep link, or an entry reached
  // with the browser's own Back/Forward, has no marker, so Back just drops the param and never leaves
  // /admin (a counter could not tell: the browser's Back never decremented it — audit 2026-11-02).
  const location = useLocation();

  const setQ = useCallback((patch: Record<string, string | null>, replace = false) => {
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set('tab', 'usage');
      for (const [k, v] of Object.entries(patch)) (v == null ? n.delete(k) : n.set(k, v));
      return n;
      // A replaced entry keeps the marker it had: its predecessor did not change.
    }, { replace, state: replace ? location.state : { usageNav: true } });
  }, [setParams, location.state]);
  const back = (drop: string[]) => {
    if ((location.state as { usageNav?: boolean } | null)?.usageNav) { navigate(-1); return; }
    setParams((prev) => { const n = new URLSearchParams(prev); drop.forEach((k) => n.delete(k)); return n; }, { replace: true });
  };

  // ---- overview ----
  const [days, setDays] = useState(7);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [ovError, setOvError] = useState<string | null>(null);
  const [ovLoading, setOvLoading] = useState(false);
  const loadOverview = useCallback(() => {
    setOvLoading(true);
    analyticsApi.overview(days)
      .then((x) => { setOverview(x); setOvError(null); })
      .catch((e) => setOvError(friendlyError(e)))
      .finally(() => setOvLoading(false));
  }, [days]);
  const needOverview = !uid && !replay && view === 'overview';
  useEffect(() => { if (needOverview) loadOverview(); }, [needOverview, loadOverview]);

  // ---- one account (also gives the player its step timeline) ----
  const [pDays, setPDays] = useState(30);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [rError, setRError] = useState<string | null>(null);
  const [rLoading, setRLoading] = useState(false);
  const loadReport = useCallback(() => {
    if (!uid) return;
    setRLoading(true);
    analyticsApi.user(uid, pDays)
      .then((x) => { setReport(x); setRError(null); })
      .catch((e) => setRError(friendlyError(e)))
      .finally(() => setRLoading(false));
  }, [uid, pDays]);
  useEffect(() => {
    // A different account must never show the previous one's numbers while loading.
    setReport((r) => (r && r.user_id === uid ? r : null));
    setRError(null);
    loadReport();
  }, [uid, loadReport]);

  const emailOf = (id?: string | null) => (id ? users.find((u) => u.id === id)?.email : null) || null;

  if (replayIds.length) {
    return (
      <ReplayPlayer tabIds={replayIds} userId={uid}
        visits={report?.user_id === uid ? report?.visits.filter((v) => replayIds.includes(v.tab_id)) : null}
        tz={report?.tz} email={report?.email || emailOf(uid)}
        onBack={() => back(['replay'])} />
    );
  }

  if (uid) {
    return (
      <UsagePerson uid={uid} email={emailOf(uid)} report={report?.user_id === uid ? report : null}
        error={rError} loading={rLoading} days={pDays} setDays={setPDays} reload={loadReport}
        onBack={() => back(['user', 'report'])} onPlay={(tab) => setQ({ replay: tab })}
        // Switching from one report to another replaces the entry, so Back (or the report's own
        // Back) always lands on the list, not on the report before.
        openReport={reportId} onOpenReport={(rid) => setQ({ report: rid }, !!reportId)} onCloseReport={() => back(['report'])} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {([['overview', 'Overview', <BarChart3 key="i" className="w-4 h-4" />], ['recordings', 'Recordings', <PlayCircle key="i" className="w-4 h-4" />]] as const)
            .map(([id, label, icon]) => (
              <button key={id} onClick={() => setQ({ view: id === 'overview' ? null : id })}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-sm rounded-md ${view === id ? 'bg-violet-100 text-violet-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}>
                {icon}{label}
              </button>
            ))}
        </div>
        {view === 'overview' && (
          <div className="ml-auto flex items-center gap-2">
            <Segmented value={days} onChange={setDays} options={DAY_OPTIONS} />
            <button onClick={loadOverview} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border bg-white hover:bg-gray-50">
              <RefreshCw className={`w-3.5 h-3.5 ${ovLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            {overview && <span className="text-xs text-gray-400 hidden sm:inline">updated {ago(overview.generated_at)}</span>}
          </div>
        )}
      </div>

      {view === 'recordings' && (
        // Opening from the all-accounts list also opens that account, so the player gets its steps.
        <ReplayList onPlay={(g: ReplayGroup) => setQ({ user: g.user_id, replay: g.tab_ids.join(REPLAY_PARAM_SEP) })} />
      )}

      {view === 'overview' && (
        <>
          {ovError && <ErrorBox error={ovError} onRetry={loadOverview} />}
          {!overview && !ovError && <Spinner label="Loading usage…" />}
          {overview && <UsageOverview data={overview} users={users} onOpenUser={(id) => setQ({ user: id })} />}
        </>
      )}
    </div>
  );
}
