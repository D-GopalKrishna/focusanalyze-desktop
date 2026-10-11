/**
 * Per-series recurring-scope selection, shared by every multi-event operation.
 *
 * **The problem this fixes.** Three flows each had their own policy for "the selection
 * contains recurring events — what did the user mean?":
 *
 * - multi-delete asked ONCE and applied that one answer to every series in the selection,
 *   so picking "all events" for one series silently deleted every other selected series
 *   in full too;
 * - multi-drag never asked, forcing `single` on everything;
 * - the assign menu never asked either, inferring the scope from each row's shape.
 *
 * Same question, three answers, two of them silent. Now every flow asks once per *series*
 * and transports that series' own answer, which is what the backend has always accepted
 * (per-item `change_type`) and what the web UI's single-event dialogs already do.
 *
 * **Why per series, not per selected row.** Selecting three occurrences of Gym is one
 * decision about Gym, not three. `buildBulkDeleteGroups` already collapses a selection to
 * distinct series, so the question count matches the number of real decisions — and
 * "this and following" applied to three rows of one series would otherwise be applied
 * three times over.
 *
 * These are pure functions, deliberately free of React and of `rest_client_backend`
 * runtime imports, so they can be unit-tested directly under Node's TS type-stripping
 * (`pnpm test:unit`) — the same constraint `recurring-events.ts` documents.
 */
import type { BulkDeleteEventItem } from '../services/api/dashboard/Calendar';
import { resolveAssignEventTimes } from './calendar-habit-assign-update';
import {
  buildBulkDeleteItemsForGroup,
  getRecurringEditOptions,
  type BulkDeleteRecurringGroup,
  type RecurringChangeType,
} from './recurring-events';

/** The user's answer per series, keyed by `BulkDeleteRecurringGroup.key`. */
export type ScopeByGroupKey = Record<string, RecurringChangeType>;

/**
 * The scope a series starts on before the user touches anything.
 *
 * Always `single`, for every operation. It is the least destructive of the three, and a
 * pre-selected default should never be the one that is hardest to undo — especially for
 * drag, where the gesture applies a time delta to one occurrence and shifting a whole
 * series by that delta is a different intent the gesture doesn't express.
 *
 * A default is not an assumption: the choice is shown per series and can be changed before
 * confirming. Callers that want a deliberate answer gate their confirm on
 * `allGroupsAnswered` with an empty starting map instead of `initialScopes`.
 */
export function defaultScopeForGroup(_group: BulkDeleteRecurringGroup): RecurringChangeType {
  return 'single';
}

/** The options to offer for one series — "all" vs "this and following" depends on whether
 * the sampled occurrence is the first in its series, matching the single-event dialog. */
export function scopeOptionsForGroup(group: BulkDeleteRecurringGroup): RecurringChangeType[] {
  const { showAllEvents, showThisAndFollowing } = getRecurringEditOptions(group.sample);
  const options: RecurringChangeType[] = ['single'];
  if (showThisAndFollowing) options.push('this_and_following');
  if (showAllEvents) options.push('all');
  return options;
}

/** Opening state for a dialog: every series answered with its default. */
export function initialScopes(groups: BulkDeleteRecurringGroup[]): ScopeByGroupKey {
  return Object.fromEntries(groups.map((g) => [g.key, defaultScopeForGroup(g)]));
}

/** True when every series in the selection has an answer — gate the confirm button on this
 * if the caller wants an explicit choice rather than accepting the defaults. */
export function allGroupsAnswered(
  groups: BulkDeleteRecurringGroup[],
  scopes: ScopeByGroupKey,
): boolean {
  return groups.every((g) => Boolean(scopes[g.key]));
}

/**
 * Bulk-delete payload carrying each series' own answer.
 *
 * Non-recurring ids are sent plainly; the backend ignores `change_type` for them.
 */
export function buildScopedDeleteItems(
  nonRecurringIds: number[],
  groups: BulkDeleteRecurringGroup[],
  scopes: ScopeByGroupKey,
): BulkDeleteEventItem[] {
  return [
    ...nonRecurringIds.map((id) => ({ id, changeType: 'all' as const })),
    ...groups.flatMap((group) =>
      buildBulkDeleteItemsForGroup(group, scopes[group.key] ?? defaultScopeForGroup(group)),
    ),
  ];
}

/**
 * Bulk-update records carrying each series' own answer.
 *
 * `patchFor` supplies the per-row field changes (the time delta for a drag, the life-area
 * id for an assign); this adds the recurring scope on top. A series answered `all` or
 * `this_and_following` collapses to ONE record — applying it per selected occurrence would
 * rewrite the same series two or three times.
 */
export function buildScopedUpdateRecords<TPatch extends Record<string, unknown>>(
  groups: BulkDeleteRecurringGroup[],
  scopes: ScopeByGroupKey,
  patchFor: (eventId: number) => TPatch,
): (TPatch & { id: number; change_type: RecurringChangeType; occurrence_start?: string })[] {
  return groups.flatMap((group) => {
    const scope = scopes[group.key] ?? defaultScopeForGroup(group);
    const targets = buildBulkDeleteItemsForGroup(group, scope);
    return targets.map((target) => {
      const record = {
        ...patchFor(target.id),
        id: target.id,
        change_type: scope,
      } as TPatch & { id: number; change_type: RecurringChangeType; occurrence_start?: string };
      if (scope !== 'all' && target.occurrenceStart) {
        record.occurrence_start = target.occurrenceStart;
      }
      return record;
    });
  });
}


/**
 * Attach a series' chosen scope to an assign payload, with the right TIMES for that scope.
 *
 * The subtlety that makes this its own helper: an assign payload carries the event's
 * start/end because the update is a full PUT. For `all`, those must be the SERIES' own
 * times — sending the clicked occurrence's times with `change_type: "all"` moves the whole
 * series onto that occurrence's date, which is never what "apply this to every occurrence"
 * means. `resolveAssignEventTimes` already solved this for habit linking; this reuses it.
 */
export function withAssignScope<T extends Record<string, unknown>>(
  payload: T,
  scope: RecurringChangeType,
  event: { start_datetime: string; end_datetime: string; series_start_datetime?: string | null },
  occurrenceStart?: string,
): T & {
  change_type: RecurringChangeType;
  occurrence_start?: string;
  start_datetime: string;
  end_datetime: string;
} {
  const times = resolveAssignEventTimes(event, scope === 'all' ? 'series' : 'materialized-single');
  const next = {
    ...payload,
    ...times,
    change_type: scope,
  } as T & {
    change_type: RecurringChangeType;
    occurrence_start?: string;
    start_datetime: string;
    end_datetime: string;
  };
  if (scope !== 'all' && occurrenceStart) {
    next.occurrence_start = occurrenceStart;
  }
  return next;
}
