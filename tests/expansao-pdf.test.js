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
  simulacao: { cenarios: [cenario],
    economiaComCreditos: { contaReferencia: 1440.59, contaExpansao: 955.89, valor: 484.70 },
    economiaSemCreditos: { contaReferencia: 1853.06, contaExpansao: 955.89, valor: 897.17 } }
};
const figura = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZQAAAAASUVORK5CYII=';
const titulos = ['Cliente', 'Resumo da expansão', 'Telhado 3D', 'Fatura atual', 'Fatura simulada', 'Cenários e economia',
  'Documento do cliente anexado'];

test('monta as sete partes A4 com rodapé congelado, data de Belém e escape de texto', () => {
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
  assert.match(html, /R\$\s484,70/);
  assert.match(html, /R\$\s897,17/);
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

module.exports = { model, figura };
