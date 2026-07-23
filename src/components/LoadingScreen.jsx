import { RovalLogo } from './TopBar.jsx';

export default function LoadingScreen({ message = 'Loading...' }) {
  return (
    <div className="grid min-h-screen place-items-center bg-ink-950 text-ink-100">
      <div className="flex flex-col items-center gap-4 text-center">
        <RovalLogo />
        <span className="text-sm font-semibold text-ink-300">{message}</span>
      </div>
    </div>
  );
}
