import { type Segment } from '@/services/dataService';

/**
 * Get unique speakers from transcript data
 */
export const getUniqueSpeakers = (transcriptData: Segment[]): string[] => {
  const speakers = new Set(
    transcriptData
      .filter(segment => segment && segment.speaker && segment.speaker.trim())
      .map(segment => segment.speaker.trim())
  );
  return Array.from(speakers).sort();
};

/**
 * Validate speaker name
 */
export const isValidSpeakerName = (name: string): boolean => {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 50;
};

/**
 * Check if segments can be merged (adjacent or with only pauses between)
 */
export const canMergeSegments = (indices: number[], transcriptData: Segment[]): boolean => {
  if (indices.length !== 2) return false;
  
  const [first, second] = indices.sort((a, b) => a - b);
  
  // Check if segments are adjacent (allowing for pause segments in between)
  let adjacentFound = false;
  for (let i = first + 1; i <= second; i++) {
    if (i === second) {
      adjacentFound = true;
      break;
    }
    // Allow pause segments between the segments we want to merge
    if (transcriptData[i]?.speaker !== 'PAUSE') {
      return false;
    }
  }
  
  return adjacentFound;
};
