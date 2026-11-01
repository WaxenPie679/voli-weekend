// Interfaccia e dati: prima la rete, la cache solo come riserva offline.
// Così dopo un aggiornamento non si mescolano mai file nuovi e vecchi (es. app.js nuovo con view.js vecchio).
const CACHE = 'voli-weekend-v3';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'view.js', 'notify.js', 'config.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const cacheable = (url) => url.origin === self.location.origin
  || url.hostname === 'raw.githubusercontent.com'
  || url.hostname.endsWith('gstatic.com') || url.hostname === 'fonts.googleapis.com';

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || !cacheable(url)) return;
  // I dati hanno ?t=... per evitare cache intermedie: la copia offline è salvata senza query string
  const key = url.pathname.endsWith('.json') ? url.origin + url.pathname : e.request;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
    return res;
  }).catch(() => caches.match(key).then((hit) => hit ?? Response.error())));
});

// Notifiche dell'app inviate dalle ricerche automatiche
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'Voli Weekend', body: e.data?.text() ?? '' }; }
  e.waitUntil(self.registration.showNotification(data.title ?? 'Voli Weekend', {
    body: data.body ?? '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: data.url ?? './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const open = wins.find((w) => w.url.startsWith(self.registration.scope));
    return open ? open.focus() : self.clients.openWindow(e.notification.data?.url ?? './');
  }));
});
