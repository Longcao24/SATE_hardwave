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
import { trackAction } from './usage/tracker';

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

/** Usage analytics: one 'report:generate' per report produced, 'report:failed' otherwise. */
export async function generateLsaReport(req: LsaReportRequest): Promise<LsaReportResponse> {
  try {
    const r = await requestLsaReport(req);
    trackAction('report:generate');
    return r;
  } catch (e) {
    trackAction('report:failed');
    throw e;
  }
}

async function requestLsaReport(req: LsaReportRequest): Promise<LsaReportResponse> {
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

/** Where the reference values in a normative comparison came from. */
export interface LsaNormsContext {
  source: 'CHILDES';
  language: string;
  task: string;
  clinical: string;
  n_samples: number;
  n_corpora: number;
  age_window_months: [number, number] | null;
}

/**
 * The clinician's corrections to the AI-drafted prose, kept SEPARATELY from the
 * service's response rather than written over it. The report footer says the
 * observations were drafted by a language model and must be reviewed by an SLP, so
 * which sentences are the model's and which are the reviewer's has to stay answerable:
 * an edit that overwrote `response` would erase exactly that distinction, and would also
 * make "revert to the AI text" impossible. Only the fields a reviewer can legitimately
 * change are here — never a count, never a z-score, which are computed, not drafted.
 */
export interface LsaReportEdits {
  /** Keyed by the domain's index in `response.analysis.domains`. */
  domains?: Record<string, { observation?: string; status?: string }>;
  /** Present = replaces the whole rendered limitations list (which merges three sources). */
  limitations?: string[];
  summary?: string;
}

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
  /** The metrics sent with the request, if any — what produced `response.metrics_table`. */
  metrics?: Record<string, LsaMetricInput>;
  /** The reference group those metrics were compared against. */
  norms?: LsaNormsContext | null;
  /** The reviewing clinician's corrections, applied over `response` when rendering. */
  edits?: LsaReportEdits;
  edited_at?: string | null;
  /** [device-api v43] Set when someone other than the account owner generated it (a manager or admin,
   *  from oversight). Absent for a report the clinician made themselves. */
  generated_by?: { email: string | null; role: string; at: string };
  /** The service's response minus `latex` — the app renders its own HTML. */
  response: Omit<LsaReportResponse, 'latex' | 'pdf_base64'>;
}

// --- edits ------------------------------------------------------------------

/**
 * The limitations list as the report renders it: the service keeps limitations,
 * processing warnings and doubtful-reference notes in three arrays, and the report shows
 * them as one list. The editor and the renderer MUST derive it the same way, or saving
 * an untouched report would record the merge itself as an edit.
 */
export function baseLimitations(r: StoredLsaReport['response']): string[] {
  return [
    ...(r.analysis?.limitations || []),
    ...(r.warnings || []),
    ...(r.analysis?.reference_concerns || []),
  ];
}

export interface MergedLsaReport {
  domains: LsaDomain[];
  limitations: string[];
  summary: string;
  /** Which fields the reviewer changed — drives the "edited" marks and the footer. */
  editedDomains: Set<number>;
  limitationsEdited: boolean;
  summaryEdited: boolean;
  editedCount: number;
}

/** The report as it should be READ: the service's response with the reviewer's text on top. */
export function mergeEdits(stored: StoredLsaReport): MergedLsaReport {
  const r = stored.response;
  const e = stored.edits || {};
  const editedDomains = new Set<number>();

  const domains = (r.analysis?.domains || []).map((d, i) => {
    const patch = e.domains?.[String(i)];
    if (!patch) return d;
    const observation = patch.observation != null && patch.observation !== d.observation
      ? patch.observation : d.observation;
    const status = patch.status != null && patch.status !== d.status ? patch.status : d.status;
    if (observation !== d.observation || status !== d.status) editedDomains.add(i);
    return { ...d, observation, status };
  });

  const base = baseLimitations(r);
  const limitationsEdited = e.limitations != null
    && (e.limitations.length !== base.length || e.limitations.some((l, i) => l !== base[i]));
  const limitations = limitationsEdited ? e.limitations! : base;

  const baseSummary = r.analysis?.summary || '';
  const summaryEdited = e.summary != null && e.summary !== baseSummary;
  const summary = summaryEdited ? e.summary! : baseSummary;

  return {
    domains,
    limitations,
    summary,
    editedDomains,
    limitationsEdited,
    summaryEdited,
    editedCount: editedDomains.size + (limitationsEdited ? 1 : 0) + (summaryEdited ? 1 : 0),
  };
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
  return coerceStoredLsaReport((data as { lsa_report?: unknown } | null)?.lsa_report);
}

/**
 * `recordings.lsa_report` is written by the recording's owner (RLS) and read in other people's sessions
 * (Oversight), so it is untrusted input: anything not shaped like a report becomes null, and every field the
 * UI reads is forced to the type the UI expects — a wrong type used to throw during render and take the whole
 * page down (audit 2026-11-04 H1 follow-up). Values are only coerced here; escaping is the renderer's job.
 */
export function coerceStoredLsaReport(raw: unknown): StoredLsaReport | null {
  const obj = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
  const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => x != null).map(str) : []);
  const top = obj(raw);
  const response = obj(top?.response);
  const sample = obj(top?.sample);
  if (!top || !response || !sample) return null;
  const analysis = obj(response.analysis) || {};
  const domains = (Array.isArray(analysis.domains) ? analysis.domains : [])
    // A non-object entry becomes an empty domain rather than being dropped: edits are keyed by index.
    .map((v) => { const d = obj(v) || {}; return { ...d, domain: str(d.domain), observation: str(d.observation), status: str(d.status) }; });
  const counts = obj(response.derived_counts) || {};
  const edits = obj(top.edits);
  const editDomains = obj(edits?.domains);
  const norms = obj(top.norms);
  const by = obj(top.generated_by);
  return {
    ...(top as object),
    generated_at: str(top.generated_at),
    sample: {
      age: str(sample.age), task: str(sample.task), speaker: str(sample.speaker),
      speaker_code: str(sample.speaker_code), language: str(sample.language),
    },
    transcript_lines: strs(top.transcript_lines),
    transcript_hash: str(top.transcript_hash),
    norms: norms
      ? { ...norms, age_window_months: Array.isArray(norms.age_window_months) ? norms.age_window_months : undefined } as LsaNormsContext
      : null,
    edits: edits ? {
      domains: editDomains ? Object.fromEntries(Object.entries(editDomains).map(([k, v]) => {
        const d = obj(v) || {};
        return [k, {
          observation: d.observation == null ? undefined : str(d.observation),
          status: d.status == null ? undefined : str(d.status),
        }];
      })) : undefined,
      limitations: edits.limitations == null ? undefined : strs(edits.limitations),
      summary: edits.summary == null ? undefined : str(edits.summary),
    } : undefined,
    generated_by: by ? { email: by.email == null ? null : str(by.email), role: str(by.role), at: str(by.at) } : undefined,
    response: {
      ...(response as object),
      analysis: {
        ...analysis,
        domains: domains as unknown as LsaDomain[],
        limitations: strs(analysis.limitations),
        summary: str(analysis.summary),
        reference_concerns: strs(analysis.reference_concerns),
      },
      metrics_table: (Array.isArray(response.metrics_table) ? response.metrics_table : [])
        .map(obj).filter(Boolean) as unknown as LsaMetricRow[],
      derived_counts: { ...counts, error_code_counts: obj(counts.error_code_counts) || {} } as LsaDerivedCounts,
      warnings: strs(response.warnings),
    } as StoredLsaReport['response'],
  } as StoredLsaReport;
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
