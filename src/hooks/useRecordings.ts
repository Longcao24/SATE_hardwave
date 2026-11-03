import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthProvider';

export interface Recording {
  id: string;
  file_name: string;
  created_at: string;
  /** Moved by any write to the row (transcript save, rename, patient move) — kept by a trigger. */
  updated_at?: string | null;
  file_path: string;
  patient_id?: string; // Add patient association
  recording_name?: string; // Add recording name
  protocol?: string; // Add protocol
  notes?: string; // Add notes
  /** The device session this recording was made from, or null for a file uploaded straight
   *  from the web app. Only a recording WITH one can become a meeting note — the notes
   *  service fetches its audio by session, never by recording. */
  source_session_id?: string | null;
  /** Length of the audio in seconds, written from the AI analysis. NULL until a recording has
   *  been processed (and for anything stored before the column was filled), so every reader
   *  must treat "no duration" as unknown rather than as zero — see `formatLength`. */
  duration?: number | null;
  /** [Save-first, 2026-11-02] A report saved before its upload finished processing: where it stands.
   *  null/undefined = an ordinary, ready recording. */
  processing?: RecordingProcessing | null;
  /** When processing filled a Save-first report in (ISO), so that write is not mistaken for an edit. */
  ready_at?: string | null;
}

/** Where a Save-first report stands. 'failed' offers Retry; details are for admins only. */
export type RecordingProcessing = 'queued' | 'processing' | 'failed' | 'no_speech' | 'removed';

const tsMs = (iso?: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
};
/** A write this soon after creation is processing filling the row in, not a person editing. */
const EDIT_GRACE_MS = 5 * 60 * 1000;
/** Only edits this recent count. `updated_at` is also moved by bulk backfills (one on 2026-09-11
 *  touched 237 rows in the same minute), and those must not read as someone's edit forever. */
const EDIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** When a person last edited this recording (ms), or 0 if not recently. */
export function recordingEditedAt(r: Pick<Recording, 'created_at' | 'updated_at'> & { ready_at?: string | null }): number {
  const u = tsMs(r.updated_at);
  if (u - tsMs(r.created_at) <= EDIT_GRACE_MS) return 0;
  // A Save-first report is filled in by processing, possibly long after it was created: that is not an edit.
  if (r.ready_at && u - tsMs(r.ready_at) <= EDIT_GRACE_MS) return 0;
  return Date.now() - u <= EDIT_WINDOW_MS ? u : 0;
}

/** Newest activity: added or (recently) edited, whichever is later. */
export function recordingActivityAt(r: Pick<Recording, 'created_at' | 'updated_at'>): number {
  return Math.max(tsMs(r.created_at), recordingEditedAt(r));
}

export const useRecordings = () => {
  // The user comes from AuthProvider, NOT from a cached ['user'] query. That
  // query was cached with staleTime/gcTime Infinity and never refetched, so if
  // it resolved before the session hydrated it stayed null forever — the
  // recordings query never enabled and the list looked empty until a hard
  // reload (Ctrl+Shift+R). AuthProvider tracks onAuthStateChange, so this value
  // is correct the moment login completes.
  const { user } = useAuth();

  const { data: recordings, isLoading, error, refetch } = useQuery<Recording[]>({
    queryKey: ['recordings', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      // `duration` is 0 on every recording UPLOADED from the web app — `recordingStorage` wrote
      // a literal 0 with a comment promising to fill it in "when audio loads", and nothing ever
      // did. The real length is already on the row inside `analysis.totalDuration` (the same
      // value the device path copies into the column), so pull just that one key out of the
      // jsonb rather than the whole analysis blob, and prefer the column when it is real.
      const BASE =
        'id, file_name, created_at, updated_at, file_path, patient_id, recording_name, protocol, notes, source_session_id, duration';

      let { data, error } = await supabase
        .from('recordings')
        .select(`${BASE}, analysis_seconds:analysis->totalDuration, t_pending:transcript->pending, t_no_speech:transcript->no_speech, ready_at:transcript->>ready_at`)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      // The jsonb path is a PostgREST feature, and a list of recordings failing to load is a far
      // worse outcome than a missing length — so fall back to the plain select if it is rejected.
      if (error) {
        const plain = await supabase
          .from('recordings')
          .select(BASE)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        data = plain.data as typeof data;
        error = plain.error;
      }

      if (error) throw error;

      // Save-first reports still waiting: read their uploads' status (owners can read their sessions).
      type Row = Recording & { analysis_seconds?: number | string | null; t_pending?: boolean | null; t_no_speech?: boolean | null };
      const rows = (data ?? []) as Row[];
      const waiting = rows.filter((r) => r.t_pending === true && r.source_session_id).map((r) => r.source_session_id as string);
      const status = new Map<string, string>();
      for (let i = 0; i < waiting.length; i += 100) {
        // A failed read must not turn every waiting report into "removed": throw, so React Query keeps the
        // previous data and retries (audit 2026-11-02).
        const { data: ss, error: ssErr } = await supabase.from('sate_device_sessions').select('id, status').in('id', waiting.slice(i, i + 100));
        if (ssErr) throw ssErr;
        for (const x of ss || []) status.set(x.id, x.status);
      }
      const processingOf = (r: Row): RecordingProcessing | null => {
        if (r.t_no_speech === true) return 'no_speech';
        if (r.t_pending !== true) return null;
        const st = r.source_session_id ? status.get(r.source_session_id) : undefined;
        if (st === 'error') return 'failed';
        if (st === 'processing') return 'processing';
        if (st === 'queued') return 'queued';
        // 'done' but still pending = the fill is landing right now; no session = it was removed.
        return st === 'done' ? 'processing' : 'removed';
      };

      // Collapse the two sources into the one field every consumer reads.
      return rows.map((row) => {
        const fallback = Number(row.analysis_seconds);
        const { t_pending: _p, t_no_speech: _n, analysis_seconds: _a, ...rest } = row;
        return {
          ...rest,
          duration: row.duration || (Number.isFinite(fallback) ? fallback : null),
          processing: processingOf(row),
        } as Recording;
      });
    },
    enabled: !!user?.id,
    // Recorder/pendant sessions become recordings server-side, with no click in
    // this tab. A 5-minute stale window meant they only appeared after a hard
    // reload, so keep the list short-lived and refetch on mount/focus.
    // DeviceProvider also invalidates this key the moment a session turns ready.
    staleTime: 15 * 1000,
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // While a Save-first report is still being processed, keep its chip current.
    refetchInterval: (q) => ((q.state.data as Recording[] | undefined)?.some((r) => r.processing === 'queued' || r.processing === 'processing') ? 10_000 : false),
  });

  return { recordings, isLoading, error, refetch };
}; 