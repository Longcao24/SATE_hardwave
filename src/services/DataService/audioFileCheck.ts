// Before a file is uploaded: is it really an AUDIO recording? (2026-11-03)
//
// s-5e048220 was a 77 s 1080p screen recording with NO sound, named register.mp3 — the name and the browser's MIME
// type both said "audio", so it was uploaded, queued, and failed on the server ("Output file does not contain any
// stream"). The name proves nothing: an iPhone .m4a is an MP4 container too, and a file can be renamed anything. So
// this reads the file's own structure — only a few KB at the start (and at the end, where an MP4's index often
// sits), never the whole file — and lists its tracks:
//   - no audio track            → refused (nothing to transcribe)
//   - a video track             → refused (upload the audio, not the video)
//   - audio only / can't tell   → allowed; the server still checks (cf-processor NO_AUDIO) as the second line.

export type AudioFileVerdict = { ok: true } | { ok: false; reason: 'no_audio' | 'video'; message: string };

const HEAD = 64 * 1024;
const TAIL = 4 * 1024 * 1024;   // an MP4 written without "faststart" keeps its moov (track list) at the END

async function bytes(file: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(Math.max(0, start), Math.min(file.size, end)).arrayBuffer());
}
const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));
const u32 = (b: Uint8Array, at: number) => ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];

/** MP4 / MOV / M4A / 3GP: find the moov box and the handler type ('soun', 'vide') of each track inside it. */
async function isoTracks(file: Blob): Promise<Set<string> | null> {
  // Walk the top-level boxes by their size headers (16 bytes per hop) until moov.
  let pos = 0;
  for (let hops = 0; hops < 64 && pos + 8 <= file.size; hops++) {
    const h = await bytes(file, pos, pos + 16);
    let size = u32(h, 0);
    const type = ascii(h, 4, 4);
    if (size === 1) size = Number((BigInt(u32(h, 8)) << 32n) + BigInt(u32(h, 12)));   // 64-bit size
    else if (size === 0) size = file.size - pos;                                       // to end of file
    if (size < 8) return null;
    if (type === 'moov') {
      if (size > 64 * 1024 * 1024) return null;   // absurd index: let the server decide
      const moov = await bytes(file, pos, pos + size);
      const found = new Set<string>();
      for (let i = 4; i + 16 <= moov.length; i++) {
        if (moov[i] === 0x68 && ascii(moov, i, 4) === 'hdlr') found.add(ascii(moov, i + 12, 4));   // 'hdlr' + ver/flags + pre_defined + handler
      }
      return found;
    }
    pos += size;
  }
  return null;   // no moov found (fragmented MP4 …): can't tell
}

/** WebM / Matroska: TrackType elements (ID 0x83, 1-byte size 0x81) — 1 = video, 2 = audio. Tracks sit near the start. */
function ebmlTracks(head: Uint8Array): Set<string> | null {
  const found = new Set<string>();
  for (let i = 0; i + 2 < head.length; i++) {
    if (head[i] === 0x83 && head[i + 1] === 0x81) {
      if (head[i + 2] === 1) found.add('vide');
      if (head[i + 2] === 2) found.add('soun');
    }
  }
  return found.size ? found : null;
}

const NO_AUDIO_MSG = 'This file has no sound, so there is nothing to transcribe (it looks like a video or screen recording without audio). Please choose the audio recording.';
const VIDEO_MSG = 'This is a video file. SATE transcribes audio recordings — please upload the audio file (WAV, MP3, M4A, FLAC, OGG or AAC), not the video.';

export async function checkAudioFile(file: Blob & { name?: string }): Promise<AudioFileVerdict> {
  // Owner's rule (2026-11-03): MP4/MOV are not accepted (video formats) — M4A is (audio). By name first, then by content.
  if (/\.(mp4|mov|m4v|avi|mkv)$/i.test(file.name || '')) return { ok: false, reason: 'video', message: VIDEO_MSG };
  try {
    const head = await bytes(file, 0, HEAD);
    if (head.length < 12) return { ok: true };
    let tracks: Set<string> | null = null;
    if (ascii(head, 4, 4) === 'ftyp') {
      tracks = await isoTracks(file);
      if (!tracks && file.size > HEAD) {
        // Some writers put a huge mdat first; try the tail once for a moov there.
        const tail = await bytes(file, file.size - TAIL, file.size);
        const at = (() => { for (let i = tail.length - 8; i >= 4; i--) if (tail[i] === 0x6d && ascii(tail, i, 4) === 'moov') return i - 4; return -1; })();
        if (at >= 0) {
          const t = new Set<string>();
          for (let i = at; i + 16 <= tail.length; i++) if (tail[i] === 0x68 && ascii(tail, i, 4) === 'hdlr') t.add(ascii(tail, i + 12, 4));
          tracks = t;
        }
      }
    } else if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
      tracks = ebmlTracks(head);
    } else {
      return { ok: true };   // WAV, MP3, FLAC, OGG, AAC …: audio formats, nothing to look for
    }
    if (!tracks) return { ok: true };
    if (tracks.has('vide')) return { ok: false, reason: tracks.has('soun') ? 'video' : 'no_audio', message: tracks.has('soun') ? VIDEO_MSG : NO_AUDIO_MSG };
    if (!tracks.has('soun')) return { ok: false, reason: 'no_audio', message: NO_AUDIO_MSG };
    return { ok: true };
  } catch {
    return { ok: true };   // a check that cannot run must not block an upload; the server checks again
  }
}
