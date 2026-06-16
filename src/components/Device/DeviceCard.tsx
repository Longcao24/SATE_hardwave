// DeviceCard — compact device summary for the Dashboard grid.
// Shows status dot, name, pending sessions, and firmware version.

import type { ManagedDevice } from '@/services/device/deviceTypes';
import { timeAgo } from '@/hooks/useDevices';
import { Wifi, WifiOff, Radio, Upload } from 'lucide-react';

interface DeviceCardProps {
  device: ManagedDevice;
  onClick?: () => void;
}

export function DeviceCard({ device, onClick }: DeviceCardProps) {
  const state = device.state ?? 'idle';
  const isRecording = state === 'recording';
  const isUploading = state === 'uploading';

  let statusDot: string;
  let statusLabel: string;
  let StatusIcon: typeof Wifi;

  if (isRecording) {
    statusDot = 'bg-red-500';
    statusLabel = 'Recording';
    StatusIcon = Radio;
  } else if (isUploading) {
    statusDot = 'bg-blue-500';
    statusLabel = 'Uploading';
    StatusIcon = Upload;
  } else if (device.online) {
    statusDot = 'bg-green-500';
    statusLabel = 'Online';
    StatusIcon = Wifi;
  } else {
    statusDot = 'bg-amber-400';
    statusLabel = 'Offline';
    StatusIcon = WifiOff;
  }

  return (
    <button
      onClick={onClick}
      className="device-card group"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            device.online ? 'bg-blue-50' : 'bg-gray-100'
          }`}>
            <StatusIcon className={`w-5 h-5 ${
              isRecording ? 'text-red-500 animate-pulse' :
              isUploading ? 'text-blue-500' :
              device.online ? 'text-blue-600' : 'text-gray-400'
            }`} />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
              {device.name}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{device.serial}</p>
          </div>
        </div>
        <span className={`w-2.5 h-2.5 rounded-full mt-1 ${statusDot} ${
          isRecording ? 'animate-pulse' : ''
        }`} />
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">{statusLabel}</span>
        </div>
        {device.pending_sessions > 0 ? (
          <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
            {device.pending_sessions} pending
          </span>
        ) : (
          <span className="text-xs text-gray-400">{timeAgo(device.last_seen)}</span>
        )}
      </div>
    </button>
  );
}
