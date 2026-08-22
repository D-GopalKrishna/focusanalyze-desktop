/** Extensions accepted by TaskFileAttachment (docs only — images stay TipTap embeds). */
export const TASK_DOCUMENT_EXTENSIONS = ['pdf', 'csv', 'tsv', 'xlsx'] as const;

const DOCUMENT_EXT_SET = new Set<string>(TASK_DOCUMENT_EXTENSIONS);

const DOCUMENT_MIME_HINTS = [
  'application/pdf',
  'text/csv',
  'text/tab-separated-values',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export function extFromFileName(name: string): string {
  const i = name.lastIndexOf('.');
  if (i < 0) return '';
  return name.slice(i + 1).toLowerCase();
}

export function isTaskDocumentFile(file: File): boolean {
  const ext = extFromFileName(file.name);
  if (DOCUMENT_EXT_SET.has(ext)) return true;
  const mime = (file.type || '').toLowerCase();
  return DOCUMENT_MIME_HINTS.some((m) => mime === m || mime.includes('spreadsheetml'));
}

export function isTaskImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extFromFileName(file.name));
}
