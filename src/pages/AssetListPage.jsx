import { ArrowRight, Boxes, Check, ChevronDown, ChevronRight, CircleDot, Clock3, Copy, Download, ExternalLink, Eye, EyeOff, FileText, GitBranch, GripVertical, Hash, Maximize2, Menu, Plus, Ratio, Send, StickyNote, Trash2, Type, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import LabelSelect from '../components/LabelSelect.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlanner } from '../context/PlannerContext.jsx';
import { downloadAssetListExcel } from '../lib/exportExcel.js';

const DEFAULT_ASSET_TYPES = ['OLV', 'SOC', 'PRV', 'HWT', 'TECH', 'CGI', 'Bumper', 'TrueView', 'Story', '360', 'IMG', 'FeatIMG', 'Photography', 'KV', 'StaticBanner', 'DynaBanner'];
const DEFAULT_RATIOS = ['16x9', '9x16', '4x5', '1x1', '3x4', '4x3', 'TBC'];
const QUICK_RATIO_OPTIONS = ['16x9', '9x16', '4x5', '1x1', '2x3'];
const DEFAULT_UNIQUE_RATIO = ['Unique', 'Ratio'];
const DEFAULT_PLATFORMS = ['IG', 'FB', 'IG+TB', 'YT', 'TK', 'PIN', 'SPF'];
const LABEL_TYPE_NAMES = {
  asset_type: 'Asset Type',
  asset_ratio: 'Ratio',
  asset_unique_ratio: 'Clones',
  asset_platform: 'Platform',
  asset_static_type: 'Static Asset Type',
  asset_static_size: 'Size',
};

const STANDARD_COLUMNS = [
  { name: 'Clones', type: 'dropdown', label_type: 'asset_unique_ratio', options: DEFAULT_UNIQUE_RATIO, width: 74 },
  { name: 'Asset Type', type: 'dropdown', label_type: 'asset_type', options: DEFAULT_ASSET_TYPES, width: 180 },
  { name: 'Name', type: 'text', options: [], width: 240 },
  { name: 'Frame.io', type: 'url', options: [], width: 210, exclude_from_filename: true },
  { name: 'Length', type: 'length', options: [], width: 120 },
  { name: 'Ratio', type: 'dropdown', label_type: 'asset_ratio', options: DEFAULT_RATIOS, width: 140 },
];
const STATIC_COLUMNS = [
  { name: 'Static Asset Type', type: 'dropdown', label_type: 'asset_static_type', options: ['IMG', 'Static', 'Banner', 'Dyn Banner', 'Photo'], width: 180 },
  { name: 'Size', type: 'dropdown', label_type: 'asset_static_size', options: ['88x31', '100x100', '120x60', '120x90', '120x240', '120x600', '160x600', '180x150', '234x60', '240x400', '250x250', '300x100', '300x250', '300x600', '320x50', '336x280', '468x60', '720x300', '728x90', '1080x1080', '1080x1350', '1080x1920', '1200x628', '1920x1080'], width: 150 },
];

const DEFAULT_ASSET_LIST_TEMPLATE_ID = 'default-asset-list';
const DEFAULT_ASSET_LIST_TEMPLATE = {
  id: DEFAULT_ASSET_LIST_TEMPLATE_ID,
  name: 'Default asset list',
  columns: [...STANDARD_COLUMNS, ...STATIC_COLUMNS].map((column, index) => ({
    ...column,
    id: `default-column-${index}`,
    separator: null,
    sort_order: index,
  })),
  categories: [{ id: 'default-category', name: 'Category 1', asset_kind: 'video', collapsed: false, sort_order: 0 }],
  global_separator: '_',
  filename_options: { lowercase: false, capitalizeWords: false, hyphenateSpaces: false },
  starter_row_count: 8,
};

const SEPARATORS = ['-', '_', ' '];
const ASSET_STATUS_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'in progress', label: 'In Progress' },
  { value: 'shared', label: 'Shared' },
  { value: 'approved', label: 'Approved' },
];
const ASSET_ROW_STATUS_OPTIONS = ['In progress', 'Approved', 'Delivered'];
const FILENAME_COLUMN_OFFSET = 0;
const COPY_COLUMN_OFFSET = 1;
const NOTES_COLUMN_OFFSET = 2;

function uid() {
  return crypto.randomUUID();
}

function nextAssetNumber(rows = []) {
  const highestMainNumber = rows
    .filter((row) => !row.ratio_parent_id)
    .reduce((highest, row) => {
      const value = Number.parseInt(row.number, 10);
      return Number.isFinite(value) ? Math.max(highest, value) : highest;
    }, 0);
  return String((Math.floor(highestMainNumber / 10) + 1) * 10).padStart(3, '0');
}

function orderedColumns(list) {
  return [...(list?.columns ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function isFrameColumn(column) {
  return /^frame\.?io$/i.test(column?.name ?? '') || column?.type === 'url';
}

function isUniqueRatioColumn(column) {
  return column?.label_type === 'asset_unique_ratio' || /^(unique\s*\/\s*ratio|clones)$/i.test(column?.name ?? '');
}

function isCustomAssetColumn(column) {
  if (column?.is_custom || /^column\s+\d+$/i.test(column?.name ?? '')) return true;
  if (column?.label_type) return false;
  return !/^(name|frame\.?io|length)$/i.test(column?.name ?? '');
}

function isCompactFixedColumn(column) {
  return column?.label_type === 'asset_ratio' || /^length$/i.test(column?.name ?? '');
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
  const rowCategory = (list.categories ?? []).find((category) => category.id === row.group_id);
  const rootCategoryId = rowCategory?.parent_id ?? rowCategory?.id;
  const rootCategory = (list.categories ?? []).find((category) => category.id === rootCategoryId);
  const orderIndex = new Map((rootCategory?.column_order ?? []).map((columnId, index) => [columnId, index]));
  const cellGroups = list.filename_options?.cell_groups ?? [];
  const groupedValue = (columnKey, fallbackValue) => {
    const group = cellGroups.find((item) => item.column_key === columnKey && item.row_ids?.includes(row.id));
    if (!group?.row_ids?.length) return fallbackValue;
    const firstRow = (list.rows ?? []).find((item) => item.id === group.row_ids[0]);
    if (!firstRow) return fallbackValue;
    if (columnKey === 'number') return firstRow.number;
    if (columnKey === 'notes') return firstRow.notes;
    return firstRow.values?.[columnKey];
  };
  const columns = orderedColumns(list)
    .filter((column) => !column.category_id || !rootCategoryId || column.category_id === rootCategoryId)
    .sort((a, b) => {
      const aIndex = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bIndex = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex || (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  const standardProjectParts = [project.project_number, projectClientCode(project, clients), project.name]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  const customPrefix = String(list.filename_options?.prefix_override ?? '').trim();
  const prefixSeparator = list.filename_options?.prefix_separator ?? list.global_separator ?? '_';
  const formattedCustomPrefix = customPrefix.replace(/\s+/g, prefixSeparator);
  const baseParts = [...(formattedCustomPrefix ? [formattedCustomPrefix] : standardProjectParts), groupedValue('number', row.number)]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  const rowParts = columns
    .filter((column) => !column.exclude_from_filename && column.label_type !== 'asset_unique_ratio' && !/^unique\b/i.test(column.name ?? '') && !/^frame\.?io$/i.test(column.name ?? ''))
    .map((column) => ({ value: formatCellValue(groupedValue(column.id, row.values?.[column.id]), column), separator: column.separator || list.global_separator || '_' }))
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

function linkHref(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isValidFramePreviewLink(value) {
  return String(value ?? '').trim().toLowerCase().startsWith('https://f.io/');
}

function updateRowsForColumn(rows, columnId, fallback = '') {
  return rows.map((row) => ({
    ...row,
    values: { ...(row.values ?? {}), [columnId]: row.values?.[columnId] ?? fallback },
  }));
}

function labelColor(value = '') {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'unique') return '#ffcf5c';
  if (normalized === 'in progress') return '#f59e0b';
  if (normalized === 'approved') return '#10b981';
  if (normalized === 'delivered') return '#6d5dfc';
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
  const [draftColumns, setDraftColumns] = useState(() => columns.filter((column) => !isUniqueRatioColumn(column)));
  const [dragId, setDragId] = useState('');

  useEffect(() => {
    setDraftColumns(columns.filter((column) => !isUniqueRatioColumn(column)));
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
    <div className="fixed inset-0 z-[4000] grid place-items-center bg-black/60 p-5" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-ink-900 p-5 text-ink-100 shadow-glow" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Columns</h2>
            <p className="mt-1 text-sm text-ink-500">Set the internal visibility and choose which columns publish to clients.</p>
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
              className={`asset-column-order-row ${dragId === column.id ? 'is-dragging' : ''} ${column.hidden ? 'is-hidden' : ''}`}
            >
              <GripVertical size={15} />
              <span>{column.name}</span>
              <button
                type="button"
                className="asset-column-order-visibility"
                onClick={() => setDraftColumns((current) => current.map((item) => item.id === column.id ? { ...item, hidden: !item.hidden } : item))}
                aria-label={`${column.hidden ? 'Show' : 'Hide'} ${column.name}`}
              >
                {column.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                {column.hidden ? 'Show' : 'Hide'}
              </button>
              <button
                type="button"
                className={`asset-column-order-publish ${column.publish_to_client === false ? 'is-private' : ''}`}
                onClick={() => setDraftColumns((current) => current.map((item) => item.id === column.id ? { ...item, publish_to_client: item.publish_to_client === false } : item))}
                aria-label={`${column.publish_to_client === false ? 'Publish' : 'Do not publish'} ${column.name} to the client page`}
                aria-pressed={column.publish_to_client !== false}
              >
                <Send size={14} />
                {column.publish_to_client === false ? 'Private' : 'Publish'}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              const fixedColumns = columns.filter(isUniqueRatioColumn);
              onReorder([...fixedColumns, ...draftColumns]);
              onClose();
            }}
          >
            <Check size={16} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ column, globalOptions, existingNames = [], onClose, onSave, onDelete }) {
  const [name, setName] = useState(column.name);
  const customColumn = isCustomAssetColumn(column);
  const usesAdminLabels = customColumn && column.label_type && !['asset_type', 'asset_ratio', 'asset_unique_ratio'].includes(column.label_type);
  const [type, setType] = useState(usesAdminLabels ? 'labels' : customColumn && column.type === 'custom-dropdown' ? 'dropdown' : column.type ?? 'text');
  const [labelType, setLabelType] = useState(column.label_type ?? '');
  const [separator, setSeparator] = useState(column.separator ?? '');
  const [optionsText, setOptionsText] = useState((column.options ?? []).join('\n'));
  const [nameError, setNameError] = useState('');

  const options = optionsText
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-[4000] grid place-items-center bg-black/60 p-5">
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
            <input
              className="field"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setNameError('');
              }}
              autoFocus={customColumn}
            />
            {nameError && <span className="block text-xs font-semibold text-red-300">{nameError}</span>}
          </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase text-ink-500">Column type</span>
              <select
                className="field"
                value={type === 'labels' ? 'text' : type}
                onChange={(event) => {
                  setType(event.target.value);
                  setLabelType('');
                }}
              >
                {customColumn ? (
                  <>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="dropdown">Dropdown</option>
                  </>
                ) : (
                  <>
                    <option value="text">Full text</option>
                    <option value="number">Number</option>
                    <option value="url">Link</option>
                    <option value="dropdown">Global dropdown</option>
                    <option value="custom-dropdown">Custom dropdown</option>
                    <option value="length">Length</option>
                  </>
                )}
            </select>
          </label>
          {type === 'dropdown' && !customColumn && (
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
                <option value="asset_unique_ratio">Clones</option>
                <option value="asset_platform">Platform</option>
              </select>
            </label>
          )}
          {(type === 'custom-dropdown' || (type === 'dropdown' && customColumn)) && (
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
          {customColumn && Object.keys(globalOptions).some((key) => !['asset_type', 'asset_ratio', 'asset_unique_ratio'].includes(key)) && (
            <div className="space-y-2">
              <span className="block text-xs font-semibold uppercase text-ink-500">Default label columns</span>
              <div className="asset-default-label-columns">
                {Object.keys(globalOptions)
                  .filter((key) => !['asset_type', 'asset_ratio', 'asset_unique_ratio'].includes(key))
                  .map((key) => {
                    const labelName = LABEL_TYPE_NAMES[key] ?? key.replace(/^asset_/, '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
                    const selected = type === 'labels' && labelType === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`asset-default-label-column-button ${selected ? 'is-selected' : ''}`}
                        onClick={() => {
                          if (selected) {
                            setType('text');
                            setLabelType('');
                          } else {
                            setType('labels');
                            setLabelType(key);
                            setName(labelName);
                          }
                          setNameError('');
                        }}
                        aria-pressed={selected}
                      >
                        <span className="asset-label-chip" style={{ backgroundColor: labelColor(labelName) }}>{labelName}</span>
                        {selected && <Check size={14} />}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
          {!customColumn && (
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase text-ink-500">Separator after this column</span>
              <select className="field" value={separator} onChange={(event) => setSeparator(event.target.value)}>
                <option value="">Use global separator</option>
                {SEPARATORS.map((item) => <option key={item} value={item}>{item === ' ' ? 'blank space' : item}</option>)}
              </select>
            </label>
          )}
          {type === 'length' && <p className="text-sm text-ink-500">Only numbers are entered in the sheet. The filename shows the value with an s, like 15s.</p>}
          {type === 'number' && <p className="text-sm text-ink-500">Only numeric values can be entered in this column.</p>}
        </div>
        <div className="mt-5 flex justify-between gap-2">
          <button type="button" onClick={onDelete} className="secondary-button text-red-300"><Trash2 size={16} /> Delete</button>
          <button
            type="button"
            onClick={() => {
              const trimmedName = name.trim();
              if (!trimmedName || (customColumn && /^column\s+\d+$/i.test(trimmedName))) {
                setNameError('Enter a specific name for this column.');
                return;
              }
              if (existingNames.some((item) => item.toLowerCase() === trimmedName.toLowerCase())) {
                setNameError('A column with this name already exists.');
                return;
              }
              if (type === 'labels' && !labelType) {
                setNameError('Choose a default label group.');
                return;
              }
              onSave({
                ...column,
                name: trimmedName,
                type: type === 'labels' ? 'dropdown' : type,
                label_type: type === 'labels' ? labelType : customColumn ? null : type === 'dropdown' ? labelType : null,
                separator: customColumn ? null : separator || null,
                options: type === 'labels' ? globalOptions[labelType] ?? [] : customColumn && type === 'dropdown' ? options : type === 'custom-dropdown' ? options : globalOptions[labelType] ?? options,
                exclude_from_filename: type === 'url' ? true : column.exclude_from_filename,
              });
            }}
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
  const { user } = useAuth();
  const {
    assetLists = [],
    labels = [],
    clients = [],
    ensureAssetList,
    updateAssetList,
    addLabel,
    deleteLabel,
    markProjectEdited,
    profiles = [],
    appSettings = {},
    saveAssetListTemplate,
  } = usePlanner();
  const isAdmin = profiles.some((profile) => profile.id === user.id && profile.role === 'admin');
  const assetListTemplates = useMemo(() => appSettings.assetListTemplates ?? [], [appSettings.assetListTemplates]);
  const availableAssetListTemplates = useMemo(() => [DEFAULT_ASSET_LIST_TEMPLATE, ...assetListTemplates], [assetListTemplates]);
  const savedCategoryTemplates = useMemo(() => assetListTemplates.filter((template) => template.category_template), [assetListTemplates]);
  const categoryTemplateOptions = useMemo(() => availableAssetListTemplates.flatMap((template) => {
    const templateCategories = (template.categories?.length ? template.categories : [{ id: 'template-default', name: template.name, asset_kind: 'video' }])
      .filter((category) => !category.parent_id);
    return templateCategories.map((category) => ({
      id: `${template.id}:${category.id}`,
      template,
      category,
      label: template.category_template ? template.name : `${template.name} — ${category.name}`,
    }));
  }), [availableAssetListTemplates]);
  const projectLists = useMemo(
    () => assetLists.filter((item) => item.project_id === project.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [assetLists, project.id],
  );
  const [activeId, setActiveId] = useState('');
  const [settingsColumnId, setSettingsColumnId] = useState('');
  const [selectedCell, setSelectedCell] = useState(null);
  const [orderPopupOpen, setOrderPopupOpen] = useState(false);
  const [orderCategoryId, setOrderCategoryId] = useState('');
  const [selectedCells, setSelectedCells] = useState([]);
  const [selectionAnchor, setSelectionAnchor] = useState(null);
  const [openDropdownId, setOpenDropdownId] = useState('');
  const [ratioMenuRowId, setRatioMenuRowId] = useState('');
  const [selectedRatios, setSelectedRatios] = useState([]);
  const [customStaticSizeDraft, setCustomStaticSizeDraft] = useState('');
  const [customRatioDraft, setCustomRatioDraft] = useState('');
  const [showClones, setShowClones] = useState(true);
  const [categoryKindPromptOpen, setCategoryKindPromptOpen] = useState(false);
  const [dragRowId, setDragRowId] = useState('');
  const [dragTargetRowId, setDragTargetRowId] = useState('');
  const [dragCategoryId, setDragCategoryId] = useState('');
  const [dragTargetCategoryId, setDragTargetCategoryId] = useState('');
  const [prefixPopupOpen, setPrefixPopupOpen] = useState(false);
  const [prefixDraft, setPrefixDraft] = useState('');
  const [prefixSeparator, setPrefixSeparator] = useState('_');
  const [templatePopupOpen, setTemplatePopupOpen] = useState(false);
  const [templateSaveMode, setTemplateSaveMode] = useState('new');
  const [templateNameDraft, setTemplateNameDraft] = useState('');
  const [templateUpdateId, setTemplateUpdateId] = useState('');
  const [templateSourceCategoryId, setTemplateSourceCategoryId] = useState('');
  const [templateChooserOpen, setTemplateChooserOpen] = useState(false);
  const [selectedCategoryTemplateId, setSelectedCategoryTemplateId] = useState('');
  const [frameLinkPopup, setFrameLinkPopup] = useState(null);
  const [frameLinkDraft, setFrameLinkDraft] = useState('');
  const [cellGroupPrompt, setCellGroupPrompt] = useState(null);
  const fillSourceRef = useRef(null);
  const undoStackRef = useRef([]);
  const globalOptions = useMemo(() => labels
    .filter((label) => !label.project_id && label.column_type?.startsWith('asset_') && !label.is_divider)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .reduce((groups, label) => ({
      ...groups,
      [label.column_type]: [...(groups[label.column_type] ?? []), label.value],
    }), {
      asset_type: [],
      asset_ratio: [],
      asset_unique_ratio: [],
      asset_platform: [],
      asset_static_type: [],
      asset_static_size: [],
    }), [labels]);
  const assetTypeLabels = useMemo(() => labels
    .filter((label) => (!label.project_id || label.project_id === project.id) && label.column_type === 'asset_type' && !label.is_divider)
    .sort((a, b) => {
      if (Boolean(a.project_id) !== Boolean(b.project_id)) return a.project_id ? 1 : -1;
      return (a.sort_order ?? 9999) - (b.sort_order ?? 9999);
    }), [labels, project.id]);
  const staticAssetTypeLabels = useMemo(() => labels
    .filter((label) => (!label.project_id || label.project_id === project.id) && label.column_type === 'asset_static_type' && !label.is_divider)
    .sort((a, b) => Boolean(a.project_id) - Boolean(b.project_id) || (a.sort_order ?? 9999) - (b.sort_order ?? 9999)), [labels, project.id]);
  const staticSizeLabels = useMemo(() => labels
    .filter((label) => (!label.project_id || label.project_id === project.id) && label.column_type === 'asset_static_size' && !label.is_divider)
    .sort((a, b) => Boolean(a.project_id) - Boolean(b.project_id) || (a.sort_order ?? 9999) - (b.sort_order ?? 9999)), [labels, project.id]);
  const ratioLabels = useMemo(() => labels
    .filter((label) => (!label.project_id || label.project_id === project.id) && label.column_type === 'asset_ratio' && !label.is_divider)
    .sort((a, b) => Boolean(a.project_id) - Boolean(b.project_id) || (a.sort_order ?? 9999) - (b.sort_order ?? 9999)), [labels, project.id]);

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
  const savedAssetStatus = activeList?.filename_options?.status ?? 'none';
  const assetStatus = ASSET_STATUS_OPTIONS.some((status) => status.value === savedAssetStatus) ? savedAssetStatus : 'none';
  const assetPublished = Boolean(activeList?.filename_options?.asset_published_at);

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

  const updateAssetStatus = (status) => {
    saveList({ filename_options: { ...(activeList.filename_options ?? {}), status } }, { trackUndo: false });
    markProjectEdited(project.id);
  };

  const openFrameLinkPopup = (rowId, columnId, value = '') => {
    setFrameLinkDraft(value);
    setFrameLinkPopup({ rowId, columnId });
  };

  const saveFrameLink = () => {
    if (!frameLinkPopup) return;
    const nextLink = frameLinkDraft.trim();
    if (!isValidFramePreviewLink(nextLink)) return;
    updateCell(frameLinkPopup.rowId, frameLinkPopup.columnId, nextLink);
    setFrameLinkPopup(null);
  };

  const publishAssetList = () => {
    saveList({
      filename_options: {
        ...(activeList.filename_options ?? {}),
        asset_published_at: new Date().toISOString(),
        status: activeList.filename_options?.status && activeList.filename_options.status !== 'none' ? activeList.filename_options.status : 'shared',
      },
    }, { trackUndo: false });
    markProjectEdited(project.id);
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

  const saveCategoryAsTemplate = (categoryId) => {
    if (!isAdmin || !activeList) return;
    const category = categories.find((item) => item.id === categoryId && !item.parent_id);
    if (!category) return;
    setTemplateSourceCategoryId(category.id);
    setTemplateSaveMode('new');
    setTemplateUpdateId('');
    setTemplateNameDraft(category.name || 'Category template');
    setTemplatePopupOpen(true);
  };

  const confirmSaveCategoryAsTemplate = () => {
    if (!isAdmin || !activeList) return;
    const sourceCategory = categories.find((category) => category.id === templateSourceCategoryId && !category.parent_id);
    if (!sourceCategory) return;
    const selectedTemplate = assetListTemplates.find((template) => template.id === templateUpdateId);
    const name = templateNameDraft.trim();
    if (!name) return;
    const sourceColumns = columns
      .filter((column) => !column.category_id || column.category_id === sourceCategory.id)
      .map((column) => ({ ...structuredClone(column), category_id: null }));
    const columnIdMap = Object.fromEntries(sourceColumns.map((column) => [column.id, column.id]));
    saveAssetListTemplate({
      id: templateSaveMode === 'update' ? selectedTemplate?.id : undefined,
      name,
      category_template: true,
      columns: sourceColumns,
      categories: [{
        ...structuredClone(sourceCategory),
        id: 'category-template-root',
        parent_id: null,
        collapsed: false,
        sort_order: 0,
        column_order: (sourceCategory.column_order ?? sourceColumns.map((column) => column.id)).filter((id) => columnIdMap[id]),
        column_settings: Object.fromEntries(Object.entries(sourceCategory.column_settings ?? {}).filter(([id]) => columnIdMap[id])),
      }],
      global_separator: activeList.global_separator ?? '_',
      filename_options: {},
    });
    setTemplatePopupOpen(false);
  };

  const addCategoryFromTemplate = () => {
    const option = categoryTemplateOptions.find((item) => item.id === selectedCategoryTemplateId);
    if (!option || !activeList) return;
    const { template, category: sourceCategory } = option;
    const newCategoryId = uid();
    const assetKind = sourceCategory.asset_kind === 'static' ? 'static' : 'video';
    const sourceColumns = (template.columns ?? []).filter((column) => {
      if (column.category_id && column.category_id !== sourceCategory.id) return false;
      if (isCustomAssetColumn(column)) return true;
      if (assetKind === 'static') {
        return isUniqueRatioColumn(column)
          || ['asset_static_type', 'asset_static_size'].includes(column.label_type)
          || /^name$/i.test(column.name ?? '')
          || isFrameColumn(column);
      }
      return !['asset_static_type', 'asset_static_size'].includes(column.label_type);
    });
    const columnIdMap = {};
    const addedColumns = [];
    sourceColumns.forEach((sourceColumn) => {
      const existingColumn = !isCustomAssetColumn(sourceColumn) && columns.find((column) => (
        sourceColumn.label_type
          ? column.label_type === sourceColumn.label_type
          : column.type === sourceColumn.type && column.name?.trim().toLowerCase() === sourceColumn.name?.trim().toLowerCase()
      ));
      if (existingColumn) {
        columnIdMap[sourceColumn.id] = existingColumn.id;
        return;
      }
      const nextId = uid();
      columnIdMap[sourceColumn.id] = nextId;
      addedColumns.push({
        ...structuredClone(sourceColumn),
        id: nextId,
        category_id: newCategoryId,
        is_custom: true,
        sort_order: columns.length + addedColumns.length,
      });
    });
    const sourceOrder = sourceCategory.column_order?.length
      ? sourceCategory.column_order
      : sourceColumns.map((column) => column.id);
    const columnOrder = sourceOrder.map((id) => columnIdMap[id]).filter(Boolean);
    const columnSettings = Object.fromEntries(Object.entries(sourceCategory.column_settings ?? {})
      .map(([id, settings]) => [columnIdMap[id], structuredClone(settings)])
      .filter(([id]) => Boolean(id)));
    const nextCategory = {
      ...structuredClone(sourceCategory),
      id: newCategoryId,
      parent_id: null,
      name: sourceCategory.name || template.name,
      collapsed: false,
      sort_order: categories.length,
      column_order: columnOrder,
      column_settings: columnSettings,
    };
    saveList({
      columns: [...columns, ...addedColumns],
      categories: [...categories, nextCategory],
      rows: addedColumns.reduce((nextRows, column) => updateRowsForColumn(nextRows, column.id), rows),
    });
    setTemplateChooserOpen(false);
    setSelectedCategoryTemplateId('');
    markProjectEdited(project.id);
  };

  const autoFitColumnWidth = (column) => {
    const values = rows.map((row) => String(row.values?.[column.id] ?? ''));
    const longest = [column.name, ...values].reduce((maxLength, value) => Math.max(maxLength, value.length), 0);
    const fittedWidth = Math.max(132, Math.min(640, longest * 9 + 136));
    if (column.manual_width) return Math.max(92, Number(column.width) || fittedWidth);
    return fittedWidth;
  };

  const filenameColumnWidth = () => {
    if (activeList?.filename_options?.filename_column_width) {
      return Math.max(150, Number(activeList.filename_options.filename_column_width));
    }
    return 360;
  };

  const notesColumnWidth = () => Math.max(100, Number(activeList?.filename_options?.notes_column_width) || 154);

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
        columns: columns.map((column) => column.id === columnId ? { ...column, width: nextWidth, manual_width: true } : column),
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

  const startFilenameColumnResize = (event) => {
    if (!activeList) return;
    event.preventDefault();
    event.stopPropagation();
    undoStackRef.current.push(structuredClone(activeList));
    const startX = event.clientX;
    const startWidth = filenameColumnWidth();
    const onPointerMove = (moveEvent) => {
      const nextWidth = Math.max(150, Math.min(1200, Math.round(startWidth + (moveEvent.clientX - startX) / 0.7)));
      updateAssetList(activeList.id, {
        filename_options: {
          ...(activeList.filename_options ?? {}),
          filename_column_width: nextWidth,
        },
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

  const startNotesColumnResize = (event) => {
    if (!activeList) return;
    event.preventDefault();
    event.stopPropagation();
    undoStackRef.current.push(structuredClone(activeList));
    const startX = event.clientX;
    const startWidth = notesColumnWidth();
    const onPointerMove = (moveEvent) => {
      const nextWidth = Math.max(100, Math.min(760, Math.round(startWidth + moveEvent.clientX - startX)));
      updateAssetList(activeList.id, {
        filename_options: {
          ...(activeList.filename_options ?? {}),
          notes_column_width: nextWidth,
        },
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
        number: String((index + 1) * 10).padStart(3, '0'),
        group_id: groupId,
        values: Object.fromEntries(nextColumns.map((column) => [column.id, ''])),
        sort_order: index,
      }));
    saveList({ columns: nextColumns, categories: nextCategories, rows: nextRows, global_separator: activeList.global_separator || '_' });
  };

  useEffect(() => {
    if (!activeList || !columns.length) return;
    const names = columns.map((column) => isUniqueRatioColumn(column) ? 'clones' : column.name.toLowerCase());
    const expected = ['clones', 'asset type', 'name', 'length', 'ratio'];
    const hasStandardColumns = expected.every((name) => names.includes(name));
    if (!hasStandardColumns) applyStandardColumns();
    else if (expected.some((name, index) => names.filter((item) => expected.includes(item))[index] !== name)) {
      const order = { clones: 0, 'asset type': 1, name: 2, 'frame.io': 3, length: 4, ratio: 5 };
      saveColumns([...columns].sort((a, b) => (order[isUniqueRatioColumn(a) ? 'clones' : a.name.toLowerCase()] ?? 99) - (order[isUniqueRatioColumn(b) ? 'clones' : b.name.toLowerCase()] ?? 99)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeList?.id]);

  useEffect(() => {
    if (!activeList || !columns.length) return;
    if (columns.some((column) => /^frame\.?io$/i.test(column.name ?? ''))) return;
    const frameColumn = {
      id: uid(),
      name: 'Frame.io',
      type: 'url',
      options: [],
      separator: null,
      width: 210,
      sort_order: 3,
      exclude_from_filename: true,
    };
    const nextColumns = [
      ...columns.slice(0, 3),
      frameColumn,
      ...columns.slice(3),
    ].map((column, index) => ({ ...column, sort_order: index }));
    saveColumns(nextColumns, updateRowsForColumn(activeList.rows, frameColumn.id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeList?.id, columns.length]);

  useEffect(() => {
    if (!activeList || !columns.length) return;
    const missingStaticColumns = STATIC_COLUMNS.filter((definition) => !columns.some((column) => column.label_type === definition.label_type));
    if (!missingStaticColumns.length) return;
    const additions = missingStaticColumns.map((definition, index) => ({
      ...definition,
      id: uid(),
      separator: null,
      sort_order: columns.length + index,
      options: globalOptions[definition.label_type]?.length ? globalOptions[definition.label_type] : definition.options,
    }));
    const nextRows = additions.reduce((currentRows, column) => updateRowsForColumn(currentRows, column.id), activeList.rows);
    saveColumns([...columns, ...additions], nextRows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeList?.id, columns.length]);

  const syncRatioGroup = (sourceRowId, nextRatios) => {
    const uniqueRatioColumn = columns.find(isUniqueRatioColumn);
    const sourceIndex = rows.findIndex((row) => row.id === sourceRowId);
    const sourceRow = rows[sourceIndex];
    const sourceCategory = categories.find((category) => category.id === sourceRow?.group_id);
    const cloneValueColumn = sourceCategory?.asset_kind === 'static'
      ? columns.find((column) => column.label_type === 'asset_static_size')
      : columns.find((column) => column.label_type === 'asset_ratio' || /^ratio$/i.test(column.name ?? ''));
    if (!cloneValueColumn || !sourceRow) return;

    const existingChildren = rows.filter((row) => row.ratio_parent_id === sourceRowId);
    const existingByRatio = new Map(existingChildren.map((row) => [row.ratio_value || row.values?.[cloneValueColumn.id], row]));
    const sourceNumber = Number.parseInt(sourceRow.number, 10);
    const numberWidth = Math.max(3, ...rows.map((row) => String(row.number ?? '').length));
    const childIdSet = new Set(existingChildren.map((row) => row.id));
    const baseRows = rows.filter((row) => !childIdSet.has(row.id)).map((row) => {
      if (row.id === sourceRowId) return { ...row, ratio_group: nextRatios.length > 0 };
      return row;
    });
    const sourceBaseIndex = baseRows.findIndex((row) => row.id === sourceRowId);
    const ratioRows = nextRatios.map((ratio, index) => {
      const existing = existingByRatio.get(ratio);
      return {
        ...(existing ?? sourceRow),
        id: existing?.id ?? uid(),
        number: Number.isFinite(sourceNumber) ? String(sourceNumber + index + 1).padStart(numberWidth, '0') : `${sourceRow.number}.${index + 1}`,
        group_id: sourceRow.group_id ?? fallbackCategory.id,
        values: {
          ...(existing?.values ?? sourceRow.values ?? {}),
          ...(uniqueRatioColumn ? { [uniqueRatioColumn.id]: '' } : {}),
          [cloneValueColumn.id]: ratio,
        },
        notes: existing?.notes ?? sourceRow.notes ?? '',
        ratio_parent_id: sourceRow.id,
        ratio_value: ratio,
        ratio_group: false,
      };
    });
    const nextRows = [...baseRows.slice(0, sourceBaseIndex + 1), ...ratioRows, ...baseRows.slice(sourceBaseIndex + 1)]
      .map((row, index) => ({ ...row, sort_order: index }));
    saveList({ rows: nextRows });
    if (!ratioMenuRowId || ratioMenuRowId === sourceRowId) setSelectedRatios(nextRatios);
  };

  const openRatioPanel = (sourceRowId) => {
    const sourceRow = rows.find((row) => row.id === sourceRowId);
    const sourceCategory = categories.find((category) => category.id === sourceRow?.group_id);
    const cloneValueColumn = sourceCategory?.asset_kind === 'static'
      ? columns.find((column) => column.label_type === 'asset_static_size')
      : columns.find((column) => column.label_type === 'asset_ratio' || /^ratio$/i.test(column.name ?? ''));
    const createdRatios = rows
      .filter((row) => row.ratio_parent_id === sourceRowId)
      .map((row) => row.ratio_value || row.values?.[cloneValueColumn?.id])
      .filter(Boolean);
    setSelectedRatios(createdRatios);
    setCustomStaticSizeDraft('');
    setCustomRatioDraft('');
    setRatioMenuRowId(sourceRowId);
  };

  const addProjectStaticSize = (sourceRowId) => {
    const size = customStaticSizeDraft.trim().replace(/\s*[x×]\s*/i, 'x');
    if (!size) return;
    if (!staticSizeLabels.some((label) => label.value.trim().toLowerCase() === size.toLowerCase())) {
      addLabel(project.id, 'asset_static_size', size, '#10b981');
    }
    if (!selectedRatios.some((item) => item.toLowerCase() === size.toLowerCase())) {
      syncRatioGroup(sourceRowId, [...selectedRatios, size]);
    }
    setCustomStaticSizeDraft('');
  };

  const addProjectRatio = (sourceRowId) => {
    const ratio = customRatioDraft.trim().replace(/\s*[x×:]\s*/i, 'x');
    if (!ratio) return;
    if (!ratioLabels.some((label) => label.value.trim().toLowerCase() === ratio.toLowerCase())) {
      addLabel(project.id, 'asset_ratio', ratio, '#28b8ff');
    }
    if (!selectedRatios.some((item) => item.toLowerCase() === ratio.toLowerCase())) {
      syncRatioGroup(sourceRowId, [...selectedRatios, ratio]);
    }
    setCustomRatioDraft('');
  };

  const toggleRatioForRow = (sourceRowId, ratio) => {
    const nextRatios = selectedRatios.includes(ratio)
      ? selectedRatios.filter((item) => item !== ratio)
      : [...selectedRatios, ratio];
    syncRatioGroup(sourceRowId, nextRatios);
  };

  const updateCell = (rowId, columnId, value) => {
    const column = columns.find((item) => item.id === columnId);
    const keepVariantValue = isUniqueRatioColumn(column) || ['asset_ratio', 'asset_static_size'].includes(column?.label_type) || /^ratio$/i.test(column?.name ?? '');
    saveList({
      rows: rows.map((row) => {
        if (row.id === rowId) return { ...row, values: { ...(row.values ?? {}), [columnId]: value } };
        if (!keepVariantValue && row.ratio_parent_id === rowId) {
          return { ...row, values: { ...(row.values ?? {}), [columnId]: value } };
        }
        return row;
      }),
    });
  };

  const updateNumber = (rowId, value) => {
    saveList({ rows: rows.map((row) => row.id === rowId ? { ...row, number: value } : row) });
  };

  const updateRow = (rowId, patch) => {
    saveList({ rows: rows.map((row) => row.id === rowId ? { ...row, ...patch } : row) });
  };

  const addColumn = (categoryId) => {
    const rootCategoryId = categories.find((category) => category.id === categoryId)?.parent_id ?? categoryId;
    const column = {
      id: uid(),
      name: `Column ${columns.length + 1}`,
      type: 'text',
      options: [],
      separator: null,
      sort_order: columns.length,
      width: 180,
      is_custom: true,
      category_id: rootCategoryId,
    };
    saveColumns([...columns, column], updateRowsForColumn(rows, column.id));
    setSettingsColumnId(column.id);
  };

  const addCategory = (assetKind) => {
    const mainCategoryCount = categories.filter((category) => !category.parent_id).length;
    const category = { id: uid(), name: `Category ${mainCategoryCount + 1}`, asset_kind: assetKind, collapsed: false, sort_order: categories.length };
    saveCategories([...categories, category]);
    setCategoryKindPromptOpen(false);
  };

  const addSubcategory = (parentId) => {
    const siblingCount = categories.filter((category) => category.parent_id === parentId).length;
    const subcategory = {
      id: uid(),
      name: `Subcategory ${siblingCount + 1}`,
      parent_id: parentId,
      asset_kind: categories.find((category) => category.id === parentId)?.asset_kind ?? 'video',
      collapsed: false,
      sort_order: categories.length,
    };
    saveCategories([...categories, subcategory]);
  };

  const updateCategory = (categoryId, patch) => {
    saveCategories(categories.map((category) => category.id === categoryId ? { ...category, ...patch } : category));
  };

  const dropCategory = (targetCategoryId) => {
    const source = categories.find((category) => category.id === dragCategoryId);
    const target = categories.find((category) => category.id === targetCategoryId);
    if (!source || !target || source.id === target.id || (source.parent_id ?? null) !== (target.parent_id ?? null)) {
      setDragCategoryId('');
      setDragTargetCategoryId('');
      return;
    }
    let nextCategories;
    if (!source.parent_id) {
      const rootBlocks = categories.filter((category) => !category.parent_id).map((root) => [root, ...categories.filter((category) => category.parent_id === root.id)]);
      const sourceIndex = rootBlocks.findIndex((block) => block[0].id === source.id);
      const targetIndex = rootBlocks.findIndex((block) => block[0].id === target.id);
      const [moved] = rootBlocks.splice(sourceIndex, 1);
      rootBlocks.splice(targetIndex, 0, moved);
      nextCategories = rootBlocks.flat();
    } else {
      const siblings = categories.filter((category) => category.parent_id === source.parent_id);
      const sourceIndex = siblings.findIndex((category) => category.id === source.id);
      const targetIndex = siblings.findIndex((category) => category.id === target.id);
      const [moved] = siblings.splice(sourceIndex, 1);
      siblings.splice(targetIndex, 0, moved);
      let siblingIndex = 0;
      nextCategories = categories.map((category) => category.parent_id === source.parent_id ? siblings[siblingIndex++] : category);
    }
    saveCategories(nextCategories);
    setDragCategoryId('');
    setDragTargetCategoryId('');
  };

  const deleteCategory = (categoryId) => {
    const category = categories.find((item) => item.id === categoryId);
    const categoryIds = [categoryId, ...categories.filter((item) => item.parent_id === categoryId).map((item) => item.id)];
    const groupRows = rows.filter((row) => categoryIds.includes(row.group_id ?? fallbackCategory.id));
    const bookingText = groupRows.length === 1 ? '1 row' : `${groupRows.length} rows`;
    if (!category || !window.confirm(`Delete "${category.name}" and ${bookingText}? This cannot be undone.`)) return;
    const nextCategories = categories.filter((item) => !categoryIds.includes(item.id));
    const nextRows = rows
      .filter((row) => !categoryIds.includes(row.group_id ?? fallbackCategory.id))
      .map((row, index) => ({ ...row, sort_order: index }));
    saveCategories(nextCategories, nextRows);
  };

  const addRowToCategory = (categoryId) => {
    const nextRow = {
      id: uid(),
      number: nextAssetNumber(rows),
      group_id: categoryId,
      values: Object.fromEntries(columns.map((column) => [column.id, ''])),
      sort_order: rows.length,
      notes: '',
    };
    saveList({ rows: [...rows, nextRow] });
  };

  const deleteRow = (rowId) => {
    const target = rows.find((row) => row.id === rowId);
    if (target?.ratio_parent_id) {
      const parentRow = rows.find((row) => row.id === target.ratio_parent_id);
      const parentCategory = categories.find((category) => category.id === parentRow?.group_id);
      const cloneValueColumn = parentCategory?.asset_kind === 'static'
        ? columns.find((column) => column.label_type === 'asset_static_size')
        : columns.find((column) => column.label_type === 'asset_ratio' || /^ratio$/i.test(column.name ?? ''));
      const remainingRatios = rows
        .filter((row) => row.ratio_parent_id === target.ratio_parent_id && row.id !== rowId)
        .map((row) => row.ratio_value || row.values?.[cloneValueColumn?.id])
        .filter(Boolean);
      syncRatioGroup(target.ratio_parent_id, remainingRatios);
      if (ratioMenuRowId === target.ratio_parent_id) setSelectedRatios(remainingRatios);
      return;
    }
    const removedIds = new Set([rowId]);
    if (target?.ratio_group) rows.filter((row) => row.ratio_parent_id === rowId).forEach((row) => removedIds.add(row.id));
    const remainingRows = rows.filter((row) => !removedIds.has(row.id));
    const parentStillHasChildren = target?.ratio_parent_id && remainingRows.some((row) => row.ratio_parent_id === target.ratio_parent_id);
    saveList({
      rows: remainingRows.map((row, index) => row.id === target?.ratio_parent_id && !parentStillHasChildren
        ? { ...row, ratio_group: false, sort_order: index }
        : { ...row, sort_order: index }),
    });
  };

  const duplicateRow = (rowId) => {
    const sourceIndex = rows.findIndex((row) => row.id === rowId);
    if (sourceIndex < 0) return;
    const nextRows = rows.map((row, index) => ({ ...row, sort_order: index > sourceIndex ? index + 1 : index }));
    nextRows.push({ ...structuredClone(rows[sourceIndex]), id: uid(), number: nextAssetNumber(rows), sort_order: sourceIndex + 1 });
    saveList({ rows: nextRows.sort((a, b) => a.sort_order - b.sort_order) });
  };

  const dropRowGroup = (targetRowId) => {
    const draggedRow = rows.find((row) => row.id === dragRowId);
    const targetRow = rows.find((row) => row.id === targetRowId);
    const sourceRootId = draggedRow?.ratio_parent_id || draggedRow?.id;
    const targetRootId = targetRow?.ratio_parent_id || targetRow?.id;
    const sourceRoot = rows.find((row) => row.id === sourceRootId);
    const targetRoot = rows.find((row) => row.id === targetRootId);
    const sourceCategoryId = sourceRoot?.group_id ?? fallbackCategory.id;
    const targetCategoryId = targetRoot?.group_id ?? fallbackCategory.id;
    if (!sourceRoot || !targetRoot || sourceRootId === targetRootId || sourceCategoryId !== targetCategoryId) {
      setDragRowId('');
      setDragTargetRowId('');
      return;
    }

    const categoryRows = rows.filter((row) => (row.group_id ?? fallbackCategory.id) === sourceCategoryId);
    const rootRows = categoryRows.filter((row) => !row.ratio_parent_id);
    const blocks = rootRows.map((root) => [root, ...categoryRows.filter((row) => row.ratio_parent_id === root.id)]);
    const sourceIndex = blocks.findIndex((block) => block[0].id === sourceRootId);
    const targetIndex = blocks.findIndex((block) => block[0].id === targetRootId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [movedBlock] = blocks.splice(sourceIndex, 1);
    blocks.splice(blocks.findIndex((block) => block[0].id === targetRootId), 0, movedBlock);
    const reorderedCategoryRows = blocks.flat();
    let categoryIndex = 0;
    const nextRows = rows.map((row) => (row.group_id ?? fallbackCategory.id) === sourceCategoryId
      ? reorderedCategoryRows[categoryIndex++]
      : row).map((row, index) => ({ ...row, sort_order: index }));
    undoStackRef.current.push(structuredClone(activeList));
    updateAssetList(activeList.id, { rows: nextRows });
    markProjectEdited(project.id);
    setDragRowId('');
    setDragTargetRowId('');
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
        number: nextAssetNumber(nextRows),
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

  const cellColumnKey = (columnIndex) => {
    if (columnIndex === -1) return 'number';
    if (columnIndex === columns.length + NOTES_COLUMN_OFFSET) return 'notes';
    return columns[columnIndex]?.id ?? '';
  };

  const savedCellGroups = activeList?.filename_options?.cell_groups ?? [];

  const cellGroupDisplay = (rowId, columnKey) => {
    const group = savedCellGroups.find((item) => item.column_key === columnKey && item.row_ids?.includes(rowId));
    if (!group) return { className: '', group: null };
    const position = group.row_ids.indexOf(rowId);
    return {
      group,
      className: position === 0
        ? 'is-cell-group-start'
        : position === group.row_ids.length - 1
          ? 'is-cell-group-end'
          : 'is-cell-group-middle',
    };
  };

  const openCellGroupPrompt = (cells) => {
    if (cells.length < 2) return;
    const columnIndexes = [...new Set(cells.map((cell) => cell.columnIndex))];
    if (columnIndexes.length !== 1) return;
    const columnIndex = columnIndexes[0];
    if ([columns.length + FILENAME_COLUMN_OFFSET, columns.length + COPY_COLUMN_OFFSET].includes(columnIndex)) return;
    const columnKey = cellColumnKey(columnIndex);
    if (!columnKey) return;
    const rowIds = [...new Set(cells
      .sort((a, b) => a.rowIndex - b.rowIndex)
      .map((cell) => rows[cell.rowIndex]?.id)
      .filter(Boolean))];
    if (rowIds.length < 2) return;
    const selectedRows = rowIds.map((rowId) => rows.find((row) => row.id === rowId)).filter(Boolean);
    if (new Set(selectedRows.map((row) => row.group_id)).size !== 1) return;
    const existingGroup = savedCellGroups.find((group) => group.column_key === columnKey && rowIds.every((rowId) => group.row_ids?.includes(rowId)));
    setCellGroupPrompt({
      mode: existingGroup ? 'ungroup' : 'group',
      groupId: existingGroup?.id,
      columnKey,
      rowIds,
    });
  };

  const confirmCellGrouping = () => {
    if (!cellGroupPrompt) return;
    const nextGroups = cellGroupPrompt.mode === 'ungroup'
      ? savedCellGroups.filter((group) => group.id !== cellGroupPrompt.groupId)
      : [
        ...savedCellGroups.filter((group) => group.column_key !== cellGroupPrompt.columnKey || !group.row_ids?.some((rowId) => cellGroupPrompt.rowIds.includes(rowId))),
        { id: uid(), column_key: cellGroupPrompt.columnKey, row_ids: cellGroupPrompt.rowIds },
      ];
    saveList({
      filename_options: {
        ...(activeList.filename_options ?? {}),
        cell_groups: nextGroups,
      },
    });
    setSelectedCells([]);
    setSelectionAnchor(null);
    setCellGroupPrompt(null);
  };

  useEffect(() => {
    const onPointerUp = () => {
      if (selectionAnchor && selectedCells.length > 1) openCellGroupPrompt([...selectedCells]);
      setSelectionAnchor(null);
    };
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
        if (event.target?.closest?.('input:not([readonly]), textarea, [contenteditable="true"]')) return;
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

  if (!activeList) {
    return <div className="grid min-h-[60vh] place-items-center text-ink-500">Preparing asset list...</div>;
  }

  const filenameColumnIndex = columns.length + FILENAME_COLUMN_OFFSET;
  const copyColumnIndex = columns.length + COPY_COLUMN_OFFSET;
  const notesColumnIndex = columns.length + NOTES_COLUMN_OFFSET;
  const ratioPanelSource = rows.find((row) => row.id === ratioMenuRowId && !row.ratio_parent_id);
  const ratioPanelCategory = categories.find((category) => category.id === ratioPanelSource?.group_id);
  const ratioPanelIsStatic = ratioPanelCategory?.asset_kind === 'static';
  const ratioPanelColumn = ratioPanelIsStatic
    ? columns.find((column) => column.label_type === 'asset_static_size')
    : columns.find((column) => column.label_type === 'asset_ratio' || /^ratio$/i.test(column.name ?? ''));
  const mainAssetRatio = ratioPanelSource?.values?.[ratioPanelColumn?.id] ?? '';
  const availableRatioOptions = ratioPanelIsStatic
    ? [...new Set([...STATIC_COLUMNS.find((column) => column.label_type === 'asset_static_size').options, ...staticSizeLabels.map((label) => label.value)])]
    : [...new Set([...QUICK_RATIO_OPTIONS, ...ratioLabels.map((label) => label.value)])];
  const displayedCategories = categories.length
    ? categories
      .filter((category) => !category.parent_id)
      .flatMap((category) => [category, ...categories.filter((item) => item.parent_id === category.id)])
    : [];
  const compactColumnWidth = (width) => Math.max(52, Math.round(width * 0.7));
  const columnGridWidth = (column) => {
    if (isUniqueRatioColumn(column)) return 57;
    if (/^length$/i.test(column?.name ?? '')) return 52;
    if (column?.label_type === 'asset_ratio') return 67;
    if (/^name$/i.test(column?.name ?? '')) return compactColumnWidth(Number(column.width) || 240);
    if (column?.label_type === 'asset_static_type') {
      const videoAssetTypeColumn = columns.find((item) => item.label_type === 'asset_type');
      return videoAssetTypeColumn
        ? compactColumnWidth(autoFitColumnWidth(videoAssetTypeColumn))
        : compactColumnWidth(Number(column.width) || 180);
    }
    return compactColumnWidth(autoFitColumnWidth(column));
  };
  const categoryColumns = (category) => {
    const rootId = category.parent_id ?? category.id;
    const rootCategory = categories.find((item) => item.id === rootId) ?? category;
    const settings = rootCategory.column_settings ?? {};
    const orderIndex = new Map((rootCategory.column_order ?? []).map((columnId, index) => [columnId, index]));
    return columns
      .filter((column) => !column.category_id || column.category_id === rootId)
      .map((column) => ({ ...column, ...(settings[column.id] ?? {}) }))
      .sort((a, b) => {
        const aIndex = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.MAX_SAFE_INTEGER;
        const bIndex = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.MAX_SAFE_INTEGER;
        return aIndex - bIndex || (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
  };
  const visibleCategoryColumns = (category, isStatic) => categoryColumns(category).filter((column) => {
    if (column.hidden && !isUniqueRatioColumn(column)) return false;
    if (isStatic) {
      return isUniqueRatioColumn(column)
        || column.label_type === 'asset_static_type'
        || column.label_type === 'asset_static_size'
        || /^name$/i.test(column.name ?? '')
        || isFrameColumn(column)
        || (column.is_custom && column.category_id === (category.parent_id ?? category.id));
    }
    return !['asset_static_type', 'asset_static_size'].includes(column.label_type);
  });
  const gridTemplateForColumns = (beforeColumns, afterColumns) => `52px 88px 60px ${beforeColumns.map((column) => `${columnGridWidth(column)}px`).join(' ')} ${compactColumnWidth(filenameColumnWidth())}px 52px ${afterColumns.map((column) => `${columnGridWidth(column)}px`).join(' ')} ${notesColumnWidth()}px`;
  const defaultColumnHeader = (column, isStatic = false) => {
    const label = isStatic && column.label_type === 'asset_static_type'
      ? 'Asset Type'
      : isUniqueRatioColumn(column)
        ? 'Clones'
        : column.name;
    const normalized = label.toLowerCase();
    let HeaderIcon = null;
    if (normalized === 'clones') HeaderIcon = GitBranch;
    else if (normalized === 'asset type') HeaderIcon = Boxes;
    else if (normalized === 'name') HeaderIcon = Type;
    else if (normalized === 'length') HeaderIcon = Clock3;
    else if (normalized === 'ratio') HeaderIcon = Ratio;
    else if (normalized === 'size') HeaderIcon = Maximize2;
    else if (/frame\.?io/.test(normalized)) HeaderIcon = ExternalLink;
    return <span className="asset-header-label">{HeaderIcon && <HeaderIcon aria-hidden="true" />}{label}</span>;
  };
  const renderCategoryColumnHeader = (headerBeforeColumns, headerAfterColumns, gridTemplate, isStatic = false) => (
    <div className="asset-list-row asset-static-header grid" style={{ gridTemplateColumns: gridTemplate }}>
      <div className="asset-list-header locked" aria-label="Actions" />
      <div className="asset-list-header locked"><span className="asset-header-label"><CircleDot aria-hidden="true" />Status</span></div>
      <div className="asset-list-header locked"><span className="asset-header-label"><Hash aria-hidden="true" />Number</span></div>
      {headerBeforeColumns.map((column) => (
        <div key={column.id} className={`asset-list-header ${isUniqueRatioColumn(column) || /^length$/i.test(column.name ?? '') ? 'is-balanced-compact-header' : ''}`}>
          {!isCustomAssetColumn(column) ? (
            defaultColumnHeader(column, isStatic)
          ) : (
            <button type="button" className="asset-header-settings-name" onClick={() => setSettingsColumnId(column.id)} aria-label={`Open settings for ${column.name}`}>
              {column.name}
            </button>
          )}
          {!isStatic && !isFrameColumn(column) && (isCustomAssetColumn(column) || (!isUniqueRatioColumn(column) && !isCompactFixedColumn(column))) && (
            <button type="button" className="asset-column-resize-handle" onPointerDown={(event) => startColumnResize(event, column.id)} aria-label={`Resize ${column.name}`} />
          )}
        </div>
      ))}
      <div className="asset-list-header locked">
        <span className="asset-header-label"><FileText aria-hidden="true" />Filename</span>
        {!isStatic && <button type="button" className="asset-column-resize-handle" onPointerDown={startFilenameColumnResize} aria-label="Resize Filename column" />}
      </div>
      <div className="asset-list-header locked"><span className="asset-header-label"><Copy aria-hidden="true" />Copy</span></div>
      {headerAfterColumns.map((column) => (
        <div key={column.id} className={`asset-list-header ${isUniqueRatioColumn(column) || /^length$/i.test(column.name ?? '') ? 'is-balanced-compact-header' : ''}`}>
          {isCustomAssetColumn(column) ? (
            <button type="button" className="asset-header-settings-name" onClick={() => setSettingsColumnId(column.id)} aria-label={`Open settings for ${column.name}`}>
              {column.name}
            </button>
          ) : (
            defaultColumnHeader(column, isStatic)
          )}
          {!isStatic && !isFrameColumn(column) && <button type="button" className="asset-column-resize-handle" onPointerDown={(event) => startColumnResize(event, column.id)} aria-label={`Resize ${column.name}`} />}
        </div>
      ))}
      <div className="asset-list-header locked">
        <span className="asset-header-label"><StickyNote aria-hidden="true" />Notes</span>
        <button type="button" className="asset-column-resize-handle" onPointerDown={startNotesColumnResize} aria-label="Resize Notes column" />
      </div>
    </div>
  );

  return (
    <main className="asset-list-page flex h-[calc(100vh-7rem)] flex-col text-ink-950 dark:text-ink-100">
      <div className="asset-list-commandbar">
        <div className="asset-list-tabs">
          <button type="button" onClick={() => setCategoryKindPromptOpen(true)} className="asset-list-tool">
            <Plus size={15} /> Category
          </button>
        </div>
        <div className={`asset-list-tools ${categories.length ? '' : 'is-empty'}`}>
          <button
            type="button"
            onClick={() => setShowClones((current) => !current)}
            className={`asset-list-tool ${showClones ? 'is-active' : ''}`}
            aria-pressed={showClones}
            title={showClones ? 'Hide clone rows' : 'Show clone rows'}
          >
            {showClones ? <Eye size={15} /> : <EyeOff size={15} />}
            {showClones ? 'Hide clones' : 'Show clones'}
          </button>
          <button
            type="button"
            className="asset-list-tool"
            onClick={() => {
              setPrefixDraft(activeList.filename_options?.prefix_override ?? '');
              setPrefixSeparator(activeList.filename_options?.prefix_separator ?? activeList.global_separator ?? '_');
              setPrefixPopupOpen(true);
            }}
          >
            Filename prefix
          </button>
          <div className="asset-template-picker">
            <button type="button" onClick={() => setTemplateChooserOpen(true)}>
              <Plus size={13} /> Templates <ChevronDown size={13} />
            </button>
          </div>
          <span className="asset-list-autosave"><Check size={12} /> Autosaved</span>
          <span className="asset-list-tool-divider" />
          <label className="asset-list-toolbar-status">
            <span>Status</span>
            <select className={`asset-list-status status-${assetStatus.replace(/\s+/g, '-')}`} value={assetStatus} onChange={(event) => updateAssetStatus(event.target.value)}>
              {ASSET_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => downloadAssetListExcel(project, projectLists, 'all', clients)} className="asset-list-quiet-action"><Download size={15} /> Excel</button>
          <button type="button" onClick={publishAssetList} className={`asset-list-quiet-action ${assetPublished ? 'is-active' : ''}`}>
            {assetPublished ? 'Published' : 'Publish assetlist'}
          </button>
        </div>
      </div>

      <div className="asset-list-scroll flex-1 overflow-auto">
        <div className="min-w-max">
          {!categories.length && (
            <div className="asset-list-empty-start">
              <button type="button" onClick={() => setCategoryKindPromptOpen(true)} aria-label="Create first category" title="Create first category">
                <Plus size={20} />
              </button>
            </div>
          )}
          {displayedCategories.map((category) => {
            const parentCategory = category.parent_id ? categories.find((item) => item.id === category.parent_id) : null;
            if (parentCategory?.collapsed) return null;
            const groupRows = rows.filter((row) => (row.group_id ?? fallbackCategory.id) === category.id && (showClones || !row.ratio_parent_id));
            const isStaticCategory = category.asset_kind === 'static';
            const scopedVisibleColumns = visibleCategoryColumns(category, isStaticCategory);
            const categoryBeforeColumns = scopedVisibleColumns.filter((column) => !isFrameColumn(column));
            const categoryAfterColumns = scopedVisibleColumns.filter(isFrameColumn);
            const categoryGridTemplate = gridTemplateForColumns(categoryBeforeColumns, categoryAfterColumns);
            const mainCategoryId = category.parent_id ?? category.id;
            const mainCategory = category.parent_id ? parentCategory : category;
            const mainSubcategories = categories.filter((item) => item.parent_id === mainCategoryId);
            const isMainCategoryEnd = category.parent_id
              ? mainSubcategories.at(-1)?.id === category.id
              : mainCategory?.collapsed || mainSubcategories.length === 0;
            return (
              <div key={category.id} className={`asset-category-container ${category.parent_id ? 'is-subcategory' : ''}`}>
                <div
                  className={`asset-category-bar ${category.parent_id ? 'is-subcategory' : ''} ${dragTargetCategoryId === category.id ? 'is-category-drop-target' : ''}`}
                  onDragOver={(event) => {
                    const source = categories.find((item) => item.id === dragCategoryId);
                    if (!source || (source.parent_id ?? null) !== (category.parent_id ?? null)) return;
                    event.preventDefault();
                    setDragTargetCategoryId(category.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    dropCategory(category.id);
                  }}
                >
                  <button
                    type="button"
                    draggable
                    className="asset-header-icon asset-category-drag-handle"
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', category.id);
                      setDragCategoryId(category.id);
                    }}
                    onDragEnd={() => {
                      setDragCategoryId('');
                      setDragTargetCategoryId('');
                    }}
                    aria-label={`Reorder ${category.name}`}
                    data-tooltip="Drag category"
                  >
                    <GripVertical size={12} />
                  </button>
                  {categories.length > 0 && (
                    <button type="button" onClick={() => deleteCategory(category.id)} className="asset-header-icon" data-tooltip="Delete category" aria-label="Delete category"><Trash2 size={12} /></button>
                  )}
                  <button type="button" onClick={() => updateCategory(category.id, { collapsed: !category.collapsed })} className="icon-button !h-7 !w-7">
                    {category.collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                  </button>
                  <div className="asset-category-title">
                    {!category.parent_id && (
                      <span className={`asset-category-type-label is-${isStaticCategory ? 'static' : 'video'}`}>
                        {isStaticCategory ? 'Static' : 'Video'}
                      </span>
                    )}
                    <input
                      className="asset-category-name"
                      value={category.name}
                      onChange={(event) => updateCategory(category.id, { name: event.target.value })}
                    />
                  </div>
                </div>
                {!category.parent_id && (
                  <div className="asset-subcategory-action-row">
                    <div className="asset-category-header-tools">
                      <button type="button" onClick={() => addColumn(category.id)} className="asset-list-tool is-primary"><Plus size={12} /> Column</button>
                      <button type="button" onClick={() => addRowToCategory(category.id)} className="asset-list-tool"><Plus size={12} /> Asset</button>
                      <button type="button" onClick={() => { setOrderCategoryId(category.id); setOrderPopupOpen(true); }} className="asset-list-tool"><Menu size={12} /> Columns</button>
                      {isAdmin && <button type="button" onClick={() => saveCategoryAsTemplate(category.id)} className="asset-list-tool asset-save-category-template"><Plus size={12} /> Save as template</button>}
                    </div>
                  </div>
                )}
                <div className="asset-category-body">
                {!category.collapsed && !category.container_only && renderCategoryColumnHeader(categoryBeforeColumns, categoryAfterColumns, categoryGridTemplate, isStaticCategory)}
                {!category.collapsed && groupRows.map((row) => {
                  const absoluteRowIndex = rows.findIndex((item) => item.id === row.id);
                  return (
                    <div
                      key={row.id}
                      className={`asset-list-row grid border-b border-black/5 bg-white dark:border-white/5 dark:bg-ink-950 ${row.ratio_group ? 'is-ratio-group-parent' : ''} ${row.ratio_parent_id ? 'is-ratio-group-child' : ''} ${dragTargetRowId === row.id ? 'is-row-drop-target' : ''}`}
                      style={{ gridTemplateColumns: categoryGridTemplate }}
                      onDragOver={(event) => {
                        if (!dragRowId || row.ratio_parent_id) return;
                        event.preventDefault();
                        setDragTargetRowId(row.id);
                      }}
                      onDrop={(event) => {
                        if (row.ratio_parent_id) return;
                        event.preventDefault();
                        dropRowGroup(row.id);
                      }}
                    >
                      <div className="asset-row-actions">
                        {!row.ratio_parent_id && (
                          <button
                            type="button"
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('text/plain', row.id);
                              setDragRowId(row.id);
                            }}
                            onDragEnd={() => {
                              setDragRowId('');
                              setDragTargetRowId('');
                            }}
                            className="asset-header-icon asset-row-drag-handle"
                            data-tooltip="Drag row"
                            aria-label="Drag row"
                          >
                            <GripVertical size={11} />
                          </button>
                        )}
                        {!row.ratio_parent_id && <button type="button" onClick={() => duplicateRow(row.id)} className="asset-header-icon" data-tooltip="Duplicate" aria-label="Duplicate row"><Copy size={11} /></button>}
                        <button type="button" onClick={() => deleteRow(row.id)} className="asset-header-icon" data-tooltip="Delete" aria-label="Delete row"><Trash2 size={11} /></button>
                      </div>
                      <div className="asset-cell">
                        <LabelDropdown
                          id={`${row.id}:asset-status`}
                          value={row.asset_status ?? ''}
                          options={ASSET_ROW_STATUS_OPTIONS}
                          onChange={(value) => updateRow(row.id, { asset_status: value })}
                          openDropdownId={openDropdownId}
                          setOpenDropdownId={setOpenDropdownId}
                        />
                      </div>
                      <div className={`asset-cell ${isVisuallySelected(absoluteRowIndex, -1) ? 'copy-cell-selected' : ''} ${cellGroupDisplay(row.id, 'number').className}`} data-asset-row={absoluteRowIndex} data-asset-column="-1" {...cellSelectionProps(absoluteRowIndex, -1)}>
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
                      {categoryBeforeColumns.map((column) => {
                        const columnIndex = columns.findIndex((item) => item.id === column.id);
                        const isUniqueRatioColumn = column.label_type === 'asset_unique_ratio' || /^(unique\s*\/\s*ratio|clones)$/i.test(column.name ?? '');
                        const isRatioColumn = column.label_type === 'asset_ratio' || /^ratio$/i.test(column.name ?? '');
                        const isAssetTypeColumn = column.label_type === 'asset_type' || /^asset\s*type$/i.test(column.name ?? '');
                        const isStaticAssetTypeColumn = column.label_type === 'asset_static_type';
                        const isStaticSizeColumn = column.label_type === 'asset_static_size';
                        const isBranchColumn = isAssetTypeColumn || isStaticAssetTypeColumn;
                        const isNameColumn = /^name$/i.test(column.name ?? '');
                        const isRatioSharedColumn = !isUniqueRatioColumn && !isRatioColumn;
                        const selected = isVisuallySelected(absoluteRowIndex, columnIndex, selectedCell?.rowId === row.id && selectedCell?.columnId === column.id);
                        const value = row.values?.[column.id] ?? '';
                        return (
                          <div
                            key={column.id}
                            data-asset-row={absoluteRowIndex}
                            data-asset-column={columnIndex}
                            className={`asset-cell copy-cell ${selected ? 'copy-cell-selected' : ''} ${cellGroupDisplay(row.id, column.id).className} ${isRatioSharedColumn && row.ratio_group ? 'is-ratio-shared-parent' : ''} ${isRatioSharedColumn && row.ratio_parent_id ? 'is-ratio-shared-child' : ''} ${isBranchColumn && row.ratio_parent_id ? 'is-ratio-branch-cell' : ''}`}
                            {...cellSelectionProps(absoluteRowIndex, columnIndex, row.id, column.id)}
                            onCopy={(event) => {
                              event.preventDefault();
                              copySelectedCells(event, absoluteRowIndex, columnIndex, row.values?.[column.id] ?? '');
                            }}
                            onPaste={(event) => pasteCells(event, absoluteRowIndex, columnIndex)}
                          >
                            {column.type === 'text' || column.type === 'number' || column.type === 'length' || column.type === 'url' ? (
                              <div className="asset-link-cell">
                                <input
                                  className="table-input"
                                  inputMode={column.type === 'length' || column.type === 'number' ? 'decimal' : undefined}
                                  value={isNameColumn ? undefined : value}
                                  defaultValue={isNameColumn ? value : undefined}
                                  onChange={(event) => {
                                    if (isNameColumn) return;
                                    updateCell(row.id, column.id, column.type === 'length' || column.type === 'number' ? event.target.value.replace(/[^\d.-]/g, '') : event.target.value);
                                  }}
                                  onBlur={(event) => {
                                    if (isNameColumn && event.currentTarget.value !== value) {
                                      updateCell(row.id, column.id, event.currentTarget.value);
                                    }
                                  }}
                                  onFocus={() => setSelectedCell({ rowId: row.id, columnId: column.id })}
                                  onKeyDown={(event) => {
                                    if (moveCellFocus(event, absoluteRowIndex, columnIndex)) return;
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      focusCellBelow(absoluteRowIndex, columnIndex);
                                    }
                                  }}
                                  placeholder={column.type === 'url' ? 'Frame.io link' : undefined}
                                />
                                {column.type === 'url' && value && (
                                  <a className="asset-open-link" href={linkHref(value)} target="_blank" rel="noreferrer" aria-label="Open Frame.io link" onClick={(event) => event.stopPropagation()}>
                                    <ExternalLink size={13} />
                                  </a>
                                )}
                              </div>
                            ) : (column.label_type === 'asset_unique_ratio' || /^(unique\s*\/\s*ratio|clones)$/i.test(column.name ?? '')) ? (
                              <div className="asset-unique-ratio-control">
                                {row.ratio_parent_id ? (
                                  <span className="asset-ratio-child-spacer" aria-hidden="true" />
                                ) : (
                                  <button
                                    type="button"
                                    className={`asset-ratio-launcher ${ratioMenuRowId === row.id ? 'is-open' : ''}`}
                                    onClick={() => ratioMenuRowId === row.id ? setRatioMenuRowId('') : openRatioPanel(row.id)}
                                    aria-expanded={ratioMenuRowId === row.id}
                                    aria-label={isStaticCategory ? 'Manage additional static sizes' : 'Manage additional ratios'}
                                  >
                                    <strong>R</strong><ArrowRight size={13} />
                                  </button>
                                )}
                              </div>
                            ) : isRatioColumn && row.ratio_parent_id ? (
                              <span className="asset-ratio-child-label">{row.ratio_value || value}</span>
                            ) : isBranchColumn && row.ratio_parent_id ? (
                              <span className="asset-ratio-branch" aria-label="Ratio variant" />
                            ) : isAssetTypeColumn ? (
                              <div className="asset-type-label-select">
                                <LabelSelect
                                  labels={assetTypeLabels}
                                  value={assetTypeLabels.find((label) => label.value === value)?.id ?? ''}
                                  allowClear
                                  placeholder={<span className="asset-label-chip is-none">None</span>}
                                  onChange={(labelId) => updateCell(row.id, column.id, assetTypeLabels.find((label) => label.id === labelId)?.value ?? '')}
                                  onAddLabel={(labelValue, color) => addLabel(project.id, 'asset_type', labelValue, color)}
                                  onDeleteLabel={deleteLabel}
                                />
                              </div>
                            ) : isStaticAssetTypeColumn || isStaticSizeColumn ? (
                              <div className="asset-type-label-select">
                                <LabelSelect
                                  labels={isStaticAssetTypeColumn ? staticAssetTypeLabels : staticSizeLabels}
                                  value={(isStaticAssetTypeColumn ? staticAssetTypeLabels : staticSizeLabels).find((label) => label.value === value)?.id ?? ''}
                                  allowClear
                                  placeholder={<span className="asset-label-chip is-none">None</span>}
                                  onChange={(labelId) => updateCell(row.id, column.id, (isStaticAssetTypeColumn ? staticAssetTypeLabels : staticSizeLabels).find((label) => label.id === labelId)?.value ?? '')}
                                  onAddLabel={(labelValue, color) => addLabel(project.id, isStaticAssetTypeColumn ? 'asset_static_type' : 'asset_static_size', labelValue, color)}
                                  onDeleteLabel={deleteLabel}
                                />
                              </div>
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
                        className={`asset-cell bg-zinc-50 text-ink-600 dark:bg-white/[0.035] dark:text-ink-300 ${isVisuallySelected(absoluteRowIndex, filenameColumnIndex) ? 'copy-cell-selected' : ''}`}
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
                      {categoryAfterColumns.map((column) => {
                        const columnIndex = columns.findIndex((item) => item.id === column.id);
                        const selected = isVisuallySelected(absoluteRowIndex, columnIndex, selectedCell?.rowId === row.id && selectedCell?.columnId === column.id);
                        const value = row.values?.[column.id] ?? '';
                        return (
                          <div
                            key={column.id}
                            data-asset-row={absoluteRowIndex}
                            data-asset-column={columnIndex}
                            className={`asset-cell copy-cell ${selected ? 'copy-cell-selected' : ''} ${cellGroupDisplay(row.id, column.id).className}`}
                            {...cellSelectionProps(absoluteRowIndex, columnIndex, row.id, column.id)}
                            onCopy={(event) => {
                              event.preventDefault();
                              copySelectedCells(event, absoluteRowIndex, columnIndex, row.values?.[column.id] ?? '');
                            }}
                            onPaste={(event) => pasteCells(event, absoluteRowIndex, columnIndex)}
                          >
                            <div className="asset-frame-link-actions">
                              {value ? (
                                <>
                                  {isValidFramePreviewLink(value) ? (
                                    <a className="asset-frame-link-main is-preview" href={linkHref(value)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                                      Preview
                                    </a>
                                  ) : (
                                    <button type="button" className="asset-frame-link-main is-invalid" onClick={(event) => { event.stopPropagation(); openFrameLinkPopup(row.id, column.id, value); }}>
                                      Invalid preview link
                                    </button>
                                  )}
                                  <button type="button" className="asset-frame-link-mini" onClick={(event) => { event.stopPropagation(); openFrameLinkPopup(row.id, column.id, value); }} aria-label="Update Frame.io link" title="Update link">U</button>
                                  <button type="button" className="asset-frame-link-mini" onClick={(event) => { event.stopPropagation(); navigator.clipboard?.writeText(value); }} aria-label="Copy Frame.io link" title="Copy link">C</button>
                                </>
                              ) : (
                                <button type="button" className="asset-frame-link-main is-add" onClick={(event) => { event.stopPropagation(); openFrameLinkPopup(row.id, column.id); }}>
                                  <Plus size={12} /> Add link
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div
                        className={`asset-cell copy-cell ${isVisuallySelected(absoluteRowIndex, notesColumnIndex, selectedCell?.rowId === row.id && selectedCell?.columnId === 'notes') ? 'copy-cell-selected' : ''} ${cellGroupDisplay(row.id, 'notes').className}`}
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
                          defaultValue={row.notes ?? ''}
                          onBlur={(event) => {
                            if (event.currentTarget.value !== (row.notes ?? '')) {
                              updateRow(row.id, { notes: event.currentTarget.value });
                            }
                          }}
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
                {!category.collapsed && !category.container_only && !groupRows.length && <p className="px-4 py-3 text-sm text-ink-500">No assets added yet.</p>}
                {!category.collapsed && !category.container_only && (
                  <div className="asset-category-empty-actions">
                    <button type="button" onClick={() => addRowToCategory(category.id)} className="asset-add-row-button">
                      <Plus size={14} /> Asset
                    </button>
                    {!category.parent_id && !groupRows.length && (
                      <button type="button" onClick={() => updateCategory(category.id, { container_only: true })} className="asset-add-row-button">
                        <Plus size={14} /> Container
                      </button>
                    )}
                  </div>
                )}
                </div>
                {isMainCategoryEnd && (
                  <div className="asset-main-category-footer">
                    <button
                      type="button"
                      onClick={() => addSubcategory(mainCategoryId)}
                      className="asset-add-subcategory"
                    >
                      <Plus size={12} /> Subcategory
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {ratioPanelSource && (
        <aside className="asset-ratio-drawer" role="dialog" aria-label={ratioPanelIsStatic ? 'Manage additional static sizes' : 'Manage additional ratios'}>
          <header>
            <div>
              <span>{ratioPanelIsStatic ? 'Additional static sizes' : 'Additional ratios'}</span>
              <strong>Asset {ratioPanelSource.number}</strong>
            </div>
            <button type="button" onClick={() => setRatioMenuRowId('')} aria-label={ratioPanelIsStatic ? 'Close static sizes panel' : 'Close ratios panel'}><X size={16} /></button>
          </header>
          <div className="asset-ratio-drawer-summary">
            <span>{ratioPanelIsStatic ? 'Main asset size' : 'Main asset ratio'}</span>
            <strong>{mainAssetRatio || 'Not selected'}</strong>
          </div>
          <p>Selecting a {ratioPanelIsStatic ? 'size' : 'ratio'} creates a numbered row directly below the main asset. Deselecting it removes that row.</p>
          <form
            className="asset-ratio-drawer-add"
            onSubmit={(event) => {
              event.preventDefault();
              if (ratioPanelIsStatic) addProjectStaticSize(ratioPanelSource.id);
              else addProjectRatio(ratioPanelSource.id);
            }}
          >
            <input
              value={ratioPanelIsStatic ? customStaticSizeDraft : customRatioDraft}
              onChange={(event) => ratioPanelIsStatic ? setCustomStaticSizeDraft(event.target.value) : setCustomRatioDraft(event.target.value)}
              placeholder={ratioPanelIsStatic ? 'Add project size, e.g. 400x500' : 'Add custom ratio, e.g. 5x4'}
              aria-label={ratioPanelIsStatic ? 'Add a project-specific static size' : 'Add a project-specific ratio'}
            />
            <button type="submit" disabled={!(ratioPanelIsStatic ? customStaticSizeDraft : customRatioDraft).trim()}><Plus size={14} /> Add</button>
          </form>
          <div className="asset-ratio-drawer-options">
            {availableRatioOptions.map((ratio) => {
              const ratioSelected = selectedRatios.includes(ratio);
              const isMainRatio = Boolean(mainAssetRatio) && ratio.toLowerCase() === String(mainAssetRatio).toLowerCase();
              const disabled = isMainRatio && !ratioSelected;
              return (
                <button
                  key={ratio}
                  type="button"
                  className={`${ratioSelected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}
                  onClick={() => !disabled && toggleRatioForRow(ratioPanelSource.id, ratio)}
                  aria-pressed={ratioSelected}
                  disabled={disabled}
                >
                  <span className="asset-ratio-checkbox">{ratioSelected && <Check size={13} />}</span>
                  <span>{ratio}</span>
                  {isMainRatio && <small>Main asset</small>}
                </button>
              );
            })}
          </div>
          <footer>{selectedRatios.length} additional {ratioPanelIsStatic ? (selectedRatios.length === 1 ? 'size' : 'sizes') : (selectedRatios.length === 1 ? 'ratio' : 'ratios')} created</footer>
        </aside>
      )}

      {cellGroupPrompt && (
        <div className="fixed inset-0 z-[4000] grid place-items-center bg-black/60 p-5" onMouseDown={() => setCellGroupPrompt(null)}>
          <div className="asset-cell-group-popup" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>{cellGroupPrompt.mode === 'ungroup' ? 'Ungroup cells' : 'Group cells'}</h2>
                <p>
                  {cellGroupPrompt.mode === 'ungroup'
                    ? 'Separate these cells again and restore their individual values.'
                    : `Combine ${cellGroupPrompt.rowIds.length} selected cells. The first value stays visible and all individual values are preserved.`}
                </p>
              </div>
              <button type="button" className="icon-button" onClick={() => setCellGroupPrompt(null)} aria-label="Close"><X size={16} /></button>
            </header>
            <footer>
              <button type="button" className="secondary-button" onClick={() => setCellGroupPrompt(null)}>Cancel</button>
              <button type="button" className="primary-button" onClick={confirmCellGrouping}>
                {cellGroupPrompt.mode === 'ungroup' ? 'Ungroup' : 'Group cells'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {categoryKindPromptOpen && (
        <div className="fixed inset-0 z-[4000] grid place-items-center bg-black/60 p-5" onMouseDown={() => setCategoryKindPromptOpen(false)}>
          <div className="asset-category-kind-popup" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>Create category</h2>
                <p>Choose which kind of asset list this category uses.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setCategoryKindPromptOpen(false)} aria-label="Close category type chooser"><X size={16} /></button>
            </header>
            <div className="asset-category-kind-choices">
              <button type="button" onClick={() => addCategory('video')}>
                <strong>Video</strong>
                <span>Video assets, lengths, ratios and Frame.io links</span>
              </button>
              <button type="button" onClick={() => addCategory('static')}>
                <strong>Static</strong>
                <span>Static assets, sizes and Frame.io links</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {templateChooserOpen && (
        <div className="fixed inset-0 z-[4000] grid place-items-center bg-black/60 p-5" onMouseDown={() => setTemplateChooserOpen(false)}>
          <div className="asset-template-save-popup asset-template-category-popup" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>Add template category</h2>
                <p>Select a saved category setup. It will be added without changing the existing list.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setTemplateChooserOpen(false)} aria-label="Close"><X size={16} /></button>
            </header>
            <div className="asset-template-category-options">
              {categoryTemplateOptions.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={selectedCategoryTemplateId === option.id ? 'is-active' : ''}
                  onClick={() => setSelectedCategoryTemplateId(option.id)}
                >
                  <span className={`asset-category-type-label is-${option.category.asset_kind === 'static' ? 'static' : 'video'}`}>
                    {option.category.asset_kind === 'static' ? 'Static' : 'Video'}
                  </span>
                  <strong>{option.label}</strong>
                </button>
              ))}
            </div>
            <footer>
              <button type="button" className="secondary-button" onClick={() => setTemplateChooserOpen(false)}>Cancel</button>
              <button type="button" className="primary-button" disabled={!selectedCategoryTemplateId} onClick={addCategoryFromTemplate}>
                <Plus size={15} /> Add category
              </button>
            </footer>
          </div>
        </div>
      )}

      {templatePopupOpen && (
        <div className="fixed inset-0 z-[4000] grid place-items-center bg-black/60 p-5" onMouseDown={() => setTemplatePopupOpen(false)}>
          <div className="asset-template-save-popup" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>Save category template</h2>
                <p>Save this category’s column setup as a new template or update an existing one.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setTemplatePopupOpen(false)} aria-label="Close"><X size={16} /></button>
            </header>
            <div className="asset-template-save-modes">
              <button type="button" className={templateSaveMode === 'new' ? 'is-active' : ''} onClick={() => {
                const sourceCategory = categories.find((category) => category.id === templateSourceCategoryId);
                setTemplateSaveMode('new');
                setTemplateUpdateId('');
                setTemplateNameDraft(sourceCategory?.name || 'Category template');
              }}>
                <Plus size={14} /> New template
              </button>
              <button type="button" className={templateSaveMode === 'update' ? 'is-active' : ''} disabled={!savedCategoryTemplates.length} onClick={() => {
                const firstTemplate = savedCategoryTemplates[0];
                setTemplateSaveMode('update');
                setTemplateUpdateId(firstTemplate?.id ?? '');
                setTemplateNameDraft(firstTemplate?.name ?? '');
              }}>
                Update existing
              </button>
            </div>
            {templateSaveMode === 'update' && (
              <label>
                <span>Existing template</span>
                <select value={templateUpdateId} onChange={(event) => {
                  const template = assetListTemplates.find((item) => item.id === event.target.value);
                  setTemplateUpdateId(event.target.value);
                  setTemplateNameDraft(template?.name ?? '');
                }}>
                  {savedCategoryTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </label>
            )}
            <label>
              <span>Template name</span>
              <input value={templateNameDraft} onChange={(event) => setTemplateNameDraft(event.target.value)} autoFocus />
            </label>
            {templateSaveMode === 'update' && <p className="asset-template-overwrite-note">The selected template will be overwritten for all users.</p>}
            <footer>
              <button type="button" className="secondary-button" onClick={() => setTemplatePopupOpen(false)}>Cancel</button>
              <button type="button" className="primary-button" disabled={!templateNameDraft.trim() || (templateSaveMode === 'update' && !templateUpdateId)} onClick={confirmSaveCategoryAsTemplate}>
                {templateSaveMode === 'update' ? 'Update template' : 'Save template'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {frameLinkPopup && (
        <div className="fixed inset-0 z-[4000] grid place-items-center bg-black/60 p-5" onMouseDown={() => setFrameLinkPopup(null)}>
          <div className="asset-frame-link-popup" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>{frameLinkDraft ? 'Update Frame.io link' : 'Add Frame.io link'}</h2>
                <p>Paste the link for this asset below.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setFrameLinkPopup(null)} aria-label="Close"><X size={16} /></button>
            </header>
            <label>
              <span>Frame.io link</span>
              <small className="asset-frame-link-requirement">Only links starting with <strong>https://f.io/</strong> can be added.</small>
              <input
                value={frameLinkDraft}
                onChange={(event) => setFrameLinkDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    saveFrameLink();
                  }
                }}
                placeholder="https://frame.io/..."
                autoFocus
              />
              {frameLinkDraft.trim() && !isValidFramePreviewLink(frameLinkDraft) && (
                <small className="asset-frame-link-error">Not a valid Frame.io preview link. The URL must start with https://f.io/</small>
              )}
            </label>
            <footer>
              <button type="button" className="secondary-button" onClick={() => setFrameLinkPopup(null)}>Cancel</button>
              <button type="button" className="primary-button" disabled={!isValidFramePreviewLink(frameLinkDraft)} onClick={saveFrameLink}>Save link</button>
            </footer>
          </div>
        </div>
      )}

      {prefixPopupOpen && (
        <div className="fixed inset-0 z-[4000] grid place-items-center bg-black/60 p-5" onMouseDown={() => setPrefixPopupOpen(false)}>
          <div className="asset-prefix-popup" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>Filename prefix</h2>
                <p>Replace project number, client abbreviation, and project name with custom text.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setPrefixPopupOpen(false)} aria-label="Close"><X size={16} /></button>
            </header>
            <label>
              <span>Custom prefix</span>
              <input value={prefixDraft} onChange={(event) => setPrefixDraft(event.target.value)} placeholder="Enter filename prefix" autoFocus />
            </label>
            <div className="asset-prefix-separators">
              <span>Divider for blank spaces</span>
              <div>
                {[
                  { value: '-', label: 'Hyphen', symbol: '-' },
                  { value: '_', label: 'Underscore', symbol: '_' },
                  { value: ' ', label: 'Blank space', symbol: 'Blank' },
                ].map((separator) => (
                  <button
                    key={separator.label}
                    type="button"
                    className={prefixSeparator === separator.value ? 'is-active' : ''}
                    onClick={() => setPrefixSeparator(separator.value)}
                    aria-pressed={prefixSeparator === separator.value}
                    title={separator.label}
                  >
                    {separator.symbol}
                  </button>
                ))}
              </div>
            </div>
            <div className="asset-prefix-preview">
              <span>Current project prefix</span>
              <strong>{[project.project_number, projectClientCode(project, clients), project.name].filter(Boolean).join(activeList.global_separator || '_')}</strong>
            </div>
            <footer>
              <button
                type="button"
                className="asset-prefix-project-button"
                onClick={() => {
                  saveList({ filename_options: { ...(activeList.filename_options ?? {}), prefix_override: '' } });
                  setPrefixPopupOpen(false);
                }}
              >
                <Plus size={14} /> Use project code/name
              </button>
              <button type="button" className="secondary-button" onClick={() => setPrefixPopupOpen(false)}>Cancel</button>
              <button
                type="button"
                className="primary-button"
                disabled={!prefixDraft.trim()}
                onClick={() => {
                  saveList({ filename_options: { ...(activeList.filename_options ?? {}), prefix_override: prefixDraft.trim(), prefix_separator: prefixSeparator } });
                  setPrefixPopupOpen(false);
                }}
              >
                Save prefix
              </button>
            </footer>
          </div>
        </div>
      )}

      {settingsColumn && (
        <SettingsPanel
          column={settingsColumn}
          globalOptions={globalOptions}
          existingNames={columns.filter((column) => column.id !== settingsColumn.id).map((column) => column.name)}
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
          columns={categoryColumns(categories.find((category) => category.id === orderCategoryId) ?? fallbackCategory)}
          onClose={() => { setOrderPopupOpen(false); setOrderCategoryId(''); }}
          onReorder={(nextColumns) => {
            const category = categories.find((item) => item.id === orderCategoryId);
            if (!category) return;
            updateCategory(category.id, {
              column_order: nextColumns.map((column) => column.id),
              column_settings: Object.fromEntries(nextColumns.map((column) => [column.id, {
                hidden: Boolean(column.hidden),
                publish_to_client: column.publish_to_client !== false,
              }])),
            });
          }}
        />
      )}
    </main>
  );
}
