import { saveRecording } from './dataService';
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
