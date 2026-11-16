(function () {
  'use strict';

  // Aba "Análise de Fatura" do gerador de proposta. Lê as faturas da Equatorial no navegador
  // (SGExpansaoFaturaLeitor), cruza com a geração colada do inversor e calcula por ciclo de
  // leitura (SGAnaliseFatura). Salva em analises_fatura e gera o PDF (SGAnaliseFaturaPdf).

  const COLECAO = 'analises_fatura';
  const MODOS = { geracao: 'Com geração do inversor', desempenho: 'Só % de desempenho', semSolar: 'Sem energia solar' };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (n, dec = 2) => Number.isFinite(n)
    ? n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';
  const reais = n => Number.isFinite(n) ? 'R$ ' + fmt(n) : '—';
  const dataBR = (iso, ano = true) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + (ano ? '/' + iso.slice(0, 4) : '') : '—';
  const refBR = iso => iso ? iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—';
  const refCurta = iso => iso ? MESES[Number(iso.slice(5, 7)) - 1] + '/' + iso.slice(0, 4) : '—';
  const pct = n => Number.isFinite(n) ? Math.round(n * 100) + '%' : '—';
  const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const copia = d => JSON.parse(JSON.stringify(d));
  const cidadeBR = c => String(c || '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, l) => a + l.toUpperCase())
    .replace(/ (D[aeo]s?|E) /g, m => m.toLowerCase());
  const ucBR = uc => /^\d{12}$/.test(String(uc || '')) ? String(uc).replace(/^(\d)(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3.$4-$5') : String(uc || '');

  function numero(texto) {
    const t = String(texto ?? '').trim().replace(/[−–]/g, '-');
    const s = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
    return /^-?\d+(?:\.\d+)?$/.test(s) ? Number(s) : null;
  }

  function criar({ getClientes, showToast }) {
    const $ = id => document.getElementById(id);
    const calc = window.SGAnaliseFatura;
    const usuario = () => window.firebase?.auth().currentUser;
    const db = () => window.firebase.firestore();
    const erro = e => showToast(e?.message || 'Não foi possível concluir a ação.', false);

    let clienteId = '', clienteNome = '', comboCliente = null;
    let modo = 'geracao', faturas = [], textoGeracao = '', dias = [], avisosGeracao = [];
    let kwp = null, cidade = '', produtividade = null, desempenhos = [];
    let base = 0, comparada = 0, salvoId = '', ocupado = false, resultado = null, salvas = [];

    function aviso(texto) { $('anlAviso').textContent = texto || ''; }

    function clientes() { return (getClientes() || []).slice(); }

    function ordenar() {
      faturas.sort((a, b) => String(a.dataLeituraAtual).localeCompare(String(b.dataLeituraAtual)));
      base = 0;
      comparada = Math.max(0, faturas.length - 1);
    }

    // ── cálculo ────────────────────────────────────────────────────────────
    function calcular() {
      resultado = null;
      if (!faturas.length) return;
      const periodo = calc.periodoParaColar(faturas);
      let ciclos = null;
      try {
        if (modo === 'geracao') {
          ciclos = dias.length ? calc.analisarCiclos(faturas, { dias, modo, excluir: [hoje()] }) : null;
        } else if (modo === 'desempenho') {
          const prontos = Number.isFinite(kwp) && kwp > 0 && produtividade?.mensal && desempenhos.length === faturas.length
            && desempenhos.every(Number.isFinite);
          ciclos = prontos ? calc.analisarCiclos(faturas, { modo, kwp, produtividadeMensal: produtividade.mensal, desempenhos }) : null;
        } else {
          ciclos = calc.analisarCiclos(faturas, { modo });
        }
      } catch (e) { aviso(e.message); }
      const composicoes = faturas.map(f => calc.composicao(f));
      const precos = faturas.map(f => calc.precos(f));
      let divisao = null;
      if (faturas.length > 1 && base !== comparada) {
        divisao = calc.dividirAumento({ fatura: faturas[base], ciclo: ciclos?.[base] }, { fatura: faturas[comparada], ciclo: ciclos?.[comparada] });
      }
      const cenario = ciclos && modo !== 'semSolar' ? calc.cenario100(faturas, ciclos, {}) : null;
      resultado = { periodo, ciclos, composicoes, precos, divisao, cenario };
    }

    // Fatos que o PDF cita e que vêm das mensagens impressas nas faturas (leitor), não do cálculo.
    function fatosDasFaturas() {
      const fatos = {};
      const periodo = faturas.slice(Math.min(base, comparada), Math.max(base, comparada) + 1);
      const reaj = periodo.map(f => f.mensagens?.reajuste).filter(Boolean).pop();
      if (reaj && Number.isFinite(reaj.percentual)) {
        fatos.reajuste = { percentual: reaj.percentual, data: dataBR(reaj.vigencia, false), norma: reaj.norma || '' };
      }
      const cores = f => [...new Set((f?.mensagens?.bandeiras || []).map(b => b.cor))].join(' e ');
      if (cores(faturas[base]) && cores(faturas[comparada])) fatos.bandeiras = { base: cores(faturas[base]), comparada: cores(faturas[comparada]) };
      const d = resultado?.divisao, fc = faturas[comparada];
      const semC = fc?.consumoSemCompensacao || 0;
      if (d?.kwh && semC > 0 && d.kwh.geracao > 0 && d.kwh.consumo > 0) {
        const faltou = (fc.consumoCompensado || 0) + semC - (fc.injetadoNoCiclo || 0);
        const creditos = faltou - semC;
        if (faltou - d.kwh.geracao <= creditos && faltou - d.kwh.consumo <= creditos) fatos.nenhumaCausaSozinha = true;
      }
      return fatos;
    }

    function modeloPdf() {
      const f0 = faturas[0] || {};
      return copia({
        cliente: { nome: clienteNome, uc: ucBR(f0.uc), cidade: cidadeBR(f0.municipio) },
        dataEmissao: hoje(), modo, faturas, ciclos: resultado.ciclos, dias,
        composicoes: resultado.composicoes, precos: resultado.precos, divisao: resultado.divisao,
        cenario: resultado.cenario, base, comparada, excluir: [hoje()], fatos: fatosDasFaturas(),
        desempenhos, kwp, produtividade: produtividade ? { cidade: produtividade.cidade, fonte: produtividade.fonte } : null
      });
    }

    // ── render ─────────────────────────────────────────────────────────────
    function render() {
      calcular();
      renderModo();
      renderFaturas();
      renderGeracao();
      renderResultado();
    }

    function renderModo() {
      document.querySelectorAll('#anlModos button').forEach(b => {
        const ativo = b.dataset.modo === modo;
        b.classList.toggle('on', ativo);
        b.setAttribute('aria-pressed', String(ativo));
      });
      $('anlCardGeracao').hidden = modo === 'semSolar';
      $('anlTituloGeracao').textContent = modo === 'desempenho' ? 'Desempenho da usina' : 'Geração do inversor';
      $('anlBlocoColar').hidden = modo !== 'geracao';
      $('anlBlocoDesempenho').hidden = modo !== 'desempenho';
      const f0 = faturas[0];
      $('anlClienteTitulo').innerHTML = clienteId
        ? 'Cliente: <strong>' + esc(clienteNome) + '</strong>' + (f0?.uc ? ' <span>· UC ' + esc(ucBR(f0.uc)) + '</span>' : '')
        : 'Escolha o cliente para começar';
    }

    function renderFaturas() {
      const lista = $('anlFaturas');
      if (!faturas.length) {
        lista.innerHTML = '<p class="af-vazio">Nenhuma fatura lida. Anexe as faturas da Equatorial em PDF, da mais antiga à mais recente ou todas de uma vez.</p>';
        return;
      }
      const ciclos = resultado?.periodo?.ciclos || [];
      lista.innerHTML = '<div class="af-distrib">Distribuidora <strong>' + esc(faturas[0].distribuidora || 'Equatorial') + '</strong></div>' +
        faturas.map((f, i) => {
          const c = ciclos[i] || {};
          return '<div class="af-fatura"><span class="af-ref">' + esc(refBR(f.referencia)) + '</span>' +
            '<div class="af-fatura-info"><div>Ciclo: ' + esc(dataBR(c.inicio, false)) + ' a ' + esc(dataBR(c.fim, false)) +
            ' <span class="af-dias">(' + (c.dias || '—') + ' dias)</span></div>' +
            '<small>Consumo ' + fmt(f.consumoMedido, 0) + ' kWh · Injetado ' + fmt(f.injetadoNoCiclo, 0) + ' kWh · <strong>' + reais(f.total) + '</strong></small></div>' +
            '<button type="button" class="af-remover" data-remover="' + i + '" aria-label="Retirar a fatura ' + esc(refBR(f.referencia)) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>';
        }).join('');
    }

    function renderGeracao() {
      const periodo = resultado?.periodo;
      $('anlOrientacao').innerHTML = periodo
        ? 'Cole a geração diária de <strong>' + esc(dataBR(periodo.inicio)) + ' a ' + esc(dataBR(periodo.fim)) + '</strong>'
        : 'Leia as faturas primeiro: a tela diz aqui qual período colar.';
      const conf = $('anlConferencia');
      const ciclos = resultado?.ciclos;
      if (modo === 'geracao') {
        if (!ciclos) { conf.innerHTML = ''; return; }
        const avisos = [];
        conf.innerHTML = '<h3 class="af-sub">Conferência por ciclo</h3>' + ciclos.map((c, i) => {
          (c.avisos || []).forEach(a => avisos.push(a));
          const p = c.dias ? c.diasValidos / c.dias : 0;
          return '<div class="af-conf"><div><strong>Ciclo ' + esc(refBR(faturas[i].referencia)) + ':</strong> ' + c.diasValidos + ' de ' + c.dias + ' dias com dado</div>' +
            '<div class="af-barra" role="img" aria-label="' + Math.round(p * 100) + '% dos dias com dado"><i style="width:' + (p * 100).toFixed(1) + '%"></i></div></div>';
        }).join('') + avisos.concat(avisosGeracao).map(textoAviso).filter(Boolean)
          .map(t => '<div class="af-alerta" role="note"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20zM12 10v5m0 3v.01"/></svg><span>' + esc(t) + '</span></div>').join('');
      } else if (modo === 'desempenho') {
        $('anlPercentuais').innerHTML = faturas.map((f, i) =>
          '<div class="field"><label for="anlPct' + i + '">Fatura ' + esc(refBR(f.referencia)) + ' (%)</label>' +
          '<input id="anlPct' + i + '" data-pct="' + i + '" type="text" inputmode="decimal" placeholder="ex.: 85" value="' +
          (Number.isFinite(desempenhos[i]) ? +(desempenhos[i] * 100).toFixed(1) : '') + '"></div>').join('') ||
          '<p class="af-vazio">Leia as faturas para informar o % de cada uma.</p>';
        $('anlProdInfo').textContent = produtividade?.status === 'ok'
          ? 'Previsto: kWp × ' + fmt(produtividade.mediaMensal) + ' kWh/kWp ao mês em média (' + (produtividade.cidade || 'média regional') + '), mês a mês. Fonte: ' + produtividade.fonte + '.'
          : (produtividade?.aviso || 'Escolha a cidade para buscar a produtividade.');
        conf.innerHTML = '';
      } else conf.innerHTML = '';
    }

    function textoAviso(a) {
      if (a.codigo === 'acumulo') return dataBR(a.data, false) + ' com ' + fmt(a.gerado, 0) + ' kWh parece acúmulo de dias sem dado; ficou fora da média.';
      if (a.codigo === 'repetido') return dataBR(a.data, false) + ' apareceu duas vezes na tabela; valeu a última linha.';
      if (a.codigo === 'data-fora-do-periodo') return 'Linha fora do período das faturas ignorada: ' + a.linha;
      if (a.codigo === 'nada-reconhecido') return 'Não reconheci nenhuma linha de dia na tabela colada. Copie a tabela Dia / Gerado / Prognóstico do app do inversor.';
      return '';
    }

    function renderResultado() {
      const r = resultado;
      const temDuas = faturas.length > 1;
      $('anlBase').replaceChildren(...faturas.map((f, i) => new Option(refBR(f.referencia), i)));
      $('anlComparada').replaceChildren(...faturas.map((f, i) => new Option(refBR(f.referencia), i)));
      $('anlBase').value = base; $('anlComparada').value = comparada;
      $('anlComparar').hidden = !temDuas;
      const d = r?.divisao;
      if (!d) {
        $('anlHeroRotulo').textContent = faturas.length ? 'Fatura de ' + refCurta(faturas[0].referencia) : 'Análise do período';
        $('anlHeroValor').textContent = faturas.length === 1 ? reais(faturas[0].total) : '—';
        $('anlHeroSub').textContent = temDuas ? 'Escolha duas faturas diferentes para comparar.' : 'Anexe ao menos duas faturas para ver o que mudou.';
        $('anlCascata').innerHTML = '';
      } else {
        const subiu = d.total >= 0;
        $('anlHeroRotulo').textContent = subiu ? 'Aumento de' : 'Redução de';
        $('anlHeroValor').textContent = reais(Math.abs(d.total));
        $('anlHeroSub').textContent = 'entre ' + refCurta(faturas[base].referencia) + ' e ' + refCurta(faturas[comparada].referencia);
        $('anlCascata').innerHTML = cascata(d);
      }
      const ciclos = r?.ciclos;
      const lista = $('anlDesempenho');
      $('anlBlocoDesempenhoRes').hidden = modo === 'semSolar';
      lista.innerHTML = ciclos && modo !== 'semSolar' ? ciclos.map((c, i) => {
        const ant = i ? ciclos[i - 1].desempenho : null;
        const seta = Number.isFinite(ant) && Number.isFinite(c.desempenho) && Math.abs(c.desempenho - ant) >= 0.005
          ? (c.desempenho < ant ? '<span class="af-seta desce" aria-label="caiu">↘</span>' : '<span class="af-seta sobe" aria-label="subiu">↗</span>') : '';
        return '<li><span>' + esc(refBR(faturas[i].referencia)) + '</span><strong>' + (c.estimada ? '~' : '') + pct(c.desempenho) + '</strong>' + seta + '</li>';
      }).join('') : '<li class="af-vazio">' + (modo === 'desempenho' ? 'Informe kWp, cidade e o % de cada fatura.' : 'Cole a geração para ver o desempenho.') + '</li>';
      const falta = !faturas.length ? 'Leia as faturas para gerar o PDF.'
        : modo === 'semSolar' && faturas.some(f => f.consumoCompensado > 0) ? 'Estas faturas têm energia compensada: escolha um modo com usina.'
        : modo !== 'semSolar' && !ciclos ? (modo === 'geracao' ? 'Cole a geração do inversor para gerar o PDF.' : 'Informe kWp, cidade e o % de cada fatura para gerar o PDF.')
        : '';
      $('anlFalta').textContent = falta;
      $('anlGerarPdf').disabled = Boolean(falta);
      $('anlSalvar').disabled = !clienteId || !faturas.length;
    }

    // Cascata pequena da lateral: só as causas, do zero até a diferença total.
    function cascata(d) {
      const partes = [['Consumo', d.consumo], ['Tarifa e CIP', d.tarifa], ['Queda da geração', d.geracao],
        ['Atraso', d.atraso], ['Bandeira', d.bandeira], ['Outros', d.outros]]
        .filter(([, v]) => Number.isFinite(v) && Math.abs(v) >= 0.005);
      const vis = partes.filter(([, v]) => Math.abs(v) >= 0.005);
      const W = 320, H = 190, top = 26, bot = 40, n = vis.length || 1, bw = Math.min(46, (W - 16) / n - 8);
      let acc = 0, min = 0, max = 0;
      vis.forEach(([, v]) => { acc += v; min = Math.min(min, acc); max = Math.max(max, acc); });
      const esc0 = (H - top - bot) / ((max - min) || 1);
      const y = v => top + (max - v) * esc0;
      acc = 0;
      const barras = vis.map(([nome, v], i) => {
        const x = 8 + i * ((W - 16) / n) + ((W - 16) / n - bw) / 2;
        const y0 = y(acc), y1 = y(acc + v);
        acc += v;
        const cor = v >= 0 ? '#eb6834' : '#4e9b00';
        const linhas = nome.split(' ').length > 1 && nome.length > 9 ? [nome.split(' ')[0], nome.split(' ').slice(1).join(' ')] : [nome];
        return '<rect x="' + x.toFixed(1) + '" y="' + Math.min(y0, y1).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1.5, Math.abs(y1 - y0)).toFixed(1) +
          '" rx="3" fill="' + cor + '"><title>' + esc(nome) + ': ' + reais(v) + '</title></rect>' +
          '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (Math.min(y0, y1) - 5).toFixed(1) + '" text-anchor="middle" class="af-cv">' + (v >= 0 ? '+' : '−') + fmt(Math.abs(v)) + '</text>' +
          linhas.map((l, k) => '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - bot + 14 + k * 11) + '" text-anchor="middle" class="af-cl">' + esc(l) + '</text>').join('');
      }).join('');
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Divisão do aumento por causa"><line x1="4" x2="' + (W - 4) + '" y1="' + y(0).toFixed(1) +
        '" y2="' + y(0).toFixed(1) + '" stroke="#dde8dd"/>' + barras + '</svg>';
    }

    // ── ações ──────────────────────────────────────────────────────────────
    async function executar(acao) {
      if (ocupado) return;
      ocupado = true;
      document.getElementById('tab-analise').setAttribute('aria-busy', 'true');
      try { await acao(); } catch (e) { erro(e); } finally {
        ocupado = false;
        document.getElementById('tab-analise').removeAttribute('aria-busy');
      }
    }

    async function lerArquivos(arquivos) {
      const lidos = [];
      for (const [i, arquivo] of Array.from(arquivos).entries()) {
        aviso('Lendo a fatura ' + (i + 1) + ' de ' + arquivos.length + ' no navegador…');
        const f = await window.SGExpansaoFaturaLeitor.lerFatura(arquivo);
        if (!f.dataLeituraAnterior || !f.dataLeituraAtual) throw new Error('Não achei as datas de leitura em ' + arquivo.name + '. Confira se é a fatura da Equatorial em PDF.');
        lidos.push(f);
      }
      for (const f of lidos) {
        const igual = faturas.findIndex(x => x.referencia === f.referencia && x.uc === f.uc);
        if (igual >= 0) faturas[igual] = f; else faturas.push(f);
      }
      const ucs = new Set(faturas.map(f => f.uc).filter(Boolean));
      ordenar();
      desempenhos = faturas.map((_, i) => desempenhos[i] ?? null);
      aviso(ucs.size > 1 ? 'Atenção: há faturas de mais de uma unidade consumidora.' : '');
      lerColado();
      render();
    }

    function lerColado() {
      if (!textoGeracao.trim() || !faturas.length) { dias = []; avisosGeracao = []; return; }
      const p = calc.periodoParaColar(faturas);
      const r = calc.lerGeracaoColada(textoGeracao, { inicio: p.inicio, fim: p.fim });
      dias = r.dias;
      avisosGeracao = r.avisos || [];
      if (!dias.length) avisosGeracao = [{ codigo: 'nada-reconhecido' }];
    }

    async function buscarProdutividade() {
      const f0 = faturas[0] || {};
      produtividade = await window.SGExpansaoProdutividade.resolver({
        cidadeEscolhida: cidade === '__regional' ? 'Outra cidade' : cidade, cidadeFatura: f0.municipio, cepFatura: f0.cep
      });
      const sel = $('anlCidade');
      const atual = sel.value;
      sel.replaceChildren(new Option('Identificar pela fatura', ''), ...(produtividade.cidades || []).map(c => new Option(c, c)), new Option('Outra cidade', '__regional'));
      sel.value = atual || '';
      render();
    }

    async function salvar() {
      const u = usuario();
      if (!u || u.isAnonymous) throw new Error('Entre no ERP para salvar a análise.');
      if (!clienteId) throw new Error('Escolha o cliente antes de salvar.');
      if (!faturas.length) throw new Error('Leia ao menos uma fatura.');
      const d = resultado?.divisao;
      const doc = {
        IdCliente: clienteId, NomeCliente: clienteNome, OwnerUid: u.uid, Modo: modo,
        Faturas: copia(faturas), Geracao: modo === 'geracao' ? copia(dias) : [],
        Desempenhos: desempenhos, Kwp: Number.isFinite(kwp) ? kwp : null, Cidade: cidade,
        Base: base, Comparada: comparada,
        Resumo: {
          Referencias: faturas.map(f => f.referencia), Diferenca: d ? +d.total.toFixed(2) : null,
          Desempenhos: (resultado?.ciclos || []).map(c => Number.isFinite(c.desempenho) ? +c.desempenho.toFixed(4) : null)
        },
        AtualizadoEm: window.firebase.firestore.FieldValue.serverTimestamp()
      };
      aviso('Salvando a análise…');
      const col = db().collection(COLECAO);
      if (salvoId) await col.doc(salvoId).set(doc, { merge: false });
      else {
        doc.CriadoEm = window.firebase.firestore.FieldValue.serverTimestamp();
        salvoId = (await col.add(doc)).id;
      }
      aviso('');
      showToast('Análise salva no cliente.');
      await carregarSalvas();
    }

    async function carregarSalvas() {
      const lista = $('anlSalvas');
      if (!clienteId) { salvas = []; lista.innerHTML = '<li class="af-vazio">Escolha o cliente para ver as análises salvas.</li>'; return; }
      const snap = await db().collection(COLECAO).where('IdCliente', '==', clienteId).get();
      salvas = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.AtualizadoEm?.toMillis?.() || 0) - (a.AtualizadoEm?.toMillis?.() || 0));
      lista.innerHTML = salvas.length ? salvas.map(s => {
        const quando = s.AtualizadoEm?.toDate ? s.AtualizadoEm.toDate().toLocaleDateString('pt-BR') : '';
        const refs = s.Resumo?.Referencias || [];
        const dif = s.Resumo?.Diferenca;
        return '<li><span>' + esc(quando) + ' · faturas ' + esc(refBR(refs[0])) + (refs.length > 1 ? ' a ' + esc(refBR(refs[refs.length - 1])) : '') +
          ' · ' + esc(MODOS[s.Modo] || '') + (Number.isFinite(dif) ? ' · ' + (dif >= 0 ? 'aumento ' : 'redução ') + reais(Math.abs(dif)) : '') + '</span>' +
          '<span class="af-salva-acoes"><button type="button" class="btn btn-secondary" data-abrir="' + esc(s.id) + '">Abrir</button>' +
          '<button type="button" class="btn btn-secondary" data-pdf="' + esc(s.id) + '">PDF</button></span></li>';
      }).join('') : '<li class="af-vazio">Nenhuma análise salva para este cliente.</li>';
    }

    function abrirSalva(id) {
      const s = salvas.find(x => x.id === id);
      if (!s) throw new Error('Análise não encontrada.');
      salvoId = s.id; modo = s.Modo || 'geracao';
      faturas = copia(s.Faturas || []); dias = copia(s.Geracao || []); textoGeracao = '';
      desempenhos = s.Desempenhos || []; kwp = s.Kwp ?? null; cidade = s.Cidade || '';
      base = s.Base ?? 0; comparada = s.Comparada ?? Math.max(0, faturas.length - 1);
      $('anlColar').value = dias.length ? '(geração salva: ' + dias.length + ' dias; cole de novo para substituir)' : '';
      $('anlKwp').value = Number.isFinite(kwp) ? kwp : '';
      $('anlCidade').value = cidade;
      render();
      if (modo === 'desempenho') buscarProdutividade().catch(erro);
    }

    function nova() {
      salvoId = ''; faturas = []; dias = []; textoGeracao = ''; avisosGeracao = []; desempenhos = []; base = comparada = 0;
      $('anlColar').value = '';
      render();
    }

    function mudarCliente(id, nome) {
      const trocar = () => { clienteId = id; clienteNome = nome; nova(); carregarSalvas().catch(erro); };
      if (id !== clienteId && faturas.length) {
        comboCliente?.setValor?.(clienteId, clienteNome);
        window.abrirDialogoGerador('Trocar cliente', 'As faturas e a geração desta análise serão retiradas.', 'Trocar cliente', trocar);
      } else trocar();
    }

    function conectar() {
      comboCliente = window.SGCombo.criar({
        inputId: 'anlSelClienteBusca', hiddenId: 'anlSelCliente', dropdownId: 'anlSelClienteDropdown',
        getOpcoes: () => clientes().map(c => ({ id: c.id, label: c.nome })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
        onSelecionar: mudarCliente
      });
      $('anlModos').addEventListener('click', e => {
        const b = e.target.closest('button[data-modo]');
        if (!b) return;
        modo = b.dataset.modo;
        render();
        if (modo === 'desempenho' && !produtividade) buscarProdutividade().catch(erro);
      });
      $('anlArquivo').addEventListener('change', e => {
        const arquivos = e.target.files;
        if (arquivos?.length) executar(() => lerArquivos(arquivos)).finally(() => { e.target.value = ''; aviso(''); });
      });
      $('anlFaturas').addEventListener('click', e => {
        const b = e.target.closest('[data-remover]');
        if (!b) return;
        faturas.splice(Number(b.dataset.remover), 1);
        desempenhos.splice(Number(b.dataset.remover), 1);
        ordenar(); lerColado(); render();
      });
      $('anlColar').addEventListener('input', e => {
        textoGeracao = e.target.value;
        lerColado(); render();
      });
      $('anlKwp').addEventListener('input', e => { kwp = numero(e.target.value); render(); });
      $('anlCidade').addEventListener('change', e => { cidade = e.target.value; buscarProdutividade().catch(erro); });
      $('anlPercentuais').addEventListener('input', e => {
        const i = e.target.dataset.pct;
        if (i == null) return;
        const v = numero(e.target.value);
        desempenhos[Number(i)] = Number.isFinite(v) ? v / 100 : null;
        calcular(); renderResultado();
      });
      $('anlBase').addEventListener('change', e => { base = Number(e.target.value); render(); });
      $('anlComparada').addEventListener('change', e => { comparada = Number(e.target.value); render(); });
      $('anlSalvar').addEventListener('click', () => executar(salvar));
      $('anlGerarPdf').addEventListener('click', () => executar(async () => {
        if (!resultado) throw new Error('Leia as faturas antes de gerar o PDF.');
        await window.SGAnaliseFaturaPdf.abrir(modeloPdf());
      }));
      $('anlNova').addEventListener('click', () => {
        if (faturas.length) window.abrirDialogoGerador('Nova análise', 'As faturas e a geração desta análise serão retiradas.', 'Nova análise', nova);
        else nova();
      });
      $('anlSalvas').addEventListener('click', e => {
        const abrir = e.target.closest('[data-abrir]'), pdf = e.target.closest('[data-pdf]');
        if (abrir) executar(async () => abrirSalva(abrir.dataset.abrir));
        if (pdf) executar(async () => { abrirSalva(pdf.dataset.pdf); await window.SGAnaliseFaturaPdf.abrir(modeloPdf()); });
      });
    }

    let conectado = false;
    return {
      async abrir() {
        if (!conectado) { conectar(); conectado = true; }
        const u = usuario();
        if (!u || u.isAnonymous) aviso('Entre no ERP para salvar análises. A leitura e o cálculo funcionam mesmo assim.');
        render();
        if (clienteId) await carregarSalvas();
        else $('anlSalvas').innerHTML = '<li class="af-vazio">Escolha o cliente para ver as análises salvas.</li>';
      },
      atualizarClientes() { /* o combo lê getClientes() a cada busca */ },
      _estado: () => ({ modo, faturas, dias, resultado }),
      _modeloPdf: () => modeloPdf()
    };
  }

  window.SGAnaliseFaturaTela = { criar };
})();
