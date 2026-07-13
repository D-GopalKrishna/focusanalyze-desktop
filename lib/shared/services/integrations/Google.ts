import { GoogleCalendarApi } from "@shared/api-client";
import { createApiClient } from '../api/auth';

const googleCalendarApi = createApiClient(GoogleCalendarApi);

function responseBody<T = unknown>(res: { data: T }): T {
  return res.data;
}

/**
 * Normalize list payloads: bare array, DRF `{ results }`, or Google Calendar
 * `{ success, integrations }` from ``list_user_integrations``.
 */
function asIntegrationList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if ('integrations' in data) {
      const list = (data as { integrations?: unknown }).integrations;
      return Array.isArray(list) ? list : [];
    }
    if ('results' in data) {
      const r = (data as { results?: unknown }).results;
      return Array.isArray(r) ? r : [];
    }
  }
  return [];
}

export type GoogleCalendarAuthUrlResult = {
  success?: boolean;
  auth_url?: string;
  error?: string;
  code?: string;
};

export const integrateGoogleCalendarAuthUrlRetrieve =
  async (): Promise<GoogleCalendarAuthUrlResult | null> => {
    const api = googleCalendarApi;
    const res = await api.integrationsGoogleCalendarAuthUrlRetrieve();
    return (responseBody(res) as GoogleCalendarAuthUrlResult | undefined) ?? null;
  };

export type GoogleCalendarCallbackResult = {
  success?: boolean;
  error?: string;
};

export const integrateGoogleCalendarCallbackRetrieve = async (
  code: string,
  state: string | null,
): Promise<GoogleCalendarCallbackResult> => {
  const api = googleCalendarApi;
  const res = await api.integrationsGoogleCalendarCallbackRetrieve({
    params: {
      code,
      ...(state ? { state } : {}),
    },
  });
  return (responseBody(res) as GoogleCalendarCallbackResult | undefined) ?? {};
};

export type GoogleCalendarSyncResult = {
  success?: boolean;
  synced: number;
  error?: string;
};

export const integrateGoogleCalendarSyncEvents = async (
  integrationId: number,
): Promise<GoogleCalendarSyncResult> => {
  const api = googleCalendarApi;
  const res = await api.integrationsGoogleCalendarSyncEventsCreate({
    data: { integration_id: integrationId },
  });
  const raw = responseBody(res) as
    | { success?: boolean; synced?: number; total?: number; error?: string }
    | null
    | undefined;
  const d = raw && typeof raw === 'object' ? raw : {};
  return {
    success: d.success,
    synced: d.synced ?? d.total ?? 0,
    error: d.error,
  };
};

export type GoogleCalendarStatusResult = { success: true; connected: boolean };

export const integrateGoogleCalendarStatusRetrieve =
  async (): Promise<GoogleCalendarStatusResult> => {
    const api = googleCalendarApi;
    const res = await api.integrationsGoogleCalendarStatusRetrieve();
    const raw = responseBody(res) as { success?: boolean; connected?: boolean } | null | undefined;
    const d = raw && typeof raw === 'object' ? raw : {};
    return {
      success: true,
      connected: d.success === true && Boolean(d.connected),
    };
  };

export type GoogleCalendarUserIntegrationsResult = { success: true; integrations: unknown[] };

export const integrateGoogleCalendarUserIntegrations =
  async (): Promise<GoogleCalendarUserIntegrationsResult> => {
    const api = googleCalendarApi;
    const res = await api.integrationsGoogleCalendarUserIntegrationsList();
    const data = responseBody(res);
    const list = Array.isArray(data) ? data : asIntegrationList(data);
    return { success: true, integrations: list };
  };

export const integrateGoogleCalendarDisconnect = async (integrationId?: number): Promise<void> => {
  const api = googleCalendarApi;
  if (typeof integrationId !== 'number') {
    throw new Error('integrationId is required to disconnect');
  }
  await api.integrationsGoogleCalendarDisconnectDestroy({
    data: { integration_id: integrationId },
  });
};
