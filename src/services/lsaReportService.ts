// SATE LSA Report API client.
//
// Sends a SALT transcript + sample information and gets back the analysed report:
// eight domain observations, limitations, a summary, the numbers parsed from the
// transcript, and (when reference values are supplied) a metrics table with z-scores.
//
// Calls go through the `lsa-report` Supabase edge function, which proxies the upstream
// service server-side and adds the CORS headers it lacks — a direct browser fetch fails
// with "Failed to fetch". One request holds a single LLM call, so it takes ~15-30 s.

import { supabase } from '../lib/supabase';

export interface LsaSample {
  file_name: string;                 // shown in the report footer — keep it non-identifying
  age: string;                       // "years;months", e.g. "6;6"
  task: string;                      // elicitation task, free text
  speaker?: string;                  // printed as "Child (C)"
  speaker_code?: string | null;      // SALT line prefix of the target speaker
  language?: string;
  date?: string | null;
  clinician?: string | null;
  notes?: string | null;
}

/** A metric may carry any subset of these; a z-score needs value + td_mean + td_sd. */
export interface LsaMetricInput {
  value?: number;
  td_mean?: number;
  td_sd?: number;
  td_n?: number;
  note?: string;
  label?: string;
}

export interface LsaReportRequest {
  sample: LsaSample;
  transcript: string;
  metrics?: Record<string, LsaMetricInput | number>;
  options?: Record<string, unknown>;
}

export type LsaDomainStatus =
  | 'STRENGTH' | 'AGE-APPROPRIATE' | 'MONITOR' | 'CONCERN' | 'INSUFFICIENT DATA';

export interface LsaDomain {
  domain: string;
  observation: string;
  status: LsaDomainStatus | string;
  basis?: string;
  evidence_utterances?: number[];
}

export interface LsaMetricRow {
  key: string;
  label: string;
  domain: string;
  direction?: string;
  value: number | null;
  value_str?: string;
  td_mean: number | null;
  td_sd: number | null;
  td_n?: number | null;
  z: number | null;
  status: string;      // TYPICAL | BELOW AVG | ABOVE AVG | CONCERN | MONITOR | NO REF
  note?: string | null;
}

/** Counts parsed from the transcript by the service — never by the model. */
export interface LsaDerivedCounts {
  target_speaker_code?: string;
  utterances_all_speakers?: number;
  target_utterances?: number;
  target_complete_intelligible_utterances?: number;
  abandoned_or_interrupted?: number;
  approx_TNW?: number;
  approx_NDW?: number;
  approx_MLU_w?: number;
  approx_MLU_m?: number;
  approx_TTR?: number;
  maze_count?: number;
  maze_words?: number;
  approx_maze_pct_words?: number;
  unintelligible_word_tokens?: number;
  approx_unintelligible_pct_words?: number;
  omitted_words?: number;
  omitted_bound_morphemes?: number;
  error_code_counts?: Record<string, number>;
  approx_SI_mean?: number | null;
  other_speakers_utterances?: number;
  [key: string]: unknown;
}

export interface LsaReportResponse {
  latex: string;
  analysis: {
    domains: LsaDomain[];
    limitations: string[];
    summary: string;
    reference_concerns: string[];
  };
  metrics_table: LsaMetricRow[];
  derived_counts: LsaDerivedCounts;
  warnings: string[];
  llm: { provider?: string; model?: string; usage?: Record<string, number> };
  pdf_base64?: string | null;
}

export async function generateLsaReport(req: LsaReportRequest): Promise<LsaReportResponse> {
  const { data, error } = await supabase.functions.invoke('lsa-report', { body: req });

  if (error) {
    // The proxy answers a failed upstream call with a real status code, so supabase-js
    // reports it as an error and keeps the body in `context`; that body carries the
    // service's own explanation (which field was rejected, whether a retry helps).
    let message = error.message || 'Report generation failed.';
    const ctx = (error as { context?: unknown }).context as Response | undefined;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json();
        message = body?.detail || body?.error || message;
      } catch { /* body already read or not JSON — keep the transport message */ }
    }
    throw new Error(message);
  }

  const payload = data as (LsaReportResponse & { error?: string }) | null;
  if (!payload) throw new Error('Report generation returned no data.');
  if (payload.error) throw new Error(payload.error);
  if (!payload.analysis) throw new Error('Report generation returned an unexpected response.');
  return payload;
}

// --- persistence -----------------------------------------------------------
// A generated report is kept on the recording it describes, so reopening it costs
// nothing: the same transcript would otherwise spend another ~20 s and another LLM
// call producing the same document. One report per recording — regenerating replaces it.

/** What is stored in `recordings.lsa_report`. */
export interface StoredLsaReport {
  generated_at: string;
  sample: {
    age: string;
    task: string;
    speaker: string;
    speaker_code: string;
    language: string;
  };
  /** The SALT lines that were analysed, exactly as sent. */
  transcript_lines: string[];
  /** Fingerprint of those lines: lets the UI say a report is stale after an edit. */
  transcript_hash: string;
  /** The service's response minus `latex` — the app renders its own HTML. */
  response: Omit<LsaReportResponse, 'latex' | 'pdf_base64'>;
}

/** Stable, order-sensitive fingerprint of the analysed transcript (FNV-1a, 32-bit). */
export function transcriptFingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Postgres/PostgREST for "that column does not exist" — the migration has not been run. */
const isMissingColumn = (e: { code?: string; message?: string } | null) =>
  e?.code === '42703' || e?.code === 'PGRST204' || /lsa_report/.test(e?.message || '');

export class LsaReportNotStoredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LsaReportNotStoredError';
  }
}

export async function loadStoredLsaReport(recordingId: string): Promise<StoredLsaReport | null> {
  const { data, error } = await supabase
    .from('recordings')
    .select('lsa_report')
    .eq('id', recordingId)
    .single();

  if (error) {
    // A recording without the column (migration pending) or without a row is simply a
    // recording with no saved report — never a reason to block generating a new one.
    if (isMissingColumn(error)) return null;
    console.warn('Could not load the saved SATE report:', error.message);
    return null;
  }
  const stored = (data as { lsa_report?: StoredLsaReport | null } | null)?.lsa_report;
  return stored && stored.response ? stored : null;
}

export async function saveStoredLsaReport(recordingId: string, report: StoredLsaReport): Promise<void> {
  const { error } = await supabase
    .from('recordings')
    .update({ lsa_report: report })
    .eq('id', recordingId);

  if (error) {
    if (isMissingColumn(error)) {
      throw new LsaReportNotStoredError(
        'The recordings table has no lsa_report column yet, so this report was not saved. '
        + 'Run the 20260914_recordings_lsa_report migration.',
      );
    }
    throw new LsaReportNotStoredError(error.message);
  }
}

export async function clearStoredLsaReport(recordingId: string): Promise<void> {
  const { error } = await supabase
    .from('recordings')
    .update({ lsa_report: null })
    .eq('id', recordingId);
  if (error && !isMissingColumn(error)) throw new LsaReportNotStoredError(error.message);
}
