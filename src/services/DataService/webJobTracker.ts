// Records a web upload's AI call in `sate_web_jobs` so the admin Processing tab can see it.
// The browser calls the AI service directly, so without this the server never knows a file is
// being transcribed. EVERY write here is best-effort: a monitor that can fail an upload is worse
// than no monitor, so errors are swallowed and the caller never awaits anything that can throw.
import { supabase } from '@/lib/supabase';

const BEAT_MS = 30_000;

export interface WebJobHandle { finish: (error?: string) => void }

export function startWebJob(file: File, source: 'web-upload' | 'patient-upload' = 'web-upload'): WebJobHandle {
  let id: string | null = null;
  let closed = false;
  let pendingClose: { error?: string } | null = null;

  const close = (error?: string) => {
    if (!id) return;
    supabase.from('sate_web_jobs')
      .update({ status: error ? 'error' : 'done', finished_at: new Date().toISOString(), error: error?.slice(0, 500) ?? null })
      .eq('id', id)
      .then(() => {}, () => {});
  };

  supabase.from('sate_web_jobs')
    .insert({ file_name: file.name, bytes: file.size, source })
    .select('id').single()
    .then(({ data }) => {
      id = data?.id ?? null;
      // The AI call can finish before the insert returns; close it now rather than leave it live.
      if (pendingClose) close(pendingClose.error);
    }, () => {});

  const timer = window.setInterval(() => {
    if (!id || closed) return;
    supabase.from('sate_web_jobs').update({ heartbeat_at: new Date().toISOString() }).eq('id', id).then(() => {}, () => {});
  }, BEAT_MS);

  return {
    finish: (error?: string) => {
      if (closed) return;
      closed = true;
      window.clearInterval(timer);
      if (id) close(error); else pendingClose = { error };
    },
  };
}
