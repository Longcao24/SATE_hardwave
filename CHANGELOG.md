# SATE web app — changelog

Every production release of the web app (sate-hardware.vercel.app) has an entry here, newest first.
`npm run release:prod` refuses a version with no entry. Write for the people who use the app (clinicians
and admins) first; a short **Technical** list after that is for whoever works on it next.

Version rules: `npm version patch --no-git-tag-version` for fixes, `minor` for new features, `major` for a
change that needs users to relearn something. The version shows in the sidebar badge and at
`https://sate-hardware.vercel.app/version.json`. Each release is tagged `web-<version>` in git.

## 1.6.2 — 2026-11-03

**For clinicians**
- An upload whose report you deleted no longer reappears under **Processing** as "Processing failed" (with a Retry
  that could not work). Only uploads that are waiting, processing, failed or had no speech are listed.

**Technical**
- `useInFlightUploads` no longer fetches `status='done'` rows without a recording: finalize-session always links the
  recording (or sets no_text) in the same update, so such a row is a report deleted afterwards
  (`sessions.recording_id` is ON DELETE SET NULL). Seen on one upload in production (s-55f5ee7a).

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
