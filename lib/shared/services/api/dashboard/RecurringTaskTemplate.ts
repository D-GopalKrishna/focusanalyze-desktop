import { RecurringTaskTemplatesApi, RecurringTaskTemplateRead, CadenceTypeEnum } from "@shared/api-client";
import { unwrapPaginatedList } from "@shared/utils/general";
import { createApiClient } from '../auth';

const api = createApiClient(RecurringTaskTemplatesApi);

export type CadenceType = CadenceTypeEnum;
export const CadenceType = CadenceTypeEnum;

export interface RecurringTaskTemplateWritePayload {
  /** Optional — derived server-side from project_track.project when omitted. */
  project?: number;
  project_track: number;
  task_type?: number | null;
  priority?: number | null;
  assignee?: number | null;
  name: string;
  description?: string;
  /** Hours estimate applied to every generated instance (one-time-effort figure, not
   * cumulative across occurrences). */
  estimate?: number;
  cadence_type: CadenceType;
  weekdays?: number[];
  times_per_week?: number | null;
  interval_days?: number | null;
  is_paused?: boolean;
  show_on_calendar?: boolean;
  /** 'HH:MM' (24h, user's own profile timezone). Required by the backend when
   * show_on_calendar is true — a calendar event needs a real time slot. */
  time_of_day?: string;
  /** Write-only: the status column for the first instance specifically (e.g. the column the
   * user had selected in the create-task UI). Not persisted on the template — regenerated
   * instances always start fresh at the project's default column. */
  initial_status?: number | null;
}

export async function fetchRecurringTaskTemplates(): Promise<RecurringTaskTemplateRead[]> {
  const resp = (await api.apiRecurringTaskTemplateList()).data;
  return unwrapPaginatedList(resp as RecurringTaskTemplateRead[] | { results?: RecurringTaskTemplateRead[] });
}

export async function fetchRecurringTaskTemplate(id: number): Promise<RecurringTaskTemplateRead> {
  const { data } = await api.apiRecurringTaskTemplateRetrieve(id);
  return data;
}

export async function createRecurringTaskTemplate(
  body: RecurringTaskTemplateWritePayload,
): Promise<RecurringTaskTemplateRead> {
  const { data } = await api.apiRecurringTaskTemplateCreate(body as RecurringTaskTemplateRead);
  return data;
}

export async function updateRecurringTaskTemplate(
  id: number,
  body: Partial<RecurringTaskTemplateWritePayload>,
): Promise<RecurringTaskTemplateRead> {
  const { data } = await api.apiRecurringTaskTemplatePartialUpdate(id, body as RecurringTaskTemplateRead);
  return data;
}

export async function pauseRecurringTaskTemplate(id: number, isPaused: boolean): Promise<RecurringTaskTemplateRead> {
  return updateRecurringTaskTemplate(id, { is_paused: isPaused });
}

export async function deleteRecurringTaskTemplate(id: number): Promise<void> {
  await api.apiRecurringTaskTemplateDestroy(id);
}
