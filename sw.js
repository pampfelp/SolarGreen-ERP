// Service worker compartilhado pelos 5 apps Solar Green (mesma origem/pasta).
// Objetivo: só o necessário pra cada app poder ser "instalado" no celular
// (critério de instalabilidade do Chrome/Android) e abrir mais rápido/com
// alguma resiliência offline — NÃO cacheia chamadas de API (POST pro Apps
// Script), só o "casco" estático (html/css/js/ícones), pra nunca servir
// dado de planilha desatualizado escondido em cache.
const CACHE_NAME = 'sg-shell-v4';

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

// ── Push de lead do site (2026-10-08) ──
// O Apps Script (avisarLeadSite) manda pelo Firebase Cloud Messaging uma
// mensagem só de dados: titulo, corpo, url, tag e notifId. Quem desenha a
// notificação é este arquivo, sem o SDK do Firebase aqui dentro.
self.addEventListener('push', function (event) {
  var d = {};
  try {
    var j = event.data ? event.data.json() : {};
    d = j.data || j.notification || j;
  } catch (e) { d = {}; }
  var opcoes = {
    body: d.corpo || d.body || '',
    icon: 'icons/icon-192-admin.png',
    badge: 'icons/icon-192-admin.png',
    tag: d.tag || undefined,
    data: { url: d.url || 'index.html', notifId: d.notifId || '' }
  };
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (janelas) {
      // Com o ERP aberto e na frente, o popup da própria tela já avisa. No
      // iPhone mostra sempre: lá push sem notificação pode cancelar a inscrição.
      var naFrente = janelas.some(function (c) { return c.visibilityState === 'visible' && c.focused; });
      var ios = /iPhone|iPad|iPod/.test(self.navigator.userAgent);
      if (naFrente && !ios) return;
      return self.registration.showNotification(d.titulo || d.title || 'Solar Green', opcoes);
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var dados = event.notification.data || {};
  var alvo = new URL(dados.url || 'index.html', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (janelas) {
      // Reaproveita o ERP já aberto (não o Ponto nem o app do técnico).
      var erp = janelas.filter(function (c) {
        var caminho = new URL(c.url).pathname;
        return /\/$/.test(caminho) || /\/index\.html$/.test(caminho);
      })[0];
      if (erp) {
        erp.postMessage({ tipo: 'sg-notif-abrir', url: alvo });
        return erp.focus();
      }
      return self.clients.openWindow(alvo);
    })
  );
});
