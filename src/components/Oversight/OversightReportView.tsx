// Oversight → one recording, laid out exactly like the account owner's own report
// (transcript, inline annotations, audio player, Language Analysis sidebar) — but READ-ONLY.
//
// It reuses the report components and feeds them the row device-api returned
// (`/oversight/users/:uid/recordings/:rid`), never `useTranscriptProcessor`: that hook loads
// through the viewer's own RLS (which cannot see another account's row) and owns every save.
// Nothing here can write: no write handler is passed, `readOnly` hides rename / Edit /
// Generate, and `recordingId` is withheld so nothing keys local state to the owner's id.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, Loader2, Search } from 'lucide-react';
import MainContent from '@/components/Layout/MainContent';
import RightSidebar from '@/components/Layout/RightSidebar';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useSidebarManager } from '@/hooks/useSidebarManager';
import { calculateSpeechAnalysis, getErrorAnnotations, type IssueCounts, type Segment } from '@/services/dataService';
import { normalizeSegments } from '@/components/Recording/ConversationView/utils/segmentOperations';
import type { StoredLsaReport } from '@/services/lsaReportService';
import { oversightService, type OversightRecordingRow } from '@/services/oversightService';
import { recordingLabel } from '@/services/recordingName';

const EMPTY_COUNTS: IssueCounts = {
  pause: 0, filler: 0, repetition: 0, mispronunciation: 0, morpheme: 0,
  'morpheme-omission': 0, revision: 0, 'utterance-error': 0,
};

export function OversightReportView({ ownerId, ownerEmail, rec, patient, onBack, recordings, patientName, onOpen, opening, error }: {
  ownerId: string;
  ownerEmail: string | null;
  rec: Record<string, any> & { audio_url: string | null };
  patient?: string;
  onBack: () => void;
  /** The viewed account's reports, for the left sidebar (switch without going back). */
  recordings: OversightRecordingRow[];
  patientName: Map<string, string>;
  onOpen: (rid: string) => void;
  /** Id of a report being loaded from the sidebar, if any. */
  opening?: string | null;
  error?: string | null;
}) {
  const segments: Segment[] = useMemo(
    () => normalizeSegments(Array.isArray(rec.transcript?.segments) ? rec.transcript.segments : []),
    [rec],
  );
  const availableErrorTypes = useMemo(() => getErrorAnnotations(segments), [segments]);
  const speechAnalysis = useMemo(
    () => (rec.analysis as any) || (segments.length ? calculateSpeechAnalysis({ segments } as any) : undefined),
    [rec, segments],
  );
  const issueCounts: IssueCounts = (rec.error_counts as IssueCounts) || EMPTY_COUNTS;
  const flags: number[] = Array.isArray(rec.flags) ? rec.flags : [];
  const flagNotes: Record<string, string> =
    rec.flag_notes && typeof rec.flag_notes === 'object' && !Array.isArray(rec.flag_notes) ? rec.flag_notes : {};

  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | undefined>(undefined);
  useEffect(() => { setActiveFilters(availableErrorTypes); }, [availableErrorTypes]);

  // A signed URL lasts an hour; a long review re-asks the oversight route (which audits again).
  const refreshAudioUrl = useCallback(async () => {
    try { return (await oversightService.recording(ownerId, rec.id)).audio_url ?? null; } catch { return null; }
  }, [ownerId, rec.id]);

  const audioPlayer = useAudioPlayer({ transcriptData: segments, refreshAudioUrl });
  const sidebar = useSidebarManager();
  const { setAudioUrl } = audioPlayer;
  useEffect(() => { setAudioUrl(rec.audio_url || null); }, [rec.audio_url, setAudioUrl]);

  // Same filter logic as MainApp's toggleFilter / applyPreset.
  const toggleFilter = (f: string) =>
    setActiveFilters((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  const applyPreset = (preset: string) => {
    switch (preset) {
      case 'errors': setActiveFilters([...availableErrorTypes]); break;
      case 'speech': setActiveFilters(availableErrorTypes.filter((t) => ['filler', 'repetition', 'mispronunciation'].includes(t))); break;
      case 'language': setActiveFilters(availableErrorTypes.filter((t) => ['morpheme-omission', 'revision', 'utterance-error'].includes(t))); break;
      case 'clean': setActiveFilters([]); break;
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-white flex flex-col">
      <audio ref={audioPlayer.audioRef} preload="metadata" />

      <div className="flex items-center gap-3 px-4 py-2 bg-violet-50 border-b border-violet-200 text-sm">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-violet-700 hover:text-violet-900">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <span className="text-violet-900 truncate">
          Viewing <b>{ownerEmail || ownerId}</b>{patient ? <> · patient <b>{patient}</b></> : null}
        </span>
        {error && <span className="text-xs text-red-600 truncate">Could not open that report: {error}</span>}
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-violet-700">
          <Eye className="w-3.5 h-3.5" /> Read-only · this view is logged
        </span>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
      <ReportList ownerEmail={ownerEmail} recordings={recordings} patientName={patientName}
        currentId={rec.id} onOpen={onOpen} opening={opening} />
      {!segments.length ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          This recording has no transcript yet.
        </div>
      ) : (
        <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden relative">
          <MainContent
            currentTime={audioPlayer.currentTime}
            onSeek={audioPlayer.seekToTimestamp}
            activeFilters={activeFilters}
            isPlaying={audioPlayer.isPlaying}
            onTogglePlayPause={audioPlayer.togglePlayPause}
            onSeekTo={audioPlayer.seekTo}
            onSeekExact={audioPlayer.seekToExact}
            duration={audioPlayer.duration}
            onNextWord={() => {}}
            onPrevWord={() => {}}
            onToggleFilter={toggleFilter}
            onToggleCategory={sidebar.toggleCategory}
            categoryExpanded={sidebar.categoryExpanded}
            onApplyPreset={applyPreset}
            transcriptData={segments}
            issueCounts={issueCounts}
            audioRef={audioPlayer.audioRef}
            onTimeUpdate={audioPlayer.setCurrentTime}
            availableErrorTypes={availableErrorTypes}
            showControls
            recordingName={rec.recording_name || rec.file_name}
            createdDate={rec.created_at}
            isEditable={false}
            playbackSpeed={audioPlayer.playbackSpeed}
            onPlaybackSpeedChange={audioPlayer.setPlaybackSpeed}
            onPlaySegment={audioPlayer.playSegment}
            flags={flags}
            flagNotes={flagNotes}
            readOnly
            lsaReport={(rec.lsa_report as StoredLsaReport) || null}
          />

          {sidebar.rightSidebarVisible ? (
            <>
              {!sidebar.rightSidebarCollapsed && (
                <div className="w-1 bg-gray-200 hover:bg-gray-300 cursor-col-resize transition-colors"
                  onMouseDown={() => sidebar.setIsResizingRight(true)} />
              )}
              <div style={{ width: `${sidebar.rightSidebarCollapsed ? 70 : sidebar.rightSidebarWidth}px` }} className="relative transition-all duration-200">
                <RightSidebar
                  visible
                  collapsed={sidebar.rightSidebarCollapsed}
                  onToggle={() => sidebar.setRightSidebarCollapsed(!sidebar.rightSidebarCollapsed)}
                  activeTab={sidebar.activeTab}
                  onTabChange={sidebar.setActiveTab}
                  issueCounts={issueCounts}
                  duration={audioPlayer.duration}
                  transcriptData={segments}
                  activeFilters={activeFilters}
                  speechAnalysis={speechAnalysis}
                  selectedSpeaker={selectedSpeaker}
                  onSpeakerChange={setSelectedSpeaker}
                  // Namespaced so the norms form this viewer fills in (kept in THIS browser only)
                  // never lands on the key the account owner's own report uses.
                  recordingId={`oversight:${rec.id}`}
                  width={sidebar.rightSidebarWidth}
                />
              </div>
            </>
          ) : (
            <button onClick={() => sidebar.setRightSidebarVisible(true)}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-50 bg-white border border-gray-200 rounded-l-lg p-2 shadow-md"
              title="Show analysis">‹</button>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

// Left sidebar: the VIEWED account's reports (not the viewer's own), newest first,
// filterable by patient and name, so a reviewer can move between reports in place.
function ReportList({ ownerEmail, recordings, patientName, currentId, onOpen, opening }: {
  ownerEmail: string | null;
  recordings: OversightRecordingRow[];
  patientName: Map<string, string>;
  currentId: string;
  onOpen: (rid: string) => void;
  opening?: string | null;
}) {
  const [q, setQ] = useState('');
  const [pid, setPid] = useState<string>('all');
  const patients = useMemo(() => {
    const ids = new Set(recordings.map((r) => r.patient_id || ''));
    return [...ids].map((id) => ({ id, name: id ? patientName.get(id) || 'Unknown patient' : 'Unassigned' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [recordings, patientName]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...recordings]
      .filter((r) => pid === 'all' || (r.patient_id || '') === pid)
      .filter((r) => !needle || `${recordingLabel(r.recording_name || r.file_name)} ${r.file_name || ''} ${r.patient_id ? patientName.get(r.patient_id) || '' : ''}`
        .toLowerCase().includes(needle))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }, [recordings, q, pid, patientName]);
  const fmtLen = (sec?: number | null) => {
    const s = Math.round(sec || 0);
    return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
      : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <aside className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col min-h-0">
      <div className="p-3 border-b border-gray-200 space-y-2">
        <div className="text-sm font-semibold text-gray-800 truncate" title={ownerEmail || ''}>{ownerEmail}</div>
        <div className="text-xs text-gray-500">{recordings.length} report{recordings.length === 1 ? '' : 's'}</div>
        <div className="flex items-center gap-2 border rounded-md px-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a report"
            className="w-full py-1.5 text-sm outline-none" />
        </div>
        {patients.length > 1 && (
          <select value={pid} onChange={(e) => setPid(e.target.value)}
            className="w-full border rounded-md px-2 py-1.5 text-sm bg-white">
            <option value="all">All patients</option>
            {patients.map((p) => <option key={p.id || 'none'} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {shown.map((r) => {
          const active = r.id === currentId;
          return (
            <button key={r.id} onClick={() => !active && onOpen(r.id)} title={r.file_name || ''}
              className={`w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-gray-50 ${active ? 'bg-violet-50 border-l-2 border-l-violet-500' : ''}`}>
              <div className="flex items-center gap-2">
                <span className={`text-sm truncate flex-1 ${active ? 'font-semibold text-violet-900' : 'text-gray-800'}`}>
                  {recordingLabel(r.recording_name || r.file_name) || 'Untitled'}
                </span>
                {opening === r.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 mt-0.5">
                <span className="truncate">{r.patient_id ? patientName.get(r.patient_id) || 'Unknown patient' : 'Unassigned'}</span>
                <span className="shrink-0 ml-2">
                  {new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {fmtLen(r.duration)}
                </span>
              </div>
            </button>
          );
        })}
        {!shown.length && <p className="p-3 text-sm text-gray-500">No reports.</p>}
      </div>
    </aside>
  );
}
