import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import TopBar from '../components/TopBar.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';
import TimelineView from './TimelineView.jsx';
import ClientTableView from './ClientTableView.jsx';

export default function ProjectPage() {
  const { projectId } = useParams();
  const { projects, loading, upsertPresence, clearPresence, markProjectEdited } = usePlanner();
  const project = projects.find((item) => item.id === projectId);
  const actionsRef = useRef({ upsertPresence, clearPresence, markProjectEdited });

  useEffect(() => {
    actionsRef.current = { upsertPresence, clearPresence, markProjectEdited };
  }, [clearPresence, markProjectEdited, upsertPresence]);

  useEffect(() => {
    if (!projectId) return undefined;
    actionsRef.current.upsertPresence(projectId);
    const interval = window.setInterval(() => actionsRef.current.upsertPresence(projectId), 30_000);
    const leave = () => {
      actionsRef.current.markProjectEdited(projectId);
      actionsRef.current.clearPresence(projectId);
    };
    window.addEventListener('beforeunload', leave);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('beforeunload', leave);
      leave();
    };
  }, [projectId]);

  if (loading) return <div className="grid min-h-screen place-items-center bg-ink-950 text-ink-100">Loading project...</div>;
  if (!project) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-zinc-50 text-ink-950 dark:bg-ink-950 dark:text-ink-100">
      <TopBar project={project} />
      <nav className="flex h-12 items-center gap-1 border-b border-black/10 bg-white px-5 dark:border-white/10 dark:bg-ink-900">
        <NavLink end to={`/projects/${projectId}`} className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}>Timeline</NavLink>
        <NavLink to={`/projects/${projectId}/client`} className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}>Client Table</NavLink>
      </nav>
      <Routes>
        <Route index element={<TimelineView project={project} />} />
        <Route path="client" element={<ClientTableView project={project} />} />
      </Routes>
    </div>
  );
}
