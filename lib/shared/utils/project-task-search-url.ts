/**
 * The project task search (`task_q`) as a URL value (GR-1268 follow-up).
 *
 * `task_q` is a **server-side** filter: it goes into the board/list/tracks request and the
 * payload comes back already narrowed. It used to live only in `ProjectDataProvider`
 * state, with the layout resolving `projectFetchTaskQParam || taskQ` — a second source of
 * truth that disagreed with the URL in three separate ways:
 *
 * 1. Arriving at `?task_q=X` left the search box **dead**: it rendered empty (seeded from
 *    context `''`), the board was filtered by X, and typing Y resolved `X || Y` -> X, so
 *    the box could never change the filter.
 * 2. Typing in the box never touched the URL, so a filtered view couldn't be shared,
 *    bookmarked, or survive a reload, and Back didn't undo it.
 * 3. The context value outlived navigations that carried no `task_q`, so the board stayed
 *    filtered while the URL said otherwise — the root of GR-1268.
 *
 * Keeping it in the URL matches `useAppliedTaskFilters`, which already owns the sibling
 * `filters` param the same way.
 */

export const TASK_SEARCH_PARAM = 'task_q';

/** The active task search in a query string. */
export function readTaskSearch(queryString: string): string {
  return new URLSearchParams(queryString).get(TASK_SEARCH_PARAM) ?? '';
}

/**
 * The query string after setting the task search to `value`, preserving every other param.
 * An empty or whitespace-only search drops the param entirely rather than leaving
 * `?task_q=` behind, so clearing the box leaves the URL as it was before searching.
 */
export function nextTaskSearchQueryString(queryString: string, value: string): string {
  const params = new URLSearchParams(queryString);
  const trimmed = value.trim();
  if (trimmed) {
    params.set(TASK_SEARCH_PARAM, trimmed);
  } else {
    params.delete(TASK_SEARCH_PARAM);
  }
  return params.toString();
}
