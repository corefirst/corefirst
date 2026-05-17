const CACHE_NAME = 'corefirst-v2';
const STATIC_EXTS = ['.js', '.css', '.woff', '.woff2', '.ttf', '.png', '.svg', '.ico'];

// Precache the shell and offline fallback on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/', '/offline.html'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always network-first for API calls and SSE streams
  if (url.pathname.startsWith('/api/') || event.request.headers.get('accept')?.includes('text/event-stream')) {
    return; // fall through to network
  }

  // Network-only for audio/media files (too large to cache)
  if (url.pathname.startsWith('/media/') || url.pathname.match(/\.(mp3|wav|ogg|webm)$/)) {
    return;
  }

  // Never cache-first Next.js build output: dev chunk URLs are stable across
  // edits (only contents change), so caching them serves a stale client bundle
  // against a fresh SSR HTML and breaks hydration. In production Next.js
  // already content-hashes these URLs, so the browser HTTP cache is sufficient.
  if (url.pathname.startsWith('/_next/')) {
    return;
  }

  // Cache-first for known static asset extensions
  const isStatic = STATIC_EXTS.some((ext) => url.pathname.endsWith(ext));
  if (isStatic) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) => cached ?? fetch(event.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        }),
      ),
    );
    return;
  }

  // Network-first with cache fallback for navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request)
          .then((r) => r ?? caches.match('/'))
          .then((r) => r ?? caches.match('/offline.html'))
          .then((r) => r ?? Response.error()),
      ),
    );
  }
});
