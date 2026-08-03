import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSpaceData, resetSpaceData, toPersistedSpaceData } from './storage';

function createLocalStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  };
}

describe('empty local space storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resets to an empty space instead of restoring sample content', () => {
    vi.stubGlobal('window', { localStorage: createLocalStorage() });

    expect(resetSpaceData()).toEqual({
      schemaVersion: 3,
      spaceName: 'our little space',
      relationshipStart: null,
      timezone: 'Asia/Hong_Kong',
      timeline: [],
      photos: [],
      plans: [],
      version: 1
    });
  });

  it('does not persist runtime blob URLs when a photo has a local asset key', () => {
    const persisted = toPersistedSpaceData({
      spaceName: 'our little space',
      relationshipStart: null,
      timezone: 'Asia/Hong_Kong',
      timeline: [],
      photos: [{ id: 'photo-1', src: 'blob:runtime-url', assetKey: 'photo-1', caption: '照片', date: '2026-08-02' }],
      plans: [],
      version: 1
    });

    expect(persisted.photos[0]).toMatchObject({ id: 'photo-1', assetKey: 'photo-1' });
    expect(persisted.photos[0].src).toBe('');
  });

  it('invalidates the old demo key instead of reviving its sample data', () => {
    const localStorage = createLocalStorage();
    localStorage.setItem('love-space-demo-data', JSON.stringify({ relationshipStart: '2024-02-29', events: [{ id: 'sample' }] }));
    vi.stubGlobal('window', { localStorage });

    expect(loadSpaceData()).toMatchObject({ relationshipStart: null, timeline: [], photos: [], plans: [] });
    expect(localStorage.getItem('love-space-demo-data')).toBeNull();
  });

  it('assigns a version to legacy entities before they can be edited', () => {
    const localStorage = createLocalStorage();
    localStorage.setItem('love-space-data-v2', JSON.stringify({
      spaceName: 'our little space',
      relationshipStart: null,
      timezone: 'Asia/Hong_Kong',
      timeline: [{ id: 'memory-1', type: 'memory', title: '回忆', date: '2026-08-03', body: '内容', tags: [] }],
      photos: [{ id: 'photo-1', src: '', caption: '照片', date: '2026-08-03' }],
      plans: [{ id: 'plan-1', title: '计划', type: '生活', status: '计划中', priority: 'medium', assignee: '一起' }]
    }));
    vi.stubGlobal('window', { localStorage });

    expect(loadSpaceData()).toMatchObject({
      version: 1,
      timeline: [{ id: 'memory-1', version: 1 }],
      photos: [{ id: 'photo-1', version: 1 }],
      plans: [{ id: 'plan-1', version: 1 }]
    });
  });
});
