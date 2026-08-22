/**
 * Whether a board mutation should be published into the global `ProjectDataContext` from a
 * given board instance (components/dashboard/projects/focusanalyze/current-track-board-view.tsx).
 *
 * Non-tile boards always publish. A tile showing a *different* project than the global
 * "current" one must not clobber it — otherwise opening an unrelated project in a workspace
 * tile would make breadcrumbs/FocusAI's attached context switch to reflect the tile instead of
 * the primary view. But if the tile happens to be showing the SAME project that's already
 * current (e.g. it's the only place that project is open), suppressing the publish entirely
 * would leave that shared context stale after every mutation made in the tile — so only skip
 * when the ids actually differ.
 */
export function shouldPublishBoardProjectToContext(
  embeddedInWorkspaceTile: boolean,
  contextCurrentProjectId: number | undefined | null,
  mutatedProjectId: number | undefined | null,
): boolean {
  if (!embeddedInWorkspaceTile) return true;
  return contextCurrentProjectId === mutatedProjectId;
}
