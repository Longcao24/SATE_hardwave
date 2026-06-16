import { QueryClient } from '@tanstack/react-query';
 
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Disable automatic refetching when window regains focus
      refetchOnWindowFocus: false,
      // Disable automatic refetching on reconnect
      refetchOnReconnect: false,
      // Disable automatic refetching when component mounts (if data is stale)
      refetchOnMount: false,
      // Keep data fresh for longer (30 seconds)
      staleTime: 30 * 1000,
      // Cache data for 5 minutes
      gcTime: 5 * 60 * 1000,
    },
  },
}); 