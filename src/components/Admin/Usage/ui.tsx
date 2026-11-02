// Small building blocks shared by the Admin → Usage views. Same look as ProcessingPanel (white
// rounded cards, gray text, violet accents) so Usage reads as part of the admin page, not a plug-in.

import type { ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { ANALYTICS_URL } from '@/services/usage/analyticsApi';
import type { UsageKind } from '@/services/usage/types';
import { KIND_STYLE, pageName } from './format';

export function Kpi({ icon, label, value, sub, tone }: { icon: ReactNode; label: string; value: ReactNode; sub?: string; tone?: 'red' }) {
  return (
    <div className={`rounded-xl border bg-white p-3 ${tone === 'red' ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="flex items-center gap-1.5 text-xs text-gray-500">{icon}{label}</div>
      <div className={`text-xl font-semibold mt-1 tabular-nums ${tone === 'red' ? 'text-red-700' : 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5 truncate" title={sub}>{sub}</div>}
    </div>
  );
}

export function Section({ title, hint, right, children, className = '' }: {
  title: string; hint?: string; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-4 ${className}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {hint && <p className="text-xs text-gray-500">{hint}</p>}
        </div>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function KindBadge({ kind }: { kind: UsageKind }) {
  const s = KIND_STYLE[kind] || KIND_STYLE.active;
  return <span className={`inline-block text-[11px] leading-4 rounded border px-1.5 ${s.cls}`}>{s.label}</span>;
}

/** A route pattern under its friendly name; the raw pattern stays reachable in the tooltip. */
export function PageLabel({ page, className = '' }: { page?: string | null; className?: string }) {
  return <span className={className} title={page || undefined}>{pageName(page)}</span>;
}

/** What a step / event says, in words: a view's label is the page it went to. */
export function stepText(kind: UsageKind, label?: string | null, page?: string | null): ReactNode {
  if (kind === 'view') return <PageLabel page={label || page} />;
  if (kind === 'active') return <span className="text-gray-400">active minute</span>;
  return <span className={kind === 'error' ? 'text-red-700' : ''}>{label || '—'}</span>;
}

export function Segmented<T extends string | number>({ value, options, onChange }: {
  value: T; options: { id: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-white p-0.5">
      {options.map((o) => (
        <button key={String(o.id)} onClick={() => onChange(o.id)}
          className={`px-3 py-1 text-xs rounded-md whitespace-nowrap ${value === o.id ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Windows are whole LOCAL days ending today (the Worker's window()), so 1 is "today since
// midnight", not a rolling 24 hours — at 00:30 it holds half an hour. The label says so.
export const DAY_OPTIONS = [1, 7, 14, 30, 90].map((n) => ({ id: n, label: n === 1 ? 'Today' : `${n} days` }));

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="p-8 flex items-center justify-center text-sm text-gray-500 gap-2">
      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />{label}
    </div>
  );
}

// The analytics Worker is a separate service from device-api and may simply not be deployed (or be
// blocked by a clinic network). That must read as "the service is not there", not as a stack trace,
// or the operator goes hunting for a bug in the admin page.
export function friendlyError(e: unknown): string {
  const msg = String((e as Error)?.message || e || 'Unknown error');
  if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(msg)) {
    return `The analytics service (${ANALYTICS_URL}) did not answer. It may not be deployed yet, or this network blocks it.`;
  }
  const http = msg.match(/HTTP (\d{3})/);
  if (http) {
    const code = Number(http[1]);
    if (code === 401 || code === 403) return `The analytics service refused this account (HTTP ${code}): it only answers SATE admins. Try signing in again.`;
    if (code === 404) return `The analytics service does not know this route (HTTP 404): the Worker may be older than this page.`;
    if (code >= 500) return `The analytics service failed (HTTP ${code}). ${msg.replace(/^Analytics HTTP \d+:\s*/, '')}`.trim();
  }
  return msg;
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2 items-start">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1">{error}</div>
      {onRetry && <button onClick={onRetry} className="text-xs px-2 py-1 rounded-md border border-red-200 bg-white hover:bg-red-50">Retry</button>}
    </div>
  );
}

/** A horizontal share bar for "top N" lists. */
export function ShareBar({ value, max, tone = 'violet' }: { value: number; max: number; tone?: 'violet' | 'blue' }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 rounded bg-gray-100 overflow-hidden">
      <div className={`h-full ${tone === 'blue' ? 'bg-blue-400' : 'bg-violet-400'}`} style={{ width: `${w}%` }} />
    </div>
  );
}
