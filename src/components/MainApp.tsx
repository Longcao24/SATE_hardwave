import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthProvider';

// Import custom hooks
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useTranscriptProcessor } from '@/hooks/useTranscriptProcessor';
import { useSidebarManager } from '@/hooks/useSidebarManager';
import { useToast } from '@/hooks/useToast';

// Import services
import { audioStorageService } from '@/services/audioStorageService';
import { supabase } from '@/lib/supabase';
import { deviceApiService } from '@/services/device/deviceApiService';
import { updateRecordingMetadata } from '@/services/dataService';
import { type RecordingMetadata } from '@/services/recordingMetadataService';

// Import all components
import LeftSidebar from '@/components/Layout/LeftSidebar';
import MainContent from '@/components/Layout/MainContent';
import RightSidebar from '@/components/Layout/RightSidebar';
import ImportPopup from '@/components/Modals/ImportPopup';
import TimeoutWarningPopup from '@/components/Modals/TimeoutWarningPopup';
import ErrorNotificationPopup from '@/components/Modals/ErrorNotificationPopup';
import RecordingMetadataForm from '@/components/Recording/RecordingMetadataForm';
import CreateRecordingPopup from '@/components/Recording/CreateRecordingPopup';
import Dashboard from '@/components/Layout/Dashboard';
import { ToastNotification } from '@/components/Common/ToastNotification';
import { ConfirmationDialog } from '@/components/Common/ConfirmationDialog';

export function MainApp() {
  // Auth context
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { id: reportId } = useParams<{ id: string }>();
  
  // Determine if we're viewing sample data
  const isSampleData = location.pathname === '/sample';
  
  // Use custom hooks
  const transcriptProcessor = useTranscriptProcessor();
  const audioPlayer = useAudioPlayer({ transcriptData: transcriptProcessor.transcriptData });
  const sidebarManager = useSidebarManager();
  const { toast, showToast } = useToast();
  
  // Import popup state
  const [showImportPopup, setShowImportPopup] = useState(false);
  const [showCreateRecordingPopup, setShowCreateRecordingPopup] = useState(false);

  // First-time review popup for device recordings: when an SLP first opens a
  // recording the hardware auto-uploaded, prompt them to set a real file name +
  // protocol (the device only knows a generated file name).
  const [reviewRec, setReviewRec] = useState<{ id: string; name: string } | null>(null);
  const [savingReview, setSavingReview] = useState(false);
  
  // Navigation confirmation state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showNavigationConfirmation, setShowNavigationConfirmation] = useState(false);
  const [pendingNavigationAction, setPendingNavigationAction] = useState<(() => void) | null>(null);

  // Handle file upload wrapper
  const handleFileUpload = async (file: File, patientId?: string) => {
    setShowImportPopup(false); // Close the popup when processing starts
    const audioUrl = await transcriptProcessor.handleFileUpload(file, patientId);
    if (audioUrl) {
      audioPlayer.setAudioUrl(audioUrl);
    }
  };

  // Load sample data wrapper
  const loadSampleData = async () => {
    setShowImportPopup(false); // Close the popup when loading sample data
    const audioUrl = await transcriptProcessor.loadSampleData();
    if (audioUrl) {
      audioPlayer.setAudioUrl(audioUrl);
    }
  };

  // Handle hardware device session import
  useEffect(() => {
    const importSessionId = searchParams.get('import_device_session');
    if (importSessionId && user) {
      // Clear URL to prevent re-triggering
      setSearchParams((params) => {
        params.delete('import_device_session');
        return params;
      }, { replace: true });

      const loadDeviceSession = async () => {
        try {
          const { data: session, error } = await supabase
            .from('sate_device_sessions')
            .select('*')
            .eq('id', importSessionId)
            .single();

          if (error || !session) throw error;

          const audioUrl = deviceApiService.getSessionAudioUrl(session.id);
          const response = await fetch(audioUrl, {
            headers: {
              Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
            }
          });
          
          if (!response.ok) throw new Error('Failed to fetch session audio');
          const blob = await response.blob();
          const file = new File([blob], `Session-${session.session_number}.wav`, { type: 'audio/wav' });
          
          let patientId: string | undefined = undefined;
          if (session.patient_id && session.patient_id !== 'None' && session.patient_id !== 'Standalone' && session.patient_id.length === 36) {
            patientId = session.patient_id;
          }
          
          await handleFileUpload(file, patientId);
        } catch (err) {
          console.error('Error importing device session:', err);
          showToast('Failed to load session audio from device.', 'error');
        }
      };

      loadDeviceSession();
    }
  }, [searchParams, user, setSearchParams, showToast]);


  // Load report from URL parameter on mount
  useEffect(() => {
    const loadReportFromUrl = async () => {
      // Handle report route
      if (reportId && user) {
        const audioUrl = await transcriptProcessor.loadRecordingById(reportId);
        if (audioUrl) {
          audioPlayer.setAudioUrl(audioUrl);
        }
        // First open of a device recording that hasn't been reviewed yet: pop the
        // metadata form so the SLP can rename it + pick a protocol.
        const { data: rec } = await supabase
          .from('recordings')
          .select('id, recording_name, needs_review')
          .eq('id', reportId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (rec?.needs_review) {
          setReviewRec({ id: rec.id, name: rec.recording_name || '' });
        }
      } else if (!reportId && !isSampleData && (transcriptProcessor.transcriptData.length > 0 || transcriptProcessor.currentRecordingId || audioPlayer.audioUrl)) {
        // Clear data when navigating to home (not on sample or report route) and we have data to clear
        // Stop audio playback first
        audioPlayer.stopAndReset();
        transcriptProcessor.clearData();
        if (audioPlayer.audioUrl && audioPlayer.audioUrl.startsWith('blob:')) {
          URL.revokeObjectURL(audioPlayer.audioUrl);
        }
        audioPlayer.setAudioUrl(null);
      }
    };

    loadReportFromUrl();
  }, [reportId, user, navigate]);

  // Auto-cleanup expired cache items on app load
  useEffect(() => {
    // Clean up expired items when app loads
    audioStorageService.clearExpiredItems();
  }, []);

  // Auto-show right sidebar when data is loaded
  useEffect(() => {
    if (transcriptProcessor.transcriptData.length > 0) {
      sidebarManager.setRightSidebarVisible(true);
    }
  }, [transcriptProcessor.transcriptData.length]);

  // Handle patient import intent from sessionStorage
  useEffect(() => {
    const checkImportIntent = () => {
      const preSelectedPatientId = sessionStorage.getItem('preSelectedPatientId');
      const shouldShowImportPopup = sessionStorage.getItem('showImportPopup');

      if (preSelectedPatientId && shouldShowImportPopup) {
        // Clear the flags first
        sessionStorage.removeItem('preSelectedPatientId');
        sessionStorage.removeItem('showImportPopup');

        // Trigger import popup
        setShowImportPopup(true);
        // Store the patient ID for the import popup to use
        sessionStorage.setItem('importPatientId', preSelectedPatientId);
      }
    };

    // Check on mount and when route changes
    checkImportIntent();
    
    // Clear metadata form state when navigating to report pages to prevent conflicts
    if (location.pathname.startsWith('/report/')) {
      // Check if we're coming from PatientDetails
      const fromPatientDetails = sessionStorage.getItem('navigatingFromPatientDetails');
      if (fromPatientDetails) {
        sessionStorage.removeItem('navigatingFromPatientDetails');
        // Don't show MainApp metadata form when coming from PatientDetails
        transcriptProcessor.handleMetadataFormClose();
      }
    }
  }, [location.pathname]);

  // Handle logout via Supabase
  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  // Track unsaved changes from MainContent
  const handleEditingStateChange = useCallback((state: any) => {
    // Extract hasUnsavedChanges from the editing state
    const hasChanges = state?.hasUnsavedChanges || false;
    setHasUnsavedChanges(hasChanges && transcriptProcessor.isEditMode);
  }, [transcriptProcessor.isEditMode]);

  // Navigation with confirmation if there are unsaved changes
  const navigateWithConfirmation = useCallback((action: () => void) => {
    if (hasUnsavedChanges && transcriptProcessor.isEditMode) {
      setPendingNavigationAction(() => action);
      setShowNavigationConfirmation(true);
    } else {
      // Stop audio before navigating
      audioPlayer.stopAndReset();
      action();
    }
  }, [hasUnsavedChanges, transcriptProcessor.isEditMode, audioPlayer]);

  // Save transcript changes wrapper
  const saveTranscriptChanges = async () => {
    try {
      await transcriptProcessor.saveTranscriptChanges();
      showToast('Transcript changes saved successfully!', 'success');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to save changes',
        'error'
      );
    }
  };

  // Filter handling
  const toggleFilter = (filter: string) => {
    transcriptProcessor.setActiveFilters(prev => 
      prev.includes(filter) 
        ? prev.filter(f => f !== filter)
        : [...prev, filter]
    );
  };

  const applyPreset = (preset: string) => {
    const { availableErrorTypes, setActiveFilters } = transcriptProcessor;
    
    switch (preset) {
      case 'errors':
        // Apply all available error types found in the JSON
        setActiveFilters([...availableErrorTypes]);
        break;
      case 'speech':
        // Apply only speech-related errors that are available
        setActiveFilters(availableErrorTypes.filter(type => 
          ['filler', 'repetition', 'mispronunciation'].includes(type)
        ));
        break;
      case 'language':
        // Apply only language-related errors that are available
        setActiveFilters(availableErrorTypes.filter(type => 
          ['morpheme-omission', 'revision', 'utterance-error'].includes(type)
        ));
        break;
      case 'clean':
        setActiveFilters([]);
        break;
    }
  };

  // Show loading state
  if (transcriptProcessor.isDataLoading && !transcriptProcessor.isProcessing) {
    return (
      <div className="min-h-screen bg-neutral-lightest flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Loading SATE Demo...</div>
          <div className="text-sm text-neutral-darker">Processing transcript data...</div>
        </div>
      </div>
    );
  }

  // Show error state
  if (transcriptProcessor.dataError && !transcriptProcessor.transcriptData.length) {
    return (
      <div className="min-h-screen bg-neutral-lightest flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-lg font-medium mb-2 text-red-600">Error Loading Data</div>
          <div className="text-sm text-neutral-darker mb-4">{transcriptProcessor.dataError}</div>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Audio element */}
      <audio 
        ref={audioPlayer.audioRef} 
        preload="metadata"
      />
      
      <div className="flex h-screen overflow-hidden relative">
        {/* Left Sidebar */}
        {sidebarManager.leftSidebarVisible && (
          <>
            <div style={{ width: `${sidebarManager.leftSidebarCollapsed ? 70 : sidebarManager.leftSidebarWidth}px` }} className="relative transition-all duration-200">
              <LeftSidebar 
                visible={sidebarManager.leftSidebarVisible}
                collapsed={sidebarManager.leftSidebarCollapsed}
                onToggle={() => sidebarManager.setLeftSidebarCollapsed(!sidebarManager.leftSidebarCollapsed)}
                onLogout={handleLogout}
                onSelectRecording={async (_url: string, recordingId: string) => {
                  // Check for unsaved changes before navigating
                  navigateWithConfirmation(() => {
                    navigate(`/report/${recordingId}`);
                  });
                }}
                onNavigate={(path: string) => {
                  // Check for unsaved changes before navigating
                  navigateWithConfirmation(() => {
                    navigate(path);
                  });
                }}
                width={sidebarManager.leftSidebarWidth}
                onFileUpload={handleFileUpload}
              />
            </div>
            
            {/* Left Resize Handle - Only show when expanded */}
            {!sidebarManager.leftSidebarCollapsed && (
              <div
                className="w-1 bg-gray-200 hover:bg-gray-300 cursor-col-resize transition-colors relative group"
                onMouseDown={() => sidebarManager.setIsResizingLeft(true)}
              >
                <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-blue-500 group-hover:opacity-20" />
              </div>
            )}
          </>
        )}
        
        {/* Main Content */}
        {transcriptProcessor.transcriptData.length > 0 ? (
          <MainContent 
            currentTime={audioPlayer.currentTime}
            onSeek={audioPlayer.seekToTimestamp}
            activeFilters={transcriptProcessor.activeFilters}
            isPlaying={audioPlayer.isPlaying}
            onTogglePlayPause={audioPlayer.togglePlayPause}
            onSeekTo={audioPlayer.seekTo}
            onSeekExact={audioPlayer.seekToExact}
            duration={audioPlayer.duration}
            onNextWord={() => {}}
            onPrevWord={() => {}}
            onToggleFilter={toggleFilter}
            onToggleCategory={sidebarManager.toggleCategory}
            categoryExpanded={sidebarManager.categoryExpanded}
            onApplyPreset={applyPreset}
            transcriptData={transcriptProcessor.transcriptData}
            issueCounts={transcriptProcessor.issueCounts}
            audioRef={audioPlayer.audioRef}
            onTimeUpdate={audioPlayer.setCurrentTime}
            availableErrorTypes={transcriptProcessor.availableErrorTypes}
            showControls={transcriptProcessor.transcriptData.length > 0}
            recordingName={transcriptProcessor.currentRecordingName}
            onRecordingNameChange={(newName) => {
              transcriptProcessor.setCurrentRecordingName(newName);
              transcriptProcessor.saveRecordingNameChange(newName);
            }}
            createdDate={transcriptProcessor.currentRecordingDate}
            isEditable={transcriptProcessor.isEditMode}
            onTranscriptChange={transcriptProcessor.handleTranscriptChange}
            onSaveChanges={saveTranscriptChanges}
            onCancelEdit={transcriptProcessor.cancelEditMode}
            isSampleData={isSampleData}
            onBackToDashboard={() => {
              navigateWithConfirmation(() => navigate('/'));
            }}
            playbackSpeed={audioPlayer.playbackSpeed}
            onPlaybackSpeedChange={audioPlayer.setPlaybackSpeed}
            recordingId={transcriptProcessor.currentRecordingId || undefined}
            onPlaySegment={audioPlayer.playSegment}
            onEditingStateChange={handleEditingStateChange}
            flags={transcriptProcessor.currentRecordingFlags}
            flagNotes={transcriptProcessor.currentRecordingFlagNotes}
            onAddFlag={transcriptProcessor.addFlag}
            onDeleteFlag={transcriptProcessor.deleteFlag}
            onUpdateFlagNote={transcriptProcessor.updateFlagNote}
          />
        ) : (
          <Dashboard 
            onImport={handleFileUpload}
            onUseSampleData={loadSampleData}
          />
        )}
        
        {/* Right Sidebar */}
        {sidebarManager.rightSidebarVisible && transcriptProcessor.transcriptData.length > 0 && (
          <>
            {/* Right Resize Handle - Only show when expanded */}
            {!sidebarManager.rightSidebarCollapsed && (
              <div
                className="w-1 bg-gray-200 hover:bg-gray-300 cursor-col-resize transition-colors relative group"
                onMouseDown={() => sidebarManager.setIsResizingRight(true)}
              >
                <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-blue-500 group-hover:opacity-20" />
              </div>
            )}
            
            <div style={{ width: `${sidebarManager.rightSidebarCollapsed ? 70 : sidebarManager.rightSidebarWidth}px` }} className="relative transition-all duration-200">
              <RightSidebar 
                visible={sidebarManager.rightSidebarVisible}
                collapsed={sidebarManager.rightSidebarCollapsed}
                onToggle={() => sidebarManager.setRightSidebarCollapsed(!sidebarManager.rightSidebarCollapsed)}
                activeTab={sidebarManager.activeTab}
                onTabChange={sidebarManager.setActiveTab}
                issueCounts={transcriptProcessor.issueCounts}
                duration={audioPlayer.duration}
                transcriptData={transcriptProcessor.transcriptData}
                activeFilters={transcriptProcessor.activeFilters}
                speechAnalysis={transcriptProcessor.speechAnalysis || undefined}
                selectedSpeaker={transcriptProcessor.selectedSpeaker}
                onSpeakerChange={transcriptProcessor.setSelectedSpeaker}
                width={sidebarManager.rightSidebarWidth}
              />
            </div>
          </>
        )}

        {/* Right Sidebar Toggle Button - Show when sidebar is hidden */}
        {!sidebarManager.rightSidebarVisible && transcriptProcessor.transcriptData.length > 0 && (
          <button
            onClick={() => sidebarManager.setRightSidebarVisible(true)}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-50 bg-white border border-gray-200 rounded-l-lg p-2 shadow-md hover:shadow-lg transition-shadow group"
            title="Show analysis (Ctrl+/)"
          >
            <svg className="w-5 h-5 text-gray-600 group-hover:text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Create Recording Popup */}
        <CreateRecordingPopup
          isOpen={showCreateRecordingPopup}
          onClose={() => setShowCreateRecordingPopup(false)}
          onImportAudio={() => {
            setShowCreateRecordingPopup(false);
            setShowImportPopup(true);
          }}
        />

        {/* Import Popup */}
        <ImportPopup
          isOpen={showImportPopup}
          onClose={() => setShowImportPopup(false)}
          onFileUpload={handleFileUpload}
          isProcessing={transcriptProcessor.isProcessing}
          processingProgress={transcriptProcessor.processingProgress}
          onBack={() => {
            setShowImportPopup(false);
            setShowCreateRecordingPopup(true);
          }}
        />

        {/* Timeout Warning Popup */}
        <TimeoutWarningPopup
          isOpen={transcriptProcessor.showTimeoutWarning}
          onClose={() => transcriptProcessor.setShowTimeoutWarning(false)}
        />

        {/* Error Notification Popup */}
        {transcriptProcessor.errorNotificationDetails && (
          <ErrorNotificationPopup
            isOpen={transcriptProcessor.showErrorNotification}
            onClose={transcriptProcessor.closeErrorNotification}
            onRetry={transcriptProcessor.handleRetry}
            error={transcriptProcessor.errorNotificationDetails}
            isRetrying={transcriptProcessor.isRetrying}
          />
        )}

        {/* Recording Metadata Form */}
        <RecordingMetadataForm
          isOpen={transcriptProcessor.showMetadataForm}
          onClose={transcriptProcessor.handleMetadataFormClose}
          onSave={transcriptProcessor.handleMetadataFormSave}
          isLoading={transcriptProcessor.isSavingRecording}
          patientName={transcriptProcessor.pendingRecordingData?.patientName}
          isProcessing={transcriptProcessor.isProcessing && !transcriptProcessor.pendingRecordingData?.isProcessingComplete}
          processingProgress={transcriptProcessor.processingProgress}
          hasError={transcriptProcessor.showErrorNotification || !!transcriptProcessor.dataError}
        />

        {/* First-time device-recording review: rename + choose protocol */}
        {reviewRec && (
          <RecordingMetadataForm
            isOpen={true}
            zIndex={60}
            initialData={{ name: reviewRec.name, protocol: '' }}
            isLoading={savingReview}
            onClose={() => setReviewRec(null)}
            onSave={async (metadata: RecordingMetadata) => {
              if (!user) return;
              setSavingReview(true);
              const res = await updateRecordingMetadata(reviewRec.id, user.id, {
                name: metadata.name,
                protocol: metadata.protocol,
                note: metadata.note,
              });
              setSavingReview(false);
              if (res.success) {
                setReviewRec(null);
                showToast('Recording saved.', 'success');
              } else {
                showToast(res.error || 'Could not save recording.', 'error');
              }
            }}
          />
        )}

        {/* Navigation Confirmation Dialog */}
        <ConfirmationDialog
          isOpen={showNavigationConfirmation}
          onClose={() => {
            setShowNavigationConfirmation(false);
            setPendingNavigationAction(null);
          }}
          onConfirm={() => {
            setShowNavigationConfirmation(false);
            setHasUnsavedChanges(false);
            // Stop audio before navigating
            audioPlayer.stopAndReset();
            if (pendingNavigationAction) {
              pendingNavigationAction();
              setPendingNavigationAction(null);
            }
          }}
          title="Unsaved Changes"
          message="You have unsaved changes. Are you sure you want to leave? All changes will be lost and cannot be recovered."
          confirmText="Leave Without Saving"
          cancelText="Stay Here"
          variant="warning"
        />

        {/* Toast Notification */}
        <ToastNotification toast={toast} />
      </div>
    </div>
  );
}
