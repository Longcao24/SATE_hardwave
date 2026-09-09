// AdminPage — system-wide management for SATE admins (users in sate_admins).
// Sections: the accounts in the system (and which per-account features they have), every
// recorder across all accounts, and the firmware catalog. Non-admins are bounced to home.
//
// The Users section is where a feature is GIVEN to an account. Meeting notes (the consumer
// lane) is off for everyone until an admin turns it on here — which is the whole reason a
// clinical user never sees that the feature exists. The switch used to live on the notes
// Worker's own /console page: a second URL, a second admin list, and a grant that could only
// be given to an account that had already visited that lane. It belongs with the people who
// already administer this system, so it lives here.

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { deviceApiService } from '@/services/device/deviceApiService';
import type { AdminDevice, AdminFirmware, AdminUser } from '@/services/device/deviceTypes';
import { notesApiService, type NotesGrant } from '@/services/notesApiService';
import { FirmwarePublishCard } from '@/components/Device/FirmwarePublishCard';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, ShieldCheck, Trash2, RefreshCw, Cpu, HardDrive, Loader2,
  Activity, ExternalLink, Users, Mic,
} from 'lucide-react';

// Ops surfaces linked from the admin page (open in a new tab).
const MONITORING_LINKS = [
  { title: 'Service monitor', desc: 'Live pipeline, fleet & versions', href: 'https://sate-monitor.pages.dev' },
  { title: 'Status page', desc: 'Uptime & 90-day history', href: 'https://sate-status.longcao.workers.dev' },
  { title: 'Docs', desc: 'Engineering documentation', href: 'https://sate-docs.pages.dev' },
];

function timeAgo(iso?: string): string {
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

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [d, f, u, g] = await Promise.all([
        deviceApiService.adminListDevices(),
        deviceApiService.adminListFirmware(),
        deviceApiService.adminListUsers(),
        // Its own backend, its own failure. A notes outage must not blank the admin page.
        notesApiService.adminListGrants(),
      ]);
      setDevices(d);
      setFirmware(f);
      setUsers(u);
      setGrants(g && Object.fromEntries(g.map((x) => [x.user_id, x])));
    } catch (e) {
      setError((e as Error).message || 'Failed to load');
    } finally {
      setBusy(false);
    }
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button
          variant="outline"
          onClick={() => navigate('/')}
          className="mb-4 text-gray-600 border-gray-200 hover:bg-gray-50"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
        </Button>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin</h1>
              <p className="text-gray-600">Manage every recorder and firmware release in the system</p>
            </div>
          </div>
          <Button variant="outline" onClick={load} disabled={busy}>
            <RefreshCw className={`w-4 h-4 mr-2 ${busy ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm p-3">{error}</div>
        )}

        {/* Users & feature access */}
        <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900 mb-1">
          <Users className="w-5 h-5 text-gray-500" /> Users ({users.length})
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Turn per-account features on or off. Meeting notes is off for every account until it
          is granted here.
        </p>
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden mb-8">
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span>Account</span>
            <span className="text-right">Recorders</span>
            <span className="text-right">Last sign-in</span>
            <span className="text-right">Meeting notes</span>
          </div>
          {users.length === 0 && (
            <div className="p-4 text-sm text-gray-500">No accounts yet.</div>
          )}
          <div className="divide-y divide-gray-100">
            {users.map((u) => {
              const grant = grants?.[u.id];
              const on = Boolean(grant?.enabled);
              // Unknown, not off: see the `grants === null` note above.
              const unknown = grants === null;
              return (
                <div key={u.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">{u.email || '(no email)'}</span>
                      {u.is_admin && (
                        <span className="text-xs bg-violet-100 text-violet-700 rounded px-1.5 py-0.5 shrink-0">admin</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate" title={u.id}>
                      joined {timeAgo(u.created_at)}
                      {grant?.notes ? ` · ${grant.notes} note${grant.notes > 1 ? 's' : ''}` : ''}
                    </p>
                  </div>
                  <span className="hidden sm:block text-sm text-gray-600 text-right tabular-nums">{u.devices}</span>
                  <span className="hidden sm:block text-sm text-gray-500 text-right">
                    {u.last_sign_in_at ? timeAgo(u.last_sign_in_at) : 'never'}
                  </span>
                  <button
                    onClick={() => setNotesAccess(u, !on)}
                    disabled={unknown || savingUser === u.id}
                    title={unknown ? 'The notes service did not answer — try Refresh' : on ? 'Revoke meeting notes' : 'Grant meeting notes'}
                    className={`justify-self-end inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                      on
                        ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                        : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {savingUser === u.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Mic className="w-3.5 h-3.5" />}
                    {unknown ? 'unknown' : on ? 'On' : 'Off'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Monitoring & status */}
        <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900 mb-3">
          <Activity className="w-5 h-5 text-gray-500" /> Monitoring &amp; status
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {MONITORING_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="group rounded-xl border border-gray-200 bg-white p-4 hover:border-violet-300 hover:shadow-sm transition"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{l.title}</span>
                <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-violet-600" />
              </div>
              <p className="text-sm text-gray-500 mt-1">{l.desc}</p>
            </a>
          ))}
        </div>

        {/* Firmware catalog */}
        <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900 mb-3">
          <HardDrive className="w-5 h-5 text-gray-500" /> Firmware
        </h2>
        <FirmwarePublishCard />
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 mb-8">
          {firmware.length === 0 && (
            <div className="p-4 text-sm text-gray-500">No firmware published yet.</div>
          )}
          {firmware.map((fw, i) => (
            <div key={fw.id} className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{fw.version}</span>
                  {i === 0 && (
                    <span className="text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5">latest</span>
                  )}
                  <span className="text-xs text-gray-400">{timeAgo(fw.created_at)}</span>
                </div>
                {fw.notes && <p className="text-sm text-gray-500 truncate">{fw.notes}</p>}
              </div>
              <button
                onClick={() => deleteFirmware(fw)}
                className="text-gray-400 hover:text-red-600 p-2 shrink-0"
                title="Delete release"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* All devices */}
        <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900 mb-3">
          <Cpu className="w-5 h-5 text-gray-500" /> Recorders ({devices.length})
        </h2>
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left font-medium px-4 py-2">Device</th>
                <th className="text-left font-medium px-4 py-2">Owner</th>
                <th className="text-left font-medium px-4 py-2">FW</th>
                <th className="text-left font-medium px-4 py-2">Battery</th>
                <th className="text-left font-medium px-4 py-2">Cell mV</th>
                <th className="text-left font-medium px-4 py-2">Recordings</th>
                <th className="text-left font-medium px-4 py-2">Status</th>
                <th className="text-left font-medium px-4 py-2">Last seen</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {devices.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-4 text-gray-500">No recorders registered.</td></tr>
              )}
              {devices.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">{d.name}</div>
                    <div className="text-xs text-gray-400">{d.serial}</div>
                  </td>
                  <td className="px-4 py-2 text-gray-700">{d.owner_email || d.slp || '—'}</td>
                  <td className="px-4 py-2 text-gray-700">{d.fw || '—'}</td>
                  <td className={`px-4 py-2 font-medium ${batteryClass(d.battery_pct)}`}>
                    {d.battery_pct == null ? '—' : `${d.battery_pct}%`}
                  </td>
                  <td className="px-4 py-2 text-gray-700 tabular-nums">
                    {d.battery_mv == null || d.battery_mv < 0 ? '—' : `${d.battery_mv} mV`}
                  </td>
                  <td className="px-4 py-2 text-gray-700">{d.total_recordings ?? 0}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center gap-1.5 ${d.online ? 'text-green-600' : 'text-gray-400'}`}>
                      <span className={`w-2 h-2 rounded-full ${d.online ? 'bg-green-500' : 'bg-gray-300'}`} />
                      {d.online ? (d.state || 'online') : 'offline'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{timeAgo(d.last_seen)}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => unlinkDevice(d)}
                      className="text-gray-400 hover:text-red-600 p-1.5"
                      title="Unlink device"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
