import React from 'react';
import {
  X, FileText, FileType, Sparkles, Loader2, AlertTriangle,
  Pencil, Undo2, Check,
} from 'lucide-react';
import { type Segment } from '@/services/dataService';
import { segmentsToSalt } from '@/services/saltService';
import {
  generateLsaReport,
  loadStoredLsaReport,
  saveStoredLsaReport,
  transcriptFingerprint,
  baseLimitations,
  mergeEdits,
  LsaReportNotStoredError,
  type StoredLsaReport,
  type LsaMetricRow,
  type LsaMetricInput,
  type LsaDerivedCounts,
  type LsaNormsContext,
  type LsaReportEdits,
} from '@/services/lsaReportService';
import { buildNormedMetrics, NoNormsError } from '@/services/lsaMetricsService';

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
// Ticking "Compare to CHILDES norms" sends this sample's own metrics with TD reference
// values, which is what makes the service return z-scores; without it the report has the
// transcript counts and no normative comparison.
//
// The prose the model drafted can be corrected before the report is used — an SLP must
// review it, so the reviewer needs somewhere to put the review. Edits
// are kept beside the response, never over it, so every field can still be reverted to
// what the model actually wrote.
//
// The report body is built as one inline-styled HTML string so it renders identically
// in the on-screen preview, the print / PDF output, and the Word (.doc) export.
// ---------------------------------------------------------------------------

/** The verdicts a reviewer may choose from — exactly the set the service uses. */
const DOMAIN_STATUSES = [
  'STRENGTH', 'AGE-APPROPRIATE', 'MONITOR', 'CONCERN', 'INSUFFICIENT DATA',
] as const;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The service writes **emphasis** in its prose; render it rather than printing asterisks.
// A line break the reviewer typed prints as one; richFromDom() reads all three back.
const escRich = (s: string) =>
  esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(?<!\w)\*(.+?)\*(?!\w)/g, '<i>$1</i>')
    .replace(/\n/g, '<br>');

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

// The counts the service parsed from the transcript. Shown on its own when no reference
// values were sent, and under the metrics table when they were — the counts are the
// transcript's own arithmetic and stay worth printing either way.
function countsTableHtml(c: LsaDerivedCounts, standalone: boolean): string {
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
    (standalone
      ? `All values are counted from the transcript, not estimated by the language model. No `
        + `typically-developing reference values were supplied for this sample, so no z-scores or `
        + `normative statuses are shown; the domain judgments below come from the transcript itself.`
      : `Counted from the transcript by the report service, not estimated by the language model.`) +
    `</p>`
  );
}

const h3 = (t: string) =>
  `<h3 style="font-size:12.5px;color:${INK};margin:20px 0 6px;font-weight:700;` +
  `font-family:Georgia,'Times New Roman',serif;">${t}</h3>`;

// Which reference group the z-scores were computed against. A z-score with no stated
// reference group is not interpretable, so this prints wherever the bars print.
function normsNoteHtml(n?: LsaNormsContext | null): string {
  if (!n) return '';
  const ageWindow = n.age_window_months
    ? `ages ${n.age_window_months[0]}\u2013${n.age_window_months[1]} months`
    : 'the requested age window';
  return (
    `<p style="font-size:11px;color:${MUT};font-style:italic;margin:8px 0 0;line-height:1.5;">` +
    `Reference values: ${esc(n.source)} ${esc(n.clinical)} ${esc(n.task)} samples ` +
    `(${esc(n.language)}), ${esc(ageWindow)} \u2014 n = ${n.n_samples} samples from ` +
    `${n.n_corpora} corpora. Metrics with no published reference for this age are marked NO REF.</p>`
  );
}

// overflow-wrap:anywhere lets a long unbroken token (a URL, a run of codes) break instead
// of pushing the page wider than its border.
const ROOT_STYLE = `font-family:Georgia,'Times New Roman',serif;color:${INK};max-width:720px;margin:0 auto;`
  + `overflow-wrap:anywhere;word-break:break-word;`;

/**
 * The report. With `edit` (the reviewer's draft) it is the SAME document with the drafted
 * prose made editable in place — same markup, same styles — so editing looks exactly like
 * the report it produces. Only the attributes differ: `contenteditable` + `data-field` on
 * the prose, and the status pill becomes a <select> drawn as that pill.
 */
function buildReportBody(stored: StoredLsaReport, edit?: ReportDraft): string {
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
    // Inline-blocks joined by a space: each item may break between items (and wrap inside
    // a long value), so the line can never be wider than the page.
    .map((h) => `<span style="display:inline-block;max-width:100%;margin:0 16px 0 0;"><b>${esc(h.label)}:</b> ${esc(h.value)}</span>`)
    .join(' ');

  const numbered = transcriptLines
    .map((line, i) => `<span style="color:#94a3b8;">${String(i + 1).padStart(2, ' ')}</span>  ${esc(line)}`)
    .join('\n');
  const transcript =
    `<div style="border:1px solid ${HAIR};border-radius:8px;background:#fbfcfd;padding:12px 14px;` +
    `font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:12px;line-height:1.7;color:${INK};` +
    `white-space:pre-wrap;overflow-wrap:anywhere;">${numbered}</div>` +
    `<p style="font-size:11.5px;color:${MUT};margin:6px 0 0;font-style:italic;">` +
    `Codes: /3s /ed /ing bound morpheme · /*3s omitted bound morpheme · *word omitted word · ` +
    `[EW:x] error code (target x) · ( ) maze (excluded from counts) · X unintelligible. ` +
    `Line numbers match the utterance references in the observations below.</p>`;

  const merged = mergeEdits(stored);

  const hasMetrics = (r.metrics_table && r.metrics_table.length > 0);
  const metrics = hasMetrics
    ? metricsTableHtml(r.metrics_table) + normsNoteHtml(stored.norms)
      + h3('Transcript counts') + countsTableHtml(c, false)
    : countsTableHtml(c, true);

  const editable = (field: string) => (edit ? ` contenteditable="true" data-field="${field}"` : '');
  const domains = merged.domains.map((d, i) => (edit?.domains[i] ? { ...d, ...edit.domains[i] } : d));
  // One line, in the report and in the editor alike (a <select> cannot wrap, so a pill that
// did would make the two differ). The Status column is sized for the longest verdict.
const PILL = 'display:inline-block;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600;white-space:nowrap;';
  const statusCell = (status: string, i: number) => {
    if (!edit) return `<span style="${PILL}background:${DOMAIN_BG[status] || '#eceff2'};color:${INK};">${esc(status)}</span>`;
    const options = [...DOMAIN_STATUSES, ...(DOMAIN_STATUSES.includes(status as typeof DOMAIN_STATUSES[number]) ? [] : [status])]
      .filter(Boolean)
      .map((v) => `<option value="${esc(v)}"${v === status ? ' selected' : ''}>${esc(v)}</option>`).join('');
    return `<select data-field="status-${i}" aria-label="Status" style="${PILL}max-width:100%;border:0;margin:0;` +
      `font-family:inherit;line-height:inherit;appearance:none;-webkit-appearance:none;cursor:pointer;field-sizing:content;` +
      `background:${DOMAIN_BG[status] || '#eceff2'};color:${INK};">${options}</select>`;
  };
  const assessmentRows = domains.map((d, i) => `
    <tr>
      <td style="padding:9px 10px;border-bottom:1px solid ${HAIR};font-weight:700;vertical-align:top;width:16%;">${esc(d.domain)}</td>
      <td${editable(`obs-${i}`)} style="padding:9px 10px;border-bottom:1px solid ${HAIR};vertical-align:top;line-height:1.5;">${escRich(d.observation)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${HAIR};vertical-align:top;width:23%;">${statusCell(d.status, i)}</td>
    </tr>`).join('');
  const assessmentTable =
    `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:12.5px;color:${INK};">` +
    `<thead><tr style="text-align:left;">` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};width:16%;">Domain</th>` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};">Key observation</th>` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};width:23%;">Status</th>` +
    `</tr></thead><tbody>${assessmentRows}</tbody></table>`;

  // Editing, the list is always there (one empty point if there are none) so there is
  // somewhere to type; Enter / Backspace add and remove points like any document's list.
  const limitationItems = edit ? (edit.limitations.length ? edit.limitations : ['']) : merged.limitations;
  const limitations = limitationItems.length
    ? `<ul${editable('limitations')} style="margin:4px 0 0;padding-left:20px;font-size:12.5px;color:${INK};line-height:1.6;">` +
      limitationItems.map((l) => `<li style="margin:0 0 5px;">${escRich(l) || '<br>'}</li>`).join('') + `</ul>`
    : `<p style="font-size:12.5px;color:${MUT};margin:4px 0 0;">None reported.</p>`;

  const summary =
    `<p${editable('summary')} style="font-size:12.5px;color:${INK};line-height:1.6;margin:4px 0 0;">${escRich(edit ? edit.summary : merged.summary) || (edit ? '<br>' : '')}</p>`;

  return (
    `<div style="${ROOT_STYLE}">` +
      `<div style="text-align:center;border-bottom:2px solid ${H};padding-bottom:10px;margin-bottom:14px;">` +
        `<h1 style="font-size:20px;color:${H};margin:0;font-family:Georgia,'Times New Roman',serif;">SATE Report</h1>` +
      `</div>` +
      `<p style="font-size:12.5px;color:${INK};margin:0 0 4px;line-height:1.9;">${headerLine}</p>` +
      h2(1, 'Transcript') + transcript +
      h2(2, 'Metrics &amp; Normative Comparison') + metrics +
      h2(3, 'Language Ability Assessment') + assessmentTable +
      h2(4, 'Limitations') + limitations +
      h2(5, 'Summary') + summary +
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

// The service wants one SALT-style "years;months" string, which is notation, not
// something to make a clinician type. It is split into two plain number boxes on screen
// and rejoined for the request; this reads the string back apart when a saved report (or
// this browser's last entry) is restored.
const parseAge = (age: string): { years: string; months: string } => {
  const m = /^\s*(\d{1,2})\s*;\s*(\d{1,2})\s*$/.exec(age || '');
  return m ? { years: m[1], months: m[2] } : { years: '', months: '' };
};

// --- review / edit ---------------------------------------------------------

interface ReportDraft {
  domains: Array<{ observation: string; status: string }>;
  limitations: string[];
  summary: string;
}

/** The report as it currently reads (model text plus any saved edits) — what the
 *  reviewer starts from when they open the editor. */
const draftFromReport = (stored: StoredLsaReport): ReportDraft => {
  const merged = mergeEdits(stored);
  return {
    domains: merged.domains.map((d) => ({ observation: d.observation || '', status: d.status || '' })),
    limitations: [...merged.limitations],
    summary: merged.summary,
  };
};

/** The model's own text, ignoring every edit — what "revert" goes back to. */
const draftFromModel = (stored: StoredLsaReport): ReportDraft => {
  const r = stored.response;
  return {
    domains: (r.analysis?.domains || []).map((d) => ({ observation: d.observation || '', status: d.status || '' })),
    limitations: baseLimitations(r),
    summary: r.analysis?.summary || '',
  };
};

/**
 * Only what actually differs from the model's text is stored. A draft that was opened and
 * closed untouched must produce NO edits at all — otherwise every report would be marked
 * "edited by the reviewing clinician" for having been looked at, and that claim
 * would stop meaning anything.
 */
function draftToEdits(stored: StoredLsaReport, draft: ReportDraft): LsaReportEdits | undefined {
  const r = stored.response;
  const edits: LsaReportEdits = {};

  const domains: Record<string, { observation?: string; status?: string }> = {};
  (r.analysis?.domains || []).forEach((d, i) => {
    const next = draft.domains[i];
    if (!next) return;
    const patch: { observation?: string; status?: string } = {};
    if (next.observation.trim() !== (d.observation || '').trim()) patch.observation = next.observation.trim();
    if (next.status !== d.status) patch.status = next.status;
    if (Object.keys(patch).length) domains[String(i)] = patch;
  });
  if (Object.keys(domains).length) edits.domains = domains;

  const base = baseLimitations(r);
  const limitations = draft.limitations.map((l) => l.trim()).filter((l) => l !== '');
  if (limitations.length !== base.length || limitations.some((l, i) => l !== base[i])) {
    edits.limitations = limitations;
  }

  if (draft.summary.trim() !== (r.analysis?.summary || '').trim()) edits.summary = draft.summary.trim();

  return Object.keys(edits).length ? edits : undefined;
}

/** Rich text back out of an edited element, in the notation escRich() renders:
 *  <b>/<strong> → **x**, <i>/<em> → *x*, <br> or a new block → a line break. */
function richFromDom(node: Node): string {
  // Spaces stay OUTSIDE the markers: "** word**" would not render as bold.
  const wrap = (t: string, m: string) => {
    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(t) || ['', '', t, ''];
    return core ? `${lead}${m}${core}${m}${trail}` : t;
  };
  let out = '';
  node.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) { out += (n.textContent || '').replace(/\u00a0/g, ' '); return; }
    if (!(n instanceof HTMLElement)) return;
    const inner = richFromDom(n);
    switch (n.tagName) {
      case 'BR': out += '\n'; break;
      case 'B': case 'STRONG': out += wrap(inner, '**'); break;
      case 'I': case 'EM': out += wrap(inner, '*'); break;
      case 'DIV': case 'P': out += (out && !out.endsWith('\n') ? '\n' : '') + inner; break;
      default: out += inner;
    }
  });
  return out;
}

const clean = (s: string) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/** The reviewer's draft, read off the editable report. */
function draftFromDom(root: HTMLElement, stored: StoredLsaReport): ReportDraft {
  const field = (name: string) => root.querySelector<HTMLElement>(`[data-field="${name}"]`);
  const list = field('limitations');
  const items = list
    ? (list.querySelector('li')
      ? Array.from(list.querySelectorAll('li')).map((li) => clean(richFromDom(li)))
      : clean(richFromDom(list)).split('\n'))
    : [];
  return {
    domains: (stored.response.analysis?.domains || []).map((d, i) => ({
      observation: clean(richFromDom(field(`obs-${i}`) || document.createElement('div'))),
      status: (field(`status-${i}`) as HTMLSelectElement | null)?.value || d.status || '',
    })),
    limitations: items.map((l) => l.trim()).filter(Boolean),
    summary: clean(richFromDom(field('summary') || document.createElement('div'))),
  };
}

// Edit mode adds NOTHING to the layout: outlines take no space, so the page reads exactly
// as it prints. A dashed hint on hover shows what can be edited, a solid one where you type.
const EDIT_CSS = `
.sate-report-edit [contenteditable="true"] { outline: 1px dashed #99d5cf; outline-offset: 2px; border-radius: 2px; cursor: text; transition: outline-color .15s, background-color .15s; }
.sate-report-edit td[contenteditable="true"] { outline-offset: -3px; }
.sate-report-edit [contenteditable="true"]:hover { outline-color: #14b8a6; }
.sate-report-edit [contenteditable="true"]:focus { outline: 2px solid #14b8a6; background-color: #f0fdfa; }
.sate-report-edit select[data-field]:hover, .sate-report-edit select[data-field]:focus { outline: 2px solid #14b8a6; outline-offset: 1px; }
`;

interface SateReportPopupProps {
  isOpen: boolean;
  onClose: () => void;
  recordingId?: string;
  transcriptData: Segment[];
  /** Oversight (admin/manager viewing another account): show the saved report, never write. */
  readOnly?: boolean;
  /** The saved report, when it came from somewhere other than this account's own row. */
  initialReport?: StoredLsaReport | null;
  /** Oversight only: a manager/admin may GENERATE a report for a recording that has none (still no
   *  Edit, no Regenerate). The report is saved through `saveReport`, never written here. */
  allowGenerate?: boolean;
  saveReport?: (stored: StoredLsaReport) => Promise<StoredLsaReport | void>;
}

export const SateReportPopup: React.FC<SateReportPopupProps> = ({
  isOpen, onClose, recordingId, transcriptData, readOnly = false, initialReport, allowGenerate = false, saveReport,
}) => {
  const [ageYears, setAgeYears] = React.useState('');
  const [ageMonths, setAgeMonths] = React.useState('');
  const [task, setTask] = React.useState('Narrative (picture-elicited)');
  const [targetSpeaker, setTargetSpeaker] = React.useState('');
  const [report, setReport] = React.useState<StoredLsaReport | null>(null);
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = React.useState('');
  const [saveWarning, setSaveWarning] = React.useState('');
  const [loadingSaved, setLoadingSaved] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [useNorms, setUseNorms] = React.useState(false);
  const [normRange, setNormRange] = React.useState('6');
  const [phase, setPhase] = React.useState<'norms' | 'report'>('report');
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<ReportDraft | null>(null);
  const [savingEdits, setSavingEdits] = React.useState(false);
  const [confirmRegen, setConfirmRegen] = React.useState(false);
  // The editable report's markup is built ONCE per edit session: the browser owns the text
  // while the reviewer types, and re-rendering it would throw the cursor away.
  const [editHtml, setEditHtml] = React.useState('');
  const [editKey, setEditKey] = React.useState(0);
  const [draftStart, setDraftStart] = React.useState('');
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const [confirmDiscard, setConfirmDiscard] = React.useState<null | 'cancel' | 'close'>(null);
  const [justSaved, setJustSaved] = React.useState(false);

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
    const lastAge = parseAge(readStore(storeKey('age', recordingId), ''));
    setAgeYears(lastAge.years);
    setAgeMonths(lastAge.months);
    setTask(readStore(storeKey('task', recordingId), 'Narrative (picture-elicited)'));
    setUseNorms(readStore(storeKey('norms', recordingId), '') === '1');
    setNormRange(readStore(storeKey('normRange', recordingId), '6'));
    setReport(null);
    setStatus('idle');
    setError('');
    setSaveWarning('');
    setEditing(false);
    setDraft(null);
    setConfirmRegen(false);
    setConfirmDiscard(null);
    setJustSaved(false);

    const apply = (saved: StoredLsaReport) => {
      setReport(saved);
      setStatus('ready');
      const savedAge = parseAge(saved.sample.age);
      setAgeYears(savedAge.years);
      setAgeMonths(savedAge.months);
      setTask(saved.sample.task);
      setUseNorms(!!saved.norms);
    };
    if (readOnly) {
      // Same acceptance rule as loadStoredLsaReport, plus `sample`, which apply() reads.
      if (initialReport?.response && initialReport.sample) apply(initialReport);
      return;
    }
    if (!recordingId) return;

    setLoadingSaved(true);
    loadStoredLsaReport(recordingId)
      .then((saved) => {
        if (cancelled || !saved) return;
        setReport(saved);
        setStatus('ready');
        const savedAge = parseAge(saved.sample.age);
        setAgeYears(savedAge.years);
        setAgeMonths(savedAge.months);
        setTask(saved.sample.task);
        // The checkbox shows what this report was actually built with, not what this
        // browser last ticked — otherwise it would offer to "regenerate with norms" a
        // report that already has them, or hide that a saved one has none.
        setUseNorms(!!saved.norms);
      })
      .finally(() => { if (!cancelled) setLoadingSaved(false); });

    return () => { cancelled = true; };
  }, [isOpen, recordingId, readOnly, initialReport]);

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
    if (readOnly) return;
    try { localStorage.setItem(storeKey(field, recordingId), value); } catch { /* ignore */ }
  };

  // Stored in the service's own "years;months" form, so the last age typed here and the
  // age read back off a saved report restore through the same parse.
  const persistAge = (years: string, months: string) =>
    persist('age', years.trim() ? `${years.trim()};${months.trim() || '0'}` : '');

  // --- review ---------------------------------------------------------------

  const openEditor = (start: ReportDraft) => {
    if (!report) return;
    setEditHtml(buildReportBody(report, start));
    setEditKey((k) => k + 1);
    setDraft(start);
    setDraftStart('');
  };

  const startEditing = () => {
    if (!report || readOnly) return;
    openEditor(draftFromReport(report));
    setConfirmDiscard(null);
    setJustSaved(false);
    setEditing(true);
  };

  // The baseline is what the page READS BACK right after it renders, so an untouched
  // report is never "changed" by a whitespace difference in the round trip.
  // Written imperatively, ONCE per edit session: with dangerouslySetInnerHTML React
  // re-applies the markup on a re-render (every keystroke updates the draft), which wiped
  // what had just been typed and dropped the cursor. React renders this div empty and never
  // touches its children; the browser owns the text until Save reads it back.
  React.useLayoutEffect(() => {
    if (!editing || !report || !editorRef.current) return;
    editorRef.current.innerHTML = editHtml;
    const start = draftFromDom(editorRef.current, report);
    setDraft(start);
    setDraftStart(JSON.stringify(start));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, editKey]);

  const readDraft = () => (report && editorRef.current ? draftFromDom(editorRef.current, report) : draft);

  // Native listeners, not React's onInput/onChange: React does not synthesise a change
  // event for a <select> it did not render, so a status change went unnoticed.
  const readDraftRef = React.useRef(readDraft);
  readDraftRef.current = readDraft;
  React.useEffect(() => {
    const root = editorRef.current;
    if (!editing || !root) return;
    const onEdit = (e: Event) => {
      // The status <select> is drawn as the pill, so its colour follows the choice.
      if (e.target instanceof HTMLSelectElement) e.target.style.background = DOMAIN_BG[e.target.value] || '#eceff2';
      setDraft(readDraftRef.current());
    };
    root.addEventListener('input', onEdit);
    root.addEventListener('change', onEdit);
    return () => {
      root.removeEventListener('input', onEdit);
      root.removeEventListener('change', onEdit);
    };
  }, [editing, editKey]);

  const onEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const field = (e.target as HTMLElement).closest('[data-field]')?.getAttribute('data-field') || '';
    // In a paragraph Enter is a line break, not a new <div> (which would read back as a
    // second paragraph the reviewer never meant). In the list, Enter is a new point.
    if (e.key === 'Enter' && field !== 'limitations' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      document.execCommand('insertLineBreak');
    }
  };

  // Pasted text arrives as text: fonts, colours and links copied from elsewhere would
  // otherwise land in a clinical document and silently vanish on save.
  const onEditorPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  };

  const revertAll = () => {
    if (!report) return;
    openEditor(draftFromModel(report));
  };

  const dirty = editing && draft != null && JSON.stringify(draft) !== draftStart;

  const cancelEditing = () => {
    setEditing(false);
    setDraft(null);
    setConfirmDiscard(null);
  };

  // Cancel / close never silently throw away a review: with unsaved changes they ask first,
  // in the save bar rather than a browser dialog.
  const requestCancel = () => (dirty ? setConfirmDiscard('cancel') : cancelEditing());
  const requestClose = () => (dirty ? setConfirmDiscard('close') : onClose());

  const saveEdits = async () => {
    if (readOnly) return;
    const current = readDraft();
    if (!report || !current) return;
    const edits = draftToEdits(report, current);
    const next: StoredLsaReport = {
      ...report,
      edits,
      edited_at: edits ? new Date().toISOString() : null,
    };
    setSavingEdits(true);
    setSaveWarning('');
    try {
      if (recordingId) await saveStoredLsaReport(recordingId, next);
    } catch (e) {
      // Same rule as a freshly generated report: the text the clinician wrote is not
      // thrown away because the write failed, it is shown with a warning that it is
      // only in this browser.
      setSaveWarning(e instanceof LsaReportNotStoredError
        ? `${e.message} Your edits are shown below but were not saved.`
        : 'Your edits could not be saved to this recording and exist only in this browser.');
    } finally {
      setSavingEdits(false);
      setReport(next);
      setEditing(false);
      setDraft(null);
      setConfirmDiscard(null);
      setJustSaved(true);
    }
  };

  React.useEffect(() => {
    if (!justSaved) return;
    const id = window.setTimeout(() => setJustSaved(false), 3000);
    return () => window.clearTimeout(id);
  }, [justSaved]);

  // ⌘/Ctrl+S saves, Esc cancels, while editing.
  const saveRef = React.useRef(saveEdits);
  saveRef.current = saveEdits;
  const cancelRef = React.useRef(requestCancel);
  cancelRef.current = requestCancel;
  React.useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!savingEdits) saveRef.current();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, savingEdits]);

  const speakerCode = labels[targetSpeaker] || 'C';
  const targetUtterances = React.useMemo(
    () => (transcriptData || []).filter((s) => !s.excluded && (s.speaker || 'Unknown') === targetSpeaker).length,
    [transcriptData, targetSpeaker],
  );

  // Months may be left blank: an age is usually said as "6 years", and the alternative
  // is refusing to generate over a field whose only sensible value is 0.
  const yearsValid = /^\d{1,2}$/.test(ageYears.trim());
  const monthsValid = ageMonths.trim() === ''
    || (/^\d{1,2}$/.test(ageMonths.trim()) && Number(ageMonths) <= 11);
  const ageValid = yearsValid && monthsValid;
  const age = yearsValid ? `${Number(ageYears)};${Number(ageMonths || 0)}` : '';
  const canGenerate = ageValid && task.trim() !== '' && targetUtterances > 0 && status !== 'loading';

  const reportMeta = {
    // The speaker's role, not a name: nothing identifying is sent to the service.
    speaker: preferredLabel(targetSpeaker).label === 'C' ? 'Child'
      : preferredLabel(targetSpeaker).label === 'E' ? 'Examiner' : 'Speaker',
    speakerCode,
    age,
    task: task.trim(),
    language: 'English',
    date: new Date().toISOString().slice(0, 10),
  };

  // A report generated from a transcript that has since been edited is not wrong, but it
  // no longer describes what is on screen — so say so rather than quietly showing it.
  const isStale = report != null && report.transcript_hash !== transcriptFingerprint(saltText);

  const generate = async () => {
    // Read-only views generate only when allowed, and only where there is no report yet.
    if (readOnly && (!allowGenerate || report)) return;
    setStatus('loading');
    setError('');
    setSaveWarning('');
    setConfirmRegen(false);
    setEditing(false);

    // The reference values are fetched BEFORE the report, so a norms failure costs
    // nothing: the ~20 s LLM call has not been spent yet, and the clinician gets the real
    // reason rather than a report that quietly lacks the comparison they asked for.
    let metrics: Record<string, LsaMetricInput> | undefined;
    let norms: LsaNormsContext | null = null;
    if (useNorms) {
      setPhase('norms');
      try {
        const bundle = await buildNormedMetrics({
          segments: transcriptData || [],
          targetSpeaker,
          ageYears: Number(ageYears),
          ageMonths: Number(ageMonths || 0),
          rangeMonths: normRange.trim() === '' ? undefined : Number(normRange),
        });
        metrics = bundle.metrics;
        norms = bundle.norms;
      } catch (e) {
        setError(e instanceof NoNormsError
          ? e.message
          : `Could not fetch the CHILDES reference values: ${(e as Error)?.message || e}`);
        setStatus('error');
        setPhase('report');
        return;
      }
    }
    setPhase('report');

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
        ...(metrics ? { metrics } : {}),
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
        metrics,
        norms,
        edits: undefined,
        edited_at: null,
        response,
      };
      setReport(stored);
      setStatus('ready');

      // The report exists either way; a failed save costs a regeneration next time, so it
      // is a warning on a finished report, never an error that discards it.
      if (saveReport) {
        try {
          const saved = await saveReport(stored);
          if (saved) setReport(saved);
        } catch (e) {
          setSaveWarning(`The report could not be saved: ${String((e as Error)?.message || e).replace(/^\d+ /, '')}`);
        }
      } else if (recordingId) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={requestClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-baseline gap-2 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">SATE Report</h2>
            {report && (
              <span className="text-xs text-gray-500 truncate" title={report.generated_at}>
                {saveWarning ? 'generated' : 'saved'} {new Date(report.generated_at).toLocaleString()}
                {report.edited_at && ` · edited ${new Date(report.edited_at).toLocaleDateString()}`}
                {report.generated_by && ` · generated by ${report.generated_by.role} ${report.generated_by.email || ''}`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {justSaved && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-700" role="status">
                <Check className="w-4 h-4" /> {saveWarning ? 'Applied' : 'Saved'}
              </span>
            )}
            {readOnly ? null : editing ? (
              <span className="px-2 py-1 text-xs font-medium text-teal-800 bg-teal-50 rounded-md">Editing</span>
            ) : (
              <button onClick={() => startEditing()} disabled={!report}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed transition-colors"
                title="Correct the drafted observations, limitations and summary">
                <Pencil className="w-4 h-4" /> Edit report
              </button>
            )}
            <button onClick={exportPdf} disabled={!report || editing}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
              <FileText className="w-4 h-4" /> Export PDF
            </button>
            <button onClick={exportWord} disabled={!report || editing}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 disabled:text-gray-400 disabled:border-gray-200 disabled:hover:bg-white disabled:cursor-not-allowed transition-colors">
              <FileType className="w-4 h-4" /> Export Word
            </button>
            <button onClick={requestClose} className="p-1.5 text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sample information — what the analysis needs and the transcript cannot supply.
            Hidden read-only: it exists to generate a report, and a viewer must not. */}
        {(!readOnly || (allowGenerate && !report)) && (
        <div className="flex flex-wrap items-end gap-3 px-5 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Patient age</span>
            <div className="flex items-center gap-1.5">
              <input
                value={ageYears}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                  setAgeYears(v);
                  persistAge(v, ageMonths);
                }}
                inputMode="numeric"
                placeholder="6"
                aria-label="Age in years"
                className={`w-14 px-2 py-1.5 text-sm text-right border rounded-md focus:ring-2 focus:ring-teal-500 focus:outline-none ${
                  ageYears && !yearsValid ? 'border-red-400' : 'border-gray-300'
                }`}
                title="Years"
              />
              <span className="text-xs text-gray-500">yr</span>
              <input
                value={ageMonths}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                  setAgeMonths(v);
                  persistAge(ageYears, v);
                }}
                inputMode="numeric"
                placeholder="0"
                aria-label="Age in months"
                className={`w-14 px-2 py-1.5 text-sm text-right border rounded-md focus:ring-2 focus:ring-teal-500 focus:outline-none ${
                  ageMonths && !monthsValid ? 'border-red-400' : 'border-gray-300'
                }`}
                title="Months past the birthday, 0-11"
              />
              <span className="text-xs text-gray-500">mo</span>
            </div>
          </div>
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
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Normative comparison</span>
            <div className="flex items-center gap-2 h-[34px]">
              <input
                type="checkbox"
                checked={useNorms}
                onChange={(e) => {
                  setUseNorms(e.target.checked);
                  persist('norms', e.target.checked ? '1' : '0');
                }}
                className="w-4 h-4 text-teal-700 border-gray-300 rounded focus:ring-teal-500"
              />
              <span className="text-sm text-gray-700">z-scores vs CHILDES TD</span>
              {useNorms && (
                <>
                  <span className="text-xs text-gray-500">±</span>
                  <input
                    value={normRange}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                      setNormRange(v);
                      persist('normRange', v);
                    }}
                    inputMode="numeric"
                    aria-label="Reference age window, in months"
                    className="w-12 px-2 py-1.5 text-sm text-right border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    title="Width of the reference age window, in months either side of the patient's age"
                  />
                  <span className="text-xs text-gray-500">mo</span>
                </>
              )}
            </div>
          </label>
          <button
            onClick={() => {
              // Regenerating replaces the drafted text, so it silently throws away a
              // clinician's review. Ask once, rather than letting one click undo it.
              if (report?.edits && !confirmRegen) { setConfirmRegen(true); return; }
              generate();
            }}
            disabled={!canGenerate || editing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            title={ageValid ? 'Analyse this transcript' : "Enter the patient's age in years first"}
          >
            {status === 'loading'
              ? (phase === 'norms'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Fetching norms…</>
                : <><Loader2 className="w-4 h-4 animate-spin" /> Analysing… {elapsed}s</>)
              : <><Sparkles className="w-4 h-4" /> {report ? 'Regenerate' : 'Generate report'}</>}
          </button>
        </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6 bg-gray-100">
          {confirmRegen && (
            <div className="mx-auto max-w-[760px] mb-4 flex items-start gap-2 p-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium">Regenerating discards your edits</div>
                <div className="text-amber-800 mb-2">
                  The observations, limitations and summary you edited will be replaced by a
                  freshly drafted set.
                </div>
                <div className="flex gap-2">
                  <button onClick={generate}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-amber-700 rounded-md hover:bg-amber-800">
                    Regenerate anyway
                  </button>
                  <button onClick={() => setConfirmRegen(false)}
                    className="px-3 py-1.5 text-xs font-medium text-amber-900 bg-white border border-amber-300 rounded-md hover:bg-amber-100">
                    Keep my edits
                  </button>
                </div>
              </div>
            </div>
          )}

          {isStale && (
            <div className="mx-auto max-w-[760px] mb-4 flex items-start gap-2 p-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">The transcript changed after this report was generated</div>
                <div className="text-amber-800">
                  It still shows the transcript it was built from.{readOnly ? '' : ' Regenerate to analyse the current one.'}
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

          {report && editing ? (
            <>
              <style>{EDIT_CSS}</style>
              <p className="mx-auto mb-2 flex items-center gap-1.5 text-xs text-teal-800" style={{ maxWidth: 760 }}>
                <Pencil className="w-3.5 h-3.5 flex-shrink-0" />
                Type straight into the outlined text. Transcript and metrics are computed and stay as they are.
              </p>
              <div key={editKey} ref={editorRef}
                   className="sate-report-edit bg-white shadow-sm mx-auto p-8 min-w-0"
                   style={{ maxWidth: 760 }}
                   onKeyDown={onEditorKeyDown}
                   onPaste={onEditorPaste} />
            </>
          ) : report ? (
            <div className="bg-white shadow-sm mx-auto p-8 min-w-0" style={{ maxWidth: 760 }}
                 dangerouslySetInnerHTML={{ __html: body }} />
          ) : (
            <div className="bg-white shadow-sm mx-auto p-8 text-sm text-gray-600" style={{ maxWidth: 760 }}>
              {loadingSaved ? (
                <p className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Looking for a saved report…
                </p>
              ) : readOnly && !allowGenerate ? (
                <p>No SATE Report has been generated for this recording yet.</p>
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
                    away next time, and the drafted observations can be corrected with <b>Edit</b>
                    {' '}before you use it.{readOnly ? ' (Here you can generate it; reviewing and editing the drafted text stays with the account owner.)' : ''} The transcript is sent to the SATE LSA service for
                    analysis; no patient or clinician name is attached to it.
                  </p>
                  <p className="mb-3 text-gray-500">
                    Tick <b>z-scores vs CHILDES TD</b> to send this sample's MLU, TNW and NDW with
                    age-matched reference values, so the report's metrics table shows z-scores
                    instead of counts alone. CHILDES publishes references for MLU only; the other
                    metrics appear as NO REF.
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

        {/* Always visible while editing, so Save never scrolls out of reach. */}
        {editing && !readOnly && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-gray-200 bg-white rounded-b-xl">
            {confirmDiscard ? (
              <>
                <span className="flex items-center gap-2 text-sm text-amber-900">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  Discard your unsaved changes?
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDiscard(null)}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                    Keep editing
                  </button>
                  <button
                    onClick={() => { const closing = confirmDiscard === 'close'; cancelEditing(); if (closing) onClose(); }}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">
                    Discard
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="text-xs text-gray-500">
                  {dirty ? <span className="font-medium text-amber-700">Unsaved changes</span> : 'No changes yet'}
                  <span className="hidden sm:inline"> · ⌘/Ctrl+S to save · Esc to cancel</span>
                </span>
                <div className="flex gap-2">
                  <button onClick={revertAll} disabled={savingEdits}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                    title="Put back everything the language model wrote (not saved until you press Save)">
                    <Undo2 className="w-4 h-4" /> Revert to AI text
                  </button>
                  <button onClick={requestCancel} disabled={savingEdits}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={saveEdits} disabled={savingEdits || !dirty}
                    className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                    {savingEdits
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                      : <><Check className="w-4 h-4" /> Save report</>}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
