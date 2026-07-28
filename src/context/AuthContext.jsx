import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);
const LOCALHOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const IDLE_LOGOUT_MS = 24 * 60 * 60 * 1000;
const AUTH_STARTUP_TIMEOUT_MS = 8000;
const STANDARD_LOGIN = {
  username: 'PostPlanner',
  password: 'PostPlanner',
  user: {
    id: 'standard-postplanner-user',
    email: 'postplanner@planner.local',
    user_metadata: {
      display_name: 'PostPlanner',
      role: 'user',
      standard_login: true,
    },
  },
};

function isLocalhost() {
  return typeof window !== 'undefined' && LOCALHOSTS.has(window.location.hostname);
}

function withTimeout(promise, timeoutMs, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      window.setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

async function resolveAuthCallback() {
  const url = new URL(window.location.href);
  const tokenHash = url.searchParams.get('token_hash');
  const callbackType = url.searchParams.get('type');

  if (tokenHash && callbackType) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: callbackType,
    });

    url.searchParams.delete('token_hash');
    url.searchParams.delete('type');
    if (error) {
      url.searchParams.set('error', 'auth_callback_error');
      url.searchParams.set('error_description', error.message);
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    return error ? { data: { session: null }, error } : { data: { session: data.session }, error: null };
  }

  const authorizationCode = url.searchParams.get('code');
  if (authorizationCode) {
    const result = await supabase.auth.exchangeCodeForSession(authorizationCode);
    url.searchParams.delete('code');
    if (result.error) {
      url.searchParams.set('error', 'auth_callback_error');
      url.searchParams.set('error_description', result.error.message);
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    return result;
  }

  return supabase.auth.getSession();
}

export function AuthProvider({ children }) {
  const localAdminMode = isLocalhost() && !hasSupabaseConfig;
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [demoMode, setDemoMode] = useState(!hasSupabaseConfig);

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    let alive = true;

    withTimeout(resolveAuthCallback(), AUTH_STARTUP_TIMEOUT_MS, { data: { session: null } }).then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    }).catch((error) => {
      console.error('Could not start auth session', error);
      if (alive) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setDemoMode(false);
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig || !session || session.user?.user_metadata?.standard_login) return undefined;
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
  }, [session]);

  const value = useMemo(
    () => ({
      session,
      loading,
      demoMode,
      hasSupabaseConfig,
      localAdminMode,
      user: session?.user ?? { id: 'demo-user', email: 'demo@planner.local' },
      signIn: async (email, password) => {
        if (email === STANDARD_LOGIN.username && password === STANDARD_LOGIN.password) {
          setSession({ user: STANDARD_LOGIN.user });
          setDemoMode(true);
          return { data: { session: { user: STANDARD_LOGIN.user }, user: STANDARD_LOGIN.user }, error: null };
        }
        return supabase.auth.signInWithPassword({ email, password });
      },
      signUp: async (email, password, displayName) => supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } }),
      resetPassword: async (email) => supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login?mode=update-password` }),
      updatePassword: async (password) => supabase.auth.updateUser({ password }),
      signOut: async () => {
        if (hasSupabaseConfig && !session?.user?.user_metadata?.standard_login) await supabase.auth.signOut();
        setSession(null);
        setDemoMode(!hasSupabaseConfig);
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
