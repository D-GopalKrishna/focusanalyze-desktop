export type AllocationCadence = 'day' | 'week' | 'month';

export const cadenceToMultiplier: Record<AllocationCadence, number> = {
  day: 1,
  week: 7,
  month: 30,
};

export function parseHours(value: string) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export function getPlaceholderAllocationWeight(projectId: number) {
  // UI-only: deterministic weights so the list doesn't "shuffle" between renders.
  return ((projectId * 7 + 13) % 10) + 3; // 3..12
}
