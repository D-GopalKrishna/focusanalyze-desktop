/**
 * Shared "display name" business rule for any person-like object (task
 * assignee, org member, team member, comment author, mention candidate,
 * etc): prefer the full name (first_name + last_name), then username, then
 * email, then a caller-supplied fallback string.
 *
 * This consolidates ~15+ independent reimplementations of this exact rule
 * across the codebase that had drifted slightly (some skipped the email
 * fallback, some used a different final fallback literal). The fallback
 * *order* (name -> username -> email -> fallback) is the one shared by the
 * overwhelming majority of call sites; only the final fallback literal
 * varies by context (e.g. "Unknown", "User", the assignee's id, or "") so
 * it's the one thing left as a parameter rather than baked in.
 *
 * A few call sites use a genuinely different order (e.g. username before
 * full name) or a different field set — those were deliberately left as-is
 * rather than forced through this helper. See the design-cleanup notes for
 * this consolidation for the specific list.
 */
export type DisplayNamePerson = {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
};

export function getDisplayName(person: DisplayNamePerson, fallback = 'Unknown'): string {
  const fullName = [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
  return fullName || person.username?.trim() || person.email?.trim() || fallback;
}

/**
 * Single-character initial for an avatar fallback badge, following the same
 * first_name -> username -> email preference order as getDisplayName. Note
 * this returns a single initial (not first+last initials) — that matches
 * the majority of existing avatar-initial call sites; a couple of call
 * sites that derive two-letter initials (first + last initial) use genuinely
 * different, deliberately-not-migrated logic.
 */
export type InitialsPerson = {
  first_name?: string | null;
  username?: string | null;
  email?: string | null;
};

export function getInitials(person: InitialsPerson, fallback = '?'): string {
  const source = person.first_name?.trim() || person.username?.trim() || person.email?.trim();
  return (source ? source.slice(0, 1) : fallback).toUpperCase();
}
