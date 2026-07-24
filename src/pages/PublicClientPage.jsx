import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BarChart3, ChevronDown, ChevronRight, Eye, EyeOff, FileText, Search } from 'lucide-react';
import { ClientGanttChart, ClientPlanningTable, clientPlanningExportRows } from './ClientTableView.jsx';
import { hasSupabaseConfig, supabase } from '../lib/supabase.js';
import { downloadPlanningExcel } from '../lib/exportExcel.js';
import { readLocalObject, UNCATEGORIZED_NAME_STORAGE_KEY } from '../lib/localPreferences.js';
import LoadingScreen from '../components/LoadingScreen.jsx';
import { DEFAULT_PLANNING_TYPE, PLANNING_TYPES } from '../lib/defaults.js';
import rovalLogo from '../assets/roval-logo.png';

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
    share: { planning_type: planningType, planning_version: planningVersion, created_at: share.createdAt ?? share.created_at },
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
  const value = column ? String(row.values?.[column.id] ?? '').trim() : '';
  if (!value) return '';
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isFrameIoHost = hostname === 'f.io' || hostname === 'frame.io' || hostname.endsWith('.frame.io');
    return url.protocol === 'https:' && isFrameIoHost ? value : '';
  } catch {
    return '';
  }
}

function formatPublicDate(value) {
  if (!value) return '-';
  const parsed = String(value).includes('T') ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
}

function PublicAssetList({ assetLists = [], labels = [] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const activeList = assetLists[0];

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
  const allGroupRows = (group) => (groups.length ? rows.filter((row) => (row.group_id ?? groups[0]?.id ?? null) === group.id) : rows);
  const hasMeaningfulValue = (value) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    return Boolean(normalized && !['none', 'null', '-'].includes(normalized));
  };
  const cellGroups = activeList?.filename_options?.cell_groups ?? [];
  const groupedCellMeta = (row, columnKey, displayedRows) => {
    const cellGroup = cellGroups.find((item) => item.column_key === columnKey && item.row_ids?.includes(row.id));
    if (!cellGroup) return { render: true, rowSpan: 1, sourceRow: row };
    const visibleGroupRows = displayedRows.filter((item) => cellGroup.row_ids.includes(item.id));
    if (!visibleGroupRows.length || visibleGroupRows[0].id !== row.id) return { render: false, rowSpan: 0, sourceRow: row };
    const sourceRow = rows.find((item) => item.id === cellGroup.row_ids[0]) ?? row;
    return { render: true, rowSpan: visibleGroupRows.length, sourceRow };
  };
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
          const sourceRows = allGroupRows(group);
          const isFrameColumn = (column) => /frame\.?io/i.test(column.name ?? '') || /frame\.?io/i.test(column.key ?? '');
          const isClonesColumn = (column) => /(^|[_\s-])clones?($|[_\s-])/i.test([column.name, column.key, column.label_type].filter(Boolean).join(' '));
          const visibleColumns = publishedColumns.filter((column) => (
            !isFrameColumn(column)
            && !isClonesColumn(column)
            && sourceRows.some((row) => hasMeaningfulValue(assetValue(row.values?.[column.id], column)))
          ));
          const publishedFrameColumn = publishedColumns.find((column) => /frame\.?io/i.test(column.name ?? '') || /frame\.?io/i.test(column.key ?? ''))
            ?? columns.find((column) => /frame\.?io/i.test(column.name ?? '') || /frame\.?io/i.test(column.key ?? ''));
          const showFrameColumn = Boolean(publishedFrameColumn);
          const showNotesColumn = sourceRows.some((row) => hasMeaningfulValue(row.notes));
          const assetColSpan = 2 + visibleColumns.length + (showFrameColumn ? 1 : 0) + (showNotesColumn ? 1 : 0);
          const displayedRows = groupRows(group);
          return displayedRows.length ? (
            <table id={`public-asset-category-${group.id ?? 'asset-list'}`} key={group.id ?? 'asset-list'} className="public-asset-table public-asset-category-target">
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
                      <th>Status</th>
                      {visibleColumns.map((column) => <th key={column.id}>{column.name}</th>)}
                      {showFrameColumn && <th>Frame.io</th>}
                      {showNotesColumn && <th>Notes</th>}
                    </tr>
                  )}
                  {!collapsedGroups.has(group.id ?? 'asset-list') && displayedRows.map((row) => {
                    const numberMeta = groupedCellMeta(row, 'number', displayedRows);
                    return (
                    <tr key={row.id}>
                      {numberMeta.render && <td rowSpan={numberMeta.rowSpan} className={numberMeta.rowSpan > 1 ? 'public-asset-number public-asset-grouped-cell' : 'public-asset-number'}>{numberMeta.sourceRow.number}</td>}
                      <td>
                        {hasMeaningfulValue(row.asset_status)
                          ? <span className={`public-asset-status is-${row.asset_status.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{row.asset_status}</span>
                          : '-'}
                      </td>
                      {visibleColumns.map((column) => {
                        const cellMeta = groupedCellMeta(row, column.id, displayedRows);
                        if (!cellMeta.render) return null;
                        const value = assetValue(cellMeta.sourceRow.values?.[column.id], column);
                        const isPillValue = value && !['text', 'length'].includes(column.type);
                        return (
                          <td key={column.id} rowSpan={cellMeta.rowSpan} className={cellMeta.rowSpan > 1 ? 'public-asset-grouped-cell' : undefined}>
                            {value ? <span className={isPillValue ? 'public-asset-pill' : ''} style={isPillValue ? assetLabelStyle(value, column, labels) : undefined}>{value}</span> : '-'}
                          </td>
                        );
                      })}
                      {showFrameColumn && (() => {
                        const frameMeta = groupedCellMeta(row, publishedFrameColumn.id, displayedRows);
                        if (!frameMeta.render) return null;
                        const frameValue = frameIoValue(frameMeta.sourceRow, [publishedFrameColumn]);
                        return (
                        <td rowSpan={frameMeta.rowSpan} className={frameMeta.rowSpan > 1 ? 'public-asset-grouped-cell' : undefined}>
                          {frameValue
                            ? <a className="public-asset-frame-button is-active" href={frameValue} target="_blank" rel="noreferrer">View</a>
                            : <span className="public-asset-frame-button">View</span>}
                        </td>
                        );
                      })()}
                      {showNotesColumn && (() => {
                        const notesMeta = groupedCellMeta(row, 'notes', displayedRows);
                        if (!notesMeta.render) return null;
                        return (
                        <td rowSpan={notesMeta.rowSpan} className={`public-asset-notes${notesMeta.rowSpan > 1 ? ' public-asset-grouped-cell' : ''}`}>
                          {hasMeaningfulValue(notesMeta.sourceRow.notes) ? (
                            <span className="note-preview group relative inline-flex w-full min-w-0 items-center gap-2 text-left text-sm text-ink-300">
                              <FileText size={14} className="shrink-0 text-ink-500" />
                              <span>{notesMeta.sourceRow.notes}</span>
                              <span className="note-tooltip">{notesMeta.sourceRow.notes}</span>
                            </span>
                          ) : null}
                        </td>
                        );
                      })()}
                    </tr>
                    );
                  })}
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
  const planningVersion = payload?.share?.planning_version
    ?? payload?.lineItems?.find((item) => item.planning_version)?.planning_version
    ?? payload?.project?.preferred_planning_version
    ?? payload?.project?.planning_version
    ?? 'V1';
  const publishedDate = formatPublicDate(payload?.share?.created_at ?? payload?.published_at ?? payload?.project?.created_at);
  const lastEditedDate = formatPublicDate(payload?.project?.last_edited_at ?? payload?.project?.updated_at ?? payload?.project?.created_at);
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
                  <img className="public-roval-logo" src={rovalLogo} alt="Roval" />
                  <div className="public-project-heading">
                    <div className="public-project-title-row">
                      <h1>{payload.project.name}</h1>
                      {tab === 'planning' && <span className="public-version-label">{planningVersion}</span>}
                    </div>
                    <div className="public-publish-line">
                      <span>Client Portal Created: <strong>{publishedDate}</strong></span>
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
              <div className="public-client-footer-row">
                <span>{new Date().getFullYear()} · {payload.project.name}</span>
                <span>Published Client Portal: {publishedDate} / Updated at: {lastEditedDate}</span>
              </div>
              <p>This planning tool is tailor-made for Wenneker.Amsterdam to serve our clients in the best way. If you have any suggestions, please feel free to reach out to our producers with your ideas.</p>
              <span className="public-footer-brand"><img src={rovalLogo} alt="" />The production manager</span>
            </footer>
          </div>
        </div>
      </div>
    </main>
  );
}
