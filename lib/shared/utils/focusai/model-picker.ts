/** FocusAI composer model picker — mirrors backend plan-gated allowlists. */

export const FOCUSAI_MODEL_PICKER_STORAGE_KEY = 'focusai.composer.model';

export type FocusAIModelOption = {
  id: string;
  label: string;
  description?: string | null;
};

export type FocusAIModelOptionsResponse = {
  tier: 'pro' | 'plus' | string;
  default: string;
  options: FocusAIModelOption[];
};

export function loadStoredFocusAIModel(): string {
  if (typeof window === 'undefined') return 'auto';
  try {
    const v = window.localStorage.getItem(FOCUSAI_MODEL_PICKER_STORAGE_KEY);
    return v && v.trim() ? v.trim() : 'auto';
  } catch {
    return 'auto';
  }
}

export function storeFocusAIModel(modelId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FOCUSAI_MODEL_PICKER_STORAGE_KEY, modelId || 'auto');
  } catch {
    // ignore quota / private mode
  }
}

/** If the stored pick is not in the server allowlist, fall back to Auto. */
export function coerceFocusAIModel(modelId: string, options: FocusAIModelOption[]): string {
  const id = modelId || 'auto';
  if (options.some((o) => o.id === id)) return id;
  return 'auto';
}
