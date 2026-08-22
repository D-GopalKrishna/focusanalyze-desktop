import { addDays, eachDayOfInterval, format, formatISO, parseISO } from 'date-fns';
import type { ProjectTimeAnalytics } from "@shared/api-client";
import { weekStartForDate } from "@shared/utils/plan-period";
import { UNCATEGORIZED_FALLBACK_COLOR } from './color';

export type PerformanceTimeRow = ProjectTimeAnalytics & {
  name?: string;
  life_area_name?: string | null;
  segment_type?: string;
};

export function bucketStartToStableLocalDate(bucketStart: string) {
  const datePart = bucketStart?.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return new Date(`${datePart}T12:00:00`);
  return parseISO(bucketStart);
}

/** ISO-8601 with local timezone offset (avoids UTC day-shift from ``toISOString()``). */
export function toLocalIsoString(date: Date) {
  return formatISO(date, { representation: 'complete' });
}

/**
 * How far into `[periodStart, periodEnd]` has actually elapsed, as of `now` — the
 * cutoff used so a query range never asks for hours past "right now" (which would
 * always be zero anyway). Previously computed inline at each call site as
 * `now < periodEnd ? now : periodEnd`, which never checked `now` against `periodStart`:
 * viewing a period entirely in the future put `until` *before* `periodStart`, sending
 * the backend an inverted range. Clamping to both ends fixes that and matches what the
 * name always implied — the elapsed portion of the period, never less than its start.
 */
export function clampUntilToPeriod(periodStart: Date, periodEnd: Date, now: Date = new Date()): Date {
  if (now.getTime() < periodStart.getTime()) return periodStart;
  if (now.getTime() > periodEnd.getTime()) return periodEnd;
  return now;
}

export function stableSortByTotal(categories: string[], totals: Record<string, number>) {
  return [...categories].sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0) || a.localeCompare(b));
}

export function segmentLabel(r: PerformanceTimeRow) {
  return r.name ?? r.project_name ?? r.life_area_name ?? 'Unknown';
}

export function segmentColor(r: PerformanceTimeRow) {
  return r.color ?? r.project_color ?? r.life_area_color ?? null;
}

export function normalizeHexColor(color: string | null | undefined) {
  const c = color?.trim();
  if (!c) return null;
  return c.startsWith('#') ? c : `#${c}`;
}

export function totalsFromStackedRows(data: Array<Record<string, unknown>>, categories: string[]) {
  const totals: Record<string, number> = {};
  for (const c of categories) totals[c] = 0;
  for (const row of data) {
    for (const c of categories) {
      totals[c] += Number(row[c]) || 0;
    }
  }
  return totals;
}

export function segmentHighlightsFromChart(
  data: Array<Record<string, unknown>> | undefined,
  categories: string[],
  colors: string[],
  limit = 5,
) {
  if (!data?.length || !categories.length) return [];
  const totals = totalsFromStackedRows(data, categories);
  const colorBy = Object.fromEntries(
    categories.map((c, i) => [c, colors[i % colors.length] ?? UNCATEGORIZED_FALLBACK_COLOR]),
  );
  const sorted = stableSortByTotal(categories, totals).filter((c) => (totals[c] ?? 0) > 0);
  return sorted.slice(0, limit).map((name) => ({
    name,
    hours: totals[name] ?? 0,
    color: colorBy[name] ?? UNCATEGORIZED_FALLBACK_COLOR,
  }));
}

export function toSingleDayBreakdown(rows: PerformanceTimeRow[]) {
  const totalsByProject: Record<string, number> = {};
  const colorsByProject: Record<string, string> = {};

  for (const r of rows ?? []) {
    const name = segmentLabel(r);
    totalsByProject[name] = (totalsByProject[name] ?? 0) + (r.hours ?? 0);
    colorsByProject[name] ||= normalizeHexColor(segmentColor(r)) ?? UNCATEGORIZED_FALLBACK_COLOR;
  }

  const sorted = stableSortByTotal(Object.keys(totalsByProject), totalsByProject).filter(
    (c) => (totalsByProject[c] ?? 0) > 0,
  );

  const data = sorted.map((name) => ({
    name,
    hours: Number((totalsByProject[name] ?? 0).toFixed(2)),
    fill: colorsByProject[name] ?? UNCATEGORIZED_FALLBACK_COLOR,
  }));

  return { data, totalHours: data.reduce((sum, row) => sum + row.hours, 0) };
}

export function toStackedByDay(buckets: Array<{ day: string; rows: PerformanceTimeRow[] }>) {
  const totalsByProject: Record<string, number> = {};
  const colorsByProject: Record<string, string> = {};
  const byDay: Record<string, Record<string, number>> = {};

  for (const b of buckets) {
    byDay[b.day] ||= {};
    for (const r of b.rows ?? []) {
      const name = segmentLabel(r);
      byDay[b.day][name] = (byDay[b.day][name] ?? 0) + (r.hours ?? 0);
      totalsByProject[name] = (totalsByProject[name] ?? 0) + (r.hours ?? 0);
      colorsByProject[name] ||= normalizeHexColor(segmentColor(r)) ?? UNCATEGORIZED_FALLBACK_COLOR;
    }
  }

  const categories = stableSortByTotal(Object.keys(totalsByProject), totalsByProject);
  const colors = categories.map((c) => colorsByProject[c] ?? UNCATEGORIZED_FALLBACK_COLOR);
  const data: Array<{ day: string } & Record<string, number>> = buckets.map(
    (b) =>
      ({
        day: b.day,
        ...Object.fromEntries(
          categories.map((c): [string, number] => [
            c,
            Number(((byDay[b.day]?.[c] ?? 0) as number).toFixed(2)),
          ]),
        ),
      }) as { day: string } & Record<string, number>,
  );

  return { data, categories, colors };
}

export function toStackedByMonthDay(buckets: Array<{ day: string; rows: PerformanceTimeRow[] }>) {
  return toStackedByDay(buckets);
}

export function toStackedByMonthWeek(buckets: Array<{ week: string; rows: PerformanceTimeRow[] }>) {
  const totalsByProject: Record<string, number> = {};
  const colorsByProject: Record<string, string> = {};
  const byWeek: Record<string, Record<string, number>> = {};

  for (const b of buckets) {
    byWeek[b.week] ||= {};
    for (const r of b.rows ?? []) {
      const name = segmentLabel(r);
      byWeek[b.week][name] = (byWeek[b.week][name] ?? 0) + (r.hours ?? 0);
      totalsByProject[name] = (totalsByProject[name] ?? 0) + (r.hours ?? 0);
      colorsByProject[name] ||= normalizeHexColor(segmentColor(r)) ?? UNCATEGORIZED_FALLBACK_COLOR;
    }
  }

  const categories = stableSortByTotal(Object.keys(totalsByProject), totalsByProject);
  const colors = categories.map((c) => colorsByProject[c] ?? UNCATEGORIZED_FALLBACK_COLOR);
  const data: Array<{ week: string } & Record<string, number>> = buckets.map(
    (b) =>
      ({
        week: b.week,
        ...Object.fromEntries(
          categories.map((c): [string, number] => [
            c,
            Number(((byWeek[b.week]?.[c] ?? 0) as number).toFixed(2)),
          ]),
        ),
      }) as { week: string } & Record<string, number>,
  );

  return { data, categories, colors };
}

export function normalizeWeekBucketsFromApi(
  weekStart: Date,
  apiBuckets: Array<{ bucket_start: string; rows: PerformanceTimeRow[] }>,
) {
  const byDate = new Map<string, PerformanceTimeRow[]>();
  for (const b of apiBuckets) {
    const d = bucketStartToStableLocalDate(b.bucket_start);
    const key = format(d, 'yyyy-MM-dd');
    byDate.set(key, b.rows ?? []);
  }
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const key = format(d, 'yyyy-MM-dd');
    return {
      day: format(d, 'EEE dd'),
      rows: byDate.get(key) ?? [],
    };
  });
}

export function normalizeMonthDayBucketsFromApi(
  monthStart: Date,
  monthEnd: Date,
  apiBuckets: Array<{ bucket_start: string; rows: PerformanceTimeRow[] }>,
  until?: Date,
) {
  const byDate = new Map<string, PerformanceTimeRow[]>();
  for (const b of apiBuckets) {
    const d = bucketStartToStableLocalDate(b.bucket_start);
    const key = format(d, 'yyyy-MM-dd');
    byDate.set(key, b.rows ?? []);
  }
  // In-progress months must not pad remaining calendar days (or keep leaked future
  // API buckets) — those empty/future bars made legend totals (e.g. a full month of
  // recurring sleep) disagree with the "Logged (period)" tile, which is clamped to today.
  const rangeEnd = until && until.getTime() < monthEnd.getTime() ? until : monthEnd;
  return eachDayOfInterval({ start: monthStart, end: rangeEnd }).map((d) => ({
    day: format(d, 'd'),
    rows: byDate.get(format(d, 'yyyy-MM-dd')) ?? [],
  }));
}

/**
 * Label week buckets `W1..Wn` by their chronological position within the displayed month, not
 * `date-fns getWeekOfMonth(weekStart)` — a month's first week can start in the *previous* month
 * (e.g. Sun Jul 26 for Sun-start August 2026), and `getWeekOfMonth` computes the week-of-month
 * relative to whatever month that date falls in (July), producing "W5" for the month's first row
 * instead of "W1" (and duplicate "W5" labels merge two distinct weeks' hours together downstream
 * in `toStackedByMonthWeek`, which keys by label). Position-based indexing is always 1..n with no
 * collisions, matching the walk order the chart renders in.
 */
export function normalizeMonthWeekBucketsFromApi(
  monthStart: Date,
  monthEnd: Date,
  apiBuckets: Array<{ bucket_start: string; rows: PerformanceTimeRow[] }>,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  until?: Date,
) {
  const byWeekStart = new Map<string, PerformanceTimeRow[]>();
  for (const b of apiBuckets) {
    const d = bucketStartToStableLocalDate(b.bucket_start);
    const key = format(d, 'yyyy-MM-dd');
    byWeekStart.set(key, b.rows ?? []);
  }

  const seen = new Set<string>();
  const out: Array<{ week: string; rows: PerformanceTimeRow[] }> = [];
  const walkEnd = until && until.getTime() < monthEnd.getTime() ? until : monthEnd;
  let cursor = monthStart;
  while (cursor <= walkEnd) {
    const ws = weekStartForDate(cursor, weekStartsOn);
    const key = format(ws, 'yyyy-MM-dd');
    if (!seen.has(key)) {
      seen.add(key);
      out.push({
        week: `W${out.length + 1}`,
        rows: byWeekStart.get(key) ?? [],
      });
    }
    cursor = addDays(cursor, 1);
  }
  return out;
}
