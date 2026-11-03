// Admin → Usage → one account → Reports: every report of that account, and the full report on a click.
//
// Read through device-api's OVERSIGHT routes on purpose — the same ones /oversight uses: each read is
// role-checked per account and written to sate_access_audit BEFORE any data is returned, and the report
// view is the read-only OversightReportView (no control here changes anything). Analytics (the Worker)
// is not involved, so this tab works for an account that has never been tracked.

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, Loader2, Search } from 'lucide-react';
import { oversightService, type OversightRecordingRow } from '@/services/oversightService';
import { recordingLabel } from '@/services/recordingName';
import { OversightReportView } from '@/components/Oversight/OversightReportView';
import { ErrorBox, Spinner, friendlyError } from './ui';
import { useAuth } from '@/contexts/AuthProvider';

const fmtDate = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtLen = (s: number | null) => (!s ? '—' : s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);

export function UsageReports({ uid, email, openId, onOpen, onClose, onCount }: {
  uid: string; email: string | null;
  /** The report open in the URL (&report=), or null for the list. */
  openId: string | null;
  onOpen: (rid: string) => void; onClose: () => void;
  onCount?: (n: number) => void;
}) {
  const [recs, setRecs] = useState<OversightRecordingRow[] | null>(null);
  const [patients, setPatients] = useState<Record<string, any>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [rec, setRec] = useState<(Record<string, any> & { audio_url: string | null }) | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  // Oversight never serves the viewer's own account (that is the app's job), so don't ask it to.
  const { user } = useAuth();
  const own = !!user && user.id === uid;

  const load = () => {
    if (own) return;
    setError(null); setRecs(null);
    Promise.all([oversightService.recordings(uid), oversightService.patients(uid)])
      .then(([r, p]) => { setRecs(r); setPatients(p); onCount?.(r.length); })
      .catch((e) => setError(friendlyError(e)));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [uid, own]);

  // The open report comes from the URL; the one on screen stays up while the next one loads.
  useEffect(() => {
    if (!openId || own) { setRec(null); setOpenError(null); return; }
    let cancelled = false;
    setOpening(openId); setOpenError(null);
    oversightService.recording(uid, openId)
      .then((r) => { if (!cancelled) setRec(r); })
      .catch((e) => { if (!cancelled) setOpenError(friendlyError(e)); })
      .finally(() => { if (!cancelled) setOpening(null); });
    return () => { cancelled = true; };
  }, [uid, openId, own]);

  const patientName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of patients || []) m.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unnamed');
    return m;
  }, [patients]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!recs) return [];
    if (!t) return recs;
    return recs.filter((r) => [recordingLabel(r.recording_name || r.file_name), r.patient_id ? patientName.get(r.patient_id) : 'unassigned', r.protocol]
      .some((x) => (x || '').toLowerCase().includes(t)));
  }, [recs, q, patientName]);

  if (own) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
        This is your own account. Your reports are on your <a href="/" className="text-violet-700 hover:underline">Dashboard</a>.
      </div>
    );
  }

  if (openId && rec && rec.id === openId) {
    return (
      <OversightReportView ownerId={uid} ownerEmail={email} rec={rec}
        patient={rec.patient_id ? patientName.get(rec.patient_id) : undefined}
        onBack={onClose} recordings={recs || []} patientName={patientName}
        onOpen={onOpen} opening={opening} error={openError} />
    );
  }

  return (
    // Report names and patient names are clinical data: masked in any screen recording.
    <div data-usage-mask className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 bg-white border rounded-md px-2 flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a report, patient or protocol"
            className="w-full py-1.5 text-sm outline-none bg-transparent" />
        </div>
        <span className="text-xs text-gray-500">Read-only · opening a report is logged (as on Oversight)</span>
        <a href={`/oversight/${uid}`} className="ml-auto inline-flex items-center gap-1 text-xs text-violet-700 hover:underline">
          Open in Oversight <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {error && <ErrorBox error={error} onRetry={load} />}
      {openError && !opening && <ErrorBox error={openError} onRetry={() => openId && onOpen(openId)} />}
      {!recs && !error && <Spinner label="Loading this account's reports…" />}
      {opening && <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Opening the report…</div>}

      {recs && (
        recs.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">This account has no reports.</div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="font-medium px-4 py-2">Report</th>
                  <th className="font-medium px-3 py-2">Patient</th>
                  <th className="font-medium px-3 py-2">Protocol</th>
                  <th className="font-medium px-3 py-2">Recorded</th>
                  <th className="font-medium px-3 py-2 text-right">Length</th>
                  <th className="font-medium px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} onClick={() => onOpen(r.id)} data-track="Usage: open report"
                    className="border-t border-gray-100 hover:bg-violet-50/50 cursor-pointer">
                    <td className="px-4 py-2 text-gray-900 max-w-[22rem]" title={recordingLabel(r.recording_name || r.file_name)}>
                      <span className="flex items-center gap-2 min-w-0"><FileText className="w-4 h-4 text-violet-500 shrink-0" /><span className="truncate">{recordingLabel(r.recording_name || r.file_name)}</span></span>
                    </td>
                    <td className="px-3 py-2 text-gray-700 max-w-[12rem] truncate">{r.patient_id ? patientName.get(r.patient_id) ?? '—' : 'Unassigned'}</td>
                    <td className="px-3 py-2 text-gray-600 max-w-[10rem] truncate">{r.protocol || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtLen(r.duration)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.needs_review ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Needs review</span>
                        : r.segments_edited ? <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">Edited</span>
                        : <span className="text-xs text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-3 text-sm text-gray-500">No report matches “{q}”.</td></tr>}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
