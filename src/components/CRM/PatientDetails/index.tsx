import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { processAudioFile, deleteRecording, updateRecordingPatient, type IssueCounts, type ProcessingError } from '@/services/dataService';
import { recordingMetadataService, type PendingRecordingData, type RecordingMetadata } from '@/services/recordingMetadataService';
import { audioStorageService } from '@/services/audioStorageService';
import { useAuth } from '@/contexts/AuthProvider';
import { useRecordings } from '@/hooks/useRecordings';
import { Button } from '@/components/ui/button';
import { User, ArrowLeft } from 'lucide-react';
import CreateRecordingPopup from '../../Recording/CreateRecordingPopup';
import ImportPopup from '../../Modals/ImportPopup';
import TimeoutWarningPopup from '../../Modals/TimeoutWarningPopup';
import ErrorNotificationPopup from '../../Modals/ErrorNotificationPopup';
import RecordingMetadataForm from '../../Recording/RecordingMetadataForm';
import { usePatientData } from './hooks/usePatientData';
import { useRecordingStats } from './hooks/useRecordingStats';
import { PatientHeader } from './components/PatientHeader';
import { StatsCards } from './components/StatsCards';
import { TabNavigation } from './components/TabNavigation';
import { OverviewTab } from './components/OverviewTab';
import { AnalyticsTab } from './components/AnalyticsTab';
import { ReportsTab } from './components/ReportsTab';
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog';
import ErrorDisplays from './components/ErrorDisplays';

const PatientDetails: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { recordings, refetch: refetchRecordings } = useRecordings();
  
  // Custom hooks
  const { patient, loading } = usePatientData(id);
  const { recordingStats, loadingStats } = useRecordingStats(recordings, id);
  
  // UI State
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'reports'>('overview');
  const [timeFilter] = useState<'all' | 'week' | 'month'>('all');
  
  // Modal States
  const [showCreateRecordingPopup, setShowCreateRecordingPopup] = useState(false);
  const [showImportPopup, setShowImportPopup] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [recordingToDelete, setRecordingToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // Audio processing states
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  
  // Error notification states (unified with MainApp)
  const [showErrorNotification, setShowErrorNotification] = useState(false);
  const [errorNotificationDetails, setErrorNotificationDetails] = useState<ProcessingError | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryFunction, setRetryFunction] = useState<(() => Promise<void>) | null>(null);

  // Recording metadata form state
  const [showMetadataForm, setShowMetadataForm] = useState(false);
  const [pendingRecordingData, setPendingRecordingData] = useState<PendingRecordingData | null>(null);
  const [isSavingRecording, setIsSavingRecording] = useState(false);
  const [formMetadata, setFormMetadata] = useState<RecordingMetadata | null>(null);
  const [shouldNavigateAfterSave, setShouldNavigateAfterSave] = useState(false);

  // Cleanup metadata form state when component unmounts
  useEffect(() => {
    return () => {
      setShowMetadataForm(false);
      setPendingRecordingData(null);
      setFormMetadata(null);
    };
  }, []);

  // Error notification functions (unified with MainApp)
  const showErrorNotificationPopup = (error: ProcessingError, retry?: () => Promise<void>) => {
    setErrorNotificationDetails(error);
    setRetryFunction(retry ? () => retry : null);
    setShowErrorNotification(true);
  };

  const closeErrorNotification = () => {
    setShowErrorNotification(false);
    setErrorNotificationDetails(null);
    setRetryFunction(null);
    setIsRetrying(false);
  };

  const handleRetry = async () => {
    if (retryFunction) {
      setIsRetrying(true);
      try {
        await retryFunction();
      } catch (error) {
        console.error('Retry failed:', error);
      } finally {
        setIsRetrying(false);
      }
    }
  };

  // Import handler
  const handleImportFromCreate = () => {
    // Close CreateRecordingPopup and open ImportPopup with patient pre-selected
    setShowCreateRecordingPopup(false);
    setShowImportPopup(true);
  };

  // Recording metadata form functions
  const showRecordingMetadataForm = (
    audioFile: File,
    patientId?: string,
    patientName?: string,
    transcriptData?: any,
    errorCounts?: IssueCounts,
    isComplete: boolean = false
  ) => {
    console.log('📋 showRecordingMetadataForm called:', {
      audioFileName: audioFile.name,
      patientId,
      patientName,
      hasTranscriptData: !!transcriptData,
      hasErrorCounts: !!errorCounts,
      isComplete
    });

    const pendingData = recordingMetadataService.createPendingRecordingData(
      audioFile,
      patientId,
      patientName,
      transcriptData,
      errorCounts,
      isComplete
    );

    console.log('📋 Created pendingData:', {
      hasAudioFile: !!pendingData.audioFile,
      hasTranscriptData: !!pendingData.transcriptData,
      hasErrorCounts: !!pendingData.errorCounts,
      isProcessingComplete: pendingData.isProcessingComplete
    });

    setPendingRecordingData(pendingData);
    setShowMetadataForm(true);
  };

  const handleMetadataFormSave = async (metadata: RecordingMetadata) => {
    console.log('🔄 handleMetadataFormSave called:', {
      hasPendingData: !!pendingRecordingData,
      hasUser: !!user,
      isProcessingComplete: pendingRecordingData?.isProcessingComplete,
      hasTranscriptData: !!pendingRecordingData?.transcriptData,
      hasErrorCounts: !!pendingRecordingData?.errorCounts,
      hasGlobalResults: !!(window as any).latestProcessingResults,
      metadata
    });

    if (!pendingRecordingData || !user) {
      console.error('❌ Missing pendingRecordingData or user');
      return;
    }

    // Check if we have fresh processing results available globally
    const globalResults = (window as any).latestProcessingResults;
    if (globalResults && !pendingRecordingData.isProcessingComplete) {
      console.log('🌍 Using global processing results to save immediately...');
      setShouldNavigateAfterSave(true); // User explicitly clicked Save
      await saveRecordingWithFreshData(metadata, globalResults.transcriptData, globalResults.errorCounts);
      return;
    }

    // Store the metadata for when processing completes
    setFormMetadata(metadata);

    // If processing is not complete, wait for it
    if (!pendingRecordingData.isProcessingComplete) {
      console.log('⏳ Processing not complete, storing metadata and waiting...');
      setShouldNavigateAfterSave(false); // Don't navigate on auto-save after processing
      // Form will be processed when audio processing completes
      return;
    }

    // If processing is complete, save immediately and navigate
    console.log('✅ Processing complete, saving immediately...');
    setShouldNavigateAfterSave(true); // User explicitly clicked Save with processing complete
    await saveRecordingWithMetadata(metadata);
  };

  const saveRecordingWithFreshData = async (
    metadata: RecordingMetadata, 
    transcriptData: any, 
    errorCounts: IssueCounts
  ) => {
    if (!pendingRecordingData || !user) return;

    console.log('💾 saveRecordingWithFreshData called with:', {
      hasTranscriptData: !!transcriptData,
      hasErrorCounts: !!errorCounts,
      transcriptSegments: transcriptData?.segments?.length,
      metadata
    });

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
        console.log('Recording saved successfully with ID:', recordingId);
        
        // Close form and refresh recordings
        setShowMetadataForm(false);
        setPendingRecordingData(null);
        setFormMetadata(null);
        refetchRecordings();
        
        // Only navigate if explicitly requested (user clicked Save with complete processing)
        if (shouldNavigateAfterSave && recordingId) {
          // Set flag to indicate we're navigating from PatientDetails
          sessionStorage.setItem('navigatingFromPatientDetails', 'true');
          navigate(`/report/${recordingId}`);
        }
        
        // Reset navigation flag
        setShouldNavigateAfterSave(false);
      },
      (error) => {
        console.error('Failed to save recording:', error);
        setProcessingError(error);
      }
    );

    setIsSavingRecording(false);
  };

  const saveRecordingWithMetadata = async (metadata: RecordingMetadata) => {
    if (!pendingRecordingData || !user) return;

    setIsSavingRecording(true);
    
    await recordingMetadataService.saveRecordingWithMetadata(
      pendingRecordingData,
      metadata,
      user,
      (recordingId) => {
        console.log('Recording saved successfully with ID:', recordingId);
        
        // Close form and refresh recordings
        setShowMetadataForm(false);
        setPendingRecordingData(null);
        setFormMetadata(null);
        refetchRecordings();
        
        // Only navigate if explicitly requested (user clicked Save with complete processing)
        if (shouldNavigateAfterSave && recordingId) {
          // Set flag to indicate we're navigating from PatientDetails
          sessionStorage.setItem('navigatingFromPatientDetails', 'true');
          navigate(`/report/${recordingId}`);
        }
        
        // Reset navigation flag
        setShouldNavigateAfterSave(false);
      },
      (error) => {
        console.error('Failed to save recording:', error);
        setProcessingError(error);
      }
    );

    setIsSavingRecording(false);
  };

  const handleMetadataFormClose = () => {
    // Clean up cached audio file
    if (pendingRecordingData?.audioFile) {
      // console.log('🗑️ Cleaning up cached audio file on cancel...');
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
      console.log('🚀 useEffect triggering save (user already clicked Save button)');
      saveRecordingWithMetadata(formMetadata);
    }
  }, [pendingRecordingData?.isProcessingComplete, formMetadata, isSavingRecording]);

  // Handle file upload and processing locally
  const handleFileUpload = async (file: File, patientId?: string) => {
    if (!user) {
      console.error('User not authenticated');
      return;
    }

    const processFile = async () => {
      try {
        setIsProcessing(true);
        setProcessingProgress(0);
        setProcessingError(null);
        setShowTimeoutWarning(false);
        setShowImportPopup(false); // Close the popup when processing starts
        
        // Clear any previous error notifications
        setShowErrorNotification(false);
        setErrorNotificationDetails(null);
        setRetryFunction(null);

        // Get patient name for form display
        let patientName = '';
        const targetPatientId = patientId || id;
        if (targetPatientId && patient) {
          patientName = `${patient.first_name} ${patient.last_name}`;
        }

        // Cache audio file first with progress tracking (0-30%)
        console.log('🔄 Caching audio file...');
        await audioStorageService.cacheAudioFile(file, (uploadProgress) => {
          const mappedProgress = Math.round(uploadProgress * 0.3);
          setProcessingProgress(mappedProgress);
        });

        // Show metadata form immediately while processing starts
        console.log('📋 Showing metadata form for processing...');
        showRecordingMetadataForm(file, targetPatientId, patientName);

        // Process audio file with API (30-100%)
        console.log('Starting audio processing for patient:', patientId || id);
        const { data: processedData, errorCounts } = await processAudioFile(
          file,
          'cuda',
          0.25,
          (apiProgress) => {
            const mappedProgress = 30 + Math.round(apiProgress * 0.7);
            setProcessingProgress(mappedProgress);
          },
          () => setShowTimeoutWarning(true)
        );

        console.log('API processing complete, updating form data...');
        console.log('📊 Processing results:', {
          processedData,
          errorCounts,
          hasPendingData: !!pendingRecordingData,
          pendingRecordingData
        });

        // Store processing results globally so they can be used even if state update fails
        window.latestProcessingResults = {
          transcriptData: processedData,
          errorCounts: errorCounts,
          timestamp: Date.now()
        };

        // Update pending recording data with processing results
        if (!pendingRecordingData) {
          console.error('❌ No pendingRecordingData found after processing! This is the problem.');
          return;
        }

        if (pendingRecordingData) {
          console.log('🔄 Updating pendingRecordingData...');
          setPendingRecordingData(prev => {
            if (!prev) return null;
            
            const updated = {
              ...prev,
              transcriptData: processedData,
              errorCounts: errorCounts,
              isProcessingComplete: true
            };
            
            console.log('✅ Updated pendingRecordingData:', {
              hasTranscriptData: !!updated.transcriptData,
              hasErrorCounts: !!updated.errorCounts,
              isProcessingComplete: updated.isProcessingComplete,
              transcriptSegments: updated.transcriptData?.segments?.length
            });
            
            return updated;
          });

          // Auto-save disabled - user must explicitly click Save button
          // if (formMetadata) {
          //   console.log('📝 Form metadata exists, saving with fresh data...');
          //   // Use the fresh data directly instead of waiting for state update
          //   await saveRecordingWithFreshData(formMetadata, processedData, errorCounts);
          //   return;
          // }
        }

      } catch (error) {
        console.error('Failed to process and save audio:', error);
        
        // Check if this is a categorized error
        const errorDetails = (error as any).errorDetails as ProcessingError;
        if (errorDetails) {
          // Show the unified error notification popup
          showErrorNotificationPopup(errorDetails, errorDetails.retryable ? () => processFile() : undefined);
        } else {
          // Fallback to old error handling for uncategorized errors
          const errorMessage = error instanceof Error ? error.message : 'Failed to process audio file';
          setProcessingError(errorMessage);
        }
      } finally {
        setIsProcessing(false);
        setProcessingProgress(0);
        setShowTimeoutWarning(false);
      }
    };

    // Call the actual processing function
    await processFile();
  };

  const handleDeleteClick = (recordingId: string) => {
    setRecordingToDelete(recordingId);
    setShowDeleteConfirm(true);
  };

  const getRecordingName = (recordingId: string) => {
    const recording = recordingStats.find(stat => stat.id === recordingId);
    return recording?.fileName || 'Unknown Recording';
  };

  const handleDeleteConfirm = async () => {
    if (!recordingToDelete) return;
    
    try {
      setDeleting(true);
      
      // Get current user
      const { data: { user } } = await import('@/lib/supabase').then(m => m.supabase.auth.getUser());
      if (!user) {
        console.error('User not authenticated');
        return;
      }
      
      const result = await deleteRecording(recordingToDelete, user.id);
      
      if (result.success) {
        // Close dialog and clear state
        setShowDeleteConfirm(false);
        setRecordingToDelete(null);
        // The recordings list will automatically update due to React Query cache invalidation
      } else {
        console.error('Failed to delete recording:', result.error);
        // Could add toast notification here
      }
    } catch (error) {
      console.error('Error deleting recording:', error);
      // Could add toast notification here
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setRecordingToDelete(null);
  };

  const handleMoveToStandalone = async (recordingId: string) => {
    if (!user) {
      console.error('User not authenticated');
      return;
    }

    try {
      const result = await updateRecordingPatient(recordingId, null, user.id);
      
      if (result.success) {
        // Navigate back to dashboard to show standalone recordings
        navigate('/');
      } else {
        console.error('Failed to move recording to standalone:', result.error);
      }
    } catch (error) {
      console.error('Error moving recording to standalone:', error);
    }
  };

  const handleChangePatient = (recordingId: string) => {
    // Navigate to dashboard where user can use the assign patient option
    navigate('/', { 
      state: { 
        message: 'To reassign this recording, use the three-dot menu and select "Change Patient"',
        highlightRecordingId: recordingId 
      } 
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <div className="text-gray-500">Loading patient details...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Patient not found</h3>
            <p className="text-gray-500 mb-6">The patient you're looking for doesn't exist or has been removed.</p>
            <Button onClick={() => navigate('/patients')} className="bg-blue-600 hover:bg-blue-700 text-white">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Patients
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <PatientHeader 
          patient={patient} 
          onNewRecording={() => setShowCreateRecordingPopup(true)} 
        />

        {/* Stats Cards */}
        <StatsCards 
          recordingStats={recordingStats} 
          loadingStats={loadingStats} 
        />

        {/* Navigation Tabs */}
        <TabNavigation 
          activeTab={activeTab} 
          onTabChange={setActiveTab} 
        />

        {/* Tab Content */}
        <div>
          {activeTab === 'overview' && (
            <OverviewTab
              patient={patient}
              recordingStats={recordingStats}
              loadingStats={loadingStats}
              onAddRecording={() => setActiveTab('reports')}
              onViewAllReports={() => setActiveTab('analytics')}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsTab
              patient={patient}
              patientId={id}
              recordingStats={recordingStats}
              loadingStats={loadingStats}
              timeFilter={timeFilter}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsTab
              patient={patient}
              recordingStats={recordingStats}
              loadingStats={loadingStats}
              onAddRecording={() => setShowCreateRecordingPopup(true)}
              onDeleteClick={handleDeleteClick}
              onMoveToStandalone={handleMoveToStandalone}
              onChangePatient={handleChangePatient}
            />
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        isOpen={showDeleteConfirm}
        recordingName={recordingToDelete ? getRecordingName(recordingToDelete) : 'this recording'}
        deleting={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      {/* Create Recording Popup */}
      <CreateRecordingPopup
        isOpen={showCreateRecordingPopup}
        onClose={() => setShowCreateRecordingPopup(false)}
        onImportAudio={handleImportFromCreate}
        preSelectedPatientId={id}
        preSelectedPatientName={patient ? `${patient.first_name} ${patient.last_name}` : undefined}
      />

      {/* Import Popup */}
      <ImportPopup
        isOpen={showImportPopup}
        onClose={() => setShowImportPopup(false)}
        onFileUpload={handleFileUpload}
        isProcessing={isProcessing}
        processingProgress={processingProgress}
        preSelectedPatientId={id}
        onBack={() => {
          setShowImportPopup(false);
          setShowCreateRecordingPopup(true);
        }}
      />

      {/* Recording Metadata Form - Patient Details Context */}
      <RecordingMetadataForm
        isOpen={showMetadataForm}
        onClose={handleMetadataFormClose}
        onSave={handleMetadataFormSave}
        isLoading={isSavingRecording}
        patientName={pendingRecordingData?.patientName}
        isProcessing={isProcessing && !pendingRecordingData?.isProcessingComplete}
        processingProgress={processingProgress}
        zIndex={60}
        hasError={showErrorNotification || !!processingError}
      />

      {/* Timeout Warning Popup */}
      <TimeoutWarningPopup
        isOpen={showTimeoutWarning}
        onClose={() => setShowTimeoutWarning(false)}
      />

      {/* Error Notification Popup */}
      {errorNotificationDetails && (
        <ErrorNotificationPopup
          isOpen={showErrorNotification}
          onClose={closeErrorNotification}
          onRetry={handleRetry}
          error={errorNotificationDetails}
          isRetrying={isRetrying}
        />
      )}

      {/* Error Displays */}
      <ErrorDisplays
        processingError={processingError}
        showErrorNotification={showErrorNotification}
        showTimeoutWarning={showTimeoutWarning}
        onCloseProcessingError={() => setProcessingError(null)}
        onRetryProcessing={() => {
          setProcessingError(null);
          setShowImportPopup(true);
        }}
        onCloseTimeoutWarning={() => setShowTimeoutWarning(false)}
      />
    </div>
  );
};

export default PatientDetails;

