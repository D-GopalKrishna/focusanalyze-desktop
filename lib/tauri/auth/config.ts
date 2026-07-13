/** OAuth callback port — must match Keycloak redirect URIs and Rust listener. */
export const OAUTH_CALLBACK_PORT = 9473;

export const AUTH_CONFIG = {
  keycloakUrl:
    process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? "http://localhost:8080",
  realm: "focusanalyze",
  clientId:
    process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? "focusanalyze-desktop",
  backendBaseUrl:
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  oauthScopes: "openid profile email offline_access",
  oauthCallbackPort: OAUTH_CALLBACK_PORT,
} as const;

export function getOAuthRedirectUri(): string {
  return `http://127.0.0.1:${AUTH_CONFIG.oauthCallbackPort}/callback`;
}

export function getKeycloakTokenUrl(): string {
  return `${AUTH_CONFIG.keycloakUrl}/realms/${AUTH_CONFIG.realm}/protocol/openid-connect/token`;
}

export function getKeycloakAuthUrl(): string {
  return `${AUTH_CONFIG.keycloakUrl}/realms/${AUTH_CONFIG.realm}/protocol/openid-connect/auth`;
}

export function getKeycloakRegistrationUrl(): string {
  return `${AUTH_CONFIG.keycloakUrl}/realms/${AUTH_CONFIG.realm}/protocol/openid-connect/registrations`;
}

export function getKeycloakUserInfoUrl(): string {
  return `${AUTH_CONFIG.keycloakUrl}/realms/${AUTH_CONFIG.realm}/protocol/openid-connect/userinfo`;
}

export function getKeycloakLogoutUrl(): string {
  return `${AUTH_CONFIG.keycloakUrl}/realms/${AUTH_CONFIG.realm}/protocol/openid-connect/logout`;
}
