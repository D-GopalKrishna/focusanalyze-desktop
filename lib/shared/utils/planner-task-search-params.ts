/** Serialized query params for ``GET /api/task/search/`` (planner sidebar filters). */
export function plannerFiltersToSearchParams(f: {
  datePreset: string;
  customDueFrom: string;
  customDueTo: string;
  projectIds: readonly number[];
  labelIds: readonly number[];
  assigneeIds: readonly number[];
  includeDone: boolean;
}): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.includeDone) p.include_done = 'true';
  if (f.projectIds.length) p.project = [...f.projectIds].join(',');
  if (f.labelIds.length) p.label = [...f.labelIds].join(',');
  if (f.assigneeIds.length) p.assignee = [...f.assigneeIds].join(',');
  if (f.datePreset !== 'all') {
    p.due_preset = f.datePreset;
    if (f.datePreset === 'custom') {
      if (f.customDueFrom.trim()) p.due_from = f.customDueFrom.trim();
      if (f.customDueTo.trim()) p.due_to = f.customDueTo.trim();
    }
  }
  return p;
}
