import { differenceInCalendarDays, eachDayOfInterval, endOfWeek, format, getISODay, getISOWeek, isMonday, isWeekend, max, min, parseISO, startOfWeek } from 'date-fns';
import { Check, ChevronDown, ChevronRight, Copy, Download, Eye, EyeOff, FileText, Globe2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Pill from '../components/Pill.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';
import { downloadPlanningExcel } from '../lib/exportExcel.js';
import { readLocalObject, UNCATEGORIZED_NAME_STORAGE_KEY } from '../lib/localPreferences.js';
import { weekNumber } from '../lib/dates.js';

const CLIENT_COLUMN_STORAGE_KEY = 'roval:client-columns:v2';
const CLIENT_VIEW_MODE_STORAGE_KEY = 'roval:client-view-mode';
const CLIENT_COLUMNS = [
  { key: 'rowColor', label: 'Color', width: 82 },
  { key: 'time', label: 'Time', width: 74 },
  { key: 'category', label: 'Category', width: 150 },
  { key: 'who', label: 'Who', width: 118 },
  { key: 'asset', label: 'Asset', width: 200 },
  { key: 'what', label: 'What', width: 180 },
  { key: 'todo', label: 'Todo', width: 190 },
  { key: 'notes', label: 'Notes', width: 160 },
];

const ROW_COLOR_OPTIONS = [
  { value: '', label: 'None', color: 'transparent' },
  { value: 'red', label: 'Red', color: '#ff5e84' },
  { value: 'green', label: 'Green', color: '#46d39b' },
  { value: 'purple', label: 'Purple', color: '#b793ff' },
  { value: 'orange', label: 'Orange', color: '#ff8f4f' },
];

function readClientColumnPrefs() {
  const defaultOrder = CLIENT_COLUMNS.map((column) => column.key);
  try {
    const stored = JSON.parse(localStorage.getItem(CLIENT_COLUMN_STORAGE_KEY) ?? '{}');
    const storedOrder = Array.isArray(stored.order) ? stored.order.filter((key) => CLIENT_COLUMNS.some((column) => column.key === key)) : [];
    return {
      order: [...storedOrder, ...defaultOrder.filter((key) => !storedOrder.includes(key))],
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

function readClientViewMode(projectId) {
  return localStorage.getItem(`${CLIENT_VIEW_MODE_STORAGE_KEY}:${projectId}`) ?? 'table';
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
      RowColor: item.row_color ?? '',
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

function categoryNameForItem(item, categoriesById, uncategorizedName) {
  return item.category_id ? categoriesById[item.category_id]?.name ?? uncategorizedName : uncategorizedName;
}

function categoryKeyForItem(item) {
  return item.category_id ?? 'uncategorized';
}

function categoryShade(key, categories = []) {
  const index = Math.max(0, categories.findIndex((category) => category.id === key));
  const lightness = Math.max(18, 42 - index * 5);
  return {
    backgroundColor: `hsl(235 10% ${lightness}%)`,
    borderColor: `hsl(235 10% ${Math.min(58, lightness + 14)}%)`,
    color: '#f3f0ff',
  };
}

function measureTextWidth(text, min, max, charWidth = 8.2) {
  const value = String(text ?? '');
  return Math.max(min, Math.min(max, Math.ceil(value.length * charWidth) + 42));
}

function RowColorSelect({ value, onChange, readOnly = false }) {
  const selected = ROW_COLOR_OPTIONS.find((option) => option.value === value) ?? ROW_COLOR_OPTIONS[0];

  if (readOnly) {
    return (
      <span className="client-row-color-readonly" title={selected.label}>
        {selected.value ? <span style={{ backgroundColor: selected.color }} /> : '-'}
      </span>
    );
  }

  return (
    <div className="client-row-color-select" aria-label="Row color">
      {ROW_COLOR_OPTIONS.map((option) => (
        <button
          key={option.value || 'none'}
          type="button"
          onClick={() => onChange(option.value)}
          className={value === option.value ? 'is-active' : ''}
          title={option.label}
          aria-label={`Set row color ${option.label}`}
        >
          {option.value ? <span style={{ backgroundColor: option.color }} /> : <span className="client-row-color-empty" />}
        </button>
      ))}
    </div>
  );
}

export function ClientPlanningTable({ project, lineItems, labels, categories, showEmptyDates, labelsAsText = false, onUpdateLineItem, uncategorizedName = 'Uncategorized', columnPrefs, onColumnPrefsChange, forceHideCategoryColumn = false }) {
  const [editingField, setEditingField] = useState(null);
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  const editingItem = editingField?.itemId ? lineItems.find((item) => item.id === editingField.itemId) : null;
  const labelsById = useMemo(() => Object.fromEntries(labels.map((label) => [label.id, label])), [labels]);
  const prefs = columnPrefs ?? readClientColumnPrefs();
  const visibleCategoryCount = useMemo(() => {
    const categoryIds = new Set(lineItems.map((item) => item.category_id).filter(Boolean));
    return Math.max(categories.length, categoryIds.size);
  }, [categories.length, lineItems]);
  const showCategoryColumn = visibleCategoryCount > 1 && !forceHideCategoryColumn;
  const orderedColumns = prefs.order
    .map((key) => CLIENT_COLUMNS.find((column) => column.key === key))
    .filter((column) => column && prefs.visible[column.key] !== false && (column.key !== 'category' || showCategoryColumn));
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
    () => annotateRows(buildClientPlanningRows(project, lineItems, categories, labelsById, showEmptyDates, uncategorizedName)),
    [project, lineItems, categories, labelsById, showEmptyDates, uncategorizedName],
  );
  const autoWidths = useMemo(() => {
    const maxText = (key, fallback) => rows.reduce((longest, row) => (String(row[key] ?? '').length > String(longest ?? '').length ? row[key] : longest), fallback);
    const longestAsset = rows.reduce((longest, row) => (String(row.Asset ?? '').length > String(longest ?? '').length ? row.Asset : longest), 'Asset');
    const longestNotes = rows.reduce((longest, row) => (String(row.Notes ?? '').length > String(longest ?? '').length ? row.Notes : longest), 'Notes');
    const labelExtra = labelsAsText ? 24 : 54;
    return {
      rowColor: 82,
      time: measureTextWidth(maxText('Time', 'Time'), 70, 96, 7.2),
      category: measureTextWidth(maxText('Category', 'Category'), 120, 260, 7.2),
      who: measureTextWidth(maxText('Who', 'Who'), 92, 260, 7.1) + labelExtra,
      asset: measureTextWidth(longestAsset, 170, String(longestAsset ?? '').length > 30 ? 260 : 420, 7.1),
      assetResizable: String(longestAsset ?? '').length > 30,
      what: measureTextWidth(maxText('What', 'What'), 110, 280, 7.1) + labelExtra,
      todo: measureTextWidth(maxText('Todo', 'Todo'), 110, 300, 7.1) + labelExtra,
      notes: measureTextWidth(longestNotes, 220, 520, 7.1),
    };
  }, [labelsAsText, rows]);
  const widthForColumn = (column) => {
    if (column.key === 'asset' && autoWidths.assetResizable) return prefs.widths.asset ?? autoWidths.asset;
    if (column.key === 'notes') return autoWidths.notes;
    return autoWidths[column.key] ?? prefs.widths[column.key] ?? column.width;
  };
  const moveColumn = (targetKey, side) => {
    if (!draggedColumn || draggedColumn === targetKey) return;
    const nextOrder = prefs.order.filter((key) => key !== draggedColumn);
    const targetIndex = nextOrder.indexOf(targetKey);
    nextOrder.splice(side === 'after' ? targetIndex + 1 : targetIndex, 0, draggedColumn);
    updatePrefs({ ...prefs, order: nextOrder });
  };

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-ink-900">
        <div className="client-table-scroll max-h-[calc(100vh-17rem)] overflow-auto">
          <table className="client-planning-table w-full border-collapse text-sm" style={{ minWidth: 48 + 78 + 72 + orderedColumns.reduce((sum, column) => sum + widthForColumn(column), 0) }}>
            <colgroup>
              <col className="w-[48px]" />
              <col className="w-[78px]" />
              <col className="w-[72px]" />
              {orderedColumns.map((column) => <col key={column.key} style={{ width: widthForColumn(column) }} />)}
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
                      <span className="client-column-grip" aria-hidden="true">::</span>
                      {column.label}
                    </span>
                    <button type="button" onPointerDown={(event) => startResize(event, column.key)} className="client-column-resize-handle" aria-label={`Resize ${column.label}`} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${row._item?.id ?? row._dateKey}-${index}`}
                  className={`${row._isWeekend ? 'bg-zinc-200/70 dark:bg-white/[0.07]' : ''} ${row._isToday ? 'today-row' : ''} ${row._item?.row_color ? `client-row-color-${row._item.row_color}` : ''} ${row._showWeekDivider ? 'week-divider' : 'border-t border-black/5 dark:border-white/5'}`}
                >
                  {row._showWeek && (
                    <td rowSpan={row._weekRowSpan} className="week-cell sticky-week px-1 py-2 align-middle font-mono text-[1.5em]">
                      <span><em>WEEK</em>{row.Week}</span>
                    </td>
                  )}
                  {row._showDateGroup && (
                    <>
                      <td rowSpan={row._dateRowSpan} className={`date-group-cell p-0 text-xs font-semibold ${row._isWeekend ? 'date-weekend-cell' : ''}`}>
                        <span className="date-group-chip">{row.Day}</span>
                      </td>
                      <td rowSpan={row._dateRowSpan} className={`date-group-cell whitespace-nowrap p-0 font-mono text-xs font-semibold ${row._isWeekend ? 'date-weekend-cell' : ''}`}>
                        <span className="date-group-chip">{row.Date}</span>
                      </td>
                    </>
                  )}
                  {orderedColumns.map((column) => {
                    if (column.key === 'rowColor') return <td key={column.key} className="px-3 py-3">{row._item ? <RowColorSelect value={row._item.row_color ?? ''} onChange={(rowColor) => onUpdateLineItem?.(row._item.id, { row_color: rowColor })} readOnly={!onUpdateLineItem} /> : null}</td>;
                    if (column.key === 'category') return (
                      <td key={column.key} className="px-4 py-3 text-sm font-semibold text-ink-400">
                        {row._item ? <span className="client-category-pill" style={categoryShade(categoryKeyForItem(row._item), categories)}>{row.Category}</span> : ''}
                      </td>
                    );
                    if (column.key === 'time') return <td key={column.key} className="px-3 py-3 font-mono">{row._item && onUpdateLineItem ? <button type="button" onClick={() => setEditingField({ itemId: row._item.id, field: 'time' })} className="min-w-12 whitespace-nowrap rounded-md border border-white/10 bg-white/5 px-2 py-1 text-center text-sm text-ink-300 hover:border-accent-400 hover:text-ink-100">{row._item.time || <span className="text-ink-500">--:--</span>}</button> : row._item ? row.Time : ''}</td>;
                    if (column.key === 'who') return <td key={column.key} className="px-4 py-3">{row._item ? <div className="flex flex-wrap gap-1">{labelsAsText ? row.Who : row._item.who.map((id) => <Pill key={id} label={labelsById[id]} />)}</div> : null}</td>;
                    if (column.key === 'asset') return <td key={column.key} className="overflow-visible px-4 py-3">{row._item ? <span className="note-preview group relative inline-flex w-full min-w-0 text-left"><span className="truncate font-semibold">{row.Asset || '-'}</span>{row.Asset && <span className="note-tooltip">{row.Asset}</span>}</span> : null}</td>;
                    if (column.key === 'what') return <td key={column.key} className="px-4 py-3">{row._item ? (labelsAsText ? row.What : <Pill label={labelsById[row._item.what]} />) : null}</td>;
                    if (column.key === 'todo') return <td key={column.key} className="px-4 py-3">{row._item ? (labelsAsText ? row.Todo : <Pill label={labelsById[row._item.todo]} subtle />) : null}</td>;
                    if (column.key === 'notes') return <td key={column.key} className="overflow-visible px-4 py-3">{row._item && onUpdateLineItem ? <button type="button" onClick={() => setEditingField({ itemId: row._item.id, field: 'notes' })} className="note-preview group relative inline-flex w-full min-w-0 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-left text-sm text-ink-300 hover:border-accent-400 hover:text-ink-100"><FileText size={14} className="shrink-0 text-ink-500" /><span className="truncate">{row._item.notes || 'Add note'}</span>{row._item.notes && <span className="note-tooltip">{row._item.notes}</span>}</button> : row._item ? row.Notes : null}</td>;
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

function ClientGanttChart({ project, lineItems, labels, categories, uncategorizedName = 'Uncategorized', categoryMode = 'column', collapsedCategoryKeys = [], onToggleCategory }) {
  const labelsById = useMemo(() => Object.fromEntries(labels.map((label) => [label.id, label])), [labels]);
  const bookings = useMemo(() => lineItems.filter((item) => item.project_id === project.id && item.start_date && item.end_date).sort((a, b) => a.start_date.localeCompare(b.start_date) || a.sort_order - b.sort_order), [project.id, lineItems]);
  const days = useMemo(() => dateRangeFromBookings(bookings), [bookings]);
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
                const offset = differenceInCalendarDays(parseISO(item.start_date), days[0]);
                const duration = Math.max(1, differenceInCalendarDays(parseISO(item.end_date), parseISO(item.start_date)) + 1);
                const what = labelsById[item.what];
                const todo = labelsById[item.todo];
                const category = item.category_id ? categoriesById[item.category_id]?.name : uncategorizedName;
                const blockColor = labelsById[item.who?.[0]]?.color ?? what?.color ?? '#6d5dfc';
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
                      <div className="client-gantt-booking" style={{ left: offset * dayWidth + 4, width: duration * dayWidth - 8, '--client-gantt-color': blockColor }}>
                        {Array.from({ length: duration }, (_, index) => {
                          const day = parseISO(item.start_date);
                          day.setDate(day.getDate() + index);
                          const isLast = index === duration - 1;
                          return (
                            <span key={index} className={`client-gantt-booking-day ${isLast ? 'is-last' : ''}`}>
                              {isLast && (
                                <>
                                  <strong>{format(day, 'd')}</strong>
                                  <em>{format(day, 'MMM')}</em>
                                </>
                              )}
                            </span>
                          );
                        })}
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

export default function ClientTableView({ project, planningVersion = 'V1' }) {
  const { lineItems, labels, categories, createShareLink, updateLineItem } = usePlanner();
  const [showEmptyDates, setShowEmptyDates] = useState(true);
  const [showWennekerBookings, setShowWennekerBookings] = useState(true);
  const [showClientBookings, setShowClientBookings] = useState(true);
  const [labelsAsText, setLabelsAsText] = useState(false);
  const [categoryMode, setCategoryMode] = useState('column');
  const [collapsedCategoryKeys, setCollapsedCategoryKeys] = useState([]);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [columnPrefs, setColumnPrefs] = useState(() => readClientColumnPrefs());
  const [viewMode, setViewMode] = useState(() => readClientViewMode(project.id));
  const uncategorizedNames = useMemo(() => readLocalObject(UNCATEGORIZED_NAME_STORAGE_KEY, {}), []);
  const [publishedUrl, setPublishedUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const columnMenuCloseTimer = useRef(null);
  const uncategorizedName = uncategorizedNames[project.id] || 'Uncategorized';
  const whoFilterIds = useMemo(() => ({
    wenneker: labels.find((label) => label.column_type === 'who' && label.value.toLowerCase() === 'wenneker')?.id,
    client: labels.find((label) => label.column_type === 'who' && label.value.toLowerCase() === 'client')?.id,
  }), [labels]);
  const versionLineItems = useMemo(() => lineItems.filter((item) => item.project_id === project.id && (item.planning_version ?? 'V1') === planningVersion), [lineItems, planningVersion, project.id]);
  const versionCategories = useMemo(() => categories.filter((category) => category.project_id === project.id && (category.planning_version ?? 'V1') === planningVersion), [categories, planningVersion, project.id]);
  const categoriesById = useMemo(() => Object.fromEntries(versionCategories.map((category) => [category.id, category])), [versionCategories]);
  const filteredLineItems = useMemo(() => versionLineItems.filter((item) => {
    if (!showWennekerBookings && whoFilterIds.wenneker && item.who?.includes(whoFilterIds.wenneker)) return false;
    if (!showClientBookings && whoFilterIds.client && item.who?.includes(whoFilterIds.client)) return false;
    return true;
  }), [showClientBookings, showWennekerBookings, versionLineItems, whoFilterIds]);
  const exportRows = useMemo(
    () => clientPlanningExportRows(project, filteredLineItems, labels, versionCategories, showEmptyDates, uncategorizedName),
    [project, filteredLineItems, labels, versionCategories, showEmptyDates, uncategorizedName],
  );
  const categoryGroups = useMemo(() => {
    const groups = new Map();
    filteredLineItems.forEach((item) => {
      const key = categoryKeyForItem(item);
      if (!groups.has(key)) groups.set(key, { key, name: categoryNameForItem(item, categoriesById, uncategorizedName), items: [] });
      groups.get(key).items.push(item);
    });
    return [...groups.values()].sort((a, b) => {
      const aOrder = a.key === 'uncategorized' ? 99999 : categoriesById[a.key]?.sort_order ?? 9999;
      const bOrder = b.key === 'uncategorized' ? 99999 : categoriesById[b.key]?.sort_order ?? 9999;
      return aOrder - bOrder || a.name.localeCompare(b.name);
    });
  }, [categoriesById, filteredLineItems, uncategorizedName]);

  const publish = async () => {
    setPublishing(true);
    try {
      const token = await createShareLink(project.id);
      const url = `${window.location.origin}/share/${slugifyProjectName(project.name)}-${token}`;
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

  const scheduleColumnMenuClose = () => {
    window.clearTimeout(columnMenuCloseTimer.current);
    columnMenuCloseTimer.current = window.setTimeout(() => setColumnMenuOpen(false), 180);
  };

  const keepColumnMenuOpen = () => {
    window.clearTimeout(columnMenuCloseTimer.current);
  };

  const toggleCollapsedCategory = (key) => {
    setCollapsedCategoryKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  return (
    <main className="mx-auto max-w-[1600px] px-5 py-6">
      <div className="mb-5 flex flex-col justify-between gap-3 xl:flex-row xl:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">Client Planning</h1>
            <span className="rounded-md border border-amber-300/35 bg-amber-300/12 px-2 py-1 text-xs font-bold uppercase text-amber-200">{planningVersion}</span>
          </div>
          <p className="mt-1 text-sm text-ink-500">Milestones are generated from the final day of each timeline item.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="segmented">
            <button type="button" onClick={() => changeViewMode('table')} className={viewMode === 'table' ? 'selected' : ''}>Table View</button>
            <button type="button" onClick={() => changeViewMode('gantt')} className={viewMode === 'gantt' ? 'selected' : ''}>Gant Chart</button>
          </div>
          <button type="button" onClick={publish} className="secondary-button" disabled={publishing}>
            <Globe2 size={17} /> {publishing ? 'Publishing...' : 'Publish'}
          </button>
          <div className="relative" onMouseEnter={keepColumnMenuOpen} onMouseLeave={scheduleColumnMenuClose}>
            <button type="button" onClick={() => setColumnMenuOpen((next) => !next)} className="secondary-button"><Eye size={17} /> Columns</button>
            {columnMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-white/10 bg-ink-900 p-2 shadow-glow" onMouseEnter={keepColumnMenuOpen}>
                {CLIENT_COLUMNS.map((column) => (
                  <button
                    key={column.key}
                    type="button"
                    onClick={() => updateColumnPrefs({ ...columnPrefs, visible: { ...columnPrefs.visible, [column.key]: columnPrefs.visible[column.key] === false } })}
                    className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-white/5"
                  >
                    {columnPrefs.visible[column.key] !== false ? <Eye size={14} className="text-accent-300" /> : <EyeOff size={14} className="text-ink-500" />}
                    {column.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={() => downloadPlanningExcel(project, exportRows)} className="primary-button" disabled={!exportRows.length}>
            <Download size={17} /> Download Excel
          </button>
        </div>
      </div>

      {(viewMode === 'table' || viewMode === 'gantt') && (
        <div className="client-filter-row mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-900">
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
              <button type="button" onClick={() => setLabelsAsText((next) => !next)} className={`client-filter-pill ${labelsAsText ? 'is-active' : ''}`}>
                {labelsAsText ? <Eye size={14} /> : <EyeOff size={14} />} Text labels
              </button>
            </>
          )}
          {versionCategories.length > 1 && (
            <button type="button" onClick={() => setCategoryMode((next) => (next === 'column' ? 'sections' : 'column'))} className={`client-filter-pill ${categoryMode === 'sections' ? 'is-active' : ''}`}>
              {categoryMode === 'sections' ? <Eye size={14} /> : <EyeOff size={14} />} Category sections
            </button>
          )}
        </div>
      )}

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
        categoryMode === 'sections' ? (
          <div className="space-y-4">
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
                    labels={labels}
                    categories={versionCategories}
                    showEmptyDates={showEmptyDates}
                    labelsAsText={labelsAsText}
                    onUpdateLineItem={updateLineItem}
                    uncategorizedName={uncategorizedName}
                    columnPrefs={columnPrefs}
                    onColumnPrefsChange={updateColumnPrefs}
                    forceHideCategoryColumn
                  />
                )}
              </section>
            ))}
          </div>
        ) : (
          <ClientPlanningTable
            project={project}
            lineItems={filteredLineItems}
            labels={labels}
            categories={versionCategories}
            showEmptyDates={showEmptyDates}
            labelsAsText={labelsAsText}
            onUpdateLineItem={updateLineItem}
            uncategorizedName={uncategorizedName}
            columnPrefs={columnPrefs}
            onColumnPrefsChange={updateColumnPrefs}
          />
        )
      ) : (
        <ClientGanttChart project={project} lineItems={filteredLineItems} labels={labels} categories={versionCategories} uncategorizedName={uncategorizedName} categoryMode={categoryMode} collapsedCategoryKeys={collapsedCategoryKeys} onToggleCategory={toggleCollapsedCategory} />
      )}
    </main>
  );
}
