import {
  deleteLocalAssets,
  getLocalPhotoAssetKey,
  loadLocalPhotoAsset,
  saveLocalAssets
} from './local-media';
import { preparePhotoAssets, type PreparedPhotoAssets } from './media';
import { createSupabaseClient } from './supabase';
import { subscribeToSpaceChanges, type RealtimeClientLike } from './supabase-sync';
import type { RuntimeConfig } from './runtime-config';
import { EMPTY_SPACE_DATA, loadSpaceData, saveSpaceData } from './storage';
import { ConflictError } from './errors';
import { SPACE_TIMEZONE } from './dates';
import { normalizeAssignee, normalizeRole } from './roles';
import type { MemoryEntry, MilestoneEntry, Photo, PhotoAssetVariant, PlanItem, SpaceData, SpaceRole, TimelineEntry } from '../types';
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
  createdByRole?: SpaceRole;
};

export type PhotoUploadInput = File | PreparedPhotoAssets;

export type SpaceRepository = {
  load(): Promise<SpaceData>;
  saveSettings(settings: SpaceSettings, expectedVersion?: number): Promise<SpaceSettings>;
  saveTimelineEntry(entry: TimelineEntry): Promise<TimelineEntry>;
  deleteTimelineEntry(id: string, expectedVersion: number): Promise<void>;
  savePlan(plan: PlanItem): Promise<PlanItem>;
  deletePlan(id: string, expectedVersion: number): Promise<void>;
  uploadPhoto(input: PhotoUploadInput, metadata: PhotoMetadata): Promise<Photo>;
  getPhotoAssetUrl(photo: Photo, variant: PhotoAssetVariant): Promise<string | undefined>;
  updatePhoto(photo: Photo): Promise<Photo>;
  deletePhoto(photo: Photo, expectedVersion: number): Promise<void>;
  subscribe?(onData: (data: SpaceData) => void): () => void;
};

export function buildPhotoStoragePath(spacePath: string, photoId: string): string {
  const normalizedSpacePath = spacePath.replace(/^\/+|\/+$/g, '') || 'public-demo';
  return `${normalizedSpacePath}/${photoId}.webp`;
}

export function buildPhotoAssetStoragePath(spacePath: string, photoId: string, variant: 'thumbnail' | 'original' | 'motion', extension: string): string {
  const normalizedSpacePath = spacePath.replace(/^\/+|\/+$/g, '') || 'public-demo';
  const suffix = variant === 'thumbnail' ? '-thumb' : variant === 'motion' ? '-motion' : '-original';
  return `${normalizedSpacePath}/${photoId}${suffix}.${extension.replace(/^\./, '').toLowerCase()}`;
}

export function toPhotoMetadata(photo: Photo): PhotoMetadata {
  return {
    id: photo.id,
    caption: photo.caption,
    date: photo.date,
    timelineEntryId: photo.timelineEntryId,
    createdByRole: photo.createdByRole
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

async function resolvePhotoAssets(input: PhotoUploadInput): Promise<PreparedPhotoAssets> {
  return 'original' in input && 'display' in input && 'thumbnail' in input
    ? input
    : preparePhotoAssets(input);
}

function photoAssetKeys(photo: Photo): string[] {
  return [photo.assetKey, photo.thumbnailAssetKey, photo.originalAssetKey, photo.motionAssetKey]
    .filter((key): key is string => Boolean(key));
}

function extensionForMime(mime: string | undefined, fallbackName: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/heic' || mime === 'image/heif') return 'heic';
  if (mime === 'video/quicktime') return 'mov';
  if (mime === 'video/mp4') return 'mp4';
  return fallbackName.split('.').pop()?.toLowerCase() || 'bin';
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

  async uploadPhoto(input: PhotoUploadInput, metadata: PhotoMetadata): Promise<Photo> {
    const assets = await resolvePhotoAssets(input);
    const assetKey = `${metadata.id}-display`;
    const thumbnailAssetKey = `${metadata.id}-thumbnail`;
    const originalAssetKey = `${metadata.id}-original`;
    const motionAssetKey = assets.motion ? `${metadata.id}-motion` : undefined;
    await saveLocalAssets({
      [assetKey]: assets.display,
      [thumbnailAssetKey]: assets.thumbnail,
      [originalAssetKey]: assets.original,
      ...(assets.motion && motionAssetKey ? { [motionAssetKey]: assets.motion } : {})
    });
    const photo: Photo = {
      ...metadata,
      createdByRole: metadata.createdByRole ?? 'unknown',
      src: URL.createObjectURL(assets.display),
      thumbnailSrc: URL.createObjectURL(assets.thumbnail),
      assetKey,
      thumbnailAssetKey,
      originalAssetKey,
      motionAssetKey,
      mediaKind: assets.motion ? 'live' : 'image',
      previewAvailable: assets.previewAvailable,
      width: assets.width,
      height: assets.height,
      originalMime: assets.original.type || undefined,
      motionMime: assets.motion?.type || undefined,
      originalBytes: assets.original.size,
      createdAt: nowIso(),
      version: 1,
      updatedAt: nowIso()
    };
    const data = loadSpaceData();
    try {
      saveSpaceData({ ...data, photos: [photo, ...data.photos] });
    } catch (error) {
      await deleteLocalAssets(photoAssetKeys(photo));
      [photo.src, photo.thumbnailSrc].forEach((source) => { if (source) URL.revokeObjectURL(source); });
      throw error;
    }
    return photo;
  }

  async getPhotoAssetUrl(photo: Photo, variant: PhotoAssetVariant): Promise<string | undefined> {
    const blob = await loadLocalPhotoAsset(photo, variant);
    return blob ? URL.createObjectURL(blob) : undefined;
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
    await deleteLocalAssets(photoAssetKeys(photo));
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
  created_by_role?: string | null;
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
  created_by_role?: string | null;
  completed_at: string | null;
  version: number;
  updated_at: string;
};

type PhotoRow = {
  id: string;
  storage_path: string;
  thumbnail_storage_path?: string | null;
  original_storage_path?: string | null;
  motion_storage_path?: string | null;
  caption: string;
  date: string;
  timeline_entry_id: string | null;
  created_by_role?: string | null;
  media_kind?: 'image' | 'live' | null;
  preview_available?: boolean | null;
  width?: number | null;
  height?: number | null;
  original_mime?: string | null;
  motion_mime?: string | null;
  original_bytes?: number | null;
  created_at?: string | null;
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
    createdByRole: normalizeRole(row.created_by_role),
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
    assignee: normalizeAssignee(row.assignee),
    createdByRole: normalizeRole(row.created_by_role),
    completedAt: row.completed_at ?? undefined,
    version: row.version,
    updatedAt: row.updated_at
  };
}

function mapPhotoRow(row: PhotoRow, src: string, thumbnailSrc = src): Photo {
  return {
    id: row.id,
    src,
    thumbnailSrc,
    storagePath: row.storage_path,
    thumbnailStoragePath: row.thumbnail_storage_path ?? undefined,
    originalStoragePath: row.original_storage_path ?? undefined,
    motionStoragePath: row.motion_storage_path ?? undefined,
    caption: row.caption,
    date: row.date,
    timelineEntryId: row.timeline_entry_id ?? undefined,
    createdByRole: normalizeRole(row.created_by_role),
    mediaKind: row.media_kind ?? (row.motion_storage_path ? 'live' : 'image'),
    previewAvailable: row.preview_available ?? true,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    originalMime: row.original_mime ?? undefined,
    motionMime: row.motion_mime ?? undefined,
    originalBytes: row.original_bytes ?? undefined,
    createdAt: row.created_at ?? undefined,
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

  private async signedPhotoUrls(storagePaths: string[]): Promise<Map<string, string>> {
    const paths = Array.from(new Set(storagePaths.filter(Boolean)));
    if (paths.length === 0) return new Map();
    const result = await this.client.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60);
    if (result.error) throw new Error(result.error.message);
    return new Map((result.data ?? []).flatMap((item) => item.signedUrl ? [[item.path, item.signedUrl] as [string, string]] : []));
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
    const displayPaths = photoRows.map((row) => row.storage_path);
    const thumbnailPaths = photoRows.map((row) => row.thumbnail_storage_path ?? row.storage_path);
    const signedUrls = await this.signedPhotoUrls([...displayPaths, ...thumbnailPaths]);
    const photos = photoRows.map((row) => {
      const displayPath = row.storage_path;
      const thumbnailPath = row.thumbnail_storage_path ?? displayPath;
      return mapPhotoRow(row, signedUrls.get(displayPath) ?? '', signedUrls.get(thumbnailPath) ?? signedUrls.get(displayPath) ?? '');
    });

    return {
      schemaVersion: 4,
      version: space.version,
      spaceName: space.name,
      relationshipStart: space.relationship_start,
      timezone: SPACE_TIMEZONE,
      timeline: timelineRows.map(mapTimelineRow),
      photos,
      plans: plansRows.map(mapPlanRow)
    };
  }

  async getPhotoAssetUrl(photo: Photo, variant: PhotoAssetVariant): Promise<string | undefined> {
    const storagePath = variant === 'thumbnail'
      ? photo.thumbnailStoragePath ?? photo.storagePath
      : variant === 'original'
        ? photo.originalStoragePath
        : variant === 'motion'
          ? photo.motionStoragePath
          : photo.storagePath;
    return storagePath ? this.signedPhotoUrl(storagePath) : undefined;
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
      created_by_role: entry.createdByRole ?? 'unknown',
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
      created_by_role: plan.createdByRole ?? 'unknown',
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

  async uploadPhoto(input: PhotoUploadInput, metadata: PhotoMetadata): Promise<Photo> {
    const assets = await resolvePhotoAssets(input);
    const space = await this.ensureSpace();
    const storagePath = buildPhotoStoragePath(space.id, metadata.id);
    const thumbnailPath = buildPhotoAssetStoragePath(space.id, metadata.id, 'thumbnail', 'webp');
    const originalPath = buildPhotoAssetStoragePath(space.id, metadata.id, 'original', extensionForMime(assets.original.type, assets.original.name));
    const motionPath = assets.motion
      ? buildPhotoAssetStoragePath(space.id, metadata.id, 'motion', extensionForMime(assets.motion.type, assets.motion.name))
      : undefined;
    const uploads = [
      { path: originalPath, body: assets.original, contentType: assets.original.type || 'application/octet-stream' },
      { path: thumbnailPath, body: assets.thumbnail, contentType: 'image/webp' },
      { path: storagePath, body: assets.display, contentType: assets.display.type || 'image/webp' },
      ...(assets.motion && motionPath ? [{ path: motionPath, body: assets.motion, contentType: assets.motion.type || 'video/mp4' }] : [])
    ];
    const uploadedPaths: string[] = [];
    try {
      for (const asset of uploads) {
        const upload = await this.client.storage.from(PHOTO_BUCKET).upload(asset.path, asset.body, { contentType: asset.contentType, upsert: false });
        if (upload.error) throw new Error(upload.error.message);
        uploadedPaths.push(asset.path);
      }

      const result = await this.client.from('photos').insert({
        id: metadata.id,
        space_id: space.id,
        storage_path: storagePath,
        thumbnail_storage_path: thumbnailPath,
        original_storage_path: originalPath,
        motion_storage_path: motionPath ?? null,
        caption: metadata.caption,
        date: metadata.date,
        timeline_entry_id: metadata.timelineEntryId ?? null,
        created_by_role: metadata.createdByRole ?? 'unknown',
        media_kind: assets.motion ? 'live' : 'image',
        preview_available: assets.previewAvailable,
        width: assets.width ?? null,
        height: assets.height ?? null,
        original_mime: assets.original.type || null,
        motion_mime: assets.motion?.type || null,
        original_bytes: assets.original.size,
        version: 1,
        updated_at: nowIso()
      }).select('*').single();
      if (result.error) throw new Error(result.error.message);

      const [displaySrc, thumbnailSrc] = await Promise.all([
        this.signedPhotoUrl(storagePath),
        this.signedPhotoUrl(thumbnailPath)
      ]);
      return mapPhotoRow(result.data as PhotoRow, displaySrc, thumbnailSrc);
    } catch (error) {
      if (uploadedPaths.length > 0) await this.client.storage.from(PHOTO_BUCKET).remove(uploadedPaths);
      throw error;
    }
  }

  async updatePhoto(photo: Photo): Promise<Photo> {
    const space = await this.ensureSpace();
    const nextUpdatedAt = nowIso();
    const result = await this.client.from('photos').update({
      caption: photo.caption,
      date: photo.date,
      timeline_entry_id: photo.timelineEntryId ?? null,
      created_by_role: photo.createdByRole ?? 'unknown',
      version: (photo.version ?? 0) + 1,
      updated_at: nextUpdatedAt
    }).eq('space_id', space.id).eq('id', photo.id).eq('version', photo.version ?? 1).select('*').single();
    const row = assertVersionedRow(result as SupabaseResult<PhotoRow>, photo.id);
    return mapPhotoRow(row, photo.src);
  }

  async deletePhoto(photo: Photo, expectedVersion: number): Promise<void> {
    const space = await this.ensureSpace();
    const current = await this.client.from('photos').select('id, storage_path, thumbnail_storage_path, original_storage_path, motion_storage_path, version').eq('space_id', space.id).eq('id', photo.id).eq('version', expectedVersion).single();
    const currentRow = assertVersionedRow(current as SupabaseResult<{ id: string; storage_path: string; thumbnail_storage_path?: string | null; original_storage_path?: string | null; motion_storage_path?: string | null; version: number }>, photo.id);
    const storagePaths = [currentRow.storage_path, currentRow.thumbnail_storage_path, currentRow.original_storage_path, currentRow.motion_storage_path]
      .filter((path): path is string => Boolean(path));
    const removed = await this.client.storage.from(PHOTO_BUCKET).remove(storagePaths);
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
