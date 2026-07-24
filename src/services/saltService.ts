// SALT (Systematic Analysis of Language Transcripts) format conversion service

import { type Segment, type Word } from '@/services/dataService';
import { type Pause } from '@/services/DataService/types';

// Morpheme mappings
const MORPH_MAP: Record<string, string> = {
  "Plural": "s",
  "Possessive": "z",
  "3rd Person Singular": "3s",
  "Past Tense": "ed",
  "Past Participle": "en",
  "Progressive": "ing",
};

// Inverse mapping for SALT to JSON conversion
const MORPH_INV: Record<string, string> = Object.fromEntries(
  Object.entries(MORPH_MAP).map(([k, v]) => [v, k])
);

// Contraction suffixes for SALT format
// These are the morpheme_form values for contractions
const CONTRACTION_SUFFIXES = [
  "'ll",   // will (he'll -> he/'ll)
  "'d",    // had/would (he'd -> he/'d)
  "'ve",   // have (I've -> I/'ve)
  "'re",   // are (they're -> they/'re)
  "'m",    // am (I'm -> I/'m)
  "n't",   // not (don't -> do/n't)
  "'s",    // is/has (he's -> he/'s) - note: different from possessive /z
  "'t",    // contracted not variant (can't -> ca/n't)
];

/**
 * Checks if a suffix is a contraction suffix
 */
function isContractionSuffix(suffix: string): boolean {
  return CONTRACTION_SUFFIXES.includes(suffix);
}

/**
 * Normalizes a token for content matching (case and trailing punctuation insensitive)
 */
function normalizeWord(word: string | null | undefined): string {
  return (word || '').trim().toLowerCase().replace(/[.,!?;:]+$/, '');
}

/**
 * Doubles the final consonant of a single-syllable CVC stem (stop -> stopp, run -> runn)
 */
function doubleFinalConsonant(lemma: string): string {
  if (/^[^aeiou]*[aeiou][^aeiouwxy]$/.test(lemma.toLowerCase())) {
    return lemma + lemma[lemma.length - 1];
  }
  return lemma;
}

/**
 * Reconstructs the surface form of a word from lemma and suffix.
 * SALT notation records the canonical morpheme code (/s, /ed, /ing, ...) rather than the
 * spoken spelling, so English orthography has to be re-applied on import; without it
 * "box/s" would come back as "boxs" and "run/ing" as "runing".
 */
function reconstructSurface(lemma: string, suffix: string): string {
  if (suffix === "z") {
    return lemma + "'s";
  } else if (isContractionSuffix(suffix)) {
    // Contraction: lemma + contraction suffix (e.g., "do" + "n't" -> "don't")
    return lemma + suffix;
  }

  const lower = lemma.toLowerCase();

  if (suffix === "s" || suffix === "3s") {
    if (/(s|x|z|ch|sh)$/.test(lower)) return lemma + 'es';
    if (/[^aeiou]o$/.test(lower)) return lemma + 'es';
    if (/[^aeiou]y$/.test(lower)) return lemma.slice(0, -1) + 'ies';
    return lemma + 's';
  }

  if (suffix === "ed") {
    if (lower.endsWith('e')) return lemma + 'd';
    if (/[^aeiou]y$/.test(lower)) return lemma.slice(0, -1) + 'ied';
    return doubleFinalConsonant(lemma) + 'ed';
  }

  if (suffix === "ing") {
    if (lower.endsWith('ie')) return lemma.slice(0, -2) + 'ying';
    if (lower.endsWith('e') && !lower.endsWith('ee')) return lemma.slice(0, -1) + 'ing';
    return doubleFinalConsonant(lemma) + 'ing';
  }

  if (suffix === "en") {
    return lower.endsWith('e') ? lemma + 'n' : lemma + 'en';
  }

  return lemma + suffix;
}

/**
 * Rewrites the parsed morpheme words with the exact surface forms recorded on the
 * reference segment, pairing each parsed token with its reference word through an LCS
 * alignment (morpheme tokens compare by lemma + inflection, so an irregular surface
 * like break/en -> "broken" still lines up with its own word). Handing surfaces out
 * positionally instead would rewrite a DIFFERENT occurrence's spelling whenever the
 * edit deleted or reordered words sharing a lemma. Morphemes the clinician just typed
 * keep their orthographic reconstruction.
 */
function applyRecordedSurfaces(
  words: string[],
  pendingMorphemes: Array<{ index: number; lemma: string; suffix: string; inflection: string }>,
  referenceSegment?: Segment
): void {
  const refWords = referenceSegment?.words || [];
  if (pendingMorphemes.length === 0 || refWords.length === 0) return;

  // Mirror jsonToSalt's morpheme placement so the keys describe the SALT it emitted
  const refTokens = refWords.map(w => w.word || '');
  const refKeys = refTokens.map(normalizeWord);
  const refIsMorph: boolean[] = new Array(refTokens.length).fill(false);
  const usedRefIdx = new Set<number>();

  for (const morph of referenceSegment?.morphemes || []) {
    const form = morph?.morpheme_form;
    const infl = morph?.inflectional_morpheme;
    if (!form || form === '<IRR>') continue;
    if (infl !== 'Contraction' && !MORPH_MAP[infl || '']) continue;

    const idx = findTokenIndexForMorpheme(morph, refTokens, usedRefIdx);
    if (idx === null) continue;

    const lemma = morph.lemma || refTokens[idx];
    refKeys[idx] = `${lemma.toLowerCase()}|${infl || ''}`;
    refIsMorph[idx] = true;
    usedRefIdx.add(idx);
  }

  const parsedKeys = words.map(normalizeWord);
  for (const pending of pendingMorphemes) {
    parsedKeys[pending.index] = `${pending.lemma.toLowerCase()}|${pending.inflection}`;
  }

  const map = lcsAlign(parsedKeys, refKeys);
  for (const pending of pendingMorphemes) {
    const refIdx = map[pending.index];
    if (refIdx !== null && refIsMorph[refIdx]) {
      words[pending.index] = refTokens[refIdx];
    }
  }
}

/**
 * Merges adjacent spans that have consecutive word indices
 */
function mergeAdjacentSpans(
  items: Array<{ words?: number[]; content?: string; mark_location?: number }>,
  tokens: string[]
): Array<{ words: number[]; content: string; mark_location: number }> {
  // Defensive check for invalid input
  if (!items || !Array.isArray(items) || items.length === 0) return [];

  // Extract and sort spans by first word index
  const spans: Array<{ words: number[] }> = [];
  for (const item of items) {
    // Defensive check: ensure item exists and has a valid words array
    if (!item || !item.words || !Array.isArray(item.words)) continue;
    
    const words = item.words.filter(w => typeof w === 'number').sort((a, b) => a - b);
    if (words.length > 0) {
      spans.push({ words: [...words] }); // Create a copy to avoid mutation issues
    }
  }

  if (spans.length === 0) return [];

  // Sort by first word index
  spans.sort((a, b) => a.words[0] - b.words[0]);

  // Merge adjacent spans
  const merged: Array<{ words: number[] }> = [{ words: [...spans[0].words] }];
  for (let i = 1; i < spans.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = spans[i];

    // Defensive check
    if (!prev || !prev.words || !curr || !curr.words || curr.words.length === 0) continue;

    // Check if current span is adjacent to previous
    if (prev.words[prev.words.length - 1] + 1 === curr.words[0]) {
      prev.words.push(...curr.words);
    } else {
      merged.push({ words: [...curr.words] });
    }
  }

  // Build result with content and mark_location
  return merged.map(span => {
    const words = [...new Set(span.words)].sort();
    const content = words
      .filter(i => i >= 0 && i < tokens.length)
      .map(i => tokens[i])
      .join(' ');

    return {
      words,
      content,
      mark_location: words[words.length - 1]
    };
  });
}

/**
 * Finds the word index for a filler word based on timing or content
 */
function findTokenIndexForFiller(
  filler: { content?: string | null; start?: number | null; end?: number | null },
  tokens: string[],
  wordsMeta: Word[],
  usedFillerIdx: Set<number>,
  pauseTol: number = 0.12
): number | null {
  const content = filler.content?.trim() || '';
  const fillerStart = filler.start;
  const fillerEnd = filler.end;
  // Try to match by timing first
  if (wordsMeta &&
    fillerStart !== null && fillerStart !== undefined &&
    fillerEnd !== null && fillerEnd !== undefined) {
    for (let i = 0; i < wordsMeta.length; i++) {
      const wordStart = wordsMeta[i].start;
      const wordEnd = wordsMeta[i].end;

      if (wordStart !== null && wordStart !== undefined &&
        wordEnd !== null && wordEnd !== undefined &&
        wordStart >= fillerStart - pauseTol &&
        wordEnd <= fillerEnd + pauseTol) {
        return i;
      }
    }
  }

  // Fall back to content matching
  if (content) {
    const contentLower = content.toLowerCase();
    for (let i = 0; i < tokens.length; i++) {
      if (usedFillerIdx.has(i)) continue;
      if (tokens[i].toLowerCase() === contentLower) {
        return i;
      }
    }
  }

  return null;
}

/**
 * Finds the token a morpheme annotates, matching on the recorded surface form because
 * morpheme indices in the stored JSON can be misaligned with the word list
 */
function findTokenIndexForMorpheme(
  morph: { word?: string | null; index?: number },
  tokens: string[],
  usedMorphIdx: Set<number>
): number | null {
  const surface = normalizeWord(morph.word);
  const idx = morph.index;
  const idxInRange = typeof idx === 'number' && idx >= 0 && idx < tokens.length && !usedMorphIdx.has(idx);

  if (idxInRange && (!surface || normalizeWord(tokens[idx as number]) === surface)) {
    return idx as number;
  }

  if (!surface) return null;

  for (let i = 0; i < tokens.length; i++) {
    if (usedMorphIdx.has(i)) continue;
    if (normalizeWord(tokens[i]) === surface) return i;
  }

  return null;
}

/**
 * Assigns a pause to the appropriate gap between words
 */
function assignPauseToGap(
  pause: { start?: number | null; end?: number | null },
  gaps: Array<[number, number, number]>,
  pauseTol: number = 0.12
): number | null {
  const pauseStart = pause.start;
  const pauseEnd = pause.end;

  if (pauseStart === null || pauseStart === undefined ||
    pauseEnd === null || pauseEnd === undefined ||
    gaps.length === 0) {
    return null;
  }

  // Try exact matching first
  for (const [afterIdx, gapStart, gapEnd] of gaps) {
    const condStart = (gapStart === -Infinity && pauseEnd <= gapStart + pauseTol) ||
      Math.abs(gapStart - pauseStart) <= pauseTol;
    const condEnd = (gapEnd === Infinity && pauseStart >= gapEnd - pauseTol) ||
      Math.abs(gapEnd - pauseEnd) <= pauseTol;

    if (condStart && condEnd) {
      return afterIdx;
    }
  }

  // Fall back to nearest gap by midpoint
  const pauseMid = (pauseStart + pauseEnd) / 2;
  let bestAfter: number | null = null;
  let bestDist = Infinity;
  for (const [afterIdx, gapStart, gapEnd] of gaps) {
    const gs = gapStart === -Infinity ? pauseEnd : gapStart;
    const ge = gapEnd === Infinity ? pauseStart : gapEnd;

    if (gs > ge) continue;

    const gapMid = (gs + ge) / 2;
    const dist = Math.abs(gapMid - pauseMid);

    if (dist < bestDist) {
      bestDist = dist;
      bestAfter = afterIdx;
    }
  }

  return bestAfter;
}

/**
 * Converts a JSON segment to SALT format
 */
export function jsonToSalt(segment: Segment, pauseTol: number = 0.12, includePauses: boolean = true): string {
  const wordsMeta = segment.words || [];
  const baseTokens = wordsMeta.length > 0
    ? wordsMeta.map(w => w.word || '')
    : (segment.text || '').split(' ');

  const n = baseTokens.length;
  if (n === 0) return '';

  // Process morphemes
  const tokens = [...baseTokens];
  const morphemes = segment.morphemes || [];

  // Morpheme indices in the stored JSON are known to be misaligned with the word list, so
  // the recorded surface form decides which token is annotated; the index is only trusted
  // when it agrees with it (or when no surface form was recorded).
  const usedMorphIdx = new Set<number>();

  for (const morph of morphemes) {
    const form = morph.morpheme_form;
    const infl = morph.inflectional_morpheme;

    // Skip if no morpheme_form or if it's irregular
    if (!form || form === '<IRR>') continue;

    const idx = findTokenIndexForMorpheme(morph, baseTokens, usedMorphIdx);
    if (idx === null) continue;

    // Handle contractions: format as lemma/morpheme_form (e.g., do/n't, I/'m)
    if (infl === 'Contraction') {
      const lemma = morph.lemma || tokens[idx];
      // morpheme_form should contain the contraction suffix (e.g., /'ll, /n't, /'m)
      // If it already starts with /, use it directly; otherwise add /
      const contractionSuffix = form.startsWith('/') ? form.substring(1) : form;
      tokens[idx] = `${lemma}/${contractionSuffix}`;
      usedMorphIdx.add(idx);
      continue;
    }

    const suffix = MORPH_MAP[infl || ''];
    if (suffix) {
      const lemma = morph.lemma || tokens[idx];
      tokens[idx] = `${lemma}/${suffix}`;
      usedMorphIdx.add(idx);
    }
  }

  // Merge adjacent spans for repetitions and revisions
  const repsMerged = mergeAdjacentSpans(segment.repetitions || [], tokens);
  const revsMerged = mergeAdjacentSpans(segment.revisions || [], tokens);
  // Note: mazes are not currently tracked in the data model, but could be added later
  const mazesMerged: Array<{ words: number[]; content: string; mark_location: number }> = [];

  // Combine all spans and sort them to handle overlaps properly
  const allSpans = [...repsMerged, ...revsMerged, ...mazesMerged];
  
  // Validate and remove overlapping/invalid spans
  const validSpans: Array<{ words: number[]; start: number; end: number }> = [];
  const usedIndices = new Set<number>();
  
  for (const span of allSpans) {
    const words = span.words.filter(w => w >= 0 && w < n).sort((a, b) => a - b);
    if (words.length === 0) continue;
    
    // Check if any word in this span is already used
    const hasOverlap = words.some(w => usedIndices.has(w));
    if (hasOverlap) {
      // Skip overlapping spans to avoid mismatched parentheses
      console.warn('Skipping overlapping span:', words);
      continue;
    }
    
    // Mark all words as used
    words.forEach(w => usedIndices.add(w));
    
    validSpans.push({
      words,
      start: words[0],
      end: words[words.length - 1]
    });
  }

  // Initialize marks arrays
  const beforeMarks: string[][] = Array(n).fill(null).map(() => []);
  const afterMarks: string[][] = Array(n).fill(null).map(() => []);
  const covered = new Array(n).fill(false);

  // Add parentheses for validated spans
  for (const span of validSpans) {
    if (span.start >= 0 && span.start < n) {
      beforeMarks[span.start].push('(');
    }
    if (span.end >= 0 && span.end < n) {
      afterMarks[span.end].push(')');
    }
    for (const k of span.words) {
      if (k >= 0 && k < n) {
        covered[k] = true;
      }
    }
  }

  // Process filler words
  const fillerList = segment.fillerwords || [];
  const usedFillerIdx = new Set<number>();

  for (const filler of fillerList) {
    const idx = findTokenIndexForFiller(filler, tokens, wordsMeta, usedFillerIdx, pauseTol);

    if (idx === null || idx < 0 || idx >= n) continue;

    if (!covered[idx]) {
      beforeMarks[idx].push('(');
      afterMarks[idx].push(')');
      covered[idx] = true;
    }
    usedFillerIdx.add(idx);
  }

  // Process pauses (only if includePauses is true)
  const pauses = includePauses ? (segment.pauses || []) : [];
  const pausesAfter: string[][] = Array(n).fill(null).map(() => []);
  const prePauses: string[] = [];

  // Build gaps array for pause assignment
  const gaps: Array<[number, number, number]> = [];

  if (wordsMeta.length > 0) {
    // Gap before first word
    const firstStart = wordsMeta[0].start;
    if (firstStart !== null && firstStart !== undefined) {
      gaps.push([-1, -Infinity, firstStart]);
    }

    // Gaps between words
    for (let i = 0; i < n - 1; i++) {
      const aEnd = wordsMeta[i].end;
      const bStart = wordsMeta[i + 1].start;

      if (aEnd !== null && aEnd !== undefined &&
        bStart !== null && bStart !== undefined &&
        bStart >= aEnd) {
        gaps.push([i, aEnd, bStart]);
      }
    }

    // Gap after last word
    const lastEnd = wordsMeta[n - 1].end;
    if (lastEnd !== null && lastEnd !== undefined) {
      gaps.push([n - 1, lastEnd, Infinity]);
    }
  }

  // Assign pauses to gaps
  for (const pause of pauses) {
    let duration = pause.duration;

    if (duration === null || duration === undefined) {
      const pauseStart = pause.start;
      const pauseEnd = pause.end;

      if (pauseStart !== null && pauseStart !== undefined &&
        pauseEnd !== null && pauseEnd !== undefined) {
        duration = Math.max(0, pauseEnd - pauseStart);
      } else {
        continue;
      }
    }

    // Format pause tag as whole seconds (SALT convention)
    const roundedDuration = Math.round(duration);
    const tag = `:${roundedDuration.toString().padStart(2, '0')}`;

    // Use pause index if available, otherwise fall back to gap assignment
    let slot: number | null = null;
    if (typeof pause.index === 'number') {
      slot = pause.index;
    } else if (wordsMeta.length > 0) {
      slot = assignPauseToGap(pause, gaps, pauseTol);
    }

    if (slot === null || slot >= n) {
      // Default to last position (also handle out of bounds slots)
      pausesAfter[n - 1].push(tag);
    } else if (slot === -1) {
      // Before first word
      prePauses.push(tag);
    } else if (slot >= 0 && slot < n) {
      // After specific word (with bounds check)
      pausesAfter[slot].push(tag);
    }
  }

  // Build output
  const output: string[] = [];

  // Add pre-pauses
  output.push(...prePauses);

  // Add tokens with marks and pauses
  for (let i = 0; i < n; i++) {
    const pre = beforeMarks[i].join('');
    const post = afterMarks[i].join('');
    output.push(`${pre}${tokens[i]}${post}`);

    if (pausesAfter[i].length > 0) {
      output.push(...pausesAfter[i]);
    }
  }

  let result = output.join(' ');
  
  // Validate balanced parentheses (SALT convention requires matched pairs)
  const openCount = (result.match(/\(/g) || []).length;
  const closeCount = (result.match(/\)/g) || []).length;
  
  if (openCount !== closeCount) {
    console.error(`Mismatched parentheses in SALT output: ${openCount} open, ${closeCount} close`);
    console.error('Output:', result);
    console.error('Segment:', segment);
    
    // Attempt to fix by removing all unmatched parentheses
    // This is a fallback - the real fix should be in the data
    let parenBalance = 0;
    const chars = result.split('');
    const fixed: string[] = [];
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      if (char === '(') {
        parenBalance++;
        fixed.push(char);
      } else if (char === ')') {
        if (parenBalance > 0) {
          parenBalance--;
          fixed.push(char);
        }
        // Skip unmatched closing parentheses
      } else {
        fixed.push(char);
      }
    }
    
    // Remove any remaining unmatched opening parentheses from the end
    while (parenBalance > 0 && fixed.length > 0) {
      for (let i = fixed.length - 1; i >= 0; i--) {
        if (fixed[i] === '(') {
          fixed.splice(i, 1);
          parenBalance--;
          break;
        }
      }
    }
    
    result = fixed.join('');
  }
  
  // Ensure utterance ends with proper punctuation (SALT convention)
  // Check if the last character is already punctuation
  if (result && !/[.!?]$/.test(result)) {
    result += '.';
  }

  return result;
}

/**
 * Converts multiple segments to SALT format
 * Excluded segments are prefixed with '+' as per SALT convention
 */
export function segmentsToSalt(
  segments: Segment[], 
  includePauses: boolean = true,
  speakerLabels?: Record<string, string>
): string {
  return segments
    .map(segment => {
      const salt = jsonToSalt(segment, 0.12, includePauses);
      const speaker = segment.speaker || 'Unknown';
      // Use custom label if provided, otherwise use full speaker name
      const speakerLabel = speakerLabels?.[speaker] || speaker;
      // Add '+' prefix for excluded utterances (SALT convention)
      const excludedPrefix = segment.excluded ? '+' : '';
      return salt ? `${excludedPrefix}${speakerLabel} ${salt}` : '';
    })
    .filter(line => line.length > 0)
    .join('\n');
}

/**
 * Exports segments to a SALT format file
 */
export function exportToSaltFile(segments: Segment[], filename: string = 'transcript.slt'): void {
  const saltContent = segmentsToSalt(segments);

  // Create a blob and download link
  const blob = new Blob([saltContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  // Clean up
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Formats SALT content with proper line breaks and indentation
 */
export function formatSaltContent(saltContent: string): string {
  const lines = saltContent.split('\n');
  const formatted: string[] = [];

  for (const line of lines) {
    if (line.trim()) {
      // SALT format uses speaker labels without colons
      formatted.push(line);
    }
  }

  return formatted.join('\n');
}

/**
 * Parses SALT format text to extract words and annotations
 */
function parseSalt(saltText: string, referenceSegment?: Segment): {
  text: string;
  words: string[];
  mazes: Array<{ content: string; words: number[]; mark_location: number }>;
  pauses_with_gap: Array<[number, number]>;
  morphemes: Array<{
    word: string;
    lemma: string;
    index: number;
    inflectional_morpheme: string;
    morpheme_form: string;
  }>;
  first_token_is_pause: boolean;
} {
  // Strip sentence-ending punctuation from the end (SALT convention)
  const cleanedText = saltText.trim().replace(/[.!?]$/, '');
  const rawTokens = cleanedText.split(/\s+/);
  const words: string[] = [];
  const mazes: Array<{ content: string; words: number[]; mark_location: number }> = [];
  const morphemes: Array<{
    word: string;
    lemma: string;
    index: number;
    inflectional_morpheme: string;
    morpheme_form: string;
  }> = [];
  const pauses_with_gap: Array<[number, number]> = [];
  const first_token_is_pause = rawTokens.length > 0 && rawTokens[0].startsWith(':');
  // Morpheme words parse with a reconstructed surface first; the recorded surfaces are
  // matched back on by alignment once the whole word sequence is known.
  const pendingMorphemes: Array<{ index: number; lemma: string; suffix: string; inflection: string }> = [];

  let activeMazeStart: number | null = null;
  let wordIndex = 0;
  let currentGap = -1;

  // Helper to strip parentheses
  function stripParens(tok: string): [number, string, number] {
    let lead = 0;
    while (tok.startsWith('(')) {
      lead++;
      tok = tok.substring(1);
    }
    let trail = 0;
    while (tok.endsWith(')') && tok !== ')') {
      trail++;
      tok = tok.substring(0, tok.length - 1);
    }
    if (tok === ')') {
      tok = '';
      trail++;
    }
    return [lead, tok, trail];
  }

  for (const tok of rawTokens) {
    // Handle pauses (SALT format uses whole seconds, e.g., :02 means 2 seconds)
    if (tok.startsWith(':')) {
      try {
        const dur = parseInt(tok.substring(1), 10);
        if (!isNaN(dur)) {
          pauses_with_gap.push([currentGap, dur]);
        }
      } catch (e) {
        // Invalid pause format, skip
      }
      continue;
    }

    const [lead, core, trail] = stripParens(tok);

    // Start of maze/repetition/revision
    if (lead > 0 && activeMazeStart === null) {
      activeMazeStart = wordIndex;
    }

    // Process word
    if (core) {
      // For morpheme annotations, store the base word only
      let wordToStore = core;

      // Check for morpheme annotation
      if (core.includes('/')) {
        const parts = core.split('/');
        if (parts.length === 2) {
          const [lemma, suf] = parts;
          
          // Check if it's a regular morpheme
          if (MORPH_INV[suf]) {
            wordToStore = reconstructSurface(lemma, suf); // Store the inflected form
            pendingMorphemes.push({ index: wordIndex, lemma, suffix: suf, inflection: MORPH_INV[suf] });
          }
          // Check if it's a contraction suffix (e.g., 'll, 'd, 've, 're, 'm, n't, 's, 't)
          else if (isContractionSuffix(suf)) {
            wordToStore = reconstructSurface(lemma, suf); // Store the contracted form (e.g., "don't")
            pendingMorphemes.push({ index: wordIndex, lemma, suffix: suf, inflection: 'Contraction' });
          } else {
            // Unknown morpheme format, just use the first part
            wordToStore = parts[0];
          }
        } else {
          // Invalid format (more than 2 parts), just use the first part
          wordToStore = parts[0];
        }
      }

      words.push(wordToStore);
      wordIndex++;
      currentGap = wordIndex - 1;
    }

    // End of maze/repetition/revision
    if (trail > 0 && activeMazeStart !== null) {
      const s = activeMazeStart;
      const e = wordIndex - 1;
      if (e >= s) {
        const span = [];
        for (let i = s; i <= e; i++) {
          span.push(i);
        }
        const content = span.map(i => words[i]).join(' ');
        mazes.push({ content, words: span, mark_location: e });
      }
      activeMazeStart = null;
    }
  }

  applyRecordedSurfaces(words, pendingMorphemes, referenceSegment);
  for (const pending of pendingMorphemes) {
    morphemes.push({
      word: words[pending.index],
      lemma: pending.lemma,
      index: pending.index,
      inflectional_morpheme: pending.inflection,
      morpheme_form: `/${pending.suffix}`
    });
  }
  // Recorded surfaces may have rewritten words inside a maze
  for (const maze of mazes) {
    maze.content = maze.words.map(i => words[i]).join(' ');
  }

  return {
    text: words.join(' '),
    words,
    mazes,
    pauses_with_gap,
    morphemes,
    first_token_is_pause
  };
}

/**
 * Longest-common-subsequence alignment of two token sequences.
 * Returns, for each item of `a`, the index in `b` it is unchanged from (or null).
 */
function lcsAlign(a: string[], b: string[]): Array<number | null> {
  const n = a.length;
  const m = b.length;

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const map: Array<number | null> = new Array(n).fill(null);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      map[i] = j;
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  return map;
}

/**
 * Longest-common-subsequence alignment of the re-parsed words onto the reference words.
 * Returns, for each parsed word, the reference word it is unchanged from (or null).
 */
function alignToReference(parsedWords: string[], referenceWords: string[]): Array<number | null> {
  return lcsAlign(parsedWords.map(normalizeWord), referenceWords.map(normalizeWord));
}

/**
 * Rebuilds the word list for an edited utterance while keeping the real ASR timings:
 * words that survived the edit keep their own start/end, a run of words replaced
 * one-for-one keeps the spans of the words it replaced, and only genuinely inserted
 * words get times interpolated inside the surrounding gap.
 */
function alignWordTimings(
  parsedWords: string[],
  referenceWords: Word[],
  segStart: number,
  segEnd: number
): Word[] {
  const map = alignToReference(parsedWords, referenceWords.map(w => w.word || ''));
  const words: Word[] = parsedWords.map((word, i) => {
    const refIdx = map[i];
    const refWord = refIdx === null ? null : referenceWords[refIdx];
    return {
      word,
      start: refWord ? refWord.start : null,
      end: refWord ? refWord.end : null,
      index: i
    };
  });

  // Fill the runs of words that have no counterpart in the reference
  let i = 0;
  while (i < words.length) {
    if (map[i] !== null) {
      i++;
      continue;
    }

    let j = i;
    while (j < words.length && map[j] === null) j++;

    const refFrom = i > 0 ? (map[i - 1] as number) + 1 : 0;
    const refTo = j < words.length ? (map[j] as number) : referenceWords.length;

    if (refTo - refFrom === j - i) {
      // One-for-one replacement (e.g. a typo fix): reuse each replaced word's span
      for (let k = i; k < j; k++) {
        words[k].start = referenceWords[refFrom + k - i].start;
        words[k].end = referenceWords[refFrom + k - i].end;
      }
    } else {
      let prevEnd = segStart;
      for (let k = i - 1; k >= 0; k--) {
        if (words[k].end !== null) { prevEnd = words[k].end as number; break; }
      }
      let nextStart = segEnd;
      for (let k = j; k < words.length; k++) {
        if (words[k].start !== null) { nextStart = words[k].start as number; break; }
      }

      // Contiguous ASR spans leave a zero-width gap, but an inserted word must still get
      // a real time — a null start/end breaks word-click playback and split-time math.
      const step = Math.max(0, nextStart - prevEnd) / (j - i);
      for (let k = i; k < j; k++) {
        words[k].start = prevEnd + step * (k - i);
        words[k].end = prevEnd + step * (k - i + 1);
      }
    }

    i = j;
  }

  return words;
}

/**
 * Converts SALT format text to a partial Segment with annotations
 * This is used for quick editing where users can type SALT format
 */
export function saltToJson(saltText: string, referenceSegment?: Segment): Partial<Segment> {
  const parsed = parseSalt(saltText, referenceSegment);
  console.log('parsed', parsed);
  const ref = referenceSegment || {} as Segment;
  const segStart = ref.start || 0;
  const segEnd = ref.end || segStart;

  // Generate basic word timings if we have reference
  let words: Word[] = [];
  if (ref.words && ref.words.length > 0) {
    // Carry the original ASR timings over to every word the edit left untouched
    words = alignWordTimings(parsed.words, ref.words, segStart, segEnd);
  } else {
    // No reference timing, create words without timing
    for (let i = 0; i < parsed.words.length; i++) {
      const word = parsed.words[i];
      // Words are already processed correctly in parseSalt
      words.push({
        word: word,
        start: null,
        end: null,
        index: i
      });
    }
  }

  // Convert mazes to repetitions and revisions
  const repetitions: Array<{ content: string; words: number[]; mark_location: number }> = [];
  const revisions: Array<{ content: string; words: number[]; mark_location: number }> = [];

  // A maze keeps the annotation type it had on the reference segment — the length
  // heuristic alone reclassifies a multi-word repetition as a revision (and a
  // single-word revision as a repetition) on every round-trip.
  const refMap = ref.words && ref.words.length > 0
    ? alignToReference(parsed.words, ref.words.map(w => w.word || ''))
    : [];
  const refRepetitionIdx = new Set<number>();
  for (const rep of ref.repetitions || []) {
    for (const w of rep.words || []) refRepetitionIdx.add(w);
  }
  const refRevisionIdx = new Set<number>();
  for (const rev of ref.revisions || []) {
    for (const w of rev.words || []) refRevisionIdx.add(w);
  }

  for (const maze of parsed.mazes) {
    const refIdxs = maze.words
      .map(i => refMap[i])
      .filter((idx): idx is number => typeof idx === 'number');
    // Only an intact maze (every word descending from the reference annotation) keeps its
    // recorded type; a maze the clinician rewrote is genuinely new content.
    const intact = refIdxs.length === maze.words.length && refIdxs.length > 0;
    const wasRepetition = intact && refIdxs.every(idx => refRepetitionIdx.has(idx));
    const wasRevision = intact && refIdxs.every(idx => refRevisionIdx.has(idx));

    if (wasRepetition && !wasRevision) {
      repetitions.push(maze);
    } else if (wasRevision && !wasRepetition) {
      revisions.push(maze);
    } else if (maze.words.length === 1) {
      // New maze the reference knows nothing about: single words as repetitions,
      // multiple as revisions
      repetitions.push(maze);
    } else {
      revisions.push(maze);
    }
  }

  // Convert pauses
  const pauses: Pause[] = [];
  if (parsed.pauses_with_gap.length > 0) {
    // Check if we have valid timing information
    const hasValidTiming = words.length > 0 && words[0].start !== null && words[0].end !== null;

    if (hasValidTiming) {
      // Place pauses in appropriate gaps with timing
      for (const [gapIndex, duration] of parsed.pauses_with_gap) {
        if (gapIndex === -1) {
          // Pause before first word
          const firstWordStart = words[0].start;
          if (firstWordStart !== null) {
            pauses.push({
              start: Math.max(segStart, firstWordStart - duration),
              end: firstWordStart,
              duration,
              index: -1
            });
          } else {
            // No timing, just record duration
            pauses.push({
              start: null,
              end: null,
              duration,
              index: -1
            });
          }
        } else if (gapIndex >= 0 && gapIndex < words.length) {
          // Pause after a word; jsonToSalt emits utterance-final pauses after the last
          // word, so the last gap has to round-trip too
          const afterWord = words[gapIndex];
          const beforeWord = gapIndex + 1 < words.length ? words[gapIndex + 1] : null;
          const gapEnd = beforeWord ? beforeWord.start : (afterWord.end !== null ? afterWord.end + duration : null);
          if (afterWord.end !== null && gapEnd !== null) {
            pauses.push({
              start: afterWord.end,
              end: gapEnd,
              duration,
              index: gapIndex
            });
          } else {
            // No timing, just record duration
            pauses.push({
              start: null,
              end: null,
              duration,
              index: gapIndex
            });
          }
        }
      }
    } else {
      // No timing reference, create pauses without specific times
      for (const [gapIndex, duration] of parsed.pauses_with_gap) {
        if (gapIndex === -1) {
          // Pause before first word - always include
          pauses.push({
            start: null,
            end: null,
            duration,
            index: -1
          });
        } else if (gapIndex >= 0 && gapIndex < words.length) {
          // Pause after a word, including the utterance-final gap
          pauses.push({
            start: null,
            end: null,
            duration,
            index: gapIndex
          });
        }
      }
    }
  }

  // Build the result segment
  const result: Partial<Segment> = {
    text: words.map(w => w.word).join(' '),
    words
  };

  // Add annotations if present
  if (repetitions.length > 0) {
    result.repetitions = repetitions;
  }

  if (revisions.length > 0) {
    result.revisions = revisions;
  }

  if (pauses.length > 0) {
    result.pauses = pauses;
  }

  if (parsed.morphemes.length > 0) {
    result.morphemes = parsed.morphemes;
  }
  console.log('result', result);

  return result;
}

/**
 * Checks if a text string contains SALT format annotations
 */
export function containsSaltAnnotations(text: string): boolean {
  // Check for common SALT patterns
  return /:\d+\.?\d*|\([^)]+\)|\w+\/\w+/.test(text);
}
