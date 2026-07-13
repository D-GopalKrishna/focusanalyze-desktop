import { invoke } from "@tauri-apps/api/core";
import type { AuthTokens } from "./types";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function saveTokensToKeychain(tokens: AuthTokens): Promise<void> {
  await invoke("save_auth_tokens", { json: JSON.stringify(tokens) });
}

export async function loadTokensFromKeychain(): Promise<AuthTokens | null> {
  const json = await invoke<string | null>("load_auth_tokens");
  if (!json) return null;

  try {
    return JSON.parse(json) as AuthTokens;
  } catch {
    return null;
  }
}

export async function clearTokensFromKeychain(): Promise<void> {
  await invoke("clear_auth_tokens");
}

export async function beginOAuthCallbackListener(): Promise<number> {
  return invoke<number>("begin_oauth_callback_listener");
}

export async function cancelOAuthCallbackListener(): Promise<void> {
  await invoke("cancel_oauth_callback_listener");
}

export async function waitForOAuthCallback(
  expectedState: string
): Promise<string> {
  const result = await invoke<{ code: string }>("wait_oauth_callback", {
    expectedState,
  });
  return result.code;
}
