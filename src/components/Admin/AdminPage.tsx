// AdminPage — system-wide management for SATE admins (users in sate_admins).
// Two sections: every recorder across all accounts, and the firmware catalog
// (publish a new release, delete old ones). Non-admins are bounced to home.

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { deviceApiService } from '@/services/device/deviceApiService';
import type { AdminDevice, AdminFirmware } from '@/services/device/deviceTypes';
import { FirmwarePublishCard } from '@/components/Device/FirmwarePublishCard';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, ShieldCheck, Trash2, RefreshCw, Cpu, HardDrive, Loader2,
} from 'lucide-react';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [d, f] = await Promise.all([
        deviceApiService.adminListDevices(),
        deviceApiService.adminListFirmware(),
      ]);
      setDevices(d);
      setFirmware(f);
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
                <th className="text-left font-medium px-4 py-2">Recordings</th>
                <th className="text-left font-medium px-4 py-2">Status</th>
                <th className="text-left font-medium px-4 py-2">Last seen</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {devices.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-4 text-gray-500">No recorders registered.</td></tr>
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
