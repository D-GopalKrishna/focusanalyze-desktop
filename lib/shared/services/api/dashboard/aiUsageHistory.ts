import {
  ApiApi,
  type AIUsageHistoryItem,
  type AIUsageHistoryResponse,
} from "@shared/api-client";
import { createApiClient } from '../auth';

export type {
  AIUsageHistoryResponse,
  AIUsageSummary,
  AIUsageHistoryItem,
} from "@shared/api-client";

function num(v: string | number | undefined | null): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Normalizes API decimals that may arrive as strings. */
export function parseUsageItemTokens(item: AIUsageHistoryItem): number {
  return num(item.tokens_used);
}

export function parseUsageItemCost(item: AIUsageHistoryItem): number {
  return num(item.cost_estimate);
}

/**
 * GET /api/focusgpt/ai-usage/history/
 * Monthly summary + paginated credit log for the signed-in user.
 */
export async function fetchAiUsageHistory(offset = 0, limit = 30): Promise<AIUsageHistoryResponse> {
  if (!process.env.NEXT_PUBLIC_API_URL) {
    throw new Error('NEXT_PUBLIC_API_URL is not configured');
  }
  const api = createApiClient(ApiApi);
  const { data } = await api.apiFocusgptAiUsageHistoryRetrieve(limit, offset);
  return data;
}
