import { supabase } from '@/lib/supabase';

// A web upload is SAVED TO STORAGE BEFORE THE AI SEES IT.
//
// The browser calls the AI service directly (audioProcessor.ts), and the audio used to reach
// Storage only in saveRecording(), after a successful transcription. So a file the AI failed
// on (a 5xx, a dropped tunnel, a closed tab) existed nowhere but on the clinician's disk: no
// object, no row, nothing for anyone to look at or retry from (2026-10-28: a 10-min upload
// failed repeatedly and left no trace at all). Now the object is written first and remembered
// against the File, so the AI call, a Retry of it, and the final Save all use ONE stored copy
// — Save reuses the path instead of uploading a second one.
//
// A run the clinician CANCELS is the opposite case: they chose to throw the audio away, and
// before this change a cancel stored nothing. discardStoredAudio() removes the object again —
// except after a failed run, where keeping the file is the whole point.

const storedPaths = new WeakMap<File, string>();
// Bumped by every discard. An upload that sees it change while in flight removes its own
// object when it lands, so a cancel at any moment — even during the session lookup — wins.
const generation = new WeakMap<File, number>();

/** Thrown when the clinician cancelled while the upload was in flight; not an error to show. */
export class UploadCancelledError extends Error {
  readonly cancelled = true;
  constructor() { super('Upload cancelled'); }
}

/**
 * Storage rejects keys outside roughly [\w/!-.*'() &$@=;:+,?] ("Invalid key"), so a name like
 * "Ghi âm của bé.m4a", "Long’s take.wav" or "take #3.wav" could never be stored. The key gets
 * a safe spelling; the real name stays in recordings.file_name.
 */
export const storageSafeName = (name: string) =>
  name.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-() ]/g, '_');

/** Upload `file` to the recordings bucket once and return its path (cached per File). */
export async function storeUploadedAudio(file: File): Promise<string> {
  const known = storedPaths.get(file);
  if (known) return known;

  const gen = generation.get(file) ?? 0;
  // The local session, not getUser(): a network blip there would read as "signed out".
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not signed in');
  if ((generation.get(file) ?? 0) !== gen) throw new UploadCancelledError();

  const path = `${session.user.id}/${Date.now()}_${storageSafeName(file.name)}`;
  const { error } = await supabase.storage
    .from('recordings')
    .upload(path, file, { upsert: false, cacheControl: '3600' });
  if (error) throw new Error(error.message);

  if ((generation.get(file) ?? 0) !== gen) {
    await supabase.storage.from('recordings').remove([path]);
    throw new UploadCancelledError();
  }
  storedPaths.set(file, path);
  return path;
}

/** The path this File was already stored under, if it was. */
export const storedPathOf = (file: File): string | undefined => storedPaths.get(file);

/** Called once a recording row owns the object, so a later upload of the same File starts fresh. */
export const forgetStoredAudio = (file: File) => { storedPaths.delete(file); };

/** The clinician cancelled this upload: delete its stored object (now, or when it lands). */
export function discardStoredAudio(file: File) {
  generation.set(file, (generation.get(file) ?? 0) + 1);
  const path = storedPaths.get(file);
  storedPaths.delete(file);
  if (path) supabase.storage.from('recordings').remove([path]).then(() => {}, () => {});
}
