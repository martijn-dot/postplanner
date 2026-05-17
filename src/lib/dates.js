import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getISOWeek,
  isSameDay,
  max,
  min,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

export function toDate(value) {
  return typeof value === 'string' ? parseISO(value) : value;
}

export function iso(value) {
  return format(toDate(value), 'yyyy-MM-dd');
}

export function daysBetween(start, end) {
  return differenceInCalendarDays(toDate(end), toDate(start));
}

export function buildTimelineDays(items, zoom) {
  const dates = items.flatMap((item) => (item.start_date && item.end_date ? [toDate(item.start_date), toDate(item.end_date)] : []));
  const fallbackStart = new Date();
  const start = dates.length ? min(dates) : fallbackStart;
  const end = dates.length ? max(dates) : addDays(fallbackStart, 21);
  const padding = zoom === 'month' ? 24 : zoom === 'week' ? 14 : 7;
  const rangeStart = startOfWeek(addDays(start, -padding), { weekStartsOn: 1 });
  const rangeEnd = endOfWeek(addDays(end, padding), { weekStartsOn: 1 });

  return eachDayOfInterval({ start: rangeStart, end: rangeEnd });
}

export function monthSegments(days) {
  const segments = [];
  days.forEach((day) => {
    const key = format(day, 'yyyy-MM');
    const last = segments.at(-1);
    if (last?.key === key) {
      last.span += 1;
      return;
    }
    segments.push({ key, label: format(day, 'MMMM yyyy'), span: 1 });
  });
  return segments;
}

export function weekNumber(date) {
  return getISOWeek(toDate(date));
}

export function formatClientDate(date) {
  return format(toDate(date), 'd MMMM yyyy');
}

export function dateRange(items) {
  const datedItems = items.filter((item) => item.start_date && item.end_date);
  if (!datedItems.length) return null;
  const starts = datedItems.map((item) => toDate(item.start_date));
  const ends = datedItems.map((item) => toDate(item.end_date));
  return { start: min(starts), end: max(ends) };
}

export function visibleRangeLabel(items) {
  const range = dateRange(items);
  if (!range) return 'No dates yet';
  return `${format(range.start, 'd MMM yyyy')} - ${format(range.end, 'd MMM yyyy')}`;
}

export function isToday(day) {
  return isSameDay(day, new Date());
}

export function timelineBoundsForMonth(items) {
  const range = dateRange(items);
  const now = new Date();
  const start = range ? startOfMonth(range.start) : startOfMonth(now);
  const end = range ? endOfMonth(range.end) : endOfMonth(addDays(now, 30));
  return { start, end };
}
