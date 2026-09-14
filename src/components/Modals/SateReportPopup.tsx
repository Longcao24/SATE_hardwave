import React from 'react';
import { X, FileText, FileType, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { type Segment } from '@/services/dataService';
import { segmentsToSalt } from '@/services/saltService';
import {
  generateLsaReport,
  loadStoredLsaReport,
  saveStoredLsaReport,
  transcriptFingerprint,
  LsaReportNotStoredError,
  type StoredLsaReport,
  type LsaMetricRow,
  type LsaDerivedCounts,
} from '@/services/lsaReportService';

// ---------------------------------------------------------------------------
// SATE Report — a single-sample clinical report for THIS recording.
//
// The transcript on screen is converted to SALT and sent to the SATE LSA Report
// service, which parses the counts deterministically and runs one LLM call for the
// domain observations, limitations and summary. Everything rendered below comes from
// that response — there is no example/placeholder content left in this file.
//
// A generated report is saved on the recording, so reopening it shows the report that
// was already generated rather than spending another ~20 s and another LLM call on the
// same transcript. What is stored is exactly what is rendered — the sample information,
// the SALT lines that were analysed and the service's response — so a saved report and
// a fresh one are the same document. Editing the transcript afterwards does not silently
// invalidate it: the stored fingerprint no longer matches and the report is marked stale.
//
// The report body is built as one inline-styled HTML string so it renders identically
// in the on-screen preview, the print / PDF output, and the Word (.doc) export.
// ---------------------------------------------------------------------------

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The service writes **emphasis** in its prose; render it rather than printing asterisks.
const escRich = (s: string) =>
  esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(?<!\w)\*(.+?)\*(?!\w)/g, '<i>$1</i>');

// --- SALT speaker labels ---------------------------------------------------
// SALT attributes every line carrying the same prefix to one speaker, so each speaker
// in this recording needs its own label. C (child) and E (examiner/adult) are the
// conventional ones and are assigned first, so a same-letter name cannot take them.
const preferredLabel = (name: string): { label: string; conventional: boolean } => {
  const n = name.toLowerCase();
  if (n.startsWith('child')) return { label: 'C', conventional: true };
  if (n.startsWith('adult') || n.startsWith('examiner')) return { label: 'E', conventional: true };
  return { label: (name.trim()[0] || 'S').toUpperCase(), conventional: false };
};

function buildSpeakerLabels(speakers: string[]): Record<string, string> {
  const taken = new Set<string>();
  const labels: Record<string, string> = {};
  const ordered = [
    ...speakers.filter((s) => preferredLabel(s).conventional),
    ...speakers.filter((s) => !preferredLabel(s).conventional),
  ];
  for (const speaker of ordered) {
    const preferred = preferredLabel(speaker).label;
    let label = preferred;
    if (taken.has(label)) {
      const letters = speaker.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(1);
      label = Array.from(letters).find((l) => !taken.has(l)) || '';
      if (!label) {
        for (let i = 2; i < 100 && !label; i++) {
          if (!taken.has(`${preferred}${i}`)) label = `${preferred}${i}`;
        }
      }
    }
    taken.add(label);
    labels[speaker] = label;
  }
  return labels;
}

// --- report rendering ------------------------------------------------------

const H = '#0c6b74';                                   // section / title accent
const INK = '#16202e', MUT = '#5c6b7a', HAIR = '#e3e7ec';

// Domain verdicts as the service names them.
const DOMAIN_BG: Record<string, string> = {
  'STRENGTH': '#d6f5df',
  'AGE-APPROPRIATE': '#eef3ee',
  'MONITOR': '#ffe8cf',
  'CONCERN': '#fbd9d9',
  'INSUFFICIENT DATA': '#eceff2',
};
const METRIC_FG: Record<string, string> = {
  'TYPICAL': '#15803d',
  'ABOVE AVG': '#1d4ed8',
  'BELOW AVG': '#b45309',
  'MONITOR': '#b45309',
  'CONCERN': '#b91c1c',
  'NO REF': '#64748b',
};

// A standardized-position bar: red / green(±1 SD) / blue track with a ▼ at the z-score.
function barHtml(z: number, reversed?: boolean): string {
  const pct = Math.max(2, Math.min(98, ((z + 3) / 6) * 100));
  const RED = '#f4cccc', GREEN = '#6fbf95', BLUE = '#cfe0f7';
  const left = reversed ? BLUE : RED;   // 0–33% segment
  const right = reversed ? RED : BLUE;  // 67–100% segment
  return (
    `<div style="position:relative;height:16px;border-radius:8px;overflow:hidden;` +
    `background:#eef1f4;border:1px solid #e3e7ec;">` +
      `<div style="position:absolute;left:0;width:33.333%;height:100%;background:${left};"></div>` +
      `<div style="position:absolute;left:33.333%;width:33.333%;height:100%;background:${GREEN};"></div>` +
      `<div style="position:absolute;left:66.667%;width:33.333%;height:100%;background:${right};"></div>` +
      `<div style="position:absolute;top:-3px;left:${pct}%;width:0;height:0;margin-left:-5px;` +
      `border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid #16202e;"></div>` +
      `<div style="position:absolute;top:0;left:${pct}%;width:1px;height:100%;margin-left:-0.5px;background:#16202e;"></div>` +
    `</div>`
  );
}

const h2 = (n: number, t: string) =>
  `<h2 style="font-size:14px;color:${H};margin:22px 0 8px;padding-bottom:3px;` +
  `border-bottom:1px solid ${HAIR};font-family:Georgia,'Times New Roman',serif;">` +
  `<span style="color:${H};">${n}</span>&nbsp;&nbsp;${t}</h2>`;

const num = (v: unknown, digits = 2): string =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—';
const int = (v: unknown): string =>
  typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v)) : '—';

// Section 2 when reference values were supplied: the service's own metrics table.
function metricsTableHtml(rows: LsaMetricRow[]): string {
  const body = rows.map((m) => {
    const reversed = m.direction === 'higher_worse';
    const ref = m.td_mean != null
      ? `${num(m.td_mean)}${m.td_sd != null ? ` (${num(m.td_sd)})` : ''}`
      : '—';
    const bar = m.z != null
      ? barHtml(m.z, reversed)
      : `<span style="font-size:11px;color:${MUT};font-style:italic;">no reference values supplied</span>`;
    return `
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid ${HAIR};">${esc(m.label || m.key)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid ${HAIR};text-align:right;font-variant-numeric:tabular-nums;">${esc(m.value_str || (m.value != null ? String(m.value) : '—'))}</td>
      <td style="padding:7px 10px;border-bottom:1px solid ${HAIR};text-align:right;color:${MUT};font-variant-numeric:tabular-nums;">${esc(ref)}</td>
      <td style="padding:7px 14px;border-bottom:1px solid ${HAIR};width:34%;">${bar}</td>
      <td style="padding:7px 10px;border-bottom:1px solid ${HAIR};color:${METRIC_FG[m.status] || INK};font-weight:600;white-space:nowrap;">${esc(m.status)}${m.z != null ? `<span style="color:${MUT};font-weight:400;"> (z ${m.z >= 0 ? '+' : '−'}${Math.abs(m.z).toFixed(2)})</span>` : ''}</td>
    </tr>`;
  }).join('');
  const ticks = ['−3', '−2', '−1', '0', '1', '2', '3'].map((t) => `<span>${t}</span>`).join('');
  return (
    `<table style="width:100%;border-collapse:collapse;font-size:12.5px;color:${INK};">` +
    `<thead><tr style="text-align:left;">` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};">Metric</th>` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};text-align:right;">Value</th>` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};text-align:right;">Ref. mean (SD)</th>` +
    `<th style="padding:6px 14px;border-bottom:2px solid ${HAIR};">Standardized position (SD from mean)</th>` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};">Status</th>` +
    `</tr></thead><tbody>${body}</tbody></table>` +
    `<div style="display:flex;justify-content:space-between;width:34%;margin:2px 0 0 auto;padding:0 14px;` +
    `font-size:9.5px;color:#94a3b8;font-variant-numeric:tabular-nums;">${ticks}</div>`
  );
}

// Section 2 with no reference values: the counts the service parsed from the transcript.
function countsTableHtml(c: LsaDerivedCounts): string {
  const errorCodes = Object.entries(c.error_code_counts || {})
    .map(([code, n]) => `${code} ×${n}`).join(', ');
  const rows: Array<[string, string, string]> = [
    ['Analysed utterances', int(c.target_utterances), 'target speaker, excluding other speakers'],
    ['Total Words (TNW)', int(c.approx_TNW), 'maze words excluded'],
    ['Different Words (NDW)', int(c.approx_NDW), ''],
    ['Type–Token Ratio', num(c.approx_TTR, 3), 'NDW / TNW'],
    ['MLU words', num(c.approx_MLU_w), 'mean length of utterance'],
    ['MLU morphemes', num(c.approx_MLU_m), 'includes bound morphemes'],
    ['Mazes', `${num(c.approx_maze_pct_words, 1)}%`, `${int(c.maze_count)} mazes, ${int(c.maze_words)} words`],
    ['Unintelligible', `${num(c.approx_unintelligible_pct_words, 1)}%`, `${int(c.unintelligible_word_tokens)} word tokens`],
    ['Omitted words', int(c.omitted_words), 'marked *word'],
    ['Omitted bound morphemes', int(c.omitted_bound_morphemes), 'marked word/*3s, word/*ed'],
    ...(c.approx_SI_mean != null
      ? [['Subordination Index', num(c.approx_SI_mean), 'from [SI-n] codes'] as [string, string, string]]
      : []),
    ...(errorCodes ? [['Error codes', errorCodes, ''] as [string, string, string]] : []),
  ];
  const body = rows.map(([label, value, note]) => `
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid ${HAIR};">${esc(label)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid ${HAIR};text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">${esc(value)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid ${HAIR};color:${MUT};font-size:11.5px;">${esc(note)}</td>
    </tr>`).join('');
  return (
    `<table style="width:100%;border-collapse:collapse;font-size:12.5px;color:${INK};">` +
    `<thead><tr style="text-align:left;">` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};">Measure</th>` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};text-align:right;">Value</th>` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};">Basis</th>` +
    `</tr></thead><tbody>${body}</tbody></table>` +
    `<p style="font-size:11px;color:${MUT};font-style:italic;margin:8px 0 0;line-height:1.5;">` +
    `All values are counted from the transcript, not estimated by the language model. No ` +
    `typically-developing reference values were supplied for this sample, so no z-scores or ` +
    `normative statuses are shown; the domain judgments below come from the transcript itself.</p>`
  );
}

function buildReportBody(stored: StoredLsaReport): string {
  const r = stored.response;
  const meta = {
    speaker: stored.sample.speaker,
    speakerCode: stored.sample.speaker_code,
    age: stored.sample.age,
    task: stored.sample.task,
    language: stored.sample.language,
    date: stored.generated_at.slice(0, 10),
  };
  const transcriptLines = stored.transcript_lines;
  const c = r.derived_counts || {};
  const header = [
    { label: 'Speaker', value: `${meta.speaker} (${meta.speakerCode})` },
    { label: 'Age', value: meta.age },
    { label: 'Language', value: meta.language },
    { label: 'Task', value: meta.task },
    { label: 'Utterances', value: `${int(c.target_utterances)} (${meta.speakerCode}) / ${int(c.utterances_all_speakers)} total` },
    { label: 'Format', value: 'SALT' },
    { label: 'Date', value: meta.date },
  ];
  const headerLine = header
    .map((h) => `<span style="margin-right:16px;white-space:nowrap;"><b>${esc(h.label)}:</b> ${esc(h.value)}</span>`)
    .join('');

  const numbered = transcriptLines
    .map((line, i) => `<span style="color:#94a3b8;">${String(i + 1).padStart(2, ' ')}</span>  ${esc(line)}`)
    .join('\n');
  const transcript =
    `<div style="border:1px solid ${HAIR};border-radius:8px;background:#fbfcfd;padding:12px 14px;` +
    `font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:12px;line-height:1.7;color:${INK};` +
    `white-space:pre-wrap;">${numbered}</div>` +
    `<p style="font-size:11.5px;color:${MUT};margin:6px 0 0;font-style:italic;">` +
    `Codes: /3s /ed /ing bound morpheme · /*3s omitted bound morpheme · *word omitted word · ` +
    `[EW:x] error code (target x) · ( ) maze (excluded from counts) · X unintelligible. ` +
    `Line numbers match the utterance references in the observations below.</p>`;

  const metrics = (r.metrics_table && r.metrics_table.length > 0)
    ? metricsTableHtml(r.metrics_table)
    : countsTableHtml(c);

  const assessmentRows = (r.analysis.domains || []).map((d) => `
    <tr>
      <td style="padding:9px 10px;border-bottom:1px solid ${HAIR};font-weight:700;vertical-align:top;width:18%;">${esc(d.domain)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${HAIR};vertical-align:top;line-height:1.5;">${escRich(d.observation)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${HAIR};vertical-align:top;width:15%;">` +
        `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600;` +
        `background:${DOMAIN_BG[d.status] || '#eceff2'};color:${INK};">${esc(d.status)}</span></td>
    </tr>`).join('');
  const assessmentTable =
    `<table style="width:100%;border-collapse:collapse;font-size:12.5px;color:${INK};">` +
    `<thead><tr style="text-align:left;">` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};">Domain</th>` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};">Key observation</th>` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};">Status</th>` +
    `</tr></thead><tbody>${assessmentRows}</tbody></table>`;

  const limitationItems = [
    ...(r.analysis.limitations || []),
    ...(r.warnings || []),
    ...(r.analysis.reference_concerns || []),
  ];
  const limitations = limitationItems.length
    ? `<ul style="margin:4px 0 0;padding-left:20px;font-size:12.5px;color:${INK};line-height:1.6;">` +
      limitationItems.map((l) => `<li style="margin:0 0 5px;">${escRich(l)}</li>`).join('') + `</ul>`
    : `<p style="font-size:12.5px;color:${MUT};margin:4px 0 0;">None reported.</p>`;

  const summary =
    `<p style="font-size:12.5px;color:${INK};line-height:1.6;margin:4px 0 0;">${escRich(r.analysis.summary || '')}</p>`;

  const model = [r.llm?.provider, r.llm?.model].filter(Boolean).join(' / ');
  const footer =
    `<p style="font-size:10.5px;color:${MUT};line-height:1.5;margin:26px 0 0;padding-top:8px;` +
    `border-top:1px solid ${HAIR};">Generated by SATE from this recording's transcript (SALT). ` +
    `The counts and any z-scores are computed from the transcript; the observations, limitations ` +
    `and summary were drafted with AI assistance${model ? ` (${esc(model)})` : ''} and must be reviewed ` +
    `by a licensed speech-language pathologist before clinical use.</p>`;

  return (
    `<div style="font-family:Georgia,'Times New Roman',serif;color:${INK};max-width:720px;margin:0 auto;">` +
      `<div style="text-align:center;border-bottom:2px solid ${H};padding-bottom:10px;margin-bottom:14px;">` +
        `<h1 style="font-size:20px;color:${H};margin:0;font-family:Georgia,'Times New Roman',serif;">SATE Report</h1>` +
      `</div>` +
      `<p style="font-size:12.5px;color:${INK};margin:0 0 4px;line-height:1.9;">${headerLine}</p>` +
      h2(1, 'Transcript') + transcript +
      h2(2, 'Metrics &amp; Normative Comparison') + metrics +
      h2(3, 'Language Ability Assessment') + assessmentTable +
      h2(4, 'Limitations') + limitations +
      h2(5, 'Summary') + summary +
      footer +
    `</div>`
  );
}

function fullHtmlDoc(body: string, forWord: boolean): string {
  const wordNs = forWord
    ? ` xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"`
    : '';
  const printCss = forWord
    ? '@page { size: A4; margin: 2cm; }'
    : '@page { size: A4; margin: 18mm 16mm; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }';
  return `<!doctype html><html${wordNs}><head><meta charset="utf-8"><title>SATE Report</title>` +
    `<style>${printCss} body{margin:0;padding:${forWord ? '0' : '8mm'};}</style></head>` +
    `<body>${body}</body></html>`;
}

// Persist what the clinician types so it is entered once per recording and remembered.
const storeKey = (field: string, recordingId?: string) =>
  recordingId ? `sate_report_${field}:${recordingId}` : `sate_report_${field}`;

const readStore = (key: string, fallback: string) => {
  try {
    const v = localStorage.getItem(key);
    return v != null && v !== '' ? v : fallback;
  } catch { return fallback; }
};

const AGE_RE = /^\d{1,2};\d{1,2}$/;

interface SateReportPopupProps {
  isOpen: boolean;
  onClose: () => void;
  recordingId?: string;
  transcriptData: Segment[];
}

export const SateReportPopup: React.FC<SateReportPopupProps> = ({
  isOpen, onClose, recordingId, transcriptData,
}) => {
  const [age, setAge] = React.useState('');
  const [task, setTask] = React.useState('Narrative (picture-elicited)');
  const [targetSpeaker, setTargetSpeaker] = React.useState('');
  const [report, setReport] = React.useState<StoredLsaReport | null>(null);
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = React.useState('');
  const [saveWarning, setSaveWarning] = React.useState('');
  const [loadingSaved, setLoadingSaved] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);

  // Speakers present in the sample, in the order they first appear.
  const speakers = React.useMemo(() => {
    const seen: string[] = [];
    for (const s of transcriptData || []) {
      const name = s.speaker || 'Unknown';
      if (!seen.includes(name)) seen.push(name);
    }
    return seen;
  }, [transcriptData]);

  const labels = React.useMemo(() => buildSpeakerLabels(speakers), [speakers]);

  // The SALT text sent for analysis: excluded utterances are left out (the '+' prefix
  // that marks them in a SALT export is a header line to the parser), pauses are left
  // out (a timing tag is not part of the analysed notation), and the speaker list line
  // is omitted because the target speaker is named explicitly by `speaker_code`.
  const saltText = React.useMemo(() => {
    const usable = (transcriptData || []).filter((s) => !s.excluded);
    return segmentsToSalt(usable, false, labels);
  }, [transcriptData, labels]);

  const transcriptLines = React.useMemo(
    () => saltText.split('\n').filter((l) => l.trim() !== ''),
    [saltText],
  );

  // Opening the report shows the one already generated for this recording. The sample
  // information comes back from the saved report rather than from this browser's
  // localStorage, so the age and task shown are the ones the report was actually built
  // with — on any machine, not just the one that generated it.
  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setAge(readStore(storeKey('age', recordingId), ''));
    setTask(readStore(storeKey('task', recordingId), 'Narrative (picture-elicited)'));
    setReport(null);
    setStatus('idle');
    setError('');
    setSaveWarning('');
    if (!recordingId) return;

    setLoadingSaved(true);
    loadStoredLsaReport(recordingId)
      .then((saved) => {
        if (cancelled || !saved) return;
        setReport(saved);
        setStatus('ready');
        setAge(saved.sample.age);
        setTask(saved.sample.task);
      })
      .finally(() => { if (!cancelled) setLoadingSaved(false); });

    return () => { cancelled = true; };
  }, [isOpen, recordingId]);

  // Default the target speaker to the one SALT calls the child.
  React.useEffect(() => {
    if (targetSpeaker && speakers.includes(targetSpeaker)) return;
    const child = speakers.find((s) => preferredLabel(s).label === 'C') || speakers[0] || '';
    setTargetSpeaker(child);
  }, [speakers, targetSpeaker]);

  // A live counter, because the request holds an LLM call for 15-30 s.
  React.useEffect(() => {
    if (status !== 'loading') return;
    const started = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [status]);

  const persist = (field: string, value: string) => {
    try { localStorage.setItem(storeKey(field, recordingId), value); } catch { /* ignore */ }
  };

  const speakerCode = labels[targetSpeaker] || 'C';
  const targetUtterances = React.useMemo(
    () => (transcriptData || []).filter((s) => !s.excluded && (s.speaker || 'Unknown') === targetSpeaker).length,
    [transcriptData, targetSpeaker],
  );

  const ageValid = AGE_RE.test(age.trim());
  const canGenerate = ageValid && task.trim() !== '' && targetUtterances > 0 && status !== 'loading';

  const reportMeta = {
    // The speaker's role, not a name: nothing identifying is sent to the service.
    speaker: preferredLabel(targetSpeaker).label === 'C' ? 'Child'
      : preferredLabel(targetSpeaker).label === 'E' ? 'Examiner' : 'Speaker',
    speakerCode,
    age: age.trim(),
    task: task.trim(),
    language: 'English',
    date: new Date().toISOString().slice(0, 10),
  };

  // A report generated from a transcript that has since been edited is not wrong, but it
  // no longer describes what is on screen — so say so rather than quietly showing it.
  const isStale = report != null && report.transcript_hash !== transcriptFingerprint(saltText);

  const generate = async () => {
    setStatus('loading');
    setError('');
    setSaveWarning('');
    try {
      const result = await generateLsaReport({
        sample: {
          // Deliberately non-identifying: the transcript already goes to a third-party
          // language model, so no patient or clinician name is attached to it.
          file_name: `sate_${(recordingId || 'sample').slice(0, 8)}.slt`,
          age: reportMeta.age,
          task: reportMeta.task,
          speaker: reportMeta.speaker,
          speaker_code: speakerCode,
          language: reportMeta.language,
        },
        transcript: saltText.endsWith('\n') ? saltText : `${saltText}\n`,
      });

      // Store what is rendered, not the whole response: `latex` is ~19 KB the app never
      // reads, and keeping the rendered inputs together means a saved report and a fresh
      // one are the same document.
      const { latex: _latex, pdf_base64: _pdf, ...response } = result;
      const stored: StoredLsaReport = {
        generated_at: new Date().toISOString(),
        sample: {
          age: reportMeta.age,
          task: reportMeta.task,
          speaker: reportMeta.speaker,
          speaker_code: speakerCode,
          language: reportMeta.language,
        },
        transcript_lines: transcriptLines,
        transcript_hash: transcriptFingerprint(saltText),
        response,
      };
      setReport(stored);
      setStatus('ready');

      // The report exists either way; a failed save costs a regeneration next time, so it
      // is a warning on a finished report, never an error that discards it.
      if (recordingId) {
        try {
          await saveStoredLsaReport(recordingId, stored);
        } catch (e) {
          setSaveWarning(e instanceof LsaReportNotStoredError
            ? `${e.message} The report is shown below but will have to be generated again next time.`
            : 'The report could not be saved to this recording and will have to be generated again next time.');
        }
      }
    } catch (e) {
      setError((e as Error)?.message || 'Report generation failed.');
      setStatus('error');
    }
  };

  const body = report ? buildReportBody(report) : '';

  const exportPdf = () => {
    if (!body) return;
    // Print via a hidden iframe (Save as PDF) — preserves the exact layout/colors.
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow!.document;
    doc.open();
    doc.write(fullHtmlDoc(body, false));
    doc.close();
    iframe.onload = () => {
      iframe.contentWindow!.focus();
      iframe.contentWindow!.print();
      window.setTimeout(() => document.body.removeChild(iframe), 1500);
    };
  };

  const exportWord = () => {
    if (!body) return;
    const blob = new Blob(['﻿', fullHtmlDoc(body, true)], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SATE_Report.doc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-baseline gap-2 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">SATE Report</h2>
            {report && (
              <span className="text-xs text-gray-500 truncate" title={report.generated_at}>
                {saveWarning ? 'generated' : 'saved'} {new Date(report.generated_at).toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportPdf} disabled={!report}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
              <FileText className="w-4 h-4" /> Export PDF
            </button>
            <button onClick={exportWord} disabled={!report}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 disabled:text-gray-400 disabled:border-gray-200 disabled:hover:bg-white disabled:cursor-not-allowed transition-colors">
              <FileType className="w-4 h-4" /> Export Word
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sample information — what the analysis needs and the transcript cannot supply. */}
        <div className="flex flex-wrap items-end gap-3 px-5 py-3 border-b border-gray-200 bg-gray-50">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Patient age</span>
            <input
              value={age}
              onChange={(e) => { setAge(e.target.value); persist('age', e.target.value); }}
              placeholder="6;0"
              className={`w-20 px-2 py-1.5 text-sm border rounded-md focus:ring-2 focus:ring-teal-500 focus:outline-none ${
                age && !ageValid ? 'border-red-400' : 'border-gray-300'
              }`}
              title="Years;months, e.g. 6;0"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <span className="text-xs font-medium text-gray-600">Elicitation task</span>
            <input
              value={task}
              onChange={(e) => { setTask(e.target.value); persist('task', e.target.value); }}
              placeholder="Narrative (picture-elicited)"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Target speaker</span>
            <select
              value={targetSpeaker}
              onChange={(e) => setTargetSpeaker(e.target.value)}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
            >
              {speakers.map((s) => (
                <option key={s} value={s}>{s} ({labels[s]})</option>
              ))}
            </select>
          </label>
          <button
            onClick={generate}
            disabled={!canGenerate}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            title={ageValid ? 'Analyse this transcript' : 'Enter the age as years;months first'}
          >
            {status === 'loading'
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing… {elapsed}s</>
              : <><Sparkles className="w-4 h-4" /> {report ? 'Regenerate' : 'Generate report'}</>}
          </button>
        </div>

        <div className="overflow-y-auto p-6 bg-gray-100">
          {isStale && (
            <div className="mx-auto max-w-[760px] mb-4 flex items-start gap-2 p-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">The transcript changed after this report was generated</div>
                <div className="text-amber-800">
                  It still shows the transcript it was built from. Regenerate to analyse the current one.
                </div>
              </div>
            </div>
          )}

          {saveWarning && (
            <div className="mx-auto max-w-[760px] mb-4 flex items-start gap-2 p-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Not saved to this recording</div>
                <div className="text-amber-800">{saveWarning}</div>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="mx-auto max-w-[760px] mb-4 flex items-start gap-2 p-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Could not generate the report</div>
                <div className="text-red-700">{error}</div>
              </div>
            </div>
          )}

          {report ? (
            <div className="bg-white shadow-sm mx-auto p-8" style={{ maxWidth: 760 }}
                 dangerouslySetInnerHTML={{ __html: body }} />
          ) : (
            <div className="bg-white shadow-sm mx-auto p-8 text-sm text-gray-600" style={{ maxWidth: 760 }}>
              {loadingSaved ? (
                <p className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Looking for a saved report…
                </p>
              ) : targetUtterances === 0 ? (
                <p>This recording has no utterances for the selected speaker, so there is nothing to analyse.</p>
              ) : (
                <>
                  <p className="mb-3">
                    The report is generated from this recording: {targetUtterances} utterance
                    {targetUtterances === 1 ? '' : 's'} from <b>{targetSpeaker}</b> are converted to SALT
                    and analysed. Fewer than 50 utterances is a screening-level sample and is flagged in
                    the report's Limitations.
                  </p>
                  <p className="mb-3 text-gray-500">
                    Enter the patient's age and the elicitation task, then generate. It takes about
                    15-30 seconds, once: the report is saved on this recording and opens straight
                    away next time. The transcript is sent to the SATE LSA service for analysis; no
                    patient or clinician name is attached to it.
                  </p>
                  <pre className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
                    {transcriptLines.slice(0, 12).join('\n')}
                    {transcriptLines.length > 12 ? `\n… ${transcriptLines.length - 12} more lines` : ''}
                  </pre>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
