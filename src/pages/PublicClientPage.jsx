import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BarChart3, ChevronDown, ChevronRight, Eye, EyeOff, FileText, Flag, Search, Send, Users } from 'lucide-react';
import { ClientGanttChart, ClientPlanningTable, clientPlanningExportRows } from './ClientTableView.jsx';
import { hasSupabaseConfig, supabase } from '../lib/supabase.js';
import { downloadPlanningExcel } from '../lib/exportExcel.js';
import { readLocalObject, UNCATEGORIZED_NAME_STORAGE_KEY } from '../lib/localPreferences.js';
import Pill from '../components/Pill.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import { DEFAULT_PLANNING_TYPE, PLANNING_TYPES } from '../lib/defaults.js';

const SHARE_STORAGE_KEY = 'post-production-planner:public-shares:v1';
const PLANNER_STORAGE_KEY = 'post-production-planner:v1';

function safePlanningType(value) {
  return PLANNING_TYPES[value]?.key ?? DEFAULT_PLANNING_TYPE;
}

function tokenFromSlug(value) {
  return String(value ?? '').split('-').at(-1) ?? value;
}

function readLocalShare(token) {
  const shares = JSON.parse(localStorage.getItem(SHARE_STORAGE_KEY) ?? '{}');
  const share = shares[token] ?? null;
  if (!share?.projectId) return share;
  const planner = JSON.parse(localStorage.getItem(PLANNER_STORAGE_KEY) ?? '{}');
  const planningType = safePlanningType(share.planningType);
  const planningVersion = share.planningVersion ?? 'V1';
  return {
    project: planner.projects?.find((project) => project.id === share.projectId),
    share: { planning_type: planningType, planning_version: planningVersion },
    categories: planner.categories?.filter((category) => category.project_id === share.projectId && safePlanningType(category.planning_type) === planningType && (category.planning_version ?? 'V1') === planningVersion) ?? [],
    lineItems: planner.lineItems?.filter((item) => item.project_id === share.projectId && safePlanningType(item.planning_type) === planningType && (item.planning_version ?? 'V1') === planningVersion) ?? [],
    labels: planner.labels?.filter((label) => !label.project_id || label.project_id === share.projectId) ?? [],
    assetLists: planner.assetLists?.filter((list) => list.project_id === share.projectId) ?? [],
    clients: planner.clients ?? [],
  };
}

function assetColumns(list) {
  return [...(list?.columns ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function assetRows(list) {
  return [...(list?.rows ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function assetCategories(list) {
  return [...(list?.categories ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function assetValue(value, column) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (column.type === 'length') return `${text.replace(/s$/i, '')}s`;
  if (column.type === 'text') return text.replace(/\s+/g, '-');
  return text;
}

function fallbackAssetLabelColor(value = '') {
  if (value.trim().toLowerCase() === 'unique') return '#ffcf5c';
  const colors = ['#6d5dfc', '#28b8ff', '#10b981', '#f59e0b', '#f466ae', '#ef4444'];
  const index = [...value].reduce((total, char) => total + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

function readableTextColor(color = '') {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return '#101828';
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 160 ? '#101828' : '#ffffff';
}

function assetLabelStyle(value, column, labels = []) {
  const label = labels.find((item) => item.column_type === column.label_type && item.value?.trim().toLowerCase() === value.trim().toLowerCase());
  const color = label?.color ?? fallbackAssetLabelColor(value);
  return {
    backgroundColor: color,
    borderColor: color,
    color: readableTextColor(color),
  };
}

function frameIoValue(row, columns) {
  const column = columns.find((item) => /frame\.?io/i.test(item.name ?? '') || /frame\.?io/i.test(item.key ?? ''));
  return column ? String(row.values?.[column.id] ?? '').trim() : '';
}

function formatPublicDate(value) {
  if (!value) return '-';
  const parsed = String(value).includes('T') ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
}

function formatShortPublicDate(value) {
  const formatted = formatPublicDate(value);
  return formatted === '-' ? formatted : formatted.replace(/\s\d{4}$/, '');
}

function formatPublicWeekday(value) {
  if (!value) return '-';
  const parsed = String(value).includes('T') ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(parsed);
}

function publicPlanningStats(project, lineItems = [], labels = [], categories = []) {
  const labelsById = Object.fromEntries(labels.map((label) => [label.id, label]));
  const categoriesById = Object.fromEntries(categories.map((category) => [category.id, category]));
  const todayKey = new Date().toISOString().slice(0, 10);
  const dates = lineItems.flatMap((item) => [item.start_date, item.end_date]).filter(Boolean).sort();
  const runtimeWeeks = dates.length ? Math.max(1, Math.ceil((new Date(`${dates.at(-1)}T00:00:00`) - new Date(`${dates[0]}T00:00:00`)) / (1000 * 60 * 60 * 24 * 7))) : 0;
  const weeksLeft = dates.length ? Math.max(0, Math.ceil((new Date(`${dates.at(-1)}T00:00:00`) - new Date(`${todayKey}T00:00:00`)) / (1000 * 60 * 60 * 24 * 7))) : 0;
  const finalDeliveries = lineItems
    .filter((item) => (labelsById[item.what]?.value ?? '').toLowerCase().includes('final delivery'))
    .sort((a, b) => (a.end_date ?? '').localeCompare(b.end_date ?? ''))
    .map((item) => ({ category: categoriesById[item.category_id]?.name ?? 'Planning', date: formatShortPublicDate(item.end_date) }));
  const milestoneForWho = (whoValue) => {
    const item = lineItems
      .filter((candidate) => candidate.end_date && candidate.end_date >= todayKey && candidate.who?.some((id) => (labelsById[id]?.value ?? '').toLowerCase() === whoValue))
      .sort((a, b) => a.end_date.localeCompare(b.end_date))[0];
    return item ? {
      asset: item.asset ?? '-',
      date: formatShortPublicDate(item.end_date),
      day: formatPublicWeekday(item.end_date),
      whatLabel: labelsById[item.what] ?? null,
      todoLabel: labelsById[item.todo] ?? null,
      who: item.who.map((id) => labelsById[id]?.value).filter(Boolean).join(', ') || whoValue,
      whoLabels: item.who.map((id) => labelsById[id]).filter(Boolean),
    } : null;
  };
  return {
    producer: project.producer || '-',
    postProducer: project.post_producer || '-',
    runtimeWeeks: runtimeWeeks ? `${runtimeWeeks} ${runtimeWeeks === 1 ? 'week' : 'weeks'}` : '-',
    weeksLeft: dates.length ? `${weeksLeft} ${weeksLeft === 1 ? 'week' : 'weeks'} left` : '-',
    finalDeliveries,
    milestones: [
      { key: 'wenneker', title: 'Next Wenneker milestone', milestone: milestoneForWho('wenneker') },
      { key: 'client', title: 'Next Client milestone', milestone: milestoneForWho('client') },
    ],
  };
}

function PublicAssetList({ assetLists = [], labels = [] }) {
  const [activeId, setActiveId] = useState(assetLists[0]?.id ?? '');
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const activeList = assetLists.find((list) => list.id === activeId) ?? assetLists[0];
  useEffect(() => {
    if (!activeId && assetLists[0]?.id) setActiveId(assetLists[0].id);
  }, [activeId, assetLists]);
  useEffect(() => {
    setCollapsedGroups(new Set());
  }, [activeId]);

  if (!assetLists.length) return <div className="rounded-lg border border-black/10 bg-white px-4 py-10 text-center text-ink-500 dark:border-white/10 dark:bg-ink-900">No asset list published yet.</div>;

  const columns = assetColumns(activeList);
  const rows = assetRows(activeList);
  const groups = assetCategories(activeList);
  const columnsForGroup = (group) => {
    const rootId = group?.parent_id ?? group?.id;
    const rootGroup = groups.find((item) => item.id === rootId) ?? group;
    const settings = rootGroup?.column_settings ?? {};
    const orderIndex = new Map((rootGroup?.column_order ?? []).map((columnId, index) => [columnId, index]));
    const isStatic = group?.asset_kind === 'static';
    return columns
      .filter((column) => !column.category_id || !rootId || column.category_id === rootId)
      .map((column) => ({ ...column, ...(settings[column.id] ?? {}) }))
      .filter((column) => {
        if (column.publish_to_client === false) return false;
        if (!isStatic) return !['asset_static_type', 'asset_static_size'].includes(column.label_type);
        return column.label_type === 'asset_unique_ratio'
          || column.label_type === 'asset_static_type'
          || column.label_type === 'asset_static_size'
          || /^name$/i.test(column.name ?? '')
          || /frame\.?io/i.test(column.name ?? '')
          || column.is_custom;
      })
      .sort((a, b) => {
        const aIndex = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.MAX_SAFE_INTEGER;
        const bIndex = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.MAX_SAFE_INTEGER;
        return aIndex - bIndex || (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
  };
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const rowMatchesSearch = (row) => {
    if (!normalizedSearch) return true;
    const group = groups.find((item) => item.id === row.group_id);
    const haystack = [
      row.number,
      row.notes,
      ...columnsForGroup(group).map((column) => assetValue(row.values?.[column.id], column)),
    ].join(' ').toLowerCase();
    return haystack.includes(normalizedSearch);
  };
  const visibleRows = rows.filter(rowMatchesSearch);
  const groupRows = (group) => (groups.length ? visibleRows.filter((row) => (row.group_id ?? groups[0]?.id ?? null) === group.id) : visibleRows);
  const toggleGroup = (groupId) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <section className="public-asset-card">
      <div className="public-asset-header">
        <div className="public-asset-title">
          <span className="public-asset-title-icon"><BarChart3 size={18} /></span>
          <div>
            <h2>Asset List</h2>
            {assetLists.length > 1 && (
              <div className="public-asset-tabs">
                {assetLists.map((list) => (
                  <button key={list.id} type="button" onClick={() => setActiveId(list.id)} className={list.id === activeList.id ? 'is-active' : ''}>{list.name}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="public-asset-tools">
          <label className="public-asset-search">
            <Search size={18} />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search asset"
            />
          </label>
        </div>
      </div>
      <div className="public-asset-table-wrap">
        {(groups.length ? groups : [{ id: null, name: 'Asset list' }]).map((group) => {
          const publishedColumns = columnsForGroup(group);
          const visibleColumns = publishedColumns.filter((column) => !/frame\.?io/i.test(column.name ?? ''));
          const publishedFrameColumn = publishedColumns.find((column) => /frame\.?io/i.test(column.name ?? '') || /frame\.?io/i.test(column.key ?? ''));
          const showFrameColumn = Boolean(publishedFrameColumn);
          const assetColSpan = visibleColumns.length + 2 + (showFrameColumn ? 1 : 0);
          return groupRows(group).length ? (
            <table key={group.id ?? 'asset-list'} className="public-asset-table">
              <tbody>
                  <tr key={`${group.id}-heading`} className="public-asset-category-row">
                    <td colSpan={assetColSpan}>
                      <button type="button" onClick={() => toggleGroup(group.id ?? 'asset-list')}>
                        {collapsedGroups.has(group.id ?? 'asset-list') ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        {group.name}
                      </button>
                    </td>
                  </tr>
                  {!collapsedGroups.has(group.id ?? 'asset-list') && (
                    <tr className="public-asset-column-header">
                      <th>Number</th>
                      {visibleColumns.map((column) => <th key={column.id}>{column.name}</th>)}
                      <th>Notes</th>
                      {showFrameColumn && <th>Frame.io</th>}
                    </tr>
                  )}
                  {!collapsedGroups.has(group.id ?? 'asset-list') && groupRows(group).map((row) => (
                    <tr key={row.id}>
                      <td className="public-asset-number">{row.number}</td>
                      {visibleColumns.map((column) => {
                        const value = assetValue(row.values?.[column.id], column);
                        const isPillValue = value && !['text', 'length'].includes(column.type);
                        return (
                          <td key={column.id}>
                            {value ? <span className={isPillValue ? 'public-asset-pill' : ''} style={isPillValue ? assetLabelStyle(value, column, labels) : undefined}>{value}</span> : '-'}
                          </td>
                        );
                      })}
                      <td className="public-asset-notes">
                        {row.notes ? (
                          <span className="note-preview group relative inline-flex w-full min-w-0 items-center gap-2 text-left text-sm text-ink-300">
                            <FileText size={14} className="shrink-0 text-ink-500" />
                            <span>{row.notes}</span>
                            <span className="note-tooltip">{row.notes}</span>
                          </span>
                        ) : null}
                      </td>
                      {showFrameColumn && (
                        <td>
                          {frameIoValue(row, [publishedFrameColumn])
                            ? <a className="public-asset-frame-button is-active" href={frameIoValue(row, [publishedFrameColumn])} target="_blank" rel="noreferrer">View</a>
                            : <span className="public-asset-frame-button">View</span>}
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : null;
        })}
        {!visibleRows.length && <div className="public-asset-empty">No assets match your search.</div>}
      </div>
    </section>
  );
}

export default function PublicClientPage() {
  const { token: routeToken } = useParams();
  const token = tokenFromSlug(routeToken);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('planning');
  const [showEmptyDates, setShowEmptyDates] = useState(true);
  const [showWennekerBookings, setShowWennekerBookings] = useState(true);
  const [showClientBookings, setShowClientBookings] = useState(true);
  const [planningView, setPlanningView] = useState('calendar');
  const [hiddenCategoryKeys, setHiddenCategoryKeys] = useState([]);
  const [showInfo, setShowInfo] = useState(false);
  const uncategorizedNames = readLocalObject(UNCATEGORIZED_NAME_STORAGE_KEY, {});
  const uncategorizedName = payload?.project ? uncategorizedNames[payload.project.id] || 'Uncategorized' : 'Uncategorized';
  const assetLists = useMemo(() => payload?.assetLists ?? [], [payload?.assetLists]);
  const clients = useMemo(() => payload?.clients ?? [], [payload?.clients]);
  const categoryCount = useMemo(() => new Set((payload?.lineItems ?? []).map((item) => item.category_id).filter(Boolean)).size || (payload?.categories ?? []).length, [payload?.categories, payload?.lineItems]);
  const categoryFilterGroups = useMemo(() => {
    if (!payload?.project) return [];
    const categoriesById = Object.fromEntries((payload.categories ?? []).map((category) => [category.id, category]));
    const groups = new Map();
    (payload.lineItems ?? []).forEach((item) => {
      const key = item.category_id ?? 'uncategorized';
      const category = item.category_id ? categoriesById[item.category_id] : null;
      const name = category?.name ?? uncategorizedName;
      if (!groups.has(key)) groups.set(key, { key, name, sortOrder: category?.sort_order ?? 99999 });
    });
    return [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [payload?.categories, payload?.lineItems, payload?.project, uncategorizedName]);
  const stats = useMemo(() => (payload?.project ? publicPlanningStats(payload.project, payload.lineItems ?? [], payload.labels ?? [], payload.categories ?? []) : { producer: '-', postProducer: '-', runtimeWeeks: '-', weeksLeft: '-', finalDeliveries: [], milestones: [] }), [payload]);
  const planningVersion = payload?.share?.planning_version
    ?? payload?.lineItems?.find((item) => item.planning_version)?.planning_version
    ?? payload?.project?.preferred_planning_version
    ?? payload?.project?.planning_version
    ?? 'V1';
  const publishedDate = formatPublicDate(payload?.share?.created_at ?? payload?.published_at ?? payload?.project?.created_at);
  const whoFilterIds = useMemo(() => ({
    wenneker: payload?.labels?.find((label) => label.column_type === 'who' && label.value.toLowerCase() === 'wenneker')?.id,
    client: payload?.labels?.find((label) => label.column_type === 'who' && label.value.toLowerCase() === 'client')?.id,
  }), [payload?.labels]);
  const hiddenWhoIds = useMemo(() => [
    !showWennekerBookings ? whoFilterIds.wenneker : null,
    !showClientBookings ? whoFilterIds.client : null,
  ].filter(Boolean), [showClientBookings, showWennekerBookings, whoFilterIds.client, whoFilterIds.wenneker]);
  const visibleLineItems = useMemo(() => (payload?.lineItems ?? []).filter((item) => !hiddenCategoryKeys.includes(item.category_id ?? 'uncategorized')), [hiddenCategoryKeys, payload?.lineItems]);
  const calendarLineItems = useMemo(() => visibleLineItems, [visibleLineItems]);
  const ganttLineItems = useMemo(() => visibleLineItems.filter((item) => {
    if (!showWennekerBookings && whoFilterIds.wenneker && item.who?.includes(whoFilterIds.wenneker)) return false;
    if (!showClientBookings && whoFilterIds.client && item.who?.includes(whoFilterIds.client)) return false;
    return true;
  }), [showClientBookings, showWennekerBookings, visibleLineItems, whoFilterIds.client, whoFilterIds.wenneker]);
  const toggleHiddenCategory = (key) => {
    setHiddenCategoryKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  useEffect(() => {
    const storedTheme = localStorage.theme;
    const dark = storedTheme ? storedTheme !== 'light' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', Boolean(dark));
  }, []);

  useEffect(() => {
    document.body.classList.add('public-share-body');
    return () => document.body.classList.remove('public-share-body');
  }, []);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        if (hasSupabaseConfig) {
          const { data, error: rpcError } = await supabase.rpc('get_public_client_planning', { share_token: token });
          if (rpcError) throw rpcError;
          if (!data?.project) throw new Error('This share link is not available.');
          if (alive) setPayload(data);
        } else {
          const localPayload = readLocalShare(token);
          if (!localPayload?.project) throw new Error('This share link is not available in this browser.');
          if (alive) setPayload(localPayload);
        }
      } catch (loadError) {
        if (alive) setError(loadError.message);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [token]);

  if (loading) {
    return <LoadingScreen message="Loading client planning..." />;
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-ink-950 px-5 text-ink-100">
        <section className="max-w-md rounded-lg border border-white/10 bg-ink-900 p-6 text-center">
          <h1 className="text-xl font-semibold">Share link unavailable</h1>
          <p className="mt-3 text-sm text-ink-500">{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="public-client-page min-h-screen px-5 py-8 text-ink-950">
      <div className="mx-auto max-w-[1600px]">
        <div className="public-dashboard-frame">
          <div className="public-client-shell">
            <header className="public-client-header">
              <div className="public-header-inner">
                <div className="public-brand-block">
                  <div className="public-project-heading">
                    <div className="public-project-title-row">
                      <h1>{payload.project.name}</h1>
                      <span className="public-version-label">{planningVersion}</span>
                    </div>
                    <div className="public-publish-line">
                      <span>Planning Created: <strong>{publishedDate}</strong></span>
                    </div>
                  </div>
                  <div className="public-client-tabs">
                    <button type="button" onClick={() => setTab('planning')} className={`tab ${tab === 'planning' ? 'tab-active' : ''}`}>Planning</button>
                    <button type="button" onClick={() => setTab('assets')} className={`tab ${tab === 'assets' ? 'tab-active' : ''}`}>Asset List</button>
                  </div>
                </div>
                <div className="public-header-actions">
                  <button
                    type="button"
                    onClick={() => setShowInfo((next) => !next)}
                    className="public-info-button"
                  >
                    {showInfo ? 'Hide Info' : 'Show Info'}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadPlanningExcel(
                      payload.project,
                      clientPlanningExportRows(payload.project, payload.lineItems ?? [], payload.labels, payload.categories, showEmptyDates, uncategorizedName, 'full', payload.share?.planning_type),
                    )}
                    className="public-download-button"
                  >
                    Download Excel
                  </button>
                </div>
              </div>
            </header>

            {showInfo && (
              <section className="public-summary-grid" aria-label="Planning summary">
                <article>
                  <div className="public-card-heading">
                    <Users size={17} />
                    <span>Production</span>
                  </div>
                  <strong className="public-card-lines">
                    <em><b>Producer:</b><i>{stats.producer}</i></em>
                    <small>producer@example.com • +31 6 12345678</small>
                    <em><b>Post Producer:</b><i>{stats.postProducer}</i></em>
                    <small>postproducer@example.com • +31 6 87654321</small>
                  </strong>
                </article>
                <article>
                  <div className="public-card-heading">
                    <Send size={17} />
                    <span>Next milestones</span>
                  </div>
                  <strong className="public-milestone-card">
                    {stats.milestones?.some((item) => item.milestone) ? stats.milestones.map(({ key, milestone }) => (
                      milestone ? (
                        <span className="public-milestone-entry" key={key}>
                          <span className="public-milestone-title">
                            {milestone.whoLabels.length
                              ? milestone.whoLabels.map((label) => <Pill key={label.id} label={label} />)
                              : <span className="public-muted-label">{milestone.who}</span>}
                          </span>
                          <span className="public-milestone-layout">
                            <span className="public-milestone-date">
                              <em>{milestone.day}</em>
                              <b>{milestone.date}</b>
                            </span>
                            <span className="public-milestone-details">
                              <span className="public-milestone-asset">{milestone.asset}</span>
                              <span className="public-milestone-label-row">
                                {milestone.whatLabel ? <Pill label={milestone.whatLabel} /> : null}
                                {milestone.todoLabel ? <Pill label={milestone.todoLabel} subtle /> : null}
                              </span>
                            </span>
                          </span>
                        </span>
                      ) : null
                    )) : '-'}
                  </strong>
                </article>
                <article className="public-delivery-runtime-card">
                  <div className="public-card-heading">
                    <Flag size={17} />
                    <span>Final deliveries / Runtime</span>
                  </div>
                  <strong className="public-card-lines">
                    {stats.finalDeliveries.length ? stats.finalDeliveries.map((item, index) => (
                      <em className="public-delivery-line" key={`${item.category}-${item.date}-${index}`}>
                        <b>{item.category}</b>
                        <Pill label={{ id: `${item.category}-${item.date}`, value: item.date, color: '#46d39b' }} />
                      </em>
                    )) : <em>-</em>}
                    <span className="public-runtime-row">
                      <em><b>Running time</b><i>{stats.runtimeWeeks}</i></em>
                      <em><b>Weeks left</b><i>{stats.weeksLeft}</i></em>
                    </span>
                  </strong>
                </article>
              </section>
            )}

            {tab === 'planning' ? (
              <>
                <section className="public-client-controls">
                  <div className="public-filter-left">
                    <span className="public-controls-label">Filters</span>
                    <button type="button" onClick={() => setShowWennekerBookings((next) => !next)} className={`client-filter-pill ${showWennekerBookings ? 'is-active' : ''}`}>
                      {showWennekerBookings ? <Eye size={14} /> : <EyeOff size={14} />} Wenneker
                    </button>
                    <button type="button" onClick={() => setShowClientBookings((next) => !next)} className={`client-filter-pill ${showClientBookings ? 'is-active' : ''}`}>
                      {showClientBookings ? <Eye size={14} /> : <EyeOff size={14} />} Client
                    </button>
                    {planningView === 'calendar' && (
                      <button type="button" onClick={() => setShowEmptyDates((next) => !next)} className={`client-filter-pill ${showEmptyDates ? 'is-active' : ''}`}>
                        {showEmptyDates ? <Eye size={14} /> : <EyeOff size={14} />} Empty dates
                      </button>
                    )}
                    {categoryCount > 1 && (
                      <>
                        <span className="public-controls-label public-controls-label-secondary">Categories</span>
                        {categoryFilterGroups.map((group) => (
                          <button key={group.key} type="button" onClick={() => toggleHiddenCategory(group.key)} className={`client-filter-pill ${!hiddenCategoryKeys.includes(group.key) ? 'is-active' : ''}`}>
                            {!hiddenCategoryKeys.includes(group.key) ? <Eye size={14} /> : <EyeOff size={14} />} {group.name}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                  <label className="public-view-select">
                    <span>View</span>
                    <select value={planningView} onChange={(event) => setPlanningView(event.target.value)}>
                      <option value="calendar">Calendar view</option>
                      <option value="gantt">Gantt chart view</option>
                    </select>
                  </label>
                </section>
                {planningView === 'calendar' ? (
                  <ClientPlanningTable
                    project={payload.project}
                    lineItems={calendarLineItems}
                    labels={payload.labels}
                    categories={payload.categories}
                    showEmptyDates={showEmptyDates}
                    uncategorizedName={uncategorizedName}
                    forceHideCategoryColumn
                    dateWindow="full"
                    hiddenWhoIds={hiddenWhoIds}
                    publicCardLayout
                    columnPrefs={{ order: ['category', 'who', 'asset', 'what', 'todo', 'time', 'notes', 'calendar'], widths: { calendar: 132, who: 96, what: 126, todo: 133, notes: 180 }, visible: { calendar: true, category: false, notes: false, rowColor: false, edit: false } }}
                    showWeekColumn={false}
                    planningType={payload.share?.planning_type}
                  />
                ) : (
                  <ClientGanttChart
                    project={payload.project}
                    lineItems={ganttLineItems}
                    labels={payload.labels}
                    categories={payload.categories}
                    uncategorizedName={uncategorizedName}
                    categoryMode={categoryCount > 1 ? 'sections' : 'column'}
                    dateWindow="full"
                    planningType={payload.share?.planning_type}
                  />
                )}
              </>
            ) : (
              <PublicAssetList project={payload.project} assetLists={assetLists} clients={clients} labels={payload.labels ?? []} />
            )}
            <footer className="public-client-footer">
              <span>{new Date().getFullYear()} · {payload.project.name}</span>
              <span>Published planning</span>
            </footer>
          </div>
        </div>
      </div>
    </main>
  );
}
