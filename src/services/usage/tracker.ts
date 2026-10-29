// The browser half of SATE's in-house usage analytics (Worker `sate-analytics`, see ./types.ts).
//
// Records what a signed-in account does in the web app — page views, active minutes, clicks,
// explicit actions, errors — and a screen recording (rrweb) of each tab's visit, and ships both
// to the analytics Worker. Three rules shape everything below:
//   - It must never hurt the app. Nothing here throws, awaits on the UI path, or retries hot:
//     failures back off, the buffer is capped, and rrweb is loaded lazily, off the critical path.
//   - It must never carry patient data. Labels and errors go through ./usageLabels (masked or
//     scrubbed); the recording masks every input and all text under [data-usage-mask], blocks
//     [data-usage-block] and media, and strips descriptive attributes rrweb would keep verbatim.
//   - One tracker per tab. State is module-level and start is idempotent per account, because
//     React StrictMode mounts effects twice — a component-owned tracker would double every
//     listener, timer and recorder in development and mint a second tab id.

import { supabase } from '@/lib/supabase';
import { ANALYTICS_URL, loadAnalyticsConfig } from './analyticsApi';
import type { UsageEventIn, UsageKind } from './types';
import {
  UNTRACKED_PAGES, collapse, recordable, resolveClick, routePattern, scrubMessage, scrubReplayEvent,
  splitBodies, utf8Bytes, type ClickNode,
} from './usageLabels';

const TICK_MS = 5_000;
const FLUSH_MS = 10_000;
const FLUSH_AT = 50;
const BUFFER_CAP = 500;
/** = the Worker's LIMITS.eventsPerPost. A bigger post is refused whole with a 413. */
const EVENTS_PER_POST = 200;
/**
 * Browsers cap the bodies of ALL keepalive requests in flight at 64 KB together, and reject the
 * rest. Every body is cut to fit this, and a hide() spends at most this much across everything
 * it sends with keepalive — events first, then the recording's tail.
 */
const KEEPALIVE_MAX = 60 * 1024;
const ACTIVE_WINDOW_MS = 60_000;
const MAX_ERRORS_PER_TAB = 25;
const BACKOFF_MAX_MS = 5 * 60_000;
const REPLAY_FLUSH_MS = 10_000;
const REPLAY_FLUSH_BYTES = 400 * 1024;
/** Gzipped chunks waiting to be resent; past this the oldest goes (the next snapshot heals the gap). */
const REPLAY_QUEUE_CAP = 8;
/**
 * No input for this long and the recorder STOPS (and restarts, with a fresh snapshot, on the next
 * input). Pages here re-render on timers — status polls, spinners, relative times — so a tab left
 * open overnight would otherwise cut a chunk every 10 s forever: hours of polling mutations that
 * show nobody doing anything, and an R2 write + D1 batch for each.
 */
const REPLAY_IDLE_MS = 2 * 60_000;
/**
 * A full snapshot this often while recording, so playback can start mid-visit. Long, because on a
 * big transcript page one snapshot is MBs; a stop/start (idle, hidden, page) takes one anyway.
 */
const CHECKOUT_MS = 20 * 60_000;

type RecordFn = typeof import('rrweb')['record'];

interface Chunk { seq: number; body: ArrayBuffer; page: string }

interface Replay {
  /** rrweb's record(), once its chunk has loaded. */
  record: RecordFn | null;
  /** The running recorder's stop; null while not recording (idle, hidden, unrecorded page). */
  stop: (() => void) | null;
  strs: string[];
  bytes: number;
  seq: number;
  lastFlush: number;
  queue: Chunk[];
  sending: boolean;
  failures: number;
  retryAt: number;
  dead: boolean;
  /** One error event per tab for a refused oversized chunk, not one per chunk. */
  warnedTooLarge: boolean;
}

interface State {
  uid: string;
  /**
   * THIS account's access token. Per state, never a global: a send still pending when account A
   * signs out and B signs in must go out as A (or fail), never with B's token — which would hand
   * A's visit to B (or be refused forever as another account's tab).
   */
  token: string | null;
  tabId: string;
  page: string | null;
  firstView: boolean;
  buf: UsageEventIn[];
  errorsSeen: Set<string>;
  lastInput: number;
  lastActiveMinute: number;
  lastFlush: number;
  flushing: boolean;
  failures: number;
  retryAt: number;
  timer: ReturnType<typeof setInterval> | null;
  teardown: (() => void)[];
  replay: Replay | null;
}

let st: State | null = null;
let authWatched = false;

function watchAuth() {
  if (authWatched) return;
  authWatched = true;
  try {
    // A refreshed token updates the state it belongs to — and only that one.
    supabase.auth.onAuthStateChange((_event, session) => {
      const s = st;
      if (s && session && session.user?.id === s.uid) s.token = session.access_token;
    });
  } catch { /* no auth, no tracking — never an app error */ }
}

/** A fresh token for `s` when we can wait for one (getSession refreshes an expired one). */
async function freshToken(s: State): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session && data.session.user?.id === s.uid) s.token = data.session.access_token;
  } catch { /* fall back to the cached one */ }
  return s.token;
}

function newTabId(): string {
  try { return crypto.randomUUID(); } catch {
    return Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10)).join('-');
  }
}

const backoff = (failures: number) => Math.min(BACKOFF_MAX_MS, 10_000 * 2 ** failures);
/**
 * A 4xx other than auth/rate/timeout means this body will never be accepted: drop it, don't retry.
 * 403 is among them — it means "this tab belongs to another account", which no retry changes.
 */
const permanent = (status: number) => status >= 400 && status < 500 && ![401, 408, 429].includes(status);

const currentPage = (s: State) => s.page ?? routePattern(window.location.pathname);
const untracked = (s: State) => UNTRACKED_PAGES.has(currentPage(s));

function push(kind: UsageKind, label: string | null, props: Record<string, unknown> | null = null) {
  const s = st;
  if (!s || untracked(s)) return;
  s.buf.push({ tab_id: s.tabId, kind, page: currentPage(s), label, props, at: new Date().toISOString() });
  if (s.buf.length > BUFFER_CAP) s.buf.splice(0, s.buf.length - BUFFER_CAP);
  if (s.buf.length >= FLUSH_AT) void flush(s);
}

/**
 * Bodies the Worker accepts AND a keepalive can carry: at most EVENTS_PER_POST events and
 * KEEPALIVE_MAX bytes each (see splitBodies for why both limits).
 */
const bodies = (events: UsageEventIn[]) => splitBodies(events, KEEPALIVE_MAX, EVENTS_PER_POST);

function requeue(s: State, events: UsageEventIn[]) {
  s.buf.unshift(...events);
  if (s.buf.length > BUFFER_CAP) s.buf.splice(0, s.buf.length - BUFFER_CAP);
}

/** What one page-hide may still spend on keepalive bodies (shared by events and the recording). */
interface Budget { left: number }

/**
 * The page-is-going-away path: synchronous up to the fetch, the cached token, fire-and-forget.
 * Bodies that do not fit the budget stay in the buffer for the normal path — they arrive if the
 * tab was only hidden. A rejected or retryable send is put back the same way.
 */
function flushKeepalive(s: State, budget: Budget) {
  const tk = s.token;
  if (!s.buf.length || !tk) return;
  const keep: UsageEventIn[] = [];
  for (const b of bodies(s.buf.splice(0, s.buf.length))) {
    const n = utf8Bytes(b.body);
    if (n > budget.left) { keep.push(...b.events); continue; }
    budget.left -= n;
    try {
      fetch(`${ANALYTICS_URL}/v1/events`, {
        method: 'POST', keepalive: true, body: b.body,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
      }).then((res) => { if (!res.ok && !permanent(res.status)) requeue(s, b.events); },
        () => requeue(s, b.events));
    } catch { keep.push(...b.events); }
  }
  if (keep.length) requeue(s, keep);
}

/** Send the buffer. Backs off on failure and keeps the events, in order. */
async function flush(s: State | null = st) {
  if (!s || !s.buf.length) return;
  if (s.flushing || Date.now() < s.retryAt) return;
  s.flushing = true;
  try {
    const tk = await freshToken(s);
    if (!tk) return;
    const batch = s.buf.splice(0, s.buf.length);
    const parts = bodies(batch);
    for (let i = 0; i < parts.length; i++) {
      let res: Response | null = null;
      try {
        res = await fetch(`${ANALYTICS_URL}/v1/events`, {
          method: 'POST', body: parts[i].body,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        });
      } catch { res = null; }
      if (res && (res.ok || permanent(res.status))) { s.failures = 0; continue; }
      // Keep this part and everything after it, in order, and wait before trying again.
      requeue(s, parts.slice(i).flatMap((p) => p.events));
      s.failures++;
      s.retryAt = Date.now() + backoff(s.failures);
      break;
    }
  } finally {
    s.flushing = false;
    s.lastFlush = Date.now();
  }
}

// ---- Screen recording ----------------------------------------------------------------------

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

function postChunk(s: State, c: Chunk, tk: string, keepalive: boolean) {
  return fetch(`${ANALYTICS_URL}/v1/replay/${encodeURIComponent(s.tabId)}/${c.seq}`, {
    method: 'POST', keepalive, body: c.body,
    headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${tk}`, 'X-Page': c.page },
  });
}

function enqueue(s: State, r: Replay, c: Chunk) {
  r.queue.push(c);
  r.queue.sort((a, b) => a.seq - b.seq);
  if (r.queue.length > REPLAY_QUEUE_CAP) r.queue.splice(0, r.queue.length - REPLAY_QUEUE_CAP);
  void drain(s, r);
}

/**
 * React to a chunk the Worker answered: true = done with it (stored, or never storable).
 * A 413 is a single rrweb event bigger than the Worker's chunk cap — a full snapshot of a huge
 * page — and is said ONCE as an error event, so it shows up in Admin → Usage instead of the
 * recording silently failing to play. A 403 means the tab is another account's: stop recording.
 */
function settled(r: Replay, c: Chunk, status: number): boolean {
  if (status === 413 && !r.warnedTooLarge) {
    r.warnedTooLarge = true;
    trackError(`screen recording chunk refused as too large (${Math.round(c.body.byteLength / 1024)} KB gzipped)`);
  }
  if (status === 403) { r.dead = true; stopRecorder(r); r.queue = []; }
  return status < 300 || permanent(status);
}

/** Send queued chunks in order; stop at the first failure and back off. */
async function drain(s: State, r: Replay) {
  if (r.sending || !r.queue.length || Date.now() < r.retryAt) return;
  r.sending = true;
  try {
    const tk = await freshToken(s);
    if (!tk) return;
    while (r.queue.length) {
      const c = r.queue[0];
      let res: Response | null = null;
      try { res = await postChunk(s, c, tk, false); } catch { res = null; }
      if (res && settled(r, c, res.status)) { if (r.queue[0] === c) r.queue.shift(); r.failures = 0; continue; }
      r.failures++;
      r.retryAt = Date.now() + backoff(r.failures);
      break;
    }
  } finally { r.sending = false; }
}

/**
 * Cut the buffered rrweb events into one gzipped chunk. With a `budget` (the page is hiding) a
 * chunk that still fits what the events left of the keepalive budget goes out with keepalive and
 * survives the tab closing; anything else — or a keepalive the browser rejects — is queued and
 * sent normally, so a tab that was only hidden still delivers it.
 */
async function replayFlush(s: State, r: Replay, budget?: Budget) {
  r.lastFlush = Date.now();
  if (!r.strs.length) { if (!budget) void drain(s, r); return; }
  const json = `[${r.strs.join(',')}]`;
  r.strs = []; r.bytes = 0;
  const chunk: Chunk = { seq: r.seq++, body: new ArrayBuffer(0), page: currentPage(s) };
  try { chunk.body = await gzip(json); } catch { return; }   // no CompressionStream: nothing we can send
  const tk = s.token;
  if (budget && tk && chunk.body.byteLength <= budget.left) {
    budget.left -= chunk.body.byteLength;
    try {
      postChunk(s, chunk, tk, true).then(
        (res) => { if (!settled(r, chunk, res.status)) enqueue(s, r, chunk); },
        () => enqueue(s, r, chunk));
      return;
    } catch { /* fall through to the normal path */ }
  }
  enqueue(s, r, chunk);
}

function stopRecorder(r: Replay) {
  const stop = r.stop;
  r.stop = null;
  try { stop?.(); } catch { /* ignore */ }
}

function startRecorder(s: State, r: Replay) {
  const record = r.record;
  if (!record || r.stop || r.dead) return;
  // Is the live node behind a serialized id inside a masked container? Unknown counts as yes.
  const isMaskedId = (id: number) => {
    try {
      const n = record.mirror.getNode(id) as Node | null;
      const el = n && (n.nodeType === 1 ? (n as Element) : n.parentElement);
      return el ? !!el.closest('[data-usage-mask]') : true;
    } catch { return true; }
  };
  try {
    // record() starts with a Meta + full snapshot, so every (re)start is playable on its own.
    r.stop = record({
      emit(e) {
        if (r.dead) return;
        try {
          scrubReplayEvent(e as unknown as Parameters<typeof scrubReplayEvent>[0], isMaskedId);
          const str = JSON.stringify(e);
          r.strs.push(str);
          r.bytes += str.length;
          if (r.bytes >= REPLAY_FLUSH_BYTES) void replayFlush(s, r);
        } catch { /* one unserializable event is not worth breaking the app over */ }
      },
      maskAllInputs: true,
      maskTextSelector: '[data-usage-mask], [data-usage-mask] *',
      // Media is blocked outright as well as by attribute: a recording's audio is clinical data.
      blockSelector: '[data-usage-block], audio, video',
      recordCanvas: false,
      collectFonts: false,
      inlineImages: false,
      sampling: { mousemove: 50, scroll: 150, input: 'last' },
      checkoutEveryNms: CHECKOUT_MS,
    }) ?? null;
  } catch { r.stop = null; }
}

/** Should this tab be recording right now? Visible, someone at it, and a recordable page. */
function wantRecording(s: State): boolean {
  return document.visibilityState === 'visible'
    && Date.now() - s.lastInput < REPLAY_IDLE_MS
    && recordable(currentPage(s));
}

/**
 * Start or stop the recorder to match wantRecording(). Stopping cuts what was recorded into a
 * chunk; the gap until the next start shows in the player as skipped inactivity.
 */
function syncRecorder(s: State) {
  const r = s.replay;
  if (!r || r.dead || !r.record || st !== s) return;
  const want = wantRecording(s);
  if (want && !r.stop) startRecorder(s, r);
  else if (!want && r.stop) { stopRecorder(r); void replayFlush(s, r); }
}

function startReplay(s: State) {
  if (typeof CompressionStream === 'undefined') return;   // chunks must be gzip; an old browser just has no replay
  const r: Replay = {
    record: null, stop: null, strs: [], bytes: 0, seq: 0, lastFlush: Date.now(), queue: [],
    sending: false, failures: 0, retryAt: 0, dead: false, warnedTooLarge: false,
  };
  s.replay = r;
  // Dynamic import: rrweb is ~200 KB and nothing the user sees waits for it.
  import('rrweb').then(({ record }) => {
    if (r.dead || st !== s) return;
    r.record = record;
    syncRecorder(s);
  }).catch(() => { /* chunk failed to load: no replay this visit */ });
}

// ---- Lifecycle -------------------------------------------------------------------------------

function listen(s: State, target: EventTarget, type: string, fn: (e: Event) => void, capture = false) {
  const opts: AddEventListenerOptions = { capture, passive: true };
  target.addEventListener(type, fn, opts);
  s.teardown.push(() => target.removeEventListener(type, fn, opts));
}

function onError(s: State, raw: unknown) {
  const msg = scrubMessage(raw);
  if (!msg || /ResizeObserver loop|^Script error\.?$/i.test(msg)) return;
  if (s.errorsSeen.has(msg) || s.errorsSeen.size >= MAX_ERRORS_PER_TAB) return;
  s.errorsSeen.add(msg);
  push('error', msg);
}

function tick(s: State) {
  const now = Date.now();
  if (document.visibilityState === 'visible' && now - s.lastInput < ACTIVE_WINDOW_MS) {
    const minute = Math.floor(now / 60_000);
    if (minute !== s.lastActiveMinute) { s.lastActiveMinute = minute; push('active', null); }
  }
  if (now - s.lastFlush >= FLUSH_MS) void flush(s);
  const r = s.replay;
  if (r && !r.dead) {
    syncRecorder(s);   // the idle stop
    if (now - r.lastFlush >= REPLAY_FLUSH_MS) void replayFlush(s, r);
  }
}

/** The tab is hiding (or closing): stop recording, then spend the keepalive budget, events first. */
function hide(s: State) {
  const r = s.replay;
  if (r?.stop) stopRecorder(r);
  const budget: Budget = { left: KEEPALIVE_MAX };
  flushKeepalive(s, budget);
  if (r && !r.dead) void replayFlush(s, r, budget);
}

/**
 * Start tracking this tab for `uid` — once the Worker's kill switches (/v1/config) say so. Idempotent
 * for the same account; a new account = a new tab id.
 */
let wanted: string | null = null;
export function startUsage(uid: string) {
  if (st?.uid === uid || wanted === uid) return;
  wanted = uid;
  void loadAnalyticsConfig().then((cfg) => {
    // Signed out (or switched account) while the config was loading: start nothing for this one.
    if (wanted !== uid || !cfg.tracking) return;
    startNow(uid, cfg.replay);
  });
}

function startNow(uid: string, replay: boolean) {
  try {
    if (st?.uid === uid) return;
    if (st) stopUsage();
    watchAuth();
    const s: State = {
      uid, token: null, tabId: newTabId(), page: null, firstView: true, buf: [], errorsSeen: new Set(),
      // Arriving counts as input: opening the app is something the user did.
      lastInput: Date.now(), lastActiveMinute: -1, lastFlush: Date.now(), flushing: false,
      failures: 0, retryAt: 0, timer: null, teardown: [], replay: null,
    };
    st = s;
    void freshToken(s);
    const touch = () => {
      s.lastInput = Date.now();
      // Cheap on the hot path (mousemove): only a STOPPED recorder asks whether to start again.
      const r = s.replay;
      if (r && !r.stop && r.record && !r.dead) syncRecorder(s);
    };
    for (const t of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove', 'scroll']) listen(s, document, t, touch, true);
    listen(s, document, 'click', (e) => {
      const t = e.target as Node | null;
      const el = t && (t.nodeType === 1 ? t : t.parentElement);
      const hit = resolveClick(el as unknown as ClickNode | null);
      if (hit) push('click', hit.label, { tag: hit.tag });
    }, true);
    listen(s, window, 'error', (e) => {
      const ev = e as ErrorEvent;
      onError(s, ev.error instanceof Error ? ev.error.message : ev.message);
    });
    listen(s, window, 'unhandledrejection', (e) => {
      const reason = (e as PromiseRejectionEvent).reason;
      onError(s, reason instanceof Error ? reason.message : reason);
    });
    listen(s, document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') hide(s); });
    listen(s, window, 'pagehide', () => hide(s));
    s.timer = setInterval(() => { try { tick(s); } catch { /* never surface */ } }, TICK_MS);
    if (replay) startReplay(s);
  } catch { /* tracking is optional */ }
}

/**
 * Send everything buffered NOW, while the session's token is still valid — call it BEFORE
 * supabase.auth.signOut(). Sign-out deletes the session server-side before SIGNED_OUT fires, so a
 * flush that waits for that event goes out with a dead token and the Worker refuses it: the last
 * seconds of every visit, and the recording's tail, were lost. Bounded by `timeoutMs`, never
 * throws — a sign-out must not wait on analytics.
 */
export async function flushUsage(timeoutMs = 1500): Promise<void> {
  const s = st;
  if (!s) return;
  try {
    const work = (async () => {
      const r = s.replay;
      if (r?.stop) stopRecorder(r);
      s.retryAt = 0;
      await flush(s);
      if (r && !r.dead) { r.retryAt = 0; await replayFlush(s, r); await drain(s, r); }
    })();
    await Promise.race([work.catch(() => {}), new Promise((res) => setTimeout(res, timeoutMs))]);
  } catch { /* ignore */ }
}

/** Stop tracking (sign-out): send what is left, end the recording, drop every listener. */
export function stopUsage() {
  wanted = null;
  const s = st;
  if (!s) return;
  st = null;
  try {
    if (s.timer) clearInterval(s.timer);
    for (const off of s.teardown) off();
    // st is already null, so push() is off; send the leftovers against this state directly.
    hide(s);
    if (s.replay) s.replay.dead = true;
  } catch { /* ignore */ }
}

/** The route changed. Emits a 'view' for a new route PATTERN (not for ?query or #hash changes). */
export function setUsagePage(pathname: string) {
  const s = st;
  if (!s) return;
  try {
    const page = routePattern(pathname);
    if (page === s.page) return;
    s.page = page;
    s.lastInput = Date.now();
    // Off /admin, /oversight and the credential screens; back on (with a fresh snapshot) after.
    syncRecorder(s);
    if (UNTRACKED_PAGES.has(page)) return;
    const props = s.firstView
      ? { tz: Intl.DateTimeFormat().resolvedOptions().timeZone, w: window.innerWidth, h: window.innerHeight }
      : null;
    s.firstView = false;
    push('view', null, props);
  } catch { /* ignore */ }
}

/**
 * An explicit app action — 'upload:start', 'transcript:save', 'export:salt'… Labels are fixed
 * strings chosen at the call site; `props` must stay small and never name a patient or a file.
 */
export function trackAction(label: string, props?: Record<string, unknown>) {
  try { push('action', collapse(label, 60), props ?? null); } catch { /* ignore */ }
}

/** An error the user was SHOWN (the popup). Scrubbed; not deduped — each showing is an event. */
export function trackError(message: unknown) {
  try {
    const msg = scrubMessage(message);
    if (msg) push('error', msg);
  } catch { /* ignore */ }
}
