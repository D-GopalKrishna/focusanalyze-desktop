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

// Small, static id → label map for display contexts that don't have the fetched options list
// on hand (e.g. the model-switch banner, which only gets ids back in a context_snapshot).
// Not the source of truth — that's the backend's MODEL_CHOICES — just enough to show a name
// instead of a raw id for the models this app can actually route to.
const FOCUSAI_MODEL_LABELS: Record<string, string> = {
  auto: 'Auto',
  'gpt-4.1': 'GPT-4.1',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-5': 'GPT-5',
  'o4-mini': 'OpenAI o4-mini',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  'claude-sonnet-5': 'Claude Sonnet 5',
};

export function focusAIModelLabel(modelId: string | null | undefined): string {
  if (!modelId) return 'Auto';
  return FOCUSAI_MODEL_LABELS[modelId] ?? modelId;
}
