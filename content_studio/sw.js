// Офлайн-режим: сначала сеть (чтобы приходили обновления), при её отсутствии — кэш.
const CACHE = 'content-studio-v4';
const FILES = ['./', 'index.html', 'parser.js', 'db.js', 'prompts.js', 'render.js', 'ai.js', 'voice.js', 'sound.js', 'review.js', 'studio.js', 'manifest.json', 'icon.svg'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});
