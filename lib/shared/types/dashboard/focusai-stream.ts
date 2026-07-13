import type { Conversation } from "@shared/api-client";
import type { PlanSuggestStreamDone } from "@shared/types/dashboard/plan-suggest-stream";

export type FocusAIActivityKind =
  | 'phase'
  | 'tool_start'
  | 'tool_done'
  | 'reason'
  | 'assistant_delta'
  | 'heartbeat'
  | 'block'
  | 'question';

export type FocusAIActivityEvent = {
  type: 'activity';
  kind: FocusAIActivityKind;
  phase?: string;
  tool?: string;
  label?: string;
  text?: string;
  ok?: boolean;
  record?: Record<string, unknown>;
  question_id?: string;
  prompt?: string;
  options?: Array<{ id: string; label: string }>;
  allow_free_text?: boolean;
  context_key?: string;
};

export type FocusAIStreamEvent =
  | FocusAIActivityEvent
  | { type: 'status'; phase: string; text: string }
  | { type: 'reason'; text: string }
  | { type: 'block'; text: string; record?: Record<string, unknown> }
  | {
      type: 'done';
      summary: string;
      actions: PlanSuggestStreamDone['actions'];
      scope?: string;
      period_start?: string;
      period_end?: string;
      conversation_uuid?: string;
    }
  | { type: 'conversation'; data: Conversation }
  | { type: 'started'; conversation_uuid: string }
  | { type: 'llm_delta'; text: string }
  | { type: 'graph_update'; payload: Record<string, unknown> }
  | { type: 'interrupt'; flow: Record<string, unknown> }
  | { type: 'complete'; intent?: string; scope?: string; content_preview?: string }
  | { type: 'error'; message: string; retryable?: boolean };

/** Map legacy status/reason SSE frames to unified activity events. */
export function normalizeFocusAiStreamEvent(
  raw: Record<string, unknown>,
): FocusAIStreamEvent | null {
  const t = raw.type as string | undefined;
  if (!t) return null;

  if (t === 'status') {
    return {
      type: 'activity',
      kind: 'phase',
      phase: String(raw.phase ?? 'thinking'),
      text: String(raw.text ?? ''),
    };
  }
  if (t === 'reason') {
    return { type: 'activity', kind: 'reason', text: String(raw.text ?? '') };
  }
  if (
    t === 'activity' ||
    t === 'block' ||
    t === 'done' ||
    t === 'conversation' ||
    t === 'error' ||
    t === 'started'
  ) {
    return raw as FocusAIStreamEvent;
  }
  if (t === 'llm_delta' || t === 'interrupt' || t === 'complete' || t === 'graph_update') {
    return raw as FocusAIStreamEvent;
  }
  return null;
}
