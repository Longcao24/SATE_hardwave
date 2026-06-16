// Convenience hooks for device management — wraps the DeviceProvider context
// with derived state for common UI needs.

import { useMemo } from 'react';
import { useDeviceContext } from '@/contexts/DeviceProvider';

/**
 * Derived device status for UI rendering (status dots, labels, colors).
 */
export function useDeviceStatus() {
  const { selectedDevice } = useDeviceContext();

  return useMemo(() => {
    if (!selectedDevice) {
      return {
        isOnline: false,
        isRecording: false,
        isUploading: false,
        isBusy: false,
        statusLabel: 'No device',
        statusColor: 'gray' as const,
        dotClass: 'device-dot--offline',
      };
    }

    const state = selectedDevice.state ?? 'idle';
    const online = selectedDevice.online;
    const isRecording = state === 'recording';
    const isUploading = state === 'uploading';
    const isBusy = isRecording || isUploading;

    let statusLabel: string;
    let statusColor: 'green' | 'red' | 'blue' | 'amber' | 'gray';
    let dotClass: string;

    if (isRecording) {
      statusLabel = 'Recording';
      statusColor = 'red';
      dotClass = 'device-dot--recording';
    } else if (isUploading) {
      statusLabel = 'Uploading';
      statusColor = 'blue';
      dotClass = 'device-dot--uploading';
    } else if (online) {
      statusLabel = 'Online';
      statusColor = 'green';
      dotClass = 'device-dot--online';
    } else {
      statusLabel = 'Offline';
      statusColor = 'amber';
      dotClass = 'device-dot--offline';
    }

    return { isOnline: online, isRecording, isUploading, isBusy, statusLabel, statusColor, dotClass };
  }, [selectedDevice]);
}

/**
 * Total pending sessions across all devices (for sidebar badge).
 */
export function useTotalPendingSessions() {
  const { devices } = useDeviceContext();
  return useMemo(
    () => devices.reduce((sum, d) => sum + (d.pending_sessions || 0), 0),
    [devices]
  );
}

/**
 * Helper to format WAV byte count into a human-readable duration.
 * Assumes 16-bit mono PCM with 44-byte WAV header.
 */
export function formatSessionDuration(bytes: number, sampleRate = 16000): string {
  const pcm = Math.max(0, bytes - 44);
  const totalSeconds = Math.round(pcm / (sampleRate * 2));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/**
 * Format an ISO timestamp into a human-readable "time ago" string.
 */
export function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
