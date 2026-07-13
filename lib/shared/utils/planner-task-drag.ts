import type { EventInput } from '@fullcalendar/core';
import type { EventReceiveArg } from '@fullcalendar/interaction';

/** Last sidebar task drag — fallback when FullCalendar drops extendedProps on receive. */
export type ActivePlannerTaskDrag = {
  taskId: number;
  taskName: string;
  startedAt: number;
};

export type PendingExternalEvent = {
  clientKey: string;
  name: string;
  start: Date;
  end: Date;
  taskId: number;
};

export const activePlannerTaskDragRef: { current: ActivePlannerTaskDrag | null } = {
  current: null,
};

/** Receive always follows drag end within milliseconds; keep a short fallback window. */
export const ACTIVE_PLANNER_DRAG_MS = 10_000;

const PLANNER_TASK_SELECTOR = '[data-planner-task-draggable="true"]';

export function parsePlannerTaskId(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
  }
  return null;
}

function taskIdFromExtendedProps(ext: Record<string, unknown>): number | null {
  return (
    parsePlannerTaskId(ext.plannerTaskId) ??
    parsePlannerTaskId(ext.taskId) ??
    parsePlannerTaskId(ext.task_id)
  );
}

export function readPlannerTaskIdFromEl(el: Element | null | undefined): number | null {
  const root = el?.closest?.(PLANNER_TASK_SELECTOR);
  if (!root) return null;
  return parsePlannerTaskId(root.getAttribute('data-task-id'));
}

function hasRecentSidebarDrag(now = Date.now()): boolean {
  const active = activePlannerTaskDragRef.current;
  return active != null && now - active.startedAt <= ACTIVE_PLANNER_DRAG_MS;
}

export type ExternalTaskReceiveClassification =
  | { kind: 'misrouted' }
  | { kind: 'invalid'; reason: 'missing_task_id' }
  | { kind: 'valid'; taskId: number; taskName: string };

/** Single pass: detect misrouted receives and resolve the planner task id. */
export function classifyExternalTaskReceive(
  info: EventReceiveArg,
  now = Date.now(),
): ExternalTaskReceiveClassification {
  const ext = (info.event.extendedProps ?? {}) as Record<string, unknown>;

  if (ext.originalId || ext.isDraftPlan || ext.isProposed || ext.pendingExternalCreate) {
    return { kind: 'misrouted' };
  }

  const taskIdFromProps = taskIdFromExtendedProps(ext);
  const draggedEl = info.draggedEl as HTMLElement | undefined;
  const fromSidebar = Boolean(draggedEl?.closest?.(PLANNER_TASK_SELECTOR));
  const recentSidebarDrag = hasRecentSidebarDrag(now);
  const taskIdFromDom = fromSidebar ? readPlannerTaskIdFromEl(draggedEl) : null;
  const taskIdFromDragRef =
    recentSidebarDrag && activePlannerTaskDragRef.current
      ? activePlannerTaskDragRef.current.taskId
      : null;

  const taskId = taskIdFromProps ?? taskIdFromDom ?? taskIdFromDragRef;
  if (taskId != null) {
    const taskName =
      (typeof ext.taskName === 'string' && ext.taskName) ||
      activePlannerTaskDragRef.current?.taskName ||
      info.event.title ||
      'Task';
    return { kind: 'valid', taskId, taskName };
  }

  if (fromSidebar || recentSidebarDrag) {
    return { kind: 'invalid', reason: 'missing_task_id' };
  }

  return { kind: 'misrouted' };
}

export function buildExternalCreateKey(taskId: number, start: Date): string {
  return `${taskId}|${start.getTime()}`;
}

export function pendingExternalEventsToCalendarInputs(
  pending: readonly PendingExternalEvent[],
): EventInput[] {
  return pending.map((p) => ({
    id: p.clientKey,
    title: p.name,
    start: p.start,
    end: p.end,
    allDay: false,
    display: 'block',
    extendedProps: {
      plannerTaskId: p.taskId,
      taskId: p.taskId,
      pendingExternalCreate: true,
      taskName: p.name,
    },
  }));
}
