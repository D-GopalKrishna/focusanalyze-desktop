/**
 * Resize and compress images before upload so payloads stay small (avatars, icons, logos).
 */

export type ImageUploadPreset = 'avatar' | 'projectIcon' | 'orgLogo';

export interface CompressImageOptions {
  maxDimension: number;
  maxBytes: number;
  /** Output MIME type (JPEG is smallest for photos; WebP when supported). */
  mimeType?: 'image/jpeg' | 'image/webp';
  initialQuality?: number;
}

export const IMAGE_UPLOAD_PRESETS: Record<ImageUploadPreset, CompressImageOptions> = {
  avatar: {
    maxDimension: 256,
    maxBytes: 400 * 1024,
    mimeType: 'image/jpeg',
    initialQuality: 0.85,
  },
  projectIcon: {
    maxDimension: 512,
    maxBytes: 512 * 1024,
    mimeType: 'image/jpeg',
    initialQuality: 0.85,
  },
  orgLogo: {
    maxDimension: 512,
    maxBytes: 512 * 1024,
    mimeType: 'image/jpeg',
    initialQuality: 0.85,
  },
};

function resolveOptions(
  presetOrOptions: ImageUploadPreset | CompressImageOptions,
): CompressImageOptions {
  return typeof presetOrOptions === 'string'
    ? IMAGE_UPLOAD_PRESETS[presetOrOptions]
    : presetOrOptions;
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/png') return 'png';
  return 'jpg';
}

function outputFileName(originalName: string, mimeType: string): string {
  const base = originalName.replace(/\.[^.]+$/, '') || 'image';
  return `${base}.${extensionForMime(mimeType)}`;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image file'));
    };
    img.src = url;
  });
}

function scaledDimensions(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) {
    return { width, height };
  }
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

async function encodeCanvas(
  canvas: HTMLCanvasElement,
  options: CompressImageOptions,
): Promise<Blob> {
  const mimeType = options.mimeType ?? 'image/jpeg';
  const maxBytes = options.maxBytes;
  let quality = options.initialQuality ?? 0.85;
  const minQuality = 0.5;

  while (quality >= minQuality) {
    const blob = await canvasToBlob(canvas, mimeType, quality);
    if (blob && blob.size <= maxBytes) {
      return blob;
    }
    quality -= 0.1;
  }

  let workingCanvas = canvas;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const w = Math.max(1, Math.round(workingCanvas.width * 0.85));
    const h = Math.max(1, Math.round(workingCanvas.height * 0.85));
    const smaller = document.createElement('canvas');
    smaller.width = w;
    smaller.height = h;
    const ctx = smaller.getContext('2d');
    if (!ctx) break;
    ctx.drawImage(workingCanvas, 0, 0, w, h);
    workingCanvas = smaller;

    const blob = await canvasToBlob(workingCanvas, mimeType, minQuality);
    if (blob && blob.size <= maxBytes) {
      return blob;
    }
  }

  const fallback = await canvasToBlob(workingCanvas, mimeType, minQuality);
  if (!fallback) {
    throw new Error('Could not compress image');
  }
  return fallback;
}

function drawImageToCanvas(img: HTMLImageElement, maxDimension: number): HTMLCanvasElement {
  const { width, height } = scaledDimensions(img.naturalWidth, img.naturalHeight, maxDimension);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not prepare image for upload');
  }
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

/**
 * Resize and compress a user-selected image file for multipart upload.
 * Returns the original file when it is already within preset limits.
 */
export async function compressImageForUpload(
  file: File,
  presetOrOptions: ImageUploadPreset | CompressImageOptions = 'projectIcon',
): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image');
  }

  const options = resolveOptions(presetOrOptions);
  const img = await loadImageFromFile(file);
  const { width, height } = scaledDimensions(
    img.naturalWidth,
    img.naturalHeight,
    options.maxDimension,
  );

  if (file.size <= options.maxBytes && img.naturalWidth === width && img.naturalHeight === height) {
    return file;
  }

  const canvas = drawImageToCanvas(img, options.maxDimension);
  const blob = await encodeCanvas(canvas, options);
  const mimeType = options.mimeType ?? 'image/jpeg';

  return new File([blob], outputFileName(file.name, mimeType), {
    type: mimeType,
    lastModified: Date.now(),
  });
}

/**
 * Compress an image and return a `data:image/...;base64,...` string (profile / org logo JSON APIs).
 */
export async function compressImageToDataUrl(
  file: File,
  presetOrOptions: ImageUploadPreset | CompressImageOptions = 'avatar',
): Promise<string> {
  const compressed = await compressImageForUpload(file, presetOrOptions);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('Could not read compressed image'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read compressed image'));
    reader.readAsDataURL(compressed);
  });
}
