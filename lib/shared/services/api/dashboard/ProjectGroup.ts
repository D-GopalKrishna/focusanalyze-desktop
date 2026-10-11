import {
  ProjectGroupApi,
  type ProjectGroupRead,
  type ProjectGroupWrite,
  type PatchedProjectGroupWrite,
} from "@shared/api-client";
import { createApiClient } from '../auth';

const api = createApiClient(ProjectGroupApi);

/** The current user's sidebar project groups, in sidebar order. */
export async function getProjectGroups(): Promise<ProjectGroupRead[]> {
  const response = await api.apiProjectGroupList(10000, 0);
  // The endpoint returns a plain array (not paginated); the generated client types it loosely.
  return (response.data as unknown as ProjectGroupRead[]) ?? [];
}

/** New groups are appended to the end of the sidebar by the server. */
export async function createProjectGroup(data: ProjectGroupWrite): Promise<ProjectGroupRead> {
  return (await api.apiProjectGroupCreate(data)).data;
}

export async function updateProjectGroup(
  id: number,
  data: PatchedProjectGroupWrite,
): Promise<ProjectGroupRead> {
  return (await api.apiProjectGroupPartialUpdate(id, data)).data;
}

/** Deletes the group only; its projects move to the top level of the sidebar. */
export async function deleteProjectGroup(id: number): Promise<void> {
  await api.apiProjectGroupDestroy(id);
}

/** Place a group right after `after` (a group or a loose project); null/omitted for first. */
export async function moveProjectGroup(
  id: number,
  after: { type: 'project' | 'group'; id: number } | null,
): Promise<ProjectGroupRead> {
  const response = await api.apiProjectGroupMoveCreate(id, {
    after_id: after?.id ?? null,
    after_type: after?.type,
  } as Parameters<typeof api.apiProjectGroupMoveCreate>[1]);
  return response.data;
}
