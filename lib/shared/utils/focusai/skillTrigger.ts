/** Detects an in-progress `/skill` slash-command token ending at the caret. */

import type { UserSkill } from "@shared/services/api/dashboard/focusaiRulesSkillsMemories";

/** A UserSkill with a real (non-empty) slug — the only kind the backend's
 * slash-command matcher (match_user_skill) can ever match. */
export type SlashableSkill = UserSkill & { slug: string };

export function isSlashableSkill(skill: UserSkill): skill is SlashableSkill {
  return Boolean(skill.enabled && skill.slug);
}

export type SkillTrigger = {
  /** Index of the `/` character. */
  start: number;
  /** Caret index (end of the typed query). */
  end: number;
  query: string;
};

/**
 * Finds the `/query` token immediately before the caret, if any. The `/` must
 * start the string or follow whitespace, and the query itself must not
 * contain whitespace — typing a space closes the trigger. Mirrors
 * `findMentionTrigger` in mention.ts (same boundary/query rules, different
 * trigger character).
 */
export function findSkillTrigger(value: string, caret: number): SkillTrigger | null {
  if (caret < 0 || caret > value.length) return null;
  const upToCaret = value.slice(0, caret);
  const slashIndex = upToCaret.lastIndexOf('/');
  if (slashIndex === -1) return null;

  const boundary = value[slashIndex - 1];
  if (boundary !== undefined && !/\s/.test(boundary)) return null;

  const query = upToCaret.slice(slashIndex + 1);
  if (/\s/.test(query) || query.length > 50) return null;

  return { start: slashIndex, end: caret, query };
}

/** Replaces the `/query` token with `/slug ` (backend matches on this literal
 * prefix — see match_user_skill), returning the new value and caret index. */
export function applySkillToken(
  value: string,
  trigger: SkillTrigger,
  slug: string,
): { value: string; caret: number } {
  const before = value.slice(0, trigger.start);
  const after = value.slice(trigger.end);
  const inserted = `/${slug} `;
  return { value: before + inserted + after, caret: (before + inserted).length };
}

/**
 * Does `value`'s message text (as sent) start with a recognized `/slug`?
 * Mirrors the backend's match_user_skill slash-matching exactly (first
 * whitespace-delimited token after a leading "/", case-insensitive) so the
 * confirmation chip only shows when the real backend match would also fire.
 */
export function leadingSlashSlug(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('/')) return null;
  const token = trimmed.slice(1).split(/\s/)[0];
  return token ? token.toLowerCase() : null;
}
