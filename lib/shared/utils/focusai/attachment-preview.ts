/** Helpers for FocusAI attachment previews (composer + chat chips). */

export type FocusAIAttachmentPreviewKind = 'image' | 'pdf' | 'csv' | 'tsv' | 'xlsx' | 'unknown';

export function attachmentPreviewKind(name: string, mimeHint?: string): FocusAIAttachmentPreviewKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
  if (ext === 'pdf' || mimeHint === 'application/pdf') return 'pdf';
  if (ext === 'csv' || mimeHint === 'text/csv') return 'csv';
  if (ext === 'tsv' || mimeHint === 'text/tab-separated-values') return 'tsv';
  if (ext === 'xlsx' || (mimeHint || '').includes('spreadsheetml')) return 'xlsx';
  if ((mimeHint || '').startsWith('image/')) return 'image';
  return 'unknown';
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i.exec(dataUrl);
    if (!match) return null;
    const mime = match[1] || 'application/octet-stream';
    const isBase64 = Boolean(match[2]);
    const data = match[3] ?? '';
    if (isBase64) {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(data)], { type: mime });
  } catch {
    return null;
  }
}

export async function dataUrlToText(dataUrl: string): Promise<string | null> {
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return null;
  try {
    return await blob.text();
  } catch {
    return null;
  }
}

/** Read text from a data URL, blob URL, or http(s) URL. */
export async function srcToText(src: string): Promise<string | null> {
  if (src.startsWith('data:')) return dataUrlToText(src);
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Parse CSV/TSV into rows (simple quoted-field support). Caps rows for UI. */
export function parseDelimitedText(
  text: string,
  delimiter: ',' | '\t',
  maxRows = 200,
): { headers: string[]; rows: string[][]; truncated: boolean } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  const parsed: string[][] = [];
  for (const line of lines) {
    if (parsed.length >= maxRows + 1) break;
    if (line === '' && parsed.length === 0) continue;
    parsed.push(splitDelimitedLine(line, delimiter));
  }
  const truncated = lines.filter((l) => l.length > 0).length > parsed.length;
  if (parsed.length === 0) return { headers: [], rows: [], truncated: false };
  const headers = parsed[0] ?? [];
  const rows = parsed.slice(1);
  return { headers, rows, truncated };
}

function splitDelimitedLine(line: string, delimiter: ',' | '\t'): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
