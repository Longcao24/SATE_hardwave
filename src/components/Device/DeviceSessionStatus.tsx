// DeviceSessionStatus — read-only list of sessions the recorder uploaded, with
// their live processing state. No manual sync/import step: the server auto-runs
// the AI bridge, so this just shows progress (Received → Processing → Ready).
// Sessions whose audio held no speech are marked "No text in audio" (no report
// is created) and can be deleted from here.

import { useState } from 'react';
import type { UploadedSession } from '@/services/device/deviceTypes';
import { formatSessionDuration, timeAgo } from '@/hooks/useDevices';
import { CheckCircle2, Loader2, AlertCircle, FileAudio, MicOff, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { deviceApiService } from '@/services/device/deviceApiService';
import { useDeviceContext } from '@/contexts/DeviceProvider';

interface DeviceSessionStatusProps {
  sessions: UploadedSession[];
}

type Status = 'processing' | 'ready' | 'failed' | 'no_text';

const statusOf = (s: UploadedSession): Status => {
  if (s.no_text) return 'no_text';
  if (s.process_error) return 'failed';
  if (s.processed && s.recording_id) return 'ready';
  return 'processing';
};

export function DeviceSessionStatus({ sessions }: DeviceSessionStatusProps) {
  const navigate = useNavigate();
  const { refresh } = useDeviceContext();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, s: UploadedSession) => {
    e.stopPropagation();
    if (deletingId) return;
    if (!window.confirm(`Delete session ${s.session_number}? This removes the uploaded audio and cannot be undone.`)) {
      return;
    }
    setDeletingId(s.id);
    try {
      await deviceApiService.deleteSession(s.id);
      await refresh();
    } catch (err) {
      console.error('Failed to delete session:', err);
      window.alert('Could not delete the session. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mt-6">
      <h3 className="text-sm font-bold text-gray-900 mb-1">Recent Sessions</h3>
      <p className="text-xs text-gray-400 mb-3">
        Uploaded to SATE and processed automatically — no sync needed.
      </p>
      <div className="device-sessions-list">
        {sessions.length === 0 ? (
          <div className="text-center py-8">
            <FileAudio className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">
              No sessions yet. Record on the device — it shows up here automatically.
            </p>
          </div>
        ) : (
          sessions.map((s, i) => {
            const status = statusOf(s);
            const ready = status === 'ready';
            const busy = deletingId === s.id;
            return (
              <div
                key={s.id}
                className={`device-session-row ${i > 0 ? 'border-t border-gray-100' : ''} ${ready ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                onClick={ready ? () => navigate(`/report/${s.recording_id}`) : undefined}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    Session {s.session_number} · {s.patient_id}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatSessionDuration(s.bytes, s.sample_rate)} · {timeAgo(s.at)}
                  </p>
                </div>

                {status === 'processing' && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 rounded-lg">
                    <Loader2 className="w-3 h-3 animate-spin" /> Received · Processing
                  </span>
                )}
                {status === 'ready' && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-50 rounded-lg">
                    <CheckCircle2 className="w-3 h-3" /> Ready · View
                  </span>
                )}
                {status === 'no_text' && (
                  <span
                    title="The AI found no speech in this audio, so no report was created."
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg"
                  >
                    <MicOff className="w-3 h-3" /> No text in audio
                  </span>
                )}
                {status === 'failed' && (
                  <span
                    title={s.process_error || 'Processing failed'}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 rounded-lg"
                  >
                    <AlertCircle className="w-3 h-3" /> Failed
                  </span>
                )}

                <button
                  type="button"
                  onClick={(e) => handleDelete(e, s)}
                  disabled={busy}
                  title="Delete this session"
                  className="ml-2 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
