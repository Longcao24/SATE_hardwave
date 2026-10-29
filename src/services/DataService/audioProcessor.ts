import type { TranscriptData, IssueCounts, ProcessingError } from './types';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from '@/config/uploadLimits';
import { processOnServer, retryOnServer, ServerProcessingError, UploadCancelledError } from './serverProcessing';

// Sessions that ended in 'error', per File: Retry re-queues that session on the server
// instead of uploading the same file a second time.
const erroredSession = new WeakMap<File, string>();

// API processing function. The work is done by the BACKEND (serverProcessing.ts); this
// validates the file, hands it over and maps the outcome onto the UI's error shape.
// `device` and `pauseThreshold` are kept for the callers' signature; the backend uses the
// same settings the device pipeline always has (cuda, 0.25).
export const processAudioFile = async (
  audioFile: File,
  _device: string = 'cuda',
  _pauseThreshold: number = 0.25,
  onProgress?: (progress: number) => void,
  onTimeoutWarning?: () => void,
  opts: { patientId?: string; source?: string; onSession?: (sessionId: string) => void } = {}
): Promise<{ data: TranscriptData; errorCounts: IssueCounts; recordingId: string; sessionId: string }> => {
  try {
    // Validate file before sending
    if (audioFile.size === 0) {
      const validationError = new Error('Audio file is empty. Please select a valid audio file.');
      (validationError as any).errorDetails = {
        type: 'validation',
        message: 'Audio file is empty. Please select a valid audio file.',
        originalError: 'File size is 0 bytes',
        retryable: false
      };
      throw validationError;
    }

    // Second gate on the same upload: ImportPopup checks the picker, this checks anything
    // reaching the processor. Both now read MAX_UPLOAD_BYTES so they cannot disagree —
    // they were separate 50MB literals, and raising one alone still failed here.
    if (audioFile.size > MAX_UPLOAD_BYTES) {
      const msg = `Audio file is too large (max ${MAX_UPLOAD_LABEL}). Please select a smaller file.`;
      const validationError = new Error(msg);
      (validationError as any).errorDetails = {
        type: 'validation',
        message: msg,
        originalError: `File size: ${(audioFile.size / 1024 / 1024).toFixed(2)}MB`,
        retryable: false
      };
      throw validationError;
    }

    // Validate file type
    const validTypes = [
      'audio/wav', 'audio/wave', 'audio/x-wav',
      'audio/mpeg', 'audio/mp3',
      'audio/mp4', 'audio/m4a',
      'audio/ogg', 'audio/webm',
      'audio/flac', 'audio/aac'
    ];
    
    if (!validTypes.includes(audioFile.type) && !audioFile.name.match(/\.(wav|mp3|m4a|ogg|webm|flac|aac)$/i)) {
      const validationError = new Error(`Unsupported audio format: ${audioFile.type || 'unknown'}. Please use WAV, MP3, M4A, OGG, WebM, FLAC, or AAC files.`);
      (validationError as any).errorDetails = {
        type: 'validation',
        message: `Unsupported audio format. Please use WAV, MP3, M4A, OGG, WebM, FLAC, or AAC files.`,
        originalError: `File type: ${audioFile.type || 'unknown'}`,
        retryable: false
      };
      throw validationError;
    }

    const watchOpts = { ...opts, onProgress, onTimeoutWarning };
    const prior = erroredSession.get(audioFile);
    if (prior) opts.onSession?.(prior);
    try {
      const result = prior
        ? await retryOnServer(audioFile, prior, watchOpts)
        : await processOnServer(audioFile, watchOpts);
      erroredSession.delete(audioFile);
      return result;
    } catch (e) {
      // Cancelled by the clinician: pass it through bare, so no error popup follows their click.
      if (e instanceof UploadCancelledError) throw e;
      if (e instanceof ServerProcessingError) {
        if (e.sessionId && e.retryable) erroredSession.set(audioFile, e.sessionId);
        else erroredSession.delete(audioFile);
        const err = new Error(e.message);
        (err as any).errorDetails = {
          type: e.sessionId ? 'server' : 'network',
          message: e.message,
          originalError: e.original,
          retryable: e.retryable,
        } satisfies ProcessingError;
        throw err;
      }
      throw e;
    }

  } catch (error) {
    if (error instanceof UploadCancelledError) throw error;
    console.error('API processing failed:', error);
    
    // If the error already has errorDetails, preserve them
    if ((error as any).errorDetails) {
      throw error;
    }
    
    // Otherwise, create a generic error
    const genericError = new Error(
      error instanceof Error 
        ? `Failed to process audio: ${error.message}`
        : 'Failed to process audio file'
    );
    (genericError as any).errorDetails = {
      type: 'unknown',
      message: 'An unexpected error occurred while processing the audio file.',
      originalError: error instanceof Error ? error.message : String(error),
      retryable: true
    };
    throw genericError;
  }
};

