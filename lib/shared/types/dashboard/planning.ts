export type PlanScope = 'daily' | 'weekly';

export type DraftPlanBlock = {
  id: string;
  name: string;
  start_datetime: string;
  end_datetime: string;
  task_id?: number | null;
  project_id?: number | null;
  life_area_id?: number | null;
  description?: string;
  source: 'manual' | 'ai';
  /** Set when this block was carried forward from an already-committed plan (i.e. it already
   * has a real calendar Event behind it) — lets commit update that Event instead of duplicating
   * it. Absent/null for brand-new blocks that have never been saved. */
  event_id?: number | null;
  /** For a block tracking one occurrence of a RECURRING event: the occurrence's own original
   * (unedited) start_datetime — stable identity distinguishing Monday's occurrence from
   * Tuesday's, since they all share the same `event_id` (the series master). Always the live
   * occurrence's start, never the draft's possibly-moved `start_datetime`. Null/absent for
   * non-recurring blocks and brand-new (never-saved) blocks. */
  occurrence_start?: string | null;
};

export const DRAFT_PLAN_EVENT_PREFIX = 'draft-plan-';

export function isDraftPlanEventId(id: string | number | undefined | null): boolean {
  return String(id ?? '').startsWith(DRAFT_PLAN_EVENT_PREFIX);
}
