import type { FocusAIQuickAskAttachment } from '@/lib/state/focusAIQuickAskAtom';

const VALID_KINDS = new Set(['task', 'event', 'project', 'habit', 'life_area']);

/**
 * Parse @mention context chips from a user message's ``function_args.attachments``.
 */
export function contextAttachmentsFromFunctionArgs(
  functionArgs: unknown,
): FocusAIQuickAskAttachment[] {
  if (!functionArgs || typeof functionArgs !== 'object') return [];
  const raw = (functionArgs as { attachments?: unknown }).attachments;
  if (!Array.isArray(raw)) return [];

  const out: FocusAIQuickAskAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const kind = String((item as { kind?: unknown }).kind ?? '')
      .trim()
      .toLowerCase();
    if (!VALID_KINDS.has(kind)) continue;
    const idRaw = (item as { id?: unknown }).id;
    const id = typeof idRaw === 'number' ? idRaw : Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) continue;
    const label =
      String((item as { label?: unknown }).label ?? '').trim() || `${kind} #${id}`;
    out.push({
      kind: kind as FocusAIQuickAskAttachment['kind'],
      id,
      label,
    });
  }
  return out;
}

/** Most recent user-message @chips (for sticky composer hydrate on conversation load). */
export function lastUserContextAttachments(
  messages: Array<{ role?: string; function_args?: unknown }>,
): FocusAIQuickAskAttachment[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const atts = contextAttachmentsFromFunctionArgs(m.function_args);
    if (atts.length > 0) return atts;
  }
  return [];
}
