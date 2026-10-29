// Keeps the studio app shell available offline, so the installed app opens even while the
// local server is off and can tell you to start it. API calls are never cached.
const CACHE = 'bedrock-studio-shell-v1';
const SHELL = ['/', '/app.js', '/app.css', '/icon.svg', '/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/mcp') return;
  const isPage = event.request.mode === 'navigate';
  // Network first so updates show up immediately; the cache is only the fallback.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(isPage ? '/' : url.pathname, copy));
        }
        return res;
      })
      .catch(() => caches.match(isPage ? '/' : url.pathname).then((hit) => hit || Response.error())),
  );
});
