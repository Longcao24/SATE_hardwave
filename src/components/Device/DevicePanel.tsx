// DevicePanel — the main device management UI.
// Premium glassmorphism card with animated status ring, remote commands,
// recent sessions, and offline banner. Lives on the /devices page.

import { useState, useRef, useEffect } from 'react';
import { useDeviceContext } from '@/contexts/DeviceProvider';
import { useDeviceStatus } from '@/hooks/useDevices';
import { RecordSessionModal } from './RecordSessionModal';
import { DeviceSettingsModal } from './DeviceSettingsModal';
import { DeviceFrame } from './DeviceFrame';
import { PlaudDeviceGraphic } from './PlaudDeviceGraphic';
import { PendantDeviceGraphic } from './PendantDeviceGraphic';
import {
  RefreshCw,
  Settings,
  WifiOff,
  Mic,
  Upload,
  RotateCcw,
  ChevronDown,
  Smartphone,
  Activity,
  Bluetooth,
  CheckCircle2,
} from 'lucide-react';

export function DevicePanel() {
  const {
    devices,
    selectedDevice,
    selectDevice,
    sendCommand,
    sessions,
    isLoading,
    isSendingCommand,
    activeCommand,
    error,
  } = useDeviceContext();

  // Plaud + Pendant are passive external devices (no Wi-Fi commands/OTA).
  const isPlaud = selectedDevice?.kind === 'plaud' || selectedDevice?.kind === 'pendant';
  const extLabel = selectedDevice?.kind === 'pendant' ? 'Pendant' : 'Plaud';

  const { isOnline, isRecording, isUploading, isBusy, statusLabel, statusColor } = useDeviceStatus();

  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDeviceDropdown(false);
      }
    };
    if (showDeviceDropdown) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDeviceDropdown]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const handleCommand = async (op: 'sync_now' | 'reload_patients' | 'reboot', msg: string) => {
    try {
      await sendCommand(op);
      setToast(msg);
    } catch {
      setToast('Command failed — check connection');
    }
  };

  // -- Loading state --
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Connecting to device server…</p>
        </div>
      </div>
    );
  }

  // -- No devices state --
  if (devices.length === 0) {
    return (
      <div className="device-panel-empty">
        <div className="device-status-ring device-status-ring--idle">
          <div className="device-ring-track" />
          <div className="device-ring-dot device-dot--offline" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mt-6">Set up your SATE Recorder</h2>
        <p className="text-gray-500 text-sm mt-2 max-w-sm text-center leading-relaxed">
          Power on the recorder and pair it using the SATE Companion app on your phone.
          Once it's on Wi-Fi, manage it from here.
        </p>
        <div className="flex items-center gap-2 mt-4 text-blue-600">
          <Smartphone className="w-4 h-4" />
          <span className="text-sm font-medium">Requires SATE Companion app</span>
        </div>
      </div>
    );
  }

  const statusColorMap: Record<string, string> = {
    green: '#22c55e',
    red: '#ef4444',
    blue: '#3b82f6',
    amber: '#f59e0b',
    gray: '#9ca3af',
  };

  return (
    <div className="device-panel">
      {/* ---- Header: device selector + settings ---- */}
      <div className="device-panel-header">
        <div className="flex-1">
          <p className="text-xs font-bold tracking-widest text-gray-400 uppercase">{isPlaud ? `${extLabel} device` : 'SATE Recorder'}</p>
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => devices.length > 1 && setShowDeviceDropdown(!showDeviceDropdown)}
              className="flex items-center gap-1 mt-1"
            >
              <h2 className="text-xl font-bold text-gray-900">
                {selectedDevice?.name || 'Recorder'}
              </h2>
              {devices.length > 1 && <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {showDeviceDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-20 min-w-[200px]">
                {devices.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { selectDevice(d.id); setShowDeviceDropdown(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${
                      d.id === selectedDevice?.id ? 'text-blue-600 font-semibold' : 'text-gray-700'
                    }`}
                  >
                    <span>{d.name}</span>
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: d.online ? '#22c55e' : '#f59e0b' }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: isPlaud ? '#6366f1' : statusColorMap[statusColor] }}
            />
            <span
              className="text-xs font-semibold"
              style={{ color: isPlaud ? '#6366f1' : statusColorMap[statusColor] }}
            >
              {isPlaud ? 'Paired' : statusLabel}
            </span>
          </div>
        </div>
        {!isPlaud && (
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="Recorder settings"
          >
            <Settings className="w-5 h-5 text-gray-500" />
          </button>
        )}
      </div>

      {/* ---- Plaud: passive card — recordings ride in over BLE via the
              Companion app; recording is driven on the Plaud device itself,
              so there are no remote command/OTA controls here. ---- */}
      {isPlaud ? (
        <div className="device-hero">
          {selectedDevice?.kind === 'pendant' ? (
            <PendantDeviceGraphic width={170} />
          ) : (
            <PlaudDeviceGraphic width={190} />
          )}
          <div className="mt-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span className="text-sm font-bold text-indigo-600">Paired</span>
            <Bluetooth className="w-4 h-4 text-indigo-500" />
          </div>
          <span className="mt-1 text-[11px] text-gray-400 truncate max-w-full">
            {selectedDevice?.serial}
          </span>
          <p className="text-gray-500 text-sm mt-4 text-center max-w-sm">
            Recordings sync from your {extLabel} through the SATE Companion app
            over Bluetooth — audio transfers here and runs the same analysis.
          </p>

          <div className="device-actions-row mt-5">
            <div className="device-action-card !cursor-default">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="device-action-label">Synced</span>
              <span className="device-action-sub">{sessions.length} recording{sessions.length === 1 ? '' : 's'}</span>
            </div>
            <div className="device-action-card !cursor-default">
              {selectedDevice && selectedDevice.pending_sessions > 0 ? (
                <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              )}
              <span className="device-action-label">Analysis</span>
              <span className="device-action-sub">
                {selectedDevice && selectedDevice.pending_sessions > 0
                  ? `${selectedDevice.pending_sessions} processing`
                  : 'All processed'}
              </span>
            </div>
            <div className="device-action-card !cursor-default">
              <Smartphone className="w-5 h-5 text-indigo-500" />
              <span className="device-action-label">Control</span>
              <span className="device-action-sub">On device / app</span>
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* ---- Hero: the real recorder, live on its screen ---- */}
      <div className="device-hero">
        <DeviceFrame width={300}>
          <div className="w-full h-full flex flex-col items-center justify-center px-3 py-4 text-center">
            <span className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">
              SATE
            </span>
            <div
              className={`mt-3 flex items-center justify-center rounded-full ${
                isRecording ? 'bg-red-50' : isUploading ? 'bg-blue-50' : isOnline ? 'bg-green-50' : 'bg-gray-100'
              }`}
              style={{ width: 64, height: 64 }}
            >
              {isRecording ? (
                <Activity className="w-7 h-7 text-red-500 animate-pulse" />
              ) : isUploading ? (
                <Upload className="w-7 h-7 text-blue-500 animate-bounce" />
              ) : isOnline ? (
                <Mic className="w-7 h-7 text-green-600" />
              ) : (
                <WifiOff className="w-7 h-7 text-gray-400" />
              )}
            </div>
            <span
              className="mt-3 text-sm font-bold leading-tight"
              style={{ color: statusColorMap[statusColor] }}
            >
              {statusLabel}
            </span>
            <span className="mt-1 text-[11px] text-gray-400 truncate max-w-full">
              {selectedDevice?.name || 'Recorder'}
            </span>
          </div>
        </DeviceFrame>
        <p className="text-gray-500 text-sm mt-5 text-center">
          {isRecording
            ? 'Capturing audio on the recorder…'
            : isUploading
            ? 'Sending the session to SATE…'
            : isOnline
            ? 'Tap record and the recorder captures a session'
            : 'Off Wi-Fi — use the Companion app for Bluetooth sync'}
        </p>

        {/* Record button */}
        <button
          onClick={() => setShowRecordModal(true)}
          disabled={!isOnline || isBusy}
          className="device-record-btn"
        >
          {isRecording ? (
            <span className="flex items-center gap-2"><Activity className="w-4 h-4 animate-pulse" /> Recording…</span>
          ) : isUploading ? (
            <span className="flex items-center gap-2"><Upload className="w-4 h-4 animate-bounce" /> Uploading…</span>
          ) : (
            <span className="flex items-center gap-2"><Mic className="w-4 h-4" /> Record a Session</span>
          )}
        </button>
      </div>

      {/* ---- Quick actions ---- */}
      <div className="device-actions-row">
        <button
          onClick={() => handleCommand('sync_now', 'Recorder is syncing sessions')}
          disabled={isSendingCommand && activeCommand === 'sync_now'}
          className="device-action-card"
        >
          {activeCommand === 'sync_now' ? (
            <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
          ) : (
            <Upload className="w-5 h-5 text-blue-500" />
          )}
          <span className="device-action-label">Sync</span>
          <span className="device-action-sub">
            {selectedDevice && selectedDevice.pending_sessions > 0
              ? `${selectedDevice.pending_sessions} waiting`
              : 'All sent'}
          </span>
        </button>

        <button
          onClick={() => handleCommand('reload_patients', 'Patient list refreshed')}
          disabled={!isOnline || (isSendingCommand && activeCommand === 'reload_patients')}
          className="device-action-card"
        >
          {activeCommand === 'reload_patients' ? (
            <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
          ) : (
            <RefreshCw className="w-5 h-5 text-blue-500" />
          )}
          <span className="device-action-label">Patients</span>
          <span className="device-action-sub">Refresh list</span>
        </button>

        <button
          onClick={() => handleCommand('reboot', 'Restarting recorder')}
          disabled={!isOnline || (isSendingCommand && activeCommand === 'reboot')}
          className="device-action-card"
        >
          {activeCommand === 'reboot' ? (
            <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
          ) : (
            <RotateCcw className="w-5 h-5 text-blue-500" />
          )}
          <span className="device-action-label">Restart</span>
          <span className="device-action-sub">Reboot device</span>
        </button>
      </div>
      </>
      )}

      {/* ---- Offline banner ---- */}
      {selectedDevice && !isOnline && !isPlaud && (
        <div className="device-offline-banner">
          <WifiOff className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-amber-700 text-xs">
            This recorder is off Wi-Fi. Use the <strong>SATE Companion</strong> app on your phone for Bluetooth sync.
          </p>
        </div>
      )}

      {/* ---- Toast ---- */}
      {toast && (
        <div className="device-toast">
          {toast}
        </div>
      )}

      {/* ---- Error ---- */}
      {error && !toast && (
        <div className="device-error-banner">
          <p className="text-red-600 text-xs">{error}</p>
        </div>
      )}

      {/* ---- Modals ---- */}
      <RecordSessionModal
        isOpen={showRecordModal}
        onClose={() => setShowRecordModal(false)}
      />
      {selectedDevice && !isPlaud && (
        <DeviceSettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  );
}
