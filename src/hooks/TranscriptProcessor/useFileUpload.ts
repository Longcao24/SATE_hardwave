import React from 'react';
import { 
  processAudioFile, 
  calculateSpeechAnalysis, 
  getErrorAnnotations 
} from '@/services/dataService';
import { audioStorageService } from '@/services/audioStorageService';
import { normalizeSegments } from '@/components/Recording/ConversationView/utils/segmentOperations';
import type { Segment, IssueCounts, SpeechAnalysis, ProcessingError, PendingRecordingData, RecordingMetadata } from './types';

interface FileUploadDeps {
  setIsProcessing: (processing: boolean) => void;
  setIsDataLoading: (loading: boolean) => void;
  setDataError: (error: string | null) => void;
  setProcessingProgress: (progress: number) => void;
  setShowTimeoutWarning: (show: boolean) => void;
  setIsEditMode: (mode: boolean) => void;
  setShowErrorNotification: (show: boolean) => void;
  setErrorNotificationDetails: (details: ProcessingError | null) => void;
  setRetryFunction: (fn: (() => Promise<void>) | null) => void;
  setTranscriptData: (data: Segment[]) => void;
  setIssueCounts: (counts: IssueCounts) => void;
  setSpeechAnalysis: (analysis: SpeechAnalysis | null) => void;
  setCurrentRecordingName: (name: string) => void;
  setCurrentRecordingDate: (date: string) => void;
  setCurrentRecordingId: (id: string | null) => void;
  setAvailableErrorTypes: (types: string[]) => void;
  setActiveFilters: (filters: string[]) => void;
  showRecordingMetadataForm: (
    audioFile: File,
    patientId?: string,
    patientName?: string,
    transcriptData?: any,
    errorCounts?: IssueCounts,
    isComplete?: boolean
  ) => void;
  showErrorNotificationPopup: (error: ProcessingError, retry?: () => Promise<void>) => void;
  pendingRecordingData: PendingRecordingData | null;
  setPendingRecordingData: React.Dispatch<React.SetStateAction<PendingRecordingData | null>>;
  formMetadata: RecordingMetadata | null;
  saveRecordingWithFreshData: (
    metadata: RecordingMetadata,
    transcriptData: any,
    errorCounts: IssueCounts,
    setDataError: (error: string | null) => void
  ) => Promise<void>;
}

/**
 * Hook to handle file upload and audio processing
 */
export function useFileUpload(deps: FileUploadDeps) {
  const handleFileUpload = async (file: File, patientId?: string) => {
    const processFile = async () => {
      let cachedUrl: string | null = null;
      
      try {
        deps.setIsProcessing(true);
        deps.setIsDataLoading(true);
        deps.setDataError(null);
        deps.setProcessingProgress(0);
        deps.setShowTimeoutWarning(false);
        
        // Reset edit mode when uploading new file
        deps.setIsEditMode(false);
        
        // Clear any previous error notifications
        deps.setShowErrorNotification(false);
        deps.setErrorNotificationDetails(null);
        deps.setRetryFunction(null);

        // Cache audio file and get URL for playback first with progress tracking
        // Upload progress takes 0-30% of total progress
        cachedUrl = await audioStorageService.cacheAudioFile(file, (uploadProgress) => {
          // Map upload progress to 0-30% range
          const mappedProgress = Math.round(uploadProgress * 0.3);
          deps.setProcessingProgress(mappedProgress);
        });

        // Get patient name for form display
        let patientName = '';
        if (patientId) {
          try {
            const { patientService } = await import('@/services/patientService');
            const patient = await patientService.getPatient(patientId);
            patientName = `${patient.first_name} ${patient.last_name}`;
          } catch (error) {
            // Failed to get patient name
          }
        }

        // Show metadata form immediately while processing starts
        deps.showRecordingMetadataForm(file, patientId, patientName);

        // Small delay to ensure audio element has time to load
        await new Promise(resolve => setTimeout(resolve, 100));

        // Process audio file with API
        // API processing takes 30-100% of total progress
        const { data: processedData, errorCounts } = await processAudioFile(
          file,
          'cuda',
          0.25,
          (apiProgress) => {
            // Map API progress to 30-100% range
            const mappedProgress = 30 + Math.round(apiProgress * 0.7);
            deps.setProcessingProgress(mappedProgress);
          },
          () => deps.setShowTimeoutWarning(true)
        );

        // Normalize segments to ensure all pauses have proper index field
        const normalizedSegments = normalizeSegments(processedData.segments);
        const normalizedData = { ...processedData, segments: normalizedSegments };

        // Store processing results globally so they can be used even if state update fails
        (window as any).latestProcessingResults = {
          transcriptData: normalizedData,
          errorCounts: errorCounts,
          timestamp: Date.now()
        };

        deps.setTranscriptData(normalizedSegments);
        deps.setIssueCounts(errorCounts);
        
        // Calculate speech analysis
        const analysis = calculateSpeechAnalysis(normalizedData);
        deps.setSpeechAnalysis(analysis);
        
        // Set the current recording name
        deps.setCurrentRecordingName(file.name);
        deps.setCurrentRecordingDate(new Date().toISOString());
        deps.setCurrentRecordingId(null); // New upload, no recording ID yet

        // Get available error types for filtering
        const errorTypes = getErrorAnnotations(normalizedSegments);
        deps.setAvailableErrorTypes(errorTypes);

        // Set initial filters to show all detected error types
        deps.setActiveFilters(errorTypes);
        
        // Update pending recording data with processing results
        if (deps.pendingRecordingData) {
          deps.setPendingRecordingData((prev: PendingRecordingData | null) => {
            if (!prev) return null;
            
            const updated: PendingRecordingData = {
              ...prev,
              transcriptData: normalizedData,
              errorCounts: errorCounts,
              isProcessingComplete: true
            };
            
            return updated;
          });

          // Auto-save disabled - user must explicitly click Save button
          // if (deps.formMetadata) {
          //   await deps.saveRecordingWithFreshData(deps.formMetadata, normalizedData, errorCounts, deps.setDataError);
          //   return;
          // }
        }
        
        return cachedUrl; // Return the cached URL

      } catch (error) {
        
        // Check if this is a categorized error
        const errorDetails = (error as any).errorDetails as ProcessingError;
        if (errorDetails) {
          // Show the new error notification popup
          deps.showErrorNotificationPopup(errorDetails, errorDetails.retryable ? async () => { 
            await processFile(); 
            return;
          } : undefined);
        } else {
          // Fallback to old error handling for uncategorized errors
          let errorMessage = error instanceof Error ? error.message : 'Failed to process audio file';
          
          // Add helpful context for common errors
          if (errorMessage.includes('out of memory') || errorMessage.includes('CUDA failed')) {
            errorMessage = 'Server GPU is out of memory. Processing may take longer using CPU. Please try again.';
          } else if (errorMessage.includes('Server is taking longer than expected') || errorMessage.includes('wake up')) {
            // Keep the server wake-up message as is, but make it more actionable
            errorMessage = errorMessage + ' You can try uploading your file again - the server should respond faster on the second attempt.';
          }
          
          deps.setDataError(errorMessage);
        }
        
        // Clean up audio URL on error - only if it's a blob URL from our caching
        if (cachedUrl && cachedUrl.startsWith('blob:')) {
          URL.revokeObjectURL(cachedUrl);
        }
        return null;
      } finally {
        deps.setIsProcessing(false);
        deps.setIsDataLoading(false);
        deps.setProcessingProgress(0);
        deps.setShowTimeoutWarning(false); // Reset timeout warning
      }
    };

    // Call the actual processing function and return the cached URL
    return await processFile();
  };

  return {
    handleFileUpload,
  };
}

