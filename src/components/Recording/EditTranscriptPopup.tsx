import React, { useState, useEffect, useRef } from 'react';
import { Edit2, Save, X, Play, Pause, RotateCcw, Clock, User, Type, Plus, Trash2, Settings, Zap, Info } from 'lucide-react';
import { type Segment } from '@/services/dataService';
import { saltToJson, containsSaltAnnotations, jsonToSalt } from '@/services/saltService';

interface EditTranscriptPopupProps {
  isOpen: boolean;
  onClose: () => void;
  segment: Segment | null;
  segmentIndex: number;
  onSave: (updatedSegment: Segment) => void;
  currentTime: number;
  onSeekTo: (time: number) => void;
  isPlaying: boolean;
  onTogglePlayPause: () => void;
  duration: number;
}

interface EditForm {
  speaker: string;
  text: string;
  start: number;
  end: number;
  words: Array<{word: string, start: number | null, end: number | null, index: number}>;
}

const EditTranscriptPopup: React.FC<EditTranscriptPopupProps> = ({
  isOpen,
  onClose,
  segment,
  segmentIndex,
  onSave,
  currentTime,
  onSeekTo,
  isPlaying,
  onTogglePlayPause,
  duration: _duration
}) => {
  const [editForm, setEditForm] = useState<EditForm>({
    speaker: '',
    text: '',
    start: 0,
    end: 0,
    words: []
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [showNotification, setShowNotification] = useState<{type: 'success' | 'warning' | 'info', message: string} | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [currentPlayingWord, setCurrentPlayingWord] = useState<number | null>(null);
  const [isUsingPopupControls, setIsUsingPopupControls] = useState(false);
  const [editMode, setEditMode] = useState<'simple' | 'advanced'>('simple');
  const [saltAnnotations, setSaltAnnotations] = useState<any>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const wordTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Pause audio when popup opens
  useEffect(() => {
    if (isOpen && isPlaying && onTogglePlayPause) {
      onTogglePlayPause();
    }
  }, [isOpen]); // Only run when isOpen changes

  // Initialize form when segment changes
  useEffect(() => {
    if (segment) {
      // Convert segment to SALT format for editing
      const saltText = jsonToSalt(segment);
      
      setEditForm({
        speaker: segment.speaker,
        text: saltText, // Show SALT format text for editing
        start: segment.start,
        end: segment.end,
        words: segment.words.map(w => ({...w}))
      });
      setHasChanges(false);
      setSaltAnnotations(null);
    }
  }, [segment]);

  // Auto-resize textarea
  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = 'auto';
      textAreaRef.current.style.height = textAreaRef.current.scrollHeight + 'px';
    }
  }, [editForm.text]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (wordTimeoutRef.current) {
        clearTimeout(wordTimeoutRef.current);
      }
    };
  }, []);

  // Auto-hide notifications
  useEffect(() => {
    if (showNotification) {
      const timer = setTimeout(() => {
        setShowNotification(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showNotification]);

  // Warn user about unsaved changes when trying to navigate away
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return 'You have unsaved changes. Are you sure you want to leave?';
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Warn on Ctrl+W (close tab) or Ctrl+R (refresh) when there are unsaved changes
      if (hasChanges && ((e.ctrlKey && e.key === 'w') || (e.ctrlKey && e.key === 'r'))) {
        e.preventDefault();
        showNotificationMessage('warning', 'You have unsaved changes! Please save before closing.');
      }
      
      // ESC key to close with confirmation if there are changes
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    if (isOpen) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [hasChanges, isOpen]);

  // Show notification helper
  const showNotificationMessage = (type: 'success' | 'warning' | 'info', message: string) => {
    setShowNotification({ type, message });
  };

  // Auto-reset popup controls flag after a delay when not actively being used
  useEffect(() => {
    if (isUsingPopupControls && currentPlayingWord === null) {
      const resetTimer = setTimeout(() => {
        setIsUsingPopupControls(false);
      }, 3000); // Reset after 3 seconds of no word playback

      return () => clearTimeout(resetTimer);
    }
  }, [isUsingPopupControls, currentPlayingWord]);

  // Track current playing word based on currentTime
  useEffect(() => {
    if (isPlaying) {
      const activeWordIndex = editForm.words.findIndex(word => 
        word.start !== null && word.end !== null &&
        currentTime >= word.start && currentTime <= word.end
      );
      if (activeWordIndex !== -1) {
        setCurrentPlayingWord(activeWordIndex);
      } else {
        setCurrentPlayingWord(null);
      }
    } else {
      setCurrentPlayingWord(null);
    }
  }, [currentTime, isPlaying, editForm.words]);

  // Format time for display
  const formatTime = (seconds: number): string => {
    if (!seconds || !isFinite(seconds)) return '0:00.0';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
  };

  // Auto-generate word timestamps based on text with smart timing
  const generateWordTimestamps = (text: string, startTime: number, endTime: number) => {
    if (!text.trim()) return [];
    
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    if (words.length === 0) return [];
    
    const totalDuration = endTime - startTime;
    
    // Calculate word weights based on character length (longer words get slightly more time)
    const wordWeights = words.map(word => Math.max(0.5, Math.log(word.length + 1)));
    const totalWeight = wordWeights.reduce((sum, weight) => sum + weight, 0);
    
    // Distribute time based on weights
    let currentTime = startTime;
    return words.map((word, index) => {
      const wordDuration = (wordWeights[index] / totalWeight) * totalDuration;
      const wordStart = currentTime;
      const wordEnd = currentTime + wordDuration;
      currentTime = wordEnd;
      
      return {
        word: word,
        start: Math.round(wordStart * 10) / 10, // Round to 1 decimal place
        end: Math.round(wordEnd * 10) / 10,
        index: index
      };
    });
  };

  // Handle simple text editing (always process as SALT format)
  const handleSimpleTextChange = (newText: string) => {
    const wasChanged = hasChanges;
    
    // Always parse as SALT format (even plain text is valid SALT)
    const parsedSegment = saltToJson(newText, segment || undefined);
    
    // Update form with parsed data
    setEditForm(prev => ({
      ...prev,
      text: newText, // Keep the SALT format text in the textarea
      words: parsedSegment.words || prev.words
    }));
    
    // Store parsed annotations to be applied on save
    setSaltAnnotations(parsedSegment);
    
    // Show notification for first change
    if (!wasChanged) {
      if (containsSaltAnnotations(newText)) {
        showNotificationMessage('info', 'SALT annotations detected! They will be applied when you save.');
      } else {
        showNotificationMessage('info', 'Text updated! Add SALT annotations like :02 for pauses (2 seconds) or (word) for repetitions.');
      }
    }
    
    setHasChanges(true);
  };

  // Handle mode switching
  const handleModeSwitch = (newMode: 'simple' | 'advanced') => {
    if (newMode === 'simple' && editMode === 'advanced') {
      // When switching from advanced to simple, convert to SALT format
      const currentSegment = {
        ...segment!,
        words: editForm.words,
        speaker: editForm.speaker,
        start: editForm.start,
        end: editForm.end
      };
      const saltText = jsonToSalt(currentSegment);
      setEditForm(prev => ({ ...prev, text: saltText }));
    } else if (newMode === 'advanced' && editMode === 'simple') {
      // When switching to advanced, parse SALT and update words
      const parsedSegment = saltToJson(editForm.text, segment || undefined);
      setEditForm(prev => ({ 
        ...prev, 
        words: parsedSegment.words || generateWordTimestamps(parsedSegment.text || editForm.text, editForm.start, editForm.end)
      }));
    }
    setEditMode(newMode);
  };

  // Handle form changes
  const handleFormChange = (field: keyof EditForm, value: any) => {
    const wasChanged = hasChanges;
    setEditForm(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
    
    // Show notification for first change
    if (!wasChanged) {
      showNotificationMessage('info', 'Changes detected. Remember to save when finished!');
    }
  };

  // Handle time controls
  const seekToStart = () => {
    // Mark that user is using popup controls
    setIsUsingPopupControls(true);
    
    // Stop word playback when using segment controls
    if (currentPlayingWord !== null) {
      setCurrentPlayingWord(null);
      if (wordTimeoutRef.current) {
        clearTimeout(wordTimeoutRef.current);
        wordTimeoutRef.current = null;
      }
    }
    onSeekTo(editForm.start);
  };

  const seekToEnd = () => {
    // Mark that user is using popup controls
    setIsUsingPopupControls(true);
    
    // Stop word playback when using segment controls
    if (currentPlayingWord !== null) {
      setCurrentPlayingWord(null);
      if (wordTimeoutRef.current) {
        clearTimeout(wordTimeoutRef.current);
        wordTimeoutRef.current = null;
      }
    }
    onSeekTo(editForm.end);
  };

  // Check if current playback is within the segment bounds
  const isPlaybackInSegment = currentTime >= editForm.start && currentTime <= editForm.end;

  // Auto-pause when playback goes outside segment bounds (only when user is actively using popup controls)
  React.useEffect(() => {
    // Only auto-pause if:
    // 1. We're playing audio
    // 2. We're outside segment bounds
    // 3. User is actively using popup controls (either word-level or segment-level)
    if (isPlaying && 
        (currentTime > editForm.end || currentTime < editForm.start) &&
        (currentPlayingWord !== null || isUsingPopupControls)) {
      onTogglePlayPause(); // Pause when going outside segment bounds
      setIsUsingPopupControls(false); // Reset the flag after auto-pause
    }
  }, [currentTime, editForm.start, editForm.end, isPlaying, onTogglePlayPause, currentPlayingWord, isUsingPopupControls]);

  // Override play segment to be more restrictive
  const handlePlayToggle = () => {
    // Mark that user is using popup controls
    setIsUsingPopupControls(true);
    
    // Stop any word-level playback when using segment controls
    if (currentPlayingWord !== null) {
      setCurrentPlayingWord(null);
      if (wordTimeoutRef.current) {
        clearTimeout(wordTimeoutRef.current);
        wordTimeoutRef.current = null;
      }
    }

    if (!isPlaying) {
      // If not playing, start from segment beginning if outside bounds
      if (!isPlaybackInSegment) {
        onSeekTo(editForm.start);
      }
      onTogglePlayPause();
    } else {
      // If playing, just pause
      onTogglePlayPause();
    }
  };

  // Handle progress bar seek
  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Mark that user is using popup controls
    setIsUsingPopupControls(true);
    
    // Stop word playback when seeking via progress bar
    if (currentPlayingWord !== null) {
      setCurrentPlayingWord(null);
      if (wordTimeoutRef.current) {
        clearTimeout(wordTimeoutRef.current);
        wordTimeoutRef.current = null;
      }
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = editForm.start + (percentage * (editForm.end - editForm.start));
    onSeekTo(targetTime);
  };

  const handleProgressBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, mouseX / rect.width));
    setHoverPosition(percentage);
  };

  const handleProgressBarMouseLeave = () => {
    setHoverPosition(null);
  };

  // Update segment timing
  const updateTiming = (field: 'start' | 'end', value: number) => {
    const wasChanged = hasChanges;
    setEditForm(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
    
    // Show notification for first change
    if (!wasChanged) {
      showNotificationMessage('info', 'Changes detected. Remember to save when finished!');
    }
  };

  // Play individual word
  const playWord = (wordIndex: number) => {
    const word = editForm.words[wordIndex];
    if (word && word.start !== undefined && word.end !== undefined) {
      // If clicking the same word that's already playing, stop it
      if (currentPlayingWord === wordIndex && isPlaying) {
        // Stop current playback
        onTogglePlayPause();
        setCurrentPlayingWord(null);
        
        // Clear timeout
        if (wordTimeoutRef.current) {
          clearTimeout(wordTimeoutRef.current);
          wordTimeoutRef.current = null;
        }
        return;
      }

      // Stop any other word that might be playing
      if (currentPlayingWord !== null && isPlaying) {
        onTogglePlayPause();
      }
      
      // Clear any existing timeout
      if (wordTimeoutRef.current) {
        clearTimeout(wordTimeoutRef.current);
        wordTimeoutRef.current = null;
      }

      // Seek to word start
      if (word.start !== null) {
        onSeekTo(word.start);
      }
      
      // Set current playing word immediately
      setCurrentPlayingWord(wordIndex);
      
      // Start playing after a small delay to ensure seek completes
      setTimeout(() => {
        if (!isPlaying) {
          onTogglePlayPause();
        }
        
        // Auto-pause when word ends
        const wordDuration = ((word.end || 0) - (word.start || 0)) * 1000; // Convert to milliseconds
        wordTimeoutRef.current = setTimeout(() => {
          onTogglePlayPause();
          setCurrentPlayingWord(null);
        }, wordDuration + 100); // Add small buffer
      }, 50); // Small delay for seek to complete
    }
  };

  // Check if a specific word is currently playing
  const isWordPlaying = (wordIndex: number) => {
    return currentPlayingWord === wordIndex && isPlaying;
  };

  // Update word in edit form
  const updateWord = (wordIndex: number, field: 'word' | 'start' | 'end', value: string | number) => {
    const wasChanged = hasChanges;
    const updatedWords = [...editForm.words];
    updatedWords[wordIndex] = {
      ...updatedWords[wordIndex],
      [field]: value
    };
    setEditForm(prev => ({ ...prev, words: updatedWords }));
    setHasChanges(true);

    // Update segment text when word changes
    if (field === 'word') {
      const newText = updatedWords.map(w => w.word).join(' ');
      setEditForm(prev => ({ ...prev, text: newText }));
    }
    
    // Show notification for first change
    if (!wasChanged) {
      showNotificationMessage('info', 'Changes detected. Remember to save when finished!');
    }
  };

  // Add new word
  const addWord = (afterIndex: number) => {
    const newWord = {
      word: 'new',
      start: editForm.words[afterIndex]?.end || editForm.start,
      end: (editForm.words[afterIndex]?.end || editForm.start) + 1,
      index: afterIndex + 1
    };
    
    const updatedWords = [...editForm.words];
    updatedWords.splice(afterIndex + 1, 0, newWord);

    updatedWords.forEach((word, idx) => {
      word.index = idx;
    });
    setEditForm(prev => ({ ...prev, words: updatedWords }));
    setHasChanges(true);

    // Update text
    const newText = updatedWords.map(w => w.word).join(' ');
    setEditForm(prev => ({ ...prev, text: newText }));
    
    showNotificationMessage('info', 'New word added. Don\'t forget to save your changes!');
  };

  // Delete word
  const deleteWord = (wordIndex: number) => {
    const deletedWord = editForm.words[wordIndex]?.word || 'word';
    const updatedWords = editForm.words.filter((_, index) => index !== wordIndex);
    
    updatedWords.forEach((word, idx) => {
      word.index = idx;
    });
    
    setEditForm(prev => ({ ...prev, words: updatedWords }));
    setHasChanges(true);

    // Update text
    const newText = updatedWords.map(w => w.word).join(' ');
    setEditForm(prev => ({ ...prev, text: newText }));
    
    showNotificationMessage('warning', `Word "${deletedWord}" deleted. Don't forget to save your changes!`);
  };

  // Save changes
  const handleSave = () => {
    if (!segment) return;

    const updatedSegment: Segment = {
      ...segment,
      speaker: editForm.speaker,
      text: editForm.text,
      start: editForm.start,
      end: editForm.end,
      words: editForm.words
    };
    
    // Apply SALT annotations if they were parsed
    if (saltAnnotations) {
      if (saltAnnotations.repetitions) updatedSegment.repetitions = saltAnnotations.repetitions;
      if (saltAnnotations.revisions) updatedSegment.revisions = saltAnnotations.revisions;
      if (saltAnnotations.pauses) updatedSegment.pauses = saltAnnotations.pauses;
      if (saltAnnotations.morphemes) updatedSegment.morphemes = saltAnnotations.morphemes;
    }

    onSave(updatedSegment);
    setHasChanges(false);
    showNotificationMessage('success', 'Changes saved successfully!');
    
    // Close after a brief delay to show the notification
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  // Handle close with confirmation
  const handleClose = () => {
    // Stop any word playback when closing
    if (currentPlayingWord !== null) {
      setCurrentPlayingWord(null);
      if (wordTimeoutRef.current) {
        clearTimeout(wordTimeoutRef.current);
        wordTimeoutRef.current = null;
      }
      if (isPlaying) {
        onTogglePlayPause();
      }
    }

    if (hasChanges) {
      setShowConfirmClose(true);
    } else {
      onClose();
    }
  };

  // Reset to original with confirmation
  const resetToOriginal = () => {
    if (hasChanges) {
      setShowConfirmReset(true);
    } else {
      showNotificationMessage('info', 'No changes to reset');
    }
  };

  // Confirm reset to original
  const confirmResetToOriginal = () => {
    if (segment) {
      // Convert segment to SALT format for editing
      const saltText = jsonToSalt(segment);
      
      setEditForm({
        speaker: segment.speaker,
        text: saltText, // Show SALT format text
        start: segment.start,
        end: segment.end,
        words: segment.words.map(w => ({...w}))
      });
      setHasChanges(false);
      setSaltAnnotations(null);
      setShowConfirmReset(false);
      showNotificationMessage('success', 'Successfully reset to original values');
    }
  };

  if (!isOpen || !segment) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between transition-colors ${
          hasChanges ? 'bg-amber-50 border-amber-200' : 'bg-gray-50'
        }`}>
          <div className="flex items-center gap-3">
            <Edit2 className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Edit Segment {segmentIndex + 1}
            </h2>
            {hasChanges && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                <span className="text-sm bg-amber-100 text-amber-800 px-3 py-1 rounded-full font-medium">
                  Unsaved changes
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Prominent Exit Mode Button */}
            <button
              onClick={handleClose}
              className="exit-mode-btn flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all duration-200 font-medium text-sm shadow-lg hover:shadow-xl transform hover:scale-105"
              title={hasChanges ? "Exit Edit Mode (you have unsaved changes)" : "Exit Edit Mode (Esc)"}
            >
              <X className="w-4 h-4" />
              Exit Edit Mode
            </button>
            {/* Small close button for minimal interface */}
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors opacity-50"
              title={hasChanges ? "Close (you have unsaved changes)" : "Close"}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Time Controls */}
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-blue-900 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Time Controls
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {/* Segment Timing */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Start Time</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    value={editForm.start}
                    onChange={(e) => updateTiming('start', parseFloat(e.target.value) || 0)}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={seekToStart}
                    className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                    title="Seek to start"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-xs text-gray-500">{formatTime(editForm.start)}</div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">End Time</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    value={editForm.end}
                    onChange={(e) => updateTiming('end', parseFloat(e.target.value) || 0)}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={seekToEnd}
                    className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                    title="Seek to end"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-xs text-gray-500">{formatTime(editForm.end)}</div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Duration</label>
                <div className="px-2 py-1 text-sm bg-gray-100 border border-gray-300 rounded">
                  {formatTime(editForm.end - editForm.start)}
                </div>
                                 <button
                   onClick={handlePlayToggle}
                   className="w-full px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                 >
                   {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                   {isPlaying ? 'Pause' : (isPlaybackInSegment ? 'Continue' : 'Play Segment')}
                 </button>
              </div>
            </div>

                         {/* Segment Progress Bar */}
             <div className="mb-2">
               <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                 <span>Segment Progress (click to seek)</span>
                 <span>{Math.round(((currentTime - editForm.start) / (editForm.end - editForm.start)) * 100) || 0}%</span>
               </div>
               <div 
                 className="w-full h-4 bg-gray-200 rounded-full overflow-hidden cursor-pointer hover:bg-gray-300 transition-colors relative group shadow-inner"
                 onClick={handleProgressBarClick}
                 onMouseMove={handleProgressBarMouseMove}
                 onMouseLeave={handleProgressBarMouseLeave}
                 title="Click to seek within segment"
               >
                 {/* Progress fill */}
                 <div 
                   className={`h-full transition-all duration-200 ${
                     isPlaybackInSegment ? 'bg-blue-500' : 'bg-orange-500'
                   }`}
                   style={{
                     width: `${Math.max(0, Math.min(100, ((currentTime - editForm.start) / (editForm.end - editForm.start)) * 100))}%`
                   }}
                 />
                 
                 {/* Current position indicator */}
                 <div 
                   className={`absolute top-0 w-1 h-full ${
                     isPlaybackInSegment ? 'bg-blue-700' : 'bg-orange-700'
                   } shadow-lg transform -translate-x-0.5`}
                   style={{ 
                     left: `${Math.max(0, Math.min(100, ((currentTime - editForm.start) / (editForm.end - editForm.start)) * 100))}%` 
                   }} 
                 />

                 {/* Hover preview */}
                 {hoverPosition !== null && (
                   <div className="absolute inset-0 pointer-events-none">
                     <div 
                       className="absolute top-0 w-0.5 h-full bg-gray-700 opacity-50 transform -translate-x-0.25"
                       style={{ left: `${hoverPosition * 100}%` }}
                     />
                     <div 
                       className="absolute -top-8 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap"
                       style={{ left: `${hoverPosition * 100}%` }}
                     >
                       {formatTime(editForm.start + (hoverPosition * (editForm.end - editForm.start)))}
                     </div>
                   </div>
                 )}

                 {/* Time markers (quarter marks) */}
                 <div className="absolute inset-0 pointer-events-none">
                   {[0.25, 0.5, 0.75].map((position) => (
                     <div
                       key={position}
                       className="absolute top-0 w-px h-full bg-gray-400 opacity-30"
                       style={{ left: `${position * 100}%` }}
                     />
                   ))}
                 </div>
               </div>
               
               {/* Time labels below progress bar */}
               <div className="flex justify-between text-xs text-gray-500 mt-1 px-1">
                 <span>{formatTime(editForm.start)}</span>
                 <span className="font-medium">{formatTime(editForm.start + (editForm.end - editForm.start) / 2)}</span>
                 <span>{formatTime(editForm.end)}</span>
               </div>
             </div>

             {/* Current Time Indicator */}
             <div className="text-xs text-gray-600 flex items-center gap-2">
               <Clock className="w-3 h-3" />
               Current playback: {formatTime(currentTime)}
               {isPlaybackInSegment ? (
                 <span className="text-green-600 font-medium">● In segment</span>
               ) : (
                 <span className="text-orange-600 font-medium">● Outside segment</span>
               )}
             </div>

             {/* Warning when outside segment */}
             {!isPlaybackInSegment && isPlaying && (
               <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-md">
                 <div className="flex items-center gap-2 text-orange-800 text-xs">
                   <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                   <span className="font-medium">Playback is outside the current segment</span>
                 </div>
                 <div className="mt-1 flex gap-2">
                   <button
                     onClick={seekToStart}
                     className="text-xs px-2 py-1 bg-orange-100 hover:bg-orange-200 text-orange-800 rounded transition-colors"
                   >
                     Return to Start
                   </button>
                   <button
                     onClick={() => onTogglePlayPause()}
                     className="text-xs px-2 py-1 bg-orange-100 hover:bg-orange-200 text-orange-800 rounded transition-colors"
                   >
                     Pause
                   </button>
                 </div>
               </div>
             )}
          </div>

          {/* Speaker */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <User className="w-4 h-4" />
              Speaker
            </label>
            <input
              type="text"
              value={editForm.speaker}
              onChange={(e) => handleFormChange('speaker', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Speaker name"
            />
          </div>

          {/* Edit Mode Toggle */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Type className="w-4 h-4" />
                Transcript Text
              </label>
              <div className="edit-mode-toggle flex items-center gap-0">
                <button
                  onClick={() => handleModeSwitch('simple')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                    editMode === 'simple' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Simple text editing with automatic timestamp calculation"
                >
                  <Zap className="w-3 h-3" />
                  Simple Edit
                </button>
                <button
                  onClick={() => handleModeSwitch('advanced')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                    editMode === 'advanced' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Advanced word-level editing with precise timestamp control"
                >
                  <Settings className="w-3 h-3" />
                  Advanced
                </button>
              </div>
            </div>

            {editMode === 'simple' ? (
              <>
                <div className="mb-2 p-2 bg-green-50 border border-green-200 rounded-md">
                  <div className="flex items-center gap-2 text-green-800 text-sm">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="font-medium">Simple Mode:</span>
                    <span>Edit text directly. Timestamps will be automatically calculated.</span>
                  </div>
                </div>
                
                {/* SALT Format Help */}
                <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-blue-800">
                      <div className="font-medium mb-1">SALT Format Editing:</div>
                      <div className="space-y-0.5">
                        <div className="text-blue-700 font-medium">The text below shows existing annotations in SALT format.</div>
                        <div><code className="bg-blue-100 px-1 rounded">:02</code> - Pause of 2 seconds (whole seconds only)</div>
                        <div><code className="bg-blue-100 px-1 rounded">(word)</code> - Repetition/revision/filler</div>
                        <div><code className="bg-blue-100 px-1 rounded">word/ed</code> - Morpheme marker (ed, ing, s, 3s, en, z)</div>
                        <div className="mt-1 text-blue-600">Example: <code className="bg-blue-100 px-1 rounded">I :01 (um) went/ed to the store</code></div>
                        <div className="text-blue-700 mt-1">You can add, edit, or remove annotations directly in the text.</div>
                      </div>
                    </div>
                  </div>
                </div>
                                 <textarea
                   ref={textAreaRef}
                   value={editForm.text}
                   onChange={(e) => handleSimpleTextChange(e.target.value)}
                   className="simple-edit-textarea w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none min-h-[80px]"
                   placeholder="Edit your transcript text here..."
                 />
                 <div className="simple-edit-info mt-2 text-xs text-gray-500 flex items-center justify-between">
                   <span>
                     {editForm.words.length} words • Duration: {formatTime(editForm.end - editForm.start)}
                   </span>
                   <span>
                     Avg: {editForm.words.length > 0 ? formatTime((editForm.end - editForm.start) / editForm.words.length) : '0.0s'} per word
                   </span>
                 </div>
              </>
            ) : (
              <>
                <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                  <div className="flex items-center gap-2 text-amber-800 text-sm">
                    <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                    <span className="font-medium">Advanced Mode:</span>
                    <span>Use Word-level Editing below to modify text and timestamps precisely.</span>
                  </div>
                </div>
                <textarea
                  ref={textAreaRef}
                  value={editForm.text}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700 resize-none min-h-[80px] cursor-not-allowed"
                  placeholder="Transcript text"
                />
              </>
            )}
          </div>

                     {/* Word-level editing - Only in Advanced Mode */}
           {editMode === 'advanced' && (
             <div className="mb-6">
               <h3 className="text-sm font-medium text-gray-700 mb-3">Word-level Editing</h3>
             
             {/* Header row */}
             <div className="grid grid-cols-7 gap-2 items-center p-2 bg-gray-100 rounded-t border-b text-xs font-medium text-gray-600 mb-2">
               <div className="text-center">Play</div>
               <div className="col-span-2">Word</div>
               <div className="text-center">Start (s)</div>
               <div className="text-center">End (s)</div>
               <div className="text-center">Actions</div>
               <div className="text-center">Duration</div>
             </div>

             <div className="space-y-2 max-h-60 overflow-y-auto">
               {editForm.words.map((word, index) => {
                 const isCurrentWordPlaying = isWordPlaying(index);
                 
                 return (
                   <div 
                     key={index} 
                     className={`grid grid-cols-7 gap-2 items-center p-2 rounded transition-colors ${
                       isCurrentWordPlaying 
                         ? 'bg-blue-50 border border-blue-200' 
                         : 'bg-gray-50 hover:bg-gray-100'
                     }`}
                   >
                     {/* Play button */}
                     <div className="flex justify-center">
                       <button
                         onClick={() => playWord(index)}
                         className={`p-1 rounded transition-colors ${
                           isCurrentWordPlaying
                             ? 'text-blue-600 bg-blue-100 hover:bg-blue-200'
                             : 'text-gray-600 hover:bg-gray-200'
                         }`}
                         title={`Play "${word.word}"`}
                         disabled={word.start === null || word.start === undefined || word.end === null || word.end === undefined}
                       >
                         {isCurrentWordPlaying ? (
                           <Pause className="w-3 h-3" />
                         ) : (
                           <Play className="w-3 h-3" />
                         )}
                       </button>
                     </div>

                     {/* Word text */}
                     <div className="col-span-2">
                       <input
                         type="text"
                         value={word.word}
                         onChange={(e) => updateWord(index, 'word', e.target.value)}
                         className={`w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500 ${
                           isCurrentWordPlaying
                             ? 'border-blue-300 bg-blue-50'
                             : 'border-gray-300'
                         }`}
                         placeholder="Word"
                       />
                     </div>

                     {/* Start time */}
                     <div>
                       <input
                         type="number"
                         step="0.1"
                         value={word.start || 0}
                         onChange={(e) => updateWord(index, 'start', parseFloat(e.target.value) || 0)}
                         className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                         title="Start time"
                       />
                     </div>

                     {/* End time */}
                     <div>
                       <input
                         type="number"
                         step="0.1"
                         value={word.end || 0}
                         onChange={(e) => updateWord(index, 'end', parseFloat(e.target.value) || 0)}
                         className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                         title="End time"
                       />
                     </div>

                     {/* Action buttons */}
                     <div className="flex gap-1 justify-center">
                       <button
                         onClick={() => addWord(index)}
                         className="p-1 text-green-600 hover:bg-green-100 rounded transition-colors"
                         title="Add word after"
                       >
                         <Plus className="w-3 h-3" />
                       </button>
                       <button
                         onClick={() => deleteWord(index)}
                         className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                         title="Delete word"
                       >
                         <Trash2 className="w-3 h-3" />
                       </button>
                     </div>

                     {/* Duration */}
                     <div className="text-xs text-gray-500 text-center">
                       {formatTime((word.end || 0) - (word.start || 0))}
                     </div>
                   </div>
                 );
               })}
             </div>

             
           </div>
           )}
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 border-t flex items-center justify-between transition-colors ${
          hasChanges ? 'bg-amber-50 border-amber-200' : 'bg-gray-50'
        }`}>
          <button
            onClick={resetToOriginal}
            className={`px-4 py-2 text-sm transition-all flex items-center gap-2 rounded-md ${
              hasChanges 
                ? 'text-orange-700 hover:text-orange-800 hover:bg-orange-100 border border-orange-200' 
                : 'text-gray-400 cursor-not-allowed'
            }`}
            disabled={!hasChanges}
            title={hasChanges ? "Reset all changes to original values" : "No changes to reset"}
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Original
          </button>

          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
              disabled={!hasChanges}
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        </div>
      </div>

      {/* Notification */}
      {showNotification && (
        <div className="fixed top-4 right-4 z-70 animate-in slide-in-from-right duration-300">
          <div className={`p-4 rounded-lg shadow-lg max-w-sm ${
            showNotification.type === 'success' ? 'bg-green-50 border border-green-200' :
            showNotification.type === 'warning' ? 'bg-amber-50 border border-amber-200' :
            'bg-blue-50 border border-blue-200'
          }`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                showNotification.type === 'success' ? 'bg-green-500' :
                showNotification.type === 'warning' ? 'bg-amber-500' :
                'bg-blue-500'
              }`}></div>
              <span className={`text-sm font-medium ${
                showNotification.type === 'success' ? 'text-green-800' :
                showNotification.type === 'warning' ? 'text-amber-800' :
                'text-blue-800'
              }`}>
                {showNotification.message}
              </span>
              <button
                onClick={() => setShowNotification(null)}
                className={`ml-auto text-xs ${
                  showNotification.type === 'success' ? 'text-green-600 hover:text-green-800' :
                  showNotification.type === 'warning' ? 'text-amber-600 hover:text-amber-800' :
                  'text-blue-600 hover:text-blue-800'
                }`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Close */}
      {showConfirmClose && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Unsaved Changes</h3>
            <p className="text-gray-600 mb-4">
              You have unsaved changes. Are you sure you want to close the editor?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmClose(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Continue Editing
              </button>
              <button
                onClick={() => {
                  setShowConfirmClose(false);
                  onClose();
                }}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Reset */}
      {showConfirmReset && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Reset to Original</h3>
            <p className="text-gray-600 mb-4">
              This will discard all your changes and reset the segment to its original values. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmReset(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmResetToOriginal}
                className="px-4 py-2 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Reset to Original
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditTranscriptPopup; 