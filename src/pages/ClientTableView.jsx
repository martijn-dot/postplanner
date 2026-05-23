import { differenceInCalendarDays, eachDayOfInterval, endOfWeek, format, getISODay, getISOWeek, isMonday, isWeekend, max, min, parseISO, startOfWeek } from 'date-fns';
import { Check, Copy, Download, Eye, EyeOff, FileText, Globe2, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import Pill from '../components/Pill.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';
import { downloadPlanningExcel } from '../lib/exportExcel.js';
import { readLocalObject, UNCATEGORIZED_NAME_STORAGE_KEY } from '../lib/localPreferences.js';
import { weekNumber } from '../lib/dates.js';

const CLIENT_COLUMN_STORAGE_KEY = 'roval:client-columns:v1';
const CLIENT_COLUMNS = [
  { key: 'category', label: 'Category', width: 150 },
  { key: 'time', label: 'Time', width: 74 },
  { key: 'who', label: 'Who', width: 118 },
  { key: 'asset', label: 'Asset', width: 200 },
  { key: 'what', label: 'What', width: 180 },
  { key: 'todo', label: 'Todo', width: 190 },
  { key: 'notes', label: 'Notes', width: 160 },
];

function readClientColumnPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(CLIENT_COLUMN_STORAGE_KEY) ?? '{}');
    return {
      order: Array.isArray(stored.order) ? stored.order.filter((key) => CLIENT_COLUMNS.some((column) => column.key === key)) : CLIENT_COLUMNS.map((column) => column.key),
      widths: stored.widths ?? Object.fromEntries(CLIENT_COLUMNS.map((column) => [column.key, column.width])),
      visible: stored.visible ?? Object.fromEntries(CLIENT_COLUMNS.map((column) => [column.key, true])),
    };
  } catch {
    return {
      order: CLIENT_COLUMNS.map((column) => column.key),
      widths: Object.fromEntries(CLIENT_COLUMNS.map((column) => [column.key, column.width])),
      visible: Object.fromEntries(CLIENT_COLUMNS.map((column) => [column.key, true])),
    };
  }
}

function normalizeTimeInput(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (!digits) return '';
  const hours = digits.slice(0, 2);
  const minutes = digits.slice(2, 4);
  const normalizedHours = hours.length === 2 ? String(Math.min(23, Number(hours))).padStart(2, '0') : hours;
  const normalizedMinutes = minutes.length === 2 ? String(Math.min(59, Number(minutes))).padStart(2, '0') : minutes;
  return minutes ? `${normalizedHours}:${normalizedMinutes}` : normalizedHours;
}

export function projectMilestones(project, items) {
  return items
    .filter((item) => item.project_id === project.id && item.end_date)
    .sort((a, b) => a.end_date.localeCompare(b.end_date) || a.sort_order - b.sort_order);
}

function dateRangeFromMilestones(milestones) {
  if (!milestones.length) return [];
  const dates = milestones.map((item) => parseISO(item.end_date));
  return eachDayOfInterval({
    start: startOfWeek(min(dates), { weekStartsOn: 1 }),
    end: endOfWeek(max(dates), { weekStartsOn: 1 }),
  });
}

export function buildClientPlanningRows(project, items, categories, labelsById, showEmptyDates, uncategorizedName = 'Uncategorized') {
  const milestones = projectMilestones(project, items);
  const days = dateRangeFromMilestones(milestones);
  if (!days.length) return [];

  const categoriesById = Object.fromEntries(
    categories
      .filter((category) => category.project_id === project.id)
      .map((category) => [category.id, category]),
  );
  const milestonesByDate = milestones.reduce((groups, item) => {
    const group = groups.get(item.end_date) ?? [];
    group.push(item);
    groups.set(item.end_date, group);
    return groups;
  }, new Map());

  return days.flatMap((day) => {
    const dateKey = format(day, 'yyyy-MM-dd');
    const dayMilestones = milestonesByDate.get(dateKey) ?? [];
    const base = {
      Week: weekNumber(day),
      Day: format(day, 'EEEE'),
      Date: format(day, 'd MMM'),
      _dateKey: dateKey,
      _isoWeekday: getISODay(day),
      _isMonday: isMonday(day),
      _isWeekend: isWeekend(day),
    };

    if (!dayMilestones.length) {
      if (!showEmptyDates) return [];
      return [{
        ...base,
        Category: '',
        Time: '',
        Who: '',
        Asset: '',
        What: '',
        Todo: '',
        Notes: '',
      }];
    }

    return dayMilestones.map((item) => ({
      ...base,
      Category: item.category_id ? categoriesById[item.category_id]?.name ?? uncategorizedName : uncategorizedName,
      Time: item.time ?? '',
      Who: item.who.map((id) => labelsById[id]?.value).filter(Boolean).join(', '),
      Asset: item.asset,
      What: labelsById[item.what]?.value ?? '',
      Todo: labelsById[item.todo]?.value ?? '',
      Notes: item.notes ?? '',
      _item: item,
    }));
  });
}

export function annotateRows(rows) {
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    const firstInWeek = !previous || previous.Week !== row.Week;
    const weekLength = firstInWeek ? rows.slice(index).findIndex((nextRow) => nextRow.Week !== row.Week) : 0;
    const firstInDate = !previous || previous._dateKey !== row._dateKey;
    const dateLength = firstInDate ? rows.slice(index).findIndex((nextRow) => nextRow._dateKey !== row._dateKey) : 0;
    const firstMondayDateRow = row._isMonday && firstInDate;

    return {
      ...row,
      _showDateGroup: firstInDate,
      _dateRowSpan: firstInDate ? (dateLength === -1 ? rows.length - index : dateLength) : 0,
      _showWeek: firstInWeek,
      _weekRowSpan: firstInWeek ? (weekLength === -1 ? rows.length - index : weekLength) : 0,
      _showWeekDivider: firstMondayDateRow,
    };
  });
}

export function clientPlanningExportRows(project, lineItems, labels, categories, showEmptyDates, uncategorizedName = 'Uncategorized') {
  const labelsById = Object.fromEntries(labels.map((label) => [label.id, label]));
  return annotateRows(buildClientPlanningRows(project, lineItems, categories, labelsById, showEmptyDates, uncategorizedName)).map((row) => ({
    Week: row.Week,
    Day: row.Day,
    Date: row.Date,
    Category: row.Category,
    Time: row.Time,
    Who: row.Who,
    Asset: row.Asset,
    What: row.What,
    Todo: row.Todo,
    Notes: row.Notes,
  }));
}

export function ClientPlanningTable({ project, lineItems, labels, categories, showEmptyDates, onUpdateLineItem, uncategorizedName = 'Uncategorized', columnPrefs, onColumnPrefsChange }) {
  const [editingField, setEditingField] = useState(null);
  const [draggedColumn, setDraggedColumn] = useState(null);
  const editingItem = editingField?.itemId ? lineItems.find((item) => item.id === editingField.itemId) : null;
  const labelsById = useMemo(() => Object.fromEntries(labels.map((label) => [label.id, label])), [labels]);
  const prefs = columnPrefs ?? readClientColumnPrefs();
  const orderedColumns = prefs.order.map((key) => CLIENT_COLUMNS.find((column) => column.key === key)).filter((column) => column && prefs.visible[column.key] !== false);
  const updatePrefs = (nextPrefs) => {
    onColumnPrefsChange?.(nextPrefs);
  };
  const startResize = (event, key) => {
    const startX = event.clientX;
    const startWidth = prefs.widths[key] ?? CLIENT_COLUMNS.find((column) => column.key === key)?.width ?? 140;
    const move = (moveEvent) => {
      updatePrefs({ ...prefs, widths: { ...prefs.widths, [key]: Math.max(70, startWidth + moveEvent.clientX - startX) } });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const rows = useMemo(
    () => annotateRows(buildClientPlanningRows(project, lineItems, categories, labelsById, showEmptyDates, uncategorizedName)),
    [project, lineItems, categories, labelsById, showEmptyDates, uncategorizedName],
  );

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-ink-900">
        <div className="client-table-scroll max-h-[calc(100vh-17rem)] overflow-auto">
          <table className="client-planning-table w-full border-collapse text-sm" style={{ minWidth: 48 + 78 + 72 + orderedColumns.reduce((sum, column) => sum + (prefs.widths[column.key] ?? column.width), 0) }}>
            <colgroup>
              <col className="w-[48px]" />
              <col className="w-[78px]" />
              <col className="w-[72px]" />
              {orderedColumns.map((column) => <col key={column.key} style={{ width: prefs.widths[column.key] ?? column.width }} />)}
            </colgroup>
            <thead className="bg-zinc-100 text-left text-xs uppercase text-ink-500 dark:bg-ink-850">
              <tr>
                <th className="sticky-week px-2 py-3 text-center font-semibold">Week</th>
                <th className="px-2 py-3 font-semibold">Day</th>
                <th className="px-2 py-3 font-semibold">Date</th>
                {orderedColumns.map((column) => (
                  <th
                    key={column.key}
                    draggable
                    onDragStart={() => setDraggedColumn(column.key)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!draggedColumn || draggedColumn === column.key) return;
                      const nextOrder = prefs.order.filter((key) => key !== draggedColumn);
                      nextOrder.splice(nextOrder.indexOf(column.key), 0, draggedColumn);
                      updatePrefs({ ...prefs, order: nextOrder });
                      setDraggedColumn(null);
                    }}
                    className="relative px-4 py-3 font-semibold"
                  >
                    {column.label}
                    <button type="button" onPointerDown={(event) => startResize(event, column.key)} className="absolute right-0 top-0 h-full w-2 cursor-col-resize" aria-label={`Resize ${column.label}`} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${row._item?.id ?? row._dateKey}-${index}`}
                  className={`${row._isWeekend ? 'bg-zinc-200/70 dark:bg-white/[0.07]' : ''} ${row._item ? 'booking-row' : ''} ${row._showWeekDivider ? 'week-divider' : 'border-t border-black/5 dark:border-white/5'}`}
                >
                  {row._showWeek && (
                    <td rowSpan={row._weekRowSpan} className="week-cell sticky-week px-1 py-2 align-middle font-mono text-[1.5em]">
                      <span><em>WEEK</em>{row.Week}</span>
                    </td>
                  )}
                  {row._showDateGroup && (
                    <>
                      <td rowSpan={row._dateRowSpan} className={`date-group-cell p-0 text-xs font-semibold ${row._isWeekend ? 'date-weekend-cell' : ''}`}>
                        <span className={row._item ? 'date-group-chip date-booking-chip' : 'date-group-chip'}>{row.Day}</span>
                      </td>
                      <td rowSpan={row._dateRowSpan} className={`date-group-cell whitespace-nowrap p-0 font-mono text-xs font-semibold ${row._isWeekend ? 'date-weekend-cell' : ''}`}>
                        <span className={row._item ? 'date-group-chip date-booking-chip' : 'date-group-chip'}>{row.Date}</span>
                      </td>
                    </>
                  )}
                  {orderedColumns.map((column) => {
                    if (column.key === 'category') return <td key={column.key} className="px-4 py-3 text-sm font-semibold text-ink-400">{row.Category || <span className="text-ink-500">-</span>}</td>;
                    if (column.key === 'time') return <td key={column.key} className="px-3 py-3 font-mono">{row._item && onUpdateLineItem ? <button type="button" onClick={() => setEditingField({ itemId: row._item.id, field: 'time' })} className="min-w-12 whitespace-nowrap rounded-md border border-white/10 bg-white/5 px-2 py-1 text-center text-sm text-ink-300 hover:border-accent-400 hover:text-ink-100">{row._item.time || <span className="text-ink-500">--:--</span>}</button> : row.Time || <span className="text-ink-500">-</span>}</td>;
                    if (column.key === 'who') return <td key={column.key} className="px-4 py-3">{row._item ? <div className="flex flex-wrap gap-1">{row._item.who.map((id) => <Pill key={id} label={labelsById[id]} />)}</div> : <span className="text-ink-500">-</span>}</td>;
                    if (column.key === 'asset') return <td key={column.key} className="overflow-visible px-4 py-3"><span className="note-preview group relative inline-flex w-full min-w-0 text-left"><span className="truncate font-semibold">{row.Asset || '-'}</span>{row.Asset && <span className="note-tooltip">{row.Asset}</span>}</span></td>;
                    if (column.key === 'what') return <td key={column.key} className="px-4 py-3">{row._item ? <Pill label={labelsById[row._item.what]} /> : <span className="text-ink-500">-</span>}</td>;
                    if (column.key === 'todo') return <td key={column.key} className="px-4 py-3">{row._item ? <Pill label={labelsById[row._item.todo]} subtle /> : <span className="text-ink-500">-</span>}</td>;
                    if (column.key === 'notes') return <td key={column.key} className="overflow-visible px-4 py-3">{row._item && onUpdateLineItem ? <button type="button" onClick={() => setEditingField({ itemId: row._item.id, field: 'notes' })} className="note-preview group relative inline-flex w-full min-w-0 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-left text-sm text-ink-300 hover:border-accent-400 hover:text-ink-100"><FileText size={14} className="shrink-0 text-ink-500" /><span className="truncate">{row._item.notes || 'Add note'}</span>{row._item.notes && <span className="note-tooltip">{row._item.notes}</span>}</button> : row.Notes || <span className="text-ink-500">-</span>}</td>;
                    return null;
                  })}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={3 + orderedColumns.length} className="px-4 py-10 text-center text-ink-500">No milestones yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {editingItem && editingField && onUpdateLineItem && (
        <div className="fixed inset-0 z-[700] grid place-items-center bg-black/60 p-5" onMouseDown={() => setEditingField(null)}>
          <div className="w-full max-w-lg rounded-lg border border-white/10 bg-ink-900 p-5 shadow-glow" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-ink-100">{editingField.field === 'time' ? 'Edit time' : 'Edit note'}</h2>
                <p className="mt-1 text-sm text-ink-500">{editingItem.asset || 'Client planning row'}</p>
              </div>
              <button type="button" onClick={() => setEditingField(null)} className="icon-button">x</button>
            </div>
            {editingField.field === 'time' ? (
              <div className="space-y-3">
                <input
                  value={editingItem.time === 'EOD' ? '' : editingItem.time ?? ''}
                  onChange={(event) => onUpdateLineItem(editingItem.id, { time: normalizeTimeInput(event.target.value) })}
                  className="w-full rounded-md border border-white/10 bg-ink-950 px-3 py-2 font-mono text-sm text-ink-100 outline-none focus:border-accent-400"
                  placeholder="HH:MM"
                  inputMode="numeric"
                  autoFocus
                />
                <button type="button" onClick={() => onUpdateLineItem(editingItem.id, { time: 'EOD' })} className="secondary-button">Set EOD</button>
              </div>
            ) : (
              <textarea
                value={editingItem.notes ?? ''}
                onChange={(event) => onUpdateLineItem(editingItem.id, { notes: event.target.value })}
                className="min-h-36 w-full resize-y rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-accent-400"
                placeholder="Add notes for this client planning row..."
                autoFocus
              />
            )}
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setEditingField(null)} className="primary-button">Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ClientGanttChart({ project, lineItems, labels, categories, uncategorizedName = 'Uncategorized' }) {
  const labelsById = useMemo(() => Object.fromEntries(labels.map((label) => [label.id, label])), [labels]);
  const milestones = useMemo(() => projectMilestones(project, lineItems), [project, lineItems]);
  const days = useMemo(() => dateRangeFromMilestones(milestones), [milestones]);
  const categoriesById = useMemo(() => Object.fromEntries(categories.filter((category) => category.project_id === project.id).map((category) => [category.id, category])), [categories, project.id]);
  const dayWidth = 58;
  const leftWidth = 320;
  const weeks = useMemo(() => {
    const segments = [];
    days.forEach((day) => {
      const key = `${format(day, 'RRRR')}-${getISOWeek(day)}`;
      const last = segments.at(-1);
      if (last?.key === key) {
        last.span += 1;
      } else {
        segments.push({ key, label: `W${getISOWeek(day)}`, span: 1 });
      }
    });
    return segments;
  }, [days]);

  if (!days.length) {
    return <div className="rounded-lg border border-black/10 bg-white px-4 py-10 text-center text-ink-500 dark:border-white/10 dark:bg-ink-900">No milestones yet.</div>;
  }

  return (
    <div className="client-gantt overflow-hidden rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-ink-900">
      <div className="client-gantt-scroll overflow-auto">
        <div style={{ minWidth: leftWidth + days.length * dayWidth }}>
          <div className="sticky top-0 z-20 grid bg-zinc-100 dark:bg-ink-850" style={{ gridTemplateColumns: `${leftWidth}px ${days.length * dayWidth}px` }}>
            <div className="sticky left-0 z-30 grid grid-cols-[110px_1fr] border-b border-r border-black/10 bg-zinc-100 text-xs font-semibold uppercase text-ink-500 dark:border-white/10 dark:bg-ink-850">
              <span className="px-4 py-5">Who</span>
              <span className="px-4 py-5">Asset</span>
            </div>
            <div>
              <div className="flex h-5 border-b border-black/10 text-center font-mono text-[0.55rem] font-semibold text-ink-500 dark:border-white/10">
                {weeks.map((week) => <div key={week.key} className="grid place-items-center border-r border-black/5 dark:border-white/5" style={{ width: week.span * dayWidth }}>{week.label}</div>)}
              </div>
              <div className="flex h-9 border-b border-black/10 text-center font-mono text-xs text-ink-500 dark:border-white/10">
                {days.map((day) => (
                  <div key={day.toISOString()} className={`grid place-items-center border-r border-black/5 dark:border-white/5 ${isWeekend(day) ? 'bg-black/[0.04] dark:bg-white/[0.055]' : ''}`} style={{ width: dayWidth }}>
                    {format(day, 'd')}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {milestones.map((item) => {
            const offset = differenceInCalendarDays(parseISO(item.end_date), days[0]);
            const what = labelsById[item.what];
            const todo = labelsById[item.todo];
            const category = item.category_id ? categoriesById[item.category_id]?.name : uncategorizedName;
            return (
              <div key={item.id} className="client-gantt-row grid" style={{ gridTemplateColumns: `${leftWidth}px ${days.length * dayWidth}px` }}>
                <div className="sticky left-0 z-10 grid grid-cols-[110px_1fr] border-r border-black/10 bg-white dark:border-white/10 dark:bg-ink-900">
                  <div className="flex flex-wrap content-center gap-1 px-3 py-3">{item.who.map((id) => <Pill key={id} label={labelsById[id]} />)}</div>
                  <div className="min-w-0 px-3 py-3">
                    <div className="truncate text-sm font-semibold">{item.asset || '-'}</div>
                    <div className="truncate text-[0.65rem] text-ink-500">{category}</div>
                  </div>
                </div>
                <div className="relative min-h-14">
                  {days.map((day) => <div key={day.toISOString()} className={`client-gantt-day ${isWeekend(day) ? 'is-weekend' : ''}`} style={{ width: dayWidth }} />)}
                  <div className="client-gantt-dot-wrap" style={{ left: offset * dayWidth + dayWidth / 2 }}>
                    <span className="client-gantt-dot" style={{ backgroundColor: what?.color ?? '#6d5dfc' }} />
                    <span className="client-gantt-labels">
                      {what && <Pill label={what} />}
                      {todo && <Pill label={todo} subtle />}
                      {item.time && <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.65rem] text-ink-300">{item.time}</span>}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ClientTableView({ project, planningVersion = 'V1' }) {
  const { lineItems, labels, categories, createShareLink, updateLineItem } = usePlanner();
  const [showEmptyDates, setShowEmptyDates] = useState(true);
  const [showWennekerBookings, setShowWennekerBookings] = useState(true);
  const [showClientBookings, setShowClientBookings] = useState(true);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [columnPrefs, setColumnPrefs] = useState(() => readClientColumnPrefs());
  const [viewMode, setViewMode] = useState('table');
  const uncategorizedNames = useMemo(() => readLocalObject(UNCATEGORIZED_NAME_STORAGE_KEY, {}), []);
  const [publishedUrl, setPublishedUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const uncategorizedName = uncategorizedNames[project.id] || 'Uncategorized';
  const whoFilterIds = useMemo(() => ({
    wenneker: labels.find((label) => label.column_type === 'who' && label.value.toLowerCase() === 'wenneker')?.id,
    client: labels.find((label) => label.column_type === 'who' && label.value.toLowerCase() === 'client')?.id,
  }), [labels]);
  const versionLineItems = useMemo(() => lineItems.filter((item) => item.project_id === project.id && (item.planning_version ?? 'V1') === planningVersion), [lineItems, planningVersion, project.id]);
  const versionCategories = useMemo(() => categories.filter((category) => category.project_id === project.id && (category.planning_version ?? 'V1') === planningVersion), [categories, planningVersion, project.id]);
  const filteredLineItems = useMemo(() => versionLineItems.filter((item) => {
    if (showEmptyDates) return true;
    if (!showWennekerBookings && whoFilterIds.wenneker && item.who?.includes(whoFilterIds.wenneker)) return false;
    if (!showClientBookings && whoFilterIds.client && item.who?.includes(whoFilterIds.client)) return false;
    return true;
  }), [showClientBookings, showEmptyDates, showWennekerBookings, versionLineItems, whoFilterIds]);
  const exportRows = useMemo(
    () => clientPlanningExportRows(project, filteredLineItems, labels, versionCategories, showEmptyDates, uncategorizedName),
    [project, filteredLineItems, labels, versionCategories, showEmptyDates, uncategorizedName],
  );

  const publish = async () => {
    setPublishing(true);
    try {
      const token = await createShareLink(project.id);
      const url = `${window.location.origin}/share/${token}`;
      setPublishedUrl(url);
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } finally {
      setPublishing(false);
    }
  };

  const copyPublicUrl = async () => {
    await navigator.clipboard?.writeText(publishedUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const setAllTimesEod = () => {
    filteredLineItems
      .filter((item) => item.end_date)
      .forEach((item) => updateLineItem(item.id, { time: 'EOD' }));
  };
  const updateColumnPrefs = (nextPrefs) => {
    setColumnPrefs(nextPrefs);
    localStorage.setItem(CLIENT_COLUMN_STORAGE_KEY, JSON.stringify(nextPrefs));
  };

  return (
    <main className="mx-auto max-w-[1600px] px-5 py-6">
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold">Client Planning</h1>
          <p className="mt-1 text-sm text-ink-500">Milestones are generated from the final day of each timeline item.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={publish} className="secondary-button" disabled={publishing}>
            <Globe2 size={17} /> {publishing ? 'Publishing...' : 'Publish'}
          </button>
          {viewMode === 'table' && <button type="button" onClick={() => setShowEmptyDates((next) => !next)} className="secondary-button">
            {showEmptyDates ? <EyeOff size={17} /> : <Eye size={17} />}
            {showEmptyDates ? 'Hide empty dates' : 'Show empty dates'}
          </button>}
          {!showEmptyDates && (
            <>
              <button type="button" onClick={() => setShowWennekerBookings((next) => !next)} className={`secondary-button ${showWennekerBookings ? 'text-accent-300' : 'opacity-60'}`}>
                {showWennekerBookings ? 'Hide Wenneker' : 'Show Wenneker'}
              </button>
              <button type="button" onClick={() => setShowClientBookings((next) => !next)} className={`secondary-button ${showClientBookings ? 'text-accent-300' : 'opacity-60'}`}>
                {showClientBookings ? 'Hide Client' : 'Show Client'}
              </button>
            </>
          )}
          <div className="relative">
            <button type="button" onClick={() => setColumnMenuOpen((next) => !next)} className="secondary-button"><SlidersHorizontal size={17} /> Columns</button>
            {columnMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-white/10 bg-ink-900 p-2 shadow-glow">
                {CLIENT_COLUMNS.map((column) => (
                  <label key={column.key} className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={columnPrefs.visible[column.key] !== false}
                      onChange={() => updateColumnPrefs({ ...columnPrefs, visible: { ...columnPrefs.visible, [column.key]: columnPrefs.visible[column.key] === false } })}
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={setAllTimesEod} className="secondary-button">
            Set all EOD
          </button>
          <div className="segmented">
            <button type="button" onClick={() => setViewMode('table')} className={viewMode === 'table' ? 'selected' : ''}>Table View</button>
            <button type="button" onClick={() => setViewMode('gantt')} className={viewMode === 'gantt' ? 'selected' : ''}>Gant Chart</button>
          </div>
          <button type="button" onClick={() => downloadPlanningExcel(project, exportRows)} className="primary-button" disabled={!exportRows.length}>
            <Download size={17} /> Download Excel
          </button>
        </div>
      </div>

      {publishedUrl && (
        <div className="mb-5 rounded-lg border border-accent-400/30 bg-accent-500/10 p-4 text-sm text-ink-700 dark:text-ink-100">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <p className="font-semibold">Client page published</p>
              <p className="mt-1 text-ink-500">Anyone with this link can view the read-only client planning page without signing in.</p>
            </div>
            <div className="flex min-w-0 gap-2">
              <code className="min-w-0 truncate rounded-md border border-black/10 bg-white px-3 py-2 font-mono text-xs dark:border-white/10 dark:bg-ink-950">{publishedUrl}</code>
              <button type="button" onClick={copyPublicUrl} className="secondary-button shrink-0">
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'table' ? (
        <ClientPlanningTable
          project={project}
          lineItems={filteredLineItems}
          labels={labels}
          categories={versionCategories}
          showEmptyDates={showEmptyDates}
          onUpdateLineItem={updateLineItem}
          uncategorizedName={uncategorizedName}
          columnPrefs={columnPrefs}
          onColumnPrefsChange={updateColumnPrefs}
        />
      ) : (
        <ClientGanttChart project={project} lineItems={filteredLineItems} labels={labels} categories={versionCategories} uncategorizedName={uncategorizedName} />
      )}
    </main>
  );
}
