/**
 * FullCalendar splits multi-day timed events into one DOM segment per day.
 * Those segments use segment-local start/end; we preserve the API occurrence range
 * in extendedProps so labels can show the full span on every segment.
 */

export type FullCalendarStoredRange = {
  fullRangeStart?: string;
  fullRangeEnd?: string;
};

export function resolveFullCalendarSegmentAndFullRange(event: {
  start: Date | null;
  end: Date | null;
  extendedProps?: FullCalendarStoredRange | Record<string, unknown>;
}) {
  const ep = event.extendedProps as FullCalendarStoredRange | undefined;
  const fullStart = ep?.fullRangeStart ? new Date(ep.fullRangeStart) : null;
  const fullEnd = ep?.fullRangeEnd ? new Date(ep.fullRangeEnd) : null;

  // FullCalendar can provide null end in some cases; never fall back to "now" because that
  // makes durations/labels look random. Prefer API-stored fullStart/fullEnd when available.
  const segmentStart = new Date(event.start ?? fullStart ?? new Date());
  const segmentEndFallback =
    fullEnd ??
    // Last-resort: keep a non-zero duration so the event doesn't collapse to a dot/line.
    new Date(segmentStart.getTime() + 30 * 60 * 1000);
  const segmentEnd = new Date(event.end ?? segmentEndFallback);

  const resolvedFullStart = fullStart ?? segmentStart;
  const resolvedFullEnd = fullEnd ?? segmentEnd;

  // Single-day events: segment start/end are the full occurrence. FullCalendar updates those
  // during drag/resize, but extendedProps.fullRange* stays stale until the API refetch.
  const storedSameDay =
    resolvedFullStart.getFullYear() === resolvedFullEnd.getFullYear() &&
    resolvedFullStart.getMonth() === resolvedFullEnd.getMonth() &&
    resolvedFullStart.getDate() === resolvedFullEnd.getDate();

  if (storedSameDay) {
    return {
      segmentStart,
      segmentEnd,
      fullStart: segmentStart,
      fullEnd: segmentEnd,
    };
  }

  return {
    segmentStart,
    segmentEnd,
    fullStart: resolvedFullStart,
    fullEnd: resolvedFullEnd,
  };
}

export function formatDateTimeRangeTooltip(start: Date, end: Date) {
  const sameDay = start.toDateString() === end.toDateString();
  const fmtDate = (d: Date) =>
    d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtTime = (d: Date) =>
    d.toLocaleString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  if (sameDay) {
    return `${fmtDate(start)}, ${fmtTime(start)} → ${fmtTime(end)}`;
  }
  return `${fmtDate(start)}, ${fmtTime(start)} → ${fmtDate(end)}, ${fmtTime(end)}`;
}

/** Line shown under the title on calendar blocks (single-day = times only; multi-day = full range). */
export function formatInlineEventTimeRange(fullStart: Date, fullEnd: Date) {
  const sameDay =
    fullStart.getFullYear() === fullEnd.getFullYear() &&
    fullStart.getMonth() === fullEnd.getMonth() &&
    fullStart.getDate() === fullEnd.getDate();
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  if (sameDay) {
    return `${fmtTime(fullStart)} – ${fmtTime(fullEnd)}`;
  }
  return formatDateTimeRangeTooltip(fullStart, fullEnd);
}
