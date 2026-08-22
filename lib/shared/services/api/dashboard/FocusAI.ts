import { isAxiosError } from 'axios';
import {
  ApiApi,
  ApiApiAxiosParamCreator,
  ApiFocusgptMessageCreatePlanScopeEnum,
  Conversation,
  ContextEnum,
  PaginatedConversationListList,
} from "@shared/api-client";
import { createApiClient, createApiConfiguration } from '../auth';
import { getFreshAccessToken } from '@/lib/middleware/keycloak';
import { axiosErrorBody, executeMultipartApiRequest, fetchApiEventStream } from '../openapiHelpers';
import type { HitlDecision } from "@shared/api-client";
import { parseFocusAiSseStream } from "@shared/utils/focusai/parseSseStream";
import {
  appendFocusAiAguiProtocol,
  isFocusAiAguiEnabled,
  parseAguiStream,
} from "@shared/utils/focusai/parseAguiStream";
import type { FocusAIStreamEvent } from "@shared/types/dashboard/focusai-stream";
import type { PlanSuggestStreamEvent } from "@shared/types/dashboard/plan-suggest-stream";
import type { PlanScope } from "@shared/types/dashboard/planning";
import { resolvePlannerTimezone } from "@shared/utils/planner-sidebar-prefs";

export const PRO_SUBSCRIPTION_REQUIRED_CODE = 'pro_subscription_required';
export const AI_QUOTA_EXCEEDED_CODE = 'ai_quota_exceeded';
export const DOCUMENT_ATTACHMENTS_PLUS_ONLY_CODE = 'document_attachments_plus_only';
/** OpenAI/Anthropic billing or credit failure — not the user's FocusAnalyze plan.
 * SSE `error.code` from the backend; show Contact support, not the Pro upgrade paywall.
 * Distinct from TPM rate limits (retryable) and FA monthly token quota.
 */
export const AI_PROVIDER_UNAVAILABLE_CODE = 'ai_provider_unavailable';

export class FocusAiApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'FocusAiApiError';
    this.status = status;
    this.code = code;
  }
}

export class FocusAiProviderUnavailableError extends Error {
  readonly code = AI_PROVIDER_UNAVAILABLE_CODE;

  constructor(message?: string) {
    super(
      message ||
        "FocusAI can't reach the AI provider right now. Please try again later or contact support.",
    );
    this.name = 'FocusAiProviderUnavailableError';
  }
}

/** SSE-side counterpart to isFocusAiQuotaExceededError (which only covers the REST 403 path) —
 * thrown when the backend's `error` SSE frame carries `code: AI_QUOTA_EXCEEDED_CODE`. */
export class FocusAiSseQuotaExceededError extends Error {
  readonly code = AI_QUOTA_EXCEEDED_CODE;

  constructor(message?: string) {
    super(message || 'No remaining AI quota or inactive subscription.');
    this.name = 'FocusAiSseQuotaExceededError';
  }
}

const configuration = createApiConfiguration();
const conversationApi = createApiClient(ApiApi);
const apiParams = ApiApiAxiosParamCreator(configuration);

function appendAguiProtocol(url: string): string {
  return appendFocusAiAguiProtocol(url);
}

async function* parseFocusAiOrAguiStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<FocusAIStreamEvent> {
  if (isFocusAiAguiEnabled()) {
    yield* parseAguiStream(body, signal);
    return;
  }
  yield* parseFocusAiSseStream(body, signal);
}

function toMessagePlanScope(scope?: PlanScope) {
  if (!scope) return undefined;
  return scope === 'weekly'
    ? ApiFocusgptMessageCreatePlanScopeEnum.Weekly
    : ApiFocusgptMessageCreatePlanScopeEnum.Daily;
}

function throwFocusAiApiError(err: unknown): never {
  if (isAxiosError(err)) {
    const status = err.response?.status ?? 0;
    const bodyText = axiosErrorBody(err);
    throw new FocusAiApiError(
      formatFocusAiMessageApiError(status, bodyText),
      status,
      parseErrorCode(bodyText),
    );
  }
  throw err;
}

/** Turns message API error bodies into short, user-safe strings (never raw Django HTML pages). */
export function formatFocusAiMessageApiError(status: number, bodyText: string): string {
  const raw = bodyText.trim();
  if (!raw) {
    return `Request failed (${status}). Please try again.`;
  }
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    if (typeof j.detail === 'string') return j.detail;
    if (Array.isArray(j.detail) && j.detail.length > 0) {
      const first = j.detail[0];
      if (typeof first === 'string') return first;
      if (first && typeof first === 'object' && first !== null && 'message' in first) {
        return String((first as { message?: string }).message ?? '');
      }
    }
    if (typeof j.message === 'string') return j.message;
    if (typeof j.error === 'string') return j.error;
  } catch {
    // not JSON
  }
  const probe = raw.slice(0, 800).toLowerCase();
  if (probe.includes('<!doctype') || probe.includes('<html')) {
    const titleMatch = raw.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch?.[1]) {
      const t = titleMatch[1].replace(/\s+/g, ' ').trim();
      return `Server error (${status}): ${t}`;
    }
    if (status >= 500) {
      return 'The server hit an error. Please try again in a moment.';
    }
    return `Request failed (${status}). Please try again.`;
  }
  if (raw.length > 400) {
    return `${raw.slice(0, 400).trim()}…`;
  }
  return raw;
}

function parseErrorCode(bodyText: string): string | undefined {
  try {
    const j = JSON.parse(bodyText) as Record<string, unknown>;
    return typeof j.code === 'string' ? j.code : undefined;
  } catch {
    return undefined;
  }
}

function base64ToBlob(base64: string): { blob: Blob; mime: string } {
  // Accepts raw base64 or data URLs like "data:image/png;base64,...."
  const match = base64.match(/^data:([^;]+);base64,(.+)$/);
  const mime = match?.[1] ?? 'application/octet-stream';
  const b64 = match?.[2] ?? base64;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { blob: new Blob([bytes], { type: mime }), mime };
}

function buildMessageForm(params: {
  conversationId?: string | null;
  content: string;
  context: ContextEnum;
  functionArgs?: Record<string, unknown> | any;
  files?: string[];
  fileNames?: string[];
  model?: string | null;
}): FormData {
  const form = new FormData();

  if (params.conversationId) form.append('conversation_id', params.conversationId);
  form.append('content', params.content);
  form.append('context', params.context);
  form.append('function_args', JSON.stringify(params.functionArgs ?? {}));
  if (params.model && params.model !== 'auto') {
    form.append('model', params.model);
  } else if (params.model === 'auto') {
    form.append('model', 'auto');
  }

  params.files?.forEach((f, idx) => {
    const { blob, mime } = base64ToBlob(f);
    const given = params.fileNames?.[idx];
    const extFromName = given?.includes('.') ? given.split('.').pop()!.toLowerCase() : '';
    const ext =
      extFromName ||
      (mime === 'image/png'
        ? 'png'
        : mime === 'image/webp'
          ? 'webp'
          : mime === 'image/gif'
            ? 'gif'
            : mime === 'application/pdf'
              ? 'pdf'
              : mime === 'text/csv'
                ? 'csv'
                : mime === 'text/tab-separated-values'
                  ? 'tsv'
                  : mime.includes('spreadsheetml')
                    ? 'xlsx'
                    : 'jpg');
    const filename = given && given.includes('.') ? given : `upload-${idx}.${ext}`;
    form.append('files', blob, filename);
  });

  return form;
}

async function createMessageViaMessageApi(params: {
  conversationId?: string | null;
  content: string;
  context: ContextEnum;
  functionArgs: any;
  files: string[];
}): Promise<Conversation> {
  try {
    const axiosArgs = await apiParams.apiFocusgptMessageCreate(
      undefined,
      undefined,
      false,
      undefined,
      undefined,
    );
    return await executeMultipartApiRequest<Conversation>(axiosArgs, buildMessageForm(params));
  } catch (err) {
    throwFocusAiApiError(err);
  }
}

export function isFocusAiProPaywallError(error: unknown): boolean {
  if (error instanceof FocusAiApiError) {
    return error.status === 403 && error.code === PRO_SUBSCRIPTION_REQUIRED_CODE;
  }
  return false;
}

export function isFocusAiQuotaExceededError(error: unknown): boolean {
  if (error instanceof FocusAiApiError) {
    return error.status === 403 && error.code === AI_QUOTA_EXCEEDED_CODE;
  }
  return false;
}

export function isDocumentAttachmentsPlusOnlyError(error: unknown): boolean {
  if (error instanceof FocusAiApiError) {
    return error.status === 403 && error.code === DOCUMENT_ATTACHMENTS_PLUS_ONLY_CODE;
  }
  return false;
}

export function isAiProviderUnavailableError(error: unknown): boolean {
  if (error instanceof FocusAiProviderUnavailableError) return true;
  if (error instanceof FocusAiApiError) {
    return error.code === AI_PROVIDER_UNAVAILABLE_CODE;
  }
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code?: string }).code === AI_PROVIDER_UNAVAILABLE_CODE;
  }
  return false;
}

export function isAiSseQuotaExceededError(error: unknown): boolean {
  if (error instanceof FocusAiSseQuotaExceededError) return true;
  if (error instanceof FocusAiApiError) {
    return error.code === AI_QUOTA_EXCEEDED_CODE;
  }
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code?: string }).code === AI_QUOTA_EXCEEDED_CODE;
  }
  return false;
}

/** Pro paywall or monthly AI token quota exhausted. */
export function isFocusAiLimitError(error: unknown): boolean {
  return isFocusAiProPaywallError(error) || isFocusAiQuotaExceededError(error);
}

/**
 * Stream planning bootstrap via FocusAI message API.
 * POST /api/focusgpt/message/?stream=1&zone=planning_suggest&plan_scope=…&plan_date=…
 */
export async function* streamPlanningSuggestViaFocusAI(
  payload: {
    scope: PlanScope;
    date: string;
    message?: string;
    conversationUuid?: string | null;
  },
  signal?: AbortSignal,
): AsyncGenerator<PlanSuggestStreamEvent | FocusAIStreamEvent> {
  for await (const ev of streamMessageTurnWithRetry(
    {
      content: payload.message ?? '',
      context: ContextEnum.Planning,
      functionArgs: {
        zone: 'planning_suggest',
        plan_scope: payload.scope,
        plan_date: payload.date,
        timezone: resolvePlannerTimezone(),
      },
      conversationId: payload.conversationUuid ?? null,
      zone: 'planning_suggest',
      planScope: payload.scope,
      planDate: payload.date,
    },
    signal,
    { maxRetries: 3, baseDelay: 1000 },
  )) {
    yield ev as PlanSuggestStreamEvent | FocusAIStreamEvent;
  }
}

export type StreamMessageTurnParams = {
  conversationId?: string | null;
  content: string;
  context: ContextEnum;
  functionArgs?: Record<string, unknown>;
  files?: string[];
  /** Original filenames aligned with ``files`` (needed for PDF/CSV/XLSX classification). */
  fileNames?: string[];
  zone?: string;
  planScope?: PlanScope;
  planDate?: string;
  /** Composer model pick (`auto` or allowlisted id). */
  model?: string | null;
};

/**
 * Stream a FocusAI message turn (chat, planning follow-ups).
 * POST /api/focusgpt/message/?stream=1 (+ optional zone params)
 */
export async function* streamMessageTurn(
  params: StreamMessageTurnParams,
  signal?: AbortSignal,
): AsyncGenerator<FocusAIStreamEvent> {
  const axiosArgs = await apiParams.apiFocusgptMessageCreate(
    params.planDate,
    toMessagePlanScope(params.planScope),
    true,
    params.zone,
    undefined,
  );

  const streamArgs = {
    ...axiosArgs,
    url: appendAguiProtocol(axiosArgs.url),
  };

  let body: ReadableStream<Uint8Array>;
  try {
    body = await fetchApiEventStream(streamArgs, buildMessageForm(params), signal);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 0;
    const text = err instanceof Error ? err.message : '';
    throw new FocusAiApiError(
      formatFocusAiMessageApiError(status, text),
      status,
      parseErrorCode(text),
    );
  }

  yield* parseFocusAiOrAguiStream(body, signal);
}

/**
 * Stream a message turn with automatic reconnection on network failures.
 * Implements exponential backoff retry logic.
 */
export type StreamMessageUpdateParams = {
  conversationId: string;
  userMessageId: number;
  content: string;
  context: ContextEnum;
  functionArgs?: Record<string, unknown>;
  files?: string[];
  zone?: string;
  planScope?: PlanScope;
  planDate?: string;
};

/**
 * Stream a FocusAI message edit/regenerate turn.
 * PUT /api/focusgpt/message/{conversationUuid}/?stream=1
 */
export async function* streamMessageUpdate(
  params: StreamMessageUpdateParams,
  signal?: AbortSignal,
): AsyncGenerator<FocusAIStreamEvent> {
  const axiosArgs = await apiParams.apiFocusgptMessageUpdate(
    params.conversationId,
    {
      user_message_id: params.userMessageId,
      content: params.content,
      context: params.context,
      function_args: params.functionArgs ?? {},
      files: params.files ?? [],
    },
    params.planDate,
    toMessagePlanScope(params.planScope),
    true,
    params.zone,
  );

  const streamArgs = {
    ...axiosArgs,
    url: appendAguiProtocol(axiosArgs.url),
  };

  let body: ReadableStream<Uint8Array>;
  try {
    body = await fetchApiEventStream(
      streamArgs,
      JSON.stringify({
        user_message_id: params.userMessageId,
        content: params.content,
        context: params.context,
        function_args: params.functionArgs ?? {},
        files: params.files ?? [],
      }),
      signal,
    );
  } catch (err) {
    const status = (err as { status?: number }).status ?? 0;
    const text = err instanceof Error ? err.message : '';
    throw new FocusAiApiError(
      formatFocusAiMessageApiError(status, text),
      status,
      parseErrorCode(text),
    );
  }

  yield* parseFocusAiOrAguiStream(body, signal);
}

export async function* streamMessageTurnWithRetry(
  params: StreamMessageTurnParams,
  signal?: AbortSignal,
  options?: {
    maxRetries?: number;
    baseDelay?: number;
  },
): AsyncGenerator<FocusAIStreamEvent> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelay ?? 1000;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new Error('Stream aborted by user');
    }

    try {
      // Add retry indicator event if this is a retry
      if (attempt > 0) {
        yield {
          type: 'activity',
          kind: 'reason',
          text: `Reconnecting... (attempt ${attempt}/${maxRetries})`,
        } as FocusAIStreamEvent;
      }

      // Try to stream
      yield* streamMessageTurn(params, signal);
      return; // Success, exit
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Check if it's a network error or retryable error
      const isNetworkError =
        err instanceof Error &&
        (err.message.includes('network') ||
          err.message.includes('fetch') ||
          err.message.includes('timeout'));
      const isFocusAiError = err instanceof FocusAiApiError;
      const is5xxError = isFocusAiError && err.status >= 500;

      // Don't retry on client errors (4xx) or limit errors
      if (isFocusAiError && (err.status < 500 || isFocusAiLimitError(err))) {
        throw err;
      }

      // If not retryable or max retries reached, throw
      if ((!isNetworkError && !is5xxError) || attempt === maxRetries) {
        throw lastError;
      }

      // Calculate backoff delay
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error('Stream failed after retries');
}

export async function createConversationFromMessage(
  content: string,
  context: ContextEnum,
  functionArgs: any,
  files: string[],
): Promise<Conversation> {
  // Prefer the message API: it can create a new conversation when conversation_id is omitted.
  return await createMessageViaMessageApi({
    conversationId: null,
    content,
    context,
    functionArgs,
    files,
  });
}

/** conversationId is the conversation UUID. */
export async function addMessageToConversation(
  conversationId: string,
  content: string,
  context: ContextEnum,
  functionArgs: any,
  files: string[],
): Promise<Conversation> {
  return await createMessageViaMessageApi({
    conversationId,
    content,
    context,
    functionArgs,
    files,
  });
}

export async function getConversations(
  limit: number = 20,
  offset: number = 0,
  search: string = '',
): Promise<PaginatedConversationListList> {
  const response = await conversationApi.apiFocusgptConversationList(limit, offset, search);
  return response.data;
}

/** conversationId is the conversation UUID. */
export async function getConversation(conversationId: string): Promise<Conversation> {
  const response = await conversationApi.apiFocusgptConversationRetrieve(
    conversationId as unknown as number,
  );
  return response.data;
}

/** conversationId is the conversation UUID. */
export async function renameConversation(conversationId: string, title: string): Promise<any> {
  const response = await conversationApi.apiFocusgptConversationPartialUpdate(
    conversationId as unknown as number,
    { title },
  );
  return response.data;
}

/** conversationId is the conversation UUID. */
export async function deleteConversation(conversationId: string): Promise<number> {
  const response = await conversationApi.apiFocusgptConversationDestroy(
    conversationId as unknown as number,
  );
  return response.status;
}

/**
 * Resume the agent after a HITL interrupt.
 * conversationUuid is the conversation UUID (used as thread_id).
 * Pass {type: "approve"} or {type: "reject"} for each pending action.
 */
export async function resumeAgent(
  conversationUuid: string,
  decisions: HitlDecision[],
  timezone?: string | null,
): Promise<Conversation> {
  try {
    const body: { decisions: HitlDecision[]; timezone?: string } = { decisions };
    if (timezone) body.timezone = timezone;
    const response = await conversationApi.apiFocusgptConversationAgentResumeCreate(
      conversationUuid as unknown as number,
      body as any,
    );
    return response.data;
  } catch (err) {
    if (isAxiosError(err)) {
      const status = err.response?.status ?? 0;
      throw new Error(formatFocusAiMessageApiError(status, axiosErrorBody(err)));
    }
    throw err;
  }
}

/**
 * Stream the agent resume the same way a fresh turn streams (Phase 1.7).
 * POST /api/focusgpt/conversation/{uuid}/agent-resume/?stream=1
 *
 * Yields the same `FocusAIStreamEvent` shape as `streamMessageTurn` — `activity`/`llm_delta`
 * frames while the approved tool executes, then a final `conversation` frame carrying the
 * resolved message's `metadata.action_results`. Callers should read `ok` from that field, not
 * from this call resolving without throwing (see design principle 1 in the Phase 1 plan).
 */
export async function* resumeAgentStream(
  conversationUuid: string,
  decisions: HitlDecision[],
  timezone?: string | null,
  signal?: AbortSignal,
): AsyncGenerator<FocusAIStreamEvent> {
  const body: { decisions: HitlDecision[]; timezone?: string } = { decisions };
  if (timezone) body.timezone = timezone;

  const axiosArgs = await apiParams.apiFocusgptConversationAgentResumeCreate(
    conversationUuid as unknown as number,
    body as any,
    true,
  );

  const streamArgs = {
    ...axiosArgs,
    url: appendAguiProtocol(axiosArgs.url),
  };

  let responseBody: ReadableStream<Uint8Array>;
  try {
    responseBody = await fetchApiEventStream(streamArgs, JSON.stringify(body), signal);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 0;
    const text = err instanceof Error ? err.message : '';
    throw new FocusAiApiError(
      formatFocusAiMessageApiError(status, text),
      status,
      parseErrorCode(text),
    );
  }

  yield* parseFocusAiOrAguiStream(responseBody, signal);
}

/**
 * "Continue from here": fork a new conversation containing messages 1..anchor, with a fresh
 * LangGraph thread. The original conversation is left untouched (its own next GET will surface
 * `branched_to` for the anchor); the new conversation's response carries `branched_from`.
 * conversationUuid is the original conversation's UUID.
 */
export async function branchConversation(
  conversationUuid: string,
  anchorMessageId: number,
): Promise<Conversation> {
  try {
    const response = await conversationApi.apiFocusgptConversationBranchCreate(
      conversationUuid as unknown as number,
      { anchor_message_id: anchorMessageId },
    );
    return response.data;
  } catch (err) {
    if (isAxiosError(err)) {
      const status = err.response?.status ?? 0;
      throw new FocusAiApiError(
        formatFocusAiMessageApiError(status, axiosErrorBody(err)),
        status,
        parseErrorCode(axiosErrorBody(err)),
      );
    }
    throw err;
  }
}

/** conversationId is the conversation UUID. `focusaiMessageId` is unused; kept for call-site compatibility. */
export async function updateMessage(
  conversationId: string,
  userMessageId: number,
  _focusaiMessageId: number,
  content: string,
  context: ContextEnum,
  functionArgs: any,
  files: string[],
): Promise<Conversation> {
  const response = await conversationApi.apiFocusgptConversationUpdateMessageCreate(
    conversationId as unknown as number,
    {
      user_message_id: userMessageId,
      content,
      context,
      function_args: functionArgs,
      files,
    },
  );
  return response.data;
}

/**
 * GET /api/focusgpt/model-options/
 * Plan-gated Auto + manual model list for the FocusAI composer.
 */
export async function fetchFocusAIModelOptions(): Promise<
  import('@/lib/utils/focusai/model-picker').FocusAIModelOptionsResponse
> {
  const base = createApiConfiguration().basePath?.replace(/\/$/, '') ?? '';
  const auth = (await getFreshAccessToken()) ?? '';
  const res = await fetch(`${base}/api/focusgpt/model-options/`, {
    headers: {
      Accept: 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new FocusAiApiError(formatFocusAiMessageApiError(res.status, text), res.status);
  }
  return res.json();
}

/**
 * GET /api/focusgpt/message-attachments/<id>/
 * Auth download of a prompt upload (images/docs). Returns a blob for preview.
 * Expired or foreign attachments → 404 → FocusAiApiError.
 */
export async function fetchFocusAIMessageAttachmentBlob(attachmentId: number): Promise<Blob> {
  const base = createApiConfiguration().basePath?.replace(/\/$/, '') ?? '';
  const auth = (await getFreshAccessToken()) ?? '';
  const res = await fetch(`${base}/api/focusgpt/message-attachments/${attachmentId}/`, {
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new FocusAiApiError(
      res.status === 404
        ? 'This attachment is no longer available (expired or removed).'
        : formatFocusAiMessageApiError(res.status, text),
      res.status,
    );
  }
  return res.blob();
}
