import { Check, ChevronDown, ChevronRight, Copy, Download, FileSpreadsheet, Plus, Settings, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlanner } from '../context/PlannerContext.jsx';
import { downloadAssetListExcel } from '../lib/exportExcel.js';

const DEFAULT_ASSET_TYPES = ['OLV', 'SOC', 'PRV', 'HWT', 'TECH', 'CGI', 'Bumper', 'TrueView', 'Story', '360', 'IMG', 'FeatIMG', 'Photography', 'KV', 'StaticBanner', 'DynaBanner'];
const DEFAULT_RATIOS = ['16x9', '9x16', '4x5', '1x1', '3x4', '4x3', 'TBC'];
const DEFAULT_UNIQUE_RATIO = ['Unique', 'Ratio'];
const DEFAULT_PLATFORMS = ['IG', 'FB', 'IG+TB', 'YT', 'TK', 'PIN', 'SPF'];
const LABEL_TYPE_NAMES = {
  asset_type: 'Asset Type',
  asset_ratio: 'Ratio',
  asset_unique_ratio: 'Unique/Ratio',
  asset_platform: 'Platform',
};

const STANDARD_COLUMNS = [
  { name: 'Asset Type', type: 'dropdown', label_type: 'asset_type', options: DEFAULT_ASSET_TYPES, width: 180 },
  { name: 'Ratio', type: 'dropdown', label_type: 'asset_ratio', options: DEFAULT_RATIOS, width: 140 },
  { name: 'Unique/Ratio', type: 'dropdown', label_type: 'asset_unique_ratio', options: DEFAULT_UNIQUE_RATIO, width: 150 },
  { name: 'Platform', type: 'dropdown', label_type: 'asset_platform', options: DEFAULT_PLATFORMS, width: 140 },
  { name: 'Length', type: 'length', options: [], width: 120 },
  { name: 'Name', type: 'text', options: [], width: 240 },
];

const SETUP_TEMPLATES = {
  'Standard asset list': STANDARD_COLUMNS,
};

const SEPARATORS = ['-', '_', ' '];

function uid() {
  return crypto.randomUUID();
}

function orderedColumns(list) {
  return [...(list?.columns ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function orderedRows(list) {
  return [...(list?.rows ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function orderedCategories(list) {
  return [...(list?.categories ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function applyFilenameOptions(value, options = {}) {
  let output = value;
  if (options.capitalizeWords) output = output.replace(/\b\w/g, (letter) => letter.toUpperCase());
  if (options.lowercase) output = output.toLowerCase();
  if (options.hyphenateSpaces) output = output.replace(/\s+/g, '-');
  return output;
}

function generatedFilename(project, list, row) {
  const columns = orderedColumns(list);
  const baseParts = [project.project_number, project.client, project.name, row.number]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  const rowParts = columns
    .map((column) => ({ value: formatCellValue(row.values?.[column.id], column), separator: column.separator || list.global_separator || '_' }))
    .filter((part) => part.value);
  const parts = [
    ...baseParts.map((value) => ({ value, separator: list.global_separator || '_' })),
    ...rowParts,
  ];
  const joined = parts.reduce((output, part, index) => {
    if (index === 0) return part.value;
    return `${output}${parts[index - 1]?.separator || list.global_separator || '_'}${part.value}`;
  }, '');
  return applyFilenameOptions(joined, list.filename_options);
}

function formatCellValue(value, column) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (column.type === 'length') return `${text.replace(/s$/i, '')}s`;
  return text;
}

function updateRowsForColumn(rows, columnId, fallback = '') {
  return rows.map((row) => ({
    ...row,
    values: { ...(row.values ?? {}), [columnId]: row.values?.[columnId] ?? fallback },
  }));
}

function labelColor(value = '') {
  const colors = ['#6d5dfc', '#28b8ff', '#10b981', '#f59e0b', '#f466ae', '#ef4444'];
  const index = [...value].reduce((total, char) => total + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

function LabelDropdown({ value, options, onChange, onMoveDown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="asset-label-select">
      <button
        type="button"
        className="asset-label-button"
        onClick={() => setOpen((next) => !next)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (open) onMoveDown?.();
            else setOpen(true);
          }
        }}
      >
        {value ? <span className="asset-label-chip" style={{ backgroundColor: labelColor(value) }}>{value}</span> : <span className="text-ink-500">-</span>}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="asset-label-menu">
          <button type="button" className="asset-label-option" onClick={() => { onChange(''); setOpen(false); }}>-</button>
          {options.map((option) => (
            <button key={option} type="button" className="asset-label-option" onClick={() => { onChange(option); setOpen(false); }}>
              <span className="asset-label-chip" style={{ backgroundColor: labelColor(option) }}>{option}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ column, globalOptions, onClose, onSave, onDelete }) {
  const [name, setName] = useState(column.name);
  const [type, setType] = useState(column.type ?? 'text');
  const [labelType, setLabelType] = useState(column.label_type ?? '');
  const [separator, setSeparator] = useState(column.separator ?? '');
  const [optionsText, setOptionsText] = useState((column.options ?? []).join('\n'));

  const options = optionsText
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-5">
      <div className="w-full max-w-lg rounded-lg border border-white/10 bg-ink-900 p-5 text-ink-100 shadow-glow">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Column settings</h2>
            <p className="mt-1 text-sm text-ink-500">{column.name}</p>
          </div>
          <button type="button" onClick={onClose} className="secondary-button !px-3 !py-2">Close</button>
        </div>
        <div className="mt-5 grid gap-4">
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase text-ink-500">Column name</span>
            <input className="field" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase text-ink-500">Column type</span>
            <select className="field" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="text">Full text</option>
              <option value="dropdown">Global dropdown</option>
              <option value="custom-dropdown">Custom dropdown</option>
              <option value="length">Length</option>
            </select>
          </label>
          {type === 'dropdown' && (
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase text-ink-500">Global label group</span>
              <select
                className="field"
                value={labelType}
                onChange={(event) => {
                  setLabelType(event.target.value);
                  if (LABEL_TYPE_NAMES[event.target.value]) setName(LABEL_TYPE_NAMES[event.target.value]);
                  setOptionsText((globalOptions[event.target.value] ?? []).join('\n'));
                }}
              >
                <option value="">Choose label group</option>
                <option value="asset_type">Asset Type</option>
                <option value="asset_ratio">Ratio</option>
                <option value="asset_unique_ratio">Unique/Ratio</option>
                <option value="asset_platform">Platform</option>
              </select>
            </label>
          )}
          {type === 'custom-dropdown' && (
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase text-ink-500">Dropdown labels</span>
              <textarea
                className="field min-h-40"
                value={optionsText}
                onChange={(event) => setOptionsText(event.target.value)}
                placeholder="Add one label per line"
              />
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase text-ink-500">Separator after this column</span>
            <select className="field" value={separator} onChange={(event) => setSeparator(event.target.value)}>
              <option value="">Use global separator</option>
              {SEPARATORS.map((item) => <option key={item} value={item}>{item === ' ' ? 'blank space' : item}</option>)}
            </select>
          </label>
          {type === 'length' && <p className="text-sm text-ink-500">Only numbers are entered in the sheet. The filename shows the value with an s, like 15s.</p>}
        </div>
        <div className="mt-5 flex justify-between gap-2">
          <button type="button" onClick={onDelete} className="secondary-button text-red-300"><Trash2 size={16} /> Delete</button>
          <button
            type="button"
            onClick={() => onSave({ ...column, name: name.trim() || column.name, type, label_type: type === 'dropdown' ? labelType : null, separator: separator || null, options: type === 'custom-dropdown' ? options : globalOptions[labelType] ?? options })}
            className="primary-button"
          >
            <Check size={16} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AssetListPage({ project }) {
  const {
    assetLists = [],
    labels = [],
    ensureAssetList,
    createAssetListTab,
    updateAssetList,
    deleteAssetListTab,
    markProjectEdited,
  } = usePlanner();
  const projectLists = useMemo(
    () => assetLists.filter((item) => item.project_id === project.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [assetLists, project.id],
  );
  const [activeId, setActiveId] = useState('');
  const [settingsColumnId, setSettingsColumnId] = useState('');
  const [selectedCell, setSelectedCell] = useState(null);
  const [dragColumnId, setDragColumnId] = useState('');
  const [dropColumnId, setDropColumnId] = useState('');
  const [setupTemplate, setSetupTemplate] = useState('');
  const fillSourceRef = useRef(null);
  const globalOptions = useMemo(() => ({
    asset_type: labels.filter((label) => !label.project_id && label.column_type === 'asset_type' && !label.is_divider).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((label) => label.value),
    asset_ratio: labels.filter((label) => !label.project_id && label.column_type === 'asset_ratio' && !label.is_divider).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((label) => label.value),
    asset_unique_ratio: labels.filter((label) => !label.project_id && label.column_type === 'asset_unique_ratio' && !label.is_divider).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((label) => label.value),
    asset_platform: labels.filter((label) => !label.project_id && label.column_type === 'asset_platform' && !label.is_divider).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((label) => label.value),
  }), [labels]);

  useEffect(() => {
    if (!projectLists.length) {
      const createdId = ensureAssetList(project.id);
      setActiveId(createdId);
      return;
    }
    if (!activeId || !projectLists.some((item) => item.id === activeId)) setActiveId(projectLists[0].id);
  }, [activeId, ensureAssetList, project.id, projectLists]);

  const activeList = projectLists.find((item) => item.id === activeId) ?? projectLists[0];
  const columns = orderedColumns(activeList);
  const rows = orderedRows(activeList);
  const categories = orderedCategories(activeList);
  const fallbackCategory = categories[0] ?? { id: 'default', name: 'Category 1', collapsed: false, sort_order: 0 };
  const settingsColumn = columns.find((column) => column.id === settingsColumnId);

  const saveList = (patch) => {
    if (!activeList) return;
    updateAssetList(activeList.id, patch);
  };

  const saveColumns = (nextColumns, nextRows = activeList.rows) => {
    saveList({
      columns: nextColumns.map((column, index) => ({ ...column, sort_order: index })),
      rows: nextRows,
    });
  };

  const saveCategories = (nextCategories, nextRows = rows) => {
    saveList({
      categories: nextCategories.map((category, index) => ({ ...category, sort_order: index })),
      rows: nextRows,
    });
  };

  const addColumn = () => {
    const column = {
      id: uid(),
      name: `Column ${columns.length + 1}`,
      type: 'text',
      options: [],
      separator: null,
      width: 170,
      sort_order: columns.length,
    };
    saveColumns([...columns, column], updateRowsForColumn(activeList.rows, column.id));
    setSettingsColumnId(column.id);
  };

  const standardColumns = () => STANDARD_COLUMNS.map((column, index) => ({
    id: uid(),
    separator: null,
    sort_order: index,
    ...column,
    options: column.label_type ? globalOptions[column.label_type] ?? column.options : column.options,
  }));

  const applyStandardColumns = () => {
    const nextColumns = standardColumns();
    const groupId = fallbackCategory.id === 'default' ? uid() : fallbackCategory.id;
    const nextCategories = categories.length ? categories : [{ ...fallbackCategory, id: groupId }];
    const nextRows = rows.length
      ? rows.map((row) => ({ ...row, group_id: row.group_id ?? groupId, values: Object.fromEntries(nextColumns.map((column) => [column.id, ''])) }))
      : Array.from({ length: 8 }, (_, index) => ({
        id: uid(),
        number: String(index + 1).padStart(2, '0'),
        group_id: groupId,
        values: Object.fromEntries(nextColumns.map((column) => [column.id, ''])),
        sort_order: index,
      }));
    saveList({ columns: nextColumns, categories: nextCategories, rows: nextRows, global_separator: activeList.global_separator || '_' });
  };

  useEffect(() => {
    if (!activeList || !columns.length) return;
    const names = columns.map((column) => column.name.toLowerCase());
    const hasStandardColumns = ['asset type', 'ratio', 'unique/ratio', 'platform', 'length', 'name'].every((name) => names.includes(name));
    if (!hasStandardColumns) applyStandardColumns();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeList?.id]);

  useEffect(() => {
    if (!activeList || categories.length) return;
    const category = { id: uid(), name: 'Category 1', collapsed: false, sort_order: 0 };
    saveList({
      categories: [category],
      rows: rows.map((row) => ({ ...row, group_id: row.group_id ?? category.id })),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeList?.id, categories.length]);

  const addRow = () => {
    const nextRow = {
      id: uid(),
      number: String(rows.length + 1).padStart(2, '0'),
      group_id: fallbackCategory.id,
      values: Object.fromEntries(columns.map((column) => [column.id, ''])),
      sort_order: rows.length,
    };
    saveList({ rows: [...rows, nextRow] });
  };

  const applySetupTemplate = () => {
    const templateColumns = SETUP_TEMPLATES[setupTemplate];
    if (!templateColumns) return;
    const nextColumns = templateColumns.map((column, index) => ({
      id: uid(),
      separator: null,
      sort_order: index,
      ...column,
      options: column.label_type ? globalOptions[column.label_type] ?? column.options : column.options,
    }));
    const groupId = fallbackCategory.id === 'default' ? uid() : fallbackCategory.id;
    const nextCategories = categories.length ? categories : [{ ...fallbackCategory, id: groupId }];
    const nextRows = rows.length
      ? rows.map((row) => ({ ...row, group_id: row.group_id ?? groupId, values: Object.fromEntries(nextColumns.map((column) => [column.id, ''])) }))
      : Array.from({ length: 8 }, (_, index) => ({
        id: uid(),
        number: String(index + 1).padStart(2, '0'),
        group_id: groupId,
        values: Object.fromEntries(nextColumns.map((column) => [column.id, ''])),
        sort_order: index,
      }));
    saveList({ columns: nextColumns, categories: nextCategories, rows: nextRows });
  };

  const updateCell = (rowId, columnId, value) => {
    saveList({
      rows: rows.map((row) => row.id === rowId ? { ...row, values: { ...(row.values ?? {}), [columnId]: value } } : row),
    });
  };

  const updateNumber = (rowId, value) => {
    saveList({ rows: rows.map((row) => row.id === rowId ? { ...row, number: value } : row) });
  };

  const addCategory = () => {
    const category = { id: uid(), name: `Category ${categories.length + 1}`, collapsed: false, sort_order: categories.length };
    saveCategories([...categories, category]);
  };

  const updateCategory = (categoryId, patch) => {
    saveCategories(categories.map((category) => category.id === categoryId ? { ...category, ...patch } : category));
  };

  const updateColumnName = (columnId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveColumns(columns.map((column) => column.id === columnId ? { ...column, name: trimmed } : column));
  };

  const pasteCells = (event, rowIndex, columnIndex) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    const matrix = text.split(/\r?\n/).filter((line) => line.length).map((line) => line.split('\t'));
    const nextRows = rows.map((row) => ({ ...row, values: { ...(row.values ?? {}) } }));
    matrix.forEach((line, y) => {
      const row = nextRows[rowIndex + y];
      if (!row) return;
      line.forEach((value, x) => {
        const targetColumnIndex = columnIndex + x;
        if (targetColumnIndex === -1) row.number = value;
        const column = columns[targetColumnIndex];
        if (column) row.values[column.id] = value;
      });
    });
    saveList({ rows: nextRows });
  };

  const fillTo = (targetRowId, columnId) => {
    const source = fillSourceRef.current;
    if (!source || source.columnId !== columnId) return;
    const sourceIndex = rows.findIndex((row) => row.id === source.rowId);
    const targetIndex = rows.findIndex((row) => row.id === targetRowId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [start, end] = [sourceIndex, targetIndex].sort((a, b) => a - b);
    const value = rows[sourceIndex].values?.[columnId] ?? '';
    saveList({
      rows: rows.map((row, index) => index >= start && index <= end ? { ...row, values: { ...(row.values ?? {}), [columnId]: value } } : row),
    });
  };

  const resizeColumn = (event, column) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = column.width ?? 170;
    const onMove = (moveEvent) => {
      const width = Math.max(110, startWidth + moveEvent.clientX - startX);
      saveColumns(columns.map((item) => item.id === column.id ? { ...item, width } : item));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const reorderColumn = (targetId) => {
    if (!dragColumnId || dragColumnId === targetId) return;
    const nextColumns = [...columns];
    const oldIndex = nextColumns.findIndex((column) => column.id === dragColumnId);
    const newIndex = nextColumns.findIndex((column) => column.id === targetId);
    const [moved] = nextColumns.splice(oldIndex, 1);
    nextColumns.splice(newIndex, 0, moved);
    saveColumns(nextColumns);
  };

  const deleteColumn = (columnId) => {
    const nextColumns = columns.filter((column) => column.id !== columnId);
    const nextRows = rows.map((row) => {
      const values = { ...(row.values ?? {}) };
      delete values[columnId];
      return { ...row, values };
    });
    saveColumns(nextColumns, nextRows);
  };

  const focusCellBelow = (rowIndex, columnIndex) => {
    const target = document.querySelector(`[data-asset-row="${rowIndex + 1}"][data-asset-column="${columnIndex}"] input, [data-asset-row="${rowIndex + 1}"][data-asset-column="${columnIndex}"] button`);
    target?.focus();
  };

  if (!activeList) {
    return <div className="grid min-h-[60vh] place-items-center text-ink-500">Preparing asset list...</div>;
  }

  const gridTemplate = `86px ${columns.map((column) => `${column.width ?? 170}px`).join(' ')} minmax(320px, 1fr)`;

  return (
    <main className="flex h-[calc(100vh-6rem)] flex-col bg-zinc-50 text-ink-950 dark:bg-ink-950 dark:text-ink-100">
      <div className="border-b border-black/10 bg-white px-5 py-4 dark:border-white/10 dark:bg-ink-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Asset list</h1>
            <p className="mt-1 text-sm text-ink-500">{[project.project_number, project.client, project.name].filter(Boolean).join(' - ')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-ink-500">
              Global separator
              <select className="field !w-24 !py-2" value={activeList.global_separator ?? '_'} onChange={(event) => saveList({ global_separator: event.target.value })}>
                {SEPARATORS.map((item) => <option key={item} value={item}>{item === ' ' ? 'blank' : item}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => downloadAssetListExcel(project, activeList, 'active')} className="secondary-button"><Download size={16} /> Active tab</button>
            <button type="button" onClick={() => downloadAssetListExcel(project, projectLists, 'all')} className="secondary-button"><FileSpreadsheet size={16} /> All tabs</button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {projectLists.map((list) => (
              <button key={list.id} type="button" onClick={() => setActiveId(list.id)} className={`tab ${list.id === activeList.id ? 'tab-active' : ''}`}>{list.name}</button>
            ))}
            <button type="button" onClick={() => setActiveId(createAssetListTab(project.id))} className="icon-button" aria-label="Add setup"><Plus size={17} /></button>
            <button type="button" onClick={() => setActiveId(createAssetListTab(project.id, activeList.id))} className="icon-button" aria-label="Duplicate setup"><Copy size={16} /></button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input className="field !w-52 !py-2" value={activeList.name} onChange={(event) => saveList({ name: event.target.value })} />
            {projectLists.length > 1 && (
              <button type="button" onClick={() => deleteAssetListTab(activeList.id)} className="icon-button" aria-label="Delete setup"><Trash2 size={16} /></button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-black/10 bg-white px-5 py-3 dark:border-white/10 dark:bg-ink-900">
        <button type="button" onClick={addColumn} className="primary-button"><Plus size={16} /> Column</button>
        <button type="button" onClick={addRow} className="secondary-button"><Plus size={16} /> Row</button>
        <button type="button" onClick={addCategory} className="secondary-button"><Plus size={16} /> Category</button>
        <select className="field !w-52 !py-2" value={setupTemplate} onChange={(event) => setSetupTemplate(event.target.value)}>
          <option value="">Setup template</option>
          {Object.keys(SETUP_TEMPLATES).map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <button type="button" onClick={applySetupTemplate} disabled={!setupTemplate} className="secondary-button">Apply</button>
        <button type="button" onClick={applyStandardColumns} className="secondary-button">Standard columns</button>
        {[
          ['lowercase', 'small caps'],
          ['capitalizeWords', 'first words capital'],
          ['hyphenateSpaces', 'spaces to -'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => saveList({ filename_options: { ...(activeList.filename_options ?? {}), [key]: !activeList.filename_options?.[key] } })}
            className={`secondary-button ${activeList.filename_options?.[key] ? 'is-active' : ''}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs font-semibold uppercase text-ink-500">Autosaved</span>
      </div>

      <div className="asset-list-scroll flex-1 overflow-auto">
        <div className="min-w-max">
          <div className="asset-list-row sticky top-0 z-20 grid border-b border-black/10 bg-zinc-100 text-xs font-semibold uppercase text-ink-500 dark:border-white/10 dark:bg-ink-900" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="asset-list-header locked">Number</div>
            {columns.map((column) => (
              <div
                key={column.id}
                className={`asset-list-header ${dropColumnId === column.id ? 'is-drop-target' : ''} ${dragColumnId === column.id ? 'is-column-dragging' : ''}`}
                onDragEnter={() => setDropColumnId(column.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  reorderColumn(column.id);
                  setDragColumnId('');
                  setDropColumnId('');
                }}
                onDragEnd={() => {
                  setDragColumnId('');
                  setDropColumnId('');
                }}
              >
                <span
                  className="asset-column-drag-handle"
                  draggable
                  onDragStart={(event) => {
                    setDragColumnId(column.id);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  title="Drag column"
                >
                  ::
                </span>
                <input
                  className="asset-header-name"
                  defaultValue={column.name}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    updateColumnName(column.id, event.currentTarget.value);
                    event.currentTarget.blur();
                  }}
                  onBlur={(event) => {
                    if (event.currentTarget.value !== column.name) event.currentTarget.value = column.name;
                  }}
                  draggable={false}
                />
                <button type="button" onClick={() => setSettingsColumnId(column.id)} className="icon-button !h-7 !w-7" aria-label="Column settings"><Settings size={14} /></button>
                <button type="button" onClick={() => deleteColumn(column.id)} className="icon-button !h-7 !w-7" aria-label="Delete column"><Trash2 size={14} /></button>
                <button type="button" onPointerDown={(event) => resizeColumn(event, column)} className="asset-resize-handle" aria-label="Resize column" />
              </div>
            ))}
            <div className="asset-list-header locked">Filename</div>
          </div>

          {(categories.length ? categories : [fallbackCategory]).map((category) => {
            const groupRows = rows.filter((row) => (row.group_id ?? fallbackCategory.id) === category.id);
            return (
              <div key={category.id} className="asset-category-container">
                <div className="asset-category-bar" style={{ width: '100%' }}>
                  <button type="button" onClick={() => updateCategory(category.id, { collapsed: !category.collapsed })} className="icon-button !h-7 !w-7">
                    {category.collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                  </button>
                  <input
                    className="asset-category-name"
                    value={category.name}
                    onChange={(event) => updateCategory(category.id, { name: event.target.value })}
                  />
                </div>
                {!category.collapsed && groupRows.map((row) => {
                  const absoluteRowIndex = rows.findIndex((item) => item.id === row.id);
                  return (
                    <div key={row.id} className="asset-list-row grid border-b border-black/5 bg-white dark:border-white/5 dark:bg-ink-950" style={{ gridTemplateColumns: gridTemplate }}>
                      <div className="asset-cell" data-asset-row={absoluteRowIndex} data-asset-column="-1">
                        <input
                          className="table-input"
                          value={row.number ?? ''}
                          onChange={(event) => updateNumber(row.id, event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              focusCellBelow(absoluteRowIndex, -1);
                            }
                          }}
                          onPaste={(event) => pasteCells(event, absoluteRowIndex, -1)}
                          onFocus={() => setSelectedCell({ rowId: row.id, columnId: 'number' })}
                        />
                      </div>
                      {columns.map((column, columnIndex) => {
                        const selected = selectedCell?.rowId === row.id && selectedCell?.columnId === column.id;
                        return (
                          <div
                            key={column.id}
                            data-asset-row={absoluteRowIndex}
                            data-asset-column={columnIndex}
                            className={`asset-cell copy-cell ${selected ? 'copy-cell-selected' : ''} ${dragColumnId === column.id ? 'is-column-dragging' : ''}`}
                            onCopy={(event) => {
                              event.preventDefault();
                              event.clipboardData.setData('text/plain', row.values?.[column.id] ?? '');
                            }}
                            onPaste={(event) => pasteCells(event, absoluteRowIndex, columnIndex)}
                            onPointerEnter={() => fillTo(row.id, column.id)}
                          >
                            {column.type === 'text' || column.type === 'length' ? (
                              <input
                                className="table-input"
                                inputMode={column.type === 'length' ? 'numeric' : undefined}
                                value={row.values?.[column.id] ?? ''}
                                onChange={(event) => updateCell(row.id, column.id, column.type === 'length' ? event.target.value.replace(/[^\d.]/g, '') : event.target.value)}
                                onFocus={() => setSelectedCell({ rowId: row.id, columnId: column.id })}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    focusCellBelow(absoluteRowIndex, columnIndex);
                                  }
                                }}
                              />
                            ) : (
                              <LabelDropdown
                                value={row.values?.[column.id] ?? ''}
                                options={(column.label_type ? globalOptions[column.label_type] : column.options) ?? []}
                                onChange={(value) => updateCell(row.id, column.id, value)}
                                onMoveDown={() => focusCellBelow(absoluteRowIndex, columnIndex)}
                              />
                            )}
                            <span className="fill-handle-zone">
                              <button
                                type="button"
                                className="fill-handle"
                                onPointerDown={() => {
                                  fillSourceRef.current = { rowId: row.id, columnId: column.id };
                                  window.addEventListener('pointerup', () => {
                                    fillSourceRef.current = null;
                                    markProjectEdited(project.id);
                                  }, { once: true });
                                }}
                                aria-label="Fill down"
                              >
                                +
                              </button>
                            </span>
                          </div>
                        );
                      })}
                      <div className="asset-cell bg-zinc-50 font-mono text-xs text-ink-600 dark:bg-white/[0.035] dark:text-ink-300">
                        <span className="truncate px-2">{generatedFilename(project, activeList, row)}</span>
                      </div>
                    </div>
                  );
                })}
                {!category.collapsed && !groupRows.length && <p className="px-4 py-3 text-sm text-ink-500">No rows in this category yet.</p>}
              </div>
            );
          })}
        </div>
      </div>

      {settingsColumn && (
        <SettingsPanel
          column={settingsColumn}
          globalOptions={globalOptions}
          onClose={() => setSettingsColumnId('')}
          onSave={(column) => {
            saveColumns(columns.map((item) => item.id === column.id ? column : item));
            setSettingsColumnId('');
          }}
          onDelete={() => {
            const nextColumns = columns.filter((item) => item.id !== settingsColumn.id);
            const nextRows = rows.map((row) => {
              const values = { ...(row.values ?? {}) };
              delete values[settingsColumn.id];
              return { ...row, values };
            });
            saveColumns(nextColumns, nextRows);
            setSettingsColumnId('');
          }}
        />
      )}
    </main>
  );
}
