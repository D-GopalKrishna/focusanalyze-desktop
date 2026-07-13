/**
 * Keycloak token payload shape (access token).
 * See: https://www.keycloak.org/docs-api/latest/javadocs/org/keycloak/representations/AccessToken.html
 */
export type KeycloakTokenPayload = {
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
  [key: string]: unknown;
};

/** Keycloak-js fields we use to read roles (access + ID token may differ per realm/client scopes). */
export type KeycloakRoleTokenSources = {
  token?: string;
  tokenParsed?: KeycloakTokenPayload | null;
  idToken?: string;
  idTokenParsed?: KeycloakTokenPayload | null;
};

/** Roles that grant access to admin pages (e.g. group admin sees admin UI). */
const ADMIN_ROLE_NAMES = ['admin', 'administrator', 'realm-admin', 'superadmin', 'group_admin'];

function hasAdminRole(roles: string[]): boolean {
  const lower = roles.map((r) => r.toLowerCase());
  return ADMIN_ROLE_NAMES.some((adminName) =>
    lower.some((r) => r === adminName || r.endsWith('-' + adminName) || r.includes(adminName)),
  );
}

/**
 * Returns true if the given Keycloak token payload (e.g. keycloak.tokenParsed)
 * indicates an admin user (realm or client roles).
 */
export function isAdminFromTokenPayload(payload: KeycloakTokenPayload | undefined | null): boolean {
  if (!payload) return false;

  const realmRoles = payload.realm_access?.roles ?? [];
  if (hasAdminRole(realmRoles)) return true;

  const resourceAccess = payload.resource_access ?? {};
  for (const clientRoles of Object.values(resourceAccess)) {
    const roles = clientRoles?.roles ?? [];
    if (hasAdminRole(roles)) return true;
  }

  return false;
}

/**
 * Returns true if the token payload has the group_admin role (realm or client).
 * Use this when you need to distinguish group admins from other admin roles.
 */
export function isGroupAdminFromTokenPayload(
  payload: KeycloakTokenPayload | undefined | null,
): boolean {
  if (!payload) return false;

  const realmRoles = payload.realm_access?.roles ?? [];
  if (realmRoles.map((r) => r.toLowerCase()).includes('group-admin')) return true;

  const resourceAccess = payload.resource_access ?? {};
  for (const clientRoles of Object.values(resourceAccess)) {
    const roles = clientRoles?.roles ?? [];
    if (roles.map((r) => r.toLowerCase()).includes('group-admin')) return true;
  }

  return false;
}

/**
 * Returns true if the token payload has the organization-admin role (realm or client).
 */
export function isOrganizationAdminFromTokenPayload(
  payload: KeycloakTokenPayload | undefined | null,
): boolean {
  if (!payload) return false;

  const realmRoles = payload.realm_access?.roles ?? [];
  if (realmRoles.map((r) => r.toLowerCase()).includes('organization-admin')) return true;

  const resourceAccess = payload.resource_access ?? {};
  for (const clientRoles of Object.values(resourceAccess)) {
    const roles = clientRoles?.roles ?? [];
    if (roles.map((r) => r.toLowerCase()).includes('organization-admin')) return true;
  }

  return false;
}

/**
 * Whether the Share project entry points should appear (UI only).
 * Requires an organization context from the API and org-admin or team (group) admin in Keycloak.
 */
export function canShareOrganizationProjects(
  organizationId: number | null | undefined,
  isOrganizationAdmin: boolean,
  isGroupAdmin: boolean,
): boolean {
  if (organizationId == null || organizationId < 1) return false;
  return isOrganizationAdmin || isGroupAdmin;
}

/**
 * Decodes a JWT's payload without verification (client-side only, for reading claims).
 * Use only for non-security-critical UI (e.g. showing/hiding nav). Backend must enforce auth.
 */
export function getJwtExpirySeconds(token: string | undefined | null): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') {
    return null;
  }
  return payload.exp;
}

/** Client-side expiry check (no signature verification). Skew avoids edge-of-expiry 401s. */
export function isAccessTokenExpired(token: string | undefined | null, skewSeconds = 30): boolean {
  if (!token) {
    return true;
  }
  const exp = getJwtExpirySeconds(token);
  if (exp === null) {
    return false;
  }
  return exp <= Math.floor(Date.now() / 1000) + skewSeconds;
}

export function decodeJwtPayload(token: string | undefined | null): KeycloakTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    if (typeof atob === 'undefined') return null;
    const json = atob(base64);
    return JSON.parse(json) as KeycloakTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Effective JWT payloads to inspect for realm/client roles.
 * Prefer decoding the raw JWT strings so we never lag behind `tokenParsed` after refresh.
 */
export function keycloakSessionRolePayloads(
  sources: KeycloakRoleTokenSources,
): KeycloakTokenPayload[] {
  const access =
    decodeJwtPayload(sources.token) ??
    (sources.tokenParsed as KeycloakTokenPayload | undefined) ??
    null;
  const id =
    decodeJwtPayload(sources.idToken) ??
    (sources.idTokenParsed as KeycloakTokenPayload | undefined) ??
    null;
  const out: KeycloakTokenPayload[] = [];
  if (access) out.push(access);
  if (id) out.push(id);
  return out;
}

export function isOrganizationAdminFromKeycloak(sources: KeycloakRoleTokenSources): boolean {
  return keycloakSessionRolePayloads(sources).some((p) => isOrganizationAdminFromTokenPayload(p));
}

export function isGroupAdminFromKeycloak(sources: KeycloakRoleTokenSources): boolean {
  return keycloakSessionRolePayloads(sources).some((p) => isGroupAdminFromTokenPayload(p));
}

export function isAdminFromKeycloak(sources: KeycloakRoleTokenSources): boolean {
  return keycloakSessionRolePayloads(sources).some((p) => isAdminFromTokenPayload(p));
}

/**
 * Returns true if the fa_access_token (or any JWT string) payload contains admin roles.
 * Use when you only have the token string (e.g. from cookie).
 */
export function isAdminFromTokenString(token: string | undefined | null): boolean {
  const payload = decodeJwtPayload(token);
  return isAdminFromTokenPayload(payload);
}
