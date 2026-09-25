// Офлайн-кэш оболочки приложения. Запросы к Claude не кэшируются.
const VERSION = 'coach-v5';
const SHELL = ['./', 'index.html', 'app.js', 'brain.js', 'kb.js', 'tour-engine.js', 'store.js', 'poker.js', 'ranking.js',
  'manifest.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin) {
    // сначала сеть (чтобы обновления приезжали), при отсутствии сети — кэш
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
  } else if (url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return resp;
    })));
  }
});
