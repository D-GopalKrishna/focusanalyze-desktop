/** True when a pointer/focus event target is inside Sonner or Radix toast UI. */
export function isGlobalToastInteractionTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      '[data-sonner-toaster], [data-sonner-toast], [data-radix-toast-viewport], [data-radix-toast]',
    ),
  );
}

/** Prevent Radix modal dismiss when the user interacts with a toast. */
export function preventModalDismissForToast(
  event: { preventDefault: () => void },
  target: EventTarget | null,
): void {
  if (isGlobalToastInteractionTarget(target)) {
    event.preventDefault();
  }
}
