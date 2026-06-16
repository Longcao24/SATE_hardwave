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
 * Reconstructs the surface form of a word from lemma and suffix
 */
function reconstructSurface(lemma: string, suffix: string): string {
  if (suffix === "z") {
    return lemma + "'s";
  } else if (suffix === "3s") {
    return lemma + "s";
  } else if (isContractionSuffix(suffix)) {
    // Contraction: lemma + contraction suffix (e.g., "do" + "n't" -> "don't")
    return lemma + suffix;
  } else {
    return lemma + suffix;
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

  for (const morph of morphemes) {
    const idx = morph.index;
    if (typeof idx === 'number' && idx >= 0 && idx < n) {
      const form = morph.morpheme_form;
      const infl = morph.inflectional_morpheme;

      // Skip if no morpheme_form or if it's irregular
      if (!form || form === '<IRR>') continue;

      // Handle contractions: format as lemma/morpheme_form (e.g., do/n't, I/'m)
      if (infl === 'Contraction') {
        const lemma = morph.lemma || tokens[idx];
        // morpheme_form should contain the contraction suffix (e.g., /'ll, /n't, /'m)
        // If it already starts with /, use it directly; otherwise add /
        const contractionSuffix = form.startsWith('/') ? form.substring(1) : form;
        tokens[idx] = `${lemma}/${contractionSuffix}`;
        continue;
      }

      const suffix = MORPH_MAP[infl || ''];
      if (suffix) {
        const lemma = morph.lemma || tokens[idx];
        tokens[idx] = `${lemma}/${suffix}`;
      }
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
function parseSalt(saltText: string): {
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
            morphemes.push({
              word: wordToStore,
              lemma,
              index: wordIndex,
              inflectional_morpheme: MORPH_INV[suf],
              morpheme_form: `/${suf}`
            });
          } 
          // Check if it's a contraction suffix (e.g., 'll, 'd, 've, 're, 'm, n't, 's, 't)
          else if (isContractionSuffix(suf)) {
            wordToStore = reconstructSurface(lemma, suf); // Store the contracted form (e.g., "don't")
            morphemes.push({
              word: wordToStore,
              lemma,
              index: wordIndex,
              inflectional_morpheme: 'Contraction',
              morpheme_form: `/${suf}`
            });
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
 * Converts SALT format text to a partial Segment with annotations
 * This is used for quick editing where users can type SALT format
 */
export function saltToJson(saltText: string, referenceSegment?: Segment): Partial<Segment> {
  const parsed = parseSalt(saltText);
  console.log('parsed', parsed);
  const ref = referenceSegment || {} as Segment;
  const segStart = ref.start || 0;
  const segEnd = ref.end || segStart;

  // Generate basic word timings if we have reference
  const words: Word[] = [];
  if (ref.words && ref.words.length > 0) {
    // Try to preserve existing word timings where possible
    const totalDuration = segEnd - segStart;
    const avgWordDuration = totalDuration / parsed.words.length;

    let currentTime = segStart;
    for (let i = 0; i < parsed.words.length; i++) {
      const word = parsed.words[i];
      // Words are already processed correctly in parseSalt

      words.push({
        word: word,
        start: currentTime,
        end: currentTime + avgWordDuration,
        index: i
      });
      currentTime += avgWordDuration;
    }
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
  // For simplicity, treat all parenthesized content as repetitions
  // In a more sophisticated implementation, you could analyze context
  const repetitions: Array<{ content: string; words: number[]; mark_location: number }> = [];
  const revisions: Array<{ content: string; words: number[]; mark_location: number }> = [];

  // Split mazes into repetitions and revisions based on heuristics
  for (const maze of parsed.mazes) {
    // For now, treat single words as repetitions, multiple as revisions
    if (maze.words.length === 1) {
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
        } else if (gapIndex >= 0 && gapIndex < words.length - 1) {
          // Pause between words
          const afterWord = words[gapIndex];
          const beforeWord = words[gapIndex + 1];
          if (afterWord.end !== null && beforeWord.start !== null) {
            pauses.push({
              start: afterWord.end,
              end: beforeWord.start,
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
        // Ignore pauses at the end of a segment (gapIndex >= words.length - 1)
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
        } else if (gapIndex >= 0 && gapIndex < words.length - 1) {
          // Pause between words - only include if not at the end
          pauses.push({
            start: null,
            end: null,
            duration,
            index: gapIndex
          });
        }
        // Ignore pauses at the end of a segment (gapIndex >= words.length - 1)
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
