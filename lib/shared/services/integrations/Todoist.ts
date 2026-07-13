import type { AxiosError } from 'axios';
import {
  TodoistApi,
  type TodoistAuthUrlResponse,
  type TodoistStatusResponse,
} from "@shared/api-client";
import { createApiClient } from "@shared/services/api/auth";

const api = createApiClient(TodoistApi);

export const integrateTodoistAuthUrlRetrieve = async (): Promise<TodoistAuthUrlResponse> => {
  const res = await api.integrationsTodoistAuthUrlRetrieve();
  return res.data;
};

export const integrateTodoistStatusRetrieve = async (): Promise<TodoistStatusResponse> => {
  const res = await api.integrationsTodoistStatusRetrieve();
  return res.data;
};

export const integrateTodoistCallbackRetrieve = async (code: string, state: string | null) => {
  const res = await api.integrationsTodoistCallbackRetrieve({
    params: {
      code,
      ...(state ? { state } : {}),
    },
  });
  return (res.data ?? {}) as { success?: boolean; error?: string };
};

export const integrateTodoistDisconnect = async () => {
  try {
    await api.integrationsTodoistDisconnectDestroy();
  } catch (error) {
    const ax = error as AxiosError<{ error?: string }>;
    const msg = ax.response?.data?.error ?? ax.message ?? 'Disconnect failed';
    throw new Error(msg);
  }
};
