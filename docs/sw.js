const CACHE_NAME = 'mrcp-dashboard-v2026-05-16-cachefix-1';

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

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || url.pathname.endsWith('index_v2.html')) {
    event.respondWith(fetch(event.request, {cache: 'no-store'}).catch(() => caches.match('./index_v2.html')));
    return;
  }

  if (url.pathname.endsWith('data_v2.json')) {
    event.respondWith(fetch(event.request, {cache: 'no-store'}));
    return;
  }

  if (url.pathname.endsWith('app_v2.js') || url.pathname.endsWith('styles_v2.css') || url.pathname.endsWith('pilot_links_v53.js') || url.pathname.endsWith('mrcp_v55_widgets.js') || url.pathname.endsWith('mrcp_v54_intelligence.js')) {
    event.respondWith(fetch(event.request, {cache: 'no-store'}).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
