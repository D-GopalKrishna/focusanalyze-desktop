/**
 * Pure helpers for context-menu Assign updates (habit, task/project/life-area) — shared by
 * `calendar-event-assign-menu.tsx`'s habit-assign path and its `baseEventFields`/
 * `buildUpdatePayload` (not habit-specific despite this module's name; kept here rather
 * than duplicated so both call sites share one fix).
 *
 * A right-clicked calendar tile can be one of three distinct kinds, and each needs a
 * different write:
 *
 * - Not recurring at all: a standalone event. Send its own id/times, no `change_type`.
 * - A recurring series master, or a *virtual* expanded occurrence of one (these share the
 *   master's `id` — `recurrence_rule` carries the master's real, non-empty rule). The write
 *   must target the whole series (`change_type: 'all'`) and remap times onto the series
 *   anchor (`series_start_datetime`) rather than the clicked occurrence's own slot — the
 *   original DTSTART-corruption bug this file was created to fix (GitHub #123).
 * - An already-*materialized* single-occurrence override child (created by a prior "this
 *   event only" edit — drag, single-occurrence save, etc.). This is its OWN row with its
 *   own `id`, distinct from the master's. The backend always sets its `recurrence_rule` to
 *   `''` (empty string) server-side, so that's the reliable signal — `is_recurring` is still
 *   `true` here (derived from `parent_event_id`), which is why treating "is_recurring" as
 *   "target the series" is wrong for this case. Sending `change_type: 'all'` here reassigns
 *   the ENTIRE series while leaving the clicked, already-customized occurrence completely
 *   untouched — confirmed against the real backend while investigating GitHub #105 (a
 *   right-clicked materialized override kept its own task/description, but every other
 *   occurrence in the series silently got the new link instead). The correct write targets
 *   this row specifically: `change_type: 'single'` + this row's own `original_occurrence_start`,
 *   keeping its own start/end (already a concrete slot, not a virtual placeholder).
 *
 * Intentionally avoids OpenAPI barrels so unit tests can load this under
 * `--experimental-strip-types` without directory-import failures.
 */

export type HabitAssignSourceEvent = {
  id: number;
  name: string;
  type?: string | null;
  start_datetime: string;
  end_datetime: string;
  description?: string | null;
  recurrence_rule?: string | null;
  is_recurring?: boolean | string | null;
  original_occurrence_start?: string | null;
  series_start_datetime?: string | null;
  occurrences?: string | null;
};

export type HabitAssignHabit = {
  life_area?: number | null;
};

export type HabitAssignUpdatePayload = {
  id: number;
  name: string;
  type: string;
  start_datetime: string;
  end_datetime: string;
  description?: string;
  recurrence_rule: string | null;
  occurrences?: string | null;
  task: null;
  life_area: number | null;
  project_id: null;
  change_type?: 'single' | 'all';
  occurrence_start?: string;
};

/** What kind of write target a right-clicked tile is — see module doc above. */
export type RecurringAssignScope = 'none' | 'series' | 'materialized-single';

export function classifyRecurringAssignTarget(
  event: Pick<
    HabitAssignSourceEvent,
    'recurrence_rule' | 'original_occurrence_start' | 'is_recurring'
  >,
): RecurringAssignScope {
  // A non-empty recurrence_rule only ever appears on a master row or a virtual occurrence
  // payload built straight from one — never on a materialized override (the backend always
  // sets that row's recurrence_rule to '' — see update_recurring_single's `defaults`).
  if (event.recurrence_rule) return 'series';

  const flag = event.is_recurring;
  const flaggedRecurring = flag === true || (typeof flag === 'string' && flag !== '' && flag !== 'false');
  // is_recurring here is parent_event_id-derived (materialized child), not a series rule —
  // or original_occurrence_start is stamped directly on this row's own model field.
  if (flaggedRecurring || event.original_occurrence_start) return 'materialized-single';

  return 'none';
}

/** @deprecated boolean collapse of classifyRecurringAssignTarget — kept only for the
 * existing test names below; prefer classifyRecurringAssignTarget for new code. */
export function isHabitAssignTargetRecurring(
  event: Pick<
    HabitAssignSourceEvent,
    'recurrence_rule' | 'original_occurrence_start' | 'is_recurring'
  >,
): boolean {
  return classifyRecurringAssignTarget(event) !== 'none';
}

/**
 * Times to send on an Assign PUT.
 *
 * Only a 'series' target remaps to `series_start_datetime` (preserve duration) so DTSTART
 * does not jump to whichever occurrence was clicked. 'none' and 'materialized-single' both
 * keep the row's own start/end — a materialized override's times are already its own
 * concrete slot, not a virtual placeholder standing in for the series anchor.
 */
export function resolveAssignEventTimes(
  event: Pick<HabitAssignSourceEvent, 'start_datetime' | 'end_datetime' | 'series_start_datetime'>,
  scope: RecurringAssignScope,
): { start_datetime: string; end_datetime: string } {
  if (scope !== 'series') {
    return {
      start_datetime: event.start_datetime,
      end_datetime: event.end_datetime,
    };
  }

  const seriesStart = event.series_start_datetime || event.start_datetime;
  const startMs = Date.parse(event.start_datetime);
  const endMs = Date.parse(event.end_datetime);
  const durationMs =
    Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
      ? endMs - startMs
      : 30 * 60 * 1000;
  const seriesStartMs = Date.parse(seriesStart);
  const endIso = Number.isFinite(seriesStartMs)
    ? new Date(seriesStartMs + durationMs).toISOString()
    : event.end_datetime;

  return {
    start_datetime: seriesStart,
    end_datetime: endIso,
  };
}

/** @deprecated 2-arg boolean form — prefer resolveAssignEventTimes(event, scope). */
export function resolveHabitAssignEventTimes(
  event: Pick<HabitAssignSourceEvent, 'start_datetime' | 'end_datetime' | 'series_start_datetime'>,
  recurring: boolean,
): { start_datetime: string; end_datetime: string } {
  return resolveAssignEventTimes(event, recurring ? 'series' : 'none');
}

/**
 * Build the UpdateEvent for assigning a habit onto a calendar event.
 *
 * 'series' targets include `change_type: 'all'` and remapped series times.
 * 'materialized-single' targets include `change_type: 'single'` + this row's own
 * `occurrence_start`, keeping its own times, so the write lands on the clicked override
 * itself instead of reassigning the whole series.
 * 'none' targets omit `change_type` entirely.
 * Description is left undefined when the list row omitted it so an expanded occurrence
 * cannot wipe the series description with `""`.
 */
export function buildHabitAssignUpdatePayload(
  event: HabitAssignSourceEvent,
  habit: HabitAssignHabit,
): HabitAssignUpdatePayload {
  const scope = classifyRecurringAssignTarget(event);
  const times = resolveAssignEventTimes(event, scope);

  const payload: HabitAssignUpdatePayload = {
    id: event.id,
    name: event.name,
    type: event.type ?? 'event',
    start_datetime: times.start_datetime,
    end_datetime: times.end_datetime,
    description: event.description ?? undefined,
    recurrence_rule: event.recurrence_rule ?? null,
    occurrences: event.occurrences ?? undefined,
    task: null,
    life_area: habit.life_area ?? null,
    project_id: null,
  };

  if (scope === 'series') {
    payload.change_type = 'all';
  } else if (scope === 'materialized-single') {
    payload.change_type = 'single';
    payload.occurrence_start = event.original_occurrence_start ?? event.start_datetime;
  }

  return payload;
}

/**
 * Recurring-safe base fields shared by every context-menu Assign update (habit, and
 * task/project/life-area in `calendar-event-assign-menu.tsx`'s `buildUpdatePayload`) — see
 * module doc for the three-way scope this branches on.
 */
export function buildRecurringSafeBaseEventFields(event: HabitAssignSourceEvent): {
  id: number;
  name: string;
  type: string;
  start_datetime: string;
  end_datetime: string;
  description?: string;
  recurrence_rule: string | null;
  occurrences?: string;
  change_type?: 'single' | 'all';
  occurrence_start?: string;
} {
  const scope = classifyRecurringAssignTarget(event);
  const times = resolveAssignEventTimes(event, scope);

  const base = {
    id: event.id,
    name: event.name,
    type: event.type ?? 'event',
    start_datetime: times.start_datetime,
    end_datetime: times.end_datetime,
    description: event.description ?? undefined,
    recurrence_rule: event.recurrence_rule ?? null,
    occurrences: event.occurrences ?? undefined,
  };

  if (scope === 'series') {
    return { ...base, change_type: 'all' as const };
  }
  if (scope === 'materialized-single') {
    return {
      ...base,
      change_type: 'single' as const,
      occurrence_start: event.original_occurrence_start ?? event.start_datetime,
    };
  }
  return base;
}
