/** Extract the latest assistant text from a LangGraph graph_update SSE payload. */
export function extractAssistantTextFromGraphUpdate(payload: unknown): string | null {
  let latest: string | null = null;

  const walk = (obj: unknown): void => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(walk);
      return;
    }
    const rec = obj as Record<string, unknown>;
    const role = rec.role ?? rec.type;
    if (typeof role === 'string' && role.includes('AI') && !role.includes('Tool')) {
      const content = rec.content;
      if (typeof content === 'string' && content.trim()) {
        latest = content.trim();
      }
    }
    Object.values(rec).forEach(walk);
  };

  walk(payload);
  return latest;
}

/** Skip tool-result JSON accidentally streamed as assistant text. */
export function isLikelyToolResultJson(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith('{')) return false;
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    return Boolean(o && typeof o === 'object' && ('ok' in o || 'sources' in o || 'error' in o));
  } catch {
    return false;
  }
}
