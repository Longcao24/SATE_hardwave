// Screen recordings grouped into VISITS for the admin list.
//
// One replay = one page LOAD of one tab (the tracker makes a new tab id per load), so a person who
// reloads, opens a second tab or clicks an emailed link produces several short replays a minute apart.
// The list shows those as one visit and the player plays the parts back to back. Display only: nothing
// about what is recorded or stored changes, and each part is still fetched (and its opening audited)
// on its own.

import type { ReplaySummary } from './types';

/** Parts of one account closer together than this are one visit. */
export const VISIT_GAP_MS = 30 * 60_000;
/** Bound on how many parts one visit plays at once (each is its own fetch). */
export const VISIT_MAX_PARTS = 20;
/** Bound on one visit's recorded time: every part is held in the browser at once while it plays. */
export const VISIT_MAX_SECONDS = 3 * 3600;

export interface ReplayGroup {
  /** Stable key: the newest part's tab id. */
  key: string;
  user_id: string;
  email: string | null;
  /** Oldest first — the order they play in. */
  tab_ids: string[];
  started_at: string;
  last_at: string;
  /** Recorded time, the sum of the parts (gaps between parts are not counted). */
  duration_s: number;
  pages: string[];
  clicks: number;
  errors: number;
}

/**
 * Group a newest-first replay list. A row joins the visit above it when it is the same account and it
 * ENDED before that visit's oldest part started, less than VISIT_GAP_MS before it. Tabs that OVERLAP in
 * time are never joined: each tab numbers its DOM nodes from 1, so two interleaved recordings would
 * apply one tab's changes to the other's screen and play back something that was never on screen.
 * Groups come back newest first, like the input.
 */
export function groupReplays(rows: ReplaySummary[], gapMs = VISIT_GAP_MS, maxParts = VISIT_MAX_PARTS,
  maxSeconds = VISIT_MAX_SECONDS): ReplayGroup[] {
  type G = { parts: ReplaySummary[]; oldestStart: number; seconds: number };
  const out: G[] = [];
  // Newest open visit per account, so another account's rows in between do not split a visit.
  const open = new Map<string, G>();
  for (const r of rows) {
    const start = Date.parse(r.started_at);
    const end = Date.parse(r.last_at);
    const g = open.get(r.user_id);
    const gap = g ? g.oldestStart - end : NaN;
    if (g && Number.isFinite(start) && Number.isFinite(gap) && gap >= 0 && gap < gapMs
        && g.parts.length < maxParts && g.seconds + (r.duration_s || 0) <= maxSeconds) {
      g.parts.push(r);
      g.oldestStart = start;
      g.seconds += r.duration_s || 0;
      continue;
    }
    const ng: G = { parts: [r], oldestStart: Number.isFinite(start) ? start : -Infinity, seconds: r.duration_s || 0 };
    out.push(ng);
    open.set(r.user_id, ng);
  }
  return out.map(({ parts }) => {
    const oldestFirst = [...parts].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
    const pages: string[] = [];
    for (const p of oldestFirst) for (const pg of p.pages) if (!pages.includes(pg)) pages.push(pg);
    return {
      key: parts[0].tab_id,
      user_id: parts[0].user_id,
      email: parts.find((p) => p.email)?.email ?? null,
      tab_ids: oldestFirst.map((p) => p.tab_id),
      started_at: oldestFirst[0].started_at,
      last_at: parts.reduce((m, p) => (p.last_at > m ? p.last_at : m), parts[0].last_at),
      duration_s: parts.reduce((n, p) => n + (p.duration_s || 0), 0),
      pages,
      clicks: parts.reduce((n, p) => n + (p.clicks || 0), 0),
      errors: parts.reduce((n, p) => n + (p.errors || 0), 0),
    };
  });
}

/** The `replay` URL parameter: one tab id, or several joined by commas (a grouped visit). */
export const REPLAY_PARAM_SEP = ',';
export function parseReplayParam(v: string | null): string[] {
  if (!v) return [];
  return [...new Set(v.split(REPLAY_PARAM_SEP).map((s) => s.trim()).filter(Boolean))].slice(0, VISIT_MAX_PARTS);
}
