import {
  EventApi,
  Event,
  EventDetail,
  EventInviteeSearchResult,
  EventLocationSuggestion,
  EventReportExclusionRequest,
  ResponseStatusEnum,
  CreateEvent,
  UpdateEvent,
  BulkDeleteEventResult,
  TaskSearch,
  PaginatedTaskDocumentSearch,
  CalendarHistoryTimeline,
  CalendarRestoreResult,
  RevertResponse,
  ApiEventListScopeEnum,
} from "@shared/api-client";
import { CalendarAccountFilter } from "@shared/types/dashboard/calendar";
import { createApiClient } from '../auth';
import { searchTasksFromIndex } from './Task';

export type { EventLocationSuggestion };

export type EventReportExclusionChange = {
  changeType?: 'single' | 'this_and_following' | 'all';
  occurrenceStart?: string;
};

export function eventExcludedFromReports(event: Event | null | undefined): boolean {
  return Boolean(event?.excluded_from_reports);
}

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
  scope?: ApiEventListScopeEnum,
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
      scope,
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

async function deleteEvent(
  eventId: number,
  recurringChange?: { changeType?: string; occurrenceStart?: string },
  sendInviteEmails?: boolean,
): Promise<void> {
  // change_type/occurrence_start/send_invite_emails aren't in the generated client's
  // destroy signature (backend reads them as query params) — pass via axios `params`
  // instead of hand-editing the generated method.
  const params: Record<string, string | boolean> = {};
  if (recurringChange?.changeType && recurringChange.changeType !== 'all') {
    params.change_type = recurringChange.changeType;
    if (recurringChange.occurrenceStart) params.occurrence_start = recurringChange.occurrenceStart;
  } else if (recurringChange?.changeType) {
    params.change_type = recurringChange.changeType;
  }
  if (sendInviteEmails !== undefined) params.send_invite_emails = sendInviteEmails;
  await api.apiEventDestroy(eventId, Object.keys(params).length ? { params } : undefined);
  return;
}

export type BulkDeleteEventItem = {
  id: number;
  changeType?: 'single' | 'this_and_following' | 'all';
  occurrenceStart?: string;
};

async function bulkDeleteEvents(
  idsOrItems: number[] | BulkDeleteEventItem[],
): Promise<BulkDeleteEventResult> {
  // Request body typing isn't generated for DELETE actions (drf-spectacular drops request
  // bodies for DELETE by convention), so this goes through the same manual-body escape
  // hatch as `deleteEvent`'s query params, rather than a typed generated field.
  const body =
    idsOrItems.length && typeof idsOrItems[0] === 'object'
      ? {
          items: (idsOrItems as BulkDeleteEventItem[]).map((item) => ({
            id: item.id,
            change_type: item.changeType,
            occurrence_start: item.occurrenceStart,
          })),
        }
      : { ids: idsOrItems as number[] };
  const result = (await api.apiEventBulkDeleteDestroy({ data: body })).data;
  return result;
}

async function duplicateEvent(eventId: number): Promise<Event> {
  return (await api.apiEventDuplicateCreate(eventId)).data;
}

async function setEventReportExclusion(
  eventId: number,
  excluded: boolean,
  change?: EventReportExclusionChange,
): Promise<Event> {
  const body: EventReportExclusionRequest = {};
  if (change?.changeType) body.change_type = change.changeType;
  if (change?.occurrenceStart) body.occurrence_start = change.occurrenceStart;
  if (excluded) {
    return (await api.apiEventExcludeFromReportsCreate(eventId, body)).data;
  }
  return (await api.apiEventIncludeInReportsCreate(eventId, body)).data;
}

/** Accept/decline/tentative on your own invitation. Organiser rows can't RSVP to themselves. */
async function respondToEventInvite(
  eventId: number,
  responseStatus: ResponseStatusEnum,
): Promise<Event> {
  return (await api.apiEventRsvpCreate(eventId, { response_status: responseStatus })).data;
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

async function searchEventLocations(
  q: string,
  sessionToken?: string | null,
): Promise<EventLocationSuggestion[]> {
  try {
    const response = await api.apiEventSearchLocationsList(
      q,
      undefined,
      undefined,
      sessionToken ?? undefined,
    );
    const data = response.data;
    if (Array.isArray(data)) {
      return data as EventLocationSuggestion[];
    }
    return data.results ?? [];
  } catch {
    return [];
  }
}

async function resolveEventLocation(
  placeId: string,
  sessionToken?: string | null,
  fallbackDescription?: string,
): Promise<string> {
  try {
    const response = await api.apiEventResolveLocationCreate({
      place_id: placeId,
      session_token: sessionToken ?? '',
      fallback_description: fallbackDescription ?? '',
    });
    return (response.data.location || fallbackDescription || '').trim();
  } catch {
    return fallbackDescription ?? '';
  }
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

/** Preview or apply Action Revert for a single event history row (never a full calendar restore). */
async function previewEventHistoryRevert(historyId: number): Promise<RevertResponse> {
  return (
    await api.apiEventHistoryRevertCreate({
      history_id: historyId,
      preview: true,
    })
  ).data;
}

async function revertEventHistory(historyId: number): Promise<RevertResponse> {
  return (
    await api.apiEventHistoryRevertCreate({
      history_id: historyId,
    })
  ).data;
}

/** Preview or apply Action Revert for every event in a change set (history-restore Phase 3 group revert). */
async function previewEventHistoryChangeSetRevert(changeSetId: string): Promise<RevertResponse> {
  return (
    await api.apiEventHistoryRevertCreate({
      change_set_id: changeSetId,
      preview: true,
    })
  ).data;
}

async function revertEventHistoryChangeSet(changeSetId: string): Promise<RevertResponse> {
  return (
    await api.apiEventHistoryRevertCreate({
      change_set_id: changeSetId,
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
  setEventReportExclusion,
  respondToEventInvite,
  getEventBySearchFilters,
  getEventById,
  searchTasksForEvent,
  searchTasksForEventPage,
  searchEventInvitees,
  searchEventLocations,
  resolveEventLocation,
  getCalendarHistory,
  restoreCalendarToTimestamp,
  previewEventHistoryRevert,
  revertEventHistory,
  previewEventHistoryChangeSetRevert,
  revertEventHistoryChangeSet,
};
