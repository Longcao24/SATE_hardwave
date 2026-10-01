// Admin → Recorders → "Every device": every unit that exists anywhere — registered SATE recorders AND
// app-only hardware (L81x, pendant, Plaud, SonicNote) that only shows up as the serial on its uploads —
// with the account holding it (same rule the app enforces before it connects, device-api /devices/owner)
// and every account that has used it. A unit used by more than one account is the cross-connect case.

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, RefreshCw, Search } from 'lucide-react';
import { deviceApiService } from '@/services/device/deviceApiService';
import type { AdminRecorder } from '@/services/device/deviceTypes';

const ago = (iso?: string | null) => {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const SOURCE: Record<string, string> = {
  claimed: 'claimed the recorder', registered: 'registered it first', uploads: 'uploaded from it last',
};

export function AllRecordersPanel() {
  const [rows, setRows] = useState<AdminRecorder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [family, setFamily] = useState('all');
  const [onlyShared, setOnlyShared] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = () => {
    setLoading(true);
    deviceApiService.adminRecorders().then((r) => { setRows(r.recorders); setError(null); })
      .catch((e) => setError(String(e.message || e))).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const families = useMemo(() => [...new Set((rows || []).map((r) => r.family))].sort(), [rows]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows || []).filter((r) => (family === 'all' || r.family === family) && (!onlyShared || r.shared)
      && (!n || [r.serial, r.name, r.hw_serial, r.holder_email, ...r.accounts.map((a) => a.email)].some((x) => (x || '').toLowerCase().includes(n))));
  }, [rows, q, family, onlyShared]);
  const sharedN = (rows || []).filter((r) => r.shared).length;

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="p-4 border-b flex flex-wrap items-center gap-2">
        <div>
          <h3 className="font-semibold text-gray-900">Every device ({rows?.length ?? '…'})</h3>
          <p className="text-xs text-gray-500">Including app-connected hardware (L81x, pendant, Plaud, SonicNote) that has no registration of its own. "Holder" is the account the app treats as its owner.</p>
        </div>
        <button onClick={load} className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border hover:bg-gray-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      <div className="p-3 flex flex-wrap items-center gap-2 border-b bg-gray-50">
        <div className="flex items-center gap-2 border rounded-md px-2 bg-white">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Serial, name or account" className="py-1.5 text-sm outline-none w-56" />
        </div>
        <select value={family} onChange={(e) => setFamily(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm bg-white">
          <option value="all">All types</option>
          {families.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 text-sm text-gray-700">
          <input type="checkbox" checked={onlyShared} onChange={(e) => setOnlyShared(e.target.checked)} />
          Used by several accounts {sharedN ? <span className="text-amber-700 font-medium">({sharedN})</span> : null}
        </label>
      </div>
      {error && <div className="m-3 rounded-md bg-red-50 text-red-700 text-sm p-3">{error}</div>}
      {!rows && !error && <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>}
      {rows && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="w-6"></th>
                <th className="text-left font-semibold px-3 py-2">Device</th>
                <th className="text-left font-semibold px-3 py-2">Holder</th>
                <th className="text-left font-semibold px-3 py-2">Accounts</th>
                <th className="text-right font-semibold px-3 py-2">Uploads</th>
                <th className="text-left font-semibold px-3 py-2">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-4 text-gray-500">No devices.</td></tr>}
              {shown.map((r) => {
                const isOpen = open.has(r.serial);
                const toggle = () => { const n = new Set(open); isOpen ? n.delete(r.serial) : n.add(r.serial); setOpen(n); };
                return [
                  <tr key={r.serial} onClick={toggle} className={`border-t cursor-pointer hover:bg-gray-50 ${r.shared ? 'bg-amber-50/60' : ''}`}>
                    <td className="pl-3 text-gray-400">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{r.name || r.family}</span>
                        {r.online && <span className="w-2 h-2 rounded-full bg-green-500" title="online" />}
                        {r.shared && <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800"><AlertTriangle className="w-3 h-3" />shared</span>}
                      </div>
                      <div className="text-xs text-gray-400 font-mono">{r.serial}{r.hw_serial ? ` · hw ${r.hw_serial}` : ''}</div>
                    </td>
                    <td className="px-3 py-2">
                      {r.holder_email ? <><div className="text-gray-800">{r.holder_email}</div>
                        <div className="text-[11px] text-gray-400">{r.holder_source ? SOURCE[r.holder_source] : ''}</div></>
                        : <span className="text-gray-400">free</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{r.accounts.filter((a) => !a.released).length}
                      {r.accounts.some((a) => a.released) && <span className="text-gray-400"> (+{r.accounts.filter((a) => a.released).length} released)</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.uploads}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{ago(r.last_activity)}</td>
                  </tr>,
                  isOpen && (
                    <tr key={r.serial + ':x'} className="bg-gray-50">
                      <td></td>
                      <td colSpan={5} className="px-3 py-2">
                        <table className="w-full text-xs">
                          <thead className="text-gray-500"><tr>
                            <th className="text-left font-medium py-1">Account</th><th className="text-right font-medium py-1">Uploads</th>
                            <th className="text-left font-medium py-1 pl-4">Last upload</th><th className="text-left font-medium py-1">Registered</th><th></th>
                          </tr></thead>
                          <tbody>
                            {r.accounts.map((a) => (
                              <tr key={a.user_id} className="border-t border-gray-200">
                                <td className="py-1">{a.email || a.user_id}</td>
                                <td className="py-1 text-right tabular-nums">{a.uploads}</td>
                                <td className="py-1 pl-4">{a.last_upload ? new Date(a.last_upload).toLocaleString() : '—'}</td>
                                <td className="py-1">{a.registered_at ? new Date(a.registered_at).toLocaleDateString() : '—'}</td>
                                <td className="py-1 text-right">
                                  {a.holder && <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">holder</span>}
                                  {a.released && <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">released</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
