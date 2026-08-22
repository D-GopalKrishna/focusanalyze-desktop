import { LinkTypeEnum, TaskDependencyApi, TaskDependencyRead } from "@shared/api-client";
import { createApiClient } from '../auth';

const api = createApiClient(TaskDependencyApi);

export async function listProjectDependencies(projectId: number): Promise<TaskDependencyRead[]> {
  return (await api.apiTaskDependencyList(projectId)).data;
}

/**
 * Create a `fromTask --linkType--> toTask` edge. Defaults to "blocks".
 * Throws (400) on cycle (blocks) / cross-project / reverse-duplicate (relates_to).
 */
export async function createDependency(
  fromTaskId: number,
  toTaskId: number,
  linkType: LinkTypeEnum = LinkTypeEnum.Blocks,
): Promise<TaskDependencyRead> {
  const { data } = await api.apiTaskDependencyCreate({
    from_task: fromTaskId,
    to_task: toTaskId,
    link_type: linkType,
  });
  return data;
}

export async function deleteDependency(dependencyId: number): Promise<void> {
  await api.apiTaskDependencyDestroy(dependencyId);
}
