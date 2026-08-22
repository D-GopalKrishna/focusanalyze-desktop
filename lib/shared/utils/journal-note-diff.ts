export type JournalNoteDiffLine = {
  type: 'same' | 'add' | 'remove';
  text: string;
};

/** Strip TipTap/HTML notes to plain text with stable line breaks for diffing. */
export function journalNoteToPlainText(note: string | null | undefined): string {
  if (!note?.trim()) return '';
  const withBreaks = note
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '');
  if (typeof document !== 'undefined') {
    const el = document.createElement('div');
    el.innerHTML = withBreaks;
    return (el.textContent || el.innerText || '').replace(/\u00a0/g, ' ').trim();
  }
  return withBreaks
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toLines(note: string | null | undefined): string[] {
  const text = journalNoteToPlainText(note);
  if (!text) return [];
  return text.split('\n').map((line) => line.trimEnd());
}

/**
 * Line diff (old → new): removals are lines only in old, additions only in new.
 * Uses LCS — no extra dependency.
 */
export function diffJournalNotes(
  oldNote: string | null | undefined,
  newNote: string | null | undefined,
): JournalNoteDiffLine[] {
  const a = toLines(oldNote);
  const b = toLines(newNote);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: JournalNoteDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'remove', text: a[i] });
      i += 1;
    } else {
      out.push({ type: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ type: 'remove', text: a[i] });
    i += 1;
  }
  while (j < m) {
    out.push({ type: 'add', text: b[j] });
    j += 1;
  }
  return out;
}

export function journalNoteDiffHasChanges(lines: JournalNoteDiffLine[]): boolean {
  return lines.some((line) => line.type !== 'same');
}
