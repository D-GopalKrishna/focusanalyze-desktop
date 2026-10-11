import { isAxiosError } from 'axios';
import {
  Configuration,
  ProjectApi,
  Project,
  ProjectTrack,
  ProjectTrackApi,
  ProjectCategory,
  PaginatedProjectList,
  ApiApi as ProjectCategoryApi,
  PaginatedProjectCategoryList,
  ProjectLabel,
  ApiApi as ProjectLabelsApi,
  ApiApi as ProjectColumnApi,
  PatchedProjectTrack,
  ProjectColumn,
  PaginatedProjectColumnList,
  PaginatedProjectLabelList,
  MinimalUser,
  ProjectBoard,
  ProjectList,
  ProjectAllTracks,
  ProjectReorder,
  type ProjectMoveResult,
  ProjectTrackCompleteRequest,
  ProjectTrackCompleteResponse,
  PaginatedProjectTrackList,
  Release,
  ReleaseApi,
  ReleaseStatusEnum,
  PatchedRelease,
  PaginatedReleaseList,
  Goal,
  GoalApi,
  GoalStatusEnum,
  PatchedGoal,
  PaginatedGoalList,
  KeyResult,
  KeyResultApi,
  PatchedKeyResult,
  PaginatedKeyResultList,
  ApiProjectInviteCreateRequestAccessLevelEnum,
  type ApiJournalDayUploadEditorImageCreate400Response,
  type ApiProjectInviteCreateRequest,
  type PatchedProjectSharePermissionUpdate,
  type UserAccess,
  type GroupAccess,
  type ProjectHistoryTimeline,
  type ProjectRestoreResult,
  type RevertResponse,
  EntityTypeEnum,
} from "@shared/api-client";
import {
  bearerAuthorizationHeader,
  createApiClient,
  createApiConfiguration,
  getAccessToken,
} from '../auth';

const api = createApiClient(ProjectApi);

const categoryApi = createApiClient(ProjectCategoryApi);

const labelApi = createApiClient(ProjectLabelsApi);

const statusApi = createApiClient(ProjectColumnApi);

const trackApi = createApiClient(ProjectTrackApi);

const releaseApi = createApiClient(ReleaseApi);

const goalApi = createApiClient(GoalApi);

const keyResultApi = createApiClient(KeyResultApi);

/**
 * Maps DRF/OpenAPI `{ detail: string }` axios errors from project endpoints to a user-visible message.
 */
export function getProjectApiErrorDetail(error: unknown, fallbackMessage: string): string {
  if (!isAxiosError(error)) {
    return fallbackMessage;
  }
  const data = error.response?.data;
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }
  }
  return fallbackMessage;
}

/** Share dialog tiers: **read-only** (`view`) vs **full collaboration** (`edit`) — tracks/tasks/columns CRUD. */
export type ShareInvitePermissionUi = 'can_edit' | 'can_view';

/** UI permission → OpenAPI invite body `access_level` (see ApiProjectInviteCreateRequestAccessLevelEnum). */
export function shareInviteUiToApiAccessLevel(
  ui: ShareInvitePermissionUi,
): NonNullable<ApiProjectInviteCreateRequest['access_level']> {
  switch (ui) {
    case 'can_view':
      return ApiProjectInviteCreateRequestAccessLevelEnum.View;
    case 'can_edit':
      return ApiProjectInviteCreateRequestAccessLevelEnum.Edit;
    default:
      return ApiProjectInviteCreateRequestAccessLevelEnum.View;
  }
}

async function getAllProjectCategories(
  limit?: number,
  offset?: number,
): Promise<PaginatedProjectCategoryList> {
  limit = limit || 10000;
  offset = offset || 0;

  const categories = (await categoryApi.apiProjectCategoryList(limit, offset)).data;
  return categories;
}

async function createNewProjectCategory(category: ProjectCategory): Promise<ProjectCategory> {
  const newCategory = (await categoryApi.apiProjectCategoryCreate(category)).data;
  return newCategory;
}

async function updateProjectCategory(category: ProjectCategory): Promise<ProjectCategory> {
  const updatedCategory = (await categoryApi.apiProjectCategoryUpdate(category.id, category)).data;
  return updatedCategory;
}

async function deleteProjectCategory(categoryId: number): Promise<void> {
  await categoryApi.apiProjectCategoryDestroy(categoryId);
}

async function createNewProjectLabel(label: ProjectLabel): Promise<ProjectLabel> {
  const newLabel = (await labelApi.apiProjectLabelsCreate(label)).data;
  return newLabel;
}

async function updateProjectLabel(label: ProjectLabel): Promise<ProjectLabel> {
  const updatedLabel = (await labelApi.apiProjectLabelsUpdate(label.id, label)).data;
  return updatedLabel;
}

async function deleteProjectLabel(labelId: number): Promise<void> {
  await labelApi.apiProjectLabelsDestroy(labelId);
}

/**
 * Fetches labels for a single project. Labels belong to exactly one project.
 */
/** Labels are project-scoped (created in that project's Settings), so a project's full list
 * is expected to be small — cap at 20 rather than paginating. */
const MAX_PROJECT_LABELS = 20;

async function getAllProjectLabels(
  projectId: number,
  limit?: number,
  offset?: number,
): Promise<PaginatedProjectLabelList> {
  limit = limit || MAX_PROJECT_LABELS;
  offset = offset || 0;

  const labels = (
    await labelApi.apiProjectLabelsList(limit, offset, { params: { project: projectId } })
  ).data;
  return labels;
}

async function reorderProjectLabels(
  projectId: number,
  labels: { id: number; order: number }[],
): Promise<void> {
  await labelApi.apiProjectLabelsReorderCreate({
    project: projectId,
    labels,
  } as unknown as ProjectLabel);
}

async function createNewProjectColumn(
  columnName: string,
  projectId: number,
  role: string = 'PROGRESS',
  color?: string,
): Promise<ProjectColumn> {
  const body: Record<string, unknown> = {
    name: columnName,
    project: projectId,
    role,
  };
  if (color != null && String(color).trim() !== '') {
    body.color = color;
  }
  const newColumn = (await statusApi.apiProjectColumnCreate(body as any)).data;
  return newColumn;
}

// TODO: create a type from the backend for the Create Project type.
async function createNewProject(project: any): Promise<Project> {
  const newProject = (await api.apiProjectCreate(project)).data;
  return newProject;
}

async function getAllProjects(
  limit?: number,
  offset?: number,
  page?: number,
  pageSize?: number,
): Promise<PaginatedProjectList> {
  limit = limit || 10000;
  offset = offset || 0;
  page = page || 1;
  pageSize = pageSize || 10000;

  const projects = (await api.apiProjectList(limit, offset)).data;
  return projects;
}

/**
 * Place an owned project in the sidebar: into `groupId` (or the top level when null) right after
 * `after` (omit/null for first position). Only this project's row changes on the server.
 */
async function moveProject(
  projectId: number,
  destination: {
    groupId: number | null;
    after: { type: 'project' | 'group'; id: number } | null;
  },
): Promise<ProjectMoveResult> {
  const response = await api.apiProjectMoveCreate(projectId, {
    group_id: destination.groupId,
    after_id: destination.after?.id ?? null,
    after_type: destination.after?.type,
  } as Parameters<typeof api.apiProjectMoveCreate>[1]);
  return response.data;
}

async function reorderSharedProjects(
  projects: { id: number; order: number }[],
): Promise<{ detail: string }> {
  const payload: ProjectReorder = {
    projects: projects.map((p) => ({ id: p.id, order: p.order })),
  };
  const response = await api.apiProjectReorderSharedCreate(payload);
  return response.data as any;
}

async function getProjectBoardView(
  projectId: number,
  status: string = '',
  taskQ: string = '',
  filters: string = '',
): Promise<ProjectBoard> {
  const project = (
    await api.apiProjectBoardViewRetrieve(
      projectId,
      filters || undefined,
      status || undefined,
      taskQ || undefined,
    )
  ).data;
  return project;
}

async function getProjectListView(
  projectId: number,
  status: string = '',
  taskQ: string = '',
  filters: string = '',
): Promise<ProjectList> {
  const project = (
    await api.apiProjectListViewRetrieve(
      projectId,
      filters || undefined,
      status || undefined,
      taskQ || undefined,
    )
  ).data;
  return project;
}

async function getProjectSprintView(
  projectId: number,
  status: string = '',
  taskQ: string = '',
  filters: string = '',
): Promise<ProjectAllTracks> {
  const project = (
    await api.apiProjectSprintViewRetrieve(
      projectId,
      filters || undefined,
      status || undefined,
      taskQ || undefined,
    )
  ).data;
  return project;
}

// Backwards-compatible wrapper – routes to the appropriate view-specific endpoint
async function getProjectById(
  projectId: number,
  status: string = '',
  taskQ: string = '',
  trackType: string = 'current',
  view: string = 'board',
  filters: string = '',
): Promise<any> {
  if (trackType === 'all') {
    return getProjectSprintView(projectId, status, taskQ, filters);
  }
  if (view === 'list') {
    return getProjectListView(projectId, status, taskQ, filters);
  }
  // Default: board view / current track
  return getProjectBoardView(projectId, status, taskQ, filters);
}

async function getProjectColumns(projectId: number): Promise<PaginatedProjectColumnList> {
  const response = (
    await statusApi.apiProjectColumnList(
      undefined, // limit
      undefined, // offset
      { params: { project: projectId } },
    )
  ).data;
  return response;
}

async function reorderProjectColumns(
  projectId: number,
  columns: { id: number; order: number }[],
): Promise<ProjectColumn[]> {
  const response = await statusApi.apiProjectColumnReorderCreate({
    project: projectId,
    columns: columns,
  } as any);
  return response.data as unknown as ProjectColumn[];
}

async function deleteProjectColumn(columnId: number): Promise<void> {
  await statusApi.apiProjectColumnDestroy(columnId);
}

async function updateProjectColumn(
  columnId: number,
  name: string,
  projectId: number,
  role?: string,
  color?: string,
): Promise<ProjectColumn> {
  const body: Record<string, unknown> = {
    id: columnId,
    name: name,
    project: projectId,
  };
  if (role != null && role !== '') {
    body.role = role;
  }
  if (color != null && String(color).trim() !== '') {
    body.color = color;
  }
  const response = await statusApi.apiProjectColumnUpdate(columnId, body as any);
  return response.data;
}

async function updateProject(
  projectId: number,
  data: {
    name?: string;
    description?: string;
    category?: number | null;
    labels?: number[];
    type?: 'WITH_TRACK' | 'WITHOUT_TRACK';
  },
): Promise<Project> {
  const response = await api.apiProjectPartialUpdate(projectId, data);
  return response.data;
}

async function uploadProjectIcon(projectId: number, iconFile: File): Promise<any> {
  const { compressImageForUpload } = await import('@/lib/utils/compress-image-for-upload');
  const compressed = await compressImageForUpload(iconFile, 'projectIcon');
  const response = await api.apiProjectUploadIconCreate(projectId, compressed);
  return response.data;
}

async function removeProjectIcon(projectId: number): Promise<any> {
  const response = await api.apiProjectRemoveIconDestroy(projectId);
  return response.data;
}

async function deleteProject(projectId: number): Promise<void> {
  await api.apiProjectDestroy(projectId);
}

/** Re-export MinimalUser for assignee dropdowns (from get-project-assignees) */
export type ProjectAssignee = MinimalUser;

async function getProjectAssignees(projectId: number): Promise<ProjectAssignee[]> {
  const response = await api.apiProjectGetAssigneesList(projectId, undefined, undefined);
  const data = response.data;
  return Array.isArray(data) ? data : (data?.results ?? []);
}

export type CreateProjectTrackData = {
  project: number;
  name: string;
  description?: string;
  start_datetime: string;
  end_datetime?: string | null;
};

async function createNewProjectTrack(payload: CreateProjectTrackData): Promise<ProjectTrack> {
  const response = await trackApi.apiProjectTrackCreate(payload as unknown as ProjectTrack);
  return response.data;
}

async function updateProjectTrack(
  trackId: number,
  payload: {
    name?: string;
    description?: string;
    start_datetime?: string | null;
    end_datetime?: string | null;
  },
): Promise<ProjectTrack> {
  const patched: PatchedProjectTrack = {
    name: payload.name,
    description: payload.description,
    start_datetime: payload.start_datetime,
    end_datetime: payload.end_datetime,
  };
  const response = await trackApi.apiProjectTrackPartialUpdate(trackId, patched);
  return response.data;
}

async function activateProjectTrack(trackId: number): Promise<ProjectTrack> {
  const response = await trackApi.apiProjectTrackActivateCreate(trackId);
  return response.data;
}

async function deleteProjectTrack(trackId: number): Promise<void> {
  await trackApi.apiProjectTrackDestroy(trackId);
}

/** Open tracks for a project (for complete-track destination picker, etc.). */
async function getProjectTracks(projectId: number): Promise<ProjectTrack[]> {
  const limit = 10_000;
  const response = await trackApi.apiProjectTrackList(limit, 0, projectId);
  const data = response.data as PaginatedProjectTrackList;
  return Array.isArray(data?.results) ? data.results : [];
}

async function completeProjectTrack(
  trackId: number,
  payload?: ProjectTrackCompleteRequest,
): Promise<ProjectTrackCompleteResponse> {
  const response = await trackApi.apiProjectTrackCompleteCreate(trackId, payload ?? {});
  return response.data;
}

export type CreateReleaseData = {
  project: number;
  name: string;
  description?: string;
  icon?: string;
  target_date?: string | null;
  status?: ReleaseStatusEnum;
};

async function createNewRelease(payload: CreateReleaseData): Promise<Release> {
  const response = await releaseApi.apiReleaseCreate(payload as unknown as Release);
  return response.data;
}

async function updateRelease(
  releaseId: number,
  payload: {
    name?: string;
    description?: string;
    icon?: string;
    target_date?: string | null;
    status?: ReleaseStatusEnum;
    order?: number;
  },
): Promise<Release> {
  const patched: PatchedRelease = { ...payload };
  const response = await releaseApi.apiReleasePartialUpdate(releaseId, patched);
  return response.data;
}

async function deleteRelease(releaseId: number): Promise<void> {
  await releaseApi.apiReleaseDestroy(releaseId);
}

/** All releases for a project. */
async function getReleases(projectId: number): Promise<Release[]> {
  const limit = 10_000;
  const response = await releaseApi.apiReleaseList(limit, 0, projectId);
  const data = response.data as PaginatedReleaseList;
  return Array.isArray(data?.results) ? data.results : [];
}

async function getRelease(releaseId: number): Promise<Release> {
  const response = await releaseApi.apiReleaseRetrieve(releaseId);
  return response.data;
}

/**
 * Persist a new drag-reordered sequence of releases for a project. Same
 * drf-spectacular quirk as the pre-existing ProjectColumn/label reorder actions:
 * this action's operation lands on the generic `ApiApi` class (aliased here as
 * `statusApi`), not `ReleaseApi`, and its request body is typed as `Release`
 * instead of the real accepted shape `{project, releases: [{id, order}]}` —
 * hence the client choice and the cast.
 */
async function reorderReleases(
  projectId: number,
  releases: { id: number; order: number }[],
): Promise<Release[]> {
  const response = await statusApi.apiReleaseReorderCreate({
    project: projectId,
    releases,
  } as any);
  return response.data as unknown as Release[];
}

export type CreateGoalData = {
  project: number;
  name: string;
  description?: string;
  icon?: string;
  status?: GoalStatusEnum;
  target_date?: string | null;
  track?: number | null;
  release?: number | null;
};

async function createNewGoal(payload: CreateGoalData): Promise<Goal> {
  const response = await goalApi.apiGoalCreate(payload as unknown as Goal);
  return response.data;
}

async function updateGoal(
  goalId: number,
  payload: {
    name?: string;
    description?: string;
    icon?: string;
    status?: GoalStatusEnum;
    target_date?: string | null;
    track?: number | null;
    release?: number | null;
    order?: number;
  },
): Promise<Goal> {
  const patched: PatchedGoal = { ...payload };
  const response = await goalApi.apiGoalPartialUpdate(goalId, patched);
  return response.data;
}

async function deleteGoal(goalId: number): Promise<void> {
  await goalApi.apiGoalDestroy(goalId);
}

/** All goals for a project. */
async function getGoals(projectId: number): Promise<Goal[]> {
  const limit = 10_000;
  const response = await goalApi.apiGoalList(limit, 0, projectId);
  const data = response.data as PaginatedGoalList;
  return Array.isArray(data?.results) ? data.results : [];
}

async function getGoal(goalId: number): Promise<Goal> {
  const response = await goalApi.apiGoalRetrieve(goalId);
  return response.data;
}

/**
 * Persist a new drag-reordered sequence of goals for a project. Same generated-type
 * quirk as `reorderReleases` above (lands on `statusApi`/`ApiApi`, not `GoalApi`) —
 * real accepted shape is `{project, goals: [{id, order}]}`.
 */
async function reorderGoals(
  projectId: number,
  goals: { id: number; order: number }[],
): Promise<Goal[]> {
  const response = await statusApi.apiGoalReorderCreate({
    project: projectId,
    goals,
  } as any);
  return response.data as unknown as Goal[];
}

export type CreateKeyResultData = {
  goal: number;
  name: string;
  target_value: number;
  current_value?: number;
  unit?: string;
};

async function createNewKeyResult(payload: CreateKeyResultData): Promise<KeyResult> {
  const response = await keyResultApi.apiKeyResultCreate(payload as unknown as KeyResult);
  return response.data;
}

async function updateKeyResult(
  keyResultId: number,
  payload: {
    name?: string;
    target_value?: number;
    current_value?: number;
    unit?: string;
    order?: number;
  },
): Promise<KeyResult> {
  const patched: PatchedKeyResult = { ...payload };
  const response = await keyResultApi.apiKeyResultPartialUpdate(keyResultId, patched);
  return response.data;
}

async function deleteKeyResult(keyResultId: number): Promise<void> {
  await keyResultApi.apiKeyResultDestroy(keyResultId);
}

export type ProjectSharingInfo = {
  can_manage_sharing: boolean;
  cannot_share_reason: string | null;
  cannot_share_reason_code: string | null;
  project_owned_by_organization_admin: boolean;
};

export type InviteProjectCollaboratorsResponse = ApiJournalDayUploadEditorImageCreate400Response & {
  validation_notes?: Array<{ message?: string; code?: string }>;
};

async function getProjectSharingInfo(
  projectId: number,
  organizationId: number,
): Promise<ProjectSharingInfo> {
  const { data } = await api.apiProjectSharingInfoRetrieve(projectId, organizationId);
  return data as unknown as ProjectSharingInfo;
}

async function getProjectCollaborators(
  projectId: number,
): Promise<{ users: UserAccess[]; groups: GroupAccess[] }> {
  const { data } = await api.apiProjectCollaboratorsRetrieve(projectId);
  return {
    users: (data.users ?? []) as UserAccess[],
    groups: (data.groups ?? []) as GroupAccess[],
  };
}

async function inviteProjectCollaborators(
  projectId: number,
  payload: {
    organization_id: number;
    users?: number[];
    groups?: number[];
    access_level: ApiProjectInviteCreateRequest['access_level'];
  },
): Promise<InviteProjectCollaboratorsResponse> {
  const body: ApiProjectInviteCreateRequest = {
    organization_id: payload.organization_id,
    ...(payload.users?.length ? { users: payload.users } : {}),
    ...(payload.groups?.length ? { groups: payload.groups } : {}),
    access_level: payload.access_level,
  };
  const { data } = await api.apiProjectInviteCreate(projectId, body);
  return data as InviteProjectCollaboratorsResponse;
}

async function revokeProjectUserAccess(
  projectId: number,
  organizationId: number,
  accessRecordId: number,
): Promise<void> {
  /** Generated client expects (accessId, project id); backend also requires ``organization_id`` query. */
  await api.apiProjectShareUserAccessDestroy(String(accessRecordId), projectId, {
    params: { organization_id: organizationId },
  });
}

async function revokeProjectGroupAccess(
  projectId: number,
  organizationId: number,
  accessRecordId: number,
): Promise<void> {
  await api.apiProjectShareGroupAccessDestroy(String(accessRecordId), projectId, {
    params: { organization_id: organizationId },
  });
}

async function updateProjectUserSharePermission(
  projectId: number,
  organizationId: number,
  accessRecordId: number,
  access_level: 'view' | 'edit',
): Promise<UserAccess> {
  const body: PatchedProjectSharePermissionUpdate = { access_level };
  const { data } = await api.apiProjectShareUserAccessPermissionPartialUpdate(
    String(accessRecordId),
    projectId,
    organizationId,
    body,
  );
  return data;
}

async function updateProjectGroupSharePermission(
  projectId: number,
  organizationId: number,
  accessRecordId: number,
  access_level: 'view' | 'edit',
): Promise<GroupAccess> {
  const body: PatchedProjectSharePermissionUpdate = { access_level };
  const { data } = await api.apiProjectShareGroupAccessPermissionPartialUpdate(
    String(accessRecordId),
    projectId,
    organizationId,
    body,
  );
  return data;
}

async function getProjectHistory(
  projectId: number,
  cursor?: string,
  limit?: number,
): Promise<ProjectHistoryTimeline> {
  return (await api.apiProjectHistoryRetrieve(projectId, cursor, limit)).data;
}

async function restoreProjectToTimestamp(
  projectId: number,
  targetAt: string,
): Promise<ProjectRestoreResult> {
  return (await api.apiProjectRestoreCreate(projectId, { target_at: targetAt })).data;
}

/** Preview or apply Action Revert for a single task/track history row (never a full project restore). */
async function previewProjectHistoryRevert(
  projectId: number,
  entityType: EntityTypeEnum,
  historyId: number,
): Promise<RevertResponse> {
  return (
    await api.apiProjectHistoryRevertCreate(projectId, {
      history_id: historyId,
      entity_type: entityType,
      preview: true,
    })
  ).data;
}

async function revertProjectHistory(
  projectId: number,
  entityType: EntityTypeEnum,
  historyId: number,
): Promise<RevertResponse> {
  return (
    await api.apiProjectHistoryRevertCreate(projectId, {
      history_id: historyId,
      entity_type: entityType,
    })
  ).data;
}

export {
  createNewProject,
  getAllProjects,
  moveProject,
  reorderSharedProjects,
  getAllProjectCategories,
  createNewProjectCategory,
  updateProjectCategory,
  deleteProjectCategory,
  getProjectBoardView,
  getProjectListView,
  getProjectSprintView,
  getProjectById,
  getAllProjectLabels,
  createNewProjectLabel,
  updateProjectLabel,
  deleteProjectLabel,
  reorderProjectLabels,
  createNewProjectColumn,
  getProjectColumns,
  reorderProjectColumns,
  deleteProjectColumn,
  updateProjectColumn,
  updateProject,
  uploadProjectIcon,
  removeProjectIcon,
  deleteProject,
  getProjectAssignees,
  createNewProjectTrack,
  updateProjectTrack,
  activateProjectTrack,
  deleteProjectTrack,
  getProjectTracks,
  completeProjectTrack,
  createNewRelease,
  updateRelease,
  deleteRelease,
  getReleases,
  getRelease,
  reorderReleases,
  createNewGoal,
  updateGoal,
  deleteGoal,
  getGoals,
  getGoal,
  reorderGoals,
  createNewKeyResult,
  updateKeyResult,
  deleteKeyResult,
  getProjectSharingInfo,
  getProjectCollaborators,
  inviteProjectCollaborators,
  revokeProjectUserAccess,
  revokeProjectGroupAccess,
  updateProjectUserSharePermission,
  updateProjectGroupSharePermission,
  getProjectHistory,
  restoreProjectToTimestamp,
  previewProjectHistoryRevert,
  revertProjectHistory,
};
