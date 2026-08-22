/**
 * Classify single-task create proposals for HITL preview.
 *
 * Three shapes come from `propose_create_task_tool`:
 * - plain create (name only)
 * - parent + nested `subtasks[]` (one tool call)
 * - child under existing `parent=` (create subtask only)
 */

export type HitlTaskCreateMode =
  | 'create_task'
  | 'create_task_with_subtasks'
  | 'create_subtask';

export type HitlSubtaskPreview = {
  name: string;
  description?: string;
};

export type HitlTaskCreateProposal = {
  mode: HitlTaskCreateMode;
  /** Parent task name being created, or the subtask name when mode is create_subtask. */
  name: string;
  subtasks: HitlSubtaskPreview[];
  /** Existing parent when creating a lone subtask. */
  parentId?: number | string;
  parentLabel?: string;
};

function resolvedLabel(
  args: Record<string, unknown>,
  field: string,
): { label?: string; entityId?: number | string } {
  const resolved = args._resolved_fields;
  if (!Array.isArray(resolved)) return {};
  const row = resolved.find(
    (r) => r && typeof r === 'object' && (r as Record<string, unknown>).field === field,
  ) as Record<string, unknown> | undefined;
  if (!row) return {};
  return {
    label: typeof row.label === 'string' && row.label.trim() ? row.label.trim() : undefined,
    entityId: (row.entity_id as number | string | undefined) ?? undefined,
  };
}

export function extractSubtaskPreviews(raw: unknown): HitlSubtaskPreview[] {
  if (!Array.isArray(raw)) return [];
  const out: HitlSubtaskPreview[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const name = (item as Record<string, unknown>).name;
    if (typeof name !== 'string' || !name.trim()) continue;
    const description = (item as Record<string, unknown>).description;
    out.push({
      name: name.trim(),
      ...(typeof description === 'string' && description.trim()
        ? { description: description.trim() }
        : {}),
    });
  }
  return out;
}

/** True for the single-task create propose tool (not bulk / update / delete / comment). */
export function isSingleCreateTaskTool(toolName: string): boolean {
  return toolName === 'propose_create_task_tool';
}

export function parseHitlTaskCreateProposal(
  toolName: string,
  args: Record<string, unknown> | null | undefined,
): HitlTaskCreateProposal | null {
  if (!isSingleCreateTaskTool(toolName)) return null;
  const a = args ?? {};
  const name = typeof a.name === 'string' && a.name.trim() ? a.name.trim() : 'Untitled task';
  const subtasks = extractSubtaskPreviews(a.subtasks);
  const parentRaw = a.parent;
  const hasParent = parentRaw !== undefined && parentRaw !== null && parentRaw !== '';

  if (subtasks.length > 0) {
    return { mode: 'create_task_with_subtasks', name, subtasks };
  }
  if (hasParent) {
    const parentMeta = resolvedLabel(a, 'parent');
    return {
      mode: 'create_subtask',
      name,
      subtasks: [],
      parentId: parentMeta.entityId ?? (parentRaw as number | string),
      parentLabel: parentMeta.label,
    };
  }
  return { mode: 'create_task', name, subtasks: [] };
}

export function hitlTaskCreateTitle(proposal: HitlTaskCreateProposal): {
  label: string;
  badge?: string;
} {
  if (proposal.mode === 'create_subtask') {
    return { label: 'Create Subtask' };
  }
  if (proposal.mode === 'create_task_with_subtasks') {
    const n = proposal.subtasks.length;
    return {
      label: 'Create Task',
      badge: `${n} subtask${n === 1 ? '' : 's'}`,
    };
  }
  return { label: 'Create Task' };
}

/** Parent id on a bulk create record, if any. */
export function bulkRecordParentId(record: Record<string, unknown> | null | undefined): string | null {
  const parent = record?.parent;
  if (parent === undefined || parent === null || parent === '') return null;
  return String(parent);
}
