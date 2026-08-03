import { deleteLocalAsset, saveLocalAsset } from './local-media';
import { prepareImageFile } from './media';
import { createSupabaseClient } from './supabase';
import { subscribeToSpaceChanges, type RealtimeClientLike } from './supabase-sync';
import type { RuntimeConfig } from './runtime-config';
import { EMPTY_SPACE_DATA, loadSpaceData, saveSpaceData } from './storage';
import { ConflictError } from './errors';
import { SPACE_TIMEZONE } from './dates';
import type { MemoryEntry, MilestoneEntry, Photo, PlanItem, SpaceData, TimelineEntry } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';

const PHOTO_BUCKET = 'love-space-photos';

export type SpaceSettings = Pick<SpaceData, 'spaceName' | 'relationshipStart' | 'timezone'> & {
  version?: number;
  updatedAt?: string;
};

export type PhotoMetadata = {
  id: string;
  caption: string;
  date: string;
  timelineEntryId?: string;
};

export type SpaceRepository = {
  load(): Promise<SpaceData>;
  saveSettings(settings: SpaceSettings, expectedVersion?: number): Promise<SpaceSettings>;
  saveTimelineEntry(entry: TimelineEntry): Promise<TimelineEntry>;
  deleteTimelineEntry(id: string, expectedVersion: number): Promise<void>;
  savePlan(plan: PlanItem): Promise<PlanItem>;
  deletePlan(id: string, expectedVersion: number): Promise<void>;
  uploadPhoto(file: File, metadata: PhotoMetadata): Promise<Photo>;
  updatePhoto(photo: Photo): Promise<Photo>;
  deletePhoto(photo: Photo, expectedVersion: number): Promise<void>;
  subscribe?(onData: (data: SpaceData) => void): () => void;
};

export function buildPhotoStoragePath(spacePath: string, photoId: string): string {
  const normalizedSpacePath = spacePath.replace(/^\/+|\/+$/g, '') || 'public-demo';
  return `${normalizedSpacePath}/${photoId}.webp`;
}

export function toPhotoMetadata(photo: Photo): PhotoMetadata {
  return {
    id: photo.id,
    caption: photo.caption,
    date: photo.date,
    timelineEntryId: photo.timelineEntryId
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function nextVersion(current?: number): number {
  return (current ?? 0) + 1;
}

function replaceTimelineEntry(data: SpaceData, entry: TimelineEntry): SpaceData {
  const exists = data.timeline.some((item) => item.id === entry.id);
  return { ...data, timeline: exists ? data.timeline.map((item) => item.id === entry.id ? entry : item) : [entry, ...data.timeline] };
}

function replacePlan(data: SpaceData, plan: PlanItem): SpaceData {
  const exists = data.plans.some((item) => item.id === plan.id);
  return { ...data, plans: exists ? data.plans.map((item) => item.id === plan.id ? plan : item) : [plan, ...data.plans] };
}

function assertLocalVersion(actual: number | undefined, expected: number | undefined, id: string): void {
  if (expected !== undefined && actual !== expected) throw new ConflictError(id);
}

class LocalSpaceRepository implements SpaceRepository {
  async load(): Promise<SpaceData> {
    return loadSpaceData();
  }

  async saveSettings(settings: SpaceSettings, expectedVersion?: number): Promise<SpaceSettings> {
    const data = loadSpaceData();
    assertLocalVersion(data.version, expectedVersion, 'space');
    const saved = { ...settings, version: nextVersion(data.version), updatedAt: nowIso() };
    saveSpaceData({ ...data, ...saved });
    return saved;
  }

  async saveTimelineEntry(entry: TimelineEntry): Promise<TimelineEntry> {
    const data = loadSpaceData();
    const existing = data.timeline.find((item) => item.id === entry.id);
    assertLocalVersion(existing?.version, entry.version, entry.id);
    const saved = { ...entry, version: nextVersion(existing?.version), updatedAt: nowIso() } as TimelineEntry;
    saveSpaceData(replaceTimelineEntry(data, saved));
    return saved;
  }

  async deleteTimelineEntry(id: string, expectedVersion: number): Promise<void> {
    const data = loadSpaceData();
    const existing = data.timeline.find((entry) => entry.id === id);
    assertLocalVersion(existing?.version, expectedVersion, id);
    saveSpaceData({
      ...data,
      timeline: data.timeline.filter((entry) => entry.id !== id),
      photos: data.photos.map((photo) => photo.timelineEntryId === id ? { ...photo, timelineEntryId: undefined } : photo)
    });
  }

  async savePlan(plan: PlanItem): Promise<PlanItem> {
    const data = loadSpaceData();
    const existing = data.plans.find((item) => item.id === plan.id);
    assertLocalVersion(existing?.version, plan.version, plan.id);
    const saved = { ...plan, version: nextVersion(existing?.version), updatedAt: nowIso() };
    saveSpaceData(replacePlan(data, saved));
    return saved;
  }

  async deletePlan(id: string, expectedVersion: number): Promise<void> {
    const data = loadSpaceData();
    const existing = data.plans.find((plan) => plan.id === id);
    assertLocalVersion(existing?.version, expectedVersion, id);
    saveSpaceData({ ...data, plans: data.plans.filter((plan) => plan.id !== id) });
  }

  async uploadPhoto(file: File, metadata: PhotoMetadata): Promise<Photo> {
    const blob = await prepareImageFile(file);
    await saveLocalAsset(metadata.id, blob);
    const photo = {
      ...metadata,
      src: URL.createObjectURL(blob),
      assetKey: metadata.id,
      version: 1,
      updatedAt: nowIso()
    };
    const data = loadSpaceData();
    try {
      saveSpaceData({ ...data, photos: [photo, ...data.photos] });
    } catch (error) {
      await deleteLocalAsset(metadata.id);
      URL.revokeObjectURL(photo.src);
      throw error;
    }
    return photo;
  }

  async updatePhoto(photo: Photo): Promise<Photo> {
    const data = loadSpaceData();
    const existing = data.photos.find((item) => item.id === photo.id);
    assertLocalVersion(existing?.version, photo.version, photo.id);
    const saved = { ...photo, version: nextVersion(existing?.version), updatedAt: nowIso() };
    saveSpaceData({ ...data, photos: data.photos.map((item) => item.id === photo.id ? saved : item) });
    return saved;
  }

  async deletePhoto(photo: Photo, expectedVersion: number): Promise<void> {
    const data = loadSpaceData();
    const existing = data.photos.find((item) => item.id === photo.id);
    assertLocalVersion(existing?.version, expectedVersion, photo.id);
    if (photo.assetKey) await deleteLocalAsset(photo.assetKey);
    saveSpaceData({ ...data, photos: data.photos.filter((item) => item.id !== photo.id) });
  }
}

type SpaceRow = {
  id: string;
  slug: string;
  name: string;
  relationship_start: string | null;
  timezone: string;
  public_demo: boolean;
  version: number;
  updated_at: string;
};

type TimelineRow = {
  id: string;
  type: 'memory' | 'milestone';
  title: string;
  date: string;
  location: string | null;
  body: string | null;
  tags: string[] | null;
  kind: 'anniversary' | 'one-off' | null;
  repeat_annual: boolean | null;
  time: string | null;
  note: string | null;
  system_role: 'relationship-start' | null;
  created_at: string | null;
  version: number;
  updated_at: string;
};

type PlanRow = {
  id: string;
  title: string;
  type: PlanItem['type'];
  status: PlanItem['status'];
  due_date: string | null;
  location: string | null;
  link: string | null;
  image: string | null;
  note: string | null;
  priority: PlanItem['priority'];
  assignee: PlanItem['assignee'];
  completed_at: string | null;
  version: number;
  updated_at: string;
};

type PhotoRow = {
  id: string;
  storage_path: string;
  caption: string;
  date: string;
  timeline_entry_id: string | null;
  version: number;
  updated_at: string;
};

type SupabaseResult<T> = { data: T; error: { message: string } | null };

function assertSupabaseResult<T>(result: SupabaseResult<T>): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

function assertVersionedRow<T>(result: SupabaseResult<T>, id: string): T {
  if (result.error || !result.data) throw new ConflictError(id);
  return result.data;
}

function mapTimelineRow(row: TimelineRow): TimelineEntry {
  const shared = {
    id: row.id,
    title: row.title,
    date: row.date,
    location: row.location ?? undefined,
    createdAt: row.created_at ?? undefined,
    version: row.version,
    updatedAt: row.updated_at
  };

  if (row.type === 'memory') {
    return {
      ...shared,
      type: 'memory',
      body: row.body ?? '',
      tags: row.tags ?? []
    } satisfies MemoryEntry;
  }

  return {
    ...shared,
    type: 'milestone',
    kind: row.kind ?? 'one-off',
    repeatAnnual: row.repeat_annual ?? false,
    time: row.time ?? undefined,
    note: row.note ?? undefined,
    systemRole: row.system_role ?? undefined
  } satisfies MilestoneEntry;
}

function mapPlanRow(row: PlanRow): PlanItem {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    status: row.status,
    dueDate: row.due_date ?? undefined,
    location: row.location ?? undefined,
    link: row.link ?? undefined,
    image: row.image ?? undefined,
    note: row.note ?? undefined,
    priority: row.priority,
    assignee: row.assignee,
    completedAt: row.completed_at ?? undefined,
    version: row.version,
    updatedAt: row.updated_at
  };
}

function mapPhotoRow(row: PhotoRow, src: string): Photo {
  return {
    id: row.id,
    src,
    storagePath: row.storage_path,
    caption: row.caption,
    date: row.date,
    timelineEntryId: row.timeline_entry_id ?? undefined,
    version: row.version,
    updatedAt: row.updated_at
  };
}

function mapSpaceSettings(row: SpaceRow): SpaceSettings {
  return {
    spaceName: row.name,
    relationshipStart: row.relationship_start,
    timezone: row.timezone,
    version: row.version,
    updatedAt: row.updated_at
  };
}

export class SupabaseSpaceRepository implements SpaceRepository {
  private space?: SpaceRow;

  constructor(private readonly client: SupabaseClient, private readonly config: RuntimeConfig) {}

  private async ensureSpace(): Promise<SpaceRow> {
    if (this.space) return this.space;

    const lookup = await this.client.from('spaces').select('*').eq('slug', this.config.spacePath).maybeSingle();
    if (lookup.error) throw new Error(lookup.error.message);
    if (lookup.data) {
      this.space = lookup.data as SpaceRow;
      return this.space;
    }
    if (!this.config.publicDemo) throw new Error('Supabase 私密空间不存在，请先完成账号和空间初始化。');

    const created = await this.client.from('spaces').insert({
      slug: this.config.spacePath,
      name: EMPTY_SPACE_DATA.spaceName,
      public_demo: true
    }).select('*').single();
    if (created.error) throw new Error(created.error.message);
    this.space = created.data as SpaceRow;
    return this.space;
  }

  private async signedPhotoUrl(storagePath: string): Promise<string> {
    const result = await this.client.storage.from(PHOTO_BUCKET).createSignedUrl(storagePath, 60 * 60);
    if (result.error || !result.data?.signedUrl) throw new Error(result.error?.message ?? '无法读取照片。');
    return result.data.signedUrl;
  }

  async load(): Promise<SpaceData> {
    const space = await this.ensureSpace();
    const [timelineResult, plansResult, photosResult] = await Promise.all([
      this.client.from('timeline_entries').select('*').eq('space_id', space.id).order('date', { ascending: false }),
      this.client.from('plans').select('*').eq('space_id', space.id).order('created_at', { ascending: false }),
      this.client.from('photos').select('*').eq('space_id', space.id).order('date', { ascending: false })
    ]);
    const timelineRows = assertSupabaseResult(timelineResult) as TimelineRow[];
    const plansRows = assertSupabaseResult(plansResult) as PlanRow[];
    const photoRows = assertSupabaseResult(photosResult) as PhotoRow[];
    const photos = await Promise.all(photoRows.map(async (row) => mapPhotoRow(row, await this.signedPhotoUrl(row.storage_path))));

    return {
      schemaVersion: 3,
      version: space.version,
      spaceName: space.name,
      relationshipStart: space.relationship_start,
      timezone: SPACE_TIMEZONE,
      timeline: timelineRows.map(mapTimelineRow),
      photos,
      plans: plansRows.map(mapPlanRow)
    };
  }

  subscribe(onData: (data: SpaceData) => void): () => void {
    let active = true;
    let cleanup: () => void = () => undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (!active) return;
        void this.load().then((data) => {
          if (active) onData(data);
        }).catch(() => undefined);
      }, 180);
    };

    void this.ensureSpace().then((space) => {
      if (!active) return;
      cleanup = subscribeToSpaceChanges(this.client as unknown as RealtimeClientLike, space.id, refresh);
    }).catch(() => undefined);

    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      cleanup();
    };
  }

  async saveSettings(settings: SpaceSettings, expectedVersion?: number): Promise<SpaceSettings> {
    const space = await this.ensureSpace();
    const version = expectedVersion ?? space.version;
    const result = await this.client.from('spaces').update({
      name: settings.spaceName,
      relationship_start: settings.relationshipStart,
      timezone: settings.timezone,
      version: version + 1,
      updated_at: nowIso()
    }).eq('id', space.id).eq('version', version).select('*').single();
    const saved = assertVersionedRow(result as SupabaseResult<SpaceRow>, space.id);
    this.space = saved;
    return mapSpaceSettings(saved);
  }

  async saveTimelineEntry(entry: TimelineEntry): Promise<TimelineEntry> {
    const space = await this.ensureSpace();
    const row = {
      id: entry.id,
      space_id: space.id,
      type: entry.type,
      title: entry.title,
      date: entry.date,
      location: entry.location ?? null,
      body: entry.type === 'memory' ? entry.body : null,
      tags: entry.type === 'memory' ? entry.tags : [],
      kind: entry.type === 'milestone' ? entry.kind : null,
      repeat_annual: entry.type === 'milestone' ? entry.repeatAnnual : false,
      time: entry.type === 'milestone' ? entry.time ?? null : null,
      note: entry.type === 'milestone' ? entry.note ?? null : null,
      system_role: entry.type === 'milestone' ? entry.systemRole ?? null : null,
      created_at: entry.createdAt ?? nowIso(),
      version: entry.version === undefined ? 1 : entry.version + 1,
      updated_at: nowIso()
    };

    if (entry.version === undefined) {
      const result = await this.client.from('timeline_entries').insert(row).select('*').single();
      return mapTimelineRow(assertVersionedRow(result as SupabaseResult<TimelineRow>, entry.id));
    }

    const result = await this.client.from('timeline_entries').update({ ...row, id: undefined, space_id: undefined }).eq('space_id', space.id).eq('id', entry.id).eq('version', entry.version).select('*').single();
    return mapTimelineRow(assertVersionedRow(result as SupabaseResult<TimelineRow>, entry.id));
  }

  async deleteTimelineEntry(id: string, expectedVersion: number): Promise<void> {
    const space = await this.ensureSpace();
    const result = await this.client.from('timeline_entries').delete().eq('space_id', space.id).eq('id', id).eq('version', expectedVersion).select('id').single();
    assertVersionedRow(result as SupabaseResult<{ id: string }>, id);
  }

  async savePlan(plan: PlanItem): Promise<PlanItem> {
    const space = await this.ensureSpace();
    const row = {
      id: plan.id,
      space_id: space.id,
      title: plan.title,
      type: plan.type,
      status: plan.status,
      due_date: plan.dueDate ?? null,
      location: plan.location ?? null,
      link: plan.link ?? null,
      image: plan.image ?? null,
      note: plan.note ?? null,
      priority: plan.priority,
      assignee: plan.assignee,
      completed_at: plan.completedAt ?? null,
      version: plan.version === undefined ? 1 : plan.version + 1,
      updated_at: nowIso()
    };

    if (plan.version === undefined) {
      const result = await this.client.from('plans').insert(row).select('*').single();
      return mapPlanRow(assertVersionedRow(result as SupabaseResult<PlanRow>, plan.id));
    }

    const result = await this.client.from('plans').update({ ...row, id: undefined, space_id: undefined }).eq('space_id', space.id).eq('id', plan.id).eq('version', plan.version).select('*').single();
    return mapPlanRow(assertVersionedRow(result as SupabaseResult<PlanRow>, plan.id));
  }

  async deletePlan(id: string, expectedVersion: number): Promise<void> {
    const space = await this.ensureSpace();
    const result = await this.client.from('plans').delete().eq('space_id', space.id).eq('id', id).eq('version', expectedVersion).select('id').single();
    assertVersionedRow(result as SupabaseResult<{ id: string }>, id);
  }

  async uploadPhoto(file: File, metadata: PhotoMetadata): Promise<Photo> {
    const blob = await prepareImageFile(file);
    const space = await this.ensureSpace();
    const storagePath = buildPhotoStoragePath(space.id, metadata.id);
    const upload = await this.client.storage.from(PHOTO_BUCKET).upload(storagePath, blob, { contentType: 'image/webp', upsert: false });
    if (upload.error) throw new Error(upload.error.message);

    const result = await this.client.from('photos').insert({
      id: metadata.id,
      space_id: space.id,
      storage_path: storagePath,
      caption: metadata.caption,
      date: metadata.date,
      timeline_entry_id: metadata.timelineEntryId ?? null,
      version: 1,
      updated_at: nowIso()
    }).select('*').single();
    if (result.error) {
      await this.client.storage.from(PHOTO_BUCKET).remove([storagePath]);
      throw new Error(result.error.message);
    }

    return mapPhotoRow(result.data as PhotoRow, await this.signedPhotoUrl(storagePath));
  }

  async updatePhoto(photo: Photo): Promise<Photo> {
    const space = await this.ensureSpace();
    const nextUpdatedAt = nowIso();
    const result = await this.client.from('photos').update({
      caption: photo.caption,
      date: photo.date,
      timeline_entry_id: photo.timelineEntryId ?? null,
      version: (photo.version ?? 0) + 1,
      updated_at: nextUpdatedAt
    }).eq('space_id', space.id).eq('id', photo.id).eq('version', photo.version ?? 1).select('*').single();
    const row = assertVersionedRow(result as SupabaseResult<PhotoRow>, photo.id);
    return mapPhotoRow(row, photo.src);
  }

  async deletePhoto(photo: Photo, expectedVersion: number): Promise<void> {
    const space = await this.ensureSpace();
    const current = await this.client.from('photos').select('id, storage_path, version').eq('space_id', space.id).eq('id', photo.id).eq('version', expectedVersion).single();
    const currentRow = assertVersionedRow(current as SupabaseResult<{ id: string; storage_path: string; version: number }>, photo.id);
    const removed = await this.client.storage.from(PHOTO_BUCKET).remove([currentRow.storage_path]);
    if (removed.error) throw new Error(`照片文件删除失败，请再次点击删除重试。${removed.error.message}`);

    const result = await this.client.from('photos').delete().eq('space_id', space.id).eq('id', photo.id).eq('version', expectedVersion).select('id').single();
    try {
      assertVersionedRow(result as SupabaseResult<{ id: string }>, photo.id);
    } catch (error) {
      throw new Error(`照片文件已删除，但元数据清理失败，请再次点击删除重试。${error instanceof Error ? error.message : ''}`);
    }
  }
}

export function createSpaceRepository(config: RuntimeConfig): SpaceRepository {
  const client = config.dataMode === 'supabase' ? createSupabaseClient(config) : null;
  return client ? new SupabaseSpaceRepository(client, config) : new LocalSpaceRepository();
}
