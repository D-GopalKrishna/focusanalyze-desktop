/**
 * Companion engine events. Any active pixel companion cheers on task-complete.
 * Keep this module free of React so API services can dispatch without pulling
 * the dashboard UI.
 */

export const COMPANION_TASK_COMPLETE_EVENT = 'fa-companion-task-complete';

export function notifyCompanionTaskComplete(taskName?: string | null): void {
  // React Native aliases `global.window = global` (see setUpGlobals.js), so the
  // `typeof window === 'undefined'` guard alone doesn't catch that runtime — but
  // RN has no CustomEvent/dispatchEvent global, so this would otherwise throw on
  // every task completion on mobile. Guard both; mobile's cheer-on-complete is a
  // separate, not-yet-built event bridge (see ui-companion-extensions/plan.md).
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(COMPANION_TASK_COMPLETE_EVENT, {
      detail: { taskName: taskName?.trim() || undefined },
    }),
  );
}
