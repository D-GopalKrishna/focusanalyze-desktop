import type { HabitRead } from "@shared/api-client";

/**
 * Which calendar row belongs to which habit.
 *
 * A habit is linked to its calendar series through `Habit.schedule_event`, which points at
 * the recurring **master** only (the backend's `uniq_habit_per_schedule_event` constraint
 * makes that structural), so `use-habits-index.ts` indexes habits by that master's event id.
 *
 * The catch: a row edited with `change_type="single"` — dragging one occurrence to another
 * time, renaming it, resizing it — is materialized backend-side as a *child* Event under
 * `parent_event` and serialized under its **own** id. Looking a habit up by the row id alone
 * therefore misses, and the occurrence renders as a plain event: no flame, no cadence or
 * streak, no check-in checkbox. `series_event_id` is the field that closes that gap — the
 * parent's id for an override, the row's own id for a master or non-recurring event.
 */
export function seriesEventIdFor(event: { id: number; series_event_id?: number | null }): number {
  return event.series_event_id ?? event.id;
}

/** The habit a calendar row belongs to, or null. See `seriesEventIdFor` for why the row's
 * own id is not enough on its own. */
export function habitForCalendarEvent(
  habitsBySeriesEventId: Map<number, HabitRead>,
  event: { id: number; series_event_id?: number | null },
): HabitRead | null {
  return habitsBySeriesEventId.get(seriesEventIdFor(event)) ?? null;
}
