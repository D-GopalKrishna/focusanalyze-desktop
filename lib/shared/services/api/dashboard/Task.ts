import {
  ApiApi as TaskEndpointsApi,
  ApiTaskSearchRetrieveDuePresetEnum,
  ApiTaskSearchRetrieveSortEnum,
  TaskApi,
  Task,
  TaskCreate,
  PaginatedTaskList,
  PaginatedTaskDocumentSearch,
  TaskNlSearchRequest,
  ApiApi as TaskPriorityApi,
  TaskPriority,
  PaginatedTaskPriorityList,
  ApiApi as ProjectsApi,
  TaskType,
  UserUploadedImageResponse,
  BulkTaskUpdateResult,
  BulkTaskDeleteResult,
  TaskComment,
  TaskCommentCreate,
  PatchedTaskCommentUpdate,
  MinimalUser,
  TaskBatchReorder,
  TaskCommentReactionToggle,
} from "@shared/api-client";

type TaskSearchDuePreset =
  (typeof ApiTaskSearchRetrieveDuePresetEnum)[keyof typeof ApiTaskSearchRetrieveDuePresetEnum];
import { createApiClient } from '../auth';
import { stopTimerWidget, stopTimerWidgetForTask } from "@shared/utils/start-timer-widget";
import { plannerFiltersToSearchParams } from "@shared/utils/planner-task-search-params";
import { notifyCompanionTaskComplete } from "@shared/utils/theme/companionEvents";

const api = createApiClient(TaskEndpointsApi);
const priorityApi = createApiClient(TaskPriorityApi);
const projectsApi = createApiClient(ProjectsApi);
/** Generated `TaskApi`: ES task search, draft editor-image upload, etc. (paths not on aggregated `ApiApi`). */
const taskApi = createApiClient(TaskApi);

/** Handles array body (current API) vs single object (defensive). */
function unwrapTaskCommentsListBody(data: unknown): TaskComment[] {
  if (Array.isArray(data)) return data as TaskComment[];
  if (data && typeof data === 'object' && 'results' in data) {
    const results = (data as { results?: TaskComment[] }).results;
    return results ?? [];
  }
  return [];
}

function unwrapCreatedTaskCommentBody(data: unknown): TaskComment {
  if (Array.isArray(data)) {
    const first = data[0];
    if (first) return first as TaskComment;
    throw new Error('Unexpected empty task comment response');
  }
  if (data && typeof data === 'object' && 'id' in data && 'content' in data && 'user' in data) {
    return data as TaskComment;
  }
  throw new Error('Unexpected task comment response');
}

function taskCommentsRequestError(e: unknown): Error {
  const ax = e as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = ax.response?.data?.detail;
  const msg =
    typeof detail === 'string'
      ? detail
      : detail !== undefined && detail !== null
        ? JSON.stringify(detail)
        : ax.message || 'Task comments request failed';
  return new Error(msg);
}

/**
 * Creates a new task
 */
async function createNewTask(task: TaskCreate): Promise<Task> {
  // Ensure we're sending any parent field correctly
  if (task.parent === undefined || task.parent === null) {
    // If parent isn't provided or is null, make sure it's included as null
    task.parent = null;
  }
  const newTask = (await api.apiTaskCreate(task)).data;
  return newTask;
}

/**
 * Fetches all tasks with pagination
 */
async function getAllTasks(
  limit?: number,
  offset?: number,
  page?: number,
  pageSize?: number,
): Promise<PaginatedTaskList> {
  limit = limit || 10000;
  offset = offset || 0;
  page = page || 1;
  pageSize = pageSize || 10000;

  const tasks = (await api.apiTaskList(limit, offset)).data;
  return tasks;
}

/** Shape matches planner sidebar ``PlannerFilterFields`` (avoid importing UI types here). */
export type TaskSearchPlannerFilters = {
  datePreset: string;
  customDueFrom: string;
  customDueTo: string;
  projectIds: readonly number[];
  labelIds: readonly number[];
  assigneeIds: readonly number[];
  includeDone: boolean;
};

/** Browse options for planner sidebar (`sort`, calendar context date). */
export type TaskSearchBrowseOptions = {
  sort?: (typeof ApiTaskSearchRetrieveSortEnum)[keyof typeof ApiTaskSearchRetrieveSortEnum];
  contextDate?: string;
};

/**
 * Search/list tasks via Elasticsearch (`GET /api/task/search/`).
 * Omit or pass empty `q` for relevance-ranked browse (default). Each result is a {@link TaskSearch}.
 * Pass ``plannerFilters`` so due/project/label/assignee filters are applied server-side (indexed fields).
 */
function parseDuePresetForApi(raw: string | undefined): TaskSearchDuePreset | undefined {
  if (!raw?.trim()) return undefined;
  const allowed = new Set<string>(Object.values(ApiTaskSearchRetrieveDuePresetEnum));
  return allowed.has(raw) ? (raw as TaskSearchDuePreset) : undefined;
}

async function searchTasksFromIndex(
  q: string | undefined,
  limit: number,
  offset: number,
  plannerFilters?: TaskSearchPlannerFilters | null,
  browseOptions?: TaskSearchBrowseOptions | null,
): Promise<PaginatedTaskDocumentSearch> {
  const trimmed = (q ?? '').trim();
  const p = plannerFilters != null ? plannerFiltersToSearchParams(plannerFilters) : {};
  const duePreset = parseDuePresetForApi(p.due_preset);
  return (
    await taskApi.apiTaskSearchRetrieve(
      p.assignee,
      browseOptions?.contextDate,
      p.due_from,
      duePreset,
      p.due_to,
      plannerFilters?.includeDone === true ? true : undefined,
      p.label,
      limit,
      offset,
      p.project,
      trimmed.length > 0 ? trimmed : undefined,
      browseOptions?.sort ?? ApiTaskSearchRetrieveSortEnum.Relevance,
    )
  ).data;
}

/**
 * Natural-language task search (`POST /api/task/search/nl/`).
 * Uses FocusAI to interpret the query, then Elasticsearch + filters. Consumes AI quota.
 */
async function searchTasksNaturalLanguage(
  q: string,
  limit: number,
  offset: number,
  timezone?: string,
): Promise<PaginatedTaskDocumentSearch> {
  const body: TaskNlSearchRequest = {
    q: q.trim(),
    limit,
    offset,
    ...(timezone?.trim() ? { timezone: timezone.trim() } : {}),
  };
  try {
    return (await taskApi.apiTaskSearchNlCreate(body)).data;
  } catch (e: unknown) {
    const ax = e as {
      response?: { data?: { detail?: unknown } };
      message?: string;
    };
    const detail = ax.response?.data?.detail;
    const msg =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? JSON.stringify(detail)
          : ax.message || 'Natural language search failed';
    throw new Error(msg);
  }
}

/**
 * Fetches a task by its ID
 */
async function getTaskById(taskId: number): Promise<Task> {
  const task = (await api.apiTaskRetrieve(String(taskId))).data;
  return task;
}

/**
 * Updates a task partially
 */
async function updateTask(taskId: number, data: any): Promise<Task> {
  const response = await api.apiTaskPartialUpdate(String(taskId), data);
  maybeCheerForDoneTask(data, response.data);
  return response.data;
}

export type TaskBatchReorderView = 'board' | 'list' | 'all_tracks';

export type TaskBatchReorderPayload =
  | {
      view: 'board';
      project_track_id: number;
      board_columns: Array<{ status_id: number | null; task_ids: number[] }>;
      status_updates?: Array<{ task_id: number; status_id: number | null }>;
    }
  | {
      view: 'list';
      project_track_id: number;
      list_task_ids: number[];
    }
  | {
      view: 'all_tracks';
      track_orders: Array<{ project_track_id: number; task_ids: number[] }>;
      track_moves?: Array<{ task_id: number; project_track_id: number }>;
    };

/** Batch reorder for board, list, or all-tracks views (POST /api/task/reorder/). */
async function batchReorderTasks(payload: TaskBatchReorderPayload): Promise<void> {
  try {
    await api.apiTaskReorderCreate(payload as unknown as TaskBatchReorder);
  } catch (e) {
    throw taskCommentsRequestError(e);
  }
}

/**
 * @deprecated Use batchReorderTasks with view=board instead.
 */
async function reorderRootTasksInColumn(body: {
  project_track_id: number;
  status_id?: number | null;
  task_ids: number[];
}): Promise<void> {
  await batchReorderTasks({
    view: 'board',
    project_track_id: body.project_track_id,
    board_columns: [{ status_id: body.status_id ?? null, task_ids: body.task_ids }],
  });
}

/**
 * Deletes a task by its ID and stops any focus timer linked to it.
 */
async function deleteTask(
  taskId: number,
  options?: {
    /** Task events from the UI, used to match timers started before task id was tracked. */
    events?: unknown;
  },
): Promise<void> {
  stopTimerWidgetForTask({ id: taskId, events: options?.events });
  await api.apiTaskDestroy(String(taskId));
}

/**
 * Bulk update tasks (PATCH semantics).
 * Note: generated types may be stricter than runtime (OpenAPI required fields); we keep payload loose here.
 */
async function bulkUpdateTasks(records: Array<Record<string, any>>): Promise<BulkTaskUpdateResult> {
  // apiTaskBulkUpdatePartialUpdate expects PatchedBulkTaskUpdate, but we keep runtime payload minimal.
  const res = await api.apiTaskBulkUpdatePartialUpdate({ records } as any);
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const task of res.data?.results ?? []) {
    maybeCheerForDoneTask(byId.get(task.id), task);
  }
  return res.data;
}

function maybeCheerForDoneTask(payload: Record<string, unknown> | undefined, task: Task): void {
  // status_id: BOARD-workflow tasks moving into a column. is_completed: CHECKLIST-workflow
  // tasks toggled done (no status column to move into) — see Project.workflow.
  if (payload?.status_id == null && payload?.is_completed == null) return;
  const done = task.workflow_done || task.status?.role === 'FINISH';
  if (!done) return;
  notifyCompanionTaskComplete(task.name);
}

/**
 * Bulk delete tasks.
 * Generated method doesn't accept a body param; pass it via axios options.data.
 */
async function bulkDeleteTasks(taskIds: number[]): Promise<BulkTaskDeleteResult> {
  for (const taskId of taskIds) {
    stopTimerWidget({ taskId });
  }
  const res = await api.apiTaskBulkDeleteDestroy({ data: { task_ids: taskIds } } as any);
  return res.data;
}

/**
 * Fetches all available task priorities
 * Can be filtered by project if projectId is provided
 */
async function getAllTaskPriorities(
  projectId?: number,
  limit?: number,
  offset?: number,
): Promise<TaskPriority[]> {
  limit = limit || 10000;
  offset = offset || 0;

  const params = projectId ? { project: projectId } : undefined;
  const response = await priorityApi.apiTaskPriorityList(
    limit,
    offset,
    params ? { params } : undefined,
  );
  return response.data.results;
}

/**
 * Creates a new task priority
 */
async function createTaskPriority(priority: TaskPriority): Promise<TaskPriority> {
  const newPriority = (await priorityApi.apiTaskPriorityCreate(priority)).data;
  return newPriority;
}

/**
 * Updates an existing task priority
 */
async function updateTaskPriority(id: number, priority: TaskPriority): Promise<TaskPriority> {
  const updatedPriority = (await priorityApi.apiTaskPriorityUpdate(id, priority)).data;
  return updatedPriority;
}

/**
 * Deletes a task priority
 */
async function deleteTaskPriority(id: number): Promise<void> {
  await priorityApi.apiTaskPriorityDestroy(id);
}

/**
 * Reorders task priorities
 */
async function reorderTaskPriorities(priority: TaskPriority): Promise<TaskPriority> {
  const reorderedPriority = (await priorityApi.apiTaskPriorityReorderCreate(priority)).data;
  return reorderedPriority;
}

/**
 * Marks a task priority as the default for its scope (project, or user-global).
 * New tasks/subtasks created without an explicit priority will use it.
 */
async function setDefaultTaskPriority(id: number): Promise<TaskPriority> {
  const updatedPriority = (await priorityApi.apiTaskPrioritySetDefaultCreate(id)).data;
  return updatedPriority;
}

/**
 * Fetches all task types for a specific project
 */
async function getTaskTypesForProject(projectId: string): Promise<TaskType[]> {
  const response = await projectsApi.apiProjectsTaskTypesList(
    projectId,
    10000, // limit
    0, // offset
  );
  return response.data.results;
}

/** Response type for task description image upload (re-export from api client). */
export type UploadTaskDescriptionImageResponse = UserUploadedImageResponse;

/** Upload an image for the task description editor. */
async function uploadTaskDescriptionImage(
  taskId: number,
  image: File,
): Promise<UploadTaskDescriptionImageResponse> {
  const res = await taskApi.apiTaskUploadEditorImageCreate(String(taskId), image);
  return res.data;
}

/**
 * Upload description editor image before the task exists. Pass returning `id`(s)
 * as `pending_description_image_ids` on task create so links are attributed to the task.
 */
async function uploadTaskDescriptionImageDraft(
  projectId: number,
  image: File,
): Promise<UploadTaskDescriptionImageResponse> {
  const res = await taskApi.apiTaskUploadEditorImageDraftCreate(image, projectId);
  return res.data;
}

/** Durable task file attachment (docs + images). Present after OpenAPI regen; typed locally until then. */
export type TaskFileAttachment = {
  id: number;
  file_name: string;
  file_type?: string;
  file_size?: number;
  uploaded_at?: string;
  kind?: 'image' | 'document' | 'whiteboard_scene' | string;
  download_url?: string;
  source_message_attachment_id?: number | null;
  title?: string | null;
  /** Compressed ~200x200 data-URL, generated client-side when the whiteboard viewer closes. */
  thumbnail?: string | null;
};

export type TaskWithFileAttachments = Task & {
  file_attachments?: TaskFileAttachment[];
};

async function uploadTaskFileAttachment(
  taskId: number,
  file: File,
): Promise<TaskFileAttachment> {
  const { createApiConfiguration } = await import('../auth');
  const { getFreshAccessToken } = await import('@/lib/middleware/keycloak');
  const base = createApiConfiguration().basePath?.replace(/\/$/, '') ?? '';
  const auth = (await getFreshAccessToken()) ?? '';
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`${base}/api/task/${taskId}/file-attachments/`, {
    method: 'POST',
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Upload failed (${res.status})`);
  }
  return res.json();
}

/** Draft upload before task exists; pass returning ids as ``pending_file_attachment_ids`` on create. */
async function uploadTaskFileAttachmentDraft(
  projectId: number,
  file: File,
): Promise<TaskFileAttachment> {
  const { createApiConfiguration } = await import('../auth');
  const { getFreshAccessToken } = await import('@/lib/middleware/keycloak');
  const base = createApiConfiguration().basePath?.replace(/\/$/, '') ?? '';
  const auth = (await getFreshAccessToken()) ?? '';
  const body = new FormData();
  body.append('file', file);
  body.append('project', String(projectId));
  const res = await fetch(`${base}/api/task/upload-file-attachment-draft/`, {
    method: 'POST',
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Draft upload failed (${res.status})`);
  }
  return res.json();
}

/** Create a new whiteboard (omit `attachmentId`) or autosave an existing one's scene JSON. */
async function upsertWhiteboardScene(
  taskId: number,
  params: {
    attachmentId?: number | null;
    sceneJson: string;
    title?: string;
    /** A compressed ~200x200 data-URL thumbnail; sent once on exit, not every autosave. */
    thumbnail?: string;
  },
): Promise<TaskFileAttachment> {
  const res = await taskApi.apiTaskWhiteboardScenesCreate(String(taskId), {
    attachment_id: params.attachmentId ?? undefined,
    scene_json: params.sceneJson,
    title: params.title,
    thumbnail: params.thumbnail,
  });
  return res.data as unknown as TaskFileAttachment;
}

/** Rename an existing whiteboard without re-uploading its (possibly large) saved scene. */
async function renameWhiteboardScene(
  taskId: number,
  attachmentId: number,
  title: string,
): Promise<TaskFileAttachment> {
  const res = await taskApi.apiTaskWhiteboardScenesCreate(String(taskId), {
    attachment_id: attachmentId,
    title,
  });
  return res.data as unknown as TaskFileAttachment;
}

/** Delete any TaskFileAttachment (whiteboard, upload, or MCP doc alike). */
async function deleteTaskFileAttachment(attachmentId: number): Promise<void> {
  await taskApi.apiTaskFileAttachmentsDestroy(String(attachmentId));
}

async function fetchTaskFileAttachmentBlob(attachmentId: number): Promise<Blob> {
  const { createApiConfiguration } = await import('../auth');
  const { getFreshAccessToken } = await import('@/lib/middleware/keycloak');
  const base = createApiConfiguration().basePath?.replace(/\/$/, '') ?? '';
  const auth = (await getFreshAccessToken()) ?? '';
  const res = await fetch(`${base}/api/task/file-attachments/${attachmentId}/`, {
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(
      res.status === 404 ? 'Attachment not found.' : `Download failed (${res.status})`,
    );
  }
  return res.blob();
}

export type TaskCommentReactionGroup = {
  emoji: string;
  count: number;
  user_ids: number[];
  reacted_by_me: boolean;
};

/** Generated client may lag; uuid/parent_uuid/reactions come from API after comment threading migration. */
export type TaskCommentRecord = TaskComment & {
  uuid?: string;
  parent_uuid?: string | null;
  in_reply_to_uuid?: string | null;
  deleted_at?: string | null;
  reactions?: TaskCommentReactionGroup[];
};
export type TaskCommentUser = MinimalUser;

async function getTaskComments(taskId: number): Promise<TaskCommentRecord[]> {
  try {
    const res = await api.apiTaskCommentsList(String(taskId));
    return unwrapTaskCommentsListBody(res.data) as TaskCommentRecord[];
  } catch (e) {
    throw taskCommentsRequestError(e);
  }
}

async function createTaskComment(
  taskId: number,
  payload: {
    content: string;
    mentioned_user_ids: number[];
    parent_uuid?: string | null;
    in_reply_to_uuid?: string | null;
  },
): Promise<TaskCommentRecord> {
  const body = {
    content: payload.content.trim(),
    mentioned_user_ids: payload.mentioned_user_ids,
    ...(payload.parent_uuid ? { parent_uuid: payload.parent_uuid } : {}),
    ...(payload.in_reply_to_uuid ? { in_reply_to_uuid: payload.in_reply_to_uuid } : {}),
  } as TaskCommentCreate & { parent_uuid?: string; in_reply_to_uuid?: string };
  try {
    const res = await api.apiTaskCommentsCreate(String(taskId), body);
    return unwrapCreatedTaskCommentBody(res.data) as TaskCommentRecord;
  } catch (e) {
    throw taskCommentsRequestError(e);
  }
}

async function updateTaskComment(
  taskId: number,
  commentUuid: string,
  payload: { content: string; mentioned_user_ids: number[] },
): Promise<TaskCommentRecord> {
  const patch: PatchedTaskCommentUpdate = {
    content: payload.content.trim(),
    mentioned_user_ids: payload.mentioned_user_ids,
  };
  try {
    const res = await api.apiTaskCommentsPartialUpdate(commentUuid, String(taskId), patch);
    return res.data as TaskCommentRecord;
  } catch (e) {
    throw taskCommentsRequestError(e);
  }
}

async function deleteTaskComment(taskId: number, commentUuid: string): Promise<void> {
  try {
    await api.apiTaskCommentsDestroy(commentUuid, String(taskId));
  } catch (e) {
    throw taskCommentsRequestError(e);
  }
}

async function toggleTaskCommentReaction(
  taskId: number,
  commentUuid: string,
  emoji: string,
): Promise<TaskCommentRecord> {
  try {
    const res = await api.apiTaskCommentsReactionsCreate(commentUuid, String(taskId), {
      emoji,
    } satisfies TaskCommentReactionToggle);
    return res.data as TaskCommentRecord;
  } catch (e) {
    throw taskCommentsRequestError(e);
  }
}

export {
  // Task comments
  createTaskComment,
  deleteTaskComment,
  getTaskComments,
  toggleTaskCommentReaction,
  updateTaskComment,
  // Task CRUD operations
  createNewTask,
  getAllTasks,
  searchTasksFromIndex,
  searchTasksNaturalLanguage,
  getTaskById,
  updateTask,
  bulkUpdateTasks,
  batchReorderTasks,
  reorderRootTasksInColumn,
  deleteTask,
  bulkDeleteTasks,

  // Task Priority operations
  getAllTaskPriorities,
  createTaskPriority,
  updateTaskPriority,
  deleteTaskPriority,
  reorderTaskPriorities,
  setDefaultTaskPriority,

  // Task Type operations
  getTaskTypesForProject,

  // Task description editor image upload
  uploadTaskDescriptionImage,
  uploadTaskDescriptionImageDraft,
  uploadTaskFileAttachment,
  uploadTaskFileAttachmentDraft,
  fetchTaskFileAttachmentBlob,
  upsertWhiteboardScene,
  renameWhiteboardScene,
  deleteTaskFileAttachment,
};
