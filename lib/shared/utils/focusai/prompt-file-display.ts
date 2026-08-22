/** Display metadata for FocusAI prompt file attachments (images + documents). */

export type FocusAIPromptFileChip = {
  kind: 'image' | 'document';
  name: string;
  /** Data URL — only present for in-session optimistic chips (not persisted server-side). */
  preview?: string;
  /** Server-persisted attachment row id (auth download; ~7 day TTL). */
  attachmentId?: number;
};

export function promptFileCacheKey(kind: string, name: string): string {
  return `${kind}:${name}`;
}

function parseAttachmentId(item: Record<string, unknown>): number | undefined {
  const attachmentRaw = item.attachment_id ?? item.attachmentId;
  if (typeof attachmentRaw === 'number' && Number.isFinite(attachmentRaw)) {
    return attachmentRaw;
  }
  if (typeof attachmentRaw === 'string' && /^\d+$/.test(attachmentRaw)) {
    return Number(attachmentRaw);
  }
  return undefined;
}

/** Serialize chips back into message.metadata.prompt_files (API snake_case). */
export function promptFilesToMetadata(files: FocusAIPromptFileChip[]): Array<Record<string, unknown>> {
  return files.map((file) => ({
    kind: file.kind,
    name: file.name,
    ...(file.preview ? { preview: file.preview } : {}),
    ...(file.attachmentId != null ? { attachment_id: file.attachmentId } : {}),
  }));
}

export function promptFilesFromMetadata(metadata: unknown): FocusAIPromptFileChip[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const raw = (metadata as { prompt_files?: unknown }).prompt_files;
  if (!Array.isArray(raw)) return [];
  const out: FocusAIPromptFileChip[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const kind = row.kind;
    const name = row.name;
    const preview = row.preview;
    if ((kind !== 'image' && kind !== 'document') || typeof name !== 'string' || !name) {
      continue;
    }
    out.push({
      kind,
      name,
      preview: typeof preview === 'string' && preview.startsWith('data:') ? preview : undefined,
      attachmentId: parseAttachmentId(row),
    });
  }
  return out;
}

/** Collect in-session previews so a server snapshot can reattach them. */
export function collectPromptFilePreviews(
  messages: Array<{ metadata?: unknown }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const message of messages) {
    for (const file of promptFilesFromMetadata(message.metadata)) {
      if (file.preview) {
        map.set(promptFileCacheKey(file.kind, file.name), file.preview);
      }
    }
  }
  return map;
}

/** Merge server prompt_files with any live previews still in memory. */
export function mergePromptFilePreviewsIntoMessages<T extends { metadata?: unknown }>(
  messages: T[],
  previewByKey: Map<string, string>,
): T[] {
  if (previewByKey.size === 0) return messages;
  return messages.map((message) => {
    const files = promptFilesFromMetadata(message.metadata);
    if (files.length === 0) return message;
    let changed = false;
    const merged = files.map((file) => {
      if (file.preview) return file;
      const preview = previewByKey.get(promptFileCacheKey(file.kind, file.name));
      if (!preview) return file;
      changed = true;
      return { ...file, preview };
    });
    if (!changed) return message;
    const metadata =
      message.metadata && typeof message.metadata === 'object'
        ? {
            ...(message.metadata as Record<string, unknown>),
            prompt_files: promptFilesToMetadata(merged),
          }
        : { prompt_files: promptFilesToMetadata(merged) };
    return { ...message, metadata } as T;
  });
}

export function documentExtLabel(name: string): string {
  const ext = name.split('.').pop()?.toUpperCase();
  return ext && ext.length <= 5 ? ext : 'FILE';
}
