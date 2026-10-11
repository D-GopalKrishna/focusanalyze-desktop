import { localCalendarDateKey } from "@shared/utils/plan-period";

/**
 * Recurring events share the same backend `id` across expanded list rows.
 * Always match by id + occurrence `start_datetime` (FullCalendar: `fullRangeStart`).
 */

export type CalendarEventOccurrenceLike = {
  id: number | string;
  start_datetime?: string | null;
};

/**
 * Two ISO datetime strings can represent the identical instant while differing textually —
 * notably, `Date.prototype.toISOString()` always includes milliseconds (`.000Z`), while the
 * backend's serializer omits them when zero (`Z` only). Occurrence matching must compare by
 * instant, not by raw string equality, or a freshly-dragged event's own client-formatted
 * timestamp silently fails to match its own entry in state (see FA event-drag-then-right-click
 * regression: the drag updates `fullRangeStart` via `toISOString()`, but state holds the
 * server's shorter form for the same instant).
 */
export function occurrenceTimesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const timeA = new Date(a).getTime();
  const timeB = new Date(b).getTime();
  return !Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA === timeB;
}

export function findEventOccurrenceInList<T extends CalendarEventOccurrenceLike>(
  events: T[],
  eventId: string | number,
  occurrenceStart?: string | null,
): T | null {
  const idStr = String(eventId);
  const matches = events.filter((e) => String(e.id) === idStr);
  if (matches.length === 0) return null;
  if (!occurrenceStart) return matches[0] ?? null;
  return matches.find((e) => occurrenceTimesMatch(e.start_datetime, occurrenceStart)) ?? null;
}

/**
 * Resolve the live event for a calendar interaction (right-click / click) when the DOM-side
 * `fullRangeStart` may have drifted from React state.
 *
 * Why this exists: the assign/context menu looks up the tile in `calendarEvents` by
 * `(id, fullRangeStart)`. If that lookup fails we `preventDefault` and return — so the tile
 * appears "not right-clickable" with no browser menu either. That used to happen after some
 * drag/cancel paths left extendedProps pointing at a different instant than state.
 *
 * Common drift: multi-day / overnight drag updates `extendedProps.fullRangeStart` via
 * `toISOString()` during `eventDrag`, then `info.revert()` restores the tile position but
 * leaves the extendedProp at the dragged instant — strict occurrence match fails for that
 * tile only (siblings still work).
 *
 * Fallback order (stop at first hit):
 * 1. exact occurrence (`id` + `occurrenceStart` / fullRangeStart)
 * 2. visual/fallback start (`info.event.start` after revert matches state again)
 * 3. sole id match — safe only for non-recurring (one row); refuse to guess among siblings
 */
export function resolveEventForCalendarInteraction<T extends CalendarEventOccurrenceLike>(
  events: T[],
  eventId: string | number,
  occurrenceStart?: string | null,
  fallbackStart?: string | Date | null,
): T | null {
  // 1) Happy path — DOM prop still agrees with React state.
  const matched = findEventOccurrenceInList(events, eventId, occurrenceStart);
  if (matched) return matched;

  // 2) After drag+revert, FC start/end are restored but fullRangeStart may still be the
  //    dragged instant. The visible start usually matches state again — use it.
  if (fallbackStart != null && fallbackStart !== '') {
    const fb =
      typeof fallbackStart === 'string' ? fallbackStart : fallbackStart.toISOString();
    const byFallback = findEventOccurrenceInList(events, eventId, fb);
    if (byFallback) return byFallback;
  }

  // 3) Non-recurring: a single row for this id is unambiguous. Recurring expansions share
  //    one backend id across days — never pick an arbitrary sibling.
  const idStr = String(eventId);
  const matches = events.filter((e) => String(e.id) === idStr);
  if (matches.length === 1) return matches[0] ?? null;
  return null;
}

/**
 * Resolve which row in an already-fetched event list is the occurrence of a recurring
 * series that actually falls on `targetDate` — as opposed to the series' own row, whose
 * `start_datetime` is the recurrence anchor (can be weeks/months off from any given day).
 *
 * Why this is keyed by series id, not `id` alone: a day that was edited with
 * `change_type="single"` materializes as a *child* Event under its own id, with
 * `series_event_id` pointing back at the master — see `seriesEventIdFor` in
 * calendar-habit-lookup.ts for the same id-resolution rule applied to habit lookups. An
 * unedited occurrence instead keeps the master's own id across every expanded row for that
 * series, so `series_event_id` is absent there and the row's own id already equals the
 * series id.
 *
 * Date comparison is by local calendar day (via `timeZone`), not exact instant — the caller
 * only knows which day it wants opened (e.g. a habit's `next_occurrence_date`), not that
 * occurrence's exact start time.
 */
export function findOccurrenceOnDate<
  T extends CalendarEventOccurrenceLike & { series_event_id?: number | null },
>(events: T[], seriesId: number | string, targetDate: Date, timeZone: string): T | null {
  const seriesIdStr = String(seriesId);
  const targetKey = localCalendarDateKey(targetDate, timeZone);
  return (
    events.find((e) => {
      const eventSeriesId = e.series_event_id != null ? String(e.series_event_id) : String(e.id);
      if (eventSeriesId !== seriesIdStr) return false;
      if (!e.start_datetime) return false;
      return localCalendarDateKey(new Date(e.start_datetime), timeZone) === targetKey;
    }) ?? null
  );
}
