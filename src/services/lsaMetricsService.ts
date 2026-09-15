// The metric values sent with a SATE Report request, and the TD reference values they
// are compared against.
//
// The report service computes its own approximate counts from the SALT it receives, but
// it can only produce z-scores for metrics IT IS GIVEN — value plus td_mean plus td_sd.
// So the numbers have to be in hand BEFORE the request, which is why they are computed
// here rather than read back out of the response.
//
// The values come from `calculateSpeechAnalysis`, the same function behind the app's own
// language metrics, and the reference values from the same CHILDES query the Analysis
// tab runs (Eng-NA / narrative / TD). That is deliberate: a report that disagreed with
// the Analysis tab about this recording's MLU would leave the clinician with two numbers
// for one thing and no way to tell which is the real one.

import { calculateSpeechAnalysis, type Segment } from '@/services/dataService';
import { fetchChildesNorms } from './childesNormsService';
import type { LsaMetricInput, LsaNormsContext } from './lsaReportService';

export interface SampleMetrics {
  ntw: number;
  ndw: number;
  mluw: number;
  mlum: number;
}

export interface NormedMetricsBundle {
  metrics: Record<string, LsaMetricInput>;
  norms: LsaNormsContext;
}

/** Raised when the age window has no CHILDES samples — a real answer, not a failure. */
export class NoNormsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoNormsError';
  }
}

const round = (v: number, digits = 2) =>
  Number.isFinite(v) ? Number(v.toFixed(digits)) : 0;

/** This recording's own metrics for the target speaker. */
export function computeSampleMetrics(segments: Segment[], targetSpeaker: string): SampleMetrics {
  const a = calculateSpeechAnalysis({ segments: segments || [] }, targetSpeaker);
  return { ntw: a.ntw, ndw: a.ndw, mluw: a.mluw, mlum: a.mlum };
}

/**
 * The `metrics` object for the request. Values the service has no reference values for
 * are still sent: they come back as NO REF rows, which puts every number the app knows
 * about this sample in one table instead of splitting it across two.
 */
export function metricsPayload(
  m: SampleMetrics,
  refs?: { MLU_m?: { mean: number; sd: number; n: number }; MLU_w?: { mean: number; sd: number; n: number } },
): Record<string, LsaMetricInput> {
  const withRef = (value: number, ref?: { mean: number; sd: number; n: number }): LsaMetricInput => {
    // A z-score needs a mean AND a usable SD; a zero or missing SD would divide by zero,
    // so the row is sent value-only rather than with a reference the service must reject.
    if (!ref || !Number.isFinite(ref.mean) || !Number.isFinite(ref.sd) || ref.sd <= 0) {
      return { value: round(value) };
    }
    return { value: round(value), td_mean: round(ref.mean), td_sd: round(ref.sd), td_n: ref.n };
  };
  return {
    MLU_m: withRef(m.mlum, refs?.MLU_m),
    MLU_w: withRef(m.mluw, refs?.MLU_w),
    TNW: { value: Math.round(m.ntw) },
    NDW: { value: Math.round(m.ndw) },
  };
}

/**
 * Fetch the CHILDES reference values for this age and pair them with the sample's own
 * metrics. Throws rather than silently degrading to a report with no z-scores: the
 * clinician asked for the comparison, and a ~20 s LLM call should not be spent producing
 * a document that quietly is not the one they ticked the box for.
 */
export async function buildNormedMetrics(opts: {
  segments: Segment[];
  targetSpeaker: string;
  ageYears: number;
  ageMonths: number;
  rangeMonths?: number;
}): Promise<NormedMetricsBundle> {
  const sample = computeSampleMetrics(opts.segments, opts.targetSpeaker);

  const res = await fetchChildesNorms({
    // Fixed to match the Analysis tab's query exactly — both are locked to this one
    // reference group, so the two screens cannot disagree about the norms.
    language: 'Eng-NA',
    task: 'narrative',
    clinical: 'TD',
    year: opts.ageYears,
    month: opts.ageMonths,
    range: opts.rangeMonths,
  });

  if (!res || res.n_samples === 0 || res.MLUm?.mean == null) {
    const ageWindow = res?.filters?.age_window_months;
    throw new NoNormsError(
      'No CHILDES reference samples for this age window'
      + (ageWindow ? ` (${ageWindow[0]}–${ageWindow[1]} months)` : '')
      + '. Widen the ± range, or generate without the normative comparison.',
    );
  }

  return {
    metrics: metricsPayload(sample, { MLU_m: res.MLUm, MLU_w: res.MLUw }),
    norms: {
      source: 'CHILDES',
      language: 'Eng-NA',
      task: 'narrative',
      clinical: 'TD',
      n_samples: res.n_samples,
      n_corpora: res.n_corpora,
      age_window_months: res.filters?.age_window_months ?? null,
    },
  };
}
