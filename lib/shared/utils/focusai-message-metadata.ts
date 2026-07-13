import {
  CalendarProposeToolNameEnum,
  ProjectProposeToolNameEnum,
  TaskProposeToolNameEnum,
  type MessageMetadata,
} from "@shared/api-client";

/** Placeholder metadata for optimistic UI messages before the API returns full rows. */
export const EMPTY_MESSAGE_METADATA: MessageMetadata = {
  hitl: null,
  focusgpt_client_enums: {
    calendar_propose_tool_name: CalendarProposeToolNameEnum.ProposeCreateEventTool,
    task_propose_tool_name: TaskProposeToolNameEnum.ProposeCreateTaskTool,
    project_propose_tool_name: ProjectProposeToolNameEnum.ProposeCreateProjectTool,
  },
};
