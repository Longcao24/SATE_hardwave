import { useState, useEffect } from 'react';
import { calculateSpeechAnalysis } from '@/services/dataService';
import type { Segment, IssueCounts, SpeechAnalysis } from './types';

/**
 * Hook to manage transcript data, issue counts, and speech analysis
 * Automatically recalculates speech analysis when transcript data changes
 */
export function useTranscriptData() {
  const [transcriptData, setTranscriptData] = useState<Segment[]>([]);
  const [issueCounts, setIssueCounts] = useState<IssueCounts>({
    pause: 0,
    filler: 0,
    repetition: 0,
    mispronunciation: 0,
    morpheme: 0,
    'morpheme-omission': 0,
    revision: 0,
    'utterance-error': 0
  });
  const [speechAnalysis, setSpeechAnalysis] = useState<SpeechAnalysis | null>(null);

  // Auto-calculate speech analysis when transcript data changes
  useEffect(() => {
    if (transcriptData.length > 0) {
      const analysis = calculateSpeechAnalysis({ segments: transcriptData });
      setSpeechAnalysis(analysis);
    } else {
      setSpeechAnalysis(null);
    }
  }, [transcriptData]);

  const clearData = () => {
    setTranscriptData([]);
    setIssueCounts({
      pause: 0,
      filler: 0,
      repetition: 0,
      mispronunciation: 0,
      morpheme: 0,
      'morpheme-omission': 0,
      revision: 0,
      'utterance-error': 0
    });
    setSpeechAnalysis(null);
  };

  return {
    transcriptData,
    setTranscriptData,
    issueCounts,
    setIssueCounts,
    speechAnalysis,
    setSpeechAnalysis,
    clearData,
  };
}

