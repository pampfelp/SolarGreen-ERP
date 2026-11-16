/*
 * PDF da Análise da conta de energia (HTML para impressão, A4).
 *
 * montarHtml(modelo) é puro e roda no Node. abrir(modelo) abre a janela e chama print.
 *
 * modelo = {
 *   cliente: { nome, uc, cidade },
 *   dataEmissao: 'AAAA-MM-DD',
 *   modo: 'geracao' | 'desempenho' | 'semSolar',
 *   faturas: [fatura do leitor, ...],                 // em ordem de leitura
 *   ciclos: SGAnaliseFatura.analisarCiclos(...),      // um por fatura
 *   dias: SGAnaliseFatura.lerGeracaoColada(...).dias, // só no modo geracao (gráfico diário)
 *   excluir: ['AAAA-MM-DD'],                          // dias incompletos, os mesmos de analisarCiclos
 *   composicoes: faturas.map(composicao),
 *   precos: faturas.map(precos),
 *   divisao: dividirAumento({fatura, ciclo}, {fatura, ciclo}),
 *   cenario: cenario100(faturas, ciclos, {saldoInicial}),   // ausente no modo semSolar
 *   base, comparada: índices (em faturas) das duas faturas comparadas,
 *   fatos: opcional, só o que não vem das faturas e o analista confirmou:
 *     { reajuste: { percentual: 6.94, data: '18/09', norma: 'REH 3.608/2026' },
 *       bandeiras: { base: 'amarela', comparada: 'verde' },
 *       faturaAnterior: { referencia: '2026-08', total: 325.61, faturado: 537, injetado: 521 },
 *       historicoChuva: true,           // injeção abaixo do consumo da rede nos meses de chuva
 *       nenhumaCausaSozinha: true }     // "nenhuma das duas sozinha teria esgotado os créditos"
 * }
 * O item "Fatura em aberto" sai só quando a última fatura traz `avisosFinanceiros` (campo do leitor,
 * com linhas de "débitos anteriores" ou "contas em atraso"); o leitor não lê o valor em aberto.
 */
(function (root) {
  'use strict';

  const C = { marca: '#003122', lima: '#78D800', verde: '#4e9b00', azul: '#2a78d6', laranja: '#eb6834',
    aqua: '#1baf7a', violeta: '#6250d6', tinta: '#0b0b0b', tinta2: '#52514e', grade: '#e4e3df' };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro',
    'novembro', 'dezembro'];
  const NUMEROS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];
  const LIMITE_ACUMULO = 1.5;
  const RODAPE = 'Solar Green Suporte · Valores das faturas Equatorial Pará e do monitoramento do inversor';

  // ---------- formatação ----------
  const fmt = [0, 1, 2, 3].map(casas => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
  const fmtAte1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const finito = v => typeof v === 'number' && Number.isFinite(v);
  const SEM = '—';

  function esc(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, l => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[l]));
  }
  const num = (v, casas = 2) => finito(v) ? fmt[casas].format(Math.abs(v) < 0.5 * Math.pow(10, -casas) ? 0 : v) : SEM;
  const reais = (v, casas = 2) => finito(v) ? (v < 0 && Math.abs(v) >= 0.005 ? '−' : '') + 'R$ ' + num(Math.abs(v), casas) : SEM;
  const sinal = (v, texto) => (v < 0 ? '−' : '+') + texto;
  const inteiro = v => Math.round(v);
  const pct = v => finito(v) ? inteiro(100 * v) + '%' : SEM;
  const dataBr = iso => iso ? iso.split('-').reverse().join('/') : '';
  const diaMes = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  const palavra = n => n >= 0 && n <= 10 ? NUMEROS[n] : String(n);
  const juntar = lista => lista.length < 2 ? lista.join('') : lista.slice(0, -1).join(', ') + ' e ' + lista[lista.length - 1];
  const mesNome = f => MESES[Number(f.referencia.slice(5, 7)) - 1];
  const mesAbrev = f => cap(mesNome(f).slice(0, 3)) + '/' + f.referencia.slice(0, 4);
  const refBr = f => f.referencia.slice(5, 7) + '/' + f.referencia.slice(0, 4);
  const nomeFatura = f => 'Fatura ' + refBr(f);

  function somarDias(iso, n) {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
  }
  function diasEntre(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }

  // ---------- gráficos SVG ----------
  const FONTE = "font-family=\"Inter, Arial, sans-serif\"";
  const t = (x, y, texto, { tam = 8, peso = 400, ancora = 'middle', cor = C.tinta, extra = '' } = {}) =>
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${tam}" font-weight="${peso}" text-anchor="${ancora}" fill="${cor}" ${FONTE} ${extra}>${esc(texto)}</text>`;

  function quebrar(texto, max) {
    const linhas = [];
    let atual = '';
    for (const palavraTexto of texto.split(' ')) {
      if (atual && (atual + ' ' + palavraTexto).length > max) { linhas.push(atual); atual = palavraTexto; }
      else atual = atual ? atual + ' ' + palavraTexto : palavraTexto;
    }
    if (atual) linhas.push(atual);
    return linhas;
  }

  function legenda(itens, y, largura) {
    const larguras = itens.map(i => 16 + i.rotulo.length * 4.3 + 18);
    const total = larguras.reduce((a, b) => a + b, 0);
    let x = (largura - total) / 2;
    return itens.map((item, i) => {
      const [x0, w] = [x, larguras[i]];
      x += w;
      let marca;
      if (item.tipo === 'linha') marca = `<line x1="${x0}" x2="${x0 + 12}" y1="${y - 3}" y2="${y - 3}" stroke="${C.tinta}" stroke-width="1.4" stroke-dasharray="4 2"/>`;
      else if (item.tipo === 'x') marca = `<path d="M${x0 + 2} ${y - 6} l6 6 m0 -6 l-6 6" stroke="${C.tinta2}" stroke-width="1" fill="none"/>`;
      else if (item.tipo === 'hachura') marca = `<rect x="${x0}" y="${y - 7}" width="10" height="8" fill="url(#hachura)" stroke="${C.verde}" stroke-width="0.8"/>`;
      else marca = `<rect x="${x0}" y="${y - 7}" width="10" height="8" fill="${item.cor}"/>`;
      return marca + t(x0 + 15, y, item.rotulo, { tam: 7.6, ancora: 'start' });
    }).join('');
  }

  const svg = (largura, altura, rotulo, miolo) =>
    `<svg viewBox="0 0 ${largura} ${altura}" width="100%" role="img" aria-label="${esc(rotulo)}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><pattern id="hachura" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<rect width="4" height="4" fill="#fff"/><line x1="0" y1="0" x2="0" y2="4" stroke="${C.verde}" stroke-width="1.4"/></pattern></defs>${miolo}</svg>`;

  function graficoCascata(inicio, causas, fim, rotuloInicio, rotuloFim) {
    const L = 690, A = 290, esq = 64, dir = 12, topo = 14, base = 232;
    const totais = [inicio, fim];
    let acc = inicio, maximo = Math.max(inicio, fim);
    for (const c of causas) { acc += c.valor; maximo = Math.max(maximo, acc, acc - c.valor); }
    const minimo = Math.floor((Math.min(...totais) - 50) / 100) * 100;
    const topoEixo = Math.ceil(maximo * 1.1 / 20) * 20;
    const y = v => base - (v - minimo) / (topoEixo - minimo) * (base - topo);
    const barras = causas.length + 2, passo = (L - esq - dir) / barras, larg = passo * 0.62;
    const xc = i => esq + passo * (i + 0.5);
    let s = '';
    for (let v = minimo; v <= topoEixo; v += 100) {
      s += `<line x1="${esq}" x2="${L - dir}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grade}" stroke-width="0.6"/>` +
        t(esq - 6, y(v) + 3, 'R$ ' + v, { ancora: 'end', cor: C.tinta2 });
    }
    s += t(esq + 4, topo + 8, 'Eixo começa em R$ ' + minimo, { tam: 7, ancora: 'start', cor: C.tinta2 });
    const barra = (i, de, ate, cor) => `<rect x="${xc(i) - larg / 2}" y="${y(Math.max(de, ate))}" width="${larg}" height="${Math.max(0.5, Math.abs(y(de) - y(ate)))}" fill="${cor}"/>`;
    const nomes = [rotuloInicio, ...causas.map(c => c.nome), rotuloFim];
    s += barra(0, minimo, inicio, C.marca) + t(xc(0), y(inicio) - 5, reais(inicio), { peso: 700, tam: 8.5 });
    acc = inicio;
    causas.forEach((c, k) => {
      const i = k + 1, de = acc, ate = acc + c.valor;
      s += `<line x1="${xc(i - 1) + larg / 2}" x2="${xc(i) - larg / 2}" y1="${y(de)}" y2="${y(de)}" stroke="${C.tinta2}" stroke-width="0.6"/>`;
      s += barra(i, de, ate, c.valor >= 0 ? C.laranja : C.verde);
      s += t(xc(i), y(Math.max(de, ate)) - 5, (c.valor >= 0 ? '+' : '−') + reais(Math.abs(c.valor)), { tam: 8.5 });
      acc = ate;
    });
    const f = causas.length + 1;
    s += `<line x1="${xc(f - 1) + larg / 2}" x2="${xc(f) - larg / 2}" y1="${y(acc)}" y2="${y(acc)}" stroke="${C.tinta2}" stroke-width="0.6"/>`;
    s += barra(f, minimo, fim, C.marca) + t(xc(f), y(fim) - 5, reais(fim), { peso: 700, tam: 8.5 });
    nomes.forEach((nome, i) => quebrar(nome, 14).forEach((linha, k) => { s += t(xc(i), base + 14 + k * 10, linha, { tam: 7.6 }); }));
    return svg(L, A, 'Cascata do aumento da conta, causa por causa', s);
  }

  // Dias do gráfico diário: cada item { data, gerado, previsto, tipo: 'ok'|'acumulo'|'excluido'|'sem' }
  function graficoDiario(d) {
    const L = 690, A = 285, esq = 44, dir = 10, topo = 40, base = 215;
    const n = d.dias.length, passo = (L - esq - dir) / n;
    const maximo = Math.max(...d.dias.map(x => Math.max(x.gerado || 0, x.previsto || 0)), 10);
    const ymax = Math.ceil(maximo * 1.08 / 10) * 10;
    const y = v => base - v / ymax * (base - topo);
    const x = i => esq + passo * (i + 0.5);
    let s = '';
    for (let v = 0; v <= ymax; v += 10) {
      s += `<line x1="${esq}" x2="${L - dir}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grade}" stroke-width="0.6"/>` +
        t(esq - 5, y(v) + 3, String(v), { ancora: 'end', cor: C.tinta2 });
    }
    s += `<text transform="translate(10 ${(topo + base) / 2}) rotate(-90)" font-size="8" text-anchor="middle" fill="${C.tinta2}" ${FONTE}>kWh por dia</text>`;
    d.dias.forEach((dia, i) => {
      if (dia.tipo === 'sem') { s += `<path d="M${x(i) - 1.8} ${y(1.2) - 1.8} l3.6 3.6 m0 -3.6 l-3.6 3.6" stroke="${C.tinta2}" stroke-width="0.8" fill="none"/>`; return; }
      const preenchimento = dia.tipo === 'ok' ? C.verde : dia.tipo === 'acumulo' ? 'url(#hachura)' : '#fff';
      const traco = dia.tipo === 'ok' ? 'none' : C.verde;
      s += `<rect x="${x(i) - passo * 0.375}" y="${y(dia.gerado)}" width="${passo * 0.75}" height="${base - y(dia.gerado)}" fill="${preenchimento}" stroke="${traco}" stroke-width="0.6"/>`;
    });
    const pontos = d.dias.map((dia, i) => finito(dia.previsto) ? [i, dia.previsto] : null);
    let passos = '';
    pontos.forEach((p, i) => {
      if (!p) return;
      const [x0, x1] = [x(p[0]) - passo / 2, x(p[0]) + passo / 2];
      passos += (passos && pontos[i - 1] ? 'L' : 'M') + `${x0} ${y(p[1])} L${x1} ${y(p[1])} `;
    });
    s += `<path d="${passos}" fill="none" stroke="${C.tinta}" stroke-width="1.4" stroke-dasharray="4 2"/>`;
    d.leituras.forEach(i => { s += `<line x1="${esq + passo * i}" x2="${esq + passo * i}" y1="${topo - 6}" y2="${base}" stroke="${C.tinta2}" stroke-width="0.7" stroke-dasharray="1.5 2.5"/>`; });
    const bordas = [0, ...d.leituras, n];
    d.rotulos.forEach((r, k) => {
      const meio = esq + passo * (bordas[k] + bordas[k + 1]) / 2;
      s += t(meio, topo - 20, r.nome, { tam: 6.8 }) + t(meio, topo - 10, r.pct, { tam: 6.8, peso: 700 });
    });
    d.dias.forEach((dia, i) => {
      if (dia.data.slice(8) === '01') s += t(x(i), base + 13, '1º ' + MESES[Number(dia.data.slice(5, 7)) - 1].slice(0, 3), { cor: C.tinta2 });
    });
    s += legenda(d.legenda, A - 8, L);
    return svg(L, A, 'Geração diária por ciclo de fatura, com o previsto', s);
  }

  function graficoCiclos(itens) {
    const L = 690, A = 290, esq = 40, dir = 10, topo = 40, base = 232;
    const maximo = Math.max(...itens.map(i => i.auto + Math.max(i.inj, i.rede)));
    const ymax = Math.ceil((maximo + 6) / 5) * 5;
    const y = v => base - v / ymax * (base - topo);
    const passo = (L - esq - dir) / itens.length, w = passo * 0.19;
    let s = '';
    for (let v = 0; v <= ymax; v += 10) s += `<line x1="${esq}" x2="${L - dir}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grade}" stroke-width="0.6"/>` + t(esq - 5, y(v) + 3, String(v), { ancora: 'end', cor: C.tinta2 });
    s += `<text transform="translate(10 ${(topo + base) / 2}) rotate(-90)" font-size="8" text-anchor="middle" fill="${C.tinta2}" ${FONTE}>kWh por dia</text>`;
    const pilha = (cx, partes, topoRotulo, titulo) => {
      let acc = 0;
      for (const p of partes) {
        const h = p.valor / ymax * (base - topo);
        s += `<rect x="${cx - w / 2}" y="${y(acc + p.valor)}" width="${w}" height="${h}" fill="${p.cor}"/>` + t(cx, y(acc) - h / 2 + 3, num(p.valor, 1), { cor: '#fff', peso: 700, tam: 8 });
        acc += p.valor;
      }
      s += t(cx, y(acc) - 14, titulo, { tam: 7.6 }) + t(cx, y(acc) - 4, num(acc, 1), { tam: 7.6, peso: 700 });
    };
    itens.forEach((it, i) => {
      const meio = esq + passo * (i + 0.5);
      pilha(meio - w / 2 - 2, [{ valor: it.auto, cor: C.verde }, { valor: it.inj, cor: C.azul }], 0, 'Geração');
      pilha(meio + w / 2 + 2, [{ valor: it.auto, cor: C.verde }, { valor: it.rede, cor: C.laranja }], 0, 'Casa');
      s += t(meio, base + 14, it.nome, { tam: 7.8 }) + t(meio, base + 25, it.periodo, { tam: 7.8, cor: C.tinta2 });
    });
    s += legenda([{ rotulo: 'Autoconsumo (sol usado na hora)', cor: C.verde }, { rotulo: 'Injeção (sobra que vira crédito)', cor: C.azul },
      { rotulo: 'Puxado da rede', cor: C.laranja }], 14, L);
    return svg(L, A, 'Geração e consumo por dia em cada fatura', s);
  }

  function graficoComposicao(linhas, series) {
    const L = 690, A = 270, esq = 92, dir = 26, topo = 8, passoY = 52;
    const maxTotal = Math.max(...linhas.map(l => l.total));
    const xmax = Math.ceil((maxTotal + 80) / 100) * 100;
    const x = v => esq + v / xmax * (L - esq - dir);
    let s = '';
    for (let v = 0; v <= xmax; v += 100) {
      s += `<line x1="${x(v)}" x2="${x(v)}" y1="${topo}" y2="${topo + passoY * linhas.length}" stroke="${C.grade}" stroke-width="0.6"/>` +
        t(x(v), topo + passoY * linhas.length + 12, 'R$ ' + v, { cor: C.tinta2 });
    }
    linhas.forEach((l, i) => {
      const cy = topo + passoY * (i + 0.5);
      s += t(esq - 8, cy + 3, l.nome, { ancora: 'end' });
      let acc = 0;
      series.forEach(se => {
        const v = l.valores[se.chave];
        if (!(v > 0)) return;
        s += `<rect x="${x(acc)}" y="${cy - 15}" width="${Math.max(0, x(v) - x(0) - 1.5)}" height="30" fill="${se.cor}"/>`;
        if (v >= 40) s += t(x(acc + v / 2), cy + 3, num(v), { cor: '#fff', peso: 700 });
        acc += v;
      });
      s += t(x(acc) + 6, cy + 3, reais(l.total), { ancora: 'start', peso: 700, tam: 8.5 });
    });
    s += legenda(series.map(se => ({ rotulo: se.rotulo, cor: se.cor })).slice(0, 2), A - 24, L) +
      legenda(series.map(se => ({ rotulo: se.rotulo, cor: se.cor })).slice(2), A - 10, L);
    return svg(L, A, 'Composição de cada fatura em reais', s);
  }

  // ---------- análise a partir do modelo ----------
  const somaItens = (f, tipos) => (f.itens || []).filter(i => i.noTotal !== false && tipos.includes(i.tipo)).reduce((a, i) => a + (i.valor || 0), 0);

  // "~" quando a geração do ciclo é estimada com menos de 90% dos dias válidos (ou sempre, no modo desempenho).
  const aproxima = (modo, c) => modo === 'desempenho' || (c.estimada && c.diasValidos / c.dias < 0.9);

  function listaDeDias(datas) {
    const grupos = [];
    for (const d of datas) {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && diasEntre(ultimo[1], d) === 1) ultimo[1] = d; else grupos.push([d, d]);
    }
    return juntar(grupos.map(([a, b]) => a === b ? diaMes(a) : diaMes(a) + ' a ' + diaMes(b)));
  }

  function resumoParcial(mapa, excluir, de, ate, previstoDe) {
    const validos = [], previstos = [];
    for (let d = de; d <= ate; d = somarDias(d, 1)) {
      const r = mapa.get(d);
      if (!r || !finito(r.gerado) || excluir.has(d)) continue;
      if (finito(r.previsto) && r.gerado > LIMITE_ACUMULO * r.previsto) continue;
      validos.push({ d, v: r.gerado }); previstos.push(r.previsto);
    }
    if (!validos.length) return null;
    const media = validos.reduce((a, x) => a + x.v, 0) / validos.length;
    const previsto = previstos.filter(finito).reduce((a, b) => a + b, 0) / previstos.filter(finito).length;
    return { n: validos.length, inicio: validos[0].d, fim: validos[validos.length - 1].d, media, previsto, desempenho: media / previsto };
  }

  function prepararDiario(m, parcialAnt, parcialAtual) {
    const excluir = new Set(m.excluir || []);
    const mapa = new Map(m.dias.map(d => [d.data, d]));
    const datas = m.dias.map(d => d.data).concat(m.ciclos.flatMap(c => [c.inicio, c.fim]));
    const primeira = datas.reduce((a, b) => a < b ? a : b), ultima = datas.reduce((a, b) => a > b ? a : b);
    const dias = [];
    const acumulos = new Set(m.ciclos.flatMap(c => c.avisos.filter(a => a.codigo === 'acumulo').map(a => a.data)));
    for (let d = primeira; d <= ultima; d = somarDias(d, 1)) {
      const r = mapa.get(d);
      let tipo = 'ok';
      if (!r || !finito(r.gerado)) tipo = 'sem';
      else if (excluir.has(d)) tipo = 'excluido';
      else if (acumulos.has(d) || (finito(r.previsto) && r.gerado > LIMITE_ACUMULO * r.previsto)) tipo = 'acumulo';
      dias.push({ data: d, gerado: r ? r.gerado : null, previsto: r ? r.previsto : null, tipo });
    }
    const leituras = [m.ciclos[0].inicio, ...m.ciclos.map(c => somarDias(c.fim, 1))]
      .map(d => diasEntre(primeira, d)).filter(i => i > 0 && i < dias.length);
    const rotulos = [];
    if (parcialAnt) rotulos.push({ nome: 'Fat. ' + parcialAnt.rotuloMes + '*', pct: pct(parcialAnt.desempenho) });
    m.ciclos.forEach((c, i) => rotulos.push({ nome: nomeFatura(m.faturas[i]), pct: (aproxima(m.modo, c) ? '~' : '') + pct(c.desempenho) }));
    if (parcialAtual) rotulos.push({ nome: 'Atual*', pct: pct(parcialAtual.desempenho) });
    const legendaItens = [{ rotulo: 'Geração do dia', cor: C.verde }, { rotulo: 'Previsto (prognóstico)', tipo: 'linha' }];
    if (acumulos.size) legendaItens.push({ rotulo: listaDeDias([...acumulos].sort()) + ': acúmulo de dias sem dado', tipo: 'hachura' });
    if (dias.some(d => d.tipo === 'sem')) legendaItens.push({ rotulo: 'Sem dado', tipo: 'x' });
    return { dias, leituras, rotulos, legenda: legendaItens };
  }

  function montarContexto(m) {
    const modo = m.modo || 'geracao';
    const semSolar = modo === 'semSolar';
    const fa = m.faturas, ci = m.ciclos, b = m.base, p = m.comparada;
    const fb = fa[b], fp = fa[p];
    const ctx = { modo, semSolar, fb, fp, cb: ci[b], cp: ci[p], mesB: mesNome(fb), mesP: mesNome(fp) };
    ctx.agoNov = ci.every(c => [8, 9, 10, 11].includes(Number(c.inicio.slice(5, 7))) && [8, 9, 10, 11].includes(Number(c.fim.slice(5, 7))))
      && ci[0].inicio.slice(5, 7) === '08' && ci[ci.length - 1].fim.slice(5, 7) === '11';
    ctx.desempenhoCai = !semSolar && ci.length > 1 && ci.every((c, i) => finito(c.desempenho) && (i === 0 || c.desempenho < ci[i - 1].desempenho));
    // períodos parciais antes e depois dos ciclos (só quando há dados colados)
    ctx.parcialAnt = ctx.parcialAtual = null;
    if (modo === 'geracao' && m.dias && m.dias.length) {
      const mapa = new Map(m.dias.map(d => [d.data, d]));
      const excluir = new Set(m.excluir || []);
      const primeiraDia = m.dias[0].data, ultimaDia = m.dias[m.dias.length - 1].data;
      if (primeiraDia < ci[0].inicio) {
        const r = resumoParcial(mapa, excluir, primeiraDia, somarDias(ci[0].inicio, -1));
        if (r) {
          const ant = new Date(Date.UTC(Number(fa[0].referencia.slice(0, 4)), Number(fa[0].referencia.slice(5, 7)) - 2, 1));
          const ref = String(ant.getUTCMonth() + 1).padStart(2, '0') + '/' + ant.getUTCFullYear();
          ctx.parcialAnt = { ...r, rotuloMes: ref.slice(0, 2), nome: 'Fatura ' + ref };
        }
      }
      if (ultimaDia > ci[ci.length - 1].fim) {
        const r = resumoParcial(mapa, excluir, somarDias(ci[ci.length - 1].fim, 1), ultimaDia);
        if (r) ctx.parcialAtual = r;
      }
    }
    return ctx;
  }

  // ---------- blocos de HTML ----------
  const tabela = (cab, linhas, { ultimaEmDestaque = false, classe = '' } = {}) =>
    `<table class="${classe}">` + (cab ? '<thead><tr>' + cab.map(c => `<th>${esc(c)}</th>`).join('') + '</tr></thead>' : '') +
    '<tbody>' + linhas.map((l, i) => `<tr${ultimaEmDestaque && i === linhas.length - 1 ? ' class="total"' : ''}>` +
      l.map(c => `<td>${c && c.html !== undefined ? c.html : esc(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
  const p = (texto, classe) => `<p${classe ? ` class="${classe}"` : ''}>${texto}</p>`;
  const kpi = (valor, rotulo) => `<div class="kpi"><strong>${esc(valor)}</strong><span>${rotulo}</span></div>`;
  const li = texto => `<li>${texto}</li>`;

  function periodoTexto(m) {
    const a = m.ciclos[0].inicio, z = m.ciclos[m.ciclos.length - 1].fim;
    const [ma, mz] = [Number(a.slice(5, 7)) - 1, Number(z.slice(5, 7)) - 1];
    const [aa, az] = [a.slice(0, 4), z.slice(0, 4)];
    return aa === az ? `de ${MESES[ma]} a ${MESES[mz]} de ${az}` : `de ${MESES[ma]} de ${aa} a ${MESES[mz]} de ${az}`;
  }

  function causasDoAumento(m, ctx) {
    const d = m.divisao, pt = d.partes;
    const ritmo = ctx.mesB;
    const lista = [];
    if (ctx.semSolar) {
      lista.push({ nome: 'Consumo maior da casa', valor: d.consumo, texto: juntar([
        pt.volume ? `Mais kWh na conta (${reais(pt.volume)})` : '', pt.cipVolume ? `CIP sobre o consumo a mais (${reais(pt.cipVolume)})` : ''].filter(Boolean)) });
      lista.push({ nome: 'Reajuste da tarifa e da CIP', valor: d.tarifa, texto: [pt.tarifa ? `Mudança no preço do kWh (${reais(pt.tarifa)})` : '',
        pt.cipTaxa ? `CIP mais cara por kWh (${reais(pt.cipTaxa)})` : ''].filter(Boolean).join('; ') });
    } else {
      const sem = d.consumo - pt.volumeCompensado - pt.cipVolume;
      lista.push({ nome: 'Consumo maior da casa', valor: d.consumo, texto: juntar([
        `Mais kWh compensados (${reais(pt.volumeCompensado)})`, `CIP sobre o consumo a mais (${reais(pt.cipVolume)})`,
        Math.abs(sem) >= 0.005 ? `parte dos kWh sem crédito (${reais(sem)})` : ''].filter(Boolean)) });
      const reaj = m.fatos && m.fatos.reajuste;
      lista.push({ nome: 'Reajuste da tarifa e da CIP', valor: d.tarifa, texto: [
        reaj ? `Reajuste de ${num(reaj.percentual)}% em ${reaj.data} e mudança nos impostos (${reais(pt.precoCompensado)})` : `Mudança no preço do kWh compensado (${reais(pt.precoCompensado)})`,
        `CIP mais cara por kWh (${reais(pt.cipTaxa)})`].join('; ') });
      lista.push({ nome: 'Queda da geração', valor: d.geracao, texto: `Parte dos kWh cobrados sem crédito, que não existiriam se a usina mantivesse o ritmo de ${ritmo}` });
    }
    lista.push({ nome: 'Multa, juros e correção', valor: d.atraso, texto: 'Atraso no pagamento de faturas anteriores' });
    const bandeiras = m.fatos && m.fatos.bandeiras;
    lista.push({ nome: 'Bandeira tarifária', valor: d.bandeira, texto: bandeiras ? `Bandeira ${bandeiras.base} em ${ritmo}, ${bandeiras.comparada} em ${ctx.mesP}` : 'Variação da bandeira tarifária' });
    lista.push({ nome: 'Outros itens da fatura', valor: d.outros, texto: 'Diferença entre as linhas da fatura e o total' });
    return lista.filter(c => c.nome === 'Consumo maior da casa' || c.nome === 'Reajuste da tarifa e da CIP' || Math.abs(c.valor) >= 0.005)
      .sort((a, c) => c.valor - a.valor);
  }

  function secaoResumo(m, ctx, causas) {
    const d = m.divisao, cb = ctx.cb, cp = ctx.cp;
    const total = d.total;
    let texto = `A conta passou de <b>${reais(ctx.fb.total)}</b> (${ctx.mesB}) para <b>${reais(ctx.fp.total)}</b> (${ctx.mesP}), <b>${reais(total)} a mais</b>. `;
    const maior = causas.slice().sort((a, c) => c.valor - a.valor)[0];
    const parte = k => causas.find(c => c.nome === k);
    const consumo = parte('Consumo maior da casa'), tarifa = parte('Reajuste da tarifa e da CIP'), geracao = parte('Queda da geração');
    if (maior === consumo && consumo.valor / total >= 0.4 && consumo.valor / total < 0.5) {
      texto += 'Quase metade do aumento veio do consumo maior da casa. ';
      if (geracao && tarifa && Math.abs(geracao.valor - tarifa.valor) / total <= 0.1) {
        texto += 'O resto se divide quase igual entre a queda da geração e o reajuste da tarifa e da iluminação pública. ';
      }
    } else if (maior) {
      texto += `A maior parte do aumento veio de ${maior.nome.charAt(0).toLowerCase() + maior.nome.slice(1)}. `;
    }
    if (!ctx.semSolar && ctx.fp.consumoSemCompensacao > 0 && !(ctx.fp.saldoDisponivel > 0)) {
      const preco = m.precos[m.comparada].kwhSemCredito;
      texto += `${cap(ctx.mesP)} pesou mais porque os créditos guardados acabaram e ${num(ctx.fp.consumoSemCompensacao)} kWh foram cobrados pela tarifa cheia` +
        (finito(preco) ? `, a ${reais(preco)} cada.` : '.');
    }
    const aprox = ctx.modo === 'desempenho' ? '~' : '';
    const variacao = (a, c) => { const v = Math.round(100 * (c / a - 1)); return (v < 0 ? '−' : '+') + Math.abs(v) + '%'; };
    let kpis;
    if (ctx.semSolar) {
      kpis = [kpi(variacao(cb.porDia.rede, cp.porDia.rede), `consumo da casa por dia<br/>${num(cb.porDia.rede, 1)} para ${num(cp.porDia.rede, 1)} kWh`),
        kpi(variacao(m.precos[m.base].kwhSemCredito || 0.0001, m.precos[m.comparada].kwhSemCredito || 0.0001), 'preço do kWh<br/>na tarifa cheia')];
    } else {
      kpis = [kpi(variacao(cb.porDia.casa, cp.porDia.casa), `consumo da casa por dia<br/>${aprox}${num(cb.porDia.casa, 1)} para ${aprox}${num(cp.porDia.casa, 1)} kWh`),
        kpi(variacao(cb.porDia.geracao, cp.porDia.geracao), `geração por dia<br/>${aprox}${num(cb.porDia.geracao, 1)} para ${aprox}${num(cp.porDia.geracao, 1)} kWh`),
        kpi(`${pct(cb.desempenho)} para ${pct(cp.desempenho)}`, `geração / previsto<br/>${nomeFatura(ctx.fb).toLowerCase()} para ${nomeFatura(ctx.fp).toLowerCase()}`),
        // Fatura com consumo sem compensação não imprime saldo: os créditos acabaram.
        kpi(`${num(finito(ctx.fp.saldoDisponivel) ? ctx.fp.saldoDisponivel : (ctx.fp.consumoSemCompensacao > 0 ? 0 : null), 0)} kWh`, `créditos guardados<br/>em ${dataBr(cp.fim)}`)];
    }
    const grafico = graficoCascata(ctx.fb.total, causas.map(c => ({ nome: c.nome, valor: c.valor })), ctx.fp.total,
      'Conta ' + mesAbrev(ctx.fb).toLowerCase(), 'Conta ' + mesAbrev(ctx.fp).toLowerCase());
    const linhas = causas.map(c => [c.nome, (c.valor < 0 ? '−' : '') + reais(Math.abs(c.valor)), pct(c.valor / total), c.texto]);
    linhas.push(['Total', reais(total), '100%', '']);
    return '<h2>Resumo</h2>' + p(texto) + `<div class="kpis">${kpis.join('')}</div>` + '<h2>De onde veio o aumento</h2>' +
      `<figure id="grafico-cascata">${grafico}</figure>` +
      p(`Cada barra laranja é o quanto aquela causa somou à conta, de ${ctx.mesB} para ${ctx.mesP}. A barra verde é o que diminuiu.`, 'cap') +
      tabela(['Causa', 'Valor', 'Parte do aumento', 'O que é'], linhas, { ultimaEmDestaque: true, classe: 'causas' });
  }

  function secaoGeracao(m, ctx) {
    const modo = ctx.modo, ci = m.ciclos, fa = m.faturas;
    const desempenhos = ci.map((c, i) => `${aproxima(modo, c) && modo !== 'desempenho' ? '~' : ''}${pct(c.desempenho)} no ciclo da ${nomeFatura(fa[i]).replace('Fatura', 'fatura')}`);
    let html;
    if (modo === 'desempenho') {
      html = '<h2>Geração estimada, por ciclo de fatura</h2>' +
        p(`Sem os dados diários do monitoramento, a geração de cada ciclo foi estimada pelo percentual de desempenho informado: ${juntar(desempenhos)}. ` +
          'Todos os valores de geração, autoconsumo e consumo da casa nesta análise levam “~”, porque dependem dessa estimativa.');
      const linhas = ci.map((c, i) => [nomeFatura(fa[i]), `${diaMes(c.inicio)} a ${diaMes(c.fim)}`, pct(c.desempenho), num(c.previstoCiclo, 0) + ' kWh', '~' + num(c.geracao, 0) + ' kWh']);
      html += tabela(['Ciclo', 'Período', 'Desempenho informado', 'Previsto (kWp × produtividade)', 'Geração estimada'], linhas);
      return html;
    }
    const pa = ctx.parcialAnt, pu = ctx.parcialAtual;
    const crescente = ctx.desempenhoCai;
    let intro = `Contando pelos ciclos de leitura das faturas, a usina ${crescente ? 'vem gerando cada vez menos em relação ao previsto' : 'atingiu, em relação ao previsto'}: ${juntar(desempenhos)}.`;
    const parciais = [];
    if (pa) parciais.push(`os ${pa.n === 1 ? 'último dia' : 'últimos ' + palavra(pa.n) + ' dias'} do ciclo da ${pa.nome.replace('Fatura', 'fatura')} ficaram em ${pct(pa.desempenho)}`);
    if (pu) parciais.push(`${pu.n === 1 ? 'o primeiro dia' : 'os ' + palavra(pu.n) + ' primeiros dias'} do ciclo atual em ${pct(pu.desempenho)}`);
    if (parciais.length) {
      intro += ' ' + cap(parciais.length === 2 ? parciais[0] + ', e ' + parciais[1] : parciais[0]) + '. São poucos dias para concluir alguma coisa sobre ' +
        (parciais.length === 2 ? 'esses dois' : 'esse período') + '.';
    }
    if (ctx.agoNov && crescente) {
      intro += ' Agosto a novembro estão entre os meses menos chuvosos de Belém, quando a geração deveria estar no auge. Por isso a queda contínua chama atenção.';
    }
    const dados = prepararDiario(m, pa, pu);
    const excluidos = (m.excluir || []).filter(d => dados.dias.some(x => x.data === d && x.tipo === 'excluido'));
    let cap1 = 'Linhas pontilhadas: datas de leitura do medidor, que separam os ciclos das faturas. No topo, quanto cada ciclo atingiu do previsto.';
    if (pa || pu) cap1 += ' * Ciclo com poucos dias nos dados.';
    if (excluidos.length) cap1 += excluidos.length === 1 ? ` O dia ${diaMes(excluidos[0])} está incompleto (barra vazada) e fica fora das contas.`
      : ` Os dias ${juntar(excluidos.map(diaMes))} estão incompletos (barras vazadas) e ficam fora das contas.`;
    const linhas = [];
    if (pa) linhas.push([pa.nome + '*', `${diaMes(pa.inicio)} a ${diaMes(pa.fim)} (só o fim)`, `${pa.n} de ${pa.n}`, num(pa.media, 1), num(pa.previsto, 1), pct(pa.desempenho)]);
    ci.forEach((c, i) => linhas.push([nomeFatura(fa[i]), `${diaMes(c.inicio)} a ${diaMes(c.fim)}`, `${c.diasValidos} de ${c.dias}`,
      num(c.mediaDia, 1), num(c.previstoDiaMedio, 1), (aproxima(modo, c) ? '~' : '') + pct(c.desempenho)]));
    if (pu) linhas.push(['Ciclo atual*', `${diaMes(pu.inicio)} a ${diaMes(pu.fim)}`, `${pu.n} de ${pu.n}`, num(pu.media, 1), num(pu.previsto, 1), pct(pu.desempenho)]);
    html = '<h2>Geração da usina, dia a dia</h2>' + p(intro) + `<figure id="grafico-diario">${graficoDiario(dados)}</figure>` + p(cap1, 'cap') +
      tabela(['Ciclo', 'Período', 'Dias com dado', 'Média (kWh/dia)', 'Previsto (kWh/dia)', 'Atingido'], linhas);
    // nota sobre dias sem dado e acúmulo
    const notas = [];
    const faltantes = ci.map((c, i) => ({ c, f: fa[i] })).filter(x => x.c.diasValidos < x.c.dias);
    if (faltantes.some(x => aproxima(modo, x.c))) {
      const primeira = faltantes.find(x => aproxima(modo, x.c));
      notas.push('Os dias sem dado parecem ser falha de comunicação do monitoramento, e não dias sem geração. ' +
        `A fatura de ${mesNome(primeira.f)} registrou ${num(primeira.f.injetadoNoCiclo, 0)} kWh injetados no período em que faltam dados.`);
    }
    ci.forEach(c => c.avisos.filter(a => a.codigo === 'acumulo').forEach(a => {
      notas.push(`O dia ${diaMes(a.data)} (${fmtAte1.format(a.gerado)} kWh) soma a geração de dias anteriores e foi retirado das médias.`);
    }));
    faltantes.filter(x => aproxima(modo, x.c)).forEach(x => notas.push(`Por isso a ${nomeFatura(x.f).replace('Fatura', 'fatura')} aparece com ~: a média vem de ${x.c.diasValidos} dos ${x.c.dias} dias.`));
    if (notas.length) html += p(notas.join(' '), 'nota');
    if (ctx.agoNov && crescente) {
      html += '<h2>O que pode estar por trás da queda</h2>' +
        p('Uma queda contínua em meses de sol forte costuma ter três causas: sujeira acumulada nos módulos (a estação seca não tem chuva para lavar), ' +
          'sombra nova (árvore, construção) ou falha em um conjunto de módulos ou no inversor. Só a visita técnica confirma qual delas. ' +
          'Com a usina de volta perto de 100%, a casa voltaria a guardar créditos.');
    }
    return html;
  }

  function secaoCiclos(m, ctx) {
    const modo = ctx.modo, ci = m.ciclos, fa = m.faturas;
    const til = c => aproxima(modo, c) ? '~' : '';
    const nomeGer = modo === 'desempenho' ? 'Geração estimada pelo desempenho informado' : 'Geração da usina';
    const itens = ci.map((c, i) => ({ nome: nomeFatura(fa[i]), periodo: `${diaMes(c.inicio)} a ${diaMes(c.fim)} (${c.dias} dias)`,
      auto: c.porDia.autoconsumo, inj: c.porDia.injecao, rede: c.porDia.rede }));
    const lista = ci.map(c => c.dias).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
    const tl = (rotulo, f) => [rotulo, ...ci.map((c, i) => f(c, fa[i], i))];
    const banco = f => finito(f.creditosAntigosUsados) ? f.creditosAntigosUsados : Math.max(0, f.consumoCompensado - f.injetadoNoCiclo);
    const linhas = [
      [''].concat(fa.map(nomeFatura)),
      tl('Período (dias)', c => `${diaMes(c.inicio)} a ${diaMes(c.fim)} (${c.dias})`),
      tl(nomeGer, c => til(c) + num(c.geracao, 0) + ' kWh'),
      tl('Previsto para o período', c => num(c.previstoCiclo, 0) + ' kWh'),
      tl('Geração / previsto', c => pct(c.geracao / c.previstoCiclo)),
      tl('Autoconsumo', c => til(c) + num(c.autoconsumo, 0) + ' kWh'),
      tl('Injetado na rede (medidor)', (c, f) => num(f.injetadoNoCiclo, 0) + ' kWh'),
      tl('Puxado da rede (medidor)', (c, f) => num(f.consumoMedido, 0) + ' kWh'),
      tl('Consumo total da casa', c => til(c) + num(c.casa, 0) + ' kWh'),
      tl('Parte da casa atendida na hora pelo sol', c => pct(c.autoconsumo / c.casa)),
      tl('Créditos usados do banco', (c, f) => banco(f) > 0 ? num(banco(f)) + ' kWh' : `0 (sobraram ${num(f.injetadoNoCiclo - f.consumoCompensado)})`),
      tl('Cobrado sem compensação', (c, f) => f.consumoSemCompensacao > 0 ? num(f.consumoSemCompensacao) + ' kWh' : '0'),
      tl('Créditos guardados após a fatura', (c, f) => f.saldoDisponivel > 0 ? num(f.saldoDisponivel) + ' kWh' : '0'),
      tl('Valor da fatura', (c, f) => reais(f.total))
    ];
    const cab = linhas.shift();
    let html = '<h2>Geração, autoconsumo e consumo por fatura</h2>' +
      p('<b>Autoconsumo</b> é a energia do sol que a casa usa na hora, sem passar pelo medidor. <b>Injeção</b> é a sobra que vai para a rede e vira crédito. ' +
        '<b>Puxado da rede</b> é o que a casa usa à noite ou quando o sol não dá conta. O consumo total da casa é o autoconsumo mais o que veio da rede. ' +
        'Os créditos da injeção abatem o que veio da rede.') +
      `<figure id="grafico-ciclos">${graficoCiclos(itens)}</figure>` +
      p(`Valores por dia, para comparar ciclos de ${juntar(lista.map(String))} dias. Em cada fatura, a barra da esquerda é o que a usina gerou e a da direita é o que a casa consumiu. A parte verde é a mesma nas duas.`, 'cap') +
      tabela(cab, linhas);
    // texto do caso: sobra, depois déficit com créditos, depois créditos esgotados
    const deficitDia = (c, f) => (f.consumoMedido - f.injetadoNoCiclo) / c.dias;
    if (ci.length === 3 && fa[0].injetadoNoCiclo > fa[0].consumoCompensado && fa[1].saldoDisponivel > 0 && banco(fa[1]) > 0
      && !(fa[2].saldoDisponivel > 0) && fa[2].consumoSemCompensacao > 0) {
      html += p(`Em ${mesNome(fa[0])} a usina gerou mais do que a casa consumia e sobraram créditos. Em ${mesNome(fa[1])} a injeção já não cobria o que veio da rede, ` +
        `e os créditos guardados cobriram a diferença. Em ${mesNome(fa[2])} a falta dobrou, de ${num(deficitDia(ci[1], fa[1]), 1)} para ${num(deficitDia(ci[2], fa[2]), 1)} kWh por dia, ` +
        `os créditos acabaram e ${num(fa[2].consumoSemCompensacao)} kWh foram para a tarifa cheia.`);
    }
    const ant = m.fatos && m.fatos.faturaAnterior;
    if (ant) {
      const mes = MESES[Number(ant.referencia.slice(5, 7)) - 1];
      html += p(`A fatura de ${mes} (${ant.referencia.slice(5, 7)}/${ant.referencia.slice(0, 4)}, ${reais(ant.total)}) não estava entre as analisadas. Pelo histórico impresso nas faturas, naquele ciclo a casa teve ` +
        `${num(ant.faturado, 0)} kWh faturados e injetou ${num(ant.injetado, 0)} kWh.` +
        (ctx.parcialAnt ? ' O monitoramento só tem dados a partir de ' + diaMes(m.dias[0].data) + ', então não dá para calcular o autoconsumo daquele ciclo.' : ''), 'nota');
    }
    return html;
  }

  function secaoComposicao(m, ctx) {
    const fa = m.faturas, co = m.composicoes, pr = m.precos;
    const series = [
      { chave: 'energiaCompensada', cor: C.azul, rotulo: 'Energia compensada (Lei 14.300 + impostos)' },
      { chave: 'semCompensacao', cor: C.laranja, rotulo: 'Consumo sem compensação (tarifa cheia)' },
      { chave: 'cip', cor: C.aqua, rotulo: 'Iluminação pública (CIP)' },
      { chave: 'atrasoBandeira', cor: C.violeta, rotulo: 'Multa, juros, correção e bandeira' }
    ].filter(se => co.some((c, i) => se.chave === 'atrasoBandeira' ? c.atraso + c.bandeira > 0 : c[se.chave] > 0));
    const valores = c => ({ energiaCompensada: c.energiaCompensada, semCompensacao: c.semCompensacao, cip: c.cip, atrasoBandeira: c.atraso + c.bandeira });
    const grafico = graficoComposicao(fa.map((f, i) => ({ nome: nomeFatura(f), valores: valores(co[i]), total: co[i].total })), series);
    const algumOutros = co.some(c => Math.abs(c.outros) >= 0.05);
    const linhas = [];
    const linha = (rotulo, f, zeroComoTraco = true) => linhas.push([rotulo, ...co.map(c => { const v = f(c); return zeroComoTraco && !(Math.abs(v) >= 0.005) ? SEM : reais(v); })]);
    if (co.some(c => c.energiaCompensada)) linha('Energia compensada (Lei 14.300 + impostos)', c => c.energiaCompensada);
    linha('Consumo sem compensação', c => c.semCompensacao);
    linha('Iluminação pública (CIP)', c => c.cip);
    linha('Multa, juros, correção e bandeira', c => c.atraso + c.bandeira);
    if (algumOutros) linha('Outros itens', c => c.outros);
    linha('Total', c => c.total, false);
    // legenda do gráfico/tabelas
    const sem0 = fa.map((f, i) => f.consumoSemCompensacao > 0 || ctx.semSolar ? null : i).filter(i => i !== null);
    let legendaGrafico = 'Valores em reais.';
    if (sem0.length && sem0.length < fa.length) {
      const media = sem0.reduce((a, i) => a + co[i].total, 0) / sem0.length;
      legendaGrafico += ` Mesmo com toda a energia compensada (${juntar(sem0.map(i => mesNome(fa[i])))}), a conta fica perto de R$ ${Math.round(media / 50) * 50}.`;
    }
    const colunas = fa.map(mesAbrev);
    const primeiro = pr[0], ultimo = pr[pr.length - 1];
    const arred = v => Math.round(v * 1000) / 1000;
    const variacao = (a, z) => {
      if (!(finito(a) && finito(z) && a > 0)) return SEM;
      const v = 100 * (arred(z) / arred(a) - 1);
      const texto = Math.abs(v) < 10 ? num(Math.abs(v), 1) : String(Math.round(Math.abs(v)));
      return (v < 0 ? '−' : '+') + texto + '%';
    };
    const kwh = v => finito(v) ? reais(v, 3) : SEM;
    const compensado = pr.map(x => x.kwhCompensado);
    const semCredito = pr.map((x, i) => finito(x.kwhSemCredito) ? x.kwhSemCredito : (ctx.semSolar && fa[i].consumoCompensado === 0 && finito(co[i].semCompensacao) ? co[i].semCompensacao / (fa[i].consumoFaturado || fa[i].consumoMedido) : null));
    const cip = pr.map(x => x.cipPorKwh);
    const maisComCredito = pr.map(x => finito(x.kwhCompensado) && finito(x.cipPorKwh) ? x.kwhCompensado + x.cipPorKwh : null);
    const maisSemCredito = pr.map((x, i) => finito(semCredito[i]) && finito(x.cipPorKwh) ? semCredito[i] + x.cipPorKwh : null);
    const linhaPreco = (rotulo, v) => v.some(finito) ? [[rotulo, ...v.map(kwh), variacao(v[0], v[v.length - 1])]] : [];
    const linhasPreco = [
      ...(ctx.semSolar ? [] : linhaPreco('kWh compensado com crédito (parcela da Lei 14.300 + ICMS, PIS e COFINS)', compensado)),
      ...linhaPreco('kWh sem crédito (tarifa cheia, com impostos)', semCredito),
      ...linhaPreco('CIP por kWh puxado da rede', cip),
      ...(ctx.semSolar ? linhaPreco('kWh a mais na casa (tarifa cheia + CIP)', maisSemCredito)
        : [...linhaPreco('kWh a mais na casa, com crédito (compensado + CIP)', maisComCredito),
          ...linhaPreco('kWh a mais na casa, sem crédito (tarifa cheia + CIP)', maisSemCredito)])
    ];
    let html = '<h2>Quanto custa cada kWh e como a conta é formada</h2>' + `<figure id="grafico-composicao">${grafico}</figure>` + p(legendaGrafico, 'cap') +
      tabela(['Item', ...fa.map(nomeFatura)], linhas, { ultimaEmDestaque: true }) +
      '<h2>Preço por kWh</h2>' + tabela(['O que se paga por kWh', ...colunas, 'Variação'], linhasPreco);
    if (!ctx.semSolar) {
      const f = ctx.fp;
      const gd2 = somaItens(f, ['gd2']) / f.consumoCompensado;
      const impostos = somaItens(f, ['sceeBruto', 'sceeLiquido']) / f.consumoCompensado;
      const reaj = m.fatos && m.fatos.reajuste;
      html += '<h2>Por que a conta não zera mesmo com a usina</h2><ul>' +
        li('<b>Lei 14.300/2022.</b> A usina está na regra GD II. Uma parte de cada kWh compensado não é abatida pelo crédito ' +
          `(linha “Parc. Inj. s/ Desc. - GD2” da fatura). Em ${ctx.mesP} foram ${reais(gd2, 3)} por kWh.`) +
        li('<b>Impostos sobre a energia compensada.</b> ICMS, PIS e COFINS incidem sobre a energia abatida. É a diferença entre as linhas ' +
          `“Benefício Tarifário Bruto” e “Líquido”. Em ${ctx.mesP}, ${reais(impostos, 3)} por kWh.`) +
        li('<b>Iluminação pública (CIP).</b> Cobrada pela prefeitura na conta de luz. ' +
          (fa.every((x, i) => i === 0 || (co[i].cip > co[i - 1].cip && x.consumoMedido > fa[i - 1].consumoMedido))
            ? `Nas ${palavra(fa.length)} faturas, subiu junto com o consumo da rede.` : 'Varia com o consumo da rede.')) +
        (reaj ? li(`<b>Reajuste.</b> A Equatorial teve reajuste médio de ${num(reaj.percentual)}% a partir de ${reaj.data}${reaj.norma ? ' (' + esc(reaj.norma) + ')' : ''}.`) : '') + '</ul>';
    } else {
      html += p('Parte da conta não depende do consumo: a iluminação pública (CIP) é cobrada pela prefeitura na conta de luz.', 'nota');
    }
    return html;
  }

  function secaoCenario(m, ctx) {
    const modo = ctx.modo, ci = m.ciclos, fa = m.faturas, ce = m.cenario;
    const ult = fa.length - 1;
    const til = c => aproxima(modo, c) ? '~' : '';
    const sinalKwh = v => (v < 0 ? '−' : '+') + num(Math.abs(v), 2);
    const tudoCobre = ce.every(c => c.sobra > 0);
    const folga = tudoCobre && ce.every(c => c.sobra < 0.25 * c.faturado);
    const real = fa[ult].total - m.composicoes[ult].atraso;
    let abre = tudoCobre ? `Em kWh, a usina cobriria todo o consumo nos ${palavra(fa.length)} ciclos${folga ? ', mas com folga pequena' : ''}.` : 'Em kWh, a usina não cobriria todo o consumo em todos os ciclos.';
    abre += ` Em reais, a conta de ${mesNome(fa[ult])} ficaria em torno de <b>R$ ${num(ce[ult].faturaEstimadaSemAtraso, 0)}</b>, e não ${reais(real, 0)} ` +
      '(valor real sem multa e juros). A conta não zera pelos motivos da página anterior.';
    let acumuladoAprox = false;
    const aproxCred = ci.map(c => (acumuladoAprox = acumuladoAprox || !!til(c)));
    const linhas = [
      ['Gerado / previsto', ...ci.map(c => til(c) + pct(c.geracao / c.previstoCiclo))],
      ['Sobra ou falta real (kWh)', ...ce.map(c => sinalKwh(c.sobraReal))],
      ['Sobra com 100% do previsto (kWh)', ...ce.map((c, i) => til(ci[i]) + (c.sobra < 0 ? '−' : '+') + num(Math.abs(c.sobra), 0))],
      ['Mínimo do previsto para não faltar', ...ce.map((c, i) => til(ci[i]) + pct(c.minimoPrevisto))],
      ['Créditos guardados com 100%', ...ce.map((c, i) => (aproxCred[i] ? '~' : '') + num(c.creditos, 0) + ' kWh')]
    ];
    let html = '<h2>E se a usina gerasse 100% do previsto?</h2>' + p(abre) + tabela([''].concat(fa.map(nomeFatura)), linhas);
    const faltou = ce.map((c, i) => c.sobraReal < 0 ? c.minimoPrevisto : null).filter(finito);
    let nota = '';
    if (faltou.length) {
      const [a, z] = [Math.min(...faltou), Math.max(...faltou)];
      nota = `Abaixo de ${a === z ? pct(a) : pct(a) + ' a ' + pct(z)} do previsto, já falta energia, mesmo nos meses de mais sol. `;
    }
    if (m.fatos && m.fatos.historicoChuva) {
      nota += 'Nos meses de chuva (dezembro a junho), o histórico das faturas mostra a injeção abaixo do consumo da rede em todos os meses. ' +
        'Sem o previsto desses meses, ainda não dá para dizer se isso é a usina rendendo menos ou se ela ficou pequena para o consumo atual.';
    }
    if (nota) html += p(nota.trim(), 'nota');
    return html;
  }

  function secaoAcoes(m, ctx) {
    const f = ctx.fp, ult = m.faturas.length - 1;
    const itens = [];
    if (!ctx.semSolar) itens.push(li('<b>Visita técnica na usina:</b> limpeza dos módulos, conferência de sombra, dos conjuntos de módulos e dos alarmes do inversor.'));
    const pr = m.precos[m.comparada];
    const custo = !ctx.semSolar && f.consumoSemCompensacao > 0 && finito(pr.kwhSemCredito) && finito(pr.cipPorKwh) ? ` Sem créditos, cada kWh a mais custa cerca de ${reais(pr.kwhSemCredito + pr.cipPorKwh)} com a CIP.` : '';
    itens.push(li(`<b>Olhar o consumo da casa:</b> ver o que mudou desde ${ctx.mesB} (ar-condicionado mais ligado, aparelho novo).${custo}`));
    const ultima = m.faturas[ult];
    const avisos = (ultima.avisosFinanceiros || []).map(a => a.descricao).filter(Boolean);
    const emAberto = (ultima.mensagens && ultima.mensagens.debitosEmAberto) || [];
    if (emAberto.length) {
      const atraso = m.composicoes[ult].atraso;
      const mesDe = ref => MESES[Number(String(ref).slice(5, 7)) - 1];
      const lista = emAberto.map(d => `${String(d.referencia).slice(5, 7)}/${String(d.referencia).slice(0, 4)} (${reais(d.valor)})`);
      const titulo = emAberto.length === 1 ? `Fatura de ${mesDe(emAberto[0].referencia)} em aberto` : 'Faturas em aberto';
      const susp = ultima.mensagens.suspensaoAPartirDe;
      itens.push(li(`<b>${titulo}:</b> até a emissão da fatura de ${mesNome(ultima)}, ` +
        (emAberto.length === 1 ? `a de ${lista[0]} constava como não paga` : `as de ${juntar(lista)} constavam como não pagas`) +
        (susp ? `, com aviso de suspensão do fornecimento a partir de ${dataBr(susp)}` : '') + '.' +
        (atraso > 0 ? ` Os atrasos já somaram ${reais(atraso)} de multa, juros e correção em ${mesNome(ultima)}.` : '')));
    } else if (avisos.length) {
      const atraso = m.composicoes[ult].atraso;
      itens.push(li(`<b>Fatura em aberto:</b> a fatura ${refBr(ultima)} traz o aviso “${esc(avisos.join(' · '))}”.` +
        (atraso > 0 ? ` Os atrasos já somaram ${reais(atraso)} de multa, juros e correção em ${mesNome(ultima)}.` : '')));
    }
    return '<h2>O que fazer agora</h2><ul>' + itens.join('') + '</ul>';
  }

  function secaoMetodo(m, ctx) {
    const fa = m.faturas, ci = m.ciclos;
    const refs = juntar(fa.map(refBr));
    const notas = [];
    if (ctx.modo === 'geracao') {
      const datas = m.dias.map(d => d.data);
      notas.push(`Fontes: faturas Equatorial Pará ${refs}, e geração diária e prognóstico do monitoramento do inversor, de ${dataBr(datas[0])} a ${dataBr(datas[datas.length - 1])}. ` +
        'A geração de cada fatura soma os dias entre as leituras do medidor. O horário da leitura não aparece na fatura, então a divisão nos dias de leitura é aproximada.');
      const mapa = new Map(m.dias.map(d => [d.data, d]));
      const excluir = new Set(m.excluir || []);
      const partes = [];
      ci.forEach((c, i) => {
        if (c.diasValidos >= c.dias) return;
        const invalidos = [];
        for (let d = c.inicio; d <= c.fim; d = somarDias(d, 1)) {
          const r = mapa.get(d);
          const bom = r && finito(r.gerado) && !excluir.has(d) && !(finito(r.previsto) && r.gerado > LIMITE_ACUMULO * r.previsto);
          if (!bom) invalidos.push(d);
        }
        const nome = nomeFatura(fa[i]).replace('Fatura', 'fatura');
        partes.push(aproxima(ctx.modo, c)
          ? `Na ${nome}, ${invalidos.length} dos ${c.dias} dias não têm dado válido (${listaDeDias(invalidos)}), e a geração foi estimada pela média dos outros ${c.diasValidos} dias (valores com ~).`
          : `Na ${nome} ${invalidos.length === 1 ? 'falta só' : 'faltam'} ${listaDeDias(invalidos)}.`);
      });
      notas.push('Autoconsumo = geração do inversor − injeção registrada pelo medidor. ' + partes.join(' '));
    } else if (ctx.modo === 'desempenho') {
      notas.push(`Fontes: faturas Equatorial Pará ${refs} e o percentual de desempenho informado para cada fatura. A geração prevista de cada ciclo é a potência (kWp) vezes a produtividade do mês de cada dia; ` +
        'a geração estimada é o desempenho informado vezes a geração prevista do ciclo.');
      notas.push('Autoconsumo = geração estimada − injeção registrada pelo medidor. Todos os valores que dependem da geração levam “~”.');
    } else {
      notas.push(`Fontes: faturas Equatorial Pará ${refs}. Sem usina solar: toda a energia vem da rede.`);
    }
    if (!ctx.semSolar) {
      const d = m.divisao;
      notas.push(`Divisão do aumento: o consumo sem compensação (${reais(ctx.fp.consumoSemCompensacao > 0 ? m.composicoes[m.comparada].semCompensacao : 0)}) foi dividido pela proporção de kWh perdidos em cada causa, ` +
        `comparando com o ritmo de ${ctx.mesB}: ${num(d.kwh.geracao, 0)} kWh por menos geração e ${num(d.kwh.consumo, 0)} kWh por mais consumo. ` +
        (m.fatos && m.fatos.nenhumaCausaSozinha ? 'Nenhuma das duas sozinha teria esgotado os créditos. ' : '') +
        'O efeito do preço usa o custo por kWh de cada fatura. A regra de cálculo da CIP da prefeitura não foi conferida; aqui ela foi tratada como proporcional ao consumo da rede, como aparece nas faturas.');
    } else {
      notas.push('Divisão do aumento: o efeito do preço usa o custo por kWh de cada fatura. A regra de cálculo da CIP da prefeitura não foi conferida; aqui ela foi tratada como proporcional ao consumo da rede, como aparece nas faturas.');
    }
    return '<h2>Como os números foram calculados</h2>' + notas.map(n => p(n, 'nota')).join('');
  }

  // ---------- documento ----------
  function cssSeguro(texto) { return String(texto ?? '').replace(/[^\p{L}\p{N} .\-\/·]/gu, ''); }

  const css = (uc) => '@page{size:A4;margin:17mm 16mm 20mm;' +
    `@top-left{content:"Análise da conta de energia · UC ${cssSeguro(uc)}";font:700 7.5pt Inter,Arial,sans-serif;color:${C.marca}}` +
    `@bottom-left{content:"${RODAPE}";font:7.5pt Inter,Arial,sans-serif;color:${C.tinta2}}` +
    `@bottom-right{content:"Página " counter(page);font:7.5pt Inter,Arial,sans-serif;color:${C.tinta2}}}` +
    '@page :first{margin-top:0;@top-left{content:none}}' +
    '*{box-sizing:border-box}' +
    `body{margin:0;color:${C.tinta};font:9.4pt/1.45 Inter,Arial,sans-serif;print-color-adjust:exact;-webkit-print-color-adjust:exact}` +
    '.folha{break-after:page}.folha:last-child{break-after:auto}' +
    `.faixa{background:${C.marca};color:#fff;margin:0 -16mm 7mm;padding:10mm 16mm 8mm;display:flex;justify-content:space-between;gap:8mm}` +
    '.faixa h1{font:700 17pt/1.2 Unbounded,Arial,sans-serif;margin:0 0 3mm;color:#fff}.faixa p{margin:0 0 1mm;font-size:9pt;color:#fff}' +
    '.faixa .dir{text-align:right;white-space:nowrap}.faixa .dir b{font-family:Unbounded,Arial,sans-serif;font-size:9pt}' +
    `h2{font:700 12pt/1.3 Unbounded,Arial,sans-serif;color:${C.marca};margin:5mm 0 2.5mm;break-after:avoid}` +
    'p{margin:0 0 2.2mm}' +
    `p.cap{font-size:7.8pt;color:${C.tinta2};margin:1mm 0 3mm}p.nota{font-size:7.8pt;color:${C.tinta2};line-height:1.4}` +
    '.kpis{display:flex;margin:3mm 0 2mm;border:.5pt solid ' + C.grade + ';break-inside:avoid}' +
    `.kpi{flex:1;padding:2.5mm 3mm;border-right:.5pt solid ${C.grade}}.kpi:last-child{border-right:0}` +
    `.kpi strong{display:block;font:700 13pt/1.3 Unbounded,Arial,sans-serif;color:${C.marca}}.kpi span{display:block;font-size:7.6pt;color:${C.tinta2};line-height:1.3}` +
    'figure{margin:2mm 0;break-inside:avoid}svg{display:block}' +
    `table{width:100%;border-collapse:collapse;font-size:8.2pt;margin:1mm 0 3mm;break-inside:avoid}th,td{text-align:left;padding:1.4mm 1.4mm;border-bottom:.4pt solid ${C.grade};vertical-align:middle}` +
    `th{background:#eef3ef;color:${C.marca};font-weight:700;border-bottom:.8pt solid ${C.marca}}tr.total td{font-weight:700;border-top:.8pt solid ${C.marca}}` +
    'table:not(.causas) td:not(:first-child),table:not(.causas) th:not(:first-child){text-align:right}.causas td:nth-child(2),.causas td:nth-child(3){white-space:nowrap}' +
    'ul{margin:0 0 2mm;padding-left:4.5mm}li{margin:0 0 1.5mm}' +
    '@media screen{body{max-width:190mm;margin:6mm auto;padding:0 4mm}.faixa{margin:0 -4mm 7mm}.folha{padding-bottom:10mm;border-bottom:1px solid ' + C.grade + '}}';

  function montarHtml(m) {
    const ctx = montarContexto(m);
    const causas = causasDoAumento(m, ctx);
    const cli = m.cliente || {};
    const subtitulo = ctx.semSolar ? `Consumo e custo da energia ${periodoTexto(m)}` : `Geração, autoconsumo e consumo ${periodoTexto(m)}`;
    const faixa = '<header class="faixa"><div><h1>Análise da conta de energia</h1>' + `<p>${esc(subtitulo)}</p>` +
      `<p>${esc(cli.nome)}  ·  UC ${esc(cli.uc)}  ·  ${esc(cli.cidade)}</p></div>` +
      `<div class="dir"><p><b>Solar Green Suporte</b></p><p>${esc(m.dataEmissao && /^\d{4}-/.test(m.dataEmissao) ? dataBr(m.dataEmissao) : m.dataEmissao)}</p></div></header>`;
    const folhas = [faixa + secaoResumo(m, ctx, causas)];
    if (!ctx.semSolar) {
      folhas.push(secaoGeracao(m, ctx));
      folhas.push(secaoCiclos(m, ctx));
    }
    folhas.push(secaoComposicao(m, ctx));
    const ultima = (ctx.semSolar ? '' : secaoCenario(m, ctx)) + secaoAcoes(m, ctx) + secaoMetodo(m, ctx);
    folhas.push(ultima);
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      `<title>Análise da conta de energia · ${esc(cli.nome)}</title>` +
      '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&amp;family=Unbounded:wght@600;700&amp;display=swap">' +
      `<style>${css(cli.uc)}</style></head><body>` + folhas.map(f => `<section class="folha">${f}</section>`).join('') + '</body></html>';
  }

  async function abrir(modelo) {
    const janela = root.open('', '_blank');
    if (!janela) throw new Error('Permita a abertura da janela de impressão para gerar a análise.');
    janela.opener = null;
    try {
      janela.document.open();
      janela.document.write(montarHtml(modelo));
      janela.document.close();
      if (janela.document.fonts && janela.document.fonts.ready) {
        await Promise.race([janela.document.fonts.ready, new Promise(r => setTimeout(r, 2500))]);
      }
      janela.focus();
      janela.print();
    } catch (erro) {
      if (!janela.closed) janela.close();
      throw erro;
    }
  }

  const api = { montarHtml, abrir };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SGAnaliseFaturaPdf = api;
})(typeof window !== 'undefined' ? window : null);
