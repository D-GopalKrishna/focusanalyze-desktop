import { toast } from '@/lib/hooks/use-toast';

/** Keep in sync with focusai/utils/image_prompt_limits.py (backend). */
export const MAX_IMAGES_PER_PROMPT = 3;
export const MAX_IMAGE_FILE_SIZE_MB = 5;
const MAX_IMAGE_FILE_SIZE_BYTES = MAX_IMAGE_FILE_SIZE_MB * 1024 * 1024;

export type FocusAISelectedImage = { file: File; preview: string };

const VALID_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

function validateImageFile(file: File, currentCount: number): boolean {
  if (currentCount >= MAX_IMAGES_PER_PROMPT) {
    toast({
      title: 'Too many images',
      description: `You can only upload up to ${MAX_IMAGES_PER_PROMPT} images at a time`,
      variant: 'destructive',
    });
    return false;
  }

  if (!file.type.startsWith('image/')) {
    toast({
      title: 'Invalid file type',
      description: 'Please upload an image file (PNG, JPEG, WebP, or GIF)',
      variant: 'destructive',
    });
    return false;
  }

  if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
    toast({
      title: 'File too large',
      description: `Image must be less than ${MAX_IMAGE_FILE_SIZE_MB}MB`,
      variant: 'destructive',
    });
    return false;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !VALID_IMAGE_EXTENSIONS.includes(extension)) {
    toast({
      title: 'Invalid file type',
      description: 'Please upload a PNG, JPEG, WebP, or GIF file',
      variant: 'destructive',
    });
    return false;
  }

  return true;
}

export function readImagePreview(file: File): Promise<FocusAISelectedImage | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      resolve(result ? { file, preview: result as string } : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/** Add up to MAX_IMAGES_PER_PROMPT image files (file picker, paste, drag-drop). */
export async function addImageFiles(
  files: File[],
  selectedImages: FocusAISelectedImage[],
  setSelectedImages: (images: FocusAISelectedImage[]) => void,
) {
  const imageFiles = files.filter((f) => f.type.startsWith('image/'));
  if (imageFiles.length === 0) {
    toast({
      title: 'Invalid file type',
      description: 'Please drop image files only (PNG, JPEG, WebP, or GIF)',
      variant: 'destructive',
    });
    return;
  }

  const remainingSlots = MAX_IMAGES_PER_PROMPT - selectedImages.length;
  if (remainingSlots <= 0) {
    toast({
      title: 'Too many images',
      description: `You can only upload up to ${MAX_IMAGES_PER_PROMPT} images at a time`,
      variant: 'destructive',
    });
    return;
  }

  const filesToProcess = imageFiles.slice(0, remainingSlots);
  if (imageFiles.length > remainingSlots) {
    toast({
      title: 'Too many images',
      description: `You can only upload up to ${MAX_IMAGES_PER_PROMPT} images at a time`,
      variant: 'destructive',
    });
  }

  let current = [...selectedImages];
  for (const file of filesToProcess) {
    if (!validateImageFile(file, current.length)) continue;
    const image = await readImagePreview(file);
    if (image) {
      current = [...current, image];
      setSelectedImages(current);
    }
  }
}

export const handleImageSelect = async (
  event: React.ChangeEvent<HTMLInputElement>,
  selectedImages: FocusAISelectedImage[],
  setSelectedImages: (images: FocusAISelectedImage[]) => void,
) => {
  const files = event.target.files;
  if (!files) return;

  await addImageFiles(Array.from(files), selectedImages, setSelectedImages);
  event.target.value = '';
};

export const handlePaste = async (
  event: React.ClipboardEvent,
  selectedImages: FocusAISelectedImage[],
  setSelectedImages: (images: FocusAISelectedImage[]) => void,
) => {
  const items = event.clipboardData?.items;
  if (!items || !event.clipboardData) return;

  const imageItems = Array.from(items).filter((item) => item.type.startsWith('image/'));
  if (imageItems.length === 0) return;

  event.preventDefault();

  const pastedFiles: File[] = [];
  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) continue;
    const timestamp = Date.now();
    pastedFiles.push(
      new File([file], `pasted-image-${timestamp}.png`, {
        type: file.type,
        lastModified: timestamp,
      }),
    );
  }

  await addImageFiles(pastedFiles, selectedImages, setSelectedImages);
};

export const handleImageDrop = async (
  event: React.DragEvent,
  selectedImages: FocusAISelectedImage[],
  setSelectedImages: (images: FocusAISelectedImage[]) => void,
) => {
  event.preventDefault();
  event.stopPropagation();

  const files = Array.from(event.dataTransfer.files ?? []);
  if (files.length === 0) return;

  await addImageFiles(files, selectedImages, setSelectedImages);
};

export const handleRemoveImage = (
  index: number,
  selectedImages: FocusAISelectedImage[],
  setSelectedImages: (images: FocusAISelectedImage[]) => void,
  fileInputRef: React.RefObject<HTMLInputElement>,
) => {
  setSelectedImages(selectedImages.filter((_, i) => i !== index));
  if (fileInputRef.current) {
    fileInputRef.current.value = '';
  }
};

export const getDynamicPaddingForInput = (
  getProjectIcon: () => string,
  getProjectLabel: () => string,
) => {
  // Check if we're in a browser environment
  if (typeof document === 'undefined') {
    return '12rem'; // fallback for SSR
  }

  const icon = getProjectIcon();
  const label = getProjectLabel();

  // Create a temporary canvas to measure text width
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return '12rem'; // fallback

  // Set font to match the dropdown button style (text-xs font-normal)
  context.font = '12px system-ui, -apple-system, sans-serif';

  // Measure the combined text (icon + space + label)
  const textToMeasure = `${icon} ${label}`;
  const textWidth = context.measureText(textToMeasure).width;

  // Convert pixels to rem (assuming 1rem = 16px)
  const textWidthRem = textWidth / 16;

  // Add some extra padding for the chevron and spacing
  const extraPadding = 6.5; // 2rem extra for chevron and spacing
  const totalPadding = textWidthRem + extraPadding;

  return `${totalPadding}rem`;
};
