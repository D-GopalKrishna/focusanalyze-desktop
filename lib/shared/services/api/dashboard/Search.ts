import { ApiApi as ProjectsApi, PaginatedSearchResult } from "@shared/api-client";
import { createApiClient } from '../auth';

const api = createApiClient(ProjectsApi);

export interface GlobalSearchParams {
  page?: number;
  pageSize?: number;
  type?: string; // comma-separated search kinds (task, journal, task_comment, …)
  sort?: string; // title_asc, title_desc, created_asc, created_desc, updated_asc, updated_desc
}

/**
 * Global search. apiSearchRetrieve(q, page?, pageSize?, sort?, type?, options?).
 * Auth is applied via shared OpenAPI configuration.
 */
export async function globalSearch(
  query: string,
  page: number = 1,
  pageSize: number = 20,
  params?: GlobalSearchParams,
): Promise<PaginatedSearchResult> {
  const response = await api.apiSearchRetrieve(query, page, pageSize, params?.sort, params?.type);
  return response.data;
}
