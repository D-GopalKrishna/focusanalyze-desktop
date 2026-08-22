import { SEARCHABLE_SETTINGS_ENTRIES, SettingsEntry } from '@/lib/config/settings-registry';

/** Below this length almost everything matches, which is just noise. */
const MIN_QUERY_LENGTH = 2;

/** Keep the settings block from crowding out entity results. */
const DEFAULT_LIMIT = 3;

/**
 * Lower is better. Ordering intent: an exact-ish label hit beats an alias hit, which
 * beats merely landing in the right group.
 */
const enum MatchRank {
  LabelPrefix = 0,
  LabelSubstring = 1,
  KeywordPrefix = 2,
  KeywordSubstring = 3,
  GroupSubstring = 4,
}

function rankEntry(entry: SettingsEntry, query: string): MatchRank | null {
  const label = entry.label.toLowerCase();
  if (label.startsWith(query)) return MatchRank.LabelPrefix;
  if (label.includes(query)) return MatchRank.LabelSubstring;

  let bestKeyword: MatchRank | null = null;
  for (const keyword of entry.keywords ?? []) {
    if (keyword.startsWith(query)) return MatchRank.KeywordPrefix;
    if (keyword.includes(query)) bestKeyword = MatchRank.KeywordSubstring;
  }
  if (bestKeyword !== null) return bestKeyword;

  if (entry.group.toLowerCase().includes(query)) return MatchRank.GroupSubstring;
  return null;
}

/**
 * Matches settings sections entirely client-side against the static registry — no network,
 * no backend involvement, and no effect on the ranking of server-side global search results
 * (these are rendered as their own section rather than merged into one ranked list).
 */
export function matchSettingsEntries(rawQuery: string, limit = DEFAULT_LIMIT): SettingsEntry[] {
  const query = rawQuery.trim().toLowerCase();
  if (query.length < MIN_QUERY_LENGTH) return [];

  const ranked: { entry: SettingsEntry; rank: MatchRank }[] = [];
  for (const entry of SEARCHABLE_SETTINGS_ENTRIES) {
    const rank = rankEntry(entry, query);
    if (rank !== null) ranked.push({ entry, rank });
  }

  return ranked
    .sort((a, b) => a.rank - b.rank || a.entry.label.localeCompare(b.entry.label))
    .slice(0, limit)
    .map(({ entry }) => entry);
}
