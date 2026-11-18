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
// Sign-up started asking for recording consent on this date (audit 2026-11-18).
const CONSENT_ASKED_FROM = Date.parse('2026-11-18T00:00:00Z');

export function UsageTracker() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const uid = user?.id ?? null;
  // On-screen text is recorded unmasked only for accounts that agreed to it: every account that existed before
  // sign-up asked (they signed consent offline, owner 2026-11-03) or one that ticked the box at sign-up.
  const consented = !!user && (Date.parse(user.created_at) < CONSENT_ASKED_FROM || !!user.user_metadata?.recording_consent_at);

  useEffect(() => {
    if (uid) startUsage(uid, consented);
    else stopUsage();
  }, [uid, consented]);

  // After the start effect (same commit, declared second), so the first view lands in the new tab.
  useEffect(() => {
    if (uid) setUsagePage(pathname);
  }, [uid, pathname]);

  return null;
}
