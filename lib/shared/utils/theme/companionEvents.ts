/**
 * Companion engine events. Any active pixel companion cheers on task-complete.
 * Keep this module free of React so API services can dispatch without pulling
 * the dashboard UI.
 */

export const COMPANION_TASK_COMPLETE_EVENT = 'fa-companion-task-complete';

export function notifyCompanionTaskComplete(taskName?: string | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(COMPANION_TASK_COMPLETE_EVENT, {
      detail: { taskName: taskName?.trim() || undefined },
    }),
  );
}
