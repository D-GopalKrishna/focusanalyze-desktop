import {
  Announcement,
  AnnouncementApi,
  PaginatedAnnouncementList,
  UpdateLastSeenAnnouncement,
  UserApi,
} from "@shared/api-client";
import { createApiClient } from '../auth';

const announcementApi = createApiClient(AnnouncementApi);
const userApi = createApiClient(UserApi);

export interface GetAnnouncementsParams {
  limit?: number;
  offset?: number;
  badge?: string;
  publishedAfter?: string;
  publishedBefore?: string;
}

async function getLatestAnnouncement(): Promise<Announcement | null> {
  const { data } = await announcementApi.apiAnnouncementList(undefined, 1);
  return data.results?.[0] ?? null;
}

async function getAnnouncements(
  params: GetAnnouncementsParams = {},
): Promise<PaginatedAnnouncementList> {
  const { badge, limit = 20, offset = 0, publishedAfter, publishedBefore } = params;
  const { data } = await announcementApi.apiAnnouncementList(
    badge,
    limit,
    offset,
    publishedAfter,
    publishedBefore,
  );
  return data;
}

async function updateLastSeenAnnouncement(announcementId: number) {
  const body: UpdateLastSeenAnnouncement = { announcement_id: announcementId };
  const { data } = await userApi.apiUserUpdateLastSeenAnnouncementUpdate(body);
  return data;
}

export type { Announcement, PaginatedAnnouncementList };
export { getLatestAnnouncement, getAnnouncements, updateLastSeenAnnouncement };
