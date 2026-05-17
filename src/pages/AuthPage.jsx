import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function AuthPage() {
  const { session, demoMode, hasSupabaseConfig, signIn, signUp, enterDemo } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (session || demoMode) return <Navigate to="/" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const result = mode === 'signin' ? await signIn(email, password) : await signUp(email, password, displayName);
    if (result.error) setError(result.error.message);
  };

  return (
    <main className="grid min-h-screen place-items-center bg-ink-950 px-5 text-ink-100">
      <section className="w-full max-w-md rounded-xl border border-white/10 bg-ink-900 p-6 shadow-glow">
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent-300">Post Planner</p>
          <h1 className="mt-4 text-3xl font-semibold">Production timelines without the spreadsheet drift.</h1>
        </div>

        {hasSupabaseConfig ? (
          <form onSubmit={submit} className="space-y-4">
            <input className="field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" required />
            {mode === 'signup' && <input className="field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name" required />}
            <input className="field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" required />
            {error && <p className="text-sm text-red-300">{error}</p>}
            <button className="primary-button w-full" type="submit">
              {mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={17} />
            </button>
            <button type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} className="w-full text-sm text-ink-400 hover:text-ink-100">
              {mode === 'signin' ? 'Need an account?' : 'Already have an account?'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-ink-300">
              Supabase keys are not configured yet, so the app can run in a local demo mode while the backend is being set up.
            </p>
            <button type="button" onClick={enterDemo} className="primary-button w-full">
              Open demo planner <ArrowRight size={17} />
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
