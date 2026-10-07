const CACHE = 'lista-material-shell-v7';
const SHELL = [
  './', './index.html', './style.css?v=20261006d', './app.js?v=20261007c',
  './rules.js?v=20261007c', './manifest.json?v=20261006d',
  './logo.svg?v=20261006d', './icon-192.png', './icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    Promise.all(SHELL.map(url => fetch(url, {cache: 'reload'}).then(response => {
      if (response.ok) return cache.put(url, response);
    })))));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(key => key.startsWith('lista-material-shell-') && key !== CACHE)
      .map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith(fetch(event.request, {cache: 'no-store'}).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.open(CACHE).then(cache => cache.match(event.request))));
});
