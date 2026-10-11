import type { HabitRead } from "@shared/api-client";
import { type Event, Type2cdEnum as CalendarEventType } from "@shared/api-client/api";
import { seriesEventIdFor } from "@shared/utils/calendar-habit-lookup";
import { getCalendarEventTextColor } from "@shared/utils/calendar-event-colors";
import { localCalendarDateKey } from "@shared/utils/plan-period";

export type EventProjectLike = {
  id?: number | null;
  name?: string | null;
  color?: string | null;
  domain?: string | null;
};

export interface CalendarFullCalendarEventContext {
  /** Habit lookup keyed by series event id (see `calendar-habit-lookup.ts`). Empty = no habits. */
  habitsBySeriesEventId: Map<number, HabitRead>;
  userTimezone: string;
  /** Today's date key in `userTimezone` — only today's occurrence gets an interactive habit check-in. */
  habitTodayKey: string;
}

/**
 * Maps API events to FullCalendar `EventInput`s exactly as the calendar view renders them
 * (per-occurrence ids, overlap flags, invited/reminder/break/OOO styling, task/project/life-area
 * and habit extended props). Single source of truth shared by `CalendarView` and the read-only
 * day calendar in the desktop tray widget, so the two can't drift.
 */
export function buildCalendarFullCalendarEvents(
  calendarEvents: Event[] | null | undefined,
  { habitsBySeriesEventId, userTimezone, habitTodayKey }: CalendarFullCalendarEventContext,
) {
  if (!calendarEvents) return [];
  // First, prepare events with parsed dates to detect overlaps
  const eventsWithDates = calendarEvents.map((event: Event) => {
    const startDate = new Date(event.start_datetime);
    const endDate = new Date(event.end_datetime);
    return { event, startDate, endDate };
  });

  // Determine which events overlap with at least one other event on the same day
  const overlappingEventIds = new Set<string>();

  for (let i = 0; i < eventsWithDates.length; i++) {
    for (let j = i + 1; j < eventsWithDates.length; j++) {
      const a = eventsWithDates[i];
      const b = eventsWithDates[j];

      // Only consider events on the same calendar day
      const sameDay = a.startDate.toDateString() === b.startDate.toDateString();
      if (!sameDay) continue;

      // Time overlap check: a.start < b.end && b.start < a.end
      if (a.startDate < b.endDate && b.startDate < a.endDate) {
        overlappingEventIds.add(a.event.id.toString());
        overlappingEventIds.add(b.event.id.toString());
      }
    }
  }

  const structuredEvents = eventsWithDates.map(({ event, startDate, endDate }) => {
    // FullCalendar requires each rendered event instance to have a unique id.
    // Our API expands recurring events into multiple rows that share the same
    // `event.id`, so we derive a stable per-instance id while preserving the
    // original id in extendedProps for lookups and updates.
    const originalId = event.id.toString();
    const seriesEventId = seriesEventIdFor(event);
    // Include end in the key so UI updates when only duration changes.
    const instanceId = `${originalId}-${startDate.toISOString()}-${endDate.toISOString()}`;

    const isOverlapping = overlappingEventIds.has(originalId);

    const eventProject =
      typeof event.project === 'object' && event.project !== null
        ? (event.project as EventProjectLike)
        : null;

    const source = (event as any).source as string | undefined;
    const googleAccountEmail = (event as any).google_calendar_account_email as string | undefined;
    const googleAccountId = (event as any).google_calendar_account_id as number | undefined;
    const isOrganizer = (event as Event).is_organizer !== false;
    const isInvitedEvent = !isOrganizer;
    const eventBackgroundColor = isInvitedEvent ? 'transparent' : event.color;
    const usesThemeForeground =
      isInvitedEvent ||
      event.type === CalendarEventType.Break ||
      event.type === CalendarEventType.OutOfOffice;

    return {
      id: instanceId,
      title: event.name,
      name: event.name,
      // Give FullCalendar actual Dates (not strings) so it renders exact minutes (e.g. :15),
      // and avoids any parsing/rounding quirks.
      start: startDate,
      end: endDate,
      allDay: Boolean(event.is_all_day),
      /** Month view defaults timed single-day events to list-item (dot) layout; use blocks so colors match week/day. */
      display: 'block',
      backgroundColor: eventBackgroundColor,
      textColor: getCalendarEventTextColor(eventBackgroundColor, {
        useThemeForeground: usesThemeForeground,
      }),
      borderColor: isInvitedEvent ? event.color : undefined,
      classNames: [
        ...(isOverlapping ? ['overlapping-event'] : []),
        ...(isInvitedEvent ? ['fa-invited-event'] : []),
        ...(event.type === CalendarEventType.Reminder ? ['fa-reminder-event'] : []),
        ...(event.type === CalendarEventType.Break ? ['fa-break-event'] : []),
        ...(event.type === CalendarEventType.OutOfOffice ? ['fa-ooo-event'] : []),
      ],
      extendedProps: {
        originalId,
        isOverlapping,
        isInvitedEvent,
        isOrganizer,
        source,
        google_calendar_account_email: googleAccountEmail,
        google_calendar_account_id: googleAccountId,
        type: event.type,
        taskId: event.task?.id ?? (event as { task_id?: number }).task_id ?? null,
        plannerTaskId: event.task?.id ?? (event as { task_id?: number }).task_id ?? null,
        taskName: event.task?.name ?? null,
        projectName: eventProject?.name ?? null,
        projectColor: eventProject?.name ? (eventProject.color ?? null) : null,
        lifeAreaName: event.life_area?.name ?? null,
        lifeAreaColor: event.life_area?.color ?? null,
        fullRangeStart: event.start_datetime,
        fullRangeEnd: event.end_datetime,
        excludedFromReports: Boolean(event.excluded_from_reports),
        isCompleted: Boolean((event as { is_completed?: boolean }).is_completed),
        ...(() => {
          // Keyed off the SERIES id, not the row id — see calendar-habit-lookup.ts.
          const habit = habitsBySeriesEventId.get(seriesEventId);
          if (!habit) return { habitId: null };
          // Check-in state/toggle only meaningfully apply to today's occurrence — a
          // past/future occurrence's status isn't known without fetching per-habit
          // check-in history, so only today's row gets the interactive checkbox.
          // Keyed in the user's profile timezone, not the device's (habitTodayKey) —
          // otherwise a device/profile timezone mismatch can point the checkbox at the
          // wrong day's occurrence.
          const isTodayOccurrence = localCalendarDateKey(startDate, userTimezone) === habitTodayKey;
          return {
            habitId: habit.id,
            habitName: habit.name,
            habitCadenceType: habit.cadence_type,
            habitWeekdays: habit.weekdays,
            habitTimesPerWeek: habit.times_per_week,
            habitIntervalDays: habit.interval_days,
            habitCurrentStreak: habit.current_streak,
            habitCheckedInToday: isTodayOccurrence && habit.last_check_in_date === habitTodayKey,
            habitCheckInInteractive: isTodayOccurrence,
          };
        })(),
      },
    };
  });
  return structuredEvents;
}
