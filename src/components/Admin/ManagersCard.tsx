// Admin → Managers. A manager may VIEW (read-only) the accounts assigned here, through
// /oversight. Every grant, revoke, assignment and view is written to sate_access_audit.

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, UserPlus, X } from 'lucide-react';
import { oversightService, type ManagerRow } from '@/services/oversightService';

export function ManagersCard({ userEmails }: { userEmails: string[] }) {
  const [rows, setRows] = useState<ManagerRow[] | null>(null);
  const [newManager, setNewManager] = useState('');
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    oversightService.listManagers().then(setRows).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <section className="bg-white border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="font-semibold">Managers</h2>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>
      <p className="text-sm text-gray-500 mb-3">
        A manager can view — read-only — the full reports of the accounts assigned to them. Every view is logged.
        Managers are emailed (within ~5 minutes) when an assigned account uploads a new report — no patient data in the email.
      </p>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      <datalist id="sate-user-emails">{userEmails.map((e) => <option key={e} value={e} />)}</datalist>

      <div className="flex gap-2 mb-4">
        <input list="sate-user-emails" value={newManager} onChange={(e) => setNewManager(e.target.value)}
          placeholder="Make a manager: account email" className="flex-1 border rounded-md px-2 py-1.5 text-sm" />
        <button disabled={!newManager.trim() || busy}
          onClick={() => run(async () => { await oversightService.addManager(newManager.trim()); setNewManager(''); })}
          className="text-sm px-3 py-1.5 rounded-md bg-violet-600 text-white disabled:opacity-40 flex items-center gap-1">
          <UserPlus className="w-4 h-4" /> Add manager
        </button>
      </div>

      {rows && !rows.length && <p className="text-sm text-gray-500">No managers yet.</p>}
      <div className="space-y-3">
        {(rows || []).map((m) => (
          <div key={m.id} className="border rounded-md p-3">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{m.email || m.id}</span>
              <span className="text-xs text-gray-500">{m.members.length} assigned</span>
              <button
                onClick={() => run(() => oversightService.setManagerNotify(m.id, m.notify_email === false))}
                disabled={busy}
                title={m.notify_email === false ? 'Turn on the new-report email' : 'Turn off the new-report email'}
                className={`ml-auto inline-flex items-center gap-1 text-xs rounded-full border px-2 py-0.5 ${
                  m.notify_email === false ? 'border-gray-200 text-gray-500' : 'border-green-200 bg-green-50 text-green-700'}`}>
                {m.notify_email === false ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
                New-report email {m.notify_email === false ? 'off' : 'on'}
              </button>
              <button className="text-xs text-red-600"
                onClick={() => window.confirm(`Remove ${m.email} as a manager? They lose access to every assigned account.`)
                  && run(() => oversightService.removeManager(m.id))}>
                Remove manager
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {m.members.map((x) => (
                <span key={x.id} className="text-xs px-2 py-1 rounded-full bg-violet-50 text-violet-800 flex items-center gap-1">
                  {x.email || x.id}
                  <button title="Unassign" onClick={() => run(() => oversightService.unassignMember(m.id, x.id))}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input list="sate-user-emails" value={assign[m.id] || ''} onChange={(e) => setAssign({ ...assign, [m.id]: e.target.value })}
                placeholder="Assign an account: email" className="flex-1 border rounded-md px-2 py-1 text-xs" />
              <button disabled={!(assign[m.id] || '').trim() || busy}
                onClick={() => run(async () => { await oversightService.assignMember(m.id, assign[m.id].trim()); setAssign({ ...assign, [m.id]: '' }); })}
                className="text-xs px-2 py-1 rounded-md border disabled:opacity-40">
                Assign
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
