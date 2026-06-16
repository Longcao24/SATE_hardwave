import { useState, useCallback } from 'react';
import { type Segment } from '@/services/dataService';
import type { SpeakerChangeData } from '../types';
import { isValidSpeakerName } from '../utils/speakerUtils';

export const useSpeakerManagement = (
  transcriptData: Segment[],
  onTranscriptChange?: (updatedSegments: Segment[]) => void,
  onBulkOperationComplete?: () => void
) => {
  const [selectedSegments, setSelectedSegments] = useState<Set<number>>(new Set());
  const [showSpeakerChangePopup, setShowSpeakerChangePopup] = useState(false);
  const [speakerChangeData, setSpeakerChangeData] = useState<SpeakerChangeData | null>(null);

  const toggleSegmentSelection = useCallback((segmentIndex: number) => {
    setSelectedSegments(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(segmentIndex)) {
        newSelected.delete(segmentIndex);
      } else {
        newSelected.add(segmentIndex);
      }
      return newSelected;
    });
  }, []);

  const selectAllSegments = useCallback(() => {
    const allIndices = new Set(Array.from({ length: transcriptData.length }, (_, index) => index));
    setSelectedSegments(allIndices);
  }, [transcriptData.length]);

  const clearSelection = useCallback(() => {
    setSelectedSegments(new Set());
  }, []);

  const startSpeakerChange = useCallback((segmentIndex?: number, bulkSegmentIndices?: number[]) => {
    if (segmentIndex !== undefined) {
      // Single segment change
      if (segmentIndex < 0 || segmentIndex >= transcriptData.length) {
        console.error(`Cannot start speaker change: Invalid segment index ${segmentIndex}`);
        return;
      }
      
      const segment = transcriptData[segmentIndex];
      if (!segment || !segment.speaker) {
        console.error(`Cannot start speaker change: Segment at index ${segmentIndex} has no speaker`);
        return;
      }
      
      setSpeakerChangeData({
        segmentIndex,
        currentSpeaker: segment.speaker,
        newSpeaker: segment.speaker,
        applyToAll: false
      });
    } else if (bulkSegmentIndices && bulkSegmentIndices.length > 0) {
      // Bulk segments change (from checked segments)
      const validIndices = bulkSegmentIndices.filter(index => 
        index >= 0 && index < transcriptData.length && 
        transcriptData[index] && transcriptData[index].speaker !== 'PAUSE'
      );
      
      if (validIndices.length === 0) {
        console.error('Cannot start speaker change: No valid segments in bulk selection');
        return;
      }
      
      const firstSegment = transcriptData[validIndices[0]];
      
      // Set both states together using React's automatic batching
      const speakerData = {
        currentSpeaker: firstSegment.speaker,
        newSpeaker: firstSegment.speaker,
        applyToAll: false
      };
      
      setSelectedSegments(new Set(validIndices));
      setSpeakerChangeData(speakerData);
    } else if (selectedSegments.size > 0) {
      // Multiple segments change (from selection mode)
      const selectedIndices = Array.from(selectedSegments);
      const firstSelectedIndex = selectedIndices[0];
      
      if (firstSelectedIndex < 0 || firstSelectedIndex >= transcriptData.length) {
        console.error(`Cannot start speaker change: Invalid first selected segment index ${firstSelectedIndex}`);
        return;
      }
      
      const firstSegment = transcriptData[firstSelectedIndex];
      if (!firstSegment || !firstSegment.speaker) {
        console.error(`Cannot start speaker change: First selected segment has no speaker`);
        return;
      }
      
      setSpeakerChangeData({
        currentSpeaker: firstSegment.speaker,
        newSpeaker: firstSegment.speaker,
        applyToAll: false
      });
    } else {
      console.error('Cannot start speaker change: No segment selected');
      return;
    }
    
    setShowSpeakerChangePopup(true);
  }, [transcriptData, selectedSegments, onBulkOperationComplete]);

  const applySpeakerChange = useCallback(() => {
    if (!speakerChangeData || !onTranscriptChange) return;

    const trimmedNewSpeaker = speakerChangeData.newSpeaker.trim();
    
    if (!isValidSpeakerName(trimmedNewSpeaker)) {
      console.error('Speaker change failed: Invalid speaker name');
      return;
    }

    try {
      const updatedSegments = [...transcriptData];
      let changedSegmentCount = 0;

      if (speakerChangeData.segmentIndex !== undefined) {
        // Single segment or apply to all with same speaker
        if (speakerChangeData.applyToAll) {
          // Apply to all segments with the same current speaker
          updatedSegments.forEach((segment, index) => {
            if (segment.speaker === speakerChangeData.currentSpeaker) {
              updatedSegments[index] = {
                ...segment,
                speaker: trimmedNewSpeaker,
                is_edited: true
              };
              changedSegmentCount++;
            }
          });
        } else {
          // Apply to single segment only
          const segmentIndex = speakerChangeData.segmentIndex;
          
          if (segmentIndex >= 0 && segmentIndex < transcriptData.length) {
            updatedSegments[segmentIndex] = {
              ...updatedSegments[segmentIndex],
              speaker: trimmedNewSpeaker,
              is_edited: true
            };
            changedSegmentCount++;
          } else {
            console.error(`Speaker change failed: Invalid segment index ${segmentIndex}`);
            return;
          }
        }
      } else {
        // Apply to selected segments
        const selectedIndices = Array.from(selectedSegments);
        
        const invalidIndices = selectedIndices.filter(
          index => index < 0 || index >= transcriptData.length
        );
        if (invalidIndices.length > 0) {
          console.error(`Speaker change failed: Invalid segment indices ${invalidIndices.join(', ')}`);
          return;
        }
        
        selectedIndices.forEach(segmentIndex => {
          updatedSegments[segmentIndex] = {
            ...updatedSegments[segmentIndex],
            speaker: trimmedNewSpeaker,
            is_edited: true
          };
          changedSegmentCount++;
        });
      }
      
      // Apply the changes
      onTranscriptChange(updatedSegments);
      
      // Reset state after successful change
      setShowSpeakerChangePopup(false);
      setSpeakerChangeData(null);
      setSelectedSegments(new Set());
      
      // Notify parent about bulk operation completion (to clear checked segments)
      if (onBulkOperationComplete) {
        onBulkOperationComplete();
      }
      
    } catch (error) {
      console.error('Error applying speaker change:', error);
    }
  }, [speakerChangeData, onTranscriptChange, transcriptData, selectedSegments]);

  const cancelSpeakerChange = useCallback(() => {
    setShowSpeakerChangePopup(false);
    setSpeakerChangeData(null);
  }, []);

  return {
    // State
    selectedSegments,
    showSpeakerChangePopup,
    speakerChangeData,
    
    // Actions
    toggleSegmentSelection,
    selectAllSegments,
    clearSelection,
    startSpeakerChange,
    applySpeakerChange,
    cancelSpeakerChange,
    setSpeakerChangeData
  };
};
