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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchProfile = useCallback(async (userId: string, fallbackEmail?: string | null, fallbackUsername?: string | null) => {
    if (!isSupabaseAvailable) {
      setProfile(null);
      return;
    }
    try {
      let { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      // Some projects miss the signup trigger. Create the profile from the client as a fallback.
      if (!data && (!error || error.code === 'PGRST116')) {
        const username = (fallbackUsername || fallbackEmail?.split('@')[0] || `player_${userId.slice(0, 6)}`)
          .replace(/[^a-zA-Z0-9_]/g, '_')
          .slice(0, 24);

        const created = await supabase
          .from('profiles')
          .insert({ id: userId, username, role: 'player' })
          .select('*')
          .single();

        data = created.data;
        error = created.error;
      }

      if (mountedRef.current) {
        setProfile(error ? null : data);
      }
    } catch {
      if (mountedRef.current) {
        setProfile(null);
      }
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseAvailable) {
      setLoading(false);
      return;
    }

    let initialSessionResolved = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mountedRef.current) return;

        setSession(newSession);
        if (newSession?.user) {
          await fetchProfile(newSession.user.id, newSession.user.email, newSession.user.user_metadata?.username || newSession.user.user_metadata?.full_name || newSession.user.user_metadata?.name);
        } else {
          setProfile(null);
        }

        if (event === 'INITIAL_SESSION' || !initialSessionResolved) {
          initialSessionResolved = true;
          if (mountedRef.current) setLoading(false);
        }
      }
    );

    const timeout = setTimeout(() => {
      if (!initialSessionResolved && mountedRef.current) {
        initialSessionResolved = true;
        setLoading(false);
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseAvailable) return { error: 'Service unavailable' };
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    } catch {
      return { error: 'Network error' };
    }
  };

  const signUp = async (email: string, password: string, username: string) => {
    if (!isSupabaseAvailable) return { error: 'Service unavailable' };
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      return { error: error?.message ?? null };
    } catch {
      return { error: 'Network error' };
    }
  };

  const signInWithGoogle = async () => {
    if (!isSupabaseAvailable) return;
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
    } catch { /* ignore */ }
  };

  const signOut = async () => {
    if (!isSupabaseAvailable) return;
    try {
      await supabase.auth.signOut();
    } catch { /* ignore */ }
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (session?.user) await fetchProfile(session.user.id, session.user.email, session.user.user_metadata?.username || session.user.user_metadata?.full_name || session.user.user_metadata?.name);
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
