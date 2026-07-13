import globalAxios, { isAxiosError } from 'axios';
import { type RequestArgs } from "@shared/api-client/base";
import { createRequestFunction } from "@shared/api-client/common";
import { createApiConfiguration } from './auth';

const configuration = createApiConfiguration();

/** Multipart body override — generated clients default to JSON for these endpoints. */
export async function executeMultipartApiRequest<T>(
  axiosArgs: RequestArgs,
  form: FormData,
): Promise<T> {
  const requestFn = createRequestFunction(
    {
      url: axiosArgs.url,
      options: {
        ...axiosArgs.options,
        data: form,
        headers: {
          ...(axiosArgs.options.headers as Record<string, string>),
          'Content-Type': 'multipart/form-data',
        },
      },
    },
    globalAxios,
    '',
    configuration,
  );
  const resp = await requestFn<T>(globalAxios, configuration.basePath);
  return resp.data;
}

/**
 * SSE streaming — browser needs fetch ReadableStream; URL + Bearer auth come from Api*AxiosParamCreator.
 */
export async function fetchApiEventStream(
  axiosArgs: RequestArgs,
  body?: NonNullable<Parameters<typeof fetch>[1]>['body'],
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const basePath = configuration.basePath?.replace(/\/$/, '') ?? '';
  const url = `${basePath}${axiosArgs.url}`;
  const headers = axiosArgs.options.headers as Record<string, string>;
  const { 'Content-Type': _ignored, ...authHeaders } = headers;

  const resp = await fetch(url, {
    method: axiosArgs.options.method ?? 'GET',
    headers: {
      ...authHeaders,
      ...(body != null && !(body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    body,
    signal,
  });

  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error(text || `Request failed (${resp.status})`) as Error & {
      status: number;
    };
    err.status = resp.status;
    throw err;
  }
  if (!resp.body) {
    throw new Error('Stream response had no body');
  }
  return resp.body;
}

export function axiosErrorBody(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data;
    return typeof data === 'string' ? data : JSON.stringify(data ?? err.message ?? '');
  }
  return err instanceof Error ? err.message : 'Request failed';
}
