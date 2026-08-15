export type ViewKey = 'home' | 'timeline' | 'photos' | 'plans' | 'settings';

export type SpaceRole = 'l' | 'w' | 'both' | 'unknown';
export type AssignedRole = Exclude<SpaceRole, 'unknown'>;

export type TimelineEntryType = 'memory' | 'milestone';
export type MilestoneKind = 'anniversary' | 'one-off';

type TimelineBase = {
  id: string;
  title: string;
  date: string;
  location?: string;
  createdAt?: string;
  version?: number;
  updatedAt?: string;
  createdByRole?: SpaceRole;
};

export type MemoryEntry = TimelineBase & {
  type: 'memory';
  body: string;
  tags: string[];
};

export type MilestoneEntry = TimelineBase & {
  type: 'milestone';
  kind: MilestoneKind;
  repeatAnnual: boolean;
  time?: string;
  note?: string;
  systemRole?: 'relationship-start';
};

export type TimelineEntry = MemoryEntry | MilestoneEntry;

export type TimelineDisplayEntry = TimelineEntry & {
  nextOccurrence?: string;
  countdownDays?: number;
};

export type PhotoMediaKind = 'image' | 'live';
export type PhotoAssetVariant = 'thumbnail' | 'display' | 'original' | 'motion';

export type Photo = {
  id: string;
  src: string;
  caption: string;
  date: string;
  createdAt?: string;
  timelineEntryId?: string;
  createdByRole?: SpaceRole;
  mediaKind?: PhotoMediaKind;
  previewAvailable?: boolean;
  width?: number;
  height?: number;
  originalMime?: string;
  motionMime?: string;
  originalBytes?: number;
  storagePath?: string;
  thumbnailStoragePath?: string;
  originalStoragePath?: string;
  motionStoragePath?: string;
  assetKey?: string;
  thumbnailAssetKey?: string;
  originalAssetKey?: string;
  motionAssetKey?: string;
  thumbnailSrc?: string;
  originalSrc?: string;
  motionSrc?: string;
  version?: number;
  updatedAt?: string;
};

export type PlanType = '地点' | '餐厅' | '电影' | '礼物' | '生活' | '纪念日' | '其他';
export type PlanStatus = '想法' | '计划中' | '已完成' | '搁置';

export type PlanItem = {
  id: string;
  title: string;
  type: PlanType;
  status: PlanStatus;
  dueDate?: string;
  location?: string;
  link?: string;
  image?: string;
  note?: string;
  priority: 'low' | 'medium' | 'high';
  assignee: AssignedRole;
  createdByRole?: SpaceRole;
  completedAt?: string;
  version?: number;
  updatedAt?: string;
};

export type SpaceData = {
  spaceName: string;
  relationshipStart: string | null;
  timezone: string;
  timeline: TimelineEntry[];
  photos: Photo[];
  plans: PlanItem[];
  schemaVersion?: number;
  version?: number;
};
