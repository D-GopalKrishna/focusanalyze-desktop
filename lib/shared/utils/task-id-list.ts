/** Dedupe + sort so an equivalent id list (any order, with repeats) produces a stable query set. */
export function uniqueSortedTaskIds(taskIds: number[]): number[] {
  return Array.from(new Set(taskIds)).sort((a, b) => a - b);
}
