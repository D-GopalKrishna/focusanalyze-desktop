import type { ProjectColumn, Task } from "@shared/api-client";
import { RoleF81Enum } from "@shared/api-client";
import { taskStatusColumnIdFromApi } from "@shared/utils/tasks";
import type { RuntimeProjectData } from '@/lib/state/context/project';

/** When set, build columns from these tasks (e.g. one track on All Tracks) instead of board/list runtime fields. */
export type SprintOverviewTrackTasksOverride = {
  tasks: Task[];
  sprintTitle: string;
};

function columnMetaById(columnsMeta: ProjectColumn[]) {
  return new Map(columnsMeta.map((c) => [String(c.id), c]));
}

function taskIsDoneForColumns(t: Task, columnsMeta: ProjectColumn[]): boolean {
  if (t.status?.role === RoleF81Enum.Finish) {
    return true;
  }
  const sid = taskStatusColumnIdFromApi(t);
  if (sid == null) return false;
  const col = columnsMeta.find((c) => Number(c.id) === sid);
  return col?.role === RoleF81Enum.Finish;
}

export type SprintOverviewSerializedTask = {
  id: number;
  name: string;
  task_acronym: string;
  due_date: string | null;
  estimate: number | null;
  priority_name: string | null;
  assignee_name: string | null;
  task_type_name: string | null;
  labels: string[];
  is_overdue: boolean;
  is_done: boolean;
};

export type SprintOverviewPayload = {
  project_id: number;
  project_name: string;
  sprint_title: string;
  columns: {
    id: string;
    name: string;
    order: number;
    role?: ProjectColumn['role'];
    status_category: string;
    tasks: SprintOverviewSerializedTask[];
  }[];
};

function serializeTaskForSprint(
  t: Task,
  columnsMeta: ProjectColumn[],
): SprintOverviewSerializedTask {
  const assignee = t.assignee;
  const assigneeName =
    assignee?.username?.trim() ||
    [assignee?.first_name, assignee?.last_name].filter(Boolean).join(' ').trim() ||
    null;
  const workflowDone = (t as { workflow_done?: boolean }).workflow_done;
  return {
    id: t.id,
    name: t.name,
    task_acronym: t.task_acronym ?? '',
    due_date: t.due_date ?? null,
    estimate: t.estimate ?? null,
    priority_name: t.priority?.name ?? null,
    assignee_name: assigneeName,
    task_type_name: t.task_type?.name ?? null,
    labels: (t.labels || []).map((l) => l.name),
    is_overdue: t.is_overdue,
    is_done:
      typeof workflowDone === 'boolean' ? workflowDone : taskIsDoneForColumns(t, columnsMeta),
  };
}

function groupListTasksIntoColumns(
  tasks: Task[],
  columnsMeta: ProjectColumn[],
): SprintOverviewPayload['columns'] {
  const byColId = new Map<string, Task[]>();
  for (const c of columnsMeta) {
    byColId.set(String(c.id), []);
  }
  for (const t of tasks) {
    const rawId = taskStatusColumnIdFromApi(t);
    const sid = rawId != null ? String(rawId) : null;
    if (sid && byColId.has(sid)) {
      byColId.get(sid)!.push(t);
    } else if (columnsMeta[0]) {
      byColId.get(String(columnsMeta[0].id))!.push(t);
    }
  }
  return [...columnsMeta]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((c) => ({
      id: String(c.id),
      name: c.name,
      order: c.order ?? 0,
      role: c.role,
      status_category: (c as { status_category?: string }).status_category ?? '',
      tasks: (byColId.get(String(c.id)) || []).map((task) =>
        serializeTaskForSprint(task, columnsMeta),
      ),
    }));
}

/** Build API body from board view data + column metadata (including column roles). */
export function buildSprintOverviewPayload(
  project: RuntimeProjectData | null,
  columnsMeta: ProjectColumn[],
  trackTasksOverride?: SprintOverviewTrackTasksOverride | null,
): SprintOverviewPayload | null {
  if (!project) return null;

  const p = project as RuntimeProjectData & {
    active_track?: { name?: string | null } | null;
    tasks?: Task[];
  };
  const active = p.activeTrack ?? p.active_track;
  const sprintTitle = typeof active?.name === 'string' ? active.name : '';

  if (trackTasksOverride && Array.isArray(trackTasksOverride.tasks) && columnsMeta.length > 0) {
    return {
      project_id: project.id,
      project_name: project.name,
      sprint_title: trackTasksOverride.sprintTitle?.trim() || sprintTitle,
      columns: groupListTasksIntoColumns(trackTasksOverride.tasks, columnsMeta),
    };
  }

  if (project.boardData) {
    const boardData = project.boardData;
    const metaById = columnMetaById(columnsMeta);
    const cols = Object.entries(boardData)
      .map(([columnId, col]) => {
        const meta = metaById.get(String(columnId));
        return {
          id: columnId,
          name: col.name,
          order: col.order,
          role: meta?.role,
          status_category:
            (meta as { status_category?: string } | undefined)?.status_category ?? '',
          tasks: (col.tasks || []).map((task: Task) => serializeTaskForSprint(task, columnsMeta)),
        };
      })
      .sort((a, b) => a.order - b.order);

    return {
      project_id: project.id,
      project_name: project.name,
      sprint_title: sprintTitle,
      columns: cols,
    };
  }

  const listTasks = p.tasks;
  if (Array.isArray(listTasks) && columnsMeta.length > 0) {
    return {
      project_id: project.id,
      project_name: project.name,
      sprint_title: sprintTitle,
      columns: groupListTasksIntoColumns(listTasks, columnsMeta),
    };
  }

  return null;
}
