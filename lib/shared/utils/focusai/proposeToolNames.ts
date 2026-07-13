import {
  CalendarProposeToolNameEnum,
  FocusGPTProposeToolNameEnum,
  HitlDecisionTypeEnum,
  ProjectProposeToolNameEnum,
  TaskProposeToolNameEnum,
  type HitlPendingAction,
} from "@shared/api-client";

export {
  CalendarProposeToolNameEnum,
  FocusGPTProposeToolNameEnum,
  HitlDecisionTypeEnum,
  ProjectProposeToolNameEnum,
  TaskProposeToolNameEnum,
  type HitlPendingAction,
};

export const CALENDAR_PROPOSE_TOOL_NAMES = new Set<string>(
  Object.values(CalendarProposeToolNameEnum),
);

export const TASK_PROPOSE_TOOL_NAMES = new Set<string>(Object.values(TaskProposeToolNameEnum));

export const PROJECT_PROPOSE_TOOL_NAMES = new Set<string>(
  Object.values(ProjectProposeToolNameEnum),
);

export const MINI_PANEL_PROPOSE_TOOL_NAMES = new Set<string>([
  ...CALENDAR_PROPOSE_TOOL_NAMES,
  ...TASK_PROPOSE_TOOL_NAMES,
  ...PROJECT_PROPOSE_TOOL_NAMES,
  FocusGPTProposeToolNameEnum.ProposePlanBlocksTool,
]);

export type CalendarPendingAction = HitlPendingAction;

/** Approve/reject only — mini panel and agent-resume do not use ``edit``. */
export type CalendarDecision =
  | typeof HitlDecisionTypeEnum.Approve
  | typeof HitlDecisionTypeEnum.Reject;

export type HitlResumeDecisionPayload = { type: CalendarDecision; message?: string };
