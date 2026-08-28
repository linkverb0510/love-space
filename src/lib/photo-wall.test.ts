import { describe, expect, it } from 'vitest';
import { filterPhotos, groupPhotosByDate } from './domain';
import type { Photo } from '../types';

function photo(id: string, date: string, createdAt?: string): Photo {
  return { id, src: `${id}.webp`, caption: id, date, createdAt };
}

describe('photo wall grouping', () => {
  it('groups photos by month and then day in newest-first order', () => {
    const groups = groupPhotosByDate([
      photo('older', '2025-12-24', '2025-12-24T09:00:00Z'),
      photo('newer', '2026-01-02', '2026-01-02T10:00:00Z'),
      photo('same-day-later', '2026-01-02', '2026-01-02T12:00:00Z'),
      photo('same-day-earlier', '2026-01-02', '2026-01-02T08:00:00Z')
    ]);

    expect(groups.map((group) => group.month)).toEqual(['2026-01', '2025-12']);
    expect(groups[0].days.map((day) => day.date)).toEqual(['2026-01-02']);
    expect(groups[0].days[0].photos.map((item) => item.id)).toEqual([
      'same-day-later',
      'newer',
      'same-day-earlier'
    ]);
  });

  it('does not mutate the source photo array', () => {
    const source = [photo('first', '2026-01-01'), photo('second', '2026-01-02')];
    const originalIds = source.map((item) => item.id);

    groupPhotosByDate(source);

    expect(source.map((item) => item.id)).toEqual(originalIds);
  });
});

describe('photo wall filtering', () => {
  const source: Photo[] = [
    { ...photo('l-linked', '2026-01-02'), caption: '海边的风', createdByRole: 'l', timelineEntryId: 'memory-1' },
    { ...photo('w-standalone', '2026-01-02'), caption: '甜品时间', createdByRole: 'w' },
    { ...photo('l-standalone', '2025-12-24'), caption: '冬夜的灯', createdByRole: 'l' }
  ];

  it('filters by month', () => {
    expect(filterPhotos(source, { month: '2026-01', role: 'all', linked: 'all', query: '' }).map((item) => item.id)).toEqual(['l-linked', 'w-standalone']);
  });

  it('filters by creator role', () => {
    expect(filterPhotos(source, { month: 'all', role: 'w', linked: 'all', query: '' }).map((item) => item.id)).toEqual(['w-standalone']);
  });

  it('filters by linked state', () => {
    expect(filterPhotos(source, { month: 'all', role: 'all', linked: 'standalone', query: '' }).map((item) => item.id)).toEqual(['w-standalone', 'l-standalone']);
  });

  it('matches caption text case-insensitively', () => {
    expect(filterPhotos(source, { month: 'all', role: 'all', linked: 'all', query: '海边' }).map((item) => item.id)).toEqual(['l-linked']);
  });

  it('combines filters with AND semantics', () => {
    expect(filterPhotos(source, { month: '2026-01', role: 'l', linked: 'linked', query: '' }).map((item) => item.id)).toEqual(['l-linked']);
    expect(filterPhotos(source, { month: '2025-12', role: 'w', linked: 'all', query: '' })).toEqual([]);
  });
});
