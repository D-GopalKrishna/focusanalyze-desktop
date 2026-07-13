import type { useToast } from '@/lib/hooks/use-toast';

export const FOCUSAI_PRO_REQUIRED_TITLE = 'Pro, Plus, or Enterprise required';
export const FOCUSAI_PRO_REQUIRED_DESCRIPTION =
  'A Pro, Plus, or Enterprise subscription is required to use FocusAI.';

type ToastFn = ReturnType<typeof useToast>['toast'];

export function toastFocusAiProRequired(toast: ToastFn) {
  toast({
    title: FOCUSAI_PRO_REQUIRED_TITLE,
    description: FOCUSAI_PRO_REQUIRED_DESCRIPTION,
  });
}
