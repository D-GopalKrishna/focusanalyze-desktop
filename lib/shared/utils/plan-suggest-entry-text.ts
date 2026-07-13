import type { PlanSuggestStreamEntry } from "@shared/types/dashboard/plan-suggest-stream";

/** User-visible line for a stream feed row (tool rows use label, not text). */
export function planSuggestEntryText(entry: PlanSuggestStreamEntry): string {
  if (entry.kind === 'tool') return entry.label;
  if (entry.kind === 'question') return entry.prompt || entry.text;
  return entry.text;
}
