import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { addDays, addMonths, differenceInCalendarDays, format, getISOWeek, isSameDay, isSameMonth, isWeekend, nextMonday, parseISO, startOfMonth } from 'date-fns';
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  GripVertical,
  Globe2,
  ListPlus,
  Link2,
  Link2Off,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import LabelSelect from '../components/LabelSelect.jsx';
import Pill from '../components/Pill.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';
import { buildTimelineDays, daysBetween, isToday, iso, monthSegments } from '../lib/dates.js';
import {
  DEFAULT_PLANNING_TYPE,
  DEFAULT_PLANNING_WHAT_LABELS,
  PLANNING_TYPES,
  PRODUCTION_TODO_LABELS,
  PRODUCTION_WHAT_LABELS,
} from '../lib/defaults.js';
import { readLocalObject, UNCATEGORIZED_NAME_STORAGE_KEY } from '../lib/localPreferences.js';
import { buildProjectSummary } from '../lib/projectSummary.js';

const DAY_WIDTH = { day: 128, week: 72, month: 52 };
const ROW_HEIGHT = 36;
const COLUMN_STORAGE_KEY = 'post-production-planner:timeline-columns';
const OPTIONS_VISIBILITY_STORAGE_KEY = 'post-production-planner:timeline-options-visible';
const DEFAULT_COLUMNS = {
  select: 34,
  duplicate: 34,
  handle: 34,
  who: 170,
  asset: 250,
  focus: 34,
  actions: 44,
};
const OPTIONAL_COLUMNS = ['who', 'asset'];
const COLUMN_LABELS = { who: 'Who', asset: 'Asset', what: 'What', todo: 'Todo' };
const HEADER_HEIGHT = 92;
const CELL_CLIPBOARD_TYPE = 'application/x-postplanner-cell';

function safePlanningType(value) {
  return PLANNING_TYPES[value]?.key ?? DEFAULT_PLANNING_TYPE;
}

function readJson(key, fallback) {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? '{}') };
  } catch {
    return fallback;
  }
}

function visibleColumnKeys(visibility, optionsVisible = true) {
  const utilityColumns = optionsVisible ? ['focus', 'select'] : [];
  return ['duplicate', 'actions', 'handle', ...OPTIONAL_COLUMNS.filter((key) => visibility[key]), ...utilityColumns];
}

function sumColumns(columns, visibility, optionsVisible) {
  return visibleColumnKeys(visibility, optionsVisible).reduce((total, key) => total + columns[key], 0);
}

function tableTemplate(columns, visibility, optionsVisible) {
  return visibleColumnKeys(visibility, optionsVisible).map((key) => `${columns[key]}px`).join(' ');
}

function timelineGridTemplate(tableVisible, leftWidth, timelineWidth) {
  return tableVisible ? `${leftWidth}px ${timelineWidth}px` : `${timelineWidth}px`;
}

function timelineColumnStyle(tableVisible) {
  return { gridColumn: tableVisible ? 2 : 1 };
}

function nextWorkingDay(date) {
  if (!isWeekend(date)) return date;
  return nextMonday(date);
}

function shiftIsoDate(value, days) {
  if (!value) return value;
  return iso(nextWorkingDay(addDays(parseISO(value), days)));
}

function weekSegments(days) {
  const segments = [];
  days.forEach((day) => {
    const key = `${format(day, 'RRRR')}-${getISOWeek(day)}`;
    const last = segments.at(-1);
    if (last?.key === key) {
      last.span += 1;
      return;
    }
    segments.push({ key, label: `W${getISOWeek(day)}`, span: 1 });
  });
  return segments;
}

function monthAtScroll(days, scrollLeft, dayWidth) {
  const dayIndex = Math.max(0, Math.floor(Math.max(0, scrollLeft) / dayWidth));
  return format(days[Math.min(dayIndex, days.length - 1)] ?? new Date(), 'MMMM yyyy');
}

function hasBlock(item) {
  return Boolean(item.start_date && item.end_date);
}

function transparentColor(hex, alpha = '80') {
  if (!hex?.startsWith('#')) return 'rgba(109, 93, 252, 0.5)';
  const normalized = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  return `${normalized}${alpha}`;
}

function HeaderCell({ children, columnKey, onResizeStart }) {
  return (
    <span className="group relative flex items-center px-3 py-3" data-header-column={columnKey}>
      {children}
      <button type="button" data-resize-column={columnKey} onPointerDown={(event) => onResizeStart(event, columnKey)} className="column-resizer" aria-label={`Resize ${children} column`} />
    </span>
  );
}

function ToolbarMenu({ id, openMenu, setOpenMenu, icon, label, children, buttonClassName = 'timeline-header-chip', tooltip }) {
  const menuRef = useRef(null);
  const open = openMenu === id;
  const MenuIcon = icon;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      setOpenMenu(null);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, setOpenMenu]);

  return (
    <div ref={menuRef} className="relative">
      <button type="button" onClick={() => setOpenMenu(open ? null : id)} className={buttonClassName} data-tooltip={tooltip}>
        {MenuIcon && <MenuIcon size={13} />} {label}
      </button>
      {open && (
        <div className="absolute left-0 z-[500] mt-2 w-64 rounded-lg border border-white/10 bg-ink-850 p-2 text-sm text-ink-100 shadow-glow">
          {children}
        </div>
      )}
    </div>
  );
}

function labelText(labelsById, value) {
  return labelsById[value]?.value ?? '';
}

function whoText(labelsById, value = []) {
  return value.map((id) => labelsById[id]?.value).filter(Boolean).join(', ');
}

function cellText(item, column, labelsById) {
  if (column === 'asset') return item.asset ?? '';
  if (column === 'who') return whoText(labelsById, item.who);
  return labelText(labelsById, item[column]);
}

function timelineBlockLabelText(item, labelsById, showMetaLabels, showWhat = true) {
  return [
    showWhat ? labelsById[item.what]?.value : null,
    labelsById[item.todo]?.value,
    showMetaLabels ? item.time : null,
  ].filter(Boolean).join(' ');
}

function findLabelId(labels, value) {
  const normalized = value.trim().toLowerCase();
  return labels.find((label) => !label.is_divider && label.value.toLowerCase() === normalized)?.id;
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

function SortableLine({
  item,
  labelsById,
  labelsByType,
  projectId,
  dayWidth,
  timelineStart,
  timelineWidth,
  leftWidth,
  tableVisible,
  columns,
  columnVisibility,
  optionsVisible,
  onResizeStart,
  selected,
  selectedIds,
  onSelectionDragStart,
  duplicated,
  onDuplicate,
  onFocusBlock,
  onInteract,
  dragPreview,
  dropTarget,
  onOpenDetails,
  selectedCells,
  onCellSelect,
  onClearCellSelection,
  fillCells,
  onFillStart,
  onSpreadsheetUpdate,
  showMetaLabels,
  showAssetLabels,
  planningDefinition,
  onUpdateLineItem,
  endMarkerAnimating,
}) {
  const { deleteLineItem, addLabel, deleteLabel, flushLineItemUpdate } = usePlanner();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const [openBlockMenu, setOpenBlockMenu] = useState(null);
  const block = hasBlock(item);
  const startOffset = block ? Math.max(0, differenceInCalendarDays(parseISO(item.start_date), timelineStart)) : 0;
  const duration = block ? Math.max(1, daysBetween(item.start_date, item.end_date) + 1) : 1;
  const whoLabels = item.who?.map((id) => labelsById[id]).filter(Boolean) ?? [];
  const timelineColor = whoLabels[0]?.color ?? '#8b8f9a';
  const activePreview = dragPreview?.ids.includes(item.id) ? dragPreview : null;
  const dragOffset = activePreview?.mode === 'move' ? activePreview.offsetPx : 0;
  const resizeOffset = activePreview?.mode === 'start' ? activePreview.offsetPx : 0;
  const resizeWidthDelta = activePreview?.mode === 'start'
    ? -activePreview.offsetPx
    : activePreview?.mode === 'end' ? activePreview.offsetPx : 0;
  const previewDurationPx = Math.max(34, duration * dayWidth - 8 + resizeWidthDelta);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    height: tableVisible ? ROW_HEIGHT : 64,
    gridTemplateColumns: timelineGridTemplate(tableVisible, leftWidth, timelineWidth),
  };

  useEffect(() => {
    if (!openBlockMenu) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpenBlockMenu(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openBlockMenu]);

  const scheduleOnClick = (event) => {
    if (block) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dayIndex = Math.max(0, Math.floor((event.clientX - rect.left) / dayWidth));
    const date = iso(addDays(timelineStart, dayIndex));
    onUpdateLineItem(item.id, { start_date: date, end_date: date });
  };

  const copyCell = (event, column) => {
    const text = cellText(item, column, labelsById);
    event.preventDefault();
    event.clipboardData.setData(CELL_CLIPBOARD_TYPE, JSON.stringify({ column, value: item[column], text }));
    event.clipboardData.setData('text/plain', text);
  };

  const pasteCell = (event, column) => {
    const rawPayload = event.clipboardData.getData(CELL_CLIPBOARD_TYPE);
    const text = event.clipboardData.getData('text/plain');
    let payload = null;
    try {
      payload = rawPayload ? JSON.parse(rawPayload) : null;
    } catch {
      payload = null;
    }

    let nextValue;
    if (payload?.column === column) {
      nextValue = payload.value;
    } else if (column === 'asset') {
      nextValue = payload?.text ?? text;
    } else if (column === 'who') {
      nextValue = (payload?.text ?? text)
        .split(',')
        .map((part) => findLabelId(labelsByType.who, part))
        .filter(Boolean);
    } else {
      nextValue = findLabelId(labelsByType[column], payload?.text ?? text);
    }

    if ((column === 'who' && Array.isArray(nextValue)) || (column !== 'who' && nextValue !== undefined)) {
      event.preventDefault();
      const selectedColumnCells = selectedCells.filter((cell) => cell.column === column);
      const targetIds = selectedColumnCells.length
        ? selectedColumnCells.map((cell) => cell.itemId)
        : selectedIds.includes(item.id) && selectedIds.length > 1 ? selectedIds : [item.id];
      onSpreadsheetUpdate(targetIds, column, nextValue);
    }
  };

  const cellProps = (column) => ({
    className: `cell copy-cell ${(selectedCells.some((cell) => cell.itemId === item.id && cell.column === column) || fillCells.some((cell) => cell.itemId === item.id && cell.column === column)) ? 'copy-cell-selected' : ''}`,
    tabIndex: 0,
    'data-fill-cell': 'true',
    'data-cell-id': item.id,
    'data-cell-column': column,
    onClick: (event) => {
      event.stopPropagation();
      onCellSelect(item.id, column, event);
    },
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget) return;
      const control = event.currentTarget.querySelector('input, button');
      if (!control) return;
      if (event.key.length === 1 && column !== 'asset' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        control.focus();
        control.dispatchEvent(new KeyboardEvent('keydown', { key: event.key, bubbles: true }));
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      control.focus();
      if (control.tagName === 'BUTTON') control.click();
    },
    onCopy: (event) => copyCell(event, column),
    onPaste: (event) => pasteCell(event, column),
    title: `${COLUMN_LABELS[column]} cell. Use standard copy and paste shortcuts.`,
  });

  const fillHandle = (column) => (
    <span className="fill-handle-zone">
      <button
        type="button"
        className="fill-handle"
        onPointerDown={(event) => onFillStart(event, item.id, column)}
        aria-label={`Fill ${COLUMN_LABELS[column]} down`}
        title={`Drag to fill ${COLUMN_LABELS[column]} down`}
      >
        +
      </button>
    </span>
  );
  const assetColumnLabel = planningDefinition.assetLabel ?? COLUMN_LABELS.asset;
  const showWhatSelector = planningDefinition.showWhatSelector !== false;

  return (
    <div
      ref={setNodeRef}
      data-line-id={item.id}
      style={style}
      className={`timeline-line ${duplicated ? 'timeline-line-new' : ''} ${dropTarget?.id === item.id ? `timeline-line-drop-${dropTarget.placement}` : ''}`}
    >
      {tableVisible && (
        <div
          className={`timeline-table-panel timeline-row-table-panel sticky left-0 z-20 grid h-full items-center border-r border-black/10 bg-white dark:border-white/10 dark:bg-ink-950 ${duplicated ? 'timeline-table-row-new' : ''}`}
          style={{
            width: leftWidth,
            gridTemplateColumns: tableTemplate(columns, columnVisibility, optionsVisible),
            '--timeline-asset-edge': `${columns.duplicate + columns.actions + columns.handle + (columnVisibility.who ? columns.who : 0) + columns.asset}px`,
          }}
        >
          <button type="button" onClick={() => onDuplicate(item.id)} className="icon-button mx-auto" aria-label="Duplicate row"><Copy size={15} /></button>
          <button type="button" onClick={() => deleteLineItem(item.id)} className="icon-button mx-auto" aria-label="Delete item"><Trash2 size={16} /></button>
          <button className="drag-handle" {...attributes} {...listeners} aria-label="Reorder row"><GripVertical size={16} /></button>
          {columnVisibility.who && (
            <div {...cellProps('who')}>
              <LabelSelect labels={labelsByType.who} value={item.who} multiple multipleModeToggle placeholder="Who" onChange={(who) => { onInteract(item.id); onUpdateLineItem(item.id, { who }); }} onAddLabel={(value, color, textColor) => addLabel(projectId, 'who', value, color, { planningType: planningDefinition.key, textColor })} onDeleteLabel={deleteLabel} />
              {fillHandle('who')}
            </div>
          )}
          {columnVisibility.asset && (
            <div {...cellProps('asset')}>
              <input
                value={item.asset}
                onChange={(event) => { onInteract(item.id); onUpdateLineItem(item.id, { asset: event.target.value }); }}
                onBlur={() => flushLineItemUpdate(item.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                    onClearCellSelection();
                    return;
                  }
                  if (event.key !== 'Tab') return;
                  const cells = [...document.querySelectorAll('[data-fill-cell="true"][data-cell-column="asset"]')];
                  const currentCell = event.currentTarget.closest('[data-fill-cell="true"]');
                  const currentIndex = cells.indexOf(currentCell);
                  const nextCell = cells[currentIndex + (event.shiftKey ? -1 : 1)];
                  const nextInput = nextCell?.querySelector('input');
                  if (!nextCell?.dataset.cellId || !nextInput) return;
                  event.preventDefault();
                  onCellSelect(nextCell.dataset.cellId, 'asset', {});
                  window.requestAnimationFrame(() => {
                    nextInput.focus();
                    nextInput.select();
                  });
                }}
                className="table-input"
                placeholder={assetColumnLabel}
              />
              {fillHandle('asset')}
            </div>
          )}
          {optionsVisible && (
            <div className="timeline-option-cluster">
              <button type="button" onClick={() => { onInteract(item.id); onFocusBlock(item); }} disabled={!block} className="focus-button" aria-label="Focus booking on timeline">F</button>
              <button
                type="button"
                onPointerDown={(event) => onSelectionDragStart(event, item.id, !selected)}
                className={`focus-button row-link-button ${selected ? 'is-active' : ''}`}
                aria-pressed={selected}
                aria-label={selected ? 'Unlink row from selected rows' : 'Link row to selected rows'}
                title="lock bookings togehtor"
              >
                {selected ? <Link2 size={13} /> : <Link2Off size={13} />}
              </button>
            </div>
          )}
        </div>
      )}
      <div className="relative h-full" style={timelineColumnStyle(tableVisible)} onClick={scheduleOnClick}>
        {block ? (
          <>
            {tableVisible && timelineBlockLabelText(item, labelsById, showMetaLabels, showWhatSelector) && (
              <div
                className="timeline-labels-underlay"
                style={{
                  left: startOffset * dayWidth + 4 + resizeOffset,
                  width: Math.max(34, duration * dayWidth - 8 + resizeWidthDelta),
                  transform: dragOffset ? `translate(${dragOffset}px, -50%)` : undefined,
                }}
                aria-hidden="true"
              >
                {timelineBlockLabelText(item, labelsById, showMetaLabels, showWhatSelector)}
              </div>
            )}
            {tableVisible && <div
                className="timeline-labels"
                style={{
                  left: startOffset * dayWidth + duration * dayWidth + 8
                    + (activePreview?.mode === 'end' ? activePreview.offsetPx : 0),
                  transform: dragOffset ? `translate(${dragOffset}px, -50%)` : undefined,
              }}
            >
                {showWhatSelector && (
                  <span className="timeline-block-select" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                    <LabelSelect
                      labels={labelsByType.what}
                      value={item.what}
                      placeholder="What"
                      open={openBlockMenu === 'what'}
                      onOpenChange={(nextOpen) => setOpenBlockMenu(nextOpen ? 'what' : null)}
                      onChange={(what) => { onInteract(item.id); onUpdateLineItem(item.id, { what }); }}
                      onAddLabel={(value, color, textColor) => addLabel(projectId, 'what', value, color, { planningType: planningDefinition.key, textColor })}
                      onDeleteLabel={deleteLabel}
                    />
                  </span>
                )}
                <span className="timeline-block-select" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                  <LabelSelect
                    labels={labelsByType.todo}
                    value={item.todo}
                    placeholder="Todo"
                    open={openBlockMenu === 'todo'}
                    onOpenChange={(nextOpen) => setOpenBlockMenu(nextOpen ? 'todo' : null)}
                    onChange={(todo) => { onInteract(item.id); onUpdateLineItem(item.id, { todo }); }}
                    onAddLabel={(value, color, textColor) => addLabel(projectId, 'todo', value, color, { planningType: planningDefinition.key, textColor })}
                    onDeleteLabel={deleteLabel}
                  />
                </span>
                {showMetaLabels && (
                  <>
                    <button type="button" className="timeline-meta-chip" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenDetails(item.id); }}>
                      {item.time || 'Time'}
                    </button>
                    {item.notes?.trim() && (
                      <button type="button" className="timeline-note-chip" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenDetails(item.id); }} aria-label="View note" title="View note">
                        <StickyNote size={12} />
                      </button>
                    )}
                  </>
                )}
            </div>}
            <div
              className="timeline-bar"
              style={{
                left: startOffset * dayWidth + 4 + resizeOffset,
                width: previewDurationPx,
                transform: dragOffset ? `translateX(${dragOffset}px)` : undefined,
                borderColor: transparentColor(timelineColor, '80'),
                '--marker-left': `${Math.max(14, previewDurationPx - dayWidth / 2 + 4)}px`,
              }}
              onPointerDown={(event) => { onInteract(item.id); onResizeStart(event, item, 'move'); }}
              onClick={(event) => { event.stopPropagation(); onOpenDetails(item.id); }}
            >
              <button className="resize-grip left-0" onPointerDown={(event) => onResizeStart(event, item, 'start')} aria-label="Resize start" />
              <span
                className={`timeline-end-marker ${endMarkerAnimating ? 'is-animating' : ''}`}
                style={{ '--end-marker-color': timelineColor }}
                aria-hidden="true"
              />
              {showAssetLabels && item.asset && <div className="timeline-asset-label">{item.asset}</div>}
              <button className="resize-grip right-0" onPointerDown={(event) => onResizeStart(event, item, 'end')} aria-label="Resize end" />
            </div>
          </>
        ) : (
          <div className="timeline-empty-hint">Click a date to add block</div>
        )}
      </div>
    </div>
  );
}

function CategoryBlock({
  category,
  rows,
  projectId,
  labelsById,
  labelsByType,
  timelineWidth,
  dayWidth,
  timelineStart,
  leftWidth,
  tableVisible,
  columns,
  columnVisibility,
  optionsVisible,
  onResizeStart,
  onAddLineItem,
  selectedIds,
  onSelect,
  onSelectionDragStart,
  duplicatedIds,
  onDuplicate,
  onFocusBlock,
  onInteract,
  dragPreview,
  dropTarget,
  onOpenDetails,
  selectedCells,
  onCellSelect,
  onClearCellSelection,
  fillCells,
  onFillStart,
  onSpreadsheetUpdate,
  onRenameUncategorized,
  onAddDefaultPlanning,
  onAddClientReviewRows,
  onRemoveClientReviewRows,
  canAddReviews,
  showMetaLabels,
  showAssetLabels,
  planningDefinition,
  categoryCount,
  onUpdateLineItem,
  endMarkerIds,
}) {
  const { updateCategory, deleteCategory } = usePlanner();
  const [openCategoryMenu, setOpenCategoryMenu] = useState(null);
  const sortableId = `category:${category.id}`;
  const sortableEnabled = category.id !== 'uncategorized';
  const { attributes: categoryAttributes, listeners: categoryListeners, setNodeRef: setCategoryNodeRef, transform: categoryTransform, transition: categoryTransition } = useSortable({
    id: sortableId,
    disabled: !sortableEnabled,
  });
  const [draftName, setDraftName] = useState(category.name);
  const isUncategorized = category.id === 'uncategorized';
  const editable = Boolean(category.id);
  const categoryPlanningType = safePlanningType(category.planning_type ?? planningDefinition.key);
  const showClientReviewAction = categoryPlanningType !== PLANNING_TYPES.production.key;
  const visibleCategoryActionCount = 2 + (categoryCount > 1 ? 1 : 0) + (showClientReviewAction ? 1 : 0);
  const categoryActionSpacerCount = Math.max(0, 4 - visibleCategoryActionCount);

  useEffect(() => {
    setDraftName(category.name);
  }, [category.name]);

  useEffect(() => {
    if (!openCategoryMenu) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpenCategoryMenu(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openCategoryMenu]);

  const commitName = () => {
    const nextName = (draftName.trim() || category.name).toUpperCase();
    setDraftName(nextName);
    if (!editable || nextName === category.name) return;
    if (isUncategorized) {
      onRenameUncategorized?.(nextName);
    } else {
      updateCategory(category.id, { name: nextName });
    }
  };

  const categoryNameInput = (className = '') => (
    <input
      value={draftName}
      onChange={(event) => editable && setDraftName(event.target.value.toUpperCase())}
      onBlur={commitName}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraftName(category.name);
          event.currentTarget.blur();
        }
      }}
      className={`category-input timeline-category-name ${className}`}
      readOnly={!editable}
      aria-label="Category name"
      title={editable ? 'Edit category name' : category.name}
    />
  );

  return (
    <section
      ref={setCategoryNodeRef}
      style={{
        transform: CSS.Transform.toString(categoryTransform),
        transition: categoryTransition,
      }}
    >
      <div className="timeline-category" style={{ gridTemplateColumns: timelineGridTemplate(tableVisible, leftWidth, timelineWidth) }}>
        {tableVisible && (
          <div className="timeline-table-panel timeline-category-table-panel sticky left-0 z-30 grid grid-cols-[44px_28px_1fr_24px_24px_24px_24px] items-center border-r border-black/10 bg-zinc-100 dark:border-white/10 dark:bg-ink-850">
            <button type="button" onClick={() => updateCategory(category.id, { collapsed: !category.collapsed })} className="icon-button mx-auto" disabled={isUncategorized}>
              {category.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </button>
            <button type="button" className="category-drag-handle" disabled={!sortableEnabled} aria-label="Drag category" {...categoryAttributes} {...categoryListeners}>
              <GripVertical size={15} />
            </button>
            {categoryNameInput()}
            {!isUncategorized && Array.from({ length: categoryActionSpacerCount }, (_, index) => <span key={`action-spacer-${index}`} aria-hidden="true" />)}
            {!isUncategorized && showClientReviewAction && (
              <button type="button" onClick={() => onAddLineItem(projectId, category.id)} className="icon-button category-action-button mx-auto" aria-label="Add row" data-tooltip="add row"><Plus size={16} /></button>
            )}
            {!isUncategorized && categoryCount > 1 && (
              <button
                type="button"
                onClick={() => {
                  const bookingText = rows.length === 1 ? '1 booking' : `${rows.length} bookings`;
                  if (window.confirm(`Delete "${category.name}" and ${bookingText}? This cannot be undone.`)) {
                    deleteCategory(category.id);
                  }
                }}
                className="icon-button category-action-button mx-auto"
                aria-label="Delete category"
                data-tooltip="delete catgorie"
              >
                <Trash2 size={15} />
              </button>
            )}
            {!isUncategorized && (
              <ToolbarMenu id={`reviews-${category.id}`} openMenu={openCategoryMenu} setOpenMenu={setOpenCategoryMenu} label="R+" buttonClassName="icon-button category-action-button mx-auto" tooltip="add client reviews">
                <button type="button" onClick={() => { onAddClientReviewRows(category.id, 1); setOpenCategoryMenu(null); }} disabled={!canAddReviews} className="w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-ink-100 hover:bg-white/5 disabled:opacity-50">Add client reviews - 24h</button>
                <button type="button" onClick={() => { onAddClientReviewRows(category.id, 2); setOpenCategoryMenu(null); }} disabled={!canAddReviews} className="w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-ink-100 hover:bg-white/5 disabled:opacity-50">Add client reviews - 48h</button>
                <button type="button" onClick={() => { onRemoveClientReviewRows(category.id); setOpenCategoryMenu(null); }} className="w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-red-200 hover:bg-red-500/10">Remove client rows</button>
              </ToolbarMenu>
            )}
            {!isUncategorized && (
              <button type="button" onClick={() => onAddDefaultPlanning(category.id)} className="icon-button category-action-button mx-auto" aria-label="Add default planning" data-tooltip="add default planning"><ListPlus size={16} /></button>
            )}
          </div>
        )}
        <div className="timeline-category-band" style={timelineColumnStyle(tableVisible)}>
          {!tableVisible && (
            <div className="flex h-full items-center gap-2 px-3">
              <button type="button" onClick={() => updateCategory(category.id, { collapsed: !category.collapsed })} className="icon-button" disabled={isUncategorized}>
                {category.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </button>
              <button type="button" className="category-drag-handle" disabled={!sortableEnabled} aria-label="Drag category" {...categoryAttributes} {...categoryListeners}>
                <GripVertical size={15} />
              </button>
              {categoryNameInput('max-w-sm')}
            </div>
          )}
        </div>
      </div>

      {!category.collapsed && (
        <>
          <SortableContext items={rows.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            {rows.map((item) => (
              <SortableLine
                key={item.id}
                item={item}
                labelsById={labelsById}
                labelsByType={labelsByType}
                projectId={projectId}
                dayWidth={dayWidth}
                timelineStart={timelineStart}
                timelineWidth={timelineWidth}
                leftWidth={leftWidth}
                tableVisible={tableVisible}
                columns={columns}
                columnVisibility={columnVisibility}
                optionsVisible={optionsVisible}
                onResizeStart={onResizeStart}
                selected={selectedIds.includes(item.id)}
                selectedIds={selectedIds}
                onSelect={onSelect}
                onSelectionDragStart={onSelectionDragStart}
                duplicated={duplicatedIds.includes(item.id)}
                onDuplicate={onDuplicate}
                onFocusBlock={onFocusBlock}
                onInteract={onInteract}
                dragPreview={dragPreview}
                dropTarget={dropTarget}
                onOpenDetails={onOpenDetails}
                selectedCells={selectedCells}
                onCellSelect={onCellSelect}
                onClearCellSelection={onClearCellSelection}
                fillCells={fillCells}
                onFillStart={onFillStart}
                onSpreadsheetUpdate={onSpreadsheetUpdate}
                showMetaLabels={showMetaLabels}
                showAssetLabels={showAssetLabels}
                planningDefinition={planningDefinition}
                onUpdateLineItem={onUpdateLineItem}
                endMarkerAnimating={endMarkerIds.includes(item.id)}
              />
            ))}
          </SortableContext>
          {!isUncategorized && tableVisible && (
            <button type="button" onClick={() => onAddLineItem(projectId, category.id)} className="timeline-table-panel timeline-row-table-panel sticky left-0 z-20 flex h-10 items-center gap-2 border-r border-t border-black/10 bg-white px-4 text-sm text-ink-500 hover:text-accent-400 dark:border-white/10 dark:bg-ink-950" style={{ width: leftWidth }}>
              <Plus size={15} /> Add item
            </button>
          )}
        </>
      )}
    </section>
  );
}

export default function TimelineView({ project, planningType = DEFAULT_PLANNING_TYPE, planningVersion = 'V1' }) {
  const { user } = useAuth();
  const { categories, lineItems, labels, shareLinks, appSettings, addCategory, addLineItem, addLabel, addClientReviews, removeClientReviews, duplicateLineItem, reorderLineItems, reorderCategories, moveLineItemRelative, updateLineItem, flushLineItemUpdate, createShareLink, revokeShareLink } = usePlanner();
  const activePlanningType = safePlanningType(planningType);
  const planningDefinition = PLANNING_TYPES[activePlanningType] ?? PLANNING_TYPES.post;
  const [zoom, setZoom] = useState('month');
  const [tableVisible, setTableVisible] = useState(true);
  const [columns, setColumns] = useState(() => readJson(COLUMN_STORAGE_KEY, DEFAULT_COLUMNS));
  const columnVisibility = { who: true, asset: true };
  const [uncategorizedNames, setUncategorizedNames] = useState(() => readLocalObject(UNCATEGORIZED_NAME_STORAGE_KEY, {}));
  const [hiddenWhoIds, setHiddenWhoIds] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [duplicatedIds, setDuplicatedIds] = useState([]);
  const [visibleMonth, setVisibleMonth] = useState('');
  const optionsVisibilityStorageKey = `${OPTIONS_VISIBILITY_STORAGE_KEY}:${user.id}`;
  const [optionsVisible, setOptionsVisible] = useState(() => localStorage.getItem(optionsVisibilityStorageKey) === 'true');
  const [infoVisible, setInfoVisible] = useState(false);
  const [showMetaLabels, setShowMetaLabels] = useState(true);
  const [showAssetLabels, setShowAssetLabels] = useState(false);
  const [dragPreview, setDragPreview] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [selectedCells, setSelectedCells] = useState([]);
  const [fillCells, setFillCells] = useState([]);
  const [detailsItemId, setDetailsItemId] = useState(null);
  const [openTableMenu, setOpenTableMenu] = useState(null);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [endMarkerIds, setEndMarkerIds] = useState([]);
  const scrollRef = useRef(null);
  const monthMenuRef = useRef(null);
  const didInitialFocus = useRef(false);
  const suppressDetailsOpen = useRef(false);
  const scrollAnchorRef = useRef(null);
  const timelineUndoRef = useRef([]);

  const allRows = useMemo(() => lineItems.filter((item) => item.project_id === project.id && safePlanningType(item.planning_type) === activePlanningType && (item.planning_version ?? 'V1') === planningVersion).sort((a, b) => a.sort_order - b.sort_order), [activePlanningType, lineItems, planningVersion, project.id]);
  const activeShare = shareLinks.find((share) => share.project_id === project.id
    && share.page_type === 'client_planning'
    && safePlanningType(share.planning_type) === activePlanningType
    && (share.planning_version ?? 'V1') === planningVersion
    && !share.revoked_at);
  const projectCategories = useMemo(() => categories.filter((category) => category.project_id === project.id && safePlanningType(category.planning_type) === activePlanningType && (category.planning_version ?? 'V1') === planningVersion).sort((a, b) => a.sort_order - b.sort_order), [activePlanningType, categories, planningVersion, project.id]);
  const projectLabels = useMemo(() => labels.filter((label) => {
    const belongsToProject = !label.project_id || label.project_id === project.id;
    const availableInPlanning = !label.planning_type || label.planning_type === 'both' || label.planning_type === activePlanningType;
    return belongsToProject && availableInPlanning;
  }), [activePlanningType, labels, project.id]);
  const labelsById = useMemo(() => Object.fromEntries(projectLabels.map((label) => [label.id, label])), [projectLabels]);
  const sortLabels = (items) => items.sort((a, b) => {
    const order = (a.sort_order ?? 9999) - (b.sort_order ?? 9999);
    if (order !== 0) return order;
    if ((a.scope ?? 'project') !== (b.scope ?? 'project')) return (a.scope ?? 'project') === 'global' ? -1 : 1;
    return (a.value ?? '').localeCompare(b.value ?? '');
  });
  const labelsByType = useMemo(() => ({
    who: sortLabels(projectLabels.filter((label) => label.column_type === 'who' && !label.is_divider)),
    what: sortLabels(projectLabels.filter((label) => label.column_type === 'what')),
    todo: activePlanningType === PLANNING_TYPES.production.key
      ? projectLabels
        .filter((label) => label.column_type === 'todo'
          && !label.is_divider
          && (label.project_id || PRODUCTION_TODO_LABELS.includes(label.value)))
        .sort((a, b) => {
          const aIndex = PRODUCTION_TODO_LABELS.indexOf(a.value);
          const bIndex = PRODUCTION_TODO_LABELS.indexOf(b.value);
          return (aIndex < 0 ? 9999 : aIndex) - (bIndex < 0 ? 9999 : bIndex);
        })
      : sortLabels(projectLabels.filter((label) => label.column_type === 'todo' && !label.is_divider)),
  }), [activePlanningType, projectLabels]);
  const reviewLabels = useMemo(() => ({
    wenneker: labelsByType.who.find((label) => label.value.toLowerCase() === 'wenneker')?.id,
    client: labelsByType.who.find((label) => label.value.toLowerCase() === 'client')?.id,
    share: labelsByType.todo.find((label) => label.value.toLowerCase() === 'share')?.id,
    shareFeedback: labelsByType.todo.find((label) => label.value.toLowerCase() === 'share feedback')?.id,
  }), [labelsByType]);
  const rows = useMemo(
    () => allRows.filter((item) => !item.who?.some((whoId) => hiddenWhoIds.includes(whoId))),
    [allRows, hiddenWhoIds],
  );
  const timelineDays = useMemo(() => buildTimelineDays(allRows, zoom), [allRows, zoom]);
  const timelineStart = timelineDays[0];
  const dayWidth = DAY_WIDTH[zoom];
  const timelineWidth = timelineDays.length * dayWidth;
  const leftWidth = tableVisible ? sumColumns(columns, columnVisibility, optionsVisible) : 0;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const uncategorized = rows.filter((item) => !item.category_id);
  const uncategorizedName = uncategorizedNames[project.id] || 'Uncategorized';
  const months = monthSegments(timelineDays);
  const weeks = weekSegments(timelineDays);
  const upcomingMonths = useMemo(() => Array.from({ length: 6 }, (_, index) => startOfMonth(addMonths(new Date(), index))), []);
  const projectInfo = useMemo(
    () => buildProjectSummary({ lineItems: allRows, labelsById, categories: projectCategories, uncategorizedName }),
    [allRows, labelsById, projectCategories, uncategorizedName],
  );

  useEffect(() => {
    if (scrollAnchorRef.current && scrollRef.current) {
      const { date, offset } = scrollAnchorRef.current;
      const nextIndex = Math.max(0, differenceInCalendarDays(parseISO(date), timelineStart));
      scrollRef.current.scrollLeft = nextIndex * dayWidth + offset;
      scrollAnchorRef.current = null;
    }
    setVisibleMonth(monthAtScroll(timelineDays, scrollRef.current?.scrollLeft ?? 0, dayWidth));
  }, [dayWidth, timelineDays, timelineStart]);

  useEffect(() => {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columns));
  }, [columns]);

  useEffect(() => {
    localStorage.setItem(optionsVisibilityStorageKey, String(optionsVisible));
  }, [optionsVisibilityStorageKey, optionsVisible]);

  useEffect(() => {
    localStorage.setItem(UNCATEGORIZED_NAME_STORAGE_KEY, JSON.stringify(uncategorizedNames));
  }, [uncategorizedNames]);

  const renameUncategorized = (name) => {
    setUncategorizedNames((current) => ({ ...current, [project.id]: name }));
  };

  const focusToday = (behavior = 'smooth') => {
    const todayIndex = timelineDays.findIndex((day) => isSameDay(day, new Date()));
    if (todayIndex < 0 || !scrollRef.current) return;
    scrollRef.current.scrollTo({
      left: Math.max(0, todayIndex * dayWidth - 24),
      behavior,
    });
  };

  useEffect(() => {
    if (didInitialFocus.current || !timelineDays.length) return;
    didInitialFocus.current = true;
    requestAnimationFrame(() => {
      const todayIndex = timelineDays.findIndex((day) => isSameDay(day, new Date()));
      if (todayIndex < 0 || !scrollRef.current) return;
      scrollRef.current.scrollTo({ left: Math.max(0, todayIndex * dayWidth - 24), behavior: 'auto' });
    });
  }, [dayWidth, timelineDays]);

  const focusBlock = (item) => {
    if (!item.start_date || !scrollRef.current) return;
    const startIndex = Math.max(0, differenceInCalendarDays(parseISO(item.start_date), timelineStart));
    scrollRef.current.scrollTo({
      left: Math.max(0, startIndex * dayWidth - 24),
      behavior: 'smooth',
    });
  };

  const jumpToMonth = (monthDate) => {
    const monthIndex = timelineDays.findIndex((day) => isSameMonth(day, monthDate));
    if (monthIndex < 0 || !scrollRef.current) return;
    scrollRef.current.scrollTo({
      left: Math.max(0, monthIndex * dayWidth - 24),
      behavior: 'smooth',
    });
    setVisibleMonth(format(monthDate, 'MMMM yyyy'));
    setMonthMenuOpen(false);
  };

  useEffect(() => {
    if (!monthMenuOpen) return undefined;
    const onPointerDown = (event) => {
      if (monthMenuRef.current?.contains(event.target)) return;
      setMonthMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMonthMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [monthMenuOpen]);

  const cloneValue = (value) => (Array.isArray(value) ? [...value] : value);
  const pushTimelineUndo = (changes) => {
    const cleanChanges = changes.filter((change) => change?.itemId && change.previous && Object.keys(change.previous).length);
    if (!cleanChanges.length) return;
    timelineUndoRef.current.push(cleanChanges);
  };
  const updateLineItemWithUndo = (itemId, next) => {
    const item = allRows.find((row) => row.id === itemId);
    if (!item) {
      updateLineItem(itemId, next);
      return;
    }
    const previous = Object.fromEntries(
      Object.keys(next)
        .filter((key) => JSON.stringify(item[key]) !== JSON.stringify(next[key]))
        .map((key) => [key, cloneValue(item[key])]),
    );
    pushTimelineUndo([{ itemId, previous }]);
    updateLineItem(itemId, next);
  };
  const updateLineItemsWithUndo = (updates) => {
    const changes = updates
      .map(({ itemId, next }) => {
        const item = allRows.find((row) => row.id === itemId);
        if (!item) return null;
        const previous = Object.fromEntries(
          Object.keys(next)
            .filter((key) => JSON.stringify(item[key]) !== JSON.stringify(next[key]))
            .map((key) => [key, cloneValue(item[key])]),
        );
        return { itemId, previous };
      })
      .filter(Boolean);
    pushTimelineUndo(changes);
    updates.forEach(({ itemId, next }) => updateLineItem(itemId, next));
  };
  const flashEndMarkers = (itemIds) => {
    const ids = [...new Set(itemIds)].filter(Boolean);
    if (!ids.length) return;
    setEndMarkerIds((current) => [...new Set([...current, ...ids])]);
    window.setTimeout(() => {
      setEndMarkerIds((current) => current.filter((id) => !ids.includes(id)));
    }, 1500);
  };

  const addItemAtVisibleStart = (projectId, categoryId) => {
    const scroller = scrollRef.current;
    const scrollerRect = scroller?.getBoundingClientRect();
    const tableRight = (scrollerRect?.left ?? 0) + (tableVisible ? leftWidth : 0);
    const firstVisibleDay = [...(scroller?.querySelectorAll('[data-timeline-date]') ?? [])]
      .find((element) => element.getBoundingClientRect().left >= tableRight - 0.5);
    const fallbackDayIndex = Math.min(
      timelineDays.length - 1,
      Math.max(0, Math.floor((scroller?.scrollLeft ?? 0) / dayWidth)),
    );
    const firstVisibleDate = firstVisibleDay?.dataset.timelineDate
      ? parseISO(firstVisibleDay.dataset.timelineDate)
      : (timelineDays[fallbackDayIndex] ?? new Date());
    addLineItem(projectId, categoryId, iso(firstVisibleDate), {
      what: '',
      todo: '',
      time: 'EOD',
    }, planningVersion, activePlanningType);
  };

  const addDefaultPlanning = (categoryId = projectCategories[0]?.id ?? null) => {
    const today = iso(new Date());
    const wenneker = labelsByType.who.find((label) => label.value.toLowerCase() === 'wenneker');
    const defaultLabelNames = activePlanningType === PLANNING_TYPES.production.key ? PRODUCTION_WHAT_LABELS : DEFAULT_PLANNING_WHAT_LABELS;
    const fallbackIds = defaultLabelNames
      .map((labelName) => labelsByType.what.find((label) => label.value.toLowerCase() === labelName.toLowerCase())?.id)
      .filter(Boolean);
    const defaultPlanningIds = activePlanningType === PLANNING_TYPES.production.key ? fallbackIds : (appSettings?.defaultPlanning?.length ? appSettings.defaultPlanning : fallbackIds);
    const createdIds = defaultPlanningIds.map((labelId) => {
      const whatLabel = labelsByType.what.find((label) => label.id === labelId && !label.is_divider);
      if (!whatLabel) return null;
      const itemId = addLineItem(project.id, categoryId, today, {
        who: wenneker ? [wenneker.id] : [],
        what: whatLabel.id,
        time: 'EOD',
      }, planningVersion, activePlanningType);
      return itemId;
    }).filter(Boolean);
    if (!createdIds.length) return;
    setDuplicatedIds((current) => [...current, ...createdIds]);
    window.setTimeout(() => setDuplicatedIds((current) => current.filter((id) => !createdIds.includes(id))), 5000);
  };

  const shiftPlanning = (days) => {
    updateLineItemsWithUndo(allRows.filter((item) => item.start_date && item.end_date).map((item) => ({
      itemId: item.id,
      next: {
        start_date: shiftIsoDate(item.start_date, days),
        end_date: shiftIsoDate(item.end_date, days),
      },
    })));
  };

  const onColumnResizeStart = (event, columnKey) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startWidth = Number(columns[columnKey]) || DEFAULT_COLUMNS[columnKey];
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const move = (moveEvent) => {
      const nextWidth = Math.max(72, startWidth + moveEvent.clientX - startX);
      setColumns((current) => ({ ...current, [columnKey]: nextWidth }));
    };
    const up = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onResizeStart = (event, item, mode) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startScrollLeft = scrollRef.current?.scrollLeft ?? 0;
    let currentX = startX;
    let currentY = event.clientY;
    let autoScrollFrame = null;
    let latestDelta = 0;
    const originalStart = parseISO(item.start_date);
    const originalEnd = parseISO(item.end_date);
    const originalStartOffset = Math.max(0, differenceInCalendarDays(originalStart, timelineStart));
    const originalDuration = Math.max(1, differenceInCalendarDays(originalEnd, originalStart) + 1);
    const linkedRows = mode === 'move' && selectedIds.includes(item.id)
      ? allRows.filter((row) => selectedIds.includes(row.id) && row.start_date && row.end_date)
      : [];
    const linkedOriginals = linkedRows.map((row) => ({
      id: row.id,
      start: parseISO(row.start_date),
      end: parseISO(row.end_date),
    }));
    const previewIds = linkedOriginals.length ? linkedOriginals.map((row) => row.id) : [item.id];

    const commitMove = (delta) => {
      const scroller = scrollRef.current;
      if (scroller) {
        scrollAnchorRef.current = {
          date: iso(addDays(timelineStart, Math.floor(scroller.scrollLeft / dayWidth))),
          offset: scroller.scrollLeft % dayWidth,
        };
      }
      if (linkedOriginals.length) {
        updateLineItemsWithUndo(linkedOriginals.map((row) => ({
          itemId: row.id,
          next: { start_date: iso(addDays(row.start, delta)), end_date: iso(addDays(row.end, delta)) },
        })));
        return;
      }
      updateLineItemsWithUndo([{
        itemId: item.id,
        next: { start_date: iso(addDays(originalStart, delta)), end_date: iso(addDays(originalEnd, delta)) },
      }]);
    };

    const updateDrag = () => {
      const scrollDelta = (scrollRef.current?.scrollLeft ?? startScrollLeft) - startScrollLeft;
      const rawDeltaPx = currentX - startX + scrollDelta;
      const requestedDelta = Math.round(rawDeltaPx / dayWidth);
      if (mode === 'move') {
        latestDelta = requestedDelta;
        setDragPreview({ ids: previewIds, mode, offsetPx: rawDeltaPx });
        return;
      }
      const maxStartDelta = Math.max(0, differenceInCalendarDays(originalEnd, originalStart));
      const delta = mode === 'start'
        ? Math.min(requestedDelta, maxStartDelta)
        : Math.max(requestedDelta, -maxStartDelta);
      latestDelta = delta;
      const minOffset = mode === 'start' ? -originalStartOffset * dayWidth : -(originalDuration - 1) * dayWidth;
      const maxOffset = mode === 'start' ? (originalDuration - 1) * dayWidth : Number.POSITIVE_INFINITY;
      const previewOffset = Math.max(minOffset, Math.min(maxOffset, rawDeltaPx));
      setDragPreview({ ids: previewIds, mode, offsetPx: previewOffset });
    };

    const autoScroll = () => {
      const scroller = scrollRef.current;
      if (!scroller) {
        autoScrollFrame = null;
        return;
      }
      const rect = scroller.getBoundingClientRect();
      const edge = 96;
      const timelineLeft = rect.left + leftWidth;
      const leftPressure = Math.max(0, edge - (currentX - timelineLeft));
      const rightPressure = Math.max(0, edge - (rect.right - currentX));
      const velocity = rightPressure ? Math.ceil((rightPressure / edge) * 18) : -Math.ceil((leftPressure / edge) * 18);

      if (velocity) {
        scroller.scrollLeft = Math.max(0, scroller.scrollLeft + velocity);
        setVisibleMonth(monthAtScroll(timelineDays, scroller.scrollLeft, dayWidth));
        updateDrag();
        autoScrollFrame = requestAnimationFrame(autoScroll);
        return;
      }
      autoScrollFrame = null;
    };

    const move = (moveEvent) => {
      currentX = moveEvent.clientX;
      currentY = moveEvent.clientY;
      if (Math.abs(currentX - startX) > 4) suppressDetailsOpen.current = true;
      if (mode === 'move') {
        const targetLine = document
          .elementsFromPoint(currentX, currentY)
          .map((element) => element.closest?.('.timeline-line[data-line-id]'))
          .find((line) => line?.dataset.lineId && line.dataset.lineId !== item.id);
        if (targetLine) {
          const rect = targetLine.getBoundingClientRect();
          setDropTarget({ id: targetLine.dataset.lineId, placement: currentY > rect.top + rect.height / 2 ? 'after' : 'before' });
        } else {
          setDropTarget(null);
        }
      }
      updateDrag();
      if (!autoScrollFrame) autoScrollFrame = requestAnimationFrame(autoScroll);
    };

    const up = () => {
      if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame);
      if (mode === 'move') {
        commitMove(latestDelta);
        if (latestDelta !== 0) flashEndMarkers(previewIds);
        const targetLine = document
          .elementsFromPoint(currentX, currentY)
          .map((element) => element.closest?.('.timeline-line[data-line-id]'))
          .find(Boolean);
        const targetId = targetLine?.dataset.lineId;
        if (targetId && targetId !== item.id && !selectedIds.includes(targetId)) {
          const rect = targetLine.getBoundingClientRect();
          const placement = currentY > rect.top + rect.height / 2 ? 'after' : 'before';
          moveLineItemRelative(project.id, item.id, targetId, placement, planningVersion, activePlanningType);
        }
      } else if (latestDelta !== 0) {
        updateLineItemsWithUndo([{
          itemId: item.id,
          next: mode === 'start'
            ? { start_date: iso(addDays(originalStart, latestDelta)) }
            : { end_date: iso(addDays(originalEnd, latestDelta)) },
        }]);
        flashEndMarkers([item.id]);
      }
      setDragPreview(null);
      setDropTarget(null);
      window.setTimeout(() => {
        suppressDetailsOpen.current = false;
      }, 0);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    if (mode === 'move') updateDrag();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const toggleWhoFilter = (labelId) => {
    setHiddenWhoIds((current) => (current.includes(labelId) ? current.filter((id) => id !== labelId) : [...current, labelId]));
  };

  const toggleSelect = (itemId, checked) => {
    setSelectedIds((current) => (checked ? [...new Set([...current, itemId])] : current.filter((id) => id !== itemId)));
  };

  const toggleSelectAll = (checked) => {
    setSelectedIds(checked ? rows.map((item) => item.id) : []);
  };

  const startSelectionDrag = (event, itemId, checked) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const selectableIds = new Set(rows.map((row) => row.id));
    const visited = new Set();
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    const applyToRow = (rowId) => {
      if (!rowId || !selectableIds.has(rowId) || visited.has(rowId)) return;
      visited.add(rowId);
      setSelectedIds((current) => (
        checked
          ? [...new Set([...current, rowId])]
          : current.filter((id) => id !== rowId)
      ));
    };

    applyToRow(itemId);

    const move = (moveEvent) => {
      const targetLine = document
        .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        ?.closest?.('.timeline-line[data-line-id]');
      applyToRow(targetLine?.dataset.lineId);
    };

    const up = () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  const duplicateRow = (itemId) => {
    const duplicatedId = duplicateLineItem(itemId);
    if (!duplicatedId) return;
    setDuplicatedIds((current) => [...current, duplicatedId]);
    window.setTimeout(() => setDuplicatedIds((current) => current.filter((id) => id !== duplicatedId)), 5000);
  };

  const addClientReviewRows = (categoryId, offsetDays) => {
    const shareFeedbackId = reviewLabels.shareFeedback
      ?? addLabel(project.id, 'todo', 'Share Feedback', '#6d5dfc')?.id;
    const reviewTodoIds = [shareFeedbackId, reviewLabels.share].filter(Boolean);
    const createdIds = addClientReviews(project.id, reviewLabels.wenneker, reviewLabels.client, shareFeedbackId, offsetDays, reviewTodoIds, categoryId, planningVersion, activePlanningType) ?? [];
    if (!createdIds.length) return;
    setDuplicatedIds((current) => [...current, ...createdIds]);
    window.setTimeout(() => {
      setDuplicatedIds((current) => current.filter((id) => !createdIds.includes(id)));
    }, 5000);
  };

  const removeClientReviewRows = (categoryId) => {
    const removedIds = removeClientReviews(project.id, reviewLabels.wenneker, reviewLabels.client, [reviewLabels.shareFeedback, reviewLabels.share], categoryId, planningVersion, activePlanningType) ?? [];
    if (removedIds.length) setSelectedIds((current) => current.filter((id) => !removedIds.includes(id)));
  };

  const clearDuplicateState = (itemId) => {
    setDuplicatedIds((current) => current.filter((id) => id !== itemId));
  };

  const selectCell = (itemId, column, event) => {
    setSelectedCells((current) => {
      const cell = { itemId, column };
      const exists = current.some((item) => item.itemId === itemId && item.column === column);
      if (event.metaKey || event.ctrlKey) {
        return exists ? current.filter((item) => !(item.itemId === itemId && item.column === column)) : [...current, cell];
      }
      if (event.shiftKey && current.length) {
        const anchor = current.at(-1);
        if (anchor.column !== column) return [cell];
        const start = rows.findIndex((item) => item.id === anchor.itemId);
        const end = rows.findIndex((item) => item.id === itemId);
        if (start < 0 || end < 0) return [cell];
        const [from, to] = [Math.min(start, end), Math.max(start, end)];
        return rows.slice(from, to + 1).map((row) => ({ itemId: row.id, column }));
      }
      return [cell];
    });
  };

  const applySpreadsheetUpdate = (targetIds, column, value) => {
    const ids = [...new Set(targetIds)].filter(Boolean);
    const changes = ids
      .map((itemId) => {
        const item = allRows.find((row) => row.id === itemId);
        if (!item) return null;
        return {
          itemId,
          previous: { [column]: Array.isArray(item[column]) ? [...item[column]] : item[column] },
          next: { [column]: Array.isArray(value) ? [...value] : value },
        };
      })
      .filter(Boolean);
    if (!changes.length) return;
    pushTimelineUndo(changes);
    changes.forEach((change) => {
      clearDuplicateState(change.itemId);
      updateLineItem(change.itemId, change.next);
    });
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z' || event.shiftKey) return;
      const timelineChanges = timelineUndoRef.current.pop();
      if (timelineChanges?.length) {
        event.preventDefault();
        timelineChanges.forEach((change) => updateLineItem(change.itemId, change.previous));
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [updateLineItem]);

  const fillRange = (sourceId, targetId, column) => {
    const sourceIndex = rows.findIndex((item) => item.id === sourceId);
    const targetIndex = rows.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return [];
    const [from, to] = [Math.min(sourceIndex, targetIndex), Math.max(sourceIndex, targetIndex)];
    return rows.slice(from, to + 1).map((row) => ({ itemId: row.id, column }));
  };

  const startFillDrag = (event, sourceId, column) => {
    event.preventDefault();
    event.stopPropagation();
    const source = rows.find((item) => item.id === sourceId);
    if (!source) return;
    const sourceIndex = rows.findIndex((item) => item.id === sourceId);
    const sourceValue = Array.isArray(source[column]) ? [...source[column]] : source[column];
    let targetId = sourceId;

    const updateTarget = (clientX, clientY) => {
      const targetCell = document
        .elementsFromPoint(clientX, clientY)
        .map((element) => element.closest?.(`[data-fill-cell="true"][data-cell-column="${column}"]`))
        .find((element) => element?.dataset.cellId);
      if (!targetCell) return;
      targetId = targetCell.dataset.cellId;
      setFillCells(fillRange(sourceId, targetId, column));
    };

    const move = (moveEvent) => {
      updateTarget(moveEvent.clientX, moveEvent.clientY);
    };

    const up = () => {
      const targetIndex = rows.findIndex((item) => item.id === targetId);
      if (targetIndex > sourceIndex) {
        applySpreadsheetUpdate(rows.slice(sourceIndex + 1, targetIndex + 1).map((item) => item.id), column, sourceValue);
      }
      setSelectedCells([]);
      setFillCells([]);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };

    setSelectedCells([{ itemId: sourceId, column }]);
    setFillCells([{ itemId: sourceId, column }]);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const selectedVisibleCount = rows.filter((item) => selectedIds.includes(item.id)).length;
  const detailsItem = detailsItemId ? allRows.find((item) => item.id === detailsItemId) : null;
  const openBookingDetails = (itemId) => {
    if (suppressDetailsOpen.current) return;
    setDetailsItemId(itemId);
  };
  const toggleTableVisibility = () => {
    const nextVisible = !tableVisible;
    setTableVisible(nextVisible);
    if (!nextVisible) setShowAssetLabels(true);
  };
  const togglePublishedPlanning = async () => {
    if (publishing) return;
    if (activeShare && !window.confirm(`Unpublish this ${planningDefinition.label.toLowerCase()} planning from the client portal?`)) return;
    if (!activeShare) {
      const incompleteCount = allRows.filter((item) => (
        !Array.isArray(item.who) || !item.who.length
        || !String(item.asset ?? '').trim()
        || (activePlanningType !== 'production' && !item.what)
        || !item.todo
        || !String(item.time ?? '').trim()
      )).length;
      if (incompleteCount) {
        window.alert(`${incompleteCount} planning ${incompleteCount === 1 ? 'row is' : 'rows are'} incomplete. Open Table View to review the missing fields before publishing.`);
        return;
      }
    }
    setPublishing(true);
    try {
      if (activeShare) {
        await revokeShareLink(project.id, activePlanningType, planningVersion);
      } else {
        const token = await createShareLink(project.id, activePlanningType, planningVersion);
        const slug = String(project.name ?? 'project').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
        await navigator.clipboard?.writeText(`${window.location.origin}/share/${slug}-${token}`);
      }
    } finally {
      setPublishing(false);
    }
  };

  return (
    <main className="timeline-planner h-[calc(100vh-10.5rem)] overflow-hidden">
      <div className="flex h-full flex-col">
        <div className="timeline-project-header flex items-center justify-between border-b border-black/10 bg-white px-5 py-3 dark:border-white/10 dark:bg-ink-950">
          <div className="planning-header-actions flex w-full flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={toggleTableVisibility} className="secondary-button">
              {tableVisible ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
              {tableVisible ? 'Hide table' : 'Show table'}
            </button>
            <button type="button" onClick={() => setInfoVisible((next) => !next)} className="secondary-button"><FileText size={16} /> {infoVisible ? 'Hide info' : 'Show info'}</button>
            <div className="segmented planning-mode-selector">
              {['day', 'week', 'month'].map((item) => <button key={item} type="button" onClick={() => setZoom(item)} className={zoom === item ? 'selected' : ''}>{item}</button>)}
            </div>
            <Link to={`/projects/${project.id}/client?type=${activePlanningType}&version=${planningVersion}`} className="secondary-button planning-view-switch">
              <Eye size={16} /> Table View
            </Link>
            <button type="button" onClick={togglePublishedPlanning} className={`client-header-action ${activeShare ? 'is-published' : ''}`} disabled={publishing}>
              <Globe2 size={16} /> {publishing ? 'Publishing...' : activeShare ? 'Published' : 'Publish'}
            </button>
          </div>
        </div>

        {infoVisible && <div className="timeline-info-grid grid gap-2 border-b border-black/10 bg-white px-5 py-3 text-sm dark:border-white/10 dark:bg-ink-950 md:grid-cols-5">
          <div className="rounded-md border border-black/10 px-3 py-2 dark:border-white/10"><span className="block text-xs font-semibold uppercase text-ink-500">Start</span>{projectInfo.start}</div>
          <div className="rounded-md border border-black/10 px-3 py-2 dark:border-white/10"><span className="block text-xs font-semibold uppercase text-ink-500">Project running</span>{projectInfo.running}</div>
          <div className="rounded-md border border-black/10 px-3 py-2 dark:border-white/10"><span className="block text-xs font-semibold uppercase text-ink-500">Offline lock</span>{projectInfo.offlineLock}</div>
          <div className="rounded-md border border-black/10 px-3 py-2 dark:border-white/10"><span className="block text-xs font-semibold uppercase text-ink-500">Grading</span>{projectInfo.grading}</div>
          <div className="rounded-md border border-black/10 px-3 py-2 dark:border-white/10"><span className="block text-xs font-semibold uppercase text-ink-500">Final delivery</span>{projectInfo.final}</div>
        </div>}

        <div ref={scrollRef} className="timeline-scroll" onScroll={() => setVisibleMonth(monthAtScroll(timelineDays, scrollRef.current?.scrollLeft ?? 0, dayWidth))}>
          <div className="relative" style={{ minWidth: leftWidth + timelineWidth }}>
            <div className="sticky top-0 z-40 grid" style={{ gridTemplateColumns: timelineGridTemplate(tableVisible, leftWidth, timelineWidth) }}>
              {tableVisible && (
                <div
                  className="timeline-table-panel timeline-table-header-panel sticky left-0 z-50 grid items-end border-b border-r border-black/10 bg-zinc-50 text-xs font-semibold uppercase text-ink-500 dark:border-white/10 dark:bg-ink-900"
                  style={{
                    width: leftWidth,
                    minHeight: HEADER_HEIGHT,
                    gridTemplateColumns: tableTemplate(columns, columnVisibility, optionsVisible),
                    '--timeline-asset-edge': `${columns.duplicate + columns.actions + columns.handle + (columnVisibility.who ? columns.who : 0) + columns.asset}px`,
                  }}
                >
                  <div className="absolute left-2 right-2 top-2 flex flex-wrap items-center gap-1 normal-case">
                    <button type="button" onClick={() => addCategory(project.id, planningVersion, activePlanningType)} className="timeline-header-chip"><Plus size={13} /> Category</button>
                    <ToolbarMenu id="who" openMenu={openTableMenu} setOpenMenu={setOpenTableMenu} icon={Eye} label="Who">
                      {labelsByType.who.map((label) => (
                        <label key={label.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-white/5">
                          <span className="flex items-center gap-2">
                            <input type="checkbox" checked={!hiddenWhoIds.includes(label.id)} onChange={() => toggleWhoFilter(label.id)} />
                            <Pill label={label} />
                          </span>
                        </label>
                      ))}
                    </ToolbarMenu>
                    <button type="button" onClick={() => setShowMetaLabels((next) => !next)} className="timeline-header-chip" aria-pressed={showMetaLabels}>{showMetaLabels ? 'Hide time' : 'Show time'}</button>
                    <button type="button" onClick={() => setShowAssetLabels((next) => !next)} className="timeline-header-chip" aria-pressed={showAssetLabels}>
                      {activePlanningType === PLANNING_TYPES.production.key
                        ? (showAssetLabels ? 'Hide what' : 'Show what')
                        : (showAssetLabels ? 'Hide assets' : 'Show assets')}
                    </button>
                    <button type="button" onClick={() => setOptionsVisible((next) => !next)} className="timeline-header-chip" aria-pressed={optionsVisible}>{optionsVisible ? 'Hide options' : 'Show options'}</button>
                  </div>
                  <span />
                  <span />
                  <span />
                  {columnVisibility.who && <HeaderCell columnKey="who" onResizeStart={onColumnResizeStart}>Who</HeaderCell>}
                  {columnVisibility.asset && <HeaderCell columnKey="asset" onResizeStart={onColumnResizeStart}>{planningDefinition.assetLabel}</HeaderCell>}
                  {optionsVisible && (
                    <div className="timeline-option-cluster timeline-option-cluster-header">
                        <button
                          type="button"
                          onClick={() => toggleSelectAll(selectedVisibleCount !== rows.length)}
                          disabled={!rows.length}
                          className={`focus-button row-link-button ${rows.length > 0 && selectedVisibleCount === rows.length ? 'is-active' : ''}`}
                          aria-pressed={rows.length > 0 && selectedVisibleCount === rows.length}
                          aria-label={rows.length > 0 && selectedVisibleCount === rows.length ? 'Unlink all rows' : 'Link all rows'}
                          title="lock bookings togehtor"
                        >
                          {rows.length > 0 && selectedVisibleCount === rows.length ? <Link2 size={13} /> : <Link2Off size={13} />}
                        </button>
                    </div>
                  )}
                </div>
              )}
              <div className="bg-zinc-50 dark:bg-ink-900" style={timelineColumnStyle(tableVisible)}>
                <div className="flex h-10 border-b border-black/10 text-xs font-semibold text-ink-500 dark:border-white/10">
                  <div className="sticky z-20 grid place-items-center px-2" style={{ left: tableVisible ? leftWidth + 8 : 8 }}>
                    <div className="flex items-center gap-1">
                      <div ref={monthMenuRef} className="relative">
                        <button type="button" onClick={() => setMonthMenuOpen((next) => !next)} className="timeline-month-label">
                          {visibleMonth || months[0]?.label}
                        </button>
                        {monthMenuOpen && (
                          <div className="absolute left-0 z-[500] mt-2 w-44 rounded-lg border border-white/10 bg-ink-850 p-2 text-sm text-ink-100 shadow-glow">
                            {upcomingMonths.map((monthDate) => {
                              const available = timelineDays.some((day) => isSameMonth(day, monthDate));
                              return (
                                <button
                                  key={monthDate.toISOString()}
                                  type="button"
                                  onClick={() => jumpToMonth(monthDate)}
                                  disabled={!available}
                                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left font-semibold hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                  {format(monthDate, 'MMMM yyyy')}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <button type="button" onClick={() => focusToday()} className="timeline-header-chip"><CalendarClock size={13} /> Today</button>
                      <button type="button" onClick={() => shiftPlanning(7)} className="timeline-header-chip">Move +1</button>
                      <button type="button" onClick={() => shiftPlanning(-7)} className="timeline-header-chip">Move -1</button>
                    </div>
                  </div>
                  {months.map((month) => <div key={month.key} className="px-3 py-2" style={{ width: month.span * dayWidth }} />)}
                </div>
                <div className="flex h-4 border-b border-black/10 text-center font-mono text-[0.5rem] font-semibold text-ink-500 dark:border-white/10">
                  {weeks.map((week) => <div key={week.key} className="grid place-items-center border-r border-black/5 dark:border-white/5" style={{ width: week.span * dayWidth }}>{week.label}</div>)}
                </div>
                <div className="flex h-9 border-b border-black/10 text-center font-mono text-xs text-ink-500 dark:border-white/10">
                  {timelineDays.map((day) => (
                    <div key={day.toISOString()} data-timeline-date={iso(day)} className={`grid place-items-center border-r border-black/5 py-2 dark:border-white/5 ${isWeekend(day) ? 'bg-black/[0.04] dark:bg-white/[0.055]' : ''}`} style={{ width: dayWidth }}>
                      {format(day, 'd')}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 flex" style={{ left: leftWidth, top: HEADER_HEIGHT }}>
              {timelineDays.map((day) => <div key={day.toISOString()} className={`timeline-day ${isWeekend(day) ? 'weekend' : ''} ${isToday(day) ? 'today' : ''}`} style={{ width: dayWidth }} />)}
            </div>

            <DndContext
              sensors={sensors}
              onDragEnd={({ active, over }) => {
                if (!over || active.id === over.id) return;
                const activeId = String(active.id);
                const overId = String(over.id);
                if (activeId.startsWith('category:') && overId.startsWith('category:')) {
                  reorderCategories(project.id, activeId.replace('category:', ''), overId.replace('category:', ''), planningVersion, activePlanningType);
                  return;
                }
                reorderLineItems(project.id, active.id, over.id, planningVersion, activePlanningType);
              }}
            >
              <SortableContext items={projectCategories.map((category) => `category:${category.id}`)} strategy={verticalListSortingStrategy}>
                {projectCategories.map((category) => {
                  const categoryRows = rows.filter((item) => item.category_id === category.id);
                  return (
                    <CategoryBlock
                      key={category.id}
                      category={category}
                      rows={categoryRows}
                      projectId={project.id}
                      labelsById={labelsById}
                      labelsByType={labelsByType}
                      timelineWidth={timelineWidth}
                      dayWidth={dayWidth}
                      timelineStart={timelineStart}
                      leftWidth={leftWidth}
                      tableVisible={tableVisible}
                      columns={columns}
                      columnVisibility={columnVisibility}
                      optionsVisible={optionsVisible}
                      onResizeStart={onResizeStart}
                      onAddLineItem={addItemAtVisibleStart}
                      selectedIds={selectedIds}
                      onSelect={toggleSelect}
                      onSelectionDragStart={startSelectionDrag}
                      duplicatedIds={duplicatedIds}
                      onDuplicate={duplicateRow}
                      onFocusBlock={focusBlock}
                      onInteract={clearDuplicateState}
                      dragPreview={dragPreview}
                      dropTarget={dropTarget}
                      onOpenDetails={openBookingDetails}
                      selectedCells={selectedCells}
                      onCellSelect={selectCell}
                      onClearCellSelection={() => { setSelectedCells([]); setFillCells([]); }}
                      fillCells={fillCells}
                      onFillStart={startFillDrag}
                      onSpreadsheetUpdate={applySpreadsheetUpdate}
                      onAddDefaultPlanning={addDefaultPlanning}
                      onAddClientReviewRows={addClientReviewRows}
                      onRemoveClientReviewRows={removeClientReviewRows}
                      canAddReviews={Boolean(reviewLabels.wenneker && reviewLabels.client)}
                      showMetaLabels={showMetaLabels}
                      showAssetLabels={showAssetLabels}
                      planningDefinition={planningDefinition}
                      categoryCount={projectCategories.length}
                      onUpdateLineItem={updateLineItemWithUndo}
                      endMarkerIds={endMarkerIds}
                    />
                  );
                })}
              </SortableContext>
              {uncategorized.length > 0 && (
                <CategoryBlock
                  category={{ id: 'uncategorized', name: uncategorizedName, collapsed: false }}
                  rows={uncategorized}
                  projectId={project.id}
                  labelsById={labelsById}
                  labelsByType={labelsByType}
                  timelineWidth={timelineWidth}
                  dayWidth={dayWidth}
                  timelineStart={timelineStart}
                  leftWidth={leftWidth}
                  tableVisible={tableVisible}
                  columns={columns}
                  columnVisibility={columnVisibility}
                  optionsVisible={optionsVisible}
                  onResizeStart={onResizeStart}
                  onAddLineItem={addItemAtVisibleStart}
                  selectedIds={selectedIds}
                  onSelect={toggleSelect}
                  onSelectionDragStart={startSelectionDrag}
                  duplicatedIds={duplicatedIds}
                  onDuplicate={duplicateRow}
                  onFocusBlock={focusBlock}
                  onInteract={clearDuplicateState}
                  dragPreview={dragPreview}
                  dropTarget={dropTarget}
                  onOpenDetails={openBookingDetails}
                  selectedCells={selectedCells}
                  onCellSelect={selectCell}
                  onClearCellSelection={() => { setSelectedCells([]); setFillCells([]); }}
                  fillCells={fillCells}
                  onFillStart={startFillDrag}
                  onSpreadsheetUpdate={applySpreadsheetUpdate}
                  onRenameUncategorized={renameUncategorized}
                  onAddDefaultPlanning={addDefaultPlanning}
                  onAddClientReviewRows={addClientReviewRows}
                  onRemoveClientReviewRows={removeClientReviewRows}
                  canAddReviews={Boolean(reviewLabels.wenneker && reviewLabels.client)}
                  showMetaLabels={showMetaLabels}
                  showAssetLabels={showAssetLabels}
                  planningDefinition={planningDefinition}
                  categoryCount={projectCategories.length}
                  onUpdateLineItem={updateLineItemWithUndo}
                  endMarkerIds={endMarkerIds}
                />
              )}
            </DndContext>
          </div>
        </div>
      </div>
      {detailsItem && (
        <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/60 px-4" onMouseDown={() => setDetailsItemId(null)}>
          <div className="w-full max-w-lg scale-[0.7] rounded-lg border border-white/10 bg-ink-900 p-5 shadow-glow" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink-100">{detailsItem.asset || 'Booking details'}</h2>
                <p className="mt-1 text-sm text-ink-500">Add client-visible time and notes for this milestone.</p>
              </div>
              <button type="button" onClick={() => setDetailsItemId(null)} className="icon-button" aria-label="Close details">×</button>
            </div>
            <div className="text-sm font-semibold text-ink-300">
              <label htmlFor={`booking-time-${detailsItem.id}`}>Time</label>
              <div className="mt-2 flex items-stretch gap-2">
                <input
                  id={`booking-time-${detailsItem.id}`}
                  value={detailsItem.time ?? ''}
                  onChange={(event) => updateLineItemWithUndo(detailsItem.id, { time: normalizeTimeInput(event.target.value) })}
                  onBlur={() => flushLineItemUpdate(detailsItem.id)}
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-accent-400"
                  inputMode="numeric"
                  pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                  maxLength={5}
                  placeholder="HH:MM"
                />
                <button type="button" onClick={() => updateLineItemWithUndo(detailsItem.id, { time: 'EOD' })} className="secondary-button !px-3 !py-2" aria-label="Set time to EOD">EOD</button>
                <button type="button" onClick={() => updateLineItemWithUndo(detailsItem.id, { time: '' })} disabled={!detailsItem.time} className="icon-button h-auto shrink-0 border border-white/10" aria-label="Clear time" title="Clear time">×</button>
              </div>
            </div>
            <label className="mt-4 block text-sm font-semibold text-ink-300">
              Notes
              <textarea
                value={detailsItem.notes ?? ''}
                onChange={(event) => updateLineItemWithUndo(detailsItem.id, { notes: event.target.value })}
                onBlur={() => flushLineItemUpdate(detailsItem.id)}
                className="mt-2 min-h-28 w-full resize-y rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-accent-400"
                placeholder="Add notes for the client planning..."
              />
            </label>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setDetailsItemId(null)} className="primary-button">Done</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
