// Define the main data structure types
export interface Word {
  word: string;
  start: number | null;
  end: number | null;
  index: number;
}

export interface FillerWord {
  content: string | null;
  duration: number | null;
  start: number | null;
  end: number | null;
}

export interface Repetition {
  content: string;
  words: number[];
  mark_location?: number;
}

export interface Revision {
  content: string;
  words: number[];
  mark_location?: number;
  location?: number[];
}

export interface Pause {
  start: number | null;
  end: number | null;
  duration: number;
  index?: number; // Index of the word after which the pause occurs (-1 for before first word)
}

export interface Segment {
  text: string;
  text_clean?: string; // Clean version of the text without markers
  text_token?: string; // Tokenized version with markers
  start: number;
  end: number;
  speaker: string;
  words: Word[];
  fillerwords?: FillerWord[];
  repetitions?: Repetition[];
  revisions?: Revision[]; // Changed from revision to revisions and typed
  pauses?: Pause[];
  'utterance-error'?: any[];
  mispronunciation?: any[];
  morpheme_omissions?: any[];
  morphemes?: any[];
  excluded?: boolean; // Whether this utterance is excluded from analysis
  is_edited?: boolean; // Whether this segment has been manually edited
  note?: string; // User note for this utterance
}

export interface TranscriptData {
  segments: Segment[];
}

export interface IssueCounts {
  pause: number;
  filler: number;
  repetition: number;
  mispronunciation: number;
  morpheme: number;
  'morpheme-omission': number;
  revision: number;
  'utterance-error': number;
}

// Device flag notes: key = ms offset as string, value = note text.
// Stored separately from the flags number[] so the flags column stays compatible.
export type FlagNotes = { [ms: string]: string };

// Enhanced error type for better error handling
export interface ProcessingError {
  type: 'api' | 'network' | 'server' | 'validation' | 'unknown';
  message: string;
  originalError?: string;
  retryable?: boolean;
}

// Enhanced analysis interface for comprehensive speech analysis
export interface SpeechAnalysis {
  errorCounts: IssueCounts;
  totalWords: number;
  totalDuration: number;
  speakingRate: number; // words per minute
  errorRate: number; // errors per 100 words
  availableErrorTypes: string[];
  segmentCount: number;
  speakerCount: number;
  // Language analysis metrics
  ntw: number; // Number of Total Words
  ndw: number; // Number of Different Words
  mluw: number; // Mean Length of Utterance in Words
  mlum: number; // Mean Length of Utterance in Morphemes
  numberOfPauses: number; // Total number of pauses
}

