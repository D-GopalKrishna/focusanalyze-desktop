import {
  ApiApi,
  FocusAIRulesApi,
  FocusAISkillsApi,
  type PatchedUserRule,
  type PatchedUserSkill,
  type UserMemory,
  type UserRule,
  type UserSkill,
} from "@shared/api-client";
import { createApiClient } from '../auth';

export type { UserMemory, UserRule, UserSkill } from "@shared/api-client";

export interface UserRuleInput {
  title: string;
  body: string;
  enabled?: boolean;
  priority?: number;
}

export interface UserSkillInput {
  name: string;
  slug?: string;
  instructions: string;
  triggers?: string[];
  tool_scope?: string[];
  enabled?: boolean;
}

function requireApiUrl() {
  if (!process.env.NEXT_PUBLIC_API_URL) {
    throw new Error('NEXT_PUBLIC_API_URL is not configured');
  }
}

// ── Rules ───────────────────────────────────────────────────────────────────

const rulesClient = () => {
  requireApiUrl();
  return createApiClient(FocusAIRulesApi);
};

/** GET /api/focusgpt/rules/ */
export async function listUserRules(): Promise<UserRule[]> {
  const { data } = await rulesClient().apiFocusgptRulesList();
  return data;
}

/** POST /api/focusgpt/rules/ */
export async function createUserRule(input: UserRuleInput): Promise<UserRule> {
  const { data } = await rulesClient().apiFocusgptRulesCreate(input as UserRule);
  return data;
}

/** PATCH /api/focusgpt/rules/{id}/ */
export async function updateUserRule(id: number, input: Partial<UserRuleInput>): Promise<UserRule> {
  const { data } = await rulesClient().apiFocusgptRulesPartialUpdate(
    String(id),
    input as PatchedUserRule,
  );
  return data;
}

/** DELETE /api/focusgpt/rules/{id}/ */
export async function deleteUserRule(id: number): Promise<void> {
  await rulesClient().apiFocusgptRulesDestroy(String(id));
}

// ── Skills ──────────────────────────────────────────────────────────────────

const skillsClient = () => {
  requireApiUrl();
  return createApiClient(FocusAISkillsApi);
};

/** GET /api/focusgpt/skills/ */
export async function listUserSkills(): Promise<UserSkill[]> {
  const { data } = await skillsClient().apiFocusgptSkillsList();
  return data;
}

/** POST /api/focusgpt/skills/ */
export async function createUserSkill(input: UserSkillInput): Promise<UserSkill> {
  const { data } = await skillsClient().apiFocusgptSkillsCreate(input as UserSkill);
  return data;
}

/** PATCH /api/focusgpt/skills/{id}/ */
export async function updateUserSkill(
  id: number,
  input: Partial<UserSkillInput>,
): Promise<UserSkill> {
  const { data } = await skillsClient().apiFocusgptSkillsPartialUpdate(
    String(id),
    input as PatchedUserSkill,
  );
  return data;
}

/** DELETE /api/focusgpt/skills/{id}/ */
export async function deleteUserSkill(id: number): Promise<void> {
  await skillsClient().apiFocusgptSkillsDestroy(String(id));
}

// ── Memories ────────────────────────────────────────────────────────────────

const memoriesClient = () => {
  requireApiUrl();
  return createApiClient(ApiApi);
};

export interface ListUserMemoriesResult {
  results: UserMemory[];
  hasMore: boolean;
}

export interface ListUserMemoriesParams {
  limit?: number;
  offset?: number;
  /** Switches to semantic/BM25 search instead of paginating; ignores `offset`. */
  query?: string;
}

/** GET /api/focusgpt/memories/?limit=&offset=&q= */
export async function listUserMemories(
  params: ListUserMemoriesParams = {},
): Promise<ListUserMemoriesResult> {
  const { data } = await memoriesClient().apiFocusgptMemoriesRetrieve(
    params.limit,
    params.offset,
    params.query,
  );
  return { results: data.results, hasMore: data.has_more };
}

/** DELETE /api/focusgpt/memories/{id}/ */
export async function deleteUserMemory(id: string): Promise<void> {
  await memoriesClient().apiFocusgptMemoriesDestroy(id);
}
