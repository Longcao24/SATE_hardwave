import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Pencil, Check, AlertTriangle } from 'lucide-react';
import { SoapApiError, loadPatientDefaults, savePatientDefaults } from '@/services/soapService';
import { SOAP_LIMITS, type SoapPatientDefaultsResponse } from '@/services/soapTypes';

// SOAP defaults — the goals, plan, setting and patient code this clinician wants every SOAP note
// for this patient to start from, so they are not retyped each session. They live in the SOAP
// Worker's own store (per clinician + patient), not in the patient record: they are one
// clinician's drafting inputs, not facts about the patient that every user of the record shares.
// The SOAP tab prefills EMPTY fields from them and can save them back on Generate.

interface Draft {
  goals: string;
  treatment_plan: string;
  setting: string;
  label: string;
}

const toDraft = (r: SoapPatientDefaultsResponse | null): Draft => ({
  goals: r?.defaults?.goals ?? '',
  treatment_plan: r?.defaults?.treatment_plan ?? '',
  setting: r?.defaults?.setting ?? '',
  label: r?.defaults?.label ?? '',
});

const FIELDS: Array<{ key: keyof Draft; label: string; hint?: string; multiline?: boolean; max: number }> = [
  { key: 'label', label: 'Patient ID', hint: 'code or initials — never the name', max: SOAP_LIMITS.maxLabelChars },
  { key: 'setting', label: 'Setting', max: SOAP_LIMITS.maxSettingChars },
  { key: 'goals', label: 'Therapy goals', multiline: true, max: SOAP_LIMITS.maxFieldChars },
  { key: 'treatment_plan', label: 'Treatment plan', multiline: true, max: SOAP_LIMITS.maxFieldChars },
];

export const SoapDefaultsCard: React.FC<{ patientId: string }> = ({ patientId }) => {
  const [data, setData] = React.useState<SoapPatientDefaultsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(toDraft(null));
  const [saving, setSaving] = React.useState(false);
  // Editing is offered only once a load has SUCCEEDED. The PUT replaces the whole record, so an
  // editor opened after a failed load would start from empty boxes and its save would silently
  // erase goals/plan/code the clinician never got to see.
  const [loaded, setLoaded] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  // The patient this card currently belongs to. A save still in flight when the clinician moves to
  // another patient must not land on that patient's card (the parent also keys the card by patient).
  const currentPid = React.useRef(patientId);
  currentPid.current = patientId;

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoaded(false);
    setData(null);
    setError('');
    setEditing(false);
    loadPatientDefaults(patientId)
      .then((r) => { if (!cancelled) { setData(r); setLoaded(true); } })
      .catch((e) => { if (!cancelled) setError(e instanceof SoapApiError ? e.message : 'Could not load SOAP defaults.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patientId, reloadKey]);

  const save = async () => {
    const pid = patientId;
    setSaving(true);
    setError('');
    try {
      const t = (v: string) => v.trim() || undefined;
      const r = await savePatientDefaults(pid, {
        goals: t(draft.goals),
        treatment_plan: t(draft.treatment_plan),
        setting: t(draft.setting),
        label: t(draft.label),
      });
      if (currentPid.current !== pid) return;
      setData(r);
      setEditing(false);
    } catch (e) {
      if (currentPid.current !== pid) return;
      // The draft stays in the boxes: a failed save must never cost what was typed.
      setError(`Not saved: ${e instanceof SoapApiError ? e.message : (e as Error)?.message || 'unknown error'}`);
    } finally {
      if (currentPid.current === pid) setSaving(false);
    }
  };

  const d = data?.defaults;
  const lr = data?.last_reviewed;
  const tooLong = FIELDS.some((f) => draft[f.key].length > f.max);
  const inputCls = 'w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:outline-none';

  return (
    <Card className="p-6 md:col-span-2">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold">SOAP defaults</h3>
        {!editing && !loading && loaded && (
          <Button variant="outline" size="sm" onClick={() => { setDraft(toDraft(data)); setError(''); setEditing(true); }}
            className="text-teal-700 border-teal-200 hover:bg-teal-50">
            <Pencil className="w-3.5 h-3.5 mr-1" /> {d ? 'Edit' : 'Set defaults'}
          </Button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Your starting values for this patient's SOAP notes. They fill only empty fields, and the SOAP tab
        shows where each prefilled value came from.
      </p>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
      ) : editing ? (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">
                  {f.label}{f.hint && <span className="font-normal text-gray-400"> · {f.hint}</span>}
                </span>
                {f.multiline
                  ? <textarea rows={4} value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} className={inputCls} />
                  : <input value={draft[f.key]} maxLength={f.max} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} className={inputCls} />}
              </label>
            ))}
          </div>
          {tooLong && <p className="text-xs text-amber-800">A field is longer than allowed.</p>}
          <div className="flex items-center justify-end gap-2">
            {error && <span className="mr-auto text-xs text-red-700">{error}</span>}
            <Button variant="outline" size="sm" onClick={() => { setEditing(false); setError(''); }} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving || tooLong} className="bg-teal-700 hover:bg-teal-800 text-white">
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />} Save
            </Button>
          </div>
          <p className="text-[11px] text-gray-500">Clearing every field removes the defaults.</p>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4" /> {error}
          {!loaded && (
            <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)} className="ml-auto">Retry</Button>
          )}
        </div>
      ) : d ? (
        <dl className="grid gap-3 md:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <dt className="text-sm text-gray-600">{f.label}</dt>
              <dd className={`text-sm whitespace-pre-wrap ${d[f.key]?.trim() ? 'font-medium' : 'text-gray-400 italic'}`}>
                {d[f.key]?.trim() || 'Not set'}
              </dd>
            </div>
          ))}
          <p className="md:col-span-2 text-xs text-gray-400">Updated {new Date(d.updated_at).toLocaleString()}</p>
        </dl>
      ) : (
        <p className="text-sm text-gray-500">
          No defaults yet.
          {lr
            ? ` Until you set some, the SOAP tab starts from ${lr.session_date && lr.session_date !== 'Not documented'
                ? `your reviewed note of ${lr.session_date}` : 'your last reviewed note'}.`
            : ' You can set them here, or tick “Save … as this patient’s defaults” in the SOAP tab.'}
        </p>
      )}
    </Card>
  );
};
