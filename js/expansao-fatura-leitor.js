(function (root) {
  'use strict';

  const pdfBase = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/';
  const campos = [
    'distribuidora', 'municipio', 'cep', 'uc', 'grupo', 'subgrupo', 'subclasse', 'modalidade', 'tipoFornecimento',
    'referencia', 'vencimento', 'dataLeituraAnterior', 'dataLeituraAtual', 'total',
    'consumoMedido', 'injetadoNoCiclo', 'consumoFaturado', 'consumoSemCompensacao', 'consumoCompensado',
    'creditosAntigosNasLinhas', 'creditosAntigosUsados', 'saldoInicialElegivel', 'saldoDisponivel',
    'saldoAExpirar', 'creditosExpirados', 'regimeGD', 'aliquotaICMS', 'aliquotaPIS', 'aliquotaCofins', 'aliquotaPisCofins',
    'tarifaGD2SemTributos', 'tarifaGD2ComTributos'
  ];
  const moeda = String.raw`([−–-]?\s*(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})`;
  const energia = String.raw`((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?)\s*kwh\b`;

  function normalizar(texto) {
    return String(texto ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function numero(texto) {
    let limpo = String(texto ?? '').trim().replace(/^(?:r\$\s*)/i, '').replace(/[−–]/g, '-').replace(/\s/g, '');
    if (/^\([\d.,]+\)$/.test(limpo)) limpo = '-' + limpo.slice(1, -1);
    limpo = limpo.replace(/%$/, '');
    if (!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/.test(limpo)) return null;
    const valor = Number(limpo.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(valor) ? valor : null;
  }

  function dataISO(texto) {
    const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto ?? '');
    if (!partes) return null;
    const iso = partes[3] + '-' + partes[2] + '-' + partes[1];
    const data = new Date(iso);
    return Number.isFinite(+data) && data.toISOString().slice(0, 10) === iso ? iso : null;
  }

  function referenciaISO(texto) {
    const partes = /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|0[1-9]|1[0-2])\/(\d{4})$/i.exec(texto ?? '');
    if (!partes) return null;
    const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const mes = /^\d/.test(partes[1]) ? partes[1] : String(nomes.indexOf(partes[1].toLowerCase()) + 1).padStart(2, '0');
    return partes[2] + '-' + mes;
  }

  // Cada página é independente. Na mesma linha, o eixo X separa colunas.
  function remontarLinhas(paginas) {
    return paginas.flatMap((pagina, indice) => {
      const pontos = pagina.filter(item => item.str?.trim() && Number.isFinite(item.transform?.[4]) && Number.isFinite(item.transform?.[5]))
        .map(item => ({ texto: item.str.trim(), x: item.transform[4], y: item.transform[5], largura: item.width || 0 }))
        .sort((a, b) => b.y - a.y || a.x - b.x);
      const linhas = [];
      for (const ponto of pontos) {
        let linha = linhas[linhas.length - 1];
        if (!linha || Math.abs(linha.y - ponto.y) > 2) {
          linha = { pagina: indice + 1, y: ponto.y, pontos: [] };
          linhas.push(linha);
        }
        linha.pontos.push(ponto);
      }
      for (const linha of linhas) {
        linha.pontos.sort((a, b) => a.x - b.x);
        linha.texto = linha.pontos.map(ponto => ponto.texto).join(' ');
        linha.normalizado = normalizar(linha.texto);
      }
      return linhas;
    });
  }

  function primeiraCaptura(linhas, padrao) {
    for (const linha of linhas) {
      const encontrado = linha.normalizado.match(padrao);
      if (encontrado) return encontrado[1];
    }
    return null;
  }

  function dadoMonetario(linhas, rotulo) {
    return numero(primeiraCaptura(linhas, new RegExp(rotulo + '\\s*:?\\s*(?:r\\$\\s*)?' + moeda + '(?!\\d)')));
  }

  function dadoEnergia(linhas, rotulo) {
    return numero(primeiraCaptura(linhas, new RegExp(rotulo + '\\s*:?\\s*' + energia)));
  }

  const padroesColuna = [
    ['quantidade', /\bquant(?:idade)?\.?\b/],
    ['precoComTributos', /\b(?:preco|tarifa)\b.*\b(?:c\/|com)\s*trib/],
    ['tarifaSemTributos', /\btarifa\b.*\b(?:s\/|sem)\s*trib|\btarifa\s+unit/],
    ['pisCofins', /\bpis\s*\/\s*cofins\b/],
    ['icms', /\bicms\b/],
    ['valor', /^valor(?:\s|\(|$)/]
  ];

  function colunasItens(linha) {
    const identificada = /\b(?:itens? (?:d[ae] )?fatura|descricao)\b/.test(linha.normalizado);
    const colunas = linha.pontos.flatMap(ponto => {
      const encontrado = padroesColuna.find(([, padrao]) => padrao.test(normalizar(ponto.texto)));
      return encontrado ? [{ nome: encontrado[0], x: ponto.x, direita: ponto.x + ponto.largura }] : [];
    });
    const nomes = new Set(colunas.map(coluna => coluna.nome));
    if (!identificada && (!nomes.has('precoComTributos') || !nomes.has('tarifaSemTributos'))) return null;
    return nomes.has('valor') && nomes.has('quantidade') && nomes.size === colunas.length ? colunas : null;
  }

  function tipoItem(descricao, referencia) {
    const texto = normalizar(descricao);
    if (/\b(?:beneficio|benef\.).*\bscee\b/.test(texto)) {
      if (/\bbrut[oa]\b/.test(texto)) return 'sceeBruto';
      if (/\bliquid[oa]\b/.test(texto)) return 'sceeLiquido';
    }
    if (/\bparc(?:ela)?\.?\s+inj(?:ecao)?\.?.*\bgd[\s-]*ii\b/.test(texto)) return 'gd2';
    if (/\bparc(?:ela)?\.?\s+inj(?:ecao)?\.?.*\bgd[\s-]*iii\b/.test(texto)) return 'gd3';
    if (/\bconsumo\b.*\bcompensad[oa]\b/.test(texto)) return 'consumoCompensado';
    if (/^consumo\b/.test(texto)) return 'consumo';
    if (/\b(?:energia\s+(?:ativa\s+)?inj(?:etada)?\.?|creditos?)\b/.test(texto)) {
      if (/\b(?:anteriores?|mes\s+anterior)\b/.test(texto)) return 'creditoAnterior';
      const competencia = texto.match(/\b(0[1-9]|1[0-2])\/(\d{4}|\d{2})\b/);
      if (competencia && referencia) {
        const ano = competencia[2].length === 2 ? referencia.slice(0, 2) + competencia[2] : competencia[2];
        if (ano + '-' + competencia[1] < referencia) return 'creditoAnterior';
      }
      return 'energiaInjetada';
    }
    if (/\bbandeira\b/.test(texto)) return 'bandeira';
    if (/\b(?:cip|cosip|iluminacao publica)\b/.test(texto)) return 'cip';
    if (/\bmulta\b/.test(texto)) return 'multa';
    if (/\bjuros\b/.test(texto)) return 'juros';
    if (/\bparcelamento\b/.test(texto)) return 'parcelamento';
    return 'outro';
  }

  function valoresDaLinha(linha, colunas, referencia) {
    const valores = {};
    const limiteDescricao = colunas[0].x - 22;
    const descricao = linha.pontos.filter(ponto => ponto.x < limiteDescricao).map(ponto => ponto.texto).join(' ');
    if (!descricao) return null;
    for (const ponto of linha.pontos) {
      const valor = numero(ponto.texto);
      if (valor === null || ponto.x < limiteDescricao) continue;
      const direita = ponto.x + ponto.largura;
      const coluna = colunas.reduce((melhor, candidata) => {
        const distancia = Math.min(Math.abs(ponto.x - candidata.x), Math.abs(direita - candidata.direita));
        return distancia < melhor.distancia ? { candidata, distancia } : melhor;
      }, { candidata: null, distancia: 22 }).candidata;
      if (!coluna) continue;
      valores[coluna.nome] = Object.hasOwn(valores, coluna.nome) ? null : valor;
    }
    if (valores.valor == null) return null;
    return {
      tipo: tipoItem(descricao, referencia), descricao,
      quantidade: valores.quantidade ?? null, precoComTributos: valores.precoComTributos ?? null,
      tarifaSemTributos: valores.tarifaSemTributos ?? null, pisCofins: valores.pisCofins ?? null, icms: valores.icms ?? null,
      valor: valores.valor, noTotal: true
    };
  }

  function extrairItens(linhas, referencia) {
    let colunas = null;
    let pagina = 0;
    let financeiro = false;
    const itens = [];
    const itensFinanceiros = [];
    for (const linha of linhas) {
      if (linha.pagina !== pagina) {
        pagina = linha.pagina;
        colunas = null;
        financeiro = false;
      }
      const novas = colunasItens(linha);
      if (novas) {
        colunas = novas;
        continue;
      }
      if (!colunas) continue;
      if (/^(?:total(?:\s+a\s+pagar|\s+da\s+fatura|\s*$)|tributos?|historico|mensagens|informacoes|reservado|debitos|avisos)\b/.test(linha.normalizado)) {
        colunas = null;
        continue;
      }
      if (/^(?:itens financeiros|lancamentos financeiros)\b/.test(linha.normalizado)) {
        financeiro = true;
        continue;
      }
      const item = valoresDaLinha(linha, colunas, referencia);
      if (!item) continue;
      if (financeiro && item.tipo === 'outro') item.tipo = 'financeiro';
      const eventual = ['multa', 'juros', 'parcelamento'].includes(item.tipo);
      if (eventual) item.eventual = true;
      itens.push(item);
      // O cálculo já recalcula o SCEE, inclusive o benefício líquido.
      if (item.tipo !== 'sceeLiquido' && (financeiro || eventual || item.tipo === 'cip')) {
        itensFinanceiros.push(item);
      }
    }
    return { itens, itensFinanceiros };
  }

  function extrairMedicao(linhas) {
    let tabela;
    const totais = { consumoMedido: [], injetadoNoCiclo: [] };
    for (const linha of linhas) {
      if (/\bleitura anterior\b/.test(linha.normalizado) && /\bleitura atual\b/.test(linha.normalizado)) {
        const localizar = padrao => linha.pontos.find(ponto => padrao.test(normalizar(ponto.texto)));
        const anterior = localizar(/^leitura anterior\b/);
        const atual = localizar(/^leitura atual\b/);
        const constante = localizar(/^const(?:ante)?\.?(?:\s|$)/);
        const consumo = localizar(/^consumo(?:\s*\(kwh\))?$/);
        tabela = anterior && atual ? { pagina: linha.pagina, y: linha.y, anterior, atual, constante, consumo } : null;
        continue;
      }
      if (!tabela || tabela.pagina !== linha.pagina || tabela.y - linha.y > 70) continue;
      if (colunasItens(linha) || /^(?:tributos?|historico|mensagens|informacoes)\b/.test(linha.normalizado)) {
        tabela = null;
        continue;
      }
      const campo = /\benergia (?:ativa )?injetada\b/.test(linha.normalizado) ? 'injetadoNoCiclo'
        : /\bconsumo(?: ativo)?\b|\benergia ativa\b/.test(linha.normalizado) ? 'consumoMedido' : null;
      if (!campo) continue;
      const valorColuna = coluna => {
        if (!coluna) return null;
        const valores = linha.pontos.filter(ponto => Math.abs(ponto.x - coluna.x) <= 16 && numero(ponto.texto) !== null);
        return valores.length === 1 ? numero(valores[0].texto) : null;
      };
      let quantidade = valorColuna(tabela.consumo);
      if (quantidade === null) {
        const anterior = valorColuna(tabela.anterior);
        const atual = valorColuna(tabela.atual);
        const constante = valorColuna(tabela.constante);
        if (anterior !== null && atual !== null && atual >= anterior && constante > 0) quantidade = (atual - anterior) * constante;
      }
      totais[campo].push(quantidade);
    }
    // Sem identificação dos postos, mais de uma linha da mesma grandeza é ambígua.
    return Object.fromEntries(Object.entries(totais).map(([campo, valores]) => [campo, valores.length === 1 ? valores[0] : null]));
  }

  // Emparelha TE/TUSD só quando o nome da linha e a quantidade identificam a mesma faixa.
  function somarEnergia(itens, tipo) {
    const selecionados = itens.filter(item => item.tipo === tipo);
    if (!selecionados.length || selecionados.some(item => item.quantidade === null)) return null;
    const pares = new Map();
    let total = 0;
    for (const item of selecionados) {
      const descricao = normalizar(item.descricao);
      const componente = descricao.match(/\b(tusd|te)\b/)?.[1];
      const quantidade = Math.abs(item.quantidade);
      if (!componente) {
        total += quantidade;
        continue;
      }
      const chave = descricao.replace(/\b(?:tusd|te)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
      const grupo = pares.get(chave) || { te: [], tusd: [] };
      grupo[componente].push(quantidade);
      pares.set(chave, grupo);
    }
    for (const { te, tusd } of pares.values()) {
      te.sort((a, b) => a - b);
      tusd.sort((a, b) => a - b);
      if (te.length && tusd.length && (te.length !== tusd.length || te.some((valor, i) => valor !== tusd[i]))) return null;
      total += (te.length ? te : tusd).reduce((soma, valor) => soma + valor, 0);
    }
    return total;
  }

  function vazio(status, aviso) {
    return {
      ...Object.fromEntries(campos.map(campo => [campo, null])),
      itens: [], itensFinanceiros: [], tributos: [], avisosFinanceiros: [],
      origem: Object.fromEntries([...campos, 'itens', 'itensFinanceiros', 'tributos', 'avisosFinanceiros']
        .map(campo => [campo, 'não encontrado'])),
      status, revisaoObrigatoria: true, avisos: [aviso]
    };
  }

  function tabelaTributos(linhas) {
    const tributos = [];
    let colunas = null;
    let pagina = 0;
    for (const linha of linhas) {
      if (linha.pagina !== pagina) {
        pagina = linha.pagina;
        colunas = null;
      }
      if (/\bbase (?:de )?calculo\b/.test(linha.normalizado) && /\baliquota\b/.test(linha.normalizado) && /\bvalor\b/.test(linha.normalizado)) {
        const localizar = padrao => linha.pontos.find(ponto => padrao.test(normalizar(ponto.texto)));
        const base = localizar(/^base\b/);
        const aliquota = localizar(/^aliquota\b/);
        const valor = localizar(/^valor\b/);
        colunas = base && aliquota && valor ? { base, aliquota, valor } : null;
        continue;
      }
      if (!colunas) continue;
      const tipo = linha.normalizado.match(/^(icms|pis\/cofins|pis|cofins)\b/)?.[1];
      if (!tipo) {
        colunas = null;
        continue;
      }
      const valores = {};
      for (const [chave, cabecalho] of Object.entries(colunas)) {
        const ponto = linha.pontos.find(p => Math.abs(p.x - cabecalho.x) <= 16 && numero(p.texto) !== null);
        valores[chave] = ponto ? numero(ponto.texto) : null;
      }
      tributos.push({ tipo, ...valores });
    }
    return tributos;
  }

  function lerTextoPosicional(paginas) {
    const linhas = remontarLinhas(paginas);
    if (!linhas.length) return vazio('sem-texto', 'Este PDF não contém texto selecionável. Preencha a fatura manualmente.');
    const distribuidora = linhas.some(linha => /\bequatorial(?:\s+energia)?\s+para\b|\bpara\s+distribuidora\s+de\s+energia\b/.test(linha.normalizado));
    const tabela = linhas.some(colunasItens);
    const cabecalho = linhas.some(linha => /\b(?:unidade consumidora|conta contrato)\b/.test(linha.normalizado));
    if (!distribuidora || !tabela || !cabecalho) {
      return vazio('layout-desconhecido', 'O formato da Equatorial Pará não pôde ser reconhecido. Preencha a fatura manualmente.');
    }
    const fatura = vazio('lido', 'Confira todos os campos com o PDF antes de usar a leitura.');
    const ref = primeiraCaptura(linhas, /\b(?:ref(?:erencia)?\.?|mes de referencia)\s*:?\s*([a-z]{3}\/\d{4}|\d{2}\/\d{4})\b/);
    fatura.referencia = referenciaISO(ref);
    const { itens, itensFinanceiros } = extrairItens(linhas, fatura.referencia);
    fatura.distribuidora = 'Equatorial Pará';
    fatura.itens = itens;
    fatura.itensFinanceiros = itensFinanceiros;
    const municipio = linhas.map(linha => linha.texto.match(/\bMunic[ií]pio\s*:?\s*([\p{L} -]+?)(?=\s*[-/]?\s*\bPA\b|\s+(?:CEP|UF)\b|$)/iu)?.[1]?.trim()).find(Boolean);
    fatura.municipio = municipio || null;
    fatura.cep = primeiraCaptura(linhas, /\bcep\s*:?\s*(\d{5}-?\d{3})\b/);
    fatura.uc = primeiraCaptura(linhas, /\b(?:unidade consumidora|conta contrato)\s*:?\s*(\d{5,15})\b/);
    const subgrupo = primeiraCaptura(linhas, /\b(?:subgrupo|classificacao)\s*:?\s*(b[1-4])\b/);
    fatura.subgrupo = subgrupo?.toUpperCase() || null;
    fatura.grupo = subgrupo ? 'B' : primeiraCaptura(linhas, /\bgrupo\s*:?\s*([ab])\b/)?.toUpperCase() || null;
    fatura.subclasse = primeiraCaptura(linhas, /\b(desconto social|tarifa social|baixa renda|residencial|rural|comercial|industrial)\b/);
    fatura.modalidade = primeiraCaptura(linhas, /\b(?:modalidade(?: tarifaria)?\s*:?\s*)?(tarifa branca|convencional)\b/);
    fatura.tipoFornecimento = primeiraCaptura(linhas, /\b(monofasic[oa]|bifasic[oa]|trifasic[oa])\b/);
    fatura.vencimento = dataISO(primeiraCaptura(linhas, /\bvencimento\s*:?\s*(\d{2}\/\d{2}\/\d{4})\b/));
    fatura.dataLeituraAnterior = dataISO(primeiraCaptura(linhas, /\b(?:data (?:da |de )?)?leitura anterior\s*:?\s*(\d{2}\/\d{2}\/\d{4})\b/));
    fatura.dataLeituraAtual = dataISO(primeiraCaptura(linhas, /\b(?:data (?:da |de )?)?leitura atual\s*:?\s*(\d{2}\/\d{2}\/\d{4})\b/));
    fatura.total = dadoMonetario(linhas, '\\btotal (?:a pagar|da fatura)');
    const medicao = extrairMedicao(linhas);
    fatura.consumoMedido = dadoEnergia(linhas, '\\b(?:consumo medido|consumo ativo(?: da rede)?)') ?? medicao.consumoMedido;
    fatura.injetadoNoCiclo = dadoEnergia(linhas, '\\b(?:injetad[ao] no ciclo|energia ativa injetada medida|energia injetada no ciclo)') ?? medicao.injetadoNoCiclo;
    fatura.consumoSemCompensacao = dadoEnergia(linhas, '\\bconsumo sem compensacao') ?? somarEnergia(itens, 'consumo');
    fatura.consumoCompensado = dadoEnergia(linhas, '\\b(?:energia compensada|consumo compensado)(?!\\s*[/–-])') ?? somarEnergia(itens, 'consumoCompensado');
    fatura.consumoFaturado = dadoEnergia(linhas, '\\bconsumo faturado');
    if (fatura.consumoFaturado === null && fatura.consumoSemCompensacao !== null && fatura.consumoCompensado !== null) {
      fatura.consumoFaturado = fatura.consumoSemCompensacao + fatura.consumoCompensado;
    }
    fatura.creditosAntigosNasLinhas = somarEnergia(itens, 'creditoAnterior');
    fatura.creditosAntigosUsados = dadoEnergia(linhas, '\\bcreditos (?:antigos|anteriores) (?:usados|utilizados)');
    fatura.saldoInicialElegivel = dadoEnergia(linhas, '\\b(?:saldo inicial elegivel|saldo anterior de creditos)');
    fatura.saldoDisponivel = dadoEnergia(linhas, '\\bsaldo (?:atualizado|acumulado|disponivel|de creditos disponivel|de creditos)');
    fatura.saldoAExpirar = dadoEnergia(linhas, '\\bsaldo a expirar');
    fatura.creditosExpirados = dadoEnergia(linhas, '\\bcreditos expirados')
      ?? numero(primeiraCaptura(linhas, new RegExp(energia + '\\s+expirados\\b')));
    const regime = primeiraCaptura(linhas, /\b(?:regime|enquadramento)(?:\s+(?:da\s+)?gd)?\s*:?\s*gd[\s-]*(iii|ii|i)\b/);
    fatura.regimeGD = regime ? 'GD ' + regime.toUpperCase() : null;
    const linhasGD2 = itens.filter(item => item.tipo === 'gd2');
    if (linhasGD2.length) {
      const semTributos = new Set(linhasGD2.map(item => item.tarifaSemTributos));
      const comTributos = new Set(linhasGD2.map(item => item.precoComTributos));
      fatura.tarifaGD2SemTributos = semTributos.size === 1 ? semTributos.values().next().value : null;
      fatura.tarifaGD2ComTributos = comTributos.size === 1 ? comTributos.values().next().value : null;
    }
    fatura.tributos = tabelaTributos(linhas);
    for (const [campo, tipo] of Object.entries({ aliquotaICMS: 'icms', aliquotaPIS: 'pis', aliquotaCofins: 'cofins', aliquotaPisCofins: 'pis/cofins' })) {
      const tributo = fatura.tributos.filter(item => item.tipo === tipo);
      if (tributo.length === 1) fatura[campo] = tributo[0].aliquota;
    }
    fatura.avisosFinanceiros = linhas.filter(linha => /\b(?:debitos? anteriores?|contas? em atraso)\b/.test(linha.normalizado))
      .map(linha => ({ descricao: linha.texto, noTotal: false }));
    for (const campo of Object.keys(fatura.origem)) {
      if (Array.isArray(fatura[campo]) ? fatura[campo].length : fatura[campo] !== null) fatura.origem[campo] = 'lido';
    }
    if (fatura.saldoDisponivel === null) {
      fatura.avisos.push('Saldo não informado na fatura. Consulte o extrato SCEE se houver compensação.');
    }
    return fatura;
  }

  async function carregarPdfJs() {
    const pdfjs = await import(pdfBase + 'legacy/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = pdfBase + 'legacy/build/pdf.worker.min.mjs';
    return pdfjs;
  }

  async function lerFatura(arquivo, carregar = carregarPdfJs) {
    const tamanhoMaximo = 10 * 1024 * 1024;
    let tarefa;
    try {
      if (!arquivo?.arrayBuffer || arquivo.size > tamanhoMaximo) return vazio('erro', 'Selecione um PDF de até 10 MB.');
      const dados = new Uint8Array(await arquivo.arrayBuffer());
      if (!dados.length || dados.length > tamanhoMaximo || !new TextDecoder().decode(dados.subarray(0, 1024)).includes('%PDF-')) {
        return vazio('erro', 'O arquivo não é um PDF válido de até 10 MB.');
      }
      const pdfjs = await carregar();
      // O worker recebe os bytes em memória. Nenhuma URL do documento é enviada ao PDF.js.
      tarefa = pdfjs.getDocument({
        data: dados, isEvalSupported: false, disableFontFace: true, useSystemFonts: false,
        standardFontDataUrl: pdfBase + 'standard_fonts/'
      });
      const pdf = await tarefa.promise;
      const paginas = [];
      for (let pagina = 1; pagina <= pdf.numPages; pagina++) {
        const conteudo = await (await pdf.getPage(pagina)).getTextContent();
        paginas.push(conteudo.items);
      }
      return lerTextoPosicional(paginas);
    } catch {
      return vazio('erro', 'Não foi possível ler este PDF no navegador. Verifique se ele está protegido ou preencha a fatura manualmente.');
    } finally {
      if (tarefa) await tarefa.destroy().catch(() => {});
    }
  }

  const api = { lerFatura, lerTextoPosicional, remontarLinhas, carregarPdfJs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SGExpansaoFaturaLeitor = api;
})(typeof window !== 'undefined' ? window : null);
