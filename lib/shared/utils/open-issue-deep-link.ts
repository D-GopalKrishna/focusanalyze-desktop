/**
 * What a project view should do about an `openIssue` deep link (GR-1268).
 *
 * All three project views (board, list, all-tracks) resolve `?openIssue=GR-123` by looking
 * the acronym up in the task data they have already loaded. But `task_q`, `filters` and
 * `status` are **server-side** query params: a filtered view's payload simply does not
 * contain a task the filter excluded, so the lookup missed and the effect did nothing at
 * all — no modal, no message.
 *
 * Global search made this easy to hit. The board's search box writes `taskQ` to
 * `ProjectDataProvider` state, never to the URL, and the provider wraps the project layout
 * — so a same-project navigation doesn't remount it and the filter survives, even though
 * the global-search URL carries only `openIssue`. The board stays filtered while the URL
 * claims it isn't. Every other deep-link source (journal @-mentions, inbox notifications,
 * copied task links, invite RSVP) hits the same wall whenever a filter is set.
 *
 * The rule this encodes: asking for one specific task beats a filter the user left behind.
 * Clear the filter and let the refetch find it — and if it still can't be found, say so
 * instead of failing silently.
 *
 * Kept as a pure function (no React) so the decision is testable on its own and identical
 * across the three views, which previously each carried their own copy of the effect.
 */

export type OpenIssueDeepLinkState = {
  /** The `openIssue` acronym from the URL, if any. */
  openIssueId?: string | null;
  /** Whether the view has finished loading its task data at least once. */
  isDataLoaded: boolean;
  /** Whether that data actually contains the deep-linked task. */
  isTaskLoaded: boolean;
  /** Whether a server-side filter (`task_q`, `filters`, `status`) is narrowing the data. */
  hasActiveFilter: boolean;
  /** Whether filters were already cleared for THIS deep link — the refetch-loop guard. */
  hasClearedFilters: boolean;
};

export type OpenIssueDeepLinkAction =
  /** No deep link to act on. */
  | 'idle'
  /** Data isn't in yet; decide once it is. */
  | 'wait'
  /** The task is loaded — open its modal. */
  | 'open'
  /** A filter is hiding it; drop the filter and let the refetch bring it back. */
  | 'clear-filters'
  /** Genuinely not reachable (deleted, moved, bad link) — tell the user. */
  | 'report-missing';

export function resolveOpenIssueDeepLink(state: OpenIssueDeepLinkState): OpenIssueDeepLinkAction {
  if (!state.openIssueId) return 'idle';
  // Every view mounts with empty data for a tick; calling the task missing there would
  // fire a spurious "not found" on each navigation.
  if (!state.isDataLoaded) return 'wait';
  if (state.isTaskLoaded) return 'open';
  // Only worth clearing once per deep link: if the task is still absent from an unfiltered
  // payload, clearing again would refetch forever.
  if (state.hasActiveFilter && !state.hasClearedFilters) return 'clear-filters';
  return 'report-missing';
}
