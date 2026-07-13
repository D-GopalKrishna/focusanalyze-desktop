import type { FocusAIStreamEvent } from "@shared/types/dashboard/focusai-stream";

export type PlanSuggestStreamPhase = 'exploring' | 'thinking' | 'planning' | 'editing';

export type PlanSuggestStreamEntry =
  | { kind: 'status'; phase: PlanSuggestStreamPhase; text: string }
  | { kind: 'reason'; text: string }
  | { kind: 'block'; text: string }
  | { kind: 'summary'; text: string }
  | { kind: 'tool'; tool: string; label: string; status: 'running' | 'done' }
  | { kind: 'heartbeat'; text: string }
  | { kind: 'assistant_delta'; text: string }
  | {
      kind: 'question';
      prompt: string;
      text: string;
      options?: Array<{ id: string; label: string }>;
    };

export type PlanSuggestStreamDone = {
  summary: string;
  actions: Array<{ tool_call_id: string; name: string; arguments: Record<string, unknown> }>;
  scope: string;
  period_start: string;
  period_end: string;
  conversation_uuid?: string;
};

export type PlanSuggestStreamEvent =
  | { type: 'status'; phase: PlanSuggestStreamPhase; text: string }
  | { type: 'reason'; text: string }
  | { type: 'block'; text: string; record?: Record<string, unknown> }
  // `done` is legacy: planning_suggest now runs the shared agent stream and surfaces draft
  // blocks via the standard `interrupt`/`pending_actions` frame. Kept for backward compatibility
  // (ignored gracefully if an older backend still emits it).
  | {
      type: 'done';
      summary: string;
      actions: PlanSuggestStreamDone['actions'];
      scope: string;
      period_start: string;
      period_end: string;
      conversation_uuid?: string;
    }
  | { type: 'error'; message: string; retryable?: boolean }
  | Extract<FocusAIStreamEvent, { type: 'activity' }>;

const PHASES = new Set<PlanSuggestStreamPhase>(['exploring', 'thinking', 'planning', 'editing']);

function asPhase(value: string | undefined): PlanSuggestStreamPhase {
  if (value && PHASES.has(value as PlanSuggestStreamPhase)) {
    return value as PlanSuggestStreamPhase;
  }
  return 'thinking';
}

export function streamEventToEntry(
  ev: PlanSuggestStreamEvent | FocusAIStreamEvent,
): PlanSuggestStreamEntry | null {
  // Legacy frames duplicate canonical `activity` events from planning_stream.py.
  if (ev.type === 'status' || ev.type === 'reason' || ev.type === 'block') return null;

  if (ev.type === 'done') return { kind: 'summary', text: ev.summary };

  if (ev.type === 'activity') {
    if (ev.kind === 'phase') {
      return { kind: 'status', phase: asPhase(ev.phase), text: ev.text ?? '' };
    }
    if (ev.kind === 'reason') return { kind: 'reason', text: ev.text ?? '' };
    if (ev.kind === 'block') return { kind: 'block', text: ev.text ?? '' };
    if (ev.kind === 'tool_start') {
      return {
        kind: 'tool',
        tool: ev.tool ?? 'tool',
        label: ev.label ?? ev.tool ?? 'Working…',
        status: 'running',
      };
    }
    if (ev.kind === 'tool_done') {
      return {
        kind: 'tool',
        tool: ev.tool ?? 'tool',
        label: ev.label ?? ev.tool ?? 'Done',
        status: 'done',
      };
    }
    if (ev.kind === 'heartbeat') return { kind: 'heartbeat', text: ev.text ?? 'Still working…' };
    if (ev.kind === 'assistant_delta') return { kind: 'assistant_delta', text: ev.text ?? '' };
    if (ev.kind === 'question') {
      return {
        kind: 'question',
        prompt: ev.prompt ?? '',
        text: ev.text ?? 'Waiting for your answer…',
        options: ev.options,
      };
    }
  }
  return null;
}

/** Merge tool_start/tool_done pairs into a single running→done row when possible. */
export function appendStreamEntry(
  prev: PlanSuggestStreamEntry[],
  entry: PlanSuggestStreamEntry,
): PlanSuggestStreamEntry[] {
  if (entry.kind === 'tool' && entry.status === 'done') {
    for (let i = prev.length - 1; i >= 0; i--) {
      const row = prev[i];
      if (row.kind === 'tool' && row.tool === entry.tool && row.status === 'running') {
        const next = [...prev];
        next[i] = { ...row, status: 'done' };
        return next;
      }
    }
  }
  if (entry.kind === 'assistant_delta') {
    const last = prev[prev.length - 1];
    if (last?.kind === 'assistant_delta') {
      return [...prev.slice(0, -1), { kind: 'assistant_delta', text: last.text + entry.text }];
    }
  }
  return [...prev, entry];
}

export const PLAN_SUGGEST_PHASE_LABEL: Record<PlanSuggestStreamPhase, string> = {
  exploring: 'Exploring',
  thinking: 'Thinking',
  planning: 'Planning',
  editing: 'Editing',
};

/** Latest phase from streamed activity entries (defaults to thinking while running). */
export function activePhaseFromStreamEntries(
  entries: PlanSuggestStreamEntry[],
): PlanSuggestStreamPhase {
  for (let i = entries.length - 1; i >= 0; i--) {
    const row = entries[i];
    if (row.kind === 'status') return row.phase;
  }
  return 'thinking';
}
