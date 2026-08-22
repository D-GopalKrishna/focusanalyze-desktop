import { format, parseISO, startOfDay } from 'date-fns';

import type { DraftPlanBlock, PlanScope } from "@shared/types/dashboard/planning";
import { parseDateOnlyParam } from "@shared/utils/plan-period";

/** Avoid `@/lib/rest_client_backend` — its base.ts breaks node --test strip-only mode. */
type HitlPendingActionLike = {
  name: string;
  tool_call_id?: string;
  arguments?: Record<string, unknown>;
};

const PLAN_BLOCKS_TOOL = 'propose_plan_blocks_tool';
const CREATE_EVENT_TOOL = 'propose_create_event_tool';
const BULK_CREATE_EVENTS_TOOL = 'propose_bulk_create_events_tool';

const CREATE_EVENT_TOOLS = new Set([CREATE_EVENT_TOOL, BULK_CREATE_EVENTS_TOOL]);

/** Minimum create-event count before we offer Open in plan mode (1-off stays Approve-only). */
export const PLAN_MODE_BRIDGE_MIN_BLOCKS = 2;

export type PlanBlocksHitlProposal = {
  scope: PlanScope;
  periodStart: Date;
  periodStartYmd: string;
  blocks: DraftPlanBlock[];
  /** True when the HITL is propose_plan_blocks (Approve uses commitPlanSession). */
  fromPlanBlocksTool: boolean;
};

function numericId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function recordToDraftBlock(
  r: Record<string, unknown>,
  idPrefix: string,
  source: 'ai' = 'ai',
): DraftPlanBlock | null {
  if (!r.start_datetime || !r.end_datetime) return null;
  const taskId = numericId(r.task) ?? numericId(r.task_id);
  return {
    id: `${idPrefix}-${String(r.start_datetime)}`,
    name: String(r.name ?? 'Planned block'),
    start_datetime: String(r.start_datetime),
    end_datetime: String(r.end_datetime),
    task_id: taskId,
    description: typeof r.description === 'string' ? r.description : '',
    source,
  };
}

function recordsToDraftBlocks(
  action: HitlPendingActionLike,
  source: 'ai' = 'ai',
): DraftPlanBlock[] {
  const records = Array.isArray(action.arguments?.records) ? action.arguments.records : [];
  const callId = action.tool_call_id ?? 'plan';
  const out: DraftPlanBlock[] = [];
  for (const r of records as Array<Record<string, unknown>>) {
    const block = recordToDraftBlock(r, callId, source);
    if (block) out.push(block);
  }
  return out;
}

function createEventActionToDraftBlock(action: HitlPendingActionLike): DraftPlanBlock | null {
  const args = action.arguments ?? {};
  return recordToDraftBlock(args, action.tool_call_id ?? 'event', 'ai');
}

function inferScopeAndPeriod(blocks: DraftPlanBlock[]): {
  scope: PlanScope;
  periodStart: Date;
  periodStartYmd: string;
} | null {
  if (!blocks.length) return null;
  const starts = blocks
    .map((b) => {
      try {
        return parseISO(b.start_datetime);
      } catch {
        return null;
      }
    })
    .filter((d): d is Date => d != null && !Number.isNaN(d.getTime()));
  if (!starts.length) return null;

  const dayKeys = new Set(starts.map((d) => format(startOfDay(d), 'yyyy-MM-dd')));
  const scope: PlanScope = dayKeys.size > 1 ? 'weekly' : 'daily';
  const earliest = starts.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
  const periodStart = startOfDay(earliest);
  return {
    scope,
    periodStart,
    periodStartYmd: format(periodStart, 'yyyy-MM-dd'),
  };
}

/** True when every pending HITL action is `propose_plan_blocks_tool`. */
export function isPlanBlocksOnlyHitl(actions: HitlPendingActionLike[]): boolean {
  return actions.length > 0 && actions.every((a) => a.name === PLAN_BLOCKS_TOOL);
}

/** Approval card only shows this many blocks as tiles before collapsing into "+N more". */
const PLAN_BLOCK_ROW_DISPLAY_CAP = 5;

/**
 * Draft blocks for a single HITL action's approval-card preview — matches the same tool
 * names as the "Blocks: N calendar blocks" text row in hitlDisplayFields.ts's plan-blocks
 * branch (propose_plan_blocks_tool / propose_save_plan_draft_tool / propose_commit_plan_tool),
 * capped for display, with a count of any blocks past the cap.
 */
export function planBlockRowsForAction(
  action: HitlPendingActionLike,
): { blocks: DraftPlanBlock[]; moreCount: number } | null {
  const name = action.name;
  const matchesByName =
    name.includes('plan_blocks') || name.includes('save_plan_draft') || name.includes('commit_plan');
  if (!matchesByName) return null;
  const blocks = recordsToDraftBlocks(action);
  if (!blocks.length) return null;
  return {
    blocks: blocks.slice(0, PLAN_BLOCK_ROW_DISPLAY_CAP),
    moreCount: Math.max(0, blocks.length - PLAN_BLOCK_ROW_DISPLAY_CAP),
  };
}

/** True when every pending action is a create-event propose (single or bulk). */
export function isCreateEventsOnlyHitl(actions: HitlPendingActionLike[]): boolean {
  return actions.length > 0 && actions.every((a) => CREATE_EVENT_TOOLS.has(a.name));
}

/**
 * Parse a plan-mode bridge proposal from either propose_plan_blocks or multi create-event HITL.
 * Returns null when there aren't enough blocks to justify plan mode.
 */
export function planProposalFromHitlActions(
  actions: HitlPendingActionLike[],
): PlanBlocksHitlProposal | null {
  if (isPlanBlocksOnlyHitl(actions)) {
    const planActions = actions.filter((a) => a.name === PLAN_BLOCKS_TOOL);
    const blocks = planActions.flatMap((a) => recordsToDraftBlocks(a));
    if (blocks.length < 1) return null;

    const first = planActions[0]?.arguments ?? {};
    const scope: PlanScope = first.scope === 'weekly' ? 'weekly' : 'daily';
    const rawPeriod =
      (typeof first.period_start === 'string' && first.period_start) ||
      (typeof first.anchor_date === 'string' && first.anchor_date) ||
      '';
    let periodStart = parseDateOnlyParam(rawPeriod);
    if (!periodStart && blocks[0]?.start_datetime) {
      try {
        periodStart = parseISO(blocks[0].start_datetime);
      } catch {
        periodStart = null;
      }
    }
    if (!periodStart || Number.isNaN(periodStart.getTime())) return null;

    return {
      scope,
      periodStart,
      periodStartYmd: format(periodStart, 'yyyy-MM-dd'),
      blocks,
      fromPlanBlocksTool: true,
    };
  }

  if (!isCreateEventsOnlyHitl(actions)) return null;

  const blocks: DraftPlanBlock[] = [];
  for (const action of actions) {
    if (action.name === BULK_CREATE_EVENTS_TOOL) {
      blocks.push(...recordsToDraftBlocks(action));
    } else if (action.name === CREATE_EVENT_TOOL) {
      const b = createEventActionToDraftBlock(action);
      if (b) blocks.push(b);
    }
  }
  if (blocks.length < PLAN_MODE_BRIDGE_MIN_BLOCKS) return null;

  const inferred = inferScopeAndPeriod(blocks);
  if (!inferred) return null;

  return {
    ...inferred,
    blocks,
    fromPlanBlocksTool: false,
  };
}

/** Whether the HITL footer should offer Open in plan mode. */
export function shouldOfferOpenPlanMode(
  actions: HitlPendingActionLike[],
  opts: { isPlanningMode: boolean; isDone: boolean },
): boolean {
  if (opts.isPlanningMode || opts.isDone) return false;
  return planProposalFromHitlActions(actions) != null;
}

/** Calendar deep-link for a plan period (matches journal Plan buttons). */
export function planningModeHref(scope: PlanScope, periodStartYmd: string): string {
  if (scope === 'weekly') {
    return `/dashboard/calendar?planning=weekly&week_start=${periodStartYmd}`;
  }
  return `/dashboard/calendar?planning=daily&date=${periodStartYmd}`;
}

/**
 * HITL edit payload: turn draft plan blocks into a bulk create so "Approve as events"
 * can write solid calendar events via tool rename (kept for tests / alternate paths).
 * Primary FE path uses commitPlanSession instead.
 */
export function planBlocksToBulkCreateEditArgs(
  action: HitlPendingActionLike,
): { name: string; args: Record<string, unknown> } | null {
  if (action.name !== PLAN_BLOCKS_TOOL) return null;
  const records = Array.isArray(action.arguments?.records) ? action.arguments.records : [];
  if (!records.length) return null;
  const mapped = (records as Array<Record<string, unknown>>)
    .filter((r) => r?.start_datetime && r?.end_datetime)
    .map((r) => {
      const out: Record<string, unknown> = {
        name: String(r.name ?? 'Planned block'),
        start_datetime: String(r.start_datetime),
        end_datetime: String(r.end_datetime),
        description: typeof r.description === 'string' ? r.description : '',
      };
      if (typeof r.task === 'number') out.task = r.task;
      else if (typeof r.task_id === 'number') out.task = r.task_id;
      return out;
    });
  if (!mapped.length) return null;
  return {
    name: BULK_CREATE_EVENTS_TOOL,
    args: { records: mapped },
  };
}
