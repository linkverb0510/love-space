import { describe, expect, it } from 'vitest';
import { ConflictError } from './errors';
import { buildPhotoStoragePath, SupabaseSpaceRepository, toPhotoMetadata } from './repository';

function config() {
  return {
    dataMode: 'supabase' as const,
    publicDemo: false,
    spacePath: 'private-space',
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon-key',
    privateSpacePath: 'private-space',
    sharedAuthEmail: 'shared@example.com'
  };
}

function createClient(overrides: Record<string, unknown> = {}) {
  const space = {
    id: 'space-1',
    slug: 'private-space',
    name: 'our little space',
    relationship_start: null,
    timezone: 'Asia/Hong_Kong',
    public_demo: false,
    version: 2,
    updated_at: '2026-08-03T00:00:00.000Z'
  };
  return {
    from(table: string) {
      if (table === 'spaces') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: space, error: null }) }) }),
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({ single: async () => overrides.settings ?? { data: { ...space, version: 3 }, error: null } })
              })
            })
          })
        };
      }
      if (table === 'timeline_entries') {
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({ single: async () => overrides.timeline ?? { data: null, error: { message: 'No rows updated' } } })
                })
              })
            })
          }),
          insert: () => ({ select: () => ({ single: async () => overrides.timelineInsert ?? { data: null, error: null } }) })
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }
  };
}

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

describe('versioned shared writes', () => {
  it('throws a ConflictError when a stale timeline update affects no row', async () => {
    const repository = new SupabaseSpaceRepository(createClient() as never, config());

    await expect(repository.saveTimelineEntry({
      id: 'timeline-1',
      type: 'memory',
      title: '新的回忆',
      date: '2026-08-03',
      body: '内容',
      tags: [],
      version: 1
    })).rejects.toBeInstanceOf(ConflictError);
  });

  it('returns the server row after a versioned timeline update', async () => {
    const repository = new SupabaseSpaceRepository(createClient({
      timeline: {
        data: {
          id: 'timeline-1',
          type: 'memory',
          title: '新的回忆',
          date: '2026-08-03',
          location: null,
          body: '内容',
          tags: [],
          kind: null,
          repeat_annual: false,
          time: null,
          note: null,
          system_role: null,
          created_at: '2026-08-03T00:00:00.000Z',
          version: 2,
          updated_at: '2026-08-03T00:01:00.000Z'
        },
        error: null
      }
    }) as never, config());

    await expect(repository.saveTimelineEntry({
      id: 'timeline-1',
      type: 'memory',
      title: '新的回忆',
      date: '2026-08-03',
      body: '内容',
      tags: [],
      version: 1
    })).resolves.toMatchObject({ id: 'timeline-1', version: 2, updatedAt: '2026-08-03T00:01:00.000Z' });
  });

  it('does not retain the destructive snapshot API', () => {
    const repository = new SupabaseSpaceRepository(createClient() as never, config());

    expect('saveSnapshot' in repository).toBe(false);
  });
});
