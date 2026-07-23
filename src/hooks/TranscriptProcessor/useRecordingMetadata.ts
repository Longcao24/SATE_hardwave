import { useState, useEffect, useRef } from 'react';
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

  // When the form for the current audio file was opened. Processing results are
  // published globally without any file identity, so only results produced after
  // this moment can belong to this file.
  const formOpenedAtRef = useRef(0);
  // Error reporter captured when the user clicks Save, so a save deferred until
  // processing completes can still surface its failure.
  const saveErrorHandlerRef = useRef<((error: string | null) => void) | null>(null);

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

    formOpenedAtRef.current = Date.now();
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

    saveErrorHandlerRef.current = setDataError;

    // Check if we have fresh processing results available globally.
    // Results left over from an earlier upload carry another file's transcript,
    // so only use them when they were produced after this form opened.
    const globalResults = (window as any).latestProcessingResults;
    if (globalResults && globalResults.timestamp > formOpenedAtRef.current && !pendingRecordingData.isProcessingComplete) {
      setShouldNavigateAfterSave(true); // User explicitly clicked Save
      await saveRecordingWithFreshData(metadata, globalResults.transcriptData, globalResults.errorCounts, setDataError);
      return;
    }

    // Store the metadata for when processing completes
    setFormMetadata(metadata);

    // If processing is not complete, wait for it
    if (pendingRecordingData.processingFailed) {
      // Tell the user why Save cannot work instead of returning silently — the
      // form re-enables Save after a failed run, so this was an invisible dead end.
      setDataError('Processing failed, so there is no transcript to save yet. Retry processing from the error notice, or upload the file again.');
      return;
    }

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

    // Results for the abandoned file must not be paired with the next upload
    delete (window as any).latestProcessingResults;
  };

  // Auto-save when processing completes AFTER user has clicked Save button
  // (formMetadata is only set when user clicks Save, ensuring explicit user action)
  useEffect(() => {
    if (pendingRecordingData?.isProcessingComplete && formMetadata && !isSavingRecording) {
      saveRecordingWithMetadata(formMetadata, (error) => saveErrorHandlerRef.current?.(error));
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

