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
