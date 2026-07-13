import {
  normalizeFocusAiStreamEvent,
  type FocusAIStreamEvent,
} from "@shared/types/dashboard/focusai-stream";

/**
 * Parse Server-Sent Events JSON frames from a fetch response body.
 */
export async function* parseSseJsonStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data: ')) continue;
        try {
          yield JSON.parse(line.slice(6)) as Record<string, unknown>;
        } catch {
          /* skip malformed frame */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Yield normalized FocusAI stream events (maps legacy status/reason to activity). */
export async function* parseFocusAiSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<FocusAIStreamEvent> {
  for await (const raw of parseSseJsonStream(body, signal)) {
    const ev = normalizeFocusAiStreamEvent(raw);
    if (ev) yield ev;
  }
}
