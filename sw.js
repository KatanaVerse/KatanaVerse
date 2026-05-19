// ============================================================
// KatanaVerse Service Worker
// Strategy:
//   - Cache-first for same-origin static assets (HTML, icons, fonts)
//   - Network-only for external launches (OKATAN, OKATAN AI, Selah)
//   - Network-first fallback for any other GET
// ============================================================
'use strict';

const CACHE_VERSION = 'katanaverse-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install — pre-cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // Use individual adds so one failure doesn't kill the whole install
      return Promise.allSettled(
        CORE_ASSETS.map((url) => cache.add(url).catch(() => null))
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — routing strategy
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Skip non-GET (avoid caching POSTs)
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // External (your products live on different domains) — let the browser handle it
  if (!isSameOrigin) return;

  // Same-origin: cache-first with network fallback + cache update
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Update cache in the background (stale-while-revalidate)
        event.waitUntil(
          fetch(req)
            .then((fresh) => {
              if (fresh && fresh.ok && fresh.type === 'basic') {
                return caches.open(CACHE_VERSION).then((cache) =>
                  cache.put(req, fresh.clone())
                );
              }
            })
            .catch(() => null)
        );
        return cached;
      }
      // Not in cache yet — fetch, cache, return
      return fetch(req)
        .then((fresh) => {
          if (fresh && fresh.ok && fresh.type === 'basic') {
            const copy = fresh.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return fresh;
        })
        .catch(() => {
          // Last resort: return the cached homepage if it exists
          return caches.match('./index.html');
        });
    })
  );
});
