/**
 * notif-agendamento.js: avisos de agendamento para o técnico (2026-11-05).
 *
 * Quando uma OS é criada, remarcada, trocada de técnico, cancelada ou excluída, o
 * técnico recebe um aviso no sininho do app dele e um push. A decisão (quem recebe o
 * quê) é regra pura, testada em tests/notif-agendamento.test.js; a parte de rede só
 * grava o documento em `notificacoes` (sem pushEnviadoEm) e chama a ação `notifPush`
 * do Apps Script. Se a chamada falhar, a varredura do Apps Script manda o push.
 *
 * O id que vai em `para` é TecnicoResponsavel do agendamento: o mesmo idVendedor que
 * o aparelho do técnico grava em push_tokens (sessão do app do técnico).
 */
(function (root) {
  'use strict';

  var CONF = root && root.SGConfirmacaoOS ? root.SGConfirmacaoOS : require('./confirmacao-os.js');
  var API_URL = 'https://script.google.com/macros/s/AKfycbzFCy8PyBZBODgA34xrlLTVUUNhKBIlguJT3ectH7Yus-VW1n41GcCclc5q_Yj0Di2O7g/exec';
  var PAGINA_TECNICO = 'indexdotecnico.html';

  function normalizar(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }
  // Sem status vale Agendado. Cancelada e concluída não são mais OS de campo.
  function ativo(o) {
    var s = normalizar(o && o['Status Agendamento'] != null ? o['Status Agendamento'] : 'Agendado') || 'agendado';
    return s !== 'cancelado' && s !== 'concluido';
  }
  function concluido(o) { return normalizar(o && o['Status Agendamento']) === 'concluido'; }
  function tecnicoDe(o) { return o ? String(o.TecnicoResponsavel == null ? '' : o.TecnicoResponsavel).trim() : ''; }
  function campo(o, nome) { return String((o && o[nome]) == null ? '' : o[nome]).trim(); }

  function mudouHorario(anterior, novo) {
    return CONF.dataISO(anterior && anterior['Data Inicio']) !== CONF.dataISO(novo && novo['Data Inicio']) ||
      campo(anterior, 'Hora inicio') !== campo(novo, 'Hora inicio') ||
      campo(anterior, 'Hora Fim') !== campo(novo, 'Hora Fim');
  }

  // anterior: a OS antes da mudança (null se é nova); novo: a OS depois (null se foi
  // excluída); hoje: 'yyyy-mm-dd' de Belém. Devolve [{para, titulo, ref}]: ref é o
  // registro que o texto descreve (o novo, ou o anterior no Cancelado).
  // - Agendado: o técnico passou a ter uma OS ativa (nova, reaberta ou trocada para ele).
  // - Remarcado: mesmo técnico, mudou dia ou hora.
  // - Cancelado: a OS foi cancelada, excluída ou saiu das mãos dele.
  // Agendado e Remarcado só valem de hoje em diante (OS lançada com data passada é
  // registro retroativo). Editar sem mexer em data, hora, técnico nem status não avisa.
  function decidir(anterior, novo, hoje) {
    if (novo && concluido(novo)) return [];
    var tecAnt = anterior && ativo(anterior) ? tecnicoDe(anterior) : '';
    var tecNovo = novo && ativo(novo) ? tecnicoDe(novo) : '';
    var out = [];
    if (tecAnt && tecAnt !== tecNovo) out.push({ para: tecAnt, titulo: 'Cancelado', ref: anterior, novo: novo });
    if (tecNovo) {
      var dia = CONF.dataISO(novo['Data Inicio']);
      if (dia && hoje && dia >= hoje) {
        if (tecNovo !== tecAnt) out.push({ para: tecNovo, titulo: 'Agendado', ref: novo, novo: novo });
        else if (mudouHorario(anterior, novo)) out.push({ para: tecNovo, titulo: 'Remarcado', ref: novo, novo: novo });
      }
    }
    return out;
  }

  function dataBR(v) {
    var iso = CONF.dataISO(v);
    return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
  }

  // "Fulano · Instalação solar · 05/11/2026 das 8h às 10h"
  function corpo(ref, nomeCliente, nomeServico) {
    var partes = [String(nomeCliente || '').trim() || 'Cliente'];
    if (String(nomeServico || '').trim()) partes.push(String(nomeServico).trim());
    var data = dataBR(ref && ref['Data Inicio']);
    var ini = CONF.formatarHora(campo(ref, 'Hora inicio')), fim = CONF.formatarHora(campo(ref, 'Hora Fim'));
    var quando = data;
    if (data && ini) quando += fim ? ' das ' + ini + ' às ' + fim : ' às ' + ini;
    if (quando) partes.push(quando);
    return partes.join(' · ');
  }

  // O clique abre a OS no app do técnico e marca o aviso como lido (notif=). Sem OS
  // para abrir (excluída, ou que já não é mais dele), abre só o app.
  function urlDe(decisao, idAgendamento, notifId) {
    var aindaDele = decisao.novo && tecnicoDe(decisao.novo) === decisao.para && idAgendamento;
    var params = [];
    if (aindaDele) params.push('agendamento=' + encodeURIComponent(idAgendamento));
    if (notifId) params.push('notif=' + encodeURIComponent(notifId));
    return PAGINA_TECNICO + (params.length ? '?' + params.join('&') : '');
  }

  // Documentos de `notificacoes` (contrato do plano de 05/11): sem pushEnviadoEm, para
  // quem grava ser seguido de notifPush. nomes: {cliente, servico}.
  function montarDocs(decisoes, idAgendamento, nomes, agoraMs) {
    return decisoes.map(function (d, i) {
      var id = 'agendamento:' + idAgendamento + ':' + d.titulo.toLowerCase() + ':' + agoraMs + (i ? '-' + i : '');
      return {
        id: id,
        doc: {
          para: [d.para], tipo: 'agendamento', titulo: d.titulo,
          corpo: corpo(d.ref, (d.ref && d.ref.NomeCliente) || nomes.cliente, nomes.servico),
          url: urlDe(d, idAgendamento, id), tag: 'agendamento-' + idAgendamento, criadoEmMs: agoraMs
        }
      };
    });
  }

  // ── Rede (só no navegador) ─────────────────────────────────────────────
  function db() { return root.firebase.firestore(); }

  function nomes(ref) {
    var idCli = ref && ref.IdCliente, idSrv = ref && ref.IdServico;
    return Promise.all([
      ref && ref.NomeCliente ? ref.NomeCliente : (idCli ? db().collection('clientes').doc(String(idCli)).get().then(function (s) {
        var c = s.exists ? s.data() : {};
        return c['Nome Razao Social'] || c.Nome || '';
      }) : ''),
      idSrv ? db().collection('servicos').doc(String(idSrv)).get().then(function (s) {
        return s.exists ? (s.data()['Nome Servico'] || '') : '';
      }) : ''
    ]).then(function (r) { return { cliente: r[0] || '', servico: r[1] || '' }; })
      .catch(function () { return { cliente: (ref && ref.NomeCliente) || '', servico: '' }; });
  }

  function chamarPush(notifId) {
    var u = root.firebase.auth().currentUser;
    if (!u) return Promise.reject(new Error('Sessão expirada.'));
    return u.getIdToken().then(function (t) {
      return root.fetch(API_URL, { method: 'POST', cache: 'no-store', body: JSON.stringify({ action: 'notifPush', idToken: t, notifId: notifId }) });
    }).then(function (r) { return r.json(); });
  }

  // Nunca derruba o salvamento da OS: qualquer falha aqui só vai para o console.
  function avisar(anterior, novo, idAgendamento) {
    try {
      var decisoes = decidir(anterior, novo, CONF.hojeBelem());
      if (!decisoes.length) return Promise.resolve([]);
      var agora = Date.now();
      return nomes(novo || anterior).then(function (n) {
        var docs = montarDocs(decisoes, idAgendamento, n, agora);
        return Promise.all(docs.map(function (d) { return db().collection('notificacoes').doc(d.id).set(d.doc); })).then(function () {
          docs.forEach(function (d) {
            chamarPush(d.id).catch(function (err) { console.error('notifPush falhou (a varredura cobre):', err); });
          });
          return docs;
        });
      }).catch(function (err) { console.error('Aviso de agendamento não gravado:', err); return []; });
    } catch (err) {
      console.error('Aviso de agendamento:', err);
      return Promise.resolve([]);
    }
  }

  var api = { decidir: decidir, corpo: corpo, montarDocs: montarDocs, urlDe: urlDe, avisar: avisar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SGNotifAgendamento = api;
})(typeof window !== 'undefined' ? window : null);
