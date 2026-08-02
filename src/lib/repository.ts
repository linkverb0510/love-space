import { deleteLocalAsset, saveLocalAsset } from './local-media';
import { prepareImageFile } from './media';
import { createSupabaseClient } from './supabase';
import { subscribeToSpaceChanges, type RealtimeClientLike } from './supabase-sync';
import type { RuntimeConfig } from './runtime-config';
import { EMPTY_SPACE_DATA, loadSpaceData, saveSpaceData } from './storage';
import type { MemoryEntry, MilestoneEntry, Photo, PlanItem, SpaceData, TimelineEntry } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';

const PHOTO_BUCKET = 'love-space-photos';

export type SpaceSettings = Pick<SpaceData, 'spaceName' | 'relationshipStart' | 'timezone'>;

export type PhotoMetadata = {
  id: string;
  caption: string;
  date: string;
  timelineEntryId?: string;
};

export type SpaceRepository = {
  load(): Promise<SpaceData>;
  saveSettings(settings: SpaceSettings): Promise<void>;
  saveTimelineEntry(entry: TimelineEntry): Promise<void>;
  deleteTimelineEntry(id: string): Promise<void>;
  savePlan(plan: PlanItem): Promise<void>;
  deletePlan(id: string): Promise<void>;
  uploadPhoto(file: File, metadata: PhotoMetadata): Promise<Photo>;
  updatePhoto(photo: Photo): Promise<void>;
  deletePhoto(photo: Photo): Promise<void>;
};

export type SnapshotSpaceRepository = SpaceRepository & {
  saveSnapshot(data: SpaceData): Promise<void>;
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

function replaceTimelineEntry(data: SpaceData, entry: TimelineEntry): SpaceData {
  const exists = data.timeline.some((item) => item.id === entry.id);
  return { ...data, timeline: exists ? data.timeline.map((item) => item.id === entry.id ? entry : item) : [entry, ...data.timeline] };
}

function replacePlan(data: SpaceData, plan: PlanItem): SpaceData {
  const exists = data.plans.some((item) => item.id === plan.id);
  return { ...data, plans: exists ? data.plans.map((item) => item.id === plan.id ? plan : item) : [plan, ...data.plans] };
}

class LocalSpaceRepository implements SnapshotSpaceRepository {
  async load(): Promise<SpaceData> {
    return loadSpaceData();
  }

  async saveSettings(settings: SpaceSettings): Promise<void> {
    saveSpaceData({ ...loadSpaceData(), ...settings });
  }

  async saveTimelineEntry(entry: TimelineEntry): Promise<void> {
    saveSpaceData(replaceTimelineEntry(loadSpaceData(), entry));
  }

  async deleteTimelineEntry(id: string): Promise<void> {
    const data = loadSpaceData();
    saveSpaceData({
      ...data,
      timeline: data.timeline.filter((entry) => entry.id !== id),
      photos: data.photos.map((photo) => photo.timelineEntryId === id ? { ...photo, timelineEntryId: undefined } : photo)
    });
  }

  async savePlan(plan: PlanItem): Promise<void> {
    saveSpaceData(replacePlan(loadSpaceData(), plan));
  }

  async deletePlan(id: string): Promise<void> {
    const data = loadSpaceData();
    saveSpaceData({ ...data, plans: data.plans.filter((plan) => plan.id !== id) });
  }

  async uploadPhoto(file: File, metadata: PhotoMetadata): Promise<Photo> {
    const blob = await prepareImageFile(file);
    await saveLocalAsset(metadata.id, blob);
    return {
      ...metadata,
      src: URL.createObjectURL(blob),
      assetKey: metadata.id
    };
  }

  async updatePhoto(photo: Photo): Promise<void> {
    const data = loadSpaceData();
    saveSpaceData({ ...data, photos: data.photos.map((item) => item.id === photo.id ? photo : item) });
  }

  async deletePhoto(photo: Photo): Promise<void> {
    if (photo.assetKey) await deleteLocalAsset(photo.assetKey);
  }

  async saveSnapshot(data: SpaceData): Promise<void> {
    saveSpaceData(data);
  }
}

type SpaceRow = {
  id: string;
  slug: string;
  name: string;
  relationship_start: string | null;
  timezone: string;
  public_demo: boolean;
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
  photo_ids: string[] | null;
  system_role: 'relationship-start' | null;
  created_at: string | null;
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
};

type PhotoRow = {
  id: string;
  storage_path: string;
  caption: string;
  date: string;
  timeline_entry_id: string | null;
};

function assertSupabaseResult<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

function mapTimelineRow(row: TimelineRow): TimelineEntry {
  const shared = {
    id: row.id,
    title: row.title,
    date: row.date,
    location: row.location ?? undefined,
    photoIds: row.photo_ids ?? [],
    createdAt: row.created_at ?? undefined
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
    completedAt: row.completed_at ?? undefined
  };
}

class SupabaseSpaceRepository implements SnapshotSpaceRepository {
  private space?: SpaceRow;
  private snapshotQueue: Promise<void> = Promise.resolve();

  constructor(private readonly client: SupabaseClient, private readonly config: RuntimeConfig) {}

  private async ensureSpace(): Promise<SpaceRow> {
    if (this.space) return this.space;

    const lookup = await this.client.from('spaces').select('*').eq('slug', this.config.spacePath).maybeSingle();
    if (lookup.error) throw new Error(lookup.error.message);
    if (lookup.data) {
      this.space = lookup.data as SpaceRow;
      return this.space;
    }
    if (!this.config.publicDemo) throw new Error('Supabase 空间不存在，请先配置 VITE_SPACE_PATH。');

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
    const photos = await Promise.all(photoRows.map(async (row) => ({
      id: row.id,
      src: await this.signedPhotoUrl(row.storage_path),
      storagePath: row.storage_path,
      caption: row.caption,
      date: row.date,
      timelineEntryId: row.timeline_entry_id ?? undefined
    })));

    return {
      schemaVersion: 2,
      spaceName: space.name,
      relationshipStart: space.relationship_start,
      timezone: space.timezone,
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

  async saveSettings(settings: SpaceSettings): Promise<void> {
    const space = await this.ensureSpace();
    const result = await this.client.from('spaces').update({
      name: settings.spaceName,
      relationship_start: settings.relationshipStart,
      timezone: settings.timezone
    }).eq('id', space.id);
    assertSupabaseResult(result);
    this.space = { ...space, name: settings.spaceName, relationship_start: settings.relationshipStart, timezone: settings.timezone };
  }

  async saveTimelineEntry(entry: TimelineEntry): Promise<void> {
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
      photo_ids: entry.photoIds,
      system_role: entry.type === 'milestone' ? entry.systemRole ?? null : null,
      created_at: entry.createdAt ?? new Date().toISOString()
    };
    const result = await this.client.from('timeline_entries').upsert(row);
    assertSupabaseResult(result);
  }

  async deleteTimelineEntry(id: string): Promise<void> {
    const space = await this.ensureSpace();
    const result = await this.client.from('timeline_entries').delete().eq('space_id', space.id).eq('id', id);
    assertSupabaseResult(result);
  }

  async savePlan(plan: PlanItem): Promise<void> {
    const space = await this.ensureSpace();
    const result = await this.client.from('plans').upsert({
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
      completed_at: plan.completedAt ?? null
    });
    assertSupabaseResult(result);
  }

  async deletePlan(id: string): Promise<void> {
    const space = await this.ensureSpace();
    const result = await this.client.from('plans').delete().eq('space_id', space.id).eq('id', id);
    assertSupabaseResult(result);
  }

  async uploadPhoto(file: File, metadata: PhotoMetadata): Promise<Photo> {
    const blob = await prepareImageFile(file);
    const space = await this.ensureSpace();
    const storagePath = buildPhotoStoragePath(space.id, metadata.id);
    const upload = await this.client.storage.from(PHOTO_BUCKET).upload(storagePath, blob, { contentType: 'image/webp', upsert: true });
    if (upload.error) throw new Error(upload.error.message);

    const result = await this.client.from('photos').upsert({
      id: metadata.id,
      space_id: space.id,
      storage_path: storagePath,
      caption: metadata.caption,
      date: metadata.date,
      timeline_entry_id: metadata.timelineEntryId ?? null
    }).select('*').single();
    if (result.error) {
      await this.client.storage.from(PHOTO_BUCKET).remove([storagePath]);
      throw new Error(result.error.message);
    }

    return { ...metadata, src: await this.signedPhotoUrl(storagePath), storagePath };
  }

  async updatePhoto(photo: Photo): Promise<void> {
    const space = await this.ensureSpace();
    const result = await this.client.from('photos').update({
      caption: photo.caption,
      date: photo.date,
      timeline_entry_id: photo.timelineEntryId ?? null
    }).eq('space_id', space.id).eq('id', photo.id);
    assertSupabaseResult(result);
  }

  async deletePhoto(photo: Photo): Promise<void> {
    const space = await this.ensureSpace();
    const result = await this.client.from('photos').delete().eq('space_id', space.id).eq('id', photo.id);
    assertSupabaseResult(result);
    if (photo.storagePath) {
      const removed = await this.client.storage.from(PHOTO_BUCKET).remove([photo.storagePath]);
      if (removed.error) throw new Error(removed.error.message);
    }
  }

  async saveSnapshot(data: SpaceData): Promise<void> {
    const next = this.snapshotQueue.then(() => this.syncSnapshot(data));
    this.snapshotQueue = next.catch(() => undefined);
    return next;
  }

  private async syncSnapshot(data: SpaceData): Promise<void> {
    const remote = await this.load();
    await this.saveSettings(data);
    await Promise.all(data.timeline.map((entry) => this.saveTimelineEntry(entry)));
    await Promise.all(data.plans.map((plan) => this.savePlan(plan)));
    await Promise.all(data.photos.filter((photo) => photo.storagePath).map((photo) => this.updatePhoto(photo)));
    await Promise.all(remote.timeline.filter((entry) => !data.timeline.some((item) => item.id === entry.id)).map((entry) => this.deleteTimelineEntry(entry.id)));
    await Promise.all(remote.plans.filter((plan) => !data.plans.some((item) => item.id === plan.id)).map((plan) => this.deletePlan(plan.id)));
    await Promise.all(remote.photos.filter((photo) => !data.photos.some((item) => item.id === photo.id)).map((photo) => this.deletePhoto(photo)));
  }
}

export function createSpaceRepository(config: RuntimeConfig): SnapshotSpaceRepository {
  const client = config.dataMode === 'supabase' ? createSupabaseClient(config) : null;
  return client ? new SupabaseSpaceRepository(client, config) : new LocalSpaceRepository();
}
