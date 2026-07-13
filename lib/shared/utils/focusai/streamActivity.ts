import type { FocusAIStreamEvent } from "@shared/types/dashboard/focusai-stream";
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

export function streamStateAfterEvent(
  prev: FocusAIStreamAtomValue,
  ev: FocusAIStreamEvent | PlanSuggestStreamEvent,
): FocusAIStreamAtomValue {
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
