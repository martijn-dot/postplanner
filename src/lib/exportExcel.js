import { format } from 'date-fns';

const COLUMNS = [
  { key: 'Week', label: 'Week', wch: 7 },
  { key: 'Day', label: 'Day', wch: 8 },
  { key: 'Date', label: 'Date', wch: 10 },
  { key: 'Category', label: 'Category', wch: 18 },
  { key: 'Time', label: 'Time', wch: 9 },
  { key: 'Who', label: 'Who', wch: 14 },
  { key: 'Asset', label: 'Asset', wch: 30 },
  { key: 'What', label: 'What', wch: 20 },
  { key: 'Todo', label: 'Todo', wch: 22 },
  { key: 'Notes', label: 'Notes', wch: 28 },
];

function safeFileName(value) {
  return (value || 'planning')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function styleCell(worksheet, address, style) {
  if (!worksheet[address]) worksheet[address] = { t: 's', v: '' };
  worksheet[address].s = style;
}

function rowHasBooking(row) {
  return ['Time', 'Who', 'Asset', 'What', 'Todo', 'Notes'].some((key) => row[key]);
}

export async function downloadPlanningExcel(project, rows) {
  const XLSX = await import('xlsx');
  const metadata = [
    ['PLANNING:', '', project.name || 'Planning'],
    ['Project number:', '', project.project_number || '-'],
    ['Producer:', '', project.producer || '-'],
    ['Post-Producer:', '', project.post_producer || '-'],
    ['Version:', '', format(new Date(), 'd MMM yyyy')],
    [],
    ['', '', '', 'PLANNING'],
    COLUMNS.map((column) => column.label),
  ];
  const data = rows.map((row) => COLUMNS.map((column) => row[column.key] ?? ''));
  const worksheet = XLSX.utils.aoa_to_sheet([...metadata, ...data]);
  const workbook = XLSX.utils.book_new();
  const headerRow = metadata.length - 1;
  const range = XLSX.utils.decode_range(worksheet['!ref']);

  worksheet['!cols'] = COLUMNS.map((column) => ({ wch: column.wch }));
  worksheet['!rows'] = [
    { hpt: 34 },
    { hpt: 15 },
    { hpt: 15 },
    { hpt: 15 },
    { hpt: 15 },
    { hpt: 10 },
    { hpt: 24 },
    { hpt: 18 },
    ...rows.map((row) => ({ hpt: rowHasBooking(row) ? 18 : 14 })),
  ];
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 0, c: COLUMNS.length - 1 } },
    { s: { r: 6, c: 3 }, e: { r: 6, c: COLUMNS.length - 1 } },
  ];
  worksheet['!freeze'] = { xSplit: 0, ySplit: 8 };

  const base = {
    font: { name: 'Arial', sz: 10, color: { rgb: '111111' } },
    alignment: { vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: 'D9D9D9' } },
      bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
      left: { style: 'thin', color: { rgb: 'D9D9D9' } },
      right: { style: 'thin', color: { rgb: 'D9D9D9' } },
    },
  };
  const title = { font: { name: 'Arial', sz: 17, bold: true, color: { rgb: '111111' } }, alignment: { vertical: 'center' } };
  const metaLabel = { font: { name: 'Arial', sz: 10, color: { rgb: '111111' } }, alignment: { vertical: 'center' } };
  const metaValue = { font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '111111' } }, alignment: { vertical: 'center' } };
  const band = { font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '111111' } }, alignment: { vertical: 'center' }, border: { top: { style: 'medium', color: { rgb: '111111' } } } };
  const header = { ...base, font: { name: 'Arial', sz: 9, bold: true, color: { rgb: '111111' } }, fill: { fgColor: { rgb: 'FFFFFF' } }, border: { top: { style: 'medium', color: { rgb: '111111' } }, bottom: { style: 'medium', color: { rgb: '111111' } } } };
  const weekend = { ...base, fill: { fgColor: { rgb: 'F1F1F1' } }, font: { name: 'Arial', sz: 10, color: { rgb: '555555' } } };
  const weekStart = { ...base, border: { ...base.border, top: { style: 'medium', color: { rgb: '111111' } } } };

  ['A1', 'C1'].forEach((cell) => styleCell(worksheet, cell, title));
  ['A2', 'A3', 'A4', 'A5'].forEach((cell) => styleCell(worksheet, cell, metaLabel));
  ['C2', 'C3', 'C4', 'C5'].forEach((cell) => styleCell(worksheet, cell, metaValue));
  styleCell(worksheet, 'D7', band);

  for (let column = range.s.c; column <= range.e.c; column += 1) {
    styleCell(worksheet, XLSX.utils.encode_cell({ r: headerRow, c: column }), header);
  }

  rows.forEach((row, index) => {
    const rowIndex = headerRow + 1 + index;
    const isWeekend = ['Saturday', 'Sunday', 'Sat', 'Sun'].includes(row.Day);
    const isWeekStart = index > 0 && row.Week && row.Week !== rows[index - 1]?.Week;
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: column });
      const alignment = column === 0 || column === 4 || column === 5 || column === 7 || column === 8
        ? { horizontal: 'center', vertical: 'center', wrapText: true }
        : { vertical: 'center', wrapText: true };
      const style = isWeekend ? { ...weekend, alignment } : isWeekStart ? { ...weekStart, alignment } : { ...base, alignment };
      if (column === 3 || column === 6) style.font = { ...style.font, bold: true };
      styleCell(worksheet, address, style);
    }
  });

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Planning');
  XLSX.writeFile(workbook, `${safeFileName(project.name)}_planning_${format(new Date(), 'yyyy-MM-dd')}.xlsx`, {
    bookType: 'xlsx',
    cellStyles: true,
  });
}

function assetFileName(project, suffix) {
  return `${safeFileName(project.name)}_${suffix}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
}

function visibleColumns(list) {
  return [...(list.columns ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function formatAssetFilename(project, list, row) {
  const options = list.filename_options ?? {};
  const columns = visibleColumns(list);
  const baseParts = [project.project_number, project.client, project.name, row.number].filter((part) => String(part ?? '').trim());
  const columnParts = columns
    .map((column) => ({ column, value: String(row.values?.[column.id] ?? '').trim() }))
    .filter((item) => item.value);
  const parts = [
    ...baseParts.map((value, index) => ({ value: String(value).trim(), separator: index < baseParts.length - 1 ? list.global_separator ?? '-' : null })),
    ...columnParts.map((item) => ({ value: item.value, separator: item.column.separator || list.global_separator || '-' })),
  ];
  let filename = parts.reduce((output, part, index) => {
    if (index === 0) return part.value;
    const previous = parts[index - 1];
    return `${output}${previous.separator || list.global_separator || '-'}${part.value}`;
  }, '');
  if (options.capitalizeWords) filename = filename.replace(/\b\w/g, (letter) => letter.toUpperCase());
  if (options.lowercase) filename = filename.toLowerCase();
  if (options.hyphenateSpaces) filename = filename.replace(/\s+/g, '-');
  return filename;
}

function assetSheetRows(project, list) {
  const columns = visibleColumns(list);
  const headers = ['Number', ...columns.map((column) => column.name), 'Filename'];
  const rows = [...(list.rows ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((row) => [
      row.number ?? '',
      ...columns.map((column) => row.values?.[column.id] ?? ''),
      formatAssetFilename(project, list, row),
    ]);
  return { headers, rows, columns };
}

function appendAssetSheet(XLSX, workbook, project, list) {
  const { headers, rows, columns } = assetSheetRows(project, list);
  const metadata = [
    ['ASSET LIST:', '', list.name || 'Asset list'],
    ['Project number:', '', project.project_number || '-'],
    ['Client:', '', project.client || '-'],
    ['Project:', '', project.name || '-'],
    [],
    headers,
  ];
  const worksheet = XLSX.utils.aoa_to_sheet([...metadata, ...rows]);
  worksheet['!cols'] = [
    { wch: 12 },
    ...columns.map((column) => ({ wch: Math.max(12, Math.round((column.width ?? 160) / 9)) })),
    { wch: 54 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, (list.name || 'Asset list').slice(0, 31));
}

export async function downloadAssetListExcel(project, lists, mode = 'active') {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const exportLists = Array.isArray(lists) ? lists : [lists];
  exportLists.forEach((list) => appendAssetSheet(XLSX, workbook, project, list));
  XLSX.writeFile(workbook, assetFileName(project, mode === 'all' ? 'asset-lists' : 'asset-list'), {
    bookType: 'xlsx',
    cellStyles: true,
  });
}
