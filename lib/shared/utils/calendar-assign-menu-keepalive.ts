/**
 * CalendarView nulls `assignMenu.event` when the context menu closes. Confirmation dialogs
 * (delete, recurring report exclude/include) must keep CalendarEventAssignMenu mounted after
 * that close — otherwise the dialog state update is a no-op because the component returned null.
 *
 * Delete already stashes composite selection keys before close; report exclusion must do the same.
 */
export function shouldKeepAssignMenuAlive(args: {
  hasEvent: boolean;
  pendingDeleteKeys: string[] | null | undefined;
  pendingReportExclusionKeys: string[] | null | undefined;
}): boolean {
  if (args.hasEvent) return true;
  if (args.pendingDeleteKeys && args.pendingDeleteKeys.length > 0) return true;
  if (args.pendingReportExclusionKeys && args.pendingReportExclusionKeys.length > 0) return true;
  return false;
}

/** Prefer keys stashed before the menu closed; fall back to live resolution while event is still set. */
export function reportExclusionTargetKeys(
  pendingKeys: string[] | null | undefined,
  liveKeys: string[],
): string[] {
  if (pendingKeys && pendingKeys.length > 0) return pendingKeys;
  return liveKeys;
}
