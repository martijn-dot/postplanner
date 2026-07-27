import { addDays, differenceInCalendarDays, eachDayOfInterval, endOfWeek, format, getISODay, getISOWeek, isMonday, isWeekend, max, min, parseISO, startOfWeek } from 'date-fns';
import { AlertTriangle, CalendarDays, CalendarPlus, ChevronDown, ChevronRight, Clock, Download, Eye, EyeOff, FileText, Globe2, ListChecks, Package, Pencil, Tag, Users, X } from 'lucide-react';
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

const CLIENT_COLUMN_STORAGE_KEY = 'roval:client-columns:v4';
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
  { key: 'who', label: 'Who', width: 118 },
  { key: 'asset', label: 'Asset', width: 200 },
  { key: 'what', label: 'What', width: 180 },
  { key: 'todo', label: 'Todo', width: 190 },
  { key: 'time', label: 'Time', width: 74 },
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
      widths: stored.widths ?? Object.fromEntries(CLIENT_COLUMNS.map((column) => [column.key, column.width])),
      visible: { ...defaultVisible, ...(stored.visible ?? {}) },
    };
  } catch {
    return {
      order: CLIENT_COLUMNS.map((column) => column.key),
      widths: Object.fromEntries(CLIENT_COLUMNS.map((column) => [column.key, column.width])),
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

function measureTextWidth(text, min, max, charWidth = 8.2) {
  const value = String(text ?? '');
  return Math.max(min, Math.min(max, Math.ceil(value.length * charWidth) + 42));
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

export function ClientPlanningTable({ project, lineItems, widthLineItems, labels, categories, showEmptyDates, onUpdateLineItem, onFlushLineItem, onUpdateCategory, onAddLabel, uncategorizedName = 'Uncategorized', columnPrefs, onColumnPrefsChange, forceHideCategoryColumn = false, dateWindow = 'future', hiddenWhoIds = [], showWeekColumn = true, publicCardLayout = false, planningType = DEFAULT_PLANNING_TYPE, showHeader = true, headerOnly = false }) {
  const isProduction = safePlanningType(planningType) === PLANNING_TYPES.production.key;
  const [editingItemId, setEditingItemId] = useState(null);
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const editingItem = editingItemId ? lineItems.find((item) => item.id === editingItemId) : null;
  const editingCategory = editingItem?.category_id ? categories.find((category) => category.id === editingItem.category_id) : null;
  useEffect(() => {
    setEditingCategoryName(editingCategory?.name ?? uncategorizedName);
  }, [editingCategory?.id, editingCategory?.name, editingItemId, uncategorizedName]);
  const labelsById = useMemo(() => Object.fromEntries(labels.map((label) => [label.id, label])), [labels]);
  const labelsByType = useMemo(() => ({
    who: labels.filter((label) => label.column_type === 'who'),
    what: labels.filter((label) => label.column_type === 'what'),
    todo: labels.filter((label) => label.column_type === 'todo'),
  }), [labels]);
  const prefs = columnPrefs ?? readClientColumnPrefs();
  const visibleCategoryCount = useMemo(() => {
    const categoryIds = new Set(lineItems.map((item) => item.category_id).filter(Boolean));
    return Math.max(categories.length, categoryIds.size);
  }, [categories.length, lineItems]);
  const showCategoryColumn = visibleCategoryCount > 1 && !forceHideCategoryColumn;
  const orderedColumns = prefs.order
    .map((key) => CLIENT_COLUMNS.find((column) => column.key === key))
    .filter((column) => column && prefs.visible[column.key] !== false && (!isProduction || column.key !== 'asset') && (column.key !== 'category' || showCategoryColumn) && (column.key !== 'edit' || onUpdateLineItem));
  const updatePrefs = (nextPrefs) => {
    onColumnPrefsChange?.(nextPrefs);
  };
  const startResize = (event, key) => {
    event.preventDefault();
    event.stopPropagation();
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
    () => annotateRows(filterRowsByDateWindow(buildClientPlanningRows(project, lineItems, categories, labelsById, showEmptyDates, uncategorizedName, planningType), dateWindow)),
    [project, lineItems, categories, labelsById, showEmptyDates, uncategorizedName, dateWindow, planningType],
  );
  const widthRows = useMemo(
    () => widthLineItems
      ? annotateRows(filterRowsByDateWindow(buildClientPlanningRows(project, widthLineItems, categories, labelsById, showEmptyDates, uncategorizedName, planningType), dateWindow))
      : rows,
    [project, widthLineItems, categories, labelsById, showEmptyDates, uncategorizedName, planningType, dateWindow, rows],
  );
  const autoWidths = useMemo(() => {
    const maxText = (key, fallback) => widthRows.reduce((longest, row) => (String(row[key] ?? '').length > String(longest ?? '').length ? row[key] : longest), fallback);
    const longestAsset = widthRows.reduce((longest, row) => (String(row.Asset ?? '').length > String(longest ?? '').length ? row.Asset : longest), 'Asset');
    const labelExtra = 54;
    return {
      edit: 86,
      time: measureTextWidth(maxText('Time', 'Time'), 70, 96, 7.2),
      category: measureTextWidth(maxText('Category', 'Category'), 120, 260, 7.2),
      who: measureTextWidth(maxText('Who', 'Who'), 92, 260, 7.1) + labelExtra,
      asset: measureTextWidth(longestAsset, 170, String(longestAsset ?? '').length > 30 ? 260 : 420, 7.1),
      assetResizable: String(longestAsset ?? '').length > 30,
      what: measureTextWidth(maxText('What', 'What'), 110, 280, 7.1) + labelExtra,
      todo: measureTextWidth(maxText('Todo', 'Todo'), 110, 300, 7.1) + labelExtra,
    };
  }, [widthRows]);
  const widthForColumn = (column) => {
    if (column.key === 'asset' && autoWidths.assetResizable) return prefs.widths.asset ?? autoWidths.asset;
    if (['calendar', 'who', 'what', 'todo'].includes(column.key) && prefs.widths[column.key]) return prefs.widths[column.key];
    if (column.key === 'notes') return prefs.widths.notes ?? CLIENT_COLUMNS.find((item) => item.key === 'notes').width;
    return autoWidths[column.key] ?? prefs.widths[column.key] ?? column.width;
  };
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
          <table className="client-planning-table w-full border-collapse text-sm" style={{ minWidth: (showWeekColumn ? 58 : 0) + 116 + orderedColumns.reduce((sum, column) => sum + widthForColumn(column), 0), tableLayout: 'fixed' }}>
            <colgroup>
              {showWeekColumn && <col className="w-[58px]" />}
              <col className="w-[116px]" />
              {orderedColumns.map((column) => {
                const width = widthForColumn(column);
                return <col key={column.key} style={column.key === 'notes' ? { width, minWidth: width, maxWidth: width } : { width }} />;
              })}
            </colgroup>
            {showHeader && <thead className="bg-zinc-100 text-left text-xs uppercase text-ink-500 dark:bg-ink-850">
              <tr>
                {showWeekColumn && <th className="sticky-week px-2 py-3 text-center font-semibold"></th>}
                <th className="px-3 py-3 font-semibold">Date</th>
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
                  {!showWeekColumn && row._showWeekDivider && (
                    <tr className="client-week-separator-row">
                      <td colSpan={1 + orderedColumns.length}>
                        <span><CalendarDays size={16} /> Week{row.Week}</span>
                      </td>
                    </tr>
                  )}
                  <tr
                    className={`${row._isWeekend ? 'bg-zinc-200/70 dark:bg-white/[0.07]' : ''} ${row._isToday ? 'today-row' : ''} ${row._item?.row_color ? `client-row-color-${row._item.row_color}` : ''} ${row._showWeekDivider && showWeekColumn ? 'week-divider' : 'border-t border-black/5 dark:border-white/5'}`}
                  >
                    {showWeekColumn && row._showWeek && (
                      <td rowSpan={row._weekRowSpan} className="week-cell sticky-week px-1 py-2 align-middle font-mono text-[1.5em]">
                        <span><em>WEEK</em>{row.Week}</span>
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
                      if (column.key === 'time') return <td key={column.key} data-client-column={column.key} className="px-3 py-3 font-mono">{row._item ? (row.Time || '-') : ''}</td>;
                      if (column.key === 'who') return <td key={column.key} data-client-column={column.key} className="px-4 py-3">{row._item ? <div className="flex flex-wrap gap-1">{row._item.who.map((id) => <Pill key={id} label={labelsById[id]} />)}</div> : null}</td>;
                      if (column.key === 'asset') return <td key={column.key} data-client-column={column.key} className="overflow-hidden px-4 py-3">{row._item ? <span className="block min-w-0"><span className="block truncate font-semibold">{row.Asset || '-'}</span><span className="mt-0.5 block truncate text-[0.68rem] font-semibold uppercase tracking-wide text-ink-500">{row.Category}</span></span> : null}</td>;
                      if (column.key === 'what') return <td key={column.key} data-client-column={column.key} className="px-4 py-3">{row._item ? (isProduction ? <span className="font-semibold">{row.What || '-'}</span> : <Pill label={labelsById[row._item.what]} />) : null}</td>;
                      if (column.key === 'todo') return <td key={column.key} data-client-column={column.key} className="px-4 py-3">{row._item ? <Pill label={labelsById[row._item.todo]} subtle /> : null}</td>;
                      if (column.key === 'notes') return (
                        <td key={column.key} data-client-column={column.key} className="client-notes-cell min-w-0 px-4 py-3" style={{ width: widthForColumn(column), maxWidth: widthForColumn(column) }}>
                          {row._item?.notes ? <OverflowNote note={row._item.notes} onOpen={() => setEditingItemId(row._item.id)} /> : null}
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
                <p className="mt-1 text-sm text-ink-500">{editingItem.asset || 'Client planning row'}</p>
              </div>
              <button type="button" onClick={() => setEditingItemId(null)} className="icon-button">x</button>
            </div>
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-500">Category</span>
                <input
                  value={editingCategoryName}
                  onChange={(event) => setEditingCategoryName(event.target.value)}
                  onBlur={() => {
                    const nextName = editingCategoryName.trim();
                    if (editingCategory && onUpdateCategory && nextName && nextName !== editingCategory.name) onUpdateCategory(editingCategory.id, { name: nextName });
                    if (!nextName) setEditingCategoryName(editingCategory?.name ?? uncategorizedName);
                  }}
                  disabled={!editingCategory || !onUpdateCategory}
                  className="w-full rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-accent-400 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Category name"
                />
                <span className="block text-[0.68rem] text-ink-500">Changing this name updates every row in this category.</span>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-500">Asset name</span>
                <input
                  value={editingItem.asset ?? ''}
                  onChange={(event) => onUpdateLineItem(editingItem.id, { asset: event.target.value })}
                  onBlur={() => onFlushLineItem?.(editingItem.id)}
                  className="w-full rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-accent-400"
                  placeholder="Asset name"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-500">Who</span>
                <LabelSelect labels={labelsByType.who} value={editingItem.who ?? []} multiple multipleModeToggle placeholder="Who" onChange={(who) => onUpdateLineItem(editingItem.id, { who })} onAddLabel={(value, color) => onAddLabel?.(project.id, 'who', value, color)} />
              </label>
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
  const { lineItems, labels, categories, shareLinks, createShareLink, revokeShareLink, updateLineItem, flushLineItemUpdate, updateCategory, addLabel } = usePlanner();
  const activePlanningType = safePlanningType(planningType);
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
  const planningViewRef = useRef(null);
  const uncategorizedName = uncategorizedNames[project.id] || 'Uncategorized';
  const whoFilterIds = useMemo(() => ({
    wenneker: labels.find((label) => label.column_type === 'who' && label.value.toLowerCase() === 'wenneker')?.id,
    client: labels.find((label) => label.column_type === 'who' && label.value.toLowerCase() === 'client')?.id,
  }), [labels]);
  const versionLineItems = useMemo(() => lineItems.filter((item) => item.project_id === project.id && safePlanningType(item.planning_type) === activePlanningType && (item.planning_version ?? 'V1') === planningVersion), [activePlanningType, lineItems, planningVersion, project.id]);
  const versionCategories = useMemo(() => categories.filter((category) => category.project_id === project.id && safePlanningType(category.planning_type) === activePlanningType && (category.planning_version ?? 'V1') === planningVersion), [activePlanningType, categories, planningVersion, project.id]);
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
  const categoryGroups = useMemo(() => categoryGroupsFor(filteredLineItems), [categoryGroupsFor, filteredLineItems]);
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
    const categoryIssues = activePlanningType === 'production' ? [] : versionCategories
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
    const issues = validateRowsForPublishing();
    if (issues.length) {
      setPublishValidationIssues(issues);
      return;
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

  return (
    <main ref={planningViewRef} className="client-planning-admin mx-auto flex min-h-[calc(100vh-5rem)] max-w-[1400px] flex-col gap-4 px-4 pb-4">
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
            <div className="client-view-toggle segmented planning-mode-selector">
              <button type="button" onClick={() => changeViewMode('table')} className={viewMode === 'table' ? 'selected' : ''}>Table View</button>
              <button type="button" onClick={() => changeViewMode('gantt')} className={viewMode === 'gantt' ? 'selected' : ''}>Gantt Chart</button>
            </div>
            <Link to={`/projects/${project.id}?type=${activePlanningType}&version=${planningVersion}`} className="secondary-button client-toolbar-return planning-view-switch">
              <Eye size={16} /> Gantt View
            </Link>
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
                widthLineItems={filteredLineItems}
                labels={labels}
                categories={versionCategories}
                showEmptyDates={showEmptyDates}
                dateWindow={dateWindow}
                onUpdateLineItem={updateLineItem}
                onFlushLineItem={flushLineItemUpdate}
                onUpdateCategory={updateCategory}
                onAddLabel={addLabel}
                uncategorizedName={uncategorizedName}
                columnPrefs={columnPrefs}
                onColumnPrefsChange={updateColumnPrefs}
                forceHideCategoryColumn
                showWeekColumn
                planningType={activePlanningType}
                headerOnly
              />
            </div>
            {categoryGroups.map((group) => (
              <section key={group.key} className="client-category-section">
                <button type="button" onClick={() => toggleCollapsedCategory(group.key)} className="client-category-section-title">
                  {collapsedCategoryKeys.includes(group.key) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  {group.name}
                </button>
                {!collapsedCategoryKeys.includes(group.key) && (
                  <ClientPlanningTable
                    project={project}
                    lineItems={group.items}
                    widthLineItems={filteredLineItems}
                    labels={labels}
                    categories={versionCategories}
                    showEmptyDates={showEmptyDates}
                    dateWindow={dateWindow}
                    onUpdateLineItem={updateLineItem}
                    onFlushLineItem={flushLineItemUpdate}
                    onUpdateCategory={updateCategory}
                    onAddLabel={addLabel}
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
            ))}
          </div>
      ) : (
        <ClientGanttChart project={project} lineItems={filteredLineItems} labels={labels} categories={versionCategories} uncategorizedName={uncategorizedName} categoryMode="sections" collapsedCategoryKeys={collapsedCategoryKeys} onToggleCategory={toggleCollapsedCategory} dateWindow={dateWindow} compact planningType={activePlanningType} />
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
