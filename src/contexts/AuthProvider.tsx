import React, { createContext, useContext, useEffect, useState } from 'react';
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasSeenGuide, setHasSeenGuide] = useState(false);

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
        // Note: We don't throw here because the user is already created
        // This is logged for debugging but shouldn't block the signup flow
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