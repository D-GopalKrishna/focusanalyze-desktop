import { JournalApi, type UserUploadedImageResponse } from "@shared/api-client";
import type { PlanScope } from "@shared/types/dashboard/planning";
import { createApiClient } from '../auth';

const api = createApiClient(JournalApi);

export type DayJournalPlanBlock = {
  event_id?: number | null;
  task_id?: number | null;
  name?: string;
  start_datetime: string;
  end_datetime?: string | null;
  project_id?: number | null;
  life_area_id?: number | null;
  description?: string;
};

export type DayJournalPlan = {
  snapshot_id: number;
  scope: string;
  period_start: string;
  period_end: string;
  saved_at: string | null;
  blocks: DayJournalPlanBlock[];
};

export type DayJournalPerformanceRow = {
  segment_type: string;
  name: string;
  color?: string | null;
  project_id?: number | null;
  life_area_id?: number | null;
  planned_hours: number;
  actual_hours: number;
  remaining_hours?: number;
};

export type DayJournalPerformance = {
  scope?: string | null;
  period_start?: string;
  period_end?: string;
  compare_until?: string;
  snapshot_id?: number | null;
  has_snapshot?: boolean;
  planned_hours_total?: number;
  actual_hours_total?: number;
  planning_accuracy_score?: number | null;
  comparison_rows?: DayJournalPerformanceRow[];
};

export type DayJournal = {
  id: number;
  date: string;
  note: string | null;
  plans: DayJournalPlan[];
  performance: DayJournalPerformance;
  performance_computed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getDayJournal(date: string): Promise<DayJournal> {
  const res = await api.apiJournalDayRetrieve(date);
  return res.data as unknown as DayJournal;
}

/**
 * The generated client's `apiJournalDayPartialUpdate` has no typed request body — the
 * OpenAPI schema for this PATCH doesn't declare one (backend annotation gap; fix + rerun
 * `./genapi.sh` when convenient). `options.data` still reaches the request body.
 */
export async function updateDayJournalNote(date: string, note: string): Promise<DayJournal> {
  const res = await api.apiJournalDayPartialUpdate(date, { data: { note } });
  return res.data as unknown as DayJournal;
}

export type WeekJournal = {
  id: number;
  week_start: string;
  week_end: string;
  note: string | null;
  plans: DayJournalPlan[];
  performance: DayJournalPerformance;
  performance_computed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** `date` is any day within the target week (YYYY-MM-DD). */
export async function getWeekJournal(date: string): Promise<WeekJournal> {
  const res = await api.apiJournalWeekRetrieve(date);
  return res.data as unknown as WeekJournal;
}

/** See `updateDayJournalNote` note re: `options.data` workaround. */
export async function updateWeekJournalNote(date: string, note: string): Promise<WeekJournal> {
  const res = await api.apiJournalWeekPartialUpdate(date, { data: { note } });
  return res.data as unknown as WeekJournal;
}

export type JournalNoteHistoryEntry = {
  id: number;
  note: string | null;
  history_id: number;
  history_date: string;
  history_type: string;
  date?: string;
  week_start?: string;
  week_end?: string;
};

export async function getDayJournalNoteHistory(date: string): Promise<JournalNoteHistoryEntry[]> {
  const res = await api.apiJournalDayNoteHistoryList(date);
  return res.data as JournalNoteHistoryEntry[];
}

export async function getWeekJournalNoteHistory(date: string): Promise<JournalNoteHistoryEntry[]> {
  const res = await api.apiJournalWeekNoteHistoryList(date);
  return res.data as JournalNoteHistoryEntry[];
}

export async function uploadJournalNoteImage(
  date: string,
  scope: PlanScope,
  image: File,
): Promise<UserUploadedImageResponse> {
  const res =
    scope === 'weekly'
      ? await api.apiJournalWeekUploadEditorImageCreate(date, image)
      : await api.apiJournalDayUploadEditorImageCreate(date, image);
  return res.data;
}
