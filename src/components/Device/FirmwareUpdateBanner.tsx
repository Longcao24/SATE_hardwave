// FirmwareUpdateBanner — shows on the SATE Recorders page when the selected
// device is not on the latest firmware. Lets the user push an OTA update and
// watch its progress (queued -> installing -> rebooting -> done).

import { useDeviceContext } from '@/contexts/DeviceProvider';
import { Button } from '@/components/ui/button';
import { Download, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

const PROGRESS_LABEL: Record<string, string> = {
  queued: 'Sent to device — waiting for it to start…',
  installing: 'Downloading & flashing firmware…',
  rebooting: 'Rebooting into the new firmware…',
};

// Rough progress fill per stage (real % isn't available during a blocking flash).
const PROGRESS_PCT: Record<string, number> = {
  queued: 12,
  installing: 55,
  rebooting: 85,
  done: 100,
};

export function FirmwareUpdateBanner() {
  const {
    selectedDevice,
    latestFirmware,
    otaStatus,
    updateFirmware,
    clearOta,
    isSendingCommand,
  } = useDeviceContext();

  if (!selectedDevice || !latestFirmware) return null;
  if (otaStatus === 'current') return null;

  const target = latestFirmware.version;

  // Firmware updates are user-initiated only. Confirm so a stray/double click
  // can never start an over-the-air flash without an explicit decision.
  const confirmUpdate = () => {
    const name = selectedDevice.name || selectedDevice.serial;
    if (window.confirm(`Install firmware ${target} on "${name}"? The recorder will download the update and restart.`)) {
      updateFirmware();
    }
  };

  // --- Failed: timed out without starting (usually a missing/bad image) ---
  if (otaStatus === 'failed') {
    return (
      <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-red-900">Update to {target} didn’t start</p>
          <p className="text-sm text-red-700">
            The device didn’t begin updating. Check the firmware image is published, then retry.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => clearOta()} className="border-red-200 text-red-700">
            Dismiss
          </Button>
          <Button
            onClick={confirmUpdate}
            disabled={isSendingCommand || !selectedDevice.online}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // --- Update available: notice + action ---
  if (otaStatus === 'available') {
    return (
      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
        <Download className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-blue-900">Firmware {target} available</p>
          <p className="text-sm text-blue-700">
            Installed: {selectedDevice.fw || '—'}
            {latestFirmware.notes ? ` · ${latestFirmware.notes}` : ''}
          </p>
        </div>
        <Button
          onClick={confirmUpdate}
          disabled={isSendingCommand || !selectedDevice.online}
          className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
        >
          {selectedDevice.online ? 'Update firmware' : 'Device offline'}
        </Button>
      </div>
    );
  }

  // --- In progress / done: staged progress bar ---
  const isDone = otaStatus === 'done';
  const pct = PROGRESS_PCT[otaStatus] ?? 10;

  return (
    <div
      className={`mb-4 rounded-xl border p-4 ${
        isDone ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {isDone ? (
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
        ) : (
          <Loader2 className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
        )}
        <p className={`font-semibold ${isDone ? 'text-green-900' : 'text-amber-900'}`}>
          {isDone ? `Updated to ${target}` : `Updating to ${target}`}
        </p>
      </div>
      <div className="h-2 rounded-full bg-white/70 overflow-hidden">
        <div
          className={`h-full transition-all duration-700 ${
            isDone ? 'bg-green-500' : 'bg-amber-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!isDone && (
        <p className="text-sm text-amber-700 mt-2">{PROGRESS_LABEL[otaStatus]}</p>
      )}
    </div>
  );
}
