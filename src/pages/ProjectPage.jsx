import { NavLink, Navigate, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import TopBar from '../components/TopBar.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';
import TimelineView from './TimelineView.jsx';
import ClientTableView from './ClientTableView.jsx';
import AssetListPage from './AssetListPage.jsx';
import { DEFAULT_PLANNING_TYPE, PLANNING_TYPES } from '../lib/defaults.js';

function safePlanningType(value) {
  return PLANNING_TYPES[value]?.key ?? DEFAULT_PLANNING_TYPE;
}

function versionsForProject(project, lineItems = [], categories = [], planningType = DEFAULT_PLANNING_TYPE) {
  const safeType = safePlanningType(planningType);
  const versions = [...new Set([
    ...(safeType === DEFAULT_PLANNING_TYPE && Array.isArray(project?.planning_versions) ? project.planning_versions : []),
    safeType === DEFAULT_PLANNING_TYPE ? project?.preferred_planning_version : null,
    ...lineItems.filter((item) => item.project_id === project?.id && safePlanningType(item.planning_type) === safeType).map((item) => item.planning_version ?? 'V1'),
    ...categories.filter((category) => category.project_id === project?.id && safePlanningType(category.planning_type) === safeType).map((category) => category.planning_version ?? 'V1'),
  ].filter(Boolean))];
  const ordered = versions.sort((a, b) => Number(String(a).replace(/^V/i, '')) - Number(String(b).replace(/^V/i, '')));
  return ordered.length ? ordered : [];
}

export default function ProjectPage() {
  const { projectId } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { projects, lineItems, categories, loading, upsertPresence, clearPresence, markProjectEdited, ensurePlanningModule } = usePlanner();
  const project = projects.find((item) => item.id === projectId);
  const requestedType = safePlanningType(searchParams.get('type'));
  const versions = versionsForProject(project, lineItems, categories, requestedType);
  const requestedVersion = searchParams.get('version');
  const fallbackVersion = requestedType === DEFAULT_PLANNING_TYPE ? project?.preferred_planning_version : null;
  const activeVersion = versions.includes(requestedVersion) ? requestedVersion : (versions.includes(fallbackVersion) ? fallbackVersion : versions[0] ?? 'V1');
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

  useEffect(() => {
    if (!project || versions.length) return;
    ensurePlanningModule(project.id, requestedType);
  }, [ensurePlanningModule, project, requestedType, versions.length]);

  if (loading) return <LoadingScreen message="Loading project..." />;
  if (!project) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-zinc-50 text-ink-950 dark:bg-ink-950 dark:text-ink-100">
      <TopBar project={project} planningType={requestedType} planningVersion={activeVersion} planningVersions={versions} currentPath={location.pathname} />
      <nav className="flex h-12 items-center gap-1 border-b border-black/10 bg-white px-5 dark:border-white/10 dark:bg-ink-900">
        <NavLink end to={`/projects/${projectId}?type=${requestedType}&version=${activeVersion}`} className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}>Timeline</NavLink>
        <NavLink to={`/projects/${projectId}/client?type=${requestedType}&version=${activeVersion}`} className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}>Client View</NavLink>
        <NavLink to={`/projects/${projectId}/assets?type=${requestedType}&version=${activeVersion}`} className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}>Asset List</NavLink>
      </nav>
      <Routes>
        <Route index element={<TimelineView project={project} planningType={requestedType} planningVersion={activeVersion} />} />
        <Route path="client" element={<ClientTableView key={`${project.id}:${requestedType}:${activeVersion}`} project={project} planningType={requestedType} planningVersion={activeVersion} />} />
        <Route path="assets" element={<AssetListPage project={project} />} />
      </Routes>
    </div>
  );
}
