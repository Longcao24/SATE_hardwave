import { useState, useEffect } from 'react';
import { loadRecording } from '@/services/dataService';
import { type RecordingStats } from '../types';

export const useRecordingStats = (recordings: any[] | undefined, patientId?: string) => {
  const [recordingStats, setRecordingStats] = useState<RecordingStats[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const loadPatientRecordingStats = async () => {
      if (!recordings || recordings.length === 0 || !patientId) {
        setLoadingStats(false);
        return;
      }

      const patientRecordings = recordings.filter(r => r.patient_id === patientId);
      
      if (patientRecordings.length === 0) {
        setLoadingStats(false);
        return;
      }

      setLoadingStats(true);
      const stats: RecordingStats[] = [];

      for (const recording of patientRecordings) {
        try {
          const data = await loadRecording(recording.id);
          if (data) {
            const totalWords = data.transcript.segments.reduce((sum, seg) => 
              sum + (seg.words?.length || 0), 0
            );
            const totalIssues = Object.values(data.errorCounts).reduce((sum, count) => sum + count, 0);
            const errorRate = totalWords > 0 ? (totalIssues / totalWords) * 100 : 0;
            const speakers = Array.from(new Set(data.transcript.segments.map(seg => seg.speaker)));

            stats.push({
              id: recording.id,
              fileName: recording.recording_name || recording.file_name,
              createdAt: recording.created_at,
              duration: data.analysis?.totalDuration || 0,
              totalWords,
              totalIssues,
              errorRate,
              speakers
            });
          }
          
        } catch (error) {
          console.error('Error loading recording stats:', error);
        }
      }

      setRecordingStats(stats);
      setLoadingStats(false);
    };

    loadPatientRecordingStats();
  }, [recordings, patientId]);

  return { recordingStats, loadingStats };
};

