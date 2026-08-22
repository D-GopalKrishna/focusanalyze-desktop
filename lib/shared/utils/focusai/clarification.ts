import type { Destination, MessageMetadata } from "@shared/api-client";

export const CLARIFICATION_TOOL_NAME = 'propose_ask_clarification_tool';

export type ClarificationOption = {
  id: string;
  label: string;
  /** Secondary line (e.g. owner + access summary). */
  description?: string;
  is_readable?: boolean;
  is_editable?: boolean;
  is_deletable?: boolean;
  is_owned?: boolean;
  owner_display?: string | null;
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
  /** Code-emitted deep links (e.g. Open project settings) — not from LLM prose. */
  destinations?: Destination[];
};

export function getClarification(metadata: unknown): ClarificationMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const clar = (metadata as MessageMetadata & { clarification?: ClarificationMetadata })
    .clarification;
  if (!clar || typeof clar !== 'object') return null;
  return clar;
}

export function clarificationDestinationLabel(destination: Destination): string {
  switch (destination.kind as string) {
    case 'project_settings':
      return 'Open project settings';
    case 'project':
    case 'project_board':
      return 'Open project';
    case 'habit':
      return 'Open habit';
    case 'life_area':
      return 'Open life area';
    case 'settings':
      return destination.section
        ? `Open settings · ${String(destination.section).replace(/-/g, ' ')}`
        : 'Open settings';
    case 'capacity':
      return 'Open capacity';
    case 'report_dialog':
      return 'Open report';
    case 'plan_history':
      return 'Open plan history';
    case 'focusai_history':
      return 'Open chat history';
    case 'plan':
      return 'Open plan';
    case 'plans_hub':
      return 'Open My Plans';
    case 'journal':
      return 'Open journal';
    case 'event':
      return 'Open event';
    case 'task':
      return 'Open task';
    case 'task_comment':
      return 'Open comment';
    case 'track':
      return 'Open track';
    case 'report':
      return 'Open performance';
    case 'focusai':
      return 'Open FocusAI';
    default:
      return 'Open';
  }
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
