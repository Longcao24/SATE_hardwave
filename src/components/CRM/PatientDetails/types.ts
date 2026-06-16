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

