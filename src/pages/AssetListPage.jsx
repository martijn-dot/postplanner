import { Check, Copy, Download, FileSpreadsheet, GripVertical, Plus, Settings, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlanner } from '../context/PlannerContext.jsx';
import { downloadAssetListExcel } from '../lib/exportExcel.js';

const PREDEFINED_OPTIONS = {
  Platform: ['tv', 'online', 'social', 'display', 'dooh'],
  Format: ['16x9', '9x16', '1x1', '4x5'],
  Language: ['nl', 'en', 'fr', 'de'],
  Status: ['draft', 'review', 'approved', 'final'],
  Version: ['v01', 'v02', 'v03', 'final'],
};

const SETUP_TEMPLATES = {
  'Social deliverables': [
    { name: 'Platform', type: 'dropdown', options: PREDEFINED_OPTIONS.Platform, width: 150 },
    { name: 'Format', type: 'dropdown', options: PREDEFINED_OPTIONS.Format, width: 140 },
    { name: 'Language', type: 'dropdown', options: PREDEFINED_OPTIONS.Language, width: 140 },
    { name: 'Version', type: 'dropdown', options: PREDEFINED_OPTIONS.Version, width: 140 },
  ],
  'Video masters': [
    { name: 'Asset type', type: 'dropdown', options: ['master', 'cutdown', 'bumper', 'trailer'], width: 180 },
    { name: 'Duration', type: 'dropdown', options: ['06s', '10s', '15s', '30s', '60s'], width: 140 },
    { name: 'Language', type: 'dropdown', options: PREDEFINED_OPTIONS.Language, width: 140 },
    { name: 'Version', type: 'dropdown', options: PREDEFINED_OPTIONS.Version, width: 140 },
  ],
  'Display banners': [
    { name: 'Platform', type: 'dropdown', options: ['google', 'meta', 'programmatic'], width: 150 },
    { name: 'Size', type: 'custom-dropdown', options: ['300x250', '728x90', '1080x1080', '1080x1920'], width: 150 },
    { name: 'Language', type: 'dropdown', options: PREDEFINED_OPTIONS.Language, width: 140 },
    { name: 'Version', type: 'dropdown', options: PREDEFINED_OPTIONS.Version, width: 140 },
  ],
};

const SEPARATORS = ['-', '_', '.', ' '];

function uid() {
  return crypto.randomUUID();
}

function orderedColumns(list) {
  return [...(list?.columns ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function orderedRows(list) {
  return [...(list?.rows ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
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
    .map((column) => ({ value: String(row.values?.[column.id] ?? '').trim(), separator: column.separator || list.global_separator || '-' }))
    .filter((part) => part.value);
  const parts = [
    ...baseParts.map((value) => ({ value, separator: list.global_separator || '-' })),
    ...rowParts,
  ];
  const joined = parts.reduce((output, part, index) => {
    if (index === 0) return part.value;
    return `${output}${parts[index - 1]?.separator || list.global_separator || '-'}${part.value}`;
  }, '');
  return applyFilenameOptions(joined, list.filename_options);
}

function updateRowsForColumn(rows, columnId, fallback = '') {
  return rows.map((row) => ({
    ...row,
    values: { ...(row.values ?? {}), [columnId]: row.values?.[columnId] ?? fallback },
  }));
}

function SettingsPanel({ column, onClose, onSave, onDelete }) {
  const [name, setName] = useState(column.name);
  const [type, setType] = useState(column.type ?? 'text');
  const [template, setTemplate] = useState('');
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
              <option value="dropdown">Pre-defined dropdown</option>
              <option value="custom-dropdown">Custom dropdown</option>
            </select>
          </label>
          {type === 'dropdown' && (
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase text-ink-500">Template</span>
              <select
                className="field"
                value={template}
                onChange={(event) => {
                  setTemplate(event.target.value);
                  setOptionsText((PREDEFINED_OPTIONS[event.target.value] ?? []).join('\n'));
                }}
              >
                <option value="">Choose template</option>
                {Object.keys(PREDEFINED_OPTIONS).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          )}
          {type !== 'text' && (
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
        </div>
        <div className="mt-5 flex justify-between gap-2">
          <button type="button" onClick={onDelete} className="secondary-button text-red-300"><Trash2 size={16} /> Delete</button>
          <button
            type="button"
            onClick={() => onSave({ ...column, name: name.trim() || column.name, type, options })}
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

  const addRow = () => {
    const nextRow = {
      id: uid(),
      number: String(rows.length + 1).padStart(2, '0'),
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
    }));
    const nextRows = rows.length
      ? rows.map((row) => ({ ...row, values: Object.fromEntries(nextColumns.map((column) => [column.id, ''])) }))
      : Array.from({ length: 8 }, (_, index) => ({
        id: uid(),
        number: String(index + 1).padStart(2, '0'),
        values: Object.fromEntries(nextColumns.map((column) => [column.id, ''])),
        sort_order: index,
      }));
    saveList({ columns: nextColumns, rows: nextRows });
  };

  const updateCell = (rowId, columnId, value) => {
    saveList({
      rows: rows.map((row) => row.id === rowId ? { ...row, values: { ...(row.values ?? {}), [columnId]: value } } : row),
    });
  };

  const updateNumber = (rowId, value) => {
    saveList({ rows: rows.map((row) => row.id === rowId ? { ...row, number: value } : row) });
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
              <select className="field !w-20 !py-2" value={activeList.global_separator ?? '-'} onChange={(event) => saveList({ global_separator: event.target.value })}>
                {SEPARATORS.map((item) => <option key={item} value={item}>{item === ' ' ? 'space' : item}</option>)}
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
        <select className="field !w-52 !py-2" value={setupTemplate} onChange={(event) => setSetupTemplate(event.target.value)}>
          <option value="">Setup template</option>
          {Object.keys(SETUP_TEMPLATES).map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <button type="button" onClick={applySetupTemplate} disabled={!setupTemplate} className="secondary-button">Apply</button>
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
                className={`asset-list-header ${dropColumnId === column.id ? 'is-drop-target' : ''}`}
                draggable
                onDragStart={() => setDragColumnId(column.id)}
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
                <GripVertical size={15} className="shrink-0 text-ink-400" />
                <span className="font-mono text-[0.65rem] text-ink-500">::</span>
                <span className="truncate">{column.name}</span>
                <select
                  className="asset-separator-select"
                  value={column.separator ?? ''}
                  onChange={(event) => saveColumns(columns.map((item) => item.id === column.id ? { ...item, separator: event.target.value || null } : item))}
                  title="Separator after this column"
                >
                  <option value="">global</option>
                  {SEPARATORS.map((item) => <option key={item} value={item}>{item === ' ' ? 'space' : item}</option>)}
                </select>
                <button type="button" onClick={() => setSettingsColumnId(column.id)} className="icon-button !h-7 !w-7" aria-label="Column settings"><Settings size={14} /></button>
                <button type="button" onPointerDown={(event) => resizeColumn(event, column)} className="asset-resize-handle" aria-label="Resize column" />
              </div>
            ))}
            <div className="asset-list-header locked">Filename</div>
          </div>

          {rows.map((row, rowIndex) => (
            <div key={row.id} className="asset-list-row grid border-b border-black/5 bg-white dark:border-white/5 dark:bg-ink-950" style={{ gridTemplateColumns: gridTemplate }}>
              <div className="asset-cell">
                <input
                  className="table-input"
                  value={row.number ?? ''}
                  onChange={(event) => updateNumber(row.id, event.target.value)}
                  onPaste={(event) => pasteCells(event, rowIndex, -1)}
                  onFocus={() => setSelectedCell({ rowId: row.id, columnId: 'number' })}
                />
              </div>
              {columns.map((column, columnIndex) => {
                const selected = selectedCell?.rowId === row.id && selectedCell?.columnId === column.id;
                return (
                  <div
                    key={column.id}
                    className={`asset-cell copy-cell ${selected ? 'copy-cell-selected' : ''}`}
                    onCopy={(event) => {
                      event.preventDefault();
                      event.clipboardData.setData('text/plain', row.values?.[column.id] ?? '');
                    }}
                    onPaste={(event) => pasteCells(event, rowIndex, columnIndex)}
                    onPointerEnter={() => fillTo(row.id, column.id)}
                  >
                    {column.type === 'text' ? (
                      <input
                        className="table-input"
                        value={row.values?.[column.id] ?? ''}
                        onChange={(event) => updateCell(row.id, column.id, event.target.value)}
                        onFocus={() => setSelectedCell({ rowId: row.id, columnId: column.id })}
                      />
                    ) : (
                      <select
                        className="table-input"
                        value={row.values?.[column.id] ?? ''}
                        onChange={(event) => updateCell(row.id, column.id, event.target.value)}
                        onFocus={() => setSelectedCell({ rowId: row.id, columnId: column.id })}
                      >
                        <option value="">-</option>
                        {(column.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
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
          ))}
        </div>
      </div>

      {settingsColumn && (
        <SettingsPanel
          column={settingsColumn}
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
