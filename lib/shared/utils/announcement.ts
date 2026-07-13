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
