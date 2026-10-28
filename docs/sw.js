const CACHE_NAME = 'mrcp-dashboard-v2026-10-28-modules-1';

const ASSETS = [
  './index_v2.html',
  './app_v2.js',
  './styles_v2.css',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon.png',
  './favicon-64.png'
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

  // Tout le code, reseau d'abord. La regle listait des noms de fichiers en dur
  // et ne connaissait que l'ancien app_v2.js : depuis son decoupage, les onze
  // modules app_v2_*.js tombaient dans la regle generique ci-dessous, qui sert
  // le cache en priorite - du vieux JavaScript a vie des qu'un ?v= n'est pas
  // incremente.
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(event.request, {cache: 'no-store'})
        .then(response => {
          // On garde une copie, sinon le repli hors ligne ci-dessous ne trouve
          // que les rares fichiers pre-charges a l'installation.
          // shortcut: les anciennes versions (?v=) s'accumulent sans purge,
          // quelques dizaines de Ko par deploiement ; a nettoyer si la taille
          // du cache devient genante.
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        // ignoreSearch : hors ligne, mieux vaut la version precedente que rien.
        .catch(() => caches.match(event.request, {ignoreSearch: true}))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
