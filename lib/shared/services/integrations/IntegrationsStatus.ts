import {
  IntegrationsApi,
  type IntegrationsStatusResponse as ApiIntegrationsStatusResponse,
  type JiraIntegrationItem,
} from "@shared/api-client";
import type {
  GitHubInstallationItem,
  GitHubIntegrationStatus,
} from "@shared/services/integrations/Github";
import { isAxiosError } from 'axios';
import { createApiClient } from '../api/auth';
import { axiosErrorBody } from '../api/openapiHelpers';
import {
  parseProRequiredFromResponse,
  ProSubscriptionRequiredError,
} from "@shared/utils/pro-subscription";

export { ProSubscriptionRequiredError };
export { isProSubscriptionRequiredError } from "@shared/utils/pro-subscription";

const integrationsApi = createApiClient(IntegrationsApi);

export type NotionIntegrationStatusEmbedded = {
  success?: boolean;
  connected?: boolean;
  workspace_id?: string | null;
  error?: string | null;
};

export type TodoistIntegrationStatusEmbedded = {
  success?: boolean;
  connected?: boolean;
  account_name?: string | null;
  connected_at?: string;
  error?: string | null;
};

export type GitLabIntegrationStatusEmbedded = {
  success?: boolean;
  connected?: boolean;
  account_name?: string | null;
  connected_at?: string;
  error?: string | null;
};

export type GoogleCalendarIntegrationItem = {
  id: number;
  email?: string | null;
  connected_at?: string;
  last_synced?: string;
};

export type GoogleCalendarStatusEmbedded = {
  success?: boolean;
  connected?: boolean;
  integrations?: GoogleCalendarIntegrationItem[];
  error?: string | null;
};

export type JiraIntegrationStatusEmbedded = {
  success?: boolean;
  connected?: boolean;
  integrations?: JiraIntegrationItem[];
  error?: string | null;
};

export type IntegrationsStatusResponse = ApiIntegrationsStatusResponse & {
  error?: string | null;
  github?: GitHubIntegrationStatus;
};

export type GetIntegrationsStatusOptions = {
  includeGithubRepositories?: boolean;
};

export async function integrateAllStatusRetrieve(
  options?: GetIntegrationsStatusOptions,
): Promise<IntegrationsStatusResponse> {
  try {
    const res = await integrationsApi.integrationsStatusRetrieve(
      options?.includeGithubRepositories
        ? { params: { include_github_repositories: true } }
        : undefined,
    );
    return res.data as IntegrationsStatusResponse;
  } catch (err) {
    const bodyText = axiosErrorBody(err);
    const status = isAxiosError(err) ? (err.response?.status ?? 0) : 0;
    const proRequired = parseProRequiredFromResponse(status, bodyText);
    if (proRequired) {
      throw proRequired;
    }
    throw new Error('Failed to load integration status');
  }
}

export const PROJECT_TASK_INTEGRATION_KEYS = [
  'notion',
  'jira',
  'github',
  'todoist',
  'gitlab',
] as const;

export type ProjectTaskIntegrationKey = (typeof PROJECT_TASK_INTEGRATION_KEYS)[number];

export function connectedProjectTaskSources(
  status: IntegrationsStatusResponse | null | undefined,
): ProjectTaskIntegrationKey[] {
  if (!status) return [];
  return PROJECT_TASK_INTEGRATION_KEYS.filter((key) => {
    const entry = status[key];
    return entry?.success !== false && Boolean(entry?.connected);
  });
}
