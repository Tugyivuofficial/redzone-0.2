import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase, isSupabaseAvailable, type Profile } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

interface AuthContextType {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function withTimeout<T>(promise: Promise<T>, ms = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Request timed out. Please try again.')), ms);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); }
    );
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const ensureProfile = useCallback(async (userId: string, email?: string | null, username?: string | null) => {
    if (!isSupabaseAvailable) return null;

    const { data: existing, error: selectError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (existing) return existing as Profile;

    if (selectError && selectError.code !== 'PGRST116') {
      throw selectError;
    }

    const fallbackUsername =
      username?.trim() ||
      email?.split('@')[0]?.replace(/[^a-zA-Z0-9_]/g, '_') ||
      `player_${userId.slice(0, 6)}`;

    const { data: created, error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        username: fallbackUsername,
        role: 'captain',
      })
      .select('*')
      .single();

    if (insertError) throw insertError;
    return created as Profile;
  }, []);

  const fetchProfile = useCallback(async (userId: string, email?: string | null, username?: string | null) => {
    if (!isSupabaseAvailable) {
      if (mountedRef.current) setProfile(null);
      return;
    }

    try {
      const nextProfile = await withTimeout(ensureProfile(userId, email, username), 10000);
      if (mountedRef.current) setProfile(nextProfile);
    } catch (error) {
      console.error('Profile load failed:', error);
      if (mountedRef.current) setProfile(null);
    }
  }, [ensureProfile]);

  useEffect(() => {
    if (!isSupabaseAvailable) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !mountedRef.current) return;
      const currentSession = data.session;
      setSession(currentSession);
      setLoading(false);

      if (currentSession?.user) {
        window.setTimeout(() => {
          fetchProfile(
            currentSession.user.id,
            currentSession.user.email,
            currentSession.user.user_metadata?.username || currentSession.user.user_metadata?.name
          );
        }, 0);
      } else {
        setProfile(null);
      }
    }).catch((error) => {
      console.error('Initial session failed:', error);
      if (!cancelled && mountedRef.current) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mountedRef.current) return;
      setSession(newSession);
      setLoading(false);

      if (newSession?.user) {
        window.setTimeout(() => {
          fetchProfile(
            newSession.user.id,
            newSession.user.email,
            newSession.user.user_metadata?.username || newSession.user.user_metadata?.name
          );
        }, 0);
      } else {
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseAvailable) return { error: 'Service unavailable' };

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        10000
      );

      if (error) return { error: error.message };

      if (data.user) {
        await fetchProfile(data.user.id, data.user.email, data.user.user_metadata?.username || data.user.user_metadata?.name);
      }

      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Network error' };
    }
  };

  const signUp = async (email: string, password: string, username: string) => {
    if (!isSupabaseAvailable) return { error: 'Service unavailable' };

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        }),
        10000
      );

      if (error) return { error: error.message };

      if (data.user) {
        await fetchProfile(data.user.id, data.user.email, username);
      }

      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Network error' };
    }
  };

  const signInWithGoogle = async () => {
    if (!isSupabaseAvailable) return;
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
    } catch (error) {
      console.error('Google login failed:', error);
    }
  };

  const signOut = async () => {
    if (!isSupabaseAvailable) return;
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (session?.user) {
      await fetchProfile(session.user.id, session.user.email, session.user.user_metadata?.username || session.user.user_metadata?.name);
    }
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signUp, signInWithGoogle, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
