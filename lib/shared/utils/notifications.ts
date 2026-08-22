import {
  NotificationsApiListStatusEnum,
  NotificationsApiListTypeEnum,
  NotificationTypeEnum,
} from "@shared/api-client/api";
import { getTaskById } from "@shared/services/api/dashboard/Task";
import { getFocusAnalyzeTaskPageUrl } from "@shared/utils/navigations";
import { dashboardPerformancePath } from '@/lib/config/urls';

import { SourceEnum, type Notification } from "@shared/api-client/api";

import { sourceIcons } from "@shared/types/notifications";
import { dedupeStreamNotifications } from "@shared/utils/notification-stream-dedupe";

export {
  dedupeStreamNotifications,
  getNotificationStreamDedupeKey,
  getStreamNotificationsSeenKeys,
  hasStreamNotificationToastBeenShown,
  persistStreamNotificationsSeenKeys,
  rememberStreamNotificationToastShown,
} from "@shared/utils/notification-stream-dedupe";

/**
 * Rows older than this (by `created_at`) are treated as backlog: one merged Sonner per batch
 * ("You have N notifications to see"). Newer rows get individual toasts (title + action).
 *
 * Keep this short: Celery republishes all unread over SSE, so a 24h window would replay
 * hours-old plan nudges / summaries as full toasts when the user opens the app.
 */
export const STREAM_NOTIFICATION_FRESH_MAX_AGE_MS = 15 * 60 * 1000;

/** Copy for the merged backlog Sonner / desktop notification. */
export function getStreamNotificationBacklogSummaryCopy(count: number): {
  title: string;
  description: string;
} {
  const n = Math.max(0, count);
  return {
    title: 'New notifications',
    description: n === 1 ? 'You have 1 notification to see' : `You have ${n} notifications to see`,
  };
}

/**
 * Count for backlog summary toasts. Must match the sidebar inbox badge
 * (`unread_notification_count` = persistent + unread only).
 *
 * Celery republishes unread over SSE (including non-persistent calendar reminders
 * excluded from the inbox), so batch length must not be used as the inbox count.
 */
export function getStreamNotificationBacklogSummaryCount(
  stale: (Pick<Notification, 'type' | 'status' | 'id'> & { dedupe_key?: string | null })[],
  inboxUnreadCount: number,
): number | null {
  const uniqueStale = dedupeStreamNotifications(stale);
  if (uniqueStale.length === 0) return null;

  const staleOnlyCalendar = uniqueStale.every((n) => isStreamCalendarReminderNotification(n.type));
  if (staleOnlyCalendar) {
    return uniqueStale.length;
  }

  if (inboxUnreadCount > 0) {
    return inboxUnreadCount;
  }

  const unreadPersistentInBatch = dedupeStreamNotifications(
    uniqueStale.filter(
      (n) =>
        !isStreamCalendarReminderNotification(n.type) &&
        n.status === NotificationsApiListStatusEnum.Unread,
    ),
  ).length;
  return unreadPersistentInBatch > 0 ? unreadPersistentInBatch : null;
}

export function isStreamNotificationFreshForIndividualToast(
  createdAt: string | undefined,
  maxAgeMs: number = STREAM_NOTIFICATION_FRESH_MAX_AGE_MS,
): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= maxAgeMs;
}

export function partitionStreamNotificationsByFreshness(
  notifications: Notification[],
  maxAgeMs: number = STREAM_NOTIFICATION_FRESH_MAX_AGE_MS,
): { fresh: Notification[]; stale: Notification[] } {
  const fresh: Notification[] = [];
  const stale: Notification[] = [];
  for (const n of notifications) {
    if (isStreamNotificationFreshForIndividualToast(n.created_at, maxAgeMs)) {
      fresh.push(n);
    } else {
      stale.push(n);
    }
  }
  return { fresh, stale };
}

/**
 * Calendar reminders delivered over SSE are non-persistent (inbox list API excludes them).
 * Use this when deciding how to treat stream rows separately from task/update/etc.
 */
export function isStreamCalendarReminderNotification(type: string | undefined): boolean {
  return type === NotificationTypeEnum.CalendarReminder;
}

/**
 * First non-empty SSE batch after connect usually contains a mix of backlog items.
 * Calendar reminders in that batch are treated as stale backlog — skip Sonner so users
 * only see toasts for task_due and other types. After the first batch, every new stream
 * item (including new calendar reminders) gets its own toast.
 */
export function shouldShowSonnerForStreamNotification(
  notificationType: string | undefined,
  isInitialNonEmptyStreamBatch: boolean,
): boolean {
  if (!isInitialNonEmptyStreamBatch) return true;
  return !isStreamCalendarReminderNotification(notificationType);
}

/**
 * Parse event id from notification `path` (e.g. `/events/18`).
 * Prefer this over `details` for SSE payloads: `formatNotification` may reshape `details`.
 */
export function getEventIdFromNotificationPath(path: string | undefined | null): number | null {
  if (!path || typeof path !== 'string') return null;
  const m = path.trim().match(/\/events\/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

export function getStreamNotificationToastCopy(
  notification: Pick<Notification, 'title' | 'message' | 'content' | 'type' | 'details'>,
): { title: string; description: string | undefined } {
  const title = (notification.title ?? '').trim() || 'Notification';

  if (notification.type === NotificationsApiListTypeEnum.DailyReflection) {
    const preview = getDailySummaryPreviewFromNotification(notification);
    const insight = parseString(readNotificationDetails(notification.details)?.insight_summary);
    const description = insight?.trim() || preview || undefined;
    return { title, description };
  }

  const descriptionRaw = (notification.message ?? notification.content ?? '').trim();
  return {
    title,
    description: descriptionRaw || undefined,
  };
}

export function parseTaskIdFromNotificationPath(path: string | undefined | null): number | null {
  if (!path || typeof path !== 'string') return null;
  const m = path.trim().match(/\/tasks\/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

export function readNotificationDetails(details: unknown): Record<string, unknown> | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  return details as Record<string, unknown>;
}

function readDetails(details: unknown): Record<string, unknown> | null {
  return readNotificationDetails(details);
}

function parseNumericId(value: unknown): number | undefined {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return !Number.isNaN(n) ? n : undefined;
}

function parseString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return undefined;
}

export function getDueDateIsoFromNotification(notification: {
  type?: string;
  details?: unknown;
}): string | null {
  if (
    notification.type !== NotificationsApiListTypeEnum.TaskDue &&
    notification.type !== NotificationsApiListTypeEnum.TaskOverdue
  )
    return null;
  const d = readDetails(notification.details);
  const iso = parseString(d?.due_date);
  return iso?.trim() ? iso.trim() : null;
}

export function formatIsoInTimeZone(
  iso: string,
  timeZone: string | undefined,
  opts?: { withTimeZoneLabel?: boolean },
): string | null {
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return null;

    const tz = timeZone?.trim() || undefined;
    const formatter = new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const formatted = formatter.format(dt);
    if (opts?.withTimeZoneLabel && tz) return `${formatted} (${tz})`;
    return formatted;
  } catch {
    return null;
  }
}

/**
 * Format an ISO instant in the **browser's local timezone** (device clock).
 * Prefer this for task due lines in inbox/toasts: API sends UTC ISO strings, but users expect
 * local times; `formatIsoInTimeZone(..., userSettings.timezone)` often resolves to UTC.
 */
export function formatIsoInLocalTimeZone(
  iso: string,
  opts?: { withTimeZoneLabel?: boolean },
): string | null {
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return null;
    const formatter = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const formatted = formatter.format(dt);
    if (opts?.withTimeZoneLabel) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return `${formatted} (${tz})`;
    }
    return formatted;
  } catch {
    return null;
  }
}

export function canNavigateToTaskFromNotification(notification: {
  type?: string;
  path?: string | null;
  details?: unknown;
}): boolean {
  if (
    notification.type !== NotificationsApiListTypeEnum.TaskDue &&
    notification.type !== NotificationsApiListTypeEnum.TaskOverdue
  )
    return false;
  const d = readDetails(notification.details);
  const taskId =
    parseNumericId(d?.task_id) ?? parseTaskIdFromNotificationPath(notification.path ?? undefined);
  return taskId != null;
}

/**
 * Opens the Focus Analyze task page for a `task_due` notification.
 *
 * The route needs both `project_id` and `task_id`. We resolve them in two steps:
 * 1. Prefer `details.task_id` and `details.project_id` when present (no network).
 * 2. If we have a task id but no project id (legacy SSE/inbox rows, or path-only payloads),
 *    fetch the task once to read `task.project.id`.
 *
 * `path` may be a full URL or mixed content; only pass it to path parsing when it looks like
 * `/tasks/:id` so we do not accidentally match other URLs.
 */
export async function navigateToTaskFromNotification(
  notification: { type?: string; path?: string | null; details?: unknown },
  router: { push: (href: string) => void },
): Promise<void> {
  if (
    notification.type !== NotificationsApiListTypeEnum.TaskDue &&
    notification.type !== NotificationsApiListTypeEnum.TaskOverdue
  )
    return;

  const d = readDetails(notification.details);
  const path = notification.path?.trim() ?? '';

  // task_id: details first, else `/tasks/:id` embedded in `path` (when path contains that segment).
  const taskId =
    parseNumericId(d?.task_id) ??
    parseTaskIdFromNotificationPath(path.includes('/tasks/') ? path : undefined);
  const projectIdFromDetails = parseNumericId(d?.project_id);

  // Fast path: both ids in payload — build URL without calling the task API.
  if (taskId != null && projectIdFromDetails != null) {
    router.push(getFocusAnalyzeTaskPageUrl(projectIdFromDetails, taskId));
    return;
  }

  // Nothing to open if we could not resolve a task id at all.
  if (taskId == null) return;

  // Slow path: we have task id but not project id — resolve project via task fetch.
  try {
    const task = await getTaskById(taskId);
    const pid = task.project?.id;
    if (pid != null) {
      router.push(getFocusAnalyzeTaskPageUrl(pid, task.id));
    }
  } catch (e) {
    console.error('Failed to open task from notification', e);
  }
}

const DEFAULT_FOCUS_ICON = sourceIcons[SourceEnum.Focusanalyze] ?? '/favicon-32x32.png';

/**
 * Prefer ``details.icon_url`` / ``details.icon_media_path`` when present (project/org logo);
 * otherwise the source fallback (FocusAnalyze favicon for in-app alerts).
 */
export function resolveNotificationLeadIconSrc(
  notification: Pick<Notification, 'source' | 'details'>,
): string {
  const d = readNotificationDetails(notification.details);
  const absolute = typeof d?.icon_url === 'string' && d.icon_url.trim() ? d.icon_url.trim() : '';
  if (absolute) return absolute;
  const mediaPath =
    typeof d?.icon_media_path === 'string' && d.icon_media_path.trim()
      ? d.icon_media_path.trim()
      : '';
  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
  if (mediaPath && apiBase) {
    const tail = encodeURI(mediaPath.replace(/^\/+/, ''));
    return `${apiBase}/media/${tail}`;
  }
  const src = sourceIcons[(notification.source as SourceEnum) ?? SourceEnum.Focusanalyze];
  return src || DEFAULT_FOCUS_ICON;
}

/**
 * Primary inbox CTA only when API sets ``details.cta_url`` (removal events omit it),
 * or for plan nudge/reflection notification types via ``path`` / ``details``.
 */
export function isPlanNudgeNotification(type: string | undefined): boolean {
  return (
    type === NotificationsApiListTypeEnum.WeeklyPlanNudge ||
    type === NotificationsApiListTypeEnum.DailyPlanNudge
  );
}

export function isPlanReflectionNotification(type: string | undefined): boolean {
  return (
    type === NotificationsApiListTypeEnum.WeeklyReflection ||
    type === NotificationsApiListTypeEnum.DailyReflection ||
    type === NotificationsApiListTypeEnum.MonthlyReflection
  );
}

export function getPlanReflectionFromNotification(notification: {
  type?: string;
  details?: unknown;
}): { scope: 'daily' | 'weekly' | 'monthly'; periodStart: string; snapshotId?: number | null } | null {
  if (!isPlanReflectionNotification(notification.type)) return null;
  const d = readNotificationDetails(notification.details);
  const scope =
    d?.scope === 'weekly'
      ? 'weekly'
      : d?.scope === 'monthly'
        ? 'monthly'
        : d?.scope === 'daily'
          ? ('daily' as const)
          : notification.type === NotificationsApiListTypeEnum.MonthlyReflection
            ? 'monthly'
            : notification.type === NotificationsApiListTypeEnum.WeeklyReflection
              ? 'weekly'
              : notification.type === NotificationsApiListTypeEnum.DailyReflection
                ? 'daily'
                : null;
  const periodStart = parseString(d?.period_start);
  if (!scope || !periodStart) return null;
  return { scope, periodStart, snapshotId: parseNumericId(d?.snapshot_id) ?? null };
}

export function getDailySummaryPreviewFromNotification(notification: {
  type?: string;
  details?: unknown;
  message?: string | null;
  content?: string | null;
}): string | null {
  if (notification.type !== NotificationsApiListTypeEnum.DailyReflection) return null;
  const d = readNotificationDetails(notification.details);
  const fromDetails = parseString(d?.report_preview);
  if (fromDetails?.trim()) return fromDetails.trim();
  const message = (notification.message ?? notification.content ?? '').trim();
  if (!message) return null;
  const parts = message.split('. ');
  if (parts.length > 1 && parts[1].trim()) {
    return parts.slice(1).join('. ').trim();
  }
  return null;
}

export function getNotificationPrimaryCta(
  notification: Pick<Notification, 'type' | 'path' | 'details'>,
): { label: string; href: string } | null {
  const d = readNotificationDetails(notification.details);
  const hrefFromDetails = typeof d?.cta_url === 'string' ? d.cta_url.trim() : '';
  if (hrefFromDetails) {
    const label =
      typeof d?.cta_label === 'string' && d.cta_label.trim() ? d.cta_label.trim() : 'Open';
    return { label, href: hrefFromDetails };
  }

  if (isPlanNudgeNotification(notification.type)) {
    const path = notification.path?.trim();
    if (path) {
      const label =
        notification.type === NotificationsApiListTypeEnum.WeeklyPlanNudge
          ? 'Plan week'
          : 'Plan today';
      return { label, href: path.startsWith('/') ? path : `/${path}` };
    }
  }

  if (isPlanReflectionNotification(notification.type)) {
    const label =
      notification.type === NotificationsApiListTypeEnum.DailyReflection
        ? 'View report'
        : notification.type === NotificationsApiListTypeEnum.MonthlyReflection
          ? 'Review month'
          : 'Review week';
    const period =
      notification.type === NotificationsApiListTypeEnum.DailyReflection
        ? 'day'
        : notification.type === NotificationsApiListTypeEnum.MonthlyReflection
          ? 'month'
          : 'week';
    const periodStart = parseString(d?.period_start);
    return { label, href: dashboardPerformancePath(period, periodStart ?? undefined) };
  }

  return null;
}
