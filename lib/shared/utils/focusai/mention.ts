/** Detects an in-progress `@mention` token ending at the caret. */

export type MentionTrigger = {
  /** Index of the `@` character. */
  start: number;
  /** Caret index (end of the typed query). */
  end: number;
  query: string;
};

/**
 * Finds the `@query` token immediately before the caret, if any.
 * The `@` must start the string or follow whitespace (so emails/handles inside
 * words don't trigger), and the query itself must not contain whitespace —
 * typing a space closes the mention.
 */
export function findMentionTrigger(value: string, caret: number): MentionTrigger | null {
  if (caret < 0 || caret > value.length) return null;
  const upToCaret = value.slice(0, caret);
  const atIndex = upToCaret.lastIndexOf('@');
  if (atIndex === -1) return null;

  const boundary = value[atIndex - 1];
  if (boundary !== undefined && !/\s/.test(boundary)) return null;

  const query = upToCaret.slice(atIndex + 1);
  if (/\s/.test(query) || query.length > 60) return null;

  return { start: atIndex, end: caret, query };
}

/** Removes the `@query` token from `value`, returning the new value and caret index. */
export function removeMentionToken(
  value: string,
  trigger: MentionTrigger,
): { value: string; caret: number } {
  const before = value.slice(0, trigger.start);
  const after = value.slice(trigger.end);
  return { value: before + after, caret: before.length };
}
