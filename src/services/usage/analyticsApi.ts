// Admin → Usage reads from the analytics Worker, not device-api: analytics lives on Cloudflare
// (D1 + R2) so it can change without touching the clinical backend. Identity is still the Supabase
// session — the Worker checks the token with Supabase and asks device-api /admin/me before
// answering any /v1/admin route.

import { supabase } from '@/lib/supabase';
import type { OnlineNow, ReplayList, UsageEventsPage, UsageOverview, UsageReport } from './types';

// Only the production web host talks to the production Worker. Every other host — a Vercel Preview,
// localhost — gets the sandbox Worker (its own D1 + R2), so trying a build never writes into the
// real analytics. VITE_ANALYTICS_URL overrides both (local Worker: http://localhost:8787).
const PROD_HOSTS = ['sate-hardware.vercel.app', 'app.sate.agency'];
export const ANALYTICS_URL: string =
  (import.meta.env.VITE_ANALYTICS_URL as string | undefined)
  || (typeof window !== 'undefined' && PROD_HOSTS.includes(window.location.hostname)
    ? 'https://sate-analytics.longcao.workers.dev'
    : 'https://sate-analytics-sandbox.longcao.workers.dev');

async function get<T>(path: string, timeoutMs?: number): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  // AbortController + setTimeout, not AbortSignal.timeout() (missing before Safari 16 — see below).
  const ctl = timeoutMs ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const r = await fetch(`${ANALYTICS_URL}${path}`, { headers: { Authorization: `Bearer ${session.access_token}` }, signal: ctl?.signal });
    if (!r.ok) throw new Error(`Analytics HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
    return await (r.json() as Promise<T>);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The Worker's kill switches. Asked once per page load; anything but a clear yes is a no — a tab that
 * cannot reach the Worker must not start recording a clinician's screen on a guess.
 */
export interface AnalyticsConfig { tracking: boolean; replay: boolean; /** Replays show data unmasked (FLAG_REPLAY_TEXT). */ replayText: boolean }
let configP: Promise<AnalyticsConfig> | null = null;
export function loadAnalyticsConfig(): Promise<AnalyticsConfig> {
  // Not AbortSignal.timeout(): it does not exist before Safari 16, and the synchronous TypeError
  // escaped into a React effect and replaced the whole app with the error screen (audit 2026-11-02).
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), 5000);
  configP ||= fetch(`${ANALYTICS_URL}/v1/config`, { signal: ctl.signal })
    .then((r) => (r.ok ? r.json() : null))
    .then((c) => {
      const replay = c?.tracking === true && c?.replay === true;
      return { tracking: c?.tracking === true, replay, replayText: replay && c?.replay_text === true };
    })
    .catch(() => ({ tracking: false, replay: false, replayText: false }));
  return configP;
}

export const analyticsApi = {
  overview: (days: number) => get<UsageOverview>(`/v1/admin/overview?days=${days}`),
  /** Who is using the web app right now (posted events in the last few minutes). */
  online: () => get<OnlineNow>('/v1/admin/online', 10_000),
  user: (uid: string, days: number) => get<UsageReport>(`/v1/admin/users/${encodeURIComponent(uid)}?days=${days}`),
  events: (uid: string, opts: { before?: string; kind?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.before) q.set('before', opts.before);
    if (opts.kind) q.set('kind', opts.kind);
    q.set('limit', String(opts.limit ?? 200));
    return get<UsageEventsPage>(`/v1/admin/users/${encodeURIComponent(uid)}/events?${q}`);
  },
  /** Replays, newest first; `uid` narrows to one account. */
  replays: (opts: { uid?: string; before?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.uid) q.set('user', opts.uid);
    if (opts.before) q.set('before', opts.before);
    q.set('limit', String(opts.limit ?? 50));
    return get<ReplayList>(`/v1/admin/replays?${q}`);
  },
  /**
   * Every rrweb event of one replay, in order (the Worker un-gzips and concatenates the chunks).
   * The Worker answers in pages — a long visit is thousands of chunks, more than one request may
   * read — each saying where the next starts (`next_seq`); this follows them to the end.
   */
  replayEvents: async (tabId: string): Promise<{ tab_id: string; user_id: string | null; events: unknown[] }> => {
    const events: unknown[] = [];
    let owner: string | null = null;
    let from: number | null = 0;
    for (let page = 0; from != null && page < 200; page++) {
      const p: { events: unknown[]; next_seq?: number | null } =
        await get(`/v1/admin/replays/${encodeURIComponent(tabId)}/events?from_seq=${from}`);
      // A loop, not push(...p.events): a page can hold more events than the call stack has arguments.
      if (page === 0) { const u = (p as unknown as { user_id?: unknown }).user_id; owner = typeof u === 'string' ? u : null; }
      for (const e of p.events) events.push(e);
      from = typeof p.next_seq === 'number' && p.next_seq > from ? p.next_seq : null;
    }
    return { tab_id: tabId, user_id: owner, events };
  },
};
