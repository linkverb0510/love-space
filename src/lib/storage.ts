import { migrateLegacySpaceData } from './domain';
import type { SpaceData } from '../types';

const STORAGE_KEY = 'love-space-data-v2';
const LEGACY_STORAGE_KEY = 'love-space-demo-data';
const DATA_VERSION = 2;

export const EMPTY_SPACE_DATA: SpaceData = {
  schemaVersion: DATA_VERSION,
  spaceName: 'our little space',
  relationshipStart: null,
  timezone: 'Asia/Hong_Kong',
  timeline: [],
  photos: [],
  plans: []
};

function cloneEmptySpace(): SpaceData {
  return JSON.parse(JSON.stringify(EMPTY_SPACE_DATA)) as SpaceData;
}

export function toPersistedSpaceData(data: SpaceData): SpaceData {
  return {
    ...data,
    schemaVersion: DATA_VERSION,
    photos: data.photos.map((photo) => photo.assetKey ? { ...photo, src: '' } : photo)
  };
}

function isLegacyShape(value: unknown): value is Parameters<typeof migrateLegacySpaceData>[0] {
  return Boolean(value && typeof value === 'object' && ('events' in value || 'tasks' in value || 'collections' in value));
}

function normalizeSpaceData(value: unknown): SpaceData {
  if (!value || typeof value !== 'object') return cloneEmptySpace();
  if (isLegacyShape(value)) return { ...migrateLegacySpaceData(value), schemaVersion: DATA_VERSION };

  const data = value as SpaceData;
  return {
    schemaVersion: DATA_VERSION,
    spaceName: data.spaceName || EMPTY_SPACE_DATA.spaceName,
    relationshipStart: data.relationshipStart || null,
    timezone: data.timezone || EMPTY_SPACE_DATA.timezone,
    timeline: data.timeline ?? [],
    photos: data.photos ?? [],
    plans: data.plans ?? []
  };
}

export function loadSpaceData(): SpaceData {
  if (typeof window === 'undefined') return cloneEmptySpace();

  // A new storage key prevents the old demo fixtures from reappearing on this version.
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  const saved = window.localStorage.getItem(STORAGE_KEY);
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
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

const SESSION_KEY = 'love-space-session-v2';
const LEGACY_SESSION_KEY = 'love-space-demo-session';

export function hasDemoSession(): boolean {
  return typeof window !== 'undefined' && window.localStorage.getItem(SESSION_KEY) === 'active';
}

export function startDemoSession(): void {
  window.localStorage.setItem(SESSION_KEY, 'active');
}

export function endDemoSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem(LEGACY_SESSION_KEY);
}
