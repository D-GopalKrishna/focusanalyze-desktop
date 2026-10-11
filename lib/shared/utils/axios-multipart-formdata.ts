/**
 * Every generated multipart-upload method (any endpoint taking a `File` — task/project icon
 * and editor-image uploads) hardcodes `Content-Type: multipart/form-data` with no boundary.
 * A `FormData` body normally gets its boundary-inclusive Content-Type set automatically by
 * the browser (XHR/fetch) when no Content-Type is explicitly provided — but an explicit
 * header, even this exact value, suppresses that, and axios's own `transformRequest` leaves
 * a manually-set header alone (it only builds one when none exists). The backend's multipart
 * parser can't split a body it has no boundary for, so every such upload fails.
 *
 * Merely *deleting* the header is not enough: axios's `dispatchRequest` unconditionally
 * backfills `Content-Type: application/x-www-form-urlencoded` for POST/PUT/PATCH whenever
 * no Content-Type is present at all (`config.headers.setContentType(..., false)` — the
 * `false` there only means "don't overwrite an existing value", not "skip if absent"). That
 * runs in axios's shared core, not an adapter, so it fires in the browser too — deleting the
 * header would trade one wrong Content-Type for a different, equally wrong one. Axios's own
 * documented way to suppress a header entirely is to set its value to the literal boolean
 * `false`: `AxiosHeaders#set` treats an existing `false` value as "protected" (its own
 * `self[key] !== false` guard), and `false`-valued entries are dropped from the header set
 * actually handed to the adapter (confirmed via `AxiosHeaders#toJSON`) — so the browser's
 * XHR/fetch never sees a Content-Type header at all and computes the correct
 * boundary-inclusive one itself, exactly as if the caller had never set one.
 *
 * Registered as a request interceptor on the axios singleton every generated API class
 * defaults to (see lib/services/api/auth.ts) — covers every multipart endpoint in the app,
 * not just the one this was first found on (task draft image upload — GitHub
 * focusanalyze-fe#71, which patched only that single call site with an ad hoc
 * `fetch`+`FormData` workaround, and was wrong that the "existing" endpoints were
 * unaffected — they use the same generated method and have the identical bug).
 *
 * Kept as a plain, dependency-free function (not inline in the interceptor registration) so
 * it's directly unit-testable without pulling in auth.ts's transitive imports (cookies-next,
 * Keycloak middleware, etc.) under `--experimental-strip-types`.
 */

// `value: any` matches AxiosHeaders#set's real (overloaded) signature so this structurally
// satisfies InternalAxiosRequestConfig['headers'] without importing the axios type here
// (kept dependency-free for testability — see module doc above).
type HeadersWithSet = { set?: (name: string, value: any) => unknown };

export function stripBoundarylessMultipartContentType<T extends { data?: unknown; headers?: HeadersWithSet }>(
  config: T,
): T {
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    config.headers?.set?.('Content-Type', false);
  }
  return config;
}
