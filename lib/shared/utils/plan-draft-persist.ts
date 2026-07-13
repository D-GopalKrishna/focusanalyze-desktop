import type { Event, PlanSnapshot } from "@shared/api-client";

import type { DraftPlanBlock } from "@shared/types/dashboard/planning";
import { normalizePlanBlock } from "@shared/utils/plan-period";

export function draftBlocksToApiPayload(blocks: DraftPlanBlock[]) {
  return blocks.map((b) => ({
    id: b.id,
    name: b.name,
    start_datetime: b.start_datetime,
    end_datetime: b.end_datetime,
    task_id: b.task_id ?? null,
    project_id: b.project_id ?? null,
    life_area_id: b.life_area_id ?? null,
    description: b.description ?? '',
    event_id: b.event_id ?? null,
  }));
}

export function apiDraftToDraftBlocks(snapshot: PlanSnapshot): DraftPlanBlock[] {
  const payload = snapshot.draft_payload as { blocks?: Array<Record<string, unknown>> } | undefined;
  const blocks = payload?.blocks ?? [];
  return blocks.map((b, i) =>
    normalizePlanBlock({
      id: String(b.id ?? `draft-${i}`),
      name: String(b.name ?? 'Planned block'),
      start_datetime: String(b.start_datetime),
      end_datetime: String(b.end_datetime),
      task_id: typeof b.task_id === 'number' ? b.task_id : null,
      project_id: typeof b.project_id === 'number' ? b.project_id : null,
      life_area_id: typeof b.life_area_id === 'number' ? b.life_area_id : null,
      description: typeof b.description === 'string' ? b.description : '',
      event_id: typeof b.event_id === 'number' ? b.event_id : null,
      source: 'manual',
    }),
  );
}

/**
 * Seed an edit draft from a *committed* plan snapshot's own `payload.blocks` (as
 * opposed to `apiDraftToDraftBlocks`, which reads an in-progress `draft_payload`).
 * Used when entering replan mode for a period that has no leftover draft — without
 * this, the draft would start empty and a partial re-plan would silently drop every
 * previously-saved block that the edit session never touched.
 *
 * `liveEvents`, when provided, reconciles each block against its actual current `Event` row
 * (matched by `event_id`) instead of trusting the frozen snapshot payload verbatim — a block
 * dragged to a different day/time outside planning mode since the last commit would otherwise
 * render at its stale, originally-planned position (replan-draft-reconciliation Phase 2). A block
 * whose `event_id` no longer resolves to a live Event (deleted independently of planning mode) is
 * dropped rather than shown at a stale spot — there's nothing left to represent.
 *
 * When `liveEvents` is omitted (caller couldn't establish live data, e.g. no CalendarProvider
 * ancestor), behavior falls back to the original trust-the-snapshot-verbatim reading — we only drop
 * or reposition a block when we actually have live data to justify it.
 */
export function committedSnapshotToDraftBlocks(
  snapshot: PlanSnapshot,
  liveEvents?: Event[],
): DraftPlanBlock[] {
  const payload = snapshot.payload as { blocks?: Array<Record<string, unknown>> } | undefined;
  const blocks = payload?.blocks ?? [];
  const liveById = new Map((liveEvents ?? []).map((e) => [e.id, e]));

  const reconciled: (DraftPlanBlock | null)[] = blocks
    .filter((b) => b.start_datetime && b.end_datetime)
    .map((b, i) => {
      const eventId = typeof b.event_id === 'number' ? b.event_id : null;
      const live = eventId != null ? liveById.get(eventId) : undefined;
      if (eventId != null && liveEvents && !live) {
        return null; // orphaned: its Event was deleted outside planning mode — drop, don't fabricate
      }
      return normalizePlanBlock<DraftPlanBlock>({
        id: String(b.id ?? `plan-${i}`),
        name: live ? live.name : String(b.name ?? 'Planned block'),
        start_datetime: live ? live.start_datetime : String(b.start_datetime),
        end_datetime: live ? live.end_datetime : String(b.end_datetime),
        task_id: typeof b.task_id === 'number' ? b.task_id : null,
        project_id: typeof b.project_id === 'number' ? b.project_id : null,
        life_area_id: typeof b.life_area_id === 'number' ? b.life_area_id : null,
        description: typeof b.description === 'string' ? b.description : '',
        event_id: eventId,
        source: 'manual' as const,
      });
    });
  return reconciled.filter((b): b is DraftPlanBlock => b !== null);
}

export function serializeDraftBlocksForCompare(blocks: DraftPlanBlock[]): string {
  return JSON.stringify(draftBlocksToApiPayload(blocks));
}
