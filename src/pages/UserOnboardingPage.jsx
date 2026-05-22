import { Camera, ArrowRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RovalLogo } from '../components/TopBar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';

const AVATAR_SCENES = [
  {
    background: '#0348e8',
    shapes: `
      <rect x="24" y="42" width="52" height="52" rx="15" fill="#19a7e7"/>
      <rect x="84" y="42" width="52" height="52" rx="15" fill="#ff9300"/>
      <rect x="24" y="96" width="52" height="42" rx="9" fill="#f466ae"/>
      <path d="M52 102 61 120 79 129 61 138 52 156 43 138 25 129 43 120z" fill="#ffd20a"/>
      <path d="M84 96h52v42H84z" fill="#ffd20a"/>
      <circle cx="101" cy="116" r="10" fill="#fff7eb"/>
      <circle cx="122" cy="116" r="10" fill="#fff7eb"/>
      <circle cx="104" cy="116" r="5" fill="#151419"/>
      <circle cx="119" cy="116" r="5" fill="#151419"/>
      <path d="M68 78c0-10 8-17 20-17h6c12 0 20 7 20 17v22l-15-8H88c-12 0-20-5-20-14z" fill="#fff"/>
      <circle cx="83" cy="78" r="4" fill="#0348e8"/>
      <circle cx="96" cy="73" r="4" fill="#0348e8"/>
      <circle cx="109" cy="78" r="4" fill="#0348e8"/>
    `,
  },
  {
    background: '#ff6d00',
    shapes: `
      <path d="M38 28c19-15 44 1 45 25-3 17-14 28-28 30-15-6-28-19-31-38 1-7 6-13 14-17z" fill="#f29bc5"/>
      <path d="M55 38 48 67 69 65 58 92 79 55 59 56 69 33z" fill="#ff6d00"/>
      <rect x="22" y="76" width="78" height="56" rx="12" fill="#f2ece9"/>
      <rect x="22" y="50" width="78" height="52" rx="28" fill="#ffae00"/>
      <circle cx="57" cy="72" r="11" fill="#fff7eb"/>
      <circle cx="77" cy="72" r="11" fill="#fff7eb"/>
      <circle cx="62" cy="66" r="7" fill="#151419"/>
      <circle cx="82" cy="66" r="7" fill="#151419"/>
      <circle cx="113" cy="61" r="31" fill="#ffd20a"/>
      <path d="M95 58c6 7 17 7 23-2" fill="none" stroke="#151419" stroke-width="5" stroke-linecap="round"/>
      <rect x="87" y="103" width="54" height="37" rx="15" fill="#f29bc5"/>
      <path d="M105 120c5 8 14 8 19 0" fill="none" stroke="#151419" stroke-width="5" stroke-linecap="round"/>
    `,
  },
  {
    background: '#ffd000',
    shapes: `
      <rect x="22" y="44" width="83" height="70" rx="12" fill="#ff6d00"/>
      <path d="M45 44 72 18 69 44h39l-22 22 31 1-20 24H45z" fill="#ff7b00"/>
      <circle cx="55" cy="74" r="12" fill="#fff"/>
      <circle cx="73" cy="65" r="11" fill="#fff"/>
      <circle cx="55" cy="74" r="6" fill="#151419"/>
      <circle cx="74" cy="65" r="6" fill="#151419"/>
      <path d="M70 85 88 64" stroke="#151419" stroke-width="5" stroke-linecap="round"/>
      <path d="M76 112c0-24 20-43 44-43s43 19 43 43-19 43-43 43c-8 0-15-2-22-6l-18 8 7-20c-7-7-11-16-11-25z" fill="#f3eee9"/>
      <path d="M102 111c6 10 24 10 30 0" fill="none" stroke="#151419" stroke-width="5" stroke-linecap="round"/>
      <path d="M82 132c9-7 19-4 21 5 0 10-12 14-27 8-2-6 0-11 6-13z" fill="#f467b4"/>
    `,
  },
  {
    background: '#f29bc5',
    shapes: `
      <ellipse cx="86" cy="135" rx="68" ry="8" fill="#e85aae" opacity=".35"/>
      <rect x="35" y="52" width="90" height="17" rx="5" fill="#05a85d"/>
      <rect x="39" y="75" width="82" height="62" rx="8" fill="#05a85d"/>
      <path d="M70 75h11v62H70zM64 52h11v17H64z" fill="#f3eee9"/>
      <path d="M55 52c0-20 47-21 48 0z" fill="#ff7b00"/>
      <circle cx="88" cy="58" r="10" fill="#fff"/>
      <circle cx="89" cy="58" r="5" fill="#151419"/>
      <path d="M68 56c3 8 13 8 16 0" fill="none" stroke="#151419" stroke-width="5" stroke-linecap="round"/>
      <path d="M61 50c-18-20-1-32 13-11 13-23 33-9 14 11z" fill="#f3eee9"/>
    `,
  },
  {
    background: '#ffd000',
    shapes: `
      <path d="M44 23c30-10 65 9 74 42l17 61c3 12-4 24-17 27l-49 13c-12 3-24-4-27-17L25 88c-8-30 0-55 19-65z" fill="#ff6d00"/>
      <path d="M31 59c8-6 19-6 26 3M36 78c7-5 15-4 20 3" stroke="#f29bc5" stroke-width="8" stroke-linecap="round"/>
      <circle cx="69" cy="67" r="12" fill="#fff"/>
      <circle cx="88" cy="58" r="12" fill="#fff"/>
      <circle cx="69" cy="67" r="6" fill="#151419"/>
      <circle cx="88" cy="58" r="6" fill="#151419"/>
      <path d="M86 78 101 63" stroke="#151419" stroke-width="5" stroke-linecap="round"/>
      <rect x="95" y="104" width="22" height="52" rx="10" transform="rotate(-24 106 130)" fill="#ff8b00"/>
      <path d="M63 124c6 0 11 5 11 12v5c0 7-5 12-11 12s-11-5-11-12v-5c0-7 5-12 11-12z" fill="#f467b4"/>
    `,
  },
  {
    background: '#f29bc5',
    shapes: `
      <circle cx="81" cy="83" r="47" fill="#ff7b22"/>
      <path d="M32 92c35-22 82-21 114 4" fill="none" stroke="#f3eee9" stroke-width="10" stroke-linecap="round"/>
      <path d="M32 92c35 22 82 21 114-4" fill="none" stroke="#f3eee9" stroke-width="10" stroke-linecap="round"/>
      <path d="M59 65c8 10 25 10 33 0" fill="none" stroke="#3e3542" stroke-width="5" stroke-linecap="round"/>
      <path d="M71 55c8 8 20 8 28 0" fill="none" stroke="#3e3542" stroke-width="5" stroke-linecap="round"/>
      <path d="M58 107 65 96l7 11 12 4-12 5-7 11-7-11-12-5z" fill="#ffd20a"/>
      <rect x="28" y="45" width="21" height="18" rx="4" fill="#05a85d"/>
      <path d="M27 45c-5-9 10-15 15-3" stroke="#f3eee9" stroke-width="6" stroke-linecap="round"/>
      <path d="M101 78c0-8 7-14 17-14h5c10 0 17 6 17 14v17l-11-6h-11c-10 0-17-4-17-11z" fill="#f3eee9"/>
      <circle cx="115" cy="78" r="3" fill="#f29bc5"/>
      <circle cx="123" cy="78" r="3" fill="#f29bc5"/>
      <circle cx="131" cy="78" r="3" fill="#f29bc5"/>
    `,
  },
];

function generatedAvatar(index) {
  const scene = AVATAR_SCENES[index % AVATAR_SCENES.length];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <rect width="160" height="160" rx="80" fill="${scene.background}"/>
      ${scene.shapes}
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default function UserOnboardingPage({ profile }) {
  const { user } = useAuth();
  const { updateProfile } = usePlanner();
  const fallbackAvatar = useMemo(() => generatedAvatar(Math.floor(Math.random() * AVATAR_SCENES.length)), []);
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

          <p className="mt-3 text-xs leading-5 text-ink-500">No upload yet? We will use one of the Wenneker profile icons for now.</p>
          {error && <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}

          <button type="submit" className="primary-button mt-5 w-full">
            Continue to planner <ArrowRight size={17} />
          </button>
        </form>
      </div>
    </main>
  );
}
