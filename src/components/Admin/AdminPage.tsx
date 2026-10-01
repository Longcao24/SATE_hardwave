// AdminPage — system-wide management for SATE admins (users in sate_admins).
//
// One page, five tabs, so each job has room instead of one long scroll:
//   Accounts   — every account with its numbers; create one; open an account to see its stats,
//                view it read-only, set a password, disable or delete it, and turn per-account
//                features on (AccountModal). The Meeting notes switch is in that popup: it is how
//                the feature is GIVEN to an account (off for everyone until an admin turns it on);
//                it used to live on the notes Worker's own /console — a second URL and admin list.
//   Managers   — who may view (read-only) which accounts (ManagersCard).
//   Recorders  — every recorder across all accounts.
//   Firmware   — publish and manage releases.
//   Monitoring — links to the ops surfaces.
// Non-admins are bounced.

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { deviceApiService } from '@/services/device/deviceApiService';
import type { AdminDevice, AdminFirmware, AdminUser } from '@/services/device/deviceTypes';
import { notesApiService, type NotesGrant } from '@/services/notesApiService';
import { FirmwarePublishCard } from '@/components/Device/FirmwarePublishCard';
import { ManagersCard } from '@/components/Admin/ManagersCard';
import { ProcessingPanel } from '@/components/Admin/ProcessingPanel';
import { AllRecordersPanel } from '@/components/Admin/AllRecordersPanel';
import { AccountModal, Badge, fmtHours } from '@/components/Admin/AccountModal';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, ShieldCheck, Trash2, RefreshCw, Cpu, HardDrive, Loader2,
  Activity, ExternalLink, Users, Search, UserPlus, Eye, FileAudio, Clock, UserCog, X, Zap,
} from 'lucide-react';

// Ops surfaces linked from the admin page (open in a new tab).
const MONITORING_LINKS = [
  { title: 'Service monitor', desc: 'Live pipeline, fleet & versions', href: 'https://sate-monitor.pages.dev' },
  { title: 'Status page', desc: 'Uptime & 90-day history', href: 'https://sate-status.longcao.workers.dev' },
  { title: 'Docs', desc: 'Engineering documentation', href: 'https://sate-docs.pages.dev' },
];

type Tab = 'accounts' | 'managers' | 'processing' | 'recorders' | 'firmware' | 'monitoring';

function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (secs < 60) return 'just now';
  const m = Math.round(secs / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

// Battery chip: colour by charge, dash when the device can't sense it.
function batteryClass(pct?: number | null): string {
  if (pct == null) return 'text-gray-400';
  if (pct < 15) return 'text-red-600';
  if (pct < 35) return 'text-amber-600';
  return 'text-green-600';
}

export function AdminPage() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('accounts');
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [firmware, setFirmware] = useState<AdminFirmware[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  // null = the notes service did not answer. Distinct from "nobody has access": the toggles
  // are disabled rather than shown as off, because showing a grant we could not read as OFF
  // invites an admin to "fix" it and overwrite a grant that was actually on.
  const [grants, setGrants] = useState<Record<string, NotesGrant> | null>({});
  const [savingUser, setSavingUser] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    // Each source on its own: one failing (e.g. the notes service) must not blank the rest.
    const [d, f, u, g] = await Promise.allSettled([
      deviceApiService.adminListDevices(),
      deviceApiService.adminListFirmware(),
      deviceApiService.adminListUsers(),
      notesApiService.adminListGrants(),
    ]);
    if (d.status === 'fulfilled') setDevices(d.value);
    if (f.status === 'fulfilled') setFirmware(f.value);
    if (u.status === 'fulfilled') setUsers(u.value);
    setGrants(g.status === 'fulfilled' && g.value ? Object.fromEntries(g.value.map((x) => [x.user_id, x])) : null);
    const failed = [d, f, u].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    if (failed.length) setError(failed.map((r) => (r.reason as Error)?.message || 'Failed to load').join(' · '));
    setBusy(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    deviceApiService.amIAdmin().then((ok) => {
      if (cancelled) return;
      setAllowed(ok);
      if (ok) load();
    });
    return () => { cancelled = true; };
  }, [load]);

  const totals = useMemo(() => ({
    accounts: users.length,
    reports: users.reduce((a, u) => a + (u.recordings || 0), 0),
    sateReports: users.reduce((a, u) => a + (u.sate_reports || 0), 0),
    audio: users.reduce((a, u) => a + (u.audio_seconds || 0), 0),
    online: devices.filter((d) => d.online).length,
  }), [users, devices]);

  const shownUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? users.filter((u) => u.email.toLowerCase().includes(q)) : users;
  }, [users, query]);

  const deleteFirmware = async (fw: AdminFirmware) => {
    if (!window.confirm(`Delete firmware ${fw.version}? This removes the .bin and the release record.`)) return;
    try {
      await deviceApiService.adminDeleteFirmware(fw.id);
      setFirmware((prev) => prev.filter((x) => x.id !== fw.id));
    } catch (e) {
      setError((e as Error).message || 'Delete failed');
    }
  };

  const setNotesAccess = async (u: AdminUser, enabled: boolean) => {
    setSavingUser(u.id);
    // Optimistic: the switch answers immediately, and a failure puts it back rather than
    // leaving the page claiming a grant the server never took.
    const before = grants;
    setGrants((prev) => ({
      ...(prev || {}),
      [u.id]: { ...(prev?.[u.id] as NotesGrant), user_id: u.id, email: u.email, enabled, mode: enabled ? 'notes' : 'clinical', notes: prev?.[u.id]?.notes ?? 0 },
    }));
    try {
      await notesApiService.adminSetAccess(u.id, u.email, enabled);
      setError(null);
    } catch (e) {
      setGrants(before);
      setError((e as Error).message || 'Could not change access');
    } finally {
      setSavingUser(null);
    }
  };

  const unlinkDevice = async (d: AdminDevice) => {
    if (!window.confirm(`Unlink "${d.name}" (${d.serial}) from ${d.owner_email || 'its account'}? The recorder resets to setup on its next heartbeat.`)) return;
    try {
      await deviceApiService.adminDeleteDevice(d.id);
      setDevices((prev) => prev.filter((x) => x.id !== d.id));
    } catch (e) {
      setError((e as Error).message || 'Unlink failed');
    }
  };

  if (allowed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Checking admin access…
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-3">
        <p className="text-gray-700 font-medium">You don’t have admin access.</p>
        <Button variant="outline" onClick={() => navigate('/')}>Back to Dashboard</Button>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'accounts', label: 'Accounts', icon: <Users className="w-4 h-4" />, count: users.length },
    { id: 'managers', label: 'Managers', icon: <UserCog className="w-4 h-4" /> },
    { id: 'processing', label: 'Processing', icon: <Zap className="w-4 h-4" /> },
    { id: 'recorders', label: 'Recorders', icon: <Cpu className="w-4 h-4" />, count: devices.length },
    { id: 'firmware', label: 'Firmware', icon: <HardDrive className="w-4 h-4" />, count: firmware.length },
    { id: 'monitoring', label: 'Monitoring', icon: <Activity className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-800" title="Back to Dashboard">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-violet-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900 leading-tight">Admin</h1>
            <p className="text-xs text-gray-500">Accounts, managers, recorders and firmware across the whole system</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/oversight')} className="hidden sm:flex">
            <Eye className="w-4 h-4 mr-2" /> View accounts
          </Button>
          <Button variant="outline" onClick={load} disabled={busy}>
            <RefreshCw className={`w-4 h-4 sm:mr-2 ${busy ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>

        {/* KPIs */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi icon={<Users className="w-4 h-4" />} label="Accounts" value={totals.accounts} />
          <Kpi icon={<FileAudio className="w-4 h-4" />} label="Reports" value={totals.reports} />
          <Kpi icon={<ShieldCheck className="w-4 h-4" />} label="SATE reports" value={totals.sateReports} />
          <Kpi icon={<Clock className="w-4 h-4" />} label="Total audio" value={fmtHours(totals.audio)} />
          <Kpi icon={<Cpu className="w-4 h-4" />} label="Recorders online" value={`${totals.online} / ${devices.length}`} />
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap ${
                tab === t.id ? 'border-violet-600 text-violet-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              {t.icon}{t.label}{t.count != null && <span className="text-xs text-gray-400">{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm p-3">{error}</div>}

        {/* ---------------- Accounts ---------------- */}
        {tab === 'accounts' && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="flex items-center gap-2 bg-white border rounded-md px-2 flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-gray-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search accounts by email"
                  className="w-full py-2 text-sm outline-none bg-transparent" />
              </div>
              <Button onClick={() => setCreating(true)} className="bg-violet-600 hover:bg-violet-700 text-white">
                <UserPlus className="w-4 h-4 mr-2" /> Create account
              </Button>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left font-semibold px-4 py-2">Account</th>
                    <th className="text-right font-semibold px-3 py-2">Reports</th>
                    <th className="text-right font-semibold px-3 py-2">Audio</th>
                    <th className="text-right font-semibold px-3 py-2">Recorders</th>
                    <th className="text-right font-semibold px-3 py-2">Last sign-in</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shownUsers.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-4 text-gray-500">{users.length ? 'No account matches.' : 'No accounts yet.'}</td></tr>
                  )}
                  {shownUsers.map((u) => {
                    const notesOn = Boolean(grants?.[u.id]?.enabled);
                    return (
                      <tr key={u.id} className={`hover:bg-gray-50 ${u.disabled ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button onClick={() => setOpenUser(u.id)} className="font-medium text-gray-900 hover:text-violet-700 text-left">
                              {u.email || '(no email)'}
                            </button>
                            {u.is_admin && <Badge tone="violet">admin</Badge>}
                            {u.is_manager && <Badge tone="blue">manager</Badge>}
                            {u.disabled && <Badge tone="red">disabled</Badge>}
                            {notesOn && <Badge tone="green">meeting notes</Badge>}
                          </div>
                          <div className="text-xs text-gray-400">
                            joined {timeAgo(u.created_at)}
                            {u.last_recording_at ? ` · last recording ${timeAgo(u.last_recording_at)}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{u.recordings ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{u.audio_seconds != null ? fmtHours(u.audio_seconds) : '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{u.devices}</td>
                        <td className="px-3 py-2.5 text-right text-gray-500 whitespace-nowrap">{u.last_sign_in_at ? timeAgo(u.last_sign_in_at) : 'never'}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button onClick={() => setOpenUser(u.id)} className="text-xs px-2.5 py-1 rounded-md border hover:bg-white">Manage</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ---------------- Managers ---------------- */}
        {tab === 'managers' && <ManagersCard userEmails={users.map((u) => u.email).filter(Boolean)} />}

        {/* ---------------- Processing ---------------- */}
        {tab === 'processing' && <ProcessingPanel />}

        {/* ---------------- Recorders ---------------- */}
        {tab === 'recorders' && <AllRecordersPanel />}
        {tab === 'recorders' && (
          <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
            <div className="px-4 pt-4">
              <h3 className="font-semibold text-gray-900">SATE recorders — live telemetry</h3>
              <p className="text-xs text-gray-500 mb-2">Registered recorders that report battery, firmware and state.</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-4 py-2">Device</th>
                  <th className="text-left font-semibold px-3 py-2">Owner</th>
                  <th className="text-left font-semibold px-3 py-2">FW</th>
                  <th className="text-left font-semibold px-3 py-2">Battery</th>
                  <th className="text-left font-semibold px-3 py-2">Cell</th>
                  <th className="text-right font-semibold px-3 py-2">Recordings</th>
                  <th className="text-left font-semibold px-3 py-2">Status</th>
                  <th className="text-left font-semibold px-3 py-2">Last seen</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {devices.length === 0 && <tr><td colSpan={9} className="px-4 py-4 text-gray-500">No recorders registered.</td></tr>}
                {devices.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900">{d.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{d.serial}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{d.owner_email || d.slp || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{d.fw || '—'}</td>
                    <td className={`px-3 py-2 font-medium ${batteryClass(d.battery_pct)}`}>{d.battery_pct == null ? '—' : `${d.battery_pct}%`}</td>
                    <td className="px-3 py-2 text-gray-700 tabular-nums">{d.battery_mv == null || d.battery_mv < 0 ? '—' : `${d.battery_mv} mV`}</td>
                    <td className="px-3 py-2 text-gray-700 text-right tabular-nums">{d.total_recordings ?? 0}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1.5 ${d.online ? 'text-green-600' : 'text-gray-400'}`}>
                        <span className={`w-2 h-2 rounded-full ${d.online ? 'bg-green-500' : 'bg-gray-300'}`} />
                        {d.online ? (d.state || 'online') : 'offline'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{timeAgo(d.last_seen)}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => unlinkDevice(d)} className="text-gray-400 hover:text-red-600 p-1.5" title="Unlink device">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ---------------- Firmware ---------------- */}
        {tab === 'firmware' && (
          <>
            <FirmwarePublishCard />
            <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
              {firmware.length === 0 && <div className="p-4 text-sm text-gray-500">No firmware published yet.</div>}
              {firmware.map((fw, i) => (
                <div key={fw.id} className="flex items-center justify-between p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{fw.version}</span>
                      {i === 0 && <Badge tone="green">latest</Badge>}
                      <span className="text-xs text-gray-400">{timeAgo(fw.created_at)}</span>
                    </div>
                    {fw.notes && <p className="text-sm text-gray-500 truncate">{fw.notes}</p>}
                  </div>
                  <button onClick={() => deleteFirmware(fw)} className="text-gray-400 hover:text-red-600 p-2 shrink-0" title="Delete release">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ---------------- Monitoring ---------------- */}
        {tab === 'monitoring' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {MONITORING_LINKS.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noreferrer"
                className="group rounded-xl border border-gray-200 bg-white p-4 hover:border-violet-300 hover:shadow-sm transition">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{l.title}</span>
                  <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-violet-600" />
                </div>
                <p className="text-sm text-gray-500 mt-1">{l.desc}</p>
              </a>
            ))}
          </div>
        )}
      </div>

      {openUser && (() => {
        const u = users.find((x) => x.id === openUser);
        return (
          <AccountModal userId={openUser} onClose={() => setOpenUser(null)} onChanged={load}
            notes={u ? {
              on: grants === null ? null : Boolean(grants[u.id]?.enabled),
              saving: savingUser === u.id,
              count: grants?.[u.id]?.notes,
              toggle: (enabled) => setNotesAccess(u, enabled),
            } : undefined} />
        );
      })()}
      {creating && <CreateAccountModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); load(); setOpenUser(id); }} />}
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-gray-50 px-3 py-2">
      <div className="text-xs text-gray-500 flex items-center gap-1">{icon}{label}</div>
      <div className="text-lg font-semibold text-gray-900 tabular-nums">{value}</div>
    </div>
  );
}

function CreateAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try { const r = await deviceApiService.adminCreateUser(email.trim(), password); onCreated(r.id); }
    catch (e: any) { setError(String(e.message || e).replace(/^\d+ /, '')); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center mb-3">
          <h2 className="text-lg font-semibold flex-1">Create account</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-gray-500 mb-3">The account can sign in straight away (no confirmation email). Give the person their password.</p>
        <div className="space-y-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="w-full border rounded-md px-2 py-2 text-sm" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ characters)" type="text" autoComplete="new-password" className="w-full border rounded-md px-2 py-2 text-sm" />
        </div>
        {error && <div className="mt-3 rounded-md bg-red-50 text-red-700 text-sm p-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !email.includes('@') || password.length < 8} onClick={submit} className="bg-violet-600 hover:bg-violet-700 text-white">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
}
