const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const calc = require('../js/expansao-calculo.js');
const proposta = require('../js/expansao-proposta.js');
const pdf = require('../js/expansao-pdf.js');
const figura = 'data:image/png;base64,iVBORw0KGgo=';
const parametros = { consumoFaturado: 2000, injetadoNoCiclo: 200, recuperacaoMensal: 0,
  produtividade: 100, wp: 630, kwpAtual: 16.5 };
const entrada = () => ({
  fatura: { referencia: '2026-09', consumoFaturado: 2000, injetadoNoCiclo: 200,
    tipoFornecimento: 'trifasico', itens: [] },
  usinaAtual: { kwpAtual: 16.5, considerarRecuperacao: false },
  expansao: { meta: 'recorrente', wp: 630, produtividade: 100, placasNovas: 24 },
  config: { fiob: { percentuais: { 2026: 0.6 } }, potenciasInversorKW: [30] }
});
test('quantidade física substitui apenas a quantidade automática e mantém geração proporcional', () => {
  assert.equal(calc.dimensionar(parametros).placasNovas, 29);
  for (const [qtd, kwp, geracao, total] of [[0, 0, 0, 16.5], [24, 15.12, 1512, 31.62], [40, 25.2, 2520, 41.7]]) {
    const d = calc.dimensionar({ ...parametros, placasNovas: qtd });
    assert.equal(d.placasNovas, qtd);
    assert.equal(d.kwpAdicional, kwp);
    assert.ok(Math.abs(d.geracaoNova - geracao) < 1e-9);
    assert.ok(Math.abs(d.kwpTotal - total) < 1e-9);
  }
});
test('quantidade física rejeita valores inválidos sem coerção', () => {
  for (const placasNovas of [-1, 2.5, '24', null, NaN, Infinity, true]) {
    assert.throws(() => calc.dimensionar({ ...parametros, placasNovas }), RangeError);
  }
});
test('seleção manual preserva catálogo e alerta limite CC sem atestar compatibilidade', () => {
  const p = entrada();
  p.expansao.inversorSelecionado = { kw: 20, marca: 'SOLPLANET', modelo: 'ASW20K-UT-G3', potenciaMaxCC: 30 };
  p.catalogo = [{ Marca: 'Outra', Modelo: 'Automático', PotenciaAtivaNomCA: 30, Fases: 'Trifásico' }];
  const antes = JSON.stringify(p);
  const r = proposta.calcular(p);
  assert.equal(r.inversor.kw, 20);
  assert.equal(r.inversor.selecaoManual, true);
  assert.equal(r.inversor.modelos[0].Marca, 'SOLPLANET');
  assert.equal(r.inversor.modelos[0].Modelo, 'ASW20K-UT-G3');
  assert.match(r.simulacao.premissas.join(' '), /31,62.*30.*kW/);
  assert.match(r.simulacao.premissas.join(' '), /compatibilidade.*projeto/i);
  assert.equal(r.geracao.AnoFioB, 2026);
  assert.equal(r.geracao.PercentualFioBGD2, 0.6);
  assert.equal(JSON.stringify(p), antes);
  delete p.expansao.inversorSelecionado;
  assert.equal(proposta.calcular(p).inversor.kw, 30);
});
test('título de abatimento depende do residual do cenário escolhido', () => {
  for (const [semCompensacao, titulo] of [[0, 'Fatura com 100% de abatimento'], [0.005, 'Fatura com 100% de abatimento'],
    [0.006, 'Fatura simulada com a expansão'], [80, 'Fatura simulada com a expansão'], [undefined, 'Fatura simulada com a expansão']]) {
    const r = pdf.comparacaoFaturas({ dimensionamento: { kwpAtual: 5 }, simulacao: { cenarios: [
      { nome: 'atualCom', creditoUsado: 1 }, { nome: 'expansaoCom', semCompensacao: 0 },
      { nome: 'expansaoSem', semCompensacao, total: 100 } ] } });
    assert.equal(r.faturas.at(-1).titulo, titulo);
  }
});
test('PDF inclui investimento explícito, inversor selecionado e croqui em resumo e página própria', () => {
  const html = pdf.montarHtml({ expansao: { valorInvestimento: 12345.67, croquiImagem: figura },
    inversor: { kw: 20, selecaoManual: true, modelos: [{ Marca: 'SOLPLANET', Modelo: 'ASW20K-UT-G3' }] },
    imagemTelhado: 'data:image/png;base64,QUJD' });
  assert.match(html, /Investimento[\s\S]*12\.345,67/);
  assert.match(html, /Inversor selecionado[\s\S]*SOLPLANET.*ASW20K-UT-G3/);
  assert.match(html, /<h2>Croqui da expansão<\/h2>/);
  assert.equal(html.split(figura).length - 1, 2);
  assert.doesNotMatch(html, /Desenho ilustrativo|base64,QUJD/);
  assert.doesNotMatch(pdf.montarHtml(), /Investimento|<h2>Croqui/);
});
test('croqui rejeita URL remota e SVG, mantendo ilustração padrão', () => {
  for (const croquiImagem of ['https://exemplo.invalid/croqui.png', 'data:image/svg+xml;base64,QUJD', 'data:image/png;base64,\" onerror=\"x']) {
    const html = pdf.montarHtml({ expansao: { croquiImagem }, imagemTelhado: figura });
    assert.doesNotMatch(html, /<h2>Croqui|exemplo.invalid|image\/svg|onerror/);
    assert.match(html, /Desenho ilustrativo/);
  }
});
test('recalcular e rascunho preservam somente os extras explícitos da expansão salva', () => {
  const fonte = fs.readFileSync(require.resolve('../js/expansao-tela.js'), 'utf8');
  const inicio = fonte.indexOf('    function dadosCalculo(');
  const fim = fonte.indexOf('\n    function calcularAgora(', inicio);
  const extras = { placasNovas: 0, inversorSelecionado: { kw: 20 }, valorInvestimento: 0,
    custoBase: 100, margemVenda: 0.1, croquiImagem: figura,
    observacoesFinais: 'Nota sintética', geracaoAtualEstimadaMensal: 450,
    perdaSombreamento: 0.15, produtividadeBase: 120 };
  const contexto = { salvo: { Expansao: { ...extras, desconhecido: 123 } },
    dataCampos: () => ({}), catalogo: { inversores: [] },
    window: { SGExpansaoProdutividade: { produtividadeManual: () => ({ status: 'ok' }) } },
    tarifas: [], bandeiraManual: null, produto: null, produtividadeEditada: false,
    modulos: [], cidadeManual: false, regras: [], tarifasRevisadas: () => null };
  const executar = vm.runInNewContext(fonte.slice(inicio, fim) + '\ndadosCalculo', contexto);
  for (const rascunho of [false, true]) {
    const e = executar({ rascunho }).expansao;
    for (const campo of Object.keys(extras)) assert.deepEqual(e[campo], extras[campo]);
    assert.equal(e.desconhecido, undefined);
  }
  contexto.salvo = null;
  assert.equal(executar().expansao.placasNovas, undefined);
});
test('resumo do PDF informa potência unitária e ressalva técnica da seleção manual', () => {
  const base = { expansao: { wp: 630, valorInvestimento: 12345.67 }, dimensionamento: { kwpTotal: 31.62 },
    inversor: { kw: 20, selecaoManual: true, modelos: [{ Marca: 'SOLPLANET', Modelo: 'ASW20K-UT-G3', PotenciaMaxCC: 30 }] } };
  const html = pdf.montarHtml(base);
  assert.match(html, /Potência unitária dos módulos<\/dt><dd>630 Wp/);
  assert.match(html, /Seleção manual[\s\S]*compatibilidade elétrica.*projeto/i);
  assert.match(html, /31,62 kWp.*excede.*30.*kW/);
  assert.doesNotMatch(pdf.montarHtml({ ...base, dimensionamento: { kwpTotal: 29 } }), /excede/);
  assert.doesNotMatch(pdf.montarHtml({ expansao: { wp: 630 }, inversor: { kw: 20 } }), /Seleção manual|excede/);
});
test('miniatura do croqui usa 65 mm sem reduzir ilustração padrão ou folha própria', () => {
  const html = pdf.montarHtml({ expansao: { croquiImagem: figura } });
  assert.match(html, /\.telhado\.croqui img\{max-height:65mm\}/);
  assert.match(html, /\.telhado img\{max-height:115mm\}/);
  assert.match(html, /<figure class="telhado croqui"><img alt="Croqui da expansão"/);
  assert.match(html, /<h2>Croqui da expansão<\/h2><figure><img/);
  const padrao = pdf.montarHtml({ imagemTelhado: figura });
  assert.match(padrao, /<figure class="telhado"><img alt="Arranjo ilustrativo/);
  assert.doesNotMatch(padrao, /class="telhado croqui"/);
});
