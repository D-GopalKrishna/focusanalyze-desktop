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
  if (taskAcronym) {
    currentUrl.searchParams.set(URL_PARAMS.OPEN_ISSUE, taskAcronym);
  } else {
    currentUrl.searchParams.delete(URL_PARAMS.OPEN_ISSUE);
  }
  router.replace(currentUrl.pathname + currentUrl.search);
};

/** Add/remove `openTrack` (numeric track id) while preserving other query params. */
export const updateUrlWithOpenTrack = (trackId: string | null, router: any): void => {
  const currentUrl = new URL(window.location.href);
  if (trackId) {
    currentUrl.searchParams.set(URL_PARAMS.OPEN_TRACK, trackId);
  } else {
    currentUrl.searchParams.delete(URL_PARAMS.OPEN_TRACK);
  }
  router.replace(currentUrl.pathname + currentUrl.search);
};
