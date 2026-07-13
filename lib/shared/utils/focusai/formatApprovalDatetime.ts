import { formatIsoInTimeZone } from "@shared/utils/notifications";
import { resolvePlannerTimezone } from "@shared/utils/planner-sidebar-prefs";

/** Format HITL / proposal datetimes in the user's effective timezone. */
export function formatApprovalDatetime(
  iso: string | null | undefined,
  userTimezone?: string | null,
): string {
  if (!iso) return '';
  const tz = resolvePlannerTimezone(userTimezone);
  return formatIsoInTimeZone(iso, tz) ?? iso;
}
