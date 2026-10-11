import {
  HabitsApi,
  HabitRead,
  HabitCheckInRead,
  CadenceTypeEnum,
  DifficultyEnum,
  EventActionEnum,
} from "@shared/api-client";
import { unwrapPaginatedList } from "@shared/utils/general";
import { createApiClient } from '../auth';
import { isSchedulableCadence, rruleForCadence, todayISO } from "@shared/utils/habit-schedule";

export { todayISO, rruleForCadence, isSchedulableCadence };

const api = createApiClient(HabitsApi);

export type CadenceType = CadenceTypeEnum;
export const CadenceType = CadenceTypeEnum;

export type HabitDifficulty = DifficultyEnum;
export const HabitDifficulty = DifficultyEnum;

// The generated client hashes this enum's name (status collides with several other
// models' `status` fields) — mirror the literal union here instead of importing it,
// so this file doesn't churn on every unrelated genapi.sh regen.
export type CheckInStatus = 'completed' | 'skipped';
export const CheckInStatus = {
  Completed: 'completed' as CheckInStatus,
  Skipped: 'skipped' as CheckInStatus,
};

// ------------------------------------------------------------------------------- Habit

export interface HabitWritePayload {
  name: string;
  color?: string;
  notes?: string;
  life_area?: number | null;
  cadence_type?: CadenceType;
  weekdays?: number[];
  times_per_week?: number | null;
  interval_days?: number | null;
  difficulty?: HabitDifficulty;
  estimated_hours?: number;
  schedule_event?: number | null;
  archived_at?: string | null;
  paused_at?: string | null;
}

export async function fetchHabits(): Promise<HabitRead[]> {
  const resp = (await api.apiHabitList()).data;
  return unwrapPaginatedList(resp as HabitRead[] | { results?: HabitRead[] });
}

export async function createHabit(body: HabitWritePayload): Promise<HabitRead> {
  const { data } = await api.apiHabitCreate(body as HabitRead);
  return data;
}

export async function updateHabit(
  id: number,
  body: Partial<HabitWritePayload>,
): Promise<HabitRead> {
  const { data } = await api.apiHabitPartialUpdate(id, body as HabitRead);
  return data;
}

export type HabitEventAction = EventActionEnum;
export const HabitEventAction = EventActionEnum;

export async function deleteHabit(
  id: number,
  eventAction: HabitEventAction = HabitEventAction.Keep,
): Promise<void> {
  await api.apiHabitDestroy(id, { data: { event_action: eventAction } });
}

export async function fetchHabit(id: number): Promise<HabitRead> {
  const { data } = await api.apiHabitRetrieve(id);
  return data;
}

// -------------------------------------------------------------- Calendar link

export async function linkHabitToEvent(habitId: number, eventId: number): Promise<HabitRead> {
  return updateHabit(habitId, { schedule_event: eventId });
}

export async function unlinkHabitFromCalendar(
  habitId: number,
  eventAction: HabitEventAction = HabitEventAction.Keep,
): Promise<HabitRead> {
  const { data } = await api.apiHabitUnlinkCreate(habitId, { event_action: eventAction });
  return data;
}

export interface ChangeHabitCadenceInput {
  cadence_type: CadenceType;
  weekdays?: number[];
  times_per_week?: number | null;
  interval_days?: number | null;
  /** `YYYY-MM-DD`; defaults to today when omitted. */
  effective_date?: string;
}

export async function changeHabitCadence(
  habitId: number,
  input: ChangeHabitCadenceInput,
): Promise<HabitRead> {
  const { data } = await api.apiHabitChangeCadenceCreate(habitId, input);
  return data;
}

// --------------------------------------------------------------------------- Check-in

export async function checkInHabit(
  id: number,
  body: { status?: CheckInStatus; local_date?: string; occurrence_start?: string | null } = {},
): Promise<HabitCheckInRead> {
  const { data } = await api.apiHabitCheckInCreate(id, body);
  return data;
}

export async function undoCheckIn(id: number, localDate: string): Promise<HabitRead> {
  const { data } = await api.apiHabitCheckInUndoCreate(id, { local_date: localDate });
  return data;
}

export async function fetchCheckIns(
  id: number,
  start: string,
  end: string,
): Promise<HabitCheckInRead[]> {
  const resp = (await api.apiHabitCheckInsList(end, id, start)).data;
  return unwrapPaginatedList(resp as HabitCheckInRead[] | { results?: HabitCheckInRead[] });
}

/** Toggle a single day's check-in on the week strip / heatmap — the backend already
 * accepts any `local_date` (not just today), so this is the one place both cell-click
 * handlers call. `currentlyCompleted` decides undo vs. check-in, matching the "today"
 * toggle's own completed/not-completed logic. */
export async function toggleHabitCheckIn(
  habitId: number,
  dayKey: string,
  currentlyCompleted: boolean,
): Promise<void> {
  if (currentlyCompleted) {
    await undoCheckIn(habitId, dayKey);
  } else {
    await checkInHabit(habitId, { status: CheckInStatus.Completed, local_date: dayKey });
  }
}
