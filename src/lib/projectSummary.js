import { differenceInCalendarDays, format, parseISO } from 'date-fns';

export function buildProjectSummary({ lineItems, labelsById, categories = [], uncategorizedName = 'Uncategorized' }) {
  const datedRows = lineItems.filter((item) => item.start_date || item.end_date);
  const startDates = datedRows.map((item) => item.start_date || item.end_date).filter(Boolean).sort();
  const endDates = datedRows.map((item) => item.end_date || item.start_date).filter(Boolean).sort();
  const firstStart = startDates[0] ?? null;
  const lastEnd = endDates.at(-1) ?? null;
  const daysToStart = firstStart ? differenceInCalendarDays(parseISO(firstStart), new Date()) : null;
  const weekLength = firstStart && lastEnd ? Math.max(1, Math.ceil((differenceInCalendarDays(parseISO(lastEnd), parseISO(firstStart)) + 1) / 7)) : null;
  const dateLabel = (value) => (value ? format(parseISO(value), 'd MMM') : '');
  const uniqueDates = (items) => [...new Set(items.map((item) => item.end_date || item.start_date).filter(Boolean))].sort().map(dateLabel).join(', ');
  const rowsByWhat = (needle) => lineItems.filter((item) => (labelsById[item.what]?.value ?? '').toLowerCase().includes(needle));
  const finalRows = rowsByWhat('final delivery');
  const finalByCategory = categories
    .map((category) => {
      const dates = uniqueDates(finalRows.filter((item) => item.category_id === category.id));
      return dates ? `${category.name}: ${dates}` : '';
    })
    .filter(Boolean);
  const uncategorizedFinalDates = uniqueDates(finalRows.filter((item) => !item.category_id));
  if (uncategorizedFinalDates) finalByCategory.push(`${uncategorizedName}: ${uncategorizedFinalDates}`);

  return {
    start: daysToStart == null ? '-' : daysToStart < 0 ? `Started ${Math.abs(daysToStart)}d ago` : `Starts within ${daysToStart}d`,
    running: weekLength ? `${weekLength}w` : '-',
    offlineLock: uniqueDates(rowsByWhat('offline lock')) || '-',
    grading: uniqueDates(rowsByWhat('grading')) || '-',
    final: finalByCategory.length ? finalByCategory.join(' | ') : '-',
  };
}
