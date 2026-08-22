/**
 * Same-origin dashboard paths only — never honor hallucinated hosts like
 * https://dashboard.performance/…. A bare "/dashboard/" prefix check alone
 * still lets the LLM invent an entirely fake top-level page, so this also
 * pins the path to a known top-level section (mirrors the sections
 * buildDestinationHref actually resolves to in lib/utils/focusai/destinations.ts).
 * This does not validate sub-paths/query params within a trusted section —
 * a hallucinated `/dashboard/performance/<fake-subpath>` still passes. Full
 * route validation would require re-deriving the exact path shape
 * buildDestinationHref produces per destination kind, which takes typed
 * destination fields, not a raw string — out of scope for a markdown-link gate.
 */
const TRUSTED_DASHBOARD_SECTIONS = new Set([
  'calendar',
  'capacity',
  'settings',
  'performance',
  'habits',
  'projects',
]);

export function isTrustedDashboardHref(href: string | undefined | null): boolean {
  if (!href) return false;
  const trimmed = href.trim();
  if (!trimmed.startsWith('/dashboard/')) return false;
  if (trimmed.startsWith('//')) return false;
  if (trimmed.includes('://')) return false;
  if (trimmed.includes('..')) return false;

  const path = trimmed.split(/[?#]/)[0];
  const section = path.slice('/dashboard/'.length).split('/')[0];
  return TRUSTED_DASHBOARD_SECTIONS.has(section);
}
