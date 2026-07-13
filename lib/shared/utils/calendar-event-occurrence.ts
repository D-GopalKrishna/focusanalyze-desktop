/**
 * Recurring events share the same backend `id` across expanded list rows.
 * Always match by id + occurrence `start_datetime` (FullCalendar: `fullRangeStart`).
 */

export type CalendarEventOccurrenceLike = {
  id: number | string;
  start_datetime?: string | null;
};

export function findEventOccurrenceInList<T extends CalendarEventOccurrenceLike>(
  events: T[],
  eventId: string | number,
  occurrenceStart?: string | null,
): T | null {
  const idStr = String(eventId);
  const matches = events.filter((e) => String(e.id) === idStr);
  if (matches.length === 0) return null;
  if (!occurrenceStart) return matches[0] ?? null;
  return matches.find((e) => e.start_datetime === occurrenceStart) ?? null;
}
