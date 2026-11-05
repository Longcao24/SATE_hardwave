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
import { groupReplays, type ReplayGroup } from '@/services/usage/replayGroups';
import { fmtOffset, fmtSpan, pageName, zoned } from './format';
import { ErrorBox, KindBadge, Section, Spinner, friendlyError, stepText } from './ui';

export function ReplayList({ uid, tz, onPlay }: {
  /** Narrow to one account; omitted = every account. */
  uid?: string;
  /** The account's zone when listing one account; the viewer's own otherwise (replays carry none). */
  tz?: string | null;
  onPlay: (g: ReplayGroup) => void;
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
  // Reloads, extra tabs and emailed links make several replays a minute apart: shown (and played) as one visit.
  const groups = rows ? groupReplays(rows) : null;

  return (
    <Section title="Screen recordings" hint={`One per visit, newest first: page loads of the same account less than 30 min apart play as one. Times in ${z.zoneName}.`}
      right={<button onClick={() => load()} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border bg-white hover:bg-gray-50">
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>}>
      {error && <ErrorBox error={error} onRetry={() => load()} />}
      {!rows && !error && <Spinner />}
      {groups && (
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
              {groups.length === 0 && <tr><td colSpan={7} className="px-4 py-4 text-gray-500">No screen recordings yet.</td></tr>}
              {groups.map((r) => (
                <tr key={r.key} onClick={() => onPlay(r)} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-2 w-8"><Play className="w-4 h-4 text-violet-600" /></td>
                  {!uid && <td className="px-3 py-2 truncate max-w-[220px]">{r.email || '—'}</td>}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {z.dateTime(r.started_at)}
                    {r.tab_ids.length > 1 && (
                      <span title="Page loads (reloads, tabs, links) less than 30 min apart, played back to back"
                        className="ml-2 text-[11px] rounded bg-violet-50 text-violet-700 px-1.5">{r.tab_ids.length} parts</span>
                    )}
                  </td>
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

export function ReplayPlayer({ tabIds, userId, visits, tz, email, onBack }: {
  /** One replay, or the parts of one grouped visit (oldest first): fetched one by one and played back to back. */
  tabIds: string[];
  /** The account being shown. A part recorded by any other account is refused (a hand-made URL could mix them). */
  userId?: string | null;
  /** The parts' visits from the account's report, when it is loaded — give the clickable step timeline. */
  visits?: UsageVisit[] | null;
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
  /** Parts that could not be played: failed to load, belong to another account, or have no full snapshot. */
  const [missing, setMissing] = useState(0);
  const z = zoned(tz);

  useEffect(() => {
    let cancelled = false;
    setState('loading'); setError(null); setMissing(0);
    (async () => {
      try {
        // The player (and its stylesheet) is only ever needed here, so it is not in the main bundle.
        // Parts one after another (each is its own paged fetch and its own audited opening). A part
        // that fails is skipped rather than losing the whole visit — unless every part fails — and the
        // skipped ones are counted on screen. A part is also skipped when it is another account's, or
        // has no full snapshot (rrweb type 2): its changes would land on the previous part's screen.
        const loadParts = async () => {
          const all: RrEvent[] = [];
          let failed: unknown = null, ok = 0, skipped = 0;
          for (const id of tabIds) {
            if (cancelled) break;
            try {
              const r = await analyticsApi.replayEvents(id);
              ok++;
              const sorted = (r.events as RrEvent[]).filter((e) => e && typeof e.timestamp === 'number')
                .sort((a, b) => a.timestamp - b.timestamp);
              // Nothing before the part's first meta/snapshot can be drawn (e.g. its first chunk was lost):
              // left in, those changes would land on the previous part's screen.
              const startAt = sorted.findIndex((e) => e.type === 4 || e.type === 2);
              const part = startAt < 0 ? [] : sorted.slice(startAt);
              if ((userId && r.user_id && r.user_id !== userId) || !part.some((e) => e.type === 2)) { skipped++; continue; }
              // rrweb-player sorts ALL events by timestamp, and grouping decided on SERVER times while these are
              // CLIENT times (another device's clock, two visible windows). A part that would start before the
              // previous one ended is moved to just after it, so two tabs' events can never interleave.
              const prevMax = all.length ? all[all.length - 1].timestamp : -Infinity;
              const delta = part[0].timestamp <= prevMax ? prevMax + 1 - part[0].timestamp : 0;
              for (const e of part) all.push(delta ? { ...e, timestamp: e.timestamp + delta } : e);
            } catch (e) { failed = e; skipped++; }
          }
          if (!ok && failed) throw failed;
          return { all, skipped };
        };
        const [{ all: evs, skipped }, mod] = await Promise.all([
          loadParts(),
          import('rrweb-player'),
          import('rrweb-player/dist/style.css'),
        ]);
        if (cancelled) return;
        setMissing(skipped);
        // Every part starts with its own meta + full snapshot, so the concatenation replays part by part;
        // the gaps between parts are idle time, which skipInactive jumps over.
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
  }, [tabIds.join(','), userId, attempt]);   // eslint-disable-line react-hooks/exhaustive-deps

  const steps = (visits || []).flatMap((v) => v.steps).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const visitStart = (visits || []).reduce<string | null>((m, v) => (!m || v.start < m ? v.start : m), null);
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
          {email ? `${email} · ` : ''}{visitStart ? `${z.dateTime(visitStart)} ${z.zoneName}` : ''}
          {tabIds.length > 1 ? ` · ${tabIds.length} parts played back to back` : ''}
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
          {state === 'ready' && <p className="mt-2 text-[11px] text-gray-400">Idle stretches and the gaps between parts are skipped. Passwords and blocked areas were masked in the browser before upload.</p>}
          {state !== 'loading' && missing > 0 && (
            <p className="mt-1 text-[11px] text-amber-700">
              {missing} of {tabIds.length} part{tabIds.length === 1 ? '' : 's'} could not be played (failed to load, or the tab closed before its first snapshot was sent).
              {' '}<button onClick={() => setAttempt((n) => n + 1)} className="underline">Retry</button>
            </p>
          )}
        </div>
        <Section title="Steps" hint={visits?.length ? 'Click a step to jump the recording there.' : 'Open this recording from the account to see its steps.'}>
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
