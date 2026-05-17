import { format } from 'date-fns';

function autoWidth(rows) {
  const keys = Object.keys(rows[0] ?? {});
  return keys.map((key) => ({
    wch: Math.max(key.length + 2, ...rows.map((row) => String(row[key] ?? '').length + 2)),
  }));
}

export async function downloadPlanningExcel(project, rows) {
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = autoWidth(rows);

  const range = XLSX.utils.decode_range(worksheet['!ref']);
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const header = XLSX.utils.encode_cell({ r: 0, c: column });
    worksheet[header].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1F2937' } },
      alignment: { vertical: 'center' },
    };
  }

  for (let row = 1; row <= range.e.r; row += 1) {
    const fill = row % 2 === 0 ? 'F7F8FA' : 'FFFFFF';
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = XLSX.utils.encode_cell({ r: row, c: column });
      if (!worksheet[cell]) continue;
      worksheet[cell].s = { fill: { fgColor: { rgb: fill } } };
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Planning');
  const safeName = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  XLSX.writeFile(workbook, `${safeName}_planning_${format(new Date(), 'yyyy-MM-dd')}.xlsx`, {
    cellStyles: true,
  });
}
