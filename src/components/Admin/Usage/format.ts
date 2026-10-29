// Formatting for Admin → Usage. Local to the panel on purpose: these read the usage API's shapes
// (route PATTERNS, minute counts, an account's IANA zone) and nothing else in the app should.

import type { UsageKind } from '@/services/usage/types';

/** Minutes as "1h 05m" / "12m" — active time is counted in whole minutes, so no seconds. */
export function fmtMin(min?: number | null): string {
  const m = Math.max(0, Math.round(min || 0));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** A wall-clock span (a visit, an upload's length) as "1h 05m" / "4m 10s" / "35s". */
export function fmtSpan(sec?: number | null): string {
  const s = Math.max(0, Math.round(sec || 0));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return fmtMin(s / 60);
}

export function ago(iso?: string | null): string {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// The zone comes from the account's own browser, so it is untrusted input to Intl: an unknown zone
// throws a RangeError, and one bad value must not blank the whole report. Fall back to ours.
function safeZone(tz?: string | null): string | undefined {
  if (!tz) return undefined;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return undefined; }
}

/** A formatter bound to one zone — the ACCOUNT's, so "9:40 AM" means 9:40 where they sat. */
export function zoned(tz?: string | null) {
  const timeZone = safeZone(tz);
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  const timeSec = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const dateTime = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' });
  const zoneName = (() => {
    try {
      const p = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(new Date());
      return p.find((x) => x.type === 'timeZoneName')?.value || timeZone || 'local';
    } catch { return timeZone || 'local'; }
  })();
  const f = (fmt: Intl.DateTimeFormat) => (iso?: string | null) => (iso ? fmt.format(new Date(iso)) : '—');
  return {
    zone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    zoneName,
    time: f(time), timeSec: f(timeSec), dateTime: f(dateTime), day: f(day),
  };
}

/** "2026-10-29" (a LOCAL day key from the API) → "Thu, Oct 29". Parsed as UTC so it never shifts a day. */
export function dayLabel(date: string, withWeekday = true): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...(withWeekday ? { weekday: 'short' } : {}) }).format(dt);
}
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
}

// The tracker stores route PATTERNS, never the ids in them, so a friendly name is a lookup on the
// pattern. Anything unknown is shown raw — a new route should still be readable, just not pretty.
const PAGE_NAMES: Record<string, string> = {
  '/': 'Dashboard',
  '/patients': 'Patients',
  '/patients/new': 'New patient',
  '/patients/:id': 'Patient',
  '/patients/:id/edit': 'Edit patient',
  '/patients/inactive': 'Inactive patients',
  '/report/:id': 'Report',
  '/sample': 'Sample report',
  '/devices': 'Devices',
  '/notes': 'Meeting notes',
  '/admin': 'Admin',
  '/profile': 'Profile',
  '/invite-codes': 'Invite codes',
  '/pricing': 'Pricing',
  '/settings/billing': 'Billing',
  '/payment/success': 'Payment done',
  '/payment/cancel': 'Payment cancelled',
  '/login': 'Sign in',
  '/signup': 'Sign up',
  '/reset-password': 'Reset password',
};
export function pageName(page?: string | null): string {
  if (!page) return '—';
  if (PAGE_NAMES[page]) return PAGE_NAMES[page];
  if (page.startsWith('/oversight')) return 'Oversight';
  return page;
}

export const KIND_STYLE: Record<UsageKind, { label: string; cls: string }> = {
  view: { label: 'view', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  active: { label: 'active', cls: 'bg-gray-50 text-gray-500 border-gray-200' },
  click: { label: 'click', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  action: { label: 'action', cls: 'bg-green-50 text-green-700 border-green-200' },
  error: { label: 'error', cls: 'bg-red-50 text-red-700 border-red-200' },
};

/** device_serial family → a name an operator recognises. Mirrors the families in CLAUDE.md. */
export function sourceName(source: string): string {
  if (/\s/.test(source)) return source;   // already a display name, not a serial
  const s = source.toLowerCase();
  if (s.startsWith('web')) return 'Web upload';
  if (s.startsWith('sate')) return 'SATE recorder';
  if (s.startsWith('l815')) return 'SATE L815';
  if (s.startsWith('l81')) return 'SATE L816';
  if (s.startsWith('pendant')) return 'Pendant';
  if (s.startsWith('plaud')) return 'Plaud';
  if (s.startsWith('sonic')) return 'SonicNote';
  return source;
}

/** A position inside a screen recording as "m:ss" — the clock the player's own scrubber shows. */
export function fmtOffset(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** Seconds between two ISO times (a visit's length); 0 when either is missing. */
export function spanSec(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  return Math.max(0, (Date.parse(end) - Date.parse(start)) / 1000);
}
