import { isAxiosError } from 'axios';
import { CustomTheme, CustomThemeApi } from "@shared/api-client";
import { createApiClient } from '../auth';

const api = createApiClient(CustomThemeApi);

export class CustomThemeApiUnavailableError extends Error {
  constructor() {
    super('Custom theme API is not available on this server.');
    this.name = 'CustomThemeApiUnavailableError';
  }
}

function isCustomThemeApiUnavailable(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}

export interface CustomThemeInput {
  name: string;
  background_color: string;
  primary_color: string;
  secondary_color: string;
}

async function listCustomThemes(): Promise<CustomTheme[]> {
  try {
    const response = await api.apiCustomThemeList(200, 0);
    return response.data.results ?? [];
  } catch (error) {
    // Older backends without FA-948 — treat as "no saved themes yet".
    if (isCustomThemeApiUnavailable(error)) {
      return [];
    }
    throw error;
  }
}

async function createCustomTheme(input: CustomThemeInput): Promise<CustomTheme> {
  try {
    const response = await api.apiCustomThemeCreate(input as CustomTheme);
    return response.data;
  } catch (error) {
    if (isCustomThemeApiUnavailable(error)) {
      throw new CustomThemeApiUnavailableError();
    }
    throw error;
  }
}

async function updateCustomTheme(id: number, input: CustomThemeInput): Promise<CustomTheme> {
  const response = await api.apiCustomThemePartialUpdate(String(id), input);
  return response.data;
}

async function deleteCustomTheme(id: number): Promise<void> {
  await api.apiCustomThemeDestroy(String(id));
}

export { listCustomThemes, createCustomTheme, updateCustomTheme, deleteCustomTheme };
