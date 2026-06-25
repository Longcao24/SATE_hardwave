import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useTranscriptData } from './useTranscriptData';
import { useProcessingState } from './useProcessingState';
import { useErrorNotification } from './useErrorNotification';
import { useRecordingMetadata } from './useRecordingMetadata';
import { useRecordingLoader } from './useRecordingLoader';
import { useTranscriptEditor } from './useTranscriptEditor';
import { useFileUpload } from './useFileUpload';
import { updateRecordingFlags } from '@/services/dataService';
import type { RecordingMetadata } from './types';
import type { FlagNotes } from '@/services/DataService/types';

/**
 * Main hook that orchestrates all transcript processing sub-hooks
 * This hook maintains the same API as the original useTranscriptProcessor
 */
export function useTranscriptProcessor() {
  const { user } = useAuth();

  // Current recording state
  const [currentRecordingName, setCurrentRecordingName] = useState('');
  const [currentRecordingDate, setCurrentRecordingDate] = useState('');
  // Device flag markers (ms offsets) for the open recording; empty for uploads.
  const [currentRecordingFlags, setCurrentRecordingFlags] = useState<number[]>([]);
  // Notes keyed by ms offset (as string) — loaded alongside flags.
  const [currentRecordingFlagNotes, setCurrentRecordingFlagNotes] = useState<FlagNotes>({});
  
  // Filter state
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [availableErrorTypes, setAvailableErrorTypes] = useState<string[]>([]);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | undefined>(undefined);

  // Initialize sub-hooks
  const transcriptDataHook = useTranscriptData();
  const processingStateHook = useProcessingState();
  const errorNotificationHook = useErrorNotification();
  const recordingMetadataHook = useRecordingMetadata(user);
  
  // Transcript editor needs dependencies
  const transcriptEditorHook = useTranscriptEditor(user, {
    currentRecordingId: recordingMetadataHook.currentRecordingId,
    transcriptData: transcriptDataHook.transcriptData,
    setTranscriptData: transcriptDataHook.setTranscriptData,
    setIssueCounts: transcriptDataHook.setIssueCounts,
    setSpeechAnalysis: transcriptDataHook.setSpeechAnalysis,
    setAvailableErrorTypes,
    setActiveFilters,
    setDataError: processingStateHook.setDataError,
  });

  // Recording loader needs dependencies
  const recordingLoaderHook = useRecordingLoader({
    setIsDataLoading: processingStateHook.setIsDataLoading,
    setDataError: processingStateHook.setDataError,
    setTranscriptData: transcriptDataHook.setTranscriptData,
    setIssueCounts: transcriptDataHook.setIssueCounts,
    setSpeechAnalysis: transcriptDataHook.setSpeechAnalysis,
    setCurrentRecordingName,
    setCurrentRecordingDate,
    setCurrentRecordingFlags,
    setCurrentRecordingFlagNotes,
    setCurrentRecordingId: recordingMetadataHook.setCurrentRecordingId,
    setAvailableErrorTypes,
    setActiveFilters,
    setIsEditMode: transcriptEditorHook.setIsEditMode,
  });

  // File upload needs dependencies from multiple hooks
  const fileUploadHook = useFileUpload({
    setIsProcessing: processingStateHook.setIsProcessing,
    setIsDataLoading: processingStateHook.setIsDataLoading,
    setDataError: processingStateHook.setDataError,
    setProcessingProgress: processingStateHook.setProcessingProgress,
    setShowTimeoutWarning: processingStateHook.setShowTimeoutWarning,
    setIsEditMode: transcriptEditorHook.setIsEditMode,
    setShowErrorNotification: errorNotificationHook.setShowErrorNotification,
    setErrorNotificationDetails: errorNotificationHook.setErrorNotificationDetails,
    setRetryFunction: errorNotificationHook.setRetryFunction,
    setTranscriptData: transcriptDataHook.setTranscriptData,
    setIssueCounts: transcriptDataHook.setIssueCounts,
    setSpeechAnalysis: transcriptDataHook.setSpeechAnalysis,
    setCurrentRecordingName,
    setCurrentRecordingDate,
    setCurrentRecordingId: recordingMetadataHook.setCurrentRecordingId,
    setAvailableErrorTypes,
    setActiveFilters,
    showRecordingMetadataForm: recordingMetadataHook.showRecordingMetadataForm,
    showErrorNotificationPopup: errorNotificationHook.showErrorNotificationPopup,
    pendingRecordingData: recordingMetadataHook.pendingRecordingData,
    setPendingRecordingData: recordingMetadataHook.setPendingRecordingData,
    formMetadata: recordingMetadataHook.formMetadata,
    saveRecordingWithFreshData: (metadata, transcriptData, errorCounts, setDataError) => 
      recordingMetadataHook.saveRecordingWithFreshData(metadata, transcriptData, errorCounts, setDataError),
  });

  // --- Flag editing (auto-save) ---
  const recordingId = recordingMetadataHook.currentRecordingId;

  const saveFlags = useCallback(async (flags: number[], notes: FlagNotes) => {
    if (!recordingId) return;
    setCurrentRecordingFlags(flags);
    setCurrentRecordingFlagNotes(notes);
    await updateRecordingFlags(recordingId, flags, notes);
  }, [recordingId]);

  // Add a new flag at rawMs. rawMs is the exact stored value (caller already
  // compensates for display lead). Sorted ascending after insert.
  const addFlag = useCallback(async (rawMs: number) => {
    const next = [...currentRecordingFlags, rawMs].sort((a, b) => a - b);
    await saveFlags(next, currentRecordingFlagNotes);
  }, [currentRecordingFlags, currentRecordingFlagNotes, saveFlags]);

  // Delete a flag by its stored ms value.
  const deleteFlag = useCallback(async (rawMs: number) => {
    const next = currentRecordingFlags.filter((ms) => ms !== rawMs);
    const nextNotes = { ...currentRecordingFlagNotes };
    delete nextNotes[String(rawMs)];
    await saveFlags(next, nextNotes);
  }, [currentRecordingFlags, currentRecordingFlagNotes, saveFlags]);

  // Set or clear the note for a flag (identified by its stored ms value).
  const updateFlagNote = useCallback(async (rawMs: number, note: string) => {
    const nextNotes = { ...currentRecordingFlagNotes };
    if (note.trim()) {
      nextNotes[String(rawMs)] = note.trim();
    } else {
      delete nextNotes[String(rawMs)];
    }
    await saveFlags(currentRecordingFlags, nextNotes);
  }, [currentRecordingFlags, currentRecordingFlagNotes, saveFlags]);

  // Clear all data
  const clearData = () => {
    transcriptDataHook.clearData();
    recordingMetadataHook.setCurrentRecordingId(null);
    setCurrentRecordingName('');
    setCurrentRecordingDate('');
    setCurrentRecordingFlags([]);
    setCurrentRecordingFlagNotes({});
    setAvailableErrorTypes([]);
    setActiveFilters([]);
    
    // Reset edit mode when clearing data
    transcriptEditorHook.setIsEditMode(false);
  };

  return {
    // Data state
    transcriptData: transcriptDataHook.transcriptData,
    issueCounts: transcriptDataHook.issueCounts,
    speechAnalysis: transcriptDataHook.speechAnalysis,
    isDataLoading: processingStateHook.isDataLoading,
    dataError: processingStateHook.dataError,
    
    // Processing state
    isProcessing: processingStateHook.isProcessing,
    processingProgress: processingStateHook.processingProgress,
    showTimeoutWarning: processingStateHook.showTimeoutWarning,
    
    // Error handling
    showErrorNotification: errorNotificationHook.showErrorNotification,
    errorNotificationDetails: errorNotificationHook.errorNotificationDetails,
    isRetrying: errorNotificationHook.isRetrying,
    handleRetry: errorNotificationHook.handleRetry,
    closeErrorNotification: errorNotificationHook.closeErrorNotification,
    
    // Recording metadata
    showMetadataForm: recordingMetadataHook.showMetadataForm,
    pendingRecordingData: recordingMetadataHook.pendingRecordingData,
    isSavingRecording: recordingMetadataHook.isSavingRecording,
    formMetadata: recordingMetadataHook.formMetadata,
    handleMetadataFormSave: (metadata: RecordingMetadata) => 
      recordingMetadataHook.handleMetadataFormSave(metadata, processingStateHook.setDataError),
    handleMetadataFormClose: recordingMetadataHook.handleMetadataFormClose,
    showRecordingMetadataForm: recordingMetadataHook.showRecordingMetadataForm,
    
    // Current recording
    currentRecordingName,
    currentRecordingDate,
    currentRecordingFlags,
    currentRecordingFlagNotes,
    currentRecordingId: recordingMetadataHook.currentRecordingId,
    isEditMode: transcriptEditorHook.isEditMode,
    
    // Filters
    activeFilters,
    availableErrorTypes,
    selectedSpeaker,
    
    // Actions
    handleFileUpload: fileUploadHook.handleFileUpload,
    loadSampleData: recordingLoaderHook.loadSampleData,
    loadRecordingById: recordingLoaderHook.loadRecordingById,
    handleTranscriptChange: transcriptEditorHook.handleTranscriptChange,
    saveTranscriptChanges: transcriptEditorHook.saveTranscriptChanges,
    saveRecordingNameChange: transcriptEditorHook.saveRecordingNameChange,
    cancelEditMode: transcriptEditorHook.cancelEditMode,
    clearData,

    // Flag editing (auto-save to DB when recording is loaded)
    addFlag,
    deleteFlag,
    updateFlagNote,

    // Setters
    setDataError: processingStateHook.setDataError,
    setShowTimeoutWarning: processingStateHook.setShowTimeoutWarning,
    setCurrentRecordingName,
    setActiveFilters,
    setSelectedSpeaker,
  };
}

