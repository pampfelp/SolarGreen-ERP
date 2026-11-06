/**
 * usuario-status.js: regra pura do status do usuário (vendedores/{id}.Status).
 *
 * Status possíveis: Ativo, Inativo e Aviso. Aviso entrou em 06/11/2026, pedido do Felipe:
 * - Técnico em Aviso não recebe agendamento novo: some do seletor de técnico do ERP, e
 *   o salvarAgendamento recusa criar OS para ele ou trocar o técnico de uma OS para ele.
 *   As OS que já eram dele continuam com ele. No app do técnico, ele só mexe nas OS com
 *   data de até 3 dias atrás (ou futuras); as mais antigas ficam só para consulta.
 * - Vendedor e os demais: Aviso vale como Ativo, sem mudança.
 *
 * O Apps Script repete "Aviso conta como Ativo" em statusContaComoAtivoFs_
 * (legado/CODE GS.txt): se mudar aqui, mude lá. Nada aqui toca em DOM, rede ou
 * Firestore (testado em tests/usuario-status.test.js).
 */
(function (root) {
  'use strict';

  var DIAS_EDICAO_AVISO = 3;

  function norm(s) {
    return String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function ehAviso(v) { return !!v && norm(v.Status) === 'aviso'; }
  function ehTecnico(v) { return !!v && norm(v.Tipo) === 'tecnico'; }
  function tecnicoEmAviso(v) { return ehTecnico(v) && ehAviso(v); }

  // Onde o sistema exige Status Ativo, Aviso passa junto.
  function contaComoAtivo(v) {
    var s = norm(v && v.Status);
    return s === 'ativo' || s === 'aviso';
  }

  // "dd/mm/aaaa" ou "aaaa-mm-dd" na meia-noite local (sem o desvio de fuso do new Date(iso)).
  function parseData(str) {
    if (!str) return null;
    var s = String(str).trim();
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
    return null;
  }

  // true quando a data da OS é anterior a hoje menos 3 dias. Hoje dia 10: dia 7 ainda
  // abre para edição, dia 6 não. Data que não se lê não trava.
  function osForaDoPrazoAviso(dataInicio, hoje) {
    var d = parseData(dataInicio);
    if (!d) return false;
    var h = hoje ? new Date(hoje.getTime()) : new Date();
    var limite = new Date(h.getFullYear(), h.getMonth(), h.getDate() - DIAS_EDICAO_AVISO);
    return d.getTime() < limite.getTime();
  }

  // O técnico deste cadastro pode editar esta OS no app dele?
  function tecnicoPodeEditarOS(tecnico, agendamento, hoje) {
    if (!tecnicoEmAviso(tecnico)) return true;
    return !osForaDoPrazoAviso(agendamento && agendamento['Data Inicio'], hoje);
  }

  // Salvar o agendamento com este técnico é dar a ele uma OS nova? Recusa só a criação
  // e a troca de técnico; editar uma OS que já era dele passa.
  function podeReceberAgendamento(tecnico, idTecnico, anterior) {
    if (!tecnicoEmAviso(tecnico)) return true;
    return !!anterior && String(anterior.TecnicoResponsavel) === String(idTecnico);
  }

  var api = {
    DIAS_EDICAO_AVISO: DIAS_EDICAO_AVISO,
    ehAviso: ehAviso,
    ehTecnico: ehTecnico,
    tecnicoEmAviso: tecnicoEmAviso,
    contaComoAtivo: contaComoAtivo,
    osForaDoPrazoAviso: osForaDoPrazoAviso,
    tecnicoPodeEditarOS: tecnicoPodeEditarOS,
    podeReceberAgendamento: podeReceberAgendamento
  };
  root.SGUsuarioStatus = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
