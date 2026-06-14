// Speech analysis — ported verbatim (logic) from the web app's
// src/services/DataService/{errorCounter,errorAnnotations,speechAnalysis}.ts so a
// device-recorded session is analysed EXACTLY like a manual web upload.
// Types loosened to `any` for Deno; behaviour is identical.

export interface IssueCounts {
  pause: number;
  filler: number;
  repetition: number;
  mispronunciation: number;
  morpheme: number;
  'morpheme-omission': number;
  revision: number;
  'utterance-error': number;
}

export const countErrors = (segments: any[]): IssueCounts => {
  const counts: IssueCounts = {
    pause: 0, filler: 0, repetition: 0, mispronunciation: 0,
    morpheme: 0, 'morpheme-omission': 0, revision: 0, 'utterance-error': 0,
  };
  segments.forEach((segment) => {
    if (segment.excluded) return;
    if (segment.fillerwords) {
      counts.filler += segment.fillerwords.filter(
        (fw: any) => fw.content !== null && fw.content !== '',
      ).length;
    }
    if (segment.repetitions) counts.repetition += segment.repetitions.length;
    if (segment.pauses) counts.pause += segment.pauses.length;
    if (segment['utterance-error']) counts['utterance-error'] += segment['utterance-error'].length;
    if (segment.mispronunciation) counts.mispronunciation += segment.mispronunciation.length;
    if (segment.morpheme_omissions) counts['morpheme-omission'] += segment.morpheme_omissions.length;
    if (segment.morphemes) {
      const visible = segment.morphemes.filter(
        (m: any) => m.morpheme_form && m.morpheme_form !== '<IRR>',
      );
      counts.morpheme += visible.length;
    }
    if (segment.revisions) counts.revision += segment.revisions.length;
    else if (segment.revision) counts.revision += segment.revision.length;
  });
  return counts;
};

export const getErrorAnnotations = (segments: any[]): string[] => {
  const errorTypes = new Set<string>();
  segments.forEach((segment) => {
    if (segment.excluded) return;
    if (segment.fillerwords && segment.fillerwords.filter((fw: any) => fw.content !== null && fw.content !== '').length > 0) errorTypes.add('filler');
    if (segment.repetitions && segment.repetitions.length > 0) errorTypes.add('repetition');
    if (segment.pauses && segment.pauses.length > 0) errorTypes.add('pause');
    if (segment['utterance-error'] && segment['utterance-error'].length > 0) errorTypes.add('utterance-error');
    if (segment.mispronunciation && segment.mispronunciation.length > 0) errorTypes.add('mispronunciation');
    if (segment.morpheme_omissions && segment.morpheme_omissions.length > 0) errorTypes.add('morpheme-omission');
    if (segment.morphemes && segment.morphemes.length > 0) {
      const hasVisible = segment.morphemes.some((m: any) => m.morpheme_form && m.morpheme_form !== '<IRR>');
      if (hasVisible) errorTypes.add('morpheme');
    }
    if (segment.revisions && segment.revisions.length > 0) errorTypes.add('revision');
    else if (segment.revision && segment.revision.length > 0) errorTypes.add('revision');
  });
  return Array.from(errorTypes);
};

const splitSegmentIntoUtterances = (segment: any): Array<{ words: any[]; morphemes?: any[] }> => {
  const utterances: Array<{ words: any[]; morphemes?: any[] }> = [];
  let current: any[] = [];
  const flush = () => {
    if (current.length === 0) return;
    const meaningful = current.filter((w) => {
      const c = w.word.toLowerCase().replace(/[.,!?;:]/g, '');
      return c && c !== 'um' && c !== 'uh' && !w.word.includes('[') && !w.word.includes(']');
    });
    if (meaningful.length > 0) {
      const morphemes = segment.morphemes?.filter((m: any) =>
        current.some((uw) => uw.word.replace(/[.,!?;:]$/, '') === m.word.replace(/[.,!?;:]$/, '')),
      ) || [];
      utterances.push({ words: [...current], morphemes });
    }
  };
  segment.words.forEach((word: any) => {
    current.push(word);
    if (word.word.includes('.') || word.word.includes('?') || word.word.includes('!')) {
      flush();
      current = [];
    }
  });
  flush();
  return utterances;
};

export const calculateSpeechAnalysis = (transcriptData: any, targetSpeaker?: string): any => {
  const includedSegments = (transcriptData.segments || []).filter((s: any) => !s.excluded);
  const errorCounts = countErrors(transcriptData.segments || []);
  const totalWords = includedSegments.reduce((t: number, s: any) => t + s.words.length, 0);
  const totalDuration = includedSegments.length > 0 ? Math.max(...includedSegments.map((s: any) => s.end)) : 0;
  const speakingRate = totalDuration > 0 ? (totalWords / totalDuration) * 60 : 0;
  const totalErrors = Object.values(errorCounts).reduce((sum: number, c: any) => sum + c, 0);
  const errorRate = totalWords > 0 ? (totalErrors / totalWords) * 100 : 0;
  const availableErrorTypes = getErrorAnnotations(transcriptData.segments || []);
  const speakers = new Set(includedSegments.map((s: any) => s.speaker));

  const isMazeWordOrPunctuation = (word: any, segment: any, wordPositionIndex?: number): boolean => {
    const wordText = word.word;
    const wordIndex = word.index ?? wordPositionIndex;
    const cleanWord = wordText.toLowerCase().replace(/[.,!?;:]/g, '');
    if (!cleanWord || /^[.,!?;:]+$/.test(wordText) || wordText.includes('[') || wordText.includes(']')) return true;
    if (segment.fillerwords && segment.fillerwords.length > 0) {
      const tol = 0.05;
      const isFiller = segment.fillerwords.some((filler: any) => {
        if (word.start !== null && word.end !== null && filler.start !== null && filler.end !== null) {
          if (Math.abs(filler.start - word.start) < tol && Math.abs(filler.end - word.end) < tol) return true;
        }
        if (filler.content && filler.content.trim() !== '' && cleanWord === filler.content.toLowerCase().replace(/[.,!?;:]/g, '')) return true;
        if (typeof filler.index === 'number' && filler.index === wordIndex) return true;
        return false;
      });
      if (isFiller) return true;
    }
    if (segment.repetitions && wordIndex !== undefined) {
      if (segment.repetitions.some((rep: any) => rep.words && Array.isArray(rep.words) && rep.words.includes(wordIndex))) return true;
    }
    if (segment.revisions && wordIndex !== undefined) {
      if (segment.revisions.some((rev: any) => { const idx = rev.location || rev.words || []; return Array.isArray(idx) && idx.includes(wordIndex); })) return true;
    }
    if (cleanWord === 'um' || cleanWord === 'uh' || cleanWord === 'uh-huh' || cleanWord === 'mm-hmm') return true;
    return false;
  };

  let ntw = 0;
  const allWords = new Set<string>();
  const isExaminer = (sp: string) => { const l = sp.toLowerCase(); return l === 'examiner' || l.includes('examiner'); };
  const segmentsForCounting = targetSpeaker
    ? includedSegments.filter((s: any) => s.speaker === targetSpeaker)
    : includedSegments.filter((s: any) => !isExaminer(s.speaker));

  segmentsForCounting.forEach((segment: any) => {
    segment.words.forEach((word: any, idx: number) => {
      if (!isMazeWordOrPunctuation(word, segment, idx)) {
        ntw++;
        let wordForNDW = word.word.toLowerCase().replace(/[.,!?;:]/g, '');
        const morpheme = segment.morphemes?.find((m: any) => word.word.replace(/[.,!?;:]$/, '') === m.word.replace(/[.,!?;:]$/, ''));
        if (morpheme && morpheme.lemma && morpheme.morpheme_form && morpheme.morpheme_form !== '<IRR>') wordForNDW = morpheme.lemma.toLowerCase();
        allWords.add(wordForNDW);
      }
    });
  });
  const ndw = allWords.size;

  const segmentsForMLU = segmentsForCounting.filter((s: any) => s.words.some((w: any, idx: number) => !isMazeWordOrPunctuation(w, s, idx)));
  const allUtterances: Array<{ words: any[]; morphemes?: any[]; segment: any }> = [];
  segmentsForMLU.forEach((segment: any) => {
    splitSegmentIntoUtterances(segment).forEach((u) => allUtterances.push({ ...u, segment }));
  });

  let totalUtteranceWords = 0;
  allUtterances.forEach((u) => {
    totalUtteranceWords += u.words.filter((w: any, idx: number) => !isMazeWordOrPunctuation(w, u.segment, idx)).length;
  });
  const mluw = allUtterances.length > 0 ? totalUtteranceWords / allUtterances.length : 0;

  let totalMorphemes = 0;
  allUtterances.forEach((u) => {
    let um = 0;
    const valid = u.words.filter((w: any, idx: number) => !isMazeWordOrPunctuation(w, u.segment, idx));
    valid.forEach((vw: any) => {
      const morpheme = u.morphemes?.find((m: any) => vw.word.replace(/[.,!?;:]$/, '') === m.word.replace(/[.,!?;:]$/, ''));
      um += (morpheme && morpheme.morpheme_form && morpheme.morpheme_form !== '<IRR>') ? 2 : 1;
    });
    totalMorphemes += um;
  });
  const mlum = allUtterances.length > 0 ? totalMorphemes / allUtterances.length : 0;

  const numberOfPauses = includedSegments.reduce((t: number, s: any) => t + (s.pauses?.length || 0), 0);

  return {
    errorCounts, totalWords, totalDuration, speakingRate, errorRate,
    availableErrorTypes, segmentCount: includedSegments.length, speakerCount: speakers.size,
    ntw, ndw, mluw, mlum, numberOfPauses,
  };
};
