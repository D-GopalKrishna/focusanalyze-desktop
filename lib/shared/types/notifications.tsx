import { SourceEnum } from "@shared/api-client/api";

/** Color / high-contrast artwork so logos stay visible on dark UI (avoid thin outline-only assets). */
export const sourceIcons = {
  [SourceEnum.Todoist]: 'https://img.icons8.com/color/48/todoist.png',
  [SourceEnum.Jira]: 'https://img.icons8.com/color/48/jira.png',
  [SourceEnum.Notion]: 'https://img.icons8.com/fluency/48/notion.png',
  [SourceEnum.Github]: 'https://img.icons8.com/glyph-neue/64/FFFFFF/github.png',
  [SourceEnum.Gitlab]: 'https://img.icons8.com/color/48/gitlab.png',
  [SourceEnum.Focusanalyze]: '/favicon-32x32.png',
};

export const sourceColors = {
  [SourceEnum.Focusanalyze]: 'bg-blue-500/10 text-blue-500',
  [SourceEnum.Todoist]: 'bg-red-500/10 text-red-500',
  [SourceEnum.Jira]: 'bg-blue-400/10 text-blue-400',
  [SourceEnum.Notion]: 'bg-gray-500/10 text-gray-400',
  [SourceEnum.Github]: 'bg-purple-500/10 text-purple-500',
  [SourceEnum.Gitlab]: 'bg-orange-500/10 text-orange-500',
};
