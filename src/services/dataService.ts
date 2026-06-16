/**
 * Legacy compatibility wrapper for DataService
 * 
 * This file maintains backward compatibility with existing imports.
 * All functionality has been refactored into separate modules in the DataService directory.
 * 
 * New code should import directly from '@/services/DataService' for better tree-shaking.
 */

// Re-export all types
export type {
  Word,
  FillerWord,
  Repetition,
  Revision,
  Segment,
  TranscriptData,
  IssueCounts,
  ProcessingError,
  SpeechAnalysis,
} from './DataService/types';

// Re-export error counting functions
export { countErrors } from './DataService/errorCounter';

// Re-export audio processing functions
export { processAudioFile } from './DataService/audioProcessor';

// Re-export error annotation functions
export { getErrorAnnotations } from './DataService/errorAnnotations';

// Re-export speech analysis functions
export { calculateSpeechAnalysis } from './DataService/speechAnalysis';

// Re-export recording storage functions
export {
  saveRecording,
  getRecordingUrl,
  loadRecording,
  loadAndAnalyzeLocalJSON,
  deleteRecording,
  updateRecording,
  updateRecordingName,
  updateRecordingMetadata,
  updateRecordingPatient,
} from './DataService/recordingStorage'; 