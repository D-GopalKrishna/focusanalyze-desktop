import type { ICalendarView } from "@shared/types/dashboard/calendar";
import { addDays, addWeeks, startOfWeek, subDays } from 'date-fns';
import type { CalendarApi } from '@fullcalendar/core';
import { debounce } from "@shared/utils/debounce";

/** FullCalendar `view.type` values that map to app calendar views. */
export const FULLCALENDAR_VIEW_IDS: readonly ICalendarView[] = [
  'timeGridWeekday',
  'timeGridThreeDay',
  'timeGridWeek',
  'dayGridMonth',
];

export function fullCalendarViewToAppView(type: string): ICalendarView | undefined {
  return (FULLCALENDAR_VIEW_IDS as readonly string[]).includes(type)
    ? (type as ICalendarView)
    : undefined;
}

// This function is used to get the from and to datetime for the calendar
// It is used to fetch events for the new view type.
// Prefer FullCalendar's activeStart/activeEnd so the fetch range matches the
// columns on screen (honors firstDay / start-of-week). Hardcoding weekStartsOn:1
// here previously left Sunday empty when the UI showed Sun–Sat (F9).
const getFromAndToDatetime = (calendarApi: CalendarApi) => {
  const view = calendarApi?.view;
  if (view?.activeStart && view?.activeEnd) {
    return {
      fromDatetime: view.activeStart.toISOString(),
      // activeEnd is exclusive — matches the backend half-open range.
      toDatetime: view.activeEnd.toISOString(),
    };
  }

  const newView = view?.type;
  let fromDatetime: string;
  let toDatetime: string;

  // Fallback when the view isn't ready yet (e.g. before FullCalendar mounts).
  const currentDate = calendarApi.getDate();

  if (newView === 'timeGridThreeDay') {
    const start = subDays(currentDate, 1);
    const end = addDays(currentDate, 1);
    fromDatetime = start.toISOString();
    toDatetime = end.toISOString();
  } else if (newView === 'timeGridWeek' || newView === 'timeGridWeekday') {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = addWeeks(start, 1);
    fromDatetime = start.toISOString();
    toDatetime = end.toISOString();
  } else if (newView === 'dayGridMonth') {
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    // Half-open upper bound: start of the *next* month. Using day 0 (last day of
    // this month at local midnight) drops any event on the last day, because the
    // backend range is half-open (`start_datetime__lt=to_dt`).
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    fromDatetime = start.toISOString();
    toDatetime = end.toISOString();
  } else if (newView === 'timeGridDay') {
    const start = new Date(currentDate);
    start.setHours(0, 0, 0, 0);
    const end = addDays(start, 1);
    fromDatetime = start.toISOString();
    toDatetime = end.toISOString();
  } else {
    // WEEK VIEW BY DEFAULT - by default, set for week view
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = addWeeks(start, 1);
    fromDatetime = start.toISOString();
    toDatetime = end.toISOString();
  }
  return { fromDatetime, toDatetime };
};

// This function is used to handle the view change
// Whenever the view changes, we need to fetch the events for the new view type
const handleViewChange = (
  calendarApi: CalendarApi,
  view: ICalendarView,
  setCurrentView: (view: ICalendarView) => void,
  setCurrentDate: (date: Date) => void,
  fetchAllEvents: (fromDatetime: string, toDatetime: string, projectId?: number | null) => void,
  projectId?: number | null,
) => {
  // If switching to weekday view, ensure we start on Monday
  if (view === 'timeGridWeekday') {
    // Get the current date
    const currentDate = calendarApi?.getDate();

    // Find the Monday of the current week
    const monday = startOfWeek(currentDate, { weekStartsOn: 1 });

    // Go to that Monday
    calendarApi?.gotoDate(monday);
  }

  // If switching to three-day view, ensure the current date is
  // in the middle
  if (view === 'timeGridThreeDay') {
    // Get today's date (not the calendar's current date)
    const today = new Date();

    // Go to today to center the view on today
    calendarApi?.gotoDate(today);
  }

  calendarApi?.changeView(view);
  setCurrentView(view);
  setCurrentDate(calendarApi?.getDate());

  // Drop any pending Prev/Next/Today fetch. Before this cancel, Next then Month
  // within 400ms queued a week-range GET that fired after the month fetch and
  // replaced the month payload — most events vanished from Month view.
  debouncedNavigationFetch.cancel();

  // Fetch events for the new view type
  const { fromDatetime, toDatetime } = getFromAndToDatetime(calendarApi);
  fetchAllEvents(fromDatetime, toDatetime, projectId);
};

type FetchAllEvents = (fromDatetime: string, toDatetime: string, projectId?: number | null) => void;
type PeekCalendarRange = (fromDatetime: string, toDatetime: string, projectId?: number | null) => void;

// Shared across Prev/Next/Today: the calendar's own navigation (calendarApi.prev()/next()/
// today(), setCurrentDate) stays instant on every click — only the trailing network fetch
// waits for clicks to settle. One dispatcher (not one per handler) so rapid-firing between
// e.g. Next then Today collapses into a single fetch for wherever the user actually landed,
// rather than one debounce timer per button racing another's. Always called with the
// caller's current `fetchAllEvents` reference (never captured), so it can't go stale.
//
// The range is read when the timer fires, not when the click is queued: a view switch
// (or another gotoDate) in the 400ms window must fetch whatever is actually on screen,
// not the week range that was current at the first Next/Prev click.
const debouncedNavigationFetch = debounce(
  (calendarApi: CalendarApi, fetchAllEvents: FetchAllEvents, projectId?: number | null) => {
    const { fromDatetime, toDatetime } = getFromAndToDatetime(calendarApi);
    fetchAllEvents(fromDatetime, toDatetime, projectId);
  },
  400,
);

// `peekCalendarRange` is called synchronously, right here — not through
// debouncedNavigationFetch — because it's a cache read, not a network request. Gating it
// behind the same 400ms-settle debounce as the real fetch would leave an already-visited
// week sitting on the *previous* week's events (or blank) for up to 400ms for no reason; only
// the network round-trip needs debouncing to avoid spamming the server on rapid clicks.
const handlePrevClick = (
  calendarApi: CalendarApi,
  setCurrentDate: (date: Date) => void,
  fetchAllEvents: FetchAllEvents,
  projectId?: number | null,
  peekCalendarRange?: PeekCalendarRange,
) => {
  calendarApi?.prev();
  setCurrentDate(calendarApi?.getDate());
  const { fromDatetime, toDatetime } = getFromAndToDatetime(calendarApi);
  peekCalendarRange?.(fromDatetime, toDatetime, projectId);
  debouncedNavigationFetch(calendarApi, fetchAllEvents, projectId);
};

const handleNextClick = (
  calendarApi: CalendarApi,
  setCurrentDate: (date: Date) => void,
  fetchAllEvents: FetchAllEvents,
  projectId?: number | null,
  peekCalendarRange?: PeekCalendarRange,
) => {
  calendarApi?.next();
  setCurrentDate(calendarApi?.getDate());
  const { fromDatetime, toDatetime } = getFromAndToDatetime(calendarApi);
  peekCalendarRange?.(fromDatetime, toDatetime, projectId);
  debouncedNavigationFetch(calendarApi, fetchAllEvents, projectId);
};

const handleTodayClick = (
  calendarApi: CalendarApi,
  setCurrentDate: (date: Date) => void,
  fetchAllEvents: FetchAllEvents,
  projectId?: number | null,
  peekCalendarRange?: PeekCalendarRange,
) => {
  calendarApi?.today();
  setCurrentDate(calendarApi?.getDate());
  const { fromDatetime, toDatetime } = getFromAndToDatetime(calendarApi);
  peekCalendarRange?.(fromDatetime, toDatetime, projectId);
  debouncedNavigationFetch(calendarApi, fetchAllEvents, projectId);
};

const formatDate = (date: Date, calendarView: ICalendarView) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    day: calendarView === 'timeGridDay' ? 'numeric' : undefined,
  });
  return formatter.format(date);
};

// Helper function for dialog positioning
const getOptimalDialogPosition = (
  rect: DOMRect,
  options?: { width?: number; height?: number },
): { x: number; y: number } => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const dialogWidth = options?.width ?? 300;
  const dialogHeight = options?.height ?? 420; // Approximate height of the dialog with task and description
  const dialogPadding = 4; // Reduced spacing between event and dialog
  const bottomMargin = 15; // Smaller margin from bottom of screen

  // Divide screen into quarters horizontally
  const quarterWidth = viewportWidth / 4;
  const isInLastQuarter = rect.right > quarterWidth * 3;

  // Divide screen into thirds vertically for more granular control
  const lowerThirdStart = (viewportHeight * 2) / 3;
  const isInLowerThird = rect.bottom > lowerThirdStart;
  const isInBottomHalf = rect.bottom > viewportHeight / 2;

  // Special handling for very late night events (bottom 15% of screen)
  const isVeryBottom = rect.bottom > viewportHeight * 0.85;

  // Calculate horizontal position
  let dialogX;
  if (isInLastQuarter) {
    // Position on left if event is in last quarter of screen
    const leftShift = dialogWidth + 25;
    // Use a minimum shift of 30px to avoid placing dialog too close to edge
    dialogX = Math.max(5, rect.left - Math.max(30, leftShift) - dialogPadding);
  } else {
    // Otherwise position on right
    dialogX = rect.right + dialogPadding;
  }

  // Calculate vertical position
  let dialogY;

  // Get the event height and attempt to center the dialog if the event is tall enough
  const eventHeight = rect.height;

  // Special handling for very late night events (like 11:30pm)
  if (isVeryBottom) {
    // For events at the very bottom, keep dialog much closer to the event
    // Position dialog to align more closely with the event
    // Only 30px above the event, with minimum of 10px from top
    dialogY = Math.max(rect.top - 30, 10);

    // If there's not enough space, try to position it so at least 70% is visible
    const minVisibleHeight = dialogHeight * 0.7;
    const availableHeight = viewportHeight - bottomMargin - dialogY;

    if (availableHeight < minVisibleHeight) {
      // Position it to show at least 70% of dialog
      dialogY = Math.max(10, viewportHeight - minVisibleHeight - bottomMargin);
    }
  } else if (isInLowerThird) {
    // For events in the bottom third, position higher but not too high
    const maxDialogBottom = viewportHeight - bottomMargin;
    // Try to position dialog with its bottom near the viewport bottom
    dialogY = maxDialogBottom - dialogHeight;

    // But still try to align with the event when possible
    if (rect.top < dialogY + dialogHeight / 2) {
      // If event is high enough to partially align, position relative to it
      dialogY = Math.max(10, rect.top - 50); // Position slightly above the event
    }
  } else if (isInBottomHalf) {
    // If in middle third, more balanced positioning
    const wouldGoBelow = rect.top + dialogHeight > viewportHeight - 50;

    if (wouldGoBelow) {
      // Position dialog higher to keep it fully visible but not too high
      dialogY = Math.max(10, viewportHeight - dialogHeight - bottomMargin);
    } else if (eventHeight >= 60) {
      // For taller events, center the dialog vertically relative to the event
      dialogY = rect.top + eventHeight / 2 - dialogHeight / 2;
      // Ensure dialog stays within viewport bounds
      dialogY = Math.max(10, Math.min(dialogY, viewportHeight - dialogHeight - bottomMargin));
    } else {
      // For shorter events, align with the top but adjust if needed
      dialogY = Math.max(10, Math.min(rect.top, viewportHeight - dialogHeight - bottomMargin));
    }
  } else {
    // If in top third, we can be more flexible with positioning
    if (eventHeight >= 60) {
      // For taller events, center the dialog vertically
      dialogY = rect.top + eventHeight / 2 - dialogHeight / 2;
      // Ensure dialog stays within viewport bounds
      dialogY = Math.max(10, dialogY);
    } else {
      // For shorter events, align with the top
      dialogY = rect.top;
    }

    // Final check to ensure dialog doesn't go off screen
    if (dialogY + dialogHeight > viewportHeight - bottomMargin) {
      dialogY = Math.max(10, viewportHeight - dialogHeight - bottomMargin);
    }
  }

  dialogX = Math.max(8, Math.min(dialogX, viewportWidth - dialogWidth - 8));

  return {
    x: dialogX,
    y: dialogY,
  };
};

const MINUTES_PER_DAY = 24 * 60;

function dateToMinutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

type CalendarSelectionAnchorInput = {
  dayEl: HTMLElement;
  start: Date;
  end: Date;
  viewType: string;
  jsEvent?: MouseEvent | null;
  slotMinMinutes?: number;
  slotMaxMinutes?: number;
};

/**
 * Anchor rect for positioning the quick-event dialog next to a calendar selection.
 * Click-to-create was using `jsEvent.target`, which is often the full-height
 * `.fc-timegrid-col-frame` rather than the clicked time slot.
 */
const getCalendarSelectionAnchorRect = ({
  dayEl,
  start,
  end,
  viewType,
  jsEvent,
  slotMinMinutes = 0,
  slotMaxMinutes = MINUTES_PER_DAY,
}: CalendarSelectionAnchorInput): DOMRect => {
  const highlightEl = document.querySelector('.fc-highlight') as HTMLElement | null;
  if (highlightEl) {
    const highlightRect = highlightEl.getBoundingClientRect();
    if (highlightRect.width > 0 && highlightRect.height > 0) {
      return highlightRect;
    }
  }

  if (viewType.startsWith('timeGrid') && !Number.isNaN(start.getTime())) {
    const colFrame = dayEl.querySelector('.fc-timegrid-col-frame') ?? dayEl;
    const frameRect = colFrame.getBoundingClientRect();
    const totalMinutes = slotMaxMinutes - slotMinMinutes;
    if (totalMinutes <= 0 || frameRect.height <= 0) {
      return frameRect;
    }

    const startMin = Math.max(
      slotMinMinutes,
      Math.min(slotMaxMinutes, dateToMinutesFromMidnight(start)),
    );
    const endMin = Math.max(startMin + 1, Math.min(slotMaxMinutes, dateToMinutesFromMidnight(end)));

    const top = frameRect.top + ((startMin - slotMinMinutes) / totalMinutes) * frameRect.height;
    const bottom = frameRect.top + ((endMin - slotMinMinutes) / totalMinutes) * frameRect.height;
    const height = Math.max(bottom - top, 4);

    return new DOMRect(frameRect.left, top, frameRect.width, height);
  }

  const dayRect = dayEl.getBoundingClientRect();
  if (jsEvent) {
    const clickHeight = Math.max(20, Math.min(48, dayRect.height * 0.15));
    const top = Math.max(
      dayRect.top,
      Math.min(jsEvent.clientY - clickHeight / 2, dayRect.bottom - clickHeight),
    );
    return new DOMRect(dayRect.left, top, dayRect.width, clickHeight);
  }

  return dayRect;
};

/**
 * Human-readable message from an event create/update API error. The backend returns
 * `{"detail": "..."}` for plain errors, or `{"detail": {field: ["msg", ...], ...}}` for
 * Django ValidationError field errors (e.g. `{"end_datetime": ["End datetime must be
 * after start datetime."]}`) — this flattens either shape into one line instead of the
 * generic "Could not update the event." that used to hide the actual reason.
 */
export function parseEventSaveErrorMessage(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (detail && typeof detail === 'object') {
    const messages = Object.values(detail as Record<string, unknown>).flatMap((v) =>
      Array.isArray(v) ? v.filter((m): m is string => typeof m === 'string') : [],
    );
    if (messages.length > 0) return messages.join(' ');
  }
  return fallback;
}

export {
  handlePrevClick,
  handleNextClick,
  handleTodayClick,
  handleViewChange,
  formatDate,
  getFromAndToDatetime,
  getOptimalDialogPosition,
  getCalendarSelectionAnchorRect,
};
