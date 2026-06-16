import type { Segment, IssueCounts } from './types';

// Helper function to count errors in segments
export const countErrors = (segments: Segment[]): IssueCounts => {
  const counts: IssueCounts = {
    pause: 0,
    filler: 0,
    repetition: 0,
    mispronunciation: 0,
    morpheme: 0,
    'morpheme-omission': 0,
    revision: 0,
    'utterance-error': 0
  };

  segments.forEach(segment => {
    // Skip excluded segments from error counting
    if (segment.excluded) return;
    // Count filler words - filter out null/empty content entries
    if (segment.fillerwords) {
      counts.filler += segment.fillerwords.filter(fw => fw.content !== null && fw.content !== '').length;
    }

    // Count repetitions
    if (segment.repetitions) {
    counts.repetition += segment.repetitions.length;
    }

    // Count pauses
    if (segment.pauses) {
      counts.pause += segment.pauses.length;
    }

    // Count utterance errors
    if (segment['utterance-error']) {
      counts['utterance-error'] += segment['utterance-error'].length;
    }

    // Count mispronunciations
    if (segment.mispronunciation) {
    counts.mispronunciation += segment.mispronunciation.length;
    }

    // Count morpheme omissions
    if (segment.morpheme_omissions) {
      counts['morpheme-omission'] += segment.morpheme_omissions.length;
    }

    // Count morphemes (inflectional morphemes)
    if (segment.morphemes) {
      // Only count morphemes that have visible morpheme forms (not irregular)
      const visibleMorphemes = segment.morphemes.filter((morpheme: any) => 
        morpheme.morpheme_form && morpheme.morpheme_form !== '<IRR>'
      );
      counts.morpheme += visibleMorphemes.length;
    }

    // Count revisions - handle both old 'revision' and new 'revisions' field names
    if (segment.revisions) {
      counts.revision += segment.revisions.length;
    } else if ((segment as any).revision) {
      // Fallback for old field name
      counts.revision += (segment as any).revision.length;
    }
  });

  return counts;
};

