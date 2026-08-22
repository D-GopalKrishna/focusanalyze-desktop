import { EventSourcePolyfill, Event as EventSourcePolyfillEvent } from 'event-source-polyfill';
import debounce from 'lodash/debounce';
import { getFreshAccessToken } from '@/lib/middleware/keycloak';
import { Notification } from "@shared/api-client/api";
import { getNotificationStreamDedupeKey, getStreamNotificationsSeenKeys, persistStreamNotificationsSeenKeys } from "@shared/utils/notification-stream-dedupe";

// Helper function to convert backend notification to frontend notification
export function formatNotification(notification: Notification): Notification {
  if (!notification) {
    throw new Error('No notification data provided');
  }

  return {
    id: notification.id,
    title: notification.title || 'New Notification',
    content: notification.content || notification.message || '',
    message: notification.message || notification.content || '',
    created_at: notification.created_at,
    path: notification.path || '',
    type: notification.type,
    source: notification.source,
    status: notification.status,
    user: notification.user,
    // Pass through JSON object from SSE; no need to reshape (older code used Object.values by mistake).
    details: notification.details ?? undefined,
    checkboxes: notification.checkboxes
      ? Object.values(notification.checkboxes).map((cb) => Boolean(cb))
      : undefined,
  };
}

export type SetupNotificationStreamOptions = {
  /** Called when the EventSource opens (including after automatic reconnect). Use to reset client-side stream state. */
  onConnectionOpen?: () => void;
};

/**
 * Set up a notification stream with callbacks for handling notifications
 * @param onNotifications Callback function to handle batch of notifications
 * @param onError Callback function to handle errors
 * @param options Optional hooks (e.g. onConnectionOpen)
 * @returns Function to clean up the EventSource connection
 */
export const setupNotificationStream = (
  onNotifications: (notifications: Notification[]) => void,
  onError?: (error: EventSourcePolyfillEvent | Event) => void,
  options?: SetupNotificationStreamOptions,
): (() => void) => {
  const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/notifications/stream`);

  let eventSource: EventSourcePolyfill | null = null;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 5000;
  let lastHeartbeat = Date.now();
  let heartbeatTimeout: NodeJS.Timeout;
  let reconnectTimeout: NodeJS.Timeout;
  const processedNotifications = getStreamNotificationsSeenKeys();
  let isReconnecting = false;
  let cancelled = false;

  // Debounced notification handler to prevent rapid-fire updates
  const debouncedNotificationHandler = debounce(
    (notifications: Notification[]) => {
      onNotifications(notifications);
    },
    250,
    { maxWait: 1000 },
  );

  /** Closes the live connection/timers without blocking a subsequent reconnect. */
  const teardown = () => {
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    if (eventSource) {
      try {
        eventSource.close();
      } catch (error) {
        // Ignore errors when closing already closed/aborted connections
        console.debug('EventSource already closed:', error);
      }
      eventSource = null;
    }
  };

  const cleanup = () => {
    cancelled = true;
    teardown();
    debouncedNotificationHandler.cancel();
  };

  const resetHeartbeatTimeout = () => {
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
    }
    lastHeartbeat = Date.now();
    // Set timeout to 90 seconds (60 seconds heartbeat + 30 seconds buffer)
    heartbeatTimeout = setTimeout(() => {
      if (Date.now() - lastHeartbeat > 90000 && !isReconnecting) {
        console.error('Heartbeat timeout - reconnecting...');
        handleReconnect();
      }
    }, 90000);
  };

  /**
   * Resolves a proactively-refreshed token before (re)connecting, instead of reusing
   * whatever token was in scope when the stream was first opened — a long-lived stream
   * that reconnects hours later must not retry with a token captured at mount time.
   */
  const connectWithFreshToken = async () => {
    const token = await getFreshAccessToken();
    if (cancelled) return;
    if (!token) {
      console.error('No authentication token available');
      if (onError) {
        onError(new Event('auth_error'));
      }
      return;
    }

    eventSource = new EventSourcePolyfill(url.toString(), {
      withCredentials: typeof window !== 'undefined',
      headers: {
        Authorization: `Bearer ${token}`,
        // Web-only fallback for backends that also accept the session cookie.
        ...(typeof window !== 'undefined' ? { Cookie: `fa_access_token=${token}` } : {}),
      },
    });
    setupEventHandlers();
  };

  const handleReconnect = () => {
    if (isReconnecting) return;
    isReconnecting = true;
    teardown();

    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts - 1);

      reconnectTimeout = setTimeout(() => {
        void connectWithFreshToken().finally(() => {
          isReconnecting = false;
        });
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
      if (onError) {
        onError(new Event('max_reconnect_attempts'));
      }
      isReconnecting = false;
    }
  };

  const setupEventHandlers = () => {
    if (!eventSource) return;

    // Log when the connection is established
    eventSource.onopen = () => {
      // console.log('EventSource connection opened');
      reconnectAttempts = 0;
      resetHeartbeatTimeout();
      options?.onConnectionOpen?.();
    };

    // Handle regular messages (notifications)
    eventSource.onmessage = (event) => {
      try {
        // console.log('Received message:', event.data);

        if (!event.data) return;

        let notifications;
        try {
          notifications = JSON.parse(event.data);
          if (!Array.isArray(notifications)) {
            console.error('Expected array of notifications but got:', typeof notifications);
            return;
          }
        } catch (parseError) {
          console.error('Failed to parse message data:', parseError);
          return;
        }

        // Collect all valid notifications from the array.
        // Dedupe by notification id (or backend dedupe_key). Do not skip by created_at
        // mid-batch — Celery republishes unread newest-first and a timestamp watermark
        // would drop rows and under-count.
        const validNotifications: Notification[] = [];
        notifications.forEach((notificationData) => {
          try {
            const dedupeKey = getNotificationStreamDedupeKey({
              id: notificationData.id,
              dedupe_key:
                typeof notificationData.dedupe_key === 'string'
                  ? notificationData.dedupe_key
                  : null,
            });
            if (!dedupeKey) {
              console.warn('Skipping stream notification without id or dedupe_key', notificationData);
              return;
            }
            if (processedNotifications.has(dedupeKey)) {
              return;
            }

            const converted = formatNotification(notificationData);
            processedNotifications.add(dedupeKey);
            validNotifications.push(converted);
          } catch (conversionError) {
            console.error('Error processing notification:', conversionError, notificationData);
          }
        });

        if (validNotifications.length > 0) {
          persistStreamNotificationsSeenKeys(processedNotifications);
        }

        // Send all valid notifications as a batch
        if (validNotifications.length > 0) {
          // console.log('Sending batch of notifications:', validNotifications.length);
          debouncedNotificationHandler(validNotifications);
        }

        // console.log('Processed notifications:', processedNotifications);
      } catch (error) {
        console.error('Error in message handler:', error);
        if (onError) onError(new Event('parse_error'));
      }
    };

    // Handle heartbeat events
    eventSource.addEventListener('heartbeat', () => {
      // console.log('Received heartbeat event');
      resetHeartbeatTimeout();
    });

    // Handle errors
    eventSource.onerror = (event: EventSourcePolyfillEvent) => {
      console.error('EventSource error:', event);
      if (onError) onError(event);
      if (!isReconnecting) handleReconnect();
    };
  };

  void connectWithFreshToken();
  return cleanup;
};
