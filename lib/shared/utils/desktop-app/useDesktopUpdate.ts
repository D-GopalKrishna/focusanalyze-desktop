'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauriRuntime } from '@/lib/tauri/auth/tauri-store';

/**
 * Minimal shape of `@tauri-apps/plugin-updater`'s `Update` object this hook actually
 * uses — kept local instead of importing the package's types at module scope, since the
 * package itself is only ever dynamically imported (see `checkForUpdate` below): this is
 * a Tauri-only capability and importing it eagerly would break the plain-browser build.
 */
type UpdaterEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };

type TauriUpdate = {
  version: string;
  body?: string | null;
  downloadAndInstall: (onEvent: (event: UpdaterEvent) => void) => Promise<void>;
};

export type DesktopUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error';

export type DesktopUpdateState = {
  status: DesktopUpdateStatus;
  version: string | null;
  notes: string | null;
  progress: number | null;
  install: () => Promise<void>;
};

/**
 * Dev-only escape hatch to preview the update UI without a real Tauri build or a real
 * GitHub release — neither exists to test against yet (see
 * .claude/plan/in-progress/desktop-auto-update/plan.md). Visiting the app in a normal
 * browser tab with `?mockDesktopUpdate=1` simulates a full check → download → ready cycle
 * with fake data; `install()` fakes progress instead of touching the real updater/process
 * plugins (which don't exist outside Tauri) and never calls `relaunch()`. Gated on
 * `NODE_ENV === 'development'` so this can never activate in the built desktop app (a
 * production `next build`/static export always sets `NODE_ENV=production`) or the regular
 * production web app.
 */
function isMockUpdateRequested(): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('mockDesktopUpdate') === '1';
}

const MOCK_UPDATE = {
  version: '0.2.0-mock',
  body: "- Faster startup\n- Fixed the timer widget not resuming after sleep\n- Small UI polish\n\n(This is fake data from `?mockDesktopUpdate=1` — no real release exists yet.)",
};

/**
 * Checks for a desktop-app update once on mount (Tauri-only — a no-op everywhere else,
 * including plain-browser dev/prod, unless the dev-only mock mode above is active), and
 * exposes an `install()` action that downloads + verifies the update, then relaunches the
 * app. `@tauri-apps/plugin-updater` / `@tauri-apps/plugin-process` are dynamically imported
 * so this hook (and anything that imports it) stays safe to include in the regular web build.
 */
export function useDesktopUpdate(): DesktopUpdateState {
  const [status, setStatus] = useState<DesktopUpdateStatus>('idle');
  const [version, setVersion] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const updateRef = useRef<TauriUpdate | null>(null);
  const mockRef = useRef(false);

  useEffect(() => {
    if (isMockUpdateRequested()) {
      mockRef.current = true;
      setVersion(MOCK_UPDATE.version);
      setNotes(MOCK_UPDATE.body);
      setStatus('available');
      return;
    }

    if (!isTauriRuntime()) return;

    let cancelled = false;
    setStatus('checking');

    import('@tauri-apps/plugin-updater')
      .then(({ check }) => check())
      .then((update) => {
        if (cancelled) return;
        if (!update) {
          setStatus('idle');
          return;
        }
        updateRef.current = update as unknown as TauriUpdate;
        setVersion(update.version);
        setNotes(update.body ?? null);
        setStatus('available');
      })
      .catch(() => {
        if (!cancelled) setStatus('idle');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const install = useCallback(async () => {
    if (mockRef.current) {
      setStatus('downloading');
      setProgress(0);
      for (const step of [0.25, 0.5, 0.75, 1]) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        setProgress(step);
      }
      setStatus('ready');
      return;
    }

    const update = updateRef.current;
    if (!update) return;

    setStatus('downloading');
    setProgress(0);
    let totalBytes = 0;
    let downloadedBytes = 0;

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          totalBytes = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength;
          setProgress(totalBytes > 0 ? Math.min(1, downloadedBytes / totalBytes) : null);
        } else if (event.event === 'Finished') {
          setProgress(1);
        }
      });
      setStatus('ready');
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch {
      setStatus('error');
    }
  }, []);

  return { status, version, notes, progress, install };
}
