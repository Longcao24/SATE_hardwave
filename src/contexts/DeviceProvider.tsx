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
} from '@/services/device/deviceTypes';

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

  // ---- Actions ----
  const selectDevice = useCallback((id: string) => {
    setSelectedId(id);
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
