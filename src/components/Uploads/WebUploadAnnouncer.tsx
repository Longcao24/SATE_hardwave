// Mounted ONCE, next to UsageTracker in App.tsx, for every signed-in page.
//
// Two jobs that must not be repeated per list: (1) keep the in-flight query alive app-wide and
// re-read it the moment this tab hands a file over (serverProcessing fires WEB_UPLOADS_CHANGED),
// and (2) when an upload finishes WITH a recording, refresh the recordings list and say so — with
// an Open action, since the clinician may be on any page by then, or may have closed the upload
// form long ago.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { useInFlightUploads, inFlightKey, onUploadsReady, type ReadyUpload } from '@/hooks/useInFlightUploads';
import { WEB_UPLOADS_CHANGED } from '@/services/DataService/serverProcessing';

/** Longer than the app's 3 s toast: this one carries an action, and it has to be readable first. */
const READY_TOAST_MS = 10_000;

export function WebUploadAnnouncer() {
  const { user } = useAuth();
  const uid = user?.id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [ready, setReady] = useState<ReadyUpload | null>(null);

  // Subscribing is what keeps the poll running on pages that show no list (e.g. Devices).
  useInFlightUploads();

  useEffect(() => {
    if (!uid) return;
    const refresh = () => { queryClient.invalidateQueries({ queryKey: inFlightKey(uid) }); };
    window.addEventListener(WEB_UPLOADS_CHANGED, refresh);
    return () => window.removeEventListener(WEB_UPLOADS_CHANGED, refresh);
  }, [uid, queryClient]);

  useEffect(() => {
    if (!uid) return;
    return onUploadsReady((done) => {
      // The new recording is the one the user is waiting for; every list reading this key
      // (sidebar, dashboard, patient page) picks it up.
      queryClient.invalidateQueries({ queryKey: ['recordings', uid] });
      // Several at once: announce the newest; the rest are in the list a click away.
      setReady(done[done.length - 1]);
    });
  }, [uid, queryClient]);

  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => setReady(null), READY_TOAST_MS);
    return () => window.clearTimeout(t);
  }, [ready]);

  if (!ready) return null;

  // Same look as the sidebar's ToastNotification (success), plus the action. data-usage-mask: the
  // file name is the clinician's own and is often a child's name.
  return (
    <div
      data-usage-mask
      role="status"
      className="fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm bg-green-100 border border-green-200 text-green-800"
    >
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full flex items-center justify-center bg-green-200 flex-shrink-0">✓</div>
        <p className="text-sm font-medium min-w-0 truncate" title={ready.fileName}>{ready.fileName} is ready</p>
        <button
          type="button"
          data-track="Open ready upload"
          onClick={() => { const id = ready.recordingId; setReady(null); navigate(`/report/${id}`); }}
          className="ml-2 px-2 py-1 text-xs font-semibold text-green-900 bg-green-200 rounded-md hover:bg-green-300 flex-shrink-0"
        >
          Open
        </button>
        <button
          type="button"
          data-track="Close ready toast"
          onClick={() => setReady(null)}
          className="p-0.5 text-green-700 hover:text-green-900 flex-shrink-0"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
