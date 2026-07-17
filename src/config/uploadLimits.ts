// Upload limits — single source of truth.
//
// These used to be hardcoded 50MB literals in two unrelated files (ImportPopup's picker and
// audioProcessor's pre-flight), plus two more copies in user-facing strings. Nothing tied
// them to each other or to the server, so raising one still failed at the other, and the
// number in the UI could drift from the number actually enforced.
//
// What the server really allows, in the order a web upload meets them:
//
//   1. Supabase Storage GLOBAL file size limit — currently 500 MB. This is the binding
//      constraint. It OVERRIDES the per-bucket limit, which is why `recordings` having no
//      bucket limit of its own does not mean "unlimited". It defaulted to 50 MB and that
//      default silently 413'd a 118 MB recording once; see doc/05-backend-supabase.md.
//   2. Standard uploads (supabase.storage.upload) — 5 GB per the Storage docs, so not the
//      limit here. Supabase recommends resumable/TUS above 6 MB for reliability, not
//      because standard uploads reject the file.
//
// So the ceiling below tracks the Storage global limit. If you change it in the dashboard,
// change it here too — nothing enforces that they agree.
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/** For messages: "500MB". Derived so the text can never disagree with the check. */
export const MAX_UPLOAD_LABEL = `${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB`;

/**
 * Above this, a browser upload is one long unresumable POST: a drop at 95% starts again
 * from zero. Supabase's own guidance is to use resumable (TUS) uploads past this point.
 * We do not yet — see the note in recordingStorage.ts — so this only drives a warning.
 */
export const RESUMABLE_RECOMMENDED_BYTES = 6 * 1024 * 1024;

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};
