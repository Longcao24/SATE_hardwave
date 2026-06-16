import { useState } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useTranscriptData } from './useTranscriptData';
import { useProcessingState } from './useProcessingState';
import { useErrorNotification } from './useErrorNotification';
import { useRecordingMetadata } from './useRecordingMetadata';
import { useRecordingLoader } from './useRecordingLoader';
import { useTranscriptEditor } from './useTranscriptEditor';
import { useFileUpload } from './useFileUpload';
import type { RecordingMetadata } from './types';

/**
 * Main hook that orchestrates all transcript processing sub-hooks
 * This hook maintains the same API as the original useTranscriptProcessor
 */
export function useTranscriptProcessor() {
  const { user } = useAuth();

  // Current recording state
  const [currentRecordingName, setCurrentRecordingName] = useState('');
  const [currentRecordingDate, setCurrentRecordingDate] = useState('');
  
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

  // Clear all data
  const clearData = () => {
    transcriptDataHook.clearData();
    recordingMetadataHook.setCurrentRecordingId(null);
    setCurrentRecordingName('');
    setCurrentRecordingDate('');
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
    
    // Setters
    setDataError: processingStateHook.setDataError,
    setShowTimeoutWarning: processingStateHook.setShowTimeoutWarning,
    setCurrentRecordingName,
    setActiveFilters,
    setSelectedSpeaker,
  };
}

