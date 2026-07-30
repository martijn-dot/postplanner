import { addDays, differenceInCalendarDays, eachDayOfInterval, endOfWeek, format, getISODay, getISOWeek, isMonday, isWeekend, max, min, parseISO, startOfWeek } from 'date-fns';
import { AlertTriangle, CalendarDays, CalendarPlus, ChevronDown, ChevronRight, Clock, Download, Eye, EyeOff, FileText, Globe2, GripVertical, ListChecks, Package, Pencil, Plus, Tag, Trash2, Users, X } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CursorTooltip from '../components/CursorTooltip.jsx';
import LabelSelect from '../components/LabelSelect.jsx';
import Pill from '../components/Pill.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';
import { downloadPlanningExcel } from '../lib/exportExcel.js';
import { readLocalObject, UNCATEGORIZED_NAME_STORAGE_KEY } from '../lib/localPreferences.js';
import { weekNumber } from '../lib/dates.js';
import { DEFAULT_PLANNING_TYPE, PLANNING_TYPES } from '../lib/defaults.js';

const CLIENT_COLUMN_STORAGE_KEY = 'roval:client-columns:v5';
const CLIENT_VIEW_MODE_STORAGE_KEY = 'roval:client-view-mode';
const CLIENT_FILTER_STORAGE_KEY = 'roval:client-filters:v1';
const CLIENT_PUBLISHED_URL_STORAGE_KEY = 'roval:client-published-url:v1';
const DEFAULT_CLIENT_FILTER_PREFS = {
  showEmptyDates: true,
  dateWindow: 'full',
  showWennekerBookings: true,
  showClientBookings: true,
  hiddenCategoryKeys: [],
  collapsedCategoryKeys: [],
};
const CLIENT_COLUMNS = [
  { key: 'edit', label: 'Edit', width: 86 },
  { key: 'calendar', label: 'Calendar', width: 132 },
  { key: 'category', label: 'Category', width: 150 },
  { key: 'who', label: 'Who', width: 146 },
  { key: 'asset', label: 'Asset', width: 200 },
  { key: 'what', label: 'What', width: 180 },
  { key: 'todo', label: 'Todo', width: 190 },
  { key: 'time', label: 'Time', width: 58 },
  { key: 'notes', label: 'Notes', width: 160 },
];

const CLIENT_COLUMN_ICONS = {
  edit: Pencil,
  calendar: CalendarPlus,
  category: Tag,
  who: Users,
  asset: Package,
  what: Tag,
  todo: ListChecks,
  time: Clock,
  notes: FileText,
};

function safePlanningType(value) {
  return PLANNING_TYPES[value]?.key ?? DEFAULT_PLANNING_TYPE;
}

function readClientColumnPrefs() {
  const defaultOrder = CLIENT_COLUMNS.map((column) => column.key);
  const defaultVisible = Object.fromEntries(CLIENT_COLUMNS.map((column) => [column.key, column.key !== 'calendar']));
  try {
    const stored = JSON.parse(localStorage.getItem(CLIENT_COLUMN_STORAGE_KEY) ?? '{}');
    const storedOrder = Array.isArray(stored.order) ? stored.order.filter((key) => CLIENT_COLUMNS.some((column) => column.key === key)) : [];
    return {
      order: [...storedOrder, ...defaultOrder.filter((key) => !storedOrder.includes(key))],
      widths: stored.widths ?? { date: 84, ...Object.fromEntries(CLIENT_COLUMNS.map((column) => [column.key, column.width])) },
      visible: { ...defaultVisible, ...(stored.visible ?? {}) },
    };
  } catch {
    return {
      order: CLIENT_COLUMNS.map((column) => column.key),
      widths: { date: 84, ...Object.fromEntries(CLIENT_COLUMNS.map((column) => [column.key, column.width])) },
      visible: defaultVisible,
    };
  }
}

function readClientViewMode(projectId) {
  return localStorage.getItem(`${CLIENT_VIEW_MODE_STORAGE_KEY}:${projectId}`) ?? 'table';
}

function clientFilterStorageKey(projectId, planningType, planningVersion) {
  return `${CLIENT_FILTER_STORAGE_KEY}:${projectId}:${planningType}:${planningVersion}`;
}

function clientPublishedUrlStorageKey(projectId, planningType, planningVersion) {
  return `${CLIENT_PUBLISHED_URL_STORAGE_KEY}:${projectId}:${planningType}:${planningVersion}`;
}

function readClientPublishedUrl(projectId, planningType, planningVersion) {
  return localStorage.getItem(clientPublishedUrlStorageKey(projectId, planningType, planningVersion)) ?? '';
}

function readClientFilterPrefs(projectId, planningType, planningVersion) {
  try {
    const stored = JSON.parse(localStorage.getItem(clientFilterStorageKey(projectId, planningType, planningVersion)) ?? '{}');
    return {
      ...DEFAULT_CLIENT_FILTER_PREFS,
      ...stored,
      dateWindow: ['future', 'full'].includes(stored.dateWindow) ? stored.dateWindow : DEFAULT_CLIENT_FILTER_PREFS.dateWindow,
      hiddenCategoryKeys: Array.isArray(stored.hiddenCategoryKeys) ? stored.hiddenCategoryKeys : [],
      collapsedCategoryKeys: Array.isArray(stored.collapsedCategoryKeys) ? stored.collapsedCategoryKeys : [],
    };
  } catch {
    return { ...DEFAULT_CLIENT_FILTER_PREFS };
  }
}

function slugifyProjectName(value) {
  const slug = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'planning';
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

function dateRangeFromBookings(items) {
  const bookings = items.filter((item) => item.start_date && item.end_date);
  if (!bookings.length) return [];
  const dates = bookings.flatMap((item) => [parseISO(item.start_date), parseISO(item.end_date)]);
  return eachDayOfInterval({
    start: startOfWeek(min(dates), { weekStartsOn: 1 }),
    end: endOfWeek(max(dates), { weekStartsOn: 1 }),
  });
}

export function buildClientPlanningRows(project, items, categories, labelsById, showEmptyDates, uncategorizedName = 'Uncategorized', planningType = DEFAULT_PLANNING_TYPE) {
  const isProduction = safePlanningType(planningType) === PLANNING_TYPES.production.key;
  const milestones = projectMilestones(project, items);
  const productionBookings = isProduction
    ? items
      .filter((item) => item.project_id === project.id && item.start_date && item.end_date && item.end_date >= item.start_date)
      .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.sort_order - b.sort_order)
    : [];
  const planningItems = isProduction ? productionBookings : milestones;
  const days = isProduction ? dateRangeFromBookings(productionBookings) : dateRangeFromMilestones(milestones);
  if (!days.length) return [];

  const categoriesById = Object.fromEntries(
    categories
      .filter((category) => category.project_id === project.id)
      .map((category) => [category.id, category]),
  );
  const milestonesByDate = planningItems.reduce((groups, item) => {
    const itemDays = isProduction
      ? eachDayOfInterval({ start: parseISO(item.start_date), end: parseISO(item.end_date) }).map((day) => format(day, 'yyyy-MM-dd'))
      : [item.end_date];
    itemDays.forEach((dateKey) => {
      const group = groups.get(dateKey) ?? [];
      group.push(item);
      groups.set(dateKey, group);
    });
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
      RowColor: item.row_color ?? '',
      Who: item.who.map((id) => labelsById[id]?.value).filter(Boolean).join(', '),
      Asset: isProduction ? '' : item.asset,
      What: isProduction ? item.asset ?? '' : labelsById[item.what]?.value ?? '',
      Todo: labelsById[item.todo]?.value ?? '',
      Notes: item.notes ?? '',
      _item: item,
    }));
  });
}

export function annotateRows(rows) {
  const todayKey = format(new Date(), 'yyyy-MM-dd');
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
      _isToday: row._dateKey === todayKey,
    };
  });
}

function filterRowsByDateWindow(rows, dateWindow) {
  if (dateWindow === 'full') return rows;
  const today = new Date();
  const todayKey = format(today, 'yyyy-MM-dd');
  const minKey = dateWindow === 'pastWeek' ? format(addDays(today, -7), 'yyyy-MM-dd') : todayKey;
  return rows.filter((row) => row._dateKey >= minKey);
}

function filterDaysByDateWindow(days, dateWindow) {
  if (dateWindow === 'full') return days;
  const today = new Date();
  const minKey = dateWindow === 'pastWeek' ? format(addDays(today, -7), 'yyyy-MM-dd') : format(today, 'yyyy-MM-dd');
  return days.filter((day) => format(day, 'yyyy-MM-dd') >= minKey);
}

function googleCalendarUrl(row) {
  if (!row?._item || !row._dateKey) return '';
  const start = format(parseISO(row._dateKey), 'yyyyMMdd');
  const end = format(addDays(parseISO(row._dateKey), 1), 'yyyyMMdd');
  const title = [row.What, row.Todo, row.Asset].filter(Boolean).join(' - ') || 'Planning milestone';
  const details = [
    row.Asset ? `Asset: ${row.Asset}` : '',
    row.Who ? `Who: ${row.Who}` : '',
    row.What ? `What: ${row.What}` : '',
    row.Todo ? `Todo: ${row.Todo}` : '',
    row.Time ? `Time: ${row.Time}` : '',
    row.Notes ? `Notes: ${row.Notes}` : '',
  ].filter(Boolean).join('\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function clientWeekRange(dateKey) {
  const date = parseISO(dateKey);
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
  return weekStart.getMonth() === weekEnd.getMonth()
    ? `${format(weekStart, 'd')}–${format(weekEnd, 'd MMM')}`
    : `${format(weekStart, 'd MMM')}–${format(weekEnd, 'd MMM')}`;
}

export function clientPlanningExportRows(project, lineItems, labels, categories, showEmptyDates, uncategorizedName = 'Uncategorized', dateWindow = 'future', planningType = DEFAULT_PLANNING_TYPE) {
  const labelsById = Object.fromEntries(labels.map((label) => [label.id, label]));
  return annotateRows(filterRowsByDateWindow(buildClientPlanningRows(project, lineItems, categories, labelsById, showEmptyDates, uncategorizedName, planningType), dateWindow)).map((row) => ({
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

function categoryNameForItem(item, categoriesById, uncategorizedName) {
  return item.category_id ? categoriesById[item.category_id]?.name ?? uncategorizedName : uncategorizedName;
}

function categoryKeyForItem(item) {
  return item.category_id ?? 'uncategorized';
}

function categoryShade(key, categories = []) {
  const index = Math.max(0, categories.findIndex((category) => category.id === key));
  const palette = [
    ['#28b8ff', '#0f2339'],
    ['#10b981', '#0d2d25'],
    ['#f59e0b', '#35240b'],
    ['#b793ff', '#251a3d'],
    ['#f466ae', '#39182a'],
    ['#ff8f4f', '#3a1f12'],
  ];
  const [accent, background] = palette[index % palette.length];
  return {
    backgroundColor: background,
    borderColor: accent,
    color: accent,
  };
}

function OverflowNote({ note, onOpen }) {
  return (
    <button type="button" className="client-note-overflow note-preview" onClick={onOpen} aria-label="Open full note">
      <FileText className="client-note-icon" size={14} aria-hidden="true" />
      <span className="client-note-text">{note}</span>
      <span className="note-tooltip">{note}</span>
    </button>
  );
}

export function ClientPlanningTable({ project, lineItems, labels, categories, showEmptyDates, onUpdateLineItem, onFlushLineItem, onAddLabel, onMoveRows, selectedRowIds = [], onSelectedRowIdsChange, uncategorizedName = 'Uncategorized', columnPrefs, onColumnPrefsChange, forceHideCategoryColumn = false, dateWindow = 'future', hiddenWhoIds = [], showWeekColumn = true, publicCardLayout = false, planningType = DEFAULT_PLANNING_TYPE, showHeader = true, headerOnly = false }) {
  const isProduction = safePlanningType(planningType) === PLANNING_TYPES.production.key;
  const [editingItemId, setEditingItemId] = useState(null);
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  const [rowDropDate, setRowDropDate] = useState('');
  const editingItem = editingItemId ? lineItems.find((item) => item.id === editingItemId) : null;
  const labelsById = useMemo(() => Object.fromEntries(labels.map((label) => [label.id, label])), [labels]);
  const labelsByType = useMemo(() => ({
    who: labels.filter((label) => label.column_type === 'who'),
    what: labels.filter((label) => label.column_type === 'what'),
    todo: labels.filter((label) => label.column_type === 'todo'),
  }), [labels]);
  const prefs = columnPrefs ?? readClientColumnPrefs();
  const dateWidth = prefs.widths.date ?? 84;
  const visibleCategoryCount = useMemo(() => {
    const categoryIds = new Set(lineItems.map((item) => item.category_id).filter(Boolean));
    return Math.max(categories.length, categoryIds.size);
  }, [categories.length, lineItems]);
  const showCategoryColumn = visibleCategoryCount > 1 && !forceHideCategoryColumn;
  const orderedColumns = prefs.order
    .map((key) => CLIENT_COLUMNS.find((column) => column.key === key))
    .filter((column) => column && prefs.visible[column.key] !== false && (!isProduction || column.key !== 'asset') && (column.key !== 'category' || showCategoryColumn) && (column.key !== 'edit' || (onUpdateLineItem && !isProduction)));
  const updatePrefs = (nextPrefs) => {
    onColumnPrefsChange?.(nextPrefs);
  };
  const startResize = (event, key) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = prefs.widths[key] ?? CLIENT_COLUMNS.find((column) => column.key === key)?.width ?? (key === 'date' ? 84 : 140);
    const minimumWidth = key === 'time' ? 52 : 70;
    const move = (moveEvent) => {
      updatePrefs({ ...prefs, widths: { ...prefs.widths, [key]: Math.max(minimumWidth, startWidth + moveEvent.clientX - startX) } });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const rows = useMemo(
    () => annotateRows(filterRowsByDateWindow(buildClientPlanningRows(project, lineItems, categories, labelsById, showEmptyDates, uncategorizedName, planningType), dateWindow)),
    [project, lineItems, categories, labelsById, showEmptyDates, uncategorizedName, dateWindow, planningType],
  );
  const hasRowDrag = Boolean(onUpdateLineItem && onMoveRows);
  const selectedRowIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const selectRow = (event, itemId) => {
    if (!itemId || !onSelectedRowIdsChange) return;
    if (event.shiftKey) {
      onSelectedRowIdsChange(selectedRowIdSet.has(itemId)
        ? selectedRowIds.filter((id) => id !== itemId)
        : [...selectedRowIds, itemId]);
    } else {
      onSelectedRowIdsChange([itemId]);
    }
  };
  const startRowDrag = (event, itemId) => {
    const movingIds = selectedRowIdSet.has(itemId) ? selectedRowIds : [itemId];
    if (!selectedRowIdSet.has(itemId)) onSelectedRowIdsChange?.(movingIds);
    const payload = JSON.stringify({ sourceId: itemId, itemIds: movingIds });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-roval-planning-rows', payload);
    event.dataTransfer.setData('text/plain', payload);
  };
  const dropRows = (event, targetDate) => {
    event.preventDefault();
    event.stopPropagation();
    setRowDropDate('');
    const raw = event.dataTransfer.getData('application/x-roval-planning-rows') || event.dataTransfer.getData('text/plain');
    try {
      const payload = JSON.parse(raw);
      if (payload?.sourceId && Array.isArray(payload.itemIds)) onMoveRows(payload.sourceId, payload.itemIds, targetDate);
    } catch {
      // Ignore unrelated drag data.
    }
  };
  const widthForColumn = (column) => {
    return prefs.widths[column.key] ?? column.width;
  };
  const tableWidth = (showWeekColumn ? 58 : 0)
    + (hasRowDrag ? 38 : 0)
    + dateWidth
    + orderedColumns.reduce((sum, column) => sum + widthForColumn(column), 0);
  const moveColumn = (targetKey, side) => {
    if (!draggedColumn || draggedColumn === targetKey) return;
    const nextOrder = prefs.order.filter((key) => key !== draggedColumn);
    const targetIndex = nextOrder.indexOf(targetKey);
    nextOrder.splice(side === 'after' ? targetIndex + 1 : targetIndex, 0, draggedColumn);
    updatePrefs({ ...prefs, order: nextOrder });
  };

  if (publicCardLayout) {
    const publicColumnWidth = (column) => {
      const minWidth = Math.min(widthForColumn(column), 110);
      if (column.key === 'who') return `minmax(${Math.min(minWidth, 76)}px, 0.8fr)`;
      if (column.key === 'time') return `minmax(${Math.min(minWidth, 50)}px, 0.55fr)`;
      if (column.key === 'calendar') return `minmax(${Math.min(minWidth, 92)}px, 0.65fr)`;
      if (column.key === 'asset') return `minmax(${minWidth}px, 1.7fr)`;
      if (column.key === 'notes') return `minmax(${minWidth}px, 1.9fr)`;
      return `minmax(${minWidth}px, 1fr)`;
    };
    const publicEventColumns = orderedColumns.map(publicColumnWidth).join(' ');
    const gridColumns = `88px 74px ${publicEventColumns}`;
    const weeks = rows.reduce((groups, row) => {
      let week = groups.at(-1);
      if (!week || week.number !== row.Week) {
        week = { number: row.Week, dates: [] };
        groups.push(week);
      }
      let date = week.dates.at(-1);
      if (!date || date.key !== row._dateKey) {
        date = { key: row._dateKey, rows: [] };
        week.dates.push(date);
      }
      date.rows.push(row);
      return groups;
    }, []);
    const renderPublicCell = (row, column) => {
      const hiddenBooking = row._item && row._item.who?.some((id) => hiddenWhoIds.includes(id));
      if (hiddenBooking) return null;
      if (column.key === 'calendar') return row._item ? <a className="client-calendar-button" href={googleCalendarUrl(row)} target="_blank" rel="noreferrer">Add to calendar</a> : null;
      if (column.key === 'time') return row._item ? (row.Time || '-') : null;
      if (column.key === 'who') return row._item ? <div className="flex flex-wrap gap-1">{row._item.who.map((id) => <Pill key={id} label={labelsById[id]} />)}</div> : null;
      if (column.key === 'asset') return row._item ? (
        <CursorTooltip text={row.Asset} onlyWhenOverflowing className="client-asset-overflow note-preview group relative block min-w-0">
          <span data-cursor-tooltip-trigger className="block truncate font-semibold">{row.Asset || '-'}</span>
          <span className="mt-0.5 block truncate text-[0.68rem] font-semibold uppercase tracking-wide text-ink-500">{row.Category}</span>
        </CursorTooltip>
      ) : null;
      if (column.key === 'what') return row._item ? (isProduction ? <span className="font-semibold">{row.What || '-'}</span> : <Pill label={labelsById[row._item.what]} />) : null;
      if (column.key === 'todo') return row._item ? <Pill label={labelsById[row._item.todo]} subtle /> : null;
      if (column.key === 'notes') return row._item?.notes ? <CursorTooltip text={row._item.notes} className="note-preview group relative inline-flex min-w-0 items-center gap-2"><FileText size={14} /><span className="truncate">{row._item.notes}</span></CursorTooltip> : null;
      if (column.key === 'category') return row._item ? row.Category : null;
      return null;
    };

    return (
      <section className="public-calendar-cards">
        <div className="public-calendar-column-head" style={{ gridTemplateColumns: gridColumns }}>
          <span>Week</span>
          <span>Date</span>
          {orderedColumns.map((column) => {
            const ColumnIcon = CLIENT_COLUMN_ICONS[column.key];
            return (
              <span key={column.key}>
                {ColumnIcon ? <ColumnIcon size={15} strokeWidth={1.8} aria-hidden="true" /> : null}
                {column.key === 'calendar' ? 'Actions' : column.label}
              </span>
            );
          })}
        </div>
        {weeks.map((week) => (
          <section className="public-calendar-week" key={week.number}>
            <div className="public-calendar-week-cell"><CalendarDays size={20} /><span>Week</span><strong>{week.number}</strong></div>
            <div className="public-calendar-week-dates">
            {week.dates.map((date) => {
              const firstRow = date.rows[0];
              const [dayNumber, month] = firstRow.Date.split(' ');
              const hasVisibleEvent = date.rows.some((row) => row._item && !row._item.who?.some((id) => hiddenWhoIds.includes(id)));
              return (
                <article className="public-calendar-date-card" data-date-key={date.key} key={date.key}>
                  <div className="public-calendar-date-block">
                    <span className={firstRow._isToday ? 'is-today' : ''}>{firstRow.Day}</span>
                    <strong>{dayNumber}</strong>
                    <b>{month}</b>
                  </div>
                  <div className="public-calendar-date-events">
                    {hasVisibleEvent ? date.rows.filter((row) => !row._item?.who?.some((id) => hiddenWhoIds.includes(id))).map((row, index) => (
                      <div className="public-calendar-event-row" style={{ gridTemplateColumns: publicEventColumns }} key={row._item?.id ?? `${date.key}-${index}`}>
                        {orderedColumns.map((column) => <div key={column.key}>{renderPublicCell(row, column)}</div>)}
                      </div>
                    )) : <div className="public-calendar-empty">No events scheduled</div>}
                  </div>
                </article>
              );
            })}
            </div>
          </section>
        ))}
        {!rows.length && <div className="public-calendar-no-results">No milestones yet.</div>}
      </section>
    );
  }

  return (
    <>
      <div className="client-table-shell overflow-hidden rounded-xl border shadow-2xl">
        <div className="client-table-scroll max-h-[calc(100vh-15rem)] overflow-auto">
          <table className="client-planning-table border-collapse text-sm" style={{ width: tableWidth, minWidth: tableWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {showWeekColumn && <col className="w-[58px]" />}
              {hasRowDrag && <col className="w-[38px]" />}
              <col style={{ width: dateWidth }} />
              {orderedColumns.map((column) => {
                const width = widthForColumn(column);
                return <col key={column.key} style={column.key === 'notes' ? { width, minWidth: width, maxWidth: width } : { width }} />;
              })}
            </colgroup>
            {showHeader && <thead className="bg-zinc-100 text-left text-xs uppercase text-ink-500 dark:bg-ink-850">
              <tr>
                {showWeekColumn && <th className="sticky-week px-2 py-3 text-center font-semibold"></th>}
                {hasRowDrag && <th className="px-1 py-3" aria-label="Select and drag rows"></th>}
                <th className="client-column-header relative px-3 py-3 font-semibold">
                  Date
                  <button type="button" onPointerDown={(event) => startResize(event, 'date')} className="client-column-resize-handle" aria-label="Resize Date" />
                </th>
                {orderedColumns.map((column) => (
                  <th
                    key={column.key}
                    data-client-column={column.key}
                    draggable
                    onDragStart={(event) => {
                      setDraggedColumn(column.key);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => {
                      setDraggedColumn(null);
                      setDragTarget(null);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      setDragTarget({ key: column.key, side: event.clientX > rect.left + rect.width / 2 ? 'after' : 'before' });
                    }}
                    onDragLeave={() => {
                      if (dragTarget?.key === column.key) setDragTarget(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const side = dragTarget?.key === column.key ? dragTarget.side : 'before';
                      moveColumn(column.key, side);
                      setDraggedColumn(null);
                      setDragTarget(null);
                    }}
                    className={`client-column-header relative px-4 py-3 font-semibold ${draggedColumn === column.key ? 'is-dragging' : ''}`}
                  >
                    {dragTarget?.key === column.key && <span className={`client-column-drop-line ${dragTarget.side === 'after' ? 'is-after' : 'is-before'}`} />}
                    <span className="inline-flex items-center gap-2">
                      {(() => {
                        const ColumnIcon = CLIENT_COLUMN_ICONS[column.key];
                        return ColumnIcon ? <ColumnIcon className="client-column-icon" size={14} aria-hidden="true" /> : null;
                      })()}
                      {column.label}
                    </span>
                    <button type="button" onPointerDown={(event) => startResize(event, column.key)} className="client-column-resize-handle" aria-label={`Resize ${column.label}`} />
                  </th>
                ))}
              </tr>
            </thead>}
            {!headerOnly && <tbody>
              {rows.map((row, index) => (
                <Fragment key={`${row._item?.id ?? row._dateKey}-${index}`}>
                  {showWeekColumn && row._showWeek && (
                    <tr className="client-week-heading-row">
                      <td colSpan={2 + orderedColumns.length + (hasRowDrag ? 1 : 0)}>
                        <span>Week {row.Week}</span>
                        <b>/</b>
                        <span>{clientWeekRange(row._dateKey)}</span>
                      </td>
                    </tr>
                  )}
                  {!showWeekColumn && row._showWeekDivider && (
                    <tr className="client-week-separator-row">
                      <td colSpan={1 + orderedColumns.length + (hasRowDrag ? 1 : 0)}>
                        <span><CalendarDays size={16} /> Week{row.Week}</span>
                      </td>
                    </tr>
                  )}
                  <tr
                    onClick={(event) => {
                      if (!row._item || event.target.closest('button, input, select, textarea, a')) return;
                      selectRow(event, row._item.id);
                    }}
                    onDragOver={hasRowDrag ? (event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      setRowDropDate(row._dateKey);
                    } : undefined}
                    onDragLeave={hasRowDrag ? (event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) setRowDropDate('');
                    } : undefined}
                    onDrop={hasRowDrag ? (event) => dropRows(event, row._dateKey) : undefined}
                    className={`${row._isWeekend ? 'bg-zinc-200/70 dark:bg-white/[0.07]' : ''} ${row._isToday ? 'today-row' : ''} ${row._item?.row_color ? `client-row-color-${row._item.row_color}` : ''} ${row._item && selectedRowIdSet.has(row._item.id) ? 'client-row-selected' : ''} ${rowDropDate === row._dateKey ? 'client-row-drop-target' : ''} border-t border-black/5 dark:border-white/5`}
                  >
                    {showWeekColumn && row._showWeek && (
                      <td rowSpan={row._weekRowSpan} className="week-cell sticky-week px-1 py-2 align-middle font-mono text-[1.5em]">
                        <span><em>WEEK</em>{row.Week}</span>
                      </td>
                    )}
                    {hasRowDrag && (
                      <td className="client-row-drag-cell px-1 py-2 text-center">
                        {row._item && (
                          <button
                            type="button"
                            draggable
                            onClick={(event) => {
                              event.stopPropagation();
                              selectRow(event, row._item.id);
                            }}
                            onDragStart={(event) => startRowDrag(event, row._item.id)}
                            onDragEnd={() => setRowDropDate('')}
                            className={`client-row-drag-handle ${selectedRowIdSet.has(row._item.id) ? 'is-selected' : ''}`}
                            aria-label={`Select and drag ${row.Asset || 'planning row'}`}
                            title="Click to select. Shift-click for multiple rows. Drag to another date."
                          >
                            <GripVertical size={15} />
                          </button>
                        )}
                      </td>
                    )}
                    {row._showDateGroup && (
                      <td rowSpan={row._dateRowSpan} className={`date-group-cell p-0 font-semibold ${row._isWeekend ? 'date-weekend-cell' : ''} ${row._isToday ? 'date-today-cell' : ''}`}>
                        <span className="date-group-chip combined-date-chip">
                          {row._isToday && <span className="date-today-tag">Today</span>}
                          <span className="date-day-name">{row.Day}</span>
                          <strong>{row.Date}</strong>
                        </span>
                      </td>
                    )}
                    {orderedColumns.map((column) => {
                      const hiddenBooking = row._item && row._item.who?.some((id) => hiddenWhoIds.includes(id));
                      if (hiddenBooking) return <td key={column.key} data-client-column={column.key} className="px-4 py-3"></td>;
                      if (column.key === 'edit') return <td key={column.key} data-client-column={column.key} className="px-3 py-3">{row._item && onUpdateLineItem ? <button type="button" onClick={() => setEditingItemId(row._item.id)} className="client-edit-button">Edit</button> : null}</td>;
                      if (column.key === 'calendar') return (
                        <td key={column.key} data-client-column={column.key} className="px-3 py-3">
                          {row._item ? (
                            <a className="client-calendar-button" href={googleCalendarUrl(row)} target="_blank" rel="noreferrer">
                              Add to calendar
                            </a>
                          ) : null}
                        </td>
                      );
                      if (column.key === 'category') return (
                        <td key={column.key} data-client-column={column.key} className="px-4 py-3 text-sm font-semibold text-ink-400">
                          {row._item ? <span className="client-category-pill" style={categoryShade(categoryKeyForItem(row._item), categories)}>{row.Category}</span> : ''}
                        </td>
                      );
                      if (column.key === 'time') return (
                        <td key={column.key} data-client-column={column.key} className="px-2 py-2 font-mono">
                          {row._item ? (isProduction && onUpdateLineItem ? (
                            <div className="client-inline-time-control">
                              <input
                                value={row._item.time ?? ''}
                                onChange={(event) => onUpdateLineItem(row._item.id, { time: normalizeTimeInput(event.target.value) })}
                                onBlur={() => onFlushLineItem?.(row._item.id)}
                                className="field !h-9 !py-1 pl-2 pr-6 font-mono text-sm"
                                placeholder="HH:MM"
                                inputMode="numeric"
                                readOnly={['ALL DAY', 'EOD', 'TBC'].includes(row._item.time)}
                              />
                              <ChevronDown className="client-inline-time-arrow" size={12} aria-hidden="true" />
                              <select
                                className="client-inline-time-select"
                                value={['ALL DAY', 'EOD', 'TBC'].includes(row._item.time) ? row._item.time : 'TIME'}
                                onChange={(event) => {
                                  const option = event.target.value;
                                  const time = option === 'TIME'
                                    ? (['ALL DAY', 'EOD', 'TBC'].includes(row._item.time) ? '' : row._item.time ?? '')
                                    : option;
                                  onUpdateLineItem(row._item.id, { time });
                                  onFlushLineItem?.(row._item.id);
                                }}
                                aria-label="Choose time type"
                              >
                                <option value="ALL DAY">ALL DAY</option>
                                <option value="EOD">EOD</option>
                                <option value="TBC">TBC</option>
                                <option value="TIME">TIME</option>
                              </select>
                            </div>
                          ) : (row.Time || '-')) : ''}
                        </td>
                      );
                      if (column.key === 'who') return (
                        <td key={column.key} data-client-column={column.key} className="px-2 py-2">
                          {row._item ? (isProduction && onUpdateLineItem ? (
                            <LabelSelect
                              labels={labelsByType.who}
                              value={row._item.who ?? []}
                              multiple
                              multipleModeToggle
                              placeholder="Who"
                              onChange={(who) => onUpdateLineItem(row._item.id, { who })}
                              onAddLabel={(value, color) => onAddLabel?.(project.id, 'who', value, color, { planningType })}
                            />
                          ) : <div className="flex flex-wrap gap-1">{row._item.who.map((id) => <Pill key={id} label={labelsById[id]} />)}</div>) : null}
                        </td>
                      );
                      if (column.key === 'asset') return <td key={column.key} data-client-column={column.key} className="overflow-hidden px-4 py-3">{row._item ? <span className="block min-w-0"><span className="block truncate font-semibold">{row.Asset || '-'}</span><span className="mt-0.5 block truncate text-[0.68rem] font-semibold uppercase tracking-wide text-ink-500">{row.Category}</span></span> : null}</td>;
                      if (column.key === 'what') return (
                        <td key={column.key} data-client-column={column.key} className="px-2 py-2">
                          {row._item ? (isProduction && onUpdateLineItem ? (
                            <input
                              value={row._item.asset ?? ''}
                              onChange={(event) => onUpdateLineItem(row._item.id, { asset: event.target.value })}
                              onBlur={() => onFlushLineItem?.(row._item.id)}
                              className="field !h-9 !px-2 !py-1 text-sm font-semibold"
                              placeholder="What"
                            />
                          ) : (isProduction ? <span className="font-semibold">{row.What || '-'}</span> : <Pill label={labelsById[row._item.what]} />)) : null}
                        </td>
                      );
                      if (column.key === 'todo') return (
                        <td key={column.key} data-client-column={column.key} className="px-2 py-2">
                          {row._item ? (isProduction && onUpdateLineItem ? (
                            <LabelSelect
                              labels={labelsByType.todo}
                              value={row._item.todo}
                              placeholder="Todo"
                              onChange={(todo) => onUpdateLineItem(row._item.id, { todo })}
                              onAddLabel={(value, color) => onAddLabel?.(project.id, 'todo', value, color, { planningType })}
                            />
                          ) : <Pill label={labelsById[row._item.todo]} subtle />) : null}
                        </td>
                      );
                      if (column.key === 'notes') return (
                        <td key={column.key} data-client-column={column.key} className="client-notes-cell min-w-0 px-2 py-2" style={{ width: widthForColumn(column), maxWidth: widthForColumn(column) }}>
                          {row._item ? (isProduction && onUpdateLineItem ? (
                            <input
                              value={row._item.notes ?? ''}
                              onChange={(event) => onUpdateLineItem(row._item.id, { notes: event.target.value })}
                              onBlur={() => onFlushLineItem?.(row._item.id)}
                              className="field !h-9 !px-2 !py-1 text-sm"
                              placeholder="Notes"
                            />
                          ) : (row._item.notes ? <OverflowNote note={row._item.notes} onOpen={() => setEditingItemId(row._item.id)} /> : null)) : null}
                        </td>
                      );
                      return null;
                    })}
                  </tr>
                </Fragment>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={(showWeekColumn ? 2 : 1) + orderedColumns.length} className="px-4 py-10 text-center text-ink-500">No milestones yet.</td>
                </tr>
              )}
            </tbody>}
          </table>
        </div>
      </div>
      {editingItem && onUpdateLineItem && (
        <div className="fixed inset-0 z-[700] grid place-items-center bg-black/60 p-5" onMouseDown={() => setEditingItemId(null)}>
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-white/10 bg-ink-900 p-4 shadow-glow" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-ink-100">Edit planning row</h2>
                <p className="mt-1 text-sm text-ink-500">{editingItem.end_date ? format(parseISO(editingItem.end_date), 'EEEE, d MMMM yyyy') : 'Client planning row'}</p>
              </div>
              <button type="button" onClick={() => setEditingItemId(null)} className="icon-button">x</button>
            </div>
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-500">Who</span>
                <LabelSelect labels={labelsByType.who} value={editingItem.who ?? []} multiple multipleModeToggle placeholder="Who" onChange={(who) => onUpdateLineItem(editingItem.id, { who })} onAddLabel={(value, color) => onAddLabel?.(project.id, 'who', value, color)} />
              </label>
              {isProduction && <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-500">What</span>
                <input
                  value={editingItem.asset ?? ''}
                  onChange={(event) => onUpdateLineItem(editingItem.id, { asset: event.target.value })}
                  onBlur={() => onFlushLineItem?.(editingItem.id)}
                  className="w-full rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-accent-400"
                  placeholder="What"
                />
              </label>}
              {!isProduction && <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-500">What</span>
                <LabelSelect labels={labelsByType.what} value={editingItem.what} placeholder="What" onChange={(what) => onUpdateLineItem(editingItem.id, { what })} onAddLabel={(value, color) => onAddLabel?.(project.id, 'what', value, color)} />
              </label>}
              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-500">Todo</span>
                <LabelSelect labels={labelsByType.todo} value={editingItem.todo} placeholder="Todo" onChange={(todo) => onUpdateLineItem(editingItem.id, { todo })} onAddLabel={(value, color) => onAddLabel?.(project.id, 'todo', value, color)} />
              </label>
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-500">Time</span>
                <div className="flex items-stretch gap-2">
                  <input
                    value={editingItem.time === 'EOD' ? '' : editingItem.time ?? ''}
                    onChange={(event) => onUpdateLineItem(editingItem.id, { time: normalizeTimeInput(event.target.value) })}
                    onBlur={() => onFlushLineItem?.(editingItem.id)}
                    className="min-w-0 flex-1 rounded-md border border-white/10 bg-ink-950 px-3 py-2 font-mono text-sm text-ink-100 outline-none focus:border-accent-400"
                    placeholder="HH:MM"
                    inputMode="numeric"
                  />
                  <button type="button" onClick={() => onUpdateLineItem(editingItem.id, { time: 'EOD' })} className="secondary-button shrink-0">Set EOD</button>
                </div>
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-500">Notes</span>
              <textarea
                value={editingItem.notes ?? ''}
                onChange={(event) => onUpdateLineItem(editingItem.id, { notes: event.target.value })}
                onBlur={() => onFlushLineItem?.(editingItem.id)}
                className="min-h-24 w-full resize-y rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-accent-400"
                placeholder="Add notes for this client planning row..."
              />
              </label>
            </div>
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => setEditingItemId(null)} className="primary-button">Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ClientGanttChart({ project, lineItems, labels, categories, uncategorizedName = 'Uncategorized', categoryMode = 'column', collapsedCategoryKeys = [], onToggleCategory, dateWindow = 'future', compact = false, planningType = DEFAULT_PLANNING_TYPE }) {
  const isProduction = safePlanningType(planningType) === PLANNING_TYPES.production.key;
  const labelsById = useMemo(() => Object.fromEntries(labels.map((label) => [label.id, label])), [labels]);
  const bookings = useMemo(() => {
    const today = new Date();
    const minKey = dateWindow === 'full' ? null : format(dateWindow === 'pastWeek' ? addDays(today, -7) : today, 'yyyy-MM-dd');
    return lineItems
      .filter((item) => item.project_id === project.id && item.start_date && item.end_date)
      .filter((item) => !minKey || item.end_date >= minKey)
      .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.sort_order - b.sort_order);
  }, [dateWindow, project.id, lineItems]);
  const days = useMemo(() => filterDaysByDateWindow(dateRangeFromBookings(bookings), dateWindow), [bookings, dateWindow]);
  const categoriesById = useMemo(() => Object.fromEntries(categories.filter((category) => category.project_id === project.id).map((category) => [category.id, category])), [categories, project.id]);
  const bookingGroups = useMemo(() => {
    if (categoryMode !== 'sections') return [{ key: 'all', name: '', items: bookings }];
    const groups = new Map();
    bookings.forEach((item) => {
      const key = categoryKeyForItem(item);
      if (!groups.has(key)) groups.set(key, { key, name: categoryNameForItem(item, categoriesById, uncategorizedName), items: [] });
      groups.get(key).items.push(item);
    });
    return [...groups.values()].sort((a, b) => {
      const aOrder = a.key === 'uncategorized' ? 99999 : categoriesById[a.key]?.sort_order ?? 9999;
      const bOrder = b.key === 'uncategorized' ? 99999 : categoriesById[b.key]?.sort_order ?? 9999;
      return aOrder - bOrder || a.name.localeCompare(b.name);
    });
  }, [bookings, categoriesById, categoryMode, uncategorizedName]);
  const dayWidth = compact ? 47 : 58;
  const leftWidth = compact ? 258 : 320;
  const whoWidth = compact ? 89 : 110;
  const bookingInset = 4;
  const dateBadgeInset = compact ? 5 : 7;
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const todayIndex = days.findIndex((day) => format(day, 'yyyy-MM-dd') === todayKey);
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
        <div className="relative" style={{ minWidth: leftWidth + days.length * dayWidth }}>
          {todayIndex >= 0 && <span className="client-gantt-today-line" style={{ left: leftWidth + todayIndex * dayWidth + dayWidth / 2 }} aria-hidden="true" />}
          <div className="sticky top-0 z-20 grid bg-zinc-100 dark:bg-ink-850" style={{ gridTemplateColumns: `${leftWidth}px ${days.length * dayWidth}px` }}>
            <div className="sticky left-0 z-30 grid border-b border-r border-black/10 bg-zinc-100 text-xs font-semibold uppercase text-ink-500 dark:border-white/10 dark:bg-ink-850" style={{ gridTemplateColumns: `${whoWidth}px 1fr` }}>
              <span className="px-4 py-5">Who</span>
              <span className="px-4 py-5">{isProduction ? 'What' : 'Asset'}</span>
            </div>
            <div>
              <div className="flex h-5 border-b border-black/10 text-center font-mono text-[0.55rem] font-semibold text-ink-500 dark:border-white/10">
                {weeks.map((week) => <div key={week.key} className="grid place-items-center border-r border-black/5 dark:border-white/5" style={{ width: week.span * dayWidth }}>{week.label}</div>)}
              </div>
              <div className="flex h-9 border-b border-black/10 text-center font-mono text-xs text-ink-500 dark:border-white/10">
                {days.map((day) => (
                  <div key={day.toISOString()} className={`grid place-items-center border-r border-black/5 dark:border-white/5 ${isWeekend(day) ? 'bg-black/[0.04] dark:bg-white/[0.055]' : ''} ${format(day, 'yyyy-MM-dd') === todayKey ? 'client-gantt-today-cell' : ''}`} style={{ width: dayWidth }}>
                    {format(day, 'd')}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {bookingGroups.map((group) => (
            <div key={group.key}>
              {categoryMode === 'sections' && (
                <button type="button" onClick={() => onToggleCategory?.(group.key)} className="client-gantt-category-row grid" style={{ gridTemplateColumns: `${leftWidth}px ${days.length * dayWidth}px` }}>
                  <span className="sticky left-0 z-20 flex items-center gap-2 border-r border-black/10 bg-white px-3 py-2 text-sm font-bold dark:border-white/10 dark:bg-ink-900">
                    {collapsedCategoryKeys.includes(group.key) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                    {group.name}
                  </span>
                  <span />
                </button>
              )}
              {!collapsedCategoryKeys.includes(group.key) && group.items.map((item) => {
                const itemStart = parseISO(item.start_date);
                const itemEnd = parseISO(item.end_date);
                const visibleStart = max([itemStart, days[0]]);
                const visibleEnd = min([itemEnd, days.at(-1)]);
                const offset = differenceInCalendarDays(visibleStart, days[0]);
                const duration = Math.max(1, differenceInCalendarDays(visibleEnd, visibleStart) + 1);
                const what = isProduction ? null : labelsById[item.what];
                const todo = labelsById[item.todo];
                const category = item.category_id ? categoriesById[item.category_id]?.name : uncategorizedName;
                const blockColor = labelsById[item.who?.[0]]?.color ?? what?.color ?? '#6d5dfc';
                return (
                  <div key={item.id} className="client-gantt-row grid" style={{ gridTemplateColumns: `${leftWidth}px ${days.length * dayWidth}px` }}>
                    <div className="sticky left-0 z-10 grid border-r border-black/10 bg-white dark:border-white/10 dark:bg-ink-900" style={{ gridTemplateColumns: `${whoWidth}px 1fr` }}>
                      <div className="flex flex-wrap content-center gap-1 px-3 py-3">{item.who.map((id) => <Pill key={id} label={labelsById[id]} />)}</div>
                      <div className="min-w-0 px-3 py-3">
                        <div className="truncate text-sm font-semibold">{item.asset || '-'}</div>
                        <div className="truncate text-[0.65rem] text-ink-500">{category}</div>
                      </div>
                    </div>
                    <div className="relative min-h-14">
                      {days.map((day) => <div key={day.toISOString()} className={`client-gantt-day ${isWeekend(day) ? 'is-weekend' : ''} ${format(day, 'yyyy-MM-dd') === todayKey ? 'is-today' : ''}`} style={{ width: dayWidth }} />)}
                      <div className="client-gantt-booking" style={{ left: offset * dayWidth + bookingInset, width: duration * dayWidth - bookingInset * 2, '--client-gantt-color': blockColor }}>
                        <span className="client-gantt-booking-day is-last" style={{ left: (duration - 1) * dayWidth + dateBadgeInset }}>
                          <strong>{format(visibleEnd, 'd')}</strong>
                          <em>{format(visibleEnd, 'MMM')}</em>
                        </span>
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
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ClientTableView({ project, planningType = DEFAULT_PLANNING_TYPE, planningVersion = 'V1' }) {
  const { lineItems, labels, categories, shareLinks, createShareLink, revokeShareLink, updateLineItem, flushLineItemUpdate, addCategory, deleteCategory, reorderCategories, addLineItem, deleteLineItem, addLabel } = usePlanner();
  const activePlanningType = safePlanningType(planningType);
  const tableOnlyProduction = activePlanningType === PLANNING_TYPES.production.key && project.production_planning_view === 'table';
  const planningDefinition = PLANNING_TYPES[activePlanningType] ?? PLANNING_TYPES.post;
  const activeShare = shareLinks.find((share) => share.project_id === project.id && share.page_type === 'client_planning' && safePlanningType(share.planning_type) === activePlanningType && (share.planning_version ?? 'V1') === planningVersion && !share.revoked_at);
  const initialFilterPrefs = useRef(readClientFilterPrefs(project.id, activePlanningType, planningVersion));
  const [showEmptyDates, setShowEmptyDates] = useState(initialFilterPrefs.current.showEmptyDates);
  const [dateWindow, setDateWindow] = useState(initialFilterPrefs.current.dateWindow);
  const [showWennekerBookings, setShowWennekerBookings] = useState(initialFilterPrefs.current.showWennekerBookings);
  const [showClientBookings, setShowClientBookings] = useState(initialFilterPrefs.current.showClientBookings);
  const [hiddenCategoryKeys, setHiddenCategoryKeys] = useState(initialFilterPrefs.current.hiddenCategoryKeys);
  const [collapsedCategoryKeys, setCollapsedCategoryKeys] = useState(initialFilterPrefs.current.collapsedCategoryKeys);
  const [columnPrefs, setColumnPrefs] = useState(() => readClientColumnPrefs());
  const [viewMode, setViewMode] = useState(() => readClientViewMode(project.id));
  const uncategorizedNames = useMemo(() => readLocalObject(UNCATEGORIZED_NAME_STORAGE_KEY, {}), []);
  const [publishedUrl, setPublishedUrl] = useState(() => activeShare?.token
    ? `${window.location.origin}/share/${slugifyProjectName(project.name)}-${activeShare.token}`
    : readClientPublishedUrl(project.id, activePlanningType, planningVersion));
  const [publishing, setPublishing] = useState(false);
  const [publishValidationIssues, setPublishValidationIssues] = useState([]);
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
  const [createPlanningOpen, setCreatePlanningOpen] = useState(false);
  const [planningDraft, setPlanningDraft] = useState({ categoryId: '', asset: '', startDate: '', endDate: '' });
  const [sameCategoryRanges, setSameCategoryRanges] = useState(true);
  const [categoryDateRanges, setCategoryDateRanges] = useState({});
  const [draggedCategoryId, setDraggedCategoryId] = useState(null);
  const [categoryDropTarget, setCategoryDropTarget] = useState(null);
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const expandedProductionRangeIds = useRef(new Set());
  const planningViewRef = useRef(null);
  const uncategorizedName = uncategorizedNames[project.id] || 'Uncategorized';
  const whoFilterIds = useMemo(() => ({
    wenneker: labels.find((label) => label.column_type === 'who' && label.value.toLowerCase() === 'wenneker')?.id,
    client: labels.find((label) => label.column_type === 'who' && label.value.toLowerCase() === 'client')?.id,
  }), [labels]);
  const versionLineItems = useMemo(() => lineItems.filter((item) => item.project_id === project.id && safePlanningType(item.planning_type) === activePlanningType && (item.planning_version ?? 'V1') === planningVersion), [activePlanningType, lineItems, planningVersion, project.id]);
  const versionCategories = useMemo(() => categories.filter((category) => category.project_id === project.id && safePlanningType(category.planning_type) === activePlanningType && (category.planning_version ?? 'V1') === planningVersion), [activePlanningType, categories, planningVersion, project.id]);
  const moveRowsToDate = useCallback((sourceId, itemIds, targetDate) => {
    const source = versionLineItems.find((item) => item.id === sourceId);
    const sourceAnchor = source?.end_date || source?.start_date;
    if (!source || !sourceAnchor || !targetDate) return;

    const dayOffset = differenceInCalendarDays(parseISO(targetDate), parseISO(sourceAnchor));
    const movingIds = [...new Set(itemIds)].filter((itemId) => versionLineItems.some((item) => item.id === itemId));
    movingIds.forEach((itemId) => {
      const item = versionLineItems.find((entry) => entry.id === itemId);
      if (!item) return;
      const patch = {};
      if (item.start_date) patch.start_date = format(addDays(parseISO(item.start_date), dayOffset), 'yyyy-MM-dd');
      if (item.end_date) patch.end_date = format(addDays(parseISO(item.end_date), dayOffset), 'yyyy-MM-dd');
      if (!item.start_date && !item.end_date) {
        patch.start_date = targetDate;
        patch.end_date = targetDate;
      }
      updateLineItem(item.id, patch);
    });
    setSelectedRowIds(movingIds);
  }, [updateLineItem, versionLineItems]);

  useEffect(() => {
    setSelectedRowIds([]);
  }, [activePlanningType, planningVersion, project.id]);

  useEffect(() => {
    if (!tableOnlyProduction) return;
    versionLineItems.forEach((item) => {
      if (!item.start_date || !item.end_date || item.start_date >= item.end_date || expandedProductionRangeIds.current.has(item.id)) return;
      expandedProductionRangeIds.current.add(item.id);
      const dates = eachDayOfInterval({ start: parseISO(item.start_date), end: parseISO(item.end_date) }).map((day) => format(day, 'yyyy-MM-dd'));
      const sharedValues = {
        who: [...(item.who ?? [])],
        asset: item.asset ?? '',
        what: item.what ?? '',
        todo: item.todo ?? '',
        time: item.time ?? '',
        notes: item.notes ?? '',
        row_color: item.row_color ?? '',
      };
      updateLineItem(item.id, { start_date: dates[0], end_date: dates[0] });
      dates.slice(1).forEach((date) => {
        addLineItem(project.id, item.category_id, date, { ...sharedValues, start_date: date, end_date: date }, planningVersion, activePlanningType);
      });
    });
  }, [activePlanningType, addLineItem, planningVersion, project.id, tableOnlyProduction, updateLineItem, versionLineItems]);
  const categoriesById = useMemo(() => Object.fromEntries(versionCategories.map((category) => [category.id, category])), [versionCategories]);
  const bookingFilteredLineItems = useMemo(() => versionLineItems.filter((item) => {
    if (!showWennekerBookings && whoFilterIds.wenneker && item.who?.includes(whoFilterIds.wenneker)) return false;
    if (!showClientBookings && whoFilterIds.client && item.who?.includes(whoFilterIds.client)) return false;
    return true;
  }), [showClientBookings, showWennekerBookings, versionLineItems, whoFilterIds]);
  const filteredLineItems = useMemo(() => bookingFilteredLineItems.filter((item) => {
    if (hiddenCategoryKeys.includes(categoryKeyForItem(item))) return false;
    return true;
  }), [bookingFilteredLineItems, hiddenCategoryKeys]);
  const exportRows = useMemo(
    () => clientPlanningExportRows(project, filteredLineItems, labels, versionCategories, showEmptyDates, uncategorizedName, dateWindow, activePlanningType),
    [project, filteredLineItems, labels, versionCategories, showEmptyDates, uncategorizedName, dateWindow, activePlanningType],
  );
  const categoryGroupsFor = useCallback((items) => {
    const groups = new Map();
    items.forEach((item) => {
      const key = categoryKeyForItem(item);
      if (!groups.has(key)) groups.set(key, { key, name: categoryNameForItem(item, categoriesById, uncategorizedName), items: [] });
      groups.get(key).items.push(item);
    });
    return [...groups.values()].sort((a, b) => {
      const aOrder = a.key === 'uncategorized' ? 99999 : categoriesById[a.key]?.sort_order ?? 9999;
      const bOrder = b.key === 'uncategorized' ? 99999 : categoriesById[b.key]?.sort_order ?? 9999;
      return aOrder - bOrder || a.name.localeCompare(b.name);
    });
  }, [categoriesById, uncategorizedName]);
  const categoryGroups = useMemo(() => {
    const groups = categoryGroupsFor(filteredLineItems);
    versionCategories.forEach((category) => {
      if (!hiddenCategoryKeys.includes(category.id) && !groups.some((group) => group.key === category.id)) {
        groups.push({ key: category.id, name: category.name, items: [] });
      }
    });
    return groups.sort((a, b) => {
      const aOrder = a.key === 'uncategorized' ? 99999 : categoriesById[a.key]?.sort_order ?? 9999;
      const bOrder = b.key === 'uncategorized' ? 99999 : categoriesById[b.key]?.sort_order ?? 9999;
      return aOrder - bOrder || a.name.localeCompare(b.name);
    });
  }, [categoriesById, categoryGroupsFor, filteredLineItems, hiddenCategoryKeys, versionCategories]);
  const categoryFilterGroups = useMemo(() => categoryGroupsFor(bookingFilteredLineItems), [bookingFilteredLineItems, categoryGroupsFor]);

  const validateRowsForPublishing = () => {
    const rowIssues = versionLineItems.map((item) => {
      const missing = [];
      if (!Array.isArray(item.who) || !item.who.length) missing.push('Who');
      if (!String(item.asset ?? '').trim()) missing.push(activePlanningType === 'production' ? 'What' : 'Asset');
      if (activePlanningType !== 'production' && !item.what) missing.push('What');
      if (!item.todo) missing.push('Todo');
      if (!String(item.time ?? '').trim()) missing.push('Time');
      if (!missing.length) return null;
      return {
        id: item.id,
        sortKey: item.end_date ?? '9999-12-31',
        date: item.end_date ? format(parseISO(item.end_date), 'EEEE, d MMM yyyy') : 'No end date',
        asset: String(item.asset ?? '').trim() || 'Untitled row',
        category: categoryNameForItem(item, categoriesById, uncategorizedName),
        missing,
      };
    }).filter(Boolean);
    const defaultCategoryName = planningDefinition.defaultCategoryName.trim().toLowerCase();
    const categoryIssues = activePlanningType === 'production' || versionCategories.length <= 1 ? [] : versionCategories
      .filter((category) => {
        const name = String(category.name ?? '').trim();
        return name.toLowerCase() === defaultCategoryName || /^category\s+\d+$/i.test(name);
      })
      .map((category) => ({
        id: `category-${category.id}`,
        sortKey: `0000-${String(category.sort_order ?? 0).padStart(5, '0')}`,
        date: 'Category',
        asset: category.name,
        category: 'Default name has not been changed',
        missing: ['Category name'],
      }));
    return [...categoryIssues, ...rowIssues].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  };

  const publish = async () => {
    if (!tableOnlyProduction) {
      const issues = validateRowsForPublishing();
      if (issues.length) {
        setPublishValidationIssues(issues);
        return;
      }
    }
    setPublishing(true);
    try {
      const token = await createShareLink(project.id, activePlanningType, planningVersion);
      const url = `${window.location.origin}/share/${slugifyProjectName(project.name)}-${token}`;
      setPublishedUrl(url);
      localStorage.setItem(clientPublishedUrlStorageKey(project.id, activePlanningType, planningVersion), url);
      await navigator.clipboard?.writeText(url);
    } finally {
      setPublishing(false);
    }
  };

  const unpublish = async () => {
    setPublishing(true);
    try {
      await revokeShareLink(project.id, activePlanningType, planningVersion);
      localStorage.removeItem(clientPublishedUrlStorageKey(project.id, activePlanningType, planningVersion));
      setPublishedUrl('');
      setShowUnpublishConfirm(false);
    } finally {
      setPublishing(false);
    }
  };

  const updateColumnPrefs = (nextPrefs) => {
    setColumnPrefs(nextPrefs);
    localStorage.setItem(CLIENT_COLUMN_STORAGE_KEY, JSON.stringify(nextPrefs));
  };
  const changeViewMode = (nextMode) => {
    setViewMode(nextMode);
    localStorage.setItem(`${CLIENT_VIEW_MODE_STORAGE_KEY}:${project.id}`, nextMode);
  };

  useEffect(() => {
    setViewMode(readClientViewMode(project.id));
  }, [project.id]);

  useEffect(() => {
    if (tableOnlyProduction && viewMode !== 'table') setViewMode('table');
  }, [tableOnlyProduction, viewMode]);

  useEffect(() => {
    if (!tableOnlyProduction || columnPrefs.visible.edit !== false) return;
    updateColumnPrefs({ ...columnPrefs, visible: { ...columnPrefs.visible, edit: true } });
  }, [columnPrefs, tableOnlyProduction]);

  useEffect(() => {
    localStorage.setItem(clientFilterStorageKey(project.id, activePlanningType, planningVersion), JSON.stringify({
      showEmptyDates,
      dateWindow,
      showWennekerBookings,
      showClientBookings,
      hiddenCategoryKeys,
      collapsedCategoryKeys,
    }));
  }, [activePlanningType, collapsedCategoryKeys, dateWindow, hiddenCategoryKeys, planningVersion, project.id, showClientBookings, showEmptyDates, showWennekerBookings]);

  const toggleCollapsedCategory = (key) => {
    setCollapsedCategoryKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const toggleHiddenCategory = (key) => {
    setHiddenCategoryKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const scrollToToday = () => {
    const todayTarget = planningViewRef.current?.querySelector(viewMode === 'gantt' ? '.client-gantt-today-cell' : '.today-row');
    todayTarget?.scrollIntoView({ behavior: 'smooth', block: viewMode === 'gantt' ? 'nearest' : 'start', inline: viewMode === 'gantt' ? 'center' : 'nearest' });
  };

  const createTablePlanning = (event) => {
    event.preventDefault();
    const ranges = versionCategories.map((category) => ({
      category,
      range: sameCategoryRanges
        ? { startDate: planningDraft.startDate, endDate: planningDraft.endDate }
        : categoryDateRanges[category.id],
    }));
    if (!ranges.length || ranges.some(({ range }) => !range?.startDate || !range?.endDate)) return;
    ranges.forEach(({ category, range }) => {
      const selectedDates = eachDayOfInterval({ start: parseISO(range.startDate), end: parseISO(range.endDate) }).map((day) => format(day, 'yyyy-MM-dd'));
      const selectedDateSet = new Set(selectedDates);
      const categoryItems = versionLineItems.filter((item) => item.category_id === category.id);
      const existingDateSet = new Set(categoryItems.map((item) => item.end_date).filter(Boolean));
      categoryItems.forEach((item) => {
        if (!selectedDateSet.has(item.end_date)) deleteLineItem(item.id);
      });
      selectedDates.filter((date) => !existingDateSet.has(date)).forEach((date) => {
        addLineItem(project.id, category.id, date, {
          asset: '',
          start_date: date,
          end_date: date,
        }, planningVersion, activePlanningType);
      });
    });
    setCreatePlanningOpen(false);
    setPlanningDraft({ categoryId: planningDraft.categoryId, asset: '', startDate: '', endDate: '' });
  };

  return (
    <main ref={planningViewRef} className={`client-planning-admin mx-auto flex min-h-[calc(100vh-5rem)] max-w-[1400px] flex-col gap-4 px-4 pb-4 ${tableOnlyProduction ? 'production-table-compact' : ''}`}>
      {(viewMode === 'table' || viewMode === 'gantt') && (
        <div className="client-filter-row client-control-toolbar rounded-xl border p-3 text-sm">
          <div className="client-toolbar-download">
            <button type="button" onClick={() => downloadPlanningExcel(project, exportRows)} className="client-download-action" disabled={!exportRows.length}>
              <Download size={17} /> Download Excel
            </button>
          </div>
          <div className="client-toolbar-filters">
            <div className="client-filter-group flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-bold uppercase tracking-[0.16em] text-ink-500">Filter</span>
              <button type="button" onClick={() => setShowWennekerBookings((next) => !next)} className={`client-filter-pill ${showWennekerBookings ? 'is-active' : ''}`}>
                {showWennekerBookings ? <Eye size={14} /> : <EyeOff size={14} />} Wenneker
              </button>
              <button type="button" onClick={() => setShowClientBookings((next) => !next)} className={`client-filter-pill ${showClientBookings ? 'is-active' : ''}`}>
                {showClientBookings ? <Eye size={14} /> : <EyeOff size={14} />} Client
              </button>
              {viewMode === 'table' && (
                <>
                  <button type="button" onClick={() => setShowEmptyDates((next) => !next)} className={`client-filter-pill ${showEmptyDates ? 'is-active' : ''}`}>
                    {showEmptyDates ? <Eye size={14} /> : <EyeOff size={14} />} Empty dates
                  </button>
                  <button type="button" onClick={scrollToToday} className="client-filter-pill client-today-button">
                    <CalendarDays size={14} /> Today
                  </button>
                </>
              )}
            </div>
            <div className="client-filter-group flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-bold uppercase tracking-[0.16em] text-ink-500">Planning</span>
              <button type="button" onClick={() => setDateWindow('future')} className={`client-filter-pill ${dateWindow === 'future' ? 'is-active' : ''}`}>
                From current
              </button>
              <button type="button" onClick={() => setDateWindow('full')} className={`client-filter-pill ${dateWindow === 'full' ? 'is-active' : ''}`}>
                Full planning
              </button>
              {viewMode === 'gantt' && (
                <button type="button" onClick={scrollToToday} className="client-filter-pill client-today-button">
                  <CalendarDays size={14} /> Today
                </button>
              )}
            </div>
            {versionCategories.length > 1 && (
              <div className="client-filter-categories flex flex-wrap items-center gap-2">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-ink-500">Categories</div>
                <div className="flex flex-wrap gap-2">
                  {categoryFilterGroups.map((group) => (
                    <button key={group.key} type="button" onClick={() => toggleHiddenCategory(group.key)} className={`client-filter-pill ${!hiddenCategoryKeys.includes(group.key) ? 'is-active' : ''}`}>
                      {!hiddenCategoryKeys.includes(group.key) ? <Eye size={14} /> : <EyeOff size={14} />} {group.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="client-toolbar-actions planning-header-actions">
            {!tableOnlyProduction && <div className="client-view-toggle segmented planning-mode-selector">
              <button type="button" onClick={() => changeViewMode('table')} className={viewMode === 'table' ? 'selected' : ''}>Table View</button>
              <button type="button" onClick={() => changeViewMode('gantt')} className={viewMode === 'gantt' ? 'selected' : ''}>Gantt Chart</button>
            </div>}
            {!tableOnlyProduction && <Link to={`/projects/${project.id}?type=${activePlanningType}&version=${planningVersion}`} className="secondary-button client-toolbar-return planning-view-switch">
              <Eye size={16} /> Gantt View
            </Link>}
            {tableOnlyProduction && (
              <>
                <button type="button" onClick={() => addCategory(project.id, planningVersion, activePlanningType)} className="secondary-button"><Plus size={15} /> Category</button>
                <button type="button" onClick={() => {
                  const existingDates = versionLineItems.flatMap((item) => [item.start_date, item.end_date]).filter(Boolean).sort();
                  const defaultRange = { startDate: existingDates[0] ?? '', endDate: existingDates.at(-1) ?? '' };
                  const nextCategoryRanges = Object.fromEntries(versionCategories.map((category) => {
                    const categoryDates = versionLineItems
                      .filter((item) => item.category_id === category.id)
                      .flatMap((item) => [item.start_date, item.end_date])
                      .filter(Boolean)
                      .sort();
                    return [category.id, {
                      startDate: categoryDates[0] ?? defaultRange.startDate,
                      endDate: categoryDates.at(-1) ?? defaultRange.endDate,
                    }];
                  }));
                  setPlanningDraft((current) => ({
                    ...current,
                    categoryId: current.categoryId || versionCategories[0]?.id || '',
                    ...defaultRange,
                  }));
                  setCategoryDateRanges(nextCategoryRanges);
                  setSameCategoryRanges(true);
                  setCreatePlanningOpen(true);
                }} className="secondary-button">{versionLineItems.length ? <Pencil size={15} /> : <Plus size={15} />} {versionLineItems.length ? 'Update dates' : 'Date range'}</button>
              </>
            )}
            <button type="button" onClick={() => publishedUrl ? setShowUnpublishConfirm(true) : publish()} className={`client-header-action ${publishedUrl ? 'is-published' : ''}`} disabled={publishing}>
              <Globe2 size={16} /> {publishing ? 'Publishing...' : publishedUrl ? 'Published' : 'Publish'}
            </button>
          </div>
        </div>
      )}

      {viewMode === 'table' ? (
          <div className="client-category-list">
            <div className="client-global-column-header">
              <ClientPlanningTable
                project={project}
                lineItems={filteredLineItems}
                labels={labels}
                categories={versionCategories}
                showEmptyDates={showEmptyDates}
                dateWindow={dateWindow}
                onUpdateLineItem={updateLineItem}
                onFlushLineItem={flushLineItemUpdate}
                onAddLabel={addLabel}
                onMoveRows={moveRowsToDate}
                selectedRowIds={selectedRowIds}
                onSelectedRowIdsChange={setSelectedRowIds}
                uncategorizedName={uncategorizedName}
                columnPrefs={columnPrefs}
                onColumnPrefsChange={updateColumnPrefs}
                forceHideCategoryColumn
                showWeekColumn
                planningType={activePlanningType}
                headerOnly
              />
            </div>
            {categoryGroups.map((group) => {
              const category = versionCategories.find((item) => item.id === group.key);
              return (
              <section
                key={group.key}
                className={`client-category-section ${draggedCategoryId === group.key ? 'is-dragging' : ''} ${categoryDropTarget?.id === group.key ? `is-drop-${categoryDropTarget.placement}` : ''}`}
                onDragOver={(event) => {
                  if (category && draggedCategoryId && draggedCategoryId !== group.key) {
                    event.preventDefault();
                    const rect = event.currentTarget.querySelector('.client-category-section-title')?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
                    setCategoryDropTarget({ id: group.key, placement: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' });
                  }
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setCategoryDropTarget(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (category && draggedCategoryId && draggedCategoryId !== group.key) {
                    reorderCategories(project.id, draggedCategoryId, group.key, planningVersion, activePlanningType, categoryDropTarget?.placement ?? 'before');
                  }
                  setDraggedCategoryId(null);
                  setCategoryDropTarget(null);
                }}
              >
                <div className="client-category-section-title">
                  {category && (
                      <button
                        type="button"
                        className="client-category-drag-handle"
                        draggable
                        onDragStart={(event) => {
                          setDraggedCategoryId(category.id);
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', category.id);
                        }}
                        onDragEnd={() => {
                          setDraggedCategoryId(null);
                          setCategoryDropTarget(null);
                        }}
                        aria-label={`Drag ${category.name} to reorder`}
                        title="Drag to reorder"
                      >
                        <GripVertical size={15} />
                      </button>
                  )}
                  <button type="button" onClick={() => toggleCollapsedCategory(group.key)} className="client-category-toggle-button">
                    <span className="client-category-toggle-icon">
                      {collapsedCategoryKeys.includes(group.key) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </span>
                    <span className="client-category-toggle-name">{group.name}</span>
                  </button>
                  {category && (
                    <button
                      type="button"
                      className="client-category-delete-button"
                      onClick={() => window.confirm(`Delete category “${category.name}” and all of its rows?`) && deleteCategory(category.id)}
                      disabled={versionCategories.length <= 1}
                      aria-label={`Delete ${category.name}`}
                      title={versionCategories.length <= 1 ? 'The only category cannot be deleted' : `Delete ${category.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                {!collapsedCategoryKeys.includes(group.key) && (
                  <ClientPlanningTable
                    project={project}
                    lineItems={group.items}
                    labels={labels}
                    categories={versionCategories}
                    showEmptyDates={showEmptyDates}
                    dateWindow={dateWindow}
                    onUpdateLineItem={updateLineItem}
                    onFlushLineItem={flushLineItemUpdate}
                    onAddLabel={addLabel}
                    onMoveRows={moveRowsToDate}
                    selectedRowIds={selectedRowIds}
                    onSelectedRowIdsChange={setSelectedRowIds}
                    uncategorizedName={uncategorizedName}
                    columnPrefs={columnPrefs}
                    onColumnPrefsChange={updateColumnPrefs}
                    forceHideCategoryColumn
                    showWeekColumn
                    planningType={activePlanningType}
                    showHeader={false}
                  />
                )}
              </section>
              );
            })}
          </div>
      ) : (
        <ClientGanttChart project={project} lineItems={filteredLineItems} labels={labels} categories={versionCategories} uncategorizedName={uncategorizedName} categoryMode="sections" collapsedCategoryKeys={collapsedCategoryKeys} onToggleCategory={toggleCollapsedCategory} dateWindow={dateWindow} compact planningType={activePlanningType} />
      )}

      {createPlanningOpen && (
        <div className="fixed inset-0 z-[760] grid place-items-center bg-black/70 p-5" onMouseDown={() => setCreatePlanningOpen(false)}>
          <form className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/10 bg-ink-900 p-5 shadow-glow" onSubmit={createTablePlanning} onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-white">{versionLineItems.length ? 'Update dates' : 'Select date range'}</h2>
              <button type="button" className="icon-button" onClick={() => setCreatePlanningOpen(false)}><X size={17} /></button>
            </div>
            {versionCategories.length > 1 && (
              <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-semibold text-ink-200">
                <input type="checkbox" checked={sameCategoryRanges} onChange={(event) => setSameCategoryRanges(event.target.checked)} />
                Both ranges the same
              </label>
            )}
            <div className="mt-4 space-y-4">
              {sameCategoryRanges || versionCategories.length === 1 ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1"><span className="text-xs font-semibold uppercase text-ink-500">Begin date</span><input type="date" className="field" value={planningDraft.startDate} onChange={(event) => setPlanningDraft((current) => ({ ...current, startDate: event.target.value }))} required /></label>
                  <label className="block space-y-1"><span className="text-xs font-semibold uppercase text-ink-500">End date</span><input type="date" min={planningDraft.startDate || undefined} className="field" value={planningDraft.endDate} onChange={(event) => setPlanningDraft((current) => ({ ...current, endDate: event.target.value }))} required /></label>
                </div>
              ) : versionCategories.map((category) => {
                const range = categoryDateRanges[category.id] ?? { startDate: planningDraft.startDate, endDate: planningDraft.endDate };
                return (
                  <section key={category.id} className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                    <h3 className="mb-3 text-sm font-semibold text-white">{category.name}</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block space-y-1">
                        <span className="text-xs font-semibold uppercase text-ink-500">Begin date</span>
                        <input type="date" className="field" value={range.startDate} onChange={(event) => setCategoryDateRanges((current) => ({ ...current, [category.id]: { ...range, startDate: event.target.value } }))} required />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs font-semibold uppercase text-ink-500">End date</span>
                        <input type="date" min={range.startDate || undefined} className="field" value={range.endDate} onChange={(event) => setCategoryDateRanges((current) => ({ ...current, [category.id]: { ...range, endDate: event.target.value } }))} required />
                      </label>
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="secondary-button" onClick={() => setCreatePlanningOpen(false)}>Cancel</button>
              <button type="submit" className="primary-button">{versionLineItems.length ? 'Update dates' : 'Add dates'}</button>
            </div>
          </form>
        </div>
      )}

      {publishValidationIssues.length > 0 && (
        <div className="fixed inset-0 z-[750] grid place-items-center bg-black/70 p-5" onMouseDown={() => setPublishValidationIssues([])}>
          <section className="publish-validation-modal w-full max-w-2xl overflow-hidden rounded-xl border" onMouseDown={(event) => event.stopPropagation()}>
            <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="publish-validation-icon"><AlertTriangle size={18} /></span>
                <div>
                  <h2 className="text-base font-semibold text-white">Complete missing planning fields</h2>
                  <p className="mt-1 text-xs text-slate-400">Publishing is paused. Complete the fields below, then click Publish again.</p>
                </div>
              </div>
              <button type="button" onClick={() => setPublishValidationIssues([])} className="icon-button shrink-0" aria-label="Close validation overview"><X size={17} /></button>
            </header>
            <div className="max-h-[55vh] overflow-auto p-3">
              <div className="publish-validation-head grid grid-cols-[150px_minmax(150px,1fr)_minmax(180px,1.2fr)] gap-3 px-3 py-2">
                <span>Date</span><span>Row</span><span>Missing</span>
              </div>
              {publishValidationIssues.map((issue) => (
                <div key={issue.id} className="publish-validation-row grid grid-cols-[150px_minmax(150px,1fr)_minmax(180px,1.2fr)] gap-3 px-3 py-3">
                  <span className="font-semibold text-slate-200">{issue.date}</span>
                  <span className="min-w-0"><strong className="block truncate text-slate-200">{issue.asset}</strong><small className="block truncate text-slate-500">{issue.category}</small></span>
                  <span className="flex flex-wrap gap-1.5">{issue.missing.map((field) => <b key={field}>{field}</b>)}</span>
                </div>
              ))}
            </div>
            <footer className="flex items-center justify-between gap-3 border-t px-5 py-3">
              <span className="text-xs text-slate-500">{publishValidationIssues.length} {publishValidationIssues.length === 1 ? 'row needs' : 'rows need'} attention</span>
              <button type="button" onClick={() => setPublishValidationIssues([])} className="client-download-action">Close overview</button>
            </footer>
          </section>
        </div>
      )}

      {showUnpublishConfirm && (
        <div className="fixed inset-0 z-[760] grid place-items-center bg-black/70 p-5" onMouseDown={() => !publishing && setShowUnpublishConfirm(false)}>
          <section className="publish-validation-modal w-full max-w-md overflow-hidden rounded-xl border" onMouseDown={(event) => event.stopPropagation()}>
            <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="publish-validation-icon"><AlertTriangle size={18} /></span>
                <div>
                  <h2 className="text-base font-semibold text-white">Unpublish this planning?</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">The current share link will stop working and the client will no longer be able to view this planning.</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowUnpublishConfirm(false)} className="icon-button shrink-0" aria-label="Close unpublish confirmation" disabled={publishing}><X size={17} /></button>
            </header>
            <footer className="flex justify-end gap-2 border-t px-5 py-4">
              <button type="button" onClick={() => setShowUnpublishConfirm(false)} className="client-header-action" disabled={publishing}>Cancel</button>
              <button type="button" onClick={unpublish} className="client-unpublish-action" disabled={publishing}>{publishing ? 'Unpublishing...' : 'Yes, unpublish'}</button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
