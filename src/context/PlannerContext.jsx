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
    role: 'admin',
    created_at: new Date().toISOString(),
    invited_by: null,
    is_active: true,
  };
  const projectId = id();
  const categoryA = id();
  const categoryB = id();
  const today = new Date();

  const labels = DEFAULT_LABELS.map((label) => ({ ...label, id: id(), project_id: null, scope: 'global' }));
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
        post_producer: userId,
        producer: userId,
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
    role: 'admin',
    created_at: now,
    invited_by: null,
    is_active: true,
  }];
  const labels = (data.labels ?? []).map((label) => ({
    ...label,
    color: label.is_default || (!label.project_id && defaultColorByKey[`${label.column_type}:${label.value}`])
      ? defaultColorByKey[`${label.column_type}:${label.value}`] ?? label.color
      : label.color,
    scope: label.scope ?? (label.project_id ? 'project' : 'global'),
  }));
  const projects = (data.projects ?? []).map((project) => ({
    ...project,
    user_id: project.user_id ?? userId,
    project_number: project.project_number ?? '',
    post_producer: project.post_producer ?? '',
    producer: project.producer ?? '',
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
  const [projects, categories, lineItems, labels, profiles, presence, invitations] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('line_items').select('*').order('sort_order'),
    supabase.from('labels').select('*'),
    supabase.from('profiles').select('*'),
    supabase.from('project_presence').select('*'),
    supabase.from('invitations').select('*').order('created_at', { ascending: false }),
  ]);
  for (const result of [projects, categories, lineItems, labels, profiles, presence]) {
    if (result.error) throw result.error;
  }
  if (invitations.error && invitations.error.code !== '42501') throw invitations.error;
  return {
    projects: projects.data,
    categories: categories.data.map((category) => ({ ...category, collapsed: false })),
    lineItems: lineItems.data,
    labels: labels.data,
    profiles: profiles.data,
    presence: presence.data ?? [],
    invitations: invitations.data ?? [],
  };
}

export function PlannerProvider({ children }) {
  const { user, demoMode, hasSupabaseConfig } = useAuth();
  const [data, setData] = useState({ projects: [], categories: [], lineItems: [], labels: [], profiles: [], presence: [], invitations: [] });
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
        });
        if (useSupabase) {
          await saveSupabase('project', supabase.from('projects').insert(project), { throwOnError: true });
          await saveSupabase('category', supabase.from('categories').insert({ ...category, collapsed: undefined }), { throwOnError: true });
        }
        return project;
      },
      updateProject: (projectId, patch) => mutate((draft) => {
        const project = draft.projects.find((item) => item.id === projectId);
        Object.assign(project, patch);
        markDirty(projectId);
        if (useSupabase) void saveSupabase('project changes', supabase.from('projects').update(patch).eq('id', projectId));
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
      addLineItem: (projectId, categoryId, startDate = null) => mutate((draft) => {
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
        };
        draft.lineItems.push(item);
        markDirty(projectId);
        if (useSupabase) void saveSupabase('line item', supabase.from('line_items').insert(item));
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
      addLabel: (projectId, columnType, value, color) => {
        const label = { id: id(), project_id: projectId, column_type: columnType, value, color, is_default: false, scope: 'project' };
        mutate((draft) => {
          draft.labels.push(label);
        });
        markDirty(projectId);
        if (useSupabase) {
          void saveSupabase('project label', supabase.from('labels').insert(label));
        }
        return label;
      },
      addGlobalLabel: (columnType, value, color) => {
        const label = { id: id(), project_id: null, column_type: columnType, value, color, is_default: true, scope: 'global' };
        mutate((draft) => {
          draft.labels.push(label);
        });
        if (useSupabase) void saveSupabase('global label', supabase.from('labels').insert(label));
        return label;
      },
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
        return invitation;
      },
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
    [data, loading, markDirty, mutate, saveError, saveSupabase, useSupabase, user.id],
  );

  return <PlannerContext.Provider value={api}>{children}</PlannerContext.Provider>;
}

export function usePlanner() {
  const context = useContext(PlannerContext);
  if (!context) throw new Error('usePlanner must be used inside PlannerProvider');
  return context;
}
