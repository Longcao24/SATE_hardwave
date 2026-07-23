// DeviceProvider — React context for SATE Recorder fleet management.
// Auto-polls the device API every 4 seconds (matching the companion app)
// and provides device state, commands, and session data to the component tree.

import React, { createContext, useContext, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthProvider';
import { deviceApiService } from '@/services/device/deviceApiService';
import type {
  ManagedDevice,
  UploadedSession,
  RemoteCommand,
  DevicePatient,
  FirmwareInfo,
} from '@/services/device/deviceTypes';

// Compare dotted numeric firmware versions (e.g. "1.5.12" vs "1.5.10").
// Returns <0 if a<b, 0 if equal, >0 if a>b. Missing/short parts count as 0;
// non-numeric segments are treated as 0 so a malformed string never falsely
// triggers an "update available". "1.5.12" > "1.5.10" (numeric, not string).
function compareFw(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const na = parseInt(pa[i] ?? '0', 10) || 0;
    const nb = parseInt(pb[i] ?? '0', 10) || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

// OTA lifecycle for the selected device, derived from its heartbeat fields.
export type OtaStatus =
  | 'current'     // running the latest firmware
  | 'available'   // a newer firmware exists
  | 'queued'      // update command sent, device hasn't started yet
  | 'installing'  // device is downloading + flashing
  | 'rebooting'   // device dropped offline to boot the new image
  | 'done'        // device came back on the target version
  | 'failed';     // never started within the timeout (e.g. bad/missing image)

// If a queued update hasn't started this long after sending, treat it as failed
// (common cause: the firmware image URL 404s, so the device can't download it).
const OTA_TIMEOUT_MS = 120000;

// Hard deadline for the whole flash, including the offline reboot window. A
// device that never comes back (bad image, power loss) would otherwise sit on
// "Rebooting" forever, and only the 'failed' banner offers a way out.
const OTA_STALL_TIMEOUT_MS = 300000;

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface DeviceContextValue {
  /** All devices claimed to this account. */
  devices: ManagedDevice[];
  /** The currently selected device (first by default). */
  selectedDevice: ManagedDevice | null;
  /** Select a device by id. */
  selectDevice: (id: string) => void;
  /** Sessions uploaded by the selected device. */
  sessions: UploadedSession[];
  /** Send a remote command to the selected device. */
  sendCommand: (op: RemoteCommand, patient?: Partial<DevicePatient>) => Promise<void>;
  /** Rename the selected device. */
  renameDevice: (name: string) => Promise<void>;
  /** Remove (unlink) the selected device. */
  removeDevice: () => Promise<void>;
  /** Push a patient roster to the device API. */
  syncPatients: (patients: DevicePatient[]) => Promise<void>;
  /** Whether the initial load is in progress. */
  isLoading: boolean;
  /** Whether a command is being sent. */
  isSendingCommand: boolean;
  /** The command currently being sent (for UI spinners). */
  activeCommand: RemoteCommand | null;
  /** Last error (cleared on next successful poll). */
  error: string | null;
  /** Whether the device API is configured and reachable. */
  isConnected: boolean;
  /** Force an immediate refresh. */
  refresh: () => Promise<void>;
  /** Latest firmware available for the fleet (null while unknown). */
  latestFirmware: FirmwareInfo | null;
  /** Re-fetch the latest firmware now (e.g. right after publishing one). */
  refreshFirmware: () => Promise<void>;
  /** True when the selected device is not on the latest firmware. */
  firmwareUpdateAvailable: boolean;
  /** OTA lifecycle for the selected device. */
  otaStatus: OtaStatus;
  /** Queue an OTA update to the latest firmware on the selected device. */
  updateFirmware: () => Promise<void>;
  /** Dismiss a finished/failed OTA banner. */
  clearOta: () => void;
}

const DeviceContext = createContext<DeviceContextValue | null>(null);

// Plaud recorders and SATE Pendants have no sate_devices row (they upload through
// the user-authed /sessions path), so listDevices() never returns them. Instead
// we synthesize one virtual, passive device per distinct `plaud-<sn>` /
// `pendant-<id>` serial from the sessions they've synced (can't be commanded/
// OTA'd — driven from the device / the Companion app). Matches "connect it → it
// shows on /devices with its recordings".
function deriveExternalDevices(sessions: UploadedSession[]): ManagedDevice[] {
  const bySerial = new Map<string, UploadedSession[]>();
  for (const s of sessions) {
    const sn = s.device_serial;
    if (!sn?.startsWith('plaud-') && !sn?.startsWith('pendant-')) continue;
    const arr = bySerial.get(sn) ?? [];
    arr.push(s);
    bySerial.set(sn, arr);
  }
  return [...bySerial.entries()].map(([serial, ss]) => {
    const last = ss.reduce((m, s) => (s.at > m ? s.at : m), ss[0].at);
    const pending = ss.filter((s) => !s.processed).length;
    const isPlaud = serial.startsWith('plaud-');
    const kind: ManagedDevice['kind'] = isPlaud ? 'plaud' : 'pendant';
    const short = serial.replace(/^(plaud|pendant)-/, '');
    return {
      id: `${kind}:${serial}`,
      name: `${isPlaud ? 'Plaud' : 'Pendant'} ${short.slice(-4)}`,
      serial,
      fw: isPlaud ? 'Plaud' : 'Pendant',
      online: false,
      last_seen: last,
      pending_sessions: pending,
      kind,
    };
  });
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const POLL_INTERVAL = 4000; // 4 seconds — matches companion app

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [devices, setDevices] = useState<ManagedDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [allSessions, setAllSessions] = useState<UploadedSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingCommand, setIsSendingCommand] = useState(false);
  const [activeCommand, setActiveCommand] = useState<RemoteCommand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [latestFirmware, setLatestFirmware] = useState<FirmwareInfo | null>(null);
  // In-flight OTA keyed by device id: several recorders can be updating at once,
  // and selecting another device must not re-attribute (or drop) their progress.
  const [otaByDevice, setOtaByDevice] = useState<Record<string, { target: string; startedAt: number }>>({});
  const [otaTick, setOtaTick] = useState(0); // forces re-eval of the timeout
  const mountedRef = useRef(true);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // `undefined` = auth hasn't resolved yet.
  const lastUserIdRef = useRef<string | null | undefined>(undefined);
  // Recording ids we've already told react-query about, so a finished session
  // refreshes the Recordings tab exactly once instead of on every 4s poll.
  const seenRecordingsRef = useRef<Set<string> | null>(null);

  const selectedDevice = devices.find((d) => d.id === selectedId) ?? devices[0] ?? null;

  // Sessions are DERIVED, not stored: switching devices must swap the Recent
  // Sessions list in the same render, not one 4s poll later (it used to show the
  // previous device's recordings until the next fetch landed).
  const sessions = useMemo(
    () =>
      selectedDevice
        ? allSessions.filter((s) => s.device_serial === selectedDevice.serial).slice(0, 10)
        : [],
    [allSessions, selectedDevice],
  );

  // ---- Polling ----
  const refresh = useCallback(async () => {
    const configured = await deviceApiService.isConfigured();
    if (!configured) {
      setIsConnected(false);
      setIsLoading(false);
      return;
    }
    try {
      // One unfiltered sessions fetch serves double duty: it discovers Plaud
      // recorders (which have no device row) and lets us slice out the selected
      // device's own recordings client-side — no per-device round trip.
      const [list, allSessions] = await Promise.all([
        deviceApiService.listDevices(),
        deviceApiService.listSessions(),
      ]);
      if (!mountedRef.current) return;
      const merged = [...list, ...deriveExternalDevices(allSessions)];
      setDevices(merged);
      setAllSessions(allSessions);
      setIsConnected(true);
      setError(null);

      // A session that just finished processing has produced a `recordings` row.
      // Push it into the Recordings tab now — the user shouldn't have to click
      // the session here (or reload) for it to show up.
      const ready = new Set(
        allSessions.filter((s) => s.processed && s.recording_id).map((s) => s.recording_id as string),
      );
      const seen = seenRecordingsRef.current;
      if (seen === null) {
        seenRecordingsRef.current = ready; // first poll: baseline, nothing is "new"
      } else {
        let hasNew = false;
        for (const id of ready) if (!seen.has(id)) { hasNew = true; break; }
        seenRecordingsRef.current = ready;
        if (hasNew) queryClient.invalidateQueries({ queryKey: ['recordings'] });
      }
    } catch (e: any) {
      if (mountedRef.current) {
        setError(e?.message ?? 'Failed to reach device server');
        setIsConnected(false);
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [queryClient]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  // Devices, sessions and OTA state all belong to the signed-in account, and this
  // provider sits outside the auth gate. Drop them the moment the account changes:
  // refresh() early-returns while signed out, so without this the previous
  // clinician's devices and patient session names stay in context through logout
  // and are rendered to whoever signs in next.
  useEffect(() => {
    const id = user?.id ?? null;
    const prev = lastUserIdRef.current;
    lastUserIdRef.current = id;
    if (prev === undefined || prev === id) return;
    setDevices([]);
    setAllSessions([]);
    setSelectedId(null);
    setOtaByDevice({});
    setError(null);
    setIsConnected(false);
    setIsLoading(true);
    seenRecordingsRef.current = null; // next poll re-baselines instead of announcing
    refresh();
  }, [user?.id, refresh]);

  // ---- Firmware ----
  // Fetch the latest available firmware once the API is reachable, then refresh
  // it periodically so a freshly published release shows up without a reload.
  const refreshFirmware = useCallback(async () => {
    try {
      const fw = await deviceApiService.getLatestFirmware();
      if (mountedRef.current) setLatestFirmware(fw);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const load = () => {
      deviceApiService
        .getLatestFirmware()
        .then((fw) => { if (!cancelled) setLatestFirmware(fw); })
        .catch(() => { /* non-fatal */ });
    };
    load();
    const timer = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [isConnected]);

  /** The in-flight OTA of the selected device, if any. */
  const activeOta = selectedDevice ? otaByDevice[selectedDevice.id] ?? null : null;

  // Ids whose device now reports the target build, joined so the effect below
  // keys off the value — every 4s poll rebuilds `devices`, and depending on
  // those objects would restart the 6s timer before it could ever fire.
  const landedOtaIds = Object.keys(otaByDevice)
    .filter((id) => devices.some((d) => d.id === id && d.fw === otaByDevice[id].target))
    .join(' ');

  // Clear the in-flight target a few seconds after the device reports it landed,
  // so the "Updated" confirmation shows briefly then collapses.
  useEffect(() => {
    if (!landedOtaIds) return;
    const landed = landedOtaIds.split(' ');
    const t = setTimeout(() => {
      setOtaByDevice((m) => {
        const next = { ...m };
        for (const id of landed) delete next[id];
        return next;
      });
    }, 6000);
    return () => clearTimeout(t);
  }, [landedOtaIds]);

  // While an update is in flight, tick every few seconds so the timeout -> failed
  // transition fires even if nothing else re-renders.
  useEffect(() => {
    if (!activeOta) return;
    const t = setInterval(() => setOtaTick((n) => n + 1), 3000);
    return () => clearInterval(t);
  }, [activeOta]);

  // ---- Actions ----
  const selectDevice = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const updateFirmware = useCallback(async () => {
    if (!selectedDevice || !latestFirmware) return;
    const deviceId = selectedDevice.id;
    setOtaByDevice((m) => ({ ...m, [deviceId]: { target: latestFirmware.version, startedAt: Date.now() } }));
    setError(null);
    try {
      await deviceApiService.updateFirmware(deviceId, {
        url: latestFirmware.url,
        version: latestFirmware.version,
      });
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Firmware update failed');
      setOtaByDevice((m) => {
        const next = { ...m };
        delete next[deviceId];
        return next;
      });
      throw e;
    }
  }, [selectedDevice, latestFirmware, refresh]);

  const clearOta = useCallback(() => {
    if (!selectedDevice) return;
    const deviceId = selectedDevice.id;
    setOtaByDevice((m) => {
      if (!(deviceId in m)) return m;
      const next = { ...m };
      delete next[deviceId];
      return next;
    });
  }, [selectedDevice]);

  const sendCommand = useCallback(
    async (op: RemoteCommand, patient?: Partial<DevicePatient>) => {
      if (!selectedDevice) return;
      setIsSendingCommand(true);
      setActiveCommand(op);
      setError(null);
      try {
        await deviceApiService.sendCommand(selectedDevice.id, op, patient);
        // Refresh to see the result
        await refresh();
      } catch (e: any) {
        setError(e?.message ?? 'Command failed');
        throw e;
      } finally {
        setIsSendingCommand(false);
        setActiveCommand(null);
      }
    },
    [selectedDevice, refresh]
  );

  const renameDevice = useCallback(
    async (name: string) => {
      if (!selectedDevice) return;
      try {
        await deviceApiService.renameDevice(selectedDevice.id, name);
        await refresh();
      } catch (e: any) {
        setError(e?.message ?? 'Rename failed');
        throw e;
      }
    },
    [selectedDevice, refresh]
  );

  const removeDevice = useCallback(async () => {
    if (!selectedDevice) return;
    try {
      await deviceApiService.removeDevice(selectedDevice.id);
      setSelectedId(null);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Remove failed');
      throw e;
    }
  }, [selectedDevice, refresh]);

  const syncPatients = useCallback(async (patients: DevicePatient[]) => {
    try {
      await deviceApiService.setPatients(patients);
    } catch (e: any) {
      setError(e?.message ?? 'Patient sync failed');
      throw e;
    }
  }, []);

  // ---- Derived OTA state for the selected device ----
  const firmwareUpdateAvailable = !!(
    latestFirmware &&
    selectedDevice &&
    (selectedDevice.kind ?? 'sate') === 'sate' && // external devices aren't OTA-flashable from web
    selectedDevice.fw &&                            // unknown fw -> don't nag
    // Only offer an update when the device is on a STRICTLY OLDER build. A device
    // ahead of (or equal to) the published "latest" must not show the banner.
    compareFw(selectedDevice.fw, latestFirmware.version) < 0
  );

  void otaTick; // referenced so the periodic tick recomputes the timeout below
  let otaStatus: OtaStatus = 'current';
  if (activeOta && selectedDevice) {
    const elapsed = Date.now() - activeOta.startedAt;
    if (selectedDevice.fw === activeOta.target) otaStatus = 'done';
    // Stall wins over every in-progress phase: a device that dropped offline to
    // reboot and never returned must still reach 'failed', the only state the
    // banner lets the user dismiss or retry from.
    else if (elapsed > OTA_STALL_TIMEOUT_MS) otaStatus = 'failed';
    else if (selectedDevice.ota_state === 'updating') otaStatus = 'installing';
    else if (!selectedDevice.online) otaStatus = 'rebooting';
    else if (elapsed > OTA_TIMEOUT_MS) otaStatus = 'failed';
    else otaStatus = 'queued';
  } else if (firmwareUpdateAvailable) {
    otaStatus = 'available';
  }

  const value: DeviceContextValue = {
    devices,
    selectedDevice,
    selectDevice,
    sessions,
    sendCommand,
    renameDevice,
    removeDevice,
    syncPatients,
    isLoading,
    isSendingCommand,
    activeCommand,
    error,
    isConnected,
    refresh,
    latestFirmware,
    refreshFirmware,
    firmwareUpdateAvailable,
    otaStatus,
    updateFirmware,
    clearOta,
  };

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDeviceContext(): DeviceContextValue {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDeviceContext must be used within a DeviceProvider');
  return ctx;
}
