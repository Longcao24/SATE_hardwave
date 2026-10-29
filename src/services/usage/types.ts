// The SATE analytics contract — the in-house "PostHog" (Cloudflare Worker `sate-analytics`, D1 + R2,
// source in /analytics). The browser writes events and screen-recording chunks; Admin → Usage reads the
// aggregates below. Shared by the tracker, the admin panel and (mirrored) the Worker.
//
// Dates are LOCAL days: the overview in the operator's zone (America/New_York), one account's report
// in that account's own zone (reported by its browser on each visit).

export type UsageKind = 'view' | 'active' | 'click' | 'action' | 'error';

/** One event as the browser sends it (POST /v1/events, body {events: UsageEventIn[]}). */
export interface UsageEventIn {
  tab_id: string;
  kind: UsageKind;
  page: string;                       // route PATTERN, e.g. /report/:id — never an id
  label?: string | null;              // click: UI label; action: 'upload:start'…; error: message
  props?: Record<string, unknown> | null;   // view: {tz, w, h}; click: {tag}
  at: string;                         // client ISO time
}

export interface UsageEvent extends Omit<UsageEventIn, 'label' | 'props'> {
  id: number; label: string | null; props: Record<string, unknown> | null;
}

export interface UsageAccountRow {
  user_id: string; email: string | null;
  active_min: number; active_days: number; visits: number; events: number;
  first_seen: string | null; last_seen: string | null;
  uploads: number; failed: number; errors: number; replays: number;
}

export interface UsageOverview {
  generated_at: string; days: number; tz: string;
  /** One row per local day in the window, oldest first. */
  series: { date: string; dau: number; active_min: number; visits: number; events: number; uploads: number; errors: number }[];
  /** Every account that has ever been seen (the admin page merges in never-seen accounts from device-api /admin/users). */
  accounts: UsageAccountRow[];
  pages: { page: string; min: number; views: number; users: number }[];
  /** Top clicks/actions/errors across all accounts. */
  events: { kind: UsageKind; label: string; n: number; users: number }[];
}

export interface UsageDay {
  date: string; active_min: number; visits: number; first: string | null; last: string | null;
  hours: number[];                    // 24 active-minute buckets, local hours
  uploads: number; done: number; failed: number; no_text: number;   // from upload:* actions
  saves: number; reports: number; errors: number; clicks: number;
}

export interface UsageVisit {
  tab_id: string; start: string; end: string; active_min: number; pages: number; clicks: number; errors: number;
  has_replay: boolean;
  steps: { at: string; kind: UsageKind; label: string }[];
}

export interface UsageReport {
  user_id: string; email: string | null; tz: string; generated_at: string;
  first_seen: string | null; last_seen: string | null;
  device: { w: number; h: number } | null;
  days: UsageDay[];
  totals: { active_min: number; visits: number; active_days: number; uploads: number; failed: number;
    no_text: number; saves: number; reports: number; errors: number; clicks: number; replays: number };
  pages: { page: string; min: number; views: number }[];
  /** clicks + actions + errors, with their kind. */
  actions: { kind: UsageKind; label: string; n: number }[];
  visits: UsageVisit[];
}

export interface UsageEventsPage { events: UsageEvent[]; next_before: string | null }

// ---- Screen recording (rrweb) ----
// The browser records the DOM with rrweb (inputs and [data-usage-mask] text masked) and POSTs gzipped
// chunks to /v1/replay/:tab_id/:seq. One replay = one browser tab's visit.
export interface ReplaySummary {
  tab_id: string; user_id: string; email: string | null;
  started_at: string; last_at: string; duration_s: number;
  chunks: number; bytes: number; pages: string[]; clicks: number; errors: number;
}
export interface ReplayList { replays: ReplaySummary[]; next_before: string | null }
