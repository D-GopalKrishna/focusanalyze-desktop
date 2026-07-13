import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AUTH_CONFIG,
  getKeycloakAuthUrl,
  getKeycloakLogoutUrl,
  getKeycloakRegistrationUrl,
  getKeycloakTokenUrl,
  getKeycloakUserInfoUrl,
  getOAuthRedirectUri,
} from "./config";
import { createOAuthState, createPkcePair } from "./pkce";
import {
  beginOAuthCallbackListener,
  cancelOAuthCallbackListener,
  clearTokensFromKeychain,
  isTauriRuntime,
  loadTokensFromKeychain,
  saveTokensToKeychain,
  waitForOAuthCallback,
} from "./tauri-store";
import type { AuthTokens, AuthUserInfo, SignInOptions } from "./types";

const TOKEN_SKEW_SECONDS = 60;

function withExpiry(
  tokens: Omit<AuthTokens, "expiresAt">
): AuthTokens {
  return {
    ...tokens,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
  };
}

function isAccessTokenExpired(tokens: AuthTokens): boolean {
  return Date.now() >= tokens.expiresAt - TOKEN_SKEW_SECONDS * 1000;
}

function getUserDisplayNameFromInfo(user: AuthUserInfo | null): string | null {
  if (!user) return null;

  const firstName = user.given_name ?? "";
  const lastName = user.family_name ?? "";
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) return fullName;
  if (user.preferred_username) return user.preferred_username;
  if (user.email) return user.email;
  return null;
}

function getUserDisplayNameFromToken(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const parsed = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return getUserDisplayNameFromInfo(parsed as AuthUserInfo);
  } catch {
    return null;
  }
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<AuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: AUTH_CONFIG.clientId,
    code,
    redirect_uri: getOAuthRedirectUri(),
    code_verifier: codeVerifier,
  });

  const response = await fetch(getKeycloakTokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status} - ${responseText}`);
  }

  const tokens = JSON.parse(responseText) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
  };

  if (!tokens.refresh_token) {
    throw new Error("Keycloak did not return a refresh token (offline_access required)");
  }

  return withExpiry({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    expiresIn: tokens.expires_in,
  });
}

async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: AUTH_CONFIG.clientId,
    refresh_token: refreshToken,
  });

  const response = await fetch(getKeycloakTokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status} - ${responseText}`);
  }

  const tokens = JSON.parse(responseText) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
  };

  return withExpiry({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? refreshToken,
    idToken: tokens.id_token,
    expiresIn: tokens.expires_in,
  });
}

async function fetchUserInfo(accessToken: string): Promise<AuthUserInfo> {
  const response = await fetch(getKeycloakUserInfoUrl(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.status}`);
  }

  return (await response.json()) as AuthUserInfo;
}

function buildAuthorizationUrl(
  endpoint: string,
  codeChallenge: string,
  state: string,
  options?: SignInOptions
): string {
  const params = new URLSearchParams({
    client_id: AUTH_CONFIG.clientId,
    redirect_uri: getOAuthRedirectUri(),
    response_type: "code",
    scope: AUTH_CONFIG.oauthScopes,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  if (options?.loginHint) {
    params.set("login_hint", options.loginHint);
  }
  if (options?.idpHint) {
    params.set("kc_idp_hint", options.idpHint);
  }

  return `${endpoint}?${params.toString()}`;
}

async function runBrowserOAuthFlow(
  endpoint: string,
  options?: SignInOptions
): Promise<AuthTokens | null> {
  if (!isTauriRuntime()) {
    throw new Error("Desktop sign-in requires the Tauri app (npm run tauri:dev)");
  }

  const { codeVerifier, codeChallenge } = await createPkcePair();
  const state = createOAuthState();
  const authUrl = buildAuthorizationUrl(endpoint, codeChallenge, state, options);

  await beginOAuthCallbackListener();

  try {
    await openUrl(authUrl);
    const code = await waitForOAuthCallback(state);
    const tokens = await exchangeCodeForTokens(code, codeVerifier);
    await saveTokensToKeychain(tokens);
    return tokens;
  } catch (error) {
    await cancelOAuthCallbackListener();
    throw error;
  }
}

let memoryTokens: AuthTokens | null = null;

export async function restoreSession(): Promise<{
  tokens: AuthTokens | null;
  user: AuthUserInfo | null;
}> {
  if (!isTauriRuntime()) {
    return { tokens: null, user: null };
  }

  let tokens = await loadTokensFromKeychain();
  if (!tokens?.refreshToken) {
    memoryTokens = null;
    return { tokens: null, user: null };
  }

  try {
    if (isAccessTokenExpired(tokens)) {
      tokens = await refreshTokens(tokens.refreshToken);
      await saveTokensToKeychain(tokens);
    }
  } catch {
    await clearTokensFromKeychain();
    memoryTokens = null;
    return { tokens: null, user: null };
  }

  memoryTokens = tokens;

  try {
    const user = await fetchUserInfo(tokens.accessToken);
    return { tokens, user };
  } catch {
    return {
      tokens,
      user: null,
    };
  }
}

export async function ensureValidAccessToken(): Promise<AuthTokens | null> {
  let tokens = memoryTokens ?? (await loadTokensFromKeychain());
  if (!tokens?.refreshToken) {
    return null;
  }

  if (!isAccessTokenExpired(tokens)) {
    memoryTokens = tokens;
    return tokens;
  }

  tokens = await refreshTokens(tokens.refreshToken);
  await saveTokensToKeychain(tokens);
  memoryTokens = tokens;
  return tokens;
}

export async function signIn(options?: SignInOptions): Promise<void> {
  const tokens = await runBrowserOAuthFlow(getKeycloakAuthUrl(), options);
  if (!tokens) {
    throw new Error("Sign-in was cancelled");
  }
  memoryTokens = tokens;
}

export async function signUp(): Promise<void> {
  const tokens = await runBrowserOAuthFlow(getKeycloakRegistrationUrl());
  if (!tokens) {
    throw new Error("Registration was cancelled");
  }
  memoryTokens = tokens;
}

export async function signOut(): Promise<void> {
  const tokens = memoryTokens ?? (await loadTokensFromKeychain());

  if (tokens?.refreshToken) {
    try {
      const body = new URLSearchParams({
        client_id: AUTH_CONFIG.clientId,
        refresh_token: tokens.refreshToken,
      });
      await fetch(getKeycloakLogoutUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
    } catch (error) {
      console.error("Keycloak logout failed", error);
    }
  }

  await clearTokensFromKeychain();
  memoryTokens = null;
}

export function getCurrentAccessToken(): string | null {
  return memoryTokens?.accessToken ?? null;
}

export function getCurrentUserDisplayName(user: AuthUserInfo | null): string | null {
  if (user) {
    return getUserDisplayNameFromInfo(user);
  }

  const accessToken = memoryTokens?.accessToken;
  if (!accessToken) return null;
  return getUserDisplayNameFromToken(accessToken);
}

export function getCurrentUserEmail(user: AuthUserInfo | null): string | null {
  if (user?.email) return user.email;

  const accessToken = memoryTokens?.accessToken;
  if (!accessToken) return null;

  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const parsed = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof parsed.email === "string" ? parsed.email : null;
  } catch {
    return null;
  }
}

export { isTauriRuntime };
