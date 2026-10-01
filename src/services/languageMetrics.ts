// The Language Analysis numbers, as a pure function — for the oversight "metrics" export.
//
// ⚠️ This is a FAITHFUL COPY of the per-speaker math inside RightSidebar.tsx (maze-word test,
// NTW, NTAW, NDW via lemmas, TTR, moving-average, MLUw/MLUm by utterance split, pauses, speech
// rate, D-VoCD with the same options). The export must print exactly the numbers the panel
// shows, and the panel computes them inline in the component, so the copy is deliberate: it
// leaves the normal report UI untouched. If you change a formula in RightSidebar, change it
// here too — or, better, make RightSidebar consume this module and delete its copy.

import type { Segment } from '@/services/dataService';
import { calculateSpeakerVocd } from '@/utils/vocdCalculator';
import { isUtteranceBoundary } from '@/services/DataService/speechAnalysis';

export interface SpeakerMetrics {
  speaker: string;
  tnu: number;
  ntw: number;
  ntaw: number;
  ndw: number;
  ttr: number;
  mluw: number;
  mlum: number;
  elapsed_seconds: number;
  words_per_minute: number;
  pauses: number;
  pauses_per_word: number;
  avg_pause_per_utterance_s: number;
  maze_words_pct: number;
  moving_avg_ntw: number;
  moving_avg_ndw: number;
  moving_avg_ttr: number;
  vocd_d: number | null;
  vocd_tokens: number;
  filler: number;
  repetition: number;
  revision: number;
  mispronunciation: number;
  morpheme: number;
  morpheme_omission: number;
  utterance_error: number;
}

const isMazeWordOrPunctuation = (word: any, segment: any, wordPositionIndex?: number): boolean => {
  const wordText = word.word;
  const wordIndex = word.index ?? wordPositionIndex;
  const cleanWord = wordText.toLowerCase().replace(/[.,!?;:]/g, '');
  if (!cleanWord || /^[.,!?;:]+$/.test(wordText) || wordText.includes('[') || wordText.includes(']')) return true;
  if (segment.fillerwords && segment.fillerwords.length > 0) {
    const timeTolerance = 0.05;
    const isFillerWord = segment.fillerwords.some((filler: any) => {
      if (word.start !== null && word.end !== null && filler.start !== null && filler.end !== null) {
        const startMatch = Math.abs(filler.start - word.start) < timeTolerance;
        const endMatch = Math.abs(filler.end - word.end) < timeTolerance;
        if (startMatch && endMatch) return true;
      }
      if (filler.content && filler.content.trim() !== '' &&
          cleanWord === filler.content.toLowerCase().replace(/[.,!?;:]/g, '')) return true;
      if (typeof filler.index === 'number' && filler.index === wordIndex) return true;
      return false;
    });
    if (isFillerWord) return true;
  }
  if (segment.repetitions && wordIndex !== undefined) {
    if (segment.repetitions.some((rep: any) => rep.words && Array.isArray(rep.words) && rep.words.includes(wordIndex))) return true;
  }
  if (segment.revisions && wordIndex !== undefined) {
    if (segment.revisions.some((rev: any) => {
      const idx = rev.location || rev.words || [];
      return Array.isArray(idx) && idx.includes(wordIndex);
    })) return true;
  }
  if (cleanWord === 'um' || cleanWord === 'uh' || cleanWord === 'uh-huh' || cleanWord === 'mm-hmm') return true;
  return false;
};

const morphemeMatch = (word: any) => (m: any) =>
  word.word.replace(/[.,!?;:]$/, '') === m.word.replace(/[.,!?;:]$/, '');

function splitSegmentIntoUtterances(segment: any): Array<{ words: any[]; morphemes?: any[] }> {
  const utterances: Array<{ words: any[]; morphemes?: any[] }> = [];
  let current: any[] = [];
  const flush = () => {
    if (current.some((w: any) => !isMazeWordOrPunctuation(w, segment))) {
      const morphemes = segment.morphemes?.filter((m: any) => current.some((u) => morphemeMatch(u)(m))) || [];
      utterances.push({ words: [...current], morphemes });
    }
  };
  segment.words.forEach((word: any) => {
    current.push(word);
    if (isUtteranceBoundary(word.word)) { flush(); current = []; }
  });
  if (current.length > 0) flush();
  return utterances;
}

export function speakersOf(transcript: Segment[]): string[] {
  return Array.from(new Set(transcript.filter((s) => !s.excluded).map((s) => s.speaker)));
}

export function computeSpeakerMetrics(transcript: Segment[], speaker: string): SpeakerMetrics {
  const included = transcript.filter((s) => !s.excluded);
  const data = included.filter((s) => s.speaker === speaker);
  const tnu = data.length;

  const counts = { pause: 0, filler: 0, repetition: 0, mispronunciation: 0, morpheme: 0, 'morpheme-omission': 0, revision: 0, 'utterance-error': 0 };
  data.forEach((s: any) => {
    if (s.fillerwords) counts.filler += s.fillerwords.length;
    if (s.repetitions) counts.repetition += s.repetitions.length;
    if (s.pauses) counts.pause += s.pauses.length;
    if (s['utterance-error']) counts['utterance-error'] += s['utterance-error'].length;
    if (s.mispronunciation) counts.mispronunciation += s.mispronunciation.length;
    if (s.morpheme_omissions) counts['morpheme-omission'] += s.morpheme_omissions.length;
    if (s.morphemes) counts.morpheme += s.morphemes.filter((m: any) => m.morpheme_form && m.morpheme_form !== '<IRR>').length;
    if (s.revisions) counts.revision += s.revisions.length;
  });

  const ntw = data.reduce((n, s) => n + s.words.filter((w, i) => !isMazeWordOrPunctuation(w, s, i)).length, 0);
  const ntaw = data.reduce((n, s) => n + s.words.length, 0);
  const elapsed = data.reduce((t, s) => t + (s.end - s.start), 0);

  const allWords: string[] = [];
  const different = new Set<string>();
  data.forEach((s: any) => s.words.forEach((w: any, i: number) => {
    if (isMazeWordOrPunctuation(w, s, i)) return;
    const clean = w.word.toLowerCase().replace(/[.,!?;:]/g, '');
    if (!clean) return;
    allWords.push(clean);
    const m = s.morphemes?.find(morphemeMatch(w));
    different.add(m && m.lemma && m.morpheme_form && m.morpheme_form !== '<IRR>' ? m.lemma.toLowerCase() : clean);
  }));
  const ndw = different.size;

  const W = 100;
  let movingAvgNTW: number, movingAvgNDW: number, movingAvgTTR: number;
  if (data.length === 0) { movingAvgNTW = W; movingAvgNDW = 0; movingAvgTTR = 0; }
  else if (allWords.length < W) {
    const u = new Set(allWords).size;
    movingAvgNTW = allWords.length; movingAvgNDW = u; movingAvgTTR = allWords.length ? u / allWords.length : 0;
  } else {
    const v: number[] = [];
    for (let i = 0; i <= allWords.length - W; i++) v.push(new Set(allWords.slice(i, i + W)).size);
    movingAvgNTW = W; movingAvgNDW = v.reduce((a, b) => a + b, 0) / v.length; movingAvgTTR = movingAvgNDW / W;
  }

  const valid = data.filter((s) => s.words.some((w, i) => !isMazeWordOrPunctuation(w, s, i)));
  const utts: Array<{ words: any[]; morphemes?: any[]; segment: any }> = [];
  valid.forEach((s) => splitSegmentIntoUtterances(s).forEach((u) => utts.push({ ...u, segment: s })));
  let words = 0, morphemes = 0;
  utts.forEach((u) => {
    const vw = u.words.filter((w, i) => !isMazeWordOrPunctuation(w, u.segment, i));
    words += vw.length;
    vw.forEach((w) => {
      const m = u.morphemes?.find(morphemeMatch(w));
      morphemes += m && m.morpheme_form && m.morpheme_form !== '<IRR>' ? 2 : 1;
    });
  });
  const mluw = utts.length ? words / utts.length : 0;
  const mlum = utts.length ? morphemes / utts.length : 0;

  const pauseDur = data.reduce((t, s: any) => t + (s.pauses || []).reduce((a: number, p: any) => a + (p.duration || 0), 0), 0);
  const vocd = calculateSpeakerVocd(included, speaker, { nMin: 35, nMax: 50, samples: 100 });

  return {
    speaker, tnu, ntw, ntaw, ndw,
    ttr: ntw > 0 ? ndw / ntw : 0,
    mluw, mlum,
    elapsed_seconds: elapsed,
    words_per_minute: elapsed > 0 ? Math.round((ntw / elapsed) * 60) : 0,
    pauses: counts.pause,
    pauses_per_word: ntw > 0 ? counts.pause / ntw : 0,
    avg_pause_per_utterance_s: tnu > 0 ? pauseDur / tnu : 0,
    maze_words_pct: ntaw > 0 ? ((ntaw - ntw) / ntaw) * 100 : 0,
    moving_avg_ntw: movingAvgNTW, moving_avg_ndw: movingAvgNDW, moving_avg_ttr: movingAvgTTR,
    vocd_d: vocd.avgCurve.length > 0 ? vocd.dHat : null,
    vocd_tokens: vocd.numTokens,
    filler: counts.filler, repetition: counts.repetition, revision: counts.revision,
    mispronunciation: counts.mispronunciation, morpheme: counts.morpheme,
    morpheme_omission: counts['morpheme-omission'], utterance_error: counts['utterance-error'],
  };
}

const COLUMNS: [keyof SpeakerMetrics, string, number?][] = [
  ['speaker', 'Speaker'], ['tnu', 'TNU'], ['ntw', 'TNW (NTW)'], ['ntaw', 'NTAW (incl. mazes)'], ['ndw', 'NDW'],
  ['ttr', 'TTR', 3], ['mluw', 'MLUw', 2], ['mlum', 'MLUm', 2], ['elapsed_seconds', 'Elapsed time (s)', 2],
  ['words_per_minute', 'Words per minute'], ['pauses', 'Pauses'], ['pauses_per_word', 'Pauses per word', 3],
  ['avg_pause_per_utterance_s', 'Avg pause per utterance (s)', 2], ['maze_words_pct', 'Maze words / total words (%)', 1],
  ['moving_avg_ntw', 'Moving-avg NTW (window)'], ['moving_avg_ndw', 'Moving-avg NDW', 2], ['moving_avg_ttr', 'Moving-avg TTR', 3],
  ['vocd_d', 'D-VoCD', 1], ['vocd_tokens', 'D-VoCD tokens'],
  ['filler', 'Fillers'], ['repetition', 'Repetitions'], ['revision', 'Revisions'], ['mispronunciation', 'Mispronunciations'],
  ['morpheme', 'Morphemes'], ['morpheme_omission', 'Morpheme omissions'], ['utterance_error', 'Utterance errors'],
];

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per speaker, one column per metric, preceded by the recording's identity. */
export function metricsCsv(transcript: Segment[], meta: { report: string; recorded: string; length_s?: number | null; patient?: string }): string {
  const head = ['Report', 'Recorded', 'Length (s)', 'Patient', ...COLUMNS.map((c) => c[1])];
  const rows = speakersOf(transcript).map((sp) => {
    const m = computeSpeakerMetrics(transcript, sp);
    return [meta.report, meta.recorded, meta.length_s ?? '', meta.patient ?? '',
      ...COLUMNS.map(([k, , d]) => (typeof m[k] === 'number' && d !== undefined ? (m[k] as number).toFixed(d) : m[k]))];
  });
  // BOM so Excel opens UTF-8 names correctly.
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
