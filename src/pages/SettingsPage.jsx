import { ArchiveRestore, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Pill from '../components/Pill.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';

const LABEL_TYPES = ['who', 'what', 'todo'];

export default function SettingsPage() {
  const { user } = useAuth();
  const {
    profiles,
    labels,
    projects,
    addGlobalLabel,
    updateLabel,
    deleteLabel,
    inviteUser,
    restoreProject,
    deleteProjectForever,
  } = usePlanner();
  const profile = profiles.find((item) => item.id === user.id);
  const [tab, setTab] = useState('labels');
  const [drafts, setDrafts] = useState({});
  const [inviteEmail, setInviteEmail] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');

  const globalLabels = useMemo(
    () => labels.filter((label) => label.scope === 'global' || !label.project_id),
    [labels],
  );

  if (profile?.role !== 'admin') return <Navigate to="/" replace />;

  const createLabel = (columnType) => {
    const draft = drafts[columnType] ?? {};
    if (!draft.value?.trim()) return;
    addGlobalLabel(columnType, draft.value.trim(), draft.color || '#6d5dfc');
    setDrafts((current) => ({ ...current, [columnType]: { value: '', color: '#6d5dfc' } }));
  };

  const submitInvite = async (event) => {
    event.preventDefault();
    if (!inviteEmail.trim()) return;
    await inviteUser(inviteEmail.trim());
    setInviteEmail('');
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-ink-950 dark:bg-ink-950 dark:text-ink-100">
      <TopBar />
      <main className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="mt-2 text-sm text-ink-500">Admin tools for labels, users, and archived projects.</p>
        </div>

        <div className="mb-6 flex gap-2">
          {[
            ['labels', 'Default Labels'],
            ['users', 'User Management'],
            ['archived', 'Archived Projects'],
          ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={`tab ${tab === key ? 'tab-active' : ''}`}>{label}</button>
          ))}
        </div>

        {tab === 'labels' && (
          <div className="grid gap-4 lg:grid-cols-3">
            {LABEL_TYPES.map((type) => (
              <section key={type} className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-ink-900">
                <h2 className="mb-4 text-lg font-semibold capitalize">{type}</h2>
                <div className="space-y-2">
                  {globalLabels.filter((label) => label.column_type === type).map((label) => (
                    <div key={label.id} className="flex items-center gap-2 rounded-md border border-black/10 p-2 dark:border-white/10">
                      <Pill label={label} />
                      <input value={label.value} onChange={(event) => updateLabel(label.id, { value: event.target.value })} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                      <input type="color" value={label.color} onChange={(event) => updateLabel(label.id, { color: event.target.value })} className="h-8 w-9 rounded border border-white/10 bg-transparent" />
                      <button type="button" onClick={() => window.confirm("Delete this global label? This won't affect project-level labels.") && deleteLabel(label.id)} className="icon-button" aria-label="Delete label">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <input
                    value={drafts[type]?.value ?? ''}
                    onChange={(event) => setDrafts((current) => ({ ...current, [type]: { color: '#6d5dfc', ...current[type], value: event.target.value } }))}
                    className="field !py-2"
                    placeholder={`Add ${type} label`}
                  />
                  <input
                    type="color"
                    value={drafts[type]?.color ?? '#6d5dfc'}
                    onChange={(event) => setDrafts((current) => ({ ...current, [type]: { value: '', ...current[type], color: event.target.value } }))}
                    className="h-10 w-12 rounded-md border border-white/10 bg-transparent"
                  />
                  <button type="button" onClick={() => createLabel(type)} className="icon-button" aria-label="Add label"><Plus size={17} /></button>
                </div>
              </section>
            ))}
          </div>
        )}

        {tab === 'users' && (
          <section className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-ink-900">
            <form onSubmit={submitInvite} className="mb-5 flex max-w-xl gap-2">
              <input className="field !py-2" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Invite user by email" />
              <button type="submit" className="primary-button">Invite User</button>
            </form>
            <div className="overflow-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase text-ink-500">
                  <tr><th className="py-2">Name</th><th>Email</th><th>Role</th><th>Joined</th></tr>
                </thead>
                <tbody>
                  {profiles.map((item) => (
                    <tr key={item.id} className="border-t border-black/10 dark:border-white/10">
                      <td className="py-3">{item.display_name}</td>
                      <td>{item.email}</td>
                      <td><span className="rounded-full bg-accent-500/15 px-2 py-1 text-xs font-semibold uppercase text-accent-300">{item.role}</span></td>
                      <td className="text-ink-500">{item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'archived' && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.filter((project) => project.is_archived).map((project) => {
              const archivedBy = profiles.find((item) => item.id === project.archived_by);
              return (
                <section key={project.id} className="rounded-lg border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-ink-900">
                  <h2 className="text-lg font-semibold">{project.name}</h2>
                  <p className="mt-1 text-sm text-ink-500">{project.client || 'No client'}</p>
                  <p className="mt-5 text-sm text-ink-500">Archived by {archivedBy?.display_name ?? 'Unknown'} {project.archived_at ? `on ${new Date(project.archived_at).toLocaleDateString()}` : ''}</p>
                  <div className="mt-5 flex gap-2">
                    <button type="button" onClick={() => restoreProject(project.id)} className="secondary-button"><ArchiveRestore size={16} /> Restore</button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirmDelete === project.id) deleteProjectForever(project.id);
                        else setConfirmDelete(project.id);
                      }}
                      className="secondary-button text-red-300"
                    >
                      <Trash2 size={16} /> {confirmDelete === project.id ? 'Confirm Delete' : 'Delete Forever'}
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
