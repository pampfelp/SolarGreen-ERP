(function (root) {
  'use strict';

  const fonteSite = 'Site da Solar Green · Global Solar Atlas';
  let fontePendente;

  function carregarFonte() {
    if (!fontePendente) {
      fontePendente = import('https://solargreensuporte.com.br/js/calculo.js');
    }
    return fontePendente;
  }

  function numeroCep(valor) {
    const texto = String(valor ?? '').trim();
    return /^\d{5}-?\d{3}$/.test(texto) ? Number(texto.replace('-', '')) : null;
  }

  // Cada faixa é inclusiva. Se a tabela indicar duas cidades, o CEP é inconclusivo.
  function cidadePeloCep(cep, faixasCep, encontrarCidade) {
    const numero = numeroCep(cep);
    if (numero === null) return null;
    const cidades = new Set();
    for (const faixa of faixasCep) {
      const inicio = numeroCep(faixa.inicio);
      const fim = numeroCep(faixa.fim);
      if (inicio !== null && fim !== null && inicio <= numero && numero <= fim) {
        cidades.add(encontrarCidade(faixa.cidade));
      }
    }
    return cidades.size === 1 ? cidades.values().next().value : null;
  }

  function produtividadeManual({ valor, fonte } = {}) {
    const texto = String(valor ?? '').trim();
    const mediaMensal = /^\d+(?:[.,]\d+)?$/.test(texto) ? Number(texto.replace(',', '.')) : NaN;
    fonte = String(fonte ?? '').trim();
    if (!Number.isFinite(mediaMensal) || mediaMensal <= 0 || !fonte) {
      return { status: 'manual', fonteObrigatoria: true, aviso: 'Informe uma produtividade maior que zero e a fonte usada.' };
    }
    return { status: 'ok', origemProdutividade: 'manual', mediaMensal, fonte, produtividadeMes: null };
  }

  // mesCiclo vai de 1 (janeiro) a 12 (dezembro). A média não é arredondada.
  async function resolver({ cidadeEscolhida, cidadeFatura, cepFatura, cidadeCadastro, mesCiclo, faixasCep = [] } = {}, carregar = carregarFonte) {
    try {
      const { CIDADES, encontrarCidade, calcularPerda } = await carregar();
      const cepValido = numeroCep(cepFatura) !== null;
      const daFatura = encontrarCidade(cidadeFatura);
      const doCep = !daFatura && cepValido ? cidadePeloCep(cepFatura, faixasCep, encontrarCidade) : null;
      const doCadastro = encontrarCidade(cidadeCadastro);
      const opcoes = cidadeEscolhida
        ? [[encontrarCidade(cidadeEscolhida), 'seleção manual']]
        : [[daFatura, 'da fatura'], [doCep, 'do CEP'], [doCadastro, 'do cadastro']];
      const [cidade, origemCidade] = opcoes.find(([nome]) => nome) || [null, 'média regional'];

      // A geração esperada de 1 kWp equivale à produtividade em kWh/kWp.
      // O site aplica seu próprio PR, ajuste de fonte e média regional.
      const { esperado: mensal } = calcularPerda({ placas: 1, potenciaW: 1000, cidade, desempenho: 1, tarifa: 0 });
      if (!Array.isArray(mensal) || mensal.length !== 12 || mensal.some(valor => !Number.isFinite(valor) || valor <= 0)) {
        throw new Error('Produtividade mensal inválida');
      }
      const mediaMensal = mensal.reduce((total, valor) => total + valor, 0) / 12;
      const mes = Number(mesCiclo);
      const produtividadeMes = Number.isInteger(mes) && mes >= 1 && mes <= 12 ? mensal[mes - 1] : null;
      const avisos = [];
      if (!cidade) avisos.push('Foi usada a média regional do site.');
      if (!cidadeEscolhida && !daFatura && cepValido && !doCep) avisos.push('O município não pôde ser confirmado pelo CEP da fatura.');
      return {
        status: 'ok', origemProdutividade: 'site', fonte: fonteSite, cidades: CIDADES.slice(), cidade, origemCidade,
        mensal, mediaMensal, produtividadeMes, aviso: avisos.join(' ')
      };
    } catch {
      return {
        status: 'manual', fonteObrigatoria: true, cidades: [],
        aviso: 'A tabela do site está indisponível. Informe a produtividade e a fonte usada.'
      };
    }
  }

  const api = { resolver, produtividadeManual };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SGExpansaoProdutividade = api;
})(typeof window !== 'undefined' ? window : null);
