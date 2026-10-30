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
}

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
export function recordingEditedAt(r: Pick<Recording, 'created_at' | 'updated_at'>): number {
  const u = tsMs(r.updated_at);
  if (u - tsMs(r.created_at) <= EDIT_GRACE_MS) return 0;
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
        .select(`${BASE}, analysis_seconds:analysis->totalDuration`)
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

      // Collapse the two sources into the one field every consumer reads.
      return (data ?? []).map((r) => {
        const row = r as Recording & { analysis_seconds?: number | string | null };
        const fallback = Number(row.analysis_seconds);
        return {
          ...row,
          duration: row.duration || (Number.isFinite(fallback) ? fallback : null),
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
  });

  return { recordings, isLoading, error, refetch };
}; 