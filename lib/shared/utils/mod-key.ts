/** Cross-platform primary modifier: ⌘ on macOS, Ctrl on Windows/Linux. */

export type ModifiableShortcut = {
  mod?: boolean;
  ctrl?: boolean;
  meta?: boolean;
};

export function isMacOs(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

export function wantsModKey(shortcut: ModifiableShortcut): boolean {
  return !!(shortcut.mod || shortcut.ctrl || shortcut.meta);
}

export function isModKeyPressed(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>): boolean {
  return event.ctrlKey || event.metaKey;
}

export function getModKeyLabel(): string {
  return isMacOs() ? '⌘' : 'Ctrl';
}

/** Alt on Windows/Linux; Option (⌥) on macOS — same `altKey` in keyboard events. */
export function getAltKeyLabel(): string {
  return isMacOs() ? '⌥' : 'Alt';
}

/** e.g. `⌘K` on Mac, `Ctrl+K` elsewhere. */
export function formatModKeyCombo(key: string, separator = '+'): string {
  const mod = getModKeyLabel();
  if (mod === '⌘') return `${mod}${key}`;
  return `${mod}${separator}${key}`;
}

/** e.g. `⌥C` on Mac, `Alt + C` elsewhere. */
export function formatAltKeyCombo(key: string, separator = ' + '): string {
  const alt = getAltKeyLabel();
  if (alt === '⌥') return `${alt}${key}`;
  return `${alt}${separator}${key}`;
}

/** e.g. `⌘⇧T` on Mac, `Ctrl+Shift+T` elsewhere. */
export function formatModShiftKeyCombo(key: string, separator = '+'): string {
  const mod = getModKeyLabel();
  if (mod === '⌘') return `${mod}⇧${key}`;
  return `${mod}${separator}Shift${separator}${key}`;
}

export function matchesModKeyRequirement(
  shortcut: ModifiableShortcut,
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>,
): boolean {
  return wantsModKey(shortcut) === isModKeyPressed(event);
}

/** Map `KeyboardEvent.code` to the shortcut config key (lowercase). */
export function shortcutKeyFromCode(code: string): string | null {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  switch (code) {
    case 'Quote':
      return "'";
    case 'Minus':
    case 'NumpadSubtract':
      return '-';
    case 'Equal':
    case 'NumpadAdd':
      return '+';
    case 'Space':
      return 'space';
    default:
      return null;
  }
}

/**
 * Match a configured shortcut key against a keydown event.
 * Uses physical key codes so Option/Alt shortcuts work on macOS (Option remaps `event.key`).
 */
export function matchesShortcutKey(
  shortcutKey: string,
  event: Pick<KeyboardEvent, 'key' | 'code'>,
): boolean {
  const expected = shortcutKey.toLowerCase();

  if (expected === '+') {
    return (
      event.key === '+' ||
      event.key === '=' ||
      event.code === 'Equal' ||
      event.code === 'NumpadAdd'
    );
  }
  if (expected === '-') {
    return event.key === '-' || event.code === 'Minus' || event.code === 'NumpadSubtract';
  }
  if (expected === 'enter') {
    return event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter';
  }

  const fromCode = shortcutKeyFromCode(event.code);
  if (fromCode === expected) return true;

  const evtKey = typeof event.key === 'string' ? event.key.toLowerCase() : '';
  return evtKey.length === 1 && evtKey === expected;
}

/** Label to store/show for a captured shortcut key (uppercase letters). */
export function shortcutKeyLabelFromEvent(event: KeyboardEvent): string {
  if (event.key === ' ') return 'Space';

  const fromCode = shortcutKeyFromCode(event.code);
  if (fromCode === '+') return '+';
  if (fromCode === '-') return '-';
  if (fromCode === "'") return "'";
  if (fromCode && fromCode.length === 1 && /[a-z]/.test(fromCode)) {
    return fromCode.toUpperCase();
  }
  if (fromCode) return fromCode;

  if (event.key.length === 1) return event.key.toUpperCase();
  return event.key;
}
