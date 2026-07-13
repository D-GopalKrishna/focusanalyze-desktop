/**
 * Multi-event drag helpers (Phase 5).
 *
 * When several calendar events are multi-selected and one is dragged, every selected event moves by
 * the same time delta (D6 — same-delta translation preserves the selection's relative shape). These
 * are pure functions so the delta math and bulk-payload build are unit-testable without FullCalendar.
 *
 * Recurring events in the selection are moved this-occurrence-only: their record is tagged with
 * `change_type="single"` + `occurrence_start` (D5 — a blocking confirm forces this before persisting).
 * The backend applies each record's change_type per row in one atomic transaction.
 */
import type { UpdateEvent } from "@shared/api-client";

/** UpdateEvent plus the write-only recurring fields (the generated type omits them). */
export type MultiDragRecord = UpdateEvent & {
  change_type?: 'single';
  occurrence_start?: string;
};

/** Max events moved in one multi-drag. Matches the backend BulkUpdateEventSerializer.MAX_BULK_SIZE;
 *  we cap rather than chunk so the whole move stays atomic (Phase 5 constraint). */
export const MULTI_DRAG_MAX = 20;

export type MultiDragEvent = {
  id: number;
  name: string;
  start_datetime: string;
  end_datetime: string;
  type?: string | null;
  description?: string | null;
  task?: number | null;
  life_area?: number | null;
  project_id?: number | null;
  recurrence_rule?: string | null;
  is_recurring?: boolean | string | null;
};

/**
 * The read-side shape of a calendar Event, as much of it as we need to build a write payload.
 * Links may arrive either as ids (`task_id`) or nested objects (`task: { id }`), and `project`
 * can even be a bare string on the generated type — we accept all of these loosely.
 */
export type MultiDragSourceEvent = {
  id: number;
  name: string;
  start_datetime: string;
  end_datetime: string;
  type?: string | null;
  description?: string | null;
  task_id?: number | null;
  task?: { id?: number | null } | null;
  life_area_id?: number | null;
  life_area?: { id?: number | null } | null;
  project_id?: number | null;
  project?: { id?: number | null } | string | null;
  recurrence_rule?: string | null;
  is_recurring?: boolean | string | null;
};

export type EventLink = { task: number | null; life_area: number | null; project_id: number | null };

/**
 * Pick EXACTLY ONE of task / life_area / project for a write payload.
 *
 * Why this exists: the read serializer surfaces `project_id`/`project` as a *convenience* that
 * also reflects a task's parent project for display — it is NOT an independent link. Echoing the
 * read payload straight back therefore sends both `task` and `project_id`, which the backend
 * rejects with "Event can be linked to only one of task, project, or life area." So we collapse to
 * a single link with priority **task > life_area > project**, matching the single-drag path in
 * CalendarView.updateEventTimes. Kept here (not inline) so the rule is documented and unit-tested.
 */
export function resolveSingleEventLink(ev: MultiDragSourceEvent): EventLink {
  const taskId = ev.task_id ?? ev.task?.id ?? null;
  const lifeAreaId = ev.life_area_id ?? ev.life_area?.id ?? null;
  const projectId =
    ev.project_id ?? (typeof ev.project === 'object' && ev.project ? (ev.project.id ?? null) : null);

  if (taskId != null) return { task: taskId, life_area: null, project_id: null };
  if (lifeAreaId != null) return { task: null, life_area: lifeAreaId, project_id: null };
  if (projectId != null) return { task: null, life_area: null, project_id: projectId };
  return { task: null, life_area: null, project_id: null };
}

/** Normalize a read-side calendar Event into the flat MultiDragEvent shape, collapsing its links. */
export function toMultiDragEvent(ev: MultiDragSourceEvent): MultiDragEvent {
  const link = resolveSingleEventLink(ev);
  return {
    id: ev.id,
    name: ev.name,
    start_datetime: ev.start_datetime,
    end_datetime: ev.end_datetime,
    type: ev.type ?? 'event',
    description: ev.description ?? '',
    task: link.task,
    life_area: link.life_area,
    project_id: link.project_id,
    recurrence_rule: ev.recurrence_rule ?? null,
    is_recurring: ev.is_recurring,
  };
}

/** ms between a grabbed event's original start and where it was dropped. */
export function computeDragDeltaMs(originalStartIso: string, newStart: Date): number {
  return newStart.getTime() - new Date(originalStartIso).getTime();
}

/** Shift an ISO datetime by a millisecond delta, returning a new ISO string. */
export function shiftIso(iso: string, deltaMs: number): string {
  return new Date(new Date(iso).getTime() + deltaMs).toISOString();
}

export function isRecurringEvent(
  ev: Pick<MultiDragEvent, 'is_recurring' | 'recurrence_rule'>,
): boolean {
  const r = ev.is_recurring;
  if (r === true) return true;
  if (typeof r === 'string') return r !== '' && r !== 'false';
  return Boolean(ev.recurrence_rule && ev.recurrence_rule.length > 0);
}

export function selectionHasRecurring(events: MultiDragEvent[]): boolean {
  return events.some(isRecurringEvent);
}

/**
 * Build the `UpdateEvent[]` for a multi-drag: apply `deltaMs` to every event. Recurring events are
 * moved this-occurrence-only (`change_type="single"` + `occurrence_start` = their original start).
 */
export function buildMultiDragRecords(
  events: MultiDragEvent[],
  deltaMs: number,
): MultiDragRecord[] {
  return events.map((ev) => {
    const rec: MultiDragRecord = {
      id: ev.id,
      name: ev.name,
      type: (ev.type ?? 'event') as UpdateEvent['type'],
      start_datetime: shiftIso(ev.start_datetime, deltaMs),
      end_datetime: shiftIso(ev.end_datetime, deltaMs),
      description: ev.description ?? '',
      task: ev.task ?? null,
      life_area: ev.life_area ?? null,
      project_id: ev.project_id ?? null,
      recurrence_rule: ev.recurrence_rule ?? null,
      occurrences: '[]',
    };
    if (isRecurringEvent(ev)) {
      // This-occurrence-only for recurring events (D5): only the dragged occurrence moves.
      rec.change_type = 'single';
      rec.occurrence_start = ev.start_datetime;
    }
    return rec;
  });
}
