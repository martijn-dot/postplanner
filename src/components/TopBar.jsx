import { Camera, ChevronDown, LogOut, Save, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import rovalLogo from '../assets/roval-logo.png';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';
import { DEFAULT_PLANNING_TYPE, PLANNING_TYPES } from '../lib/defaults.js';

export function RovalLogo() {
  return (
    <span className="roval-brand-mark" aria-hidden="true">
      <img src={rovalLogo} alt="" />
    </span>
  );
}

export default function TopBar({ project = null, planningType = DEFAULT_PLANNING_TYPE, planningVersion = 'V1', planningVersions = [], availablePlanningTypes = Object.keys(PLANNING_TYPES), currentPath = '' }) {
  const { user, signOut, demoMode } = useAuth();
  const { profiles, saveError, clearSaveError, updateProfile } = usePlanner();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('');
  const profile = (profiles ?? []).find((item) => item.id === user.id) ?? { email: user.email, display_name: user.email?.split('@')[0] ?? 'User', role: 'user' };
  const initials = (profile.display_name ?? profile.email ?? 'U').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const isAssetListView = /\/assets\/?$/.test(currentPath);

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
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className={`flex shrink-0 items-center text-sm font-bold uppercase tracking-[0.18em] text-accent-300 ${project ? '' : 'gap-2'}`}>
            <RovalLogo />
            {!project && (
              <span className="flex flex-col leading-none">
                <span>ROVAL</span>
                <span className="mt-1 text-[10px] font-semibold normal-case tracking-normal text-ink-500">the center within project of wenneker.amsterdam without any clutter</span>
              </span>
            )}
          </Link>
          {project && (
            <div className="project-topbar-context flex min-w-0 items-center gap-2">
              <span className="project-topbar-title truncate">{[project.project_number, project.name].filter(Boolean).join(' - ')}</span>
              <span className="project-topbar-client truncate">{project.client || 'Internal project'}</span>
              {!isAssetListView && (
                <>
                  <span className="project-topbar-types">
                    {Object.values(PLANNING_TYPES).filter((definition) => availablePlanningTypes.includes(definition.key)).map((definition) => (
                      <Link
                        key={definition.key}
                        to={`${currentPath}?type=${definition.key}&version=V1`}
                        className={planningType === definition.key ? 'is-active' : ''}
                      >
                        {definition.shortLabel}
                      </Link>
                    ))}
                  </span>
                  {planningVersions.length > 0 && <span className="project-topbar-versions">
                    {planningVersions.map((version) => (
                      <Link
                        key={version}
                        to={`${currentPath}?type=${planningType}&version=${version}`}
                        className={version === planningVersion ? 'is-active' : ''}
                      >
                        {version}
                      </Link>
                    ))}
                  </span>}
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {demoMode && <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-300">Demo mode</span>}
          {profile.role === 'admin' && (
            <Link to="/settings" className="icon-button" aria-label="Settings">
              <Settings size={18} />
            </Link>
          )}
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
