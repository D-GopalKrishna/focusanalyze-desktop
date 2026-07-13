import { isAllowedReturnPath } from '@/lib/middleware/post-auth-redirect';
import {
  ONBOARDING_CALENDAR_INTEGRATION,
  ONBOARDING_PROJECT_INTEGRATION,
  SETTINGS_CALENDAR_INTEGRATION,
  SETTINGS_PROJECT_INTEGRATION,
} from '@/lib/config/urls';

const STORAGE_KEY = 'fa_integration_return_url';

/** Remember where the user started OAuth (onboarding vs settings). */
export function storeIntegrationReturnUrl(path?: string) {
  if (typeof window === 'undefined') {
    return;
  }
  const returnPath = path ?? `${window.location.pathname}${window.location.search}`;
  if (!isAllowedReturnPath(returnPath)) {
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, returnPath);
}

export function consumeIntegrationReturnUrl(fallback: string): string {
  if (typeof window === 'undefined') {
    return fallback;
  }
  const stored = sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  if (stored && isAllowedReturnPath(stored)) {
    return stored;
  }
  return fallback;
}

export type ProjectIntegrationSlug = 'jira' | 'notion' | 'github' | 'todoist' | 'gitlab';

export function buildProjectIntegrationReturnUrl(
  slug: ProjectIntegrationSlug,
  fallbackBase: string = SETTINGS_PROJECT_INTEGRATION,
): string {
  const base = consumeIntegrationReturnUrl(fallbackBase);
  const url = new URL(base, 'http://local');
  url.searchParams.set('integration', slug);
  return `${url.pathname}${url.search}`;
}

export function isOnboardingIntegrationPath(path: string): boolean {
  return (
    path.startsWith(ONBOARDING_CALENDAR_INTEGRATION) ||
    path.startsWith(ONBOARDING_PROJECT_INTEGRATION)
  );
}
