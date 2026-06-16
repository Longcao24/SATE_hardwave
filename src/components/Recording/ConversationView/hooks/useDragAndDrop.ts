import { useState, useCallback } from 'react';
import { type Segment } from '@/services/dataService';
import { canMergeSegments } from '../utils/speakerUtils';

export const useDragAndDrop = (
  isDragEnabled: boolean,
  transcriptData: Segment[],
  onTranscriptChange?: (updatedSegments: Segment[]) => void,
  mergeSegments?: (firstIndex: number, secondIndex: number) => void
) => {
  const [draggedSegment, setDraggedSegment] = useState<number | null>(null);
  const [dragOverSegment, setDragOverSegment] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, segmentIndex: number) => {
    if (!isDragEnabled || transcriptData[segmentIndex].speaker === 'PAUSE') {
      e.preventDefault();
      return;
    }
    
    setDraggedSegment(segmentIndex);
    e.dataTransfer.setData('text/plain', segmentIndex.toString());
    e.dataTransfer.effectAllowed = 'move';
    
    // Add visual feedback
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '0.5';
  }, [isDragEnabled, transcriptData]);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedSegment(null);
    setDragOverSegment(null);
    
    // Remove visual feedback
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '1';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, segmentIndex: number) => {
    if (!isDragEnabled || draggedSegment === null || draggedSegment === segmentIndex) return;
    
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSegment(segmentIndex);
  }, [isDragEnabled, draggedSegment]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if we're actually leaving the element (not just moving to a child)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverSegment(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetSegmentIndex: number) => {
    e.preventDefault();
    
    const draggedIndex = draggedSegment;
    if (draggedIndex === null || draggedIndex === targetSegmentIndex || !onTranscriptChange) return;
    
    const segment1 = transcriptData[draggedIndex];
    const segment2 = transcriptData[targetSegmentIndex];
    
    // Don't allow merging with pause segments
    if (segment1.speaker === 'PAUSE' || segment2.speaker === 'PAUSE') {
      setDraggedSegment(null);
      setDragOverSegment(null);
      return;
    }
    
    // Check if segments can be merged (adjacent or with only pauses between)
    const indices = [draggedIndex, targetSegmentIndex].sort((a, b) => a - b);
    if (canMergeSegments(indices, transcriptData)) {
      if (mergeSegments) {
        mergeSegments(indices[0], indices[1]);
      }
    }
    
    setDraggedSegment(null);
    setDragOverSegment(null);
  }, [draggedSegment, transcriptData, onTranscriptChange, mergeSegments]);

  return {
    draggedSegment,
    dragOverSegment,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop
  };
};
