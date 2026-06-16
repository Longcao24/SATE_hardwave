/**
 * D-VoCD (Vocabulary Diversity) Calculator
 * Based on VoCD algorithm for measuring lexical diversity
 */

interface VoCDResult {
  numTokens: number;
  dHat: number;
  avgCurve: Array<[number, number]>;
  predCurve: Array<[number, number]>;
}

interface VoCDOptions {
  nMin?: number;
  nMax?: number;
  samples?: number;
  seed?: number;
}

/**
 * VoCD function that models the relationship between sample size and TTR
 */
function vocdFunction(N: number, D: number): number {
  D = Math.max(D, 1e-9); // Prevent division by zero
  return (D / N) * (Math.sqrt(1.0 + (2.0 * N) / D) - 1.0);
}

/**
 * Clean and normalize a token for analysis
 */
function cleanToken(word: string): string | null {
  let w = word.trim().toLowerCase();
  
  // Remove leading and trailing non-alphanumeric characters (except apostrophes)
  w = w.replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
  
  if (!w) return null;
  
  // Skip special markers (e.g., <filler>, <pause>)
  if (w.startsWith('<') && w.endsWith('>')) return null;
  
  return w;
}

/**
 * Seeded random number generator for reproducible results
 */
class SeededRandom {
  private seed: number;
  
  constructor(seed: number) {
    this.seed = seed;
  }
  
  private next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
  
  sample<T>(array: T[], n: number): T[] {
    const result: T[] = [];
    const indices = new Set<number>();
    
    while (indices.size < n) {
      const index = Math.floor(this.next() * array.length);
      if (!indices.has(index)) {
        indices.add(index);
        result.push(array[index]);
      }
    }
    
    return result;
  }
}

/**
 * Calculate average TTR for a given sample size N
 */
function avgTTRForN(
  tokens: string[], 
  N: number, 
  samples: number, 
  rng: SeededRandom
): number {
  if (tokens.length < N) {
    throw new Error(`Not enough tokens (${tokens.length}) for N=${N}.`);
  }
  
  let total = 0.0;
  
  for (let i = 0; i < samples; i++) {
    const chosenTokens = rng.sample(tokens, N);
    const types = new Set(chosenTokens).size;
    total += types / N;
  }
  
  return total / samples;
}

/**
 * Build the average TTR curve across different sample sizes
 */
function buildAvgTTRCurve(
  tokens: string[],
  nRange: number[],
  samples: number,
  seed: number
): Array<[number, number]> {
  const rng = new SeededRandom(seed);
  const curve: Array<[number, number]> = [];
  
  // Only use N values that don't exceed the number of available tokens
  const validNRange = nRange.filter(N => N <= tokens.length);
  
  for (const N of validNRange) {
    const avg = avgTTRForN(tokens, N, samples, rng);
    curve.push([N, avg]);
  }
  
  return curve;
}

/**
 * Find the optimal D value using least squares with golden section search
 */
function leastSquaresD(
  avgCurve: Array<[number, number]>,
  dLo: number = 1e-3,
  dHi: number = 1e4,
  tol: number = 1e-8,
  maxIter: number = 200
): number {
  // Sum of squared errors function
  const sse = (D: number): number => {
    return avgCurve.reduce((sum, [N, avg]) => {
      const pred = vocdFunction(N, D);
      return sum + Math.pow(avg - pred, 2);
    }, 0);
  };
  
  // Golden section search in log space
  let a = Math.log(dLo);
  let b = Math.log(dHi);
  const phi = (1 + Math.sqrt(5)) / 2;
  const invphi = 1 / phi;
  
  let c = b - (b - a) * invphi;
  let d = a + (b - a) * invphi;
  let fc = sse(Math.exp(c));
  let fd = sse(Math.exp(d));
  let iters = 0;
  
  while ((b - a) > tol && iters < maxIter) {
    if (fc > fd) {
      a = c;
      c = d;
      fc = fd;
      d = a + (b - a) * invphi;
      fd = sse(Math.exp(d));
    } else {
      b = d;
      d = c;
      fd = fc;
      c = b - (b - a) * invphi;
      fc = sse(Math.exp(c));
    }
    iters++;
  }
  
  return Math.exp((a + b) / 2.0);
}

/**
 * Main function to compute D-VoCD from a list of words
 */
export function computeVocdD(
  words: string[],
  options: VoCDOptions = {}
): VoCDResult {
  const {
    nMin = 35,
    nMax = 50,
    samples = 100,
    seed = 42
  } = options;
  
  // Clean and filter tokens
  const tokens: string[] = [];
  for (const word of words) {
    const cleaned = cleanToken(word);
    if (cleaned) {
      tokens.push(cleaned);
    }
  }
  
  // Check if we have enough tokens
  if (tokens.length < nMin) {
    // Return a default result if not enough tokens
    return {
      numTokens: tokens.length,
      dHat: 0,
      avgCurve: [],
      predCurve: []
    };
  }
  
  // Create the range of N values, but limit to available tokens
  const effectiveNMax = Math.min(nMax, tokens.length);
  const nRange: number[] = [];
  for (let n = nMin; n <= effectiveNMax; n++) {
    nRange.push(n);
  }
  
  // If we don't have enough range for meaningful analysis, return default
  if (nRange.length < 3) {
    return {
      numTokens: tokens.length,
      dHat: 0,
      avgCurve: [],
      predCurve: []
    };
  }
  
  // Build the average TTR curve
  const avgCurve = buildAvgTTRCurve(tokens, nRange, samples, seed);
  
  // Find the optimal D value
  const dHat = leastSquaresD(avgCurve);
  
  // Build the predicted curve
  const predCurve: Array<[number, number]> = avgCurve.map(([N]) => [
    N,
    vocdFunction(N, dHat)
  ]);
  
  return {
    numTokens: tokens.length,
    dHat,
    avgCurve,
    predCurve
  };
}

/**
 * Extract words from segments for VoCD calculation
 */
export function extractWordsFromSegments(segments: any[]): string[] {
  const words: string[] = [];
  
  for (const segment of segments) {
    if (segment.words && Array.isArray(segment.words)) {
      for (const wordObj of segment.words) {
        if (wordObj.word) {
          words.push(wordObj.word);
        }
      }
    }
  }
  
  return words;
}

/**
 * Calculate VoCD for specific speaker
 */
export function calculateSpeakerVocd(
  segments: any[], 
  speaker: string,
  options: VoCDOptions = {}
): VoCDResult {
  const speakerSegments = segments.filter(s => s.speaker === speaker);
  const words = extractWordsFromSegments(speakerSegments);
  return computeVocdD(words, options);
}

/**
 * Calculate VoCD for all speakers
 */
export function calculateAllSpeakersVocd(
  segments: any[],
  options: VoCDOptions = {}
): Record<string, VoCDResult> {
  const speakers = [...new Set(segments.map(s => s.speaker))];
  const results: Record<string, VoCDResult> = {};
  
  for (const speaker of speakers) {
    results[speaker] = calculateSpeakerVocd(segments, speaker, options);
  }
  
  // Also calculate for all speakers combined
  const allWords = extractWordsFromSegments(segments);
  results['all'] = computeVocdD(allWords, options);
  
  return results;
}
