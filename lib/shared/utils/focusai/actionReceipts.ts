/**
 * Truth helpers for `metadata.action_results` (Phase 1 — FE trust layer).
 *
 * Code owns success verbs: UI chips and HITL outcome text derive from `action_results[].ok`,
 * never from LLM text or an HTTP 200 alone. See `.claude/plan/in-progress/focusgpt-agent-shell-gaps/plan.md`
 * design principle 1.
 */
import type {
  ActionResult,
  ClientHint,
  Conversation,
  Destination,
  DynamicMessage,
  RefreshTarget,
} from "@shared/api-client";

export type ActionReceipt = ActionResult;

/** True when a receipt is a HITL reject (plan-mode handoff or Deny), not an execution failure. */
export function isUserRejectedReceipt(receipt: ActionReceipt): boolean {
  const result = (receipt.result ?? {}) as Record<string, unknown>;
  const detail = typeof result.detail === 'string' ? result.detail : '';
  if (/user rejected the tool call/i.test(detail)) return true;
  if (typeof receipt.result === 'string' && /user rejected the tool call/i.test(receipt.result)) {
    return true;
  }
  return false;
}

/** Every receipt on this message is a user reject — not a failed create. */
export function receiptsAreUserRejectsOnly(receipts: ActionReceipt[] | undefined | null): boolean {
  const list = Array.isArray(receipts) ? receipts : [];
  if (!list.length) return false;
  return list.every(isUserRejectedReceipt);
}

function clientHintOf(receipt: ActionReceipt): ClientHint | undefined {
  return receipt.client_hint ?? undefined;
}

/** `client_hint.refresh` entries across all given receipts, in order. */
export function collectRefreshHints(receipts: ActionReceipt[]): RefreshTarget[] {
  const out: RefreshTarget[] = [];
  for (const receipt of receipts) {
    const refresh = clientHintOf(receipt)?.refresh;
    if (refresh) out.push(...refresh);
  }
  return out;
}

/** First `client_hint.navigate_to` across receipts — only set server-side when unambiguous. */
export function firstNavigateToHint(receipts: ActionReceipt[]): Destination | undefined {
  for (const receipt of receipts) {
    const navigateTo = clientHintOf(receipt)?.navigate_to;
    if (navigateTo) return navigateTo;
  }
  return undefined;
}

/** `metadata.action_results` for a single message, or an empty array. */
export function actionResultsFromMessage(
  message: DynamicMessage | null | undefined,
): ActionReceipt[] {
  const results = message?.metadata?.action_results;
  return Array.isArray(results) ? results : [];
}

/** Most recent `focusgpt` message in a conversation — the one persisted right after resume. */
export function latestFocusgptMessage(
  conv: Conversation | null | undefined,
): DynamicMessage | undefined {
  const messages = (conv?.messages ?? []) as DynamicMessage[];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'focusgpt') return messages[i];
  }
  return undefined;
}

export interface ResumeOutcome {
  message?: DynamicMessage;
  /** All receipts on the resolved message. */
  receipts: ActionReceipt[];
  /** Receipts for the tool_call_ids this decision batch approved (empty ids = all receipts). */
  scopedReceipts: ActionReceipt[];
  /** True when every scoped receipt reports `ok` (or there were none to check — e.g. reject-only). */
  ok: boolean;
  /** Human-readable detail from the first failed receipt, when `ok` is false. */
  failureDetail?: string;
}

function detailFromFailedReceipt(receipt: ActionReceipt): string {
  const result = (receipt.result ?? {}) as Record<string, unknown>;
  const detail = result.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  const errors = result.errors;
  if (errors && typeof errors === 'object') {
    const first = Object.values(errors as Record<string, unknown>)[0];
    if (Array.isArray(first) && first.length) return String(first[0]);
    if (typeof first === 'string' && first) return first;
  }
  return `${receipt.name ?? 'Action'} failed.`;
}

/**
 * Derive the true outcome of a HITL resume from the returned `Conversation`.
 * `approvedToolCallIds` scopes the check to the actions this card/panel approved so an
 * unrelated failed receipt from an older turn never flips a card to "failed".
 */
export function resumeOutcomeFromConversation(
  conv: Conversation,
  approvedToolCallIds: string[],
): ResumeOutcome {
  const message = latestFocusgptMessage(conv);
  const receipts = actionResultsFromMessage(message);
  const idSet = new Set(approvedToolCallIds.filter(Boolean));
  const scopedReceipts = idSet.size
    ? receipts.filter((r) => idSet.has(String(r.tool_call_id ?? '')))
    : receipts;
  const failed = scopedReceipts.filter((r) => r.ok === false);
  const ok = failed.length === 0;
  const failureDetail = failed.length ? failed.map(detailFromFailedReceipt).join(' ') : undefined;
  return { message, receipts, scopedReceipts, ok, failureDetail };
}
