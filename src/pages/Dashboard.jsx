import { ChevronDown, Copy, FileSpreadsheet, Plus, Search, Settings, Star, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import TopBar from '../components/TopBar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';
import { DEFAULT_PLANNING_TYPE, PLANNING_TYPES } from '../lib/defaults.js';

function ComboField({ label, value, onChange, options, placeholder, required = false }) {
  const [open, setOpen] = useState(false);
  const query = value.trim().toLowerCase();
  const filteredOptions = options.slice(0, 12);
  const exactMatch = options.some((option) => option.toLowerCase() === query);

  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase text-ink-500">{label}</span>
      <div className="relative">
        <input
          className="field pr-10"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder={placeholder}
          autoComplete="off"
          required={required}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-ink-500 transition hover:bg-white/10 hover:text-ink-100"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((next) => !next)}
          aria-label={`Open ${label} options`}
        >
          <ChevronDown size={16} />
        </button>
          {open && (
          <div className="combo-menu">
            {filteredOptions.map((option) => (
              <button
                type="button"
                key={option}
                className="combo-option"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(option);
                  setOpen(false);
                }}
              >
                {option}
              </button>
            ))}
            {!filteredOptions.length && <p className="px-3 py-2 text-sm text-ink-500">No saved names yet.</p>}
            {value.trim() && !exactMatch && (
              <button
                type="button"
                className="combo-option border-t border-white/10 text-accent-200"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setOpen(false)}
              >
                Use "{value.trim()}"
              </button>
            )}
          </div>
        )}
      </div>
    </label>
  );
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function safePlanningType(value) {
  return PLANNING_TYPES[value]?.key ?? DEFAULT_PLANNING_TYPE;
}

function versionsForProject(project, lineItems = [], categories = [], planningType = DEFAULT_PLANNING_TYPE) {
  const safeType = safePlanningType(planningType);
  const declaredPlanningVersions = safeType === DEFAULT_PLANNING_TYPE && Array.isArray(project.planning_versions)
    ? project.planning_versions
    : [];
  const versions = [...new Set([
    ...declaredPlanningVersions,
    safeType === DEFAULT_PLANNING_TYPE && declaredPlanningVersions.length ? project.preferred_planning_version : null,
    ...lineItems.filter((item) => item.project_id === project.id && safePlanningType(item.planning_type) === safeType).map((item) => item.planning_version ?? 'V1'),
    ...categories.filter((category) => category.project_id === project.id && safePlanningType(category.planning_type) === safeType).map((category) => category.planning_version ?? 'V1'),
  ].filter(Boolean))];
  const ordered = versions.sort((a, b) => Number(String(a).replace(/^V/i, '')) - Number(String(b).replace(/^V/i, '')));
  return ordered.length ? ordered : [];
}

function hasPlanningModule(project, type, lineItems = [], categories = []) {
  return versionsForProject(project, lineItems, categories, type).length > 0;
}

function slugifyProjectName(name) {
  return (name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'project';
}

const DASHBOARD_PLANNING_ORDER = [PLANNING_TYPES.production, PLANNING_TYPES.post];

export default function Dashboard() {
  const { user } = useAuth();
  const { projects, profiles, clients: savedClients, producers: savedProducers, presence, lineItems, categories, assetLists = [], shareLinks = [], createProject, updateProject, updateProfile, archiveProject, addClient, addProducer, ensurePlanningModule, deletePlanningModule, duplicateProjectPlanning, deleteProjectPlanningVersion, keepProjectPlanningVersion, loadMoreProjects, hasMoreProjects, loading } = usePlanner();
  const [open, setOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [versionMenuProjectId, setVersionMenuProjectId] = useState(null);
  const [archiveProjectTarget, setArchiveProjectTarget] = useState(null);
  const [archiveConfirmText, setArchiveConfirmText] = useState('');
  const [deleteModuleTarget, setDeleteModuleTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [projectNumber, setProjectNumber] = useState('');
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const currentProfile = (profiles ?? []).find((profile) => profile.id === user.id);
  const favoriteProjectIds = Array.isArray(currentProfile?.preferences?.favorite_project_ids)
    ? currentProfile.preferences.favorite_project_ids
    : [];
  const favoriteProjectIdSet = new Set(favoriteProjectIds);
  const currentUserName = currentProfile?.display_name ?? user.email?.split('@')[0] ?? '';
  const [postProducer, setPostProducer] = useState(currentUserName);
  const [producer, setProducer] = useState('');
  const [initialPlanningType, setInitialPlanningType] = useState(DEFAULT_PLANNING_TYPE);
  const [formError, setFormError] = useState('');
  const clients = [...new Set([...(savedClients ?? []).map((item) => item.name)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const postProducers = [...new Set((profiles ?? []).map((profile) => profile.display_name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const producers = [...new Set([...(savedProducers ?? []).map((item) => item.name)].filter((item) => item && !isUuidLike(item)))].sort((a, b) => a.localeCompare(b));
  const profileByName = Object.fromEntries((profiles ?? []).map((profile) => [profile.display_name, profile]));
  const activeProjects = projects.filter((project) => !project.is_archived);
  const activeUserOptions = [...new Set(activeProjects.flatMap((project) => [
    project.post_producer,
    project.producer,
    profiles.find((profile) => profile.id === project.created_by)?.display_name,
  ]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const activeClientOptions = [...new Set(activeProjects.map((project) => project.client).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const activeNamesForProject = (projectId) => (presence ?? [])
    .filter((item) => item.project_id === projectId && item.user_id !== user.id && Date.now() - new Date(item.last_seen_at).getTime() < 90_000)
    .map((item) => (profiles ?? []).find((profile) => profile.id === item.user_id)?.display_name)
    .filter(Boolean);
  const resetForm = () => {
    setOpen(false);
    setEditingProject(null);
    setProjectNumber('');
    setName('');
    setClient('');
    setPostProducer(currentUserName);
    setProducer('');
    setInitialPlanningType(DEFAULT_PLANNING_TYPE);
  };
  const openNewProject = () => {
    setEditingProject(null);
    setProjectNumber('');
    setName('');
    setClient('');
    setPostProducer(currentUserName);
    setProducer('');
    setInitialPlanningType(DEFAULT_PLANNING_TYPE);
    setFormError('');
    setOpen(true);
  };
  const openProjectSettings = (project) => {
    setEditingProject(project);
    setProjectNumber(project.project_number ?? '');
    setName(project.name ?? '');
    setClient(project.client ?? '');
    setPostProducer(project.post_producer ?? '');
    setProducer(project.producer ?? '');
    setInitialPlanningType(DEFAULT_PLANNING_TYPE);
    setOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    setFormError('');
    if (editingProject) {
      updateProject(editingProject.id, {
        project_number: projectNumber,
        name,
        client,
        post_producer: postProducer || null,
        producer: producer || null,
      });
      if (client) addClient(client);
      if (postProducer) addProducer(postProducer);
      if (producer) addProducer(producer);
      resetForm();
      return;
    }
    const selectedPostProducer = initialPlanningType === PLANNING_TYPES.post.key ? postProducer : '';
    const selectedProducer = initialPlanningType === PLANNING_TYPES.production.key ? producer : '';
    if (!/^\d{5}$/.test(projectNumber)) {
      setFormError('Project code should be exactly 5 numbers.');
      return;
    }
    const duplicateProject = projects.find((project) => project.project_number && project.project_number === projectNumber);
    if (duplicateProject) {
      const selectedDefinition = PLANNING_TYPES[initialPlanningType] ?? PLANNING_TYPES.post;
      const selectedExists = hasPlanningModule(duplicateProject, selectedDefinition.key, lineItems, categories);
      const missingDefinitions = DASHBOARD_PLANNING_ORDER.filter((definition) => !hasPlanningModule(duplicateProject, definition.key, lineItems, categories));
      if (selectedExists) {
        setFormError(`${selectedDefinition.label} already exists for project code ${projectNumber}. ${missingDefinitions.length ? `Choose ${missingDefinitions.map((item) => item.label).join(' or ')} to add it to this project.` : 'Both planning modules already exist.'}`);
        return;
      }
      if (window.confirm(`Project code ${projectNumber} already exists. Add ${selectedDefinition.label} planning to that project?`)) {
        updateProject(duplicateProject.id, selectedDefinition.key === PLANNING_TYPES.production.key
          ? { producer: selectedProducer || null }
          : { post_producer: selectedPostProducer || null });
        ensurePlanningModule(duplicateProject.id, selectedDefinition.key);
        if (selectedPostProducer) addProducer(selectedPostProducer);
        if (selectedProducer) addProducer(selectedProducer);
        resetForm();
      } else {
        setFormError(`Project code ${projectNumber} already exists. Choose the missing planning type to add it to the existing project.`);
      }
      return;
    }
    try {
      await createProject({
        projectNumber,
        name,
        client,
        postProducer: selectedPostProducer,
        producer: selectedProducer,
        planningType: initialPlanningType,
      });
      if (client) addClient(client);
      if (selectedPostProducer) addProducer(selectedPostProducer);
      if (selectedProducer) addProducer(selectedProducer);
      resetForm();
    } catch (error) {
      setFormError(error.message);
    }
  };
  const visibleProjects = projects
    .filter((project) => !project.is_archived)
    .filter((project) => {
      const haystack = [project.project_number, project.name, project.client].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !search || haystack.includes(search.toLowerCase());
      const createdBy = profiles.find((profile) => profile.id === project.created_by);
      const matchesUser = !userFilter || project.post_producer === userFilter || project.producer === userFilter || createdBy?.display_name === userFilter;
      const matchesClient = !clientFilter || project.client === clientFilter;
      const matchesFavorites = !favoritesOnly || favoriteProjectIdSet.has(project.id);
      return matchesSearch && matchesUser && matchesClient && matchesFavorites;
    });
  const versionMenuProject = projects.find((project) => project.id === versionMenuProjectId);
  const [versionMenuType, setVersionMenuType] = useState(DEFAULT_PLANNING_TYPE);
  const versionMenuVersions = versionMenuProject ? versionsForProject(versionMenuProject, lineItems, categories, versionMenuType) : [];
  const requestPlanningModuleDelete = (project, definition) => {
    const existingModuleCount = DASHBOARD_PLANNING_ORDER
      .filter((item) => hasPlanningModule(project, item.key, lineItems, categories))
      .length;
    if (existingModuleCount <= 1) {
      setOpen(false);
      setDeleteModuleTarget(null);
      setArchiveProjectTarget(project);
      setArchiveConfirmText('');
      return;
    }
    setOpen(false);
    setDeleteModuleTarget({ project, definition });
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-ink-950 dark:bg-ink-950 dark:text-ink-100">
      <TopBar />
      <main className="dashboard-projects-shell">
        <div className="dashboard-projects-header">
          <div>
            <h1 className="dashboard-projects-title">Projects</h1>
            <p className="dashboard-projects-subtitle">Plan delivery timelines, client milestones, and review moments.</p>
          </div>
          <div className="dashboard-projects-actions">
            <label className="dashboard-project-search">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" size={16} />
              <input className="field !py-2 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects..." />
            </label>
            <select className="field dashboard-project-filter" value={userFilter} onChange={(event) => setUserFilter(event.target.value)} aria-label="Filter projects by user">
              <option value="">All Users</option>
              {activeUserOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <select className="field dashboard-project-filter" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} aria-label="Filter projects by client">
              <option value="">All Clients</option>
              {activeClientOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setFavoritesOnly((value) => !value)}
              className={`dashboard-favorites-filter ${favoritesOnly ? 'is-active' : ''}`}
              aria-pressed={favoritesOnly}
            >
              <Star size={16} fill={favoritesOnly ? 'currentColor' : 'none'} /> Favorites
            </button>
            <button type="button" onClick={openNewProject} className="primary-button dashboard-new-project">
              <Plus size={17} /> New Project
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-ink-500">Loading projects...</p>
        ) : (
          <div className="dashboard-project-list">
            {visibleProjects.map((project) => {
              const versions = versionsForProject(project, lineItems, categories, DEFAULT_PLANNING_TYPE);
              const preferredVersion = project.preferred_planning_version && versions.includes(project.preferred_planning_version) ? project.preferred_planning_version : versions[0] ?? 'V1';
              const moduleLinks = DASHBOARD_PLANNING_ORDER.map((definition) => {
                const moduleVersions = versionsForProject(project, lineItems, categories, definition.key);
                const moduleVersion = moduleVersions.includes(project.preferred_planning_version) ? project.preferred_planning_version : moduleVersions[0] ?? 'V1';
                const shareLink = shareLinks.find((share) => share.project_id === project.id && share.page_type === 'client_planning' && safePlanningType(share.planning_type) === definition.key && (share.planning_version ?? 'V1') === moduleVersion && !share.revoked_at);
                return { definition, versions: moduleVersions, version: moduleVersion, exists: hasPlanningModule(project, definition.key, lineItems, categories), shareLink };
              });
              const visibleModuleLinks = moduleLinks.filter((item) => item.exists);
              const postPlanningLink = moduleLinks.find((item) => item.definition.key === DEFAULT_PLANNING_TYPE);
              const firstPlanningLink = visibleModuleLinks[0] ?? postPlanningLink ?? moduleLinks[0];
              const createdBy = (profiles ?? []).find((profile) => profile.id === (project.created_by ?? project.user_id));
              const editedBy = (profiles ?? []).find((profile) => profile.id === (project.last_edited_by ?? project.user_id));
              const postProducerName = project.post_producer || '-';
              const productionProducerName = project.producer || '-';
              const knownClient = project.client && savedClients.some((item) => item.name === project.client);
              const clientLabel = knownClient ? project.client : 'no client';
              const missingClient = clientLabel === 'no client';
              const activeNames = activeNamesForProject(project.id);
              const projectAssetLists = assetLists.filter((list) => list.project_id === project.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
              const projectAssetRows = projectAssetLists.flatMap((list) => Array.isArray(list.rows) ? list.rows : []);
              const hasAssetRows = projectAssetRows.length > 0;
              const latestAssetListUpdate = projectAssetRows
                .map((row) => row.updated_at)
                .filter(Boolean)
                .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
              const assetEditMetadata = projectAssetLists
                .map((list) => ({
                  editedAt: list.filename_options?.asset_last_edited_at,
                  editedBy: list.filename_options?.asset_last_edited_by,
                }))
                .filter((item) => item.editedAt)
                .sort((a, b) => new Date(b.editedAt).getTime() - new Date(a.editedAt).getTime())[0];
              const assetEditedBy = (profiles ?? []).find((profile) => profile.id === assetEditMetadata?.editedBy) ?? editedBy;
              const assetEditedAt = assetEditMetadata?.editedAt ?? latestAssetListUpdate;
              const isFavorite = favoriteProjectIdSet.has(project.id);
              const toggleFavoriteAction = (event) => {
                event.preventDefault();
                event.stopPropagation();
                const nextFavoriteIds = isFavorite
                  ? favoriteProjectIds.filter((projectId) => projectId !== project.id)
                  : [...favoriteProjectIds, project.id];
                updateProfile({
                  preferences: {
                    ...(currentProfile?.preferences ?? {}),
                    favorite_project_ids: nextFavoriteIds,
                  },
                });
              };
              const openProjectPlanning = (definition, version, exists, event) => {
                event?.preventDefault();
                event?.stopPropagation();
                if (!exists) ensurePlanningModule(project.id, definition.key);
                window.location.href = `/projects/${project.id}?type=${definition.key}&version=${version}`;
              };
              const openProjectSettingsAction = (event) => {
                event.preventDefault();
                event.stopPropagation();
                openProjectSettings(project);
              };
              const openVersionMenuAction = (definition, event) => {
                event.preventDefault();
                event.stopPropagation();
                setVersionMenuType(definition.key);
                setVersionMenuProjectId(project.id);
              };
              const deletePlanningRowAction = (definition, event) => {
                event.preventDefault();
                event.stopPropagation();
                requestPlanningModuleDelete(project, definition);
              };
              const openAssetListAction = (event) => {
                event.preventDefault();
                event.stopPropagation();
                window.location.href = `/projects/${project.id}/assets?type=${DEFAULT_PLANNING_TYPE}&version=${preferredVersion}`;
              };
              const rowContent = (
                <>
                  <div className="project-row-header">
                    <div className="project-row-heading-group">
                      <div className="project-row-main min-w-0">
                      <div className="project-row-title">
                        <span>{project.name}</span>
                        {clientLabel && <span className={`project-client-badge ${missingClient ? 'is-missing' : ''}`}>{clientLabel}</span>}
                        <span className="project-row-number">{project.project_number ? `#${project.project_number}` : '-'}</span>
                        <button
                          type="button"
                          onClick={toggleFavoriteAction}
                          className={`project-favorite-button ${isFavorite ? 'is-active' : ''}`}
                          aria-label={isFavorite ? `Remove ${project.name} from favorites` : `Add ${project.name} to favorites`}
                          aria-pressed={isFavorite}
                          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star size={15} fill={isFavorite ? 'currentColor' : 'none'} />
                        </button>
                        {activeNames.length > 0 && <span className="project-lock-note">{activeNames.join(', ')} {activeNames.length === 1 ? 'is' : 'are'} working here</span>}
                      </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={openProjectSettingsAction}
                      className="project-action-button project-header-settings"
                      aria-label={`${project.name} settings`}
                      title="Project settings"
                    >
                      <Settings size={17} />
                    </button>
                  </div>
                  <div className="project-planning-rows">
                    <div className="project-planning-list">
                      {visibleModuleLinks.map(({ definition, exists, version: moduleVersion, versions: moduleVersions, shareLink }) => {
                      const ownerName = definition.key === PLANNING_TYPES.production.key ? productionProducerName : postProducerName;
                      const ownerProfile = profileByName[ownerName] ?? createdBy;
                      const ownerInitials = ownerName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
                      const publishUrl = shareLink ? `/share/${slugifyProjectName(project.name)}-${shareLink.token}` : '';
                      return (
                        <div key={definition.key} className={`project-planning-row is-${definition.key} ${exists ? '' : 'is-empty'}`}>
                          <div className="project-planning-row-main">
                            <button
                              type="button"
                              onClick={(event) => {
                                if (exists) openProjectPlanning(definition, moduleVersion, true, event);
                              }}
                              disabled={!exists}
                              className={`project-planning-button is-${definition.key}`}
                            >
                              {definition.label}
                            </button>
                            <div className="project-version-row">
                              {(exists ? moduleVersions : []).map((version) => (
                                <button key={version} type="button" onClick={(event) => openProjectPlanning(definition, version, true, event)} className="project-version-button">
                                  {version}
                                </button>
                              ))}
                              {shareLink ? (
                                <a href={publishUrl} onClick={(event) => event.stopPropagation()} className="project-publish-badge is-published">Published</a>
                              ) : (
                                <span className="project-publish-badge is-unpublished">Not published</span>
                              )}
                            </div>
                          </div>
                          <div className="project-planning-person">
                            <span className="project-avatar">
                              {ownerProfile?.avatar_url ? <img src={ownerProfile.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : ownerInitials || '?'}
                            </span>
                            <span className="project-planning-person-copy">
                              <small>{definition.key === PLANNING_TYPES.production.key ? 'Producer' : 'Post-producer'}</small>
                              <span>{ownerName}</span>
                            </span>
                          </div>
                          <div className="project-row-change-block">
                            <span>changed {project.last_edited_at ? formatDistanceToNow(new Date(project.last_edited_at), { addSuffix: true }) : '-'}</span>
                            <span>by {editedBy?.display_name ?? createdBy?.display_name ?? 'Unknown'}</span>
                          </div>
                          <div className="project-row-actions">
                            <button type="button" onClick={(event) => openVersionMenuAction(definition, event)} disabled={!exists} className="project-action-button" aria-label={`${definition.label} versions and duplication`} title={`${definition.label} versions and duplication`}><Copy size={16} /></button>
                            <button
                              type="button"
                              onClick={(event) => deletePlanningRowAction(definition, event)}
                              className="project-action-button"
                              aria-label={`Delete ${definition.label} row`}
                              title={`Delete ${definition.label} row`}
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </div>
                      );
                      })}
                    </div>
                    <div className="project-asset-panel">
                      <div className="project-assetlist-stack">
                        <button
                          type="button"
                          onClick={openAssetListAction}
                          className="project-label-button"
                          aria-label="Open assetlist"
                          title="Open assetlist"
                        >
                          <FileSpreadsheet size={14} /> ASSETLIST
                        </button>
                        <span className="project-asset-updated">
                          {!hasAssetRows
                            ? 'No assets yet'
                            : assetEditedAt
                              ? `Edited ${formatDistanceToNow(new Date(assetEditedAt), { addSuffix: true })} by ${assetEditedBy?.display_name ?? 'Unknown'}`
                              : 'No updates yet'}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              );
              return (
                <div
                  key={project.id}
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    openProjectPlanning(firstPlanningLink.definition, firstPlanningLink.version, firstPlanningLink.exists, event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') openProjectPlanning(firstPlanningLink.definition, firstPlanningLink.version, firstPlanningLink.exists, event);
                  }}
                  className="project-row"
                >
                  {rowContent}
                </div>
              );
            })}
            {!visibleProjects.length && <p className="px-4 py-10 text-center text-ink-500">No projects match these filters.</p>}
            {hasMoreProjects && !search && !userFilter && !clientFilter && (
              <div className="flex justify-center p-5">
                <button type="button" className="secondary-button" onClick={loadMoreProjects}>Load more projects</button>
              </div>
            )}
          </div>
        )}
      </main>

      {versionMenuProject && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-5">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-ink-900 p-5 text-ink-100 shadow-glow">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Planning versions</h2>
                <p className="mt-1 text-sm text-ink-500">{versionMenuProject.name}</p>
              </div>
              <button type="button" onClick={() => setVersionMenuProjectId(null)} className="secondary-button !px-3 !py-2">Close</button>
            </div>
            <div className="segmented mt-4">
              {DASHBOARD_PLANNING_ORDER.filter((definition) => hasPlanningModule(versionMenuProject, definition.key, lineItems, categories)).map((definition) => (
                  <button
                    key={definition.key}
                    type="button"
                    onClick={() => {
                      setVersionMenuType(definition.key);
                    }}
                    className={versionMenuType === definition.key ? 'selected' : ''}
                  >
                    {definition.shortLabel}
                  </button>
              ))}
            </div>
            <div className="mt-5 space-y-2">
              {versionMenuVersions.map((version) => (
                <div key={version} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = `/projects/${versionMenuProject.id}?type=${versionMenuType}&version=${version}`;
                    }}
                    className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold text-ink-300 transition hover:border-accent-400 hover:bg-accent-500/20 hover:text-accent-100"
                  >
                    {version}
                  </button>
                  <div className="flex items-center gap-1">
                    {versionMenuVersions.length < 5 && (
                      <button
                        type="button"
                        onClick={() => {
                          duplicateProjectPlanning(versionMenuProject.id, version, versionMenuType);
                        }}
                        className="icon-button"
                        aria-label={`Duplicate ${version}`}
                        title={`Duplicate ${version}`}
                      >
                        <Copy size={16} />
                      </button>
                    )}
                    {versionMenuVersions.length > 1 && (
                      <>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Use ${version} as the current planning and delete all other versions? This cannot be undone.`)) {
                            keepProjectPlanningVersion(versionMenuProject.id, version, versionMenuType);
                            setVersionMenuProjectId(null);
                          }
                        }}
                        className="secondary-button !px-2 !py-1 text-xs"
                      >
                        Keep only
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete ${version}? This cannot be undone.`)) {
                            deleteProjectPlanningVersion(versionMenuProject.id, version, versionMenuType);
                            if (versionMenuVersions.length === 2) setVersionMenuProjectId(null);
                          }
                        }}
                        className="icon-button"
                        aria-label={`Delete ${version}`}
                      >
                        <Trash2 size={16} />
                      </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {versionMenuVersions.length < 5 && <p className="mt-4 text-xs text-ink-500">Use the duplicate icon on a version row to create a new version from that planning.</p>}
          </div>
        </div>
      )}

      {archiveProjectTarget && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-5">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-ink-900 p-5 text-ink-100 shadow-glow">
            <h2 className="text-xl font-semibold">Archive project?</h2>
            <p className="mt-2 text-sm text-ink-500">This removes {archiveProjectTarget.name} from the active project list. Type ARCHIVE to confirm.</p>
            <input className="field mt-5" value={archiveConfirmText} onChange={(event) => setArchiveConfirmText(event.target.value)} placeholder="ARCHIVE" autoFocus />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setArchiveProjectTarget(null)} className="secondary-button">Cancel</button>
              <button
                type="button"
                disabled={archiveConfirmText !== 'ARCHIVE'}
                onClick={() => {
                  archiveProject(archiveProjectTarget.id);
                  setArchiveProjectTarget(null);
                }}
                className="primary-button disabled:opacity-40"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModuleTarget && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-5">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-ink-900 p-5 text-ink-100 shadow-glow">
            <h2 className="text-xl font-semibold">Delete {deleteModuleTarget.definition.label}?</h2>
            <p className="mt-2 text-sm text-ink-500">
              This deletes the {deleteModuleTarget.definition.label} module and all of its versions from {deleteModuleTarget.project.name}. The other planning module will remain.
            </p>
            <p className="mt-3 text-sm font-semibold text-red-300">This action cannot be undone.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteModuleTarget(null)} className="secondary-button">Cancel</button>
              <button
                type="button"
                onClick={() => {
                  deletePlanningModule(deleteModuleTarget.project.id, deleteModuleTarget.definition.key);
                  setDeleteModuleTarget(null);
                }}
                className="primary-button bg-red-500 hover:bg-red-400"
              >
                <Trash2 size={16} /> Delete module
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-5">
          <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-white/10 bg-ink-900 p-5 text-ink-100 shadow-glow">
            <h2 className="text-xl font-semibold">{editingProject ? 'Project settings' : 'New project'}</h2>
            <div className="mt-5 space-y-3">
              {!editingProject && (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase text-ink-500">Start project as</div>
                  <div className="grid grid-cols-2 gap-2">
                    {DASHBOARD_PLANNING_ORDER.map((definition) => (
                      <button
                        key={definition.key}
                        type="button"
                        onClick={() => setInitialPlanningType(definition.key)}
                        className={`project-create-type is-${definition.key} ${initialPlanningType === definition.key ? 'is-selected' : ''}`}
                      >
                        {definition.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase text-ink-500">Project Code</span>
                <input
                  className="field"
                  value={projectNumber}
                  onChange={(event) => setProjectNumber(event.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Project code"
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase text-ink-500">Projectname</span>
                <input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" required />
              </label>
              <ComboField label="Client" value={client} onChange={setClient} options={clients} placeholder="Client" required />
              {(editingProject || initialPlanningType === PLANNING_TYPES.post.key) && (
                <ComboField label="Owner - Post Production" value={postProducer} onChange={setPostProducer} options={postProducers} placeholder="Owner - Post Production" required />
              )}
              {(editingProject || initialPlanningType === PLANNING_TYPES.production.key) && (
                <ComboField label="Owner - Production" value={producer} onChange={setProducer} options={producers} placeholder="Owner - Production" required />
              )}
              {editingProject && (
                <div className="project-settings-planning">
                  <div className="text-xs font-semibold uppercase text-ink-500">Planning modules</div>
                  <div className="mt-2 space-y-2">
                    {DASHBOARD_PLANNING_ORDER.map((definition) => {
                      const exists = hasPlanningModule(editingProject, definition.key, lineItems, categories);
                      const moduleVersions = versionsForProject(editingProject, lineItems, categories, definition.key);
                      return (
                        <div key={definition.key} className="project-settings-planning-row">
                          <div>
                            <div className="font-semibold">{definition.label}</div>
                            <div className="mt-1 text-xs text-ink-500">{exists ? moduleVersions.join(', ') : 'Not created yet'}</div>
                          </div>
                          {exists ? (
                            <button
                              type="button"
                              onClick={() => requestPlanningModuleDelete(editingProject, definition)}
                              className="secondary-button !px-2 !py-1 text-xs text-red-300"
                            >
                              Delete
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => ensurePlanningModule(editingProject.id, definition.key)}
                              className="secondary-button !px-2 !py-1 text-xs"
                            >
                              Add
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {formError && <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{formError}</p>}
            </div>
            <div className={`mt-5 flex gap-2 ${editingProject ? 'justify-between' : 'justify-end'}`}>
              {editingProject && (
                <button
                  type="button"
                  onClick={(event) => {
                    setOpen(false);
                    setArchiveProjectTarget(editingProject);
                    setArchiveConfirmText('');
                    event.stopPropagation();
                  }}
                  className="secondary-button text-red-300"
                >
                  <Trash2 size={16} /> Archive project
                </button>
              )}
              <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                }}
                className="secondary-button"
              >
                Cancel
              </button>
              <button type="submit" className="primary-button">{editingProject ? 'Save' : 'Create'}</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
