/**
 * Stream/SSE notification rows are DB records: stable integer `id`, optional `dedupe_key`.
 * There is no notification UUID in the API.
 */

export type NotificationStreamDedupeInput = {
  id?: number | string | null;
  dedupe_key?: string | null;
};

/** Stable key for deduping stream batches and Sonner toast ids. */
export function getNotificationStreamDedupeKey(
  notification: NotificationStreamDedupeInput,
): string | null {
  const rawId = notification.id;
  let id = NaN;
  if (typeof rawId === 'number' && Number.isFinite(rawId)) {
    id = rawId;
  } else if (typeof rawId === 'string' && rawId.trim() !== '') {
    id = Number(rawId);
  }
  if (Number.isFinite(id) && id > 0) {
    return `id:${id}`;
  }

  const dedupe = notification.dedupe_key?.trim();
  if (dedupe) {
    return `dedupe:${dedupe}`;
  }

  return null;
}

/** First occurrence wins; preserves order. Rows without id/dedupe_key are dropped. */
export function dedupeStreamNotifications<T extends NotificationStreamDedupeInput>(
  notifications: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const n of notifications) {
    const key = getNotificationStreamDedupeKey(n);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

const STREAM_SEEN_STORAGE_KEY = 'fa_notification_stream_seen_keys';
const STREAM_TOAST_SHOWN_STORAGE_KEY = 'fa_notification_stream_toast_shown_keys';
const MAX_PERSISTED_KEYS = 1500;

function readKeySet(storageKey: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((k): k is string => typeof k === 'string'));
  } catch {
    return new Set();
  }
}

function writeKeySet(storageKey: string, keys: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    const arr = [...keys];
    const trimmed =
      arr.length > MAX_PERSISTED_KEYS ? arr.slice(arr.length - MAX_PERSISTED_KEYS) : arr;
    sessionStorage.setItem(storageKey, JSON.stringify(trimmed));
  } catch {
    // ignore quota / private mode
  }
}

/** Keys already delivered to the stream handler this browser tab session (survives remount). */
export function getStreamNotificationsSeenKeys(): Set<string> {
  return readKeySet(STREAM_SEEN_STORAGE_KEY);
}

export function rememberStreamNotificationSeen(dedupeKey: string, seen: Set<string>): void {
  seen.add(dedupeKey);
  writeKeySet(STREAM_SEEN_STORAGE_KEY, seen);
}

export function persistStreamNotificationsSeenKeys(seen: Set<string>): void {
  writeKeySet(STREAM_SEEN_STORAGE_KEY, seen);
}

export function hasStreamNotificationToastBeenShown(dedupeKey: string): boolean {
  return readKeySet(STREAM_TOAST_SHOWN_STORAGE_KEY).has(dedupeKey);
}

export function rememberStreamNotificationToastShown(dedupeKey: string): void {
  const set = readKeySet(STREAM_TOAST_SHOWN_STORAGE_KEY);
  set.add(dedupeKey);
  writeKeySet(STREAM_TOAST_SHOWN_STORAGE_KEY, set);
}
