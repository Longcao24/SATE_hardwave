import type { Segment } from './types';

// Function to get available error types from processed data
export const getErrorAnnotations = (segments: Segment[]): string[] => {
  const errorTypes = new Set<string>();

  segments.forEach(segment => {
    // Skip excluded segments from error type detection
    if (segment.excluded) return;
    // Filter out null/empty filler words
    if (segment.fillerwords && segment.fillerwords.filter(fw => fw.content !== null && fw.content !== '').length > 0) {
      errorTypes.add('filler');
    }
    if (segment.repetitions && segment.repetitions.length > 0) {
      errorTypes.add('repetition');
    }
    if (segment.pauses && segment.pauses.length > 0) {
      errorTypes.add('pause');
    }
    if (segment['utterance-error'] && segment['utterance-error'].length > 0) {
      errorTypes.add('utterance-error');
    }
    if (segment.mispronunciation && segment.mispronunciation.length > 0) {
      errorTypes.add('mispronunciation');
    }
    if (segment.morpheme_omissions && segment.morpheme_omissions.length > 0) {
      errorTypes.add('morpheme-omission');
    }
    // Add morpheme detection - check for inflectional morphemes
    if (segment.morphemes && segment.morphemes.length > 0) {
      // Only add if there are morphemes that aren't irregular (have actual morpheme forms)
      const hasVisibleMorphemes = segment.morphemes.some((morpheme: any) => 
        morpheme.morpheme_form && morpheme.morpheme_form !== '<IRR>'
      );
      if (hasVisibleMorphemes) {
        errorTypes.add('morpheme');
      }
    }
    // Handle both old 'revision' and new 'revisions' field names
    if (segment.revisions && segment.revisions.length > 0) {
      errorTypes.add('revision');
    } else if ((segment as any).revision && (segment as any).revision.length > 0) {
      errorTypes.add('revision');
    }
  });

  return Array.from(errorTypes);
};

