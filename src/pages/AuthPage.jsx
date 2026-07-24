import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from '../components/AppIcons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { RovalLogo } from '../components/TopBar.jsx';

function authErrorFromUrl(searchParams) {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const error = searchParams.get('error') || hashParams.get('error');
  const errorCode = searchParams.get('error_code') || hashParams.get('error_code');
  const description = searchParams.get('error_description') || hashParams.get('error_description');
  if (!error && !errorCode && !description) return null;
  return { error, errorCode, description };
}

export default function AuthPage() {
  const { session, demoMode, hasSupabaseConfig, signIn, resetPassword, updatePassword, enterDemo } = useAuth();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(searchParams.get('mode') === 'update-password' ? 'update-password' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dismissAuthLinkError, setDismissAuthLinkError] = useState(false);
  const authLinkError = dismissAuthLinkError ? null : authErrorFromUrl(searchParams);

  if ((session && mode !== 'update-password') || demoMode) return <Navigate to="/" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (mode === 'recover') {
      const result = await resetPassword(email);
      if (result.error) setError(result.error.message);
      else setNotice('Password reset email sent. Check your inbox.');
      return;
    }

    if (mode === 'update-password') {
      const result = await updatePassword(password);
      if (result.error) setError(result.error.message);
      else {
        setNotice('Password updated. You can continue to the planner.');
        setMode('signin');
        setPassword('');
      }
      return;
    }

    const result = await signIn(email, password);
    if (result.error) setError(result.error.message);
  };

  return (
    <main className="grid min-h-screen place-items-center bg-ink-950 px-5 text-ink-100">
      <section className="w-full max-w-md rounded-xl border border-white/10 bg-ink-900 p-6 shadow-glow">
        <div className="mb-8">
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-accent-300">
            <RovalLogo />
            ROVAL
          </p>
          <h1 className="mt-4 text-3xl font-semibold">Production timelines without the spreadsheet drift.</h1>
        </div>

        {hasSupabaseConfig && authLinkError ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4">
              <h2 className="text-lg font-semibold text-amber-100">This invite link has already been used.</h2>
              <p className="mt-2 text-sm leading-6 text-ink-300">
                Your account has already been created, or this invitation link is no longer valid. If you already made a password, you can sign in with your email and password.
              </p>
              {authLinkError.description && <p className="mt-2 text-xs text-ink-500">{authLinkError.description}</p>}
            </div>
            <a
              href="mailto:postplanner@wenneker.amsterdam?subject=New%20Post%20Planner%20invite%20request&body=Hi%20Post%20Planner%20team%2C%0A%0AI%20am%20having%20issues%20with%20my%20invite%20link.%20Could%20you%20please%20send%20me%20a%20new%20invite%3F%0A%0AEmail%3A%20"
              className="primary-button w-full"
            >
              Request a new invite
            </a>
            <button type="button" onClick={() => { setDismissAuthLinkError(true); setMode('signin'); }} className="secondary-button w-full">
              Back to sign in
            </button>
          </div>
        ) : hasSupabaseConfig ? (
          <form onSubmit={submit} className="space-y-4">
            {mode !== 'update-password' && <input className="field" type={mode === 'recover' ? 'email' : 'text'} value={email} onChange={(event) => setEmail(event.target.value)} placeholder={mode === 'recover' ? 'Email' : 'Email or username'} required />}
            {mode !== 'recover' && <input className="field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'update-password' ? 'New password' : 'Password'} required />}
            {error && <p className="text-sm text-red-300">{error}</p>}
            {notice && <p className="rounded-md border border-accent-400/30 bg-accent-500/10 px-3 py-2 text-sm text-accent-100">{notice}</p>}
            <button className="primary-button w-full" type="submit">
              {mode === 'signin' && 'Sign in'}
              {mode === 'recover' && 'Send reset email'}
              {mode === 'update-password' && 'Set new password'}
              <ArrowRight size={17} />
            </button>
            <div className="flex justify-end gap-3 text-sm text-ink-400">
              {mode !== 'signin' && (
                <button type="button" onClick={() => { setMode('signin'); setError(''); setNotice(''); }} className="hover:text-ink-100">
                  Back to sign in
                </button>
              )}
              {mode !== 'recover' && (
                <button type="button" onClick={() => { setMode('recover'); setError(''); setNotice(''); }} className="hover:text-ink-100">
                  Reset password
                </button>
              )}
            </div>
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
