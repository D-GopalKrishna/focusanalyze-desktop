import { moveToProjectBoardView, URL_PARAMS } from '@/lib/config/urls';

/** Next.js route: FocusAnalyze task detail page (numeric ids). */
export function getFocusAnalyzeTaskPageUrl(projectId: number, taskId: number): string {
  return `/dashboard/projects/focusanalyze/${projectId}/task/${taskId}`;
}

/** Next.js route: FocusAnalyze board for a project (id from URL params). */
export function getFocusAnalyzeProjectBoardUrl(projectId: string): string {
  return moveToProjectBoardView(projectId);
}

/** Board URL with deep link to open a task by acronym (replaces legacy `/task/{id}` page). */
export function getFocusAnalyzeBoardUrlWithOpenIssue(
  projectId: string,
  taskAcronym: string,
): string {
  const base = moveToProjectBoardView(projectId);
  return `${base}?${URL_PARAMS.OPEN_ISSUE}=${encodeURIComponent(taskAcronym)}`;
}

/** Board URL that opens a task and scrolls to a specific comment (matches notification deep links). */
export function getFocusAnalyzeBoardUrlWithOpenIssueAndComment(
  projectId: string,
  taskAcronym: string,
  commentUuid: string,
): string {
  const base = moveToProjectBoardView(projectId);
  const params = new URLSearchParams();
  params.set(URL_PARAMS.OPEN_ISSUE, taskAcronym);
  params.set(URL_PARAMS.OPEN_COMMENT, commentUuid);
  return `${base}?${params.toString()}`;
}

/**
 * Gets the current URL with a task acronym added as a query parameter
 * @param taskAcronym - The task acronym to add to the URL
 * @returns The complete URL with the openIssue parameter
 */
export const getTaskLinkUrl = (taskAcronym: string): string => {
  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set(URL_PARAMS.OPEN_ISSUE, taskAcronym);
  return currentUrl.href;
};

/**
 * Updates the current URL with a task acronym as a query parameter
 * @param taskAcronym - The task acronym to add to the URL, or null to remove it
 * @param router - The Next.js router instance to use for navigation
 */
export const updateUrlWithTaskId = (taskAcronym: string | null, router: any): void => {
  const currentUrl = new URL(window.location.href);
  // A whiteboard viewer is always nested under a specific open task — whether the
  // task is closing outright or being swapped for a different one, any whiteboard
  // param left over from the previous task no longer refers to anything reachable
  // and must not survive the switch.
  currentUrl.searchParams.delete(URL_PARAMS.OPEN_WHITEBOARD);
  if (taskAcronym) {
    currentUrl.searchParams.set(URL_PARAMS.OPEN_ISSUE, taskAcronym);
  } else {
    currentUrl.searchParams.delete(URL_PARAMS.OPEN_ISSUE);
    currentUrl.searchParams.delete(URL_PARAMS.OPEN_COMMENT);
    // Regression guard, see GlobalSearch.tsx's `navigateFromSearch` for the fully-documented
    // version of this fix. `useDialogHistoryBack` (lib/hooks/use-dialog-history-back.ts) pushes
    // a `dialogBackGuard` history entry while the task dialog is open and, on close, schedules a
    // `setTimeout(..., 0)` that calls `history.back()` unless that entry has *already* been
    // replaced by the time it fires. `router.replace()` below doesn't call
    // `history.replaceState` synchronously — Next's App Router defers it until the RSC
    // navigation resolves — so for a dialog closed by backdrop-click/Escape (no prefetch to win
    // that race) the guard's timeout routinely fires first, popping the guard entry and
    // resurrecting `openIssue`/`openComment` in the URL instead of clearing them. Stripping the
    // guard from `history.state` synchronously here, before `router.replace`, makes the guard's
    // own check (`currentGuardId() === guardId`) see a mismatch immediately regardless of how
    // long the real navigation takes.
    if (typeof window !== 'undefined') {
      const { dialogBackGuard: _dialogBackGuard, ...rest } = (window.history.state ?? {}) as {
        dialogBackGuard?: number;
        [key: string]: unknown;
      };
      window.history.replaceState(rest, '');
    }
  }
  // Without `scroll: false`, Next.js resets the nearest scrollable ancestor (the board/list
  // ScrollArea) to the top on every navigation — including this query-param-only replace.
  router.replace(currentUrl.pathname + currentUrl.search, { scroll: false });
};

/** Add/remove `openTrack` (numeric track id) while preserving other query params. */
export const updateUrlWithOpenTrack = (trackId: string | null, router: any): void => {
  const currentUrl = new URL(window.location.href);
  if (trackId) {
    currentUrl.searchParams.set(URL_PARAMS.OPEN_TRACK, trackId);
  } else {
    currentUrl.searchParams.delete(URL_PARAMS.OPEN_TRACK);
  }
  router.replace(currentUrl.pathname + currentUrl.search, { scroll: false });
};

/**
 * Add/remove `openWhiteboard` (attachment id) while preserving every other query
 * param, including `openIssue` — the whiteboard viewer nests under whichever task
 * is open, so closing it must never touch the task's own param. The reverse
 * (clearing `openWhiteboard` when the task itself closes/changes) is handled in
 * `updateUrlWithTaskId`, not here, since this function has no way to know the task
 * is going away.
 */
export const updateUrlWithOpenWhiteboard = (attachmentId: string | null, router: any): void => {
  const currentUrl = new URL(window.location.href);
  if (attachmentId) {
    currentUrl.searchParams.set(URL_PARAMS.OPEN_WHITEBOARD, attachmentId);
  } else {
    currentUrl.searchParams.delete(URL_PARAMS.OPEN_WHITEBOARD);
  }
  router.replace(currentUrl.pathname + currentUrl.search, { scroll: false });
};
