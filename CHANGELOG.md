# SATE web app — changelog

Every production release of the web app (sate-hardware.vercel.app) has an entry here, newest first.
`npm run release:prod` refuses a version with no entry. Write for the people who use the app (clinicians
and admins) first; a short **Technical** list after that is for whoever works on it next.

Version rules: `npm version patch --no-git-tag-version` for fixes, `minor` for new features, `major` for a
change that needs users to relearn something. The version shows in the sidebar badge and at
`https://sate-hardware.vercel.app/version.json`. Each release is tagged `web-<version>` in git.

## 1.6.6 — 2026-11-03

**For admins**
- **Screen recordings (Admin → Usage → Recordings) are on and show the data in full** — patient names, transcripts,
  notes, report and file names — as users consented. Passwords and other secrets are still hidden, and audio/video
  are not recorded. Every time an admin opens a recording it is logged.

**Technical**
- The tracker follows the server switch `FLAG_REPLAY_TEXT` (`/v1/config` → `replay_text`): `1` = no text masking, no
  `data-usage-mask` input masking, file names kept; passwords / hidden / secret-hint inputs and `[data-usage-block]`
  stay masked/blocked. `0` = the previous masking (option B), with no web release. Needs sate-analytics `f242e20c`+
  (D1 migration `0003_replay_views`). Verified on the sandbox: a recording of /patients contains the names (0 masked
  runs vs hundreds before). Analytics tests 71/71.

## 1.6.5 — 2026-11-03

**For clinicians**
- **Protocol is now optional** when saving an uploaded recording — only the recording name is required. Leave it
  empty if it does not apply; it can be added later.

**Technical**
- `RecordingMetadataForm` no longer validates protocol; an empty protocol is stored as NULL (also in the
  first-time device-recording review, which used to store '').

## 1.6.4 — 2026-11-03

**For clinicians**
- Choosing a file to upload now checks it first, in the browser, before anything is sent:
  - **video files are refused** — `.mp4`, `.mov`, `.m4v`, `.avi`, `.mkv`, and any file that contains a picture
    whatever its name (a video renamed `.mp3` too). Please upload the audio recording.
  - a file with **no audio track at all** (a silent screen recording) is refused: there is nothing to transcribe.
  - a **damaged or unreadable** audio file (corrupted, cut short so it cannot open, a WAV with no audio data) is
    refused at once — nothing is uploaded or saved.
  - still accepted: **WAV, MP3, M4A (iPhone recordings), FLAC, OGG, AAC, WebM audio**.
- A recording that HAS sound but no speech is still uploaded — only transcription can tell that (it then says
  "No speech detected").

**Technical**
- `services/DataService/audioFileCheck.ts` reads the container's track list (MP4/MOV: moov → hdlr `soun`/`vide`,
  also at the end of the file; WebM/MKV: TrackType) — a few KB, never the whole file; anything it cannot read is
  allowed and cf-processor's `NO_AUDIO` check remains the second line. Tested on 10 files (m4a both layouts, mp3, wav,
  webm audio allowed; mp4, mov, video-only webm, a video renamed .mp3 and the real s-5e048220 file refused).
  Second step: an `<audio>` element on a blob URL must open the file (metadata only) with a duration > 0 — blocks on
  a decode/read error, only for formats the browser says it plays (others pass to the server), 15 s timeout = allow;
  WAV is also checked for an empty `data` chunk. Tested in Chrome on 12 files (5 good allowed; video, silent video,
  random-byte mp3/wav/m4a, header-only wav, half an m4a refused). Refusals counted as `upload:refused-<reason>`.

## 1.6.3 — 2026-11-03

**For clinicians**
- A file with **no sound at all** (for example a video recorded without audio, or renamed to .mp3) now says
  **"No sound in this file"** on its report, in the lists and under Processing — with what to do (upload the audio
  recording instead) — instead of "Processing failed" and a Retry that could never work.

**Technical**
- Needs cf-processor with the `NO_AUDIO:` check (`_audio_stream_count` via ffprobe) for new uploads; the web also
  recognises the old wording ("Output file does not contain any stream") so existing failures show correctly.
  `isNoAudioError()` in `useInFlightUploads.ts` is the one test; states `no_audio` in the in-flight list,
  `RecordingProcessing` / `ProcessingChip` and `PendingReport`.

## 1.6.2 — 2026-11-03

**For clinicians**
- An upload whose report you deleted no longer reappears under **Processing** as "Processing failed" (with a Retry
  that could not work). Only uploads that are waiting, processing, failed or had no speech are listed.
- **Deleting a report made from a file you uploaded now deletes everything**: the report, its audio, the upload
  and the original file. Before, the upload and the original file stayed on the server (that is what made the
  upload come back as "Processing failed"). Reports from a SATE recorder or other device keep the device's own
  session (it is part of the device's history on the Devices page).

**Technical**
- `useInFlightUploads` no longer fetches `status='done'` rows without a recording: finalize-session always links the
  recording (or sets no_text) in the same update, so such a row is a report deleted afterwards
  (`sessions.recording_id` is ON DELETE SET NULL). Seen on one upload in production (s-55f5ee7a).
- `deleteRecording`: a report whose source session is a `web-*` upload is deleted through device-api
  `DELETE /sessions/:id` (session + device-sessions object + recording + its object + `sate_session_audit` row).

## 1.6.1 — 2026-11-03

**For clinicians**
- A file the server refuses as too large now says so ("larger than SATE can accept right now") instead of asking you
  to check your connection, and offers no pointless retry.

**For admins**
- Admin → Monitoring no longer shows the **Status page** card (that page is no longer online). Service health is on
  Admin → Dashboard and Admin → Processing.

**Technical**
- A failed upload is reported to the operator ONCE: the error popup no longer re-reports a message that repeats the
  cause the upload path just logged (`reportClientError` de-duplicates within 15 s).
- Same day, status Worker `104ab249` (backend branch): DOWN only after two failed checks in a row, alert mails list only
  new problems, a "back up" mail when a service recovers, a Storage 413 is mailed as STORAGE SIZE LIMIT.

## 1.6.0 — 2026-11-03

**For clinicians**
- **Save without waiting.** Once a file is uploaded, Save creates the report straight away and opens it. The report
  shows "Waiting / Processing" and fills in by itself when the transcript is ready — even if you close the tab.
  Lists show a status on these reports. If processing fails you only see **Retry**; the SATE team is notified.
- **Closing the upload form never loses the file.** It keeps uploading and is processed in the background.
- **Transcript clicks:** one click on a word plays from that word to the end of the line; a double click plays just
  that word. Clicking an annotation only opens it; its **Play** button plays from that word to the end of the line.
- **Edit mode:** the report header wraps, so **Cancel** is no longer hidden under the right sidebar.
- **Standalone Recordings** is a button on the dashboard that opens its own page.
- A site-wide notice banner can be shown during an outage (uploads keep working and wait in the queue).

**For admins**
- **Dashboard** is the Admin page's main tab: what is happening now (AI service, queue, problems, recorders) and the
  system's numbers for Today / 7 days / 30 days / All time, with charts and processing time vs recording length.
- **Processing:** every status system-wide, an **AI service** self-test box, and **Problems** that can be dismissed
  and restored.
- **Accounts:** sort by every column, role and status filters, a correct **Last active**.
- **Usage:** each account's activity and screen recordings, and a **Reports** tab with all of the account's reports
  (opens the full report read-only; every view is logged). Analytics itself is not live on production yet.
- Sidebar grouped Overview / People / Activity / Hardware / System.

**Technical**
- Needs device-api ≥ v43.14 and finalize-session v5 (deployed 2026-11-02); Save-first needs both.
- Screen recordings (analytics): ordinary inputs recorded as typed; patient data (`data-usage-mask`), passwords,
  secrets and file pickers masked. A new patient input must sit under `data-usage-mask`.
- Version now comes from package.json (badge + `/version.json`); release with `npm run release:prod`.
- Details: `doc/19-november-2026-update.md`.

## 1.5.9 and earlier

Not logged per version. See `git log -- react_app_sate-ui_update` for history before 1.6.0.
