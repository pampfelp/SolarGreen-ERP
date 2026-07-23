// Service worker compartilhado pelos 5 apps Solar Green (mesma origem/pasta).
// Objetivo: só o necessário pra cada app poder ser "instalado" no celular
// (critério de instalabilidade do Chrome/Android) e abrir mais rápido/com
// alguma resiliência offline — NÃO cacheia chamadas de API (POST pro Apps
// Script), só o "casco" estático (html/css/js/ícones), pra nunca servir
// dado de planilha desatualizado escondido em cache.
const CACHE_NAME = 'sg-shell-v1';

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(
        nomes.filter(function (n) { return n !== CACHE_NAME; }).map(function (n) { return caches.delete(n); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  // Só GET, só mesma origem — POST (todas as chamadas de API) e recursos de
  // terceiros (fontes do Google, etc.) passam direto pela rede, sem cache.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).then(function (resp) {
      if (resp && resp.ok) {
        var copia = resp.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copia); });
      }
      return resp;
    }).catch(function () {
      return caches.match(req).then(function (cached) { return cached || Response.error(); });
    })
  );
});
