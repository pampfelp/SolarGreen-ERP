/**
 * notif-os-concluida.js: aviso ao vendedor quando o técnico conclui a OS (2026-11-16).
 *
 * O técnico marca a OS como Concluído (botão, seletor de status ou checklist
 * obrigatório completo, em js/tecnico-router.js) e o vendedor responsável pelo
 * cliente (clientes/{id}['Vendedor Responsavel']) recebe o aviso no sininho do ERP
 * e um push. O clique abre a OS no ERP (index.html?agendamento=).
 *
 * Um aviso por OS: o id é fixo (os_concluida:<IdAgendamento>) e as regras de
 * `notificacoes` não deixam regravar um aviso que já existe, então concluir de
 * novo (botão depois do checklist completo, por exemplo) não repete o aviso.
 * Se o notifPush falhar, a varredura de 15 min do Apps Script manda o push.
 */
(function (root) {
  'use strict';

  var API_URL = 'https://script.google.com/macros/s/AKfycbzFCy8PyBZBODgA34xrlLTVUUNhKBIlguJT3ectH7Yus-VW1n41GcCclc5q_Yj0Di2O7g/exec';

  function txt(v) { return String(v == null ? '' : v).trim(); }

  // ag: a OS; idVendedor: quem recebe; nomes: {cliente, servico, tecnico}.
  // Devolve null quando não há a quem avisar (cliente sem vendedor, ou o próprio
  // técnico é o vendedor do cliente).
  function montarDoc(ag, idVendedor, idTecnico, nomes, agoraMs) {
    var idAg = txt(ag && ag.IdAgendamento);
    idVendedor = txt(idVendedor);
    if (!idAg || !idVendedor || idVendedor === txt(idTecnico)) return null;
    var partes = [txt(nomes.cliente) || txt(ag.NomeCliente) || 'Cliente'];
    if (txt(nomes.servico)) partes.push(txt(nomes.servico));
    if (txt(nomes.tecnico)) partes.push('por ' + txt(nomes.tecnico));
    var id = 'os_concluida:' + idAg;
    return {
      id: id,
      doc: {
        para: [idVendedor], tipo: 'os_concluida', titulo: 'Serviço concluído',
        corpo: partes.join(' · '),
        url: 'index.html?agendamento=' + encodeURIComponent(idAg) + '&notif=' + encodeURIComponent(id),
        tag: 'os-concluida-' + idAg, criadoEmMs: agoraMs
      }
    };
  }

  // ── Rede (só no navegador) ─────────────────────────────────────────────
  function db() { return root.firebase.firestore(); }

  function chamarPush(notifId) {
    var u = root.firebase.auth().currentUser;
    if (!u) return Promise.reject(new Error('Sessão expirada.'));
    return u.getIdToken().then(function (t) {
      return root.fetch(API_URL, { method: 'POST', cache: 'no-store', body: JSON.stringify({ action: 'notifPush', idToken: t, notifId: notifId }) });
    });
  }

  // Nunca derruba a conclusão da OS: qualquer falha aqui só vai para o console.
  function avisar(idAgendamento) {
    try {
      var sessao = (root.SGAuth && root.SGAuth.getSession && root.SGAuth.getSession()) || {};
      return db().collection('agendamentos').doc(String(idAgendamento)).get().then(function (s) {
        var ag = s.exists ? s.data() : null;
        if (!ag || !ag.IdCliente) return null;
        return Promise.all([
          db().collection('clientes').doc(String(ag.IdCliente)).get(),
          ag.IdServico ? db().collection('servicos').doc(String(ag.IdServico)).get() : null
        ]).then(function (r) {
          var cli = r[0] && r[0].exists ? r[0].data() : {};
          var srv = r[1] && r[1].exists ? r[1].data() : {};
          var n = montarDoc(Object.assign({ IdAgendamento: idAgendamento }, ag), cli['Vendedor Responsavel'], sessao.idVendedor, {
            cliente: cli['Nome Razao Social'] || cli.Nome || ag.NomeCliente,
            servico: srv['Nome Servico'], tecnico: sessao.nome
          }, Date.now());
          if (!n) return null;
          return db().collection('notificacoes').doc(n.id).set(n.doc).then(function () {
            chamarPush(n.id).catch(function (err) { console.error('notifPush falhou (a varredura cobre):', err); });
            return n;
          }, function (err) {
            // Já avisado antes: a regra recusa regravar. Não é erro.
            if (err && err.code === 'permission-denied') return null;
            throw err;
          });
        });
      }).catch(function (err) { console.error('Aviso de OS concluída não gravado:', err); return null; });
    } catch (err) {
      console.error('Aviso de OS concluída:', err);
      return Promise.resolve(null);
    }
  }

  var api = { montarDoc: montarDoc, avisar: avisar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SGNotifOSConcluida = api;
})(typeof window !== 'undefined' ? window : null);
