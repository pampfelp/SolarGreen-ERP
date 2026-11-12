(function (root) {
  'use strict';

  const DIA = 86400000;
  const CENTAVOS = 0.05;

  function valor(n) {
    return Number.isFinite(n) && n >= 0;
  }

  function centavos(n) {
    return Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
  }

  function texto(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  }

  function dia(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
    const ms = Date.parse(s + 'T00:00:00Z');
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === s ? ms : NaN;
  }

  function conferirFatura(f) {
    const itens = (f.itens || []).filter(item => item.noTotal !== false);
    const soma = itens.length && itens.every(item => Number.isFinite(item.valor))
      ? centavos(itens.reduce((total, item) => total + item.valor, 0)) : null;
    const bruto = itens.find(item => item.tipo === 'sceeBruto');
    const liquido = itens.find(item => item.tipo === 'sceeLiquido');
    const consumo = valor(f.consumoSemCompensacao) && valor(f.consumoCompensado)
      ? f.consumoSemCompensacao + f.consumoCompensado : null;
    const creditosInferidos = valor(f.consumoCompensado) && valor(f.injetadoNoCiclo)
      ? Math.max(0, f.consumoCompensado - f.injetadoNoCiclo) : null;
    const tributos = bruto && [bruto.icms, bruto.pisCofins].every(Number.isFinite)
      ? bruto.icms + bruto.pisCofins : null;
    const efeitoScee = bruto && liquido && [bruto.valor, liquido.valor].every(Number.isFinite)
      ? bruto.valor + liquido.valor : null;

    function check(campo, calculado, informado, tolerancia) {
      const diferenca = [calculado, informado].every(Number.isFinite) ? calculado - informado : null;
      return { campo, calculado, informado: informado ?? null, diferenca,
        ok: diferenca === null ? null : Math.abs(diferenca) <= tolerancia + 1e-9 };
    }

    return [
      check('consumoFaturado', consumo, f.consumoFaturado, 0.01),
      check('creditosAntigos', creditosInferidos, f.creditosAntigosNasLinhas, 0.05),
      check('totalFatura', soma, f.total, CENTAVOS),
      check('beneficioScee', efeitoScee, tributos, CENTAVOS)
    ];
  }

  function calcularRecuperacao(u) {
    const { geracaoReal, desempenho, desempenhoAlvo, baseDesempenho, meses } = u;
    let geracaoPrevista = u.geracaoPrevista;
    if (!valor(geracaoReal) || !valor(desempenhoAlvo) || !(meses > 0 && Number.isFinite(meses))) {
      return null;
    }
    if (!valor(geracaoPrevista) && baseDesempenho === 'geracaoPrevista' && desempenho > 0) {
      geracaoPrevista = geracaoReal / desempenho;
    }
    if (!valor(geracaoPrevista) && baseDesempenho === 'PR'
        && [u.kwp, u.irradiacaoPeriodo, u.prReferencia].every(valor)) {
      geracaoPrevista = u.kwp * u.irradiacaoPeriodo * u.prReferencia;
    }
    if (!(geracaoPrevista > 0)) return null;
    const geracaoNoAlvo = geracaoPrevista * desempenhoAlvo;
    const recuperacao = Math.max(0, geracaoNoAlvo - geracaoReal);
    return { geracaoPrevista, desempenho: geracaoReal / geracaoPrevista, geracaoNoAlvo,
      recuperacao, recuperacaoMensal: recuperacao / meses };
  }

  function dimensionar(p) {
    const { consumoFaturado, injetadoNoCiclo, recuperacaoMensal, produtividade, wp,
      fracaoUtil = 1, usaCreditosAntigos = false, residualDesejado = 0 } = p;
    if (!(fracaoUtil > 0 && fracaoUtil <= 1)) throw new RangeError('Informe uma fração útil maior que 0 e até 1.');
    if (![consumoFaturado, injetadoNoCiclo, recuperacaoMensal, residualDesejado].every(valor)) {
      throw new RangeError('Informe consumo, injeção, recuperação e residual em kWh.');
    }
    if (!(valor(produtividade) && produtividade > 0 && valor(wp) && wp > 0)) {
      throw new RangeError('Informe a produtividade e a potência positiva do módulo novo.');
    }
    if (usaCreditosAntigos && !valor(p.saldoElegivel)) {
      throw new RangeError('Informe o saldo elegível confirmado no extrato SCEE.');
    }
    const modulos = p.modulosAtuais || [];
    if (modulos.some(m => !Number.isInteger(m.qtd) || m.qtd <= 0 || !valor(m.wp) || m.wp === 0)) {
      throw new RangeError('Revise a quantidade e a potência dos módulos existentes.');
    }
    const kwpAtual = modulos.length
      ? modulos.reduce((total, m) => total + m.qtd * m.wp, 0) / 1000
      : valor(p.kwpAtual) ? p.kwpAtual : null;
    const placasExistentes = modulos.length
      ? modulos.reduce((total, m) => total + m.qtd, 0)
      : kwpAtual === 0 ? 0
        : kwpAtual !== null && valor(p.wpAtual) && p.wpAtual > 0
          ? Math.round(kwpAtual * 1000 / p.wpAtual) : null;

    const descoberto = Math.max(0, consumoFaturado - injetadoNoCiclo);
    const residual = Math.max(0, descoberto - recuperacaoMensal
      - (usaCreditosAntigos ? p.saldoElegivel : 0) - residualDesejado);
    const kwhNovos = residual / fracaoUtil;
    const kwpTeorico = kwhNovos / produtividade;
    const numeroExato = kwhNovos * 1000 / produtividade / wp;
    const placasNovas = Math.ceil(numeroExato - Number.EPSILON * numeroExato);
    const kwpAdicional = placasNovas * wp / 1000;
    const geracaoNova = kwpAdicional * produtividade;

    return { descoberto, residual, kwhNovos, kwpTeorico, placasNovas, kwpAdicional, geracaoNova,
      sobra: Math.max(0, injetadoNoCiclo + recuperacaoMensal + geracaoNova * fracaoUtil - consumoFaturado),
      kwpAtual, placasExistentes, kwpTotal: kwpAtual === null ? null : kwpAtual + kwpAdicional };
  }

  function sugerirInversor({ kwpTotal, catalogo = [], potenciasInversorKW = [],
    fornecimento, inversorAtual, overloadMax = 1.4 }) {
    if (!(valor(kwpTotal) && kwpTotal > 0 && overloadMax >= 1 && Number.isFinite(overloadMax))) return null;
    const fase = s => {
      const t = texto(s);
      if (/^(1|mono)/.test(t)) return 1;
      if (/^(2|bi)/.test(t)) return 2;
      if (/^(3|tri)/.test(t)) return 3;
      return null;
    };
    const faseUC = fase(fornecimento);
    const fonte = catalogo.length ? 'catalogo' : 'config';
    // O catálogo (produtos_inversores) grava em W: PotenciaAtivaNomCA_W e PotenciaMaxCC_W.
    const kwDe = (m, campo) => {
      const kw = Number(m?.[campo]);
      if (Number.isFinite(kw) && kw > 0) return kw;
      const w = Number(m?.[campo + '_W']);
      return Number.isFinite(w) && w > 0 ? w / 1000 : NaN;
    };
    // Rede 127/220 V: inversor monofásico de 220 V liga entre duas fases (UC bifásica ou trifásica);
    // trifásico de 220 V só em UC trifásica; monofásico de 127 V em qualquer UC com neutro.
    // Modelo marcado sem registro no Inmetro não é sugerido.
    const cabe = m => {
      if (m.RegistroInmetro === false) return false;
      if (faseUC === null) return true;
      const f = fase(m.Fases);
      const v = Number(m.TensaoCANominalV);
      if (f === 1) return Number.isFinite(v) && v <= 140 ? true : faseUC >= 2;
      if (f === 2) return faseUC >= 2;
      if (f === 3) return faseUC === 3;
      return false;
    };
    const compat = catalogo.filter(cabe);
    const potencia = m => kwDe(m, 'PotenciaAtivaNomCA');
    const kwMinimo = kwpTotal / overloadMax;
    const kw = Math.min(...(catalogo.length ? compat.map(potencia) : potenciasInversorKW)
      .filter(n => valor(n) && n > 0 && n + 1e-9 >= kwMinimo));
    const maxCC = kwDe(inversorAtual, 'PotenciaMaxCC');
    const atualSuporta = inversorAtual && potencia(inversorAtual) > 0
      ? potencia(inversorAtual) + 1e-9 >= kwMinimo && (!(maxCC > 0) || kwpTotal <= maxCC)
      : null;
    return { kwMinimo, kw: Number.isFinite(kw) ? kw : null, fonte,
      overload: Number.isFinite(kw) ? kwpTotal / kw : null,
      modelos: compat.filter(m => Math.abs(potencia(m) - kw) < 1e-9), atualSuporta };
  }

  function linha(tarifa, quantidade, sinal = 1) {
    const escalar = n => Number.isFinite(n) ? centavos(sinal * quantidade * n) : null;
    return { tipo: tarifa.tipo, descricao: tarifa.descricao, quantidade: tarifa.ocultarQuantidade ? null : quantidade,
      precoComTributos: tarifa.precoComTributos ?? null, tarifaSemTributos: tarifa.tarifaSemTributos ?? null,
      pisCofins: escalar(tarifa.pisCofinsPorKWh), icms: escalar(tarifa.icmsPorKWh),
      valor: escalar(tarifa.valorPorKWh ?? tarifa.precoComTributos) };
  }


  function tarifasDaFatura(f, { faixasConsumo = [], bandeiraVerde = false,
    regimeAtual, pisoDisponibilidade } = {}) {
    const itens = (f.itens || []).filter(item => item.noTotal !== false);
    const linhas = tipo => itens.filter(item => item.tipo === tipo);
    const taxa = (item, base, valorPorKWh = false) => ({
      tipo: item.tipo, descricao: item.descricao, precoComTributos: item.precoComTributos,
      tarifaSemTributos: item.tarifaSemTributos, sinal: item.valor < 0 ? -1 : 1,
      valorPorKWh: valorPorKWh && Number.isFinite(item.valor) ? Math.abs(item.valor) / base : null,
      pisCofinsPorKWh: Number.isFinite(item.pisCofins) ? Math.abs(item.pisCofins) / base : null,
      icmsPorKWh: Number.isFinite(item.icms) ? Math.abs(item.icms) / base : null
    });
    const consumo = linhas('consumo').filter(item => item.quantidade > 0 && valor(item.precoComTributos));
    if (!faixasConsumo.length && !/social|baixa renda/.test(texto(f.subclasse))
        && consumo.length === 1 && texto(f.modalidade) === 'convencional') {
      faixasConsumo = [taxa(consumo[0], consumo[0].quantidade)];
    }
    const porRegime = {};
    const tipoGd = { 'GD II': 'gd2', 'GD III': 'gd3' }[regimeAtual];
    const q = f.consumoCompensado;
    if (q > 0 && regimeAtual) {
      const cobrancaCompensada = linhas('consumoCompensado');
      const deducoes = [...linhas('energiaInjetada'), ...linhas('creditoAnterior')];
      const cobrancaRede = tipoGd ? linhas(tipoGd) : [];
      const bruto = linhas('sceeBruto');
      const liquido = linhas('sceeLiquido');
      const todasConferiveis = cobrancaCompensada.length > 0 && deducoes.length > 0
        && (!tipoGd || cobrancaRede.length > 0)
        && ((bruto.length === 0 && liquido.length === 0) || (bruto.length === 1 && liquido.length === 1))
        && [...cobrancaCompensada, ...deducoes, ...cobrancaRede, ...bruto, ...liquido]
          .every(i => Number.isFinite(i.valor));
      if (todasConferiveis) {
        // Reaproveita os valores unitários observados. As deduções por competência
        // viram uma linha, porque o uso de crédito é recalculado no novo ciclo.
        const soma = (lista, campo) => lista.every(i => Number.isFinite(i[campo]))
          ? lista.reduce((a, b) => a + b[campo], 0) : null;
        const valorDeduzido = soma(deducoes, 'valor');
        const qtdDeduzida = soma(deducoes, 'quantidade');
        const tarifaDeduzida = deducoes.every(i => valor(i.tarifaSemTributos))
          && new Set(deducoes.map(i => i.tarifaSemTributos)).size === 1
          ? deducoes[0].tarifaSemTributos : null;
        const deducao = taxa({
          tipo: 'energiaInjetada', descricao: 'Energia ativa injetada usada na compensação',
          valor: valorDeduzido, pisCofins: soma(deducoes, 'pisCofins'), icms: soma(deducoes, 'icms'),
          precoComTributos: Math.abs(valorDeduzido) / (qtdDeduzida > 0 ? qtdDeduzida : q),
          tarifaSemTributos: tarifaDeduzida
        }, q, true);
        porRegime[regimeAtual] = [
          ...cobrancaCompensada.map(item => taxa(item, q, true)), deducao,
          ...cobrancaRede.map(item => taxa(item, q, true)),
          ...[...bruto, ...liquido].map(item => ({ ...taxa(item, q, true), ocultarQuantidade: true }))
        ];
      }
    }
    const quantidadeSem = f.consumoSemCompensacao;
    const porBandeira = linhas('bandeira');
    const bandeiras = quantidadeSem > 0 && porBandeira.length
      ? porBandeira.map(item => taxa(item, quantidadeSem, true))
      : bandeiraVerde ? [{ precoComTributos: 0 }] : [];
    return { faixasConsumo, bandeiras, porRegime, pisoDisponibilidade };
  }

  function montarFaturaSimulada(cenario, tarifas, itensFinanceiros = [], opcoes = {}) {
    const { semCompensacao, compensadoPorRegime } = cenario;
    const { faixasConsumo = [], bandeiras = [], porRegime = {}, pisoDisponibilidade } = tarifas;
    const linhas = [];
    let restante = semCompensacao;
    for (const faixa of faixasConsumo) {
      if (restante <= 0) break;
      const qtd = Math.min(restante, faixa.kwhFaixa ?? Infinity);
      linhas.push(linha({ tipo: 'consumo', descricao: 'Consumo', ...faixa }, qtd));
      restante -= qtd;
    }
    const dadosAusentes = [];
    if (restante > 1e-8) dadosAusentes.push('Tarifa de consumo para todas as faixas.');
    if (semCompensacao > 0) {
      if (!bandeiras.length) dadosAusentes.push('Tarifa da bandeira no ciclo.');
      for (const tarifa of bandeiras) {
        const qtd = semCompensacao * (tarifa.fracaoCiclo ?? 1);
        if ((tarifa.valorPorKWh ?? tarifa.precoComTributos) !== 0) linhas.push(linha({ tipo: 'bandeira', ...tarifa }, qtd));
      }
    }
    for (const [regime, quantidade] of Object.entries(compensadoPorRegime)) {
      if (!(quantidade > 0)) continue;
      const regras = porRegime[regime];
      if (!regras?.length) {
        dadosAusentes.push('Tarifas para energia compensada no regime ' + regime + '.');
        continue;
      }
      for (const tarifa of regras) linhas.push(linha(tarifa, quantidade, tarifa.sinal ?? 1));
    }

    if (linhas.some(item => item.valor === null)) dadosAusentes.push('Preço com tributos em rubrica tarifária.');
    const subtotalEnergia = centavos(linhas.reduce((total, item) => total + (item.valor ?? 0), 0));
    if (!dadosAusentes.length && valor(pisoDisponibilidade) && subtotalEnergia < pisoDisponibilidade) {
      linhas.push({ tipo: 'piso', descricao: 'Complemento do custo de disponibilidade',
        valor: centavos(pisoDisponibilidade - subtotalEnergia) });
    }
    const eventuais = [];
    for (const item of itensFinanceiros) {
      if (item.noTotal === false) continue;
      if (opcoes.recorrente && item.eventual) eventuais.push(item);
      else linhas.push(item);
    }
    if (linhas.some(item => !Number.isFinite(item.valor)) && !dadosAusentes.length) {
      dadosAusentes.push('Valor de item financeiro.');
    }
    return { linhas, eventuais, dadosAusentes,
      total: dadosAusentes.length ? null : centavos(linhas.reduce((total, item) => total + item.valor, 0)) };
  }

  function simularCenarios({ fatura, recuperacaoMensal, geracaoNova, fracaoUtil = 1,
    fracaoAutoconsumoRecuperacao, fracaoAutoconsumoNova, autoconsumoOriginal,
    regimeAtual, regimeExpansao = 'GD II', tarifas, recorrente = false, futuro = false }) {
    const { consumoFaturado, injetadoNoCiclo, consumoCompensado } = fatura;
    if (![consumoFaturado, injetadoNoCiclo, recuperacaoMensal, geracaoNova].every(valor)) {
      throw new RangeError('Revise os dados de consumo, injeção e geração.');
    }
    if (!(fracaoUtil > 0 && fracaoUtil <= 1)) throw new RangeError('Informe uma fração útil maior que 0 e até 1.');
    if ([fracaoAutoconsumoRecuperacao, fracaoAutoconsumoNova]
      .some(n => n != null && (!valor(n) || n > 1))) {
      throw new RangeError('Informe uma fração de autoconsumo entre 0 e 1.');
    }
    const premissas = [];
    const adicionais = [];
    if (recuperacaoMensal > 0) {
      if (fracaoAutoconsumoRecuperacao == null) premissas.push('Recuperação estimada integralmente como injeção elegível.');
      adicionais.push({ kwh: recuperacaoMensal, autoconsumo: fracaoAutoconsumoRecuperacao ?? 0, regime: regimeAtual });
    }
    const daExpansao = geracaoNova * fracaoUtil;
    if (daExpansao > 0 && fracaoAutoconsumoNova == null) premissas.push('Geração nova útil estimada integralmente como injeção elegível.');

    const creditosUsados = valor(fatura.creditosAntigosUsados) ? fatura.creditosAntigosUsados
      : valor(consumoCompensado) ? Math.max(0, consumoCompensado - injetadoNoCiclo) : null;
    const saldoConhecido = valor(fatura.saldoInicialElegivel);
    const saldoInicial = saldoConhecido ? fatura.saldoInicialElegivel : futuro ? null : creditosUsados;
    if (!saldoConhecido) {
      premissas.push('Saldo não informado na fatura. Solicitar extrato SCEE.');
      if (saldoInicial > 0) premissas.push('Créditos usados na fatura representam o saldo inicial mínimo comprovado.');
    }
    if (!valor(autoconsumoOriginal)) premissas.push('Conta sem solar estimada sobre o consumo de rede observado.');

    function montar(nome, geracoes, usarCreditos) {
      const rede = Math.max(0, consumoFaturado
        - geracoes.reduce((soma, g) => soma + g.kwh * g.autoconsumo, 0));
      const injecoes = [{ regime: regimeAtual, kwh: injetadoNoCiclo }]
        .concat(geracoes.map(g => ({ regime: g.regime, kwh: g.kwh * (1 - g.autoconsumo) })));
      const injetado = injecoes.reduce((soma, g) => soma + g.kwh, 0);
      const atualObservado = nome === 'atualCom' && !futuro && valor(consumoCompensado);
      let semCompensacao = atualObservado ? consumoCompensado : rede;
      const compensadoPorRegime = {};
      const aplicar = (regime, kwh) => {
        const compensar = Math.min(kwh, semCompensacao);
        if (compensar > 0) {
          const chave = regime || 'não informado';
          compensadoPorRegime[chave] = (compensadoPorRegime[chave] || 0) + compensar;
        }
        semCompensacao -= compensar;
        return compensar;
      };
      for (const injecao of injecoes) aplicar(injecao.regime, injecao.kwh);
      const creditoUsado = usarCreditos && semCompensacao > 0 && saldoInicial === null
        ? null : usarCreditos ? aplicar(fatura.regimeCreditosAntigos || regimeAtual,
          atualObservado ? creditosUsados ?? 0 : saldoInicial ?? 0) : 0;
      const compensado = Object.values(compensadoPorRegime).reduce((a, b) => a + b, 0);
      const creditoNovo = Math.max(0, injetado - Math.min(injetado, atualObservado ? consumoCompensado : rede));
      const cenario = { nome, rede, injetado, creditoUsado,
        compensado: creditoUsado === null ? null : compensado,
        semCompensacao: creditoUsado === null ? null : Math.max(0, rede - compensado),
        creditoNovo, saldoInicial, saldoInicialConfirmado: saldoConhecido,
        saldoFinal: saldoInicial === null ? null : saldoInicial - (creditoUsado ?? 0) + creditoNovo,
        compensadoPorRegime };
      if (creditoUsado === null) {
        return { ...cenario, total: null, linhas: [], dadosAusentes: ['Saldo elegível no início do ciclo.'] };
      }
      if (atualObservado && !recorrente && valor(fatura.total)) {
        return { ...cenario, total: fatura.total, observado: true, linhas: fatura.itens || [],
          dadosAusentes: [] };
      }
      return { ...cenario, ...montarFaturaSimulada(cenario, tarifas, fatura.itensFinanceiros, { recorrente }) };
    }

    const expandida = adicionais.concat({ kwh: daExpansao, autoconsumo: fracaoAutoconsumoNova ?? 0, regime: regimeExpansao });
    const atualCom = montar('atualCom', [], true);
    const atualSem = montar('atualSem', [], false);
    const recuperadaCom = montar('recuperadaCom', adicionais, true);
    const recuperadaSem = montar('recuperadaSem', adicionais, false);
    const expansaoCom = montar('expansaoCom', expandida, true);
    const expansaoSem = montar('expansaoSem', expandida, false);
    const redeSemSolar = consumoFaturado + (valor(autoconsumoOriginal) ? autoconsumoOriginal : 0);
    const semSolar = { nome: 'semSolar', rede: redeSemSolar, injetado: 0, creditoUsado: 0, compensado: 0,
      semCompensacao: redeSemSolar, creditoNovo: 0, saldoFinal: null, compensadoPorRegime: {} };
    Object.assign(semSolar, montarFaturaSimulada(semSolar, tarifas, fatura.itensFinanceiros, { recorrente }));

    const diferenca = (a, b) => a === null || b === null ? null : centavos(a - b);
    const economia = (base, projetada) => ({ contaReferencia: base.total, contaExpansao: projetada.total,
      valor: diferenca(base.total, projetada.total) });
    return { cenarios: [atualCom, atualSem, recuperadaCom, recuperadaSem, expansaoCom, expansaoSem, semSolar],
      economiaComCreditos: economia(atualCom, expansaoCom),
      economiaSemCreditos: economia(atualSem, expansaoSem),
      valorCreditosUsados: diferenca(atualSem.total, atualCom.total), premissas };
  }

  function compararFioB({ inicio, fim, vigencias = [], subclasse, modalidade, posto, percentuais = {},
    cobrado, precoComTributos, kwhCompensados }) {
    const de = dia(inicio);
    const ate = dia(fim);
    const naoComparavel = motivo => ({ comparavel: false, motivo });
    if (!(ate > de) || !(cobrado > 0) || !subclasse || !modalidade) {
      return naoComparavel('Faltam dados do ciclo, da classificação ou da tarifa cobrada.');
    }
    const classe = texto(subclasse);
    const modal = s => texto(s).replace(/^tarifa /, '');
    const classeCompativel = s => {
      const nome = texto(s);
      if (nome === classe) return true;
      return ['desconto social', 'tarifa social'].includes(classe)
        && nome.startsWith('residencial ' + classe + ' ');
    };
    if (modal(modalidade) === 'branca' && !posto) return naoComparavel('Informe o posto tarifário.');
    const vigenciasDaUC = vigencias.filter(v => classeCompativel(v.subclasse)
      && modal(v.modalidade) === modal(modalidade) && (!posto || texto(v.posto) === texto(posto)));
    const fontes = new Map();
    let soma = 0;
    for (let d = de; d < ate; d += DIA) {
      const vigentes = vigenciasDaUC.filter(v => dia(v.inicio) <= d && dia(v.fim) >= d);
      const ano = new Date(d).getUTCFullYear();
      const percentual = percentuais[ano];
      const valoresVigentes = new Set(vigentes.map(v => v.tarifa));
      const resolucoes = new Set(vigentes.map(v => v.resolucao));
      if (valoresVigentes.size !== 1 || resolucoes.size !== 1 || !(percentual > 0 && percentual <= 1)
          || !(vigentes[0].tarifa > 0)) {
        return naoComparavel('Falta uma referência única e vigente para todos os dias do ciclo.');
      }
      const v = vigentes[0];
      soma += v.tarifa * percentual;
      for (const fonte of vigentes) {
        fontes.set([fonte.inicio, fonte.subclasse, fonte.posto, ano].join('|'), { ...fonte, ano, percentual });
      }
    }
    const previsto = soma / ((ate - de) / DIA);
    const diferencaCiclo = valor(kwhCompensados) ? (cobrado - previsto) * kwhCompensados : null;
    return { comparavel: true, cobrado, previsto, diferencaPct: (cobrado / previsto - 1) * 100,
      diferencaReais: diferencaCiclo === null ? null : centavos(diferencaCiclo),
      diferencaReaisComTributos: diferencaCiclo === null || !valor(precoComTributos)
        ? null : centavos(diferencaCiclo * precoComTributos / cobrado), fontes: Array.from(fontes.values()) };
  }

  function projetarTarifaGD2(observada, percentualObservado, percentualProjetado, variacaoFioB = 1) {
    if (!valor(observada) || ![percentualObservado, percentualProjetado].every(n => n > 0 && n <= 1)
        || !(variacaoFioB > 0 && Number.isFinite(variacaoFioB))) return null;
    return observada * percentualProjetado / percentualObservado * variacaoFioB;
  }

  // Referência GD II tirada de uma fatura lida: a linha "Parc. Inj. s/ Desc. – GD II".
  // Linhas com tarifas diferentes no mesmo ciclo não viram referência.
  function referenciaGD2DaFatura(f) {
    const linhas = (f?.itens || []).filter(i => i.tipo === 'gd2' && i.noTotal !== false);
    if (!linhas.length || !/^\d{4}-(0[1-9]|1[0-2])$/.test(f.referencia || '')) return null;
    if (!linhas.every(i => i.quantidade > 0 && valor(i.tarifaSemTributos) && valor(i.precoComTributos))) return null;
    if (new Set(linhas.map(i => i.tarifaSemTributos + '|' + i.precoComTributos)).size !== 1) return null;
    const qtd = linhas.reduce((s, i) => s + i.quantidade, 0);
    const porKWh = campo => linhas.every(i => Number.isFinite(i[campo]))
      ? linhas.reduce((s, i) => s + Math.abs(i[campo]), 0) / qtd : null;
    const { tarifaSemTributos, precoComTributos } = linhas[0];
    if (!(precoComTributos > tarifaSemTributos && tarifaSemTributos > 0)) return null;
    return { referencia: f.referencia, tarifaSemTributos, precoComTributos,
      pisCofinsPorKWh: porKWh('pisCofins'), icmsPorKWh: porKWh('icms'),
      subclasse: f.subclasse || null, modalidade: f.modalidade || null };
  }

  // Tarifa do kWh compensado nesta UC: a linha de consumo compensado ou, sem SCEE, a faixa única de consumo.
  function tarifaCompensadaDaFatura(f, tarifas = {}) {
    const linhas = (f?.itens || []).filter(i => i.tipo === 'consumoCompensado' && i.noTotal !== false
      && i.quantidade > 0 && valor(i.precoComTributos) && valor(i.tarifaSemTributos));
    if (linhas.length && new Set(linhas.map(i => i.tarifaSemTributos + '|' + i.precoComTributos)).size === 1) {
      const qtd = linhas.reduce((s, i) => s + i.quantidade, 0);
      const porKWh = campo => linhas.every(i => Number.isFinite(i[campo]))
        ? linhas.reduce((s, i) => s + Math.abs(i[campo]), 0) / qtd : null;
      return { precoComTributos: linhas[0].precoComTributos, tarifaSemTributos: linhas[0].tarifaSemTributos,
        pisCofinsPorKWh: porKWh('pisCofins'), icmsPorKWh: porKWh('icms') };
    }
    const faixas = tarifas.faixasConsumo || [];
    if (!linhas.length && faixas.length === 1 && valor(faixas[0].precoComTributos) && valor(faixas[0].tarifaSemTributos)) {
      const { precoComTributos, tarifaSemTributos, pisCofinsPorKWh = null, icmsPorKWh = null } = faixas[0];
      return { precoComTributos, tarifaSemTributos, pisCofinsPorKWh, icmsPorKWh };
    }
    return null;
  }

  // Rubricas GD II montadas com a referência, pelo atalho da skill (seção 4):
  // líquido = kWh × (tarifa compensada s/ trib − GD II s/ trib);
  // bruto = líquido × (GD II c/ trib ÷ GD II s/ trib).
  // `fator` ajusta a GD II ao percentual do Fio B do ano simulado.
  function rubricasGD2DaReferencia({ referencia, compensado, fator = 1 }) {
    if (!referencia || !compensado || !(fator > 0 && Number.isFinite(fator))) return null;
    const gdS = referencia.tarifaSemTributos * fator;
    const gdC = referencia.precoComTributos * fator;
    if (!(gdS > 0 && gdC > gdS)) return null;
    const liquido = compensado.tarifaSemTributos - gdS;
    if (!(liquido > 0)) return null;
    const bruto = liquido * gdC / gdS;
    const pis = referencia.pisCofinsPorKWh, icms = referencia.icmsPorKWh;
    const fracaoIcms = Number.isFinite(pis) && Number.isFinite(icms) && pis + icms > 0 ? icms / (pis + icms) : null;
    const tributosBruto = bruto - liquido;
    const compensada = { precoComTributos: compensado.precoComTributos, tarifaSemTributos: compensado.tarifaSemTributos,
      pisCofinsPorKWh: compensado.pisCofinsPorKWh, icmsPorKWh: compensado.icmsPorKWh };
    return [
      { ...compensada, tipo: 'consumoCompensado', descricao: 'Consumo compensado' },
      { ...compensada, tipo: 'energiaInjetada', descricao: 'Energia ativa injetada usada na compensação', sinal: -1 },
      { tipo: 'gd2', descricao: 'Parc. Inj. s/ Desc. – GD II', precoComTributos: gdC, tarifaSemTributos: gdS,
        pisCofinsPorKWh: Number.isFinite(pis) ? pis * fator : null, icmsPorKWh: Number.isFinite(icms) ? icms * fator : null },
      { tipo: 'sceeBruto', descricao: 'Benefício tarifário bruto SCEE', valorPorKWh: bruto, ocultarQuantidade: true,
        pisCofinsPorKWh: fracaoIcms === null ? null : tributosBruto * (1 - fracaoIcms),
        icmsPorKWh: fracaoIcms === null ? null : tributosBruto * fracaoIcms },
      { tipo: 'sceeLiquido', descricao: 'Benefício tarifário líquido SCEE', valorPorKWh: liquido, sinal: -1,
        ocultarQuantidade: true }
    ];
  }

  const api = { conferirFatura, calcularRecuperacao, dimensionar, sugerirInversor,
    tarifasDaFatura, montarFaturaSimulada, simularCenarios, compararFioB, projetarTarifaGD2,
    referenciaGD2DaFatura, tarifaCompensadaDaFatura, rubricasGD2DaReferencia };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SGExpansaoCalculo = api;
})(typeof window === 'undefined' ? globalThis : window);
