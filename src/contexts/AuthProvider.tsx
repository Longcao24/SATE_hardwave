import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import { validateInviteCode, useInviteCode } from '@/services/inviteCodeService';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, inviteCode: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasSeenGuide: boolean;
  markGuideAsSeen: () => void;
  showGuideAgain: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// A code whose consumption failed at signup time. With email confirmation on,
// supabase.auth.signUp returns a user but no session, so the consuming RPC runs
// with the anon key and RLS rejects it — without this the code is never spent
// and a max_uses=1 code keeps working for every later signup.
const PENDING_INVITE_KEY = 'sate_pending_invite_code';

const rememberPendingInviteCode = (code: string, userId: string) => {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ code, userId }));
  } catch (error) {
    console.error('Error storing pending invite code:', error);
  }
};

const clearPendingInviteCode = () => {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch (error) {
    console.error('Error clearing pending invite code:', error);
  }
};

// Retried once the account has a real session, which is what the RPC needs.
// The record is cleared only on a SUCCESSFUL consume (or when the code is already
// spent): clearing it first meant one transient failure — offline, RLS not yet
// applied, RPC briefly unavailable — permanently dropped the code and left a
// single-use invite reusable forever, with only a console line to show for it.
// A bounded attempt count keeps a genuinely dead code from retrying every sign-in.
const MAX_INVITE_CONSUME_ATTEMPTS = 5;

const consumePendingInviteCode = async (userId: string) => {
  let pending: { code?: string; userId?: string; attempts?: number } | null = null;
  try {
    const raw = localStorage.getItem(PENDING_INVITE_KEY);
    pending = raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('Error reading pending invite code:', error);
    clearPendingInviteCode();
    return;
  }

  if (!pending?.code || pending.userId !== userId) return;

  const result = await useInviteCode(pending.code, userId);
  if (result.success) {
    clearPendingInviteCode();
    return;
  }

  const attempts = (pending.attempts ?? 0) + 1;
  console.error(
    `Failed to record invite code usage (attempt ${attempts}/${MAX_INVITE_CONSUME_ATTEMPTS}):`,
    result.error
  );
  if (attempts >= MAX_INVITE_CONSUME_ATTEMPTS) {
    clearPendingInviteCode();
    return;
  }
  try {
    localStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ ...pending, attempts }));
  } catch {
    // Storage unavailable (private mode / quota): nothing more we can do client-side.
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasSeenGuide, setHasSeenGuide] = useState(false);
  const queryClient = useQueryClient();
  // `undefined` = auth hasn't resolved yet (first pass is not a change).
  const lastUserIdRef = useRef<string | null | undefined>(undefined);

  // Whenever the signed-in account changes (login, logout, account switch),
  // drop every cached query. Otherwise the new session reads the previous
  // user's cached data — or an empty list captured before auth resolved —
  // which is what forced users to hard-reload to see their recordings.
  useEffect(() => {
    const id = user?.id ?? null;
    const prev = lastUserIdRef.current;
    lastUserIdRef.current = id;
    if (prev === undefined || prev === id) return; // first resolve, or no change
    queryClient.clear();
  }, [user?.id, queryClient]);

  // Runs only with a session in hand, which is what the invite-code RPC needs.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    void consumePendingInviteCode(userId);
  }, [session?.user?.id]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      
      // Check if user has seen guide (only when user is authenticated)
      if (data.session?.user) {
        checkGuideStatus(data.session.user.id);
      }
      
      setLoading(false);
    });

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // Only update if the session or user actually changed
      setSession((prevSession) => {
        if (prevSession?.access_token !== newSession?.access_token) {
          return newSession;
        }
        return prevSession;
      });
      
      setUser((prevUser) => {
        if (prevUser?.id !== newSession?.user?.id) {
          // Check guide status when user logs in
          if (newSession?.user) {
            checkGuideStatus(newSession.user.id);
          } else {
            // Reset guide status when user logs out
            setHasSeenGuide(false);
          }
          return newSession?.user ?? null;
        }
        return prevUser;
      });
      
      setLoading(false);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Check if user has seen the guide
  const checkGuideStatus = (userId: string) => {
    try {
      const guideSeen = localStorage.getItem(`sate_guide_seen_${userId}`);
      setHasSeenGuide(guideSeen === 'true');
    } catch (error) {
      console.error('Error checking guide status:', error);
      setHasSeenGuide(false);
    }
  };

  // Mark guide as seen
  const markGuideAsSeen = () => {
    if (user) {
      try {
        localStorage.setItem(`sate_guide_seen_${user.id}`, 'true');
        setHasSeenGuide(true);
      } catch (error) {
        console.error('Error marking guide as seen:', error);
      }
    }
  };

  // Show guide again (for testing or user request)
  const showGuideAgain = () => {
    if (user) {
      try {
        localStorage.removeItem(`sate_guide_seen_${user.id}`);
        setHasSeenGuide(false);
      } catch (error) {
        console.error('Error resetting guide status:', error);
      }
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, inviteCode: string) => {
    // First, validate the invite code
    const validation = await validateInviteCode(inviteCode);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid invite code');
    }

    // Create the user account
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;

    // If signup successful and user is created, record the invite code usage
    if (data.user) {
      // Use the invite code with the newly created user's ID
      const useResult = await useInviteCode(inviteCode, data.user.id);
      if (!useResult.success) {
        // The account already exists, so don't throw and wedge the signup —
        // park the code and spend it as soon as the user has a session.
        console.error('Failed to record invite code usage:', useResult.error);
        rememberPendingInviteCode(inviteCode, data.user.id);
      }
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value: AuthContextValue = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    hasSeenGuide,
    markGuideAsSeen,
    showGuideAgain,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 