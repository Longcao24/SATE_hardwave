import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { type Segment } from '../services/dataService';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Timestamp validation and normalization utilities
export interface TimestampValidationResult {
  hasOverlaps: boolean;
  conflicts: Array<{
    segmentIndex1: number;
    segmentIndex2: number;
    overlap: number;
    description: string;
  }>;
  fixedSegments?: Segment[];
}

/**
 * Detects timestamp overlaps between segments that could cause audio playback issues
 */
export function detectTimestampOverlaps(segments: Segment[]): TimestampValidationResult {
  const conflicts: TimestampValidationResult['conflicts'] = [];
  
  for (let i = 0; i < segments.length - 1; i++) {
    const currentSegment = segments[i];
    const nextSegment = segments[i + 1];
    
    // Skip pause segments for overlap detection as they handle timing differently
    if (currentSegment.speaker === 'PAUSE' || nextSegment.speaker === 'PAUSE') {
      continue;
    }
    
    // Check if current segment end overlaps with next segment start
    const overlap = currentSegment.end - nextSegment.start;
    if (overlap > 0.01) { // Allow 10ms tolerance
      conflicts.push({
        segmentIndex1: i,
        segmentIndex2: i + 1,
        overlap,
        description: `Segment ${i} ends at ${currentSegment.end}s but segment ${i + 1} starts at ${nextSegment.start}s (overlap: ${overlap.toFixed(3)}s)`
      });
    }
    
    // Check for word timestamp conflicts within segments
    if (currentSegment.words.length > 0 && nextSegment.words.length > 0) {
      const lastWord = currentSegment.words[currentSegment.words.length - 1];
      const firstWord = nextSegment.words[0];
      
      if (lastWord.end && firstWord.start && lastWord.end > firstWord.start) {
        const wordOverlap = lastWord.end - firstWord.start;
        conflicts.push({
          segmentIndex1: i,
          segmentIndex2: i + 1,
          overlap: wordOverlap,
          description: `Last word of segment ${i} ends at ${lastWord.end}s but first word of segment ${i + 1} starts at ${firstWord.start}s (overlap: ${wordOverlap.toFixed(3)}s)`
        });
      }
    }
  }
  
  return {
    hasOverlaps: conflicts.length > 0,
    conflicts
  };
}

/**
 * Fixes timestamp overlaps by adding small gaps between segments
 */
export function fixTimestampOverlaps(segments: Segment[]): Segment[] {
  const fixedSegments = [...segments];
  const minGap = 0.01; // 10ms minimum gap between segments
  
  for (let i = 0; i < fixedSegments.length - 1; i++) {
    const currentSegment = fixedSegments[i];
    const nextSegment = fixedSegments[i + 1];
    
    // Skip pause segments
    if (currentSegment.speaker === 'PAUSE' || nextSegment.speaker === 'PAUSE') {
      continue;
    }
    
    // Fix segment-level overlaps
    if (currentSegment.end >= nextSegment.start) {
      const midpoint = (currentSegment.end + nextSegment.start) / 2;
      currentSegment.end = midpoint - minGap / 2;
      nextSegment.start = midpoint + minGap / 2;
      
      // Also fix the last/first word timestamps
      if (currentSegment.words.length > 0) {
        const lastWord = currentSegment.words[currentSegment.words.length - 1];
        if (lastWord.end && lastWord.end > currentSegment.end) {
          lastWord.end = currentSegment.end;
        }
      }
      
      if (nextSegment.words.length > 0) {
        const firstWord = nextSegment.words[0];
        if (firstWord.start && firstWord.start < nextSegment.start) {
          firstWord.start = nextSegment.start;
        }
      }
    }
  }
  
  return fixedSegments;
}

/**
 * Validates that a timestamp is safe for audio seeking
 */
export function validateSeekTimestamp(timestamp: number, segments: Segment[]): {
  isValid: boolean;
  adjustedTimestamp?: number;
  warning?: string;
} {
  // Check if timestamp falls in a problematic overlap zone
  for (let i = 0; i < segments.length - 1; i++) {
    const currentSegment = segments[i];
    const nextSegment = segments[i + 1];
    
    // Skip pause segments
    if (currentSegment.speaker === 'PAUSE' || nextSegment.speaker === 'PAUSE') {
      continue;
    }
    
    // Check if seeking to an overlap zone
    if (timestamp > currentSegment.end && timestamp < nextSegment.start) {
      return {
        isValid: false,
        adjustedTimestamp: nextSegment.start,
        warning: `Timestamp ${timestamp}s falls in gap between segments. Adjusting to ${nextSegment.start}s`
      };
    }
  }
  
  return { isValid: true };
}

/**
 * Gets the segment that contains a specific timestamp
 */
export function getSegmentAtTime(timestamp: number, segments: Segment[]): Segment | null {
  // First try exact segment boundaries
  for (const segment of segments) {
    if (timestamp >= segment.start && timestamp <= segment.end) {
      return segment;
    }
  }
  
  // If no exact match, find closest segment (for edge cases)
  let closestSegment: Segment | null = null;
  let closestDistance = Infinity;
  
  for (const segment of segments) {
    const distance = Math.min(
      Math.abs(timestamp - segment.start),
      Math.abs(timestamp - segment.end)
    );
    
    if (distance < closestDistance) {
      closestDistance = distance;
      closestSegment = segment;
    }
  }
  
  return closestSegment;
}

/**
 * Safely calculates next valid timestamp for seeking
 */
export function getNextValidTimestamp(currentTime: number, segments: Segment[], direction: 'forward' | 'backward' = 'forward'): number {
  const validation = validateSeekTimestamp(currentTime, segments);
  
  if (validation.isValid) {
    return currentTime;
  }
  
  if (validation.adjustedTimestamp !== undefined) {
    return validation.adjustedTimestamp;
  }
  
  // Fallback: find next/previous segment boundary
  if (direction === 'forward') {
    const nextSegment = segments.find(s => s.start > currentTime && s.speaker !== 'PAUSE');
    return nextSegment ? nextSegment.start : currentTime;
  } else {
    const prevSegments = segments.filter(s => s.end < currentTime && s.speaker !== 'PAUSE');
    const prevSegment = prevSegments[prevSegments.length - 1];
    return prevSegment ? prevSegment.end : currentTime;
  }
} 