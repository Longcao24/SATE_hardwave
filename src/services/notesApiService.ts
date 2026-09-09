// SATE Voice Notes API client.
//
// ⚠️ This is the ONE file in the web app that talks to a different backend. Everything
// clinical still goes to Supabase exactly as before — nothing in that path was touched. The
// notes feature is additive: a separate Cloudflare service (Worker + D1 + R2 + Workers AI)
// that holds no patient data and cannot reach any.
//
// Auth is the SAME session. The user signs in once, to Supabase, and that access token is
// presented here; the Worker asks Supabase who the token belongs to rather than keeping its
// own user table or sharing a signing secret. So there is no second login, no second password,
// and no identity to keep in step.
//
// Access is off unless an admin turned it on for the account — `access()` is what the sidebar
// and the page both gate on, so a normal clinical user never sees this feature exists.

import { supabase } from '@/lib/supabase';

export interface NotesAccess {
  user_id: string;
  email: string;
  enabled: boolean;
  mode: string;
  isAdmin: boolean;
}

export interface NoteSummary {
  title: string;
  tldr: string;
  chapters: Array<{ at: number; title: string }>;
  /**
   * Whatever sections the chosen template produces, in order. Generic on purpose: adding a
   * template must not require a change here or in the renderer. Older summaries stored a flat
   * shape; the server converts them on read, so this is the only shape the app ever sees.
   */
  sections: Array<{ key: string; title: string; items: Array<{ text: string; sub?: string[] }> }>;
}

export interface TemplateChoice { key: string; label: string; ready: boolean }

/** One account's grant, as the notes service stores it (admin user manager). */
export interface NotesGrant {
  user_id: string;
  email: string;
  enabled: boolean;
  mode: string;
  notes: number;
  updated_at?: string;
}

export interface NoteListItem {
  id: string;
  device_serial: string;
  folder_id: string;
  session_number: number;
  bytes: number;
  duration_s: number | null;
  title: string | null;
  status: string;
  error: string | null;
  /**
   * Real transcription progress: one AI call per audio chunk. Present while a note is being
   * made so the UI can show a bar that means something instead of a line of text that looks
   * identical to a hang.
   */
  chunks_done: number;
  chunks_total: number;
  created_at: string;
}

/** Everything except `done` and `error` is work still in flight. */
export const isWorking = (status: string) => status !== 'done' && status !== 'error';

/**
 * How far along, 0..1 — or null when the stage genuinely cannot be measured.
 * Returning null rather than a made-up number is the point: an indeterminate bar is honest,
 * a bar creeping forward on a guess is not.
 */
export function noteProgress(n: { status: string; chunks_done?: number; chunks_total?: number }): number | null {
  if (n.status === 'transcribing' && n.chunks_total) {
    return Math.min(1, (n.chunks_done ?? 0) / n.chunks_total);
  }
  return null;
}

export function noteStageLabel(n: { status: string; chunks_done?: number; chunks_total?: number }): string {
  switch (n.status) {
    case 'queued': return 'Queued';
    case 'transcribing':
      return n.chunks_total
        ? `Transcribing — part ${Math.min((n.chunks_done ?? 0) + 1, n.chunks_total)} of ${n.chunks_total}`
        : 'Transcribing';
    case 'summarizing': return 'Summarising';
    default: return n.status;
  }
}

export interface Note extends NoteListItem {
  flags: number[];
  /** Carries its own short-lived signed token: an <audio> element cannot send headers. */
  audio_url: string;
  transcript: { lang: string; text: string; segments: Array<{ start: number; end: number; text: string }> } | null;
  summary: { template: string; model: string; json: NoteSummary } | null;
  /** Every template, and whether this note already has one — `ready:false` costs a generation. */
  templates: TemplateChoice[];
}

function baseUrl(): string {
  return import.meta.env.VITE_NOTES_API_URL || 'https://sate-notes.longcao.workers.dev';
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not signed in');

  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const notesApiService = {
  /**
   * Is this feature on for the signed-in account? Never throws — a user with no access, or a
   * service that is down, must degrade to "the feature is not there" rather than break the
   * clinical UI it sits next to.
   */
  async access(): Promise<NotesAccess | null> {
    try { return await req<NotesAccess>('/me'); } catch { return null; }
  },

  // --- admin: who may use this feature ------------------------------------------------
  // The SATE admin page is the ONE place this is decided. The Worker gates these on the
  // caller being an admin in `sate_admins` (it asks device-api), so the same people who
  // administer recorders administer this, with no second admin list to keep in step.

  /** Existing grants, keyed by account. Never throws — the service being down must not take
   *  the user manager down with it; the page shows the accounts and marks access unknown. */
  async adminListGrants(): Promise<NotesGrant[] | null> {
    try { return await req<NotesGrant[]>('/admin/accounts'); } catch { return null; }
  },

  /** Turn the feature on or off for one account. The uuid is what is enforced; the email is
   *  carried along only so the service's own list stays readable. */
  async adminSetAccess(user_id: string, email: string, enabled: boolean): Promise<void> {
    await req('/admin/accounts', {
      method: 'PUT',
      body: JSON.stringify({ user_id, email, enabled, mode: enabled ? 'notes' : 'clinical' }),
    });
  },

  list(): Promise<NoteListItem[]> {
    // No user id in the request: the server takes it from the token. Passing one would be a
    // request, not a claim, and the server ignores it for a signed-in user.
    return req<NoteListItem[]>('/api/notes');
  },

  get(id: string, template?: string): Promise<Note> {
    return req<Note>(`/api/notes/${id}${template ? `?template=${encodeURIComponent(template)}` : ''}`);
  },

  /**
   * Summarise an existing note a different way. Runs from the stored transcript — one cheap
   * model call, never a re-transcription (that is ~96% of the cost and is already paid).
   */
  summarizeAs(id: string, template: string): Promise<{ ok: true; template: string; cached?: boolean }> {
    return req(`/api/notes/${id}/summarize`, { method: 'POST', body: JSON.stringify({ template }) });
  },

  /**
   * Which of these device sessions already have a note? The Devices list asks this so its
   * button can say "View note" rather than offering to make a second one.
   * Never throws: a list that cannot answer must not break the Devices page.
   */
  async bySource(sessionIds: string[]): Promise<{
    notes: Record<string, { id: string; status: string; title: string | null; chunks_done?: number; chunks_total?: number }>;
    /** Sessions whose note the user deleted on purpose — never auto-generate these again. */
    optedOut: string[];
  }> {
    if (!sessionIds.length) return { notes: {}, optedOut: [] };
    try {
      return await req(`/api/notes/by-source?ids=${encodeURIComponent(sessionIds.join(','))}`);
    } catch { return { notes: {}, optedOut: [] }; }
  },

  /** Delete a note the user no longer wants. The deletion sticks: the session it came from is
   *  remembered so the auto-generator does not recreate it. */
  async remove(noteId: string): Promise<void> {
    await req(`/api/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' });
  },

  /**
   * Turn a recording the clinical stack already stored into a meeting note.
   *
   * Nothing about that recording changes — this makes an ADDITIONAL artifact from a copy of
   * the audio. No URL is passed: the service fetches the audio from device-api using this
   * user's own token, so ownership is enforced by the system that owns the recording.
   */
  fromSession(p: {
    session_id: string; device_serial: string; session_number: number;
    folder_id?: string;
    /** The flag button's ms offsets, carried over from the clinical session row. */
    flags?: number[];
  }): Promise<{ id: string; idempotent?: boolean }> {
    return req('/api/notes/from-session', { method: 'POST', body: JSON.stringify(p) });
  },

  /** Absolute URL for the player — the signed token is already in `audio_url`. */
  audioUrl(note: Note): string {
    return `${baseUrl()}${note.audio_url}`;
  },
};
