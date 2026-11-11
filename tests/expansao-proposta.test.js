'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { calcular } = require('../js/expansao-proposta.js');

function dados() {
  const fatura = {
    referencia: '2026-10', dataLeituraAnterior: '2026-10-01', dataLeituraAtual: '2026-10-31',
    subgrupo: 'B1', subclasse: 'Desconto Social', modalidade: 'Convencional', tipoFornecimento: 'Trifásico',
    consumoFaturado: 1410.42, consumoCompensado: 769.19, consumoSemCompensacao: 641.23,
    creditosAntigosNasLinhas: 530.17, injetadoNoCiclo: 239, total: 1440.59,
    tarifaGD2SemTributos: 0.260931, tarifaGD2ComTributos: 0.355426, aliquotaICMS: 18,
    itens: [{ tipo: 'gd2', quantidade: 769.19, valor: 273.39 }],
    itensFinanceiros: [{ tipo: 'financeiro', descricao: 'Itens financeiros do caso de teste', valor: 212.20 }]
  };
  const usinaAtual = {
    modulosAtuais: [{ qtd: 10, wp: 500 }], geracaoReal: 7297.78, geracaoPrevista: 10000,
    periodoInicio: '2026-01-01', periodoFim: '2026-10-31'
  };
  const expansao = {
    wp: 620, produtividade: 113.88, meta: 'ciclo',
    tarifasRevisadas: {
      faixasConsumo: [{ kwhFaixa: 120, precoComTributos: 1.167917 }, { precoComTributos: 1.285881 }],
      bandeiras: [{ descricao: 'Bandeira tarifária', precoComTributos: 27.32 / 1410.42 }],
      porRegime: { 'GD II': [
        { tipo: 'gd2', descricao: 'Parcela GD II', tarifaSemTributos: 0.260931, precoComTributos: 0.355426 },
        { tipo: 'sceeBruto', descricao: 'Benefício bruto SCEE', valorPorKWh: 497.05 / 769.19 },
        { tipo: 'sceeLiquido', descricao: 'Benefício líquido SCEE', valorPorKWh: 364.86 / 769.19, sinal: -1 }
      ] }
    }
  };
  const vigencia = {
    inicio: '2026-09-18', fim: '2027-08-06', modalidade: 'Convencional', posto: 'Não se aplica',
    tarifa: 0.379352320561, resolucao: 'REH 3608'
  };
  const config = {
    fiob: { fonte: 'Lei 14.300/2022', percentuais: { 2026: 0.6, 2027: 0.75 } },
    tarifas: {
      vigencias: [1, 2].map(i => ({ ...vigencia, subclasse: 'Residencial Desconto Social – faixa 0' + i })),
      observacoes: {}
    }
  };
  const catalogo = [{ PotenciaAtivaNomCA: 10, Fases: 'Trifásico' }, { PotenciaAtivaNomCA: 12, Fases: 'Trifásico' }];
  return { fatura, usinaAtual, expansao, config, catalogo };
}

const arred = (n, casas = 2) => Number(n.toFixed(casas));

test('calcula o ciclo da referência a partir da fatura revisada e prepara o snapshot', () => {
  const p = dados();
  const r = calcular(p);
  assert.equal(r.recuperacao.meses, 10);
  assert.equal(arred(r.recuperacao.recuperacaoMensal), 270.22);
  assert.equal(r.dimensionamento.placasNovas, 13);
  assert.equal(r.resumo.KwpAdicional, 8.06);
  assert.equal(r.resumo.EconomiaComCreditos, 484.70);
  assert.equal(r.resumo.EconomiaSemCreditos, 897.17);
  assert.equal(r.resumo.InversorSugeridoKW, 10);
  assert.equal(arred(r.comparacaoFioB.diferencaPct, 1), 14.6);
  assert.equal(arred(r.comparacaoFioB.diferencaReais), 25.63);
  assert.equal(r.comparacaoFioB.homologada, false);
  assert.equal(calcular({ ...p, config: { ...p.config, homologacaoFioB: true } }).comparacaoFioB.homologada, true);
  assert.equal(r.geracao.AnoFioB, 2026);
  assert.equal(r.geracao.PercentualFioBGD2, 0.6);
  assert.equal(r.geracao.OrigemTributos.ICMS, 'fatura lida');
  assert.deepEqual(r.geracao.ParametrosTarifarios.comparacaoFioB, r.comparacaoFioB);
  p.expansao.tarifasRevisadas.porRegime['GD II'][0].precoComTributos = 10;
  assert.equal(r.geracao.ParametrosTarifarios.tarifas.porRegime['GD II'][0].precoComTributos, 0.355426);
});

test('projeta GD II pela observação equivalente mais recente, sem alterar o valor do ciclo da fatura', () => {
  const p = dados();
  p.config.tarifas.observacoes = {
    'Desconto Social | Convencional': {
      tarifaGD2: { referencia: '2026-11', valor: 0.28 },
      icmsPct: { referencia: '2026-11', valor: 20 }
    },
    'Residencial | Convencional': { tarifaGD2: { referencia: '2026-12', valor: 0.9 } },
    'Desconto Social | Branca': { tarifaGD2: { referencia: '2026-12', valor: 0.8 } }
  };
  const r = calcular(p);
  assert.equal(r.resumo.EconomiaComCreditos, 484.70);
  assert.match(r.simulacao.premissas.join(' '), /GD II sem tributos mudou depois da fatura/);
  assert.equal(r.geracao.AliquotaICMS, 18);

  p.expansao.referenciaFutura = '2027-01';
  p.expansao.saldoElegivelFuturo = 700;
  const futura = calcular(p);
  const foto = futura.geracao.ParametrosTarifarios;
  assert.equal(futura.geracao.AnoFioB, 2027);
  assert.equal(futura.geracao.PercentualFioBGD2, 0.75);
  assert.equal(foto.projecaoGD2.referenciaObservada, '2026-11');
  assert.equal(arred(foto.projecaoGD2.valorProjetado, 6), 0.35);
  assert.equal(futura.comparacaoFioB.cobrado, 0.260931);
  assert.equal(futura.simulacao.cenarios[0].saldoInicial, 700);
  assert.equal(p.expansao.tarifasRevisadas.porRegime['GD II'][0].tarifaSemTributos, 0.260931);
});

test('projeção exige vigência, rejeita mês inválido e preserva a lacuna de créditos', () => {
  const p = dados();
  p.expansao.referenciaFutura = '2027-01';
  const r = calcular(p);
  assert.equal(arred(r.geracao.ParametrosTarifarios.projecaoGD2.valorProjetado, 6), 0.326164);
  assert.equal(r.simulacao.cenarios[0].saldoInicial, null);
  assert.equal(r.simulacao.cenarios[0].total, null);
  p.expansao.referenciaFutura = '2027-09';
  const semVigencia = calcular(p);
  assert.equal(semVigencia.geracao.ParametrosTarifarios.projecaoGD2, null);
  assert.equal(semVigencia.resumo.EconomiaSemCreditos, null);
  assert.match(semVigencia.simulacao.premissas.join(' '), /Faltam tarifa GD II observada equivalente/);
  p.expansao.referenciaFutura = '2026-10';
  assert.throws(() => calcular(p), /mês de projeção posterior/);
});

test('reaproveita só observação da mesma competência para preencher tributo ausente', () => {
  const p = dados();
  p.config.tarifas.observacoes = { 'Desconto Social | Convencional': {
    pisPct: { referencia: '2026-10', valor: 0.8 }, cofinsPct: { referencia: '2026-09', valor: 3.1 }
  } };
  const { geracao } = calcular(p);
  assert.equal(geracao.AliquotaPIS, 0.8);
  assert.equal(geracao.OrigemTributos.PIS, 'fatura observada de 2026-10');
  assert.equal(geracao.AliquotaCofins, null);
});

test('período parcial, residual condicional e recuperação dispensada', () => {
  const p = dados();
  p.usinaAtual.periodoInicio = '2026-10-16';
  p.expansao.residualDesejado = null;
  assert.equal(arred(calcular(p).recuperacao.meses, 5), 0.51613);
  p.usinaAtual.considerarRecuperacao = false;
  const r = calcular(p);
  assert.equal(r.recuperacao, null);
  assert.equal(arred(r.dimensionamento.residual), 1171.42);
  p.expansao.meta = 'residual';
  assert.throws(() => calcular(p), /residual desejado/);
  p.expansao.residualDesejado = 150;
  assert.equal(arred(calcular(p).dimensionamento.residual), 1021.42);
});
