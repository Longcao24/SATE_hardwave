import { useCallback } from 'react';
import { type Segment, type Word, type FillerWord, type Repetition } from '@/services/dataService';
import { saltToJson } from '@/services/saltService';
import {
  splitSegment,
  mergeSegments as mergeSegmentsUtil,
  createNewSegment,
  toggleSegmentExclusion as toggleExclusion
} from '../utils/segmentOperations';

const normalizeWordText = (text: string): string => text.toLowerCase().replace(/[.,!?;:]+$/, '');

/**
 * Maps every pre-edit word index onto its index in the rewritten word list (null when the
 * word is gone). Uses an edit-distance alignment so adding or deleting a word only shifts
 * the annotations after it instead of orphaning every later one.
 */
const alignWordIndices = (oldWords: Word[], newWords: Word[]): Array<number | null> => {
  const oldText = oldWords.map(w => normalizeWordText(w.word || ''));
  const newText = newWords.map(w => normalizeWordText(w.word || ''));

  const cost: number[][] = [];
  for (let i = 0; i <= oldText.length; i++) {
    cost.push(new Array(newText.length + 1).fill(0));
    cost[i][0] = i;
  }
  for (let j = 0; j <= newText.length; j++) {
    cost[0][j] = j;
  }
  for (let i = 1; i <= oldText.length; i++) {
    for (let j = 1; j <= newText.length; j++) {
      const substitution = cost[i - 1][j - 1] + (oldText[i - 1] === newText[j - 1] ? 0 : 1);
      cost[i][j] = Math.min(substitution, cost[i - 1][j] + 1, cost[i][j - 1] + 1);
    }
  }

  const mapping: Array<number | null> = new Array(oldText.length).fill(null);
  let i = oldText.length;
  let j = newText.length;
  while (i > 0 && j > 0) {
    const substitution = cost[i - 1][j - 1] + (oldText[i - 1] === newText[j - 1] ? 0 : 1);
    if (cost[i][j] === substitution) {
      mapping[i - 1] = j - 1;
      i--;
      j--;
    } else if (cost[i][j] === cost[i - 1][j] + 1) {
      i--;
    } else {
      j--;
    }
  }

  return mapping;
};

/**
 * SALT text has no notation for fillerwords, mispronunciations or morpheme omissions, so a
 * parsed segment never carries them: they must be re-anchored from the pre-edit segment onto
 * the rewritten words rather than treated as deleted. Fillers are the exception - jsonToSalt
 * writes them as a single-word maze, which parses back as a repetition - so a filler survives
 * only while its word is still parenthesized, and that span is reclassified as the filler.
 */
const carryOverUnwritableAnnotations = (
  currentSegment: Segment,
  newWords: Word[],
  parsedRepetitions: Repetition[]
) => {
  const currentWords = currentSegment.words || [];
  const mapping = alignWordIndices(currentWords, newWords);
  const remap = (oldIndex: number): number | null =>
    oldIndex >= 0 && oldIndex < mapping.length ? mapping[oldIndex] : null;

  const fillerwords: FillerWord[] = [];
  const fillerSpans = new Set<number>();
  for (const filler of currentSegment.fillerwords || []) {
    const newIndex = remap(currentWords.findIndex(w => w.start === filler.start && w.end === filler.end));
    if (newIndex === null) continue;

    const stillMazed = parsedRepetitions.some(rep => rep.words.length === 1 && rep.words[0] === newIndex);
    if (!stillMazed) continue;

    const newWord = newWords[newIndex];
    fillerwords.push({
      ...filler,
      start: newWord.start,
      end: newWord.end,
      duration: newWord.start !== null && newWord.end !== null
        ? newWord.end - newWord.start
        : filler.duration
    });
    fillerSpans.add(newIndex);
  }

  const mispronunciation = (currentSegment.mispronunciation || []).flatMap((mp: any) => {
    const newIndex = remap(currentWords.findIndex(w => w.start === mp.start && w.end === mp.end));
    if (newIndex === null) return [];
    const newWord = newWords[newIndex];
    return [{ ...mp, start: newWord.start, end: newWord.end }];
  });

  const morphemeOmissions = (currentSegment.morpheme_omissions || []).flatMap((omission: any) => {
    const oldIndex = typeof omission.index === 'number'
      ? omission.index
      : (typeof omission.word_index === 'number' ? omission.word_index : null);
    // Nothing to re-anchor against - keep it rather than drop clinician-entered data
    if (oldIndex === null) return [omission];

    const newIndex = remap(oldIndex);
    if (newIndex === null) return [];
    return [{
      ...omission,
      ...(typeof omission.index === 'number' ? { index: newIndex } : {}),
      ...(typeof omission.word_index === 'number' ? { word_index: newIndex } : {})
    }];
  });

  return {
    fillerwords,
    repetitions: parsedRepetitions.filter(rep => !(rep.words.length === 1 && fillerSpans.has(rep.words[0]))),
    mispronunciation,
    morphemeOmissions
  };
};

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
        const parsedWords = parsedSegment.words || currentSegment.words;
        const carried = carryOverUnwritableAnnotations(
          currentSegment,
          parsedWords,
          parsedSegment.repetitions || []
        );

        // Update the segment with parsed data
        updatedSegments[segmentIndex] = {
          ...currentSegment,
          text: parsedSegment.text || saltText.trim(),
          words: parsedWords,
          // Annotation types the SALT text can express are replaced by what it now says;
          // the ones it cannot express are carried over from the pre-edit segment
          fillerwords: carried.fillerwords,
          repetitions: carried.repetitions,
          mispronunciation: carried.mispronunciation,
          morphemes: parsedSegment.morphemes || [],
          morpheme_omissions: carried.morphemeOmissions,
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
