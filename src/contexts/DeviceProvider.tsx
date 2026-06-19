// DeviceProvider — React context for SATE Recorder fleet management.
// Auto-polls the device API every 4 seconds (matching the companion app)
// and provides device state, commands, and session data to the component tree.

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { deviceApiService } from '@/services/device/deviceApiService';
import type {
  ManagedDevice,
  UploadedSession,
  RemoteCommand,
  DevicePatient,
  FirmwareInfo,
} from '@/services/device/deviceTypes';

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

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const POLL_INTERVAL = 4000; // 4 seconds — matches companion app

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [devices, setDevices] = useState<ManagedDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<UploadedSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingCommand, setIsSendingCommand] = useState(false);
  const [activeCommand, setActiveCommand] = useState<RemoteCommand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [latestFirmware, setLatestFirmware] = useState<FirmwareInfo | null>(null);
  const [otaTarget, setOtaTarget] = useState<string | null>(null);
  const [otaStartedAt, setOtaStartedAt] = useState<number | null>(null);
  const [otaTick, setOtaTick] = useState(0); // forces re-eval of the timeout
  const mountedRef = useRef(true);

  const selectedDevice = devices.find((d) => d.id === selectedId) ?? devices[0] ?? null;

  // ---- Polling ----
  const refresh = useCallback(async () => {
    const configured = await deviceApiService.isConfigured();
    if (!configured) {
      setIsConnected(false);
      setIsLoading(false);
      return;
    }
    try {
      const list = await deviceApiService.listDevices();
      if (!mountedRef.current) return;
      setDevices(list);
      setIsConnected(true);
      setError(null);

      // Load sessions for the selected device
      const current = list.find((d) => d.id === selectedId) ?? list[0];
      if (current) {
        const ups = await deviceApiService.listSessions(current.serial);
        if (mountedRef.current) {
          setSessions(ups.slice(0, 10));
        }
      } else {
        setSessions([]);
      }
    } catch (e: any) {
      if (mountedRef.current) {
        setError(e?.message ?? 'Failed to reach device server');
        setIsConnected(false);
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

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

  // Clear the in-flight target a few seconds after the device reports it landed,
  // so the "Updated" confirmation shows briefly then collapses.
  useEffect(() => {
    if (otaTarget && selectedDevice && selectedDevice.fw === otaTarget) {
      const t = setTimeout(() => { setOtaTarget(null); setOtaStartedAt(null); }, 6000);
      return () => clearTimeout(t);
    }
  }, [otaTarget, selectedDevice]);

  // While an update is in flight, tick every few seconds so the timeout -> failed
  // transition fires even if nothing else re-renders.
  useEffect(() => {
    if (!otaTarget) return;
    const t = setInterval(() => setOtaTick((n) => n + 1), 3000);
    return () => clearInterval(t);
  }, [otaTarget]);

  // ---- Actions ----
  const selectDevice = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const updateFirmware = useCallback(async () => {
    if (!selectedDevice || !latestFirmware) return;
    setOtaTarget(latestFirmware.version);
    setOtaStartedAt(Date.now());
    setError(null);
    try {
      await deviceApiService.updateFirmware(selectedDevice.id, {
        url: latestFirmware.url,
        version: latestFirmware.version,
      });
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Firmware update failed');
      setOtaTarget(null);
      setOtaStartedAt(null);
      throw e;
    }
  }, [selectedDevice, latestFirmware, refresh]);

  const clearOta = useCallback(() => {
    setOtaTarget(null);
    setOtaStartedAt(null);
  }, []);

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
    latestFirmware && selectedDevice && selectedDevice.fw !== latestFirmware.version
  );

  void otaTick; // referenced so the periodic tick recomputes the timeout below
  let otaStatus: OtaStatus = 'current';
  if (otaTarget && selectedDevice) {
    const timedOut = otaStartedAt != null && Date.now() - otaStartedAt > OTA_TIMEOUT_MS;
    if (selectedDevice.fw === otaTarget) otaStatus = 'done';
    else if (selectedDevice.ota_state === 'updating') otaStatus = 'installing';
    else if (!selectedDevice.online) otaStatus = 'rebooting';
    else if (timedOut) otaStatus = 'failed';
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
