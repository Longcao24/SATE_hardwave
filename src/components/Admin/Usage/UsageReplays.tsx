// Admin → Usage → Recordings: the screen recordings (rrweb), one per browser-tab visit, and the
// player that plays one back beside that visit's step timeline.
//
// What is recorded is already masked IN THE BROWSER (every input, [data-usage-mask] text, no
// canvas/media) — the player cannot unmask anything, so nothing here needs to hide content.

import { useCallback, useEffect, useRef, useState } from 'react';
import type RRWebPlayer from 'rrweb-player';
import { ArrowLeft, Loader2, Play, RefreshCw } from 'lucide-react';
import { analyticsApi } from '@/services/usage/analyticsApi';
import type { ReplaySummary, UsageVisit } from '@/services/usage/types';
import { fmtOffset, fmtSpan, pageName, zoned } from './format';
import { ErrorBox, KindBadge, Section, Spinner, friendlyError, stepText } from './ui';

export function ReplayList({ uid, tz, onPlay }: {
  /** Narrow to one account; omitted = every account. */
  uid?: string;
  /** The account's zone when listing one account; the viewer's own otherwise (replays carry none). */
  tz?: string | null;
  onPlay: (r: ReplaySummary) => void;
}) {
  const [rows, setRows] = useState<ReplaySummary[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const z = zoned(tz);

  const load = useCallback((before?: string) => {
    setLoading(true);
    analyticsApi.replays({ uid, before })
      .then((r) => {
        setRows((prev) => (before ? [...(prev || []), ...r.replays] : r.replays));
        setNext(r.next_before);
        setError(null);
      })
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [uid]);
  useEffect(() => { setRows(null); load(); }, [load]);

  return (
    <Section title="Screen recordings" hint={`One per browser-tab visit, newest first. Inputs and marked text are masked when recorded. Times in ${z.zoneName}.`}
      right={<button onClick={() => load()} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border bg-white hover:bg-gray-50">
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>}>
      {error && <ErrorBox error={error} onRetry={() => load()} />}
      {!rows && !error && <Spinner />}
      {rows && (
        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2"></th>
                {!uid && <th className="text-left font-semibold px-3 py-2">Account</th>}
                <th className="text-left font-semibold px-3 py-2">Started</th>
                <th className="text-right font-semibold px-3 py-2">Length</th>
                <th className="text-left font-semibold px-3 py-2">Pages</th>
                <th className="text-right font-semibold px-3 py-2">Clicks</th>
                <th className="text-right font-semibold px-3 py-2">Errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-4 text-gray-500">No screen recordings yet.</td></tr>}
              {rows.map((r) => (
                <tr key={r.tab_id} onClick={() => onPlay(r)} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-2 w-8"><Play className="w-4 h-4 text-violet-600" /></td>
                  {!uid && <td className="px-3 py-2 truncate max-w-[220px]">{r.email || '—'}</td>}
                  <td className="px-3 py-2 whitespace-nowrap">{z.dateTime(r.started_at)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtSpan(r.duration_s)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1 max-w-[340px]">
                      {r.pages.slice(0, 5).map((p) => (
                        <span key={p} title={p} className="text-[11px] rounded bg-gray-100 text-gray-600 px-1.5">{pageName(p)}</span>
                      ))}
                      {r.pages.length > 5 && <span className="text-[11px] text-gray-400">+{r.pages.length - 5}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.clicks}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${r.errors ? 'text-red-700' : ''}`}>{r.errors}</td>
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

type RrEvent = { timestamp: number; type: number };

export function ReplayPlayer({ tabId, visit, tz, email, onBack }: {
  tabId: string;
  /** The visit from the account's report, when it is loaded — gives the clickable step timeline. */
  visit?: UsageVisit | null;
  tz?: string | null;
  email?: string | null;
  onBack: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<RRWebPlayer | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [first, setFirst] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const z = zoned(tz);

  useEffect(() => {
    let cancelled = false;
    setState('loading'); setError(null);
    (async () => {
      try {
        // The player (and its stylesheet) is only ever needed here, so it is not in the main bundle.
        const [{ events }, mod] = await Promise.all([
          analyticsApi.replayEvents(tabId),
          import('rrweb-player'),
          import('rrweb-player/dist/style.css'),
        ]);
        if (cancelled) return;
        const evs = (events as RrEvent[]).filter((e) => e && typeof e.timestamp === 'number')
          .sort((a, b) => a.timestamp - b.timestamp);
        // rrweb needs a meta + full snapshot to draw anything; fewer than two events cannot replay.
        if (evs.length < 2 || !host.current) { setState('empty'); return; }
        setFirst(evs[0].timestamp);
        // The host is still display:none here (it is revealed once ready), so measure its card.
        const width = Math.max(320, (host.current.parentElement?.clientWidth || 800) - 24);
        const p = new mod.default({
          target: host.current,
          props: {
            events: evs as never,
            width,
            height: Math.round(width * 0.58),
            autoPlay: true,
            skipInactive: true,
            speedOption: [1, 2, 4, 8, 16],
            showController: true,
          },
        });
        player.current = p;
        p.addEventListener('ui-update-current-time', (d) => {
          const t = (d as { payload?: number })?.payload;
          if (typeof t === 'number') setNow(t);
        });
        setState('ready');
      } catch (e) {
        if (!cancelled) { setError(friendlyError(e)); setState('error'); }
      }
    })();
    return () => {
      cancelled = true;
      // The player owns an iframe and timers; a leftover one keeps replaying into a detached node.
      // $destroy is Svelte's, whose types are not installed here — hence the cast.
      try { player.current?.pause(); (player.current as unknown as { $destroy?: () => void } | null)?.$destroy?.(); } catch { /* already gone */ }
      player.current = null;
      if (host.current) host.current.innerHTML = '';
    };
  }, [tabId, attempt]);

  const steps = visit?.steps || [];
  const seek = (at: string) => {
    if (!player.current || first == null) return;
    player.current.goto(Math.max(0, Date.parse(at) - first), true);
  };
  // The step being shown = the last one at or before the player's clock.
  const currentIdx = first == null ? -1 : steps.reduce((acc, s, i) => (Date.parse(s.at) - first <= now ? i : acc), -1);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-sm text-gray-900 font-medium">Screen recording</div>
        <div className="text-xs text-gray-500">
          {email ? `${email} · ` : ''}{visit ? `${z.dateTime(visit.start)} ${z.zoneName}` : ''}
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4 items-start">
        <div className="rounded-xl border border-gray-200 bg-white p-3 min-w-0">
          {state === 'loading' && <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-500"><Loader2 className="w-5 h-5 animate-spin" />Loading the recording…</div>}
          {state === 'empty' && <div className="py-24 text-center text-sm text-gray-500">Nothing was recorded for this visit (the tab closed before the first snapshot was sent).</div>}
          {state === 'error' && error && <ErrorBox error={error} onRetry={() => setAttempt((n) => n + 1)} />}
          {/* data-usage-block: the player is a same-origin iframe of ANOTHER account's screen; the
              admin's own recorder must never re-record it (it is also paused on /admin). */}
          <div ref={host} data-usage-block className={state === 'ready' ? '' : 'hidden'} />
          {state === 'ready' && <p className="mt-2 text-[11px] text-gray-400">Idle stretches are skipped. Typed text and marked content were masked in the browser before upload.</p>}
        </div>
        <Section title="Steps" hint={visit ? 'Click a step to jump the recording there.' : 'Open this recording from the account to see its steps.'}>
          {steps.length === 0 ? <p className="text-sm text-gray-500">No steps.</p> : (
            <ol className="max-h-[520px] overflow-y-auto -mx-2 text-sm">
              {steps.map((s, i) => {
                const off = first == null ? null : Date.parse(s.at) - first;
                return (
                  <li key={i}>
                    <button onClick={() => seek(s.at)} disabled={state !== 'ready'}
                      className={`w-full text-left px-2 py-1 rounded flex items-start gap-2 ${i === currentIdx ? 'bg-violet-50' : 'hover:bg-gray-50'}`}>
                      <span className="text-[11px] text-gray-400 tabular-nums w-10 shrink-0 pt-0.5">{off == null ? z.time(s.at) : fmtOffset(off)}</span>
                      <KindBadge kind={s.kind} />
                      <span className="min-w-0 break-words">{stepText(s.kind, s.label)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>
      </div>
    </div>
  );
}
