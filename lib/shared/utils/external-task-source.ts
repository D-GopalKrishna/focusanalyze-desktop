import { SourceEnum } from "@shared/api-client/api";

/**
 * Map external URL hostnames to API SourceEnum (same values as task.external_source from backend).
 */
export function inferExternalSourceFromUrl(url: string | null | undefined): SourceEnum | null {
  if (!url || typeof url !== 'string') return null;
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.includes('notion.so')) return SourceEnum.Notion;
  if (host.includes('atlassian.net') || host.endsWith('jira.com')) return SourceEnum.Jira;
  if (host.includes('github.com')) return SourceEnum.Github;
  if (host.includes('todoist.com')) return SourceEnum.Todoist;
  if (host.includes('gitlab.com') || host.endsWith('.gitlab.io')) return SourceEnum.Gitlab;
  return null;
}

/** Integration sidebar task sources (API uses lowercase: notion, jira, github, todoist, gitlab). */
export const INTEGRATION_SIDEBAR_SOURCES = [
  'notion',
  'jira',
  'todoist',
  'github',
  'gitlab',
] as const;
export type IntegrationSidebarSource = (typeof INTEGRATION_SIDEBAR_SOURCES)[number] | 'all';
