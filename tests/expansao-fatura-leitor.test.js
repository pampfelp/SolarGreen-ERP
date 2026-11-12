const assert = require('node:assert/strict');
const { test } = require('node:test');
const { lerFatura, lerTextoPosicional } = require('../js/expansao-fatura-leitor.js');

// Dados e coordenadas sintéticos. As faturas reais serão usadas na homologação.
const cabecalho = [
  ['Equatorial Pará', 'Unidade Consumidora: 000000000'],
  ['Município: Belém / PA', 'CEP: 00000-000', 'Tipo de fornecimento: Bifásico'],
  ['Subgrupo: B1', 'Desconto Social', 'Convencional'],
  ['Referência: OUT/2026', 'Vencimento: 25/10/2026'],
  ['Leitura anterior: 18/09/2026', 'Leitura atual: 18/10/2026']
];
const colunas = ['Itens da fatura', 'Quant. (kWh)', 'Preço c/ tributos', 'Tarifa s/ tributos', 'PIS/Cofins (R$)', 'ICMS (R$)', 'Valor (R$)'];

function pagina(linhas) {
  return linhas.flatMap((linha, indice) => linha.flatMap((str, coluna) => str ? [{
    str, width: str.length * 3,
    transform: [6, 0, 0, 6, [10, 215, 285, 355, 425, 495, 565][coluna], 750 - indice * 13 + (coluna % 2)]
  }] : [])).reverse();
}

test('extrai fatura sintética com SCEE, créditos anteriores e encargos separados', () => {
  const exemplo = pagina([
    ...cabecalho,
    ['Consumo medido: 1.466 kWh', 'Injetado no ciclo: 239 kWh'],
    ['Energia compensada: 769,19 kWh'],
    ['Créditos anteriores usados: 530,19 kWh'],
    ['Créditos expirados: 0,00 kWh'],
    colunas,
    ['Consumo', '641,23', '1,000000', '0,800000', '12,00', '10,00', '641,23'],
    ['Consumo compensado', '769,19', '0,929835', '0,735307', '13,75', '135,89', '715,22'],
    ['Energia ativa injetada', '239,00', '0,929835', '0,735307', '−4,27', '−42,22', '−222,23'],
    ['Energia Inj. mUC 09/2026', '530,17', '0,929835', '0,735307', '−9,48', '−93,67', '−492,98'],
    ['Parc. Inj. s/ Desc. – GD II', '769,19', '0,355426', '0,260931', '4,88', '67,81', '273,39'],
    ['Benefício tarifário bruto SCEE', '', '', '', '8,87', '123,32', '497,05'],
    ['Itens financeiros'],
    ['Benefício tarifário líquido SCEE', '', '', '', '', '', '−364,86'],
    ['CIP – Iluminação pública', '', '', '', '', '', '120,00'],
    ['Juros de mora', '', '', '', '', '', '0,00'],
    ['Total a pagar: R$ 1.166,82'],
    ['Débitos anteriores: R$ 150,00']
  ]);
  const verso = pagina([
    ['Tributo', 'Base de cálculo', 'Alíquota', 'Valor'],
    ['ICMS', '1.000,00', '19,00%', '190,00'],
    ['PIS', '1.000,00', '0,40%', '4,00'],
    ['Cofins', '1.000,00', '1,40%', '14,00']
  ]);
  const lida = lerTextoPosicional([exemplo, verso]);
  assert.equal(lida.status, 'lido');
  assert.equal(lida.revisaoObrigatoria, true);
  assert.equal(lida.municipio, 'Belém');
  assert.equal(lida.cep, '00000-000');
  assert.equal(lida.tipoFornecimento, 'bifasico');
  assert.equal(lida.referencia, '2026-10');
  assert.equal(lida.dataLeituraAnterior, '2026-09-18');
  assert.equal(lida.consumoFaturado, 1410.42);
  assert.equal(lida.consumoMedido, 1466);
  assert.equal(lida.injetadoNoCiclo, 239);
  assert.equal(lida.creditosAntigosUsados, 530.19);
  assert.equal(lida.creditosAntigosNasLinhas, 530.17);
  assert.equal(lida.creditosExpirados, 0);
  assert.equal(lida.saldoDisponivel, null);
  assert.equal(lida.origem.saldoDisponivel, 'não encontrado');
  assert.equal(lida.total, 1166.82);
  assert.equal(lida.itens.length, 9);
  assert.equal(lida.itens.find(item => item.tipo === 'sceeBruto').icms, 123.32);
  assert.equal(lida.itens.find(item => item.tipo === 'sceeLiquido').valor, -364.86);
  assert.equal(lida.itensFinanceiros.length, 2);
  assert.equal(lida.itensFinanceiros.find(item => item.tipo === 'juros').eventual, true);
  assert.equal(lida.itensFinanceiros.some(item => item.tipo === 'sceeLiquido'), false);
  assert.equal(lida.avisosFinanceiros[0].noTotal, false);
  assert.equal(lida.tarifaGD2SemTributos, 0.260931);
  assert.equal(lida.aliquotaICMS, 19);
  assert.equal(lida.aliquotaPIS, 0.4);
  assert.equal(lida.aliquotaCofins, 1.4);
});

test('deduplica o kWh de TE/TUSD em uma fatura sintética sem uso de créditos anteriores', () => {
  const lida = lerTextoPosicional([pagina([
    ...cabecalho,
    ['Saldo atualizado: 100,00 kWh'],
    ['Créditos anteriores usados: 0 kWh'],
    ['Grandeza', 'Leitura anterior', 'Leitura atual', 'Const. medidor', 'Consumo (kWh)'],
    ['Consumo ativo', '1000', '1339', '1', '339,00'],
    ['Energia ativa injetada', '2000', '2239', '1'],
    ['', ...colunas.slice(1)],
    ['Consumo TE', '100,00', '', '', '', '', '50,00'],
    ['Consumo TUSD', '100,00', '', '', '', '', '50,00'],
    ['Consumo Compensado TE', '239,00', '', '', '', '', '119,50'],
    ['Consumo Compensado TUSD', '239,00', '', '', '', '', '119,50'],
    ['Energia ativa injetada TE', '239,00', '', '', '', '', '−119,50'],
    ['Energia ativa injetada TUSD', '239,00', '', '', '', '', '−119,50'],
    ['Total da fatura: 100,00']
  ])]);
  assert.equal(lida.consumoFaturado, 339);
  assert.equal(lida.consumoMedido, 339);
  assert.equal(lida.injetadoNoCiclo, 239);
  assert.equal(lida.consumoSemCompensacao, 100);
  assert.equal(lida.consumoCompensado, 239);
  assert.equal(lida.saldoDisponivel, 100);
  assert.equal(lida.creditosAntigosUsados, 0);
  assert.equal(lida.saldoInicialElegivel, null);
});

test('preserva campos ausentes em fatura sintética sem SCEE e recusa outros layouts', () => {
  const exemplo = pagina([
    ...cabecalho,
    colunas,
    ['Consumo', '145,00', '1,000000', '', '', '', '145,00'],
    ['Total a pagar: R$ 145,00']
  ]);
  const lida = lerTextoPosicional([exemplo]);
  assert.equal(lida.consumoSemCompensacao, 145);
  assert.equal(lida.injetadoNoCiclo, null);
  assert.equal(lida.consumoCompensado, null);
  assert.equal(lida.creditosAntigosNasLinhas, null);
  assert.equal(lida.consumoFaturado, null);
  assert.equal(lida.origem.consumoCompensado, 'não encontrado');

  const desconhecido = lerTextoPosicional([pagina([['Outra distribuidora', 'Unidade Consumidora: 000000000'], colunas])]);
  assert.equal(desconhecido.status, 'layout-desconhecido');
  assert.equal(desconhecido.uc, null);
  assert.equal(desconhecido.revisaoObrigatoria, true);
  assert.equal(lerTextoPosicional([[]]).status, 'sem-texto');
});

test('distingue créditos inferidos de créditos impressos na DANFE', () => {
  const linha = (y, pontos) => pontos.map(([str, x, direita]) => ({
    str, width: direita ? direita - x : str.length * 3,
    transform: [6, 0, 0, 6, x, y]
  }));
  const danfe = [
    ...linha(790, [['Equatorial Pará', 21], ['Unidade Consumidora', 225]]),
    ...linha(750, [['Leitura anterior', 364], ['Leitura atual', 425]]),
    ...linha(730, [['01/2025', 48], ['20/01/2025', 125], ['R$ 130,00', 210]]),
    ...linha(550, [['Consumo (kWh)', 21], ['100,00', 158, 174], ['1,00', 205, 224],
      ['0,90', 252, 273], ['2,00', 310, 323], ['5,00', 358, 373], ['100,00', 403, 422]]),
    ...linha(541, [['Consumo compensado', 21], ['30,00', 158, 174], ['30,00', 403, 422]]),
    ...linha(530, [['Total', 21]]),
    ...linha(350, [['Energia injetada', 76], ['Ativo total', 154], ['20 kWh', 312]])
  ];

  const inferida = lerTextoPosicional([danfe]);
  assert.equal(inferida.status, 'lido');
  assert.equal(inferida.creditosAntigosUsados, 10);
  assert.equal(inferida.origem.creditosAntigosUsados, 'inferido');
  assert.equal(inferida.saldoDisponivel, null);

  const comValorImpresso = lerTextoPosicional([danfe.concat(
    linha(320, [['Créditos anteriores usados: 0 kWh', 21]])
  )]);
  assert.equal(comValorImpresso.creditosAntigosUsados, 0);
  assert.equal(comValorImpresso.origem.creditosAntigosUsados, 'lido');
});

test('envia somente bytes ao PDF.js, lê todas as páginas e encerra o worker', async () => {
  const bytes = new TextEncoder().encode('%PDF-1.7\nExemplo sintético');
  const arquivo = { size: bytes.length, arrayBuffer: async () => bytes.buffer };
  const acessos = [];
  const pdfjs = {
    getDocument: parametros => {
      assert.deepEqual(parametros.data, bytes);
      assert.equal(parametros.url, undefined);
      return {
        promise: Promise.resolve({
          numPages: 2,
          getPage: async pagina => {
            acessos.push(pagina);
            return { getTextContent: async () => ({ items: [] }) };
          }
        }),
        destroy: async () => { acessos.push('destroy'); }
      };
    }
  };
  assert.equal((await lerFatura(arquivo, async () => pdfjs)).status, 'sem-texto');
  assert.deepEqual(acessos, [1, 2, 'destroy']);
  assert.equal((await lerFatura(arquivo, async () => { throw new Error('offline'); })).status, 'erro');
  assert.equal((await lerFatura({ size: 11 * 1024 * 1024, arrayBuffer: arquivo.arrayBuffer })).status, 'erro');
});
