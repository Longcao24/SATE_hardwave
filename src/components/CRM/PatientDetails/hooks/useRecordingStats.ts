import { useState, useEffect } from 'react';
import { loadRecording } from '@/services/dataService';
import { type RecordingStats } from '../types';
import { recordingLabel } from '@/services/recordingName';

export const useRecordingStats = (recordings: any[] | undefined, patientId?: string) => {
  const [recordingStats, setRecordingStats] = useState<RecordingStats[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    let cancelled = false;   // stale in-flight run must not overwrite the next patient's stats

    const loadPatientRecordingStats = async () => {
      if (!recordings || recordings.length === 0 || !patientId) {
        setRecordingStats([]);   // clear: a stale set outlived its recordings
        setLoadingStats(false);
        return;
      }

      const patientRecordings = recordings.filter(r => r.patient_id === patientId);

      if (patientRecordings.length === 0) {
        setRecordingStats([]);   // deleting the last recording must empty the view
        setLoadingStats(false);
        return;
      }

      setLoadingStats(true);
      const stats: RecordingStats[] = [];

      for (const recording of patientRecordings) {
        try {
          const data = await loadRecording(recording.id);
          if (cancelled) return;
          if (data) {
            const totalWords = data.transcript.segments.reduce((sum, seg) => 
              sum + (seg.words?.length || 0), 0
            );
            const totalIssues = Object.values(data.errorCounts).reduce((sum, count) => sum + count, 0);
            const errorRate = totalWords > 0 ? (totalIssues / totalWords) * 100 : 0;
            const speakers = Array.from(new Set(data.transcript.segments.map(seg => seg.speaker)));

            stats.push({
              id: recording.id,
              fileName: recordingLabel(recording.recording_name || recording.file_name),
              createdAt: recording.created_at,
              duration: data.analysis?.totalDuration || 0,
              totalWords,
              totalIssues,
              errorRate,
              speakers,
              mluw: data.analysis?.mluw || 0,
              ndw: data.analysis?.ndw || 0,
              speakingRate: data.analysis?.speakingRate || 0,
              numberOfPauses: data.analysis?.numberOfPauses || 0,
            });
          }
          
        } catch (error) {
          console.error('Error loading recording stats:', error);
        }
      }

      if (cancelled) return;
      setRecordingStats(stats);
      setLoadingStats(false);
    };

    loadPatientRecordingStats();

    return () => {
      cancelled = true;
    };
  }, [recordings, patientId]);

  return { recordingStats, loadingStats };
};

