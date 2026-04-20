const VERSION = 'v2';
const CACHE = `capitalia-${VERSION}`;

const REQUIRED_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

// Cached best-effort during install so the app works offline after the first load.
// If the CDN is unreachable, install still succeeds with only the required assets.
const OPTIONAL_ASSETS = [
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(REQUIRED_ASSETS);
    await Promise.allSettled(
      OPTIONAL_ASSETS.map((url) =>
        cache.add(new Request(url, { cache: 'reload', mode: 'cors', credentials: 'omit' }))
      )
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for any GET (same-origin or pre-cached cross-origin), with
// background revalidation for same-origin responses so updates propagate.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (
            response &&
            response.status === 200 &&
            response.type === 'basic' &&
            url.origin === self.location.origin
          ) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
