// Admin → Usage: how every account uses the web app (the in-house "PostHog").
//
// Reads the analytics Worker (Cloudflare D1 + R2), never device-api — analytics is a separate
// service on purpose, so an outage there leaves this tab saying so and the rest of /admin working.
//
// The view is in the URL (/admin?tab=usage&user=<uid>&replay=<tab_id>) so a person or a recording
// can be linked to and the browser's Back button walks back through what was opened.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, PlayCircle, RefreshCw } from 'lucide-react';
import type { AdminUser } from '@/services/device/deviceTypes';
import { analyticsApi } from '@/services/usage/analyticsApi';
import type { ReplaySummary, UsageOverview as Overview, UsageReport } from '@/services/usage/types';
import { ago } from './format';
import { DAY_OPTIONS, ErrorBox, Segmented, Spinner, friendlyError } from './ui';
import { UsageOverview } from './UsageOverview';
import { UsagePerson } from './UsagePerson';
import { ReplayList, ReplayPlayer } from './UsageReplays';

export function UsagePanel({ users }: { users: AdminUser[] }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const uid = params.get('user');
  const replay = params.get('replay');
  const view = params.get('view') === 'recordings' ? 'recordings' : 'overview';
  // How many history entries WE pushed: while any, Back = browser back; a deep-linked page has
  // nothing of ours to go back to, so Back just drops the last param instead of leaving /admin.
  const pushed = useRef(0);

  const setQ = useCallback((patch: Record<string, string | null>) => {
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set('tab', 'usage');
      for (const [k, v] of Object.entries(patch)) (v == null ? n.delete(k) : n.set(k, v));
      return n;
    });
    pushed.current += 1;
  }, [setParams]);
  const back = (drop: string[]) => {
    if (pushed.current > 0) { pushed.current -= 1; navigate(-1); return; }
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

  if (replay) {
    return (
      <ReplayPlayer tabId={replay}
        visit={report?.user_id === uid ? report?.visits.find((v) => v.tab_id === replay) : null}
        tz={report?.tz} email={report?.email || emailOf(uid)}
        onBack={() => back(['replay'])} />
    );
  }

  if (uid) {
    return (
      <UsagePerson uid={uid} email={emailOf(uid)} report={report?.user_id === uid ? report : null}
        error={rError} loading={rLoading} days={pDays} setDays={setPDays} reload={loadReport}
        onBack={() => back(['user'])} onPlay={(tab) => setQ({ replay: tab })} />
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
        <ReplayList onPlay={(r: ReplaySummary) => setQ({ user: r.user_id, replay: r.tab_id })} />
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
