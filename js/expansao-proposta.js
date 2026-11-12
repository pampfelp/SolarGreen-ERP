(function (root) {
  'use strict';

  const calc = typeof module === 'object' && module.exports
    ? require('./expansao-calculo.js') : root.SGExpansaoCalculo;
  const DIA = 86400000;

  function numero(n) {
    return Number.isFinite(n) && n >= 0;
  }

  function dataISO(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const data = new Date(s + 'T00:00:00Z');
    return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === s ? data : null;
  }

  function periodoMensal(inicio, fim) {
    const a = dataISO(inicio);
    const b = dataISO(fim);
    if (!a || !b || b < a) return null;
    let cursor = a;
    let meses = 0;
    while (cursor <= b) {
      const primeiro = new Date(cursor.getTime());
      primeiro.setUTCDate(1);
      const proximo = new Date(primeiro.getTime());
      proximo.setUTCMonth(proximo.getUTCMonth() + 1);
      const diasNoMes = (proximo - primeiro) / DIA;
      const fimExclusivo = Math.min(proximo.getTime(), b.getTime() + DIA);
      meses += (fimExclusivo - cursor.getTime()) / DIA / diasNoMes;
      cursor = proximo;
    }
    return meses;
  }

  // Geração esperada de `kwp` entre duas leituras, dia a dia, pela produtividade mensal da cidade
  // (12 valores em kWh/kWp). Sem a tabela mensal, usa a média mensal informada.
  function geracaoPrevistaNoPeriodo(kwp, mensal, mediaMensal, inicio, fim) {
    const meses = periodoMensal(inicio, fim);
    if (!(kwp > 0) || !(meses > 0)) return null;
    if (Array.isArray(mensal) && mensal.length === 12 && mensal.every(v => v > 0)) {
      let kwh = 0;
      for (let d = dataISO(inicio).getTime(); d <= dataISO(fim).getTime(); d += DIA) {
        const dia = new Date(d);
        const diasNoMes = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth() + 1, 0)).getUTCDate();
        kwh += kwp * mensal[dia.getUTCMonth()] / diasNoMes;
      }
      return { kwh, meses };
    }
    return mediaMensal > 0 ? { kwh: kwp * mediaMensal * meses, meses } : null;
  }

  function janelaMensal(referencia) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(referencia)) return null;
    const inicio = referencia + '-01';
    const proximo = dataISO(inicio);
    proximo.setUTCMonth(proximo.getUTCMonth() + 1);
    return { inicio, fim: proximo.toISOString().slice(0, 10) };
  }

  function equivalencia(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  }

  function observacoesDaClasse(f, configTarifas) {
    const classe = equivalencia(f.subclasse);
    const modalidade = equivalencia(f.modalidade).replace(/^tarifa /, '');
    if (!classe || !modalidade || classe === 'nao informada' || modalidade === 'nao informada') return {};
    const chave = classe + ' | ' + modalidade;
    return Object.entries(configTarifas.observacoes || {})
      .find(([k]) => equivalencia(k) === chave)?.[1] || {};
  }

  function energiaCobradaGD2(f, regimeAtual) {
    const linhas = (f.itens || []).filter(i => i.tipo === 'gd2' && i.noTotal !== false);
    if (!linhas.length) return regimeAtual === 'GD II' ? f.consumoCompensado : null;
    if (!linhas.every(i => numero(i.quantidade))) return null;
    const soma = linhas.reduce((s, i) => s + i.quantidade, 0);
    return numero(f.consumoCompensado) && soma > f.consumoCompensado + 0.02 ? null : soma;
  }

  function refAneel(f, vigencias, janela, percentuais) {
    return {
      ...janela, subclasse: f.subclasse, modalidade: f.modalidade, posto: f.posto,
      vigencias, percentuais
    };
  }

  function compararCobranca(f, regimeAtual, janela, vigencias, fiob, homologada) {
    if (f.subgrupo && equivalencia(f.subgrupo) !== 'b1') {
      return { comparavel: false, homologada: false, motivo: 'A referência automática cobre apenas o subgrupo B1.' };
    }
    const comparacao = calc.compararFioB({
      ...refAneel(f, vigencias, janela, fiob.percentuais),
      cobrado: f.tarifaGD2SemTributos, precoComTributos: f.tarifaGD2ComTributos,
      kwhCompensados: energiaCobradaGD2(f, regimeAtual)
    });
    return { ...comparacao, homologada: comparacao.comparavel && homologada === true };
  }

  function tarifaAneelDoPeriodo(f, janela, vigencias) {
    if (!dataISO(janela?.inicio) || !dataISO(janela?.fim) ||
        (f.subgrupo && equivalencia(f.subgrupo) !== 'b1')) return null;
    const de = Number(janela.inicio.slice(0, 4));
    const ate = Number(janela.fim.slice(0, 4));
    const inteiros = {};
    for (let ano = de; ano <= ate; ano++) inteiros[ano] = 1;
    // Percentual unitário para reaproveitar o rateio diário do Fio B bruto.
    const resultado = calc.compararFioB({ ...refAneel(f, vigencias, janela, inteiros), cobrado: 1 });
    return resultado.comparavel ? resultado : null;
  }

  function projetarGD2(f, referencia, janelaFutura, janelaOriginal, vigencias, fiob, observacoes, tarifas, avisos) {
    const regras = tarifas.porRegime['GD II'] || [];
    const base = [...new Set(regras.filter(r => r.tipo === 'gd2').map(r => r.tarifaSemTributos))];
    const comprovada = observacoes.tarifaGD2;
    const referenciaOriginal = janelaMensal(f.referencia) ? f.referencia : janelaOriginal.fim?.slice(0, 7);
    // O registro agregado por classe e modalidade ainda não distingue postos.
    const branca = equivalencia(f.modalidade).replace(/^tarifa /, '') === 'branca';
    const usarObservacao = !branca && comprovada?.valor > 0 && janelaMensal(comprovada.referencia)
      && comprovada.referencia <= referencia
      && (comprovada.referencia > referenciaOriginal
        || (comprovada.referencia === referenciaOriginal && !(f.tarifaGD2SemTributos > 0)));
    const observada = usarObservacao ? comprovada : { referencia: referenciaOriginal, valor: f.tarifaGD2SemTributos };
    const janelaObservada = usarObservacao ? janelaMensal(observada.referencia) : janelaOriginal;
    const refObservada = tarifaAneelDoPeriodo(f, janelaObservada, vigencias);
    const refFutura = tarifaAneelDoPeriodo(f, janelaFutura, vigencias);
    const percObservado = fiob.percentuais?.[observada.referencia?.slice(0, 4)];
    const percProjetado = fiob.percentuais?.[referencia.slice(0, 4)];
    const valorProjetado = refObservada && refFutura
      ? calc.projetarTarifaGD2(observada.valor, percObservado, percProjetado, refFutura.previsto / refObservada.previsto)
      : null;
    if (!(valorProjetado > 0) || base.length !== 1 || !(base[0] > 0)) {
      delete tarifas.porRegime['GD II'];
      avisos.push('Faltam tarifa GD II observada equivalente, composição de cobrança ou vigências para projetar este ciclo.');
      return null;
    }
    const fator = valorProjetado / base[0];
    const campos = ['tarifaSemTributos', 'precoComTributos', 'valorPorKWh', 'pisCofinsPorKWh', 'icmsPorKWh'];
    tarifas.porRegime['GD II'] = regras.map(linha => {
      if (linha.tipo !== 'gd2') return linha;
      const projetada = { ...linha };
      for (const chave of campos) if (Number.isFinite(linha[chave])) projetada[chave] = linha[chave] * fator;
      return projetada;
    });
    avisos.push('Tarifa GD II projetada a partir de ' + observada.referencia +
      ', com os percentuais anuais e o Fio B das vigências correspondentes. As demais rubricas usam a base da fatura.');
    if (usarObservacao) {
      avisos.push('A vigência da tarifa observada foi estimada pelo mês de referência; os fatores de tributos da rubrica usam a fatura base.');
    }
    return {
      referenciaObservada: observada.referencia, valorObservado: observada.valor, valorProjetado,
      percObservado, percProjetado, fioBObservado: refObservada.previsto, fioBProjetado: refFutura.previsto
    };
  }

  // Fatura sem parcela GD II: usa a referência gravada pela última fatura lida que tinha a parcela
  // (ou editada pela equipe), ajustada pelo percentual do Fio B do ano simulado.
  function aplicarReferenciaGD2(f, ref, tarifas, ano, fiob, avisos) {
    if (equivalencia(f.modalidade).replace(/^tarifa /, '') === 'branca') {
      avisos.push('Tarifa branca: informe as rubricas GD II revisadas para simular a expansão.');
      return null;
    }
    if (!ref) {
      avisos.push('Sem referência GD II salva. Leia uma fatura com a parcela GD II ou cadastre a referência na aba.');
      return null;
    }
    const anoRef = Number(String(ref.referencia || '').slice(0, 4));
    const fator = anoRef === ano ? 1
      : calc.projetarTarifaGD2(1, fiob.percentuais?.[anoRef], fiob.percentuais?.[ano]);
    if (!fator) {
      avisos.push('Falta o percentual do Fio B de ' + anoRef + ' ou ' + ano + ' para ajustar a referência GD II.');
      return null;
    }
    const compensado = calc.tarifaCompensadaDaFatura(f, tarifas);
    const regras = calc.rubricasGD2DaReferencia({ referencia: ref, compensado, fator });
    if (!regras) {
      avisos.push('A referência GD II não pôde ser aplicada: falta a tarifa do kWh compensado desta fatura em faixa única.');
      return null;
    }
    tarifas.porRegime['GD II'] = regras;
    avisos.push('Custo GD II estimado pela referência de ' + ref.referencia + (ref.fonte ? ' (' + ref.fonte + ')' : '') +
      (fator === 1 ? '' : ', ajustada ao percentual do Fio B de ' + ano) + '.');
    return { referencia: ref.referencia, fonte: ref.fonte ?? null, origem: ref.origem ?? null,
      tarifaSemTributos: ref.tarifaSemTributos, precoComTributos: ref.precoComTributos, fator };
  }

  function avisarMudancas(fatura, observacoes, avisos) {
    const campos = [
      ['GD II sem tributos', fatura.tarifaGD2SemTributos, observacoes.tarifaGD2, 'R$/kWh'],
      ['ICMS', fatura.aliquotaICMS, observacoes.icmsPct, '%'],
      ['PIS', fatura.aliquotaPIS, observacoes.pisPct, '%'],
      ['Cofins', fatura.aliquotaCofins, observacoes.cofinsPct, '%']
    ];
    const formatar = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
    for (const [nome, valor, obs, unidade] of campos) {
      if (numero(valor) && numero(obs?.valor) && obs.referencia > fatura.referencia && Math.abs(valor - obs.valor) > 1e-8) {
        avisos.push(nome + ' mudou depois da fatura de ' + fatura.referencia + '. ' +
          formatar(valor) + ' → ' + formatar(obs.valor) + ' ' + unidade + ' em ' + obs.referencia + '.');
      }
    }
  }

  function tributosDaGeracao(f, observacoes) {
    const campos = [['ICMS', 'aliquotaICMS', 'icmsPct'], ['PIS', 'aliquotaPIS', 'pisPct'], ['Cofins', 'aliquotaCofins', 'cofinsPct']];
    const dados = { OrigemTributos: {} };
    for (const [nome, campoFatura, campoObservado] of campos) {
      const observada = observacoes[campoObservado];
      const daFatura = numero(f[campoFatura]);
      const doMes = observada && observada.referencia === f.referencia && numero(observada.valor);
      dados['Aliquota' + nome] = daFatura ? f[campoFatura] : doMes ? observada.valor : null;
      dados.OrigemTributos[nome] = daFatura ? 'fatura lida' : doMes ? 'fatura observada de ' + observada.referencia : 'não informado';
    }
    return dados;
  }

  function snapshot(dados) {
    return JSON.parse(JSON.stringify(dados));
  }

  function calcular({ fatura, usinaAtual = {}, expansao = {}, config = {}, catalogo = [] } = {}) {
    if (!fatura || !numero(fatura.consumoFaturado) || !numero(fatura.injetadoNoCiclo)) {
      throw new Error('Revise o consumo faturado e a injeção da fatura, em kWh.');
    }
    const avisos = [];
    const fiob = config.fiob || {};
    const refTarifaria = config.tarifas || {};
    const vigencias = refTarifaria.vigencias || [];
    const janelaOriginal = { inicio: fatura.dataLeituraAnterior, fim: fatura.dataLeituraAtual };
    const gd2CobreTodoScee = fatura.consumoCompensado > 0
      && Math.abs(energiaCobradaGD2(fatura, null) - fatura.consumoCompensado) <= 0.02;
    // Fatura com SCEE e sem parcela GD II/GD III: a usina atual está em GD I.
    const comRubricaGD = (fatura.itens || []).some(i => ['gd2', 'gd3'].includes(i.tipo) && i.noTotal !== false);
    const gd1PelaFatura = !gd2CobreTodoScee && fatura.consumoCompensado > 0 && !comRubricaGD
      && (fatura.itens || []).some(i => i.tipo === 'consumoCompensado' && i.noTotal !== false);
    const regimeAtual = usinaAtual.regimeAtual || fatura.regimeGD || (gd2CobreTodoScee ? 'GD II' : gd1PelaFatura ? 'GD I' : null);
    if (!usinaAtual.regimeAtual && !fatura.regimeGD && gd1PelaFatura) {
      avisos.push('Usina atual tratada como GD I porque a fatura não tem a parcela GD II. Confira o enquadramento atual.');
    }
    const regimeExpansao = expansao.regimeExpansao || 'GD II';
    const comparacaoFioB = compararCobranca(fatura, regimeAtual, janelaOriginal, vigencias, fiob, config.homologacaoFioB);

    const referencia = janelaMensal(fatura.referencia) ? fatura.referencia
      : dataISO(janelaOriginal.fim) ? janelaOriginal.fim.slice(0, 7) : null;
    const referenciaFutura = expansao.referenciaFutura || null;
    const janelaFutura = referenciaFutura ? janelaMensal(referenciaFutura) : null;
    if (referenciaFutura && (!janelaFutura || !janelaMensal(referencia) || referenciaFutura <= referencia)) {
      throw new Error('Informe um mês de projeção posterior à referência da fatura.');
    }
    const referenciaSimulada = referenciaFutura || referencia;
    const ano = referenciaSimulada ? Number(referenciaSimulada.slice(0, 4)) : null;
    const percentual = fiob.percentuais?.[ano] ?? null;

    const modulosAtuais = usinaAtual.modulosAtuais || [];
    const kwp = modulosAtuais.length
      ? modulosAtuais.reduce((soma, m) => soma + m.qtd * m.wp, 0) / 1000 : usinaAtual.kwpAtual;
    let recuperacao = null;
    let autoconsumoDaFatura = null;
    const desempenhoAlvo = usinaAtual.desempenhoAlvo ?? config.desempenhoAlvo ?? 1;
    const periodoProprio = usinaAtual.periodoInicio || usinaAtual.periodoFim || numero(usinaAtual.geracaoReal);
    if (!(kwp > 0) || usinaAtual.considerarRecuperacao === false) {
      avisos.push('A expansão é calculada sem recuperar geração da usina atual.');
    } else if (!periodoProprio) {
      // Caminho simples: o desempenho (%) vale para o período de leitura da própria fatura.
      const prevista = geracaoPrevistaNoPeriodo(kwp, expansao.produtividadeMensal, expansao.produtividade,
        fatura.dataLeituraAnterior, fatura.dataLeituraAtual);
      if (!(usinaAtual.desempenho > 0)) {
        avisos.push('Desempenho da usina não informado: o cálculo considera que ela gera o esperado.');
      } else if (!prevista) {
        avisos.push('Faltam as datas de leitura da fatura ou a produtividade para avaliar o desempenho.');
      } else {
        const geracaoReal = prevista.kwh * usinaAtual.desempenho;
        recuperacao = { ...calc.calcularRecuperacao({ geracaoReal, geracaoPrevista: prevista.kwh, desempenhoAlvo,
          meses: prevista.meses }), meses: prevista.meses, inicio: fatura.dataLeituraAnterior, fim: fatura.dataLeituraAtual,
          geracaoReal, fonte: 'periodo da fatura' };
        if (numero(fatura.injetadoNoCiclo)) autoconsumoDaFatura = Math.max(0, geracaoReal - fatura.injetadoNoCiclo);
      }
    } else {
      const temDatas = usinaAtual.periodoInicio || usinaAtual.periodoFim;
      const meses = temDatas ? periodoMensal(usinaAtual.periodoInicio, usinaAtual.periodoFim) : usinaAtual.meses;
      if (!(meses > 0 && Number.isFinite(meses))) throw new Error('Informe o período válido do diagnóstico de geração.');
      recuperacao = calc.calcularRecuperacao({ ...usinaAtual, meses, kwp, desempenhoAlvo });
      if (!recuperacao) throw new Error('Informe a geração real e a geração prevista ou o desempenho que permita calculá-la.');
      recuperacao = { ...recuperacao, meses };
      if (!Number.isInteger(meses)) avisos.push('O período de recuperação foi convertido em meses proporcionais pelos dias de cada mês.');
    }
    const recuperacaoMensal = recuperacao?.recuperacaoMensal ?? 0;
    if (!regimeAtual && recuperacaoMensal > 0) {
      avisos.push('A fatura não mostra o enquadramento da usina atual; a recuperação foi considerada no regime ' + regimeExpansao + '.');
    }
    const recorrente = expansao.meta === 'recorrente';
    if (recorrente) {
      avisos.push('A meta recorrente usa o consumo da fatura como referência mensal. Encargos eventuais são mostrados à parte.');
      if (expansao.usaCreditosAntigos) avisos.push('O saldo de créditos usado na meta recorrente tem efeito temporário.');
    }
    if (expansao.meta === 'residual' && !numero(expansao.residualDesejado)) {
      throw new Error('Informe o residual desejado, em kWh.');
    }
    const saldoElegivel = referenciaFutura ? expansao.saldoElegivelFuturo : fatura.saldoInicialElegivel;
    const dimensionamento = calc.dimensionar({
      ...expansao, consumoFaturado: fatura.consumoFaturado, injetadoNoCiclo: fatura.injetadoNoCiclo,
      kwpAtual: usinaAtual.kwpAtual, wpAtual: usinaAtual.wpAtual, modulosAtuais, recuperacaoMensal, saldoElegivel,
      residualDesejado: expansao.meta === 'residual' ? expansao.residualDesejado : 0
    });
    if (dimensionamento.kwpAtual === null) avisos.push('A potência da usina atual não foi informada. Confira o total e a seleção do inversor.');
    else if (dimensionamento.placasExistentes === null) avisos.push('Informe os módulos existentes para exibir a contagem no telhado.');
    const inversor = calc.sugerirInversor({
      kwpTotal: dimensionamento.kwpTotal, catalogo, potenciasInversorKW: config.potenciasInversorKW,
      fornecimento: fatura.tipoFornecimento, inversorAtual: usinaAtual.inversorAtual, overloadMax: config.overloadMax
    });
    const tarifasFatura = calc.tarifasDaFatura(fatura, { ...expansao, regimeAtual });
    const revistas = expansao.tarifasRevisadas || {};
    const tarifas = {
      ...tarifasFatura, ...revistas, porRegime: { ...tarifasFatura.porRegime, ...revistas.porRegime }
    };
    const observacoes = observacoesDaClasse(fatura, refTarifaria);
    if (referencia) avisarMudancas({ ...fatura, referencia }, observacoes, avisos);
    const usaGD2 = regimeAtual === 'GD II' || regimeExpansao === 'GD II' || fatura.regimeCreditosAntigos === 'GD II';
    const referenciaGD2 = usaGD2 && !tarifas.porRegime['GD II']?.length
      ? aplicarReferenciaGD2(fatura, config.referenciaGD2, tarifas, ano, fiob, avisos) : null;
    const projecao = referenciaFutura && usaGD2 && !referenciaGD2
      ? projetarGD2(fatura, referenciaFutura, janelaFutura, janelaOriginal, vigencias, fiob, observacoes, tarifas, avisos)
      : null;
    const faturaSimulada = referenciaFutura ? { ...fatura, saldoInicialElegivel: saldoElegivel } : fatura;
    const simulacao = calc.simularCenarios({
      // Sem compensação na fatura não há como ler o enquadramento da usina atual; a geração recuperada
      // entra no mesmo regime das placas novas, com aviso.
      fatura: faturaSimulada, tarifas, regimeAtual: regimeAtual || regimeExpansao, regimeExpansao, recuperacaoMensal,
      geracaoNova: dimensionamento.geracaoNova,
      fracaoUtil: expansao.fracaoUtil,
      fracaoAutoconsumoRecuperacao: usinaAtual.fracaoAutoconsumoRecuperacao ?? expansao.fracaoAutoconsumoRecuperacao,
      fracaoAutoconsumoNova: expansao.fracaoAutoconsumoNova,
      autoconsumoOriginal: usinaAtual.autoconsumoOriginal ?? expansao.autoconsumoOriginal ?? autoconsumoDaFatura,
      recorrente, futuro: Boolean(referenciaFutura)
    });
    simulacao.premissas = [...new Set([
      ...simulacao.premissas, ...avisos, ...simulacao.cenarios.flatMap(c => c.dadosAusentes || [])
    ])];

    const aneel = tarifaAneelDoPeriodo(fatura, janelaFutura || janelaOriginal, vigencias);
    const fontes = aneel?.fontes || [];
    const resolucoes = [...new Set(fontes.map(v => v.resolucao).filter(Boolean))];
    const geracao = {
      AnoFioB: ano, PercentualFioBGD2: percentual, FonteFioBPercentual: fiob.fonte ?? null,
      TarifaFioB: aneel?.previsto ?? null, ResolucaoTarifaria: resolucoes.join(' / ') || null,
      VigenciaInicio: fontes.map(v => v.inicio).sort()[0] ?? null,
      VigenciaFim: fontes.map(v => v.fim).sort().at(-1) ?? null,
      ...tributosDaGeracao({ ...fatura, referencia }, observacoes),
      ParametrosTarifarios: snapshot({
        referenciaSimulada, fonteTarifas: expansao.tarifasRevisadas ? 'tarifas revisadas' : 'fatura lida',
        tarifas, fontesANEEL: fontes, projecaoGD2: projecao, referenciaGD2, comparacaoFioB, premissas: simulacao.premissas
      })
    };
    const resumo = {
      KwpAtual: dimensionamento.kwpAtual, KwpAdicional: dimensionamento.kwpAdicional, KwpTotal: dimensionamento.kwpTotal,
      PlacasExistentes: dimensionamento.placasExistentes, PlacasNovas: dimensionamento.placasNovas,
      InversorSugeridoKW: inversor?.kw ?? null, EconomiaComCreditos: simulacao.economiaComCreditos.valor,
      EconomiaSemCreditos: simulacao.economiaSemCreditos.valor
    };
    return { dimensionamento, inversor, simulacao, comparacaoFioB, geracao, resumo, regimeAtual, regimeExpansao,
      recuperacao, conferencia: calc.conferirFatura(fatura) };
  }

  // Só os cenários que valem para a situação do cliente, na ordem em que se explicam.
  // Sem créditos antigos na fatura, "com" e "sem" créditos são iguais; sem recuperação, a usina
  // recuperada é igual à atual. A conta sem solar fica fora: não é a situação de quem já tem usina.
  function cenariosAplicaveis(simulacao, recuperacao) {
    const porNome = Object.fromEntries((simulacao?.cenarios || []).map(c => [c.nome, c]));
    const usouCreditos = (porNome.atualCom?.creditoUsado || 0) > 0.005;
    const recupera = (recuperacao?.recuperacaoMensal || 0) > 0.005;
    const lista = [['atualCom', usouCreditos ? 'Conta de hoje (com créditos antigos)' : 'Conta de hoje']];
    if (usouCreditos) lista.push(['atualSem', 'Conta de hoje sem os créditos antigos']);
    if (recupera) lista.push([usouCreditos ? 'recuperadaSem' : 'recuperadaCom', 'Com a usina atual recuperada']);
    lista.push([usouCreditos ? 'expansaoSem' : 'expansaoCom', 'Com a expansão']);
    return lista.filter(([nome]) => porNome[nome]).map(([nome, rotulo]) => ({ ...porNome[nome], rotulo }));
  }

  // Economia em destaque (decisão do Felipe, 12/11): sem os créditos antigos, o ganho recorrente.
  // Quando a fatura usou créditos antigos, a comparação com a conta de hoje vai como informação.
  function economiaDestaque(simulacao) {
    const atual = (simulacao?.cenarios || []).find(c => c.nome === 'atualCom');
    const usouCreditos = (atual?.creditoUsado || 0) > 0.005;
    return { principal: (usouCreditos ? simulacao?.economiaSemCreditos : simulacao?.economiaComCreditos) || null,
      contaDeHoje: usouCreditos ? simulacao?.economiaComCreditos || null : null, usouCreditos };
  }

  const api = { calcular, cenariosAplicaveis, economiaDestaque, geracaoPrevistaNoPeriodo };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SGExpansaoProposta = api;
})(typeof window === 'undefined' ? globalThis : window);
