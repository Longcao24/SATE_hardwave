// SOAP Note contract — the request/response shapes of the `sate-soap` Worker.
//
// 🛑 TWO IDENTICAL COPIES: `soap/src/types.ts` (the Worker) and
// `react_app_sate-ui_update/src/services/soapTypes.ts` (the web app). The Worker's test suite
// compares them byte for byte, so a field added on one side and not the other fails `npm test`
// instead of becoming a blank box in the popup. Edit one, copy it over the other.
//
// Pure TypeScript with no imports, so both builds (workers-types / Vite DOM) accept it as is.

/** One transcript line as the report view shows it (EDITED segments, not the stored original). */
export interface SoapSegment {
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
  /** The on-screen label: "Adult", "Child", "Child_2"… Optional — older takes have none. */
  speaker?: string;
  text: string;
}

/** One row of clinician-entered performance data: what was targeted and how it went. */
export interface SoapPerformanceRow {
  target: string;
  /** Correct responses. Both counts or neither: an accuracy % is only ever computed from both. */
  correct?: number | null;
  /** Total opportunities. */
  total?: number | null;
  /** Cueing level as the clinician recorded it ("independent", "min verbal", …). */
  cueing?: string;
  notes?: string;
}

/** One SATE-computed metric (calculateSpeechAnalysis) — automated, not clinician-verified. */
export interface SoapMetric {
  /** e.g. "MLU", "TNW", "NDW", "Speaking rate". */
  name: string;
  value: number;
  /** e.g. "morphemes", "words", "words per minute". */
  unit?: string;
  /** What the value was computed over, e.g. "Child speaker, 42 utterances". */
  scope?: string;
}

export interface SoapPatientMeta {
  /**
   * The patient's internal code / initials, ONLY if the clinician has one. NEVER the full name:
   * the note's "Patient ID" is this string or the literal "Patient". Capped at 24 characters.
   */
  label?: string;
  /** Free text as the clinician states it ("6;6", "6 years 6 months"). */
  age?: string;
  /** YYYY-MM-DD. Defaults (server-side) to the recording's created_at date. */
  session_date?: string;
  /** Session / audio length in seconds. Defaults to the recording's duration. */
  duration_seconds?: number;
  setting?: string;
}

/** Everything the clinician supplies. Every field but `transcript` is optional. */
export interface SoapInputs {
  transcript: SoapSegment[];
  patient?: SoapPatientMeta;
  /** Current therapy goals, as written in the plan of care. */
  goals?: string;
  /** Existing treatment plan / next-session plan, if documented. */
  treatment_plan?: string;
  /** Clinician observations / session notes (what the transcript cannot show). */
  observations?: string;
  /** What the caregiver or patient reported. */
  caregiver_report?: string;
  performance?: SoapPerformanceRow[];
  sate_metrics?: SoapMetric[];
  /** Feed earlier clinician-saved notes for the same patient to the model. Default true. */
  include_previous?: boolean;
}

/**
 * What the server KEEPS of the transcript a version was drafted from: a fingerprint, never the
 * text. The transcript is a child's speech; a copy in D1 would outlive the recording (deleting a
 * recording deletes its derived data — CLAUDE.md — and nothing here could follow it). The popup
 * only needs to know whether the on-screen transcript has changed since the draft, which this
 * answers; regenerating always sends the current transcript again.
 */
export interface SoapTranscriptFingerprint {
  /** soapTranscriptFingerprint(): FNV-1a over speaker + text (timing ignored). */
  fnv1a: string;
  segments: number;
}

/** SoapInputs as stored and returned: `transcript` is always [] — see SoapTranscriptFingerprint. */
export interface SoapStoredInputs extends SoapInputs {
  transcript_fingerprint?: SoapTranscriptFingerprint;
}

/** POST /v1/soap/:recording_id/generate (and /preview) body. */
export interface SoapGenerateRequest {
  inputs: SoapInputs;
}

export interface SoapSessionInformation {
  patient_id: string;
  date: string;
  duration: string;
  setting: string;
  therapy_goals: string;
}

/** The note, one field per section of the system prompt's OUTPUT FORMAT. Markdown bullets allowed. */
export interface SoapNote {
  session_information: SoapSessionInformation;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  /** Kept SEPARATE from the note (system prompt). Includes the server validator's findings. */
  documentation_gaps: string[];
}

export type SoapSection = 'subjective' | 'objective' | 'assessment' | 'plan';

/**
 * Clinician edits, stored BESIDE the draft — never over it — so every field can revert to what
 * the model actually wrote. A key that is absent (or equal to the draft) means "unchanged".
 *
 * A saved edits object, even `{}`, also means "a clinician saved this version": only such
 * versions are fed to later generations as previously documented notes. An unreviewed AI draft
 * is never presented to the model as documentation.
 */
export interface SoapEdits {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  session_information?: Partial<SoapSessionInformation>;
  documentation_gaps?: string[];
}

/** PUT /v1/soap/:recording_id/:version/edits body. */
export interface SoapEditsRequest {
  edits: SoapEdits;
}

/** An earlier note that was given to the model as context. */
export interface SoapPreviousRef {
  recording_id: string;
  version: number;
  /** The session date of that note (YYYY-MM-DD or "Not documented"). */
  date: string;
}

/** One stored generation. */
export interface SoapVersion {
  recording_id: string;
  version: number;
  created_at: string;
  model: string;
  /** The model's draft after server validation — NEVER modified by edits. */
  note: SoapNote;
  edits: SoapEdits | null;
  edited_at: string | null;
  /** The server validator's findings for this draft (also appended to note.documentation_gaps). */
  flags: string[];
  previous_notes: SoapPreviousRef[];
  /** The inputs it was drafted from, WITHOUT the transcript text (SoapStoredInputs). */
  inputs: SoapStoredInputs;
}

export interface SoapVersionSummary {
  version: number;
  created_at: string;
  model: string;
  edited_at: string | null;
  has_edits: boolean;
}

/** GET /v1/soap/:recording_id */
export interface SoapListResponse {
  latest: SoapVersion | null;
  /** Newest first. */
  versions: SoapVersionSummary[];
}

/** POST /v1/soap/:recording_id/preview — what WOULD be sent, without calling the model. */
export interface SoapPreviewResponse {
  user_message: string;
  previous_notes: SoapPreviousRef[];
  prompt_chars: number;
}

export type SoapErrorCode =
  | 'unauthorized' | 'not_found' | 'too_large' | 'rate_limited' | 'invalid_input'
  | 'model_failed' | 'bad_model_output' | 'server_error';

/** Every non-2xx body. */
export interface SoapError {
  error: string;
  code: SoapErrorCode;
  /** rate_limited only: seconds until another generation is allowed. */
  retry_after?: number;
}

/** Limits the Worker enforces; the UI can check them up front. */
export const SOAP_LIMITS = {
  maxBodyBytes: 1_500_000,
  maxSegments: 20_000,
  maxSegmentChars: 4_000,
  maxFieldChars: 8_000,
  maxPerformanceRows: 50,
  maxMetrics: 40,
  maxLabelChars: 24,
  /** Total characters of the model's user message (transcript included). */
  maxPromptChars: 320_000,
  generationsPerHour: 30,
} as const;

export const SOAP_DRAFT_BANNER =
  'AI-generated DRAFT — must be reviewed and approved by a licensed SLP; not a signed clinical note';

export const NOT_DOCUMENTED = 'Not documented';

/**
 * Speaker + text only, so a re-timed but otherwise identical transcript is not "changed". FNV-1a
 * (synchronous, same in the browser and the Worker) — a change detector, not a security hash.
 */
export function soapTranscriptFingerprint(t: SoapSegment[]): SoapTranscriptFingerprint {
  const text = JSON.stringify(t.map((s) => [s.speaker || '', s.text]));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return { fnv1a: h.toString(16).padStart(8, '0'), segments: t.length };
}

const SECTIONS: SoapSection[] = ['subjective', 'objective', 'assessment', 'plan'];
const INFO_KEYS: Array<keyof SoapSessionInformation> = ['patient_id', 'date', 'duration', 'setting', 'therapy_goals'];

/**
 * The note as the clinician sees it: draft with edits applied. `edited` lists the keys that
 * differ from the draft ("subjective", "session_information.setting", "documentation_gaps"), so
 * the UI can mark them and offer revert-to-draft per field.
 */
export function mergeSoapEdits(note: SoapNote, edits: SoapEdits | null | undefined): { note: SoapNote; edited: string[] } {
  const e = edits || {};
  const edited: string[] = [];
  const out: SoapNote = {
    ...note,
    session_information: { ...note.session_information },
    documentation_gaps: [...note.documentation_gaps],
  };
  for (const s of SECTIONS) {
    const v = e[s];
    if (typeof v === 'string' && v !== note[s]) { out[s] = v; edited.push(s); }
  }
  for (const k of INFO_KEYS) {
    const v = e.session_information?.[k];
    if (typeof v === 'string' && v !== note.session_information[k]) {
      out.session_information[k] = v;
      edited.push(`session_information.${k}`);
    }
  }
  const g = e.documentation_gaps;
  if (Array.isArray(g)
    && (g.length !== note.documentation_gaps.length || g.some((x, i) => x !== note.documentation_gaps[i]))) {
    out.documentation_gaps = [...g];
    edited.push('documentation_gaps');
  }
  return { note: out, edited };
}

/**
 * The note in the system prompt's OUTPUT FORMAT. `markdown: false` (Copy) drops the ** markers;
 * the draft banner is on by default so a pasted copy cannot lose the fact that it is a draft.
 * `gaps: false` leaves out Documentation Gaps — for a note handed on as EVIDENCE (previous
 * notes): its gap lines quote the very numbers the validator flagged as unverified, and passing
 * them on would launder a flagged value into "previously documented".
 */
export function soapToText(note: SoapNote, opts: { markdown?: boolean; banner?: boolean; gaps?: boolean } = {}): string {
  const md = opts.markdown ?? false;
  const h = (t: string) => (md ? `**${t}**` : t);
  const i = note.session_information;
  const gaps = note.documentation_gaps.length
    ? note.documentation_gaps.map((g) => `- ${g}`).join('\n')
    : '- None identified';
  return [
    ...((opts.banner ?? true) ? [SOAP_DRAFT_BANNER, ''] : []),
    h('Session Information'),
    `- Patient ID: ${i.patient_id}`,
    `- Date: ${i.date}`,
    `- Duration: ${i.duration}`,
    `- Setting: ${i.setting}`,
    `- Therapy Goals: ${i.therapy_goals}`,
    '',
    h('S — Subjective'), note.subjective, '',
    h('O — Objective'), note.objective, '',
    h('A — Assessment'), note.assessment, '',
    h('P — Plan'), note.plan,
    ...((opts.gaps ?? true) ? ['', h('Documentation Gaps / Clinician Review'), gaps] : []),
  ].join('\n');
}
