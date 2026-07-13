import { addDays, format, parseISO } from 'date-fns';
import type { ProjectTimeAnalytics } from "@shared/api-client";

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
    categories.map((c, i) => [c, colors[i % colors.length] ?? '#6b7280']),
  );
  const sorted = stableSortByTotal(categories, totals).filter((c) => (totals[c] ?? 0) > 0);
  return sorted.slice(0, limit).map((name) => ({
    name,
    hours: totals[name] ?? 0,
    color: colorBy[name] ?? '#6b7280',
  }));
}

export function toSingleDayBreakdown(rows: PerformanceTimeRow[]) {
  const totalsByProject: Record<string, number> = {};
  const colorsByProject: Record<string, string> = {};

  for (const r of rows ?? []) {
    const name = segmentLabel(r);
    totalsByProject[name] = (totalsByProject[name] ?? 0) + (r.hours ?? 0);
    colorsByProject[name] ||= normalizeHexColor(segmentColor(r)) ?? '#6b7280';
  }

  const sorted = stableSortByTotal(Object.keys(totalsByProject), totalsByProject).filter(
    (c) => (totalsByProject[c] ?? 0) > 0,
  );

  const data = sorted.map((name) => ({
    name,
    hours: Number((totalsByProject[name] ?? 0).toFixed(2)),
    fill: colorsByProject[name] ?? '#6b7280',
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
      colorsByProject[name] ||= normalizeHexColor(segmentColor(r)) ?? '#6b7280';
    }
  }

  const categories = stableSortByTotal(Object.keys(totalsByProject), totalsByProject);
  const colors = categories.map((c) => colorsByProject[c] ?? '#6b7280');
  const data = buckets.map((b) => ({
    day: b.day,
    ...Object.fromEntries(
      categories.map((c) => [c, Number(((byDay[b.day]?.[c] ?? 0) as number).toFixed(2))]),
    ),
  }));

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
