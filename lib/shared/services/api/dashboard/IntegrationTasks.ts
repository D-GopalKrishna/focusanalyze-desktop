import { isAxiosError } from 'axios';
import {
  IntegrationTask,
  IntegrationTasksApi,
  IntegrationTasksResponse,
} from "@shared/api-client";
import {
  parseProRequiredFromResponse,
  ProSubscriptionRequiredError,
} from "@shared/utils/pro-subscription";
import { createApiClient } from '../auth';
import { axiosErrorBody } from '../openapiHelpers';

export { ProSubscriptionRequiredError };
export { isProSubscriptionRequiredError } from "@shared/utils/pro-subscription";

export type { IntegrationTask };

type IntegrationSource = 'notion' | 'jira' | 'github' | 'todoist' | 'gitlab';

const integrationTasksApi = createApiClient(IntegrationTasksApi);

function mapTaskFromApi(source: IntegrationSource, task: IntegrationTask): IntegrationTask {
  return {
    ...task,
    source,
  };
}

export function normalizeIntegrationTasksResponse(
  payload: IntegrationTasksResponse,
): IntegrationTask[] {
  const grouped: Array<[IntegrationSource, Array<IntegrationTask> | undefined]> = [
    ['notion', payload.notion],
    ['jira', payload.jira],
    ['github', payload.github],
    ['todoist', payload.todoist],
    ['gitlab', payload.gitlab],
  ];

  const normalized: IntegrationTask[] = [];

  grouped.forEach(([source, items]) => {
    (items ?? []).forEach((item) => {
      normalized.push(mapTaskFromApi(source, item));
    });
  });

  return normalized;
}

export type IntegrationTasksSource = 'notion' | 'jira' | 'github' | 'todoist' | 'gitlab' | 'all';

export type GetIntegrationTasksOptions = {
  notionQuery?: string;
  githubQuery?: string;
  jiraQuery?: string;
  todoistQuery?: string;
  gitlabQuery?: string;
  source?: IntegrationTasksSource;
  refresh?: boolean;
};

export async function getIntegrationTasks(
  options?: GetIntegrationTasksOptions,
): Promise<IntegrationTask[]> {
  const params: Record<string, string> = {};
  const notionQuery = options?.notionQuery?.trim();
  if (notionQuery) params.notion_q = notionQuery;
  const githubQuery = options?.githubQuery?.trim();
  if (githubQuery) params.github_q = githubQuery;
  const jiraQuery = options?.jiraQuery?.trim();
  if (jiraQuery) params.jira_q = jiraQuery;
  const todoistQuery = options?.todoistQuery?.trim();
  if (todoistQuery) params.todoist_q = todoistQuery;
  const gitlabQuery = options?.gitlabQuery?.trim();
  if (gitlabQuery) params.gitlab_q = gitlabQuery;
  const source = options?.source;
  if (source && source !== 'all') params.source = source;
  if (options?.refresh) params.refresh = 'true';

  try {
    const { data } = await integrationTasksApi.integrationsTasksRetrieve({
      params: Object.keys(params).length > 0 ? params : undefined,
      timeout: 60_000,
    });
    return normalizeIntegrationTasksResponse(data);
  } catch (err) {
    const bodyText = axiosErrorBody(err);
    const status = isAxiosError(err) ? (err.response?.status ?? 0) : 0;
    const proRequired = parseProRequiredFromResponse(status, bodyText);
    if (proRequired) {
      throw proRequired;
    }
    let detail = 'Failed to load integration tasks';
    try {
      const payload = JSON.parse(bodyText) as { detail?: string; error?: string };
      detail = payload.detail || payload.error || detail;
    } catch {
      // keep default
    }
    throw new Error(detail);
  }
}
