import { ApiApiAxiosParamCreator } from "@shared/api-client";
import { createApiConfiguration } from './auth';
import { executeMultipartApiRequest } from './openapiHelpers';

const configuration = createApiConfiguration();
const apiParams = ApiApiAxiosParamCreator(configuration);

/**
 * Send an audio blob to the backend Whisper STT endpoint.
 * Used as the fallback path when the browser's SpeechRecognition API is unavailable.
 * Returns the transcribed text string.
 *
 * The generated `apiFocusgptSttCreate` has no typed multipart body (OpenAPI schema gap —
 * fix backend annotation + rerun `./genapi.sh` when convenient), so this builds the
 * axios args via the param creator (URL + auth) and swaps in the multipart body/headers,
 * same pattern as `FocusAI.ts`'s `executeMultipartApiRequest` usage.
 */
export async function transcribeAudioBlob(audioBlob: Blob): Promise<string> {
  const form = new FormData();
  const ext = audioBlob.type.includes('ogg') ? 'ogg' : 'webm';
  form.append('audio', audioBlob, `recording.${ext}`);

  try {
    const axiosArgs = await apiParams.apiFocusgptSttCreate();
    const data = await executeMultipartApiRequest<{ text: string }>(axiosArgs, form);
    return data.text ?? '';
  } catch (err) {
    const ax = err as { response?: { data?: { error?: string } }; message?: string };
    throw new Error(ax.response?.data?.error ?? ax.message ?? 'Transcription failed');
  }
}
