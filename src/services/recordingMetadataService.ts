import { saveRecording, updateRecordingMetadata, updateRecordingPatient } from './dataService';
import { type IssueCounts } from './dataService';
import { type User } from '@supabase/supabase-js';

export interface RecordingMetadata {
  name: string;
  protocol: string;
  note: string;
}

export interface PendingRecordingData {
  audioFile: File;
  transcriptData?: any;
  errorCounts?: IssueCounts;
  patientId?: string;
  patientName?: string;
  isProcessingComplete?: boolean;
  /** Processing ended in an error, so no transcript exists and Save cannot succeed. */
  processingFailed?: boolean;
  /** The backend session processing this upload (set as soon as it owns the file). */
  sessionId?: string;
  /** The recording the backend created; Save names it instead of inserting a new one. */
  recordingId?: string;
}

export class RecordingMetadataService {
  private static instance: RecordingMetadataService;
  
  static getInstance(): RecordingMetadataService {
    if (!RecordingMetadataService.instance) {
      RecordingMetadataService.instance = new RecordingMetadataService();
    }
    return RecordingMetadataService.instance;
  }

  async saveRecordingWithMetadata(
    pendingRecordingData: PendingRecordingData,
    metadata: RecordingMetadata,
    user: User,
    onSuccess?: (recordingId?: string) => void,
    onError?: (error: string) => void
  ): Promise<{ success: boolean; recordingId?: string; error?: string }> {
    if (!pendingRecordingData.transcriptData || !pendingRecordingData.errorCounts) {
      const error = `Missing required data: ${!pendingRecordingData.transcriptData ? 'transcript data' : ''} ${!pendingRecordingData.errorCounts ? 'error counts' : ''}. Processing complete: ${pendingRecordingData.isProcessingComplete}`;
      onError?.(error);
      return { success: false, error };
    }

    if (!user?.id) {
      const error = 'User not authenticated or missing user ID';
      onError?.(error);
      return { success: false, error };
    }

    try {
      // A web upload is processed by the backend, which already CREATED the recording (with the
      // audio, transcript and patient). Save only names it — and clears needs_review, the flag
      // that would otherwise ask for a name the next time it is opened.
      if (pendingRecordingData.recordingId) {
        const id = pendingRecordingData.recordingId;
        const meta = await updateRecordingMetadata(id, user.id, {
          name: metadata.name, protocol: metadata.protocol, note: metadata.note,
        });
        if (!meta.success) {
          const error = meta.error || 'Failed to save the recording details';
          onError?.(error);
          return { success: false, error };
        }
        if (pendingRecordingData.patientId) {
          await updateRecordingPatient(id, pendingRecordingData.patientId, user.id);
        }
        onSuccess?.(id);
        return { success: true, recordingId: id };
      }

      // Save to Supabase with metadata
      const result = await saveRecording(
        pendingRecordingData.audioFile,
        pendingRecordingData.transcriptData,
        pendingRecordingData.errorCounts,
        user.id,
        pendingRecordingData.patientId,
        metadata
      );

      if (!result.success) {
        const errorMessage = result.error || 'Failed to save recording to database';
        onError?.(errorMessage);
        return result;
      } else {
        onSuccess?.(result.recordingId);
        return result;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred while saving';
      onError?.(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  createPendingRecordingData(
    audioFile: File,
    patientId?: string,
    patientName?: string,
    transcriptData?: any,
    errorCounts?: IssueCounts,
    isComplete: boolean = false
  ): PendingRecordingData {
    return {
      audioFile,
      transcriptData,
      errorCounts,
      patientId,
      patientName,
      isProcessingComplete: isComplete
    };
  }
}

export const recordingMetadataService = RecordingMetadataService.getInstance();
