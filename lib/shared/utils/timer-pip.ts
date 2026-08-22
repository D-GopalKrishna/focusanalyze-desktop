/**
 * Timer pop-out / PiP capability.
 *
 * Only **Document Picture-in-Picture** (`documentPictureInPicture`) is offered —
 * Chrome/Edge and Firefox 151+. That API is always-on-top.
 *
 * Safari (and anything else without Document PiP) gets **no** pop-out button: a normal
 * `window.open` popup is not always-on-top, so it would mislead users who expect
 * Chrome-like "keep on top" behavior.
 */

export type TimerPipMode = 'document' | 'none';

export function hasDocumentPictureInPicture(
  win: Window = typeof window !== 'undefined' ? window : (undefined as unknown as Window),
): boolean {
  if (!win) return false;
  try {
    const dpp = (win as Window & { documentPictureInPicture?: { requestWindow?: unknown } })
      .documentPictureInPicture;
    return Boolean(dpp && typeof dpp.requestWindow === 'function');
  } catch {
    return false;
  }
}

export function getTimerPipMode(
  win: Window = typeof window !== 'undefined' ? window : (undefined as unknown as Window),
): TimerPipMode {
  if (!win) return 'none';
  return hasDocumentPictureInPicture(win) ? 'document' : 'none';
}

export function getTimerPipButtonTitle(mode: TimerPipMode): string {
  if (mode === 'document') {
    return 'Keep on top (floats above other windows)';
  }
  return 'Pop out timer';
}
