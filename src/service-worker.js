// Service worker: keeps all files of the site in the browser cache, so that the online version
// also works without internet after it has been opened once. Registered by script.js (https only).
//
// scripts/build.js prepends VERSION (a hash of all files) and FILES (all files of the site) and
// writes the result to sw.js. A new build changes sw.js, so the browser installs the new version
// in the background; it is used from the next page load on.

const CACHE = 'elmrepl-' + VERSION;

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            // revalidate with the server, so that no outdated files from the HTTP cache get into the new cache
            .then((cache) => cache.addAll(FILES.map((file) => new Request(file, { cache: 'no-cache' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys
                .filter((key) => key.startsWith('elmrepl-') && key !== CACHE)
                .map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

// files of the site from the cache, everything else from the network
self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    event.respondWith(
        caches.open(CACHE)
            // the page itself is requested with parameters (?compressed=...)
            .then((cache) => cache.match(request, { ignoreSearch: request.mode === 'navigate' }))
            .then((response) => response || fetch(request))
    );
});
