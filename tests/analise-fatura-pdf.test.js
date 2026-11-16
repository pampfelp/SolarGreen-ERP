'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const calc = require('../js/analise-fatura-calculo.js');
const pdf = require('../js/analise-fatura-pdf.js');
const { faturas, montarTexto, excluir } = require('./analise-fatura.fixture.js');

const fatos = {
  reajuste: { percentual: 6.94, data: '18/09', norma: 'REH 3.608/2026' },
  bandeiras: { base: 'amarela', comparada: 'verde' },
  faturaAnterior: { referencia: '2026-08', total: 325.61, faturado: 537, injetado: 521 },
  historicoChuva: true,
  nenhumaCausaSozinha: true
};

function modelo(modo = 'geracao', extra = {}) {
  const periodo = calc.periodoParaColar(faturas);
  const { dias } = calc.lerGeracaoColada(montarTexto(), periodo);
  const opcoes = modo === 'desempenho' ? { modo, desempenhos: [0.91, 0.84, 0.78], kwp: 8, produtividadeMensal: Array(12).fill(120) }
    : { modo, dias, excluir };
  const ciclos = calc.analisarCiclos(faturas, opcoes);
  const comparadas = modo === 'semSolar' ? faturas.map(f => ({
    ...f, consumoMedido: f.consumoMedido, consumoCompensado: 0, consumoSemCompensacao: f.consumoMedido, injetadoNoCiclo: 0,
    itens: [{ tipo: 'consumo', valor: f.consumoMedido * 1.2, quantidade: f.consumoMedido, precoComTributos: 1.2 }, { tipo: 'cip', valor: 90 }],
    total: f.consumoMedido * 1.2 + 90
  })) : faturas;
  const ciclosFinais = modo === 'semSolar' ? calc.analisarCiclos(comparadas, { modo }) : ciclos;
  return {
    cliente: { nome: 'Cliente de Teste', uc: '0000000', cidade: 'Cidade-PA' }, dataEmissao: '2026-11-16', modo,
    faturas: comparadas, ciclos: ciclosFinais, dias, excluir,
    composicoes: comparadas.map(calc.composicao), precos: comparadas.map(calc.precos), base: 0, comparada: 2,
    divisao: calc.dividirAumento({ fatura: comparadas[0], ciclo: ciclosFinais[0] }, { fatura: comparadas[2], ciclo: ciclosFinais[2] }),
    cenario: modo === 'semSolar' ? undefined : calc.cenario100(comparadas, ciclosFinais, { saldoInicial: 145.17 }),
    fatos, ...extra
  };
}

test('caso real: números e ciclos do resumo', () => {
  const html = pdf.montarHtml(modelo());
  for (const trecho of ['R$ 181,13', '83,61', '47,27', '46,43', '~91%', '84%', '78%', 'R$ 398,23', 'R$ 579,36',
    '08/08 a 08/09', '09/09 a 08/10', '09/10 a 10/11', 'Fatura 09/2026', 'Fatura 10/2026', 'Fatura 11/2026']) {
    assert.ok(html.includes(trecho), 'faltou: ' + trecho);
  }
});

test('caso real: textos-chave de cada seção', () => {
  const html = pdf.montarHtml(modelo());
  for (const trecho of ['Análise da conta de energia', 'Solar Green Suporte', '16/11/2026',
    'Resumo', 'De onde veio o aumento', 'Eixo começa em R$ 300',
    'Geração da usina, dia a dia', 'Agosto a novembro estão entre os meses menos chuvosos de Belém', 'O que pode estar por trás da queda',
    'Geração, autoconsumo e consumo por fatura', 'Parte da casa atendida na hora pelo sol',
    'Quanto custa cada kWh e como a conta é formada', 'Por que a conta não zera mesmo com a usina', 'Lei 14.300/2022',
    'E se a usina gerasse 100% do previsto?', 'em torno de <b>R$ 513</b>', 'O que fazer agora', 'Como os números foram calculados',
    'Divisão do aumento', 'Valores das faturas Equatorial Pará e do monitoramento do inversor']) {
    assert.ok(html.includes(trecho), 'faltou: ' + trecho);
  }
  assert.ok(html.includes('id="grafico-diario"') && html.includes('id="grafico-cascata"'));
  assert.ok(html.includes('#003122') && html.includes('Unbounded') && html.includes('Inter'));
});

test('fatura em aberto só aparece quando o leitor trouxe o aviso', () => {
  assert.ok(!pdf.montarHtml(modelo()).includes('Fatura em aberto'));
  const m = modelo();
  m.faturas = m.faturas.map((f, i) => i === 2 ? { ...f, avisosFinanceiros: [{ descricao: 'Débitos anteriores: 1 conta em atraso', noTotal: false }] } : f);
  assert.ok(pdf.montarHtml(m).includes('Fatura em aberto'));
});

test('modo desempenho marca "~" e não tem o gráfico diário', () => {
  const html = pdf.montarHtml(modelo('desempenho'));
  assert.ok(!html.includes('id="grafico-diario"'));
  assert.ok(html.includes('~'));
  assert.ok(html.includes('Desempenho informado') && html.includes('Previsto (kWp × produtividade)'));
  assert.ok(html.includes('id="grafico-ciclos"'));
});

test('modo semSolar não tem as seções de geração nem o cenário de 100%', () => {
  const html = pdf.montarHtml(modelo('semSolar'));
  for (const fora of ['Geração da usina, dia a dia', 'Geração, autoconsumo e consumo por fatura', 'E se a usina gerasse 100%', 'Queda da geração', 'créditos']) {
    assert.ok(!html.includes(fora), 'não devia ter: ' + fora);
  }
  assert.ok(html.includes('De onde veio o aumento') && html.includes('Como os números foram calculados'));
});

test('nome com script sai escapado', () => {
  const m = modelo('geracao', { cliente: { nome: '<script>alert(1)</script>', uc: '"><img src=x>', cidade: 'A&B' } });
  const html = pdf.montarHtml(m);
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('<img src=x>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('A&amp;B'));
});

test('sem os fatos do caso, as frases fixas ficam de fora', () => {
  const html = pdf.montarHtml(modelo('geracao', { fatos: undefined }));
  for (const fora of ['6,94', 'REH', 'Bandeira amarela', 'não estava entre as analisadas', 'Nos meses de chuva', 'Nenhuma das duas sozinha']) {
    assert.ok(!html.includes(fora), 'não devia ter: ' + fora);
  }
});
