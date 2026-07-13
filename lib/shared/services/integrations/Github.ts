import {
  GitHubApi,
  type GitHubAuthUrlResponse,
  type GitHubInstallCallbackResponse,
  type GitHubStatusResponse,
} from "@shared/api-client";
import { createApiClient } from '../api/auth';
import { axiosErrorBody } from '../api/openapiHelpers';

export type GitHubRepositoryItem = {
  id: number;
  full_name: string;
  name: string;
  private: boolean;
  html_url?: string;
  is_active: boolean;
};

export type GitHubInstallationItem = {
  id: number;
  installation_id: number;
  account_type: string;
  account_login?: string | null;
  account_html_url?: string | null;
  repository_selection: string;
  permissions?: Record<string, string>;
  repositories: GitHubRepositoryItem[];
  connected_at?: string;
};

export type GitHubIntegrationStatus = GitHubStatusResponse & {
  identity_linked?: boolean;
  integrations?: GitHubInstallationItem[];
};

const githubApi = createApiClient(GitHubApi);

export const integrateGithubAuthUrlRetrieve = async (): Promise<
  GitHubAuthUrlResponse & { install_url?: string | null }
> => {
  const res = await githubApi.integrationsGithubAuthUrlRetrieve();
  return res.data as GitHubAuthUrlResponse & { install_url?: string | null };
};

export const integrateGithubIdentityAuthUrlRetrieve = async (): Promise<GitHubAuthUrlResponse> => {
  const res = await githubApi.integrationsGithubIdentityAuthUrlRetrieve();
  return res.data;
};

export const integrateGithubInstallCallbackRetrieve = async (
  installationId: string,
  state: string | null,
  setupAction?: string | null,
) => {
  const res = await githubApi.integrationsGithubInstallCallbackRetrieve({
    params: {
      installation_id: installationId,
      ...(state ? { state } : {}),
      ...(setupAction ? { setup_action: setupAction } : {}),
    },
  });
  const data = (res.data ?? {}) as GitHubInstallCallbackResponse & {
    message?: string;
    installation_id?: number;
  };
  return data;
};

export const integrateGithubCallbackRetrieve = async (code: string, state: string | null) => {
  const res = await githubApi.integrationsGithubCallbackRetrieve({
    params: { code, ...(state ? { state } : {}) },
  });
  return (res.data ?? {}) as { success?: boolean; error?: string };
};

export const integrateGithubStatusRetrieve = async (options?: {
  includeRepositories?: boolean;
}): Promise<GitHubIntegrationStatus> => {
  const res = await githubApi.integrationsGithubStatusRetrieve(
    options?.includeRepositories ? { params: { include_repositories: true } } : undefined,
  );
  return res.data as GitHubIntegrationStatus;
};

export const integrateGithubDisconnect = async (integrationId?: number): Promise<void> => {
  try {
    await githubApi.integrationsGithubDisconnectDestroy(
      integrationId != null ? { params: { integration_id: integrationId } } : undefined,
    );
  } catch (err) {
    throw new Error(axiosErrorBody(err) || 'Failed to disconnect GitHub');
  }
};
