const CACHE = 'vm2026-kickoffapi-app-v4';
const FILES = ['./','index.html','styles.css','app.js','manifest.webmanifest','icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.url.includes('api.kickoffapi.com')) return;
  event.respondWith(caches.match(req).then(cached => cached || fetch(req)));
});
