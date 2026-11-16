'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const calc = require('../js/analise-fatura-calculo.js');

const perto = (real, esperado, tolerancia, rotulo) =>
  assert.ok(Math.abs(real - esperado) <= tolerancia, `${rotulo || ''} esperado ${esperado}, veio ${real}`);

const { faturas, montarTexto, excluir } = require('./analise-fatura.fixture.js');

const periodo = calc.periodoParaColar(faturas);
const colado = calc.lerGeracaoColada(montarTexto(), periodo);
const ciclos = calc.analisarCiclos(faturas, { dias: colado.dias, modo: 'geracao', excluir });

test('período a colar cobre as três faturas por ciclo de leitura', () => {
  assert.equal(periodo.inicio, '2026-08-08');
  assert.equal(periodo.fim, '2026-11-10');
  assert.equal(periodo.dias, 95);
  assert.deepEqual(periodo.ciclos.map(c => c.dias), [32, 30, 33]);
  assert.equal(periodo.ciclos[0].referencia, '2026-09');
});

test('período ordena as faturas pela leitura', () => {
  assert.equal(calc.periodoParaColar([...faturas].reverse()).inicio, '2026-08-08');
});

test('lerGeracaoColada lê vírgula decimal, kWh, sem dado e ignora o cabeçalho', () => {
  const lido = calc.lerGeracaoColada('Dia\tGerado\tPrognóstico\tVariação\n01/11\t27,80 kWh\t36,90 kWh\t-9,10 kWh\n01/09\tsem dado\t38,26 kWh\t—\nlixo',
    { inicio: '2026-08-08', fim: '2026-11-10' });
  assert.deepEqual(lido.dias, [
    { data: '2026-09-01', gerado: null, previsto: 38.26 },
    { data: '2026-11-01', gerado: 27.8, previsto: 36.9 }
  ]);
  assert.deepEqual(lido.avisos, []);
});

test('lerGeracaoColada aceita DD/MM/AAAA e separação por espaços', () => {
  const lido = calc.lerGeracaoColada('05/03/2025    10,5 kWh    12,0 kWh    -1,5 kWh');
  assert.deepEqual(lido.dias, [{ data: '2025-03-05', gerado: 10.5, previsto: 12 }]);
});

test('lerGeracaoColada: linha repetida, a última vence, com aviso', () => {
  const lido = calc.lerGeracaoColada('01/11\t10,00 kWh\t30,00 kWh\n01/11\t20,00 kWh\t30,00 kWh', { inicio: '2026-10-09', fim: '2026-11-10' });
  assert.equal(lido.dias.length, 1);
  assert.equal(lido.dias[0].gerado, 20);
  assert.deepEqual(lido.avisos, [{ codigo: 'repetido', data: '2026-11-01' }]);
});

test('lerGeracaoColada infere o ano na virada de dezembro para janeiro', () => {
  const lido = calc.lerGeracaoColada('28/12\t10,00 kWh\t30,00 kWh\n02/01\t11,00 kWh\t30,00 kWh\n20/12\t9,00 kWh\t30,00 kWh',
    { inicio: '2026-12-20', fim: '2027-01-10' });
  assert.deepEqual(lido.dias.map(d => d.data), ['2026-12-20', '2026-12-28', '2027-01-02']);
});

test('lerGeracaoColada lê o texto de referência inteiro', () => {
  assert.equal(colado.dias.length, 31 + 30 + 31 + 16);
  assert.equal(colado.dias.find(d => d.data === '2026-09-04').gerado, 60);
});

test('ciclos do caso real: datas, dias e dias válidos', () => {
  assert.deepEqual(ciclos.map(c => [c.inicio, c.fim, c.dias]),
    [['2026-08-08', '2026-09-08', 32], ['2026-09-09', '2026-10-08', 30], ['2026-10-09', '2026-11-10', 33]]);
  assert.deepEqual(ciclos.map(c => c.diasValidos), [20, 29, 33]);
  assert.deepEqual(ciclos.map(c => c.estimada), [true, true, false]);
});

test('o dia de acúmulo vira aviso e fica fora da média', () => {
  const acumulo = ciclos[0].avisos.filter(a => a.codigo === 'acumulo');
  assert.deepEqual(acumulo, [{ codigo: 'acumulo', data: '2026-09-04', gerado: 60, previsto: 38.26 }]);
});

test('geração, desempenho, autoconsumo e casa por dia', () => {
  perto(ciclos[0].geracao, 1096, 1, 'geração 09');
  perto(ciclos[1].geracao, 963.0, 1, 'geração 10');
  perto(ciclos[2].geracao, 965.5, 1, 'geração 11');
  perto(ciclos[0].desempenho, 0.91, 0.005, 'desempenho 09');
  perto(ciclos[1].desempenho, 0.843, 0.005, 'desempenho 10');
  perto(ciclos[2].desempenho, 0.783, 0.005, 'desempenho 11');
  perto(ciclos[0].autoconsumo, 325, 1);
  perto(ciclos[1].autoconsumo, 338, 1);
  perto(ciclos[2].autoconsumo, 336.5, 1);
  perto(ciclos[0].porDia.casa, 32.2, 0.1);
  perto(ciclos[1].porDia.casa, 35.4, 0.1);
  perto(ciclos[2].porDia.casa, 35.8, 0.1);
});

test('o dia em "excluir" fica fora mesmo quando está no ciclo', () => {
  const sem = calc.analisarCiclos([faturas[2]], { dias: colado.dias, modo: 'geracao', excluir: ['2026-11-10'] });
  assert.equal(sem[0].diasValidos, 32);
  assert.equal(sem[0].estimada, true);
});

test('composição fecha com o total', () => {
  const c11 = calc.composicao(faturas[2]);
  perto(c11.energiaCompensada, 344.46, 0.005);
  perto(c11.semCompensacao, 79.60, 0.005);
  perto(c11.cip, 141.88, 0.005);
  perto(c11.atraso, 13.42, 0.005);
  assert.equal(c11.bandeira, 0);
  const c09 = calc.composicao(faturas[0]);
  perto(c09.energiaCompensada, 291.51, 0.005);
  perto(c09.atraso, 8.40, 0.005);
  perto(c09.bandeira, 1.20, 0.005);
  for (const f of faturas) perto(calc.composicao(f).outros, 0, 0.05, 'outros');
});

test('preços por kWh', () => {
  const p09 = calc.precos(faturas[0]), p11 = calc.precos(faturas[2]);
  perto(p09.kwhCompensado, 0.4206, 0.0001);
  perto(p11.kwhCompensado, 0.4488, 0.0001);
  perto(p09.cipPorKwh, 0.1376, 0.0001);
  perto(p11.cipPorKwh, 0.1679, 0.0001);
  assert.equal(p09.kwhSemCredito, null);
  assert.equal(p11.kwhSemCredito, 1.350297);
});

test('dividirAumento de 09 para 11', () => {
  const r = calc.dividirAumento({ fatura: faturas[0], ciclo: ciclos[0] }, { fatura: faturas[2], ciclo: ciclos[2] });
  perto(r.consumo, 83.61, 0.02);
  perto(r.geracao, 46.43, 0.02);
  perto(r.tarifa, 47.27, 0.02);
  perto(r.atraso, 5.02, 0.02);
  perto(r.bandeira, -1.20, 0.02);
  perto(r.total, 181.13, 0.02);
  perto(r.kwh.geracao, 165, 1);
  perto(r.kwh.consumo, 118, 1);
  perto(r.consumo + r.geracao + r.tarifa + r.atraso + r.bandeira + r.outros, r.total, 0.02);
});

test('dividirAumento sem dado de geração joga tudo para consumo', () => {
  const r = calc.dividirAumento({ fatura: faturas[0] }, { fatura: faturas[2] });
  assert.equal(r.geracao, 0);
  perto(r.consumo + r.tarifa + r.atraso + r.bandeira + r.outros, r.total, 0.02);
});

test('cenário com geração a 100% do previsto', () => {
  const c = calc.cenario100(faturas, ciclos, { saldoInicial: 145.17 });
  perto(c[0].sobra, 186, 1);
  perto(c[1].sobra, 95, 1);
  perto(c[2].sobra, 71, 1);
  perto(c[2].minimoPrevisto, 0.943, 0.005);
  perto(c[0].creditos, 331, 1);
  perto(c[1].creditos, 426, 1);
  perto(c[2].creditos, 497, 1);
  perto(c[2].faturaEstimadaSemAtraso, 512.79, 0.3);
  perto(c[2].faturaEstimadaComAtraso, 512.79 + 13.42, 0.3);
  perto(c[0].sobraReal, 77.89, 0.01);
});

test('cenário deduz o saldo inicial pela primeira fatura quando ele não vem', () => {
  const c = calc.cenario100(faturas, ciclos);
  perto(c[0].creditos, 145.17 + c[0].sobra, 0.01);
});

test('modo desempenho usa kwp e produtividade do mês de cada dia', () => {
  const produtividade = Array(12).fill(100); // 100 kWh/kWp por mês
  const [c] = calc.analisarCiclos([faturas[1]], { modo: 'desempenho', desempenhos: [0.8], kwp: 10, produtividadeMensal: produtividade });
  // 22 dias de setembro (30) e 8 dias de outubro (31): 1000/30 e 1000/31 por dia
  const previsto = 22 * 1000 / 30 + 8 * 1000 / 31;
  perto(c.previstoCiclo, previsto, 0.001);
  perto(c.geracao, 0.8 * previsto, 0.001);
  assert.equal(c.estimada, true);
  perto(c.autoconsumo, 0.8 * previsto - 625, 0.001);
  perto(c.casa, 723 + c.autoconsumo, 0.001);
  perto(c.desempenho, 0.8, 1e-9);
});

test('modo semSolar não tem geração, autoconsumo nem desempenho', () => {
  const [c] = calc.analisarCiclos([faturas[2]], { modo: 'semSolar' });
  assert.equal(c.geracao, 0);
  assert.equal(c.desempenho, null);
  assert.equal(c.autoconsumo, 0);
  assert.equal(c.casa, 845);
});

test('dividirAumento em semSolar fecha com o total', () => {
  const semSolar = (fatura, kwh, consumoValor, cip, total) => ({
    ...fatura, consumoMedido: kwh, consumoCompensado: 0, consumoSemCompensacao: kwh, injetadoNoCiclo: 0, total,
    itens: [{ tipo: 'consumo', valor: consumoValor, quantidade: kwh }, { tipo: 'cip', valor: cip }]
  });
  const b = semSolar(faturas[0], 500, 600, 50, 650), c = semSolar(faturas[2], 600, 780, 70, 850);
  const [cb, cc] = calc.analisarCiclos([b, c], { modo: 'semSolar' });
  const r = calc.dividirAumento({ fatura: b, ciclo: cb }, { fatura: c, ciclo: cc });
  perto(r.total, 200, 0.001);
  perto(r.consumo + r.tarifa + r.atraso + r.bandeira + r.outros, 200, 0.02);
  assert.equal(r.geracao, 0);
});
