import { Camera, ChevronDown, LogOut, Moon, Save, Settings, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';

export function RovalLogo() {
  return (
    <span className="roval-brand-mark" aria-hidden="true">
      <span className="roval-brand-r">R</span>
      <span className="roval-brand-lines">
        <span />
        <span />
        <span />
      </span>
    </span>
  );
}

export default function TopBar({ project, planningVersions = [], activePlanningVersion = '' }) {
  const { user, signOut, demoMode } = useAuth();
  const { profiles, saveError, clearSaveError, updateProfile } = usePlanner();
  const [dark, setDark] = useState(() => localStorage.theme !== 'light');
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('');
  const profile = (profiles ?? []).find((item) => item.id === user.id) ?? { email: user.email, display_name: user.email?.split('@')[0] ?? 'User', role: 'user' };
  const initials = (profile.display_name ?? profile.email ?? 'U').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.theme = dark ? 'dark' : 'light';
  }, [dark]);

  useEffect(() => {
    if (!menuOpen) return;
    setProfileName(profile.display_name ?? '');
    setProfileAvatar(profile.avatar_url ?? '');
  }, [menuOpen, profile.avatar_url, profile.display_name]);

  const saveProfile = () => {
    updateProfile({ display_name: profileName, avatar_url: profileAvatar });
    setMenuOpen(false);
  };

  const readAvatarFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') setProfileAvatar(reader.result);
    });
    reader.readAsDataURL(file);
  };

  const avatar = profile.avatar_url ? (
    <img src={profile.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
  ) : initials;

  return (
    <>
      {saveError && (
        <div className="flex items-center justify-between gap-4 border-b border-red-500/30 bg-red-500/12 px-5 py-2 text-sm font-semibold text-red-100">
          <span>{saveError}</span>
          <button type="button" onClick={clearSaveError} className="text-xs uppercase tracking-wide text-red-200 hover:text-white">Dismiss</button>
        </div>
      )}
      <header className="relative z-[1200] flex h-16 items-center justify-between border-b border-black/10 bg-white/80 px-5 text-ink-950 backdrop-blur dark:border-white/10 dark:bg-ink-950/80 dark:text-ink-100">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-accent-300">
            <RovalLogo />
            <span className="flex flex-col leading-none">
              <span>ROVAL</span>
              <span className="mt-1 text-[10px] font-semibold normal-case tracking-normal text-ink-500">the post production planner without clutter</span>
            </span>
          </Link>
          {project && (
            <span className="flex items-center gap-2 text-sm text-ink-500">
              <span>/ {project.name}</span>
              {planningVersions.length > 1 && (
                <span className="flex gap-1">
                  {planningVersions.map((version) => (
                    <Link
                      key={version}
                      to={`/projects/${project.id}?version=${version}`}
                      className={`rounded-md border px-2 py-1 text-xs font-semibold ${version === activePlanningVersion ? 'border-amber-300/40 bg-amber-300/15 text-amber-200' : 'border-white/10 bg-white/5 text-ink-500 hover:text-ink-100'}`}
                    >
                      {version}
                    </Link>
                  ))}
                </span>
              )}
            </span>
          )}
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
              <span className="grid h-7 w-7 overflow-hidden place-items-center rounded-full bg-accent-500 text-xs text-white">{avatar}</span>
              <span className="hidden max-w-32 truncate sm:block">{profile.display_name}</span>
              <ChevronDown size={14} />
            </button>
            {menuOpen && (
              <div className="fixed right-5 top-16 z-[3000] w-80 rounded-lg border border-white/10 bg-ink-900 p-3 text-sm text-ink-100 shadow-glow">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 overflow-hidden place-items-center rounded-full bg-accent-500 text-sm font-bold text-white">
                    {profileAvatar ? <img src={profileAvatar} alt="" className="h-full w-full rounded-full object-cover" /> : initials}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">{profile.display_name}</p>
                    <p className="mt-1 truncate text-ink-500">{profile.email}</p>
                  </div>
                </div>
                <span className="mt-3 inline-flex rounded-full bg-accent-500/15 px-2 py-1 text-xs font-semibold uppercase text-accent-300">{profile.role}</span>
                <label className="mt-4 block space-y-1">
                  <span className="text-xs font-semibold uppercase text-ink-500">Username</span>
                  <input className="field !py-2" value={profileName} onChange={(event) => setProfileName(event.target.value)} />
                </label>
                <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-md border border-white/10 px-3 py-2 font-semibold text-ink-300 transition hover:bg-white/5 hover:text-white">
                  <Camera size={16} />
                  Upload picture
                  <input type="file" accept="image/*" className="hidden" onChange={(event) => readAvatarFile(event.target.files?.[0])} />
                </label>
                <button type="button" onClick={saveProfile} className="primary-button mt-3 w-full">
                  <Save size={16} /> Save profile
                </button>
                <div className="my-3 border-t border-white/10" />
                <button type="button" onClick={signOut} className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-red-200 hover:bg-white/5">
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
