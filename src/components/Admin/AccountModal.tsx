// Admin → one account: its numbers, and what an admin may do to it (device-api v35).
//
// The destructive actions are ordered and worded by consequence:
//   * Disable  — sign-in blocked, every recording kept. Reversible. The normal choice.
//   * Delete   — PERMANENT. Deleting the auth user cascades to recordings, patients, sessions,
//                devices and billing rows, and the server also removes the account's audio.
//                It asks for the account's email typed back, and the server checks it again.
// An admin account cannot be disabled or deleted here (the server refuses too).

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, Eye, KeyRound, Loader2, Mic, ShieldCheck, Trash2, UserCheck, X } from 'lucide-react';
import { deviceApiService } from '@/services/device/deviceApiService';
import type { AdminUserDetail } from '@/services/device/deviceTypes';

export const fmtHours = (sec?: number | null) => {
  const s = Math.round(sec || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export interface NotesSwitch {
  /** null = the notes service did not answer — shown as unknown, never as Off (see AdminPage). */
  on: boolean | null;
  saving: boolean;
  count?: number;
  toggle: (enabled: boolean) => void;
}

export function AccountModal({ userId, onClose, onChanged, notes }: {
  userId: string; onClose: () => void; onChanged: () => void; notes?: NotesSwitch;
}) {
  const navigate = useNavigate();
  const [u, setU] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  const load = () => deviceApiService.adminGetUser(userId).then(setU).catch((e) => setError(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setError(null); setNote(null);
    try { await fn(); setNote(done); await load(); onChanged(); }
    catch (e: any) { setError(String(e.message || e).replace(/^\d+ /, '')); }
    finally { setBusy(false); }
  };

  const protectedAcct = !!u?.is_admin;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 p-5 border-b">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate">{u?.email || 'Account'}</h2>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {u?.is_admin && <Badge tone="violet">admin</Badge>}
              {u?.is_manager && <Badge tone="blue">manager</Badge>}
              {u?.disabled ? <Badge tone="red">disabled</Badge> : u && <Badge tone="green">active</Badge>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        {!u && !error && <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>}
        {error && <div className="mx-5 mt-4 rounded-md bg-red-50 text-red-700 text-sm p-3">{error}</div>}
        {note && <div className="mx-5 mt-4 rounded-md bg-green-50 text-green-700 text-sm p-3">{note}</div>}

        {u && (
          <div className="p-5 space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Total audio" value={fmtHours(u.stats.audio_seconds)} big />
              <Stat label="Reports" value={u.stats.recordings} big />
              <Stat label="SATE reports" value={u.stats.sate_reports} big />
              <Stat label="Patients" value={u.stats.patients} big />
              <Stat label="Uploaded sessions" value={u.stats.sessions} />
              <Stat label="Devices" value={u.stats.devices} />
              <Stat label="Last recording" value={fmtDate(u.stats.last_recording_at)} />
              <Stat label="Last sign-in" value={fmtDate(u.last_sign_in_at)} />
            </div>
            <p className="text-xs text-gray-500">Joined {fmtDate(u.created_at)} · email {u.email_confirmed_at ? 'confirmed' : 'not confirmed'}</p>

            {notes && (
              <Section title="Features" icon={<Mic className="w-4 h-4" />}>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-800">Meeting notes</div>
                    <div className="text-xs text-gray-500">
                      Off for every account until an admin turns it on.{notes.count ? ` ${notes.count} note${notes.count > 1 ? 's' : ''} so far.` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => notes.on !== null && notes.toggle(!notes.on)}
                    disabled={notes.on === null || notes.saving}
                    title={notes.on === null ? 'The notes service did not answer — try Refresh' : notes.on ? 'Revoke meeting notes' : 'Grant meeting notes'}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50 ${
                      notes.on ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    {notes.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
                    {notes.on === null ? 'unknown' : notes.on ? 'On' : 'Off'}
                  </button>
                </div>
              </Section>
            )}

            <Section title="View" icon={<Eye className="w-4 h-4" />}>
              <button onClick={() => navigate(`/oversight?user=${u.id}`)}
                className="text-sm px-3 py-1.5 rounded-md border hover:bg-gray-50">Open this account (read-only)</button>
            </Section>

            <Section title="Set a new password" icon={<KeyRound className="w-4 h-4" />}>
              <p className="text-xs text-gray-500 mb-2">For a user who is locked out. Tell them the new password; they can change it after signing in.</p>
              <div className="flex gap-2">
                <input type="text" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)}
                  placeholder="New password (8+ characters)" className="flex-1 border rounded-md px-2 py-1.5 text-sm" />
                <button disabled={busy || pw.length < 8}
                  onClick={() => run(async () => { await deviceApiService.adminSetPassword(u.id, pw); setPw(''); }, 'Password changed.')}
                  className="text-sm px-3 py-1.5 rounded-md bg-violet-600 text-white disabled:opacity-40">Set password</button>
              </div>
            </Section>

            <Section title={u.disabled ? 'Re-enable sign-in' : 'Disable sign-in'} icon={u.disabled ? <UserCheck className="w-4 h-4" /> : <Ban className="w-4 h-4" />}>
              <p className="text-xs text-gray-500 mb-2">
                {u.disabled ? 'The account can sign in again. Nothing was deleted while it was disabled.'
                  : 'Blocks sign-in. Every recording, patient and report is kept, and it can be re-enabled at any time.'}
              </p>
              <button disabled={busy || protectedAcct}
                onClick={() => run(() => deviceApiService.adminSetDisabled(u.id, !u.disabled), u.disabled ? 'Account re-enabled.' : 'Account disabled.')}
                className={`text-sm px-3 py-1.5 rounded-md border disabled:opacity-40 ${u.disabled ? 'border-green-300 text-green-700' : 'border-amber-300 text-amber-700'}`}>
                {u.disabled ? 'Re-enable account' : 'Disable account'}
              </button>
              {protectedAcct && <p className="text-xs text-gray-400 mt-1">Admin accounts cannot be disabled here.</p>}
            </Section>

            <Section title="Delete account" icon={<Trash2 className="w-4 h-4" />} danger>
              {!showDelete ? (
                <button disabled={protectedAcct} onClick={() => setShowDelete(true)}
                  className="text-sm px-3 py-1.5 rounded-md border border-red-300 text-red-700 disabled:opacity-40">Delete permanently…</button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-red-700">
                    This permanently deletes <b>{u.stats.recordings} reports ({fmtHours(u.stats.audio_seconds)} of audio)</b>,{' '}
                    {u.stats.patients} patients, {u.stats.sessions} sessions, {u.stats.devices} devices and the account's billing
                    records. It cannot be undone. If you only need to stop them signing in, disable the account instead.
                  </p>
                  <input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder={`Type ${u.email} to confirm`}
                    className="w-full border border-red-300 rounded-md px-2 py-1.5 text-sm" />
                  <div className="flex gap-2">
                    <button disabled={busy || confirmEmail.trim().toLowerCase() !== u.email.toLowerCase()}
                      onClick={() => run(async () => { await deviceApiService.adminDeleteUser(u.id, confirmEmail.trim()); onClose(); }, 'Account deleted.')}
                      className="text-sm px-3 py-1.5 rounded-md bg-red-600 text-white disabled:opacity-40">Delete this account</button>
                    <button onClick={() => { setShowDelete(false); setConfirmEmail(''); }} className="text-sm px-3 py-1.5 rounded-md border">Cancel</button>
                  </div>
                </div>
              )}
              {protectedAcct && <p className="text-xs text-gray-400 mt-1"><ShieldCheck className="w-3 h-3 inline" /> Admin accounts cannot be deleted here.</p>}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: React.ReactNode; big?: boolean }) {
  return (
    <div className="rounded-lg border bg-gray-50 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={big ? 'text-xl font-semibold text-gray-900' : 'text-sm font-medium text-gray-800'}>{value}</div>
    </div>
  );
}

function Section({ title, icon, danger, children }: { title: string; icon: React.ReactNode; danger?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg border p-4 ${danger ? 'border-red-200 bg-red-50/40' : ''}`}>
      <h3 className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${danger ? 'text-red-700' : 'text-gray-800'}`}>{icon}{title}</h3>
      {children}
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'violet' | 'blue' | 'red' | 'green' | 'gray'; children: React.ReactNode }) {
  const c = { violet: 'bg-violet-100 text-violet-700', blue: 'bg-blue-100 text-blue-700', red: 'bg-red-100 text-red-700',
    green: 'bg-green-100 text-green-700', gray: 'bg-gray-100 text-gray-600' }[tone];
  return <span className={`text-xs rounded px-1.5 py-0.5 ${c}`}>{children}</span>;
}
