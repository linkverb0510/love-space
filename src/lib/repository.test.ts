import { describe, expect, it } from 'vitest';
import { buildPhotoStoragePath, toPhotoMetadata } from './repository';

describe('repository photo helpers', () => {
  it('keeps uploaded images under the selected space path', () => {
    expect(buildPhotoStoragePath('demo-space', 'photo-1')).toBe('demo-space/photo-1.webp');
  });

  it('passes photo metadata without a local object URL', () => {
    expect(toPhotoMetadata({
      id: 'photo-1',
      src: 'blob:http://localhost/photo-1',
      caption: '一张照片',
      date: '2026-08-02',
      timelineEntryId: 'memory-1',
      assetKey: 'photo-1'
    })).toEqual({
      id: 'photo-1',
      caption: '一张照片',
      date: '2026-08-02',
      timelineEntryId: 'memory-1'
    });
  });
});
