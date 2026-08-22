/**
 * Maps an `action_results` receipt to a product surface to navigate to (Phase 1.3).
 *
 * Reuses the calendar navigate/refetch atoms (`calendarNavigateAtom` / `calendarRefetchAtom`,
 * `lib/state/calendarCommandAtom.ts`) and `moveToProjectBoardView` (`lib/config/urls.ts`) —
 * the same helpers `FocusAIChatCore.triggerCalendarProposals` and
 * `HITLApprovalCard` / proposal resume already use for calendar/project navigation after an
 * approve. A generic typed command bus (Phase 3) will replace this, but Phase 1 stays wired
 * to what already exists rather than introducing parallel navigation state.
 */
import {
  collectRefreshHints,
  firstNavigateToHint,
  type ActionReceipt,
} from "@shared/utils/focusai/actionReceipts";
import type { Destination } from "@shared/api-client";
import { moveToProjectBoardView } from '@/lib/config/urls';
import { openDestination } from "@shared/utils/focusai/destinations";

export type ReceiptEntityType =
  | 'task'
  | 'task_type'
  | 'task_priority'
  | 'event'
  | 'life_area'
  | 'project'
  | 'track'
  | 'habit'
  | 'deleted'
  | null;

export interface ReceiptEntity {
  type: ReceiptEntityType;
  id?: number | string;
  name?: string;
  projectId?: number | string;
  startDatetime?: string;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? (value as Record<string, any>) : {};
}

/** Best-effort entity extraction from a receipt's raw tool `result` payload. */
export function extractReceiptEntity(receipt: ActionReceipt): ReceiptEntity {
  const result = asRecord(receipt.result);

  if (result.task) {
    const task = asRecord(result.task);
    return {
      type: 'task',
      id: task.id,
      name: task.name,
      projectId: task.project_id ?? task.project,
    };
  }
  if (result.task_type) {
    const taskType = asRecord(result.task_type);
    return {
      type: 'task_type',
      id: taskType.id,
      name: taskType.name,
      projectId: taskType.project_id ?? taskType.project,
    };
  }
  if (result.task_priority) {
    const priority = asRecord(result.task_priority);
    return { type: 'task_priority', id: priority.id, name: priority.name };
  }
  if (result.event) {
    const event = asRecord(result.event);
    return { type: 'event', id: event.id, name: event.name, startDatetime: event.start_datetime };
  }
  if (result.life_area) {
    const lifeArea = asRecord(result.life_area);
    return { type: 'life_area', id: lifeArea.id, name: lifeArea.name };
  }
  if (result.track) {
    const track = asRecord(result.track);
    const project = track.project_id ?? track.project;
    return {
      type: 'track',
      id: track.id,
      name: track.name,
      projectId:
        typeof project === 'object' && project != null
          ? (project as { id?: number }).id
          : project,
    };
  }
  if (result.habit) {
    const habit = asRecord(result.habit);
    return { type: 'habit', id: habit.id, name: habit.name };
  }
  if (result.project) {
    const project = asRecord(result.project);
    return { type: 'project', id: project.id, name: project.name };
  }
  if (Array.isArray(result.tasks) && result.tasks.length > 0) {
    const first = asRecord(result.tasks[0]);
    return {
      type: 'task',
      id: first.id,
      name:
        result.count != null
          ? `${result.count} tasks`
          : first.name,
      projectId: first.project_id ?? asRecord(first.project).id ?? first.project,
    };
  }
  if (result.deleted_id !== undefined) {
    return { type: 'deleted', id: result.deleted_id };
  }
  return { type: null };
}

export interface ReceiptNavigationTarget {
  kind: 'destination' | 'calendar' | 'project_board' | null;
  destination?: Destination;
  /** Route to push for `project_board`. */
  href?: string;
  /** Date to jump the calendar to for `calendar`. */
  date?: Date;
}

/** Where approving this receipt's action should take the user, if anywhere. */
export function navigationTargetForReceipt(receipt: ActionReceipt): ReceiptNavigationTarget {
  // Prefer the backend's own client_hint (focusgpt/utils/client_hint.py) — it's computed from
  // the real entities the mutation touched, and covers shapes (e.g. bulk `result.tasks`) the
  // raw-shape guessing below doesn't handle.
  const navigateTo = firstNavigateToHint([receipt]);
  if (navigateTo) {
    return { kind: 'destination', destination: navigateTo };
  }

  const entity = extractReceiptEntity(receipt);

  if (entity.type === 'event' && entity.startDatetime) {
    const date = new Date(entity.startDatetime);
    if (!Number.isNaN(date.getTime())) {
      return { kind: 'calendar', date };
    }
  }
  if (entity.type === 'project' && entity.id != null) {
    return { kind: 'project_board', href: moveToProjectBoardView(String(entity.id)) };
  }
  if ((entity.type === 'task' || entity.type === 'task_type') && entity.projectId != null) {
    return { kind: 'project_board', href: moveToProjectBoardView(String(entity.projectId)) };
  }
  return { kind: null };
}

export interface CalendarNavigationSetters {
  setCalendarNavigate: (date: Date) => void;
  setCalendarRefetch: (cmd: { from: string; to: string; seq: number }) => void;
}

/** Imperatively apply a receipt's navigation target — calendar jump+refetch, or a router push. */
export function applyReceiptNavigation(
  receipt: ActionReceipt,
  setters: CalendarNavigationSetters & { push: (href: string) => void },
  currentDashboardPath?: string,
): void {
  const target = navigationTargetForReceipt(receipt);
  if (target.kind === 'destination' && target.destination) {
    openDestination(target.destination, setters, currentDashboardPath);
    return;
  }
  if (target.kind === 'calendar' && target.date) {
    setters.setCalendarNavigate(target.date);
    const from = new Date(target.date);
    from.setDate(from.getDate() - 1);
    const to = new Date(target.date);
    to.setDate(to.getDate() + 7);
    setters.setCalendarRefetch({ from: from.toISOString(), to: to.toISOString(), seq: Date.now() });
    return;
  }
  if (target.kind === 'project_board' && target.href) {
    setters.push(target.href);
  }
}

export interface ClientHintApplyOptions {
  receipts: ActionReceipt[];
  currentProjectId?: number | string | null;
  reloadProjects: () => void;
  reloadCurrentProject: () => void;
  setCalendarRefetch?: (cmd: { from: string; to: string; seq: number }) => void;
}

/**
 * After a successful HITL resume: refresh sidebar / current board / calendar data.
 * Does **not** auto-navigate — Open / Go to project buttons on receipt rows own that.
 */
export function applyClientHintsAfterResume(options: ClientHintApplyOptions): void {
  const {
    receipts,
    currentProjectId,
    reloadProjects,
    reloadCurrentProject,
    setCalendarRefetch,
  } = options;

  const refreshTargets = collectRefreshHints(receipts);
  const navigateTo = firstNavigateToHint(receipts);

  const touchesProjectList =
    refreshTargets.some((t) => t.kind === 'project') ||
    navigateTo?.kind === 'project' ||
    navigateTo?.kind === 'project_board' ||
    navigateTo?.kind === 'track' ||
    navigateTo?.kind === 'task' ||
    navigateTo?.kind === 'task_comment';

  if (touchesProjectList) {
    reloadProjects();
  }

  if (
    currentProjectId != null &&
    refreshTargets.some(
      (t) => t.kind === 'project' && String(t.project_id) === String(currentProjectId),
    )
  ) {
    reloadCurrentProject();
  }

  if (refreshTargets.some((t) => t.kind === 'calendar') && setCalendarRefetch) {
    const anchor = new Date();
    const from = new Date(anchor);
    from.setDate(from.getDate() - 1);
    const to = new Date(anchor);
    to.setDate(to.getDate() + 7);
    setCalendarRefetch({ from: from.toISOString(), to: to.toISOString(), seq: Date.now() });
  }
}
