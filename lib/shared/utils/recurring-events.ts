import { ChangeTypeEnum } from '../rest_client_backend';

export type RecurringChangeType = (typeof ChangeTypeEnum)[keyof typeof ChangeTypeEnum];

export type RecurringOccurrenceContext = {
  start_datetime?: string | null;
  original_occurrence_start?: string | null;
  series_start_datetime?: string | null;
};

/** Virtual slot in the series — not the moved time after a prior single-occurrence edit. */
export function resolveOccurrenceStartForUpdate(
  event: RecurringOccurrenceContext,
): string | undefined {
  return event.original_occurrence_start ?? event.start_datetime ?? undefined;
}

/**
 * Google Calendar-style edit choices: first occurrence → This event | All events;
 * later occurrences → This event | This and following events.
 */
export function getRecurringEditOptions(event: RecurringOccurrenceContext): {
  showAllEvents: boolean;
  showThisAndFollowing: boolean;
} {
  const slot = resolveOccurrenceStartForUpdate(event);
  const seriesStart = event.series_start_datetime;
  if (!slot || !seriesStart) {
    return { showAllEvents: true, showThisAndFollowing: true };
  }
  const slotMs = Date.parse(slot);
  const seriesMs = Date.parse(seriesStart);
  if (Number.isNaN(slotMs) || Number.isNaN(seriesMs)) {
    return { showAllEvents: true, showThisAndFollowing: true };
  }
  const isFirstInSeries = slotMs === seriesMs;
  return isFirstInSeries
    ? { showAllEvents: true, showThisAndFollowing: false }
    : { showAllEvents: false, showThisAndFollowing: true };
}

export function withRecurringChange<T>(
  base: T,
  changeType: RecurringChangeType,
  occurrenceStart?: string,
): T & { change_type: RecurringChangeType; occurrence_start?: string } {
  const payload: T & { change_type: RecurringChangeType; occurrence_start?: string } = {
    ...base,
    change_type: changeType,
  };

  if (changeType !== ChangeTypeEnum.All && occurrenceStart) {
    payload.occurrence_start = occurrenceStart;
  }

  return payload;
}
