import React, { useCallback, useEffect, useRef, useState } from 'react';
import { recordingLabel } from '@/services/recordingName';
import { useNavigate } from 'react-router-dom';
import {
  FileAudio,
  Calendar,
  ArrowRight,
  ChevronDown,
  Check,
  UserPlus,
  Loader2,
  StickyNote,
} from 'lucide-react';
import type { TimeFilter } from '../types';
import { formatDate } from '../utils';
import { notesApiService, isWorking } from '@/services/notesApiService';
import { deviceApiService } from '@/services/device/deviceApiService';
import type { Patient } from '@/services/patientService';
import type { Recording } from '@/hooks/useRecordings';

interface StandaloneRecordingsProps {
  recordings: Recording[] | undefined;
  timeFilter: TimeFilter;
  patients: Patient[];
  loadingPatients: boolean;
  /** Opens the assign-to-patient dialog for this recording. Owned by the dashboard so the
   *  modal, the patient list and the cache invalidation all live in one place. */
  onAssignPatient: (recordingId: string) => void;
}

type NoteMark = { id: string; status: string; title: string | null };

const StandaloneRecordings: React.FC<StandaloneRecordingsProps> = ({
  recordings,
  timeFilter,
  onAssignPatient,
}) => {
  const navigate = useNavigate();

  // Voice Notes is off unless an admin enabled it for this account, so a clinical user never
  // sees that the feature exists — same rule as the sidebar and the Devices tab. Default false
  // and only ever turned on by the server's answer.
  const [notesOn, setNotesOn] = useState(false);
  const [noteOf, setNoteOf] = useState<Record<string, NoteMark>>({});
  const [makingFor, setMakingFor] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const truncateFileName = (fileName: string, maxLength: number = 60) => {
    if (fileName.length <= maxLength) return fileName;
    const extension = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '';
    const nameWithoutExt = fileName.includes('.') ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName;
    const truncatedName = nameWithoutExt.substring(0, maxLength - extension.length - 3);
    return `${truncatedName}...${extension}`;
  };

  const standaloneRecordings = recordings?.filter(recording => !recording.patient_id) || [];
  const filteredStandaloneRecordings = standaloneRecordings.filter(recording => {
    if (timeFilter === 'all') return true;

    const recordingDate = new Date(recording.created_at);
    const now = new Date();
    const daysDiff = (now.getTime() - recordingDate.getTime()) / (1000 * 60 * 60 * 24);

    if (timeFilter === 'week') return daysDiff <= 7;
    if (timeFilter === 'month') return daysDiff <= 30;
    return true;
  });

  const visible = filteredStandaloneRecordings.slice(0, 10);

  useEffect(() => {
    let cancelled = false;
    notesApiService.access().then((a) => { if (!cancelled) setNotesOn(Boolean(a?.enabled)); });
    return () => { cancelled = true; };
  }, []);

  // Which of these recordings already HAVE a note. Keyed by session id, because the notes
  // service keys everything off the device session, never the recording.
  const sessionIds = visible.map((r) => r.source_session_id).filter(Boolean) as string[];
  const sessionKey = sessionIds.join(',');

  const loadNotes = useCallback(async () => {
    if (!notesOn || !sessionKey) return;
    try {
      const res = await notesApiService.bySource(sessionKey.split(','));
      setNoteOf(res.notes as Record<string, NoteMark>);
    } catch { /* the notes lane being down must not break the dashboard */ }
  }, [notesOn, sessionKey]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  // Close the dropdown on any outside click.
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openMenu]);

  const makeNote = async (recording: Recording) => {
    const sessionId = recording.source_session_id;
    if (!sessionId) return;
    setOpenMenu(null);

    const existing = noteOf[sessionId];
    if (existing) { navigate(`/notes#${existing.id}`); return; }

    setMakingFor(recording.id);
    try {
      // from-session needs the serial and take number, which live on the SESSION, not on the
      // recording. Fetched on CLICK rather than on page load: only a fraction of rows ever get
      // used this way, and the dashboard should not pay for a session list it may never need.
      const sessions = await deviceApiService.listSessions();
      const s = sessions.find((x) => x.id === sessionId);
      if (!s) throw new Error('That session no longer exists on the server.');
      const res = await notesApiService.fromSession({
        session_id: s.id,
        device_serial: s.device_serial,
        session_number: s.session_number,
        flags: Array.isArray(s.flags) ? s.flags : undefined,
      });
      await loadNotes();
      navigate(`/notes#${res.id}`);
    } catch (err) {
      window.alert(`Could not create a meeting note: ${(err as Error).message}`);
    } finally {
      setMakingFor(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mt-8">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">Standalone Recordings</h2>
        <p className="text-sm text-gray-600 mt-1">Recordings not linked to any patient</p>
      </div>

      {filteredStandaloneRecordings.length === 0 ? (
        <div className="p-12 text-center">
          <FileAudio className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">No standalone recordings found</p>
          <p className="text-sm text-gray-400">Create one-time recordings that don't require patient profiles</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {visible.map((recording) => {
            const sessionId = recording.source_session_id || null;
            const note = sessionId ? noteOf[sessionId] : undefined;
            const busy = makingFor === recording.id || (note && isWorking(note.status));

            return (
              <div
                key={recording.id}
                className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => navigate(`/report/${recording.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-medium text-gray-900 mb-1 truncate" title={recording.recording_name || recording.file_name}>
                      {truncateFileName(recordingLabel(recording.recording_name || recording.file_name), 60)}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDate(recording.created_at)}
                      </span>

                      {/* The recording's kind. A dropdown only when this account has Voice Notes;
                          otherwise it stays the plain label it has always been, because a user
                          without access must not learn the feature exists. */}
                      {!notesOn ? (
                        <span className="flex items-center gap-1">
                          <FileAudio className="w-4 h-4" />
                          Standalone recording
                        </span>
                      ) : (
                        <div className="relative" ref={openMenu === recording.id ? menuRef : undefined}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenu(openMenu === recording.id ? null : recording.id);
                            }}
                            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 -mx-1.5 hover:bg-gray-200/70 transition-colors"
                            aria-haspopup="menu"
                            aria-expanded={openMenu === recording.id}
                          >
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileAudio className="w-4 h-4" />}
                            {note && !isWorking(note.status) ? 'Meeting note ready' : 'Standalone recording'}
                            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                          </button>

                          {openMenu === recording.id && (
                            <div
                              className="absolute left-0 top-full mt-1 z-20 w-72 rounded-lg border border-gray-200 bg-white shadow-lg py-1"
                              onClick={(e) => e.stopPropagation()}
                              role="menu"
                            >
                              <div className="flex items-start gap-2 px-3 py-2 text-sm text-gray-900">
                                <Check className="w-4 h-4 mt-0.5 text-gray-900" />
                                <span>Standalone recording</span>
                              </div>

                              {sessionId ? (
                                <button
                                  type="button"
                                  disabled={Boolean(busy)}
                                  onClick={() => makeNote(recording)}
                                  className="w-full flex items-start gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 disabled:opacity-60"
                                  role="menuitem"
                                >
                                  <StickyNote className="w-4 h-4 mt-0.5 text-gray-500" />
                                  <span>
                                    {note
                                      ? (isWorking(note.status) ? 'Meeting note — still processing…' : 'View meeting note')
                                      : (busy ? 'Creating meeting note…' : 'Create meeting note')}
                                  </span>
                                </button>
                              ) : (
                                // Disabled, with the reason — an uploaded file has no device
                                // session, and the notes service fetches its audio BY session.
                                // This can never become available, so say why instead of
                                // leaving a silently missing option.
                                <div className="flex items-start gap-2 px-3 py-2 text-sm text-gray-400" role="menuitem" aria-disabled>
                                  <StickyNote className="w-4 h-4 mt-0.5" />
                                  <span>
                                    Meeting note
                                    <span className="block text-xs">
                                      Only a take made on the recorder can become a note — this one was uploaded.
                                    </span>
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      {/* Was a dead "No Patient" chip. Assigning a patient was only reachable
                          from the sidebar's overflow menu, so the one screen that lists every
                          unassigned recording offered no way to fix that. */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onAssignPatient(recording.id); }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Assign to patient
                      </button>
                      <p className="text-xs text-gray-500 mt-1">One-time recording</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </div>
            );
          })}

          {filteredStandaloneRecordings.length > 10 && (
            <div className="p-4 text-center border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Showing 10 of {filteredStandaloneRecordings.length} standalone recordings
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StandaloneRecordings;
