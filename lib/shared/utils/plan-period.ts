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

/**
 * No longer clamps a midnight-ending block back to 11:59 PM (planning-correctness-followups
 * finding #1, removed 2026-08-01). FullCalendar reporting a block's end as midnight of the next
 * calendar day used to get rejected by the OLD same-day-containment plan-period rule, so this
 * clamped it back onto the start day to survive that check. Membership is overlap-based now
 * (see isBlockInPlanPeriod below), so a block genuinely ending at midnight is already accepted
 * without clamping -- and the clamp was actively harmful: on save it wrote the clamped time back
 * through to the real calendar Event, silently shortening a block that ran to end-of-day by a
 * minute. Kept as an identity pass-through (not deleted) so the ~15 call sites across
 * CalendarView.tsx/plan-draft-persist.ts/planning.tsx don't need touching.
 */
export function normalizePlanBlockEnd(start: Date, end: Date): Date {
  return end;
}

export function normalizePlanBlock<
  T extends Pick<DraftPlanBlock, 'start_datetime' | 'end_datetime'>,
>(block: T): T {
  return block;
}

export function getPlanPeriodEnd(scope: PlanScope, periodStart: Date, weekStartsOn: 0 | 1): Date {
  const start = startOfDay(periodStart);
  if (scope === 'daily') return start;
  return addDays(startOfWeek(start, { weekStartsOn }), 6);
}

function localDayKey(d: Date): string {
  return format(startOfDay(d), 'yyyy-MM-dd');
}

/**
 * True when the block overlaps the plan period (half-open local day/week window).
 * Overnight blocks (e.g. Fri 10pm → Sat 2am) are in both Friday's and Saturday's
 * daily periods; planned hours clip to the in-period portion elsewhere
 * (see `portionHoursInRange`).
 */
export function isBlockInPlanPeriod(
  block: Pick<DraftPlanBlock, 'start_datetime' | 'end_datetime'>,
  scope: PlanScope,
  periodStart: Date,
  weekStartsOn: 0 | 1,
): boolean {
  const start = new Date(block.start_datetime);
  const end = normalizePlanBlockEnd(start, new Date(block.end_datetime));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return false;
  }

  const rangeStart = startOfDay(periodStart);
  const periodEnd = getPlanPeriodEnd(scope, periodStart, weekStartsOn);
  const rangeEnd = addDays(startOfDay(periodEnd), 1);

  return start.getTime() < rangeEnd.getTime() && end.getTime() > rangeStart.getTime();
}

/** Hours of a block ``[start, end)`` that fall inside ``[rangeStart, rangeEnd)`` (local Date bounds). */
export function portionHoursInRange(start: Date, end: Date, rangeStart: Date, rangeEnd: Date): number {
  const effectiveStart = Math.max(start.getTime(), rangeStart.getTime());
  const effectiveEnd = Math.min(end.getTime(), rangeEnd.getTime());
  return Math.max(0, (effectiveEnd - effectiveStart) / 3_600_000);
}

/**
 * True when the plan period has already fully elapsed — planning it is meaningless (a plan is an
 * intention for time you still have). Bucketed by local calendar day, same basis as
 * `isBlockInPlanPeriod`:
 *   - daily  → the plan day is before today.
 *   - weekly → the whole week has ended (week end < today); the current week (contains today) and
 *     future weeks are NOT past.
 */
export function isPlanPeriodInPast(
  scope: PlanScope,
  periodStart: Date,
  weekStartsOn: 0 | 1,
  now: Date = new Date(),
): boolean {
  const periodEnd = getPlanPeriodEnd(scope, periodStart, weekStartsOn);
  return localDayKey(periodEnd) < localDayKey(now);
}

/** User-facing reason shown when a past period is rejected for planning. */
export function planPeriodInPastMessage(scope: PlanScope): string {
  return scope === 'daily'
    ? 'That day has already passed — you can only plan today or a future day.'
    : 'That week has already ended — you can only plan the current or a future week.';
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
    return `Plan blocks must overlap ${format(periodStart, 'EEEE, MMMM d')}.`;
  }
  const weekStart = startOfWeek(periodStart, { weekStartsOn });
  const end = addDays(weekStart, 6);
  return `Plan blocks must overlap this week (${format(weekStart, 'MMM d')} – ${format(end, 'MMM d')}).`;
}

/**
 * Save is all-or-nothing (planning-correctness-followups finding #8, decided 2026-08-01): a block
 * outside the plan period rejects the whole commit rather than silently saving a subset — but the
 * rejection must name the actual offending block(s) so the user can find and fix them immediately,
 * instead of a generic "some blocks were excluded" with no way to tell which ones.
 */
export function excludedBlocksMessage(
  excludedNames: string[],
  scope: PlanScope,
  periodStart: Date,
  weekStartsOn: 0 | 1 = 1,
): string {
  const names = excludedNames.map((n) => n.trim()).filter(Boolean);
  const boundary = planPeriodOutOfRangeMessage(scope, periodStart, weekStartsOn);
  if (!names.length) return boundary;
  const shown = names.slice(0, 3);
  const list = names.length > 3 ? `${shown.join(', ')}, +${names.length - 3} more` : shown.join(', ');
  const verb = names.length === 1 ? 'is' : 'are';
  const pronoun = names.length === 1 ? 'it' : 'them';
  return `"${list}" ${verb} outside this plan and won't be saved. ${boundary} Move or remove ${pronoun}, then save again.`;
}

/** `YYYY-MM-DD` for `date` as read in `timeZone` — the correct primitive for any
 * "what day is it for this user" computation; never use `Date#toLocaleDateString()`
 * or date-fns `format()` for this, both read the device's local zone instead. */
export function localCalendarDateKey(date: Date, timeZone: string): string {
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
