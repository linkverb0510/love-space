import { describe, expect, it } from 'vitest';
import { buildPhotoStoragePath, SupabaseSpaceRepository, toPhotoMetadata } from './repository';

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

describe('shared settings persistence', () => {
  it('reports a failed settings update when RLS updates zero rows', async () => {
    const client = {
      from(table: string) {
        if (table !== 'spaces') throw new Error(`Unexpected table: ${table}`);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'space-1',
                  slug: 'public-demo',
                  name: 'our little space',
                  relationship_start: null,
                  timezone: 'Asia/Hong_Kong',
                  public_demo: true
                },
                error: null
              })
            })
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: null, error: { message: 'No rows updated' } })
              })
            })
          })
        };
      }
    };

    const repository = new SupabaseSpaceRepository(client as never, {
      dataMode: 'supabase',
      publicDemo: true,
      spacePath: 'public-demo',
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key',
      spacePasswordHash: 'password-hash'
    });

    await expect(repository.saveSettings({
      spaceName: 'our little space',
      relationshipStart: '2024-02-29',
      timezone: 'Asia/Hong_Kong'
    })).rejects.toThrow('No rows updated');
  });
});
