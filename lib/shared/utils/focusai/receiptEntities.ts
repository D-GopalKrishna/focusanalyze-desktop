/**
 * Extract openable entities from HITL `action_results` for rich “Go to / Open” UI.
 * Destinations come from tool payloads / client_hint — never from LLM prose.
 */
import type { Destination } from "@shared/api-client";
import type { ActionReceipt } from "@shared/utils/focusai/actionReceipts";
import { firstNavigateToHint } from "@shared/utils/focusai/actionReceipts";

export type ReceiptEntityCta =
  | 'Go to project'
  | 'Open task'
  | 'Open comment'
  | 'Open event'
  | 'Open track'
  | 'Open habit'
  | 'Open life area'
  | 'Open journal'
  | 'Open plan'
  | 'Open plan history'
  | 'Open report'
  | 'Open performance'
  | 'Open capacity'
  | 'Open settings'
  | 'Open chat history'
  | 'Open My Plans'
  | 'Open';

export interface ReceiptOpenableEntity {
  key: string;
  label: string;
  secondaryLabel?: string;
  destination: Destination;
  cta: ReceiptEntityCta;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? (value as Record<string, any>) : {};
}

function destinationOf(entity: Record<string, any> | undefined): Destination | undefined {
  const dest = entity?.destination;
  if (dest && typeof dest === 'object' && typeof dest.kind === 'string') {
    return dest as Destination;
  }
  return undefined;
}

function projectIdOfTask(task: Record<string, any>): number | undefined {
  if (task.project_id != null) {
    const n = Number(task.project_id);
    return Number.isFinite(n) ? n : undefined;
  }
  const project = task.project;
  if (project && typeof project === 'object' && project.id != null) {
    const n = Number(project.id);
    return Number.isFinite(n) ? n : undefined;
  }
  if (project != null && typeof project !== 'object') {
    const n = Number(project);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function taskDestination(task: Record<string, any>): Destination | undefined {
  const nested = destinationOf(task);
  if (nested) return nested;
  const projectId = projectIdOfTask(task);
  const acronym = task.task_acronym || task.acronym;
  if (projectId != null && acronym) {
    return {
      kind: 'task',
      project_id: projectId,
      acronym: String(acronym),
      ...(task.id != null ? { task_id: Number(task.id) } : {}),
    };
  }
  if (projectId != null) {
    return { kind: 'project_board', project_id: projectId };
  }
  return undefined;
}

function projectDestination(project: Record<string, any>): Destination | undefined {
  const nested = destinationOf(project);
  if (nested) return nested;
  if (project.id == null) return undefined;
  const id = Number(project.id);
  if (!Number.isFinite(id)) return undefined;
  return { kind: 'project', project_id: id, view: 'board' };
}

function eventDestination(event: Record<string, any>): Destination | undefined {
  const nested = destinationOf(event);
  if (nested) return nested;
  if (event.id == null) return undefined;
  const id = Number(event.id);
  if (!Number.isFinite(id)) return undefined;
  return { kind: 'event', event_id: id };
}

export function ctaForDestination(destination: Destination): ReceiptEntityCta {
  switch (destination.kind as string) {
    case 'project':
    case 'project_board':
      return 'Go to project';
    case 'project_settings':
      return 'Open settings';
    case 'track':
      return 'Open track';
    case 'task':
      return 'Open task';
    case 'task_comment':
      return 'Open comment';
    case 'event':
      return 'Open event';
    case 'habit':
      return 'Open habit';
    case 'life_area':
      return 'Open life area';
    case 'journal':
      return 'Open journal';
    case 'plan':
    case 'planning':
      return 'Open plan';
    case 'plan_history':
      return 'Open plan history';
    case 'plans_hub':
      return 'Open My Plans';
    case 'report_dialog':
      return 'Open report';
    case 'report':
      return 'Open performance';
    case 'capacity':
      return 'Open capacity';
    case 'settings':
      return 'Open settings';
    case 'focusai_history':
      return 'Open chat history';
    default:
      return 'Open';
  }
}

function labelForDestination(destination: Destination, fallback: string): string {
  switch (destination.kind as string) {
    case 'journal':
      return destination.period_start
        ? `${destination.scope === 'weekly' ? 'Week' : 'Day'} journal · ${destination.period_start}`
        : 'Journal';
    case 'report_dialog':
      return destination.period_start || destination.date
        ? `Report · ${destination.period_start || destination.date}`
        : 'Report';
    case 'report':
      return destination.period_start || destination.date
        ? `Performance · ${destination.period_start || destination.date}`
        : 'Performance';
    case 'plan':
    case 'plan_history':
    case 'planning':
      return destination.period_start
        ? `Plan · ${destination.period_start}`
        : 'Plan';
    case 'settings':
      return destination.section ? `Settings · ${destination.section}` : 'Settings';
    case 'capacity':
      return 'Capacity';
    case 'focusai_history':
      return 'Chat history';
    case 'plans_hub':
      return 'My Plans';
    default:
      return fallback;
  }
}

function trackDestination(track: Record<string, any>): Destination | undefined {
  const nested = destinationOf(track);
  if (nested) return nested;
  const trackId = track.id != null ? Number(track.id) : NaN;
  let projectId: number | undefined;
  if (track.project_id != null) {
    projectId = Number(track.project_id);
  } else if (track.project && typeof track.project === 'object' && track.project.id != null) {
    projectId = Number(track.project.id);
  } else if (track.project != null && typeof track.project !== 'object') {
    projectId = Number(track.project);
  }
  if (!Number.isFinite(trackId) || projectId == null || !Number.isFinite(projectId)) {
    return undefined;
  }
  return { kind: 'track', project_id: projectId, track_id: trackId, view: 'tracks' };
}

function habitDestination(habit: Record<string, any>): Destination | undefined {
  const nested = destinationOf(habit);
  if (nested) return nested;
  if (habit.id == null) return undefined;
  const id = Number(habit.id);
  if (!Number.isFinite(id)) return undefined;
  return { kind: 'habit', habit_id: id };
}

function destinationFingerprint(destination: Destination): string {
  const d = destination as unknown as Record<string, unknown>;
  return [
    d.kind,
    d.life_area_id,
    d.system_id,
    d.habit_id,
    d.project_id,
    d.task_id,
    d.track_id,
    d.event_id,
    d.acronym,
    d.comment_uuid,
    d.scope,
    d.period_start,
    d.period,
    d.date,
    d.section,
    d.conversation_uuid,
  ]
    .map((v) => (v == null ? '' : String(v)))
    .join('|');
}

function dedupeEntities(entities: ReceiptOpenableEntity[]): ReceiptOpenableEntity[] {
  const seen = new Set<string>();
  return entities.filter((e) => {
    const fp = destinationFingerprint(e.destination);
    if (seen.has(fp)) return false;
    seen.add(fp);
    return true;
  });
}

function pushDestination(
  out: ReceiptOpenableEntity[],
  key: string,
  label: string,
  destination: Destination | undefined,
) {
  if (!destination) return;
  const fp = destinationFingerprint(destination);
  if (out.some((e) => destinationFingerprint(e.destination) === fp)) return;
  out.push({
    key,
    label: labelForDestination(destination, label),
    destination,
    cta: ctaForDestination(destination),
  });
}

function pushResultDestinations(out: ReceiptOpenableEntity[], result: Record<string, any>, receipt: ActionReceipt) {
  const multi = Array.isArray(result.destinations) ? result.destinations : [];
  for (let i = 0; i < multi.length; i++) {
    const dest = multi[i];
    if (dest && typeof dest === 'object' && typeof dest.kind === 'string') {
      pushDestination(out, `dest-${receipt.tool_call_id || receipt.name || 'x'}-${i}`, 'Open', dest as Destination);
    }
  }
}

/** Openable entities for one successful mutation receipt (project, task, bulk tasks, event). */
export function openableEntitiesFromReceipt(receipt: ActionReceipt): ReceiptOpenableEntity[] {
  if (receipt.ok === false) return [];
  const result = asRecord(receipt.result);
  const out: ReceiptOpenableEntity[] = [];

  const tasks = result.tasks;
  if (Array.isArray(tasks) && tasks.length > 0) {
    tasks.forEach((raw: unknown, idx: number) => {
      const task = asRecord(raw);
      const destination = taskDestination(task);
      if (!destination) return;
      const acronym = task.task_acronym || task.acronym;
      out.push({
        key: `task-${task.id ?? idx}`,
        label: String(task.name || 'Untitled task'),
        secondaryLabel: acronym ? String(acronym) : undefined,
        destination,
        cta: ctaForDestination(destination),
      });
    });
    return out;
  }

  if (result.project) {
    const project = asRecord(result.project);
    const destination = projectDestination(project) ?? firstNavigateToHint([receipt]);
    if (destination) {
      out.push({
        key: `project-${project.id ?? 'x'}`,
        label: String(project.name || 'Project'),
        destination,
        cta: 'Go to project',
      });
    }
    return out;
  }

  if (result.comment) {
    const comment = asRecord(result.comment);
    const destination =
      destinationOf(comment) ??
      (result.destination && typeof result.destination === 'object'
        ? (result.destination as Destination)
        : firstNavigateToHint([receipt]));
    if (destination) {
      const preview = String(comment.content || comment.body || 'Comment')
        .replace(/<[^>]+>/g, '')
        .trim()
        .slice(0, 80);
      out.push({
        key: `comment-${comment.uuid ?? comment.id ?? 'x'}`,
        label: preview || 'Comment',
        destination,
        cta: ctaForDestination(destination),
      });
    }
    return out;
  }

  if (result.task) {
    const task = asRecord(result.task);
    const destination = taskDestination(task) ?? firstNavigateToHint([receipt]);
    if (destination) {
      const acronym = task.task_acronym || task.acronym;
      out.push({
        key: `task-${task.id ?? 'x'}`,
        label: String(task.name || 'Untitled task'),
        secondaryLabel: acronym ? String(acronym) : undefined,
        destination,
        cta: ctaForDestination(destination),
      });
    }
    return out;
  }

  if (result.event) {
    const event = asRecord(result.event);
    const destination = eventDestination(event) ?? firstNavigateToHint([receipt]);
    if (destination) {
      out.push({
        key: `event-${event.id ?? 'x'}`,
        label: String(event.name || 'Untitled event'),
        destination,
        cta: 'Open event',
      });
    }
    return out;
  }

  if (result.track) {
    const track = asRecord(result.track);
    const destination = trackDestination(track) ?? firstNavigateToHint([receipt]);
    if (destination) {
      out.push({
        key: `track-${track.id ?? 'x'}`,
        label: String(track.name || 'Untitled track'),
        destination,
        cta: 'Open track',
      });
    }
    return out;
  }

  if (result.habit) {
    const habit = asRecord(result.habit);
    const destination = habitDestination(habit) ?? firstNavigateToHint([receipt]);
    if (destination) {
      out.push({
        key: `habit-${habit.id ?? 'x'}`,
        label: String(habit.name || 'Untitled habit'),
        destination,
        cta: 'Open habit',
      });
    }
    return out;
  }

  if (result.life_area) {
    const lifeArea = asRecord(result.life_area);
    const nested = destinationOf(lifeArea);
    const destination =
      nested ??
      (lifeArea.id != null
        ? ({ kind: 'life_area', life_area_id: Number(lifeArea.id) } as Destination)
        : firstNavigateToHint([receipt]));
    if (destination) {
      out.push({
        key: `life-area-${lifeArea.id ?? 'x'}`,
        label: String(lifeArea.name || 'Life area'),
        destination,
        cta: 'Open life area',
      });
    }
    pushResultDestinations(out, result, receipt);
    return dedupeEntities(out);
  }

  if (result.journal) {
    const journal = asRecord(result.journal);
    const destination =
      destinationOf(journal) ??
      (result.destination && typeof result.destination === 'object'
        ? (result.destination as Destination)
        : firstNavigateToHint([receipt]));
    if (destination) {
      pushDestination(out, `journal-${journal.date ?? journal.week_start ?? 'x'}`, 'Journal', destination);
    }
    return out;
  }

  if (result.snapshot) {
    const snapshot = asRecord(result.snapshot);
    const destination =
      destinationOf(snapshot) ??
      (result.destination && typeof result.destination === 'object'
        ? (result.destination as Destination)
        : firstNavigateToHint([receipt]));
    if (destination) {
      pushDestination(out, `plan-${snapshot.id ?? 'x'}`, 'Plan', destination);
    }
    pushResultDestinations(out, result, receipt);
    return dedupeEntities(out);
  }

  if (result.report) {
    const report = asRecord(result.report);
    const destination =
      (result.destination && typeof result.destination === 'object'
        ? (result.destination as Destination)
        : firstNavigateToHint([receipt])) ?? undefined;
    if (destination) {
      const label =
        report.week_start != null
          ? `Week of ${String(report.week_start).slice(0, 10)}`
          : report.date != null
            ? String(report.date).slice(0, 10)
            : 'Report';
      pushDestination(out, `report-${receipt.tool_call_id || 'x'}`, label, destination);
    }
    pushResultDestinations(out, result, receipt);
    return dedupeEntities(out);
  }

  const navigateTo = firstNavigateToHint([receipt]);
  if (navigateTo) {
    out.push({
      key: `hint-${receipt.tool_call_id || receipt.name || 'nav'}`,
      label: labelForDestination(
        navigateTo,
        receipt.name?.replace(/^propose_/, '').replace(/_tool$/, '').replace(/_/g, ' ') || 'Open',
      ),
      destination: navigateTo,
      cta: ctaForDestination(navigateTo),
    });
  }
  pushResultDestinations(out, result, receipt);
  return dedupeEntities(out);
}

function receiptMayExposeOpenCta(receipt: ActionReceipt): boolean {
  const name = receipt.name ?? '';
  if (name.startsWith('propose_')) return true;
  const result = asRecord(receipt.result);
  if (result.destination && typeof result.destination === 'object') return true;
  if (Array.isArray(result.destinations) && result.destinations.length > 0) return true;
  if (receipt.client_hint?.navigate_to) return true;
  return false;
}

/** Flatten openable entities across receipts that may expose Open CTAs (dedupe by key). */
export function openableEntitiesFromReceipts(receipts: ActionReceipt[]): ReceiptOpenableEntity[] {
  const seen = new Set<string>();
  const out: ReceiptOpenableEntity[] = [];
  for (const receipt of receipts) {
    if (!receiptMayExposeOpenCta(receipt)) continue;
    for (const entity of openableEntitiesFromReceipt(receipt)) {
      if (seen.has(entity.key)) continue;
      seen.add(entity.key);
      out.push(entity);
    }
  }
  return out;
}
