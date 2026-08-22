import type {
  FocusAIContextSnapshot,
  FocusAIStreamEvent,
} from "@shared/types/dashboard/focusai-stream";
import type {
  PlanSuggestStreamEntry,
  PlanSuggestStreamEvent,
  PlanSuggestStreamPhase,
} from "@shared/types/dashboard/plan-suggest-stream";
import {
  activePhaseFromStreamEntries,
  appendStreamEntry,
  streamEventToEntry,
} from "@shared/types/dashboard/plan-suggest-stream";
import type { FocusAIStreamAtomValue } from '@/lib/state/focusAIStreamAtom';
import { planSuggestEntryText } from "@shared/utils/plan-suggest-entry-text";

export function newStreamSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function beginStreamState(
  prev: FocusAIStreamAtomValue,
  title: string,
  sessionId: string = newStreamSessionId(),
): FocusAIStreamAtomValue {
  return {
    sessionId,
    title,
    isRunning: true,
    entries: [],
    activePhase: 'thinking',
    // Keep prior snapshot until the new turn's context_snapshot arrives.
    contextSnapshot: prev.contextSnapshot,
  };
}

export function endStreamState(prev: FocusAIStreamAtomValue): FocusAIStreamAtomValue {
  return {
    ...prev,
    isRunning: false,
    activePhase: null,
  };
}

export function applyStreamEvent(
  entries: PlanSuggestStreamEntry[],
  ev: FocusAIStreamEvent | PlanSuggestStreamEvent,
): PlanSuggestStreamEntry[] {
  if (ev.type !== 'activity') return entries;
  if (ev.kind === 'assistant_delta') return entries;
  const entry = streamEventToEntry(ev);
  return entry ? appendStreamEntry(entries, entry) : entries;
}

function snapshotFromEvent(
  ev: FocusAIStreamEvent | PlanSuggestStreamEvent,
): FocusAIContextSnapshot | null {
  if (ev.type !== 'context_snapshot') return null;
  const { type: _t, ...rest } = ev;
  return rest as FocusAIContextSnapshot;
}

/** Events the chat consume-loop must forward into ``streamStateAfterEvent``. */
const STREAM_ATOM_EVENT_TYPES = new Set([
  'activity',
  'llm_delta',
  'graph_update',
  'complete',
  'context_snapshot',
]);

export function appliesToFocusAiStreamAtom(ev: { type: string }): boolean {
  return STREAM_ATOM_EVENT_TYPES.has(ev.type);
}

export function streamStateAfterEvent(
  prev: FocusAIStreamAtomValue,
  ev: FocusAIStreamEvent | PlanSuggestStreamEvent,
): FocusAIStreamAtomValue {
  const snapshot = snapshotFromEvent(ev);
  if (snapshot) {
    return { ...prev, contextSnapshot: snapshot };
  }
  const entries = applyStreamEvent(prev.entries, ev);
  return {
    ...prev,
    entries,
    activePhase:
      ev.type === 'activity' && ev.kind === 'phase'
        ? ((ev.phase as PlanSuggestStreamPhase) ?? prev.activePhase)
        : activePhaseFromStreamEntries(entries),
  };
}

/** Latest user-visible status line (for minimized pill). */
export function latestStreamStatusLine(state: FocusAIStreamAtomValue): string {
  const latest = [...state.entries].reverse().find((e) => e.kind !== 'assistant_delta');
  if (latest) return planSuggestEntryText(latest);
  if (state.activePhase) {
    const labels: Record<PlanSuggestStreamPhase, string> = {
      exploring: 'Exploring',
      thinking: 'Thinking',
      planning: 'Planning',
      editing: 'Editing',
    };
    return `${labels[state.activePhase]}…`;
  }
  return state.isRunning ? 'Working…' : 'FocusAI';
}

/** Latest assistant ``metadata.context_snapshot`` (reopen / history / after HITL). */
export function latestContextSnapshotFromMessages(
  messages: Array<{ role?: string; metadata?: unknown }>,
): FocusAIContextSnapshot | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (String(m.role || '').toLowerCase() !== 'focusgpt') continue;
    const snap = contextSnapshotFromMessageMetadata(
      m.metadata as Record<string, unknown> | null | undefined,
    );
    if (snap) return snap;
  }
  return null;
}

/** Pull ContextSnapshot from assistant message metadata (reopen / history). */
export function contextSnapshotFromMessageMetadata(
  metadata: Record<string, unknown> | null | undefined,
): FocusAIContextSnapshot | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = metadata.context_snapshot;
  if (!raw || typeof raw !== 'object') return null;
  const snap = raw as Partial<FocusAIContextSnapshot>;
  if (typeof snap.tool_scope !== 'string') return null;
  return {
    tool_scope: snap.tool_scope,
    tool_names: Array.isArray(snap.tool_names) ? snap.tool_names.map(String) : [],
    tool_count: typeof snap.tool_count === 'number' ? snap.tool_count : 0,
    schema_tokens_est: typeof snap.schema_tokens_est === 'number' ? snap.schema_tokens_est : undefined,
    surface: snap.surface ?? null,
    attachments: Array.isArray(snap.attachments) ? snap.attachments : [],
    prompt_files: Array.isArray(snap.prompt_files) ? snap.prompt_files : undefined,
    document_tokens_est:
      typeof snap.document_tokens_est === 'number' ? snap.document_tokens_est : undefined,
    memories_injected: typeof snap.memories_injected === 'number' ? snap.memories_injected : 0,
    prompt_sections: Array.isArray(snap.prompt_sections) ? snap.prompt_sections : [],
    history: {
      mode: snap.history?.mode ?? 'unknown',
      replayed_messages: snap.history?.replayed_messages ?? 0,
      max_replayed: snap.history?.max_replayed ?? 40,
      trimmed: Boolean(snap.history?.trimmed),
    },
    credits:
      snap.credits && typeof snap.credits === 'object' && typeof snap.credits.total_tokens === 'number'
        ? {
            prompt_tokens: Number(snap.credits.prompt_tokens) || 0,
            completion_tokens: Number(snap.credits.completion_tokens) || 0,
            total_tokens: Number(snap.credits.total_tokens) || 0,
            source: snap.credits.source,
            ai_credits_log_id:
              typeof snap.credits.ai_credits_log_id === 'number'
                ? snap.credits.ai_credits_log_id
                : undefined,
          }
        : null,
  };
}
