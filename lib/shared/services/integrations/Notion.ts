import { NotionApi } from "@shared/api-client";
import { createApiClient } from '../api/auth';
import { axiosErrorBody } from '../api/openapiHelpers';

const api = createApiClient(NotionApi);

export const integrationsNotionAuthUrlRetrieve = async () => {
  const response = await api.integrationsNotionAuthUrlRetrieve();
  return (
    (
      response as unknown as {
        data?: { success?: boolean; auth_url?: string; error?: string };
      }
    )?.data ?? {}
  );
};

export const integrationsNotionCallbackRetrieve = async (code: string, state: string | null) => {
  const response = await api.integrationsNotionCallbackRetrieve({
    params: {
      code,
      ...(state ? { state } : {}),
    },
  });
  return (
    (
      response as unknown as {
        data?: { success?: boolean; error?: string };
      }
    )?.data ?? {}
  );
};

export type NotionIntegrationStatus = {
  success: boolean;
  connected: boolean;
  workspace_id?: string | null;
  error?: string | null;
};

export const integrateNotionStatusRetrieve = async (): Promise<NotionIntegrationStatus> => {
  const res = await api.integrationsNotionStatusRetrieve();
  return res.data as unknown as NotionIntegrationStatus;
};

export const integrateNotionDisconnect = async (): Promise<void> => {
  try {
    await api.integrationsNotionDisconnectDestroy();
  } catch (err) {
    throw new Error(axiosErrorBody(err) || 'Failed to disconnect Notion');
  }
};
