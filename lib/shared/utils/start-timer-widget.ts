/**
 * Shared helper to launch the global timer widget for a calendar event.
 *
 * The timer widget (`components/widget/timer-widget.tsx`) listens for a window
 * `CustomEvent('focusanalyze:timerwidget:start')` and counts down to the event's end.
 * This is the single place that builds + dispatches that event so callers
 * (quick-event dialog, "Start working"/Activate flow, …) stay in sync.
 */

export const TIMER_WIDGET_START_EVENT = 'focusanalyze:timerwidget:start';
export const TIMER_WIDGET_STOP_EVENT = 'focusanalyze:timerwidget:stop';

const TIMER_WIDGET_STORAGE_KEY = 'focusanalyze.timerWidget';

import { parseTaskWorkSessionEvents } from "@shared/utils/task-work-session";
import { getEventById, updateEvent } from "@shared/services/api/dashboard/Calendar";
import { Type2cdEnum, ChangeTypeEnum } from "@shared/api-client";

export type TimerWidgetAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
  kind?: 'dialog' | 'control';
};

export type StartTimerWidgetArgs = {
  /** ISO start of the event. If in the future, the timer is not started. */
  startAtIso: string;
  /** ISO end of the event; the countdown runs until this instant. */
  endAtIso: string;
  title?: string;
  /** Linked calendar event id — enables the widget's "Extend" to PATCH the event. */
  eventId?: number;
  /** Linked task id — used to stop the timer when the task is deleted. */
  taskId?: number;
  anchor?: TimerWidgetAnchor;
};

export type StopTimerWidgetArgs = {
  eventId?: number;
  eventIds?: number[];
  taskId?: number;
  /** When true, stop even if no event/task filter matches (full reset). */
  force?: boolean;
};

/**
 * Dispatch the widget-start event for a calendar event.
 *
 * Mirrors the guards from the original `startTimerWidgetUntilEnd()`:
 * - returns `false` (no-op) if the event hasn't started yet, or
 * - returns `false` if there is no time left to run.
 *
 * Returns `true` when a countdown was actually started.
 */
export function startTimerWidget(args: StartTimerWidgetArgs): boolean {
  if (typeof window === 'undefined') return false;

  const start = new Date(args.startAtIso);
  if (Number.isFinite(start.getTime()) && start.getTime() > Date.now()) {
    // Event scheduled for later — the countdown is only meaningful once it starts.
    return false;
  }

  const end = new Date(args.endAtIso);
  const secondsLeft = Math.max(0, Math.floor((end.getTime() - Date.now()) / 1000));
  if (secondsLeft <= 0) return false;

  window.dispatchEvent(
    new CustomEvent(TIMER_WIDGET_START_EVENT, {
      detail: {
        seconds: secondsLeft,
        title: args.title,
        startAtIso: args.startAtIso,
        endAtIso: args.endAtIso,
        eventId: args.eventId,
        taskId: args.taskId,
        anchor: args.anchor,
      },
    }),
  );
  return true;
}

/** Stop the global timer widget when its linked task/event is removed. */
export function stopTimerWidget(args: StopTimerWidgetArgs = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TIMER_WIDGET_STOP_EVENT, { detail: args }));
}

/** Stop the timer when a task is deleted (matches by task id and/or linked event ids). */
export function stopTimerWidgetForTask(task: { id: number; events?: unknown }): void {
  const eventIds = parseTaskWorkSessionEvents(task).map((event) => event.id);
  stopTimerWidget({
    taskId: task.id,
    ...(eventIds.length > 0 ? { eventIds } : {}),
  });
}

export type PersistTimerWidgetExtendArgs = {
  eventId: number;
  /** New end time, as an ISO string. */
  newEndIso: string;
  /**
   * The occurrence's own original start (the value the timer was started with) —
   * needed to safely target one occurrence of a recurring series without touching
   * the rest of it. Falls back to the fetched event's own start when omitted.
   */
  occurrenceStartIso?: string | null;
};

/**
 * Persist a timer-widget "+N min" extend to the linked calendar event's real end time.
 *
 * This is deliberately callable from anywhere (no dependency on `CalendarView` being
 * mounted): the timer widget itself calls this directly, because it previously relied
 * on a `CalendarView`-only window-event listener to PATCH the event, which meant
 * extending from any non-calendar page silently never reached the server (the
 * countdown grew locally; the real event never moved).
 *
 * For a recurring occurrence (the fetched event has a `recurrence_rule`), the update
 * is scoped to `change_type: 'single'` so extending one occurrence's timer doesn't
 * rewrite the whole series — the backend already supports this on `PUT /api/event/:id/`
 * the same way it does for delete.
 */
export async function persistTimerWidgetExtend({
  eventId,
  newEndIso,
  occurrenceStartIso,
}: PersistTimerWidgetExtendArgs): Promise<void> {
  const original = await getEventById(eventId);
  if (!original) throw new Error(`Timer widget extend: event ${eventId} not found`);

  const linkPayload =
    original.task_id != null
      ? { task: original.task_id, life_area: null, project_id: null }
      : original.life_area_id != null
        ? { task: null, life_area: original.life_area_id, project_id: null }
        : original.project_id != null
          ? { task: null, life_area: null, project_id: original.project_id }
          : { task: null, life_area: null, project_id: null };

  const isRecurring = Boolean(original.recurrence_rule);
  // For a recurring occurrence, `GET /api/event/:id/` returns the SERIES MASTER row
  // (virtual occurrences reuse the master's id) — its own `start_datetime` is the
  // master's first/original slot, not the specific occurrence this timer is tracking.
  // The backend's single-occurrence update takes the request's `start_datetime` as the
  // occurrence's own new start verbatim, so sending the master's start here would
  // silently materialize (or move) the WRONG occurrence. Use the timer's own tracked
  // occurrence start instead — it's unchanged by an extend (only the end moves).
  const occurrenceOwnStart =
    (isRecurring && (occurrenceStartIso || original.original_occurrence_start)) ||
    original.start_datetime;

  await updateEvent({
    id: eventId,
    name: original.name,
    type: original.type ?? Type2cdEnum.Event,
    start_datetime: occurrenceOwnStart,
    end_datetime: newEndIso,
    description: original.description || '',
    ...linkPayload,
    recurrence_rule: original.recurrence_rule ?? null,
    occurrences: original.occurrences ?? '[]',
    ...(isRecurring
      ? {
          change_type: ChangeTypeEnum.Single,
          occurrence_start: occurrenceOwnStart,
        }
      : {}),
  });
}

/**
 * Best-effort check for whether a timer is currently running, so callers can prompt
 * "you're timing another task — switch?" before replacing it. Reads the widget's
 * persisted state (the widget is a single global instance, so a new timer replaces
 * the current one).
 */
export function isTimerWidgetRunning(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(TIMER_WIDGET_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { isRunning?: unknown; isVisible?: unknown };
    return parsed?.isRunning === true && parsed?.isVisible === true;
  } catch {
    return false;
  }
}
