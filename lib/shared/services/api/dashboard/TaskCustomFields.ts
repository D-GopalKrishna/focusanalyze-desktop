import {
  ApiApi as TaskCustomFieldsApi,
  ProjectApi,
  TaskCustomFieldCreate,
  TaskCustomFieldReorder,
  PatchedTaskCustomFieldValueUpdate,
  PatchedProjectCustomFieldCreate,
} from "@shared/api-client";
import { createApiClient } from '../auth';

const api = createApiClient(TaskCustomFieldsApi);
const projectApi = createApiClient(ProjectApi);

export type CustomFieldType = 'text' | 'number' | 'url' | 'label' | 'date' | 'checkbox' | 'image';

export const CUSTOM_FIELD_TYPES: CustomFieldType[] = [
  'text',
  'number',
  'url',
  'label',
  'date',
  'checkbox',
  'image',
] as const;

/** Merged project definition + per-task value (from task API). */
export interface TaskCustomField {
  id: number;
  definition_id: number;
  name: string;
  field_type: CustomFieldType;
  value: unknown;
  position: number;
  created_at: string;
}

export interface CreateCustomFieldPayload {
  name: string;
  field_type: CustomFieldType;
  value?: unknown;
  position?: number;
}

export interface UpdateCustomFieldValuePayload {
  value?: unknown;
}

export interface UpdateCustomFieldDefinitionPayload {
  name?: string;
  field_type?: CustomFieldType;
  position?: number;
}

/** Extracts the backend `detail` message from a generated-client (axios) error. */
function customFieldRequestError(e: unknown): Error {
  const ax = e as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = ax.response?.data?.detail;
  const msg =
    typeof detail === 'string'
      ? detail
      : detail !== undefined && detail !== null
        ? JSON.stringify(detail)
        : ax.message || 'Custom field request failed';
  return new Error(msg);
}

export async function listCustomFields(taskId: number): Promise<TaskCustomField[]> {
  try {
    const res = await api.apiTaskCustomFieldsList(String(taskId));
    return res.data as unknown as TaskCustomField[];
  } catch (e) {
    throw customFieldRequestError(e);
  }
}

/** Creates a project-wide field and propagates to all tasks; optional value on this task. */
export async function createCustomField(
  taskId: number,
  payload: CreateCustomFieldPayload,
): Promise<TaskCustomField> {
  try {
    const res = await api.apiTaskCustomFieldsCreate(
      String(taskId),
      payload as TaskCustomFieldCreate,
    );
    return res.data as unknown as TaskCustomField;
  } catch (e) {
    throw customFieldRequestError(e);
  }
}

export async function updateCustomFieldValue(
  taskId: number,
  valueId: number,
  payload: UpdateCustomFieldValuePayload,
): Promise<TaskCustomField> {
  try {
    const res = await api.apiTaskCustomFieldsPartialUpdate(
      String(valueId),
      String(taskId),
      payload as PatchedTaskCustomFieldValueUpdate,
    );
    return res.data as unknown as TaskCustomField;
  } catch (e) {
    throw customFieldRequestError(e);
  }
}

export async function updateCustomFieldDefinition(
  projectId: number,
  definitionId: number,
  payload: UpdateCustomFieldDefinitionPayload,
): Promise<{
  id: number;
  name: string;
  field_type: CustomFieldType;
  position: number;
  created_at: string;
}> {
  try {
    const res = await projectApi.apiProjectCustomFieldsPartialUpdate(
      String(definitionId),
      projectId,
      payload as PatchedProjectCustomFieldCreate,
    );
    return res.data as unknown as {
      id: number;
      name: string;
      field_type: CustomFieldType;
      position: number;
      created_at: string;
    };
  } catch (e) {
    throw customFieldRequestError(e);
  }
}

export async function deleteCustomField(taskId: number, valueId: number): Promise<void> {
  try {
    await api.apiTaskCustomFieldsDestroy(String(valueId), String(taskId));
  } catch (e) {
    throw customFieldRequestError(e);
  }
}

export async function reorderCustomFields(
  taskId: number,
  orderedDefinitionIds: number[],
): Promise<TaskCustomField[]> {
  try {
    const res = await api.apiTaskCustomFieldsReorderCreate(String(taskId), {
      ordered_ids: orderedDefinitionIds,
    } satisfies TaskCustomFieldReorder);
    return res.data as unknown as TaskCustomField[];
  } catch (e) {
    throw customFieldRequestError(e);
  }
}
