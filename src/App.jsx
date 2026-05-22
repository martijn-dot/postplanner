import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { PlannerProvider, usePlanner } from './context/PlannerContext.jsx';
import AuthPage from './pages/AuthPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ProjectPage from './pages/ProjectPage.jsx';
import PublicClientPage from './pages/PublicClientPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import UserOnboardingPage from './pages/UserOnboardingPage.jsx';

function needsOnboarding(profile) {
  if (!profile || profile.role === 'admin') return false;
  const nameParts = (profile.display_name ?? '').trim().split(/\s+/).filter(Boolean);
  return nameParts.length < 2 || !profile.avatar_url;
}

function PlannerRoutes() {
  const { user, demoMode } = useAuth();
  const { loading, profiles } = usePlanner();
  const profile = profiles.find((item) => item.id === user.id);

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-ink-950 text-ink-100">Loading planner...</div>;
  }

  if (!demoMode && needsOnboarding(profile)) {
    return <UserOnboardingPage profile={profile} />;
  }

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/projects/:projectId/*" element={<ProjectPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function ProtectedRoutes() {
  const { session, loading, demoMode } = useAuth();

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-ink-950 text-ink-100">Loading planner...</div>;
  }

  if (!session && !demoMode) {
    return <Navigate to="/login" replace />;
  }

  return (
    <PlannerProvider>
      <PlannerRoutes />
    </PlannerProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/share/:token" element={<PublicClientPage />} />
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </AuthProvider>
  );
}
