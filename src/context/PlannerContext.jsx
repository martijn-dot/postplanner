import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, parseISO } from 'date-fns';
import {
  DEFAULT_LABELS,
  DEFAULT_PLANNING_ALIASES,
  DEFAULT_PLANNING_TYPE,
  DEFAULT_PLANNING_WHAT_LABELS,
  DEFAULT_PROJECT,
  PLANNING_TYPES,
  PRODUCTION_WHAT_LABELS,
} from '../lib/defaults.js';
import { supabase } from '../lib/supabase.js';
import { iso } from '../lib/dates.js';
import { useAuth } from './AuthContext.jsx';

const PlannerContext = createContext(null);
const STORAGE_KEY = 'post-production-planner:v1';
const SHARE_STORAGE_KEY = 'post-production-planner:public-shares:v1';
const PLANNER_LOAD_TIMEOUT_MS = 12000;
const PROJECT_PAGE_SIZE = 50;
const DEFAULT_APP_SETTINGS = {
  defaultPlanning: DEFAULT_PLANNING_WHAT_LABELS,
  assetListTemplates: [],
};
const DEFAULT_PLANNING_VERSION = 'V1';
const OPTIONAL_LINE_ITEM_COLUMNS = new Set(['row_color', 'planning_type']);
const OPTIONAL_CATEGORY_COLUMNS = new Set(['planning_type']);
const DEFAULT_ASSET_LABELS = [
  ...['OLV', 'SOC', 'PRV', 'HWT', 'TECH', 'CGI', 'Bumper', 'TrueView', 'Story', '360', 'IMG', 'FeatIMG', 'Photography', 'KV', 'StaticBanner', 'DynaBanner']
    .map((value, index) => ({ column_type: 'asset_type', value, color: '#6d5dfc', sort_order: index })),
  ...['16x9', '9x16', '4x5', '1x1', '3x4', '4x3', 'TBC']
    .map((value, index) => ({ column_type: 'asset_ratio', value, color: '#28b8ff', sort_order: index })),
  ...['Unique', 'Ratio']
    .map((value, index) => ({ column_type: 'asset_unique_ratio', value, color: '#f59e0b', sort_order: index })),
  ...['IG', 'FB', 'IG+TB', 'YT', 'TK', 'PIN', 'SPF']
    .map((value, index) => ({ column_type: 'asset_platform', value, color: '#10b981', sort_order: index })),
  ...['IMG', 'Static', 'Banner', 'Dyn Banner', 'Photo']
    .map((value, index) => ({ column_type: 'asset_static_type', value, color: '#28b8ff', sort_order: index })),
  ...[
    '88x31', '100x100', '120x60', '120x90', '120x240', '120x600', '160x600', '180x150',
    '234x60', '240x400', '250x250', '300x100', '300x250', '300x600', '320x50', '336x280',
    '468x60', '720x300', '728x90', '1080x1080', '1080x1350', '1080x1920', '1200x628', '1920x1080',
  ]
    .map((value, index) => ({ column_type: 'asset_static_size', value, color: '#10b981', sort_order: index })),
];

function projectVersions(project) {
  const versions = Array.isArray(project?.planning_versions) ? project.planning_versions : [project?.preferred_planning_version, DEFAULT_PLANNING_VERSION];
  return [...new Set(versions.filter(Boolean))].sort((a, b) => Number(String(a).replace(/^V/i, '')) - Number(String(b).replace(/^V/i, '')));
}

function sortVersions(versions) {
  return [...new Set(versions.filter(Boolean))]
    .sort((a, b) => Number(String(a).replace(/^V/i, '')) - Number(String(b).replace(/^V/i, '')));
}

function versionNumber(version) {
  const match = String(version ?? '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function nextPlanningVersion(versions) {
  const highest = versions.reduce((max, version) => Math.max(max, versionNumber(version)), 0);
  return `V${highest + 1}`;
}

function planningType(value) {
  return PLANNING_TYPES[value]?.key ?? DEFAULT_PLANNING_TYPE;
}

function planningVersionsFor(projectId, type, categories = [], lineItems = [], fallbackProject = null) {
  const safeType = planningType(type);
  const versions = [
    ...categories
      .filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType)
      .map((item) => item.planning_version ?? DEFAULT_PLANNING_VERSION),
    ...lineItems
      .filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType)
      .map((item) => item.planning_version ?? DEFAULT_PLANNING_VERSION),
  ];
  if (safeType === DEFAULT_PLANNING_TYPE && fallbackProject) {
    versions.push(...projectVersions(fallbackProject), fallbackProject.preferred_planning_version);
  }
  const ordered = sortVersions(versions);
  return ordered.length ? ordered : [];
}

function firstLabelId(labels, columnType, values = []) {
  const lowered = values.map((value) => value.toLowerCase());
  return labels.find((label) => label.column_type === columnType && lowered.includes(label.value.toLowerCase()))?.id
    ?? labels.find((label) => label.column_type === columnType)?.id
    ?? '';
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    }),
  ]);
}

function id() {
  return crypto.randomUUID();
}

function shareToken() {
  return crypto.randomUUID().replaceAll('-', '');
}

function normalizedName(value) {
  return value?.trim().toLowerCase() ?? '';
}

function rememberLatestRevision(revisionMap, rowId, revision) {
  if (revision == null) return;
  const current = revisionMap.get(rowId);
  if (current == null || Number(revision) > Number(current)) revisionMap.set(rowId, revision);
}

function labelKey(label) {
  return `${label.project_id ?? 'global'}:${label.column_type}:${normalizedName(label.value)}`;
}

const DEFAULT_LABEL_COLOR_BY_KEY = Object.fromEntries(DEFAULT_LABELS.map((label) => [`${label.column_type}:${label.value}`, label.color]));
const DEFAULT_LABEL_PLANNING_TYPE_BY_KEY = Object.fromEntries(DEFAULT_LABELS.map((label) => [`${label.column_type}:${label.value}`, label.planning_type]));

function applyDefaultLabelColor(label) {
  const defaultColor = DEFAULT_LABEL_COLOR_BY_KEY[`${label.column_type}:${label.value}`];
  const defaultPlanningType = DEFAULT_LABEL_PLANNING_TYPE_BY_KEY[`${label.column_type}:${label.value}`];
  if (!defaultColor || label.project_id) return { ...label, planning_type: label.planning_type ?? 'both' };
  return {
    ...label,
    color: label.is_default || defaultColor ? defaultColor : label.color,
    planning_type: defaultPlanningType ?? label.planning_type ?? 'both',
  };
}

function profileDisplayValue(value, profiles = []) {
  return profiles.find((profile) => profile.id === value)?.display_name ?? value ?? '';
}

function dbCategory(category) {
  return {
    id: category.id,
    project_id: category.project_id,
    planning_type: category.planning_type ?? DEFAULT_PLANNING_TYPE,
    planning_version: category.planning_version ?? DEFAULT_PLANNING_VERSION,
    name: category.name,
    sort_order: category.sort_order ?? 0,
  };
}

function dbLineItem(item) {
  return {
    id: item.id,
    project_id: item.project_id,
    planning_type: item.planning_type ?? DEFAULT_PLANNING_TYPE,
    planning_version: item.planning_version ?? DEFAULT_PLANNING_VERSION,
    category_id: item.category_id ?? null,
    who: Array.isArray(item.who) ? item.who : [],
    asset: item.asset ?? '',
    what: item.what ?? '',
    todo: item.todo ?? '',
    time: item.time ?? '',
    notes: item.notes ?? '',
    row_color: item.row_color ?? '',
    start_date: item.start_date ?? null,
    end_date: item.end_date ?? null,
    sort_order: item.sort_order ?? 0,
  };
}

function dbLineItemPatch(patch) {
  const allowed = new Set(['planning_type', 'planning_version', 'category_id', 'who', 'asset', 'what', 'todo', 'time', 'notes', 'row_color', 'start_date', 'end_date', 'sort_order']);
  return Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.has(key)));
}

function schemaMissingColumn(error, tableName = 'line_items') {
  const message = error?.message ?? '';
  const match = message.match(new RegExp(`'([^']+)' column of '${tableName}'`));
  return match?.[1] ?? null;
}

function withoutColumns(payload, columns) {
  if (!columns?.size) return payload;
  if (Array.isArray(payload)) return payload.map((item) => withoutColumns(item, columns));
  const next = { ...payload };
  columns.forEach((column) => delete next[column]);
  return next;
}

function defaultAssetColumns() {
  return [
    { id: id(), name: 'Clones', type: 'dropdown', label_type: 'asset_unique_ratio', options: DEFAULT_ASSET_LABELS.filter((label) => label.column_type === 'asset_unique_ratio').map((label) => label.value), separator: null, width: 150, sort_order: 0 },
    { id: id(), name: 'Asset Type', type: 'dropdown', label_type: 'asset_type', options: DEFAULT_ASSET_LABELS.filter((label) => label.column_type === 'asset_type').map((label) => label.value), separator: null, width: 180, sort_order: 1 },
    { id: id(), name: 'Name', type: 'text', options: [], separator: null, width: 240, sort_order: 2 },
    { id: id(), name: 'Frame.io', type: 'url', options: [], separator: null, width: 210, sort_order: 3, exclude_from_filename: true },
    { id: id(), name: 'Length', type: 'length', options: [], separator: null, width: 120, sort_order: 4 },
    { id: id(), name: 'Ratio', type: 'dropdown', label_type: 'asset_ratio', options: DEFAULT_ASSET_LABELS.filter((label) => label.column_type === 'asset_ratio').map((label) => label.value), separator: null, width: 140, sort_order: 5 },
    { id: id(), name: 'Static Asset Type', type: 'dropdown', label_type: 'asset_static_type', options: DEFAULT_ASSET_LABELS.filter((label) => label.column_type === 'asset_static_type').map((label) => label.value), separator: null, width: 180, sort_order: 6 },
    { id: id(), name: 'Size', type: 'dropdown', label_type: 'asset_static_size', options: DEFAULT_ASSET_LABELS.filter((label) => label.column_type === 'asset_static_size').map((label) => label.value), separator: null, width: 150, sort_order: 7 },
  ];
}

function mergeDefaultAssetLabels(labels) {
  const assetLabelTypes = new Set(DEFAULT_ASSET_LABELS.map((label) => label.column_type));
  const seenGlobalAssetLabels = new Set();
  const nextLabels = labels.filter((label) => {
    if (label.project_id || !assetLabelTypes.has(label.column_type)) return true;
    const key = `${label.column_type}:${normalizedName(label.value)}`;
    if (seenGlobalAssetLabels.has(key)) return false;
    seenGlobalAssetLabels.add(key);
    return true;
  });
  DEFAULT_ASSET_LABELS.forEach((label) => {
    const exists = nextLabels.some((item) => !item.project_id && item.column_type === label.column_type && normalizedName(item.value) === normalizedName(label.value));
    if (!exists) {
      nextLabels.push({
        ...label,
        id: id(),
        project_id: null,
        scope: 'global',
        is_default: true,
        is_divider: false,
      });
    }
  });
  return nextLabels;
}

function mergeGlobalDefaultLabels(labels) {
  const nextLabels = [...labels];
  DEFAULT_LABELS.forEach((label) => {
    const exists = nextLabels.some((item) => !item.project_id && item.column_type === label.column_type && normalizedName(item.value) === normalizedName(label.value));
    if (!exists) {
      nextLabels.push({
        ...label,
        id: id(),
        project_id: null,
        scope: 'global',
        sort_order: nextLabels.filter((item) => !item.project_id && item.column_type === label.column_type).length,
        is_divider: false,
      });
    }
  });
  return nextLabels;
}

function createAssetList(projectId, name, sortOrder = 0) {
  const columns = defaultAssetColumns();
  return {
    id: id(),
    project_id: projectId,
    name,
    sort_order: sortOrder,
    global_separator: '_',
    filename_options: { lowercase: false, capitalizeWords: false, hyphenateSpaces: false },
    columns,
    categories: [],
    rows: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function dbAssetList(list) {
  return {
    id: list.id,
    project_id: list.project_id,
    name: list.name,
    sort_order: list.sort_order ?? 0,
    global_separator: list.global_separator ?? '_',
    filename_options: list.filename_options ?? {},
    columns: list.columns ?? [],
    categories: list.categories ?? [],
    // Rows are persisted individually in asset_list_rows.
    rows: [],
    created_at: list.created_at,
    updated_at: list.updated_at ?? new Date().toISOString(),
  };
}

function dbAssetListRow(list, row) {
  const knownKeys = new Set(['id', 'number', 'group_id', 'values', 'notes', 'ratio_parent_id', 'ratio_value', 'sort_order', 'revision', 'created_at', 'updated_at']);
  return {
    id: row.id,
    asset_list_id: list.id,
    project_id: list.project_id,
    number: row.number ?? '',
    group_id: row.group_id || null,
    values: row.values ?? {},
    notes: row.notes ?? '',
    ratio_parent_id: row.ratio_parent_id || null,
    ratio_value: row.ratio_value ?? null,
    sort_order: row.sort_order ?? 0,
    data: Object.fromEntries(Object.entries(row).filter(([key]) => !knownKeys.has(key))),
    revision: row.revision ?? 1,
  };
}

function fromDbAssetListRow(row) {
  return {
    ...(row.data ?? {}),
    id: row.id,
    number: row.number ?? '',
    group_id: row.group_id ?? null,
    values: row.values ?? {},
    notes: row.notes ?? '',
    ratio_parent_id: row.ratio_parent_id ?? undefined,
    ratio_value: row.ratio_value ?? undefined,
    sort_order: row.sort_order ?? 0,
    revision: row.revision ?? 1,
    updated_at: row.updated_at,
  };
}

function replaceById(rows, next) {
  const index = rows.findIndex((item) => item.id === next.id);
  if (index < 0) rows.push(next);
  else rows[index] = { ...rows[index], ...next };
}

function localShareLinks() {
  return Object.entries(readShares()).map(([token, share]) => ({
    token,
    project_id: share.projectId,
    planning_type: planningType(share.planningType),
    planning_version: share.planningVersion ?? DEFAULT_PLANNING_VERSION,
    page_type: 'client_planning',
    revoked_at: null,
  }));
}

function readShares() {
  return JSON.parse(localStorage.getItem(SHARE_STORAGE_KEY) ?? '{}');
}

function writeShares(shares) {
  localStorage.setItem(SHARE_STORAGE_KEY, JSON.stringify(shares));
}

function profileFromUser(user, fallbackRole = 'admin') {
  return {
    id: user.id,
    email: user.email ?? 'demo@planner.local',
    display_name: user.user_metadata?.display_name ?? user.email?.split('@')[0] ?? 'Martijn',
    avatar_url: user.user_metadata?.avatar_url ?? '',
    role: user.user_metadata?.role ?? fallbackRole,
    created_at: new Date().toISOString(),
    invited_by: null,
    is_active: true,
  };
}

function hydrateDefaults(user) {
  const userId = user.id;
  const profile = {
    ...profileFromUser(user, 'admin'),
    role: user.user_metadata?.standard_login ? 'user' : (user.user_metadata?.role ?? 'admin'),
  };
  const projectId = id();
  const categoryA = id();
  const categoryB = id();
  const today = new Date();

  const labels = mergeDefaultAssetLabels(DEFAULT_LABELS.map((label, index) => ({ ...label, id: id(), project_id: null, scope: 'global', sort_order: index, is_divider: false })));
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
    planning_type: DEFAULT_PLANNING_TYPE,
    planning_version: DEFAULT_PLANNING_VERSION,
    category_id: item[6],
    who: [label('who', item[0])],
    asset: item[1],
    what: label('what', item[2]),
    todo: label('todo', item[3]),
    time: '',
    notes: '',
    row_color: '',
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
        planning_versions: [DEFAULT_PLANNING_VERSION],
        preferred_planning_version: DEFAULT_PLANNING_VERSION,
      },
    ],
    categories: [
      { id: categoryA, project_id: projectId, planning_type: DEFAULT_PLANNING_TYPE, planning_version: DEFAULT_PLANNING_VERSION, name: 'Offline - Awareness & Consideration', sort_order: 0, collapsed: false },
      { id: categoryB, project_id: projectId, planning_type: DEFAULT_PLANNING_TYPE, planning_version: DEFAULT_PLANNING_VERSION, name: 'Online - Awareness & Consideration', sort_order: 1, collapsed: false },
    ],
    lineItems,
    labels,
    profiles: [profile],
    clients: [{ id: id(), name: DEFAULT_PROJECT.client, abbreviation: '', created_by: userId, created_at: new Date().toISOString() }],
    producers: [{ id: id(), name: profile.display_name, created_by: userId, created_at: new Date().toISOString() }],
    presence: [],
    invitations: [],
    assetLists: [],
    shareLinks: [],
    appSettings: { ...DEFAULT_APP_SETTINGS, defaultPlanning: resolveDefaultPlanning(DEFAULT_APP_SETTINGS, labels) },
  };
}

function resolveDefaultPlanning(settings, labels = []) {
  const whatLabels = labels.filter((label) => !label.project_id && label.column_type === 'what' && !label.is_divider);
  const configured = settings?.defaultPlanning;
  const values = Array.isArray(configured) && configured.length ? configured : DEFAULT_PLANNING_WHAT_LABELS;
  return values
    .map((value) => {
      if (whatLabels.some((label) => label.id === value)) return value;
      const aliases = DEFAULT_PLANNING_ALIASES[value?.toLowerCase?.()] ?? [value?.toLowerCase?.()];
      return whatLabels.find((label) => aliases.includes(label.value.toLowerCase()))?.id;
    })
    .filter(Boolean);
}

function normalizeLocalData(data, user) {
  const userId = user.id;
  const now = new Date().toISOString();
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
  if (!profiles.some((profile) => profile.id === userId)) {
    profiles.push(profileFromUser(user, user.user_metadata?.standard_login ? 'user' : 'admin'));
  }
  const labelsByKey = new Map();
  (data.labels ?? []).forEach((label) => {
    const normalized = applyDefaultLabelColor({
      ...label,
      scope: label.scope ?? (label.project_id ? 'project' : 'global'),
      sort_order: label.sort_order ?? 0,
      is_divider: label.is_divider ?? false,
    });
    const key = labelKey(normalized);
    if (!labelsByKey.has(key)) labelsByKey.set(key, normalized);
  });
  const labels = mergeDefaultAssetLabels(mergeGlobalDefaultLabels([...labelsByKey.values()]));
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
    planning_versions: projectVersions(project),
    preferred_planning_version: project.preferred_planning_version ?? projectVersions(project)[0] ?? DEFAULT_PLANNING_VERSION,
  }));
  const lineItems = (data.lineItems ?? []).map((item) => ({
    ...item,
    time: item.time ?? '',
    notes: item.notes ?? '',
    row_color: item.row_color ?? '',
    planning_type: item.planning_type ?? DEFAULT_PLANNING_TYPE,
    planning_version: item.planning_version ?? DEFAULT_PLANNING_VERSION,
  }));
  const categories = (data.categories ?? []).map((category) => ({
    ...category,
    planning_type: category.planning_type ?? DEFAULT_PLANNING_TYPE,
    planning_version: category.planning_version ?? DEFAULT_PLANNING_VERSION,
  }));

  return {
    projects,
    categories,
    lineItems,
    labels,
    profiles,
    clients: data.clients ?? [...new Set(projects.map((project) => project.client).filter(Boolean))].map((name) => ({ id: id(), name, abbreviation: '', created_by: userId, created_at: now })),
    producers: data.producers ?? [...new Set(profiles.map((profile) => profile.display_name).filter(Boolean))].map((name) => ({ id: id(), name, created_by: userId, created_at: now })),
    presence: data.presence ?? [],
    invitations: data.invitations ?? [],
    assetLists: data.assetLists ?? [],
    shareLinks: data.shareLinks ?? localShareLinks(),
    appSettings: {
      ...DEFAULT_APP_SETTINGS,
      ...(data.appSettings ?? {}),
      defaultPlanning: resolveDefaultPlanning(data.appSettings, labels),
    },
  };
}

function readLocal(user) {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const normalized = normalizeLocalData(JSON.parse(stored), user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }
  const seeded = hydrateDefaults(user);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

async function loadSupabaseData() {
  const [projects, categories, lineItems, labels, profiles, presence, invitations, clients, producers, appSettings, assetLists, assetRows, shareLinks] = await Promise.all([
    supabase.from('projects').select('*').order('last_edited_at', { ascending: false }).range(0, 49),
    supabase.from('categories').select('id,project_id,planning_type,planning_version,name,sort_order,revision,updated_at').order('sort_order'),
    Promise.resolve({ data: [], error: null }),
    supabase.from('labels').select('*').is('project_id', null),
    supabase.from('profiles').select('*'),
    supabase.from('project_presence').select('*'),
    supabase.from('invitations').select('*').order('created_at', { ascending: false }),
    supabase.from('clients').select('*').order('name'),
    supabase.from('producers').select('*').order('name'),
    supabase.from('app_settings').select('*').in('key', ['default_planning', 'asset_list_templates']),
    supabase.from('asset_lists').select('id,project_id,name,sort_order,global_separator,filename_options,created_at,updated_at,revision').order('sort_order'),
    supabase.from('asset_list_rows').select('id,asset_list_id,project_id,updated_at').order('updated_at', { ascending: false }),
    supabase.from('public_share_links').select('*').is('revoked_at', null),
  ]);
  for (const result of [projects, categories, lineItems, labels, profiles, presence]) {
    if (result.error) throw result.error;
  }
  if (invitations.error && invitations.error.code !== '42501') throw invitations.error;
  if (clients.error && clients.error.code !== '42P01' && clients.error.code !== '42501') throw clients.error;
  if (producers.error && producers.error.code !== '42P01' && producers.error.code !== '42501') throw producers.error;
  if (appSettings.error && appSettings.error.code !== '42P01' && appSettings.error.code !== '42501' && appSettings.error.code !== 'PGRST205') throw appSettings.error;
  if (assetLists.error && assetLists.error.code !== '42P01' && assetLists.error.code !== '42501' && assetLists.error.code !== 'PGRST205') throw assetLists.error;
  if (assetRows.error && assetRows.error.code !== '42P01' && assetRows.error.code !== '42501' && assetRows.error.code !== 'PGRST205') throw assetRows.error;
  if (shareLinks.error && shareLinks.error.code !== '42P01' && shareLinks.error.code !== '42501' && shareLinks.error.code !== 'PGRST205') throw shareLinks.error;
  const loadedProfiles = profiles.data ?? [];
  const loadedClients = (clients.data ?? [...new Set(projects.data.map((project) => project.client).filter(Boolean))].map((name) => ({ id: name, name, abbreviation: '' }))).map((client) => ({ ...client, abbreviation: client.abbreviation ?? '' }));
  const loadedProjects = projects.data.map((project) => ({
    ...project,
    post_producer: profileDisplayValue(project.post_producer, loadedProfiles),
    producer: profileDisplayValue(project.producer, loadedProfiles),
    planning_versions: projectVersions(project),
    preferred_planning_version: project.preferred_planning_version ?? projectVersions(project)[0] ?? DEFAULT_PLANNING_VERSION,
  }));
  const loadedLabels = mergeDefaultAssetLabels(mergeGlobalDefaultLabels(labels.data.map((label) => applyDefaultLabelColor({ ...label, sort_order: label.sort_order ?? 0, is_divider: label.is_divider ?? false }))));
  const appSettingsByKey = Object.fromEntries((appSettings.data ?? []).map((setting) => [setting.key, setting.value]));
  return {
    projects: loadedProjects,
    categories: categories.data.map((category) => ({ ...category, planning_type: category.planning_type ?? DEFAULT_PLANNING_TYPE, planning_version: category.planning_version ?? DEFAULT_PLANNING_VERSION, collapsed: false })),
    lineItems: lineItems.data.map((item) => ({ ...item, row_color: item.row_color ?? '', planning_type: item.planning_type ?? DEFAULT_PLANNING_TYPE, planning_version: item.planning_version ?? DEFAULT_PLANNING_VERSION })),
    labels: loadedLabels,
    profiles: loadedProfiles,
    clients: loadedClients,
    producers: producers.data ?? [...new Set(loadedProfiles.map((profile) => profile.display_name).filter(Boolean))].map((name) => ({ id: name, name })),
    presence: presence.data ?? [],
    invitations: invitations.data ?? [],
    assetLists: (assetLists.data ?? []).map((list) => ({
      ...list,
      columns: list.columns ?? [],
      categories: list.categories ?? [],
      rows: (assetRows.data ?? [])
        .filter((row) => row.asset_list_id === list.id)
        .map((row) => ({ id: row.id, updated_at: row.updated_at })),
      filename_options: list.filename_options ?? {},
      global_separator: list.global_separator ?? '_',
    })),
    shareLinks: (shareLinks.data ?? []).map((share) => ({
      ...share,
      planning_type: share.planning_type ?? DEFAULT_PLANNING_TYPE,
      planning_version: share.planning_version ?? DEFAULT_PLANNING_VERSION,
    })),
    appSettings: {
      ...DEFAULT_APP_SETTINGS,
      defaultPlanning: resolveDefaultPlanning({ defaultPlanning: appSettingsByKey.default_planning }, loadedLabels),
      assetListTemplates: Array.isArray(appSettingsByKey.asset_list_templates) ? appSettingsByKey.asset_list_templates : [],
    },
  };
}

async function loadSupabaseProjectData(projectId) {
  const [categories, lineItems, labels, assetLists, assetRows] = await Promise.all([
    supabase.from('categories').select('*').eq('project_id', projectId).order('sort_order'),
    supabase.from('line_items').select('*').eq('project_id', projectId).order('sort_order'),
    supabase.from('labels').select('*').eq('project_id', projectId),
    supabase.from('asset_lists').select('*').eq('project_id', projectId).order('sort_order'),
    supabase.from('asset_list_rows').select('*').eq('project_id', projectId).order('sort_order'),
  ]);
  for (const result of [categories, lineItems, labels, assetLists]) {
    if (result.error) throw result.error;
  }
  const normalizedLists = (assetLists.data ?? []).map((list) => ({
    ...list,
    columns: list.columns ?? [],
    categories: list.categories ?? [],
    filename_options: list.filename_options ?? {},
    global_separator: list.global_separator ?? '_',
    rows: [],
  }));
  if (!assetRows.error) {
    const listById = Object.fromEntries(normalizedLists.map((list) => [list.id, list]));
    (assetRows.data ?? []).forEach((row) => listById[row.asset_list_id]?.rows.push(fromDbAssetListRow(row)));
  } else if (!['42P01', 'PGRST205'].includes(assetRows.error.code)) {
    throw assetRows.error;
  } else {
    normalizedLists.forEach((list) => {
      const legacy = (assetLists.data ?? []).find((item) => item.id === list.id);
      list.rows = legacy?.rows ?? [];
    });
  }
  return {
    categories: categories.data ?? [],
    lineItems: lineItems.data ?? [],
    labels: (labels.data ?? []).map(applyDefaultLabelColor),
    assetLists: normalizedLists,
  };
}

export function PlannerProvider({ children }) {
  const { user, demoMode, hasSupabaseConfig } = useAuth();
  const authUserRef = useRef(user);
  authUserRef.current = user;
  const authUserId = user.id;
  const [data, setData] = useState({ projects: [], categories: [], lineItems: [], labels: [], profiles: [], clients: [], producers: [], presence: [], invitations: [], assetLists: [], shareLinks: [], appSettings: DEFAULT_APP_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState('');
  const [dirtyProjectIds, setDirtyProjectIds] = useState([]);
  const [hasMoreProjects, setHasMoreProjects] = useState(true);
  const dirtyProjectIdsRef = useRef([]);
  const unsupportedLineItemColumnsRef = useRef(new Set());
  const unsupportedCategoryColumnsRef = useRef(new Set());
  const loadedProjectIdsRef = useRef(new Set());
  const projectLoadPromisesRef = useRef(new Map());
  const pendingLineItemWritesRef = useRef(new Map());
  const lineItemRevisionRef = useRef(new Map());
  const lineItemWriteChainsRef = useRef(new Map());
  const pendingAssetRowWritesRef = useRef(new Map());
  const assetRowRevisionRef = useRef(new Map());
  const assetRowWriteChainsRef = useRef(new Map());
  const useSupabase = hasSupabaseConfig && !demoMode;

  useEffect(() => {
    let alive = true;
    const activeUser = authUserRef.current;
    loadedProjectIdsRef.current.clear();
    projectLoadPromisesRef.current.clear();
    pendingLineItemWritesRef.current.forEach((pending) => window.clearTimeout(pending.timer));
    pendingLineItemWritesRef.current.clear();
    lineItemRevisionRef.current.clear();
    lineItemWriteChainsRef.current.clear();
    pendingAssetRowWritesRef.current.forEach((pending) => window.clearTimeout(pending.timer));
    pendingAssetRowWritesRef.current.clear();
    assetRowRevisionRef.current.clear();
    assetRowWriteChainsRef.current.clear();
    setLoading(true);
    const load = async () => {
      const next = useSupabase ? await withTimeout(loadSupabaseData(), PLANNER_LOAD_TIMEOUT_MS, 'Planner data load') : readLocal(activeUser);
      const signedInProfile = next.profiles?.find((profile) => profile.id === activeUser.id);
      if (signedInProfile && activeUser.user_metadata?.preferences) {
        signedInProfile.preferences = activeUser.user_metadata.preferences;
      }
      if (alive) {
        next.assetLists.forEach((list) => list.rows?.forEach((row) => {
          if (row.revision != null) assetRowRevisionRef.current.set(row.id, row.revision);
        }));
        setData(next);
        setLoading(false);
      }
    };
    load().catch((error) => {
      console.error(error);
      if (alive) {
        setData(readLocal(activeUser));
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [authUserId, useSupabase]);

  useEffect(() => {
    if (!loading && !useSupabase) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, loading, useSupabase]);

  useEffect(() => {
    dirtyProjectIdsRef.current = dirtyProjectIds;
  }, [dirtyProjectIds]);

  useEffect(() => {
    data.lineItems.forEach((item) => {
      rememberLatestRevision(lineItemRevisionRef.current, item.id, item.revision);
    });
  }, [data.lineItems]);

  useEffect(() => {
    if (!useSupabase) return undefined;
    const applyChange = (table, payload) => {
      const row = payload.new?.id ? payload.new : payload.old;
      if (!row?.id) return;
      if (!['projects', 'project_presence'].includes(table)
        && row.project_id
        && !loadedProjectIdsRef.current.has(row.project_id)) return;
      setData((current) => {
        const draft = structuredClone(current);
        const collectionByTable = {
          projects: 'projects',
          categories: 'categories',
          line_items: 'lineItems',
          labels: 'labels',
          project_presence: 'presence',
          asset_lists: 'assetLists',
        };
        if (table === 'asset_list_rows') {
          const list = draft.assetLists.find((item) => item.id === row.asset_list_id);
          if (!list) return current;
          if (payload.eventType === 'DELETE') list.rows = (list.rows ?? []).filter((item) => item.id !== row.id);
          else {
            const nextRow = fromDbAssetListRow(payload.new);
            if (nextRow.revision != null) assetRowRevisionRef.current.set(nextRow.id, nextRow.revision);
            const pendingRow = pendingAssetRowWritesRef.current.get(nextRow.id)?.row;
            replaceById(list.rows, pendingRow ? { ...nextRow, ...pendingRow, revision: nextRow.revision } : nextRow);
          }
          return draft;
        }
        const collectionName = collectionByTable[table];
        if (!collectionName) return current;
        if (payload.eventType === 'DELETE') {
          draft[collectionName] = draft[collectionName].filter((item) => item.id !== row.id);
        } else {
          let next = table === 'labels' ? applyDefaultLabelColor(payload.new) : payload.new;
          if (table === 'asset_lists') {
            const { rows: _legacyRows, ...metadata } = next;
            const currentList = draft.assetLists.find((item) => item.id === metadata.id);
            next = { ...(currentList ?? {}), ...metadata, rows: currentList?.rows ?? [] };
          }
          if (table === 'line_items') {
            rememberLatestRevision(lineItemRevisionRef.current, next.id, next.revision);
            next = { ...next, ...(pendingLineItemWritesRef.current.get(next.id)?.patch ?? {}) };
          }
          replaceById(draft[collectionName], next);
        }
        return draft;
      });
    };
    const channel = supabase.channel('planner-collaboration');
    ['projects', 'categories', 'line_items', 'labels', 'project_presence', 'asset_lists', 'asset_list_rows'].forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => applyChange(table, payload));
    });
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [useSupabase]);

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

  const saveLineItemUpsert = useCallback(async (label, items, { throwOnError = false } = {}) => {
    if (!useSupabase) return null;
    const rows = Array.isArray(items) ? items : [items];
    const buildPayload = () => withoutColumns(rows.map(dbLineItem), unsupportedLineItemColumnsRef.current);
    let result = await supabase.from('line_items').upsert(buildPayload(), { onConflict: 'id' });
    const missingColumn = schemaMissingColumn(result?.error);
    if (missingColumn && OPTIONAL_LINE_ITEM_COLUMNS.has(missingColumn)) {
      unsupportedLineItemColumnsRef.current.add(missingColumn);
      result = await supabase.from('line_items').upsert(buildPayload(), { onConflict: 'id' });
    }
    return saveSupabase(label, Promise.resolve(result), { throwOnError });
  }, [saveSupabase, useSupabase]);

  const saveCategoryUpsert = useCallback(async (label, categories, { throwOnError = false } = {}) => {
    if (!useSupabase) return null;
    const rows = Array.isArray(categories) ? categories : [categories];
    const buildPayload = () => withoutColumns(rows.map(dbCategory), unsupportedCategoryColumnsRef.current);
    let result = await supabase.from('categories').upsert(buildPayload(), { onConflict: 'id' });
    const missingColumn = schemaMissingColumn(result?.error, 'categories');
    if (missingColumn && OPTIONAL_CATEGORY_COLUMNS.has(missingColumn)) {
      unsupportedCategoryColumnsRef.current.add(missingColumn);
      result = await supabase.from('categories').upsert(buildPayload(), { onConflict: 'id' });
    }
    return saveSupabase(label, Promise.resolve(result), { throwOnError });
  }, [saveSupabase, useSupabase]);

  const saveCategoryInsert = useCallback(async (label, categories, { throwOnError = false } = {}) => {
    if (!useSupabase) return null;
    const rows = Array.isArray(categories) ? categories : [categories];
    const buildPayload = () => withoutColumns(rows.map(dbCategory), unsupportedCategoryColumnsRef.current);
    let result = await supabase.from('categories').insert(buildPayload());
    const missingColumn = schemaMissingColumn(result?.error, 'categories');
    if (missingColumn && OPTIONAL_CATEGORY_COLUMNS.has(missingColumn)) {
      unsupportedCategoryColumnsRef.current.add(missingColumn);
      result = await supabase.from('categories').insert(buildPayload());
    }
    return saveSupabase(label, Promise.resolve(result), { throwOnError });
  }, [saveSupabase, useSupabase]);

  const saveLineItemUpdate = useCallback(async (label, itemId, patch, { throwOnError = false, expectedRevision: suppliedRevision } = {}) => {
    if (!useSupabase) return null;
    const queuedWrite = lineItemWriteChainsRef.current.get(itemId);
    const previousWrite = queuedWrite ?? Promise.resolve();
    const capturedRevision = suppliedRevision ?? lineItemRevisionRef.current.get(itemId);
    const write = previousWrite.catch(() => null).then(async () => {
      const dbPatch = dbLineItemPatch(patch);
      const buildPayload = () => withoutColumns(dbPatch, unsupportedLineItemColumnsRef.current);
      let payload = buildPayload();
      if (!Object.keys(payload).length) return null;
      // A write queued behind our own write should use the revision returned by
      // that write. Otherwise retain the revision from when editing started.
      const expectedRevision = queuedWrite ? lineItemRevisionRef.current.get(itemId) : capturedRevision;
      let request = supabase.from('line_items').update(payload).eq('id', itemId);
      if (expectedRevision != null) request = request.eq('revision', expectedRevision);
      let result = await request.select().maybeSingle();
      const missingColumn = schemaMissingColumn(result?.error);
      if (missingColumn && OPTIONAL_LINE_ITEM_COLUMNS.has(missingColumn)) {
        unsupportedLineItemColumnsRef.current.add(missingColumn);
        payload = buildPayload();
        result = Object.keys(payload).length
          ? await supabase.from('line_items').update(payload).eq('id', itemId).select().maybeSingle()
          : { data: null, error: null };
      }
      if (!result.error && !result.data && expectedRevision != null) {
        const latest = await supabase.from('line_items').select('*').eq('id', itemId).maybeSingle();
        if (latest.data) {
          rememberLatestRevision(lineItemRevisionRef.current, itemId, latest.data.revision);
          let retryRequest = supabase.from('line_items').update(payload).eq('id', itemId);
          if (latest.data.revision != null) retryRequest = retryRequest.eq('revision', latest.data.revision);
          const retry = await retryRequest.select().maybeSingle();
          if (!retry.error && retry.data) {
            rememberLatestRevision(lineItemRevisionRef.current, itemId, retry.data.revision);
            setData((current) => ({
              ...current,
              lineItems: current.lineItems.map((item) => item.id === itemId
                ? { ...item, ...retry.data, ...(pendingLineItemWritesRef.current.get(itemId)?.patch ?? {}) }
                : item),
            }));
            return saveSupabase(label, Promise.resolve(retry), { throwOnError });
          }
          setData((current) => ({
            ...current,
            lineItems: current.lineItems.map((item) => item.id === itemId
              ? { ...latest.data, ...(pendingLineItemWritesRef.current.get(itemId)?.patch ?? {}) }
              : item),
          }));
        }
        const conflict = new Error('This row changed in another browser. The latest server version was restored.');
        setSaveError(conflict.message);
        if (throwOnError) throw conflict;
        return { data: null, error: conflict };
      }
      if (result.data) {
        rememberLatestRevision(lineItemRevisionRef.current, itemId, result.data.revision);
        setData((current) => ({
          ...current,
          lineItems: current.lineItems.map((item) => item.id === itemId
            ? { ...item, ...result.data, ...(pendingLineItemWritesRef.current.get(itemId)?.patch ?? {}) }
            : item),
        }));
      }
      return saveSupabase(label, Promise.resolve(result), { throwOnError });
    });
    lineItemWriteChainsRef.current.set(itemId, write);
    void write.finally(() => {
      if (lineItemWriteChainsRef.current.get(itemId) === write) lineItemWriteChainsRef.current.delete(itemId);
    });
    return write;
  }, [saveSupabase, useSupabase]);

  const invokeAdminUserAction = useCallback(async (body) => {
    if (!useSupabase) return null;
    let { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    let activeSession = sessionData?.session;
    const expiresSoon = activeSession?.expires_at && activeSession.expires_at * 1000 < Date.now() + 60_000;
    if (!activeSession || expiresSoon) {
      const refreshed = await supabase.auth.refreshSession();
      sessionError = refreshed.error;
      activeSession = refreshed.data?.session;
    }
    if (sessionError || !activeSession?.access_token) {
      const error = new Error('Your session has expired. Sign in again and retry the admin action.');
      setSaveError(`Admin action failed: ${error.message}`);
      throw error;
    }
    const result = await supabase.functions.invoke('admin-user-email', {
      body,
      headers: {
        Authorization: `Bearer ${activeSession.access_token}`,
      },
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

  const loadProjectData = useCallback(async (projectId) => {
    if (!useSupabase || loadedProjectIdsRef.current.has(projectId)) return;
    if (projectLoadPromisesRef.current.has(projectId)) return projectLoadPromisesRef.current.get(projectId);
    const promise = loadSupabaseProjectData(projectId)
      .then((projectData) => {
        setData((current) => ({
          ...current,
          categories: [...current.categories.filter((item) => item.project_id !== projectId), ...projectData.categories],
          lineItems: [...current.lineItems.filter((item) => item.project_id !== projectId), ...projectData.lineItems],
          labels: [...current.labels.filter((item) => item.project_id !== projectId), ...projectData.labels],
          assetLists: [...current.assetLists.filter((item) => item.project_id !== projectId), ...projectData.assetLists],
        }));
        loadedProjectIdsRef.current.add(projectId);
      })
      .finally(() => projectLoadPromisesRef.current.delete(projectId));
    projectLoadPromisesRef.current.set(projectId, promise);
    return promise;
  }, [useSupabase]);

  const loadMoreProjects = useCallback(async () => {
    if (!useSupabase || !hasMoreProjects) return;
    const offset = data.projects.length;
    const projectsResult = await supabase
      .from('projects')
      .select('*')
      .order('last_edited_at', { ascending: false })
      .range(offset, offset + PROJECT_PAGE_SIZE - 1);
    if (projectsResult.error) {
      setSaveError(`More projects could not be loaded: ${projectsResult.error.message}`);
      return;
    }
    const nextProjects = projectsResult.data ?? [];
    const projectIds = nextProjects.map((project) => project.id);
    const categoriesResult = projectIds.length
      ? await supabase.from('categories').select('id,project_id,planning_type,planning_version,name,sort_order,revision,updated_at').in('project_id', projectIds)
      : { data: [], error: null };
    setData((current) => {
      const draft = structuredClone(current);
      nextProjects.forEach((project) => replaceById(draft.projects, project));
      (categoriesResult.data ?? []).forEach((category) => replaceById(draft.categories, category));
      return draft;
    });
    setHasMoreProjects(nextProjects.length === PROJECT_PAGE_SIZE);
  }, [data.projects.length, hasMoreProjects, useSupabase]);

  const flushLineItemUpdate = useCallback((itemId) => {
    const pending = pendingLineItemWritesRef.current.get(itemId);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingLineItemWritesRef.current.delete(itemId);
    void saveLineItemUpdate('line item changes', itemId, pending.patch, { expectedRevision: pending.expectedRevision });
  }, [saveLineItemUpdate]);

  const queueLineItemUpdate = useCallback((itemId, patch) => {
    const existing = pendingLineItemWritesRef.current.get(itemId);
    if (existing) window.clearTimeout(existing.timer);
    const next = {
      patch: { ...(existing?.patch ?? {}), ...patch },
      expectedRevision: existing?.expectedRevision ?? lineItemRevisionRef.current.get(itemId),
      timer: window.setTimeout(() => flushLineItemUpdate(itemId), 500),
    };
    pendingLineItemWritesRef.current.set(itemId, next);
  }, [flushLineItemUpdate]);

  useEffect(() => {
    const flushPendingLineItems = () => {
      [...pendingLineItemWritesRef.current.keys()].forEach((itemId) => flushLineItemUpdate(itemId));
    };
    document.addEventListener('visibilitychange', flushPendingLineItems);
    window.addEventListener('pagehide', flushPendingLineItems);
    return () => {
      document.removeEventListener('visibilitychange', flushPendingLineItems);
      window.removeEventListener('pagehide', flushPendingLineItems);
    };
  }, [flushLineItemUpdate]);

  const saveAssetRowUpdate = useCallback(async (list, row, suppliedRevision) => {
    if (!useSupabase) return null;
    const queuedWrite = assetRowWriteChainsRef.current.get(row.id);
    const previousWrite = queuedWrite ?? Promise.resolve();
    const capturedRevision = suppliedRevision ?? assetRowRevisionRef.current.get(row.id);
    const write = previousWrite.catch(() => null).then(async () => {
      const payload = dbAssetListRow(list, row);
      const { id: _id, revision: _revision, ...changes } = payload;
      const expectedRevision = queuedWrite ? assetRowRevisionRef.current.get(row.id) : capturedRevision;
      let request = supabase.from('asset_list_rows').update(changes).eq('id', row.id);
      if (expectedRevision != null) request = request.eq('revision', expectedRevision);
      const result = await request.select().maybeSingle();
      if (!result.error && !result.data && expectedRevision != null) {
        const latest = await supabase.from('asset_list_rows').select('*').eq('id', row.id).maybeSingle();
        if (latest.data) {
          const latestRow = fromDbAssetListRow(latest.data);
          if (latestRow.revision != null) assetRowRevisionRef.current.set(row.id, latestRow.revision);
          const pendingRow = pendingAssetRowWritesRef.current.get(row.id)?.row;
          setData((current) => ({
            ...current,
            assetLists: current.assetLists.map((item) => item.id !== list.id ? item : {
              ...item,
              rows: item.rows.map((currentRow) => currentRow.id === row.id
                ? { ...latestRow, ...row, ...(pendingRow ?? {}), revision: latestRow.revision }
                : currentRow),
            }),
          }));
        }
        setSaveError('An asset row changed in another browser. Your edit was retained, but could not be saved.');
        return { data: null, error: new Error('Asset row revision conflict') };
      }
      if (result.data) {
        const savedRow = fromDbAssetListRow(result.data);
        if (savedRow.revision != null) assetRowRevisionRef.current.set(row.id, savedRow.revision);
        const pendingRow = pendingAssetRowWritesRef.current.get(row.id)?.row;
        setData((current) => ({
          ...current,
          assetLists: current.assetLists.map((item) => item.id !== list.id ? item : {
            ...item,
            rows: item.rows.map((currentRow) => currentRow.id === row.id
              ? (pendingRow ? { ...savedRow, ...pendingRow, revision: savedRow.revision } : savedRow)
              : currentRow),
          }),
        }));
      }
      return saveSupabase('asset row', Promise.resolve(result));
    });
    assetRowWriteChainsRef.current.set(row.id, write);
    void write.finally(() => {
      if (assetRowWriteChainsRef.current.get(row.id) === write) assetRowWriteChainsRef.current.delete(row.id);
    });
    return write;
  }, [saveSupabase, useSupabase]);

  const flushAssetRowUpdate = useCallback((rowId) => {
    const pending = pendingAssetRowWritesRef.current.get(rowId);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingAssetRowWritesRef.current.delete(rowId);
    void saveAssetRowUpdate(pending.list, pending.row, pending.expectedRevision);
  }, [saveAssetRowUpdate]);

  const queueAssetRowUpdate = useCallback((list, row, previous) => {
    const existing = pendingAssetRowWritesRef.current.get(row.id);
    if (existing) window.clearTimeout(existing.timer);
    pendingAssetRowWritesRef.current.set(row.id, {
      list,
      row,
      expectedRevision: existing?.expectedRevision ?? previous?.revision ?? assetRowRevisionRef.current.get(row.id),
      timer: window.setTimeout(() => flushAssetRowUpdate(row.id), 450),
    });
  }, [flushAssetRowUpdate]);

  useEffect(() => {
    const flushPendingAssetRows = () => {
      [...pendingAssetRowWritesRef.current.keys()].forEach((rowId) => flushAssetRowUpdate(rowId));
    };
    document.addEventListener('visibilitychange', flushPendingAssetRows);
    window.addEventListener('pagehide', flushPendingAssetRows);
    return () => {
      document.removeEventListener('visibilitychange', flushPendingAssetRows);
      window.removeEventListener('pagehide', flushPendingAssetRows);
    };
  }, [flushAssetRowUpdate]);

  const saveAssetRows = useCallback(async (list, previousRows, nextRows) => {
    if (!useSupabase) return;
    const previousById = new Map((previousRows ?? []).map((row) => [row.id, row]));
    const nextIds = new Set((nextRows ?? []).map((row) => row.id));
    const removedIds = (previousRows ?? []).filter((row) => !nextIds.has(row.id)).map((row) => row.id);
    let changedRows = (nextRows ?? []).filter((row) => {
      const previous = previousById.get(row.id);
      return !previous || JSON.stringify(previous) !== JSON.stringify(row);
    });
    const withoutOrder = (row) => Object.fromEntries(Object.entries(row ?? {}).filter(([key]) => key !== 'sort_order'));
    const orderOnly = !removedIds.length
      && changedRows.length > 1
      && changedRows.every((row) => {
        const previous = previousById.get(row.id);
        return previous && JSON.stringify(withoutOrder(previous)) === JSON.stringify(withoutOrder(row));
      });
    if (orderOnly) {
      await saveSupabase('asset row order', supabase.rpc('reorder_asset_list_rows', {
        target_asset_list_id: list.id,
        ordered_ids: [...nextRows].sort((a, b) => a.sort_order - b.sort_order).map((row) => row.id),
      }));
      changedRows = [];
    }
    if (removedIds.length) {
      await saveSupabase('asset rows delete', supabase.from('asset_list_rows').delete().in('id', removedIds));
    }
    await Promise.all(changedRows.map(async (row) => {
      const previous = previousById.get(row.id);
      const payload = dbAssetListRow(list, row);
      if (!previous) {
        await saveSupabase('asset row', supabase.from('asset_list_rows').insert(payload));
        return;
      }
      queueAssetRowUpdate(list, row, previous);
    }));
  }, [queueAssetRowUpdate, saveSupabase, useSupabase]);

  useEffect(() => () => {
    pendingLineItemWritesRef.current.forEach((pending) => window.clearTimeout(pending.timer));
    pendingLineItemWritesRef.current.clear();
    pendingAssetRowWritesRef.current.forEach((pending) => window.clearTimeout(pending.timer));
    pendingAssetRowWritesRef.current.clear();
  }, []);

  const api = useMemo(
    () => ({
      ...data,
      loading,
      saveError,
      clearSaveError: () => setSaveError(''),
      loadProjectData,
      loadMoreProjects,
      hasMoreProjects,
      flushLineItemUpdate,
      createProject: async ({ projectNumber, name, client, postProducer, producer, planningType: initialPlanningType = DEFAULT_PLANNING_TYPE, productionPlanningView = 'gantt' }) => {
        const now = new Date().toISOString();
        const safePlanningType = planningType(initialPlanningType);
        const planningDefinition = PLANNING_TYPES[safePlanningType] ?? PLANNING_TYPES.post;
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
          planning_versions: safePlanningType === DEFAULT_PLANNING_TYPE ? [DEFAULT_PLANNING_VERSION] : [],
          preferred_planning_version: DEFAULT_PLANNING_VERSION,
          production_planning_view: safePlanningType === PLANNING_TYPES.production.key ? productionPlanningView : 'gantt',
        };
        const category = { id: id(), project_id: project.id, planning_type: safePlanningType, planning_version: DEFAULT_PLANNING_VERSION, name: planningDefinition.defaultCategoryName, sort_order: 0, collapsed: false };
        mutate((draft) => {
          draft.projects.unshift(project);
          draft.categories.push(category);
          if (client && !draft.clients.some((item) => normalizedName(item.name) === normalizedName(client))) {
            draft.clients.push({ id: id(), name: client, abbreviation: '', created_by: user.id, created_at: now });
          }
          [postProducer, producer].filter(Boolean).forEach((producerName) => {
            if (!draft.producers.some((item) => normalizedName(item.name) === normalizedName(producerName))) {
              draft.producers.push({ id: id(), name: producerName, created_by: user.id, created_at: now });
            }
          });
        });
        if (useSupabase) {
          await saveSupabase('project', supabase.from('projects').insert(project), { throwOnError: true });
          await saveCategoryInsert('category', category, { throwOnError: true });
          if (client) await saveSupabase('client', supabase.from('clients').upsert({ name: client, created_by: user.id }, { onConflict: 'name', ignoreDuplicates: true }), { throwOnError: false });
          await Promise.all([postProducer, producer].filter(Boolean).map((producerName) => saveSupabase('producer', supabase.from('producers').upsert({ name: producerName, created_by: user.id }, { onConflict: 'name', ignoreDuplicates: true }), { throwOnError: false })));
        }
        return project;
      },
      updateProject: (projectId, patch) => mutate((draft) => {
        const project = draft.projects.find((item) => item.id === projectId);
        Object.assign(project, patch);
        if (patch.client && !draft.clients.some((item) => normalizedName(item.name) === normalizedName(patch.client))) {
          draft.clients.push({ id: id(), name: patch.client, abbreviation: '', created_by: user.id, created_at: new Date().toISOString() });
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
        draft.assetLists = draft.assetLists.filter((item) => item.project_id !== projectId);
        if (useSupabase) void saveSupabase('project delete', supabase.from('projects').delete().eq('id', projectId));
      }),
      ensureAssetList: (projectId) => mutate((draft) => {
        const existing = draft.assetLists
          .filter((item) => item.project_id === projectId)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
        if (existing) return existing.id;
        const list = createAssetList(projectId, 'Asset list', 0);
        draft.assetLists.push(list);
        markDirty(projectId);
        if (useSupabase) void saveSupabase('asset list', supabase.from('asset_lists').insert(dbAssetList(list)));
        return list.id;
      }),
      createAssetListTab: (projectId, sourceId = null) => mutate((draft) => {
        const projectLists = draft.assetLists.filter((item) => item.project_id === projectId);
        const source = sourceId ? projectLists.find((item) => item.id === sourceId) : null;
        const nextSortOrder = projectLists.length;
        const list = source ? {
          ...structuredClone(source),
          id: id(),
          name: `${source.name} copy`,
          sort_order: nextSortOrder,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } : createAssetList(projectId, 'Assetlist', nextSortOrder);
        draft.assetLists.push(list);
        markDirty(projectId);
        if (useSupabase) void saveSupabase('asset list tab', supabase.from('asset_lists').insert(dbAssetList(list)));
        return list.id;
      }),
      updateAssetList: (listId, patch) => mutate((draft) => {
        const list = draft.assetLists.find((item) => item.id === listId);
        if (!list) return;
        const previousRows = list.rows ?? [];
        const updatedAt = new Date().toISOString();
        const nextPatch = { ...patch, updated_at: updatedAt };
        if (Object.hasOwn(patch, 'rows')) {
          nextPatch.filename_options = {
            ...(list.filename_options ?? {}),
            ...(patch.filename_options ?? {}),
            asset_last_edited_by: user.id,
            asset_last_edited_at: updatedAt,
          };
        }
        Object.assign(list, nextPatch);
        markDirty(list.project_id);
        if (useSupabase) {
          if (Object.hasOwn(nextPatch, 'rows')) void saveAssetRows(list, previousRows, nextPatch.rows);
          const metadataPatch = Object.fromEntries(Object.entries(nextPatch).filter(([key]) => key !== 'rows'));
          if (Object.keys(metadataPatch).length) void saveSupabase('asset list changes', supabase.from('asset_lists').update(metadataPatch).eq('id', listId));
        }
      }),
      deleteAssetListTab: (listId) => mutate((draft) => {
        const list = draft.assetLists.find((item) => item.id === listId);
        if (!list) return;
        draft.assetLists = draft.assetLists.filter((item) => item.id !== listId);
        draft.assetLists
          .filter((item) => item.project_id === list.project_id)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .forEach((item, index) => {
            item.sort_order = index;
          });
        markDirty(list.project_id);
        if (useSupabase) void saveSupabase('asset list delete', supabase.from('asset_lists').delete().eq('id', listId));
      }),
      ensurePlanningModule: (projectId, type = DEFAULT_PLANNING_TYPE, productionPlanningView = 'gantt') => mutate((draft) => {
        const safeType = planningType(type);
        const existingVersions = planningVersionsFor(projectId, safeType, draft.categories, draft.lineItems);
        if (existingVersions.length) return existingVersions[0];
        const project = draft.projects.find((item) => item.id === projectId);
        if (project && safeType === PLANNING_TYPES.production.key) {
          project.production_planning_view = productionPlanningView;
          if (useSupabase) void saveSupabase('production planning view', supabase.from('projects').update({ production_planning_view: productionPlanningView }).eq('id', projectId));
        }
        const definition = PLANNING_TYPES[safeType] ?? PLANNING_TYPES.post;
        const category = {
          id: id(),
          project_id: projectId,
          planning_type: safeType,
          planning_version: DEFAULT_PLANNING_VERSION,
          name: definition.defaultCategoryName,
          sort_order: 0,
          collapsed: false,
        };
        if (project && safeType === DEFAULT_PLANNING_TYPE && !projectVersions(project).includes(DEFAULT_PLANNING_VERSION)) {
          project.planning_versions = [DEFAULT_PLANNING_VERSION, ...projectVersions(project)];
        }
        draft.categories.push(category);
        markDirty(projectId);
        if (useSupabase) void saveCategoryInsert('planning module category', category);
        return DEFAULT_PLANNING_VERSION;
      }),
      deletePlanningModule: (projectId, type = DEFAULT_PLANNING_TYPE) => mutate((draft) => {
        const safeType = planningType(type);
        const project = draft.projects.find((item) => item.id === projectId);
        if (!project) return;
        const removedCategoryIds = draft.categories
          .filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType)
          .map((item) => item.id);
        const removedLineItemIds = draft.lineItems
          .filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType)
          .map((item) => item.id);
        draft.categories = draft.categories.filter((item) => !removedCategoryIds.includes(item.id));
        draft.lineItems = draft.lineItems.filter((item) => !removedLineItemIds.includes(item.id));
        if (safeType === DEFAULT_PLANNING_TYPE) {
          project.planning_versions = [];
          project.preferred_planning_version = DEFAULT_PLANNING_VERSION;
        }
        markDirty(projectId);
        if (useSupabase) {
          if (safeType === DEFAULT_PLANNING_TYPE) {
            void saveSupabase('project planning versions', supabase.from('projects').update({ planning_versions: [], preferred_planning_version: DEFAULT_PLANNING_VERSION }).eq('id', projectId));
          }
          removedCategoryIds.forEach((categoryId) => void saveSupabase('planning module category delete', supabase.from('categories').delete().eq('id', categoryId)));
          if (removedLineItemIds.length) void saveSupabase('planning module line items delete', supabase.from('line_items').delete().in('id', removedLineItemIds));
          void saveSupabase('planning module shares revoke', supabase.from('public_share_links').update({ revoked_at: new Date().toISOString() }).eq('project_id', projectId).eq('planning_type', safeType).is('revoked_at', null));
        }
      }),
      duplicateProjectPlanning: async (projectId, sourceVersion = DEFAULT_PLANNING_VERSION, type = DEFAULT_PLANNING_TYPE) => {
        if (useSupabase && !loadedProjectIdsRef.current.has(projectId)) {
          await loadProjectData(projectId);
        }
        return mutate((draft) => {
          const project = draft.projects.find((item) => item.id === projectId);
          if (!project) return null;
          const safeType = planningType(type);
          const versions = planningVersionsFor(projectId, safeType, draft.categories, draft.lineItems, safeType === DEFAULT_PLANNING_TYPE ? project : null);
          const nextVersion = nextPlanningVersion(versions);
          if (!nextVersion) return null;
          const safeSourceVersion = versions.includes(sourceVersion) ? sourceVersion : versions[0] ?? DEFAULT_PLANNING_VERSION;
          const sourceCategories = draft.categories
            .filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType && (item.planning_version ?? DEFAULT_PLANNING_VERSION) === safeSourceVersion)
            .sort((a, b) => a.sort_order - b.sort_order);
          const sourceRows = draft.lineItems
            .filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType && (item.planning_version ?? DEFAULT_PLANNING_VERSION) === safeSourceVersion)
            .sort((a, b) => a.sort_order - b.sort_order);
          const categoryIdMap = Object.fromEntries(sourceCategories.map((category) => [category.id, id()]));
          const newCategories = sourceCategories.map((category) => ({
            ...category,
            id: categoryIdMap[category.id],
            planning_type: safeType,
            planning_version: nextVersion,
            collapsed: false,
          }));
          const newRows = sourceRows.map((item) => ({
            ...item,
            id: id(),
            planning_type: safeType,
            planning_version: nextVersion,
            category_id: item.category_id ? categoryIdMap[item.category_id] ?? null : null,
          }));
          if (safeType === DEFAULT_PLANNING_TYPE) project.planning_versions = [...versions, nextVersion];
          draft.categories.push(...newCategories);
          draft.lineItems.push(...newRows);
          markDirty(projectId);
          if (useSupabase) {
            if (safeType === DEFAULT_PLANNING_TYPE) void saveSupabase('project planning versions', supabase.from('projects').update({ planning_versions: project.planning_versions }).eq('id', projectId));
            void (async () => {
              try {
                if (newCategories.length) {
                  await saveCategoryInsert('planning version categories', newCategories, { throwOnError: true });
                }
                if (newRows.length) {
                  await saveLineItemUpsert('planning version line items', newRows, { throwOnError: true });
                }
              } catch {
                // saveSupabase has already shown the exact database error.
              }
            })();
          }
          return nextVersion;
        });
      },
      deleteProjectPlanningVersion: (projectId, version, type = DEFAULT_PLANNING_TYPE) => mutate((draft) => {
        const project = draft.projects.find((item) => item.id === projectId);
        if (!project) return;
        const safeType = planningType(type);
        const versions = planningVersionsFor(projectId, safeType, draft.categories, draft.lineItems, safeType === DEFAULT_PLANNING_TYPE ? project : null);
        if (versions.length <= 1) return;
        const nextVersions = versions.filter((item) => item !== version);
        const nextPreferred = nextVersions.includes(project.preferred_planning_version) ? project.preferred_planning_version : nextVersions[0];
        const removedCategoryIds = draft.categories
          .filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType && (item.planning_version ?? DEFAULT_PLANNING_VERSION) === version)
          .map((item) => item.id);
        draft.categories = draft.categories.filter((item) => item.project_id !== projectId || planningType(item.planning_type) !== safeType || (item.planning_version ?? DEFAULT_PLANNING_VERSION) !== version);
        draft.lineItems = draft.lineItems.filter((item) => item.project_id !== projectId || planningType(item.planning_type) !== safeType || (item.planning_version ?? DEFAULT_PLANNING_VERSION) !== version);
        if (safeType === DEFAULT_PLANNING_TYPE) {
          project.planning_versions = nextVersions;
          project.preferred_planning_version = nextPreferred;
        }
        markDirty(projectId);
        if (useSupabase) {
          if (safeType === DEFAULT_PLANNING_TYPE) void saveSupabase('project planning versions', supabase.from('projects').update({ planning_versions: project.planning_versions, preferred_planning_version: nextPreferred }).eq('id', projectId));
          removedCategoryIds.forEach((categoryId) => void saveSupabase('removed planning category', supabase.from('categories').delete().eq('id', categoryId)));
          void saveSupabase('removed planning line items', supabase.from('line_items').delete().eq('project_id', projectId).eq('planning_type', safeType).eq('planning_version', version));
        }
      }),
      keepProjectPlanningVersion: (projectId, version, type = DEFAULT_PLANNING_TYPE) => mutate((draft) => {
        const project = draft.projects.find((item) => item.id === projectId);
        if (!project) return;
        const safeType = planningType(type);
        const removedCategoryIds = draft.categories
          .filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType && (item.planning_version ?? DEFAULT_PLANNING_VERSION) !== version)
          .map((item) => item.id);
        draft.categories = draft.categories.filter((item) => item.project_id !== projectId || planningType(item.planning_type) !== safeType || (item.planning_version ?? DEFAULT_PLANNING_VERSION) === version);
        draft.lineItems = draft.lineItems.filter((item) => item.project_id !== projectId || planningType(item.planning_type) !== safeType || (item.planning_version ?? DEFAULT_PLANNING_VERSION) === version);
        draft.categories
          .filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType)
          .forEach((item) => {
            item.planning_version = version;
          });
        draft.lineItems
          .filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType)
          .forEach((item) => {
            item.planning_version = version;
          });
        if (safeType === DEFAULT_PLANNING_TYPE) {
          project.planning_versions = [version];
          project.preferred_planning_version = version;
        }
        markDirty(projectId);
        if (useSupabase) {
          if (safeType === DEFAULT_PLANNING_TYPE) void saveSupabase('preferred planning version', supabase.from('projects').update({ planning_versions: [version], preferred_planning_version: version }).eq('id', projectId));
          removedCategoryIds.forEach((categoryId) => void saveSupabase('removed planning category', supabase.from('categories').delete().eq('id', categoryId)));
          void saveSupabase('removed planning line items', supabase.from('line_items').delete().eq('project_id', projectId).eq('planning_type', safeType).neq('planning_version', version));
        }
      }),
      setPreferredPlanningVersion: (projectId, version) => mutate((draft) => {
        const project = draft.projects.find((item) => item.id === projectId);
        if (!project) return;
        project.preferred_planning_version = version;
        if (!projectVersions(project).includes(version)) project.planning_versions = [...projectVersions(project), version];
        if (useSupabase) void saveSupabase('preferred planning version', supabase.from('projects').update({ preferred_planning_version: version, planning_versions: project.planning_versions }).eq('id', projectId));
      }),
      addCategory: (projectId, version = DEFAULT_PLANNING_VERSION, type = DEFAULT_PLANNING_TYPE) => mutate((draft) => {
        const safeType = planningType(type);
        const count = draft.categories.filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType && (item.planning_version ?? DEFAULT_PLANNING_VERSION) === version).length;
        const category = { id: id(), project_id: projectId, planning_type: safeType, planning_version: version, name: `Category ${count + 1}`, sort_order: count, collapsed: false };
        const project = draft.projects.find((item) => item.id === projectId);
        if (project && safeType === DEFAULT_PLANNING_TYPE && !projectVersions(project).includes(version)) {
          project.planning_versions = [...projectVersions(project), version];
        }
        draft.categories.push(category);
        markDirty(projectId);
        if (useSupabase) {
          void (async () => {
            if (project && safeType === DEFAULT_PLANNING_TYPE) {
              await saveSupabase('project planning versions', supabase.from('projects').update({ planning_versions: project.planning_versions }).eq('id', projectId));
            }
            await saveCategoryUpsert('category', category);
          })();
        }
        return category.id;
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
      reorderCategories: (projectId, activeId, overId, version = DEFAULT_PLANNING_VERSION, type = DEFAULT_PLANNING_TYPE, placement = null) => mutate((draft) => {
        const safeType = planningType(type);
        const rows = draft.categories.filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType && (item.planning_version ?? DEFAULT_PLANNING_VERSION) === version).sort((a, b) => a.sort_order - b.sort_order);
        const oldIndex = rows.findIndex((item) => item.id === activeId);
        const newIndex = rows.findIndex((item) => item.id === overId);
        if (oldIndex < 0 || newIndex < 0 || activeId === overId) return;
        const [moved] = rows.splice(oldIndex, 1);
        const targetIndex = placement
          ? rows.findIndex((item) => item.id === overId) + (placement === 'after' ? 1 : 0)
          : newIndex;
        rows.splice(targetIndex, 0, moved);
        rows.forEach((item, index) => {
          const real = draft.categories.find((category) => category.id === item.id);
          real.sort_order = index;
        });
        markDirty(projectId);
        if (useSupabase) {
          void saveSupabase('category order', supabase.rpc('reorder_categories', {
            target_project_id: projectId,
            target_planning_type: safeType,
            target_planning_version: version,
            ordered_ids: rows.map((item) => item.id),
          }));
        }
      }),
      deleteCategory: (categoryId) => mutate((draft) => {
        const category = draft.categories.find((item) => item.id === categoryId);
        draft.lineItems = draft.lineItems.filter((item) => item.category_id !== categoryId);
        draft.categories = draft.categories.filter((item) => item.id !== categoryId);
        markDirty(category?.project_id);
        if (useSupabase) {
          void (async () => {
            await saveSupabase('category line items delete', supabase.from('line_items').delete().eq('category_id', categoryId));
            await saveSupabase('category delete', supabase.from('categories').delete().eq('id', categoryId));
          })();
        }
      }),
      updateDefaultPlanning: (labelIds) => mutate((draft) => {
        const uniqueIds = [...new Set(labelIds)].filter((labelId) => draft.labels.some((label) => label.id === labelId && !label.project_id && label.column_type === 'what' && !label.is_divider));
        draft.appSettings = { ...(draft.appSettings ?? DEFAULT_APP_SETTINGS), defaultPlanning: uniqueIds };
        if (useSupabase) {
          void saveSupabase('default planning', supabase.from('app_settings').upsert({ key: 'default_planning', value: uniqueIds }, { onConflict: 'key' }));
        }
      }),
      saveAssetListTemplate: (template) => mutate((draft) => {
        const templates = [...(draft.appSettings?.assetListTemplates ?? [])];
        const existingIndex = templates.findIndex((item) => (template.id && item.id === template.id) || item.name.trim().toLowerCase() === template.name.trim().toLowerCase());
        const savedTemplate = { ...template, id: existingIndex >= 0 ? templates[existingIndex].id : id(), updated_at: new Date().toISOString() };
        if (existingIndex >= 0) templates[existingIndex] = savedTemplate;
        else templates.push(savedTemplate);
        draft.appSettings = { ...(draft.appSettings ?? DEFAULT_APP_SETTINGS), assetListTemplates: templates };
        if (useSupabase) {
          void saveSupabase('asset list templates', supabase.from('app_settings').upsert({ key: 'asset_list_templates', value: templates }, { onConflict: 'key' }));
        }
        return savedTemplate;
      }),
      deleteAssetListTemplate: (templateId) => mutate((draft) => {
        const templates = (draft.appSettings?.assetListTemplates ?? []).filter((template) => template.id !== templateId);
        draft.appSettings = { ...(draft.appSettings ?? DEFAULT_APP_SETTINGS), assetListTemplates: templates };
        if (useSupabase) {
          void saveSupabase('asset list templates', supabase.from('app_settings').upsert({ key: 'asset_list_templates', value: templates }, { onConflict: 'key' }));
        }
      }),
      addLineItem: (projectId, categoryId, startDate = null, values = {}, version = DEFAULT_PLANNING_VERSION, type = DEFAULT_PLANNING_TYPE) => mutate((draft) => {
        const safeType = planningType(type);
        const count = draft.lineItems.filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType && (item.planning_version ?? DEFAULT_PLANNING_VERSION) === version).length;
        const what = safeType === PLANNING_TYPES.production.key
          ? firstLabelId(draft.labels, 'what', PRODUCTION_WHAT_LABELS)
          : draft.labels.find((item) => item.column_type === 'what')?.id ?? '';
        const todo = safeType === PLANNING_TYPES.production.key
          ? firstLabelId(draft.labels, 'todo', ['None'])
          : draft.labels.find((item) => item.column_type === 'todo')?.id ?? '';
        const item = {
          id: id(),
          project_id: projectId,
          planning_type: safeType,
          planning_version: version,
          category_id: categoryId,
          who: [],
          asset: '',
          what,
          todo,
          time: '',
          notes: '',
          row_color: '',
          start_date: startDate,
          end_date: startDate,
          sort_order: count,
          ...values,
        };
        draft.lineItems.push(item);
        markDirty(projectId);
        if (useSupabase) {
          void (async () => {
            const category = categoryId ? draft.categories.find((entry) => entry.id === categoryId) : null;
            if (category) {
              await saveCategoryUpsert('category', category);
            }
            await saveLineItemUpsert('line item', item);
          })();
        }
        return item.id;
      }),
      duplicateLineItem: (itemId) => mutate((draft) => {
        const source = draft.lineItems.find((item) => item.id === itemId);
        if (!source) return;
        const sourceType = planningType(source.planning_type);
        const sourceVersion = source.planning_version ?? DEFAULT_PLANNING_VERSION;
        const siblings = draft.lineItems
          .filter((item) => item.project_id === source.project_id && planningType(item.planning_type) === sourceType && (item.planning_version ?? DEFAULT_PLANNING_VERSION) === sourceVersion)
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
        if (useSupabase) void saveLineItemUpsert('duplicated line item', duplicate);
        return duplicate.id;
      }),
      addClientReviews: (projectId, wennekerLabelId, clientLabelId, reviewTodoLabelId, offsetDays = 1, existingReviewTodoLabelIds = [reviewTodoLabelId], categoryId = null, version = DEFAULT_PLANNING_VERSION, type = DEFAULT_PLANNING_TYPE) => mutate((draft) => {
        if (!wennekerLabelId || !clientLabelId || !reviewTodoLabelId) return [];
        const reviewTodoIds = existingReviewTodoLabelIds.filter(Boolean);
        const safeType = planningType(type);

        const rows = draft.lineItems
          .filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType && (item.planning_version ?? DEFAULT_PLANNING_VERSION) === version && (!categoryId || item.category_id === categoryId))
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

        if (categoryId) {
          draft.lineItems = draft.lineItems
            .filter((item) => !(item.project_id === projectId && planningType(item.planning_type) === safeType && (item.planning_version ?? DEFAULT_PLANNING_VERSION) === version && item.category_id === categoryId))
            .concat(nextRows);
        } else {
          draft.lineItems = draft.lineItems
            .filter((item) => item.project_id !== projectId || planningType(item.planning_type) !== safeType || (item.planning_version ?? DEFAULT_PLANNING_VERSION) !== version)
            .concat(nextRows);
        }
        draft.lineItems
          .filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType && (item.planning_version ?? DEFAULT_PLANNING_VERSION) === version)
          .sort((a, b) => a.sort_order - b.sort_order)
          .forEach((item, index) => {
            item.sort_order = index;
          });
        markDirty(projectId);

        if (useSupabase) {
          duplicates.forEach((item) => {
            void saveLineItemUpsert('client review row', item);
          });
          draft.lineItems.filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType && (item.planning_version ?? DEFAULT_PLANNING_VERSION) === version).forEach((item) => {
            void saveSupabase('line item order', supabase.from('line_items').update({ sort_order: item.sort_order }).eq('id', item.id));
          });
        }

        return duplicates.map((item) => item.id);
      }),
      removeClientReviews: (projectId, wennekerLabelId, clientLabelId, reviewTodoLabelIds, categoryId = null, version = DEFAULT_PLANNING_VERSION, type = DEFAULT_PLANNING_TYPE) => mutate((draft) => {
        const todoIds = (Array.isArray(reviewTodoLabelIds) ? reviewTodoLabelIds : [reviewTodoLabelIds]).filter(Boolean);
        if (!wennekerLabelId || !clientLabelId || !todoIds.length) return [];
        const safeType = planningType(type);
        const rows = draft.lineItems
          .filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType && (item.planning_version ?? DEFAULT_PLANNING_VERSION) === version && (!categoryId || item.category_id === categoryId))
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
          .filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType && (item.planning_version ?? DEFAULT_PLANNING_VERSION) === version)
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
        if (!item) return;
        Object.assign(item, patch);
        markDirty(item?.project_id);
        if (useSupabase) {
          const debounceFields = new Set(['asset', 'time', 'notes']);
          const shouldDebounce = Object.keys(patch).length > 0 && Object.keys(patch).every((key) => debounceFields.has(key));
          if (shouldDebounce) queueLineItemUpdate(itemId, patch);
          else {
            flushLineItemUpdate(itemId);
            void saveLineItemUpdate('line item changes', itemId, patch);
          }
        }
      }),
      deleteLineItem: (itemId) => mutate((draft) => {
        const item = draft.lineItems.find((lineItem) => lineItem.id === itemId);
        draft.lineItems = draft.lineItems.filter((item) => item.id !== itemId);
        markDirty(item?.project_id);
        if (useSupabase) void saveSupabase('line item delete', supabase.from('line_items').delete().eq('id', itemId));
      }),
      reorderLineItems: (projectId, activeId, overId, version = DEFAULT_PLANNING_VERSION, type = DEFAULT_PLANNING_TYPE) => mutate((draft) => {
        const safeType = planningType(type);
        const rows = draft.lineItems.filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType && (item.planning_version ?? DEFAULT_PLANNING_VERSION) === version).sort((a, b) => a.sort_order - b.sort_order);
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
          void saveSupabase('line item order', supabase.rpc('reorder_line_items', {
            target_project_id: projectId,
            target_planning_type: safeType,
            target_planning_version: version,
            ordered_ids: rows.map((item) => item.id),
          }));
        }
      }),
      moveLineItemRelative: (projectId, activeId, targetId, placement, version = DEFAULT_PLANNING_VERSION, type = DEFAULT_PLANNING_TYPE) => mutate((draft) => {
        const safeType = planningType(type);
        const rows = draft.lineItems.filter((item) => item.project_id === projectId && planningType(item.planning_type) === safeType && (item.planning_version ?? DEFAULT_PLANNING_VERSION) === version).sort((a, b) => a.sort_order - b.sort_order);
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
          void saveSupabase('line item order', supabase.rpc('reorder_line_items', {
            target_project_id: projectId,
            target_planning_type: safeType,
            target_planning_version: version,
            ordered_ids: rows.map((item) => item.id),
          }));
        }
      }),
      addLabel: (projectId, columnType, value, color, options = {}) => {
        const trimmed = value.trim();
        const existing = data.labels.find((item) => item.project_id === projectId && item.column_type === columnType && normalizedName(item.value) === normalizedName(trimmed));
        if (existing) {
          const requestedPlanningType = options.planningType ?? 'both';
          if (existing.planning_type !== 'both' && existing.planning_type !== requestedPlanningType) {
            mutate((draft) => {
              const draftLabel = draft.labels.find((item) => item.id === existing.id);
              if (draftLabel) draftLabel.planning_type = 'both';
            });
            if (useSupabase) void saveSupabase('project label availability', supabase.from('labels').update({ planning_type: 'both' }).eq('id', existing.id));
            return { ...existing, planning_type: 'both' };
          }
          return existing;
        }
        const sortOrder = data.labels.filter((item) => item.project_id === projectId && item.column_type === columnType).length;
        const label = { id: id(), project_id: projectId, column_type: columnType, value, color, is_default: false, scope: 'project', sort_order: sortOrder, is_divider: options.isDivider ?? false, planning_type: options.planningType ?? 'both' };
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
        const label = { id: id(), project_id: null, column_type: columnType, value: trimmed, color, is_default: true, scope: 'global', sort_order: sortOrder, is_divider: options.isDivider ?? false, planning_type: options.planningType ?? 'both' };
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
        const inviteEmail = email.trim().toLowerCase();
        const invitation = {
          id: id(),
          email: inviteEmail,
          invited_by: user.id,
          token: crypto.randomUUID().replaceAll('-', ''),
          accepted: false,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };
        mutate((draft) => {
          draft.invitations = draft.invitations.filter((item) => item.email?.toLowerCase() !== inviteEmail);
          draft.invitations.unshift(invitation);
        });
        if (useSupabase) {
          try {
            await invokeAdminUserAction({ mode: 'invite', email: inviteEmail });
            await saveSupabase('invitation', supabase.from('invitations').insert(invitation), { throwOnError: true });
          } catch (error) {
            mutate((draft) => {
              draft.invitations = draft.invitations.filter((item) => item.id !== invitation.id);
            });
            throw error;
          }
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
        if (useSupabase) await invokeAdminUserAction({ mode: 'delete-user', targetUserId });
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
          draft.invitations = draft.invitations.filter((item) => item.email?.toLowerCase() !== targetProfile?.email?.toLowerCase());
        });
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
        if (patch.preferences) profile.preferences = patch.preferences;
        if (useSupabase) void saveSupabase('profile', supabase.from('profiles').update(cleanPatch).eq('id', user.id));
        if (useSupabase && patch.preferences) {
          void saveSupabase('user preferences', supabase.auth.updateUser({
            data: { preferences: patch.preferences },
          }));
        }
      }),
      addClient: (name, abbreviation = '') => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const existing = data.clients.find((item) => normalizedName(item.name) === normalizedName(trimmed));
        if (existing) return existing;
        const cleanAbbreviation = abbreviation.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
        const client = { id: id(), name: trimmed, abbreviation: cleanAbbreviation, created_by: user.id, created_at: new Date().toISOString() };
        mutate((draft) => {
          if (!draft.clients.some((item) => normalizedName(item.name) === normalizedName(trimmed))) draft.clients.push(client);
        });
        if (useSupabase) void saveSupabase('client', supabase.from('clients').upsert({ name: trimmed, abbreviation: cleanAbbreviation || null, created_by: user.id }, { onConflict: 'name', ignoreDuplicates: true }));
        return client;
      },
      updateClient: (clientId, patch) => mutate((draft) => {
        const client = draft.clients.find((item) => item.id === clientId || item.name === clientId);
        if (!client) return;
        const currentName = client.name;
        const nextPatch = { ...patch };
        if (Object.hasOwn(nextPatch, 'abbreviation')) nextPatch.abbreviation = nextPatch.abbreviation.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
        Object.assign(client, nextPatch);
        const dbPatch = { ...nextPatch };
        if (Object.hasOwn(dbPatch, 'abbreviation')) dbPatch.abbreviation = dbPatch.abbreviation || null;
        if (useSupabase) void saveSupabase('client', supabase.from('clients').update(dbPatch).eq('name', currentName));
      }),
      updateClientName: async (clientId, name) => {
        const trimmed = name.trim();
        if (!trimmed) throw new Error('Client name cannot be empty.');

        const client = data.clients.find((item) => item.id === clientId || item.name === clientId);
        if (!client) throw new Error('Client could not be found.');

        const duplicate = data.clients.find(
          (item) =>
            item !== client &&
            normalizedName(item.name) === normalizedName(trimmed),
        );
        if (duplicate) throw new Error('A client with this name already exists.');

        const previousName = client.name;
        if (previousName === trimmed) return client;

        if (useSupabase) {
          await saveSupabase(
            'client rename',
            supabase.rpc('rename_client', {
              current_client_name: previousName,
              next_client_name: trimmed,
            }),
            { throwOnError: true },
          );
        }

        mutate((draft) => {
          const target = draft.clients.find((item) => item.id === clientId || item.name === clientId);
          if (target) target.name = trimmed;
          draft.projects.forEach((project) => {
            if (project.client === previousName) project.client = trimmed;
          });
        });

        return { ...client, name: trimmed };
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
      updateProducer: async (producerId, name) => {
        const trimmed = name.trim();
        if (!trimmed) throw new Error('Producer name cannot be empty.');

        const producer = data.producers.find((item) => item.id === producerId || item.name === producerId);
        if (!producer) throw new Error('Producer could not be found.');

        const duplicate = data.producers.find(
          (item) =>
            item !== producer &&
            normalizedName(item.name) === normalizedName(trimmed),
        );
        if (duplicate) throw new Error('A producer with this name already exists.');

        const previousName = producer.name;
        if (previousName === trimmed) return producer;

        if (useSupabase) {
          await saveSupabase(
            'producer rename',
            supabase.rpc('rename_producer', {
              current_producer_name: previousName,
              next_producer_name: trimmed,
            }),
            { throwOnError: true },
          );
        }

        mutate((draft) => {
          const target = draft.producers.find((item) => item.id === producerId || item.name === producerId);
          if (target) target.name = trimmed;
          draft.projects.forEach((project) => {
            if (project.post_producer === previousName) project.post_producer = trimmed;
            if (project.producer === previousName) project.producer = trimmed;
          });
        });

        return { ...producer, name: trimmed };
      },
      deleteProducer: (producerId) => mutate((draft) => {
        const producer = draft.producers.find((item) => item.id === producerId || item.name === producerId);
        if (!producer) return;
        draft.producers = draft.producers.filter((item) => item.id !== producer.id && item.name !== producer.name);
        if (useSupabase) void saveSupabase('producer delete', supabase.from('producers').delete().eq('name', producer.name));
      }),
      upsertPresence: (projectId, scope = {}) => {
        const row = {
          id: id(),
          project_id: projectId,
          user_id: user.id,
          page_type: scope.pageType ?? 'timeline',
          planning_type: planningType(scope.planningType),
          planning_version: scope.planningVersion ?? DEFAULT_PLANNING_VERSION,
          last_seen_at: new Date().toISOString(),
        };
        mutate((draft) => {
          draft.presence = draft.presence.filter((item) => !(item.project_id === projectId && item.user_id === user.id));
          draft.presence.push(row);
        });
        if (useSupabase) void saveSupabase('presence', supabase.from('project_presence').upsert({
          project_id: projectId,
          user_id: user.id,
          page_type: row.page_type,
          planning_type: row.planning_type,
          planning_version: row.planning_version,
          last_seen_at: row.last_seen_at,
        }, { onConflict: 'project_id,user_id' }));
      },
      clearPresence: (projectId) => mutate((draft) => {
        draft.presence = draft.presence.filter((item) => !(item.project_id === projectId && item.user_id === user.id));
        if (useSupabase) void saveSupabase('presence clear', supabase.from('project_presence').delete().eq('project_id', projectId).eq('user_id', user.id));
      }),
      createShareLink: async (projectId, type = DEFAULT_PLANNING_TYPE, version = DEFAULT_PLANNING_VERSION) => {
        const safeType = planningType(type);
        const safeVersion = version || DEFAULT_PLANNING_VERSION;
        if (useSupabase) {
          const existing = await supabase
            .from('public_share_links')
            .select('token')
            .eq('project_id', projectId)
            .eq('page_type', 'client_planning')
            .eq('planning_type', safeType)
            .eq('planning_version', safeVersion)
            .is('revoked_at', null)
            .maybeSingle();
          if (existing.data?.token) {
            mutate((draft) => {
              if (!draft.shareLinks.some((share) => share.token === existing.data.token)) {
                draft.shareLinks.push({ token: existing.data.token, project_id: projectId, page_type: 'client_planning', planning_type: safeType, planning_version: safeVersion, revoked_at: null });
              }
            });
            return existing.data.token;
          }

          const token = shareToken();
          const inserted = await supabase
            .from('public_share_links')
            .insert({ project_id: projectId, token, page_type: 'client_planning', planning_type: safeType, planning_version: safeVersion })
            .select('token')
            .single();
          if (inserted.error) throw inserted.error;
          mutate((draft) => {
            draft.shareLinks.push({ token: inserted.data.token, project_id: projectId, page_type: 'client_planning', planning_type: safeType, planning_version: safeVersion, revoked_at: null });
          });
          return inserted.data.token;
        }

        const token = shareToken();
        const shares = readShares();
        const existingToken = Object.entries(shares).find(([, share]) => share.projectId === projectId && planningType(share.planningType) === safeType && (share.planningVersion ?? DEFAULT_PLANNING_VERSION) === safeVersion)?.[0];
        if (existingToken) {
          mutate((draft) => {
            if (!draft.shareLinks.some((share) => share.token === existingToken)) {
              draft.shareLinks.push({ token: existingToken, project_id: projectId, page_type: 'client_planning', planning_type: safeType, planning_version: safeVersion, revoked_at: null });
            }
          });
          return existingToken;
        }
        shares[token] = { projectId, planningType: safeType, planningVersion: safeVersion, createdAt: new Date().toISOString() };
        writeShares(shares);
        mutate((draft) => {
          draft.shareLinks.push({ token, project_id: projectId, page_type: 'client_planning', planning_type: safeType, planning_version: safeVersion, revoked_at: null });
        });
        return token;
      },
      revokeShareLink: async (projectId, type = DEFAULT_PLANNING_TYPE, version = DEFAULT_PLANNING_VERSION) => {
        const safeType = planningType(type);
        const safeVersion = version || DEFAULT_PLANNING_VERSION;
        if (useSupabase) {
          await saveSupabase(
            'client planning unpublish',
            supabase
              .from('public_share_links')
              .update({ revoked_at: new Date().toISOString() })
              .eq('project_id', projectId)
              .eq('page_type', 'client_planning')
              .eq('planning_type', safeType)
              .eq('planning_version', safeVersion)
              .is('revoked_at', null),
            { throwOnError: true },
          );
        } else {
          const shares = readShares();
          Object.entries(shares).forEach(([token, share]) => {
            if (share.projectId === projectId && planningType(share.planningType) === safeType && (share.planningVersion ?? DEFAULT_PLANNING_VERSION) === safeVersion) delete shares[token];
          });
          writeShares(shares);
        }
        mutate((draft) => {
          draft.shareLinks = draft.shareLinks.filter((share) => !(
            share.project_id === projectId
            && planningType(share.planning_type) === safeType
            && (share.planning_version ?? DEFAULT_PLANNING_VERSION) === safeVersion
            && share.page_type === 'client_planning'
          ));
        });
      },
    }),
    [data, flushLineItemUpdate, hasMoreProjects, invokeAdminUserAction, loadMoreProjects, loadProjectData, loading, markDirty, mutate, queueLineItemUpdate, saveAssetRows, saveCategoryInsert, saveCategoryUpsert, saveError, saveLineItemUpdate, saveLineItemUpsert, saveSupabase, useSupabase, user.id],
  );

  return <PlannerContext.Provider value={api}>{children}</PlannerContext.Provider>;
}

export function usePlanner() {
  const context = useContext(PlannerContext);
  if (!context) throw new Error('usePlanner must be used inside PlannerProvider');
  return context;
}
