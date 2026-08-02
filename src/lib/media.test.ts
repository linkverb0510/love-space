import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, validateImageFile } from './media';

function fileLike(type: string, size: number): File {
  return { name: 'photo.jpg', type, size } as File;
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
});
