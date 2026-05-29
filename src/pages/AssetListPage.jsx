import { Check, ChevronDown, ChevronRight, Copy, Download, GripVertical, Menu, Plus, Settings, Trash2 } from 'lucide-react';
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
  { name: 'Unique/Ratio', type: 'dropdown', label_type: 'asset_unique_ratio', options: DEFAULT_UNIQUE_RATIO, width: 150 },
  { name: 'Asset Type', type: 'dropdown', label_type: 'asset_type', options: DEFAULT_ASSET_TYPES, width: 180 },
  { name: 'Name', type: 'text', options: [], width: 240 },
  { name: 'Length', type: 'length', options: [], width: 120 },
  { name: 'Ratio', type: 'dropdown', label_type: 'asset_ratio', options: DEFAULT_RATIOS, width: 140 },
];

const SEPARATORS = ['-', '_', ' '];
const FILENAME_COLUMN_OFFSET = 0;
const COPY_COLUMN_OFFSET = 1;
const NOTES_COLUMN_OFFSET = 2;

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

function projectClientCode(project, clients = []) {
  const client = clients.find((item) => item.name?.trim().toLowerCase() === project.client?.trim().toLowerCase());
  const abbreviation = client?.abbreviation?.trim().toUpperCase();
  return abbreviation?.length === 2 ? abbreviation : project.client;
}

function generatedFilename(project, list, row, clients = []) {
  const columns = orderedColumns(list);
  const baseParts = [project.project_number, projectClientCode(project, clients), project.name, row.number]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  const rowParts = columns
    .filter((column) => column.label_type !== 'asset_unique_ratio' && !/^unique\b/i.test(column.name ?? ''))
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
  if (column.type === 'text') return text.replace(/\s+/g, '-');
  return text;
}

function updateRowsForColumn(rows, columnId, fallback = '') {
  return rows.map((row) => ({
    ...row,
    values: { ...(row.values ?? {}), [columnId]: row.values?.[columnId] ?? fallback },
  }));
}

function labelColor(value = '') {
  if (value.trim().toLowerCase() === 'unique') return '#ffcf5c';
  const colors = ['#6d5dfc', '#28b8ff', '#10b981', '#f59e0b', '#f466ae', '#ef4444'];
  const index = [...value].reduce((total, char) => total + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

function LabelDropdown({ id, value, options, onChange, onMoveDown, onArrowNavigate, openDropdownId, setOpenDropdownId }) {
  const open = openDropdownId === id;
  return (
    <div className="asset-label-select">
      <button
        type="button"
        className="asset-label-button"
        onClick={() => setOpenDropdownId(open ? '' : id)}
        onKeyDown={(event) => {
          if (onArrowNavigate?.(event)) {
            event.stopPropagation();
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            if (open) onMoveDown?.();
            else setOpenDropdownId(id);
          }
        }}
      >
        {value ? <span className="asset-label-chip" style={{ backgroundColor: labelColor(value) }}>{value}</span> : <span className="asset-label-chip is-none">None</span>}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="asset-label-menu">
          <button type="button" className="asset-label-option" onClick={() => { onChange(''); setOpenDropdownId(''); }}><span className="asset-label-chip is-none">None</span></button>
          {options.map((option) => (
            <button key={option} type="button" className="asset-label-option" onClick={() => { onChange(option); setOpenDropdownId(''); }}>
              <span className="asset-label-chip" style={{ backgroundColor: labelColor(option) }}>{option}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ColumnOrderPopup({ columns, onClose, onReorder }) {
  const [draftColumns, setDraftColumns] = useState(columns);
  const [dragId, setDragId] = useState('');

  useEffect(() => {
    setDraftColumns(columns);
  }, [columns]);

  const moveColumn = (targetId) => {
    if (!dragId || dragId === targetId) return;
    setDraftColumns((current) => {
      const next = [...current];
      const oldIndex = next.findIndex((column) => column.id === dragId);
      const newIndex = next.findIndex((column) => column.id === targetId);
      if (oldIndex < 0 || newIndex < 0) return current;
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/60 p-5" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-ink-900 p-5 text-ink-100 shadow-glow" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Columns</h2>
            <p className="mt-1 text-sm text-ink-500">Drag the custom columns into the order you want.</p>
          </div>
          <button type="button" onClick={onClose} className="secondary-button !px-3 !py-2">Close</button>
        </div>
        <div className="grid gap-2">
          {draftColumns.map((column) => (
            <div
              key={column.id}
              draggable
              onDragStart={() => setDragId(column.id)}
              onDragEnter={() => moveColumn(column.id)}
              onDragOver={(event) => event.preventDefault()}
              onDragEnd={() => setDragId('')}
              className={`asset-column-order-row ${dragId === column.id ? 'is-dragging' : ''}`}
            >
              <GripVertical size={15} />
              <span>{column.name}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              onReorder(draftColumns);
              onClose();
            }}
          >
            <Check size={16} /> Save order
          </button>
        </div>
      </div>
    </div>
  );
}

function SeparatorDropdown({ value, onChange, openDropdownId, setOpenDropdownId }) {
  return (
    <LabelDropdown
      id="global-separator"
      value={value === ' ' ? 'Blank' : value}
      options={['-', '_', 'Blank']}
      onChange={(nextValue) => onChange(nextValue === 'Blank' ? ' ' : nextValue || '_')}
      openDropdownId={openDropdownId}
      setOpenDropdownId={setOpenDropdownId}
    />
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
    clients = [],
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
  const [orderPopupOpen, setOrderPopupOpen] = useState(false);
  const [selectedCells, setSelectedCells] = useState([]);
  const [selectionAnchor, setSelectionAnchor] = useState(null);
  const [openDropdownId, setOpenDropdownId] = useState('');
  const fillSourceRef = useRef(null);
  const undoStackRef = useRef([]);
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

  useEffect(() => {
    undoStackRef.current = [];
  }, [activeList?.id]);

  const saveList = (patch, { trackUndo = true } = {}) => {
    if (!activeList) return;
    if (trackUndo) undoStackRef.current.push(structuredClone(activeList));
    updateAssetList(activeList.id, patch);
  };

  const undoAssetList = () => {
    if (!activeList) return;
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    updateAssetList(activeList.id, previous);
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

  const autoFitColumnWidth = (column) => {
    const values = rows.map((row) => String(row.values?.[column.id] ?? ''));
    const longest = [column.name, ...values].reduce((maxLength, value) => Math.max(maxLength, value.length), 0);
    const fittedWidth = Math.max(132, Math.min(640, longest * 9 + 136));
    return Math.max(fittedWidth, Number(column.width) || 0);
  };

  const startColumnResize = (event, columnId) => {
    if (!activeList) return;
    event.preventDefault();
    event.stopPropagation();
    undoStackRef.current.push(structuredClone(activeList));
    const startX = event.clientX;
    const startWidth = autoFitColumnWidth(columns.find((column) => column.id === columnId) ?? {});
    const onPointerMove = (moveEvent) => {
      const nextWidth = Math.max(120, Math.min(760, Math.round(startWidth + moveEvent.clientX - startX)));
      updateAssetList(activeList.id, {
        columns: columns.map((column) => column.id === columnId ? { ...column, width: nextWidth } : column),
      });
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      markProjectEdited(project.id);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  };

  const addColumn = () => {
    const column = {
      id: uid(),
      name: `Column ${columns.length + 1}`,
      type: 'custom-dropdown',
      options: [],
      separator: null,
      width: 190,
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
    const expected = ['unique/ratio', 'asset type', 'name', 'length', 'ratio'];
    const hasStandardColumns = expected.every((name) => names.includes(name));
    if (!hasStandardColumns) applyStandardColumns();
    else if (expected.some((name, index) => names[index] !== name)) {
      const order = Object.fromEntries(expected.map((name, index) => [name, index]));
      saveColumns([...columns].sort((a, b) => (order[a.name.toLowerCase()] ?? 99) - (order[b.name.toLowerCase()] ?? 99)));
    }
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
      notes: '',
    };
    saveList({ rows: [...rows, nextRow] });
  };

  const updateCell = (rowId, columnId, value) => {
    saveList({
      rows: rows.map((row) => row.id === rowId ? { ...row, values: { ...(row.values ?? {}), [columnId]: value } } : row),
    });
  };

  const updateNumber = (rowId, value) => {
    saveList({ rows: rows.map((row) => row.id === rowId ? { ...row, number: value } : row) });
  };

  const updateRow = (rowId, patch) => {
    saveList({ rows: rows.map((row) => row.id === rowId ? { ...row, ...patch } : row) });
  };

  const addCategory = () => {
    const category = { id: uid(), name: `Category ${categories.length + 1}`, collapsed: false, sort_order: categories.length };
    saveCategories([...categories, category]);
  };

  const updateCategory = (categoryId, patch) => {
    saveCategories(categories.map((category) => category.id === categoryId ? { ...category, ...patch } : category));
  };

  const deleteCategory = (categoryId) => {
    const category = categories.find((item) => item.id === categoryId);
    const groupRows = rows.filter((row) => (row.group_id ?? fallbackCategory.id) === categoryId);
    const bookingText = groupRows.length === 1 ? '1 row' : `${groupRows.length} rows`;
    if (!category || !window.confirm(`Delete "${category.name}" and ${bookingText}? This cannot be undone.`)) return;
    const nextCategories = categories.filter((item) => item.id !== categoryId);
    const nextRows = rows
      .filter((row) => (row.group_id ?? fallbackCategory.id) !== categoryId)
      .map((row, index) => ({ ...row, sort_order: index }));
    saveCategories(nextCategories, nextRows);
  };

  const updateColumnName = (columnId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveColumns(columns.map((column) => column.id === columnId ? { ...column, name: trimmed } : column));
  };

  const addRowToCategory = (categoryId) => {
    const nextRow = {
      id: uid(),
      number: String(rows.length + 1).padStart(2, '0'),
      group_id: categoryId,
      values: Object.fromEntries(columns.map((column) => [column.id, ''])),
      sort_order: rows.length,
      notes: '',
    };
    saveList({ rows: [...rows, nextRow] });
  };

  const deleteRow = (rowId) => {
    saveList({ rows: rows.filter((row) => row.id !== rowId).map((row, index) => ({ ...row, sort_order: index })) });
  };

  const duplicateRow = (rowId) => {
    const sourceIndex = rows.findIndex((row) => row.id === rowId);
    if (sourceIndex < 0) return;
    const nextRows = rows.map((row, index) => ({ ...row, sort_order: index > sourceIndex ? index + 1 : index }));
    nextRows.push({ ...structuredClone(rows[sourceIndex]), id: uid(), sort_order: sourceIndex + 1 });
    saveList({ rows: nextRows.sort((a, b) => a.sort_order - b.sort_order) });
  };

  const renameAssetListTab = (listId, name) => {
    const trimmed = name.trim();
    const list = projectLists.find((item) => item.id === listId);
    if (!list || !trimmed || trimmed === list.name) return;
    updateAssetList(listId, { name: trimmed });
  };

  const pasteCells = (event, rowIndex, columnIndex) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    const matrix = text.split(/\r?\n/).filter((line) => line.length).map((line) => line.split('\t'));
    const nextRows = rows.map((row) => ({ ...row, values: { ...(row.values ?? {}) } }));
    if (matrix.length === 1 && matrix[0].length === 1 && selectedCells.length > 1) {
      const selected = new Set(selectedCells.map((cell) => cellKey(cell.rowIndex, cell.columnIndex)));
      nextRows.forEach((row, selectedRowIndex) => {
        if (selected.has(cellKey(selectedRowIndex, -1))) row.number = text;
        if (selected.has(cellKey(selectedRowIndex, columns.length + NOTES_COLUMN_OFFSET))) row.notes = text;
        columns.forEach((column, selectedColumnIndex) => {
          if (selected.has(cellKey(selectedRowIndex, selectedColumnIndex))) row.values[column.id] = text;
        });
      });
      saveList({ rows: nextRows });
      return;
    }
    const sourceGroupId = nextRows[rowIndex]?.group_id ?? fallbackCategory.id;
    while (nextRows.length < rowIndex + matrix.length) {
      nextRows.push({
        id: uid(),
        number: String(nextRows.length + 1).padStart(2, '0'),
        group_id: sourceGroupId,
        values: Object.fromEntries(columns.map((column) => [column.id, ''])),
        sort_order: nextRows.length,
        notes: '',
      });
    }
    matrix.forEach((line, y) => {
      const row = nextRows[rowIndex + y];
      if (!row) return;
      line.forEach((value, x) => {
        const targetColumnIndex = columnIndex + x;
        if (targetColumnIndex === -1) row.number = value;
        if (targetColumnIndex === columns.length + NOTES_COLUMN_OFFSET) row.notes = value;
        const column = columns[targetColumnIndex];
        if (column) row.values[column.id] = value;
      });
    });
    saveList({ rows: nextRows });
  };

  const cellKey = (rowIndex, columnIndex) => `${rowIndex}:${columnIndex}`;

  const selectRange = (from, to) => {
    if (!from || !to) return;
    const rowStart = Math.min(from.rowIndex, to.rowIndex);
    const rowEnd = Math.max(from.rowIndex, to.rowIndex);
    const columnStart = Math.min(from.columnIndex, to.columnIndex);
    const columnEnd = Math.max(from.columnIndex, to.columnIndex);
    const nextCells = [];
    for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
      for (let columnIndex = columnStart; columnIndex <= columnEnd; columnIndex += 1) {
        nextCells.push({ rowIndex, columnIndex });
      }
    }
    setSelectedCells(nextCells);
  };

  const clearSelectedCells = () => {
    if (!selectedCells.length) return;
    const selected = new Set(selectedCells.map((cell) => cellKey(cell.rowIndex, cell.columnIndex)));
    saveList({
      rows: rows.map((row, rowIndex) => {
        const nextRow = { ...row, values: { ...(row.values ?? {}) } };
        if (selected.has(cellKey(rowIndex, -1))) nextRow.number = '';
        if (selected.has(cellKey(rowIndex, columns.length + NOTES_COLUMN_OFFSET))) nextRow.notes = '';
        columns.forEach((column, columnIndex) => {
          if (selected.has(cellKey(rowIndex, columnIndex))) nextRow.values[column.id] = '';
        });
        return nextRow;
      }),
    });
  };

  const clearSingleCell = (rowIndex, columnIndex) => {
    if (columnIndex === columns.length + FILENAME_COLUMN_OFFSET || columnIndex === columns.length + COPY_COLUMN_OFFSET) return;
    const row = rows[rowIndex];
    if (!row) return;
    saveList({
      rows: rows.map((item, index) => {
        if (index !== rowIndex) return item;
        const nextRow = { ...item, values: { ...(item.values ?? {}) } };
        if (columnIndex === -1) nextRow.number = '';
        else if (columnIndex === columns.length + NOTES_COLUMN_OFFSET) nextRow.notes = '';
        else if (columns[columnIndex]) nextRow.values[columns[columnIndex].id] = '';
        return nextRow;
      }),
    });
  };

  const focusCellBelow = (rowIndex, columnIndex) => {
    const target = document.querySelector(`[data-asset-row="${rowIndex + 1}"][data-asset-column="${columnIndex}"] input, [data-asset-row="${rowIndex + 1}"][data-asset-column="${columnIndex}"] button`);
    target?.focus();
  };

  const focusAssetCell = (rowIndex, columnIndex) => {
    const target = document.querySelector(`[data-asset-row="${rowIndex}"][data-asset-column="${columnIndex}"] input, [data-asset-row="${rowIndex}"][data-asset-column="${columnIndex}"] button`);
    target?.focus();
  };

  const moveCellFocus = (event, rowIndex, columnIndex) => {
    const directions = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return false;
    event.preventDefault();
    const maxColumnIndex = columns.length + NOTES_COLUMN_OFFSET;
    const nextRowIndex = Math.max(0, Math.min(rows.length - 1, rowIndex + direction[0]));
    const nextColumnIndex = Math.max(-1, Math.min(maxColumnIndex, columnIndex + direction[1]));
    const nextCell = { rowIndex: nextRowIndex, columnIndex: nextColumnIndex };
    setSelectedCell(null);
    setSelectedCells([nextCell]);
    requestAnimationFrame(() => focusAssetCell(nextRowIndex, nextColumnIndex));
    return true;
  };

  const isVisuallySelected = (rowIndex, columnIndex, extraSelected = false) => (
    selectedCells.length <= 1
      && (extraSelected || selectedCells.some((cell) => cell.rowIndex === rowIndex && cell.columnIndex === columnIndex))
  );

  useEffect(() => {
    const onPointerUp = () => setSelectionAnchor(null);
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoAssetList();
        return;
      }
      if (event.key === 'Escape') {
        setSelectedCells([]);
        setSelectedCell(null);
        setSelectionAnchor(null);
        setOpenDropdownId('');
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (event.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
      if (!selectedCells.length) return;
      event.preventDefault();
      clearSelectedCells();
    };
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  const cellSelectionProps = (rowIndex, columnIndex, rowId = null, columnId = null) => ({
    tabIndex: 0,
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      const anchor = { rowIndex, columnIndex };
      setSelectionAnchor(anchor);
      setSelectedCell(null);
      setSelectedCells([anchor]);
    },
    onPointerEnter: () => {
      if (selectionAnchor) selectRange(selectionAnchor, { rowIndex, columnIndex });
      if (rowId && columnId) fillTo(rowId, columnId);
    },
    onKeyDown: (event) => {
      if (moveCellFocus(event, rowIndex, columnIndex)) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        if (selectedCells.length) clearSelectedCells();
        else clearSingleCell(rowIndex, columnIndex);
      }
      if (event.key === 'Escape') {
        setSelectedCells([]);
        setSelectedCell(null);
        setSelectionAnchor(null);
        setOpenDropdownId('');
      }
    },
  });

  const copySelectedCells = (event, rowIndex, columnIndex, value) => {
    if (!selectedCells.length || !selectedCells.some((cell) => cell.rowIndex === rowIndex && cell.columnIndex === columnIndex)) {
      event.clipboardData.setData('text/plain', value);
      return;
    }
    const rowIndexes = [...new Set(selectedCells.map((cell) => cell.rowIndex))].sort((a, b) => a - b);
    const columnIndexes = [...new Set(selectedCells.map((cell) => cell.columnIndex))].sort((a, b) => a - b);
    const selected = new Set(selectedCells.map((cell) => cellKey(cell.rowIndex, cell.columnIndex)));
    const text = rowIndexes.map((selectedRowIndex) => columnIndexes.map((selectedColumnIndex) => {
      if (!selected.has(cellKey(selectedRowIndex, selectedColumnIndex))) return '';
      const row = rows[selectedRowIndex];
      if (!row) return '';
      if (selectedColumnIndex === -1) return row.number ?? '';
      if (selectedColumnIndex === columns.length + FILENAME_COLUMN_OFFSET) return generatedFilename(project, activeList, row, clients);
      if (selectedColumnIndex === columns.length + COPY_COLUMN_OFFSET) return '';
      if (selectedColumnIndex === columns.length + NOTES_COLUMN_OFFSET) return row.notes ?? '';
      const column = columns[selectedColumnIndex];
      return column ? formatCellValue(row.values?.[column.id], column) : '';
    }).join('\t')).join('\n');
    event.clipboardData.setData('text/plain', text);
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

  const deleteColumn = (columnId) => {
    const nextColumns = columns.filter((column) => column.id !== columnId);
    const nextRows = rows.map((row) => {
      const values = { ...(row.values ?? {}) };
      delete values[columnId];
      return { ...row, values };
    });
    saveColumns(nextColumns, nextRows);
  };

  if (!activeList) {
    return <div className="grid min-h-[60vh] place-items-center text-ink-500">Preparing asset list...</div>;
  }

  const filenameColumnIndex = columns.length + FILENAME_COLUMN_OFFSET;
  const copyColumnIndex = columns.length + COPY_COLUMN_OFFSET;
  const notesColumnIndex = columns.length + NOTES_COLUMN_OFFSET;
  const fullGridTemplate = `74px 86px ${columns.map((column) => `${autoFitColumnWidth(column)}px`).join(' ')} 50ch 74px 220px`;

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
              <span className="w-28">
                <SeparatorDropdown value={activeList.global_separator ?? '_'} onChange={(global_separator) => saveList({ global_separator })} openDropdownId={openDropdownId} setOpenDropdownId={setOpenDropdownId} />
              </span>
            </label>
            <button type="button" onClick={() => downloadAssetListExcel(project, projectLists, 'all', clients)} className="secondary-button"><Download size={16} /> Download Excel</button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {projectLists.map((list) => (
              <span key={list.id} className={`asset-tab ${list.id === activeList.id ? 'tab-active' : ''}`} onClick={() => setActiveId(list.id)}>
                <input
                  className="asset-tab-input"
                  defaultValue={list.name}
                  style={{ width: `${Math.max(7, Math.min(18, list.name.length + 1))}ch` }}
                  onFocus={() => setActiveId(list.id)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    renameAssetListTab(list.id, event.currentTarget.value);
                    event.currentTarget.blur();
                  }}
                  onBlur={(event) => {
                    renameAssetListTab(list.id, event.currentTarget.value);
                    if (!event.currentTarget.value.trim()) event.currentTarget.value = list.name;
                  }}
                  aria-label={`Rename ${list.name}`}
                />
              </span>
            ))}
            <button type="button" onClick={() => setActiveId(createAssetListTab(project.id))} className="secondary-button !px-3 !py-2"><Plus size={15} /> New tab</button>
            {projectLists.length > 1 && (
              <button type="button" onClick={() => deleteAssetListTab(activeList.id)} className="icon-button" aria-label="Delete current tab" data-tooltip="Delete tab"><Trash2 size={16} /></button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-black/10 bg-white px-5 py-3 dark:border-white/10 dark:bg-ink-900">
        <button type="button" onClick={addColumn} className="primary-button"><Plus size={16} /> Column</button>
        <button type="button" onClick={addRow} className="secondary-button"><Plus size={16} /> Row</button>
        <button type="button" onClick={addCategory} className="secondary-button"><Plus size={16} /> Category</button>
        <button type="button" onClick={() => setOrderPopupOpen(true)} className="secondary-button"><Menu size={16} /> Columns</button>
        <span className="ml-auto text-xs font-semibold uppercase text-ink-500">Autosaved</span>
      </div>

      <div className="asset-list-scroll flex-1 overflow-auto">
        <div className="min-w-max">
          <div className="asset-list-row sticky top-0 z-20 grid border-b border-black/10 bg-zinc-100 text-xs font-semibold text-ink-500 dark:border-white/10 dark:bg-ink-900" style={{ gridTemplateColumns: fullGridTemplate }}>
            <div className="asset-list-header locked" aria-label="Actions" />
            <div className="asset-list-header locked"><span className="asset-header-label">Number</span></div>
            {columns.map((column) => (
              <div
                key={column.id}
                className="asset-list-header"
              >
                <span className="asset-header-name-wrap">
                  <input
                    className="asset-header-name"
                    defaultValue={column.name}
                    style={{ width: `${Math.max(6, column.name.length + 1)}ch` }}
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
                  <span className="asset-header-actions">
                    <button type="button" onClick={() => setSettingsColumnId(column.id)} className="asset-header-icon" aria-label="Column settings" data-tooltip="Settings"><Settings size={11} /></button>
                    <button type="button" onClick={() => deleteColumn(column.id)} className="asset-header-icon" aria-label="Delete column" data-tooltip="Delete"><Trash2 size={11} /></button>
                  </span>
                </span>
                <button
                  type="button"
                  className="asset-column-resize-handle"
                  onPointerDown={(event) => startColumnResize(event, column.id)}
                  aria-label={`Resize ${column.name}`}
                />
              </div>
            ))}
            <div className="asset-list-header locked"><span className="asset-header-label">Filename</span></div>
            <div className="asset-list-header locked"><span className="asset-header-label">Copy</span></div>
            <div className="asset-list-header locked"><span className="asset-header-label">Notes</span></div>
          </div>

          {(categories.length ? categories : [fallbackCategory]).map((category) => {
            const groupRows = rows.filter((row) => (row.group_id ?? fallbackCategory.id) === category.id);
            return (
              <div key={category.id} className="asset-category-container">
                <div className="asset-category-bar" style={{ marginLeft: 38 }}>
                  <button type="button" onClick={() => updateCategory(category.id, { collapsed: !category.collapsed })} className="icon-button !h-7 !w-7">
                    {category.collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                  </button>
                  <input
                    className="asset-category-name"
                    value={category.name}
                    onChange={(event) => updateCategory(category.id, { name: event.target.value })}
                  />
                  {categories.length > 0 && (
                    <button type="button" onClick={() => deleteCategory(category.id)} className="asset-header-icon ml-auto" data-tooltip="Delete category" aria-label="Delete category"><Trash2 size={12} /></button>
                  )}
                </div>
                <div className="asset-category-body">
                {!category.collapsed && groupRows.map((row) => {
                  const absoluteRowIndex = rows.findIndex((item) => item.id === row.id);
                  return (
                    <div key={row.id} className="asset-list-row grid border-b border-black/5 bg-white dark:border-white/5 dark:bg-ink-950" style={{ gridTemplateColumns: fullGridTemplate }}>
                      <div className="asset-row-actions">
                        <button type="button" onClick={() => duplicateRow(row.id)} className="asset-header-icon" data-tooltip="Duplicate" aria-label="Duplicate row"><Copy size={11} /></button>
                        <button type="button" onClick={() => deleteRow(row.id)} className="asset-header-icon" data-tooltip="Delete" aria-label="Delete row"><Trash2 size={11} /></button>
                      </div>
                      <div className={`asset-cell ${isVisuallySelected(absoluteRowIndex, -1) ? 'copy-cell-selected' : ''}`} data-asset-row={absoluteRowIndex} data-asset-column="-1" {...cellSelectionProps(absoluteRowIndex, -1)}>
                        <input
                          className="table-input"
                          value={row.number ?? ''}
                          onChange={(event) => updateNumber(row.id, event.target.value)}
                          onKeyDown={(event) => {
                            if (moveCellFocus(event, absoluteRowIndex, -1)) return;
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              focusCellBelow(absoluteRowIndex, -1);
                            }
                          }}
                          onPaste={(event) => pasteCells(event, absoluteRowIndex, -1)}
                          onCopy={(event) => {
                            event.preventDefault();
                            copySelectedCells(event, absoluteRowIndex, -1, row.number ?? '');
                          }}
                          onFocus={() => setSelectedCell({ rowId: row.id, columnId: 'number' })}
                        />
                      </div>
                      {columns.map((column, columnIndex) => {
                        const selected = isVisuallySelected(absoluteRowIndex, columnIndex, selectedCell?.rowId === row.id && selectedCell?.columnId === column.id);
                        return (
                          <div
                            key={column.id}
                            data-asset-row={absoluteRowIndex}
                            data-asset-column={columnIndex}
                            className={`asset-cell copy-cell ${selected ? 'copy-cell-selected' : ''}`}
                            {...cellSelectionProps(absoluteRowIndex, columnIndex, row.id, column.id)}
                            onCopy={(event) => {
                              event.preventDefault();
                              copySelectedCells(event, absoluteRowIndex, columnIndex, row.values?.[column.id] ?? '');
                            }}
                            onPaste={(event) => pasteCells(event, absoluteRowIndex, columnIndex)}
                          >
                            {column.type === 'text' || column.type === 'length' ? (
                              <input
                                className="table-input"
                                inputMode={column.type === 'length' ? 'numeric' : undefined}
                                value={row.values?.[column.id] ?? ''}
                                onChange={(event) => updateCell(row.id, column.id, column.type === 'length' ? event.target.value.replace(/[^\d.]/g, '') : event.target.value)}
                                onFocus={() => setSelectedCell({ rowId: row.id, columnId: column.id })}
                                onKeyDown={(event) => {
                                  if (moveCellFocus(event, absoluteRowIndex, columnIndex)) return;
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    focusCellBelow(absoluteRowIndex, columnIndex);
                                  }
                                }}
                              />
                            ) : (
                              <LabelDropdown
                                id={`${row.id}:${column.id}`}
                                value={row.values?.[column.id] ?? ''}
                                options={(column.label_type ? globalOptions[column.label_type] : column.options) ?? []}
                                onChange={(value) => updateCell(row.id, column.id, value)}
                                onMoveDown={() => focusCellBelow(absoluteRowIndex, columnIndex)}
                                onArrowNavigate={(event) => moveCellFocus(event, absoluteRowIndex, columnIndex)}
                                openDropdownId={openDropdownId}
                                setOpenDropdownId={setOpenDropdownId}
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
                              />
                            </span>
                          </div>
                        );
                      })}
                      <div
                        className={`asset-cell bg-zinc-50 font-mono text-xs text-ink-600 dark:bg-white/[0.035] dark:text-ink-300 ${isVisuallySelected(absoluteRowIndex, filenameColumnIndex) ? 'copy-cell-selected' : ''}`}
                        data-asset-row={absoluteRowIndex}
                        data-asset-column={filenameColumnIndex}
                        {...cellSelectionProps(absoluteRowIndex, filenameColumnIndex)}
                        onCopy={(event) => {
                          event.preventDefault();
                          copySelectedCells(event, absoluteRowIndex, filenameColumnIndex, generatedFilename(project, activeList, row, clients));
                        }}
                        onKeyDown={(event) => {
                          if (moveCellFocus(event, absoluteRowIndex, filenameColumnIndex)) return;
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            focusCellBelow(absoluteRowIndex, filenameColumnIndex);
                          }
                        }}
                      >
                        <input className="asset-filename-input" readOnly value={generatedFilename(project, activeList, row, clients)} />
                      </div>
                      <div
                        className="asset-cell asset-copy-cell"
                        data-asset-row={absoluteRowIndex}
                        data-asset-column={copyColumnIndex}
                        onKeyDown={(event) => {
                          if (moveCellFocus(event, absoluteRowIndex, copyColumnIndex)) return;
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            navigator.clipboard?.writeText(generatedFilename(project, activeList, row, clients));
                          }
                        }}
                      >
                        <button
                          type="button"
                          className="asset-copy-filename"
                          onKeyDown={(event) => moveCellFocus(event, absoluteRowIndex, copyColumnIndex)}
                          onClick={() => navigator.clipboard?.writeText(generatedFilename(project, activeList, row, clients))}
                        >
                          Copy
                        </button>
                      </div>
                      <div
                        className={`asset-cell copy-cell ${isVisuallySelected(absoluteRowIndex, notesColumnIndex, selectedCell?.rowId === row.id && selectedCell?.columnId === 'notes') ? 'copy-cell-selected' : ''}`}
                        data-asset-row={absoluteRowIndex}
                        data-asset-column={notesColumnIndex}
                        {...cellSelectionProps(absoluteRowIndex, notesColumnIndex)}
                        onCopy={(event) => {
                          event.preventDefault();
                          copySelectedCells(event, absoluteRowIndex, notesColumnIndex, row.notes ?? '');
                        }}
                        onPaste={(event) => pasteCells(event, absoluteRowIndex, notesColumnIndex)}
                      >
                        <input
                          className="table-input"
                          value={row.notes ?? ''}
                          onChange={(event) => updateRow(row.id, { notes: event.target.value })}
                          onFocus={() => setSelectedCell({ rowId: row.id, columnId: 'notes' })}
                          onKeyDown={(event) => {
                            if (moveCellFocus(event, absoluteRowIndex, notesColumnIndex)) return;
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              focusCellBelow(absoluteRowIndex, notesColumnIndex);
                            }
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
                {!category.collapsed && !groupRows.length && <p className="px-4 py-3 text-sm text-ink-500">No rows in this category yet.</p>}
                {!category.collapsed && (
                  <button type="button" onClick={() => addRowToCategory(category.id)} className="asset-add-row-button">
                    Row
                  </button>
                )}
                </div>
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
      {orderPopupOpen && (
        <ColumnOrderPopup
          columns={columns}
          onClose={() => setOrderPopupOpen(false)}
          onReorder={(nextColumns) => saveColumns(nextColumns)}
        />
      )}
    </main>
  );
}
