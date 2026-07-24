// Type definitions for PatientDetails

export interface RecordingStats {
  id: string;
  fileName: string;
  createdAt: string;
  duration: number;
  totalWords: number;
  totalIssues: number;
  errorRate: number;
  speakers: string[];
  // Clinical metrics for the progress chart (from the recording's SpeechAnalysis).
  mluw: number;               // mean length of utterance, words
  ndw: number;                // number of different words (vocabulary)
  speakingRate: number;       // words per minute
  numberOfPauses: number;
}

// Extend Window interface to include custom properties
declare global {
  interface Window {
    latestProcessingResults?: {
      transcriptData: any;
      errorCounts: import('@/services/dataService').IssueCounts;
      timestamp: number;
    };
  }
}

