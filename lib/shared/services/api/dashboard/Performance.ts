import { DailyReportApi, ProjectTimeAnalytics } from "@shared/api-client";
import { createApiClient } from '../auth';

/** Grouped project-time response when `group_by` is `day` or `week` (not in OpenAPI client yet). */
export type ProjectTimeAnalyticsBucket = {
  bucket_start: string;
  rows: ProjectTimeAnalytics[];
};

export type ProjectTimeAnalyticsGroupedResponse = {
  group_by?: string;
  buckets: ProjectTimeAnalyticsBucket[];
};

const api = createApiClient(DailyReportApi);

async function getProjectTimeAnalytics(
  fromDatetime: string,
  toDatetime: string,
  opts?: { groupBy?: 'day' | 'week' },
): Promise<ProjectTimeAnalytics[] | ProjectTimeAnalyticsGroupedResponse> {
  const resp = (
    await api.apiDailyReportProjectTimeAnalyticsList(
      fromDatetime,
      toDatetime,
      opts?.groupBy,
      undefined,
      undefined,
    )
  ).data;

  if (opts?.groupBy) {
    if (resp && typeof resp === 'object' && 'buckets' in resp) {
      return resp as ProjectTimeAnalyticsGroupedResponse;
    }
    return { group_by: opts.groupBy, buckets: [] };
  }

  if (Array.isArray(resp)) return resp;
  return (resp as { results?: ProjectTimeAnalytics[] })?.results ?? [];
}

export { getProjectTimeAnalytics };
