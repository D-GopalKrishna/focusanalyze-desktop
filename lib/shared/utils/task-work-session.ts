/** Minimal event shape for detecting an open focus session on a task. */
export type TaskWorkSessionEvent = {
  id: number;
  name?: string | null;
  start_datetime: string;
  end_datetime: string;
};

/**
 * Returns a task-linked calendar event that is still open (not ended yet).
 * Prefers an in-progress session; otherwise the nearest upcoming one.
 */
export function findOpenWorkSession(
  events: TaskWorkSessionEvent[] | null | undefined,
  nowMs: number = Date.now(),
): TaskWorkSessionEvent | null {
  if (!events?.length) return null;

  const open = events.filter((event) => {
    const end = new Date(event.end_datetime).getTime();
    return Number.isFinite(end) && end > nowMs;
  });
  if (!open.length) return null;

  const inProgress = open.filter((event) => {
    const start = new Date(event.start_datetime).getTime();
    return Number.isFinite(start) && start <= nowMs;
  });

  if (inProgress.length) {
    return inProgress.sort(
      (a, b) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime(),
    )[0];
  }

  return open.sort(
    (a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime(),
  )[0];
}

export function parseTaskWorkSessionEvents(
  task: { events?: unknown } | null | undefined,
): TaskWorkSessionEvent[] {
  const raw = task?.events;
  if (!Array.isArray(raw)) return [];

  const events: TaskWorkSessionEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = row.id;
    const start = row.start_datetime ?? row.startDatetime;
    const end = row.end_datetime ?? row.endDatetime;
    if (typeof id !== 'number' || typeof start !== 'string' || typeof end !== 'string') {
      continue;
    }
    events.push({
      id,
      ...(typeof row.name === 'string' ? { name: row.name } : {}),
      start_datetime: start,
      end_datetime: end,
    });
  }
  return events;
}
