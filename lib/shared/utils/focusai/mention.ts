/** Detects an in-progress `@mention` token ending at the caret. */

export type MentionTrigger = {
  /** Index of the `@` character. */
  start: number;
  /** Caret index (end of the typed query). */
  end: number;
  query: string;
};

const MAX_MENTION_QUERY_LENGTH = 60;

/**
 * Finds the `@query` token immediately before the caret, if any.
 * The `@` must start the string or follow whitespace (so emails/handles inside
 * words don't trigger). The query is allowed to contain spaces — task/project/
 * life-area/event names are frequently multi-word ("Demo Task 2"), and cutting the
 * query off at the first space made it impossible to search past the first word.
 * The mention still closes on a newline, a second `@`, or a long query — plain
 * word-boundary spaces don't close it; Escape/selecting/clicking away do instead.
 */
export function findMentionTrigger(value: string, caret: number): MentionTrigger | null {
  if (caret < 0 || caret > value.length) return null;
  const upToCaret = value.slice(0, caret);
  const atIndex = upToCaret.lastIndexOf('@');
  if (atIndex === -1) return null;

  const boundary = value[atIndex - 1];
  if (boundary !== undefined && !/\s/.test(boundary)) return null;

  const query = upToCaret.slice(atIndex + 1);
  if (query.includes('@') || query.includes('\n') || query.length > MAX_MENTION_QUERY_LENGTH) {
    return null;
  }

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
