import { format } from 'date-fns';

import type { Task, TaskPriority, TaskProjectColumn } from "@shared/api-client";
import {
  getFocusAnalyzeBoardUrlWithOpenIssue,
  getFocusAnalyzeBoardUrlWithOpenIssueAndComment,
} from "@shared/utils/navigations";

/**
 * Full URL for copying/sharing: project board with `openIssue` set to the task acronym.
 * Uses `fallback` when project id or acronym is missing/invalid.
 */
export function getFocusAnalyzeTaskPageClipboardText(
  projectId: string | number | undefined,
  taskAcronym: string | undefined | null,
  fallback: string,
): string {
  const pid =
    typeof projectId === 'number'
      ? projectId
      : projectId != null && projectId !== ''
        ? parseInt(String(projectId), 10)
        : NaN;
  const acronym = typeof taskAcronym === 'string' ? taskAcronym.trim() : '';
  if (Number.isNaN(pid) || !acronym) {
    return fallback;
  }
  const path = getFocusAnalyzeBoardUrlWithOpenIssue(String(pid), acronym);
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`;
  }
  return path;
}

/** Full URL for copying/sharing a task comment deep link (board + openIssue + comment). */
export function getFocusAnalyzeTaskCommentClipboardText(
  projectId: string | number | undefined,
  taskAcronym: string | undefined | null,
  commentUuid: string | undefined | null,
  fallback: string,
): string {
  const pid =
    typeof projectId === 'number'
      ? projectId
      : projectId != null && projectId !== ''
        ? parseInt(String(projectId), 10)
        : NaN;
  const acronym = typeof taskAcronym === 'string' ? taskAcronym.trim() : '';
  const uuid = typeof commentUuid === 'string' ? commentUuid.trim() : '';
  if (Number.isNaN(pid) || !acronym || !uuid) {
    return fallback;
  }
  const path = getFocusAnalyzeBoardUrlWithOpenIssueAndComment(String(pid), acronym, uuid);
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`;
  }
  return path;
}

/**
 * Activity `date` from the API is strftime'd on the server (often UTC). Prefer `timestamp` ISO for local display.
 */
export function formatActivityLogDisplayTime(
  timestamp: string | undefined,
  serverFormattedFallback: string,
): string {
  if (!timestamp) return serverFormattedFallback;
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return serverFormattedFallback;
  return format(d, 'MMM d, yyyy, h:mm a');
}

/**
 * Mirrors API `can_delete`: hide delete affordances when the backend marks the task read-only for deletes.
 * Absent/`true` preserves legacy payloads (show delete unless explicitly denied).
 */
export function taskCanDelete(task: Task | { can_delete?: boolean | null }): boolean {
  return (task as { can_delete?: boolean | null }).can_delete !== false;
}

/**
 * Workflow column id from `task.status`. Task payloads use a nested {@link TaskProjectColumn}; use `null` when unset.
 */
export function taskStatusColumnIdFromApi(task: {
  status?: TaskProjectColumn | null;
}): number | null {
  return task.status?.id ?? null;
}

/**
 * Nested priority when set (`TaskPriority` from the API); `null` when the task has no priority.
 */
export function taskPriorityFromApi(task: { priority?: TaskPriority | null }): TaskPriority | null {
  return task.priority ?? null;
}

/** Priority id when set; symmetric with {@link taskStatusColumnIdFromApi}. */
export function taskPriorityIdFromApi(task: { priority?: TaskPriority | null }): number | null {
  return task.priority?.id ?? null;
}
