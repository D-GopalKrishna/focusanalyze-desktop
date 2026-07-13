import type { ProjectColumn } from "@shared/api-client";
import { RoleF81Enum } from "@shared/api-client";

/**
 * Project board "to do" lane: first column with {@link RoleF81Enum} `Start` (API `ProjectColumn.role`);
 * the display name may be "To Do" but the stored role is always `START` (see `ProjectColumn` / `RoleF81Enum` in the OpenAPI spec).
 */
export function resolveDefaultTodoColumnId(columns: ProjectColumn[]): number | undefined {
  if (!columns.length) return undefined;
  const byOrder = (a: ProjectColumn, b: ProjectColumn) => (a.order ?? 0) - (b.order ?? 0);
  const startLanes = columns.filter((c) => c.role === RoleF81Enum.Start);
  const pick =
    startLanes.length > 0 ? [...startLanes].sort(byOrder)[0] : [...columns].sort(byOrder)[0];
  return pick?.id;
}
