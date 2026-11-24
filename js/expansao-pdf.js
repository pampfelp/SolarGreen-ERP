(function (root) {
  'use strict';

  const AUSENTE = 'Não informado';
  const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const aliquota = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
  const formatos = [0, 1, 2, 6].reduce((resultado, casas) => {
    resultado[casas] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    return resultado;
  }, {});
  const css = '@page{size:A4;margin:15mm 14mm 21mm}' +
    '*{box-sizing:border-box}body{color:#1e1e1e;font:10pt/1.4 Arial,sans-serif;margin:0}main{width:100%}' +
    '.folha{padding-bottom:7mm}.folha+.folha{break-before:page}.marca{color:#003122;font-weight:700;border-bottom:2pt solid #78a527;padding-bottom:3mm;margin:0 0 7mm}' +
    'h1,h2,h3{color:#003122;margin:0 0 4mm;break-after:avoid}h1{font-size:23pt}h2{font-size:17pt}h3{font-size:11pt;margin-top:5mm}' +
    'p{margin:2mm 0}.grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:8mm}.grupo{margin:0 0 4mm;break-inside:avoid}' +
    'dt{color:#42564b;font-size:9pt}dd{margin:0;font-weight:700;overflow-wrap:anywhere}.potencias{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin-bottom:5mm}' +
    '.potencias div{background:#f2f7f2;border:1pt solid #dde8dd;padding:3mm;break-inside:avoid}.potencias strong{display:block;font-size:16pt;color:#003122}' +
    'table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5pt;margin:2mm 0 4mm}' +
    'thead{display:table-header-group}tr{break-inside:avoid}th,td{border-bottom:1px solid #d9e3db;padding:2mm 1.1mm;text-align:right;vertical-align:top;overflow-wrap:anywhere}' +
    'th{color:#003122;background:#edf4ed}th:first-child,td:first-child{text-align:left;width:31%}.financeiro th,.total th,.total td{font-weight:700;background:#edf4ed}' +
    '.kpis{display:flex;gap:3mm;margin:0 0 4mm;break-inside:avoid}.kpi{flex:1;background:#f2f7f2;border:1pt solid #dde8dd;padding:3mm}' +
    '.kpi span{display:block;color:#42564b;font-size:9pt}.kpi strong{display:block;font-size:15pt;color:#003122}.kpi small{display:block;color:#42564b;font-size:8pt}' +
    '.kpi.ganho strong{color:#4d7a17}.kpi.alerta{background:#fdf0ef;border-color:#efc4bf}.kpi.alerta strong,.kpi.alerta small{color:#b3261e}' +
    'figure{margin:3mm 0;text-align:center}img{max-width:100%;max-height:217mm;object-fit:contain}.telhado{break-inside:avoid}.telhado img{max-height:115mm}' +
    '.comparacao{break-inside:avoid}.comparacao td:first-child{width:auto}.lembrete{color:#42564b;font-size:8.5pt}.anexo{break-inside:avoid}' +
    '.capa{min-height:225mm;display:flex;flex-direction:column;justify-content:center;border-left:3mm solid #78a527;padding-left:9mm}' +
    '.capa h1{font-size:30pt;margin-bottom:8mm}.capa .para{color:#42564b;font-size:9pt;letter-spacing:.14em;text-transform:uppercase;margin:0}' +
    '.capa h2{font-size:22pt;margin:1mm 0 1mm}.capa .validade{color:#42564b;margin-top:10mm;font-size:9pt}' +
    'footer{border-top:1px solid #d9e3db;padding-top:2mm;font-size:8pt;color:#42564b;text-align:center}' +
    '@media screen{tfoot{display:none}body{max-width:210mm;margin:8mm auto;padding:0 14mm}.folha{margin:0 0 12mm}.folha+.folha{border-top:1px solid #d9e3db;padding-top:5mm}}' +
    '@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}footer{position:fixed;bottom:0;left:0;right:0}tfoot td{height:7mm;padding:0;border:0}}';

  function esc(valor) {
    return String(valor ?? AUSENTE).replace(/[&<>"']/g, letra => ({ '&': '&amp;', '<': '&lt;',
      '>': '&gt;', '"': '&quot;', "'": '&#39;' }[letra]));
  }

  function numero(valor, casas = 2, unidade = '') {
    return Number.isFinite(valor) ? formatos[casas].format(valor) + unidade : AUSENTE;
  }

  function reais(valor) {
    return Number.isFinite(valor) ? moeda.format(valor) : AUSENTE;
  }

  function percentual(valor, comparacao = false) {
    if (comparacao) return numero(valor, 1, '%');
    return Number.isFinite(valor) ? aliquota.format(valor) + '%' : AUSENTE;
  }

  function data(valor, hora = false) {
    if (!valor) return AUSENTE;
    if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      return valor.split('-').reverse().join('/');
    }
    const d = typeof valor.toDate === 'function' ? valor.toDate()
      : Number.isFinite(valor.seconds) ? new Date(valor.seconds * 1000) : new Date(valor);
    if (!Number.isFinite(d.getTime())) return AUSENTE;
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Belem', dateStyle: 'short', ...(hora ? { timeStyle: 'short' } : {})
    }).format(d);
  }

  function vigencia(g) {
    return g.VigenciaInicio && g.VigenciaFim ? data(g.VigenciaInicio) + ' a ' + data(g.VigenciaFim) : AUSENTE;
  }

  function grupos(pares) {
    return '<dl class="grade">' + pares.map(([rotulo, valor]) => '<div class="grupo"><dt>' + esc(rotulo) +
      '</dt><dd>' + esc(valor === '' ? AUSENTE : valor) + '</dd></div>').join('') + '</dl>';
  }

  function secao(titulo, conteudo, classe = '', marca = 'Proposta de Expansão') {
    return '<section class="folha ' + classe + '"><p class="marca">Solar Green Suporte · ' + marca + '</p>' +
      '<h2>' + titulo + '</h2>' + conteudo + '</section>';
  }

  function imagemLocal(url) {
    return typeof url === 'string' && /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(url);
  }

  function linhaFatura(item) {
    const campos = [item.quantidade, item.precoComTributos, item.tarifaSemTributos, item.pisCofins, item.icms, item.valor];
    return '<tr><td>' + esc(item.descricao) + '</td>' + campos.map((v, i) => '<td>' +
      (Number.isFinite(v) ? esc(numero(v, i === 1 || i === 2 ? 6 : 2)) : '—') + '</td>').join('') + '</tr>';
  }

  function tabelaFatura(itens, total, financeirosDaFatura) {
    const incluidos = (itens || []).filter(item => item.noTotal !== false);
    const cabecalho = '<thead><tr><th>Itens da fatura</th><th>Quant.<br>(kWh)</th>' +
      '<th>Preço c/ tributos<br>(R$/kWh)</th><th>Tarifa s/ tributos<br>(R$/kWh)</th><th>PIS/Cofins<br>(R$)</th>' +
      '<th>ICMS<br>(R$)</th><th>Valor<br>(R$)</th></tr></thead>';
    const eFinanceiro = item => financeirosDaFatura && (financeiro(item) || financeirosDaFatura.some(original =>
      original.descricao === item.descricao && original.valor === item.valor));
    const linhas = incluidos.filter(item => !eFinanceiro(item));
    const financeiros = incluidos.filter(eFinanceiro);
    const corpo = linhas.map(linhaFatura).join('') + (financeiros.length
      ? '<tr class="financeiro"><th colspan="7">Itens financeiros</th></tr>' + financeiros.map(linhaFatura).join('') : '');
    return '<table>' + cabecalho + '<tbody>' + (corpo || '<tr><td colspan="7">Itens não informados.</td></tr>') +
      '<tr class="total"><th colspan="6">Total a pagar</th><td>' + esc(reais(total)) + '</td></tr></tbody><tfoot><tr><td colspan="7"></td></tr></tfoot></table>';
  }

  function financeiro(item) {
    return ['sceeLiquido', 'financeiro', 'cip'].includes(item.tipo) || item.eventual === true || item.financeiro === true;
  }

  function quadroFioB(c, referencia) {
    const anos = [...new Set((c.fontes || []).map(fonte => fonte.ano))];
    const ano = anos[0] ?? Number(referencia?.slice(0, 4));
    if (c.homologada !== true || c.comparavel !== true || !Number.isFinite(c.diferencaPct) ||
        Math.abs(c.diferencaPct) <= 1 || anos.length > 1 || !Number.isInteger(ano) || ano < 2023) return '';
    const acima = c.diferencaPct > 0;
    const diferenca = percentual(Math.abs(c.diferencaPct), true);
    const frase = 'O Fio B cobrado nesta fatura está ' + diferenca + ' ' + (acima ? 'acima' : 'abaixo') +
      ' do previsto na Lei 14.300 para ' + ano;
    const base = c.fontes?.length === 1 ? c.fontes[0] : null;
    const detalhes = base ? ' (' + percentual(base.percentual * 100) + ' de ' + numero(base.tarifa, 6) + ')' : '';
    const linhas = [
      ['Fio B cobrado nesta fatura (GD II)', numero(c.cobrado, 6)],
      ['Previsto pela Lei 14.300 em ' + ano + detalhes, numero(c.previsto, 6)],
      ['Diferença', (acima ? '+' : '-') + diferenca]
    ];
    return '<div class="comparacao"><h3>Fio B cobrado × previsto em lei</h3><table><thead><tr><th></th><th>R$/kWh</th></tr></thead><tbody>' +
      linhas.map(([titulo, v]) => '<tr><td>' + esc(titulo) + '</td><td>' + esc(v) + '</td></tr>').join('') +
      '</tbody></table><p>' + esc(frase) + '</p></div>';
  }

  function kpis(lista) {
    const validos = lista.filter(k => k && (Number.isFinite(k.valor)
      || (k.valor === undefined && typeof k.texto === 'string' && k.texto)));
    return validos.length ? '<div class="kpis">' + validos.map(k => '<div class="kpi ' + (k.classe || '') + '"><span>' +
      esc(k.titulo) + '</span><strong>' + esc(k.texto ?? (k.sinal && k.valor > 0 ? '+' : '') + reais(k.valor)) + '</strong>' +
      (k.nota ? '<small>' + esc(k.nota) + '</small>' : '') + '</div>').join('') + '</div>' : '';
  }

  function diferenca(a, b) {
    return Number.isFinite(a) && Number.isFinite(b) ? Math.round((a - b) * 100) / 100 : null;
  }

  // Faturas e KPIs da proposta, na ordem decidida pelo Felipe (12/11). Sem solar: atual e simulada com solar;
  // com solar: atual, sem solar e com 100% de abatimento. A tela e o PDF usam a mesma lista.
  function comparacaoFaturas({ simulacao = {}, dimensionamento: d = {}, fatura = {} } = {}) {
    const porNome = Object.fromEntries((simulacao.cenarios || []).map(c => [c.nome, c]));
    const atual = porNome.atualCom || {};
    const usouCreditos = (atual.creditoUsado || 0) > 0.005;
    const temSolar = d.kwpAtual > 0 || atual.injetado > 0 || atual.compensado > 0;
    const contaHoje = Number.isFinite(atual.total) ? atual.total : fatura.total;
    const simulada = porNome[usouCreditos ? 'expansaoSem' : 'expansaoCom'] || {};
    const semSolar = porNome.semSolar || {};
    const semEventuais = Number.isFinite(fatura.total) && Number.isFinite(contaHoje) && Math.abs(fatura.total - contaHoje) > 0.005;
    const faturas = temSolar ? [
      { titulo: 'Fatura atual', atual: true, total: contaHoje, nota: semEventuais, kpis: [
        { titulo: 'Economia frente a uma conta sem energia solar', valor: diferenca(semSolar.total, contaHoje), classe: 'ganho' },
        usouCreditos && { titulo: 'Abatido com créditos de meses anteriores', valor: diferenca(porNome.atualSem?.total, contaHoje),
          nota: 'Não se repete nas próximas faturas', classe: 'alerta' },
        usouCreditos && { titulo: 'Conta sem esse abatimento', valor: porNome.atualSem?.total }
      ].filter(Boolean) },
      { titulo: 'Fatura sem energia solar', cenario: semSolar, total: semSolar.total, kpis: [
        { titulo: 'Valor a mais que a fatura atual', valor: diferenca(semSolar.total, contaHoje), sinal: true, classe: 'alerta' }
      ] },
      { titulo: 'Fatura com 100% de abatimento', cenario: simulada, total: simulada.total, kpis: [
        { titulo: 'Economia frente à fatura atual', valor: diferenca(contaHoje, simulada.total), classe: 'ganho' }
      ] }
    ] : [
      { titulo: 'Fatura atual', atual: true, total: contaHoje, kpis: [] },
      { titulo: 'Fatura simulada com energia solar', cenario: simulada, total: simulada.total, nota: semEventuais, kpis: [
        { titulo: 'Economia por mês', valor: diferenca(contaHoje, simulada.total), classe: 'ganho' }
      ] }
    ];
    return { temSolar, contaHoje, semEventuais, faturas };
  }

  function serieAnual(base, anos, reajuste, degradacao = 0) {
    let total = 0;
    for (let k = 0; k < anos; k++) total += base * Math.pow(1 + reajuste, k) * Math.pow(1 - degradacao, k);
    return Math.round(total * 100) / 100;
  }

  // Números comerciais da proposta de instalação nova. O que o vendedor informou vale mais que a
  // simulação; sem valor informado, a conta de hoje e a conta com solar saem da fatura simulada.
  // Gasto em 10 anos e economia em 25 anos só saem de conta quando há reajuste anual informado.
  function resumoComercial({ expansao: e = {}, simulacao = {}, dimensionamento: d = {}, fatura = {} } = {}) {
    const comparacao = comparacaoFaturas({ simulacao, dimensionamento: d, fatura });
    const simulada = comparacao.faturas.find(f => !f.atual && f.cenario)?.total;
    const positivo = v => Number.isFinite(v) && v >= 0 ? v : null;
    const contaHoje = positivo(e.contaHojeInformada) ?? positivo(comparacao.contaHoje);
    const contaComSolar = positivo(e.contaComSolarInformada) ?? positivo(simulada);
    const consumoMedio = positivo(e.consumoMedioInformado) ?? positivo(fatura.consumoFaturado);
    const economiaMes = diferenca(contaHoje, contaComSolar);
    const economiaAno = economiaMes === null ? null : Math.round(economiaMes * 12 * 100) / 100;
    const valorSistema = positivo(e.valorSistema);
    const payback = valorSistema > 0 && economiaAno > 0 ? valorSistema / economiaAno : null;
    const reajuste = positivo(e.reajusteAnualPct) === null ? null : e.reajusteAnualPct / 100;
    const degradacao = positivo(e.degradacaoAnualPct) === null ? 0 : e.degradacaoAnualPct / 100;
    const gasto10Anos = positivo(e.gasto10AnosInformado)
      ?? (reajuste !== null && contaHoje !== null ? serieAnual(contaHoje * 12, 10, reajuste) : null);
    const economia25Anos = positivo(e.economia25AnosInformada)
      ?? (reajuste !== null && economiaAno > 0 ? serieAnual(economiaAno, 25, reajuste, degradacao) : null);
    return { contaHoje, contaComSolar, consumoMedio, economiaMes, economiaAno, valorSistema,
      formaPagamento: e.formaPagamento || null, payback, gasto10Anos, economia25Anos,
      reajusteAnualPct: reajuste === null ? null : reajuste * 100, degradacaoAnualPct: degradacao * 100,
      contaComSolarInformada: positivo(e.contaComSolarInformada) !== null,
      economia25AnosInformada: positivo(e.economia25AnosInformada) !== null };
  }

  // Área ocupada: a informada pelo vendedor ou, sem ela, as dimensões do módulo vezes o número de placas.
  function areaDoTelhado(e = {}, d = {}) {
    if (Number.isFinite(e.areaTelhadoM2) && e.areaTelhadoM2 > 0) return e.areaTelhadoM2;
    const modulo = Number(e.alturaM) * Number(e.larguraM);
    return modulo > 0 && d.placasNovas > 0 ? modulo * d.placasNovas : null;
  }

  // O banco guarda o link da lei; no PDF vai o nome.
  function fonteFioB(fonte) {
    return /legis\.senado\.gov\.br\/norma\/35420157/.test(fonte || '') ? 'Lei 14.300/2022, art. 27' : fonte;
  }

  function montarHtml(model = {}, { paginasDocumento = [] } = {}) {
    const { cliente = {}, fatura = {}, dimensionamento: d = {}, inversor = {}, expansao = {}, geracao: g = {},
      simulacao = {}, comparacaoFioB = {}, imagemTelhado, numeroProposta, vendedor,
      semUsina = false, dataProposta, validadeAte } = model;
    // Instalação nova: mesmo documento, sem "atual/existentes" e com investimento e retorno.
    const marca = semUsina ? 'Proposta de Energia Solar' : 'Proposta de Expansão';
    const sec = (titulo, conteudo, classe = '') => secao(titulo, conteudo, classe, marca);
    const presentes = pares => semUsina
      ? pares.filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== AUSENTE) : pares;
    const percentualFioB = percentual(Number.isFinite(g.PercentualFioBGD2)
      ? g.PercentualFioBGD2 * (g.PercentualFioBGD2 <= 1 ? 100 : 1) : null);
    const rodape = 'Gerado em ' + data(g.DataGeracao) + ' · Fio B GD II: ' + percentualFioB + ' (' + (g.AnoFioB ?? AUSENTE) + ')' +
      (g.ResolucaoTarifaria ? ' · Tarifas: ' + g.ResolucaoTarifaria + ', ' + vigencia(g) : '');
    // Tarifa, resolução e vigência só aparecem quando a consulta à ANEEL já trouxe os valores.
    const tarifaAneel = [['Tarifa Fio B', numero(g.TarifaFioB, 6, ' R$/kWh')], ['Resolução', g.ResolucaoTarifaria],
      ['Vigência', vigencia(g)]].filter(([, v]) => v && v !== AUSENTE);
    const identificacao = sec('Cliente', grupos(presentes([
      ['Nome', cliente.Nome ?? cliente.nome], ['CPF / CNPJ', cliente['CPF ou CNPJ'] ?? cliente.CPF ?? cliente.cpf ?? cliente.cpfCnpj],
      ['Telefone', cliente.Telefone ?? cliente.telefone], ['E-mail', cliente.Email ?? cliente.email],
      ['Endereço', cliente.Endereco ?? cliente.endereco], ['Cidade', cliente.Cidade || cliente.cidade || expansao.Cidade || expansao.cidade],
      ['CPF do titular Equatorial', cliente.CPFEquatorial ?? cliente.cpfEquatorial],
      ['Nascimento do titular Equatorial', cliente.DataNascimentoEquatorial ?? cliente.dataNascimentoEquatorial],
      ['Unidade consumidora', fatura.uc], ['Referência da fatura', fatura.referencia],
      ['Proposta', numeroProposta], ['Vendedor', vendedor], ['Geração (Belém)', data(g.DataGeracao, true)]
    ])) + '<h3>Parâmetros tarifários</h3>' + grupos(presentes([
      ['Ano do ciclo', g.AnoFioB], ['Percentual Fio B GD II', percentualFioB],
      ['Fonte do percentual Fio B', fonteFioB(g.FonteFioBPercentual)], ...tarifaAneel,
      ['ICMS', percentual(g.AliquotaICMS)], ['PIS', percentual(g.AliquotaPIS)],
      ['Cofins', percentual(g.AliquotaCofins)], ['Origem dos tributos',
        typeof g.OrigemTributos === 'object' && g.OrigemTributos
          ? Object.entries(g.OrigemTributos).map(([nome, fonte]) => nome + ' · ' + fonte).join(' / ') : g.OrigemTributos]
    ])));

    const potencia = (titulo, kwp) => '<div>' + titulo + '<strong>' + esc(numero(kwp, 2, ' kWp')) + '</strong></div>';
    // Total = geração nova na proporção da potência total (mesma produtividade da geração nova).
    const geracaoTotal = d.kwpAdicional > 0 && Number.isFinite(d.kwpTotal) && Number.isFinite(d.geracaoNova)
      ? d.geracaoNova * d.kwpTotal / d.kwpAdicional : null;
    const legendaTelhado = semUsina
      ? esc(numero(d.placasNovas, 0)) + ' placas · Desenho ilustrativo'
      : esc(numero(d.placasExistentes, 0)) + ' existentes · ' + esc(numero(d.placasNovas, 0)) + ' a adicionar · Desenho ilustrativo';
    const telhado = imagemLocal(imagemTelhado) ? '<figure class="telhado"><img alt="Arranjo ilustrativo dos módulos" src="' +
      imagemTelhado + '"><figcaption>' + legendaTelhado + '</figcaption></figure>'
      : semUsina ? '' : '<p class="lembrete">Ilustração indisponível.</p>';
    const resumo = sec('Resumo da expansão', '<div class="potencias">' + potencia('Atual', d.kwpAtual) +
      potencia('A adicionar', d.kwpAdicional) + potencia('Total', d.kwpTotal) + '</div>' +
      kpis([{ titulo: 'Geração por mês', valor: d.geracaoNova, texto: '+' + numero(d.geracaoNova, 2, ' kWh'),
        nota: Number.isFinite(geracaoTotal) ? 'Total: ' + numero(geracaoTotal, 2, ' kWh') : '', classe: 'ganho' }]) + grupos([
      ['Placas existentes', numero(d.placasExistentes, 0)], ['Placas novas', numero(d.placasNovas, 0)],
      ['Inversor sugerido', numero(inversor.kw, 2, ' kW')], ['Cidade', expansao.Cidade ?? expansao.cidade],
      ['Produtividade', numero(expansao.Produtividade ?? expansao.produtividade, 2, ' kWh/kWp/mês')]
    ]) + telhado);

    const comparacao = comparacaoFaturas({ simulacao, dimensionamento: d, fatura });
    const financeiros = fatura.itensFinanceiros || [];
    const semEventuais = '<p class="lembrete">Comparações sem multa, juros e outros valores eventuais desta fatura ' +
      '(conta de referência ' + esc(reais(comparacao.contaHoje)) + ').</p>';
    // Sem simulação da fatura (valores só informados), não há tabela de itens para mostrar.
    const mostrarFaturas = !semUsina || (simulacao.cenarios || []).length > 0;
    const faturas = mostrarFaturas ? comparacao.faturas.map(f => sec(f.titulo, kpis(f.kpis) + (f.nota ? semEventuais : '') + (f.atual
      ? tabelaFatura(fatura.itens, fatura.total) + quadroFioB(comparacaoFioB, fatura.referencia)
      : tabelaFatura(f.cenario.linhas, f.cenario.total, financeiros)))) : [];

    let partes;
    if (semUsina) {
      const c = resumoComercial({ expansao, simulacao, dimensionamento: d, fatura });
      const wp = Number(expansao.wp ?? expansao.Wp);
      const area = areaDoTelhado(expansao, d);
      const nomeCliente = cliente.Nome ?? cliente.nome;
      const cidade = cliente.Cidade || cliente.cidade || expansao.Cidade || expansao.cidade;
      const capa = '<section class="folha capa"><p class="marca">Solar Green Suporte · ' + marca + '</p>' +
        '<h1>Proposta de Energia Solar</h1>' + (nomeCliente ? '<p class="para">Preparada para</p><h2>' + esc(nomeCliente) + '</h2>' : '') +
        (cidade ? '<p>' + esc(cidade) + '</p>' : '') + (dataProposta ? '<p class="validade">Proposta de ' + esc(data(dataProposta)) +
          (validadeAte ? ' · válida até ' + esc(data(validadeAte)) : '') + '</p>' : '') + '</section>';
      const inversorTexto = expansao.inversorDescricao || (Number.isFinite(inversor.kw) ? numero(inversor.kw, 0, ' kW') : AUSENTE);
      const sistema = sec('Seu sistema fotovoltaico', '<div class="potencias">' +
        potencia('Potência do sistema', d.kwpTotal ?? d.kwpAdicional) +
        '<div>Módulos solares<strong>' + esc(numero(d.placasNovas, 0) + (wp > 0 ? ' × ' + numero(wp, 0) + ' W' : '')) + '</strong></div>' +
        '<div>Inversor<strong>' + esc(inversorTexto) + '</strong></div></div>' +
        kpis([{ titulo: 'Geração por mês', valor: d.geracaoNova, texto: numero(d.geracaoNova, 0, ' kWh'),
          nota: Number.isFinite(c.consumoMedio) ? 'Consumo médio: ' + numero(c.consumoMedio, 0, ' kWh/mês') : '', classe: 'ganho' }]) +
        grupos(presentes([['Área no telhado', Number.isFinite(area) ? numero(area, 1, ' m²') : ''],
          ['Cidade', expansao.Cidade ?? expansao.cidade],
          ['Produtividade', Number.isFinite(expansao.Produtividade ?? expansao.produtividade)
            ? numero(expansao.Produtividade ?? expansao.produtividade, 2, ' kWh/kWp/mês') : '']])) + telhado);
      const reajusteTxt = Number.isFinite(c.reajusteAnualPct) ? 'Reajuste anual da tarifa considerado: ' + percentual(c.reajusteAnualPct) + '.' : '';
      const contaHoje = Number.isFinite(c.contaHoje) ? sec('Sua conta de energia hoje', kpis([
        { titulo: 'Conta de luz hoje', valor: c.contaHoje, texto: reais(c.contaHoje) + ' /mês' },
        { titulo: 'Consumo médio', valor: c.consumoMedio, texto: numero(c.consumoMedio, 0, ' kWh/mês') },
        { titulo: 'Sem fazer nada, em 10 anos você gasta', valor: c.gasto10Anos, classe: 'alerta', nota: reajusteTxt }
      ])) : '';
      const antesDepois = Number.isFinite(c.contaComSolar) && Number.isFinite(c.contaHoje)
        ? sec('Antes e depois', kpis([
          { titulo: 'Hoje, sem solar', valor: c.contaHoje, texto: reais(c.contaHoje) + ' /mês' },
          { titulo: 'Com solar', valor: c.contaComSolar, texto: reais(c.contaComSolar) + ' /mês', classe: 'ganho' }
        ]) + kpis([
          { titulo: 'Economia por mês', valor: c.economiaMes, classe: 'ganho' },
          { titulo: 'Economia por ano', valor: c.economiaAno, classe: 'ganho' }
        ]) + '<p>A conta com energia solar não zera. Ficam o custo de disponibilidade da distribuidora, a contribuição de ' +
          'iluminação pública e a cobrança do Fio B sobre a energia injetada na rede (Lei 14.300/2022).</p>' +
          (c.contaComSolarInformada ? '<p class="lembrete">Valor estimado pela Solar Green. A fatura real depende do consumo e da tarifa de cada mês.</p>' : ''))
        : '';
      const investimento = Number.isFinite(c.valorSistema) ? sec('Investimento', kpis([
        { titulo: 'Valor do sistema, instalado e funcionando', valor: c.valorSistema },
        { titulo: 'Forma de pagamento', texto: c.formaPagamento || AUSENTE }
      ])) : '';
      const retorno = Number.isFinite(c.payback) || Number.isFinite(c.economia25Anos) ? sec('Retorno do investimento', kpis([
        { titulo: 'Payback (tempo de retorno)', valor: c.payback, texto: numero(c.payback, 1, ' anos'),
          nota: 'Valor do sistema dividido pela economia anual' },
        { titulo: 'Economia total em 25 anos', valor: c.economia25Anos, classe: 'ganho',
          nota: c.economia25AnosInformada ? 'Estimativa da Solar Green' : [reajusteTxt, c.degradacaoAnualPct > 0
            ? 'Degradação dos módulos: ' + percentual(c.degradacaoAnualPct) + ' ao ano.' : ''].filter(Boolean).join(' ') }
      ])) : '';
      partes = [capa, identificacao, sistema, contaHoje, ...faturas, antesDepois, investimento, retorno].filter(Boolean);
    } else {
      partes = [identificacao, resumo, ...faturas];
    }
    const paginas = paginasDocumento.filter(imagemLocal);
    if (!paginas.length && !semUsina) partes.push(sec('Documento do cliente anexado', '<p>Documento não informado.</p>'));
    paginas.forEach((img, i) => partes.push(sec('Documento do cliente anexado',
      '<figure><img alt="Documento do cliente, página ' + (i + 1) + '" src="' + img + '"></figure>', 'anexo')));
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + marca +
      (numeroProposta ? ' · ' + esc(numeroProposta) : '') + '</title><style>' + css + '</style></head><body><main>' +
      partes.join('') + '</main><footer>' + esc(rodape) + '</footer></body></html>';
  }

  function abrirJanela() {
    const janela = root.open('', '_blank');
    if (!janela) throw new Error('Permita a abertura da janela de impressão para gerar a proposta.');
    janela.opener = null;
    return janela;
  }

  function imagemDoBlob(blob) {
    return new Promise((resolve, reject) => {
      const leitor = new root.FileReader();
      leitor.onload = () => imagemLocal(leitor.result) ? resolve(leitor.result) : reject(new Error('Imagem do documento inválida.'));
      leitor.onerror = () => reject(new Error('Não foi possível ler a imagem do documento.'));
      leitor.readAsDataURL(blob);
    });
  }

  async function renderizarDocumento(blob) {
    if (!blob) return [];
    if (blob.type === 'image/png' || blob.type === 'image/jpeg') return [await imagemDoBlob(blob)];
    if (blob.type !== 'application/pdf') throw new Error('Use um documento em PDF, JPG ou PNG.');
    const pdfjs = await root.SGExpansaoFaturaLeitor.carregarPdfJs();
    const tarefa = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false });
    try {
      const pdf = await tarefa.promise;
      const imagens = [];
      const canvas = root.document.createElement('canvas');
      for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const original = pagina.getViewport({ scale: 1 });
        const viewport = pagina.getViewport({ scale: Math.min(1550 / original.width, 2100 / original.height) });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await pagina.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
        imagens.push(canvas.toDataURL('image/jpeg', 0.92));
        pagina.cleanup();
      }
      return imagens;
    } finally {
      await tarefa.destroy().catch(() => {});
    }
  }

  async function imprimir(model, { janela = abrirJanela() } = {}) {
    if (!janela || janela.closed) throw new Error('Janela de impressão indisponível.');
    try {
      const paginasDocumento = await renderizarDocumento(model.documento);
      if (janela.closed) throw new Error('Janela de impressão indisponível.');
      janela.document.open();
      janela.document.write(montarHtml(model, { paginasDocumento }));
      janela.document.close();
      await Promise.all(Array.from(janela.document.images, img => img.decode()));
      if (janela.closed) throw new Error('Janela de impressão indisponível.');
      janela.focus();
      janela.print();
    } catch (erro) {
      if (!janela.closed) janela.close();
      throw erro;
    }
  }

  const api = { montarHtml, comparacaoFaturas, resumoComercial, abrirJanela, imprimir };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SGExpansaoPdf = api;
})(typeof window !== 'undefined' ? window : null);
