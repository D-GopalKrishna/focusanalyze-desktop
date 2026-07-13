/** Present on calendar/project history API payloads; pending OpenAPI client regen. */
export function historyEntryIsAi(entry: object): boolean {
  const source = (entry as { actor_source?: string }).actor_source;
  return source === 'ai';
}
