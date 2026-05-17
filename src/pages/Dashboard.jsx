import { Archive, Plus, Search, Settings } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const { projects, profiles, presence, createProject, updateProject, archiveProject, loading } = usePlanner();
  const [open, setOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [postProducer, setPostProducer] = useState('');
  const [producer, setProducer] = useState('');
  const clients = [...new Set(projects.map((project) => project.client).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const activeUsers = (profiles ?? []).filter((profile) => profile.is_active !== false);
  const resetForm = () => {
    setOpen(false);
    setEditingProject(null);
    setProjectNumber('');
    setName('');
    setClient('');
    setPostProducer('');
    setProducer('');
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
    if (editingProject) {
      updateProject(editingProject.id, {
        project_number: projectNumber,
        name,
        client,
        post_producer: postProducer || null,
        producer: producer || null,
      });
      resetForm();
      return;
    }
    const project = await createProject({ projectNumber, name, client, postProducer, producer });
    resetForm();
    location.href = `/projects/${project.id}`;
  };
  const visibleProjects = projects
    .filter((project) => !project.is_archived)
    .filter((project) => {
      const haystack = [project.project_number, project.name, project.client].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !search || haystack.includes(search.toLowerCase());
      const matchesUser = !userFilter || project.post_producer === userFilter || project.producer === userFilter || project.created_by === userFilter;
      const matchesClient = !clientFilter || project.client === clientFilter;
      return matchesSearch && matchesUser && matchesClient;
    });

  return (
    <div className="min-h-screen bg-zinc-50 text-ink-950 dark:bg-ink-950 dark:text-ink-100">
      <TopBar />
      <main className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-semibold">Projects</h1>
            <p className="mt-2 text-sm text-ink-500">Plan delivery timelines, client milestones, and review moments.</p>
          </div>
          <button type="button" onClick={() => setOpen(true)} className="primary-button">
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
            {activeUsers.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}
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
            <div className="grid grid-cols-[120px_1.6fr_220px_180px_112px] border-b border-black/10 px-4 py-3 text-xs font-semibold uppercase text-ink-500 dark:border-white/10">
              <span>Project #</span>
              <span>Project</span>
              <span>Post Producer</span>
              <span>Last Edited</span>
              <span className="text-right">Actions</span>
            </div>
            {visibleProjects.map((project) => {
              const createdBy = (profiles ?? []).find((profile) => profile.id === (project.created_by ?? project.user_id));
              const editedBy = (profiles ?? []).find((profile) => profile.id === (project.last_edited_by ?? project.user_id));
              const postProducerProfile = (profiles ?? []).find((profile) => profile.id === project.post_producer);
              const activePresence = (presence ?? []).filter((item) => item.project_id === project.id && item.user_id !== user.id && Date.now() - new Date(item.last_seen_at).getTime() < 90_000);
              const activeNames = activePresence.map((item) => (profiles ?? []).find((profile) => profile.id === item.user_id)?.display_name).filter(Boolean);
              const locked = activeNames.length > 0;
              const rowContent = (
                <>
                  <span className="font-mono text-sm text-ink-500">{project.project_number || '-'}</span>
                  <span className="min-w-0">
                    <span className="font-semibold">{project.name}</span>
                    {project.client && <span className="ml-2 rounded bg-accent-500/15 px-2 py-0.5 text-xs font-semibold text-accent-300">{project.client}</span>}
                    {locked && <span className="ml-2 text-xs text-ink-500">{activeNames.join(', ')} {activeNames.length === 1 ? 'is' : 'are'} working here</span>}
                  </span>
                  <span className="text-sm text-ink-500">{postProducerProfile?.display_name ?? '-'}</span>
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
                  <div key={project.id} className="grid grid-cols-[120px_1.6fr_220px_180px_112px] items-center border-b border-black/5 bg-zinc-100/80 px-4 py-3 opacity-60 grayscale dark:border-white/5 dark:bg-white/[0.04]">
                    {rowContent}
                  </div>
                );
              }
              return (
                <Link key={project.id} to={`/projects/${project.id}`} className="grid grid-cols-[120px_1.6fr_220px_180px_112px] items-center border-b border-black/5 px-4 py-3 transition hover:bg-black/[0.03] dark:border-white/5 dark:hover:bg-white/[0.04]">
                  {rowContent}
                </Link>
              );
            })}
            {!visibleProjects.length && <p className="px-4 py-10 text-center text-ink-500">No projects match these filters.</p>}
          </div>
        )}
      </main>

      {open && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-5">
          <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-white/10 bg-ink-900 p-5 text-ink-100 shadow-glow">
            <h2 className="text-xl font-semibold">{editingProject ? 'Project settings' : 'New project'}</h2>
            <div className="mt-5 space-y-3">
              <input
                className="field"
                value={projectNumber}
                onChange={(event) => setProjectNumber(event.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Project number"
                required
              />
              <input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" required />
              <div>
                <input className="field" list="existing-clients" value={client} onChange={(event) => setClient(event.target.value)} placeholder="Client" required />
                <datalist id="existing-clients">
                  {clients.map((item) => <option key={item} value={item} />)}
                </datalist>
              </div>
              <select className="field" value={postProducer} onChange={(event) => setPostProducer(event.target.value)} required>
                <option value="">Post producer</option>
                {activeUsers.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}
              </select>
              <select className="field" value={producer} onChange={(event) => setProducer(event.target.value)} required>
                <option value="">Producer</option>
                {activeUsers.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}
              </select>
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
