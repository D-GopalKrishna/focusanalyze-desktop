import { ApiApi as ProjectsApi, TaskType, PaginatedTaskTypeList } from "@shared/api-client";
import { createApiClient } from '../auth';

const api = createApiClient(ProjectsApi);

export async function getAllTaskTypes(
  projectId: number,
  limit?: number,
  offset?: number,
): Promise<PaginatedTaskTypeList> {
  limit = limit || 10000;
  offset = offset || 0;

  const response = await api.apiProjectsTaskTypesList(projectId.toString(), limit, offset);
  return response.data;
}

export async function createTaskType(
  projectId: number,
  name: string,
  color?: string,
  icon?: string | null,
): Promise<TaskType> {
  const taskTypeData = {
    name,
    project: projectId,
    color: color || '#dadada',
    ...(icon != null && { icon }),
  } as TaskType;

  const response = await api.apiProjectsTaskTypesCreate(projectId.toString(), taskTypeData);
  return response.data;
}

export async function updateTaskType(
  projectId: number,
  id: number,
  name: string,
  color?: string,
  icon?: string | null,
): Promise<TaskType> {
  const taskTypeData = {
    id,
    name,
    project: projectId,
    color: color || '#dadada',
    ...(icon !== undefined && { icon }),
  } as TaskType;

  const response = await api.apiProjectsTaskTypesUpdate(id, projectId.toString(), taskTypeData);
  return response.data;
}

export async function deleteTaskType(projectId: number, id: number): Promise<void> {
  await api.apiProjectsTaskTypesDestroy(id, projectId.toString());
}

export async function reorderTaskTypes(
  projectId: number,
  taskTypes: { id: number; order: number }[],
): Promise<any> {
  // Use the ProjectsApi client with the correct endpoint
  const response = await api.apiProjectsTaskTypesReorderCreate(
    projectId.toString(),
    {
      task_types: taskTypes,
    } as any, // Type as any since the generated API types might not match exactly
  );
  return response.data;
}
