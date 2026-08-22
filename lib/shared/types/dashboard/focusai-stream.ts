import type { Conversation } from "@shared/api-client";
import type { PlanSuggestStreamDone } from "@shared/types/dashboard/plan-suggest-stream";

export type FocusAIContextSnapshot = {
  tool_scope: string;
  tool_names: string[];
  tool_count: number;
  /** Estimated tool-schema size for the bound pack (shown under the Tools section). */
  schema_tokens_est?: number;
  surface?: string | null;
  /** @entity attachments + uploaded prompt files (image/document chips). */
  attachments: Array<{ kind?: string; id?: string | number; label?: string }>;
  /** Uploaded images / docs for this turn (names only). */
  prompt_files?: Array<{ kind?: string; label?: string }>;
  document_tokens_est?: number;
  memories_injected: number;
  prompt_sections: Array<{
    id: string;
    source?: string;
    count?: number;
    /** e.g. the matched skill's name for a "user_skill" section. */
    label?: string;
  }>;
  history: {
    mode: string;
    replayed_messages: number;
    max_replayed: number;
    trimmed: boolean;
  };
  /** Exact provider usage for this turn (filled after the model finishes). */
  credits?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    source?: string;
    /** Linked ``AICreditsLog.id`` when usage was registered. */
    ai_credits_log_id?: number;
    /** Anthropic prompt-cache breakpoint hit/miss for this turn (absent for providers/turns
     * with no cache activity — e.g. OpenAI, or the first turn writing a fresh cache entry). */
    cache_read_tokens?: number;
    cache_creation_tokens?: number;
  } | null;
  /** Cumulative usage across this whole conversation (all AICreditsLog rows), not just this turn. */
  session?: {
    total_tokens: number;
    total_cost_usd: number;
    turn_count: number;
  } | null;
};

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
  | ({ type: 'context_snapshot' } & FocusAIContextSnapshot)
  | { type: 'llm_delta'; text: string }
  | { type: 'graph_update'; payload: Record<string, unknown> }
  | { type: 'interrupt'; flow: Record<string, unknown> }
  | { type: 'complete'; intent?: string; scope?: string; content_preview?: string }
  | { type: 'error'; message: string; retryable?: boolean; code?: string };

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
    t === 'started' ||
    t === 'context_snapshot'
  ) {
    return raw as FocusAIStreamEvent;
  }
  if (t === 'llm_delta' || t === 'interrupt' || t === 'complete' || t === 'graph_update') {
    return raw as FocusAIStreamEvent;
  }
  return null;
}
