/**
 * Bulk-select events by a composite key (backend event id + occurrence start), not by event id
 * alone.
 *
 * A recurring event's occurrences all share the same backend `id` — the calendar only renders
 * distinct FullCalendar instance ids per occurrence (see CalendarView's `instanceId` construction),
 * and `calendarEvents` itself holds one row per occurrence with a shared `id`. If bulk-selection were
 * keyed by `id` alone, selecting one occurrence would make every occurrence of that series appear
 * selected (same checkbox state, same "included in this multi-drag" outcome) — the exact bug this
 * module exists to prevent. Keying by (id, occurrence start) makes each occurrence its own distinct
 * selectable item.
 */

/** Build the composite selection key for one occurrence. `occurrenceStart` is the occurrence's own
 *  `start_datetime` (or `null`/omitted for a non-recurring event, where it's a no-op distinguisher
 *  since there's only ever one occurrence). */
export function makeBulkSelectionKey(eventId: number, occurrenceStart?: string | null): string {
  return `${eventId}::${occurrenceStart ?? ''}`;
}

export function parseBulkSelectionKey(key: string): {
  eventId: number;
  occurrenceStart: string | null;
} {
  const sepIndex = key.indexOf('::');
  const idPart = sepIndex === -1 ? key : key.slice(0, sepIndex);
  const occurrencePart = sepIndex === -1 ? '' : key.slice(sepIndex + 2);
  return {
    eventId: Number.parseInt(idPart, 10),
    occurrenceStart: occurrencePart || null,
  };
}

/** The bare event id encoded in a selection key, for callers that only need that part. */
export function bulkSelectionKeyEventId(key: string): number {
  return parseBulkSelectionKey(key).eventId;
}
