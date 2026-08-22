import {
  CapacityApi,
  CapacityBudgetRead,
  CapacityReconcile,
  CapacityTimeline,
  CadenceEnum,
  UserCapacityRead,
  ApiCapacityReconcileRetrieveScopeEnum,
  ApiCapacityTimelineRetrieveGranularityEnum,
} from "@shared/api-client";
import { unwrapPaginatedList } from "@shared/utils/general";
import { startOfMonth, startOfWeek, startOfYear } from 'date-fns';
import { createApiClient } from '../auth';

const api = createApiClient(CapacityApi);

export type BudgetScope = ApiCapacityReconcileRetrieveScopeEnum;
export const BudgetScope = ApiCapacityReconcileRetrieveScopeEnum;

export type Cadence = CadenceEnum;
export const Cadence = CadenceEnum;

function toISODate(d: Date): string {
  return d.toLocaleDateString('en-CA'); // yyyy-MM-dd in local time
}

/** ISO (yyyy-MM-dd) start of the week containing `d`. Monday-based to match backend WEEKLY. */
export function weekStartISO(d: Date = new Date()): string {
  return toISODate(startOfWeek(d, { weekStartsOn: 1 }));
}

/** Period start (yyyy-MM-dd) for a scope: Monday / 1st of month / Jan 1. */
export function periodStartISO(scope: BudgetScope, d: Date = new Date()): string {
  if (scope === BudgetScope.Monthly) return toISODate(startOfMonth(d));
  if (scope === BudgetScope.Yearly) return toISODate(startOfYear(d));
  return weekStartISO(d);
}

// ---------------------------------------------------------------- budgets (demand)

export async function fetchBudgets(): Promise<CapacityBudgetRead[]> {
  const resp = (await api.apiCapacityBudgetList()).data;
  return unwrapPaginatedList(resp as CapacityBudgetRead[] | { results?: CapacityBudgetRead[] });
}

export async function createBudget(body: {
  project?: number | null;
  life_area?: number | null;
  scope: BudgetScope;
  period_start: string;
  // DIRECT cadence => pass target_hours; a rate-based cadence => pass rate.
  cadence?: Cadence;
  rate?: number | null;
  target_hours?: number | null;
}): Promise<CapacityBudgetRead> {
  const { data } = await api.apiCapacityBudgetCreate(body as CapacityBudgetRead);
  return data;
}

/** Update a DIRECT budget's period total. */
export async function updateBudgetHours(id: number, targetHours: number): Promise<CapacityBudgetRead> {
  const { data } = await api.apiCapacityBudgetPartialUpdate(id, {
    cadence: Cadence.Direct,
    target_hours: targetHours,
    rate: null,
  } as CapacityBudgetRead);
  return data;
}

/** Update a rate-based budget's per-unit rate (cadence unchanged). */
export async function updateBudgetRate(id: number, cadence: Cadence, rate: number): Promise<CapacityBudgetRead> {
  const { data } = await api.apiCapacityBudgetPartialUpdate(id, {
    cadence,
    rate,
    target_hours: null,
  } as CapacityBudgetRead);
  return data;
}

export async function deleteBudget(id: number): Promise<void> {
  await api.apiCapacityBudgetDestroy(id);
}

// ---------------------------------------------------------------- user capacity (supply)

export async function fetchUserCapacities(): Promise<UserCapacityRead[]> {
  const resp = (await api.apiUserCapacityList()).data;
  return unwrapPaginatedList(resp as UserCapacityRead[] | { results?: UserCapacityRead[] });
}

/** Create or update the standing (period_start = null) capacity for a scope. */
export async function setDefaultCapacity(
  scope: BudgetScope,
  availableHours: number,
  existing?: UserCapacityRead,
): Promise<UserCapacityRead> {
  if (existing) {
    const { data } = await api.apiUserCapacityPartialUpdate(existing.id, {
      available_hours: availableHours,
    } as UserCapacityRead);
    return data;
  }
  const { data } = await api.apiUserCapacityCreate({
    scope,
    available_hours: availableHours,
  } as UserCapacityRead);
  return data;
}

// ---------------------------------------------------------------- reconcile (read-only)

export async function fetchReconcile(scope: BudgetScope, periodStart: string): Promise<CapacityReconcile> {
  const { data } = await api.apiCapacityReconcileRetrieve(periodStart, scope);
  return data;
}

export type CapacityTimelineGranularity = ApiCapacityTimelineRetrieveGranularityEnum;
export const CapacityTimelineGranularity = ApiCapacityTimelineRetrieveGranularityEnum;

export async function fetchCapacityTimeline(
  scope: BudgetScope,
  rangeStart: string,
  rangeEnd: string,
  granularity: CapacityTimelineGranularity,
): Promise<CapacityTimeline> {
  const { data } = await api.apiCapacityTimelineRetrieve(granularity, rangeEnd, rangeStart, scope);
  return data;
}
