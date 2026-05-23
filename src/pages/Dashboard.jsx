import { Archive, ChevronDown, Copy, Plus, Search, Settings, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';
import { buildProjectSummary } from '../lib/projectSummary.js';

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

function versionsForProject(project, lineItems = [], categories = []) {
  const versions = [...new Set([
    ...(Array.isArray(project.planning_versions) ? project.planning_versions : []),
    project.preferred_planning_version,
    ...lineItems.filter((item) => item.project_id === project.id).map((item) => item.planning_version ?? 'V1'),
    ...categories.filter((category) => category.project_id === project.id).map((category) => category.planning_version ?? 'V1'),
  ].filter(Boolean))];
  const ordered = versions.sort((a, b) => Number(String(a).replace(/^V/i, '')) - Number(String(b).replace(/^V/i, '')));
  return ordered.length ? ordered : ['V1'];
}

export default function Dashboard() {
  const { user } = useAuth();
  const { projects, profiles, clients: savedClients, producers: savedProducers, presence, lineItems, labels, categories, createProject, updateProject, archiveProject, addClient, addProducer, duplicateProjectPlanning, deleteProjectPlanningVersion, keepProjectPlanningVersion, loading } = usePlanner();
  const [open, setOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [versionMenuProjectId, setVersionMenuProjectId] = useState(null);
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const currentProfile = (profiles ?? []).find((profile) => profile.id === user.id);
  const currentUserName = currentProfile?.display_name ?? user.email?.split('@')[0] ?? '';
  const [postProducer, setPostProducer] = useState(currentUserName);
  const [producer, setProducer] = useState('');
  const [formError, setFormError] = useState('');
  const clients = [...new Set([...(savedClients ?? []).map((item) => item.name)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const postProducers = [...new Set((profiles ?? []).map((profile) => profile.display_name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const producers = [...new Set([...(savedProducers ?? []).map((item) => item.name)].filter((item) => item && !isUuidLike(item)))].sort((a, b) => a.localeCompare(b));
  const profileByName = Object.fromEntries((profiles ?? []).map((profile) => [profile.display_name, profile]));
  const labelsById = Object.fromEntries((labels ?? []).map((label) => [label.id, label]));
  const resetForm = () => {
    setOpen(false);
    setEditingProject(null);
    setProjectNumber('');
    setName('');
    setClient('');
    setPostProducer(currentUserName);
    setProducer('');
  };
  const openNewProject = () => {
    setEditingProject(null);
    setProjectNumber('');
    setName('');
    setClient('');
    setPostProducer(currentUserName);
    setProducer('');
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
    const duplicateProject = projects.find((project) => project.project_number && project.project_number === projectNumber);
    if (duplicateProject && !window.confirm(`Project number ${projectNumber} already exists. Do you want to create this project anyway?`)) {
      setFormError(`Project number ${projectNumber} already exists.`);
      return;
    }
    try {
      await createProject({ projectNumber, name, client, postProducer, producer });
      if (client) addClient(client);
      if (postProducer) addProducer(postProducer);
      if (producer) addProducer(producer);
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
      return matchesSearch && matchesUser && matchesClient;
    });
  const versionMenuProject = projects.find((project) => project.id === versionMenuProjectId);
  const versionMenuVersions = versionMenuProject ? versionsForProject(versionMenuProject, lineItems, categories) : [];

  return (
    <div className="min-h-screen bg-zinc-50 text-ink-950 dark:bg-ink-950 dark:text-ink-100">
      <TopBar />
      <main className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-semibold">Projects</h1>
            <p className="mt-2 text-sm text-ink-500">Plan delivery timelines, client milestones, and review moments.</p>
          </div>
          <button type="button" onClick={openNewProject} className="primary-button">
            <Plus size={17} /> New Project
          </button>
        </div>
        <div className="mb-5 grid gap-2 md:grid-cols-[1fr_220px_220px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" size={16} />
            <input className="field !py-2 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects" />
          </label>
          <select className="field !py-2" value={userFilter} onChange={(event) => setUserFilter(event.target.value)}>
            <option value="">Filter user</option>
            {producers.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select className="field !py-2" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
            <option value="">Filter client</option>
            {clients.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="text-ink-500">Loading projects...</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-ink-900">
            <div className="grid grid-cols-[84px_1.6fr_220px_180px_190px] border-b border-black/10 px-4 py-3 text-xs font-semibold uppercase text-ink-500 dark:border-white/10">
              <span>Project #</span>
              <span>Project</span>
              <span>Post Producer</span>
              <span>Last Edited</span>
              <span className="text-right">Actions</span>
            </div>
            {visibleProjects.map((project) => {
              const versions = versionsForProject(project, lineItems, categories);
              const preferredVersion = project.preferred_planning_version && versions.includes(project.preferred_planning_version) ? project.preferred_planning_version : versions[0];
              const createdBy = (profiles ?? []).find((profile) => profile.id === (project.created_by ?? project.user_id));
              const editedBy = (profiles ?? []).find((profile) => profile.id === (project.last_edited_by ?? project.user_id));
              const postProducerName = project.post_producer || '-';
              const postProducerProfile = profileByName[postProducerName];
              const knownClient = project.client && savedClients.some((item) => item.name === project.client);
              const clientLabel = knownClient ? project.client : 'no client';
              const missingClient = clientLabel === 'no client';
              const summary = buildProjectSummary({
                lineItems: (lineItems ?? []).filter((item) => item.project_id === project.id && (item.planning_version ?? 'V1') === preferredVersion),
                labelsById,
                categories: (categories ?? []).filter((category) => category.project_id === project.id && (category.planning_version ?? 'V1') === preferredVersion),
              });
              const activePresence = (presence ?? []).filter((item) => item.project_id === project.id && item.user_id !== user.id && Date.now() - new Date(item.last_seen_at).getTime() < 90_000);
              const activeNames = activePresence.map((item) => (profiles ?? []).find((profile) => profile.id === item.user_id)?.display_name).filter(Boolean);
              const locked = activeNames.length > 0;
              const rowContent = (
                <>
                  <span className="font-mono text-sm text-ink-500">{project.project_number || '-'}</span>
                  <span className="min-w-0">
                    <span className="font-semibold">{project.name}</span>
                    {clientLabel && <span className={`ml-2 rounded px-2 py-0.5 text-xs font-semibold ${missingClient ? 'bg-red-500/15 text-red-300' : 'bg-accent-500/15 text-accent-300'}`}>{clientLabel}</span>}
                    {versions.length > 1 && (
                      <span className="ml-2 inline-flex gap-1 align-middle">
                        {versions.map((version) => (
                          <button
                            key={version}
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              window.location.href = `/projects/${project.id}?version=${version}`;
                            }}
                            className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-semibold text-ink-400 transition hover:border-accent-400 hover:bg-accent-500/20 hover:text-accent-100"
                          >
                            {version}
                          </button>
                        ))}
                      </span>
                    )}
                    {locked && <span className="ml-2 text-xs text-ink-500">{activeNames.join(', ')} {activeNames.length === 1 ? 'is' : 'are'} working here</span>}
                    <span className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[0.55rem] leading-tight">
                      <span><span className="rounded bg-amber-300/10 px-1 py-0.5 font-semibold uppercase text-amber-200/50">Start</span> <span className="text-ink-500">{summary.start}</span></span>
                      <span><span className="rounded bg-amber-300/10 px-1 py-0.5 font-semibold uppercase text-amber-200/50">Running</span> <span className="text-ink-500">{summary.running}</span></span>
                      {summary.offlineLock !== '-' && <span><span className="rounded bg-amber-300/10 px-1 py-0.5 font-semibold uppercase text-amber-200/50">Offline lock</span> <span className="text-ink-500">{summary.offlineLock}</span></span>}
                      {summary.grading !== '-' && <span><span className="rounded bg-amber-300/10 px-1 py-0.5 font-semibold uppercase text-amber-200/50">Grading</span> <span className="text-ink-500">{summary.grading}</span></span>}
                      {summary.final !== '-' && <span><span className="rounded bg-amber-300/10 px-1 py-0.5 font-semibold uppercase text-amber-200/50">Final</span> <span className="text-ink-500">{summary.final}</span></span>}
                    </span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-sm text-ink-500">
                    <span className="grid h-7 w-7 shrink-0 overflow-hidden place-items-center rounded-full bg-accent-500/20 text-[10px] font-bold text-accent-100">
                      {postProducerProfile?.avatar_url ? (
                        <img src={postProducerProfile.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                      ) : (
                        postProducerName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
                      )}
                    </span>
                    <span className="truncate">{postProducerName}</span>
                  </span>
                  <span className="text-sm text-ink-500">
                    {project.last_edited_at ? formatDistanceToNow(new Date(project.last_edited_at), { addSuffix: true }) : '-'}
                    <span className="block text-xs">by {editedBy?.display_name ?? createdBy?.display_name ?? 'Unknown'}</span>
                  </span>
                  <span className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openProjectSettings(project);
                      }}
                      className="icon-button"
                      aria-label="Project settings"
                    >
                      <Settings size={17} />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setVersionMenuProjectId(project.id);
                      }}
                      className="icon-button font-bold"
                      aria-label="Planning versions"
                      title="Planning versions"
                    >
                      V
                    </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          archiveProject(project.id);
                        }}
                        className="icon-button"
                        aria-label="Archive project"
                      >
                        <Archive size={17} />
                      </button>
                  </span>
                </>
              );
              if (locked) {
                return (
                  <div key={project.id} className="grid grid-cols-[84px_1.6fr_220px_180px_190px] items-center border-b border-black/5 bg-zinc-100/80 px-4 py-4 opacity-60 grayscale dark:border-white/5 dark:bg-white/[0.04]">
                    {rowContent}
                  </div>
                );
              }
              return (
                <Link key={project.id} to={`/projects/${project.id}?version=V1`} className="grid grid-cols-[84px_1.6fr_220px_180px_190px] items-center border-b border-black/5 px-4 py-4 transition hover:bg-black/[0.03] dark:border-white/5 dark:hover:bg-white/[0.04]">
                  {rowContent}
                </Link>
              );
            })}
            {!visibleProjects.length && <p className="px-4 py-10 text-center text-ink-500">No projects match these filters.</p>}
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
            <div className="mt-5 space-y-2">
              {versionMenuVersions.map((version) => (
                <div key={version} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = `/projects/${versionMenuProject.id}?version=${version}`;
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
                          duplicateProjectPlanning(versionMenuProject.id, version);
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
                            keepProjectPlanningVersion(versionMenuProject.id, version);
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
                            deleteProjectPlanningVersion(versionMenuProject.id, version);
                            setVersionMenuProjectId(null);
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

      {open && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-5">
          <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-white/10 bg-ink-900 p-5 text-ink-100 shadow-glow">
            <h2 className="text-xl font-semibold">{editingProject ? 'Project settings' : 'New project'}</h2>
            <div className="mt-5 space-y-3">
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
              <ComboField label="Post Producer" value={postProducer} onChange={setPostProducer} options={postProducers} placeholder="Post producer" required />
              <ComboField label="Producer" value={producer} onChange={setProducer} options={producers} placeholder="Producer" required />
              {formError && <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{formError}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
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
          </form>
        </div>
      )}
    </div>
  );
}
