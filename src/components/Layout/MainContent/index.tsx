import React, { useState, useEffect, useCallback } from 'react';
import ConversationView from '../../Recording/ConversationView';
import AudioControls from '../../Audio/AudioControls';
import { type Segment } from '@/services/dataService';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { ConfirmationDialog } from '../../Common/ConfirmationDialog';
import { SampleDataBanner } from './components/SampleDataBanner';
import { ReportHeader } from './components/ReportHeader';
import { CheckedSegmentsPanel } from './components/CheckedSegmentsPanel';
import { ActionButtonsPanel } from './components/ActionButtonsPanel';
import { DisplayModeToggle } from './components/DisplayModeToggle';
import { useNameEditor } from './hooks/useNameEditor';
import { useEditingStateManager } from './hooks/useEditingStateManager';
import type { MainContentProps } from './types';

const MainContent: React.FC<MainContentProps> = ({
  currentTime,
  onSeek,
  activeFilters,
  isPlaying,
  onTogglePlayPause,
  onSeekTo,
  duration,
  onNextWord,
  onPrevWord,
  onToggleFilter,
  onToggleCategory,
  categoryExpanded,
  onApplyPreset,
  transcriptData,
  issueCounts,
  audioRef,
  onTimeUpdate,
  availableErrorTypes,
  showControls = true,
  recordingName,
  onRecordingNameChange,
  createdDate,
  isEditable,
  onTranscriptChange,
  onSaveChanges,
  onCancelEdit,
  onEditingStateChange,
  isSampleData,
  onBackToDashboard,
  playbackSpeed,
  onPlaybackSpeedChange,
  recordingId,
  onPlaySegment,
  flags = []
}) => {
  const [isSimpleAnnotationMode, setIsSimpleAnnotationMode] = useState(true);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);

  // Initialize undo/redo functionality
  const undoRedo = useUndoRedo(recordingId, transcriptData, onTranscriptChange);

  // Name editing hook
  const nameEditor = useNameEditor(recordingName, onRecordingNameChange);

  // Editing state management hook
  const { editingState, editingActions, handleEditingStateChangeInternal } = 
    useEditingStateManager(onEditingStateChange, undoRedo.hasUnsavedChanges);

  // Wrap transcript change handler to track history
  const handleTranscriptChangeWithHistory = useCallback((updatedSegments: Segment[]) => {
    undoRedo.handleTranscriptChange(updatedSegments);
  }, [undoRedo]);

  // Automatically switch to simple mode when segments are edited
  // useEffect(() => {
  //   const hasEditedSegments = transcriptData.some(segment => segment.is_edited === true);
  //   if (hasEditedSegments && !isSimpleAnnotationMode) {
  //     setIsSimpleAnnotationMode(true);
  //   }
  // }, [transcriptData, isSimpleAnnotationMode]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle undo/redo when in edit mode
      if (!isEditable) return;

      // Undo: Ctrl+Z (or Cmd+Z on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (undoRedo.canUndo) {
          undoRedo.undo();
        }
      }
      // Redo: Ctrl+Shift+Z or Ctrl+Y (or Cmd+Shift+Z / Cmd+Y on Mac)
      else if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'y')
      ) {
        e.preventDefault();
        if (undoRedo.canRedo) {
          undoRedo.redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditable, undoRedo]);

  // Warn user before leaving page with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Only warn if in edit mode with unsaved changes
      if (isEditable && undoRedo.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = ''; // Chrome requires returnValue to be set
        return ''; // For older browsers
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isEditable, undoRedo.hasUnsavedChanges]);

  const handleBackToDashboard = useCallback(() => {
    if (isEditable && undoRedo.hasUnsavedChanges) {
      setShowBackConfirmation(true);
    } else {
      onBackToDashboard?.();
    }
  }, [isEditable, undoRedo.hasUnsavedChanges, onBackToDashboard]);

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      {/* Sample Data Navigation */}
      {isSampleData && onBackToDashboard && (
        <SampleDataBanner onBackToDashboard={handleBackToDashboard} />
      )}
      
      {/* Report Header - Only show when there's data */}
      {showControls && (
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start justify-between group">
            <div className="flex-1 flex flex-col">
              <ReportHeader
                recordingName={recordingName}
                createdDate={createdDate}
                duration={duration}
                isEditing={nameEditor.isEditing}
                editedName={nameEditor.editedName}
                onEditedNameChange={nameEditor.setEditedName}
                onEditStart={nameEditor.handleEditStart}
                onEditSave={nameEditor.handleEditSave}
                onEditCancel={nameEditor.handleEditCancel}
                onKeyPress={nameEditor.handleKeyPress}
              />

              {/* Checked Segments Controls - Only show when in edit mode and segments are checked */}
              {isEditable && (
                <CheckedSegmentsPanel
                  editingState={editingState}
                  editingActions={editingActions}
                />
              )}
            </div>
            
            {/* Control Panel */}
            <div className="flex flex-col items-end gap-3">
              {/* First Row - Action Buttons */}
              <ActionButtonsPanel
                isEditable={isEditable}
                undoRedo={undoRedo}
                transcriptData={transcriptData}
                onTranscriptChange={onTranscriptChange}
                onSaveChanges={onSaveChanges}
                onCancelEdit={onCancelEdit}
                onShowCancelConfirmation={() => setShowCancelConfirmation(true)}
              />
              
              {/* Second Row - Display Mode Toggle */}
              <DisplayModeToggle
                isSimpleAnnotationMode={isSimpleAnnotationMode}
                onToggle={setIsSimpleAnnotationMode}
                hasEditedSegments={transcriptData.some(segment => segment.is_edited === true)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
          <ConversationView
            currentTime={currentTime}
            onSeek={onSeek}
            activeFilters={activeFilters}
            transcriptData={transcriptData}
            isEditable={isEditable}
            onTranscriptChange={handleTranscriptChangeWithHistory}
            onSeekTo={onSeekTo}
            isPlaying={isPlaying}
            onTogglePlayPause={onTogglePlayPause}
            duration={duration}
            isSimpleAnnotationMode={isSimpleAnnotationMode}
            onEditingStateChange={handleEditingStateChangeInternal}
            onPlaySegment={onPlaySegment}
          />
      </div>

      {/* Audio Controls - Only show when showControls is true */}
      {showControls && (
        <div className="border-t border-gray-200">
          <AudioControls
            isPlaying={isPlaying}
            onTogglePlayPause={onTogglePlayPause}
            onSeekTo={onSeekTo}
            onNextWord={onNextWord}
            onPrevWord={onPrevWord}
            currentTime={currentTime}
            duration={duration}
            activeFilters={activeFilters}
            onToggleFilter={onToggleFilter}
            onToggleCategory={onToggleCategory}
            categoryExpanded={categoryExpanded}
            onApplyPreset={onApplyPreset}
            issueCounts={issueCounts}
            audioRef={audioRef}
            onTimeUpdate={onTimeUpdate}
            availableErrorTypes={availableErrorTypes}
            isSimpleAnnotationMode={isSimpleAnnotationMode}
            playbackSpeed={playbackSpeed}
            onPlaybackSpeedChange={onPlaybackSpeedChange}
            flags={flags}
          />
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showCancelConfirmation}
        onClose={() => setShowCancelConfirmation(false)}
        onConfirm={() => {
          undoRedo.clearHistory();
          onCancelEdit?.();
        }}
        title="Unsaved Changes"
        message="You have unsaved changes. Are you sure you want to cancel? All changes will be lost and cannot be recovered."
        confirmText="Discard Changes"
        cancelText="Keep Editing"
        variant="warning"
      />

      {/* Back to Dashboard Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={() => {
          undoRedo.clearHistory();
          setShowBackConfirmation(false);
          onBackToDashboard?.();
        }}
        title="Unsaved Changes"
        message="You have unsaved changes. Are you sure you want to leave? All changes will be lost and cannot be recovered."
        confirmText="Leave Without Saving"
        cancelText="Stay Here"
        variant="warning"
      />
    </div>
  );
};

export default MainContent;


