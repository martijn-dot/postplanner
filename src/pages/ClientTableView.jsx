import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { eachDayOfInterval, endOfWeek, format, getISODay, isMonday, isWeekend, max, min, parseISO, startOfWeek } from 'date-fns';
import { Check, ChevronDown, ChevronRight, Copy, Download, Eye, EyeOff, FileText, Globe2, GripVertical } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Pill from '../components/Pill.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';
import { downloadPlanningExcel } from '../lib/exportExcel.js';
import { readLocalObject, UNCATEGORIZED_NAME_STORAGE_KEY } from '../lib/localPreferences.js';
import { weekNumber } from '../lib/dates.js';

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

export function buildCategorySections(project, items, categories, labelsById, showEmptyDates, uncategorizedName = 'Uncategorized') {
  const milestones = projectMilestones(project, items);
  const days = dateRangeFromMilestones(milestones);
  if (!days.length) return [];

  const projectCategories = categories
    .filter((category) => category.project_id === project.id)
    .sort((a, b) => a.sort_order - b.sort_order);

  const hasUncategorized = milestones.some((item) => !item.category_id);
  const sections = [
    ...projectCategories,
    ...(hasUncategorized ? [{ id: null, name: uncategorizedName, sort_order: 9999 }] : []),
  ];

  return sections
    .map((category) => {
      const categoryMilestones = milestones.filter((item) => item.category_id === category.id);
      const milestonesByDate = categoryMilestones.reduce((groups, item) => {
        const group = groups.get(item.end_date) ?? [];
        group.push(item);
        groups.set(item.end_date, group);
        return groups;
      }, new Map());

      const rows = days.flatMap((day) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const dayMilestones = milestonesByDate.get(dateKey) ?? [];
        const base = {
          Week: weekNumber(day),
          Day: format(day, 'EEEE'),
          Date: format(day, 'd MMM'),
          Category: category.name,
          _dateKey: dateKey,
          _isoWeekday: getISODay(day),
          _isMonday: isMonday(day),
          _isWeekend: isWeekend(day),
        };

        if (!dayMilestones.length) {
          if (!showEmptyDates) return [];
          return [{
            ...base,
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
          Time: item.time ?? '',
          Who: item.who.map((id) => labelsById[id]?.value).filter(Boolean).join(', '),
          Asset: item.asset,
          What: labelsById[item.what]?.value ?? '',
          Todo: labelsById[item.todo]?.value ?? '',
          Notes: item.notes ?? '',
          _item: item,
        }));
      });

      return { category, rows };
    })
    .filter((section) => section.rows.length);
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
  return buildCategorySections(project, lineItems, categories, labelsById, showEmptyDates, uncategorizedName)
    .flatMap((section) => annotateRows(section.rows).map((row) => ({
      Category: section.category.name,
      Week: row.Week,
      Day: row.Day,
      Date: row.Date,
      Time: row.Time,
      Who: row.Who,
      Asset: row.Asset,
      What: row.What,
      Todo: row.Todo,
      Notes: row.Notes,
    })));
}

function ClientCategorySection({
  section,
  collapsed,
  onToggleCategory,
  onUpdateCategory,
  onRenameUncategorized,
  onUpdateLineItem,
  labelsById,
  setEditingField,
}) {
  const sortableId = `category:${section.category.id}`;
  const sortableEnabled = Boolean(section.category.id);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: sortableId, disabled: !sortableEnabled });
  const [draftName, setDraftName] = useState(section.category.name);

  useEffect(() => {
    setDraftName(section.category.name);
  }, [section.category.name]);

  const commitName = () => {
    const nextName = draftName.trim() || section.category.name;
    setDraftName(nextName);
    if (nextName === section.category.name) return;
    if (section.category.id) {
      onUpdateCategory?.(section.category.id, { name: nextName });
    } else {
      onRenameUncategorized?.(nextName);
    }
  };

  return (
    <tbody
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <tr className="client-category-row border-t border-black/10 bg-zinc-200/80 dark:border-white/10 dark:bg-white/10">
        <td colSpan="9" className="px-4 py-3 text-sm font-semibold">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onToggleCategory(section.category.id)} className="grid h-6 w-6 shrink-0 place-items-center">
              {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </button>
            <button type="button" className="category-drag-handle" disabled={!sortableEnabled} aria-label="Drag category" {...attributes} {...listeners}>
              <GripVertical size={15} />
            </button>
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  setDraftName(section.category.name);
                  event.currentTarget.blur();
                }
              }}
              className="category-toggle-name min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
            />
          </div>
        </td>
      </tr>
      {!collapsed && section.rows.map((row, index) => {
        return (
          <tr
            key={`${section.category.id ?? 'uncategorized'}-${row._item?.id ?? row._dateKey}-${index}`}
            className={`${row._isWeekend ? 'bg-zinc-200/70 dark:bg-white/[0.07]' : ''} ${row._item ? 'booking-row' : ''} ${row._showWeekDivider ? 'week-divider' : 'border-t border-black/5 dark:border-white/5'}`}
          >
            {row._showWeek && (
              <td rowSpan={row._weekRowSpan} className="week-cell sticky-week px-4 py-3 align-middle font-mono">
                <span>W{row.Week}</span>
              </td>
            )}
            {row._showDateGroup && (
              <>
                <td rowSpan={row._dateRowSpan} className={`date-group-cell p-0 font-semibold ${row._isWeekend ? 'date-weekend-cell' : ''}`}>
                  <span className={row._item ? 'date-group-chip date-booking-chip' : 'date-group-chip'}>{row.Day}</span>
                </td>
                <td rowSpan={row._dateRowSpan} className={`date-group-cell whitespace-nowrap p-0 font-mono font-semibold ${row._isWeekend ? 'date-weekend-cell' : ''}`}>
                  <span className={row._item ? 'date-group-chip date-booking-chip' : 'date-group-chip'}>{row.Date}</span>
                </td>
              </>
            )}
            <td className="px-3 py-3 font-mono">
              {row._item && onUpdateLineItem ? (
                <button type="button" onClick={() => setEditingField({ itemId: row._item.id, field: 'time' })} className="min-w-12 whitespace-nowrap rounded-md border border-white/10 bg-white/5 px-2 py-1 text-center text-sm text-ink-300 hover:border-accent-400 hover:text-ink-100">
                  {row._item.time || <span className="text-ink-500">--:--</span>}
                </button>
              ) : (
                row.Time || <span className="text-ink-500">-</span>
              )}
            </td>
            <td className="px-4 py-3">
              {row._item ? (
                <div className="flex flex-wrap gap-1">{row._item.who.map((id) => <Pill key={id} label={labelsById[id]} />)}</div>
              ) : (
                <span className="text-ink-500">-</span>
              )}
            </td>
            <td className="px-4 py-3">{row.Asset || <span className="text-ink-500">-</span>}</td>
            <td className="px-4 py-3">{row._item ? <Pill label={labelsById[row._item.what]} /> : <span className="text-ink-500">-</span>}</td>
            <td className="px-4 py-3">{row._item ? <Pill label={labelsById[row._item.todo]} subtle /> : <span className="text-ink-500">-</span>}</td>
            <td className="max-w-[160px] overflow-visible px-4 py-3">
              {row._item && onUpdateLineItem ? (
                <button type="button" onClick={() => setEditingField({ itemId: row._item.id, field: 'notes' })} className="note-preview group relative inline-flex w-full min-w-0 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-left text-sm text-ink-300 hover:border-accent-400 hover:text-ink-100">
                  <FileText size={14} className="shrink-0 text-ink-500" />
                  <span className="truncate">{row._item.notes || 'Add note'}</span>
                  {row._item.notes && <span className="note-tooltip">{row._item.notes}</span>}
                </button>
              ) : (
                row.Notes || <span className="text-ink-500">-</span>
              )}
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}

export function ClientPlanningTable({ project, lineItems, labels, categories, showEmptyDates, onUpdateLineItem, onUpdateCategory, onReorderCategory, uncategorizedName = 'Uncategorized', onRenameUncategorized }) {
  const [collapsedCategories, setCollapsedCategories] = useState([]);
  const [editingField, setEditingField] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const editingItem = editingField?.itemId ? lineItems.find((item) => item.id === editingField.itemId) : null;
  const labelsById = useMemo(() => Object.fromEntries(labels.map((label) => [label.id, label])), [labels]);
  const sections = useMemo(
    () => buildCategorySections(project, lineItems, categories, labelsById, showEmptyDates, uncategorizedName)
      .map((section) => ({ ...section, rows: annotateRows(section.rows) })),
    [project, lineItems, categories, labelsById, showEmptyDates, uncategorizedName],
  );

  const toggleCategory = (categoryId) => {
    const key = categoryId ?? 'uncategorized';
    setCollapsedCategories((current) => (current.includes(key) ? current.filter((id) => id !== key) : [...current, key]));
  };

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-ink-900">
        <div className="client-table-scroll max-h-[calc(100vh-17rem)] overflow-auto">
          <table className="client-planning-table w-full min-w-[1220px] border-collapse text-sm">
            <colgroup>
              <col className="w-[72px]" />
              <col className="w-[96px]" />
              <col className="w-[94px]" />
              <col className="w-[74px]" />
              <col className="w-[118px]" />
              <col className="w-[400px]" />
              <col className="w-[180px]" />
              <col className="w-[190px]" />
              <col className="w-[160px]" />
            </colgroup>
            <thead className="bg-zinc-100 text-left text-xs uppercase text-ink-500 dark:bg-ink-850">
              <tr>
                <th className="sticky-week px-4 py-3 font-semibold">Week</th>
                <th className="px-4 py-3 font-semibold">Day</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-3 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">Who</th>
                <th className="px-4 py-3 font-semibold">Asset</th>
                <th className="px-4 py-3 font-semibold">What</th>
                <th className="px-4 py-3 font-semibold">Todo</th>
                <th className="px-4 py-3 font-semibold">Notes</th>
              </tr>
            </thead>
            <DndContext
              sensors={sensors}
              onDragEnd={({ active, over }) => {
                if (!over || active.id === over.id) return;
                onReorderCategory?.(project.id, String(active.id).replace('category:', ''), String(over.id).replace('category:', ''));
              }}
            >
              <SortableContext items={sections.filter((section) => section.category.id).map((section) => `category:${section.category.id}`)} strategy={verticalListSortingStrategy}>
                {sections.map((section) => (
                  <ClientCategorySection
                    key={section.category.id ?? 'uncategorized'}
                    section={section}
                    collapsed={collapsedCategories.includes(section.category.id ?? 'uncategorized')}
                    onToggleCategory={toggleCategory}
                    onUpdateCategory={onUpdateCategory}
                    onRenameUncategorized={onRenameUncategorized}
                    onUpdateLineItem={onUpdateLineItem}
                    labelsById={labelsById}
                    setEditingField={setEditingField}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {!sections.length && (
              <tbody>
                <tr>
                  <td colSpan="9" className="px-4 py-10 text-center text-ink-500">No milestones yet.</td>
                </tr>
              </tbody>
            )}
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

export default function ClientTableView({ project }) {
  const { lineItems, labels, categories, createShareLink, updateLineItem, updateCategory, reorderCategories } = usePlanner();
  const [showEmptyDates, setShowEmptyDates] = useState(true);
  const [showWennekerBookings, setShowWennekerBookings] = useState(true);
  const [showClientBookings, setShowClientBookings] = useState(true);
  const [uncategorizedNames, setUncategorizedNames] = useState(() => readLocalObject(UNCATEGORIZED_NAME_STORAGE_KEY, {}));
  const [publishedUrl, setPublishedUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const uncategorizedName = uncategorizedNames[project.id] || 'Uncategorized';
  const whoFilterIds = useMemo(() => ({
    wenneker: labels.find((label) => label.column_type === 'who' && label.value.toLowerCase() === 'wenneker')?.id,
    client: labels.find((label) => label.column_type === 'who' && label.value.toLowerCase() === 'client')?.id,
  }), [labels]);
  const filteredLineItems = useMemo(() => lineItems.filter((item) => {
    if (showEmptyDates) return true;
    if (!showWennekerBookings && whoFilterIds.wenneker && item.who?.includes(whoFilterIds.wenneker)) return false;
    if (!showClientBookings && whoFilterIds.client && item.who?.includes(whoFilterIds.client)) return false;
    return true;
  }), [lineItems, showClientBookings, showEmptyDates, showWennekerBookings, whoFilterIds]);
  const exportRows = useMemo(
    () => clientPlanningExportRows(project, filteredLineItems, labels, categories, showEmptyDates, uncategorizedName),
    [project, filteredLineItems, labels, categories, showEmptyDates, uncategorizedName],
  );

  useEffect(() => {
    localStorage.setItem(UNCATEGORIZED_NAME_STORAGE_KEY, JSON.stringify(uncategorizedNames));
  }, [uncategorizedNames]);

  const renameUncategorized = (name) => {
    setUncategorizedNames((current) => ({ ...current, [project.id]: name }));
  };

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

  return (
    <main className="mx-auto max-w-7xl px-5 py-6">
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold">Client Planning</h1>
          <p className="mt-1 text-sm text-ink-500">Milestones are grouped by timeline category and generated from the final day of each item.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={publish} className="secondary-button" disabled={publishing}>
            <Globe2 size={17} /> {publishing ? 'Publishing...' : 'Publish'}
          </button>
          <button type="button" onClick={() => setShowEmptyDates((next) => !next)} className="secondary-button">
            {showEmptyDates ? <EyeOff size={17} /> : <Eye size={17} />}
            {showEmptyDates ? 'Hide empty dates' : 'Show empty dates'}
          </button>
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
          <button type="button" onClick={setAllTimesEod} className="secondary-button">
            Set all EOD
          </button>
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

      <ClientPlanningTable
        project={project}
        lineItems={filteredLineItems}
        labels={labels}
        categories={categories}
        showEmptyDates={showEmptyDates}
        onUpdateLineItem={updateLineItem}
        onUpdateCategory={updateCategory}
        onReorderCategory={reorderCategories}
        uncategorizedName={uncategorizedName}
        onRenameUncategorized={renameUncategorized}
      />
    </main>
  );
}
