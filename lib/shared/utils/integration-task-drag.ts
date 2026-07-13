import type { IntegrationTask } from "@shared/services/api/dashboard/IntegrationTasks";

export const INTEGRATION_TASK_DRAG_MIME = 'application/x-focusanalyze-integration-task';

export function setIntegrationTaskDragData(
  dataTransfer: DataTransfer,
  task: IntegrationTask,
): void {
  const payload = JSON.stringify(task);
  dataTransfer.setData(INTEGRATION_TASK_DRAG_MIME, payload);
  dataTransfer.effectAllowed = 'copy';
}

export function getIntegrationTaskDragPayload(dataTransfer: DataTransfer): IntegrationTask | null {
  const raw = dataTransfer.getData(INTEGRATION_TASK_DRAG_MIME);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<IntegrationTask> & {
      title?: unknown;
      source?: unknown;
    };
    if (!parsed || typeof parsed.title !== 'string' || typeof parsed.source !== 'string') {
      return null;
    }
    return {
      id: typeof parsed.id === 'string' ? parsed.id : '',
      title: parsed.title,
      source: parsed.source as IntegrationTask['source'],
      url: typeof parsed.url === 'string' ? parsed.url : null,
    };
  } catch {
    return null;
  }
}

export function hasIntegrationTaskDragType(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(INTEGRATION_TASK_DRAG_MIME);
}
