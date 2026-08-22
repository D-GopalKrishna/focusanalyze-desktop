/**
 * Timer completion sound catalog for Settings → Calendar.
 *
 * Import only from Calendar settings (preferably via dynamic `import()`)
 * so chooser labels are not bundled into the timer widget path.
 */

import type { LucideIcon } from 'lucide-react';
import {
  CircleCheck,
  Gamepad2,
  Lightbulb,
  Music2,
  PartyPopper,
  Sparkles,
  Star,
} from 'lucide-react';

import {
  type TimerCompletionSoundId,
  DEFAULT_TIMER_COMPLETION_SOUND,
  isTimerCompletionSoundId,
  TIMER_COMPLETION_SOUND_FILES,
} from "@shared/utils/timer-completion-sound-core";

export type { TimerCompletionSoundId };
export {
  DEFAULT_TIMER_COMPLETION_SOUND,
  isTimerCompletionSoundId,
  TIMER_COMPLETION_SOUND_FILES,
};

export type TimerCompletionSoundOption = {
  id: TimerCompletionSoundId;
  label: string;
  description: string;
  /** Small icon hinting at the tone/mood (shown in Settings → Calendar only). */
  Icon: LucideIcon;
};

/** First option is the original built-in Web Audio chime. */
export const TIMER_COMPLETION_SOUND_OPTIONS: ReadonlyArray<TimerCompletionSoundOption> = [
  {
    id: 'chime',
    label: 'Chime',
    description: 'Original soft major arpeggio (built-in).',
    Icon: Sparkles,
  },
  {
    id: 'xylophone',
    label: 'Xylophone',
    description: 'Musical notification chime — Freesound CC0 (Mihacappy).',
    Icon: Music2,
  },
  {
    id: 'fanfare-a',
    label: 'Fanfare A',
    description: 'Short tada fanfare — Freesound CC0 (plasterbrain).',
    Icon: PartyPopper,
  },
  {
    id: 'fanfare-g',
    label: 'Fanfare G',
    description: 'Bright tada fanfare — Freesound CC0 (plasterbrain).',
    Icon: Star,
  },
  {
    id: 'game-start',
    label: 'Game start',
    description: 'Upbeat start jingle — Freesound CC0 (plasterbrain).',
    Icon: Gamepad2,
  },
  {
    id: 'hint',
    label: 'Hint',
    description: 'Short UI hint ding — Freesound CC0 (dland).',
    Icon: Lightbulb,
  },
  {
    id: 'correct',
    label: 'Correct',
    description: 'Success jingle — Freesound CC0 (ertfelda).',
    Icon: CircleCheck,
  },
];
