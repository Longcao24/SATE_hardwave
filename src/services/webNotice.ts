import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Site-wide notice + upload pause (2026-11-02, AI service outage). One row in `sate_web_notice`
// (id=1), readable by everyone and written only from the SQL editor / service role, so it can be
// switched on or off WITHOUT a web deploy:
//   update sate_web_notice set active = false, block_uploads = false, updated_at = now() where id = 1;
// Fails OPEN: if the row cannot be read, uploads are allowed and no banner shows.

export interface WebNotice { active: boolean; block_uploads: boolean; message: string | null }

const TTL_MS = 30_000;
let cached: { at: number; notice: WebNotice | null } | null = null;
let inflight: Promise<WebNotice | null> | null = null;

export async function getWebNotice(fresh = false): Promise<WebNotice | null> {
  if (!fresh && cached && Date.now() - cached.at < TTL_MS) return cached.notice;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.from('sate_web_notice')
        .select('active, block_uploads, message').eq('id', 1).maybeSingle();
      const notice = error ? (cached?.notice ?? null) : ((data as WebNotice | null) ?? null);
      cached = { at: Date.now(), notice };
      return notice;
    } catch {
      return cached?.notice ?? null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export const UPLOADS_PAUSED_FALLBACK = 'Uploading new files is temporarily paused while we fix a problem with the SATE AI service. Please try again later.';

/** The message to show when uploads are paused, or null when they are allowed. Always reads fresh. */
export async function uploadsPausedMessage(): Promise<string | null> {
  const n = await getWebNotice(true);
  return n?.block_uploads ? (n.message || UPLOADS_PAUSED_FALLBACK) : null;
}

/** The live notice, re-read every 60 s and when the tab comes back. */
export function useWebNotice(): WebNotice | null {
  const [n, setN] = useState<WebNotice | null>(cached?.notice ?? null);
  useEffect(() => {
    let alive = true;
    const load = () => { void getWebNotice(true).then((x) => { if (alive) setN(x); }); };
    load();
    const t = window.setInterval(() => { if (!document.hidden) load(); }, 60_000);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; window.clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return n;
}
