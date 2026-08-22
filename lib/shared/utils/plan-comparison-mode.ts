export type ComparisonMode = 'baseline' | 'latest';

export function resolveComparisonMode(value: string | null | undefined): ComparisonMode {
  return value === 'latest' ? 'latest' : 'baseline';
}

/**
 * Whether a toggle to a new mode should be persisted to the backend right now, given the
 * period this mode applies to. Range views (Month) have no single snapshot to persist
 * against and stay session-only; an unknown period (not yet loaded) also can't be saved.
 * Kept dependency-free (no React, no API client) so it's unit-testable directly with plain
 * `node:test` — see lib/hooks/use-plan-comparison-mode.ts for where this is actually used.
 */
export function shouldPersistComparisonMode(opts: {
  isRange: boolean;
  periodStartStr: string | null;
}): boolean {
  return !opts.isRange && opts.periodStartStr !== null;
}
