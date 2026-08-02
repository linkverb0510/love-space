const DATABASE_NAME = 'love-space-media';
const STORE_NAME = 'assets';
const DATABASE_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本地照片存储。'));
  });
}

export async function saveLocalAsset(key: string, blob: Blob): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(blob, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('无法保存图片。'));
  });
  database.close();
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

export async function deleteLocalAsset(key: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('无法删除本地图片。'));
  });
  database.close();
}

export async function hydrateLocalPhotoSources<T extends { assetKey?: string; src: string }>(photos: T[]): Promise<T[]> {
  return Promise.all(photos.map(async (photo) => {
    if (!photo.assetKey) return photo;
    const blob = await loadLocalAsset(photo.assetKey);
    return blob ? { ...photo, src: URL.createObjectURL(blob) } : photo;
  }));
}
