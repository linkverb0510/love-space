import { getCountdown, getDateInTimezone, getNextAnnualOccurrence } from './dates';
import type {
  MemoryEntry,
  MilestoneEntry,
  PlanItem,
  Photo,
  SpaceData,
  TimelineDisplayEntry,
  TimelineEntry
} from '../types';
import { normalizeAssignee } from './roles';

export type PhotoDayGroup = {
  date: string;
  photos: Photo[];
};

export type PhotoMonthGroup = {
  month: string;
  days: PhotoDayGroup[];
};

type LegacyEvent = {
  id: string;
  title: string;
  date: string;
  kind: 'anniversary' | 'one-off';
  repeatAnnual: boolean;
  time?: string;
  location?: string;
  note?: string;
};

type LegacyMemory = {
  id: string;
  title: string;
  date: string;
  location: string;
  body: string;
  tags: string[];
  photoIds: string[];
};

type LegacyPhoto = {
  id: string;
  src: string;
  caption: string;
  date: string;
  memoryId?: string;
};

type LegacyTask = {
  id: string;
  title: string;
  dueDate?: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  assignee: '一起' | '我' | '你';
  done: boolean;
};

type LegacyCollection = {
  id: string;
  title: string;
  type: '地点' | '餐厅' | '电影' | '礼物' | '其他';
  status: '想去' | '计划中' | '已完成';
  location?: string;
  note?: string;
  image?: string;
};

export type LegacySpaceData = {
  spaceName: string;
  relationshipStart: string;
  timezone: string;
  events: LegacyEvent[];
  memories: LegacyMemory[];
  photos: LegacyPhoto[];
  tasks: LegacyTask[];
  collections: LegacyCollection[];
};

function mapLegacyTaskType(category: string): PlanItem['type'] {
  if (category === '纪念日') return '纪念日';
  if (category === '一起去做') return '生活';
  return '其他';
}

function mapLegacyCollectionStatus(status: LegacyCollection['status']): PlanItem['status'] {
  if (status === '想去') return '想法';
  if (status === '已完成') return '已完成';
  return '计划中';
}

function migrateLegacyTask(task: LegacyTask): PlanItem {
  return {
    id: task.id,
    title: task.title,
    type: mapLegacyTaskType(task.category),
    status: task.done ? '已完成' : '计划中',
    dueDate: task.dueDate,
    priority: task.priority,
    assignee: normalizeAssignee(task.assignee),
    completedAt: task.done ? task.dueDate : undefined
  };
}

function migrateLegacyCollection(item: LegacyCollection): PlanItem {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    status: mapLegacyCollectionStatus(item.status),
    location: item.location,
    note: item.note,
    image: item.image,
    priority: 'medium',
    assignee: 'both'
  };
}

function hasNewShape(data: LegacySpaceData | SpaceData): data is SpaceData {
  return 'timeline' in data && 'plans' in data;
}

export function migrateLegacySpaceData(data: LegacySpaceData | SpaceData): SpaceData {
  if (hasNewShape(data)) {
    return {
      ...data,
      timeline: data.timeline ?? [],
      photos: data.photos ?? [],
      plans: data.plans ?? []
    };
  }

  const timeline: TimelineEntry[] = [
    ...data.events.map<MilestoneEntry>((event) => ({
      id: event.id,
      type: 'milestone',
      title: event.title,
      date: event.date,
      kind: event.kind,
      repeatAnnual: event.repeatAnnual,
      time: event.time,
      location: event.location,
      note: event.note
    })),
    ...data.memories.map<MemoryEntry>((memory) => ({
      id: memory.id,
      type: 'memory',
      title: memory.title,
      date: memory.date,
      location: memory.location,
      body: memory.body,
      tags: memory.tags
    }))
  ];

  return {
    spaceName: data.spaceName,
    relationshipStart: data.relationshipStart,
    timezone: data.timezone,
    timeline,
    photos: data.photos.map((photo) => ({
      id: photo.id,
      src: photo.src,
      caption: photo.caption,
      date: photo.date,
      timelineEntryId: photo.memoryId
    })),
    plans: [...data.tasks.map(migrateLegacyTask), ...data.collections.map(migrateLegacyCollection)]
  };
}

function createRelationshipStartEntry(startDate: string): MilestoneEntry {
  return {
    id: 'relationship-start',
    type: 'milestone',
    title: '我们正式开始的那一天',
    date: startDate,
    kind: 'anniversary',
    repeatAnnual: false,
    note: '这是你们共同时间线的起点。',
    systemRole: 'relationship-start'
  };
}

function enrichEntry(entry: TimelineEntry, now: Date): TimelineDisplayEntry {
  if (entry.type !== 'milestone' || entry.systemRole) return entry;

  const nextOccurrence = entry.repeatAnnual
    ? getNextAnnualOccurrence(entry.date, now)
    : entry.date >= getDateInTimezone(now) ? entry.date : undefined;

  return {
    ...entry,
    nextOccurrence,
    countdownDays: nextOccurrence ? getCountdown(nextOccurrence, now).days : undefined
  };
}

export function getTimelineEntries(space: SpaceData, now = new Date()): TimelineDisplayEntry[] {
  const systemEntries = space.relationshipStart ? [createRelationshipStartEntry(space.relationshipStart)] : [];
  return [...systemEntries, ...space.timeline]
    .map((entry) => enrichEntry(entry, now))
    .sort((a, b) => {
      const dateOrder = b.date.localeCompare(a.date);
      if (dateOrder !== 0) return dateOrder;
      return (b.createdAt ?? b.id).localeCompare(a.createdAt ?? a.id);
    });
}

export function groupPhotosByDate(photos: Photo[]): PhotoMonthGroup[] {
  const sorted = [...photos].sort((a, b) => {
    const dateOrder = b.date.localeCompare(a.date);
    if (dateOrder !== 0) return dateOrder;
    return (b.createdAt ?? b.id).localeCompare(a.createdAt ?? a.id);
  });
  const months = new Map<string, PhotoMonthGroup>();

  sorted.forEach((photo) => {
    const month = photo.date.slice(0, 7);
    const group = months.get(month) ?? { month, days: [] };
    const day = group.days.find((item) => item.date === photo.date);
    if (day) day.photos.push(photo);
    else group.days.push({ date: photo.date, photos: [photo] });
    months.set(month, group);
  });

  return Array.from(months.values());
}

export type PhotoRoleFilter = 'all' | 'l' | 'w' | 'both';
export type PhotoLinkFilter = 'all' | 'linked' | 'standalone';

export type PhotoFilter = {
  month: string;
  role: PhotoRoleFilter;
  linked: PhotoLinkFilter;
  query: string;
};

export function filterPhotos(photos: Photo[], filter: PhotoFilter): Photo[] {
  const query = filter.query.trim().toLowerCase();
  return photos.filter((photo) => {
    if (filter.month !== 'all' && photo.date.slice(0, 7) !== filter.month) return false;
    if (filter.role !== 'all' && photo.createdByRole !== filter.role) return false;
    if (filter.linked === 'linked' && !photo.timelineEntryId) return false;
    if (filter.linked === 'standalone' && photo.timelineEntryId) return false;
    if (query && !photo.caption.toLowerCase().includes(query)) return false;
    return true;
  });
}

export function getNextMilestone(space: SpaceData, now = new Date()): TimelineDisplayEntry | undefined {
  return getTimelineEntries(space, now)
    .filter((entry) => entry.type === 'milestone' && !entry.systemRole && entry.nextOccurrence)
    .sort((a, b) => (a.nextOccurrence ?? '').localeCompare(b.nextOccurrence ?? ''))[0];
}

export function createMemoryDraftFromPlan(plan: PlanItem, date: string): MemoryEntry {
  return {
    id: '',
    type: 'memory',
    title: plan.title,
    date,
    location: plan.location ?? '',
    body: '',
    tags: ['计划']
  };
}
