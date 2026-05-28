import { Fragment, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Eye, EyeOff } from 'lucide-react';
import { ClientPlanningTable, clientPlanningExportRows } from './ClientTableView.jsx';
import { hasSupabaseConfig, supabase } from '../lib/supabase.js';
import { downloadPlanningExcel } from '../lib/exportExcel.js';
import { readLocalObject, UNCATEGORIZED_NAME_STORAGE_KEY } from '../lib/localPreferences.js';

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

function assetFilename(project, list, row) {
  const columns = assetColumns(list);
  const parts = [project.project_number, project.client, project.name, row.number, ...columns.map((column) => assetValue(row.values?.[column.id], column))]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  return parts.join(list.global_separator ?? '_');
}

function PublicAssetList({ project, assetLists = [] }) {
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
                    <td className="px-3 py-2 font-mono text-xs">{assetFilename(project, activeList, row)}</td>
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
  const [labelsAsText, setLabelsAsText] = useState(false);
  const uncategorizedNames = readLocalObject(UNCATEGORIZED_NAME_STORAGE_KEY, {});
  const uncategorizedName = payload?.project ? uncategorizedNames[payload.project.id] || 'Uncategorized' : 'Uncategorized';
  const assetLists = useMemo(() => payload?.assetLists ?? [], [payload?.assetLists]);
  const whoFilterIds = useMemo(() => ({
    wenneker: payload?.labels?.find((label) => label.column_type === 'who' && label.value.toLowerCase() === 'wenneker')?.id,
    client: payload?.labels?.find((label) => label.column_type === 'who' && label.value.toLowerCase() === 'client')?.id,
  }), [payload?.labels]);
  const filteredLineItems = useMemo(() => (payload?.lineItems ?? []).filter((item) => {
    if (!showWennekerBookings && whoFilterIds.wenneker && item.who?.includes(whoFilterIds.wenneker)) return false;
    if (!showClientBookings && whoFilterIds.client && item.who?.includes(whoFilterIds.client)) return false;
    return true;
  }), [payload?.lineItems, showClientBookings, showWennekerBookings, whoFilterIds]);

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
    <main className="min-h-screen bg-zinc-50 px-5 py-8 text-ink-950 dark:bg-ink-950 dark:text-ink-100">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-accent-400">Shared Planning</p>
            <h1 className="mt-3 text-3xl font-semibold">{payload.project.name}</h1>
            <p className="mt-2 text-sm text-ink-500">{payload.project.client || 'Client planning'}</p>
          </div>
          <button
            type="button"
            onClick={() => downloadPlanningExcel(
              payload.project,
              clientPlanningExportRows(payload.project, filteredLineItems, payload.labels, payload.categories, showEmptyDates, uncategorizedName),
            )}
            className="primary-button"
          >
            <Download size={17} /> Download Excel
          </button>
        </div>
        <div className="mb-5 flex gap-2">
          <button type="button" onClick={() => setTab('planning')} className={`tab ${tab === 'planning' ? 'tab-active' : ''}`}>Planning</button>
          <button type="button" onClick={() => setTab('assets')} className={`tab ${tab === 'assets' ? 'tab-active' : ''}`}>Asset List</button>
        </div>
        {tab === 'planning' ? (
          <>
            <div className="client-filter-row mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-900">
              <span className="mr-1 text-xs font-bold uppercase tracking-[0.16em] text-ink-500">Filter</span>
              <button type="button" onClick={() => setShowWennekerBookings((next) => !next)} className={`client-filter-pill ${showWennekerBookings ? 'is-active' : ''}`}>
                {showWennekerBookings ? <Eye size={14} /> : <EyeOff size={14} />} Wenneker
              </button>
              <button type="button" onClick={() => setShowClientBookings((next) => !next)} className={`client-filter-pill ${showClientBookings ? 'is-active' : ''}`}>
                {showClientBookings ? <Eye size={14} /> : <EyeOff size={14} />} Client
              </button>
              <button type="button" onClick={() => setShowEmptyDates((next) => !next)} className={`client-filter-pill ${showEmptyDates ? 'is-active' : ''}`}>
                {showEmptyDates ? <Eye size={14} /> : <EyeOff size={14} />} Empty dates
              </button>
              <button type="button" onClick={() => setLabelsAsText((next) => !next)} className={`client-filter-pill ${labelsAsText ? 'is-active' : ''}`}>
                {labelsAsText ? <Eye size={14} /> : <EyeOff size={14} />} Text labels
              </button>
            </div>
            <ClientPlanningTable
              project={payload.project}
              lineItems={filteredLineItems}
              labels={payload.labels}
              categories={payload.categories}
              showEmptyDates={showEmptyDates}
              labelsAsText={labelsAsText}
              uncategorizedName={uncategorizedName}
            />
          </>
        ) : (
          <PublicAssetList project={payload.project} assetLists={assetLists} />
        )}
      </div>
    </main>
  );
}
