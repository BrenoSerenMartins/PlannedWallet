const CACHE_PREFIX = 'plannedwallet-shell-';
const CACHE = CACHE_PREFIX + '__PLANNEDWALLET_BUILD__';
const SHELL = [
  '/',
  '/theme.js',
  '/icon.svg?v=4',
  '/icon-192.png?v=4',
  '/icon-512.png?v=4',
  '/manifest.webmanifest?v=4',
];
self.addEventListener('install', (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((path) => new Request(path, { cache: 'reload' })))),
  ),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('message', (event) => {
  if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/v1') ||
    url.pathname.startsWith('/auth') ||
    url.pathname === '/ready' ||
    url.pathname === '/health'
  )
    return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-cache' }).catch(() => caches.match('/')));
    return;
  }
  if (
    url.pathname.startsWith('/assets/') ||
    SHELL.includes(url.pathname) ||
    SHELL.includes(url.pathname + url.search)
  )
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(event.request, copy));
            }
            return response;
          }),
      ),
    );
});
