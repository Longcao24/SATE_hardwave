import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

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
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
    staleTime: Infinity, // User data doesn't change frequently
    gcTime: Infinity, // Keep user data in cache
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

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
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return { recordings, isLoading, error, refetch };
}; 