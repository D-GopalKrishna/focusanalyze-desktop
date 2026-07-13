import { addDays, format, startOfDay, startOfWeek } from 'date-fns';

import type { DraftPlanBlock, PlanScope } from "@shared/types/dashboard/planning";
import { resolvePlannerTimezone } from "@shared/utils/planner-sidebar-prefs";

/** UserSettings.start_of_week: 0 = Sunday, 1 = Monday (matches date-fns weekStartsOn). */
export function weekStartsOnFromSettings(userStartOfWeek: number | undefined | null): 0 | 1 {
  return (userStartOfWeek === 0 ? 0 : 1) as 0 | 1;
}

export function weekStartForDate(date: Date, userStartOfWeek: number | undefined | null): Date {
  return startOfWeek(date, { weekStartsOn: weekStartsOnFromSettings(userStartOfWeek) });
}

export function weekEndForDate(date: Date, userStartOfWeek: number | undefined | null): Date {
  return addDays(weekStartForDate(date, userStartOfWeek), 6);
}

/** Parses a `YYYY-MM-DD` deep-link param (e.g. `?date=`/`?week_start=`) noon-anchored to dodge TZ shifts. */
export function parseDateOnlyParam(raw: string | null | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local midnight (00:00:00.000). */
export function isLocalMidnight(d: Date): boolean {
  return (
    d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0
  );
}

/**
 * FullCalendar (and slot selection) often ends at midnight of the next calendar day.
 * For planning, treat that as 11:59 PM on the start day so the block stays in-period.
 */
export function normalizePlanBlockEnd(start: Date, end: Date): Date {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return end;
  if (!isLocalMidnight(end) || end.getTime() <= start.getTime()) return end;

  const startDay = startOfDay(start);
  const endDay = startOfDay(end);
  const nextDayAfterStart = addDays(startDay, 1);
  if (endDay.getTime() !== nextDayAfterStart.getTime()) return end;

  const clamped = new Date(startDay);
  clamped.setHours(23, 59, 0, 0);
  return clamped;
}

export function normalizePlanBlock<
  T extends Pick<DraftPlanBlock, 'start_datetime' | 'end_datetime'>,
>(block: T): T {
  const start = new Date(block.start_datetime);
  const end = new Date(block.end_datetime);
  const normalizedEnd = normalizePlanBlockEnd(start, end);
  if (normalizedEnd.getTime() === end.getTime()) return block;
  return { ...block, end_datetime: normalizedEnd.toISOString() };
}

export function getPlanPeriodEnd(scope: PlanScope, periodStart: Date, weekStartsOn: 0 | 1): Date {
  const start = startOfDay(periodStart);
  if (scope === 'daily') return start;
  return addDays(startOfWeek(start, { weekStartsOn }), 6);
}

function localDayKey(d: Date): string {
  return format(startOfDay(d), 'yyyy-MM-dd');
}

/** True when both start and end (local calendar days) lie in the plan period. */
export function isBlockInPlanPeriod(
  block: Pick<DraftPlanBlock, 'start_datetime' | 'end_datetime'>,
  scope: PlanScope,
  periodStart: Date,
  weekStartsOn: 0 | 1,
): boolean {
  const start = new Date(block.start_datetime);
  const end = normalizePlanBlockEnd(start, new Date(block.end_datetime));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

  const periodStartKey = localDayKey(periodStart);
  const periodEnd = getPlanPeriodEnd(scope, periodStart, weekStartsOn);
  const periodEndKey = localDayKey(periodEnd);

  const startKey = localDayKey(start);
  const endKey = localDayKey(end);

  if (scope === 'daily') {
    return startKey === periodStartKey && endKey === periodStartKey;
  }
  return (
    startKey >= periodStartKey &&
    startKey <= periodEndKey &&
    endKey >= periodStartKey &&
    endKey <= periodEndKey
  );
}

export function isDatetimeInPlanPeriod(
  isoOrDate: string | Date,
  scope: PlanScope,
  periodStart: Date,
  weekStartsOn: 0 | 1,
): boolean {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return false;
  const key = localDayKey(d);
  const periodStartKey = localDayKey(periodStart);
  if (scope === 'daily') return key === periodStartKey;
  const periodEndKey = localDayKey(getPlanPeriodEnd(scope, periodStart, weekStartsOn));
  return key >= periodStartKey && key <= periodEndKey;
}

export function planPeriodConstraint(
  scope: PlanScope,
  periodStart: Date,
  weekStartsOn: 0 | 1,
): { start: Date; end: Date } {
  const start = startOfDay(periodStart);
  const end =
    scope === 'daily'
      ? addDays(start, 1)
      : addDays(addDays(startOfWeek(start, { weekStartsOn }), 6), 1);
  return { start, end };
}

export function planPeriodOutOfRangeMessage(
  scope: PlanScope,
  periodStart: Date,
  weekStartsOn: 0 | 1 = 1,
): string {
  if (scope === 'daily') {
    return `Plan blocks must stay on ${format(periodStart, 'EEEE, MMMM d')}.`;
  }
  const weekStart = startOfWeek(periodStart, { weekStartsOn });
  const end = addDays(weekStart, 6);
  return `Plan blocks must stay within this week (${format(weekStart, 'MMM d')} – ${format(end, 'MMM d')}).`;
}

function localCalendarDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

/** True when the week containing ``date`` has not started yet — used to gate report generation. */
export function isFutureJournalWeek(
  date: Date | string,
  userTimezone?: string | null,
  weekStartsOn: 0 | 1 = 1,
): boolean {
  const tz = resolvePlannerTimezone(userTimezone);
  const anchor =
    typeof date === 'string'
      ? startOfDay(new Date(`${date.slice(0, 10)}T12:00:00`))
      : startOfDay(date);
  const weekStart = startOfWeek(anchor, { weekStartsOn });
  const weekStartKey = localCalendarDateKey(weekStart, tz);
  const todayKey = localCalendarDateKey(new Date(), tz);
  return weekStartKey > todayKey;
}
