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

  // Textos aprovados pelo Felipe em 04/11/2026 (trocam os de 03/11). Os mesmos dos
  // modelos da Meta (OS_MODELOS no Apps Script). CAMPOS: o que vai em {{1}}, {{2}}...
  // na ordem de cada modelo.
  var CAMPOS = {
    os_confirmacao_v2: ['nome', 'servico', 'data', 'inicio', 'fim', 'tecnico', 'valor', 'endereco'],
    os_confirmacao_v2_dia: ['nome', 'servico', 'data', 'tecnico', 'valor', 'endereco'],
    // Serviço de vários dias (Data Fim), texto aprovado pelo Felipe em 12/11/2026.
    os_confirmacao_v2_varios: ['nome', 'servico', 'data', 'inicio', 'dataFim', 'fimServico', 'tecnico', 'valor', 'endereco']
  };
  var TEXTOS = {
    os_confirmacao_v2: 'Tudo certo, {{1}}! Seu agendamento de {{2}} foi confirmado e está marcado para o dia {{3}}.\n\n* Horário: de {{4}} até {{5}}\n* Técnico: {{6}}\n* Valor do serviço: {{7}}\n* Endereço do serviço: {{8}}\n\nSe precisar remarcar ou tiver qualquer dúvida, é só responder essa mensagem.',
    os_confirmacao_v2_dia: 'Tudo certo, {{1}}! Seu agendamento de {{2}} foi confirmado e está marcado para o dia {{3}}.\n\n* Técnico: {{4}}\n* Valor do serviço: {{5}}\n* Endereço do serviço: {{6}}\n\nSe precisar remarcar ou tiver qualquer dúvida, é só responder essa mensagem.',
    os_confirmacao_v2_varios: 'Tudo certo, {{1}}! Seu agendamento de {{2}} foi confirmado e começa no dia {{3}}, às {{4}}.\n\n* Previsão de finalização: dia {{5}}, às {{6}}\n* Técnico: {{7}}\n* Valor do serviço: {{8}}\n* Endereço do serviço: {{9}}\n\nSe precisar remarcar ou tiver qualquer dúvida, é só responder essa mensagem.'
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

  // 'Data Fim' só vale depois de 'Data Inicio' (mesma regra de js/agenda-periodo.js).
  function dataFimValida(o) {
    var ini = dataISO(o && o['Data Inicio']), fim = dataISO(o && o['Data Fim']);
    return ini && fim && fim > ini ? fim : '';
  }

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
      hora(anterior, 'Hora Fim') !== hora(novo, 'Hora Fim') ||
      dataFimValida(anterior) !== dataFimValida(novo) ||
      (dataFimValida(novo) !== '' && hora(anterior, 'Hora Fim Servico') !== hora(novo, 'Hora Fim Servico'));
  }

  // Mesma leitura de cobrancaNumero_ no Apps Script: número, ou texto "R$ 1.234,50".
  function numeroValor(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var t = String(v == null ? '' : v).trim().replace(/R\$\s?/g, '');
    if (!t) return 0;
    if (t.indexOf(',') !== -1) t = t.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(t);
    return isNaN(n) ? 0 : n;
  }

  // Menos de R$ 2 (inclui 0 e vazio) vira "gratuito"; senão "R$ 1.234,50"
  // (igual a cobrancaDinheiro_ no Apps Script).
  function formatarValor(v) {
    var n = numeroValor(v);
    if (n < 2) return 'gratuito';
    return 'R$ ' + (Math.round(n * 100) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // Com data fim depois do início, hora de início e hora fim do serviço: o modelo de
  // vários dias. Sem hora de início ou de fim válida, vale o modelo só com o dia.
  function modeloConfirmacao(dados) {
    var d = dados || {};
    var ini = dataISO(d.data), fim = dataISO(d.dataFim);
    if (ini && fim && fim > ini && formatarHora(d.horaInicio) && formatarHora(d.horaFimServico)) return 'os_confirmacao_v2_varios';
    return formatarHora(d.horaInicio) && formatarHora(d.horaFim) ? 'os_confirmacao_v2' : 'os_confirmacao_v2_dia';
  }

  // dados: {nome, servico, data, horaInicio, horaFim, dataFim, horaFimServico, tecnico,
  // valor, endereco}; dataFim e horaFimServico só na OS de vários dias.
  // Usa só o primeiro nome. Nenhum campo vai vazio: a Meta recusa.
  function textoConfirmacao(dados) {
    var d = dados || {};
    var nome = String(d.nome || '').trim().split(/\s+/)[0] || '';
    nome = nome ? nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase() : '';
    var campos = {
      nome: nome, servico: String(d.servico || '').toLowerCase(), data: dataDiaMes(d.data),
      inicio: formatarHora(d.horaInicio), fim: formatarHora(d.horaFim),
      dataFim: dataDiaMes(d.dataFim), fimServico: formatarHora(d.horaFimServico),
      tecnico: String(d.tecnico || '').trim() || 'equipe Solar Green',
      valor: formatarValor(d.valor), endereco: String(d.endereco || '').trim() || '-'
    };
    var modelo = modeloConfirmacao(d);
    return TEXTOS[modelo].replace(/\{\{(\d)\}\}/g, function (m, n) { return campos[CAMPOS[modelo][Number(n) - 1]]; });
  }

  var api = { TEXTOS: TEXTOS, CAMPOS: CAMPOS, formatarValor: formatarValor, dataISO: dataISO, hojeBelem: hojeBelem, formatarHora: formatarHora,
    precisaConfirmar: precisaConfirmar, modeloConfirmacao: modeloConfirmacao, textoConfirmacao: textoConfirmacao };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SGConfirmacaoOS = api;
})(typeof window !== 'undefined' ? window : null);
