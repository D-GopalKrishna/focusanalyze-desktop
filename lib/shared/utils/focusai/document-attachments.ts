import { toast } from '@/lib/hooks/use-toast';
import { readFileAsDataUrl } from "@shared/utils/focusai/read-file-data-url";

/** Keep in sync with focusgpt/utils/document_prompt_limits.py */
export const MAX_DOCUMENTS_PER_PROMPT = 2;
export const MAX_DOCUMENT_FILE_SIZE_MB = 5;
export const MAX_DOCUMENT_FILE_SIZE_BYTES = MAX_DOCUMENT_FILE_SIZE_MB * 1024 * 1024;
export const MAX_DOCUMENT_EXTRACT_FA_TOKENS = 50_000;
export const DOCUMENT_EXTRACT_WARN_FA_TOKENS = 10_000;
export const DOCUMENT_ATTACHMENTS_PLUS_ONLY_CODE = 'document_attachments_plus_only';

export const VALID_DOCUMENT_EXTENSIONS = ['pdf', 'csv', 'tsv', 'xlsx'] as const;

export type FocusAISelectedDocument = {
  file: File;
  /** data URL for multipart upload (same transport as images) */
  preview: string;
  name: string;
  /** Rough FA-token estimate (chars/4 of file bytes — conservative for compressed formats) */
  tokensEst: number;
};

const DOCUMENT_MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function isDocumentFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if ((VALID_DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)) return true;
  const t = (file.type || '').toLowerCase();
  return (
    t === 'application/pdf' ||
    t === 'text/csv' ||
    t === 'text/tab-separated-values' ||
    t.includes('spreadsheetml') ||
    t === 'application/vnd.ms-excel'
  );
}

export function documentAcceptAttr(): string {
  return [
    'application/pdf',
    '.pdf',
    'text/csv',
    '.csv',
    'text/tab-separated-values',
    '.tsv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xlsx',
  ].join(',');
}

export function paperclipAcceptAttr(documentsAllowed: boolean): string {
  const images = 'image/png,image/jpeg,image/webp,image/gif';
  return documentsAllowed ? `${images},${documentAcceptAttr()}` : images;
}

/** Rough estimate before server extract (compressed xlsx/pdf overestimate intentionally). */
export function estimateDocumentFaTokens(file: File): number {
  return Math.max(1, Math.ceil(file.size / 4));
}

export type DocumentGateResult = { ok: true } | { ok: false; reason: string };

/** Pure gate (no toast) — used by UI + unit tests to prevent Pro leaks. */
export function checkDocumentFile(params: {
  file: File;
  currentDocCount: number;
  documentsAllowed: boolean;
  existingTokensEst?: number;
}): DocumentGateResult {
  const { file, currentDocCount, documentsAllowed, existingTokensEst = 0 } = params;

  if (!documentsAllowed) {
    return {
      ok: false,
      reason:
        'PDF and spreadsheet attachments are available on Plus (and organization admin seats).',
    };
  }

  if (currentDocCount >= MAX_DOCUMENTS_PER_PROMPT) {
    return {
      ok: false,
      reason: `You can attach up to ${MAX_DOCUMENTS_PER_PROMPT} documents per message.`,
    };
  }

  if (!isDocumentFile(file)) {
    return { ok: false, reason: 'Supported documents: PDF, CSV, TSV, XLSX.' };
  }

  if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    return {
      ok: false,
      reason: `Document must be less than ${MAX_DOCUMENT_FILE_SIZE_MB}MB.`,
    };
  }

  const est = estimateDocumentFaTokens(file);
  if (est > MAX_DOCUMENT_EXTRACT_FA_TOKENS || existingTokensEst + est > MAX_DOCUMENT_EXTRACT_FA_TOKENS) {
    return {
      ok: false,
      reason: `Documents exceed the ${MAX_DOCUMENT_EXTRACT_FA_TOKENS.toLocaleString()} token context budget.`,
    };
  }

  return { ok: true };
}

function validateDocumentFile(
  file: File,
  currentDocCount: number,
  documentsAllowed: boolean,
  existingTokensEst = 0,
): boolean {
  const result = checkDocumentFile({
    file,
    currentDocCount,
    documentsAllowed,
    existingTokensEst,
  });
  if (!result.ok) {
    const isPlus = result.reason.includes('Plus');
    toast({
      title: isPlus ? 'Plus feature' : 'Cannot attach document',
      description: result.reason,
      variant: 'destructive',
    });
    return false;
  }

  const est = estimateDocumentFaTokens(file);
  if (est >= DOCUMENT_EXTRACT_WARN_FA_TOKENS) {
    toast({
      title: 'Large attachment',
      description: `This file may use ~${est.toLocaleString()} of your monthly AI tokens (server will truncate if needed).`,
    });
  }

  return true;
}

async function readDocumentAsDataUrl(file: File): Promise<FocusAISelectedDocument | null> {
  const result = await readFileAsDataUrl(file);
  if (!result) return null;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mime = DOCUMENT_MIME_BY_EXT[ext] || file.type || 'application/octet-stream';
  // Normalize data URL mime so the backend classifies correctly
  let preview = result;
  if (preview.startsWith('data:') && mime) {
    preview = preview.replace(/^data:[^;]+/, `data:${mime}`);
  }
  return {
    file,
    preview,
    name: file.name,
    tokensEst: estimateDocumentFaTokens(file),
  };
}

export async function addAttachmentFiles(params: {
  files: File[];
  selectedImages: { file: File; preview: string }[];
  setSelectedImages: (images: { file: File; preview: string }[]) => void;
  selectedDocuments: FocusAISelectedDocument[];
  setSelectedDocuments: (docs: FocusAISelectedDocument[]) => void;
  documentsAllowed: boolean;
  addImageFiles: (
    files: File[],
    selectedImages: { file: File; preview: string }[],
    setSelectedImages: (images: { file: File; preview: string }[]) => void,
  ) => Promise<void>;
}): Promise<void> {
  const {
    files,
    selectedImages,
    setSelectedImages,
    selectedDocuments,
    setSelectedDocuments,
    documentsAllowed,
    addImageFiles,
  } = params;

  const images = files.filter((f) => f.type.startsWith('image/') && !isDocumentFile(f));
  const docs = files.filter((f) => isDocumentFile(f));
  const other = files.filter((f) => !f.type.startsWith('image/') && !isDocumentFile(f));

  if (other.length > 0 && images.length === 0 && docs.length === 0) {
    toast({
      title: 'Invalid file type',
      description: documentsAllowed
        ? 'Use images (PNG/JPEG/WebP/GIF) or documents (PDF, CSV, TSV, XLSX).'
        : 'Please upload image files (PNG, JPEG, WebP, or GIF). Documents require Plus.',
      variant: 'destructive',
    });
    return;
  }

  if (docs.length > 0 && !documentsAllowed) {
    toast({
      title: 'Plus feature',
      description:
        'PDF and spreadsheet attachments are available on Plus (and organization admin seats).',
      variant: 'destructive',
    });
  }

  if (images.length > 0) {
    await addImageFiles(images, selectedImages, setSelectedImages);
  }

  let currentDocs = [...selectedDocuments];
  for (const file of docs) {
    const existingTokensEst = currentDocs.reduce((s, d) => s + d.tokensEst, 0);
    if (!validateDocumentFile(file, currentDocs.length, documentsAllowed, existingTokensEst)) {
      continue;
    }
    const doc = await readDocumentAsDataUrl(file);
    if (doc) {
      currentDocs = [...currentDocs, doc];
      setSelectedDocuments(currentDocs);
    }
  }
}

export function handleRemoveDocument(
  index: number,
  selectedDocuments: FocusAISelectedDocument[],
  setSelectedDocuments: (docs: FocusAISelectedDocument[]) => void,
): void {
  setSelectedDocuments(selectedDocuments.filter((_, i) => i !== index));
}
