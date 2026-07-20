import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthProvider';

export interface Recording {
  id: string;
  file_name: string;
  created_at: string;
  file_path: string;
  patient_id?: string; // Add patient association
  recording_name?: string; // Add recording name
  protocol?: string; // Add protocol
  notes?: string; // Add notes
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
      
      const { data, error } = await supabase
        .from('recordings')
        .select('id, file_name, created_at, file_path, patient_id, recording_name, protocol, notes')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Recording[];
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