import { type Segment } from '@/services/dataService';

/**
 * Split a segment at a specific word index
 */
export const splitSegment = (
  segment: Segment,
  splitAfterWordIndex: number
): { firstSegment: Segment; secondSegment: Segment } | null => {
  const splitPoint = splitAfterWordIndex + 1;
  
  if (splitPoint <= 0 || splitPoint >= segment.words.length) {
    return null;
  }
  
  // Use nullish coalescing to handle timestamp 0 correctly (0 is a valid time)
  const splitTime = segment.words[splitPoint].start ?? segment.start;
  
  // Helper function to determine which segment a pause belongs to
  const assignPauseToSegment = (pause: any, firstWords: any[], secondWords: any[]) => {
    // Check if pause occurs between words in the first segment
    for (let i = 0; i < firstWords.length - 1; i++) {
      const currentWord = firstWords[i];
      const nextWord = firstWords[i + 1];
      if (currentWord.end && nextWord.start && 
          pause.start >= currentWord.end && pause.end <= nextWord.start) {
        return 'first';
      }
    }
    
    // Check if pause occurs between words in the second segment
    for (let i = 0; i < secondWords.length - 1; i++) {
      const currentWord = secondWords[i];
      const nextWord = secondWords[i + 1];
      if (currentWord.end && nextWord.start && 
          pause.start >= currentWord.end && pause.end <= nextWord.start) {
        return 'second';
      }
    }
    
    // Check if pause occurs between segments
    const lastWordOfFirst = firstWords[firstWords.length - 1];
    const firstWordOfSecond = secondWords[0];
    if (lastWordOfFirst.end && firstWordOfSecond.start &&
        pause.start >= lastWordOfFirst.end && pause.end <= firstWordOfSecond.start) {
      return 'second';
    }
    
    // Fallback: assign based on timing
    return pause.start < splitTime ? 'first' : 'second';
  };
  
  const firstWords = segment.words.slice(0, splitPoint);
  const secondWords = segment.words.slice(splitPoint);
  
  // Create first segment
  const firstSegment: Segment = {
    ...segment,
    text: firstWords.map(w => w.word).join(' '),
    end: splitTime,
    words: firstWords,
    fillerwords: segment.fillerwords?.filter(f => {
      const wordInFirstSegment = firstWords.some(w => 
        w.start === f.start && w.end === f.end
      );
      return wordInFirstSegment;
    }),
    repetitions: segment.repetitions?.filter(rep => 
      rep.words && Array.isArray(rep.words) && rep.words.some(wordIdx => wordIdx < splitPoint)
    ).map(rep => ({
      ...rep,
      words: rep.words.filter(wordIdx => wordIdx < splitPoint)
    })).filter(rep => rep.words && rep.words.length > 0),
    morphemes: segment.morphemes?.filter((m: any) => 
      (m.index || m.word_index || 0) < splitPoint
    ),
    morpheme_omissions: segment.morpheme_omissions?.filter((mo: any) => 
      (mo.word_index || 0) < splitPoint
    ),
    mispronunciation: segment.mispronunciation?.filter((mp: any) => {
      const wordInFirstSegment = firstWords.some(w => 
        w.start === mp.start && w.end === mp.end
      );
      return wordInFirstSegment;
    }),
    pauses: segment.pauses?.filter((p: any) => 
      assignPauseToSegment(p, firstWords, secondWords) === 'first'
    ),
    revisions: segment.revisions?.filter((rev: any) => {
      const wordIndices = rev.location || rev.words || [];
      return Array.isArray(wordIndices) && wordIndices.some((wordIdx: number) => wordIdx < splitPoint);
    }).map((rev: any) => {
      const wordIndices = rev.location || rev.words || [];
      const filteredIndices = Array.isArray(wordIndices) 
        ? wordIndices.filter((wordIdx: number) => wordIdx < splitPoint)
        : [];
      return {
        ...rev,
        location: filteredIndices,
        words: filteredIndices
      };
    }).filter((rev: any) => rev.words && rev.words.length > 0),
    is_edited: true
  };
  
  // Create second segment
  const secondSegment: Segment = {
    ...segment,
    text: secondWords.map(w => w.word).join(' '),
    start: splitTime,
    words: secondWords,
    fillerwords: segment.fillerwords?.filter(f => {
      const wordInSecondSegment = secondWords.some(w => 
        w.start === f.start && w.end === f.end
      );
      return wordInSecondSegment;
    }),
    repetitions: segment.repetitions?.filter(rep => 
      rep.words && Array.isArray(rep.words) && rep.words.some(wordIdx => wordIdx >= splitPoint)
    ).map(rep => ({
      ...rep,
      words: rep.words.filter(wordIdx => wordIdx >= splitPoint).map(wordIdx => wordIdx - splitPoint)
    })).filter(rep => rep.words && rep.words.length > 0),
    morphemes: segment.morphemes?.filter((m: any) => 
      (m.index || m.word_index || 0) >= splitPoint
    ).map((m: any) => ({
      ...m,
      index: m.index !== undefined ? m.index - splitPoint : m.index,
      word_index: m.word_index !== undefined ? m.word_index - splitPoint : m.word_index
    })),
    morpheme_omissions: segment.morpheme_omissions?.filter((mo: any) => 
      (mo.word_index || 0) >= splitPoint
    ).map((mo: any) => ({
      ...mo,
      word_index: mo.word_index - splitPoint
    })),
    mispronunciation: segment.mispronunciation?.filter((mp: any) => {
      const wordInSecondSegment = secondWords.some(w => 
        w.start === mp.start && w.end === mp.end
      );
      return wordInSecondSegment;
    }),
    pauses: segment.pauses?.filter((p: any) => 
      assignPauseToSegment(p, firstWords, secondWords) === 'second'
    ),
    revisions: segment.revisions?.filter((rev: any) => {
      const wordIndices = rev.location || rev.words || [];
      return Array.isArray(wordIndices) && wordIndices.some((wordIdx: number) => wordIdx >= splitPoint);
    }).map((rev: any) => {
      const wordIndices = rev.location || rev.words || [];
      const adjustedIndices = Array.isArray(wordIndices)
        ? wordIndices
            .filter((wordIdx: number) => wordIdx >= splitPoint)
            .map((wordIdx: number) => wordIdx - splitPoint)
        : [];
      return {
        ...rev,
        location: adjustedIndices,
        words: adjustedIndices
      };
    }).filter((rev: any) => rev.words && rev.words.length > 0),
    is_edited: true
  };
  
  return { firstSegment, secondSegment };
};

/**
 * Merge two segments into one
 */
export const mergeSegments = (
  firstSegment: Segment,
  secondSegment: Segment
): Segment => {
  const firstWordsCount = firstSegment.words.length;
  
  return {
    ...firstSegment,
    text: `${firstSegment.text.trim()} ${secondSegment.text.trim()}`.trim(),
    end: secondSegment.end,
    words: [...firstSegment.words, ...secondSegment.words],
    
    // Merge all annotation arrays
    fillerwords: [
      ...(firstSegment.fillerwords || []),
      ...(secondSegment.fillerwords || [])
    ],
    
    repetitions: [
      ...(firstSegment.repetitions || []),
      // Adjust word indices for second segment repetitions
      ...(secondSegment.repetitions || []).map(rep => ({
        ...rep,
        words: rep.words.map(wordIdx => wordIdx + firstWordsCount)
      }))
    ],
    
    morphemes: [
      ...(firstSegment.morphemes || []),
      // Adjust indices for second segment morphemes
      ...(secondSegment.morphemes || []).map((m: any) => ({
        ...m,
        index: m.index !== undefined ? m.index + firstWordsCount : m.index,
        word_index: m.word_index !== undefined ? m.word_index + firstWordsCount : m.word_index
      }))
    ],
    
    morpheme_omissions: [
      ...(firstSegment.morpheme_omissions || []),
      // Adjust indices for second segment morpheme omissions
      ...(secondSegment.morpheme_omissions || []).map((mo: any) => ({
        ...mo,
        index: mo.index !== undefined ? mo.index + firstWordsCount : mo.index,
        word_index: mo.word_index !== undefined ? mo.word_index + firstWordsCount : mo.word_index
      }))
    ],
    
    mispronunciation: [
      ...(firstSegment.mispronunciation || []),
      ...(secondSegment.mispronunciation || [])
    ],
    
    pauses: [
      ...(firstSegment.pauses || []),
      ...(secondSegment.pauses || [])
    ],
    
    revisions: [
      ...(firstSegment.revisions || []),
      // Adjust indices for second segment revisions
      ...(secondSegment.revisions || []).map((rev: any) => {
        const wordIndices = rev.location || rev.words || [];
        const adjustedIndices = wordIndices.map((wordIdx: number) => wordIdx + firstWordsCount);
        return {
          ...rev,
          location: adjustedIndices,
          words: adjustedIndices
        };
      })
    ],
    
    is_edited: true
  };
};

/**
 * Create a new segment with default values
 */
export const createNewSegment = (
  beforeSegment: Segment | null,
  afterSegment: Segment | null,
  speaker: string = 'Speaker 1'
): Segment => {
  const startTime = afterSegment?.end || 0;
  const endTime = beforeSegment?.start || startTime + 5;
  
  return {
    text: 'New segment text',
    start: startTime,
    end: endTime,
    speaker: afterSegment?.speaker || speaker,
    words: [
      {
        word: 'New',
        start: startTime,
        end: startTime + 1,
        index: 0
      },
      {
        word: 'segment',
        start: startTime + 1,
        end: startTime + 2,
        index: 1
      },
      {
        word: 'text',
        start: startTime + 2,
        end: startTime + 3,
        index: 2
      }
    ]
  };
};

/**
 * Toggle segment exclusion status
 */
export const toggleSegmentExclusion = (segment: Segment): Segment => {
  return {
    ...segment,
    excluded: !segment.excluded,
    is_edited: true
  };
};

/**
 * Normalize pauses by adding index field based on timing if missing
 * This ensures pauses display correctly even if backend doesn't provide index
 */
export const normalizePauses = (segment: Segment): Segment => {
  if (!segment.pauses || segment.pauses.length === 0) {
    return segment;
  }

  const words = segment.words;
  if (words.length === 0) {
    return segment;
  }

  const normalizedPauses = segment.pauses.map((pause: any) => {
    // If pause already has an index field, keep it
    if (pause.index !== undefined && pause.index !== null) {
      return pause;
    }

    // Otherwise, try to assign index based on timing
    const pauseStart = pause.start;
    const pauseEnd = pause.end;

    if (pauseStart === null || pauseStart === undefined || 
        pauseEnd === null || pauseEnd === undefined) {
      // No timing info, can't determine position
      console.log('[normalizePauses] Pause without timing, cannot assign index:', pause);
      return pause;
    }

    // Check if pause is before first word
    const firstWord = words[0];
    if (firstWord.start !== null && firstWord.start !== undefined) {
      // If pause ends before or at the start of the first word, it's before the first word
      if (pauseEnd <= firstWord.start + 0.1) {
        console.log('[normalizePauses] Assigning index -1 to pause before first word:', {
          pause,
          firstWordStart: firstWord.start,
          segmentStart: segment.start
        });
        return { ...pause, index: -1 };
      }
    }

    // Check pauses between words
    for (let i = 0; i < words.length - 1; i++) {
      const currentWord = words[i];
      const nextWord = words[i + 1];

      if (currentWord.end !== null && currentWord.end !== undefined &&
          nextWord.start !== null && nextWord.start !== undefined) {
        // Check if pause is in this gap
        if (pauseStart >= currentWord.end - 0.1 && pauseEnd <= nextWord.start + 0.1) {
          console.log(`[normalizePauses] Assigning index ${i} to pause between words ${i} and ${i+1}`);
          return { ...pause, index: i };
        }
      }
    }

    // If we can't determine position, return as is
    console.log('[normalizePauses] Could not determine position for pause:', {
      pause,
      firstWordStart: words[0].start,
      segmentStart: segment.start
    });
    return pause;
  });

  console.log('[normalizePauses] Normalized segment pauses:', {
    segmentText: segment.text.substring(0, 50),
    originalPauses: segment.pauses,
    normalizedPauses
  });

  return {
    ...segment,
    pauses: normalizedPauses
  };
};

/**
 * Normalize words in a segment by adding missing index properties
 * This is critical for maze word detection (repetitions, revisions) to work correctly
 */
export const normalizeWords = (segment: Segment): Segment => {
  if (!segment.words || segment.words.length === 0) {
    return segment;
  }

  const normalizedWords = segment.words.map((word, index) => {
    // If word already has an index field that matches position, keep it
    if (word.index !== undefined && word.index !== null) {
      return word;
    }
    // Add the index based on position in array
    return { ...word, index };
  });

  return {
    ...segment,
    words: normalizedWords
  };
};

/**
 * Normalize all segments in an array by adding missing pause indices and word indices
 */
export const normalizeSegments = (segments: Segment[]): Segment[] => {
  return segments.map(segment => {
    // First normalize words (add indices)
    const withNormalizedWords = normalizeWords(segment);
    // Then normalize pauses
    return normalizePauses(withNormalizedWords);
  });
};