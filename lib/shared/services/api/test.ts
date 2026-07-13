import { ApiApi } from "@shared/api-client";
import { createApiClient } from './auth';

const api = createApiClient(ApiApi);

/** GET /api/test/ — backend health/list probe (optional auth). */
export async function fetchTest(): Promise<unknown> {
  try {
    const response = await api.apiTestList();
    return response.data;
  } catch (error) {
    console.error('Error fetching test data: ', error);
    throw error;
  }
}
