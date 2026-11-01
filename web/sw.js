// Interfaccia dalla cache aggiornata in background; dati sempre dalla rete, con l'ultima risposta come riserva offline.
const CACHE = 'voli-weekend-v1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'view.js', 'config.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];
const DATA = 'voli-weekend-data';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== DATA).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.endsWith('.json')) {
    // Dati: rete prima; offline si usa l'ultima copia (chiave senza query string)
    const key = url.origin + url.pathname;
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(DATA).then((c) => c.put(key, copy)); }
      return res;
    }).catch(() => caches.match(key).then((hit) => hit ?? Response.error())));
    return;
  }
  if (url.origin === self.location.origin || url.hostname.endsWith('gstatic.com') || url.hostname === 'fonts.googleapis.com') {
    // Interfaccia: risponde subito dalla cache e intanto la aggiorna dalla rete
    e.respondWith(caches.match(e.request).then((hit) => {
      const fresh = fetch(e.request).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      });
      if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
      return fresh;
    }));
  }
});
