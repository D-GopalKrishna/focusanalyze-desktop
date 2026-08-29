import {
  ApiPlanSessionsDraftDestroyScopeEnum,
  ApiPlanSessionsDraftRetrieveScopeEnum,
  ApiPlanSessionsDraftUpdateScopeEnum,
  ApiPlanSessionsIndexRetrieveScopeEnum,
  ApiPlanSessionsIndexRetrieveStatusEnum,
  ApiPlanSessionsSnapshotDestroyScopeEnum,
  ApiPlanSessionsSnapshotPartialUpdateScopeEnum,
  ApiPlanSessionsSnapshotRetrieveScopeEnum,
  ApiPlanSessionsStatusRetrieveScopeEnum,
  ApiPlanSessionsVsActualRetrieveScopeEnum,
  ComparisonModeEnum,
  PlanSessionsApi,
  type PatchedPlanSnapshotComparisonMode,
  type PlanDraftUpsert,
  type PlanIndexEntry,
  type PlanIndexList,
  type PlanSessionCommit,
  type PlanSessionDismiss,
  type PlanDrift,
  type PlanSnapshot,
  type PlanSnapshotHistoryEntry,
  type PlanSnapshotLive,
  type PlanVsActual,
} from "@shared/api-client";

export type ComparisonMode = 'baseline' | 'latest';
import { isAxiosError } from 'axios';
import { bearerAuthorizationHeader, createApiClient, createApiConfiguration } from '../auth';

import type { DraftPlanBlock } from "@shared/types/dashboard/planning";
import type { PlanScope } from "@shared/types/dashboard/planning";
import { draftBlocksToApiPayload } from "@shared/utils/plan-draft-persist";

const api = createApiClient(PlanSessionsApi);

/** Prefer DRF field errors (`blocks`, `detail`) over a generic Save-failed toast. */
export function getPlanSessionApiErrorDetail(error: unknown, fallbackMessage: string): string {
  if (!isAxiosError(error)) {
    return fallbackMessage;
  }
  const data = error.response?.data;
  if (!data || typeof data !== 'object') {
    return fallbackMessage;
  }
  const record = data as Record<string, unknown>;
  for (const key of ['blocks', 'detail', 'non_field_errors'] as const) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      return value[0].trim();
    }
  }
  return fallbackMessage;
}

function toApiScope(scope: PlanScope) {
  return scope === 'weekly'
    ? ApiPlanSessionsStatusRetrieveScopeEnum.Weekly
    : ApiPlanSessionsStatusRetrieveScopeEnum.Daily;
}

function toDraftScope(scope: PlanScope) {
  return scope === 'weekly'
    ? ApiPlanSessionsDraftRetrieveScopeEnum.Weekly
    : ApiPlanSessionsDraftRetrieveScopeEnum.Daily;
}

function toIndexScope(scope: PlanScope) {
  return scope === 'weekly'
    ? ApiPlanSessionsIndexRetrieveScopeEnum.Weekly
    : ApiPlanSessionsIndexRetrieveScopeEnum.Daily;
}

function toIndexStatus(status: 'draft' | 'saved' | 'dismissed') {
  if (status === 'draft') return ApiPlanSessionsIndexRetrieveStatusEnum.Draft;
  if (status === 'saved') return ApiPlanSessionsIndexRetrieveStatusEnum.Saved;
  return ApiPlanSessionsIndexRetrieveStatusEnum.Dismissed;
}

function toVsActualScope(scope: PlanScope) {
  return scope === 'weekly'
    ? ApiPlanSessionsVsActualRetrieveScopeEnum.Weekly
    : ApiPlanSessionsVsActualRetrieveScopeEnum.Daily;
}

function toSnapshotScope(scope: PlanScope) {
  return scope === 'weekly'
    ? ApiPlanSessionsSnapshotRetrieveScopeEnum.Weekly
    : ApiPlanSessionsSnapshotRetrieveScopeEnum.Daily;
}

export type PlanningContextEvent = {
  id: number;
  name: string;
  start_datetime: string;
  end_datetime: string;
  event_type: string;
};

export type PlanningContextTask = {
  id: number;
  name: string;
  task_acronym: string;
  project_id?: number | null;
  project_name?: string | null;
};

export type PlanningContextPayload = {
  scope: string;
  period_start: string;
  period_end: string;
  event_count: number;
  events: PlanningContextEvent[];
  task_count: number;
  tasks: PlanningContextTask[];
  has_existing_plan: boolean;
  planned_block_count: number;
};

type PlanSessionStatusPayload = {
  scope: string;
  period_start: string;
  period_end: string;
  has_snapshot: boolean;
  has_draft?: boolean;
  dismissed: boolean;
  snapshot_id: number | null;
  saved_at: string | null;
  draft_updated_at?: string | null;
  /** Live plan-vs-calendar drift for this period (recompute-on-read, Phase 1). */
  drift?: PlanDrift;
};

export type { PlanDrift, PlanIndexEntry, PlanIndexList };

export async function getPlanningContext(
  scope: PlanScope,
  date?: string,
): Promise<PlanningContextPayload> {
  const resp = await api.apiPlanSessionsContextRetrieve(toApiScope(scope), date);
  return resp.data as PlanningContextPayload;
}

export async function getPlanSessionStatus(scope: PlanScope, date?: string) {
  const resp = await api.apiPlanSessionsStatusRetrieve(toApiScope(scope), date);
  return (resp as { data: unknown }).data as PlanSessionStatusPayload;
}

/** Returns saved plan snapshot for the period, or null if none / empty blocks (404). */
export async function getPlanSnapshot(
  scope: PlanScope,
  date?: string,
): Promise<PlanSnapshot | null> {
  try {
    const resp = await api.apiPlanSessionsSnapshotRetrieve(toSnapshotScope(scope), date);
    return resp.data;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) return null;
    throw err;
  }
}

/** Version history for a saved plan (newest first) — one entry per commit/replan. */
export async function getPlanSnapshotHistory(
  snapshotId: number,
): Promise<PlanSnapshotHistoryEntry[]> {
  const resp = await api.apiPlanSessionsHistoryList(snapshotId);
  return resp.data;
}

export async function commitPlanSession(payload: PlanSessionCommit) {
  const resp = await api.apiPlanSessionsCommitCreate(payload);
  return resp.data;
}

export async function dismissPlanSession(scope: PlanScope, date?: string) {
  const body: PlanSessionDismiss = { scope, date: date ?? null };
  await api.apiPlanSessionsDismissCreate(body);
}

/**
 * Commit whatever the live calendar currently shows as a new plan version (Phase 6 / D7) — no
 * planner UI, no block-editing. Used by the drift toast's "Create planned snapshot" action so a
 * user who's just been rearranging events live can accept the current state as the new plan with
 * one click.
 */
export async function snapshotLiveCalendar(scope: PlanScope, date?: string) {
  const body: PlanSnapshotLive = { scope, date: date ?? null };
  const resp = await api.apiPlanSessionsSnapshotLiveCreate(body);
  return resp.data;
}

export async function getPlanVsActual(
  scope: PlanScope,
  periodStart: string,
  until?: string,
): Promise<PlanVsActual> {
  const resp = await api.apiPlanSessionsVsActualRetrieve(
    periodStart,
    toVsActualScope(scope),
    undefined,
    undefined,
    until,
  );
  return resp.data;
}

/**
 * Month (or arbitrary range): sums plan snapshots between periodStart and periodEnd.
 * `granularity` picks which PlanSnapshot scope to sum — 'day' (default) sums DAILY
 * snapshots, 'week' sums WEEKLY ones. These are strictly separate scopes, never merged
 * (see plan_resolution.py) — pass whichever granularity the user actually planned in,
 * or the total will silently read as 0/understated for weeks-only planners.
 */
export async function getPlanVsActualForRange(
  periodStart: string,
  periodEnd: string,
  until?: string,
  granularity: 'day' | 'week' = 'day',
): Promise<PlanVsActual> {
  const resp = await api.apiPlanSessionsVsActualRetrieve(
    periodStart,
    toVsActualScope('daily'),
    granularity,
    periodEnd,
    until,
  );
  return resp.data;
}

export async function listPlanIndex(params?: {
  scope?: PlanScope;
  from?: string;
  to?: string;
  status?: 'draft' | 'saved' | 'dismissed';
  limit?: number;
  cursor?: string;
}): Promise<PlanIndexList> {
  const resp = await api.apiPlanSessionsIndexRetrieve(
    params?.cursor,
    params?.from,
    params?.limit,
    params?.scope ? toIndexScope(params.scope) : undefined,
    params?.status ? toIndexStatus(params.status) : undefined,
    params?.to,
  );
  return resp.data;
}

export async function getPlanDraft(scope: PlanScope, date?: string): Promise<PlanSnapshot | null> {
  try {
    const resp = await api.apiPlanSessionsDraftRetrieve(toDraftScope(scope), date);
    return resp.data;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) return null;
    throw err;
  }
}

export async function savePlanDraft(payload: {
  scope: PlanScope;
  period_start?: string;
  blocks: DraftPlanBlock[];
  conversation_uuid?: string | null;
}): Promise<PlanSnapshot | null> {
  if (!payload.blocks.length) {
    await deletePlanDraft(payload.scope, payload.period_start);
    return null;
  }
  const body: PlanDraftUpsert = {
    scope: payload.scope,
    period_start: payload.period_start ?? null,
    blocks: draftBlocksToApiPayload(payload.blocks),
    conversation_uuid: payload.conversation_uuid ?? null,
  };
  const resp = await api.apiPlanSessionsDraftUpdate(
    payload.scope === 'weekly'
      ? ApiPlanSessionsDraftUpdateScopeEnum.Weekly
      : ApiPlanSessionsDraftUpdateScopeEnum.Daily,
    body,
    payload.period_start,
  );
  return resp.data;
}

export async function deletePlanDraft(scope: PlanScope, date?: string): Promise<void> {
  try {
    await api.apiPlanSessionsDraftDestroy(
      scope === 'weekly'
        ? ApiPlanSessionsDraftDestroyScopeEnum.Weekly
        : ApiPlanSessionsDraftDestroyScopeEnum.Daily,
      date,
    );
  } catch (err) {
    // No matching draft server-side (e.g. it was already discarded, or the
    // period_start the row was listed under no longer resolves the same way)
    // — nothing left to delete, so this isn't a failure from the caller's POV.
    if ((err as { response?: { status?: number } })?.response?.status === 404) return;
    throw err;
  }
}

/**
 * Persists which adherence number (baseline/latest) THIS specific day/week's plan shows as
 * primary — per-snapshot, not a global user preference (plan-vs-actual-default-baseline
 * Phase 2 revision: a choice made on one day must never change what another day shows).
 * 404s (surfaced as a thrown error) if no snapshot exists yet for that scope/date.
 */
export async function setPlanSnapshotComparisonMode(
  scope: PlanScope,
  mode: ComparisonMode,
  date?: string,
): Promise<PlanSnapshot> {
  const body: PatchedPlanSnapshotComparisonMode = {
    comparison_mode: mode === 'latest' ? ComparisonModeEnum.Latest : ComparisonModeEnum.Baseline,
  };
  const resp = await api.apiPlanSessionsSnapshotPartialUpdate(
    scope === 'weekly'
      ? ApiPlanSessionsSnapshotPartialUpdateScopeEnum.Weekly
      : ApiPlanSessionsSnapshotPartialUpdateScopeEnum.Daily,
    date,
    body,
  );
  return resp.data;
}

/** Permanently remove the saved plan for the period. Calendar events are kept. */
export async function deletePlanSnapshot(scope: PlanScope, date?: string): Promise<void> {
  await api.apiPlanSessionsSnapshotDestroy(
    scope === 'weekly'
      ? ApiPlanSessionsSnapshotDestroyScopeEnum.Weekly
      : ApiPlanSessionsSnapshotDestroyScopeEnum.Daily,
    date,
  );
}

/**
 * Best-effort draft flush before tab unload.
 *
 * Deliberately NOT routed through the generated client like every other call in this
 * file. It fires from a `beforeunload` handler where the page can be torn down mid-request,
 * and `fetch(..., { keepalive: true })` is the one browser primitive built to survive that —
 * the request is hoisted off the page's fetch group so it keeps running after unload. Axios
 * (and therefore the generated client, which is built on axios) has no equivalent flag in
 * this project's axios version, so swapping this to `api.apiPlanSessionsDraftUpdate` would
 * silently lose that guarantee and risk dropping the last few seconds of a plan draft on
 * tab close. This is the second sanctioned exception to "always use the generated client"
 * (the first being the SSE notification stream), for the same reason: no axios equivalent
 * exists for a browser-native capability the call site depends on.
 *
 * Token freshness is handled separately: `bearerAuthorizationHeader()` reads whatever is in
 * the cookie right now (no refresh check), which is fine here — this fires on tab unload, so
 * there's no request-in-flight to retry if the token happens to be stale, and no user waiting
 * on the result either.
 */
export function flushPlanDraftKeepalive(payload: {
  scope: PlanScope;
  period_start: string;
  blocks: DraftPlanBlock[];
  conversation_uuid?: string | null;
}): void {
  if (!payload.blocks.length) return;
  const base = createApiConfiguration().basePath?.replace(/\/$/, '') ?? '';
  const body = JSON.stringify({
    scope: payload.scope,
    period_start: payload.period_start,
    blocks: draftBlocksToApiPayload(payload.blocks),
    conversation_uuid: payload.conversation_uuid ?? null,
  } satisfies PlanDraftUpsert);
  void fetch(`${base}/api/plan-sessions/draft/`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...bearerAuthorizationHeader(),
    },
    body,
    keepalive: true,
  });
}
