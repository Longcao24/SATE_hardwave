// DeviceSettingsModal — admin panel for a recorder device.
// Rename, view firmware/serial/IP, unlink with confirmation.

import React, { useState } from 'react';
import { useDeviceContext } from '@/contexts/DeviceProvider';
import { X, Edit3, Trash2, Cpu, Wifi, Hash, Clock, AlertTriangle } from 'lucide-react';
import { timeAgo } from '@/hooks/useDevices';

interface DeviceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DeviceSettingsModal({ isOpen, onClose }: DeviceSettingsModalProps) {
  const { selectedDevice, renameDevice, removeDevice } = useDeviceContext();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !selectedDevice) return null;

  const handleRename = async () => {
    const name = newName.trim();
    if (!name) return;
    setIsProcessing(true);
    setError(null);
    try {
      await renameDevice(name);
      setIsRenaming(false);
      setNewName('');
    } catch (e: any) {
      setError(e?.message || 'Rename failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnlink = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      await removeDevice();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Remove failed');
    } finally {
      setIsProcessing(false);
      setShowUnlinkConfirm(false);
    }
  };

  const infoRows = [
    { icon: Hash, label: 'Serial', value: selectedDevice.serial },
    { icon: Cpu, label: 'Firmware', value: selectedDevice.fw || '—' },
    { icon: Wifi, label: 'IP Address', value: selectedDevice.ip || '—' },
    { icon: Clock, label: 'Last Seen', value: timeAgo(selectedDevice.last_seen) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Recorder Settings</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Device name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Device Name
            </label>
            {isRenaming ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={selectedDevice.name}
                  className="flex-1 px-3 py-2 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                />
                <button
                  onClick={handleRename}
                  disabled={isProcessing || !newName.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => { setIsRenaming(false); setNewName(''); }}
                  className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">{selectedDevice.name}</span>
                <button
                  onClick={() => { setIsRenaming(true); setNewName(selectedDevice.name); }}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Edit3 className="w-3 h-3" /> Rename
                </button>
              </div>
            )}
          </div>

          {/* Info rows */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            {infoRows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-500">{label}</span>
                </div>
                <span className="text-xs font-mono text-gray-700">{value}</span>
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          {/* Unlink */}
          <div className="pt-2 border-t border-gray-100">
            {showUnlinkConfirm ? (
              <div className="bg-red-50 rounded-xl p-4">
                <div className="flex items-start gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-700">
                    Unlink <strong>{selectedDevice.name}</strong>? The recorder will need to be re-provisioned with the Companion app.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleUnlink}
                    disabled={isProcessing}
                    className="flex-1 py-2 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {isProcessing ? 'Removing…' : 'Unlink'}
                  </button>
                  <button
                    onClick={() => setShowUnlinkConfirm(false)}
                    className="flex-1 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowUnlinkConfirm(true)}
                className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Unlink this recorder
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
