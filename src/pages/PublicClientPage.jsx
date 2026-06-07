import { Fragment, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BarChart3, ChevronDown, ChevronRight, Eye, EyeOff, FileText, Flag, Search, Send, Timer, Users } from 'lucide-react';
import { ClientPlanningTable, clientPlanningExportRows } from './ClientTableView.jsx';
import { hasSupabaseConfig, supabase } from '../lib/supabase.js';
import { downloadPlanningExcel } from '../lib/exportExcel.js';
import { readLocalObject, UNCATEGORIZED_NAME_STORAGE_KEY } from '../lib/localPreferences.js';
import Pill from '../components/Pill.jsx';
import wennekerLogo from '../assets/wenneker-logo.png';

const SHARE_STORAGE_KEY = 'post-production-planner:public-shares:v1';
const PLANNER_STORAGE_KEY = 'post-production-planner:v1';

function tokenFromSlug(value) {
  return String(value ?? '').split('-').at(-1) ?? value;
}

function readLocalShare(token) {
  const shares = JSON.parse(localStorage.getItem(SHARE_STORAGE_KEY) ?? '{}');
  const share = shares[token] ?? null;
  if (!share?.projectId) return share;
  const planner = JSON.parse(localStorage.getItem(PLANNER_STORAGE_KEY) ?? '{}');
  return {
    project: planner.projects?.find((project) => project.id === share.projectId),
    categories: planner.categories?.filter((category) => category.project_id === share.projectId) ?? [],
    lineItems: planner.lineItems?.filter((item) => item.project_id === share.projectId) ?? [],
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

function projectClientCode(project, clients = []) {
  const client = clients.find((item) => item.name?.trim().toLowerCase() === project.client?.trim().toLowerCase());
  const abbreviation = client?.abbreviation?.trim().toUpperCase();
  return abbreviation?.length === 2 ? abbreviation : project.client;
}

function assetFilename(project, list, row, clients = []) {
  const columns = assetColumns(list);
  const filenameColumns = columns.filter((column) => column.label_type !== 'asset_unique_ratio' && !/^unique\b/i.test(column.name ?? ''));
  const parts = [project.project_number, projectClientCode(project, clients), project.name, row.number, ...filenameColumns.map((column) => assetValue(row.values?.[column.id], column))]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  return parts.join(list.global_separator ?? '_');
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
  const clientMilestone = lineItems
    .filter((item) => item.end_date && item.end_date >= todayKey && item.who?.some((id) => (labelsById[id]?.value ?? '').toLowerCase() === 'client'))
    .sort((a, b) => a.end_date.localeCompare(b.end_date))[0];
  const clientMilestoneWhat = clientMilestone ? {
    asset: clientMilestone.asset ?? '-',
    date: formatShortPublicDate(clientMilestone.end_date),
    day: formatPublicWeekday(clientMilestone.end_date),
    what: labelsById[clientMilestone.what]?.value ?? '-',
    whatLabel: labelsById[clientMilestone.what] ?? null,
    todoLabel: labelsById[clientMilestone.todo] ?? null,
    who: clientMilestone.who.map((id) => labelsById[id]?.value).filter(Boolean).join(', ') || 'Client',
    whoLabels: clientMilestone.who.map((id) => labelsById[id]).filter(Boolean),
  } : null;
  return {
    producer: project.producer || '-',
    postProducer: project.post_producer || '-',
    runtimeWeeks: runtimeWeeks ? `${runtimeWeeks} ${runtimeWeeks === 1 ? 'week' : 'weeks'}` : '-',
    weeksLeft: dates.length ? `${weeksLeft} ${weeksLeft === 1 ? 'week' : 'weeks'} left` : '-',
    finalDeliveries,
    clientMilestone: clientMilestoneWhat,
  };
}

function publicPlanningVersion(project, lineItems = []) {
  return project?.preferred_planning_version
    ?? project?.planning_version
    ?? lineItems.find((item) => item.planning_version)?.planning_version
    ?? 'V1';
}

function PublicAssetList({ project, assetLists = [], clients = [] }) {
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
  const visibleColumns = columns.filter((column) => !/frame\.?io/i.test(column.name ?? ''));
  const rows = assetRows(activeList);
  const groups = assetCategories(activeList);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const rowMatchesSearch = (row) => {
    if (!normalizedSearch) return true;
    const haystack = [
      row.number,
      row.notes,
      assetFilename(project, activeList, row, clients),
      ...columns.map((column) => assetValue(row.values?.[column.id], column)),
    ].join(' ').toLowerCase();
    return haystack.includes(normalizedSearch);
  };
  const visibleRows = rows.filter(rowMatchesSearch);
  const groupRows = (group) => (groups.length ? visibleRows.filter((row) => (row.group_id ?? groups[0]?.id ?? null) === group.id) : visibleRows);
  const assetColSpan = visibleColumns.length + 3;
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
        <table className="public-asset-table">
          <thead>
            <tr>
              <th>Number</th>
              {visibleColumns.map((column) => <th key={column.id}>{column.name}</th>)}
              <th>Notes</th>
              <th>Frame.io</th>
            </tr>
          </thead>
          <tbody>
            {(groups.length ? groups : [{ id: null, name: 'Asset list' }]).map((group) => (
              groupRows(group).length ? (
                <Fragment key={group.id ?? 'asset-list'}>
                  <tr key={`${group.id}-heading`} className="public-asset-category-row">
                    <td colSpan={assetColSpan}>
                      <button type="button" onClick={() => toggleGroup(group.id ?? 'asset-list')}>
                        {collapsedGroups.has(group.id ?? 'asset-list') ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        {group.name}
                      </button>
                    </td>
                  </tr>
                  {!collapsedGroups.has(group.id ?? 'asset-list') && groupRows(group).map((row) => (
                    <tr key={row.id}>
                      <td className="public-asset-number">{row.number}</td>
                      {visibleColumns.map((column) => {
                        const value = assetValue(row.values?.[column.id], column);
                        const isPillValue = value && !['text', 'length'].includes(column.type);
                        return (
                          <td key={column.id}>
                            {value ? <span className={isPillValue ? 'public-asset-pill' : ''}>{value}</span> : '-'}
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
                      <td>
                        {frameIoValue(row, columns)
                          ? <a className="public-asset-frame-button is-active" href={frameIoValue(row, columns)} target="_blank" rel="noreferrer">View</a>
                          : <span className="public-asset-frame-button">View</span>}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ) : null
            ))}
            {!visibleRows.length && (
              <tr>
                <td colSpan={assetColSpan} className="public-asset-empty">No assets match your search.</td>
              </tr>
            )}
          </tbody>
        </table>
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
  const [showCategories, setShowCategories] = useState(true);
  const [showInfo, setShowInfo] = useState(true);
  const uncategorizedNames = readLocalObject(UNCATEGORIZED_NAME_STORAGE_KEY, {});
  const uncategorizedName = payload?.project ? uncategorizedNames[payload.project.id] || 'Uncategorized' : 'Uncategorized';
  const assetLists = useMemo(() => payload?.assetLists ?? [], [payload?.assetLists]);
  const clients = useMemo(() => payload?.clients ?? [], [payload?.clients]);
  const categoryCount = useMemo(() => new Set((payload?.lineItems ?? []).map((item) => item.category_id).filter(Boolean)).size || (payload?.categories ?? []).length, [payload?.categories, payload?.lineItems]);
  const stats = useMemo(() => (payload?.project ? publicPlanningStats(payload.project, payload.lineItems ?? [], payload.labels ?? [], payload.categories ?? []) : { producer: '-', postProducer: '-', runtimeWeeks: '-', weeksLeft: '-', finalDeliveries: [], clientMilestone: null }), [payload]);
  const planningVersion = useMemo(() => publicPlanningVersion(payload?.project, payload?.lineItems ?? []), [payload?.lineItems, payload?.project]);
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
    return <div className="grid min-h-screen place-items-center bg-ink-950 text-ink-100">Loading client planning...</div>;
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
                  <span className="public-header-logo"><img src={wennekerLogo} alt="Wenneker" /></span>
                  <div className="public-project-heading">
                    <div className="public-project-title-row">
                      <h1>{payload.project.name}</h1>
                      <span className="public-version-label">{planningVersion}</span>
                    </div>
                    <p>{payload.project.client || 'Client'}</p>
                    <div className="public-publish-line">
                      <span>Planning Created: <strong>{publishedDate}</strong></span>
                      <span>Planning Edited: <strong>{lastEditedDate}</strong></span>
                    </div>
                  </div>
                </div>
                <div className="public-header-actions">
                  <div className="public-client-tabs">
                    <button type="button" onClick={() => setTab('planning')} className={`tab ${tab === 'planning' ? 'tab-active' : ''}`}>Planning</button>
                    <button type="button" onClick={() => setTab('assets')} className={`tab ${tab === 'assets' ? 'tab-active' : ''}`}>Asset List</button>
                  </div>
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
                      clientPlanningExportRows(payload.project, payload.lineItems ?? [], payload.labels, payload.categories, showEmptyDates, uncategorizedName, 'full'),
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
                  <Users size={17} />
                  <span>Production</span>
                  <strong className="public-card-lines">
                    <em><b>Producer:</b><i>{stats.producer}</i></em>
                    <small>producer@example.com • +31 6 12345678</small>
                    <em><b>Post Producer:</b><i>{stats.postProducer}</i></em>
                    <small>postproducer@example.com • +31 6 87654321</small>
                  </strong>
                </article>
                <article>
                  <Send size={17} />
                  <span>Next milestone</span>
                  <strong className="public-milestone-card">
                    {stats.clientMilestone ? (
                      <span className="public-milestone-layout">
                        <span className="public-milestone-date">
                          <em>{stats.clientMilestone.day}</em>
                          <b>{stats.clientMilestone.date}</b>
                        </span>
                        <span className="public-milestone-details">
                          <span className="public-milestone-asset">{stats.clientMilestone.asset}</span>
                          <span className="public-milestone-label-row">
                            <span className="public-milestone-labels">
                              {stats.clientMilestone.whoLabels.length
                                ? stats.clientMilestone.whoLabels.map((label) => <Pill key={label.id} label={label} />)
                                : <span className="public-muted-label">{stats.clientMilestone.who}</span>}
                            </span>
                            {stats.clientMilestone.todoLabel ? <Pill label={stats.clientMilestone.todoLabel} subtle /> : <span className="public-muted-label">-</span>}
                          </span>
                        </span>
                      </span>
                    ) : '-'}
                  </strong>
                </article>
                <article className="public-delivery-runtime-card">
                  <Flag size={17} />
                  <span>Deliveries / Runtime</span>
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
                  <span className="public-controls-label">Filters</span>
                  <button type="button" onClick={() => setShowWennekerBookings((next) => !next)} className={`client-filter-pill ${showWennekerBookings ? 'is-active' : ''}`}>
                    {showWennekerBookings ? <Eye size={14} /> : <EyeOff size={14} />} Wenneker
                  </button>
                  <button type="button" onClick={() => setShowClientBookings((next) => !next)} className={`client-filter-pill ${showClientBookings ? 'is-active' : ''}`}>
                    {showClientBookings ? <Eye size={14} /> : <EyeOff size={14} />} Client
                  </button>
                  <button type="button" onClick={() => setShowEmptyDates((next) => !next)} className={`client-filter-pill ${showEmptyDates ? 'is-active' : ''}`}>
                    {showEmptyDates ? <Eye size={14} /> : <EyeOff size={14} />} Empty dates
                  </button>
                  {categoryCount > 2 && (
                    <button type="button" onClick={() => setShowCategories((next) => !next)} className={`client-filter-pill ${showCategories ? 'is-active' : ''}`}>
                      {showCategories ? <Eye size={14} /> : <EyeOff size={14} />} Categories
                    </button>
                  )}
                </section>
                <ClientPlanningTable
                  project={payload.project}
                  lineItems={payload.lineItems ?? []}
                  labels={payload.labels}
                  categories={payload.categories}
                  showEmptyDates={showEmptyDates}
                  uncategorizedName={uncategorizedName}
                  forceHideCategoryColumn={!showCategories}
                  dateWindow="full"
                  hiddenWhoIds={hiddenWhoIds}
                  columnPrefs={{ order: ['category', 'who', 'asset', 'what', 'todo', 'time', 'notes'], widths: { what: 126, todo: 133, notes: 180 }, visible: { category: false, rowColor: false, edit: false } }}
                  showWeekColumn={false}
                />
              </>
            ) : (
              <PublicAssetList project={payload.project} assetLists={assetLists} clients={clients} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
