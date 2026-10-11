import {
  resolveEventForCalendarInteraction,
  type CalendarEventOccurrenceLike,
} from './calendar-event-occurrence';
import {
  isRecurringEvent,
  resolveOccurrenceStartForUpdate,
  withRecurringChange,
  type RecurringOccurrenceContext,
} from './recurring-events';

/**
 * Fields needed to PATCH `is_completed` on a reminder tile. Recurring reminders expand into
 * multiple list rows that share one backend `id`, so the clicked occurrence's start is required
 * to pick the right row — `Array#find` by id alone always hits the first sibling.
 */
export type ReminderCompleteSource = CalendarEventOccurrenceLike &
  RecurringOccurrenceContext & {
    name: string;
    end_datetime?: string | null;
  };

export type ReminderCompletePayload = {
  id: number;
  name: string;
  start_datetime: string;
  end_datetime: string;
  is_completed: boolean;
  change_type?: 'single' | 'this_and_following' | 'all';
  occurrence_start?: string;
};

/**
 * Build the PUT body for toggling a reminder checkbox.
 *
 * Recurring series: `change_type=single` + `occurrence_start` so completing Thursday's reminder
 * cannot rewrite the series DTSTART to whichever expanded row happens to be first in
 * `calendarEvents` (the previous `find(id)` lookup) and mark every occurrence done.
 *
 * Returns null when the occurrence cannot be resolved without guessing among siblings.
 */
export function buildReminderCompleteUpdate(
  events: ReminderCompleteSource[],
  eventId: string | number,
  occurrenceStart: string | null | undefined,
  currentlyCompleted: boolean,
): ReminderCompletePayload | null {
  const idStr = String(eventId);
  const siblings = events.filter((e) => String(e.id) === idStr);
  // Recurring expansions share one id. Without the clicked occurrence start we would
  // otherwise pick siblings[0] (typically the first visible day) and rewrite DTSTART.
  if (siblings.length > 1 && !occurrenceStart) return null;

  const source = resolveEventForCalendarInteraction(events, eventId, occurrenceStart);
  if (!source) return null;

  const id = Number(source.id);
  if (!Number.isFinite(id)) return null;

  const start = source.start_datetime;
  const end = source.end_datetime;
  if (!start || !end) return null;

  const base: ReminderCompletePayload = {
    id,
    name: source.name,
    start_datetime: start,
    end_datetime: end,
    is_completed: !currentlyCompleted,
  };

  if (!isRecurringEvent(source)) return base;

  const slot = resolveOccurrenceStartForUpdate(source) ?? occurrenceStart ?? start;
  return withRecurringChange(base, 'single', slot);
}
