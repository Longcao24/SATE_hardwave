import { useNavigate } from 'react-router-dom';
import type { Patient } from '@/services/patientService';
import { recordingActivityAt, type Recording } from '@/hooks/useRecordings';
import { timeAgo } from '@/hooks/useDevices';
import { Users, ChevronRight, FileAudio } from 'lucide-react';

/** Same summary rule as Connected Recorders: a few cards here, the full list on /patients. */
const MAX_SHOWN = 3;

interface RecentPatientsProps {
  patients: Patient[];
  recordings: Recording[];
}

const ms = (iso?: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

export default function RecentPatients({ patients, recordings }: RecentPatientsProps) {
  const navigate = useNavigate();

  if (patients.length === 0) return null;

  // "Edited" = the newest write to the patient's own profile OR to any of their recordings
  // (a transcript save, a rename, a report) — the patient a clinician last worked on, not
  // merely the one created most recently.
  const lastRec = new Map<string, number>();
  const count = new Map<string, number>();
  for (const r of recordings) {
    if (!r.patient_id) continue;
    const t = recordingActivityAt(r);
    if (t > (lastRec.get(r.patient_id) ?? 0)) lastRec.set(r.patient_id, t);
    count.set(r.patient_id, (count.get(r.patient_id) ?? 0) + 1);
  }
  const edited = (p: Patient) => Math.max(ms(p.updated_at), ms(p.created_at), lastRec.get(p.id) ?? 0);

  const shown = [...patients].sort((a, b) => edited(b) - edited(a)).slice(0, MAX_SHOWN);
  const hidden = patients.length - shown.length;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Recent Patients</h2>
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {patients.length}
          </span>
        </div>
        <button
          onClick={() => navigate('/patients')}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
        >
          {hidden > 0 ? 'View all' : 'Manage'} <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {shown.map(p => {
          const n = count.get(p.id) ?? 0;
          const name = `${p.first_name} ${p.last_name}`.trim();
          return (
            <button key={p.id} onClick={() => navigate(`/patients/${p.id}`)} className="device-card group">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 shrink-0 rounded-xl bg-blue-50 flex items-center justify-center text-sm font-semibold text-blue-600">
                  {(p.first_name?.charAt(0) ?? '') + (p.last_name?.charAt(0) ?? '')}
                </div>
                <div className="text-left min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                    {name}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5 truncate" title={p.diagnosis || undefined}>
                    {p.diagnosis || 'No diagnosis recorded'}
                  </p>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400 flex items-center gap-1.5">
                  <FileAudio className="w-3.5 h-3.5" />
                  {n} {n === 1 ? 'recording' : 'recordings'}
                </span>
                {/* Only created so far (no edit, no recording since): say so, like Recent Recordings' "New". */}
                <span className="text-xs text-gray-400">
                  {edited(p) - ms(p.created_at) > 5 * 60 * 1000 ? 'Edited' : 'Added'} {timeAgo(new Date(edited(p)).toISOString())}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
