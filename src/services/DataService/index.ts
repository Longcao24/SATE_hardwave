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
} from './types';

// Re-export error counting functions
export { countErrors } from './errorCounter';

// Re-export audio processing functions
export { processAudioFile } from './audioProcessor';

// Re-export error annotation functions
export { getErrorAnnotations } from './errorAnnotations';

// Re-export speech analysis functions
export { calculateSpeechAnalysis } from './speechAnalysis';

// Re-export recording storage functions
export {
  saveRecording,
  getRecordingUrl,
  loadRecording,
  loadAndAnalyzeLocalJSON,
  deleteRecording,
  updateRecording,
  updateRecordingName,
} from './recordingStorage';

