import type { Task } from "@shared/api-client";

export function subtasksAsArray(subtasks: Task['subtasks'] | undefined): Task[] {
  if (subtasks == null) return [];
  if (Array.isArray(subtasks)) return subtasks as Task[];
  if (typeof subtasks === 'object') return Object.values(subtasks) as Task[];
  return [];
}

function walkTaskTree(
  task: Task,
  parent: Task | null,
  acronym: string,
): { task: Task; parent: Task | null } | null {
  if (task.task_acronym === acronym) return { task, parent };
  for (const sub of subtasksAsArray(task.subtasks)) {
    const hit = walkTaskTree(sub as Task, task, acronym);
    if (hit) return hit;
  }
  return null;
}

/** Board columns: each column has a `tasks` root list. */
export function findTaskByAcronymInBoardColumns(
  columns: { tasks: Task[] }[],
  acronym: string,
): { task: Task; parent: Task | null } | null {
  for (const col of columns) {
    for (const t of col.tasks) {
      const hit = walkTaskTree(t, null, acronym);
      if (hit) return hit;
    }
  }
  return null;
}

/** Flat list view: top-level tasks (may contain nested subtasks). */
export function findTaskByAcronymInRootTasks(
  roots: Task[],
  acronym: string,
): { task: Task; parent: Task | null } | null {
  for (const t of roots) {
    const hit = walkTaskTree(t, null, acronym);
    if (hit) return hit;
  }
  return null;
}

/** All-tracks view: each track has a `tasks` root list. */
export function findTaskByAcronymInTracks(
  tracks: { tasks: Task[] }[],
  acronym: string,
): { task: Task; parent: Task | null } | null {
  for (const tr of tracks) {
    for (const t of tr.tasks) {
      const hit = walkTaskTree(t, null, acronym);
      if (hit) return hit;
    }
  }
  return null;
}
