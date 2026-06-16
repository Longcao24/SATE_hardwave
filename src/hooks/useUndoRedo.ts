import { useState, useCallback, useEffect, useRef } from 'react';
import type { Segment } from '../services/dataService';
import { HistoryService } from '../services/historyService';

interface UseUndoRedoReturn {
  // State
  canUndo: boolean;
  canRedo: boolean;
  hasUnsavedChanges: boolean;
  historyStats: {
    undoCount: number;
    redoCount: number;
    totalSize: number;
  };

  // Actions
  undo: () => void;
  redo: () => void;
  pushState: (newState: Segment[]) => void;
  clearHistory: () => void;
  
  // Wrapped transcript change handler
  handleTranscriptChange: (newState: Segment[]) => void;
}

/**
 * Custom hook for managing undo/redo functionality with localStorage persistence
 * 
 * @param recordingId - Unique identifier for the recording/transcript
 * @param transcriptData - Current transcript data
 * @param onTranscriptChange - Callback to update transcript data
 * @returns Undo/redo controls and wrapped change handler
 */
export const useUndoRedo = (
  recordingId: string | undefined,
  transcriptData: Segment[],
  onTranscriptChange?: (segments: Segment[]) => void
): UseUndoRedoReturn => {
  const historyServiceRef = useRef<HistoryService | null>(null);
  const [history, setHistory] = useState<{
    past: Segment[][];
    present: Segment[];
    future: Segment[][];
  }>({
    past: [],
    present: transcriptData,
    future: []
  });

  // Flag to prevent recording history during undo/redo operations
  const isUndoRedoOperation = useRef(false);

  // Initialize history service - always start fresh when visiting a recording
  useEffect(() => {
    if (!recordingId) return;

    const service = new HistoryService(recordingId);
    historyServiceRef.current = service;

    // Clear any existing history and start fresh
    // This ensures edit mode is not triggered when visiting a record
    service.clearHistory();
    
    // Initialize new history with current transcript data
    const initialHistory = service.initializeHistory(transcriptData);
    setHistory(initialHistory);
    service.saveHistory(initialHistory);
  }, [recordingId]); // Only run when recordingId changes

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (historyServiceRef.current && recordingId) {
      historyServiceRef.current.saveHistory(history);
    }
  }, [history, recordingId]);

  // Wrapped transcript change handler that adds to history
  const handleTranscriptChange = useCallback((newState: Segment[]) => {
    // Don't add to history if this is an undo/redo operation
    if (isUndoRedoOperation.current) {
      return;
    }

    if (!historyServiceRef.current) return;

    // Add current state to history before applying new state
    const newHistory = historyServiceRef.current.pushState(history, newState);
    setHistory(newHistory);

    // Call the original onChange callback
    if (onTranscriptChange) {
      onTranscriptChange(newState);
    }
  }, [history, onTranscriptChange]);

  // Undo action
  const undo = useCallback(() => {
    if (!historyServiceRef.current) return;

    const newHistory = historyServiceRef.current.undo(history);
    if (newHistory) {
      isUndoRedoOperation.current = true;
      setHistory(newHistory);
      
      // Update transcript with the previous state
      if (onTranscriptChange) {
        onTranscriptChange(newHistory.present);
      }

      // Reset flag after a short delay
      setTimeout(() => {
        isUndoRedoOperation.current = false;
      }, 100);
    }
  }, [history, onTranscriptChange]);

  // Redo action
  const redo = useCallback(() => {
    if (!historyServiceRef.current) return;

    const newHistory = historyServiceRef.current.redo(history);
    if (newHistory) {
      isUndoRedoOperation.current = true;
      setHistory(newHistory);
      
      // Update transcript with the next state
      if (onTranscriptChange) {
        onTranscriptChange(newHistory.present);
      }

      // Reset flag after a short delay
      setTimeout(() => {
        isUndoRedoOperation.current = false;
      }, 100);
    }
  }, [history, onTranscriptChange]);

  // Push a state manually (for external use if needed)
  const pushState = useCallback((newState: Segment[]) => {
    if (!historyServiceRef.current) return;

    const newHistory = historyServiceRef.current.pushState(history, newState);
    setHistory(newHistory);
  }, [history]);

  // Clear history
  const clearHistory = useCallback(() => {
    if (!historyServiceRef.current) return;

    const initialHistory = historyServiceRef.current.initializeHistory(transcriptData);
    setHistory(initialHistory);
    historyServiceRef.current.clearHistory();
  }, [transcriptData]);

  // Compute derived state
  const canUndo = historyServiceRef.current?.canUndo(history) || false;
  const canRedo = historyServiceRef.current?.canRedo(history) || false;
  const hasUnsavedChanges = history.past.length > 0 || history.future.length > 0;
  const historyStats = historyServiceRef.current?.getHistoryStats(history) || {
    undoCount: 0,
    redoCount: 0,
    totalSize: 0
  };

  return {
    canUndo,
    canRedo,
    hasUnsavedChanges,
    historyStats,
    undo,
    redo,
    pushState,
    clearHistory,
    handleTranscriptChange
  };
};

export type UndoRedoReturn = UseUndoRedoReturn;

export default useUndoRedo;

