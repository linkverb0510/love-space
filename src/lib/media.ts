export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 2048;
const IMAGE_QUALITY = 0.84;

type DrawableImage = ImageBitmap | HTMLImageElement;

async function decodeImage(file: File): Promise<DrawableImage> {
  try {
    return await createImageBitmap(file);
  } catch {
    const sourceUrl = URL.createObjectURL(file);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('图片无法读取，请换一张常见格式的图片。'));
        image.src = sourceUrl;
      });
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }
}

export function validateImageFile(file: File): string | undefined {
  if (!file.type.startsWith('image/')) return '不是图片文件。';
  if (file.size > MAX_IMAGE_BYTES) return '图片超过 20MB。';
  return undefined;
}

export async function prepareImageFile(file: File): Promise<Blob> {
  const validationError = validateImageFile(file);
  if (validationError) throw new Error(validationError);

  const image = await decodeImage(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理图片。');

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if ('close' in image) image.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', IMAGE_QUALITY));
  if (!blob) throw new Error('图片压缩失败。');
  return blob;
}
