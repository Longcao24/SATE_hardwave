import { useCallback } from 'react';
import { type Segment } from '@/services/dataService';
import { saltToJson } from '@/services/saltService';
import { 
  splitSegment, 
  mergeSegments as mergeSegmentsUtil, 
  createNewSegment, 
  toggleSegmentExclusion as toggleExclusion
} from '../utils/segmentOperations';

export const useSegmentOperations = (
  transcriptData: Segment[],
  onTranscriptChange?: (updatedSegments: Segment[]) => void,
  onError?: (message: string) => void
) => {
  // Split segment at a specific word index
  const splitSegmentAt = useCallback((segmentIndex: number, splitAfterWordIndex: number) => {
    if (!onTranscriptChange) return;
    
    const segment = transcriptData[segmentIndex];
    const result = splitSegment(segment, splitAfterWordIndex);
    
    if (!result) return;
    
    const { firstSegment, secondSegment } = result;
    
    const updatedSegments = [...transcriptData];
    updatedSegments.splice(segmentIndex, 1, firstSegment, secondSegment);
    onTranscriptChange(updatedSegments);
  }, [transcriptData, onTranscriptChange]);

  // Merge two segments
  const mergeSegments = useCallback((firstIndex: number, secondIndex: number) => {
    if (!onTranscriptChange) return;
    
    const indices = [firstIndex, secondIndex].sort((a, b) => a - b);
    const [firstIdx, secondIdx] = indices;
    const firstSegment = transcriptData[firstIdx];
    const secondSegment = transcriptData[secondIdx];
    
    const mergedSegment = mergeSegmentsUtil(firstSegment, secondSegment);
    
    // Remove both segments and any pause segments between them, then add merged segment
    const updatedSegments = [...transcriptData];
    const segmentsToRemove = secondIdx - firstIdx + 1;
    updatedSegments.splice(firstIdx, segmentsToRemove, mergedSegment);
    
    onTranscriptChange(updatedSegments);
  }, [transcriptData, onTranscriptChange]);

  // Add new segment
  const addNewSegment = useCallback((afterIndex: number) => {
    if (!onTranscriptChange) return;
    
    const afterSegment = transcriptData[afterIndex] || null;
    const beforeSegment = transcriptData[afterIndex + 1] || null;
    const newSegment = createNewSegment(beforeSegment, afterSegment);
    
    const updatedSegments = [...transcriptData];
    updatedSegments.splice(afterIndex + 1, 0, newSegment);
    onTranscriptChange(updatedSegments);
  }, [transcriptData, onTranscriptChange]);

  // Delete segment
  const deleteSegment = useCallback((segmentIndex: number) => {
    if (!onTranscriptChange) return;
    
    const updatedSegments = transcriptData.filter((_, index) => index !== segmentIndex);
    onTranscriptChange(updatedSegments);
  }, [transcriptData, onTranscriptChange]);

  // Toggle exclude/include status of a segment
  const toggleSegmentExclusion = useCallback((segmentIndex: number) => {
    if (!onTranscriptChange) return;
    
    const updatedSegments = transcriptData.map((segment, index) => {
      if (index === segmentIndex) {
        return toggleExclusion(segment);
      }
      return segment;
    });
    
    onTranscriptChange(updatedSegments);
  }, [transcriptData, onTranscriptChange]);

  // Save inline edit
  const saveInlineEdit = useCallback((segmentIndex: number, saltText: string) => {
    if (!onTranscriptChange) {
      return;
    }

    if (!transcriptData[segmentIndex]) {
      return;
    }

    const updatedSegments = [...transcriptData];
    const currentSegment = updatedSegments[segmentIndex];

    if (saltText.trim().length > 0) {
      try {
        // Always parse as SALT format (even plain text is valid SALT)
        const parsedSegment = saltToJson(saltText.trim(), currentSegment);
        
        // Update the segment with parsed data
        updatedSegments[segmentIndex] = {
          ...currentSegment,
          text: parsedSegment.text || saltText.trim(),
          words: parsedSegment.words || currentSegment.words,
          // Clear existing annotations first, then apply new ones
          fillerwords: parsedSegment.fillerwords || [],
          repetitions: parsedSegment.repetitions || [],
          mispronunciation: parsedSegment.mispronunciation || [],
          morphemes: parsedSegment.morphemes || [],
          morpheme_omissions: parsedSegment.morpheme_omissions || [],
          revisions: parsedSegment.revisions || [],
          pauses: parsedSegment.pauses || [],
          is_edited: true
        };

        onTranscriptChange(updatedSegments);
      } catch (error) {
        // Fallback: just update the text
        updatedSegments[segmentIndex] = {
          ...currentSegment,
          text: saltText.trim(),
          is_edited: true
        };
        onTranscriptChange(updatedSegments);
      }
    }
  }, [transcriptData, onTranscriptChange]);

  // Bulk merge multiple segments
  const bulkMergeSegments = useCallback((segmentIndices: number[]) => {
    if (!onTranscriptChange || segmentIndices.length < 2) return;
    
    // Sort indices to merge in order
    const sortedIndices = [...segmentIndices].sort((a, b) => a - b);
    
    // Validate that all segments can be merged (same speaker, consecutive or close)
    const segments = sortedIndices.map(index => transcriptData[index]);
    const firstSpeaker = segments[0].speaker;
    
    // Check if all segments have the same speaker (except PAUSE segments)
    const nonPauseSegments = segments.filter(s => s.speaker !== 'PAUSE');
    const allSameSpeaker = nonPauseSegments.every(s => s.speaker === firstSpeaker);
    
    if (!allSameSpeaker) {
      const errorMsg = 'Cannot merge segments with different speakers';
      if (onError) onError(errorMsg);
      return;
    }
    
    // Start with the first segment and merge all others into it
    let mergedSegment = segments[0];
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].speaker !== 'PAUSE') {
        mergedSegment = mergeSegmentsUtil(mergedSegment, segments[i]);
      }
    }
    
    // Create updated segments array
    const updatedSegments = [...transcriptData];
    
    // Remove all segments that were merged (in reverse order to maintain indices)
    for (let i = sortedIndices.length - 1; i >= 0; i--) {
      updatedSegments.splice(sortedIndices[i], 1);
    }
    
    // Insert the merged segment at the position of the first segment
    updatedSegments.splice(sortedIndices[0], 0, mergedSegment);
    
    onTranscriptChange(updatedSegments);
  }, [transcriptData, onTranscriptChange, onError]);

  // Bulk exclude/include segments with validation
  const bulkToggleExclusion = useCallback((segmentIndices: number[], exclude: boolean = true) => {
    if (!onTranscriptChange) return;
    
    // Get non-pause segments that would remain after exclusion
    const allNonPauseSegments = transcriptData.filter(s => s.speaker !== 'PAUSE');
    const segmentsToExclude = segmentIndices.filter(index => 
      transcriptData[index] && transcriptData[index].speaker !== 'PAUSE'
    );
    
    if (exclude) {
      // Validate that we're not excluding ALL utterances
      const remainingSegments = allNonPauseSegments.length - segmentsToExclude.length;
      if (remainingSegments <= 0) {
        const errorMsg = 'Cannot exclude all utterances. At least one utterance must remain.';
        if (onError) onError(errorMsg);
        return;
      }
    }
    
    const updatedSegments = transcriptData.map((segment, index) => {
      if (segmentIndices.includes(index)) {
        return {
          ...segment,
          excluded: exclude
        };
      }
      return segment;
    });
    
    onTranscriptChange(updatedSegments);
  }, [transcriptData, onTranscriptChange, onError]);

  // Bulk delete segments with validation
  const bulkDeleteSegments = useCallback((segmentIndices: number[]) => {
    if (!onTranscriptChange) return;
    
    // Get non-pause segments that would remain after deletion
    const allNonPauseSegments = transcriptData.filter(s => s.speaker !== 'PAUSE');
    const segmentsToDelete = segmentIndices.filter(index => 
      transcriptData[index] && transcriptData[index].speaker !== 'PAUSE'
    );
    
    // Validate that we're not deleting ALL utterances
    const remainingSegments = allNonPauseSegments.length - segmentsToDelete.length;
    if (remainingSegments <= 0) {
      const errorMsg = 'Cannot delete all utterances. At least one utterance must remain.';
      if (onError) onError(errorMsg);
      return;
    }
    
    // Sort indices in descending order to maintain correct indices during deletion
    const sortedIndices = [...segmentIndices].sort((a, b) => b - a);
    
    let updatedSegments = [...transcriptData];
    sortedIndices.forEach(index => {
      updatedSegments.splice(index, 1);
    });
    
    onTranscriptChange(updatedSegments);
  }, [transcriptData, onTranscriptChange, onError]);

  return {
    splitSegmentAt,
    mergeSegments,
    addNewSegment,
    deleteSegment,
    toggleSegmentExclusion,
    saveInlineEdit,
    bulkMergeSegments,
    bulkToggleExclusion,
    bulkDeleteSegments
  };
};
