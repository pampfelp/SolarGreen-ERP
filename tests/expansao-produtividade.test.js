const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resolver, produtividadeManual } = require('../js/expansao-produtividade.js');

const cidades = ['Belém', 'Ananindeua'];
const normalizar = texto => String(texto ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
const carregar = async () => ({
  CIDADES: cidades,
  encontrarCidade: texto => cidades.find(cidade => normalizar(cidade) === normalizar(texto)),
  calcularPerda: ({ placas, potenciaW, cidade }) => {
    assert.equal(placas * potenciaW, 1000);
    const inicial = cidade === 'Belém' ? 101 : cidade === 'Ananindeua' ? 81 : 91;
    return { esperado: Array.from({ length: 12 }, (_, indice) => inicial + indice) };
  }
});

// Faixa fictícia para validar a prioridade, sem depender da pesquisa dos Correios.
const faixasCep = [{ inicio: '12345-000', fim: '12345-099', cidade: 'Ananindeua' }];

test('usa a cidade da fatura antes do CEP e devolve a média e o mês do ciclo', async () => {
  const resultado = await resolver({ cidadeFatura: 'BELEM', cepFatura: '12345001', faixasCep, mesCiclo: 10 }, carregar);
  assert.equal(resultado.cidade, 'Belém');
  assert.equal(resultado.origemCidade, 'da fatura');
  assert.equal(resultado.mediaMensal, 106.5);
  assert.equal(resultado.produtividadeMes, 110);
});

test('considera os limites da faixa de CEP antes do cadastro', async () => {
  const resultado = await resolver({ cepFatura: '12345-099', faixasCep, cidadeCadastro: 'Belém' }, carregar);
  assert.equal(resultado.cidade, 'Ananindeua');
  assert.equal(resultado.origemCidade, 'do CEP');
  assert.equal(resultado.produtividadeMes, null);
});

test('sinaliza CEP inconclusivo e usa a cidade do cadastro', async () => {
  const resultado = await resolver({ cepFatura: '12345001', cidadeCadastro: 'Belém' }, carregar);
  assert.equal(resultado.origemCidade, 'do cadastro');
  assert.match(resultado.aviso, /CEP da fatura/);
  const faixaConflitante = { ...faixasCep[0], cidade: 'Belém' };
  const conflito = await resolver({ cepFatura: '12345001', faixasCep: [...faixasCep, faixaConflitante] }, carregar);
  assert.equal(conflito.origemCidade, 'média regional');
});

test('permite trocar a cidade e usa a média regional para uma cidade fora da lista', async () => {
  const entrada = { cidadeFatura: 'Belém' };
  const troca = await resolver({ ...entrada, cidadeEscolhida: 'Ananindeua' }, carregar);
  assert.equal(troca.origemCidade, 'seleção manual');
  assert.equal(troca.cidade, 'Ananindeua');
  const foraDaLista = await resolver({ ...entrada, cidadeEscolhida: 'Altamira' }, carregar);
  assert.equal(foraDaLista.origemCidade, 'média regional');
  assert.equal(foraDaLista.mediaMensal, 96.5);
  assert.match(foraDaLista.aviso, /média regional/);
});

test('oferece modo manual com fonte obrigatória quando o site não responde', async () => {
  const indisponivel = await resolver({}, async () => { throw new Error('offline'); });
  assert.equal(indisponivel.status, 'manual');
  assert.equal(indisponivel.fonteObrigatoria, true);
  assert.equal(produtividadeManual({ valor: '113,88', fonte: '  ' }).status, 'manual');
  assert.equal(produtividadeManual({ valor: -1, fonte: 'Projeto' }).status, 'manual');
  assert.deepEqual(produtividadeManual({ valor: '113,88', fonte: ' Projeto ' }), {
    status: 'ok', origemProdutividade: 'manual', mediaMensal: 113.88, fonte: 'Projeto', produtividadeMes: null
  });
});
