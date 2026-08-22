import type { Event, PlanSnapshot } from "@shared/api-client";

import type { DraftPlanBlock } from "@shared/types/dashboard/planning";
import { normalizePlanBlock } from "@shared/utils/plan-period";
import { resolveSingleEventLink, type MultiDragSourceEvent } from "@shared/utils/multi-drag";

/**
 * Whether a live Event participates in a recurring series — either the expanded/virtual
 * occurrence of a series master (`recurrence_rule` set) or an already-materialized single-
 * occurrence override (`original_occurrence_start` set, `recurrence_rule` cleared on the child
 * row itself). Both need occurrence identity; a genuinely standalone event needs none.
 */
function isRecurringSeriesEvent(ev: Pick<Event, 'recurrence_rule' | 'original_occurrence_start'>): boolean {
  return (
    (typeof ev.recurrence_rule === 'string' && ev.recurrence_rule.trim() !== '') ||
    Boolean(ev.original_occurrence_start)
  );
}

/**
 * Stable occurrence identity for a live recurring Event, or `null` for a non-recurring one.
 *
 * The resolution — "the virtual slot in the series, not the moved time after a prior single-
 * occurrence edit" — is the SAME rule `resolveOccurrenceStartForUpdate` in
 * `lib/utils/recurring-events.ts` implements for the app's existing (non-planning) recurring-edit
 * path; deliberately reimplemented inline here rather than imported, because that module also
 * value-imports `ChangeTypeEnum` from the generated `rest_client_backend` client, whose
 * constructor-property-shorthand syntax Node's built-in TS stripping can't parse — pulling it in
 * would make this otherwise-pure module untestable under plain `node --test`. Keep both in sync
 * if this rule ever changes.
 */
export function occurrenceStartForLiveEvent(
  ev: Pick<Event, 'recurrence_rule' | 'original_occurrence_start' | 'start_datetime'>,
): string | null {
  if (!isRecurringSeriesEvent(ev)) return null;
  return ev.original_occurrence_start ?? ev.start_datetime ?? null;
}

/** Composite key distinguishing one occurrence of a series from its siblings (they all share
 * `event_id`). Non-recurring blocks/events pass `occurrenceStart: null`, giving a key equivalent
 * to the bare event id. Exported so CalendarView's render-dedupe/suppression logic (and the
 * planning-mode drag handler) key off the exact same identity fold/save use. */
export function occurrenceKey(eventId: number, occurrenceStart: string | null | undefined): string {
  return `${eventId}|${occurrenceStart ?? ''}`;
}

export function draftBlocksToApiPayload(blocks: DraftPlanBlock[]) {
  return blocks.map((b) => ({
    id: b.id,
    name: b.name,
    start_datetime: b.start_datetime,
    end_datetime: b.end_datetime,
    task_id: b.task_id ?? null,
    project_id: b.project_id ?? null,
    life_area_id: b.life_area_id ?? null,
    description: b.description ?? '',
    event_id: b.event_id ?? null,
    occurrence_start: b.occurrence_start ?? null,
  }));
}

export function apiDraftToDraftBlocks(snapshot: PlanSnapshot): DraftPlanBlock[] {
  const payload = snapshot.draft_payload as { blocks?: Array<Record<string, unknown>> } | undefined;
  const blocks = payload?.blocks ?? [];
  return blocks.map((b, i) =>
    normalizePlanBlock({
      id: String(b.id ?? `draft-${i}`),
      name: String(b.name ?? 'Planned block'),
      start_datetime: String(b.start_datetime),
      end_datetime: String(b.end_datetime),
      task_id: typeof b.task_id === 'number' ? b.task_id : null,
      project_id: typeof b.project_id === 'number' ? b.project_id : null,
      life_area_id: typeof b.life_area_id === 'number' ? b.life_area_id : null,
      description: typeof b.description === 'string' ? b.description : '',
      event_id: typeof b.event_id === 'number' ? b.event_id : null,
      occurrence_start: typeof b.occurrence_start === 'string' ? b.occurrence_start : null,
      source: 'manual',
    }),
  );
}

/**
 * Reconcile draft blocks against live Events by occurrence identity — the SHARED "live wins on
 * hydrate" logic behind both seed paths (committed snapshot AND in-progress server draft;
 * planning-correctness-followups/03). A block without `event_id` passes through untouched
 * (draft-only, never committed — nothing to reconcile). A block WITH `event_id`:
 *
 *   - live match found (by `event_id` + `occurrence_start`, so recurring occurrences don't
 *     collapse onto whichever sibling happened to be last in `liveEvents`) → its
 *     start/end/name are OVERWRITTEN from the live Event. If the reconciled position now falls
 *     outside the plan period (the event was dragged to a different day/week outside planning
 *     mode since this draft was left), the block is DROPPED rather than kept where it would trip
 *     `savePlanningMode`'s own out-of-period guard.
 *   - no live match, and `liveEvents` was actually supplied (i.e. we have real data to judge by)
 *     → DROPPED: orphaned, its Event was deleted independently of planning mode — nothing left
 *     to represent.
 *
 * When `liveEvents` is omitted (caller couldn't establish live data, e.g. no CalendarProvider
 * ancestor), every block is returned unchanged — we only drop or reposition a block when we
 * actually have live data to justify it.
 */
export function reconcileDraftBlocksWithLive(
  blocks: DraftPlanBlock[],
  liveEvents: Event[] | undefined,
  isInPeriod: (block: DraftPlanBlock) => boolean,
): DraftPlanBlock[] {
  if (!liveEvents) return blocks;
  const liveByKey = new Map(liveEvents.map((e) => [occurrenceKey(e.id, occurrenceStartForLiveEvent(e)), e]));

  const reconciled: (DraftPlanBlock | null)[] = blocks.map((b) => {
    if (b.event_id == null) return b;
    const live = liveByKey.get(occurrenceKey(b.event_id, b.occurrence_start ?? null));
    if (!live) return null; // orphaned: its Event was deleted outside planning mode — drop, don't fabricate
    const updated = normalizePlanBlock<DraftPlanBlock>({ ...b, name: live.name, start_datetime: live.start_datetime, end_datetime: live.end_datetime });
    if (!isInPeriod(updated)) return null; // moved outside the plan period since this draft was left
    return updated;
  });
  return reconciled.filter((b): b is DraftPlanBlock => b !== null);
}

/**
 * Seed an edit draft from a *committed* plan snapshot's own `payload.blocks` (as
 * opposed to `apiDraftToDraftBlocks`, which reads an in-progress `draft_payload`).
 * Used when entering replan mode for a period that has no leftover draft — without
 * this, the draft would start empty and a partial re-plan would silently drop every
 * previously-saved block that the edit session never touched.
 *
 * `liveEvents` + `isInPeriod`, when provided, run the snapshot's blocks through
 * `reconcileDraftBlocksWithLive` (see its docstring) instead of trusting the frozen snapshot
 * payload verbatim — a block dragged to a different day/time outside planning mode since the
 * last commit would otherwise render at its stale, originally-planned position
 * (replan-draft-reconciliation Phase 2).
 */
export function committedSnapshotToDraftBlocks(
  snapshot: PlanSnapshot,
  liveEvents?: Event[],
  isInPeriod: (block: DraftPlanBlock) => boolean = () => true,
): DraftPlanBlock[] {
  const payload = snapshot.payload as { blocks?: Array<Record<string, unknown>> } | undefined;
  const blocks = payload?.blocks ?? [];
  const seeded = blocks
    .filter((b) => b.start_datetime && b.end_datetime)
    .map((b, i) =>
      normalizePlanBlock<DraftPlanBlock>({
        id: String(b.id ?? `plan-${i}`),
        name: String(b.name ?? 'Planned block'),
        start_datetime: String(b.start_datetime),
        end_datetime: String(b.end_datetime),
        task_id: typeof b.task_id === 'number' ? b.task_id : null,
        project_id: typeof b.project_id === 'number' ? b.project_id : null,
        life_area_id: typeof b.life_area_id === 'number' ? b.life_area_id : null,
        description: typeof b.description === 'string' ? b.description : '',
        event_id: typeof b.event_id === 'number' ? b.event_id : null,
        occurrence_start: typeof b.occurrence_start === 'string' ? b.occurrence_start : null,
        source: 'manual' as const,
      }),
    );
  return reconcileDraftBlocksWithLive(seeded, liveEvents, isInPeriod);
}

/** Event types that are never scheduled work — mirrors the backend's NON_WORK_EVENT_TYPES
 * exclusion in `scheduled_work_events_queryset` (break / reminder / out-of-office). */
const NON_PLAN_EVENT_TYPES = new Set(['break', 'reminder', 'out_of_office']);

/**
 * Turn a live calendar `Event` into a draft block that tracks it. Carries the `event_id` so a
 * later commit updates that Event in place instead of creating a duplicate. Links collapse to a
 * single one with task > life_area > project precedence via `resolveSingleEventLink`, matching the
 * drag-into-plan path in `CalendarView`. For a recurring occurrence, also carries
 * `occurrence_start` — the stable identity distinguishing it from sibling occurrences that share
 * the same `event_id`.
 */
export function liveEventToDraftBlock(ev: Event): DraftPlanBlock {
  const link = resolveSingleEventLink(ev as unknown as MultiDragSourceEvent);
  const occurrenceStart = occurrenceStartForLiveEvent(ev);
  return normalizePlanBlock<DraftPlanBlock>({
    id: occurrenceStart ? `live-${ev.id}-${occurrenceStart}` : `live-${ev.id}`,
    name: ev.name,
    start_datetime: ev.start_datetime,
    end_datetime: ev.end_datetime,
    task_id: link.task,
    project_id: link.project_id,
    life_area_id: link.life_area,
    description: ev.description ?? '',
    event_id: ev.id,
    occurrence_start: occurrenceStart,
    source: 'manual',
  });
}

/** Whether a live Event is eligible to be folded into a plan draft on entry. All-day holds,
 * break/reminder/OOO, and untimed rows are excluded. Recurring occurrences ARE foldable — each
 * folds in as its own block, identified by `(event_id, occurrence_start)` so siblings don't
 * collide (planning-correctness-followups/02). */
function isFoldableLiveEvent(ev: Event): boolean {
  if (ev.is_all_day) return false;
  if (NON_PLAN_EVENT_TYPES.has(String(ev.type ?? 'event'))) return false;
  return Boolean(ev.start_datetime && ev.end_datetime);
}

/**
 * Union the seeded draft blocks (from a prior committed snapshot / in-progress draft) with the
 * live calendar events present in the plan period that aren't already represented. Without this,
 * events created OUTSIDE planning mode are drawn on the calendar but never enter `draftBlocks`, so
 * "Save plan" silently records only a subset of what's actually on the day/week.
 *
 * A live event is folded in only when: (1) its occurrence identity `(event_id, occurrence_start)`
 * isn't already represented by a seed block — for a recurring series this means each occurrence
 * (Mon/Tue/Wed…) is checked independently, not collapsed onto the bare `event_id`, (2)
 * `isInPeriod(block)` is true (`savePlanningMode` refuses out-of-period blocks, so folding one
 * would break Save), and (3) it's foldable per `isFoldableLiveEvent`. The predicate is injected so
 * this stays a pure function testable without the planning-mode scope/period state.
 */
export function foldLiveEventsIntoDraft(
  seedBlocks: DraftPlanBlock[],
  liveEvents: Event[] | undefined,
  isInPeriod: (block: DraftPlanBlock) => boolean,
): DraftPlanBlock[] {
  if (!liveEvents?.length) return seedBlocks;
  const represented = new Set(
    seedBlocks
      .filter((b): b is DraftPlanBlock & { event_id: number } => b.event_id != null)
      .map((b) => occurrenceKey(b.event_id, b.occurrence_start)),
  );
  const extras: DraftPlanBlock[] = [];
  for (const ev of liveEvents) {
    const key = occurrenceKey(ev.id, occurrenceStartForLiveEvent(ev));
    if (represented.has(key)) continue;
    if (!isFoldableLiveEvent(ev)) continue;
    const block = liveEventToDraftBlock(ev);
    if (!isInPeriod(block)) continue;
    extras.push(block);
    represented.add(key);
  }
  return extras.length ? [...seedBlocks, ...extras] : seedBlocks;
}

export function serializeDraftBlocksForCompare(blocks: DraftPlanBlock[]): string {
  return JSON.stringify(draftBlocksToApiPayload(blocks));
}
