import type { TranscriptData, SpeechAnalysis, Segment, Word } from './types';
import { countErrors } from './errorCounter';
import { getErrorAnnotations } from './errorAnnotations';

// Function to split a segment into utterances based on sentence boundaries
const splitSegmentIntoUtterances = (segment: Segment): Array<{words: Word[], morphemes?: any[]}> => {
  const utterances: Array<{words: Word[], morphemes?: any[]}> = [];
  let currentUtterance: Word[] = [];
  
  segment.words.forEach((word) => {
    currentUtterance.push(word);
    
    // Check if this word ends a sentence (contains period, question mark, or exclamation)
    if (word.word.includes('.') || word.word.includes('?') || word.word.includes('!')) {
      // Only create utterance if it has meaningful words (not just punctuation/fillers)
      const meaningfulWords = currentUtterance.filter(w => {
        const cleanWord = w.word.toLowerCase().replace(/[.,!?;:]/g, '');
        return cleanWord && 
               cleanWord !== 'um' && 
               cleanWord !== 'uh' && 
               !w.word.includes('[') && 
               !w.word.includes(']');
      });
      
      if (meaningfulWords.length > 0) {
        // Find morphemes that belong to this utterance
        // Match morphemes by word content instead of index (due to index misalignment in JSON)
        const utteranceMorphemes = segment.morphemes?.filter((morpheme: any) => {
          return currentUtterance.some(utteranceWord => {
            const cleanUtteranceWord = utteranceWord.word.replace(/[.,!?;:]$/, '');
            const cleanMorphemeWord = morpheme.word.replace(/[.,!?;:]$/, '');
            return cleanUtteranceWord === cleanMorphemeWord;
          });
        }) || [];
        
        utterances.push({
          words: [...currentUtterance],
          morphemes: utteranceMorphemes
        });
      }
      
      currentUtterance = [];
    }
  });
  
  // Add remaining words as final utterance if any
  if (currentUtterance.length > 0) {
    const meaningfulWords = currentUtterance.filter(w => {
      const cleanWord = w.word.toLowerCase().replace(/[.,!?;:]/g, '');
      return cleanWord && 
             cleanWord !== 'um' && 
             cleanWord !== 'uh' && 
             !w.word.includes('[') && 
             !w.word.includes(']');
    });
    
    if (meaningfulWords.length > 0) {
      // Find morphemes for remaining words
      // Match morphemes by word content instead of index (due to index misalignment in JSON)
      const utteranceMorphemes = segment.morphemes?.filter((morpheme: any) => {
        return currentUtterance.some(utteranceWord => {
          const cleanUtteranceWord = utteranceWord.word.replace(/[.,!?;:]$/, '');
          const cleanMorphemeWord = morpheme.word.replace(/[.,!?;:]$/, '');
          return cleanUtteranceWord === cleanMorphemeWord;
        });
      }) || [];
      
      utterances.push({
        words: [...currentUtterance],
        morphemes: utteranceMorphemes
      });
    }
  }
  
  return utterances;
};

// Calculate comprehensive speech analysis
export const calculateSpeechAnalysis = (
  transcriptData: TranscriptData, 
  targetSpeaker?: string 
): SpeechAnalysis => {
  // Filter out excluded segments for all calculations
  const includedSegments = transcriptData.segments.filter(segment => !segment.excluded);
  
  const errorCounts = countErrors(transcriptData.segments);
  const totalWords = includedSegments.reduce((total, segment) => total + segment.words.length, 0);
  const totalDuration = includedSegments.length > 0 
    ? Math.max(...includedSegments.map(s => s.end)) 
    : 0;
  const speakingRate = totalDuration > 0 ? (totalWords / totalDuration) * 60 : 0;
  const totalErrors = Object.values(errorCounts).reduce((sum, count) => sum + count, 0);
  const errorRate = totalWords > 0 ? (totalErrors / totalWords) * 100 : 0;
  const availableErrorTypes = getErrorAnnotations(transcriptData.segments);
  const speakers = new Set(includedSegments.map(s => s.speaker));

  // Helper function to check if a word is a maze word (filler, repetition, or revision) or punctuation
  const isMazeWordOrPunctuation = (word: Word, segment: Segment, wordPositionIndex?: number): boolean => {
    const wordText = word.word;
    // Use word.index if available, otherwise fall back to positional index
    const wordIndex = word.index ?? wordPositionIndex;
    
    // Check for basic punctuation and empty content
    const cleanWord = wordText.toLowerCase().replace(/[.,!?;:]/g, '');
    if (!cleanWord || /^[.,!?;:]+$/.test(wordText) || wordText.includes('[') || wordText.includes(']')) {
      return true;
    }
    
    // Check if word is annotated as a filler word
    // Use multiple matching strategies: time-based, content-based, and index-based
    if (segment.fillerwords && segment.fillerwords.length > 0) {
      const timeTolerance = 0.05; // 50ms tolerance for floating-point comparison
      const isFillerWord = segment.fillerwords.some((filler: any) => {
        // Match by timing with tolerance
        if (word.start !== null && word.end !== null && 
            filler.start !== null && filler.end !== null) {
          const startMatch = Math.abs(filler.start - word.start) < timeTolerance;
          const endMatch = Math.abs(filler.end - word.end) < timeTolerance;
          if (startMatch && endMatch) return true;
        }
        // Match by content (only if filler has non-empty content)
        if (filler.content && filler.content.trim() !== '' && 
            cleanWord === filler.content.toLowerCase().replace(/[.,!?;:]/g, '')) {
          return true;
        }
        // Match by index if available
        if (typeof filler.index === 'number' && filler.index === wordIndex) {
          return true;
        }
        return false;
      });
      if (isFillerWord) return true;
    }
    
    // Check if word is annotated as a repetition
    // Repetitions use 'words' array containing word indices
    if (segment.repetitions && wordIndex !== undefined) {
      const isRepetition = segment.repetitions.some((rep: any) => {
        return rep.words && 
               Array.isArray(rep.words) && 
               rep.words.includes(wordIndex);
      });
      if (isRepetition) return true;
    }
    
    // Check if word is annotated as a revision (also a maze word)
    // Revisions use 'words' or 'location' array containing word indices
    if (segment.revisions && wordIndex !== undefined) {
      const isRevision = segment.revisions.some((rev: any) => {
        const wordIndices = rev.location || rev.words || [];
        return Array.isArray(wordIndices) && wordIndices.includes(wordIndex);
      });
      if (isRevision) return true;
    }
    
    // Keep commonly known filler words as backup (in case not annotated)
    if (cleanWord === 'um' || cleanWord === 'uh' || cleanWord === 'uh-huh' || cleanWord === 'mm-hmm') {
      return true;
    }
    
    return false;
  };

  // Calculate Number of Total Words (NTW) and Number of Different Words (NDW)
  let ntw = 0;
  const allWords = new Set<string>();
  
  // Filter segments: use targetSpeaker if provided, otherwise exclude examiners
  const isExaminer = (speaker: string): boolean => {
    const lowerSpeaker = speaker.toLowerCase();
    return lowerSpeaker === 'examiner' || lowerSpeaker.includes('examiner');
  };
  
  const segmentsForCounting = targetSpeaker 
    ? includedSegments.filter(segment => segment.speaker === targetSpeaker)
    : includedSegments.filter(segment => !isExaminer(segment.speaker));
  
  segmentsForCounting.forEach(segment => {
    segment.words.forEach((word, idx) => {
      if (!isMazeWordOrPunctuation(word, segment, idx)) {
        ntw++;
        
        // For NDW: Use lemma if morpheme exists and morpheme_form is not <IRR>, otherwise use word
        let wordForNDW = word.word.toLowerCase().replace(/[.,!?;:]/g, '');
        
        // Check if this word has a morpheme annotation
        // Match morphemes by word content instead of index (due to index misalignment in JSON)
        const morpheme = segment.morphemes?.find((m: any) => {
          const cleanWord = word.word.replace(/[.,!?;:]$/, '');
          const cleanMorphemeWord = m.word.replace(/[.,!?;:]$/, '');
          return cleanWord === cleanMorphemeWord;
        });
        if (morpheme && morpheme.lemma && morpheme.morpheme_form && morpheme.morpheme_form !== '<IRR>') {
          wordForNDW = morpheme.lemma.toLowerCase();
        }
        
        allWords.add(wordForNDW);
      }
    });
  });

  // Calculate Number of Different Words (NDW)
  const ndw = allWords.size;

  // Calculate Mean Length of Utterance in Words (MLUw) using sentence-based utterances
  // Use the same speaker filtering as NTW/NDW, and ensure segments have meaningful words
  const segmentsForMLU = segmentsForCounting.filter(segment => 
    segment.words.some((word, idx) => !isMazeWordOrPunctuation(word, segment, idx))
  );
  
  // Split segments into utterances and collect all utterances with segment reference
  const allUtterances: Array<{words: Word[], morphemes?: any[], segment: Segment}> = [];
  segmentsForMLU.forEach(segment => {
    const utterances = splitSegmentIntoUtterances(segment);
    
    utterances.forEach(utterance => {
      allUtterances.push({ ...utterance, segment });
    });
  });
  
  // Calculate MLUw from utterances
  let totalUtteranceWords = 0;
  allUtterances.forEach(utterance => {
    const validWords = utterance.words.filter((word, idx) => !isMazeWordOrPunctuation(word, utterance.segment, idx));
    totalUtteranceWords += validWords.length;
  });
  
  const mluw = allUtterances.length > 0 ? totalUtteranceWords / allUtterances.length : 0;

  // Calculate Mean Length of Utterance in Morphemes (MLUm) using utterances
  let totalMorphemes = 0;
  
  allUtterances.forEach(utterance => {
    let utteranceMorphemes = 0;
    
    // Count morphemes for each valid word in the utterance
    const validWords = utterance.words.filter((word, idx) => !isMazeWordOrPunctuation(word, utterance.segment, idx));
    
    validWords.forEach((validWord, _) => {
      // Check if this word has a morpheme annotation with non-IRR morpheme_form
      // Match morphemes by word content instead of index (due to index misalignment in JSON)
      const morpheme = utterance.morphemes?.find((m: any) => {
        const cleanWord = validWord.word.replace(/[.,!?;:]$/, '');
        const cleanMorphemeWord = m.word.replace(/[.,!?;:]$/, '');
        return cleanWord === cleanMorphemeWord;
      });
      
      if (morpheme && morpheme.morpheme_form && morpheme.morpheme_form !== '<IRR>') {
        // Word with morpheme annotation (non-IRR) = 2 morphemes (lemma + morpheme_form)
        utteranceMorphemes += 2;
      } else {
        // Regular word or IRR morpheme = 1 morpheme
        utteranceMorphemes += 1;
      }
    });
    
    totalMorphemes += utteranceMorphemes;
  });
  
  // MLUm is total morphemes divided by number of utterances
  const mlum = allUtterances.length > 0 ? totalMorphemes / allUtterances.length : 0;

  // Calculate total number of pauses
  const numberOfPauses = includedSegments.reduce((total, segment) => {
    return total + (segment.pauses?.length || 0);
  }, 0);

  return {
    errorCounts,
    totalWords,
    totalDuration,
    speakingRate,
    errorRate,
    availableErrorTypes,
    segmentCount: includedSegments.length,
    speakerCount: speakers.size,
    ntw,
    ndw,
    mluw,
    mlum,
    numberOfPauses,
  };
};

