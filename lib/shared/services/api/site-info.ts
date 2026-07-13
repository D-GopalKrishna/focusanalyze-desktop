import { cache } from 'react';
import { ApiApi } from "@shared/api-client";
import { createApiClient } from './auth';

const api = createApiClient(ApiApi);

/** GET /api/siteinfo/<key>/ — public, unauthenticated, read-only config lookup. */
export const getSiteInfoValue = cache(async (key: string): Promise<unknown | undefined> => {
  try {
    const response = await api.apiSiteinfoRetrieve(key);
    return response.data.value;
  } catch {
    return undefined;
  }
});

/**
 * Drives the "beta" chip on FocusAnalyzeLogo and beta pricing.
 * Defaults to false (not beta) if the key isn't set yet — a missing/unreachable
 * config must never silently show beta-only pricing.
 */
export const isBetaEnabled = cache(async (): Promise<boolean> => {
  const value = await getSiteInfoValue('beta_enabled');
  return value === undefined ? false : Boolean(value);
});
