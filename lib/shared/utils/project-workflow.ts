/**
 * Create-project payload builder for `Project` workflow (BOARD/CHECKLIST).
 *
 * `POST /api/project/` is served by `ProjectViewSet.create()`, which always instantiates
 * `ProjectCreateSerializer` directly — that serializer's only writable knob for workflow is
 * `is_checklist` (bool); it converts that to `workflow` server-side and does not accept a raw
 * `workflow` key at all. Before `focusanalyze-mind`'s `create()` override carried an
 * `@extend_schema(request=ProjectCreateSerializer)` annotation, the generated OpenAPI schema
 * (and this repo's TS client) mis-documented the create request as the general `Project`
 * shape instead, where `workflow` looks like a normal writable field. A fix built against
 * that stale schema (GitHub #125) swapped this payload's `is_checklist` for `workflow`,
 * which the real create serializer silently drops — same silent-BOARD regression it claimed
 * to fix, just via a different field name. Keep sending `is_checklist` here; see
 * `apis/tests/api/project/test_project_workflow.py::ProjectCreateEndpointWorkflowTests` for
 * the backend-side lock on this contract.
 */
export interface CreateProjectPayload {
  name: string;
  description: string;
  category: number | null;
  has_track: boolean;
  is_checklist: boolean;
  color: string;
  /** Create the project inside one of the user's sidebar groups; omitted for the top level. */
  group_id?: number;
}

export function buildCreateProjectPayload(input: {
  name: string;
  description: string;
  category: number | null;
  useSprints: boolean;
  isChecklist: boolean;
  color: string;
  groupId?: number | null;
}): CreateProjectPayload {
  return {
    name: input.name,
    description: input.description,
    category: input.category,
    has_track: input.useSprints,
    is_checklist: input.isChecklist,
    color: input.color,
    ...(input.groupId != null ? { group_id: input.groupId } : {}),
  };
}
