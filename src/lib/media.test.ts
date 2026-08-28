import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  MAX_MEDIA_BYTES,
  calculateImageVariant,
  inferPhotoDate,
  getFileStem,
  pairPhotoFiles,
  validateImageFile,
  validateMediaFile
} from './media';

function fileLike(type: string, size: number): File {
  return { name: 'photo.jpg', type, size } as File;
}

function exifDateFile(): File {
  const date = Array.from(new TextEncoder().encode('2025:03:17 12:24:35\0'));
  const tiff = [
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x03, 0x90, 0x02, 0x00, 0x14, 0x00, 0x00, 0x00,
    0x1a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ...date
  ];
  const exif = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const length = exif.length + 2;
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...exif, 0xff, 0xd9]);
  return {
    name: 'camera-original.jpg',
    type: 'image/jpeg',
    size: bytes.length,
    lastModified: 0,
    arrayBuffer: async () => bytes.buffer
  } as File;
}

describe('image upload validation', () => {
  it('accepts an image within the upload limit', () => {
    expect(validateImageFile(fileLike('image/jpeg', 1024))).toBeUndefined();
  });

  it('rejects non-image files before reading them', () => {
    expect(validateImageFile(fileLike('application/pdf', 1024))).toBe('不是图片文件。');
  });

  it('rejects images larger than the supported limit', () => {
    expect(validateImageFile(fileLike('image/jpeg', MAX_IMAGE_BYTES + 1))).toBe('图片超过 20MB。');
  });

  it('accepts motion files as a separate media asset', () => {
    expect(validateMediaFile({ name: 'photo.mov', type: 'video/quicktime', size: 1024 } as File)).toBeUndefined();
  });

  it('uses the same limit for original media without changing its bytes', () => {
    expect(validateMediaFile(fileLike('image/heic', MAX_MEDIA_BYTES))).toBeUndefined();
    expect(validateMediaFile(fileLike('video/mp4', MAX_MEDIA_BYTES + 1))).toBe('媒体超过 20MB。');
  });

  it('calculates high-density display dimensions without upscaling', () => {
    expect(calculateImageVariant(4000, 2000, 720)).toEqual({ width: 720, height: 360 });
    expect(calculateImageVariant(400, 200, 720)).toEqual({ width: 400, height: 200 });
  });

  it('pairs same-stem still and motion files into one upload', () => {
    const files = [
      { name: 'IMG_001.HEIC', type: 'image/heic', size: 10 },
      { name: 'IMG_001.MOV', type: 'video/quicktime', size: 12 },
      { name: 'IMG_002.JPG', type: 'image/jpeg', size: 10 }
    ].map((file) => file as File);

    expect(pairPhotoFiles(files)).toEqual([
      { stem: 'img_001', image: files[0], motion: files[1] },
      { stem: 'img_002', image: files[2] }
    ]);
  });

  it('normalizes file stems for pairing', () => {
    expect(getFileStem('Vacation Photo.JPG')).toBe('vacation photo');
  });

  it('prefers EXIF capture date over file modification and fallback dates', async () => {
    await expect(inferPhotoDate(exifDateFile(), '2026-08-03')).resolves.toBe('2025-03-17');
  });

  it('recognizes a capture date embedded in a filename', async () => {
    const file = { name: '屏幕截图 2025-03-17 122435.png', type: 'image/png', size: 1, lastModified: 0 } as File;

    await expect(inferPhotoDate(file, '2026-08-03')).resolves.toBe('2025-03-17');
  });

  it('recognizes compact numeric filenames like IMG_20230826_153315', async () => {
    const file = { name: 'IMG_20230826_153315.jpg', type: 'image/jpeg', size: 1, lastModified: 0 } as File;

    await expect(inferPhotoDate(file, '2026-08-03')).resolves.toBe('2023-08-26');
  });

  it('recognizes wechat mmexport millisecond timestamps', async () => {
    const file = { name: 'mmexport1693030000000.jpg', type: 'image/jpeg', size: 1, lastModified: 0 } as File;

    await expect(inferPhotoDate(file, '2026-08-03')).resolves.toBe('2023-08-26');
  });

  it('rejects impossible compact dates instead of guessing', async () => {
    const file = { name: 'IMG_20231399.jpg', type: 'image/jpeg', size: 1, lastModified: 0 } as File;

    await expect(inferPhotoDate(file, '2026-08-03')).resolves.toBe('2026-08-03');
  });
});
