// Pure helpers for the usage tracker (no module state, no network) — kept apart from tracker.ts
// so they can be unit-tested in node. Every function here exists for one reason: SATE renders
// children's names, recording names and transcripts, and none of that may reach the analytics
// store. So each helper errs toward hiding: a label we are unsure about is '(masked)', a route
// segment we do not recognise is ':id'.

/** Routes that are not tracked at all (signed-out or credential screens). */
export const UNTRACKED_PAGES = new Set(['/login', '/signup', '/reset-password']);

/**
 * Routes whose usage is counted (views, clicks, actions) but NOT screen-recorded, because what is
 * on screen there is OTHER accounts' data: /admin lists every account's email and raw processing
 * errors, and its Usage tab plays other people's recordings back in a same-origin iframe that
 * rrweb would otherwise re-record into the admin's own (megabytes per minute at 16x); /oversight
 * renders another account's reports. Prefixes, so every sub-route is covered.
 */
const UNRECORDED_PREFIXES = ['/admin', '/oversight'];

/** May the screen be recorded on this route pattern? */
export function recordable(page: string): boolean {
  if (UNTRACKED_PAGES.has(page)) return false;
  return !UNRECORDED_PREFIXES.some((p) => page === p || page.startsWith(`${p}/`));
}

/**
 * A route PATTERN from a pathname: /report/3f2a…-… → /report/:id, /oversight/<uid>/<rid> →
 * /oversight/:id/:id. Only a lowercase word (letters and dashes: `patients`, `reset-password`,
 * `new`) is kept; anything else — a uuid, a number, an opaque token, an encoded name — is an id.
 * Allow-listing the SHAPE of a route word, rather than deny-listing id shapes, means an id format
 * nobody anticipated still cannot leak.
 */
export function routePattern(pathname: string): string {
  const path = (pathname || '/').split(/[?#]/)[0];
  const parts = path.split('/').filter(Boolean).map((seg) => (/^[a-z][a-z-]{0,39}$/.test(seg) ? seg : ':id'));
  return '/' + parts.join('/');
}

const EMAIL = /[^\s@<>()"']+@[^\s@<>()"']+\.[a-z]{2,}/gi;
const UUID = /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/gi;
// A file name (child_session_3.wav, Jane_Doe.m4a), with any path in front of it. Matched by the
// EXTENSIONS a user's file can carry — an open-ended `word.ext` also ate `x.map is not a
// function`, which is exactly the part of an error worth keeping.
const FILE_EXT = 'wav|mp3|m4a|mp4|aac|flac|ogg|oga|opus|webm|wma|aiff?|caf|amr|3gp|mov|avi|mkv|slt|cha|txt|rtf|docx?|pdf|csv|json|xlsx?|asc|zip|png|jpe?g|heic|gif';
const FILE = new RegExp(`(?:[\\w~.-]*[/\\\\])*[^\\s/\\\\"'\`()<>:]*[^\\s/\\\\"'\`()<>:.]\\.(?:${FILE_EXT})\\b`, 'gi');
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{24,}\b/g;
const URL_QUERY = /(https?:\/\/[^\s?#"']+)[?#][^\s"']*/gi;

/** True when a label looks like it carries a person, a file or an id rather than UI text. */
export function looksPrivate(s: string): boolean {
  return new RegExp(EMAIL.source, 'i').test(s)
    || new RegExp(UUID.source, 'i').test(s)
    || /\d{3,}/.test(s)
    || new RegExp(FILE.source, 'i').test(s)
    || new RegExp(JWT.source).test(s);
}

/** UTF-8 size of a string — what a request body actually costs against a byte limit. */
export const utf8Bytes = (s: string) => new TextEncoder().encode(s).byteLength;

/**
 * Split items into JSON bodies `{events: [...]}` of at most `maxBytes` and `maxItems` each.
 * Both limits matter: splitting by bytes alone let a backlog (after an outage, up to the buffer
 * cap) go out as one ~450-event body, which the Worker refuses whole with 413 — and a 413 is
 * permanent, so the backlog the tracker had kept for the retry was thrown away.
 */
export function splitBodies<T>(items: T[], maxBytes: number, maxItems: number): { events: T[]; body: string }[] {
  const out: { events: T[]; body: string }[] = [];
  let cur: T[] = [];
  let size = 12;   // {"events":[]}
  for (const e of items) {
    const n = utf8Bytes(JSON.stringify(e)) + 1;
    if (cur.length && (size + n > maxBytes || cur.length >= maxItems)) {
      out.push({ events: cur, body: JSON.stringify({ events: cur }) });
      cur = []; size = 12;
    }
    cur.push(e); size += n;
  }
  if (cur.length) out.push({ events: cur, body: JSON.stringify({ events: cur }) });
  return out;
}

/** Collapse whitespace and cap the length. */
export function collapse(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** A UI label as it may be stored: ≤ 60 chars, '(masked)' when it could name anything. */
export function sanitizeLabel(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = collapse(String(raw), 60);
  if (!t) return null;
  return looksPrivate(t) ? '(masked)' : t;
}

/**
 * An error message as it may be stored. Unlike a label, an error stays useful with its private
 * parts cut out ("HTTP 500 uploading :file" still says what broke), so it is scrubbed, not
 * replaced. Digit runs of 4+ go (ids, sizes, phone numbers); 3-digit HTTP statuses stay.
 */
export function scrubMessage(raw: unknown): string {
  let s = typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : String(raw ?? '');
  s = s
    .replace(URL_QUERY, '$1?…')
    .replace(EMAIL, ':email')
    .replace(UUID, ':id')
    .replace(JWT, ':token')
    .replace(FILE, (m) => (/^https?:/i.test(m) ? m : ':file'))
    .replace(LONG_TOKEN, ':token')
    .replace(/\d{4,}/g, '#');
  return collapse(s, 300);
}

/** Selector for the element a click is attributed to (the nearest interactive ancestor). */
export const CLICKABLE = [
  'button', 'a', '[role=button]', '[role=tab]', '[role=menuitem]', '[role=option]', '[role=switch]',
  '[role=checkbox]', 'input[type=submit]', 'input[type=button]', 'input[type=checkbox]',
  'input[type=radio]', 'select', '[data-track]',
].join(',');

/** The subset of Element the click resolver reads — lets the tests pass plain objects. */
export interface ClickNode {
  tagName: string;
  closest(selector: string): ClickNode | null;
  getAttribute(name: string): string | null;
  innerText?: string;
  textContent: string | null;
}

/**
 * What a click on `target` is recorded as, or null when it hit nothing interactive. The label is
 * data-track → aria-label → title → visible text — but inside [data-usage-mask] only data-track
 * (an explicit, reviewed label) is ever used, because the visible text there IS the private data.
 * Form controls never contribute their text: a <select>'s innerText is every option (patient
 * names), and an input's value is the user's typing.
 */
export function resolveClick(target: ClickNode | null): { label: string; tag: string } | null {
  const el = target?.closest?.(CLICKABLE);
  if (!el) return null;
  const tag = el.tagName.toLowerCase();
  const track = el.getAttribute('data-track');
  if (track) return { label: collapse(track, 60), tag };
  if (el.closest('[data-usage-mask]')) return { label: '(masked)', tag };
  const control = tag === 'input' || tag === 'select' || tag === 'textarea';
  const raw = el.getAttribute('aria-label') || el.getAttribute('title')
    || (control ? null : (el.innerText ?? el.textContent));
  return { label: sanitizeLabel(raw) ?? `(${el.getAttribute('type') || el.getAttribute('role') || tag})`, tag };
}

// ---- Screen-recording scrub ------------------------------------------------------------------
// rrweb masks TEXT under maskTextSelector and input VALUES, but it records attributes verbatim —
// so a `title={file_name}` tooltip inside a masked list would still be stored. These helpers
// strip descriptive attributes inside masked subtrees and scrub ids/emails/query strings out of
// attributes everywhere, on the serialized events before they leave the browser.

const DESCRIPTIVE_ATTRS = ['title', 'alt', 'aria-label', 'aria-description', 'placeholder', 'value', 'label', 'data-tooltip'];

/** One attribute value as it may be recorded. */
export function scrubAttr(name: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;
  let v = value;
  if ((name === 'href' || name === 'src' || name === 'action') && v.includes('?')) v = v.split('?')[0];
  return v.replace(EMAIL, ':email').replace(UUID, ':id');
}

interface SerializedNode {
  type?: number;
  attributes?: Record<string, unknown>;
  childNodes?: SerializedNode[];
}

/** Scrub one serialized rrweb node tree in place. `masked`: an ancestor carries data-usage-mask. */
export function scrubSerialized(node: SerializedNode | null | undefined, masked: boolean): void {
  if (!node) return;
  let m = masked;
  const attrs = node.attributes;
  if (attrs) {
    if ('data-usage-mask' in attrs) m = true;
    for (const k of Object.keys(attrs)) {
      if (m && DESCRIPTIVE_ATTRS.includes(k)) delete attrs[k];
      else attrs[k] = scrubAttr(k, attrs[k]);
    }
  }
  for (const c of node.childNodes ?? []) scrubSerialized(c, m);
}

interface RrwebLike {
  type: number;
  data?: {
    href?: string;
    node?: SerializedNode;
    source?: number;
    adds?: { parentId: number; node: SerializedNode }[];
    attributes?: { id: number; attributes: Record<string, unknown> }[];
  };
}

/**
 * A Meta event's href as it may be recorded: origin + route PATTERN. rrweb writes the raw
 * `location.href` — /report/<recording id>, /patients/<patient id>, a ?user=<uid> query, a
 * #access_token= hash — at record start and on every checkout, and the player needs only the
 * origin (to resolve relative stylesheet URLs) and, at most, which page it was.
 */
export function scrubHref(href: unknown): string {
  if (typeof href !== 'string') return '';
  try {
    const u = new URL(href);
    return `${u.origin}${routePattern(u.pathname)}`;
  } catch { return ''; }
}

/**
 * Scrub one rrweb event in place before it is buffered. Meta events (type 4) carry the page URL;
 * full snapshots (type 2) carry the whole tree, so masking is decided by walking it; a mutation
 * (type 3, source 0) adds nodes under a parent that already exists, so `isMaskedId` asks the live
 * DOM whether that parent is masked.
 */
export function scrubReplayEvent(e: RrwebLike, isMaskedId: (id: number) => boolean): void {
  if (e.type === 4 && e.data) { e.data.href = scrubHref(e.data.href); return; }
  if (e.type === 2 && e.data?.node) { scrubSerialized(e.data.node, false); return; }
  if (e.type !== 3 || e.data?.source !== 0) return;
  for (const a of e.data.adds ?? []) scrubSerialized(a.node, isMaskedId(a.parentId));
  for (const a of e.data.attributes ?? []) {
    const masked = isMaskedId(a.id) || 'data-usage-mask' in a.attributes;
    for (const k of Object.keys(a.attributes)) {
      if (masked && DESCRIPTIVE_ATTRS.includes(k)) a.attributes[k] = null;
      else a.attributes[k] = scrubAttr(k, a.attributes[k]);
    }
  }
}
