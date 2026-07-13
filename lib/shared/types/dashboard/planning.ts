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
};

export const DRAFT_PLAN_EVENT_PREFIX = 'draft-plan-';

export function isDraftPlanEventId(id: string | number | undefined | null): boolean {
  return String(id ?? '').startsWith(DRAFT_PLAN_EVENT_PREFIX);
}
