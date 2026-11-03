# SATE web app — changelog

Every production release of the web app (sate-hardware.vercel.app) has an entry here, newest first.
`npm run release:prod` refuses a version with no entry. Write for the people who use the app (clinicians
and admins) first; a short **Technical** list after that is for whoever works on it next.

Version rules: `npm version patch --no-git-tag-version` for fixes, `minor` for new features, `major` for a
change that needs users to relearn something. The version shows in the sidebar badge and at
`https://sate-hardware.vercel.app/version.json`. Each release is tagged `web-<version>` in git.

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
