// This month's usage against the free plan (device-api v44, GET /account/usage). SHOWN ONLY: nothing is
// held or refused when an account goes over — the card says so, and points at the plans.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deviceApiService } from '@/services/device/deviceApiService';
import type { PlanUsage } from '@/services/device/deviceTypes';

const hours = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`);

function Meter({ label, used, limit, fmt }: { label: string; used: number; limit: number; fmt: (n: number) => string }) {
  const pct = Math.min(100, (used / limit) * 100);
  const over = used > limit;
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="text-gray-600">{label}</span>
        <span className={over ? 'text-amber-700 font-medium' : 'text-gray-900 font-medium'}>{fmt(used)} / {fmt(limit)}</span></div>
      <div className="h-2 mt-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${over ? 'bg-amber-500' : pct > 80 ? 'bg-amber-400' : 'bg-teal-600'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PlanUsageCard({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const [u, setU] = useState<PlanUsage | null>(null);
  useEffect(() => { deviceApiService.getUsage().then(setU).catch(() => setU(null)); }, []);
  if (!u || u.unavailable) return null;
  // month_start is midnight on the 1st in America/New_York (sate_month_start()); format it in that
  // zone, or every viewer west of New York sees the previous month's name.
  const month = new Date(u.month_start).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'America/New_York' });

  return (
    <div className={`rounded-xl border border-gray-200 bg-white ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">This month · {month}</div>
          <div className="font-semibold text-gray-900">{u.plan === 'paid' ? 'SATE Plan — unlimited' : 'Free plan'}</div>
        </div>
        {u.plan === 'free' && (
          <button onClick={() => navigate('/pricing')}
            className="text-sm px-3 py-1.5 rounded-lg bg-teal-700 text-white hover:bg-teal-800">Upgrade</button>
        )}
      </div>
      {u.plan === 'free' && u.limit_recordings != null && u.limit_seconds != null ? (
        <div className="space-y-3">
          <Meter label="Recordings" used={u.recordings} limit={u.limit_recordings} fmt={(n) => String(n)} />
          <Meter label="Audio" used={u.seconds} limit={u.limit_seconds} fmt={hours} />
          {u.over && !u.enforced && (
            <p className="text-xs text-amber-700">Over the free plan this month. Your recordings are still processed for now.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-600">{u.recordings} recording{u.recordings === 1 ? '' : 's'} · {hours(u.seconds)} of audio this month.</p>
      )}
    </div>
  );
}
