/**
 * CalendarView deep-link gate for `?planning=`.
 * Close/Save flips isPlanningMode off before Next.js drops the query param; without
 * `blockPlanningUrlEntry`, that interim state would re-enter planning.
 */
export function shouldEnterPlanningFromUrl(args: {
  planningParam: string | null;
  blockPlanningUrlEntry: boolean;
  isPlanningMode: boolean;
  isSuggestingPlan: boolean;
  isPlanningBootstrap: boolean;
  planScope: string;
}): boolean {
  const { planningParam, blockPlanningUrlEntry, isPlanningMode, isSuggestingPlan, isPlanningBootstrap, planScope } =
    args;
  if (planningParam !== 'daily' && planningParam !== 'weekly') return false;
  if (blockPlanningUrlEntry) return false;
  if (isPlanningMode && (isSuggestingPlan || isPlanningBootstrap || planScope === planningParam)) {
    return false;
  }
  return true;
}
