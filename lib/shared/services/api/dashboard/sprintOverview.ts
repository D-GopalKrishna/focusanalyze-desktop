import {
  ApiApi,
  type SprintOverviewRequest,
  type SprintOverviewResponse,
} from "@shared/api-client";
import { createApiClient } from '../auth';
import { formatFocusAiMessageApiError } from './FocusAI';
import type { SprintOverviewPayload } from "@shared/utils/sprint-overview-payload";

export type SprintOverviewApiResponse = SprintOverviewResponse;

export async function postSprintOverviewSummary(
  payload: SprintOverviewPayload,
): Promise<SprintOverviewApiResponse> {
  const api = createApiClient(ApiApi);
  try {
    const { data } = await api.apiFocusgptProjectSprintOverviewCreate(
      payload as unknown as SprintOverviewRequest,
    );
    return data;
  } catch (err: unknown) {
    const ax = err as {
      response?: { status?: number; data?: string | Record<string, unknown> };
      message?: string;
    };
    const status = ax.response?.status ?? 0;
    const raw = ax.response?.data;
    const bodyText =
      typeof raw === 'string' ? raw : raw != null ? JSON.stringify(raw) : (ax.message ?? '');
    throw new Error(formatFocusAiMessageApiError(status, bodyText));
  }
}
