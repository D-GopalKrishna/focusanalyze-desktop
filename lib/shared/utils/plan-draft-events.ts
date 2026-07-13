import type { EventInput } from '@fullcalendar/core';

import type { DraftPlanBlock } from "@shared/types/dashboard/planning";
import { DRAFT_PLAN_EVENT_PREFIX } from "@shared/types/dashboard/planning";
import { FocusGPTProposeToolNameEnum } from "@shared/api-client";
import type { HitlPendingAction } from "@shared/api-client";
import { CALENDAR_THEME_FOREGROUND } from "@shared/utils/calendar-event-colors";

/**
 * `movedExistingEventIds`: blocks whose `event_id` is in this set already have a real, saved Event
 * — the user is proposing to relocate/edit it this session, not create something new. These get a
 * calmer "moved" treatment (solid outline, no pulse — replan-draft-reconciliation Phase 3) instead
 * of the dashed/pulsing "not real yet" style, which is reserved for genuinely new blocks
 * (`event_id == null`). Reusing the pulsing "proposed" style for your own edit of something real
 * would misleadingly read as an AI suggestion awaiting approval.
 */
export function draftBlocksToCalendarEvents(
  blocks: DraftPlanBlock[],
  movedExistingEventIds?: Set<number>,
): EventInput[] {
  return blocks.map((b) => {
    const isMovedExisting = b.event_id != null && (movedExistingEventIds?.has(b.event_id) ?? false);
    return {
      id: `${DRAFT_PLAN_EVENT_PREFIX}${b.id}`,
      title: b.name,
      start: new Date(b.start_datetime),
      end: new Date(b.end_datetime),
      allDay: false,
      display: 'block',
      backgroundColor: 'transparent',
      textColor: CALENDAR_THEME_FOREGROUND,
      classNames: isMovedExisting
        ? ['draft-moved-event', 'draft-plan-event']
        : ['proposed-event', 'draft-plan-event'],
      extendedProps: {
        isDraftPlan: true,
        draftPlanId: b.id,
        source: b.source,
        plannerTaskId: b.task_id,
        taskName: b.name,
      },
    };
  });
}

export function hitlActionsToDraftBlocks(
  actions: HitlPendingAction[],
  source: 'ai' = 'ai',
): DraftPlanBlock[] {
  const out: DraftPlanBlock[] = [];
  for (const action of actions) {
    if (action.name === FocusGPTProposeToolNameEnum.ProposePlanBlocksTool) {
      const records = Array.isArray(action.arguments?.records) ? action.arguments.records : [];
      for (const r of records as Array<Record<string, unknown>>) {
        if (!r.start_datetime || !r.end_datetime) continue;
        out.push({
          id: `${action.tool_call_id}-${String(r.start_datetime)}`,
          name: String(r.name ?? 'Planned block'),
          start_datetime: String(r.start_datetime),
          end_datetime: String(r.end_datetime),
          task_id: typeof r.task === 'number' ? r.task : null,
          description: typeof r.description === 'string' ? r.description : '',
          source,
        });
      }
    } else if (action.name === 'propose_bulk_create_events_tool') {
      const records = Array.isArray(action.arguments?.records) ? action.arguments.records : [];
      for (const r of records as Array<Record<string, unknown>>) {
        if (!r.start_datetime || !r.end_datetime) continue;
        out.push({
          id: `${action.tool_call_id}-${String(r.start_datetime)}`,
          name: String(r.name ?? 'Planned block'),
          start_datetime: String(r.start_datetime),
          end_datetime: String(r.end_datetime),
          task_id: typeof r.task === 'number' ? r.task : null,
          source,
        });
      }
    }
  }
  return out;
}
