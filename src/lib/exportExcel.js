import { format } from 'date-fns';

const COLUMNS = [
  { key: 'Week', label: 'Week', width: 52, className: 'center muted' },
  { key: 'Day', label: 'Day', width: 58, className: 'muted' },
  { key: 'Date', label: 'Date', width: 74, className: 'date' },
  { key: 'Category', label: 'Category', width: 140, className: 'category' },
  { key: 'Time', label: 'Time', width: 72, className: 'center mono' },
  { key: 'Who', label: 'Who', width: 110, className: 'center' },
  { key: 'Asset', label: 'Asset', width: 270, className: 'asset' },
  { key: 'What', label: 'What', width: 155, className: 'center' },
  { key: 'Todo', label: 'Todo', width: 170, className: 'center' },
  { key: 'Notes', label: 'Notes', width: 210, className: 'notes' },
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeFileName(value) {
  return (value || 'planning')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function metadataRows(project) {
  return [
    ['PLANNING:', project.name || 'Planning'],
    ['Project number:', project.project_number || '-'],
    ['Producer:', project.producer || '-'],
    ['Post-Producer:', project.post_producer || '-'],
    ['Version:', format(new Date(), 'd MMM yyyy')],
  ];
}

function buildWorkbookHtml(project, rows) {
  const meta = metadataRows(project);
  const titleColSpan = COLUMNS.length - 2;

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Planning</x:Name><x:WorksheetOptions><x:FreezePanes/><x:FrozenNoSplit/><x:SplitHorizontal>7</x:SplitHorizontal><x:TopRowBottomPane>7</x:TopRowBottomPane><x:ActivePane>2</x:ActivePane></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
  <style>
    body { margin: 0; background: #ffffff; font-family: Arial, Helvetica, sans-serif; color: #111111; }
    table { border-collapse: collapse; table-layout: fixed; }
    td, th { border: 0.5pt solid #d9d9d9; font-size: 10pt; height: 18pt; padding: 3pt 5pt; vertical-align: middle; white-space: normal; }
    .spacer td { border: 0; height: 10pt; }
    .meta-label { border: 0; color: #111111; font-size: 10pt; font-weight: 400; text-align: left; }
    .meta-value { border: 0; color: #111111; font-size: 10pt; font-weight: 700; text-align: left; }
    .planning-label { border: 0; font-size: 17pt; font-weight: 700; text-align: left; vertical-align: middle; }
    .planning-value { border: 0; font-size: 17pt; font-weight: 700; text-align: left; vertical-align: middle; }
    .category-band td { border: 0; border-top: 1.25pt solid #111111; height: 21pt; }
    .category-title { font-size: 11pt; font-weight: 700; text-transform: uppercase; }
    thead th { background: #ffffff; border-top: 1.25pt solid #111111; border-bottom: 1.25pt solid #111111; color: #111111; font-size: 9pt; font-weight: 700; text-align: left; }
    tbody td { background: #ffffff; color: #111111; }
    tbody tr.weekend td { background: #f1f1f1; color: #555555; }
    tbody tr.booking td { font-weight: 400; }
    tbody tr.week-start td { border-top: 1.25pt solid #111111; }
    .center { text-align: center; }
    .date, .mono { mso-number-format: "\\@"; font-family: Arial, Helvetica, sans-serif; }
    .muted { color: #555555; }
    .category { font-weight: 700; }
    .asset { font-weight: 700; }
    .notes { color: #333333; }
  </style>
</head>
<body>
  <table>
    <colgroup>
      ${COLUMNS.map((column) => `<col style="width:${column.width}px" />`).join('')}
    </colgroup>
    <tbody>
      <tr>
        <td class="planning-label" colspan="2">${escapeHtml(meta[0][0])}</td>
        <td class="planning-value" colspan="${titleColSpan}">${escapeHtml(meta[0][1])}</td>
      </tr>
      ${meta.slice(1).map(([label, value]) => `
      <tr>
        <td class="meta-label" colspan="2">${escapeHtml(label)}</td>
        <td class="meta-value" colspan="${titleColSpan}">${escapeHtml(value)}</td>
      </tr>`).join('')}
      <tr class="spacer">${COLUMNS.map(() => '<td></td>').join('')}</tr>
      <tr class="category-band">
        <td></td><td></td><td></td>
        <td class="category-title" colspan="${COLUMNS.length - 3}">Planning</td>
      </tr>
    </tbody>
    <thead>
      <tr>${COLUMNS.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${rows.map((row, index) => {
        const isWeekend = ['Saturday', 'Sunday', 'Sat', 'Sun'].includes(row.Day);
        const isWeekStart = index > 0 && row.Week && row.Week !== rows[index - 1]?.Week;
        const hasBooking = ['Who', 'Asset', 'What', 'Todo', 'Notes', 'Time'].some((key) => row[key]);
        const className = [isWeekend ? 'weekend' : '', hasBooking ? 'booking' : '', isWeekStart ? 'week-start' : ''].filter(Boolean).join(' ');
        return `<tr class="${className}">${COLUMNS.map((column) => `<td class="${column.className}">${escapeHtml(row[column.key])}</td>`).join('')}</tr>`;
      }).join('')}
    </tbody>
  </table>
</body>
</html>`;
}

export function downloadPlanningExcel(project, rows) {
  const html = buildWorkbookHtml(project, rows);
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFileName(project.name)}_planning_${format(new Date(), 'yyyy-MM-dd')}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
