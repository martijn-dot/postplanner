import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArchiveRestore, Check, GripVertical, KeyRound, Pencil, Plus, Search, Trash2, UserX, X, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Pill from '../components/Pill.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';

const LABEL_TYPES = ['who', 'what', 'todo'];
const ASSET_LABEL_TYPES = [
  ['asset_type', 'Asset Type'],
  ['asset_ratio', 'Ratio'],
  ['asset_platform', 'Platform'],
  ['asset_static_type', 'Static Asset Type'],
  ['asset_static_size', 'Static Size'],
];

function TextColorChoice({ value = 'black', onChange }) {
  return (
    <div className="flex shrink-0 rounded-md border border-black/10 p-0.5 dark:border-white/10" aria-label="Text color">
      {['black', 'white'].map((choice) => (
        <button
          key={choice}
          type="button"
          onClick={() => onChange(choice)}
          className={`h-7 rounded px-2 text-[10px] font-bold ${value === choice ? 'ring-1 ring-accent-300' : 'opacity-55'}`}
          style={{ backgroundColor: choice === 'white' ? '#ffffff' : '#10101a', color: choice === 'white' ? '#10101a' : '#ffffff' }}
          title={`${choice === 'white' ? 'White' : 'Black'} label text`}
        >
          A
        </button>
      ))}
    </div>
  );
}

function SortableLabelRow({ label, onUpdate, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: label.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-md border border-black/10 bg-white p-2 dark:border-white/10 dark:bg-ink-900 ${label.is_divider ? 'bg-black/5 dark:bg-white/[0.035]' : ''}`}
    >
      <button type="button" className="drag-handle" aria-label="Drag label" {...attributes} {...listeners}>
        <GripVertical size={15} />
      </button>
      {label.is_divider ? <span className="rounded bg-white/10 px-2 py-1 text-xs font-semibold uppercase text-ink-500">Divider</span> : <Pill label={label} />}
      <input value={label.value} onChange={(event) => onUpdate(label.id, { value: event.target.value })} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      <select
        value={label.planning_type ?? 'both'}
        onChange={(event) => onUpdate(label.id, { planning_type: event.target.value })}
        className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs outline-none dark:border-white/10"
        aria-label={`Planning availability for ${label.value}`}
      >
        <option value="post">Post</option>
        <option value="production">Production</option>
        <option value="both">Both</option>
      </select>
      {!label.is_divider && <input type="color" value={label.color} onChange={(event) => onUpdate(label.id, { color: event.target.value })} className="h-8 w-9 rounded border border-white/10 bg-transparent" />}
      {!label.is_divider && <TextColorChoice value={label.text_color} onChange={(textColor) => onUpdate(label.id, { text_color: textColor })} />}
      <button type="button" onClick={() => window.confirm("Delete this global label? This won't affect project-level labels.") && onDelete(label.id)} className="icon-button" aria-label="Delete label">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function SortableDefaultPlanningRow({ label, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: label.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2 rounded-md border border-black/10 bg-white p-2 dark:border-white/10 dark:bg-ink-900"
    >
      <button type="button" className="drag-handle" aria-label="Drag default planning item" {...attributes} {...listeners}>
        <GripVertical size={15} />
      </button>
      <Pill label={label} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label.value}</span>
      <button type="button" onClick={() => onRemove(label.id)} className="icon-button" aria-label={`Remove ${label.value}`}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function ClientAbbreviationInput({ client, onUpdate }) {
  const [draft, setDraft] = useState(client.abbreviation ?? '');

  const commit = () => {
    const value = draft.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    setDraft(value);
    if (value && value.length !== 2) return;
    if (value !== (client.abbreviation ?? '')) onUpdate(client.id ?? client.name, { abbreviation: value });
  };

  return (
    <input
      className="field !h-8 !w-16 !px-2 !py-1 text-center text-xs uppercase"
      value={draft}
      onChange={(event) => setDraft(event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(client.abbreviation ?? '');
          event.currentTarget.blur();
        }
      }}
      placeholder="AB"
      maxLength={2}
      aria-label={`${client.name} abbreviation`}
    />
  );
}

function ClientNameInput({ client, onUpdate, onError }) {
  const [draft, setDraft] = useState(client.name ?? '');
  const cancelRef = useRef(false);

  useEffect(() => {
    setDraft(client.name ?? '');
  }, [client.name]);

  const commit = async () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      setDraft(client.name ?? '');
      return;
    }

    const nextName = draft.trim();
    if (!nextName || nextName === client.name) {
      setDraft(client.name ?? '');
      return;
    }

    try {
      await onUpdate(client.id ?? client.name, nextName);
      setDraft(nextName);
    } catch (error) {
      setDraft(client.name ?? '');
      onError?.(error instanceof Error ? error.message : 'Could not rename client.');
    }
  };

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          cancelRef.current = true;
          setDraft(client.name ?? '');
          event.currentTarget.blur();
        }
      }}
      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-semibold outline-none transition hover:border-black/10 focus:border-violet-500/70 focus:bg-black/[0.03] dark:hover:border-white/10 dark:focus:bg-white/[0.03]"
      aria-label={`Edit client name ${client.name}`}
      title="Click to edit client name"
    />
  );
}

function ProducerNameInput({ producer, onUpdate, onError }) {
  const [draft, setDraft] = useState(producer.name ?? '');
  const cancelRef = useRef(false);

  useEffect(() => {
    setDraft(producer.name ?? '');
  }, [producer.name]);

  const commit = async () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      setDraft(producer.name ?? '');
      return;
    }

    const nextName = draft.trim();
    if (!nextName || nextName === producer.name) {
      setDraft(producer.name ?? '');
      return;
    }

    try {
      await onUpdate(producer.id ?? producer.name, nextName);
      setDraft(nextName);
    } catch (error) {
      setDraft(producer.name ?? '');
      onError?.(error instanceof Error ? error.message : 'Could not rename producer.');
    }
  };

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          cancelRef.current = true;
          setDraft(producer.name ?? '');
          event.currentTarget.blur();
        }
      }}
      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-semibold outline-none transition hover:border-black/10 focus:border-violet-500/70 focus:bg-black/[0.03] dark:hover:border-white/10 dark:focus:bg-white/[0.03]"
      aria-label={`Edit producer name ${producer.name}`}
      title="Click to edit producer name"
    />
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const {
    profiles,
    invitations,
    clients,
    producers,
    labels,
    appSettings,
    saveAssetListTemplate,
    deleteAssetListTemplate,
    projects,
    addGlobalLabel,
    reorderLabels,
    updateLabel,
    deleteLabel,
    updateDefaultPlanning,
    inviteUser,
    resetUserPassword,
    revokeInvite,
    deleteUser,
    updateUserRole,
    addClient,
    updateClient,
    updateClientName,
    deleteClient,
    addProducer,
    updateProducer,
    deleteProducer,
    restoreProject,
    deleteProjectForever,
  } = usePlanner();
  const profile = profiles.find((item) => item.id === user.id);
  const [tab, setTab] = useState('labels');
  const [drafts, setDrafts] = useState({});
  const [labelPlanningType, setLabelPlanningType] = useState('post');
  const [inviteEmail, setInviteEmail] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientAbbreviation, setClientAbbreviation] = useState('');
  const [producerName, setProducerName] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userNotice, setUserNotice] = useState('');
  const [userError, setUserError] = useState('');
  const [settingsNotice, setSettingsNotice] = useState('');
  const [defaultPlanningLabelId, setDefaultPlanningLabelId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const [confirmUserDelete, setConfirmUserDelete] = useState('');
  const [archiveSearch, setArchiveSearch] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [templateNameDraft, setTemplateNameDraft] = useState('');
  const labelSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const selectedProfile = profiles.find((item) => item.id === selectedUserId) ?? null;
  const pendingInvites = (invitations ?? [])
    .filter((invite) => !invite.accepted && !profiles.some((item) => item.email?.toLowerCase() === invite.email?.toLowerCase()))
    .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0));

  const saveTemplateName = (template) => {
    const name = templateNameDraft.trim();
    if (!name) return;
    saveAssetListTemplate({ ...template, name });
    setEditingTemplateId(null);
    setTemplateNameDraft('');
  };

  const globalLabels = useMemo(() => {
    const byKey = new Map();
    labels
      .filter((label) => label.scope === 'global' || !label.project_id)
      .forEach((label) => {
        const key = `${label.column_type}:${label.value.trim().toLowerCase()}`;
        if (!byKey.has(key)) byKey.set(key, label);
      });
    return [...byKey.values()].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [labels]);
  const whatLabels = useMemo(() => globalLabels.filter((label) => label.column_type === 'what' && !label.is_divider), [globalLabels]);
  const defaultPlanningLabels = useMemo(
    () => (appSettings?.defaultPlanning ?? [])
      .map((labelId) => whatLabels.find((label) => label.id === labelId))
      .filter(Boolean),
    [appSettings?.defaultPlanning, whatLabels],
  );

  if (profile?.role !== 'admin') return <Navigate to="/" replace />;

  const createLabel = (columnType) => {
    const draft = drafts[columnType] ?? {};
    const value = draft.value?.trim();
    if (!value) return;
    const exists = globalLabels.some((label) => label.column_type === columnType && label.value.trim().toLowerCase() === value.toLowerCase());
    if (exists) {
      setSettingsNotice('already exist');
      window.setTimeout(() => setSettingsNotice(''), 2500);
      return;
    }
    addGlobalLabel(columnType, value, draft.color || '#6d5dfc', { isDivider: draft.isDivider ?? false, planningType: labelPlanningType, textColor: draft.textColor ?? 'black' });
    setDrafts((current) => ({ ...current, [columnType]: { value: '', color: '#6d5dfc', textColor: 'black' } }));
  };

  const submitInvite = async (event) => {
    event.preventDefault();
    if (!inviteEmail.trim()) return;
    setUserNotice('');
    setUserError('');
    try {
      await inviteUser(inviteEmail.trim());
      setUserNotice(`Invite email sent to ${inviteEmail.trim()}.`);
      setInviteEmail('');
    } catch (error) {
      setUserError(error.message);
    }
  };

  const resetPasswordForUser = async (targetProfile) => {
    setUserNotice('');
    setUserError('');
    try {
      await resetUserPassword(targetProfile.email);
      setUserNotice(`Password reset email sent to ${targetProfile.email}.`);
    } catch (error) {
      setUserError(error.message);
    }
  };

  const revokePendingInvite = async (invite) => {
    setUserNotice('');
    setUserError('');
    try {
      await revokeInvite(invite.id, invite.email);
      setUserNotice(`Invite revoked for ${invite.email}.`);
    } catch (error) {
      setUserError(error.message);
    }
  };

  const deleteProfile = async (targetProfile) => {
    setUserNotice('');
    setUserError('');
    try {
      await deleteUser(targetProfile.id);
      setUserNotice(`${targetProfile.display_name} was deleted. Their projects were assigned to you.`);
      setConfirmUserDelete('');
    } catch (error) {
      setUserError(error.message);
    }
  };

  const changeUserRole = async (targetProfile, role) => {
    setUserNotice('');
    setUserError('');
    try {
      await updateUserRole(targetProfile.id, role);
      setUserNotice(`${targetProfile.display_name} is now ${role === 'admin' ? 'an admin' : 'a user'}.`);
    } catch (error) {
      setUserError(error.message);
    }
  };

  const submitClient = (event) => {
    event.preventDefault();
    const value = clientName.trim();
    if (!value) return;
    if (clientAbbreviation && !/^[A-Z]{2}$/.test(clientAbbreviation)) {
      setSettingsNotice('abbreviation needs 2 letters');
      window.setTimeout(() => setSettingsNotice(''), 2500);
      return;
    }
    if ((clients ?? []).some((client) => client.name.trim().toLowerCase() === value.toLowerCase())) {
      setSettingsNotice('already exist');
      window.setTimeout(() => setSettingsNotice(''), 2500);
      return;
    }
    addClient(value, clientAbbreviation);
    setSettingsNotice('');
    setClientName('');
    setClientAbbreviation('');
  };

  const submitProducer = (event) => {
    event.preventDefault();
    const value = producerName.trim();
    if (!value) return;
    if ((producers ?? []).some((producer) => producer.name.trim().toLowerCase() === value.toLowerCase())) {
      setSettingsNotice('already exist');
      window.setTimeout(() => setSettingsNotice(''), 2500);
      return;
    }
    addProducer(value);
    setSettingsNotice('');
    setProducerName('');
  };

  const addDefaultPlanningLabel = (event) => {
    event.preventDefault();
    if (!defaultPlanningLabelId) return;
    if (defaultPlanningLabels.some((label) => label.id === defaultPlanningLabelId)) {
      setSettingsNotice('already exist');
      window.setTimeout(() => setSettingsNotice(''), 2500);
      return;
    }
    updateDefaultPlanning([...defaultPlanningLabels.map((label) => label.id), defaultPlanningLabelId]);
    setDefaultPlanningLabelId('');
  };

  const removeDefaultPlanningLabel = (labelId) => {
    updateDefaultPlanning(defaultPlanningLabels.map((label) => label.id).filter((id) => id !== labelId));
  };

  const reorderDefaultPlanning = (activeId, overId) => {
    if (!overId || activeId === overId) return;
    const rows = defaultPlanningLabels.map((label) => label.id);
    const oldIndex = rows.indexOf(activeId);
    const newIndex = rows.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) return;
    const [moved] = rows.splice(oldIndex, 1);
    rows.splice(newIndex, 0, moved);
    updateDefaultPlanning(rows);
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-ink-950 dark:bg-ink-950 dark:text-ink-100">
      <TopBar />
      {settingsNotice && (
        <div className="fixed right-5 top-20 z-[4000] rounded-lg border border-amber-400/30 bg-ink-900 px-4 py-3 text-sm font-semibold text-amber-200 shadow-glow">
          {settingsNotice}
        </div>
      )}
      <main className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="mt-2 text-sm text-ink-500">Admin tools for labels, users, and archived projects.</p>
        </div>

        <div className="mb-6 flex gap-2">
          {[
            ['labels', 'Default Labels'],
            ['planning', 'Default Planning'],
            ['assetlist', 'Asset List'],
            ['users', 'User Management'],
            ['clients', 'Clients'],
            ['producers', 'Producers'],
            ['archived', 'Archived Projects'],
          ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={`tab ${tab === key ? 'tab-active' : ''}`}>{label}</button>
          ))}
        </div>

        {tab === 'labels' && (
          <div>
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-black/10 bg-white p-2 dark:border-white/10 dark:bg-ink-900">
              <span className="px-2 text-sm font-semibold text-ink-500">Edit labels for</span>
              <button type="button" onClick={() => setLabelPlanningType('post')} className={`tab ${labelPlanningType === 'post' ? 'tab-active' : ''}`}>Post Production</button>
              <button type="button" onClick={() => setLabelPlanningType('production')} className={`tab ${labelPlanningType === 'production' ? 'tab-active' : ''}`}>Production Planning</button>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
            {LABEL_TYPES.map((type) => (
              <section key={type} className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-ink-900">
                <h2 className="mb-4 text-lg font-semibold capitalize">{type}</h2>
                <form className="mb-4 space-y-2 rounded-lg border border-black/10 p-2 dark:border-white/10" onSubmit={(event) => { event.preventDefault(); createLabel(type); }}>
                  <div className="flex gap-2">
                    <input
                      value={drafts[type]?.value ?? ''}
                      onChange={(event) => setDrafts((current) => ({ ...current, [type]: { color: '#6d5dfc', ...current[type], value: event.target.value } }))}
                      className="field !py-2"
                      placeholder={type === 'what' && drafts[type]?.isDivider ? 'Divider name' : `Add ${type} label`}
                    />
                    <input
                      type="color"
                      value={drafts[type]?.color ?? '#6d5dfc'}
                      onChange={(event) => setDrafts((current) => ({ ...current, [type]: { value: '', ...current[type], color: event.target.value } }))}
                      className="h-10 w-12 rounded-md border border-white/10 bg-transparent"
                    />
                    <TextColorChoice
                      value={drafts[type]?.textColor}
                      onChange={(textColor) => setDrafts((current) => ({ ...current, [type]: { value: '', color: '#6d5dfc', ...current[type], textColor } }))}
                    />
                    <button type="submit" className="icon-button" aria-label="Add label"><Plus size={17} /></button>
                  </div>
                  {type === 'what' && (
                    <label className="flex items-center gap-2 px-1 text-xs font-semibold text-ink-500">
                      <input
                        type="checkbox"
                        checked={drafts[type]?.isDivider ?? false}
                        onChange={(event) => setDrafts((current) => ({ ...current, [type]: { value: '', color: '#6d5dfc', ...current[type], isDivider: event.target.checked } }))}
                      />
                      Add as category divider
                    </label>
                  )}
                </form>
                <DndContext sensors={labelSensors} onDragEnd={({ active, over }) => over && reorderLabels(type, active.id, over.id)}>
                  <SortableContext items={globalLabels.filter((label) => label.column_type === type && (label.planning_type === labelPlanningType || label.planning_type === 'both' || !label.planning_type)).map((label) => label.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {globalLabels.filter((label) => label.column_type === type && (label.planning_type === labelPlanningType || label.planning_type === 'both' || !label.planning_type)).map((label) => (
                        <SortableLabelRow key={label.id} label={label} onUpdate={updateLabel} onDelete={deleteLabel} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </section>
            ))}
            </div>
          </div>
        )}

        {tab === 'planning' && (
          <section className="max-w-2xl rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-ink-900">
            <h2 className="text-lg font-semibold">Default Planning</h2>
            <p className="mt-1 text-sm text-ink-500">These What labels are added, in this order, when the default planning button is used in a category row.</p>
            <form onSubmit={addDefaultPlanningLabel} className="mt-4 flex gap-2">
              <select className="field !py-2" value={defaultPlanningLabelId} onChange={(event) => setDefaultPlanningLabelId(event.target.value)}>
                <option value="">Add What label</option>
                {whatLabels.map((label) => <option key={label.id} value={label.id}>{label.value}</option>)}
              </select>
              <button type="submit" className="primary-button shrink-0 whitespace-nowrap"><Plus size={16} /> Add</button>
            </form>
            <DndContext sensors={labelSensors} onDragEnd={({ active, over }) => reorderDefaultPlanning(active.id, over?.id)}>
              <SortableContext items={defaultPlanningLabels.map((label) => label.id)} strategy={verticalListSortingStrategy}>
                <div className="mt-4 space-y-2">
                  {defaultPlanningLabels.map((label) => (
                    <SortableDefaultPlanningRow key={label.id} label={label} onRemove={removeDefaultPlanningLabel} />
                  ))}
                  {!defaultPlanningLabels.length && <p className="rounded-md border border-white/10 p-3 text-sm text-ink-500">No default planning rows yet.</p>}
                </div>
              </SortableContext>
            </DndContext>
          </section>
        )}

        {tab === 'assetlist' && (
          <div>
            <section className="mb-4 rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-ink-900">
              <h2 className="text-lg font-semibold">Asset List Templates</h2>
              <p className="mt-1 text-sm text-ink-500">Templates saved from an Asset List are available to every user.</p>
              <div className="mt-4 grid gap-2">
                {(appSettings?.assetListTemplates ?? []).map((template) => (
                  <div key={template.id} className="flex items-center justify-between gap-3 rounded-md border border-black/10 px-3 py-2 dark:border-white/10">
                    <div className="min-w-0">
                      {editingTemplateId === template.id ? (
                        <input
                          className="field !h-8 !py-1 text-sm font-semibold"
                          value={templateNameDraft}
                          onChange={(event) => setTemplateNameDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') saveTemplateName(template);
                            if (event.key === 'Escape') {
                              setEditingTemplateId(null);
                              setTemplateNameDraft('');
                            }
                          }}
                          aria-label={`Name for ${template.name}`}
                          autoFocus
                        />
                      ) : (
                        <strong className="block truncate text-sm">{template.name}</strong>
                      )}
                      <span className="text-xs text-ink-500">{template.categories?.length ?? 0} categories · {template.columns?.length ?? 0} columns</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {editingTemplateId === template.id ? (
                        <>
                          <button type="button" className="icon-button" onClick={() => saveTemplateName(template)} disabled={!templateNameDraft.trim()} aria-label={`Save name for ${template.name}`}>
                            <Check size={15} />
                          </button>
                          <button type="button" className="icon-button" onClick={() => { setEditingTemplateId(null); setTemplateNameDraft(''); }} aria-label="Cancel renaming">
                            <X size={15} />
                          </button>
                        </>
                      ) : (
                        <button type="button" className="icon-button" onClick={() => { setEditingTemplateId(template.id); setTemplateNameDraft(template.name); }} aria-label={`Rename ${template.name}`}>
                          <Pencil size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => window.confirm(`Delete template “${template.name}”?`) && deleteAssetListTemplate(template.id)}
                        aria-label={`Delete ${template.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
                {!(appSettings?.assetListTemplates ?? []).length && <p className="rounded-md border border-white/10 p-3 text-sm text-ink-500">No templates saved yet.</p>}
              </div>
            </section>
            <div className="grid gap-4 lg:grid-cols-3">
            {ASSET_LABEL_TYPES.map(([type, title]) => (
              <section key={type} className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-ink-900">
                <h2 className="mb-4 text-lg font-semibold">{title}</h2>
                <form className="mb-4 space-y-2 rounded-lg border border-black/10 p-2 dark:border-white/10" onSubmit={(event) => { event.preventDefault(); createLabel(type); }}>
                  <div className="flex gap-2">
                    <input
                      value={drafts[type]?.value ?? ''}
                      onChange={(event) => setDrafts((current) => ({ ...current, [type]: { color: '#6d5dfc', ...current[type], value: event.target.value } }))}
                      className="field !py-2"
                      placeholder={`Add ${title} label`}
                    />
                    <input
                      type="color"
                      value={drafts[type]?.color ?? '#6d5dfc'}
                      onChange={(event) => setDrafts((current) => ({ ...current, [type]: { value: '', ...current[type], color: event.target.value } }))}
                      className="h-10 w-12 rounded-md border border-white/10 bg-transparent"
                    />
                    <TextColorChoice
                      value={drafts[type]?.textColor}
                      onChange={(textColor) => setDrafts((current) => ({ ...current, [type]: { value: '', color: '#6d5dfc', ...current[type], textColor } }))}
                    />
                    <button type="submit" className="icon-button" aria-label={`Add ${title} label`}><Plus size={17} /></button>
                  </div>
                </form>
                <DndContext sensors={labelSensors} onDragEnd={({ active, over }) => over && reorderLabels(type, active.id, over.id)}>
                  <SortableContext items={globalLabels.filter((label) => label.column_type === type).map((label) => label.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {globalLabels.filter((label) => label.column_type === type).map((label) => (
                        <SortableLabelRow key={label.id} label={label} onUpdate={updateLabel} onDelete={deleteLabel} />
                      ))}
                      {!globalLabels.filter((label) => label.column_type === type).length && <p className="rounded-md border border-white/10 p-3 text-sm text-ink-500">No labels yet.</p>}
                    </div>
                  </SortableContext>
                </DndContext>
              </section>
            ))}
            </div>
          </div>
        )}

        {tab === 'users' && (
          <section className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-ink-900">
            <form onSubmit={submitInvite} className="mb-5 flex max-w-xl gap-2">
              <input className="field !py-2" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Invite user by email" />
              <button type="submit" className="primary-button shrink-0 whitespace-nowrap">Invite User</button>
            </form>
            <div className="mb-5 grid gap-3 rounded-lg border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.035] md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase text-ink-500">Show settings for user</label>
                <select className="field !py-2" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                  <option value="">Select user</option>
                  {profiles.map((item) => <option key={item.id} value={item.id}>{item.display_name} - {item.email}</option>)}
                </select>
              </div>
              {selectedProfile && (
                <button type="button" onClick={() => resetPasswordForUser(selectedProfile)} className="secondary-button self-end">
                  <KeyRound size={16} /> Reset password
                </button>
              )}
              {selectedProfile && (
                <div className="md:col-span-2 rounded-md border border-white/10 bg-ink-950/40 p-3 text-sm">
                  <p className="font-semibold">{selectedProfile.display_name}</p>
                  <p className="mt-1 text-ink-500">{selectedProfile.email}</p>
                  <p className="mt-2"><span className="rounded-full bg-accent-500/15 px-2 py-1 text-xs font-semibold uppercase text-accent-300">{selectedProfile.role}</span></p>
                </div>
              )}
            </div>
            {userNotice && <p className="mb-4 rounded-md border border-accent-400/30 bg-accent-500/10 px-3 py-2 text-sm text-accent-100">{userNotice}</p>}
            {userError && <p className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{userError}</p>}
            <div className="overflow-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase text-ink-500">
                  <tr><th className="py-2">Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {profiles.map((item) => (
                    <tr key={item.id} className="border-t border-black/10 dark:border-white/10">
                      <td className="py-3">{item.display_name}</td>
                      <td>{item.email}</td>
                      <td><span className="rounded-full bg-accent-500/15 px-2 py-1 text-xs font-semibold uppercase text-accent-300">{item.role}</span></td>
                      <td className="text-ink-500">{item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}</td>
                      <td>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => resetPasswordForUser(item)} className="secondary-button !px-2 !py-1">
                            <KeyRound size={14} /> Reset
                          </button>
                          {item.role === 'admin' ? (
                            <button type="button" onClick={() => changeUserRole(item, 'user')} className="secondary-button !px-2 !py-1" disabled={profiles.filter((profile) => profile.role === 'admin' && profile.is_active !== false).length <= 1}>
                              Remove admin
                            </button>
                          ) : (
                            <button type="button" onClick={() => changeUserRole(item, 'admin')} className="secondary-button !px-2 !py-1">
                              Make admin
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (confirmUserDelete === item.id) deleteProfile(item);
                              else setConfirmUserDelete(item.id);
                            }}
                            disabled={item.id === user.id}
                            className="secondary-button !px-2 !py-1 text-red-300"
                          >
                            <UserX size={14} /> {confirmUserDelete === item.id ? 'Confirm' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pendingInvites.map((invite) => (
                    <tr key={invite.id} className="border-t border-black/10 opacity-55 dark:border-white/10">
                      <td className="py-3 text-ink-500">Pending invite</td>
                      <td>{invite.email}</td>
                      <td><span className="rounded-full bg-amber-400/15 px-2 py-1 text-xs font-semibold uppercase text-amber-300">pending invite</span></td>
                      <td className="text-ink-500">{invite.created_at ? new Date(invite.created_at).toLocaleDateString() : '-'}</td>
                      <td>
                        <button type="button" onClick={() => revokePendingInvite(invite)} className="secondary-button !px-2 !py-1 text-red-300">
                          <XCircle size={14} /> Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'clients' && (
          <section className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-ink-900">
            <form onSubmit={submitClient} className="mb-5 flex max-w-2xl gap-2">
              <input className="field !py-2" value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Add client" />
              <input
                className="field !w-24 !py-2 uppercase"
                value={clientAbbreviation}
                onChange={(event) => setClientAbbreviation(event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
                placeholder="AB"
                maxLength={2}
                aria-label="Client abbreviation"
              />
              <button type="submit" className="primary-button shrink-0 whitespace-nowrap"><Plus size={16} /> Add Client</button>
            </form>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {(clients ?? []).map((client) => (
                <div key={client.id ?? client.name} className="flex items-center justify-between gap-3 rounded-md border border-black/10 px-3 py-2 text-sm font-semibold dark:border-white/10">
                  <ClientNameInput
                    client={client}
                    onUpdate={updateClientName}
                    onError={(message) => {
                      setSettingsNotice(message);
                      window.setTimeout(() => setSettingsNotice(''), 3500);
                    }}
                  />
                  <ClientAbbreviationInput client={client} onUpdate={updateClient} />
                  <button type="button" onClick={() => deleteClient(client.id ?? client.name)} className="icon-button !h-7 !w-7 shrink-0" aria-label={`Remove ${client.name}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {!(clients ?? []).length && <p className="text-sm text-ink-500">No clients yet.</p>}
            </div>
          </section>
        )}

        {tab === 'producers' && (
          <section className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-ink-900">
            <form onSubmit={submitProducer} className="mb-5 flex max-w-xl gap-2">
              <input className="field !py-2" value={producerName} onChange={(event) => setProducerName(event.target.value)} placeholder="Add producer" />
              <button type="submit" className="primary-button shrink-0 whitespace-nowrap"><Plus size={16} /> Add Producer</button>
            </form>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {(producers ?? []).map((producer) => (
                <div key={producer.id ?? producer.name} className="flex items-center justify-between gap-3 rounded-md border border-black/10 px-3 py-2 text-sm font-semibold dark:border-white/10">
                  <ProducerNameInput
                    producer={producer}
                    onUpdate={updateProducer}
                    onError={(message) => {
                      setSettingsNotice(message);
                      window.setTimeout(() => setSettingsNotice(''), 3500);
                    }}
                  />
                  <button type="button" onClick={() => deleteProducer(producer.id ?? producer.name)} className="icon-button !h-7 !w-7 shrink-0" aria-label={`Remove ${producer.name}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {!(producers ?? []).length && <p className="text-sm text-ink-500">No producers yet.</p>}
            </div>
          </section>
        )}

        {tab === 'archived' && (
          <>
          <label className="relative mb-4 block max-w-lg">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" size={16} />
            <input className="field !py-2 pl-9" value={archiveSearch} onChange={(event) => setArchiveSearch(event.target.value)} placeholder="Search archived projects" />
          </label>
          <div className="overflow-hidden rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-ink-900">
            <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_auto] gap-4 border-b border-black/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:border-white/10 md:grid">
              <span>Project</span>
              <span>Client</span>
              <span>Archived</span>
              <span className="text-right">Actions</span>
            </div>
            {projects.filter((project) => project.is_archived).filter((project) => [project.project_number, project.name, project.client].filter(Boolean).join(' ').toLowerCase().includes(archiveSearch.toLowerCase())).map((project) => {
              const archivedBy = profiles.find((item) => item.id === project.archived_by);
              return (
                <section key={project.id} className="grid gap-3 border-b border-black/10 px-4 py-3 last:border-b-0 dark:border-white/10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_auto] md:items-center md:gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{project.name}</h2>
                    {project.project_number && <p className="mt-0.5 truncate text-xs text-ink-500">{project.project_number}</p>}
                  </div>
                  <p className="min-w-0 truncate text-sm text-ink-500">{project.client || 'No client'}</p>
                  <p className="text-sm text-ink-500">By {archivedBy?.display_name ?? 'Unknown'} {project.archived_at ? `on ${new Date(project.archived_at).toLocaleDateString()}` : ''}</p>
                  <div className="flex flex-wrap gap-2 md:flex-nowrap md:justify-end">
                    <button type="button" onClick={() => restoreProject(project.id)} className="secondary-button"><ArchiveRestore size={16} /> Restore</button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirmDelete === project.id) deleteProjectForever(project.id);
                        else setConfirmDelete(project.id);
                      }}
                      className={`secondary-button text-red-300 ${confirmDelete === project.id ? 'border-red-400/80' : ''}`}
                    >
                      <Trash2 size={16} /> {confirmDelete === project.id ? 'Confirm Delete' : 'Delete Forever'}
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
          </>
        )}
      </main>
    </div>
  );
}
