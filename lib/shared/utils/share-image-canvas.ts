/** Apply a pixel blur to a rectangular region on a canvas (used for redacting before share). */
export function blurCanvasRegion(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  blurPx = 14,
) {
  if (width <= 0 || height <= 0) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const pad = blurPx * 2;
  const sx = Math.max(0, Math.floor(x) - pad);
  const sy = Math.max(0, Math.floor(y) - pad);
  const sw = Math.min(canvas.width - sx, Math.ceil(width) + pad * 2);
  const sh = Math.min(canvas.height - sy, Math.ceil(height) + pad * 2);

  const temp = document.createElement('canvas');
  temp.width = sw;
  temp.height = sh;
  const tctx = temp.getContext('2d');
  if (!tctx) return;

  tctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  ctx.save();
  ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(temp, 0, 0, sw, sh, sx, sy, sw, sh);
  ctx.restore();
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export async function copyCanvasToClipboard(canvas: HTMLCanvasElement) {
  const blob = await canvasToBlob(canvas);
  if (!blob) throw new Error('Could not create image');

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return;
  }

  throw new Error('Image clipboard is not supported in this browser');
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
