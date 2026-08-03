const CACHE_NAME = 'little-space-shell-v2';
const BASE_URL = new URL('./', self.location).pathname;
const APP_SHELL = [BASE_URL, `${BASE_URL}index.html`, `${BASE_URL}favicon.svg`, `${BASE_URL}manifest.webmanifest`];
const SUPABASE_PATHS = ['/rest/v1/', '/auth/v1/', '/storage/v1/'];

function shouldCache(request) {
  const url = new URL(request.url);
  return url.origin === self.location.origin
    && request.destination !== 'image'
    && !SUPABASE_PATHS.some((path) => url.pathname.includes(path));
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!shouldCache(event.request)) return;
  event.respondWith(
    fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match(BASE_URL)))
  );
});
