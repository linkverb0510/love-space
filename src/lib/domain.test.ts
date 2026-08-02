import { describe, expect, it } from 'vitest';
import {
  createMemoryDraftFromPlan,
  getNextMilestone,
  getTimelineEntries,
  migrateLegacySpaceData
} from './domain';
import type { SpaceData } from '../types';

const legacyData = {
  spaceName: 'our little space',
  relationshipStart: '2024-02-29',
  timezone: 'Asia/Hong_Kong',
  events: [
    {
      id: 'event-anniversary',
      title: '我们的纪念日',
      date: '2022-08-14',
      kind: 'anniversary' as const,
      repeatAnnual: true,
      location: '从这一天开始'
    }
  ],
  memories: [
    {
      id: 'memory-trip',
      title: '第一次一起看海',
      date: '2025-09-21',
      location: '赤柱',
      body: '风很大，但我们走了很久。',
      tags: ['旅行'],
      photoIds: []
    }
  ],
  photos: [],
  tasks: [
    {
      id: 'task-sunset',
      title: '找一个周末去看日落',
      category: '一起去做',
      priority: 'high' as const,
      assignee: '一起' as const,
      done: false
    }
  ],
  collections: [
    {
      id: 'collection-island',
      title: '长洲岛一日游',
      type: '地点' as const,
      status: '想去' as const,
      location: '长洲岛',
      note: '想找一家可以看海的店。'
    }
  ]
};

describe('simplified relationship domain', () => {
  it('does not create a system timeline node for an empty relationship start date', () => {
    const emptySpace = {
      spaceName: 'our little space',
      relationshipStart: null,
      timezone: 'Asia/Hong_Kong',
      timeline: [],
      photos: [],
      plans: []
    } as unknown as SpaceData;

    expect(getTimelineEntries(emptySpace, new Date('2026-08-01T12:00:00Z'))).toEqual([]);
    expect(getNextMilestone(emptySpace, new Date('2026-08-01T12:00:00Z'))).toBeUndefined();
  });

  it('merges legacy tasks and collections into one plan list', () => {
    const migrated = migrateLegacySpaceData(legacyData);

    expect(migrated.plans).toEqual([
      expect.objectContaining({ id: 'task-sunset', title: '找一个周末去看日落', status: '计划中' }),
      expect.objectContaining({ id: 'collection-island', title: '长洲岛一日游', status: '想法', location: '长洲岛' })
    ]);
    expect(migrated).not.toHaveProperty('tasks');
    expect(migrated).not.toHaveProperty('collections');
  });

  it('builds one continuous timeline with a single relationship-start node', () => {
    const migrated = migrateLegacySpaceData(legacyData);
    const entries = getTimelineEntries(migrated, new Date('2026-08-01T12:00:00Z'));

    expect(entries.map((entry) => entry.id)).toEqual([
      'memory-trip',
      'relationship-start',
      'event-anniversary'
    ]);
    expect(entries.find((entry) => entry.id === 'event-anniversary')).toMatchObject({
      type: 'milestone',
      nextOccurrence: '2026-08-14',
      countdownDays: 13
    });
  });

  it('selects the next upcoming milestone without creating recurring copies', () => {
    const migrated = migrateLegacySpaceData(legacyData);
    const milestone = getNextMilestone(migrated, new Date('2026-08-20T12:00:00Z'));

    expect(milestone).toMatchObject({ id: 'event-anniversary', nextOccurrence: '2027-08-14' });
  });

  it('creates a prefilled memory draft from a completed plan', () => {
    const migrated = migrateLegacySpaceData(legacyData);
    const plan = migrated.plans.find((item) => item.id === 'task-sunset');

    expect(plan).toBeDefined();
    expect(createMemoryDraftFromPlan(plan!, '2026-08-01')).toEqual({
      id: '',
      type: 'memory',
      title: '找一个周末去看日落',
      date: '2026-08-01',
      location: '',
      body: '',
      tags: ['计划'],
      photoIds: []
    });
  });
});

export type LegacyFixture = SpaceData;
