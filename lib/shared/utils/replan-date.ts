import { addDays, max, startOfDay } from 'date-fns';

/**
 * Default replan target: the day after `sourceDate`, but never earlier than `today` — a source
 * day more than one day in the past would otherwise default to ANOTHER already-past day (e.g.
 * replanning from a journal several days back must not land on a day that's also already over).
 * Plain `.ts` (no component imports) so it's importable by the repo's `node:test` unit runner,
 * which can't resolve `.tsx`-adjacent import chains.
 */
export function defaultReplanTargetDate(sourceDate: Date, today: Date): Date {
  return max([addDays(sourceDate, 1), startOfDay(today)]);
}
