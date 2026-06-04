import { Fragment, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarClock, Download, Eye, EyeOff, FolderKanban, LayoutDashboard, ListChecks, MessageCircle, Users } from 'lucide-react';
import { ClientPlanningTable, clientPlanningExportRows } from './ClientTableView.jsx';
import { hasSupabaseConfig, supabase } from '../lib/supabase.js';
import { downloadPlanningExcel } from '../lib/exportExcel.js';
import { readLocalObject, UNCATEGORIZED_NAME_STORAGE_KEY } from '../lib/localPreferences.js';
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

function publicPlanningStats(project, lineItems = [], labels = [], categories = [], showEmptyDates, uncategorizedName) {
  const labelsById = Object.fromEntries(labels.map((label) => [label.id, label]));
  const todayKey = new Date().toISOString().slice(0, 10);
  const rows = clientPlanningExportRows(project, lineItems, labels, categories, showEmptyDates, uncategorizedName, 'full');
  const assets = new Set(lineItems.map((item) => item.asset?.trim()).filter(Boolean));
  const upcoming = lineItems.filter((item) => item.end_date && item.end_date >= todayKey).length;
  const emptyDates = rows.filter((row) => !row.Asset && !row.What && !row.Todo).length;
  const feedback = lineItems.filter((item) => {
    const todo = labelsById[item.todo]?.value?.toLowerCase() ?? '';
    const who = item.who?.map((id) => labelsById[id]?.value?.toLowerCase()).join(' ') ?? '';
    return todo.includes('feedback') || who.includes('client');
  }).length;
  return { assets: assets.size, upcoming, emptyDates, feedback };
}

function PublicAssetList({ project, assetLists = [], clients = [] }) {
  const [activeId, setActiveId] = useState(assetLists[0]?.id ?? '');
  const activeList = assetLists.find((list) => list.id === activeId) ?? assetLists[0];
  useEffect(() => {
    if (!activeId && assetLists[0]?.id) setActiveId(assetLists[0].id);
  }, [activeId, assetLists]);

  if (!assetLists.length) return <div className="rounded-lg border border-black/10 bg-white px-4 py-10 text-center text-ink-500 dark:border-white/10 dark:bg-ink-900">No asset list published yet.</div>;

  const columns = assetColumns(activeList);
  const rows = assetRows(activeList);
  const groups = assetCategories(activeList);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {assetLists.map((list) => (
          <button key={list.id} type="button" onClick={() => setActiveId(list.id)} className={`tab ${list.id === activeList.id ? 'tab-active' : ''}`}>{list.name}</button>
        ))}
      </div>
      <div className="overflow-auto rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-ink-900">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-ink-500 dark:bg-ink-850">
            <tr>
              <th className="px-3 py-3">Number</th>
              {columns.map((column) => <th key={column.id} className="px-3 py-3">{column.name}</th>)}
              <th className="px-3 py-3">Filename</th>
              <th className="px-3 py-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {(groups.length ? groups : [{ id: null, name: 'Asset list' }]).map((group) => (
              <Fragment key={group.id ?? 'asset-list'}>
                <tr key={`${group.id}-heading`} className="bg-accent-500/10">
                  <td colSpan={columns.length + 3} className="px-3 py-2 text-xs font-bold uppercase text-accent-300">{group.name}</td>
                </tr>
                {(groups.length ? rows.filter((row) => (row.group_id ?? groups[0]?.id ?? null) === group.id) : rows).map((row) => (
                  <tr key={row.id} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-3 py-2 font-mono">{row.number}</td>
                    {columns.map((column) => <td key={column.id} className="px-3 py-2">{assetValue(row.values?.[column.id], column) || '-'}</td>)}
                    <td className="px-3 py-2 font-mono text-xs">{assetFilename(project, activeList, row, clients)}</td>
                    <td className="px-3 py-2">{row.notes || '-'}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
  const uncategorizedNames = readLocalObject(UNCATEGORIZED_NAME_STORAGE_KEY, {});
  const uncategorizedName = payload?.project ? uncategorizedNames[payload.project.id] || 'Uncategorized' : 'Uncategorized';
  const assetLists = useMemo(() => payload?.assetLists ?? [], [payload?.assetLists]);
  const clients = useMemo(() => payload?.clients ?? [], [payload?.clients]);
  const categoryCount = useMemo(() => new Set((payload?.lineItems ?? []).map((item) => item.category_id).filter(Boolean)).size || (payload?.categories ?? []).length, [payload?.categories, payload?.lineItems]);
  const stats = useMemo(() => (payload?.project ? publicPlanningStats(payload.project, payload.lineItems ?? [], payload.labels ?? [], payload.categories ?? [], showEmptyDates, uncategorizedName) : { assets: 0, upcoming: 0, emptyDates: 0, feedback: 0 }), [payload, showEmptyDates, uncategorizedName]);
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
          <aside className="public-sidebar">
            <img src={wennekerLogo} alt="Wenneker" className="public-sidebar-logo" />
            <nav className="public-sidebar-nav" aria-label="Shared planning navigation">
              <span className="is-active"><LayoutDashboard size={18} /></span>
              <span><CalendarClock size={18} /></span>
              <span><Users size={18} /></span>
              <span><ListChecks size={18} /></span>
            </nav>
          </aside>

          <div className="public-client-shell">
            <header className="public-client-header">
              <div className="flex min-w-0 items-center gap-4">
                <div className="public-header-mark">
                  <FolderKanban size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">Shared Planning</p>
                  <h1 className="mt-1 truncate text-3xl font-semibold text-white">{payload.project.name}</h1>
                  <p className="mt-1 text-sm text-white/58">{payload.project.client || 'Client planning'}</p>
                </div>
              </div>
              <div className="public-client-meta">
                <span><strong>Post Producer</strong>{payload.project.post_producer || '-'}</span>
                <span><strong>Producer</strong>{payload.project.producer || '-'}</span>
              </div>
              <button
                type="button"
                onClick={() => downloadPlanningExcel(
                  payload.project,
                  clientPlanningExportRows(payload.project, payload.lineItems ?? [], payload.labels, payload.categories, showEmptyDates, uncategorizedName, 'full'),
                )}
                className="public-download-button"
              >
                <Download size={17} /> Download Excel
              </button>
            </header>

            <section className="public-summary-grid" aria-label="Planning summary">
              <article><FolderKanban size={17} /><span>Total assets</span><strong>{stats.assets}</strong></article>
              <article><CalendarClock size={17} /><span>Upcoming deadlines</span><strong>{stats.upcoming}</strong></article>
              <article><ListChecks size={17} /><span>Empty dates</span><strong>{stats.emptyDates}</strong></article>
              <article><MessageCircle size={17} /><span>Client feedback moments</span><strong>{stats.feedback}</strong></article>
            </section>

            <div className="public-client-tabs">
              <button type="button" onClick={() => setTab('planning')} className={`tab ${tab === 'planning' ? 'tab-active' : ''}`}>Planning</button>
              <button type="button" onClick={() => setTab('assets')} className={`tab ${tab === 'assets' ? 'tab-active' : ''}`}>Asset List</button>
            </div>

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
                  columnPrefs={{ order: ['category', 'who', 'asset', 'what', 'todo', 'time', 'notes'], widths: {}, visible: { rowColor: false, edit: false } }}
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
