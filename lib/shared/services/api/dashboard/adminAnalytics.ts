import axios from 'axios';
import { addMonths, endOfMonth, startOfMonth, subMonths } from 'date-fns';
import {
  OrganizationAnalyticsApi,
  type AdminAnalyticsRollup,
  type AdminUserAnalytics,
} from "@shared/api-client";
import { createApiClient } from '../auth';

const analyticsApi = createApiClient(OrganizationAnalyticsApi);

/** Chart label for a month bucket (`bucket_start` = first of month, ISO-8601). */
export function formatAdminMonthlyTrendLabel(bucketStart: string): string {
  const d = new Date(bucketStart);
  if (Number.isNaN(d.getTime())) return bucketStart;
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

/** Chart label for a daily bucket (`bucket_start` = start of day, ISO-8601). */
export function formatAdminDailyTrendLabel(bucketStart: string): string {
  const d = new Date(bucketStart);
  if (Number.isNaN(d.getTime())) return bucketStart;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * One full calendar month for per-user analytics.
 * Uses UTC boundaries for the local calendar year/month of `month` so `toISOString()` does not
 * shift a local start-of-month into the previous UTC month (which produced two monthly buckets).
 */
export function getCalendarMonthRange(month: Date): { fromDatetime: string; toDatetime: string } {
  const y = month.getFullYear();
  const m = month.getMonth();
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
  return { fromDatetime: start.toISOString(), toDatetime: end.toISOString() };
}

/**
 * Twelve calendar months ending at `endMonth` (inclusive): first day of month (start)
 * through last moment of `endMonth`. Used for org/team rollups.
 */
export function getTwelveMonthRangeEnding(endMonth: Date): {
  fromDatetime: string;
  toDatetime: string;
} {
  const start = startOfMonth(subMonths(endMonth, 11));
  const end = endOfMonth(endMonth);
  return { fromDatetime: start.toISOString(), toDatetime: end.toISOString() };
}

/** @deprecated Use getTwelveMonthRangeEnding; kept for any legacy callers. */
export function getDefaultAdminAnalyticsRange(): { fromDatetime: string; toDatetime: string } {
  return getTwelveMonthRangeEnding(new Date());
}

export async function fetchOrganizationAnalyticsRollup(
  orgId: number,
  range = getDefaultAdminAnalyticsRange(),
): Promise<AdminAnalyticsRollup> {
  const resp = await analyticsApi.apiOrganizationsAnalyticsRetrieve(
    range.fromDatetime,
    orgId,
    range.toDatetime,
  );
  return resp.data;
}

export async function fetchTeamAnalyticsRollup(
  orgId: number,
  organizationGroupId: number,
  range = getDefaultAdminAnalyticsRange(),
): Promise<AdminAnalyticsRollup> {
  const resp = await analyticsApi.apiOrganizationsGroupsAnalyticsRetrieve(
    range.fromDatetime,
    organizationGroupId,
    orgId,
    range.toDatetime,
  );
  return resp.data;
}

export async function fetchOrganizationUserAnalytics(
  orgId: number,
  userId: number,
  range = getCalendarMonthRange(startOfMonth(new Date())),
): Promise<AdminUserAnalytics> {
  const resp = await analyticsApi.apiOrganizationsUsersAnalyticsRetrieve(
    range.fromDatetime,
    orgId,
    range.toDatetime,
    userId,
  );
  return resp.data;
}

export async function fetchTeamUserAnalytics(
  orgId: number,
  organizationGroupId: number,
  userId: number,
  range = getCalendarMonthRange(startOfMonth(new Date())),
): Promise<AdminUserAnalytics> {
  const resp = await analyticsApi.apiOrganizationsGroupsUsersAnalyticsRetrieve(
    range.fromDatetime,
    organizationGroupId,
    orgId,
    range.toDatetime,
    userId,
  );
  return resp.data;
}

export function analyticsHttpErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as { detail?: unknown } | undefined;
    if (d && typeof d.detail === 'string') return d.detail;
    if (err.response?.status === 403) return 'You do not have permission to view this analytics.';
    if (err.response?.status === 404) return 'Not found.';
  }
  return err instanceof Error ? err.message : 'Failed to load analytics.';
}

export type { AdminAnalyticsRollup, AdminUserAnalytics };
