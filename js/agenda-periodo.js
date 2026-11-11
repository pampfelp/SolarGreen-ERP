/**
 * agenda-periodo.js: período que uma OS ocupa na agenda do técnico (2026-11-11).
 *
 * OS de um dia ocupa de 'Hora inicio' a 'Hora Fim' no dia de 'Data Inicio'.
 * OS de vários dias tem 'Data Fim' (depois de 'Data Inicio') e 'Hora Fim Servico':
 * ocupa o técnico sem intervalo, de 'Data Inicio' às 'Hora inicio' até 'Data Fim'
 * às 'Hora Fim Servico'. A partir daí ele pode receber outro agendamento.
 * 'Hora Fim' continua sendo o fim do primeiro dia (texto da confirmação e do PDF).
 *
 * Regra pura, sem DOM nem rede (testada em tests/agenda-periodo.test.js). Usada pelo
 * formulário e pela lista do ERP, pelo app do técnico e pelo aviso ao técnico.
 */
(function (root) {
  'use strict';

  // Aceita yyyy-mm-dd (Firestore) e dd/mm/yyyy (lista em memória). Inválida vira ''.
  function dataISO(v) {
    var s = String(v == null ? '' : v).trim();
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    var br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) return br[3] + '-' + ('0' + br[2]).slice(-2) + '-' + ('0' + br[1]).slice(-2);
    return '';
  }

  function minutosDoDia(h) {
    var m = String(h == null ? '' : h).trim().match(/^(\d{1,2}):(\d{2})/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  }

  // Minutos desde 1970 de uma data yyyy-mm-dd + minutos do dia. Conta em UTC só para
  // somar dias sem depender do fuso do aparelho; o valor serve para comparar.
  function instante(iso, minutos) {
    var p = iso.split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 60000 + minutos;
  }

  function campo(o, nome) { return String((o && o[nome]) == null ? '' : o[nome]).trim(); }

  // 'Data Fim' só conta quando é depois de 'Data Inicio'.
  function dataFim(o) {
    var ini = dataISO(o && o['Data Inicio']), fim = dataISO(o && o['Data Fim']);
    return ini && fim && fim > ini ? fim : '';
  }

  function variosDias(o) { return !!dataFim(o); }

  // Último dia que a OS ocupa (yyyy-mm-dd): Data Fim, ou o próprio Data Inicio.
  function ultimoDia(o) { return dataFim(o) || dataISO(o && o['Data Inicio']); }

  // {ini, fim} em minutos, ou null quando falta data ou hora. OS de vários dias sem
  // 'Hora Fim Servico' ocupa o último dia inteiro.
  function intervalo(o) {
    var ini = dataISO(o && o['Data Inicio']);
    var hIni = minutosDoDia(campo(o, 'Hora inicio'));
    if (!ini || hIni === null) return null;
    var fimDia = dataFim(o);
    if (fimDia) {
      var hFimServ = minutosDoDia(campo(o, 'Hora Fim Servico'));
      return { ini: instante(ini, hIni), fim: instante(fimDia, hFimServ === null ? 24 * 60 : hFimServ) };
    }
    var hFim = minutosDoDia(campo(o, 'Hora Fim'));
    if (hFim === null || hFim <= hIni) return null;
    return { ini: instante(ini, hIni), fim: instante(ini, hFim) };
  }

  function sobrepoe(a, b) {
    var ia = intervalo(a), ib = intervalo(b);
    return !!(ia && ib && ia.ini < ib.fim && ia.fim > ib.ini);
  }

  // A OS ocupa algum dia entre de e ate (yyyy-mm-dd, vazios = sem limite)?
  function ocupaEntre(o, de, ate) {
    var ini = dataISO(o && o['Data Inicio']);
    if (!ini) return false;
    var fim = ultimoDia(o);
    if (de && fim < de) return false;
    if (ate && ini > ate) return false;
    return true;
  }

  function diaMes(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : ''; }

  // "08:00 – 18:00" ou, com Data Fim, "08:00 – 18:00 · até 14/11 às 12:00".
  function textoHorario(o, sep) {
    var s = sep == null ? ' – ' : sep;
    var base = (campo(o, 'Hora inicio') || '—') + s + (campo(o, 'Hora Fim') || '—');
    var fim = dataFim(o);
    if (!fim) return base;
    var hFimServ = campo(o, 'Hora Fim Servico');
    return base + ' · até ' + diaMes(fim) + (hFimServ ? ' às ' + hFimServ : '');
  }

  var api = {
    dataISO: dataISO, dataFim: dataFim, variosDias: variosDias, ultimoDia: ultimoDia,
    intervalo: intervalo, sobrepoe: sobrepoe, ocupaEntre: ocupaEntre, textoHorario: textoHorario
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SGAgendaPeriodo = api;
})(typeof window !== 'undefined' ? window : null);
