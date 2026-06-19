// FirmwarePublishCard — publish a new firmware release from the SATE Recorders
// page. Pick a compiled .bin, give it a version, and it uploads to the firmware
// bucket + becomes the fleet's "latest". Recorders on an older version then show
// the update banner and can be flashed OTA from the device card.

import { useRef, useState } from 'react';
import { useDeviceContext } from '@/contexts/DeviceProvider';
import { deviceApiService } from '@/services/device/deviceApiService';
import { Button } from '@/components/ui/button';
import { UploadCloud, CheckCircle2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';

// Guess "1.1.0" from a file named like sate_1.1.0.bin / firmware-1.1.0.bin.
function versionFromName(name: string): string {
  const m = name.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : '';
}

export function FirmwarePublishCard() {
  const { latestFirmware, refreshFirmware } = useDeviceContext();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = (f: File | null) => {
    setFile(f);
    setResult(null);
    if (f && !version) setVersion(versionFromName(f.name));
  };

  const publish = async () => {
    if (!file || !version.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const fw = await deviceApiService.publishFirmware(file, version.trim(), notes.trim());
      await refreshFirmware();
      setResult({ ok: true, msg: `Published firmware ${fw.version}. Recorders on an older build will show the update.` });
      setFile(null);
      setNotes('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (e) {
      setResult({ ok: false, msg: (e as Error).message || 'Publish failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-gray-500" />
          <span className="font-semibold text-gray-900">Publish firmware</span>
          {latestFirmware && (
            <span className="text-sm text-gray-500">· latest {latestFirmware.version}</span>
          )}
        </div>
        {open ? (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-sm text-gray-600">
            Upload a compiled <code>.bin</code> to make it the fleet's latest version. This does not
            flash anything by itself — each recorder updates from its own device card.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept=".bin,application/octet-stream"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-200"
          />

          <div className="flex gap-3">
            <label className="flex-1 text-sm">
              <span className="block text-gray-700 mb-1">Version</span>
              <input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.1.0"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex-[2] text-sm">
              <span className="block text-gray-700 mb-1">Notes (optional)</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Change Wi-Fi without reset"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
          </div>

          {result && (
            <div
              className={`flex items-start gap-2 text-sm rounded-lg p-2 ${
                result.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
              }`}
            >
              {result.ok ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <span>{result.msg}</span>
            </div>
          )}

          <Button
            onClick={publish}
            disabled={busy || !file || !version.trim()}
            className="bg-gray-900 hover:bg-gray-800 text-white"
          >
            {busy ? 'Publishing…' : 'Publish firmware'}
          </Button>
        </div>
      )}
    </div>
  );
}
