import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { type Segment } from '../../../services/dataService';
import { jsonToSalt } from '../../../services/saltService';
import AnnotationPopup from '../../Annotations/AnnotationPopup';
import EditTranscriptPopup from '../EditTranscriptPopup';
import AnnotationCreationPopup from '../../Annotations/AnnotationCreationPopup';
import WordContextMenu from '../../Annotations/WordContextMenu';
import type { AnnotationDetails } from '../../Annotations/AnnotationPopup';

// Import local components
import WelcomeMessage from './components/WelcomeMessage';
import TranscriptSegment from './components/TranscriptSegment';
import SpeakerChangeDialog from './components/SpeakerChangeDialog';

// Import hooks
import { useEditModes } from './hooks/useEditModes';
import { useSpeakerManagement } from './hooks/useSpeakerManagement';
import { useSegmentOperations } from './hooks/useSegmentOperations';
import { useAnnotations } from './hooks/useAnnotations';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAutoScroll } from '../../../hooks/useAutoScroll';

// Import types
import type { ConversationViewProps, EditingSegment, ContextMenuData } from './types';

// Import utils
import { canMergeSegments } from './utils/speakerUtils';

// Import styles
import styles from './ConversationView.module.css';

const ConversationView: React.FC<ConversationViewProps> = ({
  currentTime,
  onSeek,
  activeFilters,
  transcriptData,
  onTranscriptChange,
  isEditable,
  onSeekTo,
  isPlaying = false,
  onTogglePlayPause,
  duration = 0,
  isSimpleAnnotationMode = true,
  onEditingStateChange,
  onPlaySegment
}) => {
  // State management
  const [selectedAnnotation, setSelectedAnnotation] = useState<AnnotationDetails | null>(null);
  const [selectedAnnotations, setSelectedAnnotations] = useState<AnnotationDetails[] | null>(null);
  const [editingSegment, setEditingSegment] = useState<EditingSegment | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<number[]>([]);
  const [inlineEditingSegment, setInlineEditingSegment] = useState<number | null>(null);
  const [checkedSegments, setCheckedSegments] = useState<Set<number>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clickedWord, setClickedWord] = useState<{ segmentIndex: number; wordIndex: number; timestamp: number } | null>(null);
  const editableRef = useRef<HTMLDivElement>(null as any);

  // Error callback for segment operations
  const handleSegmentError = useCallback((message: string) => {
    setErrorMessage(message);
    setTimeout(() => setErrorMessage(null), 4000); // Hide after 4 seconds
  }, []);

  // Clear all checked segments
  const clearCheckedSegments = useCallback(() => {
    setCheckedSegments(new Set());
  }, []);

  useEffect(() => {
    if (clickedWord) {
      const word = transcriptData[clickedWord.segmentIndex]?.words[clickedWord.wordIndex];
      if (word && word.end && currentTime >= word.end) {
        setClickedWord(null);
      }
    }
  }, [currentTime, clickedWord, transcriptData]);

  // Use custom hooks for complex state management
  const editModes = useEditModes();
  const speakerManagement = useSpeakerManagement(transcriptData, onTranscriptChange, clearCheckedSegments);
  const segmentOps = useSegmentOperations(transcriptData, onTranscriptChange, handleSegmentError);
  const annotations = useAnnotations(transcriptData, onTranscriptChange, activeFilters, isSimpleAnnotationMode, isPlaying, onTogglePlayPause);
  const dragAndDrop = useDragAndDrop(
    Boolean(isEditable) && !editModes.selectionMode && !editModes.mergeMode && !editModes.annotationMode && !editModes.excludeMode, 
    transcriptData, 
    onTranscriptChange,
    segmentOps.mergeSegments
  );
  
  // Auto-scroll functionality
  const autoScroll = useAutoScroll({
    isPlaying: isPlaying || false,
    currentTime,
    isEnabled: true,
  });

  // Context menu state
  const [contextMenuData, setContextMenuData] = useState<ContextMenuData>({
    isOpen: false,
    position: { x: 0, y: 0 },
    word: '',
    wordIndex: -1,
    segmentIndex: -1,
    existingAnnotations: []
  });

  // Update context menu annotations when transcript data changes (while menu is open)
  useEffect(() => {
    if (contextMenuData.isOpen && contextMenuData.segmentIndex >= 0 && contextMenuData.wordIndex >= 0) {
      const segment = transcriptData[contextMenuData.segmentIndex];
      if (segment) {
        // Recalculate annotations for the word
        const allFilters = ['filler', 'repetition', 'revision', 'mispronunciation', 'morpheme', 'morpheme-omission'];
        const updatedAnnotations = annotations.getWordAnnotations(segment, contextMenuData.wordIndex, allFilters, isSimpleAnnotationMode);
        
        // Only update if annotations have changed
        if (JSON.stringify(updatedAnnotations) !== JSON.stringify(contextMenuData.existingAnnotations)) {
          setContextMenuData(prev => ({
            ...prev,
            existingAnnotations: updatedAnnotations
          }));
        }
      }
    }
  }, [transcriptData, contextMenuData.isOpen, contextMenuData.segmentIndex, contextMenuData.wordIndex, contextMenuData.existingAnnotations, isSimpleAnnotationMode, annotations]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    ...editModes,
    selectAllSegments: speakerManagement.selectAllSegments,
    resetAllModes: editModes.resetAllModes,
    isModalOpen: editingSegment !== null || speakerManagement.showSpeakerChangePopup,
    inlineEditingSegment,
    contextMenuOpen: contextMenuData.isOpen
  });

  // Handle play button click for a segment
  const handlePlaySegment = useCallback((segmentStart: number, segmentEnd?: number) => {
    // If we have the new playSegment function and segment end time, use it for bounded playback
    if (onPlaySegment && segmentEnd !== undefined) {
      onPlaySegment(segmentStart, segmentEnd);
    } else {
      // Fallback to old behavior (seek and play)
      onSeek(segmentStart.toString());
      if (!isPlaying && onTogglePlayPause) {
        onTogglePlayPause();
      }
    }
  }, [onSeek, isPlaying, onTogglePlayPause, onPlaySegment]);

  // Handle note change for a segment
  const handleNoteChange = useCallback((segmentIndex: number, note: string) => {
    if (!onTranscriptChange) return;
    
    const updatedSegments = [...transcriptData];
    updatedSegments[segmentIndex] = {
      ...updatedSegments[segmentIndex],
      note: note,
    };
    
    onTranscriptChange(updatedSegments);
  }, [transcriptData, onTranscriptChange]);

  // Start editing a segment
  const startEditingSegment = useCallback((segmentIndex: number) => {
    // Pause audio if it's currently playing
    if (isPlaying && onTogglePlayPause) {
      onTogglePlayPause();
    }
    
    const segment = transcriptData[segmentIndex];
    setEditingSegment({ segment, index: segmentIndex });
  }, [transcriptData, isPlaying, onTogglePlayPause]);

  // Save segment changes from popup
  const saveSegmentChanges = useCallback((updatedSegment: Segment) => {
    if (!editingSegment || !onTranscriptChange) return;
    
    const updatedSegments = [...transcriptData];
    updatedSegments[editingSegment.index] = updatedSegment;
    
    onTranscriptChange(updatedSegments);
    setEditingSegment(null);
  }, [editingSegment, onTranscriptChange, transcriptData]);

  // Close edit popup
  const closeEditPopup = useCallback(() => {
    setEditingSegment(null);
    // Don't exit edit mode when canceling - user might want to edit other segments
  }, []);

  // Start inline editing with SALT format conversion
  const startInlineEditing = useCallback((segmentIndex: number) => {
    // Pause audio if it's currently playing
    if (isPlaying && onTogglePlayPause) {
      onTogglePlayPause();
    }
    
    const segment = transcriptData[segmentIndex];
    setInlineEditingSegment(segmentIndex);
    
    // Convert segment to SALT format for editing
    const saltText = jsonToSalt(segment);
    
    // Set content directly in the DOM to avoid React re-rendering issues
    setTimeout(() => {
      if (editableRef.current) {
        editableRef.current.textContent = saltText; // Show SALT format
        // Focus and place cursor at the end
        editableRef.current.focus();
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(editableRef.current);
        range.collapse(false); // Collapse to end
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }, 0);
  }, [transcriptData, isPlaying, onTogglePlayPause]);

  // Cancel inline edit
  const cancelInlineEdit = useCallback(() => {
    setInlineEditingSegment(null);
  }, []);

  // Toggle merge selection
  const toggleMergeSelection = useCallback((segmentIndex: number) => {
    const segment = transcriptData[segmentIndex];
    if (segment.speaker === 'PAUSE') return;

    const newSelected = [...selectedForMerge];
    const existingIndex = newSelected.indexOf(segmentIndex);
    
    if (existingIndex >= 0) {
      newSelected.splice(existingIndex, 1);
    } else if (newSelected.length < 2) {
      newSelected.push(segmentIndex);
      newSelected.sort((a, b) => a - b);
    }
    
    setSelectedForMerge(newSelected);
  }, [selectedForMerge, transcriptData]);

  // Merge segments
  const mergeSegments = useCallback(() => {
    if (!onTranscriptChange || selectedForMerge.length !== 2) return;
    
    segmentOps.mergeSegments(selectedForMerge[0], selectedForMerge[1]);
    editModes.toggleMergeMode();
    setSelectedForMerge([]);
  }, [selectedForMerge, segmentOps, editModes, onTranscriptChange]);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenuData(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Toggle checkbox for segment
  const toggleSegmentCheckbox = useCallback((segmentIndex: number) => {
    setCheckedSegments(prev => {
      const newChecked = new Set(prev);
      if (newChecked.has(segmentIndex)) {
        newChecked.delete(segmentIndex);
      } else {
        newChecked.add(segmentIndex);
      }
      return newChecked;
    });
  }, []);

  // Select all segments for checkboxes
  const selectAllForCheckboxes = useCallback(() => {
    const allSegmentIndices = transcriptData
      .map((_, index) => index)
      .filter(index => transcriptData[index].speaker !== 'PAUSE');
    setCheckedSegments(new Set(allSegmentIndices));
  }, [transcriptData]);

  // Reset local edit modes when main edit mode changes
  useEffect(() => {
    if (!isEditable) {
      editModes.resetAllModes();
      speakerManagement.clearSelection();
      setSelectedForMerge([]);
      annotations.clearWordSelection();
      setInlineEditingSegment(null);
      setCheckedSegments(new Set());
      closeContextMenu();
    }
  }, [isEditable]);

  // Close help tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showHelp && event.target instanceof Element) {
        const helpButton = event.target.closest('[data-help-trigger]');
        const helpTooltip = event.target.closest('.help-tooltip');
        
        if (!helpButton && !helpTooltip) {
          setShowHelp(false);
        }
      }
    };

    if (showHelp) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showHelp]);


  // Auto-scroll to active segment when currentTime changes
  useEffect(() => {
    // Find the currently active segment
    const activeSegmentIndex = transcriptData.findIndex(
      (segment) => currentTime >= segment.start && currentTime <= segment.end
    );
    
    if (activeSegmentIndex >= 0) {
      const segmentId = autoScroll.getSegmentId(activeSegmentIndex);
      autoScroll.scrollToActiveSegment(segmentId);
    }
  }, [currentTime, transcriptData, autoScroll]);

  // Notify parent of editing state changes - simplified approach
  useEffect(() => {
    if (onEditingStateChange && isEditable) {
      const state = {
        editModes,
        checkedSegments,
        selectedSegments: speakerManagement.selectedSegments,
        selectedWords: annotations.selectedWords || [],
        selectedForMerge,
        inlineEditingSegment,
        showHelp
      };

      const actions = {
        toggleSelectionMode: editModes.toggleSelectionMode,
        toggleMergeMode: editModes.toggleMergeMode,
        toggleSplitMode: editModes.toggleSplitMode,
        toggleExcludeMode: editModes.toggleExcludeMode,
        toggleAnnotationMode: editModes.toggleAnnotationMode,
        selectAllSegments: speakerManagement.selectAllSegments,
        clearSelection: speakerManagement.clearSelection,
        clearWordSelection: annotations.clearWordSelection,
        clearCheckedSegments,
        selectAllForCheckboxes,
        startSpeakerChange: () => speakerManagement.startSpeakerChange(),
        mergeSegments,
        openAnnotationCreationPopup: annotations.openAnnotationCreationPopup,
        canMergeSegments: (indices: number[]) => canMergeSegments(indices, transcriptData),
        setShowHelp,
        // Bulk operations for checked segments
        bulkSpeakerChange: () => {
          if (checkedSegments.size > 0) {
            const checkedIndices = Array.from(checkedSegments);
            speakerManagement.startSpeakerChange(undefined, checkedIndices);
          }
        },
        bulkMergeSegments: () => segmentOps.bulkMergeSegments(Array.from(checkedSegments)),
        bulkExcludeSegments: () => segmentOps.bulkToggleExclusion(Array.from(checkedSegments), true),
        bulkIncludeSegments: () => segmentOps.bulkToggleExclusion(Array.from(checkedSegments), false),
        bulkDeleteSegments: () => {
          segmentOps.bulkDeleteSegments(Array.from(checkedSegments));
          clearCheckedSegments();
        }
      };

      onEditingStateChange(state, actions);
    }
  }, [
    isEditable,
    // Only depend on primitive values, not objects or functions
    editModes.selectionMode,
    editModes.mergeMode,
    editModes.splitMode,
    editModes.excludeMode,
    editModes.annotationMode,
    inlineEditingSegment,
    showHelp,
    // Convert Sets/Arrays to stable strings for comparison
    Array.from(checkedSegments).sort().join(','),
    Array.from(speakerManagement.selectedSegments).sort().join(','),
    selectedForMerge.sort().join(','),
    JSON.stringify(annotations.selectedWords || [])
  ]);

  return (
    <div 
      ref={autoScroll.scrollContainerRef}
      className={`${styles.conversationView} ${editModes.annotationMode ? 'annotation-mode-active' : ''} ${editModes.mergeMode ? 'merge-mode-active' : ''}`}
    >
      {/* Main Content */}
      {transcriptData.length === 0 ? (
        <WelcomeMessage />
      ) : (
        transcriptData.map((segment, segmentIndex) => (
          <TranscriptSegment
            key={segmentIndex}
            segment={segment}
            segmentIndex={segmentIndex}
            segmentId={autoScroll.getSegmentId(segmentIndex)}
            currentTime={currentTime}
            onSeek={onSeek}
            isEditable={isEditable}
            editModes={editModes}
            activeFilters={activeFilters}
            isSimpleAnnotationMode={isSimpleAnnotationMode}
            selectedSegments={speakerManagement.selectedSegments}
            selectedForMerge={selectedForMerge}
            selectedWords={annotations.selectedWords}
            checkedSegments={checkedSegments}
            inlineEditingSegment={inlineEditingSegment}
            onPlaySegment={handlePlaySegment}
            onStartEditing={startEditingSegment}
            onToggleSelection={speakerManagement.toggleSegmentSelection}
            onToggleMergeSelection={toggleMergeSelection}
            onToggleCheckbox={toggleSegmentCheckbox}
            onStartSpeakerChange={() => speakerManagement.startSpeakerChange(segmentIndex)}
            onDeleteSegment={segmentOps.deleteSegment}
            onAddNewSegment={segmentOps.addNewSegment}
            onToggleExclusion={segmentOps.toggleSegmentExclusion}
            onSplitSegment={(segmentIndex, wordIndex) => {
              segmentOps.splitSegmentAt(segmentIndex, wordIndex);
              // Reset splitting state after successful split to avoid showing split indicators on the new segment
              editModes.setSplittingSegment(null);
            }}
            onWordSelection={annotations.handleWordSelection}
            onWordRightClick={(event, segmentIndex, wordIndex, word, segment) => {
              const contextData = annotations.handleWordRightClick(event, segmentIndex, wordIndex, word, segment);
              setContextMenuData(contextData);
            }}
            onAnnotationClick={(_type, segment, wordIndex, event) => {
              // Set clicked word for immediate highlight
              const word = segment.words[wordIndex];
              if (word && word.start !== undefined && word.start !== null) {
                setClickedWord({ segmentIndex, wordIndex, timestamp: word.start });
              }
              
              const result = annotations.handleAnnotationClick(segment, wordIndex, event, onSeek);
              if (result) {
                if (Array.isArray(result)) {
                  // Multiple annotations
                  setSelectedAnnotations(result);
                  setSelectedAnnotation(result[0] || null);
                } else {
                  // Single annotation
                  setSelectedAnnotation(result);
                  setSelectedAnnotations(null);
                }
              }
            }}
            onPauseClick={(pause, event) => {
              
              const details = annotations.handlePauseClick(pause, event, onSeek);
             
              if (details) {
                
                setSelectedAnnotation(details);
              } 
            }}
            onStartInlineEditing={startInlineEditing}
            onSaveInlineEdit={(text) => {
              segmentOps.saveInlineEdit(segmentIndex, text);
              cancelInlineEdit();
            }}
            onCancelInlineEdit={cancelInlineEdit}
            editableRef={editableRef}
            dragHandlers={dragAndDrop}
            isPlaying={isPlaying}
            onTogglePlayPause={onTogglePlayPause}
            clickedWord={clickedWord}
            onWordClick={(segmentIdx, wordIdx, word) => {
              if (word && word.start !== undefined && word.start !== null) {
                setClickedWord({ segmentIndex: segmentIdx, wordIndex: wordIdx, timestamp: word.start });
              }
            }}
            onNoteChange={handleNoteChange}
          />
        ))
      )}
      
      {/* Popups and Dialogs */}
      <AnnotationPopup
        annotation={selectedAnnotation}
        annotations={selectedAnnotations || undefined}
        onClose={() => {
          setSelectedAnnotation(null);
          setSelectedAnnotations(null);
        }}
        onSeek={(timestamp) => {
          onSeek(timestamp);
          setSelectedAnnotation(null);
          setSelectedAnnotations(null);
        }}
      />

      <EditTranscriptPopup
        isOpen={editingSegment !== null}
        onClose={closeEditPopup}
        segment={editingSegment?.segment || null}
        segmentIndex={editingSegment?.index || 0}
        onSave={saveSegmentChanges}
        currentTime={currentTime}
        onSeekTo={onSeekTo || (() => {})}
        isPlaying={isPlaying}
        onTogglePlayPause={onTogglePlayPause || (() => {})}
        duration={duration}
      />

      <AnnotationCreationPopup
        isOpen={annotations.showAnnotationCreationPopup}
        onClose={annotations.closeAnnotationCreationPopup}
        selectedWords={annotations.selectedWords || []}
        segments={transcriptData}
        onSave={annotations.saveNewAnnotations}
        position={annotations.annotationCreationPosition}
      />

      <WordContextMenu
        isOpen={contextMenuData.isOpen}
        position={contextMenuData.position}
        onClose={closeContextMenu}
        word={contextMenuData.word}
        wordIndex={contextMenuData.wordIndex}
        segmentIndex={contextMenuData.segmentIndex}
        existingAnnotations={contextMenuData.existingAnnotations}
        onAddAnnotation={(type, position) => annotations.handleAddAnnotation(type, position, contextMenuData)}
        onRemoveAnnotation={(type) => annotations.handleRemoveAnnotation(type, contextMenuData)}
        onConvertAnnotation={(fromType, toType) => annotations.handleConvertAnnotation(fromType, toType, contextMenuData)}
      />

      <SpeakerChangeDialog
        isOpen={speakerManagement.showSpeakerChangePopup}
        speakerChangeData={speakerManagement.speakerChangeData}
        transcriptData={transcriptData}
        selectedSegments={speakerManagement.selectedSegments}
        onApply={speakerManagement.applySpeakerChange}
        onCancel={speakerManagement.cancelSpeakerChange}
        onDataChange={speakerManagement.setSpeakerChangeData}
      />

      {/* Error Notification Popup */}
      {errorMessage && (
        <div className="fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center space-x-3 bg-red-50 border border-red-200 text-red-800 animate-fadeIn">
          <div className="w-6 h-6 rounded-full flex items-center justify-center bg-red-500 text-white text-sm font-bold">
            ✕
          </div>
          <p className="text-sm font-medium">{errorMessage}</p>
          <button
            onClick={() => setErrorMessage(null)}
            className="ml-2 text-red-600 hover:text-red-800 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ConversationView;
