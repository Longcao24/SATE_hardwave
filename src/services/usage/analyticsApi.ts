// Admin → Usage reads from the analytics Worker, not device-api: analytics lives on Cloudflare
// (D1 + R2) so it can change without touching the clinical backend. Identity is still the Supabase
// session — the Worker checks the token with Supabase and asks device-api /admin/me before
// answering any /v1/admin route.

import { supabase } from '@/lib/supabase';
import type { ReplayList, UsageEventsPage, UsageOverview, UsageReport } from './types';

// Only the production web host talks to the production Worker. Every other host — a Vercel Preview,
// localhost — gets the sandbox Worker (its own D1 + R2), so trying a build never writes into the
// real analytics. VITE_ANALYTICS_URL overrides both (local Worker: http://localhost:8787).
const PROD_HOSTS = ['sate-hardware.vercel.app', 'app.sate.agency'];
export const ANALYTICS_URL: string =
  (import.meta.env.VITE_ANALYTICS_URL as string | undefined)
  || (typeof window !== 'undefined' && PROD_HOSTS.includes(window.location.hostname)
    ? 'https://sate-analytics.longcao.workers.dev'
    : 'https://sate-analytics-sandbox.longcao.workers.dev');

async function get<T>(path: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  const r = await fetch(`${ANALYTICS_URL}${path}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  if (!r.ok) throw new Error(`Analytics HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

/**
 * The Worker's kill switches. Asked once per page load; anything but a clear yes is a no — a tab that
 * cannot reach the Worker must not start recording a clinician's screen on a guess.
 */
let configP: Promise<{ tracking: boolean; replay: boolean }> | null = null;
export function loadAnalyticsConfig(): Promise<{ tracking: boolean; replay: boolean }> {
  configP ||= fetch(`${ANALYTICS_URL}/v1/config`, { signal: AbortSignal.timeout(5000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((c) => ({ tracking: c?.tracking === true, replay: c?.tracking === true && c?.replay === true }))
    .catch(() => ({ tracking: false, replay: false }));
  return configP;
}

export const analyticsApi = {
  overview: (days: number) => get<UsageOverview>(`/v1/admin/overview?days=${days}`),
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
  replayEvents: async (tabId: string): Promise<{ tab_id: string; events: unknown[] }> => {
    const events: unknown[] = [];
    let from: number | null = 0;
    for (let page = 0; from != null && page < 200; page++) {
      const p: { events: unknown[]; next_seq?: number | null } =
        await get(`/v1/admin/replays/${encodeURIComponent(tabId)}/events?from_seq=${from}`);
      // A loop, not push(...p.events): a page can hold more events than the call stack has arguments.
      for (const e of p.events) events.push(e);
      from = typeof p.next_seq === 'number' && p.next_seq > from ? p.next_seq : null;
    }
    return { tab_id: tabId, events };
  },
};
