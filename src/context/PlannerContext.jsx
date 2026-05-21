import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, parseISO } from 'date-fns';
import { DEFAULT_LABELS, DEFAULT_PROJECT } from '../lib/defaults.js';
import { supabase } from '../lib/supabase.js';
import { iso } from '../lib/dates.js';
import { useAuth } from './AuthContext.jsx';

const PlannerContext = createContext(null);
const STORAGE_KEY = 'post-production-planner:v1';
const SHARE_STORAGE_KEY = 'post-production-planner:public-shares:v1';

function id() {
  return crypto.randomUUID();
}

function shareToken() {
  return crypto.randomUUID().replaceAll('-', '');
}

function normalizedName(value) {
  return value?.trim().toLowerCase() ?? '';
}

function labelKey(label) {
  return `${label.project_id ?? 'global'}:${label.column_type}:${normalizedName(label.value)}`;
}

function profileDisplayValue(value, profiles = []) {
  return profiles.find((profile) => profile.id === value)?.display_name ?? value ?? '';
}

function readShares() {
  return JSON.parse(localStorage.getItem(SHARE_STORAGE_KEY) ?? '{}');
}

function writeShares(shares) {
  localStorage.setItem(SHARE_STORAGE_KEY, JSON.stringify(shares));
}

function hydrateDefaults(userId) {
  const profile = {
    id: userId,
    email: 'demo@planner.local',
    display_name: 'Martijn',
    avatar_url: '',
    role: 'admin',
    created_at: new Date().toISOString(),
    invited_by: null,
    is_active: true,
  };
  const projectId = id();
  const categoryA = id();
  const categoryB = id();
  const today = new Date();

  const labels = DEFAULT_LABELS.map((label, index) => ({ ...label, id: id(), project_id: null, scope: 'global', sort_order: index, is_divider: false }));
  const label = (type, value) => labels.find((item) => item.column_type === type && item.value === value)?.id;

  const lineItems = [
    ['Wenneker', 'Awareness 30 + 15 +6', 'Offline V1', 'Viewing at Wenneker', 0, 1, categoryA],
    ['Client', 'Awareness 30 + 15 +6', 'Offline V1', 'Share', 1, 2, categoryA],
    ['Wenneker', 'Awareness all assets', 'Offline V2', 'Share', 3, 5, categoryA],
    ['Client', 'Consideration all assets', 'Offline Lock', 'Approval', 7, 9, categoryA],
    ['Wenneker', 'Main film + cutdowns', 'Prefinal V1', 'Session at Wenneker', 10, 13, categoryB],
    ['Client', 'Main film + cutdowns', 'Final Delivery', 'Approval', 14, 16, categoryB],
  ].map((item, index) => ({
    id: id(),
    project_id: projectId,
    category_id: item[6],
    who: [label('who', item[0])],
    asset: item[1],
    what: label('what', item[2]),
    todo: label('todo', item[3]),
    time: '',
    notes: '',
    start_date: iso(addDays(today, item[4])),
    end_date: iso(addDays(today, item[5])),
    sort_order: index,
  }));

  return {
    projects: [
      {
        id: projectId,
        user_id: userId,
        created_by: userId,
        last_edited_by: userId,
        last_edited_at: new Date().toISOString(),
        is_archived: false,
        archived_by: null,
        archived_at: null,
        project_number: '',
        post_producer: profile.display_name,
        producer: profile.display_name,
        name: DEFAULT_PROJECT.name,
        client: DEFAULT_PROJECT.client,
        created_at: new Date().toISOString(),
      },
    ],
    categories: [
      { id: categoryA, project_id: projectId, name: 'Offline - Awareness & Consideration', sort_order: 0, collapsed: false },
      { id: categoryB, project_id: projectId, name: 'Online - Awareness & Consideration', sort_order: 1, collapsed: false },
    ],
    lineItems,
    labels,
    profiles: [profile],
    clients: [{ id: id(), name: DEFAULT_PROJECT.client, created_by: userId, created_at: new Date().toISOString() }],
    producers: [{ id: id(), name: profile.display_name, created_by: userId, created_at: new Date().toISOString() }],
    presence: [],
    invitations: [],
  };
}

function normalizeLocalData(data, userId) {
  const now = new Date().toISOString();
  const defaultColorByKey = Object.fromEntries(DEFAULT_LABELS.map((label) => [`${label.column_type}:${label.value}`, label.color]));
  const profiles = data.profiles?.length ? data.profiles : [{
    id: userId,
    email: 'demo@planner.local',
    display_name: 'Martijn',
    avatar_url: '',
    role: 'admin',
    created_at: now,
    invited_by: null,
    is_active: true,
  }];
  const labelsByKey = new Map();
  (data.labels ?? []).forEach((label) => {
    const normalized = {
      ...label,
      color: label.is_default || (!label.project_id && defaultColorByKey[`${label.column_type}:${label.value}`])
        ? defaultColorByKey[`${label.column_type}:${label.value}`] ?? label.color
        : label.color,
      scope: label.scope ?? (label.project_id ? 'project' : 'global'),
      sort_order: label.sort_order ?? 0,
      is_divider: label.is_divider ?? false,
    };
    const key = labelKey(normalized);
    if (!labelsByKey.has(key)) labelsByKey.set(key, normalized);
  });
  const labels = [...labelsByKey.values()];
  const projects = (data.projects ?? []).map((project) => ({
    ...project,
    user_id: project.user_id ?? userId,
    project_number: project.project_number ?? '',
    post_producer: profileDisplayValue(project.post_producer, profiles),
    producer: profileDisplayValue(project.producer, profiles),
    created_by: project.created_by ?? project.user_id ?? userId,
    last_edited_by: project.last_edited_by ?? project.user_id ?? userId,
    last_edited_at: project.last_edited_at ?? project.created_at ?? now,
    is_archived: project.is_archived ?? false,
    archived_by: project.archived_by ?? null,
    archived_at: project.archived_at ?? null,
  }));
  const lineItems = (data.lineItems ?? []).map((item) => ({
    ...item,
    time: item.time ?? '',
    notes: item.notes ?? '',
  }));

  return {
    projects,
    categories: data.categories ?? [],
    lineItems,
    labels,
    profiles,
    clients: data.clients ?? [...new Set(projects.map((project) => project.client).filter(Boolean))].map((name) => ({ id: id(), name, created_by: userId, created_at: now })),
    producers: data.producers ?? [...new Set(profiles.map((profile) => profile.display_name).filter(Boolean))].map((name) => ({ id: id(), name, created_by: userId, created_at: now })),
    presence: data.presence ?? [],
    invitations: data.invitations ?? [],
  };
}

function readLocal(userId) {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const normalized = normalizeLocalData(JSON.parse(stored), userId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }
  const seeded = hydrateDefaults(userId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

async function loadSupabaseData() {
  const [projects, categories, lineItems, labels, profiles, presence, invitations, clients, producers] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('line_items').select('*').order('sort_order'),
    supabase.from('labels').select('*'),
    supabase.from('profiles').select('*'),
    supabase.from('project_presence').select('*'),
    supabase.from('invitations').select('*').order('created_at', { ascending: false }),
    supabase.from('clients').select('*').order('name'),
    supabase.from('producers').select('*').order('name'),
  ]);
  for (const result of [projects, categories, lineItems, labels, profiles, presence]) {
    if (result.error) throw result.error;
  }
  if (invitations.error && invitations.error.code !== '42501') throw invitations.error;
  if (clients.error && clients.error.code !== '42P01' && clients.error.code !== '42501') throw clients.error;
  if (producers.error && producers.error.code !== '42P01' && producers.error.code !== '42501') throw producers.error;
  const loadedProfiles = profiles.data ?? [];
  const loadedClients = clients.data ?? [...new Set(projects.data.map((project) => project.client).filter(Boolean))].map((name) => ({ id: name, name }));
  const loadedProjects = projects.data.map((project) => ({
    ...project,
    post_producer: profileDisplayValue(project.post_producer, loadedProfiles),
    producer: profileDisplayValue(project.producer, loadedProfiles),
  }));
  return {
    projects: loadedProjects,
    categories: categories.data.map((category) => ({ ...category, collapsed: false })),
    lineItems: lineItems.data,
    labels: labels.data.map((label) => ({ ...label, sort_order: label.sort_order ?? 0, is_divider: label.is_divider ?? false })),
    profiles: loadedProfiles,
    clients: loadedClients,
    producers: producers.data ?? [...new Set(loadedProfiles.map((profile) => profile.display_name).filter(Boolean))].map((name) => ({ id: name, name })),
    presence: presence.data ?? [],
    invitations: invitations.data ?? [],
  };
}

export function PlannerProvider({ children }) {
  const { user, demoMode, hasSupabaseConfig } = useAuth();
  const [data, setData] = useState({ projects: [], categories: [], lineItems: [], labels: [], profiles: [], clients: [], producers: [], presence: [], invitations: [] });
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState('');
  const [dirtyProjectIds, setDirtyProjectIds] = useState([]);
  const dirtyProjectIdsRef = useRef([]);
  const useSupabase = hasSupabaseConfig && !demoMode;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const load = async () => {
      const next = useSupabase ? await loadSupabaseData() : readLocal(user.id);
      if (alive) {
        setData(next);
        setLoading(false);
      }
    };
    load().catch((error) => {
      console.error(error);
      if (alive) {
        setData(readLocal(user.id));
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [useSupabase, user.id]);

  useEffect(() => {
    if (!loading && !useSupabase) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, loading, useSupabase]);

  useEffect(() => {
    dirtyProjectIdsRef.current = dirtyProjectIds;
  }, [dirtyProjectIds]);

  const mutate = useCallback((recipe) => {
    let result;
    setData((current) => {
      const draft = structuredClone(current);
      result = recipe(draft);
      return draft;
    });
    return result;
  }, []);

  const markDirty = useCallback((projectId) => {
    if (!projectId) return;
    setDirtyProjectIds((current) => (current.includes(projectId) ? current : [...current, projectId]));
  }, []);

  const saveSupabase = useCallback(async (label, request, { throwOnError = false } = {}) => {
    if (!useSupabase) return null;
    const result = await request;
    if (result?.error) {
      console.error(`Could not save ${label}`, result.error);
      setSaveError(`${label} was not saved: ${result.error.message}`);
      if (throwOnError) throw result.error;
      return result;
    }
    setSaveError('');
    return result;
  }, [useSupabase]);

  const invokeAdminUserAction = useCallback(async (body) => {
    if (!useSupabase) return null;
    const result = await supabase.functions.invoke('admin-user-email', {
      body,
    });
    if (result.error) {
      let message = result.error.message;
      const context = result.error.context;
      if (context && typeof context.json === 'function') {
        try {
          const body = await context.json();
          message = body?.error || message;
        } catch {
          // Keep the original Supabase error message.
        }
      }
      const error = new Error(message);
      console.error('Admin user action failed', error);
      setSaveError(`Admin action failed: ${message}`);
      throw error;
    }
    setSaveError('');
    return result.data;
  }, [useSupabase]);

  const api = useMemo(
    () => ({
      ...data,
      loading,
      saveError,
      clearSaveError: () => setSaveError(''),
      createProject: async ({ projectNumber, name, client, postProducer, producer }) => {
        const now = new Date().toISOString();
        const project = {
          id: id(),
          user_id: user.id,
          created_by: user.id,
          last_edited_by: user.id,
          last_edited_at: now,
          is_archived: false,
          archived_by: null,
          archived_at: null,
          project_number: projectNumber,
          post_producer: postProducer || null,
          producer: producer || null,
          name,
          client,
          created_at: now,
        };
        const category = { id: id(), project_id: project.id, name: 'Planning', sort_order: 0, collapsed: false };
        mutate((draft) => {
          draft.projects.unshift(project);
          draft.categories.push(category);
          if (client && !draft.clients.some((item) => normalizedName(item.name) === normalizedName(client))) {
            draft.clients.push({ id: id(), name: client, created_by: user.id, created_at: now });
          }
          [postProducer, producer].filter(Boolean).forEach((producerName) => {
            if (!draft.producers.some((item) => normalizedName(item.name) === normalizedName(producerName))) {
              draft.producers.push({ id: id(), name: producerName, created_by: user.id, created_at: now });
            }
          });
        });
        if (useSupabase) {
          await saveSupabase('project', supabase.from('projects').insert(project), { throwOnError: true });
          await saveSupabase('category', supabase.from('categories').insert({ ...category, collapsed: undefined }), { throwOnError: true });
          if (client) await saveSupabase('client', supabase.from('clients').upsert({ name: client, created_by: user.id }, { onConflict: 'name', ignoreDuplicates: true }), { throwOnError: false });
          await Promise.all([postProducer, producer].filter(Boolean).map((producerName) => saveSupabase('producer', supabase.from('producers').upsert({ name: producerName, created_by: user.id }, { onConflict: 'name', ignoreDuplicates: true }), { throwOnError: false })));
        }
        return project;
      },
      updateProject: (projectId, patch) => mutate((draft) => {
        const project = draft.projects.find((item) => item.id === projectId);
        Object.assign(project, patch);
        if (patch.client && !draft.clients.some((item) => normalizedName(item.name) === normalizedName(patch.client))) {
          draft.clients.push({ id: id(), name: patch.client, created_by: user.id, created_at: new Date().toISOString() });
        }
        [patch.post_producer, patch.producer].filter(Boolean).forEach((producerName) => {
          if (!draft.producers.some((item) => normalizedName(item.name) === normalizedName(producerName))) {
            draft.producers.push({ id: id(), name: producerName, created_by: user.id, created_at: new Date().toISOString() });
          }
        });
        markDirty(projectId);
        if (useSupabase) void saveSupabase('project changes', supabase.from('projects').update(patch).eq('id', projectId));
        if (useSupabase && patch.client) void saveSupabase('client', supabase.from('clients').upsert({ name: patch.client, created_by: user.id }, { onConflict: 'name', ignoreDuplicates: true }));
        if (useSupabase) [patch.post_producer, patch.producer].filter(Boolean).forEach((producerName) => {
          void saveSupabase('producer', supabase.from('producers').upsert({ name: producerName, created_by: user.id }, { onConflict: 'name', ignoreDuplicates: true }));
        });
      }),
      markProjectEdited: (projectId) => mutate((draft) => {
        if (!dirtyProjectIdsRef.current.includes(projectId)) return;
        const project = draft.projects.find((item) => item.id === projectId);
        if (!project) return;
        const patch = { last_edited_by: user.id, last_edited_at: new Date().toISOString() };
        Object.assign(project, patch);
        setDirtyProjectIds((current) => current.filter((id) => id !== projectId));
        if (useSupabase) void saveSupabase('last edited time', supabase.from('projects').update(patch).eq('id', projectId));
      }),
      archiveProject: (projectId) => mutate((draft) => {
        const project = draft.projects.find((item) => item.id === projectId);
        if (!project) return;
        const patch = { is_archived: true, archived_by: user.id, archived_at: new Date().toISOString() };
        Object.assign(project, patch);
        if (useSupabase) void saveSupabase('project archive', supabase.from('projects').update(patch).eq('id', projectId));
      }),
      restoreProject: (projectId) => mutate((draft) => {
        const project = draft.projects.find((item) => item.id === projectId);
        if (!project) return;
        const patch = { is_archived: false, archived_by: null, archived_at: null };
        Object.assign(project, patch);
        if (useSupabase) void saveSupabase('project restore', supabase.from('projects').update(patch).eq('id', projectId));
      }),
      deleteProjectForever: (projectId) => mutate((draft) => {
        draft.projects = draft.projects.filter((item) => item.id !== projectId);
        draft.categories = draft.categories.filter((item) => item.project_id !== projectId);
        draft.lineItems = draft.lineItems.filter((item) => item.project_id !== projectId);
        draft.labels = draft.labels.filter((item) => item.project_id !== projectId);
        if (useSupabase) void saveSupabase('project delete', supabase.from('projects').delete().eq('id', projectId));
      }),
      addCategory: (projectId) => mutate((draft) => {
        const count = draft.categories.filter((item) => item.project_id === projectId).length;
        const category = { id: id(), project_id: projectId, name: `Category ${count + 1}`, sort_order: count, collapsed: false };
        draft.categories.push(category);
        markDirty(projectId);
        if (useSupabase) void saveSupabase('category', supabase.from('categories').insert({ ...category, collapsed: undefined }));
      }),
      updateCategory: (categoryId, patch) => mutate((draft) => {
        const category = draft.categories.find((item) => item.id === categoryId);
        Object.assign(category, patch);
        markDirty(category?.project_id);
        if (useSupabase) {
          const dbPatch = Object.fromEntries(Object.entries(patch).filter(([key]) => key !== 'collapsed'));
          if (Object.keys(dbPatch).length) void saveSupabase('category changes', supabase.from('categories').update(dbPatch).eq('id', categoryId));
        }
      }),
      reorderCategories: (projectId, activeId, overId) => mutate((draft) => {
        const rows = draft.categories.filter((item) => item.project_id === projectId).sort((a, b) => a.sort_order - b.sort_order);
        const oldIndex = rows.findIndex((item) => item.id === activeId);
        const newIndex = rows.findIndex((item) => item.id === overId);
        if (oldIndex < 0 || newIndex < 0 || activeId === overId) return;
        const [moved] = rows.splice(oldIndex, 1);
        rows.splice(newIndex, 0, moved);
        rows.forEach((item, index) => {
          const real = draft.categories.find((category) => category.id === item.id);
          real.sort_order = index;
        });
        markDirty(projectId);
        if (useSupabase) {
          rows.forEach((item, index) => {
            void saveSupabase('category order', supabase.from('categories').update({ sort_order: index }).eq('id', item.id));
          });
        }
      }),
      deleteCategory: (categoryId) => mutate((draft) => {
        const category = draft.categories.find((item) => item.id === categoryId);
        draft.lineItems.forEach((item) => {
          if (item.category_id === categoryId) item.category_id = null;
        });
        draft.categories = draft.categories.filter((item) => item.id !== categoryId);
        markDirty(category?.project_id);
        if (useSupabase) {
          void saveSupabase('uncategorized rows', supabase.from('line_items').update({ category_id: null }).eq('category_id', categoryId));
          void saveSupabase('category delete', supabase.from('categories').delete().eq('id', categoryId));
        }
      }),
      addLineItem: (projectId, categoryId, startDate = null, values = {}) => mutate((draft) => {
        const count = draft.lineItems.filter((item) => item.project_id === projectId).length;
        const what = draft.labels.find((item) => item.column_type === 'what')?.id ?? '';
        const todo = draft.labels.find((item) => item.column_type === 'todo')?.id ?? '';
        const item = {
          id: id(),
          project_id: projectId,
          category_id: categoryId,
          who: [],
          asset: '',
          what,
          todo,
          time: '',
          notes: '',
          start_date: startDate,
          end_date: startDate,
          sort_order: count,
          ...values,
        };
        draft.lineItems.push(item);
        markDirty(projectId);
        if (useSupabase) void saveSupabase('line item', supabase.from('line_items').insert(item));
        return item.id;
      }),
      duplicateLineItem: (itemId) => mutate((draft) => {
        const source = draft.lineItems.find((item) => item.id === itemId);
        if (!source) return;
        const siblings = draft.lineItems
          .filter((item) => item.project_id === source.project_id)
          .sort((a, b) => a.sort_order - b.sort_order);
        const sourceIndex = siblings.findIndex((item) => item.id === itemId);
        siblings.forEach((item, index) => {
          const real = draft.lineItems.find((lineItem) => lineItem.id === item.id);
          real.sort_order = index > sourceIndex ? index + 1 : index;
        });
        const duplicate = {
          ...source,
          id: id(),
          sort_order: sourceIndex + 1,
        };
        draft.lineItems.push(duplicate);
        markDirty(source.project_id);
        if (useSupabase) void saveSupabase('duplicated line item', supabase.from('line_items').insert(duplicate));
        return duplicate.id;
      }),
      addClientReviews: (projectId, wennekerLabelId, clientLabelId, reviewTodoLabelId, offsetDays = 1, existingReviewTodoLabelIds = [reviewTodoLabelId]) => mutate((draft) => {
        if (!wennekerLabelId || !clientLabelId || !reviewTodoLabelId) return [];
        const reviewTodoIds = existingReviewTodoLabelIds.filter(Boolean);

        const rows = draft.lineItems
          .filter((item) => item.project_id === projectId)
          .sort((a, b) => a.sort_order - b.sort_order);
        const nextRows = [];
        const duplicates = [];

        rows.forEach((item, index) => {
          nextRows.push(item);
          if (!item.who?.includes(wennekerLabelId)) return;
          const nextItem = rows[index + 1];
          const alreadyHasClientReview = nextItem
            && nextItem.who?.includes(clientLabelId)
            && reviewTodoIds.includes(nextItem.todo)
            && nextItem.asset === item.asset
            && nextItem.what === item.what
            && nextItem.category_id === item.category_id;
          if (alreadyHasClientReview) return;

          const milestoneDate = item.end_date || item.start_date || iso(new Date());
          const reviewDate = iso(addDays(parseISO(milestoneDate), offsetDays));
          const duplicate = {
            ...item,
            id: id(),
            who: [clientLabelId],
            todo: reviewTodoLabelId,
            start_date: reviewDate,
            end_date: reviewDate,
          };
          duplicates.push(duplicate);
          nextRows.push(duplicate);
        });

        if (!duplicates.length) return [];

        nextRows.forEach((item, index) => {
          item.sort_order = index;
        });
        draft.lineItems = draft.lineItems
          .filter((item) => item.project_id !== projectId)
          .concat(nextRows);
        markDirty(projectId);

        if (useSupabase) {
          duplicates.forEach((item) => {
            void saveSupabase('client review row', supabase.from('line_items').insert(item));
          });
          nextRows.forEach((item, index) => {
            void saveSupabase('line item order', supabase.from('line_items').update({ sort_order: index }).eq('id', item.id));
          });
        }

        return duplicates.map((item) => item.id);
      }),
      removeClientReviews: (projectId, wennekerLabelId, clientLabelId, reviewTodoLabelIds) => mutate((draft) => {
        const todoIds = (Array.isArray(reviewTodoLabelIds) ? reviewTodoLabelIds : [reviewTodoLabelIds]).filter(Boolean);
        if (!wennekerLabelId || !clientLabelId || !todoIds.length) return [];
        const rows = draft.lineItems
          .filter((item) => item.project_id === projectId)
          .sort((a, b) => a.sort_order - b.sort_order);
        const reviewIds = rows
          .filter((item, index) => {
            const previous = rows[index - 1];
            return previous?.who?.includes(wennekerLabelId)
              && item.who?.includes(clientLabelId)
              && todoIds.includes(item.todo)
              && item.asset === previous.asset
              && item.what === previous.what
              && item.category_id === previous.category_id;
          })
          .map((item) => item.id);
        if (!reviewIds.length) return [];

        draft.lineItems = draft.lineItems.filter((item) => !reviewIds.includes(item.id));
        draft.lineItems
          .filter((item) => item.project_id === projectId)
          .sort((a, b) => a.sort_order - b.sort_order)
          .forEach((item, index) => {
            item.sort_order = index;
          });
        markDirty(projectId);
        if (useSupabase) {
          reviewIds.forEach((itemId) => void saveSupabase('client review delete', supabase.from('line_items').delete().eq('id', itemId)));
        }
        return reviewIds;
      }),
      updateLineItem: (itemId, patch) => mutate((draft) => {
        const item = draft.lineItems.find((lineItem) => lineItem.id === itemId);
        Object.assign(item, patch);
        markDirty(item?.project_id);
        if (useSupabase) void saveSupabase('line item changes', supabase.from('line_items').update(patch).eq('id', itemId));
      }),
      deleteLineItem: (itemId) => mutate((draft) => {
        const item = draft.lineItems.find((lineItem) => lineItem.id === itemId);
        draft.lineItems = draft.lineItems.filter((item) => item.id !== itemId);
        markDirty(item?.project_id);
        if (useSupabase) void saveSupabase('line item delete', supabase.from('line_items').delete().eq('id', itemId));
      }),
      reorderLineItems: (projectId, activeId, overId) => mutate((draft) => {
        const rows = draft.lineItems.filter((item) => item.project_id === projectId).sort((a, b) => a.sort_order - b.sort_order);
        const oldIndex = rows.findIndex((item) => item.id === activeId);
        const newIndex = rows.findIndex((item) => item.id === overId);
        if (oldIndex < 0 || newIndex < 0) return;
        const [moved] = rows.splice(oldIndex, 1);
        rows.splice(newIndex, 0, moved);
        rows.forEach((item, index) => {
          const real = draft.lineItems.find((lineItem) => lineItem.id === item.id);
          real.sort_order = index;
        });
        markDirty(projectId);
        if (useSupabase) {
          rows.forEach((item, index) => {
            void saveSupabase('line item order', supabase.from('line_items').update({ sort_order: index }).eq('id', item.id));
          });
        }
      }),
      moveLineItemRelative: (projectId, activeId, targetId, placement) => mutate((draft) => {
        const rows = draft.lineItems.filter((item) => item.project_id === projectId).sort((a, b) => a.sort_order - b.sort_order);
        const oldIndex = rows.findIndex((item) => item.id === activeId);
        const targetIndex = rows.findIndex((item) => item.id === targetId);
        if (oldIndex < 0 || targetIndex < 0 || activeId === targetId) return;
        const [moved] = rows.splice(oldIndex, 1);
        const adjustedTargetIndex = rows.findIndex((item) => item.id === targetId);
        const insertIndex = placement === 'after' ? adjustedTargetIndex + 1 : adjustedTargetIndex;
        rows.splice(insertIndex, 0, moved);
        rows.forEach((item, index) => {
          const real = draft.lineItems.find((lineItem) => lineItem.id === item.id);
          real.sort_order = index;
        });
        markDirty(projectId);
        if (useSupabase) {
          rows.forEach((item, index) => {
            void saveSupabase('line item order', supabase.from('line_items').update({ sort_order: index }).eq('id', item.id));
          });
        }
      }),
      addLabel: (projectId, columnType, value, color, options = {}) => {
        const trimmed = value.trim();
        const existing = data.labels.find((item) => item.project_id === projectId && item.column_type === columnType && normalizedName(item.value) === normalizedName(trimmed));
        if (existing) return existing;
        const sortOrder = data.labels.filter((item) => item.project_id === projectId && item.column_type === columnType).length;
        const label = { id: id(), project_id: projectId, column_type: columnType, value, color, is_default: false, scope: 'project', sort_order: sortOrder, is_divider: options.isDivider ?? false };
        mutate((draft) => {
          if (!draft.labels.some((item) => item.project_id === projectId && item.column_type === columnType && normalizedName(item.value) === normalizedName(trimmed))) {
            draft.labels.push({ ...label, value: trimmed });
          }
        });
        markDirty(projectId);
        if (useSupabase) {
          void saveSupabase('project label', supabase.from('labels').insert({ ...label, value: trimmed }));
        }
        return { ...label, value: trimmed };
      },
      addGlobalLabel: (columnType, value, color, options = {}) => {
        const trimmed = value.trim();
        const existing = data.labels.find((item) => !item.project_id && item.column_type === columnType && normalizedName(item.value) === normalizedName(trimmed));
        if (existing) return existing;
        const sortOrder = data.labels.filter((item) => !item.project_id && item.column_type === columnType).length;
        const label = { id: id(), project_id: null, column_type: columnType, value: trimmed, color, is_default: true, scope: 'global', sort_order: sortOrder, is_divider: options.isDivider ?? false };
        mutate((draft) => {
          if (!draft.labels.some((item) => !item.project_id && item.column_type === columnType && normalizedName(item.value) === normalizedName(trimmed))) {
            draft.labels.push(label);
          }
        });
        if (useSupabase) void saveSupabase('global label', supabase.from('labels').insert(label));
        return label;
      },
      reorderLabels: (columnType, activeId, overId) => mutate((draft) => {
        const rows = draft.labels
          .filter((item) => !item.project_id && item.column_type === columnType)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const oldIndex = rows.findIndex((item) => item.id === activeId);
        const newIndex = rows.findIndex((item) => item.id === overId);
        if (oldIndex < 0 || newIndex < 0 || activeId === overId) return;
        const [moved] = rows.splice(oldIndex, 1);
        rows.splice(newIndex, 0, moved);
        rows.forEach((item, sortOrder) => {
          const label = draft.labels.find((entry) => entry.id === item.id);
          label.sort_order = sortOrder;
          if (useSupabase) void saveSupabase('label order', supabase.from('labels').update({ sort_order: sortOrder }).eq('id', item.id));
        });
      }),
      updateLabel: (labelId, patch) => mutate((draft) => {
        const label = draft.labels.find((item) => item.id === labelId);
        if (!label) return;
        Object.assign(label, patch);
        markDirty(label.project_id);
        if (useSupabase) void saveSupabase('label changes', supabase.from('labels').update(patch).eq('id', labelId));
      }),
      deleteLabel: (labelId) => mutate((draft) => {
        const label = draft.labels.find((item) => item.id === labelId);
        draft.labels = draft.labels.filter((item) => item.id !== labelId);
        markDirty(label?.project_id);
        if (useSupabase) void saveSupabase('label delete', supabase.from('labels').delete().eq('id', labelId));
      }),
      inviteUser: async (email) => {
        const invitation = {
          id: id(),
          email,
          invited_by: user.id,
          token: crypto.randomUUID().replaceAll('-', ''),
          accepted: false,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };
        mutate((draft) => {
          draft.invitations.unshift(invitation);
        });
        if (useSupabase) await saveSupabase('invitation', supabase.from('invitations').insert(invitation), { throwOnError: true });
        if (useSupabase) {
          await invokeAdminUserAction({ mode: 'invite', email });
        }
        return invitation;
      },
      resetUserPassword: async (email) => {
        if (!useSupabase) return null;
        return invokeAdminUserAction({ mode: 'reset', email });
      },
      revokeInvite: async (invitationId, email) => {
        mutate((draft) => {
          draft.invitations = draft.invitations.filter((item) => item.id !== invitationId);
        });
        if (useSupabase) {
          await saveSupabase('invite revoke', supabase.from('invitations').delete().eq('id', invitationId), { throwOnError: true });
          await invokeAdminUserAction({ mode: 'revoke-invite', email, invitationId });
        }
      },
      deleteUser: async (targetUserId) => {
        if (targetUserId === user.id) throw new Error('You cannot delete your own admin account.');
        const targetProfile = data.profiles.find((profile) => profile.id === targetUserId);
        const currentProfile = data.profiles.find((profile) => profile.id === user.id);
        mutate((draft) => {
          draft.projects.forEach((project) => {
            ['user_id', 'created_by', 'last_edited_by', 'archived_by'].forEach((field) => {
              if (project[field] === targetUserId) project[field] = user.id;
            });
            if (targetProfile?.display_name && currentProfile?.display_name && project.post_producer === targetProfile.display_name) project.post_producer = currentProfile.display_name;
            if (targetProfile?.display_name && currentProfile?.display_name && project.producer === targetProfile.display_name) project.producer = currentProfile.display_name;
          });
          draft.profiles = draft.profiles.filter((profile) => profile.id !== targetUserId);
          draft.presence = draft.presence.filter((item) => item.user_id !== targetUserId);
        });
        if (useSupabase) await invokeAdminUserAction({ mode: 'delete-user', targetUserId });
      },
      updateUserRole: async (targetUserId, role) => {
        if (!['admin', 'user'].includes(role)) throw new Error('Invalid role.');
        const target = data.profiles.find((profile) => profile.id === targetUserId);
        if (!target) throw new Error('User not found.');
        const adminCount = data.profiles.filter((profile) => profile.role === 'admin' && profile.is_active !== false).length;
        if (target.role === 'admin' && role !== 'admin' && adminCount <= 1) {
          throw new Error('At least one admin should remain.');
        }
        mutate((draft) => {
          const profile = draft.profiles.find((item) => item.id === targetUserId);
          if (profile) profile.role = role;
        });
        if (useSupabase) await saveSupabase('user role', supabase.from('profiles').update({ role }).eq('id', targetUserId), { throwOnError: true });
      },
      updateProfile: async (patch) => mutate((draft) => {
        const profile = draft.profiles.find((item) => item.id === user.id);
        if (!profile) return;
        const cleanPatch = {
          display_name: patch.display_name?.trim() || profile.display_name,
          avatar_url: patch.avatar_url ?? profile.avatar_url ?? '',
        };
        Object.assign(profile, cleanPatch);
        if (useSupabase) void saveSupabase('profile', supabase.from('profiles').update(cleanPatch).eq('id', user.id));
      }),
      addClient: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const existing = data.clients.find((item) => normalizedName(item.name) === normalizedName(trimmed));
        if (existing) return existing;
        const client = { id: id(), name: trimmed, created_by: user.id, created_at: new Date().toISOString() };
        mutate((draft) => {
          if (!draft.clients.some((item) => normalizedName(item.name) === normalizedName(trimmed))) draft.clients.push(client);
        });
        if (useSupabase) void saveSupabase('client', supabase.from('clients').upsert({ name: trimmed, created_by: user.id }, { onConflict: 'name', ignoreDuplicates: true }));
        return client;
      },
      deleteClient: (clientId) => mutate((draft) => {
        const client = draft.clients.find((item) => item.id === clientId || item.name === clientId);
        if (!client) return;
        draft.clients = draft.clients.filter((item) => item.id !== client.id && item.name !== client.name);
        draft.projects.forEach((project) => {
          if (project.client === client.name) project.client = 'no client';
        });
        if (useSupabase) void saveSupabase('client delete', supabase.from('clients').delete().eq('name', client.name));
        if (useSupabase) void saveSupabase('project clients', supabase.from('projects').update({ client: 'no client' }).eq('client', client.name));
      }),
      addProducer: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const existing = data.producers.find((item) => normalizedName(item.name) === normalizedName(trimmed));
        if (existing) return existing;
        const producer = { id: id(), name: trimmed, created_by: user.id, created_at: new Date().toISOString() };
        mutate((draft) => {
          if (!draft.producers.some((item) => normalizedName(item.name) === normalizedName(trimmed))) draft.producers.push(producer);
        });
        if (useSupabase) void saveSupabase('producer', supabase.from('producers').upsert({ name: trimmed, created_by: user.id }, { onConflict: 'name', ignoreDuplicates: true }));
        return producer;
      },
      deleteProducer: (producerId) => mutate((draft) => {
        const producer = draft.producers.find((item) => item.id === producerId || item.name === producerId);
        if (!producer) return;
        draft.producers = draft.producers.filter((item) => item.id !== producer.id && item.name !== producer.name);
        if (useSupabase) void saveSupabase('producer delete', supabase.from('producers').delete().eq('name', producer.name));
      }),
      upsertPresence: (projectId) => {
        const row = { id: id(), project_id: projectId, user_id: user.id, last_seen_at: new Date().toISOString() };
        mutate((draft) => {
          draft.presence = draft.presence.filter((item) => !(item.project_id === projectId && item.user_id === user.id));
          draft.presence.push(row);
        });
        if (useSupabase) void saveSupabase('presence', supabase.from('project_presence').upsert({ project_id: projectId, user_id: user.id, last_seen_at: row.last_seen_at }, { onConflict: 'project_id,user_id' }));
      },
      clearPresence: (projectId) => mutate((draft) => {
        draft.presence = draft.presence.filter((item) => !(item.project_id === projectId && item.user_id === user.id));
        if (useSupabase) void saveSupabase('presence clear', supabase.from('project_presence').delete().eq('project_id', projectId).eq('user_id', user.id));
      }),
      createShareLink: async (projectId) => {
        if (useSupabase) {
          const existing = await supabase
            .from('public_share_links')
            .select('token')
            .eq('project_id', projectId)
            .eq('page_type', 'client_planning')
            .is('revoked_at', null)
            .maybeSingle();
          if (existing.data?.token) return existing.data.token;

          const token = shareToken();
          const inserted = await supabase
            .from('public_share_links')
            .insert({ project_id: projectId, token, page_type: 'client_planning' })
            .select('token')
            .single();
          if (inserted.error) throw inserted.error;
          return inserted.data.token;
        }

        const token = shareToken();
        const shares = readShares();
        const existingToken = Object.entries(shares).find(([, share]) => share.projectId === projectId)?.[0];
        if (existingToken) return existingToken;
        shares[token] = { projectId };
        writeShares(shares);
        return token;
      },
    }),
    [data, invokeAdminUserAction, loading, markDirty, mutate, saveError, saveSupabase, useSupabase, user.id],
  );

  return <PlannerContext.Provider value={api}>{children}</PlannerContext.Provider>;
}

export function usePlanner() {
  const context = useContext(PlannerContext);
  if (!context) throw new Error('usePlanner must be used inside PlannerProvider');
  return context;
}
