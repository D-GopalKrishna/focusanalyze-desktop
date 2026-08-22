/** Soft runtime hint: where the user opened Focus AI (not a permission scope). */
export type FocusAISurface =
  | 'global'
  | 'calendar'
  | 'project'
  | 'planner'
  | 'journal'
  | 'performance'
  | 'task_detail';

export type FocusAISurfaceHint = {
  surface: FocusAISurface;
  project_id?: number;
  task_id?: number;
  event_id?: number;
  calendar_date?: string;
  calendar_range_start?: string;
  calendar_range_end?: string;
};

/** Label for thinking pill — only when surface is non-generic. */
export function focusAISurfaceThinkingLabel(
  hint: FocusAISurfaceHint | null | undefined,
): string | undefined {
  if (!hint?.surface || hint.surface === 'global') return undefined;
  switch (hint.surface) {
    case 'calendar':
      return 'Calendar';
    case 'project':
      return 'Project';
    case 'task_detail':
      return 'Task';
    case 'planner':
      return 'Planning';
    case 'journal':
      return 'Journal';
    case 'performance':
      return 'Performance';
    default:
      return undefined;
  }
}
