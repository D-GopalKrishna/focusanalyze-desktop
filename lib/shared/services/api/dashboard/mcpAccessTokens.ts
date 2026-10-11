import {
  ApiApi,
  type CreateMcpAccessTokenResponse,
  type McpAccessToken,
  type McpTokenGlobalGrant,
  type McpTokenProjectGrant,
} from "@shared/api-client";
import { createApiClient } from '../auth';

export type {
  CreateMcpAccessTokenResponse,
  McpAccessToken,
  McpTokenGlobalGrant,
  McpTokenProjectGrant,
} from "@shared/api-client";

/** Project-scoped MCP entity types (require a project on the grant). Task Priority,
 * Capacity Budget and Event are dual-scope — they also appear in
 * McpGlobalEntityType, since a token can hold both a project-scoped and a global
 * grant for the same entity type (see DUAL_SCOPE_MCP_ENTITY_TYPES in the backend).
 * Event's global row is the personal calendar: blocks with no project at all. */
export type McpProjectEntityType =
  | 'task'
  | 'event'
  | 'comment'
  | 'track'
  | 'task_priority'
  | 'task_type'
  | 'project_label'
  | 'project_column'
  | 'goal'
  | 'release'
  | 'capacity';
/** Global (non-project-scoped) MCP entity types. */
export type McpGlobalEntityType =
  | 'life_area'
  | 'habit'
  | 'journal'
  | 'plan'
  | 'organization'
  | 'notification'
  | 'task_priority'
  | 'capacity'
  | 'event';

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

/** GET /api/focusgpt/mcp-access-tokens/{id}/project-grants/ — one row per (visible
 * project) x (Task, Event). */
export async function listMcpTokenProjectGrants(tokenId: number): Promise<McpTokenProjectGrant[]> {
  const { data } = await apiClient().apiFocusgptMcpAccessTokensProjectGrantsList(tokenId);
  return data;
}

/** PUT /api/focusgpt/mcp-access-tokens/{id}/project-grants/{projectId}/{entityType}/ */
export async function setMcpTokenProjectGrant(
  tokenId: number,
  projectId: number,
  entityType: McpProjectEntityType,
  permissions: { canWrite: boolean; canDelete: boolean },
): Promise<McpTokenProjectGrant> {
  const { data } = await apiClient().apiFocusgptMcpAccessTokensProjectGrantsUpdate(
    entityType,
    tokenId,
    projectId,
    { can_write: permissions.canWrite, can_delete: permissions.canDelete },
  );
  return data;
}

/** GET /api/focusgpt/mcp-access-tokens/{id}/global-grants/ — non-project-scoped
 * entity types (today just Life Area). */
export async function listMcpTokenGlobalGrants(tokenId: number): Promise<McpTokenGlobalGrant[]> {
  const { data } = await apiClient().apiFocusgptMcpAccessTokensGlobalGrantsList(tokenId);
  return data;
}

/** PUT /api/focusgpt/mcp-access-tokens/{id}/global-grants/{entityType}/ */
export async function setMcpTokenGlobalGrant(
  tokenId: number,
  entityType: McpGlobalEntityType,
  permissions: { canWrite: boolean; canDelete: boolean },
): Promise<McpTokenGlobalGrant> {
  const { data } = await apiClient().apiFocusgptMcpAccessTokensGlobalGrantsUpdate(entityType, tokenId, {
    can_write: permissions.canWrite,
    can_delete: permissions.canDelete,
  });
  return data;
}
