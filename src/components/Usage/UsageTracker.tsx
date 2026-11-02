import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthProvider';
import { setUsagePage, startUsage, stopUsage } from '@/services/usage/tracker';

/**
 * Mounted once, inside the router: feeds the usage tracker the signed-in account and the route.
 * Renders nothing. The tracker's state is module-level and idempotent, so StrictMode's double
 * effects cannot start it twice — which is also why there is no stop in an effect cleanup: the
 * dev-mode unmount/remount would end the visit and start a new tab id every render.
 */
export function UsageTracker() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const uid = user?.id ?? null;

  useEffect(() => {
    if (uid) startUsage(uid);
    else stopUsage();
  }, [uid]);

  // After the start effect (same commit, declared second), so the first view lands in the new tab.
  useEffect(() => {
    if (uid) setUsagePage(pathname);
  }, [uid, pathname]);

  return null;
}
