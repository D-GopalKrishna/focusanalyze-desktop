import type { MessageMetadata } from "@shared/api-client";

export const CLARIFICATION_TOOL_NAME = 'propose_ask_clarification_tool';

export type ClarificationOption = {
  id: string;
  label: string;
};

export type ClarificationMetadata = {
  status?: 'pending' | 'answered';
  question_id?: string | null;
  prompt?: string;
  options?: ClarificationOption[];
  allow_free_text?: boolean;
  context_key?: string | null;
  selected_option_id?: string | null;
  answer?: string | null;
};

export function getClarification(metadata: unknown): ClarificationMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const clar = (metadata as MessageMetadata & { clarification?: ClarificationMetadata })
    .clarification;
  if (!clar || typeof clar !== 'object') return null;
  return clar;
}

export function hasClarification(metadata: unknown): boolean {
  return getClarification(metadata) !== null;
}

export function isClarificationPending(metadata: unknown): boolean {
  return getClarification(metadata)?.status === 'pending';
}

export function isClarificationAnswered(metadata: unknown): boolean {
  return getClarification(metadata)?.status === 'answered';
}

/** True when HITL pending actions are only the clarifying-question tool. */
export function isClarificationOnlyHitl(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const meta = metadata as MessageMetadata & {
    hitl?: { pending_actions?: Array<{ name?: string }> };
  };
  if (getClarification(metadata)) {
    const pending = meta.hitl?.pending_actions ?? [];
    if (!pending.length) return true;
  }
  const pending = meta.hitl?.pending_actions ?? [];
  if (!pending.length) return false;
  return pending.every((action) => action.name === CLARIFICATION_TOOL_NAME);
}
