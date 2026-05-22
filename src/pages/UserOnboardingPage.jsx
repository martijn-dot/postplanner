import { Camera, ArrowRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RovalLogo } from '../components/TopBar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';

const FISH_PALETTES = [
  ['#12a5ba', '#d9d9d9', '#7f8588', '#0d7f92'],
  ['#008c7f', '#d9d9d9', '#d7ea8e', '#006b66'],
  ['#eb557d', '#d9d9d9', '#8026a7', '#d93065'],
  ['#ffdf4d', '#d9d9d9', '#41418c', '#ffd32f'],
  ['#82cbea', '#d9d9d9', '#14358f', '#42aee3'],
  ['#c79445', '#d9d9d9', '#5a4334', '#d0b56b'],
];

function hashString(value = '') {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
}

function fishAvatar(index) {
  const [body, head, accent, tail] = FISH_PALETTES[index % FISH_PALETTES.length];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <rect width="160" height="160" rx="80" fill="#171325"/>
      <g transform="translate(14 34)">
        <path d="M4 46 36 14v64z" fill="${head}"/>
        <path d="M36 14h56l30 32-30 32H36z" fill="${body}"/>
        <path d="M92 46 142 12v68z" fill="${tail}"/>
        <path d="M48 20c14 9 19 43 7 58h20c10-18 6-45-8-58z" fill="${accent}" opacity=".9"/>
        <path d="M76 20c14 9 19 43 7 58h18c10-18 6-45-8-58z" fill="#fff" opacity=".42"/>
        <circle cx="24" cy="45" r="4" fill="#6f7275"/>
      </g>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default function UserOnboardingPage({ profile }) {
  const { user } = useAuth();
  const { updateProfile } = usePlanner();
  const fallbackAvatar = useMemo(() => fishAvatar(hashString(user.id) % FISH_PALETTES.length), [user.id]);
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [avatar, setAvatar] = useState('');
  const [error, setError] = useState('');

  const previewAvatar = avatar || fallbackAvatar;

  const readAvatarFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') setAvatar(reader.result);
    });
    reader.readAsDataURL(file);
  };

  const submit = async (event) => {
    event.preventDefault();
    const cleanFirstName = firstName.trim();
    const cleanSurname = surname.trim();
    if (!cleanFirstName || !cleanSurname) {
      setError('First name and surname are mandatory.');
      return;
    }
    setError('');
    await updateProfile({
      display_name: `${cleanFirstName} ${cleanSurname}`,
      avatar_url: previewAvatar,
    });
  };

  return (
    <main className="min-h-screen bg-ink-950 px-5 py-8 text-ink-100">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_420px] lg:items-start">
        <section className="rounded-xl border border-white/10 bg-ink-900 p-6 shadow-glow">
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-accent-300">
            <RovalLogo />
            ROVAL
          </p>
          <h1 className="mt-6 text-3xl font-semibold">Welcome to the Wenneker Amsterdam Post Planner.</h1>
          <div className="mt-5 space-y-4 text-sm leading-6 text-ink-300">
            <p>Before getting started, please make sure to identify yourself properly by using your first name and surname as your username and by uploading a profile picture. This helps us keep communication, scheduling, and collaboration clear and personal across all projects and teams.</p>
            <p>The Post Planner is a custom-built planning environment developed specifically for the Wenneker Amsterdam post-production workflow. It is based on years of hands-on experience working with multiple planning and production management tools, combined into one streamlined system tailored to the way we work.</p>
            <p>The platform is continuously evolving, and we highly value feedback from the people using it every day. If you have ideas, requests, or would like to see custom functionality added to improve your workflow, feel free to contact us at <a className="font-semibold text-accent-300 hover:text-accent-200" href="mailto:post@wenneker.amsterdam">post@wenneker.amsterdam</a>.</p>
            <p>Enjoy the platform and happy planning.</p>
          </div>
        </section>

        <form onSubmit={submit} className="rounded-xl border border-white/10 bg-ink-900 p-6 shadow-glow">
          <div className="flex items-center gap-4">
            <span className="grid h-24 w-24 overflow-hidden place-items-center rounded-full border border-white/10 bg-ink-950">
              <img src={previewAvatar} alt="" className="h-full w-full object-cover" />
            </span>
            <div>
              <p className="text-lg font-semibold">Set up your profile</p>
              <p className="mt-1 text-sm text-ink-500">{profile?.email ?? user.email}</p>
            </div>
          </div>

          <label className="mt-6 block space-y-1">
            <span className="text-xs font-semibold uppercase text-ink-500">First name</span>
            <input className="field" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
          </label>

          <label className="mt-4 block space-y-1">
            <span className="text-xs font-semibold uppercase text-ink-500">Surname</span>
            <input className="field" value={surname} onChange={(event) => setSurname(event.target.value)} required />
          </label>

          <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-3 font-semibold text-ink-300 transition hover:bg-white/5 hover:text-white">
            <Camera size={17} />
            Upload profile picture
            <input type="file" accept="image/*" className="hidden" onChange={(event) => readAvatarFile(event.target.files?.[0])} />
          </label>

          <p className="mt-3 text-xs leading-5 text-ink-500">No upload yet? We will use one of the Wenneker fish avatars for now.</p>
          {error && <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}

          <button type="submit" className="primary-button mt-5 w-full">
            Continue to planner <ArrowRight size={17} />
          </button>
        </form>
      </div>
    </main>
  );
}
