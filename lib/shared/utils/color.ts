/**
 * Fallback color for chart segments with no project/life-area color set (rendered as
 * "Uncategorized"). Centralized here — was previously the literal `'#6b7280'` duplicated
 * across `performance-time-charts.ts` — so a user-chosen life-area color can be checked
 * against it instead of silently blending into "Uncategorized" in stacked bar charts.
 */
export const UNCATEGORIZED_FALLBACK_COLOR = '#6b7280';

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!match) return null;
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

/** `hex` as an `rgba(...)` string at `alpha` opacity — for soft-tinted badge/pill
 * backgrounds behind a user-chosen color. Falls back to `hex` unchanged if it isn't a
 * parseable 6-digit hex (e.g. already an rgba()/named color passed through). */
export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

// Empirically chosen: small chart segments (legend dots, thin bar slices) make nearby
 // grays hard to tell from Uncategorized. ~50 catches close Tailwind-ish grays without
 // flagging black / light silver.
const NEAR_GRAY_DISTANCE_THRESHOLD = 50;

/** True when `hex` would be visually indistinguishable from the "Uncategorized" fallback gray. */
export function isTooCloseToUncategorizedGray(hex: string, threshold = NEAR_GRAY_DISTANCE_THRESHOLD): boolean {
  const candidate = hexToRgb(hex);
  const fallback = hexToRgb(UNCATEGORIZED_FALLBACK_COLOR);
  if (!candidate || !fallback) return false;
  const distance = Math.sqrt(candidate.reduce((sum, c, i) => sum + (c - fallback[i]) ** 2, 0));
  return distance <= threshold;
}
