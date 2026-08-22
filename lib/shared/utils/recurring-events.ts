import type { BulkDeleteEventItem } from '../services/api/dashboard/Calendar';

// Deliberately not importing the generated `ChangeTypeEnum` at runtime (only its values —
// 'single' | 'this_and_following' | 'all' — are used here): this file is unit-tested directly
// via Node's native TS type-stripping, which can't parse the generated client's TS parameter
// properties, so keeping this module's import graph free of `rest_client_backend` runtime
// imports is what makes it testable without a bundler.
export type RecurringChangeType = 'single' | 'this_and_following' | 'all';

export type RecurringOccurrenceContext = {
  start_datetime?: string | null;
  original_occurrence_start?: string | null;
  series_start_datetime?: string | null;
  recurrence_rule?: string | null;
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

  if (changeType !== 'all' && occurrenceStart) {
    payload.occurrence_start = occurrenceStart;
  }

  return payload;
}

export type BulkDeleteRecurringItem = { id: number; start_datetime?: string | null } & RecurringOccurrenceContext;

export type BulkDeleteRecurringGroup = {
  /** Series identity — `series_start_datetime` is stable across the master and any
   *  materialized overrides of the same series, unlike `id`, which differs per row. */
  key: string;
  /** Representative event used for the dialog's copy and first/later-occurrence option gating. */
  sample: BulkDeleteRecurringItem;
  items: { eventId: number; occurrenceStart?: string }[];
};

export function isRecurringEvent(event: RecurringOccurrenceContext): boolean {
  // A materialized override has recurrence_rule="" (empty, not null/undefined) but still
  // carries original_occurrence_start — `||` is required here, not `??`, so the empty string
  // falls through to the second check instead of short-circuiting to false.
  return Boolean(event.recurrence_rule || event.original_occurrence_start);
}

/** Partitions a resolved multi-select into plain ids and recurring events grouped by series, so
 * a bulk delete/update can apply a recurring-scope choice once per distinct series instead of
 * once per selected occurrence (which would double-apply "all"/"this and following" when more
 * than one occurrence of the same series is selected). */
export function buildBulkDeleteGroups<T extends BulkDeleteRecurringItem>(
  events: T[],
): {
  nonRecurringIds: number[];
  groups: BulkDeleteRecurringGroup[];
} {
  const nonRecurringIds: number[] = [];
  const groupsByKey = new Map<string, BulkDeleteRecurringGroup>();

  for (const ev of events) {
    if (!isRecurringEvent(ev)) {
      nonRecurringIds.push(ev.id);
      continue;
    }
    const key = ev.series_start_datetime || ev.start_datetime || String(ev.id);
    const occurrenceStart = resolveOccurrenceStartForUpdate(ev);
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.items.push({ eventId: ev.id, occurrenceStart });
      const sampleSlot = resolveOccurrenceStartForUpdate(existing.sample);
      if (occurrenceStart && (!sampleSlot || occurrenceStart < sampleSlot)) {
        existing.sample = ev;
      }
    } else {
      groupsByKey.set(key, { key, sample: ev, items: [{ eventId: ev.id, occurrenceStart }] });
    }
  }

  return { nonRecurringIds, groups: Array.from(groupsByKey.values()) };
}

/** Converts one series' user-chosen scope into the delete item(s) to send. "All" and
 *  "this and following" are series-wide, so multiple selected occurrences of the same series
 *  collapse into a single request (re-applying either would operate on an already-mutated
 *  series); "single" cancels each selected occurrence independently. */
export function buildBulkDeleteItemsForGroup(
  group: BulkDeleteRecurringGroup,
  changeType: RecurringChangeType,
): BulkDeleteEventItem[] {
  if (changeType === 'single') {
    return group.items.map((item) => ({
      id: item.eventId,
      changeType: 'single',
      occurrenceStart: item.occurrenceStart,
    }));
  }
  if (changeType === 'this_and_following') {
    const earliest = group.items.reduce((min, item) =>
      !min.occurrenceStart || (item.occurrenceStart && item.occurrenceStart < min.occurrenceStart)
        ? item
        : min,
    );
    return [
      {
        id: earliest.eventId,
        changeType: 'this_and_following',
        occurrenceStart: earliest.occurrenceStart,
      },
    ];
  }
  return [{ id: group.items[0].eventId, changeType: 'all' }];
}
