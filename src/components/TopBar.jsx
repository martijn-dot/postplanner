import { ChevronDown, LogOut, Moon, Settings, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';

export default function TopBar({ project }) {
  const { user, signOut, demoMode } = useAuth();
  const { profiles } = usePlanner();
  const [dark, setDark] = useState(() => localStorage.theme !== 'light');
  const [menuOpen, setMenuOpen] = useState(false);
  const profile = (profiles ?? []).find((item) => item.id === user.id) ?? { email: user.email, display_name: user.email?.split('@')[0] ?? 'User', role: 'user' };
  const initials = (profile.display_name ?? profile.email ?? 'U').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.theme = dark ? 'dark' : 'light';
  }, [dark]);

  return (
    <header className="flex h-16 items-center justify-between border-b border-black/10 bg-white/80 px-5 text-ink-950 backdrop-blur dark:border-white/10 dark:bg-ink-950/80 dark:text-ink-100">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-sm font-bold uppercase tracking-[0.18em] text-accent-400">Post Planner</Link>
        {project && <span className="text-sm text-ink-500">/ {project.name}</span>}
      </div>
      <div className="flex items-center gap-2">
        {demoMode && <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-300">Demo mode</span>}
        {profile.role === 'admin' && (
          <Link to="/settings" className="icon-button" aria-label="Settings">
            <Settings size={18} />
          </Link>
        )}
        <button type="button" onClick={() => setDark((next) => !next)} className="icon-button" aria-label="Toggle theme">
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <div className="relative">
          <button type="button" onClick={() => setMenuOpen((next) => !next)} className="flex items-center gap-2 rounded-md border border-black/10 bg-black/5 px-2 py-1.5 text-sm font-semibold dark:border-white/10 dark:bg-white/5">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-500 text-xs text-white">{initials}</span>
            <span className="hidden max-w-32 truncate sm:block">{profile.display_name}</span>
            <ChevronDown size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-[600] mt-2 w-64 rounded-lg border border-white/10 bg-ink-900 p-3 text-sm text-ink-100 shadow-glow">
              <p className="font-semibold">{profile.display_name}</p>
              <p className="mt-1 truncate text-ink-500">{profile.email}</p>
              <span className="mt-3 inline-flex rounded-full bg-accent-500/15 px-2 py-1 text-xs font-semibold uppercase text-accent-300">{profile.role}</span>
              <button type="button" onClick={signOut} className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-red-200 hover:bg-white/5">
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
