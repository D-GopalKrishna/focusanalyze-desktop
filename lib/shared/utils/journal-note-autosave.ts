import { journalNotesEqual } from './journal-note-html';

export type JournalNoteSaveFn = (value: string) => Promise<{ note?: string | null } | void>;

type PendingJournalSave = {
  value: string;
  saveFn: JournalNoteSaveFn;
  baseline: string;
  saveKey: string;
};

export type JournalNoteAutosave = {
  /** Debounce `value` against `saveFn`. A different `saveKey` flushes the previous save first. */
  schedule: (value: string, saveFn: JournalNoteSaveFn, baseline: string, saveKey: string) => void;
  /** Fire any pending save immediately. Safe to call when nothing is pending. */
  flush: () => Promise<void>;
};

/**
 * Debounced journal-note persistence that does not drop an in-flight edit when
 * the target day (or other save identity) changes.
 *
 * The previous implementation stored one timeout and cleared it on every
 * keystroke. That is correct while the user is editing a single day; it is not
 * correct when the docked journal follows calendar Prev/Next — a later
 * `schedule()` for the new day cancelled the previous day's unsaved PATCH.
 */
export function createJournalNoteAutosave(options?: {
  delayMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}): JournalNoteAutosave {
  const delayMs = options?.delayMs ?? 700;
  const setTimeoutFn = options?.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options?.clearTimeoutFn ?? clearTimeout;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: PendingJournalSave | null = null;

  function clearTimer() {
    if (timer == null) return;
    clearTimeoutFn(timer);
    timer = null;
  }

  async function flush(): Promise<void> {
    clearTimer();
    const current = pending;
    pending = null;
    if (!current) return;
    if (journalNotesEqual(current.value, current.baseline)) return;
    await current.saveFn(current.value);
  }

  function schedule(value: string, saveFn: JournalNoteSaveFn, baseline: string, saveKey: string) {
    if (pending && pending.saveKey !== saveKey) {
      // Capture+start the previous day's save before we replace `pending`.
      // `flush` reads `pending` synchronously, so this is not a race.
      void flush();
    } else {
      clearTimer();
    }
    pending = { value, saveFn, baseline, saveKey };
    timer = setTimeoutFn(() => {
      void flush();
    }, delayMs);
  }

  return { schedule, flush };
}
