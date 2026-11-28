const test = require('node:test');
const assert = require('node:assert/strict');
const pdf = require('../js/expansao-pdf.js');

const apresentacao = {
  titulo: 'Expansão solar para seu imóvel',
  subtitulo: 'Uma proposta com equipamentos, instalação e documentação definidos no escopo.',
  beneficios: [
    { titulo: 'Mais geração', texto: 'Ampliação conforme o dimensionamento apresentado nas páginas seguintes.' },
    { titulo: 'Instalação planejada', texto: 'Distribuição dos módulos conforme o croqui e as condições do telhado.' },
    { titulo: 'Escopo claro', texto: 'Equipamentos e serviços descritos para orientar a decisão.' }
  ],
  escopo: ['Fornecimento dos módulos previstos no dimensionamento.', 'Instalação e conexões previstas no projeto.', 'Documentação técnica descrita na proposta.'],
  proximoPasso: 'Revise o escopo com o responsável pela proposta para alinhar a contratação.',
  nota: 'A geração é estimada e depende das condições de operação descritas na proposta.'
};
const modelo = (apresentacaoComercial = apresentacao, valorInvestimento = 12345.67) => ({
  cliente: { Nome: 'Cliente sintético' }, numeroProposta: 'EXP-TESTE-CAPA',
  expansao: { apresentacaoComercial, valorInvestimento, custoBase: 9876.54, margemVenda: 0.123456 }
});

test('capa é a primeira seção, com três benefícios e somente o investimento informado', () => {
  const html = pdf.montarHtml(modelo());
  const capa = html.match(/<section class="folha commercialdocument">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(capa);
  assert.ok(html.indexOf(capa) < html.indexOf('<h2>Cliente</h2>'));
  assert.match(capa, /Cliente sintético/);
  assert.match(capa, /EXP-TESTE-CAPA/);
  assert.match(capa, /class="commercial-preco">R\$\s12\.345,67<\/strong>/);
  assert.equal((capa.match(/class="commercial-beneficio"/g) || []).length, 3);
  for (const texto of [apresentacao.titulo, apresentacao.subtitulo, ...apresentacao.escopo, apresentacao.proximoPasso, apresentacao.nota]) assert.ok(capa.includes(texto));
  assert.doesNotMatch(html, /9\.876,54|0,123456|custoBase|margemVenda/);
  const estilo = html.match(/\.commercial-preco\{([^}]+)\}/)?.[1];
  assert.match(estilo || '', /font-size:34pt/);
  assert.match(estilo, /color:#003122/);
  const tamanhos = [...html.matchAll(/font-size:(\d+)pt/g)].map(m => Number(m[1]));
  assert.equal(Math.max(...tamanhos), 34);
});

test('todos os textos comerciais e a identificação são escapados sem HTML cru', () => {
  const ataque = `<img src=x onerror="x"> & 'texto'`;
  const dados = { titulo: ataque, subtitulo: ataque, beneficios: Array.from({ length: 3 }, () => ({ titulo: ataque, texto: ataque })), escopo: [ataque], proximoPasso: ataque, nota: ataque };
  const html = pdf.montarHtml({ ...modelo(dados), cliente: { Nome: ataque }, numeroProposta: ataque });
  const capa = html.match(/<section class="folha commercialdocument">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(capa);
  assert.equal((capa.match(/&lt;img src=x onerror=&quot;x&quot;&gt; &amp; &#39;texto&#39;/g) || []).length, 13);
  assert.doesNotMatch(capa, /<img|<script/);
});

test('ausência de metadados ou investimento inválido preserva o documento anterior', () => {
  const base = modelo();
  delete base.expansao.apresentacaoComercial;
  const anterior = pdf.montarHtml(base);
  for (const valor of [undefined, null, [], 'texto', 1]) assert.equal(pdf.montarHtml({ ...base, expansao: { ...base.expansao, apresentacaoComercial: valor } }), anterior);
  for (const valor of [undefined, null, '123', -1, NaN, Infinity]) {
    const com = modelo(); com.expansao.valorInvestimento = valor;
    const sem = { ...com, expansao: { ...com.expansao } }; delete sem.expansao.apresentacaoComercial;
    assert.equal(pdf.montarHtml(com), pdf.montarHtml(sem));
  }
  assert.match(pdf.montarHtml(modelo(apresentacao, 0)), /class="commercial-preco">R\$\s0,00/);
});

test('campos e arrays comerciais inválidos não geram capa parcial nem interrompem o PDF', () => {
  const base = modelo(); delete base.expansao.apresentacaoComercial;
  const anterior = pdf.montarHtml(base);
  const invalidos = [
    ...['titulo', 'subtitulo', 'proximoPasso', 'nota'].flatMap(campo => [null, 1, {}, '', '  '].map(valor => ({ ...apresentacao, [campo]: valor }))),
    ...[null, {}, 'texto', [], Array(3), Array(4).fill({ titulo: 'A', texto: 'B' }), [{ titulo: 'A', texto: 'B' }], [null, null, null], Array(3).fill({ titulo: 1, texto: 'B' }), Array(3).fill({ titulo: 'A', texto: {} })].map(beneficios => ({ ...apresentacao, beneficios })),
    ...[null, {}, 'texto', [], Array(2), [1], [null], [' ']].map(escopo => ({ ...apresentacao, escopo }))
  ];
  for (const dados of invalidos) assert.equal(pdf.montarHtml(modelo(dados)), anterior);
});
