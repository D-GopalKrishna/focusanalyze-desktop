import {
  Notification,
  SourceEnum,
  Configuration,
  NotificationApi,
  NotificationsApiListStatusEnum,
  NotificationsApiListTypeEnum,
  MarkAllReadRequestActionEnum,
  MarkAllArchivedRequestActionEnum,
} from "@shared/api-client";
import {
  bearerAuthorizationHeader,
  createApiClient,
  createApiConfiguration,
  getAccessToken,
} from '../auth';
import { formatNotification } from './NotificationStream';

// Create a custom NotificationApi client
const api = createApiClient(NotificationApi);

/**
 * Mark a notification as read
 * @param notificationId ID of the notification to mark as read
 * @returns Promise<void>
 */
export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
  try {
    const notification: Notification = {
      id: parseInt(notificationId),
      title: '',
      message: '',
      created_at: new Date().toISOString(),
      user: 0,
      status: 'read',
    };
    await api.notificationsApiMarkAsReadCreate(parseInt(notificationId), notification);
  } catch (error) {
    console.error('Failed to mark notification as read:', error);
    throw new Error('Failed to mark notification as read');
  }
};

/**
 * Mark a notification as unread
 * @param notificationId ID of the notification to mark as unread
 * @returns Promise<void>
 */
export const markNotificationAsUnread = async (notificationId: string): Promise<void> => {
  try {
    const notification: Notification = {
      id: parseInt(notificationId),
      title: '',
      message: '',
      created_at: new Date().toISOString(),
      user: 0,
      status: 'unread',
    };
    // Use the same endpoint as mark as read, but with status 'unread'
    await api.notificationsApiMarkAsUnreadCreate(parseInt(notificationId), notification);
  } catch (error) {
    console.error('Failed to mark notification as unread:', error);
    throw new Error('Failed to mark notification as unread');
  }
};

/**
 * Mark all notifications as read
 * @returns Promise<void>
 */
export const markAllNotificationsAsRead = async (): Promise<void> => {
  try {
    await api.notificationsApiMarkAllReadCreate({
      action: MarkAllReadRequestActionEnum.MarkAllRead,
    });
  } catch (error) {
    console.error('Failed to mark all notifications as read:', error);
    throw new Error('Failed to mark all notifications as read');
  }
};

/**
 * Mark a notification as archived
 * @param notificationId ID of the notification to mark as archived
 * @returns Promise<void>
 */
export const markNotificationAsArchived = async (notificationId: string): Promise<void> => {
  try {
    const notification: Notification = {
      id: parseInt(notificationId),
      title: '',
      message: '',
      created_at: new Date().toISOString(),
      user: 0,
      status: 'archived',
    };
    await api.notificationsApiMarkAsArchivedCreate(parseInt(notificationId), notification);
  } catch (error) {
    console.error('Failed to mark notification as archived:', error);
    throw new Error('Failed to mark notification as archived');
  }
};

/**
 * Mark all notifications as archived
 * @returns Promise<void>
 */
export const markAllNotificationsAsArchived = async (): Promise<void> => {
  try {
    await api.notificationsApiMarkAllArchivedCreate({
      action: MarkAllArchivedRequestActionEnum.MarkAllArchived,
    });
  } catch (error) {
    console.error('Failed to mark all notifications as archived:', error);
    throw new Error('Failed to mark all notifications as archived');
  }
};

/**
 * Fetch notifications with optional filtering
 * @param limit Number of notifications to fetch
 * @param offset Offset for pagination
 * @param status Filter by status ('all', 'unread', 'read', 'archived')
 * @param source Filter by source ('all', 'focusanalyze', 'todoist', 'jira', 'github', 'notion')
 * @returns Promise<Notification[]>
 */
export const fetchNotifications = async (
  page: number = 1,
  page_size: number = 20,
  status?: NotificationsApiListStatusEnum,
  source?: SourceEnum,
  type?: NotificationsApiListTypeEnum,
): Promise<Notification[]> => {
  try {
    const response = await api.notificationsApiList(page, page_size, source, status, type);

    return Array.isArray(response.data.results)
      ? response.data.results.map(formatNotification)
      : [];
  } catch (error) {
    console.error('Failed to fetch notifications:', error);
    throw new Error('Failed to fetch notifications');
  }
};
