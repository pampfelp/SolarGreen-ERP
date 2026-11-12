'use strict';

// Referência GD II para faturas sem a parcela GD II (usina GD I ou sem SCEE).
// Valores da fatura de exemplo da skill (Equatorial Pará, out/2026); dados sintéticos de cliente.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');
const calc = require('../js/expansao-calculo.js');
const proposta = require('../js/expansao-proposta.js');

const arred = (n, casas = 2) => Number(n.toFixed(casas));
const referencia = {
  referencia: '2026-10', tarifaSemTributos: 0.260931, precoComTributos: 0.355426,
  pisCofinsPorKWh: 8.95 / 1410.42, icmsPorKWh: 124.38 / 1410.42, fonte: 'Fatura de 10/2026, proposta EXP-1'
};

test('extrai a referência da linha GD II e recusa linhas ambíguas', () => {
  const f = { referencia: '2026-10', subclasse: 'desconto social', modalidade: 'convencional', itens: [
    { tipo: 'gd2', quantidade: 769.19, precoComTributos: 0.355426, tarifaSemTributos: 0.260931,
      pisCofins: 4.88, icms: 67.81, valor: 273.39 }
  ] };
  const r = calc.referenciaGD2DaFatura(f);
  assert.equal(r.referencia, '2026-10');
  assert.equal(r.tarifaSemTributos, 0.260931);
  assert.equal(r.precoComTributos, 0.355426);
  assert.equal(arred(r.icmsPorKWh, 6), arred(67.81 / 769.19, 6));
  assert.equal(calc.referenciaGD2DaFatura({ ...f, itens: [] }), null);
  assert.equal(calc.referenciaGD2DaFatura({ ...f, itens: [...f.itens, { ...f.itens[0], tarifaSemTributos: 0.3 }] }), null);
  assert.equal(calc.referenciaGD2DaFatura({ ...f, referencia: null }), null);
});

test('reproduz o atalho da skill: R$ 955,80 com compensação integral e bruto de R$ 497,03', () => {
  const compensado = { precoComTributos: 0.929835, tarifaSemTributos: 0.735307,
    pisCofinsPorKWh: 25.21 / 1410.42, icmsPorKWh: 249.17 / 1410.42 };
  const regras = calc.rubricasGD2DaReferencia({ referencia, compensado });
  const integral = calc.montarFaturaSimulada({ semCompensacao: 0, compensadoPorRegime: { 'GD II': 1410.42 } },
    { porRegime: { 'GD II': regras } }, [{ tipo: 'financeiro', valor: 212.20 }]);
  assert.equal(integral.total, 955.80);
  const linhas = Object.fromEntries(integral.linhas.map(l => [l.tipo, l]));
  assert.equal(linhas.gd2.valor, 501.30);
  assert.equal(linhas.sceeBruto.pisCofins, 16.26);
  const original = calc.montarFaturaSimulada({ semCompensacao: 0, compensadoPorRegime: { 'GD II': 769.19 } },
    { porRegime: { 'GD II': regras } });
  assert.equal(original.linhas.find(l => l.tipo === 'sceeBruto').valor, 497.03);
  assert.equal(calc.rubricasGD2DaReferencia({ referencia, compensado: null }), null);
  assert.equal(calc.rubricasGD2DaReferencia({ referencia, compensado: { ...compensado, tarifaSemTributos: 0.2 } }), null);
});

const faturaGD1 = () => ({
  referencia: '2026-10', modalidade: 'convencional', subclasse: 'residencial', total: 702,
  consumoFaturado: 1000, consumoMedido: 1200, injetadoNoCiclo: 300, consumoCompensado: 500,
  consumoSemCompensacao: 500, creditosAntigosNasLinhas: 200, itens: [
    { tipo: 'consumo', quantidade: 500, precoComTributos: 1.2, tarifaSemTributos: 0.95, pisCofins: 11.86, icms: 114, valor: 600 },
    { tipo: 'consumoCompensado', quantidade: 500, precoComTributos: 1.2, tarifaSemTributos: 0.95, valor: 600 },
    { tipo: 'energiaInjetada', quantidade: 300, precoComTributos: 1.2, valor: -360 },
    { tipo: 'creditoAnterior', quantidade: 200, precoComTributos: 1.2, valor: -240 },
    { tipo: 'bandeira', valor: 13 }, { tipo: 'cip', valor: 89 }
  ]
});
const calcular = (mais = {}) => proposta.calcular({
  fatura: faturaGD1(), usinaAtual: { kwpAtual: 4, wpAtual: 400, considerarRecuperacao: false },
  expansao: { meta: 'ciclo', wp: 620, produtividade: 119.23, fracaoUtil: 1, regimeExpansao: 'GD II' },
  config: { potenciasInversorKW: [5, 8, 10], referenciaGD2: referencia, fiob: { percentuais: { 2026: 0.6, 2027: 0.75 } } },
  catalogo: [], ...mais
});

test('usina GD I: deduz o enquadramento e calcula as duas economias com a referência', () => {
  const r = calcular();
  // (1.000 − 300) kWh ÷ 119,23 ÷ 0,62 kWp = 9,47 → 10 placas
  assert.equal(r.resumo.PlacasNovas, 10);
  assert.equal(Number.isFinite(r.resumo.EconomiaComCreditos), true);
  assert.equal(Number.isFinite(r.resumo.EconomiaSemCreditos), true);
  const premissas = r.simulacao.premissas.join(' ');
  assert.match(premissas, /tratada como GD I/);
  assert.match(premissas, /referência de 2026-10/);
  assert.equal(r.geracao.ParametrosTarifarios.referenciaGD2.fator, 1);
  // A conta atual da usina GD I não usa a referência: só a expansão em GD II.
  const atual = r.simulacao.cenarios.find(c => c.nome === 'atualSem');
  assert.equal(atual.linhas.some(l => l.tipo === 'gd2'), false);
  const exp = r.simulacao.cenarios.find(c => c.nome === 'expansaoSem');
  const gd2 = exp.linhas.find(l => l.tipo === 'gd2');
  assert.equal(gd2.tarifaSemTributos, 0.260931);
});

test('sem referência a economia fica pendente e a premissa diz o que falta', () => {
  const r = calcular({ config: { potenciasInversorKW: [5, 8, 10] } });
  assert.equal(r.resumo.EconomiaSemCreditos, null);
  assert.match(r.simulacao.premissas.join(' '), /Sem referência GD II salva/);
});

test('ciclo de outro ano ajusta a referência pelo percentual do Fio B', () => {
  const r = calcular({ expansao: { meta: 'ciclo', wp: 620, produtividade: 119.23, fracaoUtil: 1,
    regimeExpansao: 'GD II', referenciaFutura: '2027-03', saldoElegivelFuturo: 0 } });
  const usada = r.geracao.ParametrosTarifarios.referenciaGD2;
  assert.equal(usada.fator, 1.25);
  const gd2 = r.simulacao.cenarios.find(c => c.nome === 'expansaoSem').linhas.find(l => l.tipo === 'gd2');
  assert.equal(arred(gd2.tarifaSemTributos, 6), 0.326164);
  const semPercentual = calcular({ config: { referenciaGD2: referencia, fiob: {} },
    expansao: { meta: 'ciclo', wp: 620, produtividade: 119.23, fracaoUtil: 1, regimeExpansao: 'GD II',
      referenciaFutura: '2027-03', saldoElegivelFuturo: 0 } });
  assert.match(semPercentual.simulacao.premissas.join(' '), /Falta o percentual do Fio B/);
});

test('fatura com a parcela GD II continua usando a própria tarifa', () => {
  const f = faturaGD1();
  f.itens.push({ tipo: 'gd2', quantidade: 500, precoComTributos: 0.4, tarifaSemTributos: 0.3, valor: 200 });
  const r = proposta.calcular({ fatura: f, usinaAtual: { kwpAtual: 4, wpAtual: 400, considerarRecuperacao: false, regimeAtual: 'GD II' },
    expansao: { meta: 'ciclo', wp: 620, produtividade: 119.23, fracaoUtil: 1, regimeExpansao: 'GD II' },
    config: { referenciaGD2: referencia }, catalogo: [] });
  assert.equal(r.geracao.ParametrosTarifarios.referenciaGD2, null);
});

function routerComMemoria() {
  const docs = new Map();
  let agora = 0;
  const colecao = nome => ({
    doc(id = nome + '-' + docs.size) {
      const chave = nome + '/' + id;
      return { chave, get: async () => ({ exists: docs.has(chave), data: () => docs.get(chave) }) };
    }
  });
  const firestore = () => ({
    collection: colecao,
    async runTransaction(executar) {
      return executar({
        get: async ref => ({ exists: docs.has(ref.chave), data: () => docs.get(ref.chave) }),
        set: (ref, doc) => docs.set(ref.chave, doc)
      });
    }
  });
  firestore.FieldValue = { serverTimestamp: () => ++agora };
  const window = { SGFireReady: Promise.resolve() };
  runInNewContext(readFileSync(join(__dirname, '../js/firestore-router.js'), 'utf8'),
    { window, firebase: { auth: () => ({ currentUser: { uid: 'equipe-a' } }), firestore } });
  return { api: window.SGFireActions, docs };
}

test('grava a referência da fatura só quando é nova ou mudou, e guarda histórico', async () => {
  const { api, docs } = routerComMemoria();
  const historico = () => [...docs.keys()].filter(k => k.startsWith('expansao_referencias_historico/')).length;
  const salvar = (r, origem = 'fatura') => api.salvarReferenciaGD2({ referencia: r, origem, nomeUsuario: 'Equipe' });

  assert.equal((await salvar(referencia)).alterada, true);
  assert.equal(docs.get('expansao_referencias/gd2').TarifaSemTributos, 0.260931);
  assert.equal((await salvar(referencia)).alterada, false);
  assert.equal((await salvar({ ...referencia, referencia: '2026-09', tarifaSemTributos: 0.2 })).alterada, false);
  assert.equal((await salvar({ ...referencia, referencia: '2026-11', tarifaSemTributos: 0.27 })).alterada, true);
  assert.equal(docs.get('expansao_referencias/gd2').Referencia, '2026-11');
  assert.equal((await salvar({ ...referencia, referencia: '2026-08', fonte: 'Conferido à mão' }, 'manual')).alterada, true);
  assert.equal(docs.get('expansao_referencias/gd2').Origem, 'manual');
  assert.equal(historico(), 3);
  const ultimo = docs.get('expansao_referencias_historico/expansao_referencias_historico-' + 3)
    || [...docs.entries()].filter(([k]) => k.startsWith('expansao_referencias_historico/')).at(-1)[1];
  assert.equal(ultimo.Anterior.Referencia, '2026-11');
  assert.equal((await salvar({ ...referencia, fonte: '' })).ok, false);
  assert.equal((await salvar({ ...referencia, precoComTributos: 0.1 })).ok, false);
});
