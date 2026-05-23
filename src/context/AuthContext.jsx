import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);
const LOCALHOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const IDLE_LOGOUT_MS = 24 * 60 * 60 * 1000;

function isLocalhost() {
  return typeof window !== 'undefined' && LOCALHOSTS.has(window.location.hostname);
}

export function AuthProvider({ children }) {
  const localAdminMode = isLocalhost();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(hasSupabaseConfig && !localAdminMode);
  const [demoMode, setDemoMode] = useState(!hasSupabaseConfig || localAdminMode);

  useEffect(() => {
    if (localAdminMode) return;
    if (!hasSupabaseConfig) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setDemoMode(false);
    });

    return () => listener.subscription.unsubscribe();
  }, [localAdminMode]);

  useEffect(() => {
    if (localAdminMode || !hasSupabaseConfig || !session) return undefined;
    let timeoutId;
    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(async () => {
        await supabase.auth.signOut();
        setSession(null);
      }, IDLE_LOGOUT_MS);
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      window.clearTimeout(timeoutId);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [localAdminMode, session]);

  const value = useMemo(
    () => ({
      session,
      loading,
      demoMode,
      hasSupabaseConfig,
      localAdminMode,
      user: session?.user ?? { id: 'demo-user', email: 'demo@planner.local' },
      signIn: async (email, password) => supabase.auth.signInWithPassword({ email, password }),
      signUp: async (email, password, displayName) => supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } }),
      resetPassword: async (email) => supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login?mode=update-password` }),
      updatePassword: async (password) => supabase.auth.updateUser({ password }),
      signOut: async () => {
        if (hasSupabaseConfig) await supabase.auth.signOut();
        setDemoMode(!hasSupabaseConfig || localAdminMode);
      },
      enterDemo: () => setDemoMode(true),
    }),
    [demoMode, loading, localAdminMode, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
