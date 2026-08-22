import { format } from 'date-fns';

import type { RecurrencePattern } from '@/components/dashboard/calendar/components/custom-recurring-event-dialog';

/** Simple preset repeat option ids from the non-custom repeat menu. */
export type SimpleRepeatOptionId =
  | 'no-repeat'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'monthly-date'
  | 'annually'
  | 'weekday'
  | 'custom';

const NTH_WORD = ['first', 'second', 'third', 'fourth'] as const;

/**
 * Which occurrence of its own weekday `startDate` is within its month.
 *
 * `nth` is 1-4, or -1 for the 5th (which is always the *last* of that weekday in the
 * month) — matching Google Calendar, which offers "Monthly on the last Thursday" rather
 * than a "fifth" that most months don't have. `word` is the matching human label.
 */
export function nthWeekdayOfMonth(startDate: Date): { nth: number; word: string } {
  const index = Math.floor((startDate.getDate() - 1) / 7); // 0-4
  return index >= 4 ? { nth: -1, word: 'last' } : { nth: index + 1, word: NTH_WORD[index] };
}

/**
 * Label for the "Monthly" preset, e.g. "Monthly on the second Thursday".
 *
 * Shared by the repeat menu and the collapsed summary so the two can never disagree —
 * they previously described the same rule two different ways (the menu hardcoded the
 * word "second" for every date; the summary said "Monthly on the 6th"), and neither
 * matched the `BYMONTHDAY` rule actually being built.
 */
export function describeMonthlyPreset(startDate: Date): string {
  return `Monthly on the ${nthWeekdayOfMonth(startDate).word} ${format(startDate, 'EEEE')}`;
}

/** Label for the same-date monthly preset, e.g. "Monthly on the 17th". */
export function describeMonthlyPresetSameDate(startDate: Date): string {
  return `Monthly on the ${format(startDate, 'do')}`;
}

/**
 * Label for an existing monthly RRULE. A `BYMONTHDAY` rule (legacy events created before
 * the preset switched to nth-weekday, or one built through Custom) is still described as
 * a day-of-month so the summary reflects what the event actually does, rather than what
 * the preset would build for that date today.
 */
export function describeMonthlyRule(recurrenceRule: string, startDate: Date): string {
  return /BYMONTHDAY=/.test(recurrenceRule.toUpperCase())
    ? `Monthly on the ${format(startDate, 'do')}`
    : describeMonthlyPreset(startDate);
}

/**
 * Builds RRULEs for the simple preset menu (Does not repeat / Daily / Weekly on <day> /
 * Monthly on the <nth> <day> / Annually on <date> / Every weekday). Anchored to
 * `startDate` (not "today") so the rule always repeats on the event's own weekday/date.
 *
 * "Monthly" is nth-weekday (`BYDAY=2TH`), not day-of-month — that is what the menu label
 * has always claimed and what Google Calendar's equivalent preset does. A second,
 * explicit same-date preset (`'monthly-date'`, `BYMONTHDAY=<day>`) sits alongside it so
 * both are reachable directly from the menu, not only through Custom.
 */
export function buildSimpleRRule(startDate: Date, optionId: string): string | null {
  const weekdayCode = format(startDate, 'EEE').toUpperCase().slice(0, 2); // e.g. MO, TU
  const dayOfMonth = Number(format(startDate, 'd'));
  const month = Number(format(startDate, 'M'));

  switch (optionId) {
    case 'daily':
      return 'FREQ=DAILY;INTERVAL=1';
    case 'weekly':
      return `FREQ=WEEKLY;INTERVAL=1;BYDAY=${weekdayCode}`;
    case 'monthly':
      return `FREQ=MONTHLY;INTERVAL=1;BYDAY=${nthWeekdayOfMonth(startDate).nth}${weekdayCode}`;
    case 'monthly-date':
      return `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=${dayOfMonth}`;
    case 'annually':
      return `FREQ=YEARLY;INTERVAL=1;BYMONTH=${month};BYMONTHDAY=${dayOfMonth}`;
    case 'weekday':
      return 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR';
    case 'no-repeat':
    default:
      return null;
  }
}

export interface BuiltRecurrence {
  recurrenceRule: string;
  customEndsOn?: Date;
  customCountEndsAfter?: number;
}

const CUSTOM_FREQ_MAP: Record<RecurrencePattern['frequency'], string> = {
  day: 'DAILY',
  week: 'WEEKLY',
  month: 'MONTHLY',
  year: 'YEARLY',
};

/**
 * Builds an RRULE string (compatible with the backend's `dateutil.rrule`) plus the
 * write-only `customEndsOn`/`customCountEndsAfter` fields from a Custom recurrence
 * dialog selection. Pure function so it can be unit tested without rendering the
 * dialog or the surrounding event form.
 *
 * `startDate` anchors the `month` mode's `BYMONTHDAY`/`BYDAY` value to the event's own
 * date, mirroring `buildSimpleRRule` — needed because `RecurrencePattern` itself carries
 * no date, only the frequency/interval/mode choice.
 */
export function buildRecurrenceFromPattern(
  recurrence: RecurrencePattern,
  startDate: Date,
): BuiltRecurrence {
  const freq = CUSTOM_FREQ_MAP[recurrence.frequency];
  const parts: string[] = [`FREQ=${freq}`, `INTERVAL=${recurrence.interval}`];

  if (recurrence.frequency === 'week' && recurrence.weekDays.length > 0) {
    parts.push(`BYDAY=${recurrence.weekDays.join(',')}`);
  } else if (recurrence.frequency === 'month') {
    if (recurrence.monthMode === 'weekday') {
      const weekdayCode = format(startDate, 'EEE').toUpperCase().slice(0, 2);
      parts.push(`BYDAY=${nthWeekdayOfMonth(startDate).nth}${weekdayCode}`);
    } else {
      parts.push(`BYMONTHDAY=${format(startDate, 'd')}`);
    }
  }

  let customEndsOn: Date | undefined;
  let customCountEndsAfter: number | undefined;

  if (recurrence.ends.type === 'on' && recurrence.ends.date) {
    // Use UTC ISO string for UNTIL
    const until = recurrence.ends.date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    parts.push(`UNTIL=${until}`);
    customEndsOn = recurrence.ends.date;
  } else if (recurrence.ends.type === 'after' && recurrence.ends.occurrences) {
    parts.push(`COUNT=${recurrence.ends.occurrences}`);
    customCountEndsAfter = recurrence.ends.occurrences;
  }

  return {
    recurrenceRule: parts.join(';'),
    customEndsOn,
    customCountEndsAfter,
  };
}

const FREQUENCY_LABEL: Record<RecurrencePattern['frequency'], string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
};

/** Human-readable summary shown on the repeat button after a Custom selection is saved. */
export function describeRecurrencePattern(recurrence: RecurrencePattern, startDate: Date): string {
  let repeatText = `Every ${recurrence.interval} ${FREQUENCY_LABEL[recurrence.frequency]}`;
  if (recurrence.frequency === 'week' && recurrence.weekDays.length > 0) {
    repeatText += ` on ${recurrence.weekDays.join(', ')}`;
  } else if (recurrence.frequency === 'month') {
    repeatText +=
      recurrence.monthMode === 'weekday'
        ? ` on the ${nthWeekdayOfMonth(startDate).word} ${format(startDate, 'EEEE')}`
        : ` on the ${format(startDate, 'do')}`;
  }

  if (recurrence.ends.type === 'on' && recurrence.ends.date) {
    repeatText += ` until ${format(recurrence.ends.date, 'MMM d, yyyy')}`;
  } else if (recurrence.ends.type === 'after') {
    repeatText += `, ${recurrence.ends.occurrences} times`;
  }

  return repeatText;
}
