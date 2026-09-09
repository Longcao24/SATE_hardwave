// Voice Notes — the consumer ("Plaud-like") surface, inside the SATE app.
//
// Deliberately the same shell as DevicePage: gray-50 page, max-w-7xl, white rounded-2xl cards,
// the app's Button, lucide icons. It reads as one product because it IS one product — only the
// backend behind this page differs (see services/notesApiService.ts).
//
// Nothing clinical is imported here and nothing here is imported by the clinical pages, so
// this feature can be removed by deleting the folder and one route.

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NoteDetail } from './NoteDetail';
import { NoteProgress } from './NoteProgress';
import { notesApiService, isWorking, type Note, type NoteListItem } from '@/services/notesApiService';

const mmss = (s?: number | null) => {
  const v = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'done' ? 'bg-green-50 text-green-700 border-green-200'
      : status === 'error' ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${tone}`}>{status}</span>;
}

export function NotesPage() {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [access, setAccess] = useState<'checking' | 'yes' | 'no'>('checking');
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [open, setOpen] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    notesApiService.access().then((a) => { if (!cancelled) setAccess(a?.enabled ? 'yes' : 'no'); });
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async () => {
    try { setNotes(await notesApiService.list()); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, []);

  const openNote = useCallback(async (id: string) => {
    try {
      setOpen(await notesApiService.get(id));
      setError(null);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      // The list this row came from is stale — the note is gone (deleted from the console, or
      // from another tab). Clicking it would otherwise do nothing visible and the dead row
      // would sit there until a manual reload. Drop it and re-read.
      if (/not found/i.test(msg)) {
        setOpen((cur) => (cur?.id === id ? null : cur));
        refresh();
      }
    }
  }, [refresh]);

  useEffect(() => { if (access === 'yes') refresh(); }, [access, refresh]);

  // The Devices page links here as /notes#<note-id>; land on the recording itself rather than
  // on "Pick a recording".
  // Read the hash from the ROUTER, not from window: navigating here from the Devices page is a
  // client-side transition, so `window.location` is not what the effect should be watching —
  // reacting to the router's own value is what makes the link work on a fresh load and on a
  // second visit alike.
  useEffect(() => {
    if (access !== 'yes') return;
    const id = hash.replace(/^#/, '');
    if (id) openNote(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, hash]);

  // A recording still moving through the pipeline is the only reason to poll.
  useEffect(() => {
    if (access !== 'yes' || !notes.some((n) => isWorking(n.status))) return;
    const t = setTimeout(refresh, 5000);
    return () => clearTimeout(t);
  }, [access, notes, refresh]);

  // ...and the OPEN note needs its own poll. Opening one the moment it was created — which is
  // exactly what the Devices page's button does — otherwise leaves the detail pane stuck at
  // "Transcribing" while the list beside it already says done.
  useEffect(() => {
    if (!open || !isWorking(open.status)) return;
    const t = setTimeout(async () => {
      try {
        const fresh = await notesApiService.get(open.id);
        // Don't clobber a different recording the user opened while this was in flight.
        setOpen((cur) => (cur?.id === fresh.id ? fresh : cur));
      } catch { /* keep what is on screen; the next tick retries */ }
    }, 4000);
    return () => clearTimeout(t);
  }, [open]);

  if (access === 'checking') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-600">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Checking access…
      </div>
    );
  }

  if (access === 'no') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-700 font-medium">Voice Notes is not enabled for this account.</p>
        <Button variant="outline" onClick={() => navigate('/')}>Back to Dashboard</Button>
      </div>
    );
  }

  return (
    // Full-height app shell, the same shape as the main SATE window: a fixed list column that
    // owns its own scroll, and a content pane that owns its own. One page-level scrollbar is
    // what made the old version feel like a document rather than an app — the list scrolled
    // away with the note, and the note sat in a card with half the screen empty beneath it.
    <div className="h-screen flex bg-gray-50 overflow-hidden">
      <aside className="w-[320px] shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 flex-shrink-0">
          {/* Same logo, same click target as the app's own sidebar header: it goes home. This
              page is part of SATE, so it should be branded as SATE, not as its own product. */}
          <img
            src="/LOGO.png"
            alt="SATE"
            title="Go to Dashboard"
            onClick={() => navigate('/')}
            className="h-12 w-auto cursor-pointer transition-all"
          />
          <h1 className="mt-2 text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Mic className="w-4 h-4 text-blue-600" /> Meeting notes
            {notes.length > 0 && <span className="text-gray-400 font-medium">{notes.length}</span>}
          </h1>
        </div>

        {error && (
          <div className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {notes.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">
            No recordings yet. They appear here automatically.
          </p>
        ) : (
          <ul className="flex-1 overflow-y-auto min-h-0">
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => openNote(n.id)}
                  className={`w-full text-left px-5 py-3.5 border-b border-gray-100 transition ${
                    open?.id === n.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className={`text-sm truncate ${open?.id === n.id ? 'font-semibold text-blue-900' : 'font-medium text-gray-900'}`}>
                    {n.title || (n.status === 'done' ? 'Untitled' : 'Processing…')}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                    {n.status !== 'done' && <StatusPill status={n.status} />}
                    <span className="tabular-nums">{mmss(n.duration_s)}</span>
                    <span>{new Date(n.created_at).toLocaleDateString()}</span>
                  </div>
                  {isWorking(n.status) && (
                    <div className="mt-2"><NoteProgress note={n} compact /></div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <main className="flex-1 min-w-0 bg-white overflow-hidden flex flex-col">
        {open ? (
          <NoteDetail key={open.id} note={open} onDeleted={() => { setOpen(null); refresh(); }} />
        ) : (
          <div className="flex-1 grid place-items-center text-gray-400">
            <div className="text-center">
              <Mic className="w-8 h-8 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">Pick a recording.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
