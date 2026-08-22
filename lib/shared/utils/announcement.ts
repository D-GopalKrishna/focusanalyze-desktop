// Navigate an announcement CTA: relative/internal paths ("/dashboard/...") go through
// the app router so the SPA doesn't lose state; anything else (an absolute external URL)
// opens in a new tab.
export function navigateToCtaUrl(
  router: { push: (href: string) => void },
  url: string | undefined | null,
): void {
  if (!url) return;
  if (url.startsWith('/')) {
    router.push(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function normalizeHighlights(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((s) => s.trim());
}

export function formatReleaseLine(publishedAt?: string | null): string | null {
  if (!publishedAt) return null;
  const d = new Date(publishedAt);
  if (Number.isNaN(d.getTime())) return null;
  return `Release · ${new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(d)}`;
}

export function formatPublishedDate(publishedAt?: string | null): string | null {
  if (!publishedAt) return null;
  const d = new Date(publishedAt);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
}
