/**
 * Pure Habit scheduling/timezone logic, deliberately free of any import from
 * `@/lib/rest_client_backend` (the generated API client's `base.ts` uses TS parameter-
 * property syntax Node's native `--experimental-strip-types` can't parse, which broke
 * plain `node --test` unit tests that imported it transitively via `Habits.ts`). Keep it
 * that way — `lib/services/api/dashboard/Habits.ts` re-exports these for app call sites.
 */
import { localCalendarDateKey } from './plan-period';
import { resolvePlannerTimezone } from './planner-sidebar-prefs';

/**
 * `YYYY-MM-DD` for "today" in the given timezone. `timezone` should be the caller's
 * resolved `UserSettings.timezone` (via `resolvePlannerTimezone`) — never call this with
 * no argument outside a component that has no timezone in scope; `Date#toLocaleDateString()`
 * silently reads the *device's* zone instead, which is the exact bug this signature exists
 * to prevent (a habit checked in at 11pm device-local can land on the wrong day for a user
 * whose profile timezone differs from their browser's).
 *
 * Prefer `useTodayInTimezone`/`useUserTodayKey` (lib/hooks/use-today-in-timezone.ts) inside
 * React components — they also live-update at local midnight, which a one-off call here does
 * not.
 */
export function todayISO(timezone?: string | null, now: Date = new Date()): string {
  return localCalendarDateKey(now, resolvePlannerTimezone(timezone));
}

const RRULE_WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export interface CadenceLike {
  cadence_type?: string;
  weekdays?: number[] | null;
  interval_days?: number | null;
}

/**
 * RRULE string for a habit's cadence, or null if the cadence has no clean fixed-day
 * expression (N_PER_WEEK — "3x/week" doesn't pin to specific days).
 */
export function rruleForCadence(habit: CadenceLike): string | null {
  switch (habit.cadence_type) {
    case 'daily':
      return 'FREQ=DAILY';
    case 'weekdays':
      return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'weekly_days': {
      const days = (habit.weekdays ?? []).map((d) => RRULE_WEEKDAY_CODES[d]).filter(Boolean);
      return days.length ? `FREQ=WEEKLY;BYDAY=${days.join(',')}` : null;
    }
    case 'every_n_days':
      return habit.interval_days ? `FREQ=DAILY;INTERVAL=${habit.interval_days}` : null;
    default:
      return null; // n_per_week — no fixed-day RRULE to build.
  }
}

export function isSchedulableCadence(cadenceType: string | undefined): boolean {
  return (
    cadenceType === 'daily' ||
    cadenceType === 'weekdays' ||
    cadenceType === 'weekly_days' ||
    cadenceType === 'every_n_days'
  );
}
