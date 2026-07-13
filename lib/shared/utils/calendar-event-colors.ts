import { Type2cdEnum as CalendarEventType } from "@shared/api-client/api";
import { getContrastColor } from "@shared/utils/general";

/** Theme-aware text on transparent / lightly patterned blocks (draft plans, proposals). */
export const CALENDAR_THEME_FOREGROUND = 'hsl(var(--foreground))';

type CalendarEventTextColorOptions = {
  /** Use app foreground instead of luminance (striped overlays, invited outline, break/OOO). */
  useThemeForeground?: boolean;
};

export function getCalendarEventTextColor(
  backgroundColor: string | undefined | null,
  options: CalendarEventTextColorOptions = {},
): string {
  if (options.useThemeForeground) {
    return CALENDAR_THEME_FOREGROUND;
  }
  const bg = (backgroundColor ?? '').trim().toLowerCase();
  if (!bg || bg === 'transparent') {
    return CALENDAR_THEME_FOREGROUND;
  }
  return getContrastColor(backgroundColor!);
}

/** Resolve readable label color for custom FullCalendar event content. */
export function resolveRenderedCalendarEventTextColor(event: {
  textColor?: string;
  backgroundColor?: string;
  extendedProps?: Record<string, unknown>;
}): string {
  const ext = event.extendedProps ?? {};
  const type = ext.type as CalendarEventType | undefined;

  const useThemeForeground =
    Boolean(ext.isDraftPlan) ||
    Boolean(ext.isProposed) ||
    Boolean(ext.isInvitedEvent) ||
    type === CalendarEventType.Break ||
    type === CalendarEventType.OutOfOffice;

  if (useThemeForeground) {
    return CALENDAR_THEME_FOREGROUND;
  }

  const explicit = event.textColor?.trim();
  const bg = event.backgroundColor;
  if (explicit && bg && bg !== 'transparent') {
    return explicit;
  }

  return getCalendarEventTextColor(bg);
}
