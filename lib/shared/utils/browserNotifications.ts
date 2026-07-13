import type { Notification as StreamNotification } from "@shared/api-client/api";

import {
  getStreamNotificationToastCopy,
  isStreamCalendarReminderNotification,
  shouldShowSonnerForStreamNotification,
} from "@shared/utils/notifications";

const STORAGE_KEY = 'fa_desktop_notifications_enabled';

export type BrowserNotificationPermission = 'default' | 'denied' | 'granted' | 'unsupported';

export function isDesktopNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Use `window.Notification` explicitly so we never shadow the DOM API with other imports. */
function getBrowserNotificationCtor(): typeof window.Notification | null {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  return window.Notification;
}

export function getDesktopNotificationPermission(): BrowserNotificationPermission {
  const Ctor = getBrowserNotificationCtor();
  if (!Ctor) return 'unsupported';
  return Ctor.permission as BrowserNotificationPermission;
}

function isDesktopNotificationGrantedWhenHidden(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState !== 'hidden') return false;
  const Ctor = getBrowserNotificationCtor();
  if (!Ctor || Ctor.permission !== 'granted') return false;
  return true;
}

export function getDesktopNotificationPreference(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) === '1';
}

export function setDesktopNotificationPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
}

/**
 * Must be called from a user gesture (e.g. toggle click) for best browser compatibility.
 */
export async function requestDesktopNotificationPermission(): Promise<
  Exclude<BrowserNotificationPermission, 'unsupported'>
> {
  const Ctor = getBrowserNotificationCtor();
  if (!Ctor) return 'denied';
  try {
    const p = await Ctor.requestPermission();
    return p as Exclude<BrowserNotificationPermission, 'unsupported'>;
  } catch {
    return 'denied';
  }
}

function shouldShowDesktopNotificationNow(): boolean {
  if (!isDesktopNotificationGrantedWhenHidden()) return false;
  return getDesktopNotificationPreference();
}

function notify(
  title: string,
  options: {
    tag: string;
    body?: string;
    icon?: string;
    silent?: boolean;
    requireInteraction?: boolean;
  },
  onClick?: () => void,
): void {
  try {
    const Ctor = getBrowserNotificationCtor();
    if (!Ctor) return;
    const n = new Ctor(title, {
      silent: false,
      ...options,
    });
    if (onClick) {
      n.onclick = () => {
        n.close();
        onClick();
      };
    }
  } catch (e) {
    console.error('Desktop notification failed:', e);
  }
}

/**
 * Generic desktop notification helper with the same policy as stream notifications:
 * only shows when the tab is hidden and the user has opted in + granted permission.
 */
export function showDesktopNotificationWhenHidden(
  title: string,
  options: {
    tag: string;
    body?: string;
    icon?: string;
    silent?: boolean;
    requireInteraction?: boolean;
  },
  onClick?: () => void,
): void {
  if (!shouldShowDesktopNotificationNow()) return;
  notify(title, options, onClick);
}

/**
 * Shows a desktop notification when the tab is hidden and permission is granted.
 * Unlike `showDesktopNotificationWhenHidden`, this does NOT require the user opt-in preference.
 *
 * Intended for one-off, explicit user actions (e.g. starting a timer) where they clearly expect
 * a browser-level notification on completion.
 */
export function showDesktopNotificationWhenHiddenIfGranted(
  title: string,
  options: {
    tag: string;
    body?: string;
    icon?: string;
    silent?: boolean;
    requireInteraction?: boolean;
  },
  onClick?: () => void,
): void {
  if (!isDesktopNotificationGrantedWhenHidden()) return;
  notify(title, options, onClick);
}

/**
 * Shows a desktop notification whenever permission is granted, including when the tab is visible.
 * Use for timer completion and other cases where the user already opted in and expects an alert.
 * (Foreground tabs previously got no toast because `showDesktopNotificationWhenHiddenIfGranted`
 * required a hidden document.)
 */
export function showDesktopNotificationIfGranted(
  title: string,
  options: {
    tag: string;
    body?: string;
    icon?: string;
    silent?: boolean;
    requireInteraction?: boolean;
  },
  onClick?: () => void,
): void {
  if (typeof document === 'undefined') return;
  const Ctor = getBrowserNotificationCtor();
  if (!Ctor || Ctor.permission !== 'granted') return;
  notify(title, options, onClick);
}

/**
 * Mirrors the Sonner policy in `DashboardInbox`: same eligibility and fresh/stale split.
 * Only displays when the document is hidden and the user has opted in with a granted permission.
 */
export function showDesktopNotificationsForStream(
  notifications: StreamNotification[],
  context: {
    isInitialNonEmptyStreamBatch: boolean;
    onOpenNotification: (notification: StreamNotification) => void;
    onOpenCalendar: () => void;
    onOpenInbox: () => void;
  },
): void {
  if (!shouldShowDesktopNotificationNow() || notifications.length === 0) return;

  const eligible = notifications.filter((n) =>
    shouldShowSonnerForStreamNotification(n.type, context.isInitialNonEmptyStreamBatch),
  );
  if (eligible.length === 0) return;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  /**
   * Backend stream ordering note:
   * The SSE payload is published as a JSON list to Redis.
   * In current backend code, the QuerySet is *not* ordered, so practical ordering
   * is often oldest-first (ascending PK) but is not guaranteed.
   *
   * For best UX (least spam), show only ONE desktop notification per batch.
   * Selection:
   * - Prefer TaskDue/TaskOverdue items
   * - Otherwise use the newest item (based on created_at); if parsing fails, fall back to last.
   */
  const pickNewest = (items: StreamNotification[]): StreamNotification => {
    let best: StreamNotification | null = null;
    let bestTs = -Infinity;
    for (const n of items) {
      const ts = n.created_at ? new Date(n.created_at).getTime() : NaN;
      if (!Number.isFinite(ts)) continue;
      if (best == null || ts > bestTs) {
        best = n;
        bestTs = ts;
      }
    }
    return best ?? items[items.length - 1];
  };

  const taskDue = eligible.filter((n) => n.type === 'task_due' || n.type === 'task_overdue');
  const chosen = pickNewest(taskDue.length > 0 ? taskDue : eligible);

  const { title, description } = getStreamNotificationToastCopy(chosen);
  notify(
    title,
    {
      tag: `fa-stream-batch-${String(chosen.id)}`,
      body: description,
      icon: origin ? `${origin}/favicon.ico` : undefined,
    },
    () => {
      if (isStreamCalendarReminderNotification(chosen.type)) {
        context.onOpenCalendar();
        return;
      }
      context.onOpenNotification(chosen);
    },
  );
}

/**
 * Short major-arpeggio “chime” for timer complete — softer than a single high beep.
 * C5 → E5 → G5 with slight stagger and gentle decay (Web Audio API).
 */
export async function playTimerCompletionSound(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const Ctx = (window.AudioContext ?? (window as any).webkitAudioContext) as
      | (new () => AudioContext)
      | undefined;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => undefined);
    }

    const master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);

    // C5, E5, G5 (pleasant, “notification-like” major triad)
    const notes: { freq: number; delay: number; peak: number }[] = [
      { freq: 523.25, delay: 0, peak: 0.11 },
      { freq: 659.25, delay: 0.085, peak: 0.1 },
      { freq: 783.99, delay: 0.17, peak: 0.09 },
    ];

    const t0 = ctx.currentTime;
    const noteDuration = 0.38;
    let pending = notes.length;

    for (const { freq, delay, peak } of notes) {
      const start = t0 + delay;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + noteDuration);

      osc.connect(g);
      g.connect(master);
      osc.start(start);
      osc.stop(start + noteDuration + 0.05);
      osc.onended = () => {
        pending -= 1;
        if (pending <= 0) {
          try {
            ctx.close();
          } catch {
            // ignore
          }
        }
      };
    }
  } catch {
    // ignore (unsupported / blocked)
  }
}
