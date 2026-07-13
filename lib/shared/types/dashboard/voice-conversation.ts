import type { Conversation } from "@shared/api-client";

/** Conversation payload from voice WebSocket/SSE, with optional assistant TTS audio. */
export type VoiceConversation = Conversation & {
  assistant_audio_base64?: string | null;
  assistant_audio_mime?: string | null;
};
