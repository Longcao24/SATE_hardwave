import { useState } from 'react';
import { 
  updateRecording, 
  updateRecordingName, 
  loadRecording, 
  calculateSpeechAnalysis, 
  getErrorAnnotations 
} from '@/services/dataService';
import { detectTimestampOverlaps, fixTimestampOverlaps } from '@/lib/utils';
import type { User } from '@supabase/supabase-js';
import type { Segment, IssueCounts, SpeechAnalysis } from './types';

interface TranscriptEditorDeps {
  currentRecordingId: string | null;
  transcriptData: Segment[];
  setTranscriptData: (data: Segment[]) => void;
  setIssueCounts: (counts: IssueCounts) => void;
  setSpeechAnalysis: (analysis: SpeechAnalysis | null) => void;
  setAvailableErrorTypes: (types: string[]) => void;
  setActiveFilters: (filters: string[]) => void;
  setDataError: (error: string | null) => void;
}

/**
 * Hook to manage transcript editing and saving changes
 */
export function useTranscriptEditor(user: User | null, deps: TranscriptEditorDeps) {
  const [isEditMode, setIsEditMode] = useState(false);

  const handleTranscriptChange = (updatedSegments: Segment[]) => {
    // Detect and fix timestamp overlaps automatically
    const validation = detectTimestampOverlaps(updatedSegments);
    if (validation.hasOverlaps) {
      const fixedSegments = fixTimestampOverlaps(updatedSegments);
      deps.setTranscriptData(fixedSegments);
    } else {
      deps.setTranscriptData(updatedSegments);
    }
    
    // Recalculate speech analysis in real-time
    const newAnalysis = calculateSpeechAnalysis({ segments: updatedSegments });
    deps.setSpeechAnalysis(newAnalysis);
    
    // Recalculate issue counts (using the errorCounts from speech analysis to ensure excluded segments are filtered)
    const newIssueCounts = newAnalysis.errorCounts;
    
    deps.setIssueCounts(newIssueCounts);
    
    // Update available error types (getErrorAnnotations already filters excluded segments)
    const errorTypes = getErrorAnnotations(updatedSegments);
    deps.setAvailableErrorTypes(errorTypes);
    
    setIsEditMode(true);
  };

  const saveTranscriptChanges = async () => {
    if (!user) {
      throw new Error('You must be logged in to save changes');
    }

    if (!deps.currentRecordingId) {
      throw new Error('Cannot save changes to sample data or unsaved files. Please upload and process an audio file first.');
    }

    try {
      const result = await updateRecording(
        deps.currentRecordingId,
        { segments: deps.transcriptData },
        user.id
      );

      if (result.success) {
        setIsEditMode(false);
        return { success: true };
      } else {
        throw new Error(result.error || 'Failed to save changes');
      }
    } catch (error) {
      throw error;
    }
  };

  const saveRecordingNameChange = async (newName: string) => {
    if (!user) {
      return;
    }

    if (!deps.currentRecordingId) {
      return;
    }

    try {
      await updateRecordingName(
        deps.currentRecordingId,
        newName,
        user.id
      );
    } catch (error) {
      // Failed to save recording name
    }
  };

  const cancelEditMode = async () => {
    setIsEditMode(false);
    
    // Reload data from database to discard changes
    if (deps.currentRecordingId) {
      try {
        // Reload the recording from the database
        const recordingData = await loadRecording(deps.currentRecordingId);
        if (recordingData) {
          // Reset transcript data to the saved version
          deps.setTranscriptData(recordingData.transcript.segments);
          deps.setIssueCounts(recordingData.errorCounts);
          
          // Recalculate speech analysis
          const analysis = recordingData.analysis || calculateSpeechAnalysis(recordingData.transcript);
          deps.setSpeechAnalysis(analysis);
          
          // Update available error types for filtering
          const errorTypes = getErrorAnnotations(recordingData.transcript.segments);
          deps.setAvailableErrorTypes(errorTypes);
          deps.setActiveFilters(errorTypes);
        }
      } catch (error) {
        console.error('Failed to reload recording data:', error);
        deps.setDataError('Failed to reload original data');
      }
    }
    // If no currentRecordingId (sample data or new upload), can't revert
  };

  return {
    isEditMode,
    setIsEditMode,
    handleTranscriptChange,
    saveTranscriptChanges,
    saveRecordingNameChange,
    cancelEditMode,
  };
}

