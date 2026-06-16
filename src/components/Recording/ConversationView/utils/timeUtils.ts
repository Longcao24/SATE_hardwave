/**
 * Format timestamp in minutes:seconds.decimal format
 */
export const formatTimestamp = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${mins}:${secs.padStart(4, '0')}`;
};

/**
 * Check if a word is currently being played based on current time
 * Includes tolerance for better word boundary detection
 */
export const isWordActive = (
  word: { start?: number | null; end?: number | null },
  currentTime: number
): boolean => {
  if (word.start === null || word.start === undefined || 
      word.end === null || word.end === undefined) return false;
  
  // Add small tolerance for better word boundary detection
  const tolerance = 0.05; // 50ms tolerance
  return currentTime >= (word.start - tolerance) && currentTime <= (word.end + tolerance);
};

/**
 * Check if any word in a segment is currently active
 */
export const isSegmentActive = (
  segment: { start: number; end: number },
  currentTime: number
): boolean => {
  return currentTime >= segment.start && currentTime <= segment.end;
};
