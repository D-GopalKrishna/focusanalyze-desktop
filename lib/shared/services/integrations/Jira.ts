import type { AxiosError } from 'axios';
import {
  JiraApi,
  type JiraAuthUrlResponse,
  type JiraStatusResponse,
} from "@shared/api-client";
import { createApiClient } from "@shared/services/api/auth";

const api = createApiClient(JiraApi);

export const integrateJiraAuthUrlRetrieve = async (): Promise<JiraAuthUrlResponse> => {
  const res = await api.integrationsJiraAuthUrlRetrieve();
  return res.data;
};

export const integrateJiraStatusRetrieve = async (): Promise<JiraStatusResponse> => {
  const res = await api.integrationsJiraStatusRetrieve();
  return res.data;
};

export const integrateJiraCallbackRetrieve = async (code: string, state: string | null) => {
  const res = await api.integrationsJiraCallbackRetrieve({
    params: {
      code,
      ...(state ? { state } : {}),
    },
  });
  return (res.data ?? {}) as { success?: boolean; error?: string };
};

export const integrateJiraDisconnect = async (integrationId?: number) => {
  if (typeof integrationId !== 'number') {
    throw new Error('integrationId is required to disconnect');
  }
  try {
    await api.integrationsJiraDisconnectDestroy({ data: { integration_id: integrationId } });
  } catch (error) {
    const ax = error as AxiosError<{ error?: string }>;
    const msg = ax.response?.data?.error ?? ax.message ?? 'Disconnect failed';
    throw new Error(msg);
  }
};
