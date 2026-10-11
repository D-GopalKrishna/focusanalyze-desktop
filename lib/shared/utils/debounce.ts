/**
 * Plain (non-hook) debounce for imperative call sites — event handlers, utility functions
 * called outside React's render cycle — where `lib/hooks/use-debounce.ts` (which debounces a
 * *value* across renders) doesn't fit. Collapses a burst of calls into the last one's
 * arguments, fired `wait` ms after the burst stops.
 *
 * `cancel()` drops a pending invocation without firing it — needed when a later, immediate
 * call (e.g. a calendar view switch) must not be overwritten by a stale trailing fetch.
 */
export type Debounced<Args extends unknown[]> = ((...args: Args) => void) & {
  cancel: () => void;
};

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait: number,
): Debounced<Args> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = ((...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  }) as Debounced<Args>;
  wrapped.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return wrapped;
}
