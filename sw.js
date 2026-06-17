const CACHE='vm2026-kickoff-fresh-v1';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html','./manifest.webmanifest','./icon.svg']))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{ if(e.request.url.includes('api.kickoffapi.com')) return; e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))); });
