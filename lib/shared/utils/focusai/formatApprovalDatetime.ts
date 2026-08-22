import { resolvePlannerTimezone } from "@shared/utils/planner-sidebar-prefs";

/** Format HITL / proposal datetimes in the user's effective timezone. */
export function formatApprovalDatetime(
  iso: string | null | undefined,
  userTimezone?: string | null,
): string {
  if (!iso) return '';
  const tz = resolvePlannerTimezone(userTimezone);
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(dt);
  } catch {
    return iso;
  }
}

/** "Thu, Aug 20" — compact day label for a block tile, no year (near-term dates only). */
export function formatApprovalDayLabel(
  iso: string | null | undefined,
  userTimezone?: string | null,
): string {
  if (!iso) return '';
  const tz = resolvePlannerTimezone(userTimezone);
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(dt);
  } catch {
    return '';
  }
}

/** "9:00 – 10:00 AM" (or just the start time when there's no end) for a block tile. */
export function formatApprovalTimeRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  userTimezone?: string | null,
): string {
  if (!startIso) return '';
  const tz = resolvePlannerTimezone(userTimezone);
  const timeFmt = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
  });
  try {
    const start = new Date(startIso);
    if (Number.isNaN(start.getTime())) return '';
    const startLabel = timeFmt.format(start);
    if (!endIso) return startLabel;
    const end = new Date(endIso);
    if (Number.isNaN(end.getTime())) return startLabel;
    return `${startLabel} – ${timeFmt.format(end)}`;
  } catch {
    return '';
  }
}
