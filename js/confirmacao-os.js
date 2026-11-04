/**
 * confirmacao-os.js: regra pura da confirmação de Ordem de Serviço por WhatsApp (2026-11-03).
 *
 * Quando uma OS nasce ou é remarcada, o cliente recebe um aviso confirmando dia e
 * horário. Esta regra decide QUANDO o aviso sai e monta o texto. O Apps Script
 * (osConfirmacaoEnviar_ em legado/CODE GS.txt) repete a mesma regra no servidor:
 * se mudar aqui, mude lá. Nada aqui toca em DOM, rede ou Firestore (testado em
 * tests/confirmacao-os.test.js).
 */
(function (root) {
  'use strict';

  // Textos aprovados pelo Felipe em 03/11/2026. Os mesmos dos modelos da Meta
  // (OS_MODELOS no Apps Script), com {{n}} no lugar de cada campo.
  var TEXTOS = {
    os_confirmacao: 'Tudo certo, {{1}}! Seu agendamento de {{2}} foi confirmado e está marcado para o dia {{3}}, das {{4}} às {{5}}. Se precisar remarcar ou tiver qualquer dúvida, é só responder essa mensagem.',
    os_confirmacao_dia: 'Tudo certo, {{1}}! Seu agendamento de {{2}} foi confirmado e está marcado para o dia {{3}}. Se precisar remarcar ou tiver qualquer dúvida, é só responder essa mensagem.'
  };

  function normalizar(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  // 'Data Inicio' vira yyyy-mm-dd por regex (new Date de string perde o dia). Aceita
  // yyyy-mm-dd (Firestore) e dd/mm/yyyy (lista em memória). Inválida vira ''.
  function dataISO(v) {
    var s = String(v == null ? '' : v).trim();
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    var br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) return br[3] + '-' + ('0' + br[2]).slice(-2) + '-' + ('0' + br[1]).slice(-2);
    return '';
  }

  // Dia de hoje em Belém (UTC-3, sem horário de verão), como yyyy-mm-dd.
  function hojeBelem(agora) {
    var d = agora instanceof Date ? agora : new Date();
    return new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);
  }

  // "08:00" -> "8h", "08:30" -> "8h30", "14:00" -> "14h". Hora inválida vira ''.
  function formatarHora(h) {
    var m = String(h == null ? '' : h).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!m) return '';
    var hh = parseInt(m[1], 10), mm = parseInt(m[2], 10);
    if (hh > 23 || mm > 59) return '';
    return hh + 'h' + (mm === 0 ? '' : ('0' + mm).slice(-2));
  }

  function dataDiaMes(v) {
    var iso = dataISO(v);
    return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '';
  }

  function hora(o, campo) { return String((o && o[campo]) == null ? '' : o[campo]).trim(); }

  // Sai quando a OS é nova ou mudou dia/horário, ainda é futura (ou de hoje) e não
  // está cancelada nem concluída. Editar uma OS antiga sem mexer na data não dispara.
  // anterior: o registro antes de salvar (ou null); novo: o que será gravado;
  // hoje: 'yyyy-mm-dd' de Belém (ou Date).
  function precisaConfirmar(anterior, novo, hoje) {
    if (!novo) return false;
    var status = normalizar(novo['Status Agendamento'] || 'Agendado');
    if (status === 'cancelado' || status === 'concluido') return false;
    var dia = dataISO(novo['Data Inicio']);
    var hojeStr = hoje instanceof Date ? hojeBelem(hoje) : String(hoje || '');
    if (!dia || !hojeStr || dia < hojeStr) return false;
    if (!anterior) return true;
    return dataISO(anterior['Data Inicio']) !== dia ||
      hora(anterior, 'Hora inicio') !== hora(novo, 'Hora inicio') ||
      hora(anterior, 'Hora Fim') !== hora(novo, 'Hora Fim');
  }

  // Sem hora de início ou de fim válida, vale o modelo só com o dia.
  function modeloConfirmacao(dados) {
    var d = dados || {};
    return formatarHora(d.horaInicio) && formatarHora(d.horaFim) ? 'os_confirmacao' : 'os_confirmacao_dia';
  }

  // dados: {nome, servico, data, horaInicio, horaFim}. Usa só o primeiro nome.
  function textoConfirmacao(dados) {
    var d = dados || {};
    var nome = String(d.nome || '').trim().split(/\s+/)[0] || '';
    nome = nome ? nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase() : '';
    var valores = [nome, String(d.servico || '').toLowerCase(), dataDiaMes(d.data), formatarHora(d.horaInicio), formatarHora(d.horaFim)];
    return TEXTOS[modeloConfirmacao(d)].replace(/\{\{(\d)\}\}/g, function (m, n) { return valores[Number(n) - 1]; });
  }

  var api = { TEXTOS: TEXTOS, dataISO: dataISO, hojeBelem: hojeBelem, formatarHora: formatarHora,
    precisaConfirmar: precisaConfirmar, modeloConfirmacao: modeloConfirmacao, textoConfirmacao: textoConfirmacao };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SGConfirmacaoOS = api;
})(typeof window !== 'undefined' ? window : null);
