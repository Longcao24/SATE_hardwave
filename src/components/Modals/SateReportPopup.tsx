import React from 'react';
import { X, FileText, FileType } from 'lucide-react';

// ---------------------------------------------------------------------------
// SATE Report — a single-sample clinical report matching the SALT-style layout.
//
// v1 uses the worked example's own text as PLACEHOLDER content, so the feature
// generates the report exactly as shown out of the box; real recording data can
// be threaded into REPORT later. The report body is built as one inline-styled
// HTML string so it renders identically in the on-screen preview, the print /
// PDF output, and the Word (.doc) export.
// ---------------------------------------------------------------------------

interface MetricRow {
  metric: string;
  value: string;
  z: number;          // standardized position, SD from mean
  reversed?: boolean; // true = higher is the concern side (e.g. Mazes)
  status: string;
  statusKind: 'typical' | 'above' | 'below';
}

interface AssessmentRow {
  domain: string;
  observation: string;
  status: string;
  statusKind: 'strength' | 'monitor' | 'ok' | 'short';
}

interface ReportData {
  title: string;
  header: { label: string; value: string }[];
  transcript: string[];
  transcriptCodes: string;
  metrics: MetricRow[];
  metricsLegend: string[];
  assessment: AssessmentRow[];
  limitations: string[];
  summary: string;
}

// The worked example (placeholder content).
const REPORT: ReportData = {
  title: 'SATE Report',
  header: [
    { label: 'Speaker', value: 'Child (C)' },
    { label: 'Age', value: '6;0' },
    { label: 'Language', value: 'English' },
    { label: 'Task', value: 'Narrative (picture-elicited)' },
    { label: 'Utterances', value: '8' },
    { label: 'Format', value: 'SALT' },
  ],
  transcript: [
    'C The giraffe see/3s an elephant.',
    'C And the elephant is bounce/ing a ball.',
    'C And the ball fell in the water.',
    'C And the giraffe see/3s it.',
    'C And the giraffe go/3s in the water.',
    'C (And tr) and try/3s to get the ball.',
    'C And then the giraffe got to the ball and give/3s it to the elephant.',
    'C And the elephant thank/ed him.',
  ],
  transcriptCodes: 'Codes: /3s 3rd-sg;  /ing progressive;  /ed past;  ( ) maze (excluded).',
  metrics: [
    { metric: 'MLU words', value: '7.00', z: 0.6, status: 'Typical', statusKind: 'typical' },
    { metric: 'MLU morphemes', value: '7.88', z: 0.9, status: 'Typical', statusKind: 'typical' },
    { metric: 'Total Words', value: '56', z: 0.0, status: 'Typical', statusKind: 'typical' },
    { metric: 'Different Words', value: '23', z: -0.4, status: 'Typical', statusKind: 'typical' },
    { metric: 'Type–Token Ratio', value: '0.41', z: -0.5, status: 'Typical', statusKind: 'typical' },
    { metric: 'Mazes (%)', value: '12.5', z: 0.6, reversed: true, status: 'Typical', statusKind: 'typical' },
    { metric: 'Grammatical (%)', value: '100', z: 2.1, status: 'Above avg', statusKind: 'above' },
  ],
  metricsLegend: [
    'Every bar shares one standardized axis (−3 to +3 SD from the tentative reference mean): green = typical (±1 SD), the ▼ marks the metric’s z-score; red = concern side, blue = opposite.',
    'Mazes are reversed (higher = more mazes = concern). Norm values are illustrative only; raw values are in the Value column.',
  ],
  assessment: [
    { domain: 'Morphology', statusKind: 'strength', status: 'Strength',
      observation: 'All inflections correct in obligatory contexts: 3rd-sg -s (5/5), -ing, -ed, irregular past. No errors; the tense/agreement markers most sensitive to DLD are intact.' },
    { domain: 'Tense consistency', statusKind: 'monitor', status: 'Monitor',
      observation: 'Alternates present (sees/goes/tries/gives) and past (fell/got/thanked) across the story and within utterance 7. A discourse-cohesion feature, not a grammatical error; common at this age.' },
    { domain: 'Syntax', statusKind: 'ok', status: 'Age-appropriate',
      observation: 'Mainly simple SVO with “and / and then” chaining; emerging complexity (one infinitival complement, one coordinated clause).' },
    { domain: 'Lexical diversity', statusKind: 'short', status: 'Short sample',
      observation: 'Varied, concrete vocabulary (8 distinct verbs); not interpretable at this sample length.' },
    { domain: 'Narrative / Pragmatics', statusKind: 'strength', status: 'Strength',
      observation: 'Coherent event sequence with a problem–resolution structure; appropriate pronoun reference (it = ball, him = elephant).' },
  ],
  limitations: [
    'Only 8 utterances — a screening-level sample; all normative comparisons are illustrative and cannot support a diagnosis.',
    'Narrative task; norm bands are tentative and require a narrative-, age-matched reference, with count metrics (TNW, NDW, TTR, Mazes) matched to the same number of analyzed utterances.',
    'Recommend re-administration with ≥ 50 utterances (conversation) or ≥ 100 (Wisconsin / SALT narrative conventions).',
  ],
  summary:
    'Within the limits of this short sample, morphosyntax is a clear strength: tense and agreement markers are intact with no morphological errors, the narrative is coherent with emerging complex syntax, and MLU is age-appropriate (upper range). The single point to monitor is narrative tense consistency — a discourse-cohesion feature rather than a grammatical deficit. Findings are preliminary; a longer sample is recommended for confirmation.',
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

const STATUS_BG: Record<string, string> = {
  strength: '#d6f5df', monitor: '#ffe8cf', ok: '#eef3ee', short: '#eceff2',
};
const STATUS_FG: Record<string, string> = {
  typical: '#15803d', above: '#1d4ed8', below: '#b91c1c',
};

// The full report body as inline-styled HTML — shared by preview, print, and Word.
function buildReportBody(r: ReportData): string {
  const H = '#0c6b74';           // section / title accent
  const INK = '#16202e', MUT = '#5c6b7a', HAIR = '#e3e7ec';
  const h2 = (n: number, t: string) =>
    `<h2 style="font-size:14px;color:${H};margin:22px 0 8px;padding-bottom:3px;` +
    `border-bottom:1px solid ${HAIR};font-family:Georgia,'Times New Roman',serif;">` +
    `<span style="color:${H};">${n}</span>&nbsp;&nbsp;${t}</h2>`;

  const headerLine = r.header
    .map((h) => `<span style="margin-right:16px;white-space:nowrap;"><b>${esc(h.label)}:</b> ${esc(h.value)}</span>`)
    .join('');

  const transcript =
    `<div style="border:1px solid ${HAIR};border-radius:8px;background:#fbfcfd;padding:12px 14px;` +
    `font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:12px;line-height:1.7;color:${INK};` +
    `white-space:pre-wrap;">${r.transcript.map(esc).join('\n')}</div>` +
    `<p style="font-size:11.5px;color:${MUT};margin:6px 0 0;font-style:italic;">${esc(r.transcriptCodes)}</p>`;

  const metricRows = r.metrics.map((m) => `
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid ${HAIR};">${esc(m.metric)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid ${HAIR};text-align:right;font-variant-numeric:tabular-nums;">${esc(m.value)}</td>
      <td style="padding:7px 14px;border-bottom:1px solid ${HAIR};width:42%;">${barHtml(m.z, m.reversed)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid ${HAIR};color:${STATUS_FG[m.statusKind] || INK};font-weight:600;">${esc(m.status)}</td>
    </tr>`).join('');
  const axisTicks = ['−3', '−2', '−1', '0', '1', '2', '3']
    .map((t) => `<span>${t}</span>`).join('');
  const metricsTable =
    `<table style="width:100%;border-collapse:collapse;font-size:12.5px;color:${INK};">` +
    `<thead><tr style="text-align:left;color:${INK};">` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};">Metric</th>` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};text-align:right;">Value</th>` +
    `<th style="padding:6px 14px;border-bottom:2px solid ${HAIR};">Standardized position (SD from mean)</th>` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};">Status</th>` +
    `</tr></thead><tbody>${metricRows}</tbody></table>` +
    `<div style="display:flex;justify-content:space-between;width:42%;margin:2px 0 0 auto;padding:0 14px;` +
    `font-size:9.5px;color:#94a3b8;font-variant-numeric:tabular-nums;">${axisTicks}</div>` +
    r.metricsLegend.map((l) =>
      `<p style="font-size:11px;color:${MUT};font-style:italic;margin:8px 0 0;line-height:1.5;">${esc(l)}</p>`).join('');

  const assessmentRows = r.assessment.map((a) => `
    <tr>
      <td style="padding:9px 10px;border-bottom:1px solid ${HAIR};font-weight:700;vertical-align:top;width:20%;">${esc(a.domain)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${HAIR};vertical-align:top;line-height:1.5;">${esc(a.observation)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${HAIR};vertical-align:top;width:15%;">` +
        `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:11.5px;font-weight:600;` +
        `background:${STATUS_BG[a.statusKind]};color:${INK};">${esc(a.status)}</span></td>
    </tr>`).join('');
  const assessmentTable =
    `<table style="width:100%;border-collapse:collapse;font-size:12.5px;color:${INK};">` +
    `<thead><tr style="text-align:left;">` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};">Domain</th>` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};">Key observation</th>` +
    `<th style="padding:6px 10px;border-bottom:2px solid ${HAIR};">Status</th>` +
    `</tr></thead><tbody>${assessmentRows}</tbody></table>`;

  const limitations =
    `<ul style="margin:4px 0 0;padding-left:20px;font-size:12.5px;color:${INK};line-height:1.6;">` +
    r.limitations.map((l) => `<li style="margin:0 0 5px;">${esc(l)}</li>`).join('') + `</ul>`;

  const summary =
    `<p style="font-size:12.5px;color:${INK};line-height:1.6;margin:4px 0 0;">${esc(r.summary)}</p>`;

  return (
    `<div style="font-family:Georgia,'Times New Roman',serif;color:${INK};max-width:720px;margin:0 auto;">` +
      `<div style="text-align:center;border-bottom:2px solid ${H};padding-bottom:10px;margin-bottom:14px;">` +
        `<h1 style="font-size:20px;color:${H};margin:0;font-family:Georgia,'Times New Roman',serif;">${esc(r.title)} ` +
        `<span style="color:${MUT};font-size:14px;font-weight:normal;">(Example)</span></h1>` +
      `</div>` +
      `<p style="font-size:12.5px;color:${INK};margin:0 0 4px;line-height:1.9;">${headerLine}</p>` +
      h2(1, 'Transcript') + transcript +
      h2(2, 'Metrics &amp; Normative Comparison') + metricsTable +
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

// Persist the typed patient age so it's entered once and remembered. Keyed per
// recording when we know which one; falls back to a global key otherwise.
const ageStorageKey = (recordingId?: string) =>
  recordingId ? `sate_report_age:${recordingId}` : 'sate_report_age';

export const SateReportPopup: React.FC<{ isOpen: boolean; onClose: () => void; recordingId?: string }> = ({
  isOpen, onClose, recordingId,
}) => {
  const storageKey = ageStorageKey(recordingId);
  const [age, setAge] = React.useState<string>('6;0');

  // Load the saved age whenever the report opens for a (different) recording.
  React.useEffect(() => {
    if (!isOpen) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved != null && saved !== '') setAge(saved);
    } catch { /* localStorage unavailable — keep the default */ }
  }, [isOpen, storageKey]);

  const onAgeChange = (v: string) => {
    setAge(v);
    try { localStorage.setItem(storageKey, v); } catch { /* ignore */ }
  };

  if (!isOpen) return null;

  // Inject the saved/typed age into the report so the preview AND both exports use it.
  const data: ReportData = {
    ...REPORT,
    header: REPORT.header.map((h) => (h.label === 'Age' ? { ...h, value: age } : h)),
  };
  const body = buildReportBody(data);

  const exportPdf = () => {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">SATE Report</h2>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-gray-600 mr-1">
              <span className="whitespace-nowrap">Patient age</span>
              <input
                value={age}
                onChange={(e) => onAgeChange(e.target.value)}
                placeholder="Y;M"
                className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:outline-none"
                title="Enter once (e.g. 6;0) — it's saved and reused for this report"
              />
            </label>
            <button onClick={exportPdf}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors">
              <FileText className="w-4 h-4" /> Export PDF
            </button>
            <button onClick={exportWord}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors">
              <FileType className="w-4 h-4" /> Export Word
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto p-6 bg-gray-100">
          <div className="bg-white shadow-sm mx-auto p-8" style={{ maxWidth: 760 }}
               dangerouslySetInnerHTML={{ __html: body }} />
        </div>
      </div>
    </div>
  );
};
