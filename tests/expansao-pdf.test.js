'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const pdf = require('../js/expansao-pdf.js');

const itemConsumo = {
  tipo: 'consumoCompensado', descricao: 'Consumo compensado', quantidade: 1410.42, precoComTributos: 0.929835,
  tarifaSemTributos: 0.735307, pisCofins: 25.21, icms: 249.17, valor: 1311.46
};
const itemCredito = { ...itemConsumo, tipo: 'energiaInjetada', descricao: 'Energia ativa injetada usada na compensação',
  pisCofins: -25.21, icms: -249.17, valor: -1311.46 };
const itemFinanceiro = { tipo: 'outro', descricao: 'Plano demonstrativo', valor: 20 };
const itemSceeLiquido = { tipo: 'sceeLiquido', descricao: 'Benefício tarifário líquido SCEE', valor: -669.02 };
const cenario = { nome: 'expansaoCom', rede: 1410.42, injetado: 1427.09, creditoUsado: 0,
  compensado: 1410.42, semCompensacao: 0, saldoFinal: 16.67, total: 955.89,
  linhas: [itemConsumo, itemCredito, itemSceeLiquido, itemFinanceiro] };
const comparacaoFioB = { homologada: true, comparavel: true, diferencaPct: 14.6, cobrado: 0.260931, previsto: 0.227611,
  fontes: [{ ano: 2026, percentual: 0.6, tarifa: 0.379352 }] };
const model = {
  cliente: { Nome: 'Cliente <script>fictício</script> & Cia', Cidade: 'Ananindeua' },
  numeroProposta: 'EXP-TESTE', vendedor: 'Pessoa demonstrativa',
  fatura: { referencia: '2026-10', itens: [itemConsumo, itemFinanceiro], itensFinanceiros: [itemFinanceiro], total: 1440.59 },
  dimensionamento: { kwpAtual: 5, kwpAdicional: 8.06, kwpTotal: 13.06, placasExistentes: 10, placasNovas: 13, geracaoNova: 917.87 },
  expansao: { Produtividade: 113.88, Cidade: 'Ananindeua' }, inversor: { kw: 10 },
  geracao: { DataGeracao: new Date('2026-11-12T02:30:00Z'), AnoFioB: 2027, PercentualFioBGD2: 0.75,
    ResolucaoTarifaria: 'REH nº 3.608', VigenciaInicio: '2026-09-18', VigenciaFim: '2027-08-06' },
  comparacaoFioB,
  // Fatura que usou créditos antigos: a fatura com 100% de abatimento é a da expansão sem créditos.
  simulacao: { cenarios: [{ nome: 'atualCom', rede: 1410.42, injetado: 239, creditoUsado: 530.19, compensado: 769.19,
    semCompensacao: 641.23, total: 1440.59 }, { nome: 'atualSem', total: 1853.06 }, { ...cenario, nome: 'expansaoSem' },
    { nome: 'semSolar', total: 2350.10, linhas: [{ ...itemConsumo, descricao: 'Consumo (kWh)', valor: 2142.10 }, itemFinanceiro] }],
    economiaComCreditos: { contaReferencia: 1440.59, contaExpansao: 955.89, valor: 484.70 },
    economiaSemCreditos: { contaReferencia: 1853.06, contaExpansao: 955.89, valor: 897.17 } }
};
const figura = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZQAAAAASUVORK5CYII=';
const titulos = ['Cliente', 'Resumo da expansão', 'Fatura atual', 'Fatura sem energia solar', 'Fatura com 100% de abatimento',
  'Documento do cliente anexado'];
const kpis = html => [...html.matchAll(/<div class="kpi ([a-z]*)"><span>(.*?)<\/span><strong>(.*?)<\/strong>(?:<small>(.*?)<\/small>)?/g)]
  .map(m => [m[1], m[2], m[3].replace(/\s/g, ' '), m[4] || '']);

test('monta as seis partes A4 com rodapé congelado, data de Belém e escape de texto', () => {
  const html = pdf.montarHtml({ ...model, imagemTelhado: figura }, { paginasDocumento: [figura] });
  assert.deepEqual([...html.matchAll(/<h2>(.*?)<\/h2>/g)].map(m => m[1]), titulos);
  assert.match(html, /@page\{size:A4/);
  assert.match(html, /footer\{position:fixed/);
  assert.match(html, /Gerado em 11\/11\/2026 · Fio B GD II: 75% \(2027\) · Tarifas: REH nº 3.608, 18\/09\/2026 a 06\/08\/2027/);
  assert.match(html, /23:30/);
  assert.match(html, /Cliente &lt;script&gt;fictício&lt;\/script&gt; &amp; Cia/);
  assert.doesNotMatch(html, /<script>/);
});

test('preserva sinais, valores da simulação e bloco dos itens financeiros', () => {
  const html = pdf.montarHtml(model);
  assert.match(html, /1\.410,42<\/td><td>0,929835<\/td><td>0,735307<\/td><td>-25,21<\/td><td>-249,17<\/td><td>-1\.311,46/);
  assert.match(html, /Itens financeiros<\/th><\/tr><tr><td>Benefício tarifário líquido SCEE/);
  assert.match(html, /-669,02<\/td><\/tr><tr><td>Plano demonstrativo/);
  assert.match(html, /R\$\s955,89/);
  assert.doesNotMatch(html, /Cenários|Telhado 3D/);
});

test('cliente com solar: KPIs da fatura atual, sem solar e com 100% de abatimento', () => {
  const html = pdf.montarHtml({ ...model, imagemTelhado: figura });
  assert.deepEqual(kpis(html), [
    ['ganho', 'Geração por mês', '+917,87 kWh', 'Total: 1.487,27 kWh'],
    ['ganho', 'Economia frente a uma conta sem energia solar', 'R$ 909,51', ''],
    ['alerta', 'Abatido com créditos de meses anteriores', 'R$ 412,47', 'Não se repete nas próximas faturas'],
    ['', 'Conta sem esse abatimento', 'R$ 1.853,06', ''],
    ['alerta', 'Valor a mais que a fatura atual', '+R$ 909,51', ''],
    ['ganho', 'Economia frente à fatura atual', 'R$ 484,70', '']
  ]);
  // O telhado fica na página do resumo, sem título próprio.
  const resumo = html.slice(html.indexOf('<h2>Resumo da expansão'), html.indexOf('<h2>Fatura atual'));
  assert.match(resumo, /class="telhado"/);
  assert.match(html, /Consumo \(kWh\)<\/td><td>1\.410,42/);
});

test('sem créditos antigos não mostra o abatimento; multa e juros ficam fora das comparações', () => {
  const cenarios = model.simulacao.cenarios.map(c => c.nome === 'atualCom' ? { ...c, creditoUsado: 0, total: 1436.50 }
    : c.nome === 'expansaoSem' ? { ...c, nome: 'expansaoCom' } : c);
  const html = pdf.montarHtml({ ...model, simulacao: { ...model.simulacao, cenarios } });
  assert.deepEqual(kpis(html).map(k => k[1]), ['Geração por mês', 'Economia frente a uma conta sem energia solar',
    'Valor a mais que a fatura atual', 'Economia frente à fatura atual']);
  assert.match(html, /Comparações sem multa, juros e outros valores eventuais desta fatura \(conta de referência R\$\s1\.436,50\)/);
});

test('cliente sem solar: fatura atual e fatura simulada com energia solar', () => {
  const cenarios = [{ nome: 'atualCom', injetado: 0, creditoUsado: 0, compensado: 0, total: 1440.59 },
    { ...cenario, nome: 'expansaoCom' }, { nome: 'semSolar', total: 1440.59, linhas: [] }];
  const html = pdf.montarHtml({ ...model, dimensionamento: { ...model.dimensionamento, kwpAtual: 0, placasExistentes: 0 },
    simulacao: { cenarios } });
  assert.deepEqual([...html.matchAll(/<h2>(.*?)<\/h2>/g)].map(m => m[1]),
    ['Cliente', 'Resumo da expansão', 'Fatura atual', 'Fatura simulada com energia solar', 'Documento do cliente anexado']);
  assert.deepEqual(kpis(html).slice(1), [['ganho', 'Economia por mês', 'R$ 484,70', '']]);
});

test('sem a consulta à ANEEL, tarifa, resolução e vigência saem do PDF', () => {
  const html = pdf.montarHtml({ ...model, geracao: { DataGeracao: model.geracao.DataGeracao, AnoFioB: 2026,
    PercentualFioBGD2: 0.6, FonteFioBPercentual: 'Lei 14.300/2022, art. 27' } });
  assert.doesNotMatch(html, /Tarifa Fio B|Resolução|Vigência|Tarifas:/);
  assert.match(html, /Percentual Fio B GD II<\/dt><dd>60%/);
  assert.match(html, /Fio B GD II: 60% \(2026\)<\/footer>/);
});

test('quadro Fio B exige homologação, comparabilidade e diferença superior a 1%', () => {
  const frase = /O Fio B cobrado nesta fatura está 14,6% acima do previsto na Lei 14.300 para 2026/;
  assert.match(pdf.montarHtml(model), frase);
  assert.match(pdf.montarHtml({ ...model, comparacaoFioB: { ...comparacaoFioB, diferencaPct: -14.6 } }),
    /14,6% abaixo do previsto na Lei 14.300 para 2026/);
  for (const condicao of [{ homologada: false }, { comparavel: false }, { diferencaPct: 1 },
    { fontes: [{ ano: 2026 }, { ano: 2027 }] }]) {
    const html = pdf.montarHtml({ ...model, comparacaoFioB: { ...comparacaoFioB, ...condicao } });
    assert.doesNotMatch(html, /Fio B cobrado × previsto em lei/);
  }
});

test('rejeita origens remotas e reserva uma folha para cada página anexada', () => {
  const html = pdf.montarHtml({ ...model, imagemTelhado: 'https://exemplo.invalid/remota.png' },
    { paginasDocumento: [figura, 'data:image/svg+xml;base64,SGVsbG8=', figura] });
  assert.equal([...html.matchAll(/class="folha anexo"/g)].length, 2);
  assert.match(html, /Documento do cliente, página 2/);
  assert.match(html, /Ilustração indisponível/);
  assert.doesNotMatch(html, /exemplo\.invalid|image\/svg/);
});

test('renderiza cada página do PDF com bytes locais e imprime só após decodificar as imagens', async () => {
  const eventos = [];
  let html;
  const canvas = { getContext: () => ({}), toDataURL: () => figura };
  const janela = {
    document: { images: [{ decode: async () => eventos.push('imagem') }],
      open() {}, write(valor) { html = valor; }, close() {} },
    focus: () => eventos.push('foco'), print: () => eventos.push('impressão')
  };
  const pagina = { getViewport: () => ({ width: 595, height: 842 }),
    render: () => ({ promise: Promise.resolve(eventos.push('render')) }), cleanup() {} };
  const navegador = { open: () => janela, document: { createElement: () => canvas },
    SGExpansaoFaturaLeitor: { carregarPdfJs: async () => ({ getDocument(opcoes) {
      assert.ok(opcoes.data instanceof Uint8Array);
      assert.equal(opcoes.url, undefined);
      return { promise: Promise.resolve({ numPages: 2, getPage: async () => pagina }),
        destroy: async () => eventos.push('limpeza') };
    } }) } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/expansao-pdf.js'), 'utf8'),
    { window: navegador, Uint8Array });
  const api = navegador.SGExpansaoPdf;
  const aberta = api.abrirJanela();
  assert.equal(aberta.opener, null);
  await api.imprimir({ ...model, documento: new Blob(['%PDF-1.7'], { type: 'application/pdf' }) }, { janela: aberta });
  assert.deepEqual(eventos, ['render', 'render', 'limpeza', 'imagem', 'foco', 'impressão']);
  assert.equal([...html.matchAll(/class="folha anexo"/g)].length, 2);
});

test('fonte do Fio B pelo nome da lei e cidade da fatura quando o cadastro não tem', () => {
  const html = pdf.montarHtml({ ...model, cliente: { Nome: 'Cliente', Cidade: '' },
    geracao: { ...model.geracao, FonteFioBPercentual: 'https://legis.senado.gov.br/norma/35420157/publicacao/35420471' } });
  assert.match(html, /Fonte do percentual Fio B<\/dt><dd>Lei 14\.300\/2022, art\. 27/);
  assert.doesNotMatch(html, /legis\.senado/);
  assert.match(html, /Cidade<\/dt><dd>Ananindeua/);
  assert.doesNotMatch(html, /Cidade<\/dt><dd>Não informado/);
});

test('a tela recebe as mesmas faturas e KPIs do PDF', () => {
  const c = pdf.comparacaoFaturas(model);
  assert.equal(c.temSolar, true);
  assert.deepEqual(c.faturas.map(f => [f.titulo, f.total, f.kpis.map(k => [k.titulo, k.valor])]), [
    ['Fatura atual', 1440.59, [['Economia frente a uma conta sem energia solar', 909.51],
      ['Abatido com créditos de meses anteriores', 412.47], ['Conta sem esse abatimento', 1853.06]]],
    ['Fatura sem energia solar', 2350.10, [['Valor a mais que a fatura atual', 909.51]]],
    ['Fatura com 100% de abatimento', 955.89, [['Economia frente à fatura atual', 484.70]]]
  ]);
});

test('instalação nova: mesmo documento do gerador, com telhado, três faturas, premissas, investimento e retorno', () => {
  const lida = { referencia: '2026-11', total: 970.85, consumoFaturado: 760.46, itens: [itemConsumo, itemFinanceiro],
    itensFinanceiros: [itemFinanceiro], uc: '185.301.013-14' };
  const sem = { nome: 'semSolar', total: 1264.15, linhas: [{ ...itemConsumo, descricao: 'Consumo (kWh)', valor: 1102.97 }, itemFinanceiro] };
  const com = { ...cenario, nome: 'expansaoCom', total: 600, linhas: [itemConsumo, itemCredito, itemFinanceiro] };
  const nova = {
    semUsina: true, cliente: { Nome: 'Cliente Novo', Cidade: 'Belém / PA' }, numeroProposta: 'SG-TESTE',
    dataProposta: '2026-11-24', validadeAte: '2026-11-30', fatura: lida, inversor: {}, imagemTelhado: figura,
    simulacao: { projecao: { consumo: 1000, consumoFatura: 760.46 }, premissas: ['Premissa de teste visível.'],
      cenarios: [{ nome: 'atualCom', total: 1264.15 }, sem, com] },
    dimensionamento: { kwpAtual: 0, kwpAdicional: 9.3, kwpTotal: 9.3, placasExistentes: 0, placasNovas: 15, geracaoNova: 1078.8 },
    expansao: { Cidade: 'Belém', Produtividade: 116, wp: 620, areaTelhadoM2: 40.2, inversorDescricao: 'INVERSOR 6 kW',
      valorSistema: 34600, formaPagamento: 'À vista', reajusteAnualPct: 5.8 },
    geracao: { DataGeracao: new Date('2026-11-24T15:00:00Z'), AnoFioB: 2026, PercentualFioBGD2: 0.6 }
  };
  const c = pdf.resumoComercial(nova);
  // Hoje sem solar é a fatura sem solar simulada, não a lida: 1.264,15 contra 600,00.
  assert.equal(c.contaHoje, 1264.15);
  assert.equal(c.contaComSolar, 600);
  assert.equal(c.economiaMes, 664.15);
  assert.equal(Math.round(c.payback * 10) / 10, 4.3);
  assert.equal(c.gasto10Anos, 1264.15 * 12 > 0 ? Math.round(c.gasto10Anos * 100) / 100 : 0);
  const html = pdf.montarHtml(nova).replace(/\u00a0/g, ' ');
  const titulos = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map(m => m[1]);
  assert.deepEqual(titulos, ['Cliente', 'Resumo do sistema', 'Fatura atual', 'Fatura sem energia solar, com 1.000 kWh',
    'Fatura com energia solar, com 1.000 kWh', 'Premissas da simulação', 'Investimento', 'Retorno do investimento',
    'Documento do cliente anexado']);
  assert.match(html, /Solar Green Suporte · Proposta de Energia Solar/);
  assert.match(html, /<figure class="telhado"><img alt="Arranjo ilustrativo dos módulos"/);
  assert.match(html, /15 placas · Desenho ilustrativo/);
  assert.match(html, /Data da proposta<\/dt><dd>24\/11\/2026/);
  assert.match(html, /Válida até<\/dt><dd>30\/11\/2026/);
  assert.match(html, /Unidade consumidora<\/dt><dd>185\.301\.013-14/);
  for (const trecho of ['9,30 kWp', '15 × 620 W', 'INVERSOR 6 kW', '40,2 m²', 'Premissa de teste visível.', 'R$ 970,85',
    'R$ 1.264,15', 'R$ 600,00', 'R$ 34.600,00', 'À vista', 'Valor a mais que a fatura atual', 'Economia frente à fatura sem solar']) {
    assert.ok(html.includes(trecho), trecho);
  }
  assert.doesNotMatch(html, /existentes/);
  const c3 = pdf.comparacaoFaturas(nova);
  assert.equal(c3.contaHoje, 970.85);
  assert.deepEqual(c3.faturas.map(f => f.total), [970.85, 1264.15, 600]);
  // Sem os campos comerciais, investimento e retorno não aparecem; o resto do documento fica.
  const semValores = pdf.montarHtml({ ...nova, expansao: { Cidade: 'Belém', wp: 620 } });
  assert.doesNotMatch(semValores, /<h2>Investimento<\/h2>|<h2>Retorno do investimento<\/h2>/);
  // Com valores informados pelo vendedor, eles substituem os simulados.
  const informado = pdf.resumoComercial({ ...nova, expansao: { ...nova.expansao, contaHojeInformada: 1320,
    contaComSolarInformada: 382.8, economia25AnosInformada: 595051.88 } });
  assert.equal(informado.economiaMes, 937.2);
  assert.equal(informado.economia25Anos, 595051.88);
  // O documento de expansão com usina segue como era.
  assert.match(pdf.montarHtml(model), /Solar Green Suporte · Proposta de Expansão/);
});

module.exports = { model, figura };
