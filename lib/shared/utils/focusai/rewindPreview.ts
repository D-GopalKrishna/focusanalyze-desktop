import type { DynamicMessage } from "@shared/api-client";
import { DynamicMessageRoleEnum } from "@shared/api-client";
import type { RewindPendingChange } from '@/components/dashboard/focusai/components/FocusAIRewindConfirmDialog';

const TOOL_LABELS: Record<string, string> = {
  propose_create_task_tool: 'Created task',
  propose_update_task_tool: 'Updated task',
  propose_delete_task_tool: 'Deleted task',
  propose_create_event_tool: 'Created event',
  propose_update_event_tool: 'Updated event',
  propose_delete_event_tool: 'Deleted event',
  propose_bulk_create_events_tool: 'Created events',
  propose_create_task_type_tool: 'Created task type',
  propose_plan_blocks_tool: 'Drafted plan blocks',
};

function humanToolLabel(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  const base = name
    .replace(/^propose_/, '')
    .replace(/_tool$/, '')
    .replace(/_/g, ' ');
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : name;
}

function entityHint(result: Record<string, unknown> | undefined): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const task = result.task as { name?: string; task_acronym?: string } | undefined;
  if (task?.name) return task.task_acronym ? `${task.task_acronym} · ${task.name}` : task.name;
  const event = result.event as { name?: string } | undefined;
  if (event?.name) return event.name;
  const taskType = result.task_type as { name?: string } | undefined;
  if (taskType?.name) return taskType.name;
  if (typeof result.detail === 'string' && result.detail.trim()) return result.detail;
  return undefined;
}

/**
 * Collect mutation receipts from assistant messages after an anchor index.
 * Used for rewind preview UI until POST .../rewind/?preview= exists.
 */
export function pendingChangesAfterMessage(
  messages: DynamicMessage[],
  anchorIndex: number,
): RewindPendingChange[] {
  const out: RewindPendingChange[] = [];
  for (let i = anchorIndex + 1; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== DynamicMessageRoleEnum.Focusgpt) continue;
    const results = (msg.metadata as { action_results?: unknown } | undefined)?.action_results;
    if (!Array.isArray(results)) continue;
    for (const raw of results) {
      if (!raw || typeof raw !== 'object') continue;
      const receipt = raw as {
        tool_call_id?: string;
        name?: string;
        ok?: boolean;
        result?: Record<string, unknown>;
      };
      const name = String(receipt.name || 'action');
      const id = String(receipt.tool_call_id || `${msg.id}-${name}-${out.length}`);
      const hint = entityHint(receipt.result);
      const ok = receipt.ok !== false;
      out.push({
        id,
        label: humanToolLabel(name),
        detail: hint
          ? ok
            ? hint
            : `${hint} (failed)`
          : ok
            ? undefined
            : 'Action reported failure',
        // v1 UI lists all; unsupported flag reserved for domains without history (org/journal).
        unsupported: false,
      });
    }
  }
  return out;
}

export function rewindAnchorPreview(message: DynamicMessage): string {
  const text = (message.content || '').trim();
  if (text) return text.length > 160 ? `${text.slice(0, 157)}…` : text;
  if (message.role === DynamicMessageRoleEnum.Focusgpt) return 'Assistant response';
  return 'Your message';
}
