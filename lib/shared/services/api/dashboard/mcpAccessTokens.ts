import {
  ApiApi,
  type CreateMcpAccessTokenResponse,
  type McpAccessToken,
} from "@shared/api-client";
import { createApiClient } from '../auth';

export type { CreateMcpAccessTokenResponse, McpAccessToken } from "@shared/api-client";

function apiClient(): ApiApi {
  if (!process.env.NEXT_PUBLIC_API_URL) {
    throw new Error('NEXT_PUBLIC_API_URL is not configured');
  }
  return createApiClient(ApiApi);
}

/** GET /api/focusgpt/mcp-access-tokens/ */
export async function listMcpAccessTokens(): Promise<McpAccessToken[]> {
  const { data } = await apiClient().apiFocusgptMcpAccessTokensList();
  return data;
}

/** POST /api/focusgpt/mcp-access-tokens/ */
export async function createMcpAccessToken(name?: string): Promise<CreateMcpAccessTokenResponse> {
  const { data } = await apiClient().apiFocusgptMcpAccessTokensCreate({
    name: name?.trim() || 'Default',
  });
  return data;
}

/** DELETE /api/focusgpt/mcp-access-tokens/{id}/ */
export async function revokeMcpAccessToken(id: number): Promise<void> {
  await apiClient().apiFocusgptMcpAccessTokensDestroy(id);
}
