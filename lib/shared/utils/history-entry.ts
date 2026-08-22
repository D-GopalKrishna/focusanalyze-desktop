/** Present on calendar/project history API payloads; pending OpenAPI client regen. */
type HistoryEntryActorSource = { actor_source?: string };

/** True for a FocusAI agent tool call (not a plain user edit, not an MCP client). */
export function historyEntryIsAi(entry: object): boolean {
  const source = (entry as HistoryEntryActorSource).actor_source;
  return source === 'ai_agent' || source === 'ai'; // 'ai' = legacy value, pre-rename
}

/** True for a write made by an external MCP client (e.g. Claude Code/Desktop). */
export function historyEntryIsMcp(entry: object): boolean {
  const source = (entry as HistoryEntryActorSource).actor_source;
  return source === 'mcp';
}
