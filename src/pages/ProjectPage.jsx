import { NavLink, Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import TopBar from '../components/TopBar.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';
import TimelineView from './TimelineView.jsx';
import ClientTableView from './ClientTableView.jsx';

function versionsForProject(project, lineItems = [], categories = []) {
  const versions = [...new Set([
    ...(Array.isArray(project?.planning_versions) ? project.planning_versions : []),
    project?.preferred_planning_version,
    ...lineItems.filter((item) => item.project_id === project?.id).map((item) => item.planning_version ?? 'V1'),
    ...categories.filter((category) => category.project_id === project?.id).map((category) => category.planning_version ?? 'V1'),
  ].filter(Boolean))];
  const ordered = versions.sort((a, b) => Number(String(a).replace(/^V/i, '')) - Number(String(b).replace(/^V/i, '')));
  return ordered.length ? ordered : ['V1'];
}

export default function ProjectPage() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const { projects, lineItems, categories, loading, upsertPresence, clearPresence, markProjectEdited } = usePlanner();
  const project = projects.find((item) => item.id === projectId);
  const versions = versionsForProject(project, lineItems, categories);
  const requestedVersion = searchParams.get('version');
  const activeVersion = versions.includes(requestedVersion) ? requestedVersion : project?.preferred_planning_version ?? versions[0];
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
      <TopBar project={project} planningVersions={versions} />
      <nav className="flex h-12 items-center gap-1 border-b border-black/10 bg-white px-5 dark:border-white/10 dark:bg-ink-900">
        <NavLink end to={`/projects/${projectId}?version=${activeVersion}`} className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}>Timeline</NavLink>
        <NavLink to={`/projects/${projectId}/client?version=${activeVersion}`} className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}>Client View</NavLink>
        {versions.length > 1 && (
          <span className="ml-auto flex items-center gap-2">
            <span className="rounded-md border border-amber-300/40 bg-amber-300/15 px-2 py-1 text-xs font-semibold uppercase text-amber-200">Working in {activeVersion}</span>
            {versions.map((version) => (
              <NavLink key={version} to={`/projects/${projectId}?version=${version}`} className="rounded-md border border-white/10 px-2 py-1 text-xs font-semibold text-ink-500 transition hover:border-accent-400 hover:bg-accent-500/20 hover:text-accent-100">
                {version}
              </NavLink>
            ))}
          </span>
        )}
      </nav>
      <Routes>
        <Route index element={<TimelineView project={project} planningVersion={activeVersion} />} />
        <Route path="client" element={<ClientTableView project={project} planningVersion={activeVersion} />} />
      </Routes>
    </div>
  );
}
