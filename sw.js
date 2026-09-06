/* Service worker — what makes the app open with no signal.
 *
 * Cache-first for the shell, because none of it changes during a walk and a
 * field connection is slow enough that a network-first check is felt on every
 * launch. Bump CACHE_VERSION to push an update to the phones.
 *
 * assets/watermark.png is part of the shell, not an extra. It is burned into
 * every photograph, so a walk that started offline without it would produce a
 * day of unmarked pictures. */

/* BUMP THIS ON EVERY UPLOAD. It is not a label — it is the whole update
   mechanism. A browser decides whether to install a new service worker by
   comparing the BYTES of this file with the one it already has, and it is the
   new worker that re-caches everything else. Upload twenty changed files with
   this line untouched and a phone that already has the app keeps serving the
   old ones, silently, for as long as it is installed. */
var CACHE_VERSION = 'wt-surveillance-v7';

/* Relative paths throughout, so the app works from a project subdirectory on
   GitHub Pages as well as from a domain root. */
var SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/options.js',
  './js/exif.js',
  './js/seal.js',
  './js/caption.js',
  './js/db.js',
  './js/geo.js',
  './js/photo.js',
  './js/xlsx.js',
  './js/app.js',
  './assets/watermark.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) { return cache.addAll(SHELL); })
      // Take over straight away rather than waiting for every tab to close — on
      // a phone the app is usually the only tab, and waiting means an update
      // that lands mid-walk never applies.
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        return name === CACHE_VERSION ? null : caches.delete(name);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);

  // Address lookups must never be served from cache: a stale answer would burn
  // the wrong village into a photograph. Let them fail outright when offline —
  // the app already treats that as one stamp line fewer.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        // Only same-origin, successful responses are worth keeping.
        if (response && response.status === 200 && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () {
        // An offline navigation to any path still gets the app.
        if (request.mode === 'navigate') return caches.match('./index.html');
        throw new Error('offline');
      });
    })
  );
});
