import axios from 'axios';
import { deleteCookie, getCookie, setCookie } from 'cookies-next';
import { Configuration, type ConfigurationParameters } from "@shared/api-client";
import { isAccessTokenExpired } from "@shared/utils/auth";
import { getFreshAccessToken } from '@/lib/middleware/keycloak';
import { stripBoundarylessMultipartContentType } from "@shared/utils/axios-multipart-formdata";

const ACCESS_TOKEN_COOKIE = 'fa_access_token';
const COOKIE_OPTIONS = { path: '/' } as const;

// Every generated API class defaults to this exact axios singleton when no custom instance
// is passed (`BaseAPI`'s `axios: AxiosInstance = globalAxios` in
// lib/rest_client_backend/base.ts — `createApiClient` below never passes one), so this one
// interceptor covers every multipart endpoint in the app. See
// stripBoundarylessMultipartContentType's doc comment for why it's needed.
axios.interceptors.request.use(stripBoundarylessMultipartContentType);

/** Sync token resolver — web defaults to cookie; mobile should inject in-memory / context storage. */
export type AccessTokenProvider = () => string | undefined;

let accessTokenProvider: AccessTokenProvider = readWebAccessToken;

function readWebAccessToken(): string | undefined {
  const value = getCookie(ACCESS_TOKEN_COOKIE, COOKIE_OPTIONS);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Override how services resolve the JWT (e.g. React Native auth context).
 * Call once at app bootstrap; provider must be synchronous.
 */
export function setAccessTokenProvider(provider: AccessTokenProvider): void {
  accessTokenProvider = provider;
}

/** @deprecated Prefer `getAccessToken`; kept for existing imports from `./user`. */
export function getToken(): string | undefined {
  return getAccessToken();
}

export function getAccessToken(): string | undefined {
  return accessTokenProvider();
}

export function hasStoredAccessToken(): boolean {
  return Boolean(getAccessToken());
}

/** Cookie exists but JWT is missing or past `exp` (client-side check). */
export function hasStaleAccessTokenCookie(): boolean {
  return hasStoredAccessToken() && !hasUsableAccessToken();
}

/** Cookie present and JWT `exp` is still in the future (client-side only). */
export function hasUsableAccessToken(): boolean {
  const token = getAccessToken();
  return Boolean(token && !isAccessTokenExpired(token));
}

export function setAccessTokenCookie(token: string): void {
  setCookie(ACCESS_TOKEN_COOKIE, token, COOKIE_OPTIONS);
}

export function clearAccessTokenCookie(): void {
  deleteCookie(ACCESS_TOKEN_COOKIE, COOKIE_OPTIONS);
}

/**
 * Plain header map for `fetch` / SSE / other non-OpenAPI clients.
 * @deprecated Reads the cookie as-is with no refresh check — prefer `getFreshAuthHeader()`
 * for anything that fires a real request. Keep using this only for fire-and-forget /
 * keepalive sends (e.g. unload beacons) where awaiting a refresh isn't safe.
 */
export function bearerAuthorizationHeader(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Bearer header built from a proactively-refreshed token. Use this (not
 * `bearerAuthorizationHeader`) for any request that can `await` — it refreshes the
 * token first when it's close to expiry instead of sending a stale one and hoping
 * the 401-retry interceptor catches it.
 */
export async function getFreshAuthHeader(): Promise<Record<string, string>> {
  const token = await getFreshAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Axios options with a fresh Bearer token.
 * Prefer `createApiConfiguration()` so generated clients attach auth automatically;
 * use this when merging auth with extra request options (params, signal, etc.).
 */
export async function freshAuthRequestOptions() {
  return {
    headers: await getFreshAuthHeader(),
  } as const;
}

/** @deprecated Sync variant of `freshAuthRequestOptions` — same staleness caveat as `bearerAuthorizationHeader`. */
export function authRequestOptions() {
  return {
    headers: bearerAuthorizationHeader(),
  } as const;
}

/** Shared OpenAPI client configuration (Bearer JWT via `accessToken` only — not `apiKey`). */
export function createApiConfiguration(
  overrides?: Partial<ConfigurationParameters>,
): Configuration {
  return new Configuration({
    accessToken: async () => (await getFreshAccessToken()) ?? '',
    basePath: process.env.NEXT_PUBLIC_API_URL,
    ...overrides,
  });
}

/** Instantiate a generated API class with shared auth configuration. */
export function createApiClient<T>(
  ApiClass: new (configuration?: Configuration) => T,
  overrides?: Partial<ConfigurationParameters>,
): T {
  return new ApiClass(createApiConfiguration(overrides));
}
