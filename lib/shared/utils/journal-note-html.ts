/** Normalize TipTap empty document to an empty string for API storage. */
export function normalizeJournalNoteHtml(html: string): string {
  const trimmed = html.trim();
  if (
    !trimmed ||
    trimmed === '<p></p>' ||
    trimmed === '<p><br></p>' ||
    trimmed === '<p><br/></p>'
  ) {
    return '';
  }
  return trimmed;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Load legacy plain-text notes and HTML notes into TipTap. */
export function noteToEditorHtml(note: string | null | undefined): string {
  if (!note?.trim()) return '';
  const trimmed = note.trim();
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  return trimmed
    .split('\n')
    .map((line) => `<p>${line ? escapeHtml(line) : '<br>'}</p>`)
    .join('');
}

export function journalNotesEqual(a: string, b: string): boolean {
  return normalizeJournalNoteHtml(a) === normalizeJournalNoteHtml(b);
}

/** Plain-text snippet for history list rows (strips HTML). */
export function journalNotePreview(note: string | null | undefined, maxLen = 60): string {
  if (!note?.trim()) return 'Empty note';
  const text = note
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 'Empty note';
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}
