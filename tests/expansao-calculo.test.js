'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const calc = require('../js/expansao-calculo.js');

const kwhObservados = 769.19;
const fatura = {
  consumoFaturado: 1410.42, consumoCompensado: kwhObservados, consumoSemCompensacao: 641.23,
  injetadoNoCiclo: 239, creditosAntigosNasLinhas: 530.17, total: 1440.59,
  itensFinanceiros: [{ tipo: 'financeiro', descricao: 'Demais itens da referência', valor: 212.20 }]
};
fatura.itens = [
  { tipo: 'consumo', valor: 810.39 }, { tipo: 'bandeira', valor: 12.42 },
  { tipo: 'gd2', valor: 273.39 },
  { tipo: 'sceeBruto', valor: 497.05, pisCofins: 8.87, icms: 123.32 },
  { tipo: 'sceeLiquido', valor: -364.86 },
  ...fatura.itensFinanceiros,
  { tipo: 'aviso', valor: 500, noTotal: false }
];
const compensado = { precoComTributos: 0.929835, tarifaSemTributos: 0.735307,
  pisCofinsPorKWh: 25.21 / 1410.42, icmsPorKWh: 249.17 / 1410.42 };
const tarifas = {
  faixasConsumo: [{ kwhFaixa: 120, precoComTributos: 1.167917 }, { precoComTributos: 1.285881 }],
  bandeiras: [{ descricao: 'Bandeira tarifária', precoComTributos: 27.32 / 1410.42 }],
  porRegime: {
    'GD II': [
      { ...compensado, tipo: 'compensado', descricao: 'Consumo compensado' },
      { ...compensado, tipo: 'injecao', descricao: 'Energia ativa injetada usada na compensação', sinal: -1 },
      { tipo: 'gd2', descricao: 'Parc. Inj. s/ Desc. – GD II', precoComTributos: 0.355426,
        tarifaSemTributos: 0.260931, pisCofinsPorKWh: 8.95 / 1410.42, icmsPorKWh: 124.38 / 1410.42 },
      { tipo: 'sceeBruto', descricao: 'Benefício tarifário bruto SCEE', valorPorKWh: 497.05 / kwhObservados,
        ocultarQuantidade: true, pisCofinsPorKWh: 8.87 / kwhObservados, icmsPorKWh: 123.32 / kwhObservados },
      { tipo: 'sceeLiquido', descricao: 'Benefício tarifário líquido SCEE',
        valorPorKWh: 364.86 / kwhObservados, sinal: -1, ocultarQuantidade: true }
    ]
  }
};

const arred = (n, casas = 2) => Number(n.toFixed(casas));
const recuperar = () => calc.calcularRecuperacao({
  geracaoReal: 7297.78, geracaoPrevista: 10000, desempenhoAlvo: 1, meses: 10
});
const dimensionar = (mais = {}) => calc.dimensionar({
  ...fatura, recuperacaoMensal: recuperar().recuperacaoMensal, wp: 620, produtividade: 113.88, ...mais
});
const simular = (mais = {}) => calc.simularCenarios({
  fatura, tarifas, recuperacaoMensal: recuperar().recuperacaoMensal,
  geracaoNova: dimensionar().geracaoNova, regimeAtual: 'GD II', ...mais
});

test('reconcilia kWh, créditos, total e tributos da fatura de referência', () => {
  const checagens = Object.fromEntries(calc.conferirFatura(fatura).map(c => [c.campo, c]));
  assert.equal(checagens.consumoFaturado.ok, true);
  assert.equal(checagens.creditosAntigos.ok, false);
  assert.equal(arred(checagens.creditosAntigos.diferenca), 0.02);
  assert.equal(checagens.totalFatura.calculado, 1440.59);
  assert.equal(checagens.totalFatura.ok, true);
  assert.equal(checagens.beneficioScee.ok, true);
  assert.equal(arred(checagens.beneficioScee.calculado), 132.19);
});

test('dimensiona com a potência arredondada das placas e com recuperação média', () => {
  const d = dimensionar({ modulosAtuais: [{ qtd: 10, wp: 500 }] });
  assert.equal(arred(recuperar().recuperacaoMensal), 270.22);
  assert.equal(arred(d.descoberto), 1171.42);
  assert.equal(arred(d.residual), 901.20);
  assert.equal(arred(d.kwpTeorico), 7.91);
  assert.equal(d.placasNovas, 13);
  assert.equal(d.kwpAdicional, 8.06);
  assert.equal(arred(d.geracaoNova), 917.87);
  assert.equal(arred(d.sobra), 16.67);
  assert.equal(d.placasExistentes, 10);
  assert.equal(d.kwpAtual, 5);
  assert.equal(d.kwpTotal, 13.06);
});

test('usa o saldo confirmado só quando autorizado na meta e valida fração, potência e residual', () => {
  assert.equal(dimensionar({ saldoElegivel: 1000 }).placasNovas, 13);
  assert.equal(dimensionar({ saldoElegivel: 1000, usaCreditosAntigos: true }).placasNovas, 0);
  assert.throws(() => dimensionar({ usaCreditosAntigos: true }), /saldo elegível/);
  assert.throws(() => dimensionar({ fracaoUtil: 0 }), /fração útil/);
  assert.throws(() => dimensionar({ fracaoUtil: 1.01 }), /fração útil/);
  assert.equal(dimensionar({ kwpAtual: 4 }).placasExistentes, null);
  assert.equal(dimensionar({ kwpAtual: 4, wpAtual: 500 }).placasExistentes, 8);
  assert.equal(dimensionar({ residualDesejado: 1000 }).placasNovas, 0);
  assert.equal(dimensionar({ consumoFaturado: 620, injetadoNoCiclo: 0, recuperacaoMensal: 0,
    produtividade: 1000 }).placasNovas, 1);
});

test('sugere potência disponível acima do mínimo e respeita fases e limite CC informado', () => {
  const potenciasInversorKW = [5, 8, 10, 12, 15];
  const catalogo = potenciasInversorKW.map(PotenciaAtivaNomCA => ({ PotenciaAtivaNomCA, Fases: 'trifásico' }));
  assert.equal(calc.sugerirInversor({ kwpTotal: 14, catalogo }).kw, 10);
  assert.equal(calc.sugerirInversor({ kwpTotal: 14, catalogo }).overload, 1.4);
  assert.equal(calc.sugerirInversor({ kwpTotal: 14.1, catalogo }).kw, 12);
  assert.equal(calc.sugerirInversor({ kwpTotal: 14, potenciasInversorKW }).fonte, 'config');
  assert.equal(calc.sugerirInversor({ kwpTotal: 14, catalogo, potenciasInversorKW, fornecimento: 'mono' }).kw, null);
  assert.equal(calc.sugerirInversor({ kwpTotal: 14, catalogo, fornecimento: 'trifásico',
    inversorAtual: { PotenciaAtivaNomCA: 10, PotenciaMaxCC: 13.8 } }).atualSuporta, false);
});

test('reproduz todos os cenários, preserva saldo antigo na expansão e separa economias', () => {
  const r = simular();
  assert.deepEqual(r.cenarios.map(c => [arred(c.injetado), arred(c.compensado), arred(c.semCompensacao), c.total]), [
    [239, 769.19, 641.23, 1440.59],
    [239, 239, 1171.42, 1853.06],
    [509.22, 1039.41, 371.01, 1230.37],
    [509.22, 509.22, 901.20, 1642.84],
    [1427.09, 1410.42, 0, 955.89],
    [1427.09, 1410.42, 0, 955.89],
    [0, 0, 1410.42, 2039]
  ]);
  assert.deepEqual(r.economiaComCreditos, { contaReferencia: 1440.59, contaExpansao: 955.89, valor: 484.70 });
  assert.deepEqual(r.economiaSemCreditos, { contaReferencia: 1853.06, contaExpansao: 955.89, valor: 897.17 });
  assert.equal(r.valorCreditosUsados, 412.47);
  assert.equal(arred(r.cenarios[4].creditoNovo), 16.67);
  assert.equal(r.cenarios[4].creditoUsado, 0);
  assert.equal(arred(r.cenarios[4].saldoInicial), 530.19);
  assert.equal(r.cenarios[4].saldoInicialConfirmado, false);
  assert.match(r.premissas.join(' '), /extrato SCEE/);
  const sem = r.cenarios[1].linhas;
  const valorDasLinhas = tipos => arred(sem.filter(i => tipos.includes(i.tipo)).reduce((a, i) => a + i.valor, 0));
  assert.equal(valorDasLinhas(['consumo']), 1492.15);
  assert.equal(valorDasLinhas(['bandeira']), 22.69);
  assert.equal(valorDasLinhas(['gd2', 'sceeBruto', 'sceeLiquido']), 126.02);
  assert.equal(arred((273.39 + 497.05 - 364.86) / kwhObservados, 6), 0.527282);
  const sim = Object.fromEntries(r.cenarios[4].linhas.map(i => [i.tipo, i]));
  assert.equal(sim.gd2.valor, 501.30);
  assert.equal(sim.sceeBruto.quantidade, null);
  assert.equal(arred(sim.sceeBruto.valor + sim.sceeLiquido.valor), 242.39);
  assert.equal(sim.injecao.icms, -249.17);
});

test('autoconsumo, ausência de SCEE, piso e crédito incerto em ciclo futuro', () => {
  const sem = { consumoFaturado: 100, injetadoNoCiclo: 0, consumoCompensado: 0,
    total: 100, saldoInicialElegivel: 0 };
  const nova = simular({ fatura: sem, tarifas: { faixasConsumo: [{ precoComTributos: 1 }],
    bandeiras: [{ precoComTributos: 0 }], pisoDisponibilidade: 50 },
  recuperacaoMensal: 0, geracaoNova: 75, fracaoAutoconsumoNova: 1, autoconsumoOriginal: 10 });
  assert.equal(nova.cenarios[4].rede, 25);
  assert.equal(nova.cenarios[4].injetado, 0);
  assert.equal(nova.cenarios[4].total, 50);
  assert.equal(nova.cenarios[6].total, 110);
  const futuro = simular({ futuro: true });
  assert.equal(futuro.cenarios[0].total, null);
  assert.equal(futuro.cenarios[4].total, 955.89);
  assert.equal(futuro.economiaComCreditos.valor, null);
});

test('compara o Fio B por vigência e rejeita intervalo sem referência', () => {
  const inicio = '2026-10-01';
  const fim = '2026-10-31';
  const subclasse = 'Residencial';
  const modalidade = 'Convencional';
  const p = { inicio, fim, subclasse, modalidade,
    vigencias: [{ inicio: '2026-09-18', fim: '2027-08-06', subclasse, modalidade, tarifa: 0.379352320561 }],
    percentuais: { 2026: 0.6, 2027: 0.75 }, cobrado: 0.260931,
    kwhCompensados: 1410.42, precoComTributos: 0.355426 };
  const referencia = calc.compararFioB(p);
  assert.equal(referencia.comparavel, true);
  assert.equal(arred(referencia.previsto, 6), 0.227611);
  assert.equal(arred(referencia.diferencaPct, 1), 14.6);
  assert.equal(arred(referencia.diferencaReais, 0), 47);
  assert.equal(arred(referencia.diferencaReaisComTributos, 0), 64);
  assert.equal(calc.compararFioB({ ...p, inicio: '2026-09-17' }).comparavel, false);
  assert.equal(calc.compararFioB({ ...p, subclasse: 'Desconto Social' }).comparavel, false);
  const anterior = { inicio: '2025-09-18', fim: '2026-09-17', subclasse, modalidade, tarifa: 0.40 };
  const cruzado = calc.compararFioB({ ...p, inicio: '2026-09-17', fim: '2026-09-19',
    vigencias: [anterior, ...p.vigencias] });
  assert.equal(cruzado.comparavel, true);
  assert.equal(arred(cruzado.previsto, 6), 0.233806);
  assert.equal(arred(calc.projetarTarifaGD2(0.260931, 0.6, 0.75), 6), 0.326164);
});

test('transforma rubricas revisadas em tarifas e mantém lacunas de classe social explícitas', () => {
  const f = { ...fatura, modalidade: 'Convencional', subclasse: 'Residencial', itens: [
    { tipo: 'consumo', descricao: 'Consumo', quantidade: 641.23, precoComTributos: 1.1, valor: 705.35 },
    { tipo: 'consumoCompensado', descricao: 'Consumo compensado', quantidade: 769.19, valor: 715.23 },
    { tipo: 'energiaInjetada', quantidade: 239, valor: -222.23 },
    { tipo: 'creditoAnterior', quantidade: 530.19, valor: -493.00 },
    { tipo: 'bandeira', descricao: 'Bandeira tarifária', quantidade: 641.23, valor: 12.42 },
    ...fatura.itens.filter(i => ['gd2', 'sceeBruto', 'sceeLiquido'].includes(i.tipo))
  ] };
  const lidas = calc.tarifasDaFatura(f, { regimeAtual: 'GD II' });
  assert.equal(lidas.faixasConsumo[0].precoComTributos, 1.1);
  assert.equal(arred(lidas.bandeiras[0].valorPorKWh, 6), 0.019369);
  assert.equal(lidas.porRegime['GD II'].length, 5);
  assert.equal(simular({ fatura: f, tarifas: lidas }).cenarios[4].total, 955.89);
  assert.deepEqual(calc.tarifasDaFatura({ ...f, subclasse: 'Desconto social' }).faixasConsumo, []);
});

test('compara classificação genérica de Desconto Social apenas quando as faixas oficiais concordam', () => {
  const periodo = { inicio: '2026-09-18', fim: '2027-08-06', tarifa: 0.379352320561,
    modalidade: 'Convencional', resolucao: 'REH 3608' };
  const p = { inicio: '2026-10-01', fim: '2026-10-31', subclasse: 'Desconto Social',
    modalidade: 'Convencional', cobrado: 0.260931, percentuais: { 2026: 0.60 } };
  const faixa1 = { ...periodo, subclasse: 'Residencial Desconto Social – faixa 01' };
  const faixa2 = { ...periodo, subclasse: 'Residencial Desconto Social – faixa 02' };
  assert.equal(arred(calc.compararFioB({ ...p, vigencias: [faixa1, faixa2] }).diferencaPct, 1), 14.6);
  assert.equal(calc.compararFioB({ ...p, vigencias: [faixa1, { ...faixa2, tarifa: 0.3 }] }).comparavel, false);
});
