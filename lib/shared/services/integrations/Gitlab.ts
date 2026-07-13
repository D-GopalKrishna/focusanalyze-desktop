import type { AxiosError } from 'axios';
import {
  GitLabApi,
  type GitLabAuthUrlResponse,
  type GitLabStatusResponse,
} from "@shared/api-client";
import { createApiClient } from "@shared/services/api/auth";

const api = createApiClient(GitLabApi);

export const integrateGitlabAuthUrlRetrieve = async (): Promise<GitLabAuthUrlResponse> => {
  const res = await api.integrationsGitlabAuthUrlRetrieve();
  return res.data;
};

export const integrateGitlabStatusRetrieve = async (): Promise<GitLabStatusResponse> => {
  const res = await api.integrationsGitlabStatusRetrieve();
  return res.data;
};

export const integrateGitlabCallbackRetrieve = async (code: string, state: string | null) => {
  const res = await api.integrationsGitlabCallbackRetrieve({
    params: {
      code,
      ...(state ? { state } : {}),
    },
  });
  return (res.data ?? {}) as { success?: boolean; error?: string };
};

export const integrateGitlabDisconnect = async () => {
  try {
    await api.integrationsGitlabDisconnectDestroy();
  } catch (error) {
    const ax = error as AxiosError<{ error?: string }>;
    const msg = ax.response?.data?.error ?? ax.message ?? 'Disconnect failed';
    throw new Error(msg);
  }
};
