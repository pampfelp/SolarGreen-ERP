/**
 * cobranca-regra.js: regra pura da sub-aba Cobrança, na tela de Vendas (2026-10-30).
 *
 * Serviço executado (OS concluída) às vezes fica sem venda registrada. Aqui entra
 * a lista de OS, de vendas e de clientes, e sai uma linha por OS concluída dizendo
 * quanto já foi pago e em que situação ela está. Nada aqui toca em DOM, rede ou
 * Firestore: entra dado, sai resultado (testado em tests/cobranca-regra.test.js).
 */
(function (root) {
  'use strict';

  var DIA_MS = 86400000;

  // Minúsculo e sem acento, para "Concluído" e "concluido" valerem o mesmo.
  function normalizar(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  // Aceita número, "1234.5" e "1.234,50". Vazio ou inválido vira 0.
  function numero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).trim().replace(/R\$\s?/g, '');
    if (!s) return 0;
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // Data LOCAL: new Date('2026-10-05') seria UTC e, no Brasil, viraria o dia 04.
  function parseData(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (!v) return null;
    var str = String(v).trim();
    var br = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) return new Date(parseInt(br[3], 10), parseInt(br[2], 10) - 1, parseInt(br[1], 10));
    var iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
    var d = new Date(str);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function arredondar(n) { return Math.round(n * 100) / 100; }

  function osDaVenda(v) { return Array.isArray(v.OsVinculadas) ? v.OsVinculadas : null; }

  function classificar(dados) {
    dados = dados || {};
    var agendamentos = dados.agendamentos || [];
    var vendas = dados.vendas || [];
    var clientes = dados.clientes || [];
    var hoje = parseData(dados.hoje || new Date());

    var vendedorDoCliente = {};
    clientes.forEach(function (c) { if (c.IdCliente) vendedorDoCliente[c.IdCliente] = c['Vendedor Responsavel'] || ''; });

    // Só OS concluída entra.
    var linhas = [];
    agendamentos.forEach(function (a) {
      if (normalizar(a['Status Agendamento']) !== 'concluido') return;
      var valor = numero(a.Valor);
      var data = parseData(a['Data Inicio']);
      var situacao = '';
      // 0,01 é a marca de "não cobrar"; vazio, inválido e 0 são "valor não definido".
      if (valor <= 0) situacao = 'sem_valor';
      else if (valor < 1) situacao = 'sem_cobranca';
      linhas.push({
        idAgendamento: a.IdAgendamento, idCliente: a.IdCliente, idServico: a.IdServico,
        idVendedorResp: vendedorDoCliente[a.IdCliente] || '',
        data: data, dias: data && hoje ? Math.round((hoje.getTime() - data.getTime()) / DIA_MS) : 0,
        valor: valor, pago: 0, saldo: 0, situacao: situacao,
        vendasLigadas: [], candidatas: [],
        ajuste: a.CobrancaAjuste && a.CobrancaAjuste.Tipo ? a.CobrancaAjuste : null
      });
    });
    var porOS = {};
    linhas.forEach(function (l) { porOS[l.idAgendamento] = l; });

    // Vínculo explícito: a decisão está gravada na venda.
    vendas.forEach(function (v) {
      var ids = osDaVenda(v);
      if (!ids || !ids.length) return;
      var valorVenda = numero(v.Valor);
      ids.forEach(function (id) {
        var l = porOS[id];
        if (!l) return;
        // Venda de uma OS só aplica o valor inteiro (soma parciais). Venda de várias
        // (plano anual) quita cada OS ligada por inteiro.
        var aplicado = ids.length === 1 ? valorVenda : l.valor;
        l.vendasLigadas.push({ idVenda: v.IdVenda, valorAplicado: aplicado, automatico: false });
      });
    });

    // Vínculo automático, só para histórico: vendas SEM o campo (nunca decididas) e OS
    // com valor que ainda não têm vínculo. Liga só quando o par é único dos dois lados.
    var vendasAntigas = vendas.filter(function (v) { return !osDaVenda(v); });
    var elegiveis = linhas.filter(function (l) { return l.valor >= 1 && !l.vendasLigadas.length; });
    // Índices por cliente+serviço: a lista de vendas pode passar de milhares.
    var vendasPorPar = {}, vendasPorCliente = {}, osPorPar = {};
    function chave(cliente, servico) { return cliente + '|' + servico; }
    vendasAntigas.forEach(function (v) {
      var k = chave(v.IdCliente, v.IdServico);
      (vendasPorPar[k] = vendasPorPar[k] || []).push(v);
      (vendasPorCliente[v.IdCliente] = vendasPorCliente[v.IdCliente] || []).push(v);
    });
    // A OS sem valor também disputa a venda: sem ela na conta, a venda de maio do
    // Marcos ligou sozinha na vistoria de setembro, quando era da vistoria de maio
    // (caso real, 30/10/2026).
    linhas.forEach(function (l) {
      if (l.situacao === 'sem_cobranca' || l.vendasLigadas.length) return;
      var k = chave(l.idCliente, l.idServico);
      osPorPar[k] = (osPorPar[k] || 0) + 1;
    });
    var candDaOS = {};
    var automaticas = {}; // idVenda -> true, para essas vendas não aparecerem como candidatas de outra OS
    elegiveis.forEach(function (l) {
      var k = chave(l.idCliente, l.idServico);
      var cv = vendasPorPar[k] || [];
      candDaOS[l.idAgendamento] = cv;
      if (cv.length !== 1 || osPorPar[k] !== 1) return;
      l.vendasLigadas.push({ idVenda: cv[0].IdVenda, valorAplicado: numero(cv[0].Valor), automatico: true });
      automaticas[cv[0].IdVenda] = true;
    });

    linhas.forEach(function (l) {
      var pago = 0;
      l.vendasLigadas.forEach(function (x) { pago += x.valorAplicado; });
      l.pago = arredondar(pago);
      l.saldo = arredondar(Math.max(l.valor - l.pago, 0));

      if (l.situacao === 'sem_cobranca') return;

      if (l.situacao === 'sem_valor') {
        // Candidatas para "Definir valor": mesmo cliente, venda ainda não decidida.
        // Mesmo serviço primeiro, depois a mais antiga.
        l.candidatas = (vendasPorCliente[l.idCliente] || []).filter(function (v) {
          return !automaticas[v.IdVenda];
        }).sort(function (a, b) {
          var sa = a.IdServico === l.idServico ? 0 : 1, sb = b.IdServico === l.idServico ? 0 : 1;
          if (sa !== sb) return sa - sb;
          return String(a.DataVenda || '').localeCompare(String(b.DataVenda || ''));
        }).map(function (v) { return v.IdVenda; });
        return;
      }

      if (!l.vendasLigadas.length) {
        l.candidatas = (candDaOS[l.idAgendamento] || []).map(function (v) { return v.IdVenda; });
      }
      if (l.pago >= l.valor) l.situacao = 'quitada';
      else if (!l.vendasLigadas.length && l.candidatas.length) l.situacao = 'a_conferir';
      else if (l.pago === 0) l.situacao = 'em_aberto';
      else if (l.ajuste && l.ajuste.Tipo === 'Desconto') l.situacao = 'quitada';
      else if (l.ajuste && l.ajuste.Tipo === 'Parcial') l.situacao = 'em_aberto';
      else l.situacao = 'diferenca';
    });

    return linhas;
  }

  // Filtro de situação da tela (pedido do Felipe, 2026-10-31). "Valor não definido"
  // fica fora de Pendentes, numa opção própria, para ser visto com calma.
  var GRUPOS = {
    pendentes: ['a_conferir', 'em_aberto', 'diferenca'],
    concluidos: ['quitada'],
    sem_valor: ['sem_valor']
  };

  // KPIs da tela. A tela passa só as linhas já filtradas (situação e período inclusive).
  function resumo(linhas) {
    var r = { emAberto: { valor: 0, qtd: 0 }, diferencas: { valor: 0, qtd: 0 }, quitado: { valor: 0, qtd: 0 }, desconto: { valor: 0, qtd: 0 } };
    (linhas || []).forEach(function (l) {
      if (GRUPOS.pendentes.indexOf(l.situacao) !== -1) {
        r.emAberto.valor += l.saldo;
        r.emAberto.qtd++;
      }
      // Só a diferença entre o valor da OS e o que foi pago.
      if (l.situacao === 'diferenca') {
        r.diferencas.valor += l.valor - l.pago;
        r.diferencas.qtd++;
      }
      if (l.situacao === 'quitada') {
        r.quitado.valor += l.pago;
        r.quitado.qtd++;
        // O desconto vale pelo que falta hoje, não pelo que foi gravado no ajuste:
        // uma venda ligada depois pode ter coberto parte dele.
        if (l.ajuste && l.ajuste.Tipo === 'Desconto' && l.pago < l.valor) {
          r.desconto.valor += l.valor - l.pago;
          r.desconto.qtd++;
        }
      }
    });
    ['emAberto', 'diferencas', 'quitado', 'desconto'].forEach(function (k) { r[k].valor = arredondar(r[k].valor); });
    return r;
  }

  var api = { normalizar: normalizar, numero: numero, parseData: parseData, classificar: classificar, GRUPOS: GRUPOS, resumo: resumo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SGCobrancaRegra = api;
})(typeof window !== 'undefined' ? window : null);
