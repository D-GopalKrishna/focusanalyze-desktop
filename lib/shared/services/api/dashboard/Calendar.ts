import {
  EventApi,
  Event,
  EventDetail,
  EventInviteeSearchResult,
  CreateEvent,
  UpdateEvent,
  BulkDeleteEventResult,
  TaskSearch,
  PaginatedTaskDocumentSearch,
  CalendarHistoryTimeline,
  CalendarRestoreResult,
} from "@shared/api-client";
import { CalendarAccountFilter } from "@shared/types/dashboard/calendar";
import { createApiClient } from '../auth';
import { searchTasksFromIndex } from './Task';

const api = createApiClient(EventApi);

async function createNewEvent(event: CreateEvent): Promise<Event> {
  const newEvent = (await api.apiEventCreate(event)).data;
  return newEvent;
}

async function getEventById(eventId: number): Promise<EventDetail | null> {
  try {
    const event = (await api.apiEventRetrieve(eventId)).data;
    return event;
  } catch (error) {
    console.error('Error fetching event by ID:', error);
    return null;
  }
}

function accountFilterToQueryParam(accountFilter?: CalendarAccountFilter): string | undefined {
  if (accountFilter == null) return undefined;
  if (accountFilter === 'focusanalyze') return 'focusanalyze';
  return String(accountFilter);
}

async function getAllEvents(
  fromDatetime?: string,
  toDatetime?: string,
  limit?: number,
  offset?: number,
  page?: number,
  pageSize?: number,
  name?: string,
  projectId?: number,
  accountFilter?: CalendarAccountFilter,
): Promise<Event[]> {
  limit = limit || 10000;
  offset = offset || 0;
  page = page || 1;
  pageSize = pageSize || 10000;
  projectId = projectId || undefined;
  const accountId = accountFilterToQueryParam(accountFilter);

  const data = (
    await api.apiEventList(
      accountId,
      fromDatetime,
      limit,
      name,
      offset,
      page,
      pageSize,
      projectId,
      toDatetime,
    )
  ).data;

  // Event list is PaginatedEventList: { results, count }
  return data.results;
}

async function updateEvent(event: UpdateEvent): Promise<Event> {
  const updatedEvent = (await api.apiEventUpdate(event.id, event)).data;
  return updatedEvent;
}

async function bulkUpdateEvents(events: UpdateEvent[]): Promise<Event[]> {
  const data = (await api.apiEventBulkUpdateUpdate({ records: events }, undefined, undefined)).data;
  return data.results;
}

async function deleteEvent(eventId: number): Promise<void> {
  await api.apiEventDestroy(eventId);
  return;
}

async function bulkDeleteEvents(ids: number[]): Promise<BulkDeleteEventResult> {
  const result = (await api.apiEventBulkDeleteDestroy({ data: { ids } })).data;
  return result;
}

async function duplicateEvent(eventId: number): Promise<Event> {
  return (await api.apiEventDuplicateCreate(eventId)).data;
}

async function getEventBySearchFilters(eventId: string): Promise<Event | null> {
  // We don't have a direct endpoint to get a single event by ID,
  // so we use the list endpoint with specific filters to find the event
  try {
    // Fetch a wider time range to ensure we get the event
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1); // Look back 1 year

    const end = new Date();
    end.setFullYear(end.getFullYear() + 1); // Look ahead 1 year

    const events = await getAllEvents(
      start.toISOString(),
      end.toISOString(),
      undefined, // default limit
      undefined, // default offset
      undefined, // default page
      undefined, // default pageSize
      undefined, // no title filter
    );

    // Find the event with the matching ID
    const event = events.find((e) => e.id.toString() === eventId);
    return event || null;
  } catch (error) {
    console.error('Error fetching event by ID:', error);
    return null;
  }
}

/** Page size for calendar “Assign task” submenu (first page + infinite scroll). */
export const TASK_ASSIGN_PAGE_SIZE = 10;

const TASK_SEARCH_COMBO_PAGE_SIZE = 25;

async function searchTasksForEventPage(
  searchText: string,
  limit: number,
  offset: number,
): Promise<PaginatedTaskDocumentSearch> {
  return searchTasksFromIndex(searchText, limit, offset);
}

/** First page only; used by task comboboxes (e.g. TaskSearch). */
async function searchTasksForEvent(searchText: string): Promise<TaskSearch[]> {
  const page = await searchTasksForEventPage(searchText, TASK_SEARCH_COMBO_PAGE_SIZE, 0);
  return page.results ?? [];
}

async function searchEventInvitees(
  q: string,
  calendarAccountId?: number | null,
): Promise<EventInviteeSearchResult[]> {
  const response = await api.apiEventSearchInviteesList(
    q,
    calendarAccountId ?? undefined,
    undefined,
    undefined,
  );
  const data = response.data;
  if (Array.isArray(data)) {
    return data as EventInviteeSearchResult[];
  }
  return data.results ?? [];
}

async function getCalendarHistory(
  cursor?: string,
  limit?: number,
): Promise<CalendarHistoryTimeline> {
  return (await api.apiEventCalendarHistoryRetrieve(cursor, limit)).data;
}

async function restoreCalendarToTimestamp(targetAt: string): Promise<CalendarRestoreResult> {
  return (
    await api.apiEventRestoreCreate({
      target_at: targetAt,
    })
  ).data;
}

export {
  createNewEvent,
  getAllEvents,
  updateEvent,
  bulkUpdateEvents,
  deleteEvent,
  bulkDeleteEvents,
  duplicateEvent,
  getEventBySearchFilters,
  getEventById,
  searchTasksForEvent,
  searchTasksForEventPage,
  searchEventInvitees,
  getCalendarHistory,
  restoreCalendarToTimestamp,
};
