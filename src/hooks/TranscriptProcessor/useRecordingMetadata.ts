import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { recordingMetadataService } from '@/services/recordingMetadataService';
import { audioStorageService } from '@/services/audioStorageService';
import type { User } from '@supabase/supabase-js';
import type { PendingRecordingData, RecordingMetadata, IssueCounts } from './types';

/**
 * Hook to manage recording metadata form state and saving logic
 */
export function useRecordingMetadata(user: User | null) {
  const navigate = useNavigate();
  
  const [showMetadataForm, setShowMetadataForm] = useState(false);
  const [pendingRecordingData, setPendingRecordingData] = useState<PendingRecordingData | null>(null);
  const [isSavingRecording, setIsSavingRecording] = useState(false);
  const [formMetadata, setFormMetadata] = useState<RecordingMetadata | null>(null);
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);
  const [shouldNavigateAfterSave, setShouldNavigateAfterSave] = useState(false);

  const showRecordingMetadataForm = (
    audioFile: File,
    patientId?: string,
    patientName?: string,
    transcriptData?: any,
    errorCounts?: IssueCounts,
    isComplete: boolean = false
  ) => {
    const pendingData = recordingMetadataService.createPendingRecordingData(
      audioFile,
      patientId,
      patientName,
      transcriptData,
      errorCounts,
      isComplete
    );

    setPendingRecordingData(pendingData);
    setShowMetadataForm(true);
  };

  const saveRecordingWithFreshData = async (
    metadata: RecordingMetadata, 
    transcriptData: any, 
    errorCounts: IssueCounts,
    setDataError: (error: string | null) => void
  ) => {
    if (!pendingRecordingData || !user) return;

    setIsSavingRecording(true);
    
    // Create a fresh pending data object with the completed processing results
    const freshPendingData = {
      ...pendingRecordingData,
      transcriptData,
      errorCounts,
      isProcessingComplete: true
    };
    
    await recordingMetadataService.saveRecordingWithMetadata(
      freshPendingData,
      metadata,
      user,
      (recordingId) => {
        setCurrentRecordingId(recordingId || null);
        
        // Close form
        setShowMetadataForm(false);
        setPendingRecordingData(null);
        setFormMetadata(null);
        
        // Clear global results
        delete (window as any).latestProcessingResults;
        
        // Only navigate if explicitly requested (user clicked Save with complete processing)
        if (shouldNavigateAfterSave && recordingId) {
          navigate(`/report/${recordingId}`);
        }
        
        // Reset navigation flag
        setShouldNavigateAfterSave(false);
      },
      (error) => {
        console.error('Failed to save recording:', error);
        setDataError(`Failed to save recording: ${error}`);
      }
    );

    setIsSavingRecording(false);
  };

  const saveRecordingWithMetadata = async (
    metadata: RecordingMetadata,
    setDataError: (error: string | null) => void
  ) => {
    if (!pendingRecordingData || !user) return;

    setIsSavingRecording(true);
    
    await recordingMetadataService.saveRecordingWithMetadata(
      pendingRecordingData,
      metadata,
      user,
      (recordingId) => {
        setCurrentRecordingId(recordingId || null);
        
        // Close form
        setShowMetadataForm(false);
        setPendingRecordingData(null);
        setFormMetadata(null);
        
        // Clear global results
        delete (window as any).latestProcessingResults;
        
        // Only navigate if explicitly requested (user clicked Save with complete processing)
        if (shouldNavigateAfterSave && recordingId) {
          navigate(`/report/${recordingId}`);
        }
        
        // Reset navigation flag
        setShouldNavigateAfterSave(false);
      },
      (error) => {
        console.error('Failed to save recording:', error);
        setDataError(`Failed to save recording: ${error}`);
      }
    );

    setIsSavingRecording(false);
  };

  const handleMetadataFormSave = async (
    metadata: RecordingMetadata,
    setDataError: (error: string | null) => void
  ) => {
    if (!pendingRecordingData || !user) {
      return;
    }

    // Check if we have fresh processing results available globally
    const globalResults = (window as any).latestProcessingResults;
    if (globalResults && !pendingRecordingData.isProcessingComplete) {
      setShouldNavigateAfterSave(true); // User explicitly clicked Save
      await saveRecordingWithFreshData(metadata, globalResults.transcriptData, globalResults.errorCounts, setDataError);
      return;
    }

    // Store the metadata for when processing completes
    setFormMetadata(metadata);

    // If processing is not complete, wait for it
    if (!pendingRecordingData.isProcessingComplete) {
      setShouldNavigateAfterSave(false); // Don't navigate on auto-save after processing
      // Form will be processed when audio processing completes
      return;
    }

    // If processing is complete, save immediately and navigate
    setShouldNavigateAfterSave(true); // User explicitly clicked Save with processing complete
    await saveRecordingWithMetadata(metadata, setDataError);
  };

  const handleMetadataFormClose = () => {
    // Clean up cached audio file
    if (pendingRecordingData?.audioFile) {
      console.log('🗑️ Cleaning up cached audio file on cancel...');
      audioStorageService.clearCachedAudio(pendingRecordingData.audioFile);
    }
    
    setShowMetadataForm(false);
    setPendingRecordingData(null);
    setFormMetadata(null);
  };

  // Auto-save when processing completes AFTER user has clicked Save button
  // (formMetadata is only set when user clicks Save, ensuring explicit user action)
  useEffect(() => {
    if (pendingRecordingData?.isProcessingComplete && formMetadata && !isSavingRecording) {
      saveRecordingWithMetadata(formMetadata, () => {});
    }
  }, [pendingRecordingData?.isProcessingComplete, formMetadata]);

  return {
    showMetadataForm,
    pendingRecordingData,
    setPendingRecordingData,
    isSavingRecording,
    formMetadata,
    setFormMetadata,
    currentRecordingId,
    setCurrentRecordingId,
    showRecordingMetadataForm,
    handleMetadataFormSave,
    handleMetadataFormClose,
    saveRecordingWithFreshData,
  };
}

