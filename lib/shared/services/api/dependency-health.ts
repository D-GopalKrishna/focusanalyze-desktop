import { cache } from 'react';
import { HealthApi } from "@shared/api-client";
import { createApiClient } from './auth';

const healthApi = createApiClient(HealthApi);

const checkBackendHealth = async (): Promise<boolean> => {
  if (!process.env.NEXT_PUBLIC_API_URL) return false;

  try {
    const response = await healthApi.apiHealthRetrieve();
    return response.status === 200;
  } catch {
    return false;
  }
};

/** Keycloak is a separate service — not in our OpenAPI client, so we probe its root URL directly. */
const checkKeycloakHealth = async (): Promise<boolean> => {
  const endpoint = process.env.NEXT_PUBLIC_KEYCLOAK_URL;
  if (!endpoint) return false;

  try {
    const response = await fetch(`${endpoint.replace(/\/$/, '')}/`, {
      cache: 'no-store',
      next: { revalidate: 0 },
    });
    return response.status === 200;
  } catch {
    return false;
  }
};

export const getDependencyHealthStatus = cache(async (): Promise<{ isHealthy: boolean }> => {
  const [backendHealth, keycloakHealth] = await Promise.all([
    checkBackendHealth(),
    checkKeycloakHealth(),
  ]);

  return {
    isHealthy: backendHealth && keycloakHealth,
  };
});
