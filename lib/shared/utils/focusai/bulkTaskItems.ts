/**
 * Per-item breakdown for bulk task propose tools (create/update/delete) and for
 * nested `subtasks[]` on a single create (same Accept/Reject-per-row UX).
 *
 * Each item renders as its own mini action card with its own Accept/Reject.
 * `editedArgsForSelection` builds the filtered args to send back as `edited_action`
 * when the user deselects some items before approving.
 */

import { extractSubtaskPreviews } from "@shared/utils/focusai/hitlTaskProposal";

const BULK_CREATE_TOOL = 'propose_bulk_create_tasks_tool';
const BULK_UPDATE_TOOL = 'propose_bulk_update_tasks_tool';
const BULK_DELETE_TOOL = 'propose_bulk_delete_tasks_tool';
const SINGLE_CREATE_TOOL = 'propose_create_task_tool';

export const BULK_TASK_TOOL_NAMES = new Set([BULK_CREATE_TOOL, BULK_UPDATE_TOOL, BULK_DELETE_TOOL]);

export interface BulkTaskItem {
  /** Stable key for this item within the action — used for selection state and React keys. */
  key: string;
  name: string;
  action: 'create' | 'update' | 'delete';
  /** Nested child under a new parent on propose_create_task_tool. */
  nestedSubtask?: boolean;
  /** When create under an existing parent — show as Create Subtask. */
  parentId?: string;
  /** Resolved status column name — create only, shared across the whole batch. */
  status?: string;
  /** Formatted estimate, or "No estimation" — create only. */
  estimate?: string;
  dueDate?: string;
  /** Patch field names being changed — update only. */
  changedFields?: string[];
}

function labelById(taskLabels: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(taskLabels)) return map;
  for (const row of taskLabels) {
    if (row && typeof row === 'object' && 'id' in row) {
      const id = String((row as Record<string, unknown>).id);
      const name = (row as Record<string, unknown>).name;
      if (typeof name === 'string' && name) map.set(id, name);
    }
  }
  return map;
}

/** Resolved status column name shared by the whole batch, from `_resolved_fields`. */
function resolvedStatusLabel(args: Record<string, any>): string | undefined {
  const resolved = args._resolved_fields;
  if (!Array.isArray(resolved)) return undefined;
  const row = resolved.find((r) => r && r.field === 'status_id');
  return row?.label || undefined;
}

function formatEstimate(estimate: unknown): string {
  if (estimate === null || estimate === undefined || estimate === '') return 'No estimation';
  const n = Number(estimate);
  if (!Number.isFinite(n) || n <= 0) return 'No estimation';
  return `${n}h`;
}

/** Selectable per-item rows for a bulk / nested-subtask action, or null when this isn't one. */
export function bulkTaskItemsForAction(
  name: string,
  args: Record<string, any> | null | undefined,
): BulkTaskItem[] | null {
  const a = args ?? {};

  if (name === SINGLE_CREATE_TOOL) {
    const subtasks = extractSubtaskPreviews(a.subtasks);
    if (!subtasks.length) return null;
    return subtasks.map((s, i) => ({
      key: String(i),
      name: s.name,
      action: 'create' as const,
      nestedSubtask: true,
    }));
  }

  if (name === BULK_CREATE_TOOL) {
    const records: Array<Record<string, any>> = Array.isArray(a.records) ? a.records : [];
    const status = resolvedStatusLabel(a);
    return records.map((r, i) => {
      const parent =
        r?.parent !== undefined && r?.parent !== null && r?.parent !== ''
          ? String(r.parent)
          : undefined;
      return {
        key: String(i),
        name: r?.name || `Task ${i + 1}`,
        action: 'create' as const,
        parentId: parent,
        status,
        estimate: formatEstimate(r?.estimate),
        dueDate: r?.due_date || undefined,
      };
    });
  }

  if (name === BULK_UPDATE_TOOL) {
    const records: Array<Record<string, any>> = Array.isArray(a.records) ? a.records : [];
    const byId = labelById(a.task_labels);
    return records.map((r, i) => {
      const id = r?.id;
      const changedFields = Object.keys(r ?? {}).filter((k) => k !== 'id');
      return {
        key: String(id ?? i),
        name: byId.get(String(id)) ?? `Task #${id}`,
        action: 'update' as const,
        changedFields,
      };
    });
  }

  if (name === BULK_DELETE_TOOL) {
    const ids: Array<string | number> = Array.isArray(a.task_ids) ? a.task_ids : [];
    const byId = labelById(a.task_labels);
    return ids.map((id) => ({
      key: String(id),
      name: byId.get(String(id)) ?? `Task #${id}`,
      action: 'delete' as const,
    }));
  }

  return null;
}

/**
 * Filtered `arguments` for `edited_action` when the user approved only a subset of items.
 * Returns `null` when every item is selected (no edit needed — send a plain `approve`).
 */
export function editedArgsForSelection(
  name: string,
  args: Record<string, any> | null | undefined,
  selectedKeys: Set<string>,
): Record<string, any> | null {
  const a = args ?? {};

  if (name === SINGLE_CREATE_TOOL) {
    const subtasks = extractSubtaskPreviews(a.subtasks);
    if (!subtasks.length) return null;
    if (selectedKeys.size >= subtasks.length) return null;
    const filtered = subtasks
      .filter((_, i) => selectedKeys.has(String(i)))
      .map((s) =>
        s.description ? { name: s.name, description: s.description } : { name: s.name },
      );
    return { ...a, subtasks: filtered };
  }

  if (name === BULK_CREATE_TOOL) {
    const records: Array<Record<string, any>> = Array.isArray(a.records) ? a.records : [];
    if (selectedKeys.size >= records.length) return null;
    return { ...a, records: records.filter((_, i) => selectedKeys.has(String(i))) };
  }

  if (name === BULK_UPDATE_TOOL) {
    const records: Array<Record<string, any>> = Array.isArray(a.records) ? a.records : [];
    if (selectedKeys.size >= records.length) return null;
    const filtered = records.filter((r, i) => selectedKeys.has(String(r?.id ?? i)));
    return {
      ...a,
      records: filtered,
      task_labels: Array.isArray(a.task_labels)
        ? a.task_labels.filter((row: any) => selectedKeys.has(String(row?.id)))
        : a.task_labels,
    };
  }

  if (name === BULK_DELETE_TOOL) {
    const ids: Array<string | number> = Array.isArray(a.task_ids) ? a.task_ids : [];
    if (selectedKeys.size >= ids.length) return null;
    const filtered = ids.filter((id) => selectedKeys.has(String(id)));
    return {
      ...a,
      task_ids: filtered,
      task_labels: Array.isArray(a.task_labels)
        ? a.task_labels.filter((row: any) => selectedKeys.has(String(row?.id)))
        : a.task_labels,
    };
  }

  return null;
}
