import {
  normalizeFocusAiStreamEvent,
  type FocusAIStreamEvent,
} from "@shared/types/dashboard/focusai-stream";
import { parseSseJsonStream } from "@shared/utils/focusai/parseSseStream";

/**
 * AG-UI is the **default** FocusAI stream wire format on web.
 *
 * Escape hatches (rollback only):
 * - ``NEXT_PUBLIC_FOCUSAI_AGUI=0``
 * - ``localStorage.focusai.protocol = 'legacy'``
 */
export function isFocusAiAguiEnabled(): boolean {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_FOCUSAI_AGUI === '0') {
    return false;
  }
  if (typeof window !== 'undefined') {
    try {
      const protocol = window.localStorage.getItem('focusai.protocol');
      if (protocol === 'legacy' || protocol === 'focusai') return false;
    } catch {
      /* ignore */
    }
  }
  return true;
}

/**
 * When AG-UI is default, URLs need no query param.
 * When the client opts into legacy, append ``protocol=legacy`` so the backend matches.
 */
export function appendFocusAiAguiProtocol(url: string): string {
  if (isFocusAiAguiEnabled()) return url;
  const join = url.includes('?') ? '&' : '?';
  return `${url}${join}protocol=legacy`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Map one AG-UI event into zero or more FocusAI stream events (UI model unchanged).
 */
export function aguiEventToFocusAiEvents(raw: Record<string, unknown>): FocusAIStreamEvent[] {
  const type = String(raw.type || '');

  if (type === 'RUN_STARTED') {
    const threadId = raw.threadId ?? raw.thread_id;
    if (threadId) {
      return [{ type: 'started', conversation_uuid: String(threadId) }];
    }
    return [];
  }

  if (type === 'TEXT_MESSAGE_CONTENT') {
    const delta = String(raw.delta ?? '');
    return delta ? [{ type: 'llm_delta', text: delta }] : [];
  }

  // Prefer CUSTOM focusai.activity (has human labels). Bare TOOL_CALL_* are lifecycle only.
  if (
    type === 'TOOL_CALL_START' ||
    type === 'TOOL_CALL_END' ||
    type === 'TOOL_CALL_RESULT' ||
    type === 'TOOL_CALL_ARGS'
  ) {
    return [];
  }

  if (type === 'RUN_ERROR') {
    const code = typeof raw.code === 'string' && raw.code.trim() ? raw.code.trim() : undefined;
    return [
      {
        type: 'error',
        message: String(raw.message ?? 'Request failed'),
        retryable: code === 'retryable' || Boolean(raw.retryable),
        ...(code && code !== 'retryable' ? { code } : {}),
      },
    ];
  }

  if (type === 'RUN_FINISHED' || type === 'TEXT_MESSAGE_START' || type === 'TEXT_MESSAGE_END') {
    return [];
  }

  if (type === 'CUSTOM') {
    const name = String(raw.name || '');
    const value = asRecord(raw.value) ?? {};

    if (
      name === 'focusai.activity' ||
      name === 'focusai.started' ||
      name === 'focusai.interrupt' ||
      name === 'focusai.conversation' ||
      name === 'focusai.complete' ||
      name === 'focusai.done' ||
      name === 'focusai.context_snapshot' ||
      name === 'focusai.graph_update' ||
      name === 'focusai.audio_chunk' ||
      name === 'focusai.block' ||
      name === 'focusai.raw'
    ) {
      const ev = normalizeFocusAiStreamEvent(value);
      return ev ? [ev] : [];
    }
  }

  return [];
}

/** Parse an AG-UI SSE body into the existing FocusAI stream event union. */
export async function* parseAguiStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<FocusAIStreamEvent> {
  for await (const raw of parseSseJsonStream(body, signal)) {
    for (const ev of aguiEventToFocusAiEvents(raw)) {
      yield ev;
    }
  }
}
