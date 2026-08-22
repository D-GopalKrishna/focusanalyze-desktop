/**
 * UI companion extensions (Settings → Extensions → UI).
 *
 * Keys match backend `EnabledFeature` / OpenAPI `EnabledFeaturesEnum`.
 * Companions are mutually exclusive — at most one is on at a time.
 */

export type CompanionKind = 'cat' | 'dog' | 'tora' | 'maia';

export const COMPANION_FEATURE = {
  cat: 'companion_cat',
  dog: 'companion_dog',
  tora: 'companion_tora',
  maia: 'companion_maia',
} as const;

export const COMPANION_FEATURE_KEYS: readonly string[] = Object.values(COMPANION_FEATURE);

/** Stale keys from removed companions — strip on save, map on read. */
const STALE_COMPANION_KEYS = ['companion_fox'] as const;

export function companionKindFromFeatures(
  features: readonly string[] | null | undefined,
): CompanionKind | null {
  if (!features?.length) return null;
  if (features.includes(COMPANION_FEATURE.cat)) return 'cat';
  if (features.includes(COMPANION_FEATURE.dog)) return 'dog';
  if (features.includes(COMPANION_FEATURE.tora)) return 'tora';
  if (
    features.includes(COMPANION_FEATURE.maia) ||
    features.includes('companion_fox')
  ) {
    return 'maia';
  }
  return null;
}

export function withCompanionFeature(
  features: readonly string[],
  kind: CompanionKind | null,
): string[] {
  const stripped = features.filter(
    (key) =>
      !COMPANION_FEATURE_KEYS.includes(key) &&
      !(STALE_COMPANION_KEYS as readonly string[]).includes(key),
  );
  if (!kind) return stripped;
  return [...stripped, COMPANION_FEATURE[kind]];
}

const DONE_COLUMN_NAMES = /^(done|finish|finished|complete|completed|closed)$/i;

/** True when a board/list column is the Finish workflow lane (or named like one). */
export function isDoneWorkflowColumn(column: {
  title?: string | null;
  name?: string | null;
  role?: string | null;
  tasks?: Array<{
    workflow_done?: boolean;
    status?: { role?: string | null } | null;
  }>;
}): boolean {
  if (column.role === 'FINISH') return true;
  if (column.tasks?.some((task) => task.workflow_done || task.status?.role === 'FINISH')) {
    return true;
  }
  const label = (column.title ?? column.name ?? '').trim();
  return DONE_COLUMN_NAMES.test(label);
}
