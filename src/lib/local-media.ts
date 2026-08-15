import type { Photo, PhotoAssetVariant } from '../types';

const DATABASE_NAME = 'love-space-media';
const STORE_NAME = 'assets';
const DATABASE_VERSION = 2;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本地照片存储。'));
  });
}

export async function saveLocalAssets(assets: Record<string, Blob>): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    Object.entries(assets).forEach(([key, blob]) => store.put(blob, key));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('无法保存图片。'));
    transaction.onabort = () => reject(transaction.error ?? new Error('本地图片保存已取消。'));
  });
  database.close();
}

export async function saveLocalAsset(key: string, blob: Blob): Promise<void> {
  await saveLocalAssets({ [key]: blob });
}

export async function loadLocalAsset(key: string): Promise<Blob | undefined> {
  const database = await openDatabase();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error ?? new Error('无法读取图片。'));
  });
  database.close();
  return blob;
}

export async function deleteLocalAssets(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    keys.forEach((key) => store.delete(key));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('无法删除本地图片。'));
    transaction.onabort = () => reject(transaction.error ?? new Error('本地图片删除已取消。'));
  });
  database.close();
}

export async function deleteLocalAsset(key: string): Promise<void> {
  await deleteLocalAssets([key]);
}

export function getLocalPhotoAssetKey(photo: Photo, variant: PhotoAssetVariant): string | undefined {
  if (variant === 'thumbnail') return photo.thumbnailAssetKey;
  if (variant === 'original') return photo.originalAssetKey;
  if (variant === 'motion') return photo.motionAssetKey;
  return photo.assetKey;
}

export async function loadLocalPhotoAsset(photo: Photo, variant: PhotoAssetVariant): Promise<Blob | undefined> {
  const key = getLocalPhotoAssetKey(photo, variant);
  return key ? loadLocalAsset(key) : undefined;
}

export async function hydrateLocalPhotoSources<T extends { assetKey?: string; thumbnailAssetKey?: string; src: string; thumbnailSrc?: string }>(photos: T[]): Promise<T[]> {
  return Promise.all(photos.map(async (photo) => {
    const [display, thumbnail] = await Promise.all([
      photo.assetKey ? loadLocalAsset(photo.assetKey) : undefined,
      photo.thumbnailAssetKey ? loadLocalAsset(photo.thumbnailAssetKey) : undefined
    ]);
    return {
      ...photo,
      ...(display ? { src: URL.createObjectURL(display) } : {}),
      ...(thumbnail ? { thumbnailSrc: URL.createObjectURL(thumbnail) } : {})
    };
  }));
}

export function revokeLocalPhotoSources(photo: Photo): void {
  [photo.src, photo.thumbnailSrc, photo.originalSrc, photo.motionSrc]
    .filter((source): source is string => source?.startsWith('blob:') === true)
    .forEach((source) => URL.revokeObjectURL(source));
}
