import { migrateLegacySpaceData } from './domain';
import { SPACE_TIMEZONE } from './dates';
import { normalizeAssignee, normalizeRole } from './roles';
import type { SpaceData } from '../types';

const STORAGE_KEY = 'love-space-data-v3';
const LEGACY_STORAGE_KEY = 'love-space-demo-data';
const DATA_VERSION = 4;

export const EMPTY_SPACE_DATA: SpaceData = {
  schemaVersion: DATA_VERSION,
  spaceName: 'our little space',
  relationshipStart: null,
  timezone: SPACE_TIMEZONE,
  timeline: [],
  photos: [],
  plans: [],
  version: 1
};

function cloneEmptySpace(): SpaceData {
  return JSON.parse(JSON.stringify(EMPTY_SPACE_DATA)) as SpaceData;
}

export function toPersistedSpaceData(data: SpaceData): SpaceData {
  const normalized = normalizeSpaceData(data);
  return {
    ...normalized,
    schemaVersion: DATA_VERSION,
    photos: normalized.photos.map((photo) => {
      if (!photo.assetKey && !photo.thumbnailAssetKey && !photo.originalAssetKey && !photo.motionAssetKey) return photo;
      return {
        ...photo,
        src: '',
        thumbnailSrc: '',
        originalSrc: '',
        motionSrc: ''
      };
    })
  };
}

function isLegacyShape(value: unknown): value is Parameters<typeof migrateLegacySpaceData>[0] {
  return Boolean(value && typeof value === 'object' && ('events' in value || 'tasks' in value || 'collections' in value));
}

function normalizeSpaceData(value: unknown): SpaceData {
  if (!value || typeof value !== 'object') return cloneEmptySpace();
  if (isLegacyShape(value)) {
    const migrated = migrateLegacySpaceData(value);
    return normalizeSpaceData({ ...migrated, schemaVersion: DATA_VERSION });
  }

  const data = value as SpaceData;
  return {
    schemaVersion: DATA_VERSION,
    spaceName: data.spaceName || EMPTY_SPACE_DATA.spaceName,
    relationshipStart: data.relationshipStart || null,
    timezone: SPACE_TIMEZONE,
    timeline: (data.timeline ?? []).map((entry) => ({ ...entry, createdByRole: normalizeRole(entry.createdByRole), version: entry.version ?? 1 })),
    photos: (data.photos ?? []).map((photo) => ({ ...photo, createdByRole: normalizeRole(photo.createdByRole), version: photo.version ?? 1 })),
    plans: (data.plans ?? []).map((plan) => ({ ...plan, assignee: normalizeAssignee(plan.assignee), createdByRole: normalizeRole(plan.createdByRole), version: plan.version ?? 1 })),
    version: data.version ?? 1
  };
}

export function loadSpaceData(): SpaceData {
  if (typeof window === 'undefined') return cloneEmptySpace();

  // A new storage key prevents the old demo fixtures from reappearing on this version.
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  const saved = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem('love-space-data-v2');
  if (!saved) {
    const initial = cloneEmptySpace();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  try {
    const parsed: unknown = JSON.parse(saved);
    const normalized = normalizeSpaceData(parsed);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    const initial = cloneEmptySpace();
    window.localStorage.setItem(`${STORAGE_KEY}-recovery`, saved);
    return initial;
  }
}

export function saveSpaceData(data: SpaceData): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersistedSpaceData(data)));
  }
}

export function resetSpaceData(): SpaceData {
  const initial = cloneEmptySpace();
  saveSpaceData(initial);
  return initial;
}
