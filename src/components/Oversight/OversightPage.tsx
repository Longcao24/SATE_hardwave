// Oversight — READ-ONLY view of another account, for admins and managers.
//
// Deliberately a page of its own rather than the normal app in a "view as" mode: the
// normal report UI writes from a dozen places (save transcript, rename, flags, patient,
// LSA, delete), and a read-only mode that missed one would edit someone else's clinical
// record. This page reads only through device-api /oversight/* (checked per target and
// audited server-side) and has no control that changes anything.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, Loader2, Search, ShieldCheck, Users } from 'lucide-react';
import { oversightService, type OversightMe, type OversightRecordingRow } from '@/services/oversightService';
import { recordingLabel } from '@/services/recordingName';
import { OversightReportView } from './OversightReportView';

type Tab = 'recordings' | 'patients' | 'devices';

const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtDur = (sec?: number | null) => {
  if (!sec && sec !== 0) return '—';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}h ${m}m` : `${m}:${String(r).padStart(2, '0')}`;
};

export default function OversightPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<OversightMe | null>(null);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<{ id: string; email: string | null } | null>(null);
  const [tab, setTab] = useState<Tab>('recordings');
  const [recs, setRecs] = useState<OversightRecordingRow[] | null>(null);
  const [patients, setPatients] = useState<Record<string, any>[] | null>(null);
  const [devices, setDevices] = useState<Record<string, any>[] | null>(null);
  const [sessions, setSessions] = useState<Record<string, any>[] | null>(null);
  const [openRec, setOpenRec] = useState<(Record<string, any> & { audio_url: string | null }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [params] = useSearchParams();
  useEffect(() => {
    oversightService.me().then((m) => {
      setMe(m);
      // Admin → account → "Open this account" lands here with ?user=<id>.
      const want = params.get('user');
      const t = want ? m.targets.find((x) => x.id === want) : undefined;
      if (t) setTarget(t);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the selected account. Patients are needed for every tab (names on recordings).
  useEffect(() => {
    if (!target) return;
    setRecs(null); setPatients(null); setDevices(null); setSessions(null); setOpenRec(null); setError(null);
    setLoading(true);
    Promise.all([oversightService.recordings(target.id), oversightService.patients(target.id)])
      .then(([r, p]) => { setRecs(r); setPatients(p); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [target]);

  useEffect(() => {
    if (!target || tab !== 'devices' || devices) return;
    Promise.all([oversightService.devices(target.id), oversightService.sessions(target.id)])
      .then(([d, s]) => { setDevices(d); setSessions(s); })
      .catch((e) => setError(e.message));
  }, [target, tab, devices]);

  const patientName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of patients || []) m.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unnamed');
    return m;
  }, [patients]);

  const [opening, setOpening] = useState<string | null>(null);
  const openRecording = async (rid: string) => {
    if (!target) return;
    setLoading(true); setError(null); setOpening(rid);
    try { setOpenRec(await oversightService.recording(target.id, rid)); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); setOpening(null); }
  };

  if (!me) return <Centered><Loader2 className="w-5 h-5 animate-spin" /></Centered>;
  if (me.role === 'none') {
    return (
      <Centered>
        <p className="text-gray-600">You do not have access to other accounts.</p>
        <button className="mt-3 text-sm text-blue-600" onClick={() => navigate('/')}>Back to SATE</button>
      </Centered>
    );
  }

  const shown = me.targets.filter((t) => (t.email || t.id).toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-800"><ArrowLeft className="w-5 h-5" /></button>
        <ShieldCheck className="w-5 h-5 text-violet-600" />
        <h1 className="font-semibold">Account oversight</h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 uppercase tracking-wide">{me.role}</span>
        <span className="ml-auto text-xs text-gray-500 flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Read-only · every view is logged</span>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Accounts */}
        <aside className="w-72 border-r bg-white flex flex-col">
          <div className="p-3 border-b">
            <div className="flex items-center gap-2 border rounded-md px-2">
              <Search className="w-4 h-4 text-gray-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an account"
                className="w-full py-1.5 text-sm outline-none" />
            </div>
            <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {me.role === 'admin' ? `${me.targets.length} accounts` : `${me.targets.length} assigned to you`}
            </p>
          </div>
          <div className="overflow-y-auto flex-1">
            {shown.map((t) => (
              <button key={t.id} onClick={() => { setTarget(t); setTab('recordings'); }}
                className={`w-full text-left px-3 py-2 text-sm border-b hover:bg-gray-50 ${target?.id === t.id ? 'bg-violet-50 font-medium' : ''}`}>
                {t.email || t.id}
              </button>
            ))}
            {!shown.length && <p className="p-3 text-sm text-gray-500">No accounts.</p>}
          </div>
        </aside>

        {/* Selected account */}
        <main className="flex-1 overflow-y-auto p-5">
          {!target && <p className="text-gray-500">Choose an account to view.</p>}
          {target && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-semibold">{target.email}</h2>
                {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              </div>
              {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

              {openRec ? (
                <OversightReportView ownerId={target.id} ownerEmail={target.email} rec={openRec}
                  patient={openRec.patient_id ? patientName.get(openRec.patient_id) : undefined}
                  onBack={() => setOpenRec(null)}
                  recordings={recs || []} patientName={patientName}
                  onOpen={openRecording} opening={opening} error={error} />
              ) : (
                <>
                  <div className="flex gap-2 mb-4">
                    {(['recordings', 'patients', 'devices'] as Tab[]).map((t) => (
                      <button key={t} onClick={() => setTab(t)}
                        className={`px-3 py-1.5 text-sm rounded-md border ${tab === t ? 'bg-violet-600 text-white border-violet-600' : 'bg-white'}`}>
                        {t[0].toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>

                  {tab === 'recordings' && (
                    <Table head={['Recording', 'Patient', 'Recorded', 'Length', '']}>
                      {(recs || []).map((r) => (
                        <tr key={r.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => openRecording(r.id)}>
                          <td className="py-2 px-3" title={r.file_name || ''}>{recordingLabel(r.recording_name || r.file_name)}</td>
                          <td className="py-2 px-3">{r.patient_id ? patientName.get(r.patient_id) ?? '—' : 'Unassigned'}</td>
                          <td className="py-2 px-3">{fmtDate(r.created_at)}</td>
                          <td className="py-2 px-3">{fmtDur(r.duration)}</td>
                          <td className="py-2 px-3 text-right text-violet-600">Open</td>
                        </tr>
                      ))}
                      {recs && !recs.length && <EmptyRow cols={5} />}
                    </Table>
                  )}

                  {tab === 'patients' && (
                    <Table head={['Name', 'Date of birth', 'Diagnosis', 'Active', 'Recordings']}>
                      {(patients || []).map((p) => (
                        <tr key={p.id} className="border-t">
                          <td className="py-2 px-3">{patientName.get(p.id)}</td>
                          <td className="py-2 px-3">{p.date_of_birth || '—'}</td>
                          <td className="py-2 px-3">{p.diagnosis || '—'}</td>
                          <td className="py-2 px-3">{p.is_active === false ? 'No' : 'Yes'}</td>
                          <td className="py-2 px-3">{(recs || []).filter((r) => r.patient_id === p.id).length}</td>
                        </tr>
                      ))}
                      {patients && !patients.length && <EmptyRow cols={5} />}
                    </Table>
                  )}

                  {tab === 'devices' && (
                    <>
                      <Table head={['Device', 'Serial', 'Kind', 'Firmware', 'Last seen']}>
                        {(devices || []).map((d) => (
                          <tr key={d.id} className="border-t">
                            <td className="py-2 px-3">{d.name}</td>
                            <td className="py-2 px-3 font-mono text-xs">{d.serial}</td>
                            <td className="py-2 px-3">{d.kind}</td>
                            <td className="py-2 px-3">{d.fw || '—'}</td>
                            <td className="py-2 px-3">{fmtDate(d.last_seen)}</td>
                          </tr>
                        ))}
                        {devices && !devices.length && <EmptyRow cols={5} />}
                      </Table>
                      <h3 className="mt-6 mb-2 font-medium text-sm text-gray-700">Uploaded sessions</h3>
                      <Table head={['Device', 'Uploaded', 'Status', 'Length', 'Error']}>
                        {(sessions || []).map((s) => (
                          <tr key={s.id} className="border-t">
                            <td className="py-2 px-3 font-mono text-xs">{s.device_serial}</td>
                            <td className="py-2 px-3">{fmtDate(s.created_at)}</td>
                            <td className="py-2 px-3">{s.status}</td>
                            <td className="py-2 px-3">{fmtDur(s.audio_seconds ?? (s.bytes ? (s.bytes - 44) / 32000 : null))}</td>
                            <td className="py-2 px-3 text-xs text-red-600">{s.process_error || ''}</td>
                          </tr>
                        ))}
                        {sessions && !sessions.length && <EmptyRow cols={5} />}
                      </Table>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-left">
          <tr>{head.map((h) => <th key={h} className="py-2 px-3 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return <tr className="border-t"><td colSpan={cols} className="py-3 px-3 text-gray-500">Nothing here.</td></tr>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex flex-col items-center justify-center">{children}</div>;
}
