import { ApiApi, type FocusGPTPreference } from "@shared/api-client";
import { createApiClient } from '../auth';

export type { FocusGPTPreference } from "@shared/api-client";

function apiClient(): ApiApi {
  if (!process.env.NEXT_PUBLIC_API_URL) {
    throw new Error('NEXT_PUBLIC_API_URL is not configured');
  }
  return createApiClient(ApiApi);
}

/** GET /api/focusgpt/preferences/ */
export async function listFocusGPTPreferences(): Promise<FocusGPTPreference[]> {
  const { data } = await apiClient().apiFocusgptPreferencesList();
  return data;
}

/** PATCH /api/focusgpt/preferences/{key}/ */
export async function updateFocusGPTPreferenceSummary(
  key: string,
  summary: string,
): Promise<FocusGPTPreference> {
  const { data } = await apiClient().apiFocusgptPreferencesPartialUpdate(key, { summary });
  return data;
}

/** DELETE /api/focusgpt/preferences/{key}/ */
export async function deleteFocusGPTPreference(key: string): Promise<void> {
  await apiClient().apiFocusgptPreferencesDestroy(key);
}
