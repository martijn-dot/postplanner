import { NavLink, Navigate, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import TopBar from '../components/TopBar.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';
import TimelineView from './TimelineView.jsx';
import ClientTableView from './ClientTableView.jsx';
import AssetListPage from './AssetListPage.jsx';
import BriefPage from './BriefPage.jsx';
import { DEFAULT_PLANNING_TYPE, PLANNING_TYPES } from '../lib/defaults.js';
import { useAuth } from '../context/AuthContext.jsx';
import { CalendarRange, ExternalLink, FileSpreadsheet, NotebookPen } from 'lucide-react';

function safePlanningType(value) {
  return PLANNING_TYPES[value]?.key ?? DEFAULT_PLANNING_TYPE;
}

function slugifyProjectName(value) {
  return String(value ?? 'project')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
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
  const { user } = useAuth();
  const { projectId } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { projects, lineItems, categories, shareLinks, profiles, presence, loading, loadProjectData, upsertPresence, clearPresence, markProjectEdited, ensurePlanningModule } = usePlanner();
  const [projectDataLoading, setProjectDataLoading] = useState(true);
  const project = projects.find((item) => item.id === projectId);
  const requestedType = safePlanningType(searchParams.get('type'));
  const versions = versionsForProject(project, lineItems, categories, requestedType);
  const requestedVersion = searchParams.get('version');
  const fallbackVersion = requestedType === DEFAULT_PLANNING_TYPE ? project?.preferred_planning_version : null;
  const activeVersion = versions.includes(requestedVersion) ? requestedVersion : (versions.includes(fallbackVersion) ? fallbackVersion : versions[0] ?? 'V1');
  const activeClientPortal = shareLinks.find((share) => share.project_id === projectId
    && share.page_type === 'client_planning'
    && !share.revoked_at);
  const clientPortalUrl = activeClientPortal && project
    ? `/share/${slugifyProjectName(project.name)}-${activeClientPortal.token}`
    : '';
  const pageType = location.pathname.endsWith('/assets')
    ? 'asset_list'
    : location.pathname.endsWith('/brief')
      ? 'brief'
      : 'planning';
  const activeEditors = (presence ?? [])
    .filter((item) => {
      if (item.project_id !== projectId || item.user_id === user.id) return false;
      if (Date.now() - new Date(item.last_seen_at).getTime() >= 90_000) return false;
      if ((item.page_type ?? 'planning') !== pageType) return false;
      if (pageType === 'asset_list') return true;
      return safePlanningType(item.planning_type) === requestedType
        && (item.planning_version ?? 'V1') === activeVersion;
    })
    .map((item) => profiles.find((profile) => profile.id === item.user_id)?.display_name)
    .filter(Boolean);
  const pageOccupied = activeEditors.length > 0;
  const actionsRef = useRef({ upsertPresence, clearPresence, markProjectEdited });

  useEffect(() => {
    actionsRef.current = { upsertPresence, clearPresence, markProjectEdited };
  }, [clearPresence, markProjectEdited, upsertPresence]);

  useEffect(() => {
    if (!projectId || pageOccupied) return undefined;
    const scope = { pageType, planningType: requestedType, planningVersion: activeVersion };
    actionsRef.current.upsertPresence(projectId, scope);
    const interval = window.setInterval(() => actionsRef.current.upsertPresence(projectId, scope), 30_000);
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
  }, [activeVersion, pageOccupied, pageType, projectId, requestedType]);

  useEffect(() => {
    let alive = true;
    setProjectDataLoading(true);
    Promise.resolve(loadProjectData(projectId))
      .catch((error) => console.error('Could not load project data', error))
      .finally(() => {
        if (alive) setProjectDataLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [loadProjectData, projectId]);

  useEffect(() => {
    if (projectDataLoading || !project || versions.length) return;
    ensurePlanningModule(project.id, requestedType);
  }, [ensurePlanningModule, project, projectDataLoading, requestedType, versions.length]);

  if (loading || projectDataLoading) return <LoadingScreen message="Loading project..." />;
  if (!project) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-zinc-50 text-ink-950 dark:bg-ink-950 dark:text-ink-100">
      <TopBar project={project} planningType={requestedType} planningVersion={activeVersion} planningVersions={versions} currentPath={location.pathname} />
      <nav className="project-page-tabs flex h-12 items-center gap-1 border-b border-black/10 bg-white px-5 dark:border-white/10 dark:bg-ink-900">
        <NavLink to={`/projects/${projectId}/brief?type=${requestedType}&version=${activeVersion}`} className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}>
          <span className="project-tab-icon"><NotebookPen size={16} strokeWidth={2.1} /></span>
          <span>Brief</span>
        </NavLink>
        <NavLink end to={`/projects/${projectId}?type=${requestedType}&version=${activeVersion}`} className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}>
          <span className="project-tab-icon"><CalendarRange size={16} strokeWidth={2.1} /></span>
          <span>Planning</span>
        </NavLink>
        <NavLink to={`/projects/${projectId}/assets?type=${requestedType}&version=${activeVersion}`} className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}>
          <span className="project-tab-icon"><FileSpreadsheet size={16} strokeWidth={2.1} /></span>
          <span>Asset List</span>
        </NavLink>
        {clientPortalUrl && (
          <a href={clientPortalUrl} target="_blank" rel="noreferrer" className="tab">
            <span className="project-tab-icon"><ExternalLink size={16} strokeWidth={2.1} /></span>
            <span>Client portal</span>
          </a>
        )}
      </nav>
      <Routes>
        <Route index element={<TimelineView project={project} planningType={requestedType} planningVersion={activeVersion} />} />
        <Route path="brief" element={<BriefPage project={project} />} />
        <Route path="client" element={<ClientTableView key={`${project.id}:${requestedType}:${activeVersion}`} project={project} planningType={requestedType} planningVersion={activeVersion} />} />
        <Route path="assets" element={<AssetListPage project={project} />} />
      </Routes>
      {pageOccupied && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-500/55 p-6 backdrop-grayscale">
          <div className="max-w-lg rounded-xl border border-white/20 bg-ink-950/95 px-7 py-6 text-center text-white shadow-2xl">
            <h2 className="text-xl font-semibold">This page is currently being edited</h2>
            <p className="mt-2 text-sm text-ink-300">
              {activeEditors.join(', ')} {activeEditors.length === 1 ? 'is' : 'are'} working in this {pageType === 'asset_list' ? 'asset list' : requestedType === PLANNING_TYPES.production.key ? 'production planning' : 'post-production planning'}.
            </p>
            <p className="mt-2 text-xs text-ink-500">The page is read-only until they leave.</p>
            <button type="button" className="secondary-button mt-5" onClick={() => { window.location.href = '/'; }}>Back to projects</button>
          </div>
        </div>
      )}
    </div>
  );
}
