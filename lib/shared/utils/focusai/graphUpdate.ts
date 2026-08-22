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

const CODE_FENCE_RE = /^```(?:json)?\s*([\s\S]*?)\s*```\s*$/i;

function stripCodeFence(text: string): string {
  const raw = text.trim();
  if (!raw) return '';
  const full = CODE_FENCE_RE.exec(raw);
  if (full?.[1]) return full[1].trim();
  const embedded = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(raw);
  if (embedded?.[1]?.trim().match(/^[{[]/)) return embedded[1].trim();
  return raw;
}

function tryParseJson(text: string): unknown | null {
  const candidate = stripCodeFence(text);
  if (!candidate || (!candidate.startsWith('{') && !candidate.startsWith('['))) return null;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

function unwrapNestedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const content = payload.content;
  if (typeof content === 'string' && /^[{[]/.test(content.trim())) {
    const nested = tryParseJson(content);
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
  }
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }
  return payload;
}

function looksLikeToolDict(o: Record<string, unknown>): boolean {
  const unwrapped = unwrapNestedPayload(o);
  if (
    'ok' in unwrapped ||
    'sources' in unwrapped ||
    'error' in unwrapped ||
    'context_key' in unwrapped ||
    'options' in unwrapped ||
    'pending_actions' in unwrapped ||
    'tool_call_id' in unwrapped ||
    'action_results' in unwrapped ||
    'deferred_message_attachment_ids' in unwrapped
  ) {
    return true;
  }
  if (unwrapped.status === 'needs_clarification' || unwrapped.status === 'awaiting_answer') {
    return true;
  }
  if (
    o.type === 'tool' ||
    o.type === 'activity' ||
    o.type === 'error' ||
    o.type === 'interrupt' ||
    unwrapped.type === 'tool' ||
    unwrapped.type === 'activity' ||
    unwrapped.type === 'error' ||
    unwrapped.type === 'interrupt'
  ) {
    return true;
  }
  if (typeof o.name === 'string' && ('content' in o || 'args' in o)) return true;
  return false;
}

function arrayLooksLikeToolPayload(arr: unknown[]): boolean {
  return arr.some(
    (it) => it && typeof it === 'object' && !Array.isArray(it) && 'tool_call_id' in (it as object),
  );
}

/**
 * True when streamed/persisted assistant text is tool/clarification JSON that must
 * never appear raw in the chat bubble.
 */
export function isLikelyToolResultJson(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  // Prefer structured parse when it looks like JSON (or a fenced block).
  if (t.startsWith('{') || t.startsWith('[') || t.startsWith('```')) {
    const parsed = tryParseJson(t);
    if (parsed != null) {
      if (Array.isArray(parsed)) {
        // Only suppress arrays that look like tool payloads — not legit list replies.
        return arrayLooksLikeToolPayload(parsed);
      }
      if (typeof parsed === 'object') {
        return looksLikeToolDict(parsed as Record<string, unknown>);
      }
      return false;
    }
  }

  // Parse failed / partial stream / compact JSON — whitespace-tolerant heuristics.
  return (
    /"needs_clarification"/.test(t) ||
    /"awaiting_answer"/.test(t) ||
    /"type"\s*:\s*"tool"/.test(t) ||
    /"type"\s*:\s*"activity"/.test(t) ||
    /"type"\s*:\s*"interrupt"/.test(t) ||
    /"tool_call_id"\s*:/.test(t) ||
    /"pending_actions"\s*:/.test(t) ||
    /"context_key"\s*:/.test(t)
  );
}

function speakClarification(payload: Record<string, unknown>): string {
  const question = String(
    payload.question ?? payload.message ?? payload.detail ?? '',
  ).trim();
  const options = Array.isArray(payload.options) ? payload.options : [];
  const labels: string[] = [];
  for (const opt of options) {
    if (opt && typeof opt === 'object') {
      const label = String(
        (opt as Record<string, unknown>).label ??
          (opt as Record<string, unknown>).name ??
          (opt as Record<string, unknown>).id ??
          '',
      ).trim();
      if (label) labels.push(label);
    } else if (typeof opt === 'string' && opt.trim()) {
      labels.push(opt.trim());
    }
  }
  if (question && labels.length) {
    if (labels.length === 1) return `${question} Options: ${labels[0]}.`;
    const head = labels.slice(0, -1).join(', ');
    return `${question} Options: ${head}, or ${labels[labels.length - 1]}.`;
  }
  if (question) return question;
  if (labels.length) return `Which option should I use: ${labels.join(', ')}?`;
  return 'I need a quick clarification from you in the chat.';
}

/**
 * Human-readable assistant text for the chat bubble.
 * Tool/clarification JSON is never returned as braces — prefer question/message, else null.
 */
export function displayableAssistantText(
  text: string | null | undefined,
  options?: { fallback?: string | null },
): string | null {
  const fallback = options?.fallback ?? null;
  const raw = (text ?? '').trim();
  if (!raw) return fallback;

  if (!isLikelyToolResultJson(raw) && !raw.startsWith('{') && !raw.startsWith('[')) {
    return raw;
  }

  const parsed = tryParseJson(raw);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const payload = unwrapNestedPayload(parsed as Record<string, unknown>);
    const status = String(payload.status ?? '').toLowerCase();
    if (
      status === 'needs_clarification' ||
      status === 'awaiting_answer' ||
      (payload.ok === false && (payload.options || payload.question))
    ) {
      return speakClarification(payload);
    }
    const detail = String(payload.message ?? payload.detail ?? payload.question ?? '').trim();
    if (detail && looksLikeToolDict(parsed as Record<string, unknown>)) {
      return detail;
    }
    if (looksLikeToolDict(parsed as Record<string, unknown>)) {
      return fallback;
    }
    // Parsed object that isn't tool-shaped — allow (rare structured reply).
    return raw;
  }

  if (isLikelyToolResultJson(raw)) {
    return fallback;
  }
  return raw;
}
