import { CreateEvent, type Event } from "@shared/api-client/api";

/** Re-create payload for undo after deleting an event from the quick dialog. */
export function buildCreateEventPayloadFromEvent(event: Event): CreateEvent {
  const taskId = event.task_id ?? event.task?.id ?? null;
  const projectFromEvent =
    typeof event.project === 'object' && event.project !== null
      ? (event.project as { id?: number }).id
      : null;
  const projectId = event.project_id ?? projectFromEvent ?? null;
  const lifeAreaId = event.life_area_id ?? event.life_area?.id ?? null;

  const payload: CreateEvent = {
    name: event.name,
    description: event.description ?? null,
    start_datetime: event.start_datetime,
    end_datetime: event.end_datetime,
    is_all_day: event.is_all_day,
    all_day_start_date: event.all_day_start_date,
    all_day_end_date: event.all_day_end_date,
    type: event.type,
    recurrence_rule: event.recurrence_rule ?? null,
    occurrences: event.occurrences ?? '[]',
    account: event.google_calendar_account_id ?? null,
  };

  if (taskId) {
    payload.task = taskId;
  } else if (lifeAreaId) {
    payload.life_area = lifeAreaId;
    payload.task = null;
    payload.project_id = null;
  } else if (projectId) {
    payload.project_id = projectId;
    payload.task = null;
    payload.life_area = null;
  }

  return payload;
}
