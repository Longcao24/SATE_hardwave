import React from 'react';
import {
  X, Sparkles, Loader2, AlertTriangle, Pencil, Undo2, Check, Copy, Printer,
  Plus, Trash2, ClipboardList, ShieldAlert, History, SlidersHorizontal,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { type Segment } from '@/services/dataService';
import { computeSampleMetrics } from '@/services/lsaMetricsService';
import {
  SoapApiError,
  generateSoap,
  loadSoap,
  loadSoapVersion,
  saveSoapEdits,
} from '@/services/soapService';
import {
  NOT_DOCUMENTED,
  SOAP_DRAFT_BANNER,
  SOAP_LIMITS,
  mergeSoapEdits,
  soapToText,
  soapTranscriptFingerprint,
  type SoapEdits,
  type SoapInputs,
  type SoapMetric,
  type SoapNote,
  type SoapPerformanceRow,
  type SoapSection,
  type SoapSegment,
  type SoapSessionInformation,
  type SoapVersion,
  type SoapVersionSummary,
} from '@/services/soapTypes';

// ---------------------------------------------------------------------------
// SOAP Note — an AI-drafted SOAP note for THIS recording, for a licensed SLP to review.
//
// The transcript cannot show most of what a SOAP note needs (goals, setting, what the caregiver
// said, trial counts, cueing), so the clinician adds that here, and the `sate-soap` Worker drafts
// the note under the operator's system prompt and then checks it server-side: a number in the
// note that is not in the inputs (or a valid correct/total calculation) is listed under
// Documentation Gaps, never silently kept or silently dropped.
//
// Three rules shape this file:
//  - The draft is never presented as a finished note. The DRAFT banner is on screen, in the copied
//    text and on the printout, because a pasted or printed note loses the popup around it.
//  - Edits are stored BESIDE the draft (same idea as the SATE Report's `edits`): which words are
//    the model's and which the clinician's stays answerable, and every section can be reverted.
//  - Nothing identifying is sent that the clinician did not type. The patient's name is never
//    read here; "Patient ID" is whatever code/initials the clinician enters, or "Patient".
// ---------------------------------------------------------------------------

interface SoapNotePopupProps {
  isOpen: boolean;
  onClose: () => void;
  recordingId?: string;
  /** The transcript AS SHOWN (edited segments) — the note must describe what is on screen. */
  transcriptData: Segment[];
  /** The audio's length in seconds, as the player measured it. */
  audioDuration?: number;
}

interface PerfRowDraft {
  target: string;
  correct: string;
  total: string;
  cueing: string;
  notes: string;
}

interface FormState {
  label: string;
  age: string;
  sessionDate: string;
  duration: string;           // m:ss or h:mm:ss, as typed
  setting: string;
  goals: string;
  treatmentPlan: string;
  observations: string;
  caregiverReport: string;
  performance: PerfRowDraft[];
  includeMetrics: boolean;
  metricsSpeaker: string;
  includePrevious: boolean;
}

const emptyRow = (): PerfRowDraft => ({ target: '', correct: '', total: '', cueing: '', notes: '' });

const emptyForm = (): FormState => ({
  label: '',
  age: '',
  sessionDate: '',
  duration: '',
  setting: '',
  goals: '',
  treatmentPlan: '',
  observations: '',
  caregiverReport: '',
  performance: [emptyRow()],
  includeMetrics: true,
  metricsSpeaker: '',
  includePrevious: true,
});

const SECTIONS: Array<{ key: SoapSection; title: string }> = [
  { key: 'subjective', title: 'S — Subjective' },
  { key: 'objective', title: 'O — Objective' },
  { key: 'assessment', title: 'A — Assessment' },
  { key: 'plan', title: 'P — Plan' },
];

const INFO_FIELDS: Array<{ key: keyof SoapSessionInformation; label: string }> = [
  { key: 'patient_id', label: 'Patient ID' },
  { key: 'date', label: 'Date' },
  { key: 'duration', label: 'Duration' },
  { key: 'setting', label: 'Setting' },
  { key: 'therapy_goals', label: 'Therapy Goals' },
];

// --- small helpers -----------------------------------------------------------

const fmtDuration = (sec: number): string => {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`;
};

/** "m:ss", "h:mm:ss", or a bare number of minutes. undefined = blank, NaN = unreadable. */
const parseDuration = (v: string): number | undefined => {
  const t = v.trim();
  if (!t) return undefined;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 60);
  const parts = t.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return NaN;
  const n = parts.map(Number);
  return n.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n[0] * 60 + n[1];
};

const localDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Age on the session date, in the words a clinician would write it. */
function ageOn(dob: string, onDate: string): string {
  const b = new Date(`${dob.slice(0, 10)}T00:00:00`);
  const d = onDate ? new Date(`${onDate}T00:00:00`) : new Date();
  if (Number.isNaN(b.getTime()) || Number.isNaN(d.getTime()) || d < b) return '';
  let months = (d.getFullYear() - b.getFullYear()) * 12 + (d.getMonth() - b.getMonth());
  if (d.getDate() < b.getDate()) months -= 1;
  const y = Math.floor(months / 12), m = months % 12;
  return `${y} year${y === 1 ? '' : 's'} ${m} month${m === 1 ? '' : 's'}`;
}

/** What the transcript view shows for a segment: its words, or its text when it has none. */
const segmentText = (s: Segment): string => {
  const words = (s.words || []).map((w) => w.word || '').filter(Boolean);
  return (words.length ? words.join(' ') : s.text || '').replace(/\s+/g, ' ').trim();
};

/**
 * The transcript sent to the Worker. Excluded utterances stay out, exactly as they stay out of
 * every SATE metric — a clinician excluded them for a reason, and the note must not quote them.
 */
const buildTranscript = (segments: Segment[]): SoapSegment[] =>
  (segments || [])
    .filter((s) => !s.excluded)
    .map((s) => ({
      start: Number(s.start) || 0,
      end: Number(s.end) || 0,
      ...(s.speaker ? { speaker: s.speaker } : {}),
      text: segmentText(s).slice(0, SOAP_LIMITS.maxSegmentChars),
    }))
    .filter((s) => s.text !== '');

/**
 * Has the on-screen transcript changed since this version was drafted? The Worker keeps only a
 * fingerprint of the transcript (never the child's words), computed by the SAME shared function.
 * A version stored before that has the text itself, so it is fingerprinted here.
 */
const transcriptChanged = (v: SoapVersion, now: SoapSegment[]): boolean => {
  const then = v.inputs?.transcript_fingerprint ?? soapTranscriptFingerprint(v.inputs?.transcript || []);
  return then.fnv1a !== soapTranscriptFingerprint(now).fnv1a;
};

const isChildSpeaker = (s: string) => s.toLowerCase().startsWith('child');

const hasRealEdits = (v: SoapVersion | null) =>
  !!v?.edits && mergeSoapEdits(v.note, v.edits).edited.length > 0;

const errorText = (e: unknown): string => {
  if (e instanceof SoapApiError) {
    if (e.code === 'rate_limited') {
      const min = e.retryAfter ? Math.max(1, Math.ceil(e.retryAfter / 60)) : null;
      return `Generation limit reached (${SOAP_LIMITS.generationsPerHour} per hour).${min ? ` Try again in about ${min} minute${min === 1 ? '' : 's'}.` : ''}`;
    }
    if (e.code === 'not_found') return 'This recording could not be found for your account.';
    return e.message;
  }
  return (e as Error)?.message || String(e);
};

// --- markdown-lite rendering ---------------------------------------------------
// The model may write "- " bullets and **bold**; nothing else is interpreted. Rendered as React
// nodes on screen (no innerHTML of model output) and as escaped HTML for the printout.

type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] };

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of (text || '').split('\n')) {
    const line = raw.trimEnd();
    const bullet = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'ul') last.items.push(bullet[1]);
      else blocks.push({ kind: 'ul', items: [bullet[1]] });
    } else if (line.trim()) {
      blocks.push({ kind: 'p', text: line.trim() });
    }
  }
  return blocks;
}

const inline = (t: string): React.ReactNode[] =>
  t.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? <strong key={i}>{part.slice(2, -2)}</strong> : <React.Fragment key={i}>{part}</React.Fragment>);

const RichText: React.FC<{ text: string }> = ({ text }) => {
  const blocks = toBlocks(text);
  if (!blocks.length) return <p className="text-gray-400 italic">{NOT_DOCUMENTED}</p>;
  return (
    <>
      {blocks.map((b, i) => (b.kind === 'ul' ? (
        <ul key={i} className="list-disc pl-5 my-1 space-y-0.5">
          {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
        </ul>
      ) : <p key={i} className="my-1">{inline(b.text)}</p>))}
    </>
  );
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inlineHtml = (t: string) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const richHtml = (text: string) => {
  const blocks = toBlocks(text);
  if (!blocks.length) return `<p style="color:#64748b;font-style:italic;">${NOT_DOCUMENTED}</p>`;
  return blocks.map((b) => (b.kind === 'ul'
    ? `<ul style="margin:4px 0;padding-left:20px;">${b.items.map((it) => `<li>${inlineHtml(it)}</li>`).join('')}</ul>`
    : `<p style="margin:4px 0;">${inlineHtml(b.text)}</p>`)).join('');
};

// The Worker flags numbers ("Unverified value") and, since the eval, interpretations and cueing
// levels ("Unverified interpretation") — both are claims the SLP must check, so both are red.
const isUnverified = (g: string) => /^unverified (value|interpretation)/i.test(g.trim());

function printHtml(note: SoapNote): string {
  const i = note.session_information;
  const h = (t: string) =>
    `<h2 style="font-size:14px;color:#0c6b74;margin:18px 0 6px;padding-bottom:3px;border-bottom:1px solid #e3e7ec;">${esc(t)}</h2>`;
  const gaps = note.documentation_gaps.length
    ? `<ul style="margin:4px 0;padding-left:20px;">${note.documentation_gaps.map((g) =>
      `<li style="${isUnverified(g) ? 'color:#b91c1c;font-weight:600;' : ''}">${inlineHtml(g)}</li>`).join('')}</ul>`
    : '<p style="margin:4px 0;">None identified</p>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>SOAP Note — DRAFT</title>`
    + `<style>@page{size:A4;margin:18mm 16mm;} *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}`
    + `body{margin:0;padding:8mm;font-family:Georgia,'Times New Roman',serif;color:#16202e;font-size:12.5px;line-height:1.55;}</style></head><body>`
    + `<div style="border:2px solid #b45309;background:#fff7ed;color:#7c2d12;padding:8px 12px;border-radius:6px;font-weight:700;font-size:12px;">${esc(SOAP_DRAFT_BANNER)}</div>`
    + `<h1 style="font-size:20px;color:#0c6b74;margin:14px 0 4px;text-align:center;">SOAP Note</h1>`
    + h('Session Information')
    + `<ul style="margin:4px 0;padding-left:20px;">${INFO_FIELDS.map((f) => `<li><b>${esc(f.label)}:</b> ${inlineHtml(i[f.key] || NOT_DOCUMENTED)}</li>`).join('')}</ul>`
    + SECTIONS.map((s) => h(s.title) + richHtml(note[s.key])).join('')
    + `<div style="margin-top:22px;border:1px solid #f59e0b;background:#fffbeb;border-radius:6px;padding:4px 12px 8px;">`
    + `<h2 style="font-size:14px;color:#92400e;margin:8px 0 4px;">Documentation Gaps / Clinician Review</h2>${gaps}</div>`
    + `</body></html>`;
}

// --- form <-> inputs -----------------------------------------------------------

const toNum = (v: string): number | null => (v.trim() === '' ? null : Number(v));

function rowProblem(r: PerfRowDraft): string | null {
  const c = toNum(r.correct), t = toNum(r.total);
  if (c == null && t == null) return null;
  // An accuracy % is only ever computed from BOTH counts; one alone cannot be checked.
  if (c == null || t == null) return 'Enter both correct and total, or neither.';
  if (!Number.isInteger(c) || !Number.isInteger(t) || c < 0 || t <= 0) return 'Counts must be whole numbers, total above 0.';
  if (c > t) return 'Correct cannot exceed total.';
  return null;
}

function formFromInputs(inputs: SoapInputs, base: FormState): FormState {
  const p = inputs.patient || {};
  return {
    ...base,
    label: p.label ?? '',
    age: p.age ?? '',
    sessionDate: p.session_date ?? base.sessionDate,
    duration: p.duration_seconds != null ? fmtDuration(p.duration_seconds) : base.duration,
    setting: p.setting ?? '',
    goals: inputs.goals ?? '',
    treatmentPlan: inputs.treatment_plan ?? '',
    observations: inputs.observations ?? '',
    caregiverReport: inputs.caregiver_report ?? '',
    performance: (inputs.performance && inputs.performance.length)
      ? inputs.performance.map((r) => ({
        target: r.target || '',
        correct: r.correct != null ? String(r.correct) : '',
        total: r.total != null ? String(r.total) : '',
        cueing: r.cueing || '',
        notes: r.notes || '',
      }))
      : [emptyRow()],
    includeMetrics: !!(inputs.sate_metrics && inputs.sate_metrics.length),
    includePrevious: inputs.include_previous !== false,
  };
}

// --- component -----------------------------------------------------------------

export const SoapNotePopup: React.FC<SoapNotePopupProps> = ({
  isOpen, onClose, recordingId, transcriptData, audioDuration,
}) => {
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [showForm, setShowForm] = React.useState(true);
  const [loadingSaved, setLoadingSaved] = React.useState(false);
  const [current, setCurrent] = React.useState<SoapVersion | null>(null);
  const [versions, setVersions] = React.useState<SoapVersionSummary[]>([]);
  const [status, setStatus] = React.useState<'idle' | 'generating' | 'error'>('idle');
  const [error, setError] = React.useState('');
  const [loadError, setLoadError] = React.useState('');
  const [elapsed, setElapsed] = React.useState(0);
  const [confirmRegen, setConfirmRegen] = React.useState(false);
  const [editing, setEditing] = React.useState<null | SoapSection | 'session_information' | 'documentation_gaps'>(null);
  const [editText, setEditText] = React.useState('');
  const [editInfo, setEditInfo] = React.useState<SoapSessionInformation | null>(null);
  const [savingEdits, setSavingEdits] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');
  const [confirmClose, setConfirmClose] = React.useState(false);
  const [flash, setFlash] = React.useState('');
  const [switchingVersion, setSwitchingVersion] = React.useState(false);

  const transcript = React.useMemo(() => buildTranscript(transcriptData), [transcriptData]);

  const speakers = React.useMemo(() => {
    const seen: string[] = [];
    for (const s of transcriptData || []) {
      if (s.excluded) continue;
      const name = s.speaker || 'Unknown';
      if (!seen.includes(name)) seen.push(name);
    }
    return seen;
  }, [transcriptData]);

  // Default the metrics speaker to the child, like the SATE Report's target speaker.
  React.useEffect(() => {
    if (form.metricsSpeaker && speakers.includes(form.metricsSpeaker)) return;
    const pick = speakers.find(isChildSpeaker) || speakers[0] || '';
    if (pick !== form.metricsSpeaker) setForm((f) => ({ ...f, metricsSpeaker: pick }));
  }, [speakers, form.metricsSpeaker]);

  // SATE metrics through the app's canonical calculateSpeechAnalysis (via computeSampleMetrics),
  // so the note cannot print an MLU that disagrees with the Analysis tab for this recording.
  const metrics = React.useMemo<SoapMetric[]>(() => {
    const speaker = form.metricsSpeaker;
    if (!speaker) return [];
    const tnu = (transcriptData || []).filter((s) => !s.excluded && (s.speaker || 'Unknown') === speaker).length;
    if (tnu === 0) return [];
    const m = computeSampleMetrics(transcriptData || [], speaker);
    const scope = `${speaker} speaker, ${tnu} utterance${tnu === 1 ? '' : 's'}; automated SATE analysis, not clinician-verified`;
    const r2 = (v: number) => Number(v.toFixed(2));
    return [
      { name: 'TNU', value: tnu, unit: 'utterances', scope },
      { name: 'TNW', value: Math.round(m.ntw), unit: 'words (mazes excluded)', scope },
      { name: 'NDW', value: Math.round(m.ndw), unit: 'different words', scope },
      { name: 'MLU', value: r2(m.mlum), unit: 'morphemes', scope },
      { name: 'MLU', value: r2(m.mluw), unit: 'words', scope },
    ];
  }, [transcriptData, form.metricsSpeaker]);

  // --- open: load the saved note, and prefill what the app already knows ----------------
  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setCurrent(null);
    setVersions([]);
    setStatus('idle');
    setError('');
    setLoadError('');
    setSaveError('');
    setConfirmRegen(false);
    setConfirmClose(false);
    setEditing(null);
    setShowForm(true);

    // Duration: the loaded audio > recordings.duration (applied in the prefill below) > the
    // transcript's last timestamp. The last one is only a floor — trailing silence is not
    // transcribed — so it must never win over a stored length; it also bounds the Worker's
    // timestamp check, where too short a value flags real timestamps as outside the recording.
    const haveAudio = !!(audioDuration && audioDuration > 0);
    const fallbackSec = haveAudio
      ? audioDuration!
      : Math.max(0, ...(transcriptData || []).map((s) => Number(s.end) || 0));
    const base: FormState = { ...emptyForm(), duration: fmtDuration(fallbackSec) };
    setForm(base);
    if (!recordingId) return;

    // What the app knows: the session date, the length, the patient's age and active goals.
    // Only date_of_birth is read from the patient record — never the name.
    const prefill = (async (): Promise<FormState> => {
      const next = { ...base };
      const { data: rec } = await supabase
        .from('recordings').select('patient_id, created_at, duration').eq('id', recordingId).maybeSingle();
      const row = rec as { patient_id?: string | null; created_at?: string; duration?: number | null } | null;
      if (row?.created_at) next.sessionDate = localDate(row.created_at);
      if (!haveAudio && row?.duration && row.duration > 0) next.duration = fmtDuration(row.duration);
      const pid = row?.patient_id;
      if (pid && /^[0-9a-f-]{36}$/i.test(pid)) {
        const [{ data: pat }, { data: goals }] = await Promise.all([
          supabase.from('patients').select('date_of_birth').eq('id', pid).maybeSingle(),
          supabase.from('patient_goals').select('goal_category, goal_description, status').eq('patient_id', pid),
        ]);
        const dob = (pat as { date_of_birth?: string | null } | null)?.date_of_birth;
        if (dob) next.age = ageOn(dob, next.sessionDate);
        const active = ((goals as Array<{ goal_category?: string; goal_description?: string; status?: string }> | null) || [])
          .filter((g) => g.status === 'active' && g.goal_description?.trim());
        if (active.length) {
          next.goals = active.map((g) => `- ${g.goal_category ? `[${g.goal_category}] ` : ''}${g.goal_description!.trim()}`).join('\n');
        }
      }
      return next;
    })().catch(() => base);

    setLoadingSaved(true);
    Promise.all([prefill, loadSoap(recordingId).then((r) => ({ ok: true as const, r }), (e) => ({ ok: false as const, e }))])
      .then(([pre, saved]) => {
        if (cancelled) return;
        if (!saved.ok) {
          setForm(pre);
          setLoadError(errorText(saved.e));
          return;
        }
        setVersions(saved.r.versions || []);
        if (saved.r.latest) {
          // The inputs the latest note was actually built from win over the prefill: they are
          // what the clinician entered and what the draft describes.
          setCurrent(saved.r.latest);
          setForm(formFromInputs(saved.r.latest.inputs, pre));
          setShowForm(false);
        } else {
          setForm(pre);
        }
      })
      .finally(() => { if (!cancelled) setLoadingSaved(false); });

    return () => { cancelled = true; };
    // transcriptData / audioDuration only seed the prefill on open; re-running on every
    // transcript edit would reset what the clinician has typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, recordingId]);

  // A live counter: one model call takes ~10-40 s.
  React.useEffect(() => {
    if (status !== 'generating') return;
    const started = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [status]);

  React.useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(''), 2500);
    return () => window.clearTimeout(id);
  }, [flash]);

  // --- inputs ---------------------------------------------------------------------------

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setRow = (i: number, patch: Partial<PerfRowDraft>) =>
    setForm((f) => ({ ...f, performance: f.performance.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  const durationSec = parseDuration(form.duration);
  const durationBad = durationSec !== undefined && !Number.isFinite(durationSec);
  const rowProblems = form.performance.map(rowProblem);
  const fieldTooLong = [form.goals, form.treatmentPlan, form.observations, form.caregiverReport, form.setting, form.age]
    .some((v) => v.length > SOAP_LIMITS.maxFieldChars);

  const buildInputs = (): SoapInputs => {
    const performance: SoapPerformanceRow[] = form.performance
      .filter((r) => r.target.trim() || r.correct.trim() || r.total.trim() || r.cueing.trim() || r.notes.trim())
      .map((r) => ({
        target: r.target.trim() || NOT_DOCUMENTED,
        correct: toNum(r.correct),
        total: toNum(r.total),
        ...(r.cueing.trim() ? { cueing: r.cueing.trim() } : {}),
        ...(r.notes.trim() ? { notes: r.notes.trim() } : {}),
      }));
    const text = (v: string) => (v.trim() ? v.trim() : undefined);
    return {
      transcript,
      patient: {
        ...(form.label.trim() ? { label: form.label.trim().slice(0, SOAP_LIMITS.maxLabelChars) } : {}),
        ...(text(form.age) ? { age: text(form.age) } : {}),
        ...(form.sessionDate ? { session_date: form.sessionDate } : {}),
        ...(durationSec !== undefined && Number.isFinite(durationSec) ? { duration_seconds: durationSec } : {}),
        ...(text(form.setting) ? { setting: text(form.setting) } : {}),
      },
      goals: text(form.goals),
      treatment_plan: text(form.treatmentPlan),
      observations: text(form.observations),
      caregiver_report: text(form.caregiverReport),
      performance: performance.length ? performance : undefined,
      sate_metrics: form.includeMetrics && metrics.length ? metrics : undefined,
      include_previous: form.includePrevious,
    };
  };

  const blockReason = (() => {
    if (!recordingId) return 'Save this recording first.';
    if (transcript.length === 0) return 'This recording has no transcript to document.';
    if (transcript.length > SOAP_LIMITS.maxSegments) return `The transcript has more than ${SOAP_LIMITS.maxSegments} utterances.`;
    if (durationBad) return 'Duration must be m:ss, h:mm:ss or a number of minutes.';
    if (rowProblems.some(Boolean)) return 'Fix the performance data first.';
    if (fieldTooLong) return `A text field is longer than ${SOAP_LIMITS.maxFieldChars.toLocaleString()} characters.`;
    return '';
  })();

  // --- generate --------------------------------------------------------------------------

  const generate = async () => {
    if (!recordingId || blockReason || status === 'generating') return;
    setConfirmRegen(false);
    const inputs = buildInputs();
    // Checked up front so an oversized take fails here, with a reason, rather than as a 413.
    const bytes = new TextEncoder().encode(JSON.stringify({ inputs })).length;
    if (bytes > SOAP_LIMITS.maxBodyBytes) {
      setError(`This transcript is too large to send in one request (${(bytes / 1e6).toFixed(1)} MB; limit ${(SOAP_LIMITS.maxBodyBytes / 1e6).toFixed(1)} MB).`);
      setStatus('error');
      return;
    }
    setStatus('generating');
    setError('');
    setSaveError('');
    setEditing(null);
    try {
      const v = await generateSoap(recordingId, inputs);
      setCurrent(v);
      setVersions((list) => [
        { version: v.version, created_at: v.created_at, model: v.model, edited_at: null, has_edits: false },
        ...list.filter((x) => x.version !== v.version),
      ]);
      setShowForm(false);
      setStatus('idle');
    } catch (e) {
      setError(errorText(e));
      setStatus('error');
    }
  };

  const requestGenerate = () => {
    // A new version never overwrites the edited one (it stays in the history), but the screen
    // moves to the fresh draft — so ask before a reviewed note disappears from view.
    if (hasRealEdits(current) && !confirmRegen) { setConfirmRegen(true); return; }
    generate();
  };

  // --- review / edits ----------------------------------------------------------------------

  const merged = React.useMemo(() => (current ? mergeSoapEdits(current.note, current.edits) : null), [current]);
  const isEdited = (key: string) => !!merged?.edited.some((k) => k === key || k.startsWith(`${key}.`));

  const startEdit = (key: NonNullable<typeof editing>) => {
    if (!merged) return;
    setSaveError('');
    setEditing(key);
    if (key === 'session_information') setEditInfo({ ...merged.note.session_information });
    else if (key === 'documentation_gaps') setEditText(merged.note.documentation_gaps.join('\n'));
    else setEditText(merged.note[key]);
  };

  const editDirty = (() => {
    if (!editing || !merged) return false;
    if (editing === 'session_information') return JSON.stringify(editInfo) !== JSON.stringify(merged.note.session_information);
    if (editing === 'documentation_gaps') return editText !== merged.note.documentation_gaps.join('\n');
    return editText !== merged.note[editing];
  })();

  /** Persist a complete edits object for the version on screen. */
  const persistEdits = async (edits: SoapEdits, done: string) => {
    if (!current || !recordingId) return;
    setSavingEdits(true);
    setSaveError('');
    try {
      const saved = await saveSoapEdits(recordingId, current.version, edits);
      setCurrent(saved);
      setVersions((list) => list.map((x) => (x.version === saved.version
        ? { ...x, edited_at: saved.edited_at, has_edits: !!saved.edits }
        : x)));
      setEditing(null);
      setEditInfo(null);
      setFlash(done);
    } catch (e) {
      // The text stays in the editor: a failed save must never cost the clinician what they typed.
      setSaveError(`Not saved: ${errorText(e)}`);
    } finally {
      setSavingEdits(false);
    }
  };

  /** The edits object with one field set (or dropped, when it equals the model's draft). */
  const withField = (key: NonNullable<typeof editing>, revert: boolean): SoapEdits | null => {
    if (!current) return null;
    const draft = current.note;
    const next: SoapEdits = { ...(current.edits || {}) };
    if (key === 'session_information') {
      const info: Partial<SoapSessionInformation> = {};
      if (!revert && editInfo) {
        for (const f of INFO_FIELDS) {
          const v = editInfo[f.key].trim() || NOT_DOCUMENTED;
          if (v !== draft.session_information[f.key]) info[f.key] = v;
        }
      }
      if (Object.keys(info).length) next.session_information = info; else delete next.session_information;
    } else if (key === 'documentation_gaps') {
      const gaps = revert ? null : editText.split('\n').map((g) => g.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
      const same = gaps == null
        || (gaps.length === draft.documentation_gaps.length && gaps.every((g, i) => g === draft.documentation_gaps[i]));
      if (same) delete next.documentation_gaps; else next.documentation_gaps = gaps!;
    } else {
      // An emptied section reads "Not documented", never blank — same rule as the draft.
      const v = revert ? draft[key] : (editText.trim() || NOT_DOCUMENTED);
      if (v === draft[key]) delete next[key]; else next[key] = v;
    }
    return next;
  };

  const saveEdit = () => { if (editing) { const e = withField(editing, false); if (e) persistEdits(e, 'Saved'); } };
  const revertField = (key: NonNullable<typeof editing>) => {
    const e = withField(key, true);
    if (e) persistEdits(e, 'Reverted to draft');
  };

  // Saving an edits object — even an empty one — is what marks a version as clinician-reviewed,
  // and only reviewed versions are handed to later generations as previously documented notes.
  const markReviewed = () => persistEdits({ ...(current?.edits || {}) }, 'Saved as reviewed');

  const switchVersion = async (version: number) => {
    if (!recordingId || version === current?.version) return;
    setSwitchingVersion(true);
    setEditing(null);
    setConfirmRegen(false);
    try {
      setCurrent(await loadSoapVersion(recordingId, version));
      setLoadError('');
    } catch (e) {
      setLoadError(`Could not open version ${version}: ${errorText(e)}`);
    } finally {
      setSwitchingVersion(false);
    }
  };

  // --- copy / print ------------------------------------------------------------------------

  const copyNote = async () => {
    if (!merged) return;
    try {
      await navigator.clipboard.writeText(soapToText(merged.note, { markdown: false, banner: true }));
      setFlash('Copied');
    } catch {
      setSaveError('The browser blocked clipboard access. Use Print instead, or allow clipboard access.');
    }
  };

  const printNote = () => {
    if (!merged) return;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow!.document;
    doc.open();
    doc.write(printHtml(merged.note));
    doc.close();
    iframe.onload = () => {
      iframe.contentWindow!.focus();
      iframe.contentWindow!.print();
      window.setTimeout(() => document.body.removeChild(iframe), 1500);
    };
  };

  const requestClose = () => {
    if (editing && editDirty) { setConfirmClose(true); return; }
    onClose();
  };

  if (!isOpen) return null;

  const isStale = current != null && transcriptChanged(current, transcript);
  const latestVersion = versions[0]?.version;
  const generating = status === 'generating';
  const unverifiedCount = merged ? merged.note.documentation_gaps.filter(isUnverified).length : 0;

  const inputCls = 'w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:outline-none';
  const label = (t: string, hint?: string) => (
    <span className="text-xs font-medium text-gray-600">{t}{hint && <span className="font-normal text-gray-400"> · {hint}</span>}</span>
  );

  const sectionTools = (key: NonNullable<typeof editing>) => (
    editing === key ? null : (
      <div className="flex items-center gap-1 print:hidden">
        {isEdited(key) && (
          <>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-800 bg-teal-50 rounded">edited</span>
            <button onClick={() => revertField(key)} disabled={savingEdits || !!editing}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 rounded hover:bg-gray-100 disabled:opacity-40"
              title="Put back what the model drafted for this section">
              <Undo2 className="w-3.5 h-3.5" /> Revert to draft
            </button>
          </>
        )}
        <button onClick={() => startEdit(key)} disabled={savingEdits || !!editing}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-teal-700 rounded hover:bg-teal-50 disabled:opacity-40">
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
      </div>
    )
  );

  const editBar = (
    <div className="flex items-center justify-end gap-2 mt-2">
      {saveError && <span className="mr-auto text-xs text-red-700">{saveError}</span>}
      <button onClick={() => { setEditing(null); setEditInfo(null); setSaveError(''); }} disabled={savingEdits}
        className="px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
        Cancel
      </button>
      <button onClick={saveEdit} disabled={savingEdits || !editDirty}
        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:bg-gray-300">
        {savingEdits ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
      </button>
    </div>
  );

  return (
    <div data-usage-mask className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={requestClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-gray-200">
          <div className="flex items-baseline gap-2 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">SOAP Note</h2>
            {current && (
              <span className="text-xs text-gray-500 truncate" title={current.created_at}>
                v{current.version}{latestVersion && current.version !== latestVersion ? ` of ${latestVersion}` : ''}
                {' · '}drafted {new Date(current.created_at).toLocaleString()}
                {current.edited_at && ` · reviewed ${new Date(current.edited_at).toLocaleDateString()}`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {flash && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-700" role="status">
                <Check className="w-4 h-4" /> {flash}
              </span>
            )}
            {versions.length > 1 && (
              <label className="inline-flex items-center gap-1 text-xs text-gray-600" title="Version history">
                <History className="w-4 h-4" />
                <select value={current?.version ?? ''} disabled={switchingVersion || generating}
                  onChange={(e) => switchVersion(Number(e.target.value))}
                  className="px-1.5 py-1 text-xs border border-gray-300 rounded-md bg-white">
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      v{v.version} · {new Date(v.created_at).toLocaleDateString()}{v.has_edits ? ' · reviewed' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {current && !showForm && (
              <button onClick={() => setShowForm(true)} disabled={generating}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                title="Change the session information and regenerate">
                <SlidersHorizontal className="w-4 h-4" /> Inputs
              </button>
            )}
            <button onClick={copyNote} disabled={!merged || !!editing}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed">
              <Copy className="w-4 h-4" /> Copy
            </button>
            <button onClick={printNote} disabled={!merged || !!editing}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:bg-gray-300 disabled:cursor-not-allowed">
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={requestClose} className="p-1.5 text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {confirmClose && (
          <div className="flex items-center justify-between gap-3 px-5 py-2 text-sm text-amber-900 bg-amber-50 border-b border-amber-200">
            <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Discard the unsaved section edit?</span>
            <div className="flex gap-2">
              <button onClick={() => setConfirmClose(false)} className="px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md">Keep editing</button>
              <button onClick={() => { setConfirmClose(false); setEditing(null); onClose(); }} className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded-md">Discard</button>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gray-100">
          {/* ---- inputs ---- */}
          {showForm && (
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-200 space-y-3">
              <p className="text-xs text-gray-600">
                Add what the transcript cannot show. Leave anything you do not have blank — the note will
                say <b>Not documented</b> rather than guess. Prefilled values come from this recording and
                the patient record; check them.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <label className="flex flex-col gap-1">
                  {label('Patient ID', 'code or initials')}
                  <input value={form.label} maxLength={SOAP_LIMITS.maxLabelChars} placeholder="Patient"
                    onChange={(e) => set('label', e.target.value)} className={inputCls}
                    title="An internal code or initials — never the patient's full name. Blank prints “Patient”." />
                </label>
                <label className="flex flex-col gap-1">
                  {label('Age')}
                  <input value={form.age} placeholder="6 years 6 months" onChange={(e) => set('age', e.target.value)} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1">
                  {label('Session date')}
                  <input type="date" value={form.sessionDate} onChange={(e) => set('sessionDate', e.target.value)} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1">
                  {label('Duration', 'm:ss')}
                  <input value={form.duration} placeholder="30:00" onChange={(e) => set('duration', e.target.value)}
                    className={`${inputCls} ${durationBad ? 'border-red-400' : ''}`} />
                </label>
                <label className="flex flex-col gap-1">
                  {label('Setting')}
                  <input value={form.setting} placeholder="Outpatient clinic, individual" onChange={(e) => set('setting', e.target.value)} className={inputCls} />
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  {label('Therapy goals', 'as written in the plan of care')}
                  <textarea rows={3} value={form.goals} onChange={(e) => set('goals', e.target.value)} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1">
                  {label('Existing treatment plan', 'next steps already documented')}
                  <textarea rows={3} value={form.treatmentPlan} onChange={(e) => set('treatmentPlan', e.target.value)} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1">
                  {label('Clinician observations')}
                  <textarea rows={3} value={form.observations} onChange={(e) => set('observations', e.target.value)} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1">
                  {label('Caregiver / patient report')}
                  <textarea rows={3} value={form.caregiverReport} onChange={(e) => set('caregiverReport', e.target.value)} className={inputCls} />
                </label>
              </div>

              {/* Performance data — the only source an accuracy % may come from. */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  {label('Performance data', 'accuracy is calculated only from correct / total')}
                  <button onClick={() => set('performance', [...form.performance, emptyRow()])}
                    disabled={form.performance.length >= SOAP_LIMITS.maxPerformanceRows}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-teal-700 rounded hover:bg-teal-50 disabled:opacity-40">
                    <Plus className="w-3.5 h-3.5" /> Add row
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
                        <th className="py-1 pr-2 font-medium">Target</th>
                        <th className="py-1 pr-2 font-medium w-20">Correct</th>
                        <th className="py-1 pr-2 font-medium w-20">Total</th>
                        <th className="py-1 pr-2 font-medium w-16 text-right">%</th>
                        <th className="py-1 pr-2 font-medium w-40">Cueing</th>
                        <th className="py-1 pr-2 font-medium">Notes</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {form.performance.map((r, i) => {
                        const c = toNum(r.correct), t = toNum(r.total);
                        const pct = !rowProblems[i] && c != null && t != null ? `${((c / t) * 100).toFixed(1)}%` : '—';
                        return (
                          <React.Fragment key={i}>
                            <tr>
                              <td className="py-1 pr-2"><input value={r.target} placeholder="/s/ initial position, words" onChange={(e) => setRow(i, { target: e.target.value })} className={inputCls} /></td>
                              <td className="py-1 pr-2"><input value={r.correct} inputMode="numeric" onChange={(e) => setRow(i, { correct: e.target.value.replace(/\D/g, '').slice(0, 5) })} className={`${inputCls} text-right`} /></td>
                              <td className="py-1 pr-2"><input value={r.total} inputMode="numeric" onChange={(e) => setRow(i, { total: e.target.value.replace(/\D/g, '').slice(0, 5) })} className={`${inputCls} text-right`} /></td>
                              <td className="py-1 pr-2 text-right tabular-nums text-gray-600">{pct}</td>
                              <td className="py-1 pr-2"><input value={r.cueing} placeholder="min. verbal cues" onChange={(e) => setRow(i, { cueing: e.target.value })} className={inputCls} /></td>
                              <td className="py-1 pr-2"><input value={r.notes} onChange={(e) => setRow(i, { notes: e.target.value })} className={inputCls} /></td>
                              <td className="py-1">
                                <button aria-label="Remove row" onClick={() => set('performance', form.performance.length > 1 ? form.performance.filter((_, j) => j !== i) : [emptyRow()])}
                                  className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                              </td>
                            </tr>
                            {rowProblems[i] && (
                              <tr><td colSpan={7} className="pb-1 text-xs text-red-700">{rowProblems[i]}</td></tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.includeMetrics} onChange={(e) => set('includeMetrics', e.target.checked)}
                    className="w-4 h-4 text-teal-700 border-gray-300 rounded focus:ring-teal-500" />
                  Include SATE metrics for
                  <select value={form.metricsSpeaker} onChange={(e) => set('metricsSpeaker', e.target.value)} disabled={!form.includeMetrics}
                    className="px-2 py-1 text-sm border border-gray-300 rounded-md bg-white">
                    {speakers.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                {form.includeMetrics && metrics.length > 0 && (
                  <span className="text-xs text-gray-500 tabular-nums">
                    {metrics.map((m) => `${m.name} ${m.value}${m.name === 'MLU' ? ` (${m.unit})` : ''}`).join(' · ')}
                  </span>
                )}
                <label className="inline-flex items-center gap-2 text-sm text-gray-700"
                  title="Up to 3 earlier SOAP notes for this patient that a clinician saved (not unreviewed drafts) are given to the model as previous-session data.">
                  <input type="checkbox" checked={form.includePrevious} onChange={(e) => set('includePrevious', e.target.checked)}
                    className="w-4 h-4 text-teal-700 border-gray-300 rounded focus:ring-teal-500" />
                  Use this patient's earlier reviewed notes
                </label>
                <div className="ml-auto flex items-center gap-2">
                  {current && (
                    <button onClick={() => setShowForm(false)} disabled={generating}
                      className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                      Hide
                    </button>
                  )}
                  <button onClick={requestGenerate} disabled={!!blockReason || generating || !!editing}
                    title={blockReason || 'Draft a SOAP note from this transcript and your inputs'}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:bg-gray-300 disabled:cursor-not-allowed">
                    {generating
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Drafting… {elapsed}s</>
                      : <><Sparkles className="w-4 h-4" /> {current ? 'Regenerate' : 'Generate draft'}</>}
                  </button>
                </div>
              </div>
              {blockReason && !generating && <p className="text-xs text-amber-800">{blockReason}</p>}
            </div>
          )}

          <div className="p-6 space-y-4">
            {confirmRegen && (
              <div className="mx-auto max-w-[760px] flex items-start gap-2 p-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-medium">This note has your edits</div>
                  <div className="text-amber-800 mb-2">
                    Regenerating drafts a new version from the model. Your edited version {current?.version} is kept in
                    the version history, but the new draft does not carry your edits over.
                  </div>
                  <div className="flex gap-2">
                    <button onClick={generate} className="px-3 py-1.5 text-xs font-medium text-white bg-amber-700 rounded-md hover:bg-amber-800">Regenerate anyway</button>
                    <button onClick={() => setConfirmRegen(false)} className="px-3 py-1.5 text-xs font-medium text-amber-900 bg-white border border-amber-300 rounded-md hover:bg-amber-100">Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="mx-auto max-w-[760px] flex items-start gap-2 p-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div><div className="font-medium">Could not draft the SOAP note</div><div className="text-red-700">{error}</div></div>
              </div>
            )}

            {loadError && (
              <div className="mx-auto max-w-[760px] flex items-start gap-2 p-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div><div className="font-medium">Saved notes could not be loaded</div><div className="text-amber-800">{loadError}</div></div>
              </div>
            )}

            {isStale && (
              <div className="mx-auto max-w-[760px] flex items-start gap-2 p-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium">The transcript changed after this note was drafted</div>
                  <div className="text-amber-800">It still describes the transcript it was built from. Regenerate to document the current one.</div>
                </div>
              </div>
            )}

            {merged && current ? (
              <div className="bg-white shadow-sm mx-auto p-8 min-w-0 text-[13px] leading-relaxed text-gray-900" style={{ maxWidth: 760, fontFamily: "Georgia,'Times New Roman',serif" }}>
                {/* Persistent: the draft status is part of the document, not a dismissable toast. */}
                <div role="note" className="flex items-start gap-2 p-3 mb-5 text-sm font-semibold text-orange-900 bg-orange-50 border-2 border-orange-300 rounded-lg" style={{ fontFamily: 'inherit' }}>
                  <ShieldAlert className="w-5 h-5 flex-shrink-0 text-orange-700" />
                  <span>{SOAP_DRAFT_BANNER}</span>
                </div>

                {/* Session Information */}
                <section className="mb-4">
                  <div className="flex items-center justify-between border-b border-gray-200 mb-1.5">
                    <h3 className="text-sm font-bold text-teal-800">Session Information</h3>
                    {sectionTools('session_information')}
                  </div>
                  {editing === 'session_information' && editInfo ? (
                    <div className="space-y-1.5" style={{ fontFamily: 'system-ui, sans-serif' }}>
                      {INFO_FIELDS.map((f) => (
                        <label key={f.key} className="grid grid-cols-[120px_1fr] items-start gap-2 text-sm">
                          <span className="pt-1.5 text-gray-600">{f.label}</span>
                          {f.key === 'therapy_goals'
                            ? <textarea rows={3} value={editInfo[f.key]} onChange={(e) => setEditInfo({ ...editInfo, [f.key]: e.target.value })} className={inputCls} />
                            : <input value={editInfo[f.key]} maxLength={f.key === 'patient_id' ? SOAP_LIMITS.maxLabelChars : undefined}
                                onChange={(e) => setEditInfo({ ...editInfo, [f.key]: e.target.value })} className={inputCls} />}
                        </label>
                      ))}
                      {editBar}
                    </div>
                  ) : (
                    <ul className="list-disc pl-5 space-y-0.5">
                      {INFO_FIELDS.map((f) => (
                        <li key={f.key}><b>{f.label}:</b> {inline(merged.note.session_information[f.key] || NOT_DOCUMENTED)}</li>
                      ))}
                    </ul>
                  )}
                </section>

                {SECTIONS.map((s) => (
                  <section key={s.key} className="mb-4">
                    <div className="flex items-center justify-between border-b border-gray-200 mb-1.5">
                      <h3 className="text-sm font-bold text-teal-800">{s.title}</h3>
                      {sectionTools(s.key)}
                    </div>
                    {editing === s.key ? (
                      <div style={{ fontFamily: 'system-ui, sans-serif' }}>
                        <textarea autoFocus rows={Math.min(16, Math.max(4, editText.split('\n').length + 1))} value={editText}
                          onChange={(e) => setEditText(e.target.value)} className={inputCls}
                          onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (editDirty && !savingEdits) saveEdit(); }
                            if (e.key === 'Escape') { e.preventDefault(); setEditing(null); }
                          }} />
                        <p className="mt-1 text-[11px] text-gray-500">“- ” starts a bullet; **text** is bold. ⌘/Ctrl+S saves, Esc cancels.</p>
                        {editBar}
                      </div>
                    ) : (
                      <RichText text={merged.note[s.key]} />
                    )}
                  </section>
                ))}

                {/* Kept SEPARATE from the SOAP note, as the system prompt requires. */}
                <section className="mt-6 p-4 border border-amber-300 bg-amber-50 rounded-lg">
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
                      <ClipboardList className="w-4 h-4" /> Documentation Gaps / Clinician Review
                      {unverifiedCount > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 bg-red-100 rounded" style={{ fontFamily: 'system-ui, sans-serif' }}>
                          {unverifiedCount} unverified item{unverifiedCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </h3>
                    {sectionTools('documentation_gaps')}
                  </div>
                  {editing === 'documentation_gaps' ? (
                    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
                      <textarea rows={Math.min(14, Math.max(4, editText.split('\n').length + 1))} value={editText}
                        onChange={(e) => setEditText(e.target.value)} className={inputCls} />
                      <p className="mt-1 text-[11px] text-gray-500">One item per line.</p>
                      {editBar}
                    </div>
                  ) : merged.note.documentation_gaps.length ? (
                    <ul className="list-disc pl-5 space-y-1 text-amber-950">
                      {merged.note.documentation_gaps.map((g, i) => (
                        <li key={i} className={isUnverified(g) ? 'text-red-800 font-semibold' : ''}>{inline(g)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-amber-900">None identified.</p>
                  )}
                  {unverifiedCount > 0 && (
                    <p className="mt-2 text-xs text-red-800" style={{ fontFamily: 'system-ui, sans-serif' }}>
                      An automatic check found numbers, cueing levels or interpretations in the note that do not
                      appear in your inputs or follow from your performance counts. Verify or remove each one before
                      using this note.
                    </p>
                  )}
                </section>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500" style={{ fontFamily: 'system-ui, sans-serif' }}>
                  <span>
                    {current.previous_notes?.length
                      ? `Context: earlier reviewed note${current.previous_notes.length === 1 ? '' : 's'} from ${current.previous_notes.map((p) => p.date).join(', ')}.`
                      : 'No earlier notes were used as context.'}
                    {merged.edited.length > 0 && ` ${merged.edited.length} field${merged.edited.length === 1 ? '' : 's'} edited by the clinician.`}
                  </span>
                  {current.edits == null && !editing && (
                    <button onClick={markReviewed} disabled={savingEdits}
                      className="inline-flex items-center gap-1 px-3 py-1.5 font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100"
                      title="Record that you reviewed this draft. Only reviewed notes are used as previous-session context for this patient's later notes. It is still a draft, not a signed note.">
                      <Check className="w-3.5 h-3.5" /> Save as reviewed
                    </button>
                  )}
                </div>
                {saveError && !editing && <p className="mt-2 text-xs text-red-700" style={{ fontFamily: 'system-ui, sans-serif' }}>{saveError}</p>}
              </div>
            ) : (
              <div className="bg-white shadow-sm mx-auto p-8 text-sm text-gray-600" style={{ maxWidth: 760 }}>
                {loadingSaved ? (
                  <p className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Looking for a saved SOAP note…</p>
                ) : generating ? (
                  <p className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Drafting the note and checking every number against your inputs… {elapsed}s (usually 10–40 s)
                  </p>
                ) : (
                  <>
                    <p className="mb-3">
                      The note is drafted from this recording's current transcript ({transcript.length} utterance
                      {transcript.length === 1 ? '' : 's'}) plus what you enter above. The model is instructed to use
                      only what is supplied: anything missing is marked <b>Not documented</b> and listed under
                      Documentation Gaps, and every number is checked against your inputs afterwards.
                    </p>
                    <p className="text-gray-500">
                      The result is a <b>draft</b> for a licensed SLP to review, edit and approve — never a signed
                      clinical note. It is saved with this recording, with a version history; your edits are kept
                      beside the draft so each section can be reverted.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
