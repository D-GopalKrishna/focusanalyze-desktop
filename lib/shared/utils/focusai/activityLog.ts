import type { MessageMetadata } from "@shared/api-client";
import type {
  PlanSuggestStreamEntry,
  PlanSuggestStreamPhase,
} from "@shared/types/dashboard/plan-suggest-stream";

export type ActivityMetadata = {
  entries?: PlanSuggestStreamEntry[];
  active_phase?: PlanSuggestStreamPhase | string | null;
};

export function getActivityMetadata(metadata: unknown): ActivityMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const activity = (metadata as MessageMetadata & { activity?: ActivityMetadata }).activity;
  if (!activity || typeof activity !== 'object') return null;
  return activity;
}

/** Persisted activity steps from message metadata → feed entries. */
export function activityEntriesFromMetadata(metadata: unknown): PlanSuggestStreamEntry[] {
  const activity = getActivityMetadata(metadata);
  if (!activity?.entries?.length) return [];
  return activity.entries.filter((e) => e.kind !== 'assistant_delta');
}

export function activityPhaseFromMetadata(metadata: unknown): PlanSuggestStreamPhase | null {
  const phase = getActivityMetadata(metadata)?.active_phase;
  if (
    phase === 'exploring' ||
    phase === 'thinking' ||
    phase === 'planning' ||
    phase === 'editing'
  ) {
    return phase;
  }
  return null;
}
