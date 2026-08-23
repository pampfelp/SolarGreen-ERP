// Service worker compartilhado pelos 5 apps Solar Green (mesma origem/pasta).
// Objetivo: só o necessário pra cada app poder ser "instalado" no celular
// (critério de instalabilidade do Chrome/Android) e abrir mais rápido/com
// alguma resiliência offline — NÃO cacheia chamadas de API (POST pro Apps
// Script), só o "casco" estático (html/css/js/ícones), pra nunca servir
// dado de planilha desatualizado escondido em cache.
const CACHE_NAME = 'sg-shell-v2';

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
    // {cache:'no-store'} é o que garante "network-first" de verdade — sem
    // isso, o fetch() abaixo podia devolver uma resposta guardada no cache
    // HTTP comum do navegador (o GitHub Pages manda Cache-Control nos
    // arquivos), fazendo a tela mostrar código antigo mesmo essa estratégia
    // já tentando "rede primeiro". Achado ao vivo em 2026-08-23: o Felipe
    // via dado da planilha antiga na URL pública minutos depois de um
    // deploy corrigido, mesmo com o servidor já servindo o arquivo certo.
    fetch(req, {cache:'no-store'}).then(function (resp) {
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
