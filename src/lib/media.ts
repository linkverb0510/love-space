export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_MEDIA_BYTES = MAX_IMAGE_BYTES;
export const THUMBNAIL_IMAGE_DIMENSION = 720;
export const DISPLAY_IMAGE_DIMENSION = 2048;
const THUMBNAIL_QUALITY = 0.88;
const DISPLAY_QUALITY = 0.92;

type DrawableImage = ImageBitmap | HTMLImageElement;

export type PhotoFilePair = {
  stem: string;
  image?: File;
  motion?: File;
};

export type PreparedPhotoAssets = {
  original: File;
  thumbnail: Blob;
  display: Blob;
  motion?: File;
  width?: number;
  height?: number;
  previewAvailable: boolean;
};

async function decodeImage(file: File): Promise<DrawableImage> {
  try {
    return await createImageBitmap(file);
  } catch {
    const sourceUrl = URL.createObjectURL(file);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('图片无法读取，请使用 JPEG、PNG、WebP 或支持 HEIC 的浏览器。'));
        image.src = sourceUrl;
      });
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }
}

function isImageFile(file: File): boolean {
  return file.type ? file.type.startsWith('image/') : /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name);
}

function isMotionFile(file: File): boolean {
  return file.type ? file.type.startsWith('video/') : /\.(m4v|mov|mp4|webm)$/i.test(file.name);
}

export function validateMediaFile(file: File): string | undefined {
  if (!isImageFile(file) && !isMotionFile(file)) return '不是可识别的图片或动态片段。';
  if (file.size > MAX_MEDIA_BYTES) return '媒体超过 20MB。';
  return undefined;
}

export function validateImageFile(file: File): string | undefined {
  if (!isImageFile(file)) return '不是图片文件。';
  if (file.size > MAX_IMAGE_BYTES) return '图片超过 20MB。';
  return undefined;
}

export function calculateImageVariant(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

export function getFileStem(name: string): string {
  return name.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '').trim().toLowerCase() ?? '';
}

function formatDateParts(year: number, month: number, day: number): string | undefined {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return undefined;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function parseDateText(value: string): string | undefined {
  const match = value.match(/(19\d{2}|20\d{2})[:\-/](\d{1,2})[:\-/](\d{1,2})/);
  return match ? formatDateParts(Number(match[1]), Number(match[2]), Number(match[3])) : undefined;
}

function parseFilenameDate(name: string): string | undefined {
  const match = name.match(/(?:^|[^\d])(19\d{2}|20\d{2})[-_. ](\d{1,2})[-_. ](\d{1,2})(?:[^\d]|$)/);
  if (match) return formatDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
  const compact = name.match(/(?:^|[^\d])((?:19|20)\d{2})(\d{2})(\d{2})(?:[^\d]|$)/);
  if (compact) return formatDateParts(Number(compact[1]), Number(compact[2]), Number(compact[3]));
  const wechat = name.match(/mmexport(1\d{12})/i);
  if (wechat) {
    const date = new Date(Number(wechat[1]));
    if (date.getFullYear() >= 2012 && date.getFullYear() <= 2037) {
      return formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
    }
  }
  return undefined;
}

function parseTiffDate(bytes: Uint8Array, tiffOffset: number): string | undefined {
  if (tiffOffset + 8 > bytes.length) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const littleEndian = bytes[tiffOffset] === 0x49 && bytes[tiffOffset + 1] === 0x49;
  if (!littleEndian && !(bytes[tiffOffset] === 0x4d && bytes[tiffOffset + 1] === 0x4d)) return undefined;
  const read16 = (offset: number) => view.getUint16(offset, littleEndian);
  const read32 = (offset: number) => view.getUint32(offset, littleEndian);
  if (read16(tiffOffset + 2) !== 42) return undefined;

  const typeSizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const readEntry = (entryOffset: number, type: number, count: number): string | number | undefined => {
    const size = typeSizes[type];
    if (!size || count < 1) return undefined;
    const byteLength = size * count;
    const valueOffset = byteLength <= 4 ? entryOffset + 8 : tiffOffset + read32(entryOffset + 8);
    if (valueOffset < 0 || valueOffset + byteLength > bytes.length) return undefined;
    if (type === 2) {
      let end = valueOffset;
      while (end < valueOffset + byteLength && bytes[end] !== 0) end += 1;
      return new TextDecoder().decode(bytes.slice(valueOffset, end));
    }
    if (type === 4 && count === 1) return read32(valueOffset);
    return undefined;
  };

  const visited = new Set<number>();
  const readIfd = (relativeOffset: number, depth: number): { original?: string; digitized?: string; general?: string } => {
    if (depth > 2 || visited.has(relativeOffset)) return {};
    visited.add(relativeOffset);
    const ifdOffset = tiffOffset + relativeOffset;
    if (ifdOffset < tiffOffset || ifdOffset + 2 > bytes.length) return {};
    const entryCount = read16(ifdOffset);
    const dates: { original?: string; digitized?: string; general?: string } = {};
    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = ifdOffset + 2 + index * 12;
      if (entryOffset + 12 > bytes.length) break;
      const tag = read16(entryOffset);
      const type = read16(entryOffset + 2);
      const count = read32(entryOffset + 4);
      const value = readEntry(entryOffset, type, count);
      if (typeof value === 'string') {
        if (tag === 0x9003) dates.original = parseDateText(value);
        if (tag === 0x9004) dates.digitized = parseDateText(value);
        if (tag === 0x0132) dates.general = parseDateText(value);
      }
      if (tag === 0x8769 && typeof value === 'number') {
        Object.assign(dates, readIfd(value, depth + 1));
      }
    }
    return dates;
  };

  const dates = readIfd(read32(tiffOffset + 4), 0);
  return dates.original ?? dates.digitized ?? dates.general;
}

function hasBytes(bytes: Uint8Array, offset: number, values: number[]): boolean {
  return values.every((value, index) => bytes[offset + index] === value);
}

function findExifDate(bytes: Uint8Array): string | undefined {
  for (let index = 0; index + 6 <= bytes.length; index += 1) {
    if (hasBytes(bytes, index, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00])) {
      const date = parseTiffDate(bytes, index + 6);
      if (date) return date;
    }
  }

  if (hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
      const type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
      if (type === 'eXIf') {
        const date = parseTiffDate(bytes, offset + 8);
        if (date) return date;
      }
      offset += 12 + length;
    }
  }
  return undefined;
}

async function readEmbeddedPhotoDate(file: File): Promise<string | undefined> {
  try {
    const source = typeof file.slice === 'function' ? file.slice(0, Math.min(file.size || 2 * 1024 * 1024, 2 * 1024 * 1024)) : file;
    const buffer = await source.arrayBuffer();
    return findExifDate(new Uint8Array(buffer));
  } catch {
    return undefined;
  }
}

function dateFromLastModified(timestamp: number | undefined): string | undefined {
  if (!timestamp || timestamp <= 0) return undefined;
  const date = new Date(timestamp);
  return formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export async function inferPhotoDate(file: File, fallbackDate: string): Promise<string> {
  return await readEmbeddedPhotoDate(file)
    ?? parseFilenameDate(file.name)
    ?? dateFromLastModified(file.lastModified)
    ?? parseDateText(fallbackDate)
    ?? fallbackDate;
}

export function pairPhotoFiles(files: File[]): PhotoFilePair[] {
  const pairs = new Map<string, PhotoFilePair>();
  files.forEach((file) => {
    const stem = getFileStem(file.name);
    const current = pairs.get(stem) ?? { stem };
    if (isImageFile(file) && !current.image) current.image = file;
    if (isMotionFile(file) && !current.motion) current.motion = file;
    pairs.set(stem, current);
  });
  return Array.from(pairs.values());
}

async function encodeImage(image: DrawableImage, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理图片。');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  if (!blob) throw new Error('图片展示版生成失败。');
  return blob;
}

export async function preparePhotoAssets(file: File, motion?: File): Promise<PreparedPhotoAssets> {
  const validationError = validateImageFile(file);
  if (validationError) throw new Error(validationError);
  if (motion) {
    const motionError = validateMediaFile(motion);
    if (motionError || !isMotionFile(motion)) throw new Error(motionError ?? '动态片段格式不受支持。');
  }

  try {
    const image = await decodeImage(file);
    const thumbnailSize = calculateImageVariant(image.width, image.height, THUMBNAIL_IMAGE_DIMENSION);
    const displaySize = calculateImageVariant(image.width, image.height, DISPLAY_IMAGE_DIMENSION);
    const thumbnail = await encodeImage(image, thumbnailSize.width, thumbnailSize.height, THUMBNAIL_QUALITY);
    const display = await encodeImage(image, displaySize.width, displaySize.height, DISPLAY_QUALITY);
    if ('close' in image) image.close();
    const width = image.width;
    const height = image.height;
    return {
      original: file,
      thumbnail,
      display,
      motion,
      width,
      height,
      previewAvailable: true
    };
  } catch (error) {
    if (motion) return { original: file, thumbnail: file, display: file, motion, previewAvailable: false };
    if (error instanceof Error && error.message.startsWith('图片无法读取')) {
      return { original: file, thumbnail: file, display: file, previewAvailable: false };
    }
    throw error;
  }
}

// Kept as a compatibility wrapper for callers outside the photo repository.
export async function prepareImageFile(file: File): Promise<Blob> {
  const assets = await preparePhotoAssets(file);
  return assets.display;
}
