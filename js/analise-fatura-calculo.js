(function (root) {
  'use strict';

  // Tudo é calculado por ciclo de leitura: do dia seguinte à leitura anterior até a leitura atual, inclusive.
  // O módulo devolve só números e códigos de aviso; o texto para o cliente fica na tela.
  const LIMITE_ACUMULO = 1.5;
  const MARGEM_ANO = 40;

  const DIA_MS = 86400000;
  const finito = valor => typeof valor === 'number' && Number.isFinite(valor);
  const numero = valor => finito(valor) ? valor : 0;

  function paraMs(iso) {
    const [a, m, d] = String(iso).split('-').map(Number);
    return Date.UTC(a, m - 1, d);
  }
  function deMs(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function somarDias(iso, n) { return deMs(paraMs(iso) + n * DIA_MS); }
  function diasEntre(inicio, fim) { return Math.round((paraMs(fim) - paraMs(inicio)) / DIA_MS) + 1; }
  function listarDias(inicio, fim) {
    const lista = [];
    for (let dia = inicio; dia <= fim; dia = somarDias(dia, 1)) lista.push(dia);
    return lista;
  }
  function diasDoMes(iso) {
    const [a, m] = iso.split('-').map(Number);
    return new Date(Date.UTC(a, m, 0)).getUTCDate();
  }
  function dataValida(a, m, d) {
    const data = new Date(Date.UTC(a, m - 1, d));
    return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d;
  }
  const iso = (a, m, d) => `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  function cicloDaFatura(fatura) {
    const inicio = somarDias(fatura.dataLeituraAnterior, 1);
    const fim = fatura.dataLeituraAtual;
    return { inicio, fim, dias: diasEntre(inicio, fim) };
  }

  // ---------- Leitura do texto colado ----------

  function numeroDoTexto(texto) {
    let t = texto.trim();
    if (/^(?:sem\s+dado|[—–])$/i.test(t)) return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    const valor = Number(t);
    return Number.isFinite(valor) ? valor : null;
  }

  function anoParaDiaMes(dia, mes, inicio, fim) {
    const anoInicio = Number(inicio.slice(0, 4)), anoFim = Number(fim.slice(0, 4));
    const minimo = somarDias(inicio, -MARGEM_ANO), maximo = somarDias(fim, MARGEM_ANO);
    let melhor = null;
    for (let ano = anoInicio - 1; ano <= anoFim + 1; ano++) {
      if (!dataValida(ano, mes, dia)) continue;
      const data = iso(ano, mes, dia);
      if (data < minimo || data > maximo) continue;
      const distancia = data < inicio ? diasEntre(data, inicio) : data > fim ? diasEntre(fim, data) : 0;
      if (!melhor || distancia < melhor.distancia) melhor = { data, distancia };
    }
    return melhor ? melhor.data : null;
  }

  function lerGeracaoColada(texto, { inicio, fim } = {}) {
    const avisos = [];
    const porData = new Map();
    const linhas = String(texto ?? '').split(/\r?\n/);
    for (const linha of linhas) {
      const casou = linha.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?!\d)(.*)$/);
      if (!casou) continue;
      const dia = Number(casou[1]), mes = Number(casou[2]);
      let data;
      if (casou[3]) {
        data = dataValida(Number(casou[3]), mes, dia) ? iso(Number(casou[3]), mes, dia) : null;
      } else if (inicio && fim) {
        data = anoParaDiaMes(dia, mes, inicio, fim);
      } else {
        const ano = new Date().getUTCFullYear();
        data = dataValida(ano, mes, dia) ? iso(ano, mes, dia) : null;
      }
      if (!data) {
        avisos.push({ codigo: 'data-fora-do-periodo', linha: linha.trim() });
        continue;
      }
      const valores = (casou[4].match(/sem\s+dado|[—–]|-?\d{1,3}(?:\.\d{3})+,\d+|-?\d+(?:[.,]\d+)?/gi) || []).map(numeroDoTexto);
      if (porData.has(data)) avisos.push({ codigo: 'repetido', data });
      porData.set(data, { data, gerado: valores[0] ?? null, previsto: valores[1] ?? null });
    }
    const dias = [...porData.values()].sort((a, b) => a.data < b.data ? -1 : 1);
    return { dias, avisos };
  }

  // ---------- Período e ciclos ----------

  function ordenadas(faturas) {
    return faturas.slice().sort((a, b) => a.dataLeituraAtual < b.dataLeituraAtual ? -1 : 1);
  }

  function periodoParaColar(faturas) {
    const ciclos = ordenadas(faturas).map(fatura => ({ referencia: fatura.referencia, ...cicloDaFatura(fatura) }));
    const inicio = ciclos[0].inicio, fim = ciclos[ciclos.length - 1].fim;
    return { inicio, fim, dias: diasEntre(inicio, fim), ciclos };
  }

  function montarCiclo(fatura, ciclo, geracao) {
    const { dias } = ciclo;
    const injetado = numero(fatura.injetadoNoCiclo), consumo = numero(fatura.consumoMedido);
    const completo = { ...ciclo, ...geracao };
    const autoconsumo = geracao.modo === 'semSolar' ? 0 : finito(geracao.geracao) ? geracao.geracao - injetado : null;
    const casa = autoconsumo === null ? null : consumo + autoconsumo;
    const porDia = {
      geracao: finito(geracao.geracao) ? geracao.geracao / dias : null,
      autoconsumo: autoconsumo === null ? null : autoconsumo / dias,
      injecao: injetado / dias,
      rede: consumo / dias,
      casa: casa === null ? null : casa / dias
    };
    return { ...completo, autoconsumo, casa, porDia };
  }

  function mediaDe(valores) {
    return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
  }

  function cicloPorGeracao(fatura, ciclo, mapa, excluir) {
    const avisos = [];
    const diasDoCiclo = listarDias(ciclo.inicio, ciclo.fim);
    const validos = [];
    let comDado = 0;
    const previstos = [];
    for (const data of diasDoCiclo) {
      const registro = mapa.get(data);
      if (registro && finito(registro.previsto)) previstos.push(registro.previsto);
      if (excluir.has(data) || !registro || !finito(registro.gerado)) continue;
      comDado++;
      if (finito(registro.previsto) && registro.gerado > LIMITE_ACUMULO * registro.previsto) {
        avisos.push({ codigo: 'acumulo', data, gerado: registro.gerado, previsto: registro.previsto });
        continue;
      }
      validos.push(registro);
    }
    const mediaDia = mediaDe(validos.map(r => r.gerado));
    const previstoValidos = validos.filter(r => finito(r.previsto)).map(r => r.previsto);
    const previstoDiaMedio = mediaDe(previstoValidos);
    const previstoCiclo = previstos.length === ciclo.dias ? previstos.reduce((a, b) => a + b, 0)
      : previstos.length ? mediaDe(previstos) * ciclo.dias : null;
    let geracao = null;
    if (mediaDia !== null) {
      geracao = validos.length === ciclo.dias ? validos.reduce((a, r) => a + r.gerado, 0) : mediaDia * ciclo.dias;
    } else {
      avisos.push({ codigo: 'sem-geracao' });
    }
    const desempenho = mediaDia !== null && previstoDiaMedio ? mediaDia / previstoDiaMedio : null;
    return montarCiclo(fatura, ciclo, {
      modo: 'geracao', diasComDado: comDado, diasValidos: validos.length, avisos, mediaDia, previstoDiaMedio,
      previstoCiclo, desempenho, geracao, estimada: validos.length < ciclo.dias
    });
  }

  function cicloPorDesempenho(fatura, ciclo, desempenho, kwp, produtividadeMensal) {
    let previstoCiclo = 0;
    for (const data of listarDias(ciclo.inicio, ciclo.fim)) {
      previstoCiclo += kwp * produtividadeMensal[Number(data.slice(5, 7)) - 1] / diasDoMes(data);
    }
    const geracao = finito(desempenho) ? desempenho * previstoCiclo : null;
    return montarCiclo(fatura, ciclo, {
      modo: 'desempenho', diasComDado: 0, diasValidos: 0, avisos: [],
      mediaDia: geracao === null ? null : geracao / ciclo.dias, previstoDiaMedio: previstoCiclo / ciclo.dias,
      previstoCiclo, desempenho: finito(desempenho) ? desempenho : null, geracao, estimada: true
    });
  }

  function analisarCiclos(faturas, { dias = [], modo = 'geracao', desempenhos = [], kwp, produtividadeMensal, excluir = [] } = {}) {
    const mapa = new Map(dias.map(dia => [dia.data, dia]));
    const fora = new Set(excluir);
    return faturas.map((fatura, i) => {
      const ciclo = cicloDaFatura(fatura);
      if (modo === 'semSolar') {
        return montarCiclo(fatura, ciclo, {
          modo, diasComDado: 0, diasValidos: 0, avisos: [], mediaDia: null, previstoDiaMedio: null,
          previstoCiclo: null, desempenho: null, geracao: 0, estimada: false
        });
      }
      if (modo === 'desempenho') return cicloPorDesempenho(fatura, ciclo, desempenhos[i], kwp, produtividadeMensal);
      return cicloPorGeracao(fatura, ciclo, mapa, fora);
    });
  }

  // ---------- Composição e preços ----------

  const ENERGIA_COMPENSADA = ['consumoCompensado', 'energiaInjetada', 'creditoAnterior', 'gd2', 'sceeBruto', 'sceeLiquido'];
  const ATRASO = ['multa', 'juros', 'correcaoMonetaria'];

  function ehAtraso(item) {
    return ATRASO.includes(item.tipo)
      || (item.tipo === 'financeiro' && /\b(?:multa|juros|corre[cç][aã]o)/i.test(item.descricao || ''));
  }

  function composicao(fatura) {
    const itens = (fatura.itens || []).filter(item => item.noTotal !== false);
    const soma = filtro => itens.filter(filtro).reduce((total, item) => total + numero(item.valor), 0);
    const energiaCompensada = soma(item => ENERGIA_COMPENSADA.includes(item.tipo));
    const semCompensacao = soma(item => item.tipo === 'consumo');
    const cip = soma(item => item.tipo === 'cip');
    const atraso = soma(ehAtraso);
    const bandeira = soma(item => item.tipo === 'bandeira');
    const total = numero(fatura.total);
    return { energiaCompensada, semCompensacao, cip, atraso, bandeira, outros: total - (energiaCompensada + semCompensacao + cip + atraso + bandeira), total };
  }

  function precos(fatura) {
    const c = composicao(fatura);
    const linhaSem = (fatura.itens || []).find(item => item.tipo === 'consumo' && finito(item.precoComTributos));
    return {
      kwhCompensado: fatura.consumoCompensado > 0 ? c.energiaCompensada / fatura.consumoCompensado : null,
      kwhSemCredito: linhaSem ? linhaSem.precoComTributos : null,
      cipPorKwh: fatura.consumoMedido > 0 ? c.cip / fatura.consumoMedido : null
    };
  }

  // ---------- Divisão do aumento entre duas faturas ----------

  function kwhFaturado(fatura) {
    if (finito(fatura.consumoFaturado)) return fatura.consumoFaturado;
    const soma = numero(fatura.consumoCompensado) + numero(fatura.consumoSemCompensacao);
    return soma > 0 ? soma : numero(fatura.consumoMedido);
  }

  function dividirAumento(base, comparada) {
    const fB = base.fatura, fC = comparada.fatura;
    const cB = composicao(fB), cC = composicao(fC);
    const pB = precos(fB);
    const delta = {
      atraso: cC.atraso - cB.atraso, bandeira: cC.bandeira - cB.bandeira,
      outros: cC.outros - cB.outros, total: cC.total - cB.total
    };
    const cipPorKwhB = numero(pB.cipPorKwh);
    const cipVolume = numero(fC.consumoMedido) * cipPorKwhB - cB.cip;
    const cipTaxa = cC.cip - numero(fC.consumoMedido) * cipPorKwhB;
    const semSolar = [base, comparada].every(lado => lado.ciclo ? lado.ciclo.modo === 'semSolar' : !(fB.consumoCompensado > 0 || fC.consumoCompensado > 0));

    if (semSolar) {
      const kB = kwhFaturado(fB), kC = kwhFaturado(fC);
      const tarifaB = kB > 0 ? cB.semCompensacao / kB : 0;
      const tarifaC = kC > 0 ? cC.semCompensacao / kC : 0;
      const volume = (kC - kB) * tarifaB, tarifa = kC * (tarifaC - tarifaB);
      return {
        consumo: volume + cipVolume, geracao: 0, tarifa: tarifa + cipTaxa, ...delta,
        partes: { volume, tarifa, cipVolume, cipTaxa, ...delta }, kwh: { geracao: 0, consumo: 0 }
      };
    }

    const custo = (c, f) => f.consumoCompensado > 0 ? c.energiaCompensada / f.consumoCompensado : 0;
    const custoB = custo(cB, fB), custoC = custo(cC, fC);
    const kwhB = numero(fB.consumoCompensado), kwhC = numero(fC.consumoCompensado);
    const volumeCompensado = (kwhC - kwhB) * custoB;
    const precoCompensado = kwhC * (custoC - custoB);
    const deltaSem = cC.semCompensacao - cB.semCompensacao;

    const dia = (lado, campo) => lado.ciclo && lado.ciclo.porDia ? lado.ciclo.porDia[campo] : null;
    const temGeracao = [dia(base, 'geracao'), dia(comparada, 'geracao'), dia(base, 'casa'), dia(comparada, 'casa')].every(finito);
    const diasC = comparada.ciclo ? comparada.ciclo.dias : 0;
    let gEff = 0, cEff = 0, f = 0;
    if (temGeracao) {
      gEff = (dia(base, 'geracao') - dia(comparada, 'geracao')) * diasC;
      cEff = (dia(comparada, 'casa') - dia(base, 'casa')) * diasC;
      f = gEff <= 0 ? 0 : cEff <= 0 ? 1 : gEff / (gEff + cEff);
    }
    const partes = { volumeCompensado, precoCompensado, cipVolume, cipTaxa, deltaSem, ...delta };
    return {
      consumo: volumeCompensado + cipVolume + deltaSem * (1 - f), geracao: deltaSem * f,
      tarifa: precoCompensado + cipTaxa, ...delta, partes, kwh: { geracao: gEff, consumo: cEff }
    };
  }

  // ---------- Cenário com geração a 100% do previsto ----------

  function cenario100(faturas, ciclos, { saldoInicial } = {}) {
    const dados = faturas.map((fatura, i) => {
      const ciclo = ciclos[i];
      const faturado = numero(fatura.consumoCompensado) + numero(fatura.consumoSemCompensacao);
      const injetado = numero(fatura.injetadoNoCiclo);
      return { fatura, ciclo, faturado, sobraReal: injetado - faturado };
    });
    let saldo = finito(saldoInicial) ? saldoInicial
      : finito(faturas[0] && faturas[0].saldoDisponivel) ? faturas[0].saldoDisponivel - dados[0].sobraReal : null;
    return dados.map(({ fatura, ciclo, faturado, sobraReal }) => {
      const c = composicao(fatura);
      const custoKwh = fatura.consumoCompensado > 0 ? c.energiaCompensada / fatura.consumoCompensado : null;
      const completo = ciclo && finito(ciclo.geracao) && finito(ciclo.previstoCiclo);
      const inj100 = completo ? numero(fatura.injetadoNoCiclo) + (ciclo.previstoCiclo - ciclo.geracao) : null;
      const sobra = inj100 === null ? null : inj100 - faturado;
      saldo = saldo === null || sobra === null ? null : saldo + sobra;
      const energia = custoKwh === null ? null : faturado * custoKwh + c.cip;
      return {
        inj100, faturado, sobra, sobraReal, creditos: saldo,
        minimoPrevisto: completo && ciclo.previstoCiclo > 0 ? (faturado + ciclo.autoconsumo) / ciclo.previstoCiclo : null,
        faturaEstimadaSemAtraso: energia,
        faturaEstimadaComAtraso: energia === null ? null : energia + c.atraso
      };
    });
  }

  const api = { lerGeracaoColada, periodoParaColar, analisarCiclos, composicao, precos, dividirAumento, cenario100 };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SGAnaliseFatura = api;
})(typeof window === 'undefined' ? globalThis : window);
