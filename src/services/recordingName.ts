// One rule for what a recording is CALLED, used everywhere it is shown.
//
// The same take used to have four different names depending on where you looked: the report
// header said `device_SATE-443EAC_s13.wav`, the sidebar said `R-S13`, the Devices list said
// `Session 13`, and a meeting note said `SATE-443EAC · notes · session 1`. Four names for one
// thing is not a styling problem — you cannot tell whether two screens are showing you the
// same recording.
//
// The rule, in one place:
//
//   device_SATE-<serial>_s13.wav   → R-S13     (recorder: takes are numbered 1..99)
//   device_pendant-<id>_s<stamp>   → P-3:17 PM (pendant/Plaud/L816 put a UNIX TIMESTAMP there,
//   device_plaud-<id>_s<stamp>     → PL-3:17 PM  not a take number — thirteen digits is not
//   device_l816-<mac>_s<stamp>     → L-3:17 PM   a name)
//   anything else                  → unchanged (a name a person typed is never rewritten)
//
// `recordings.recording_name` is auto-filled with the file name, so it is NOT evidence a human
// named the take. This works on the string alone: a person would never type
// `device_SATE-443EAC_s13.wav`, so a name that matches the pattern is by definition generated.

// `l81\d` covers the whole handheld family (L816, L815, …): they share a
// protocol, a naming scheme and a label. See l816Serial in the mobile app —
// the serial prefix is the MODEL, so this has to match on the family, not on
// one model, or a new one's takes silently fall through to the 'sate' branch
// and get labelled as numbered recorder sessions.
const DEVICE_FILE = /^device_(SATE|pendant|plaud|l81\d)[^_]*_s(\d+)/i;

const PREFIX: Record<string, string> = { sate: 'R', pendant: 'P', plaud: 'PL', l81: 'L' };

/** Unix seconds rather than a take number. The recorder never gets near this. */
const isTimestamp = (n: number) => n >= 1_000_000_000;

function label(source: string, n: number): string {
  // The handheld family is matched as `l81\d`, so the captured source is a
  // MODEL (`l816`, `l815`) while PREFIX is keyed by the family. Collapse it
  // here — looking the model up directly returns undefined and silently falls
  // back to 'R', which would relabel every L816 take as a numbered recorder
  // session.
  const key = source.toLowerCase().replace(/^l81\d$/, 'l81');
  const p = PREFIX[key] ?? 'R';
  return isTimestamp(n)
    ? `${p}-${new Date(n * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : `${p}-S${n}`;
}

/** What to show for a stored recording, given whatever name it carries. */
export function recordingLabel(name: string | null | undefined): string {
  const raw = (name || '').trim();
  const m = raw.match(DEVICE_FILE);
  return m ? label(m[1], Number(m[2])) : raw;
}

/**
 * The same label for an uploaded SESSION, which has no file name — only a serial and a number.
 * Kept next to `recordingLabel` so the two can never drift apart.
 */
export function sessionLabel(deviceSerial: string | null | undefined, sessionNumber: number): string {
  const s = (deviceSerial || '').toLowerCase();
  const source = s.startsWith('pendant')
    ? 'pendant'
    : s.startsWith('plaud')
      ? 'plaud'
      : s.startsWith('l81')
        ? 'l81'
        : 'sate';
  return label(source, sessionNumber);
}
