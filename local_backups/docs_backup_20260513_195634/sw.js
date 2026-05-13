const CACHE_NAME = 'mrcp-dashboard-v4-4-2';

const ASSETS = [
  './index_v2.html',
  './app_v2.js',
  './styles_v2.css',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.pathname.endsWith('data_v2.json')) {
    event.respondWith(fetch(event.request, {cache: 'no-store'}));
    return;
  }

  if (url.pathname.endsWith('app_v2.js') || url.pathname.endsWith('styles_v2.css')) {
    event.respondWith(fetch(event.request, {cache: 'no-store'}).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
