/**
 * Minimal timer-completion sound IDs + file map.
 * Safe to import from the timer widget (no chooser metadata).
 *
 * **Preference storage:** the user's choice is persisted in `localStorage` only
 * (`focusanalyze.timerCompletionSound` via `getTimerCompletionSoundPreference` /
 * `setTimerCompletionSoundPreference` in `browserNotifications.ts`). It is not
 * stored on UserSettings / the backend (unlike `calendar_timer_widget_style`).
 */

export type TimerCompletionSoundId =
  | 'chime'
  | 'xylophone'
  | 'fanfare-a'
  | 'fanfare-g'
  | 'game-start'
  | 'hint'
  | 'correct';

export const DEFAULT_TIMER_COMPLETION_SOUND: TimerCompletionSoundId = 'chime';

export const TIMER_COMPLETION_SOUND_FILES: Partial<
  Record<TimerCompletionSoundId, string>
> = {
  xylophone: '/sounds/timer/notify3.mp3',
  'fanfare-a': '/sounds/timer/fanfare-a.mp3',
  'fanfare-g': '/sounds/timer/fanfare-g.mp3',
  'game-start': '/sounds/timer/game-start.mp3',
  hint: '/sounds/timer/hint.mp3',
  correct: '/sounds/timer/correct.mp3',
};

const VALID_IDS = new Set<string>([
  'chime',
  'xylophone',
  'fanfare-a',
  'fanfare-g',
  'game-start',
  'hint',
  'correct',
]);

export function isTimerCompletionSoundId(value: string): value is TimerCompletionSoundId {
  return VALID_IDS.has(value);
}
