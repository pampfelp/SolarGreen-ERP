/**
 * disparos.js: tela de campanhas de disparo de WhatsApp (2026-10-29).
 *
 * Página avulsa (disparos.html), sem sg-auth.js: a trava é a sessão do ERP
 * (sg_auth_session) e o papel de administrador é conferido aqui com a mesma lista
 * de SG_ADMIN_ROLES. A segurança de verdade fica nas firestore.rules.
 *
 * Telas: Campanhas, Detalhe (com remoção de contatos), Nova campanha (e edição do rascunho),
 * Adicionar contatos a uma campanha ativa ou pausada, Contatos, Modelos e Conversa (modal). As regras de negócio puras ficam em
 * js/disparo-regras.js (também testadas em Node).
 */
(function () {
  'use strict';

  var R = window.DisparoRegras;
  var SESSAO = window.SG_SESSION;
  if (!SESSAO || !R) return; // sem sessão, o script do <head> já mandou pro login

  // ══════════════ CONSTANTES ══════════════
  var SG_ADMIN_ROLES = ['admin', 'administrador', 'ceo', 'gestor', 'gerente'];
  var SOU_ADMIN = SG_ADMIN_ROLES.indexOf(String(SESSAO.tipo || '').trim().toLowerCase()) !== -1;
  // Mesma URL do Apps Script que js/sg-auth.js usa (DEFAULT_API_URL).
  var API_URL = 'https://script.google.com/macros/s/AKfycbzFCy8PyBZBODgA34xrlLTVUUNhKBIlguJT3ectH7Yus-VW1n41GcCclc5q_Yj0Di2O7g/exec';
  var CUSTO_PADRAO = 0.32;
  var POR_PAGINA = 100;
  var LOTE = 400;
  var DICA_ADMIN = 'Só o administrador';
  var MES3 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  var STATUS_ROTULO = { fila: 'Na fila', enviado: 'Enviado', entregue: 'Entregue', lido: 'Lido', clicou: 'Clicou', respondeu: 'Respondeu', saiu: 'Saiu', erro: 'Não entregue', removido: 'Removido' };
  var RESP_ROTULO = { respondeu: 'Respondeu', clicou: 'Clicou', nao_interagiu: 'Não interagiu', nao_entregue: 'Não entregue', falha_envio: 'Falha de envio', saiu: 'Saiu', nunca: 'Nunca recebeu' };
  var TIPO_ROTULO = { perdido: 'Perdido', parado: 'Parado', aberto: 'Aberto', 'sem funil': 'Sem funil', importado: 'Importado' };
  var CAMPANHA_ROTULO = { rascunho: 'Rascunho', ativa: 'Ativa', pausada: 'Pausada', encerrada: 'Encerrada' };
  var CAMPANHA_ORDEM = { ativa: 0, pausada: 1, rascunho: 2, encerrada: 3 };
  var MODELO_STATUS = {
    APPROVED: ['Aprovado', 'aprovado'], PENDING: ['Em análise', 'analise'], IN_APPEAL: ['Em análise', 'analise'],
    REJECTED: ['Recusado', 'recusado'], PAUSED: ['Pausado', 'analise'], DISABLED: ['Desativado', 'recusado']
  };

  // ══════════════ UTILITÁRIOS ══════════════
  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function num(n) { return Number(n || 0).toLocaleString('pt-BR'); }
  function moeda(n) { return 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function dataHora(ms) {
    var d = new Date(ms);
    return pad(d.getDate()) + ' ' + MES3[d.getMonth()] + ' ' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function hora(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function diaLongo(ms) { var d = new Date(ms); return pad(d.getDate()) + ' ' + MES3[d.getMonth()] + ' ' + d.getFullYear(); }
  function haDias(ms) {
    var n = Math.floor((Date.now() - ms) / 86400000);
    if (n <= 0) return 'hoje';
    return n === 1 ? 'há 1 dia' : 'há ' + n + ' dias';
  }
  function haTempo(ms) {
    var min = Math.floor((Date.now() - ms) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return 'há ' + min + ' min';
    if (min < 1440) return 'há ' + Math.floor(min / 60) + ' h';
    return haDias(ms);
  }
  function paraMs(v) {
    if (typeof v === 'number') return v;
    if (v && typeof v.toMillis === 'function') return v.toMillis();
    var t = Date.parse(v);
    return isNaN(t) ? 0 : t;
  }
  function semAcento(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function nomeDoCliente(c) { return String(c['Nome Razao Social'] || c.Nome || '').trim(); }
  function novoId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID().replace(/-/g, '').substring(0, 8);
    var s = '';
    for (var i = 0; i < 8; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }
  function msgErro(e) {
    if (e && e.code === 'permission-denied') return 'O banco recusou a gravação. Confira se a sua conta é de administrador.';
    return (e && e.message) || String(e || 'Erro desconhecido.');
  }
  function baixarArquivo(nome, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function csvCelula(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }

  // Ícones de linha (stroke 1.8), nunca emoji.
  var ICONES = {
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    enviar: '<path d="M3 11l18-7-7 18-2.5-7.5z"/><path d="M11.5 14.5L21 4"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    cursor: '<path d="M5 3l14 7-6 2-2 6z"/><path d="M13 12l5 5"/>',
    balao: '<path d="M4 5h16v11H9l-5 4z"/>',
    saida: '<path d="M10 4H5v16h5"/><path d="M15 8l4 4-4 4M19 12H9"/>',
    alerta: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.5"/>',
    carteira: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M16 14.5h2"/>',
    whatsapp: '<path d="M4 20l1.4-4.2A8.5 8.5 0 1 1 8.2 18.6z"/><path d="M9 9c0 3 3 6 6 6l1-1.5-2-1-1 .8c-1-.4-2-1.4-2.4-2.4l.8-1-1-2z"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    esq: '<path d="M15 6l-6 6 6 6"/>',
    dir: '<path d="M9 6l6 6-6 6"/>',
    fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    baixar: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    tick: '<path d="M5 12.5l4 4L19 7"/>',
    tick2: '<path d="M2 12.5l4 4L15 7M10 15l1.5 1.5L21 7"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'
  };
  function ico(nome, extra) {
    return '<svg class="svg ' + (extra || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONES[nome] || '') + '</svg>';
  }

  // ══════════════ TOAST, MODAL E CONFIRMAÇÃO (nunca alert/confirm/prompt) ══════════════
  function toast(texto, erro) {
    var caixa = $('#toasts');
    var t = document.createElement('div');
    t.className = 'toast' + (erro ? ' erro' : '');
    t.textContent = texto;
    caixa.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, erro ? 7000 : 4500);
  }

  var MODAIS = [];
  function abrirModal(o) {
    var fundo = document.createElement('div');
    fundo.className = 'modal-fundo' + (o.sobre ? ' sobre' : '');
    var fechavel = o.fechavel !== false;
    fundo.innerHTML =
      '<div class="modal' + (o.largo ? ' largo' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.titulo) + '" tabindex="-1">' +
        '<div class="modal-cab"><h2>' + esc(o.titulo) + '</h2>' +
        (fechavel ? '<button type="button" class="fechar" aria-label="Fechar">' + ico('fechar') + '</button>' : '') + '</div>' +
        '<div class="modal-corpo"></div>' +
        '<div class="modal-rodape"></div>' +
      '</div>';
    var corpo = $('.modal-corpo', fundo), rodape = $('.modal-rodape', fundo);
    if (typeof o.corpo === 'string') corpo.innerHTML = o.corpo; else if (o.corpo) corpo.appendChild(o.corpo);
    var anterior = document.activeElement;
    var ctrl = { el: corpo, fundo: fundo, botoes: [], fechado: false };
    ctrl.fechar = function (valor) {
      if (ctrl.fechado) return;
      ctrl.fechado = true;
      MODAIS = MODAIS.filter(function (m) { return m !== ctrl; });
      if (fundo.parentNode) fundo.parentNode.removeChild(fundo);
      if (o.aoFechar) o.aoFechar(valor);
      if (anterior && anterior.focus && document.body.contains(anterior)) anterior.focus();
    };
    ctrl.fechavel = fechavel;
    (o.rodape || []).forEach(function (b) {
      var bt = document.createElement('button');
      bt.type = 'button';
      bt.className = 'btn ' + (b.classe || '');
      bt.textContent = b.texto;
      bt.addEventListener('click', function () { b.aoClicar(ctrl, bt); });
      rodape.appendChild(bt);
      ctrl.botoes.push(bt);
    });
    if (!(o.rodape || []).length) rodape.classList.add('hidden');
    if (fechavel) {
      $('.fechar', fundo).addEventListener('click', function () { ctrl.fechar(false); });
      var pressionou = false;
      fundo.addEventListener('mousedown', function (e) { pressionou = e.target === fundo; });
      fundo.addEventListener('click', function (e) { if (pressionou && e.target === fundo) ctrl.fechar(false); });
    }
    $('#camada-modais').appendChild(fundo);
    MODAIS.push(ctrl);
    var primeiro = $('input:not([type=hidden]), textarea, select', corpo) || ctrl.botoes[ctrl.botoes.length - 1] || $('.modal', fundo);
    if (primeiro && primeiro.focus) primeiro.focus();
    return ctrl;
  }
  function fecharTodosModais() { MODAIS.slice().forEach(function (m) { m.fechar(false); }); }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !MODAIS.length) return;
    var topo = MODAIS[MODAIS.length - 1];
    if (topo.fechavel) topo.fechar(false);
  });

  function confirmar(o) {
    return new Promise(function (resolve) {
      var feito = false;
      function fim(v) { if (!feito) { feito = true; resolve(v); } }
      abrirModal({
        titulo: o.titulo, sobre: true, corpo: '<p style="margin:0;line-height:1.6">' + o.texto + '</p>',
        aoFechar: function () { fim(false); },
        rodape: [
          { texto: o.cancelar || 'Cancelar', aoClicar: function (m) { fim(false); m.fechar(); } },
          { texto: o.ok || 'Confirmar', classe: o.perigo ? 'btn-perigo' : 'btn-principal', aoClicar: function (m) { fim(true); m.fechar(); } }
        ]
      });
    });
  }

  // Modal de andamento (gravação em lotes): sem botão de fechar.
  function abrirProgresso(titulo, texto) {
    var m = abrirModal({ titulo: titulo, fechavel: false, corpo: '<p class="suave" data-r="texto" style="margin:0">' + esc(texto) + '</p><div class="barra-prog"><i data-r="barra"></i></div>' });
    m.definir = function (t, pct) {
      $('[data-r="texto"]', m.el).textContent = t;
      $('[data-r="barra"]', m.el).style.width = Math.max(0, Math.min(100, pct)) + '%';
    };
    return m;
  }

  function somenteAdmin(btn) {
    if (!btn || SOU_ADMIN) return;
    btn.disabled = true;
    btn.title = DICA_ADMIN;
  }

  // ══════════════ SERVIDOR (Apps Script) ══════════════
  function chamarServidor(action, dados) {
    var user = firebase.auth().currentUser;
    if (!user) return Promise.reject(new Error('Sua sessão do banco expirou. Entre de novo pelo sistema.'));
    return user.getIdToken().then(function (idToken) {
      return fetch(API_URL, { method: 'POST', cache: 'no-store', body: JSON.stringify(Object.assign({ action: action, idToken: idToken }, dados || {})) });
    }).then(function (r) { return r.json(); }, function () {
      throw new Error('Não consegui falar com o servidor de disparos. Confira a conexão; se persistir, a publicação do Apps Script pode estar pendente.');
    }).then(function (resp) {
      if (!resp || resp.ok === false) throw new Error((resp && resp.erro) || 'O servidor recusou o pedido.');
      return resp;
    }, function (e) {
      if (e instanceof SyntaxError) throw new Error('O servidor respondeu algo que a tela não entendeu. A publicação do Apps Script pode estar pendente.');
      throw e;
    });
  }

  // ══════════════ ESCUTAS (uma por coleção, compartilhada entre as telas) ══════════════
  var NOMES_COL = {
    campanhas: 'campanhas', disparos: 'disparos', clientes: 'clientes', funil: 'funil', vendas: 'vendas',
    vendedores: 'vendedores', modelos: 'modelos_disparo', optout: 'disparo_optout', pipelines: 'funil_pipelines'
  };
  var DADOS = {};
  var VERSAO = 0;

  // Mesmo padrão de SGUtil.escutarComRetry (js/sg-auth.js): um Listen que nasce com
  // permission-denied logo após o login não se recupera sozinho, então tenta de novo.
  function escutarComRetry(criarQuery, aoReceber, nomeDebug, aoFalhar) {
    var parado = false, unsubAtual = null, timer = null, tentativas = 0, MAX = 4;
    function tentar() {
      if (parado) return;
      tentativas++;
      unsubAtual = criarQuery().onSnapshot(aoReceber, function (err) {
        if (parado) return;
        if (err && err.code === 'permission-denied' && tentativas < MAX) { timer = setTimeout(tentar, 1200 * tentativas); return; }
        console.error('Escuta ao vivo falhou (' + (nomeDebug || '?') + '):', err);
        if (aoFalhar) aoFalhar(err);
      });
    }
    tentar();
    return function parar() { parado = true; if (timer) clearTimeout(timer); if (unsubAtual) unsubAtual(); };
  }

  function garantir(chaves) {
    chaves.forEach(function (k) {
      if (DADOS[k]) return;
      var est = DADOS[k] = { lista: [], pronto: false, erro: false };
      window.SGFireReady.then(function (user) {
        if (!user) { est.erro = true; avisarMudanca(); return; }
        escutarComRetry(function () { return firebase.firestore().collection(NOMES_COL[k]); }, function (snap) {
          var l = [];
          snap.forEach(function (d) { var x = d.data(); x._id = d.id; l.push(x); });
          est.lista = l; est.pronto = true; est.erro = false;
          VERSAO++;
          avisarMudanca();
        }, k, function () { est.erro = true; avisarMudanca(); });
      });
    });
  }

  var timerMudanca = null;
  var OUVINTES = [];
  function avisarMudanca() {
    if (timerMudanca) return;
    timerMudanca = setTimeout(function () {
      timerMudanca = null;
      tentarMontar();
      OUVINTES.slice().forEach(function (fn) { fn(); });
    }, 150);
  }

  // ══════════════ DADOS DERIVADOS (calculados uma vez por mudança nas escutas) ══════════════
  var DERIVADO = null;
  function L(k) { return DADOS[k] && DADOS[k].pronto ? DADOS[k].lista : []; }
  function prontos(chaves) { return chaves.every(function (k) { return DADOS[k] && DADOS[k].pronto; }); }

  function derivar() {
    if (DERIVADO && DERIVADO.versao === VERSAO) return DERIVADO;
    var agora = Date.now();
    var d = { versao: VERSAO, agora: agora };

    d.vendedores = L('vendedores').map(function (v) { return Object.assign({ id: v._id }, v); });
    d.vendMap = {};
    d.vendedores.forEach(function (v) { d.vendMap[v.id] = v; });
    d.vendedores.forEach(function (v) { if (v.IdVendedor && !d.vendMap[v.IdVendedor]) d.vendMap[v.IdVendedor] = v; });
    d.ativos = R.vendedoresAtivos(d.vendedores);
    d.nomeVend = function (id) { var v = d.vendMap[id]; return v ? String(v.Nome || '') : ''; };

    d.campMap = {};
    L('campanhas').forEach(function (c) { d.campMap[c._id] = c; });
    d.modeloMap = {};
    L('modelos').forEach(function (m) { d.modeloMap[m.nome || m._id] = m; });
    d.optout = new Set(L('optout').map(function (o) { return o._id; }));

    d.disparosPorTel = {};
    d.disparosPorCamp = {};
    L('disparos').forEach(function (x) {
      (d.disparosPorTel[x.telFim8] = d.disparosPorTel[x.telFim8] || []).push(x);
      (d.disparosPorCamp[x.campanha] = d.disparosPorCamp[x.campanha] || []).push(x);
    });

    d.leadPorOp = {};
    L('funil').forEach(function (f) { d.leadPorOp[f.IdOportunidade || f._id] = f; });

    d.contatos = null;
    d.contatosPorId = {};
    if (prontos(['clientes', 'funil', 'vendas', 'pipelines', 'optout', 'disparos', 'vendedores'])) {
      var comercial = null, papel = {};
      L('pipelines').forEach(function (p) {
        if (!comercial && String(p.Nome || '').trim().toLowerCase() === 'comercial') {
          comercial = p;
          (p.Etapas || []).forEach(function (e) { papel[e.Nome] = e.Papel || ''; });
        }
      });
      var leadsId = {}, leadsTel = {};
      L('funil').forEach(function (f) {
        if (!comercial || f.Pipeline !== comercial._id) return;
        f._ultimo = Math.max(R.ultimoEm(f.Transicoes), R.ultimoEm(f.Atividades));
        if (f.IdCliente) (leadsId[String(f.IdCliente)] = leadsId[String(f.IdCliente)] || []).push(f);
        var k = R.fim8(f.TelefoneCliente);
        if (k.length === 8) (leadsTel[k] = leadsTel[k] || []).push(f);
      });
      var vendeuId = new Set(), vendeuTel = new Set();
      L('vendas').forEach(function (v) {
        if (v.IdCliente) vendeuId.add(String(v.IdCliente));
        var k = R.fim8(v.TelefoneCliente);
        if (k.length === 8) vendeuTel.add(k);
      });
      d.contatos = [];
      L('clientes').forEach(function (c) {
        var telefone = String(c.Telefone == null ? '' : c.Telefone).trim();
        if (!R.digitos(telefone)) return;
        var id = String(c.IdCliente || c._id);
        var tel = R.e164(telefone), f8 = tel ? R.fim8(tel) : '';
        var lead = null;
        (leadsId[id] || []).concat(f8 ? (leadsTel[f8] || []) : []).forEach(function (l) { if (!lead || l._ultimo > lead._ultimo) lead = l; });
        var origem = String(c.Origem || '').trim();
        var etapa = lead ? String(lead.Etapa || '') : '';
        var ultimo = lead ? lead._ultimo : 0;
        var tipo = R.tipoDoContato({ temLead: !!lead, papel: lead ? (papel[etapa] || '') : '', ultimo: ultimo, origem: origem }, agora);
        var candidatos = [lead && lead.IdVendedor, c['Vendedor Responsavel']];
        var donoId = R.donoPreferido(candidatos, d.ativos);
        var ds = f8 ? (d.disparosPorTel[f8] || []) : [];
        var resp = R.respostaNaUltimaCampanha(ds);
        var enviadoEm = 0;
        ds.forEach(function (x) { if (x.enviadoEm && x.enviadoEm > enviadoEm) enviadoEm = x.enviadoEm; });
        var dt = ultimo ? new Date(ultimo) : null;
        var ct = {
          id: id, _id: c._id, nome: nomeDoCliente(c), telefone: telefone, tel: tel, fim8: f8, origem: origem,
          etiquetas: Array.isArray(c.Etiquetas) ? c.Etiquetas.map(String) : [],
          lead: lead, idOportunidade: lead ? (lead.IdOportunidade || lead._id) : '', etapa: etapa, ultimo: ultimo, tipo: tipo,
          temFunil: !!lead, temVenda: vendeuId.has(id) || (f8 !== '' && vendeuTel.has(f8)),
          candidatos: candidatos, donoId: donoId, donoNome: donoId ? d.nomeVend(donoId) : '',
          mesChave: dt ? dt.getFullYear() + '-' + pad(dt.getMonth() + 1) : '',
          mesRotulo: dt ? R.MESES[dt.getMonth()] + ' de ' + dt.getFullYear() : '',
          resp: resp.resposta, ultimoDisparoEm: enviadoEm,
          diasDisparo: enviadoEm ? Math.floor((agora - enviadoEm) / 86400000) : null
        };
        d.contatos.push(ct);
        d.contatosPorId[id] = ct;
      });
    }
    DERIVADO = d;
    return d;
  }

  // ══════════════ COMPONENTES ══════════════
  // Cartão com "chave" vira botão de filtro: clicar filtra a tabela, clicar de novo desfaz.
  function kpisHtml(itens, ativo) {
    return '<div class="kpis">' + itens.map(function (k) {
      var miolo = '<div class="topo-kpi"><span>' + esc(k.rotulo) + '</span>' + ico(k.icone) + '</div><div class="num">' + esc(k.valor) + '</div>';
      var cls = 'kpi' + (k.destaque ? ' destaque' : '');
      if (k.chave == null) return '<div class="' + cls + '">' + miolo + '</div>';
      var on = k.chave !== '' && k.chave === ativo;
      return '<button type="button" class="' + cls + ' kpi-filtro' + (on ? ' ativo' : '') + '" data-kpi="' + esc(k.chave) + '" aria-pressed="' + on + '">' + miolo + '</button>';
    }).join('') + '</div>';
  }
  // Liga os cliques dos cartões: chave '' (Total) limpa; a mesma chave de novo também limpa.
  function ligarKpis(host, aoMudar) {
    var atual = '';
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-kpi]');
      if (!b) return;
      var k = b.getAttribute('data-kpi');
      atual = k === atual ? '' : k;
      aoMudar(atual);
    });
    return function () { return atual; };
  }

  function selo(classe, texto) { return '<span class="selo selo-' + classe + '">' + esc(texto) + '</span>'; }

  // Caixa de múltipla escolha. o: { rotulo, opcoes: [{v,t}], sel: Set, aoMudar }
  function criarMulti(o) {
    var el = document.createElement('div');
    el.className = 'multi';
    el.innerHTML = '<button type="button" class="multi-btn" aria-haspopup="true" aria-expanded="false"><span class="t"></span><span class="conta hidden"></span>' + ico('chevron') + '</button><div class="multi-painel hidden"></div>';
    var btn = $('.multi-btn', el), painel = $('.multi-painel', el), opcoes = o.opcoes || [];
    var termo = '';
    function rotulo() {
      $('.t', btn).textContent = o.rotulo;
      var c = $('.conta', btn);
      c.textContent = o.sel.size;
      c.classList.toggle('hidden', !o.sel.size);
    }
    function lista() {
      var l = $('.multi-lista', painel);
      if (!l) return;
      var t = semAcento(termo);
      var vis = opcoes.filter(function (x) { return !t || semAcento(x.t).indexOf(t) !== -1; });
      l.innerHTML = vis.length ? vis.map(function (x) {
        return '<label class="multi-op"><input type="checkbox" value="' + esc(x.v) + '"' + (o.sel.has(x.v) ? ' checked' : '') + '><span>' + esc(x.t) + '</span></label>';
      }).join('') : '<div class="vazio" style="padding:12px">Nada por aqui.</div>';
    }
    function montarPainel() {
      painel.innerHTML = (opcoes.length > 8 ? '<input class="entrada" type="search" placeholder="Buscar…" aria-label="Buscar na lista">' : '') +
        '<div class="multi-lista"></div><div class="multi-rodape"><button type="button" class="link-btn" data-limpar>Limpar</button></div>';
      var busca = $('input[type=search]', painel);
      if (busca) busca.addEventListener('input', function () { termo = busca.value; lista(); });
      lista();
    }
    btn.addEventListener('click', function () {
      var abrir = painel.classList.contains('hidden');
      document.querySelectorAll('.multi-painel').forEach(function (p) { p.classList.add('hidden'); });
      painel.classList.toggle('hidden', !abrir);
      btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
      if (abrir) { termo = ''; montarPainel(); }
    });
    painel.addEventListener('change', function (e) {
      var cx = e.target;
      if (cx.type !== 'checkbox') return;
      if (cx.checked) o.sel.add(cx.value); else o.sel.delete(cx.value);
      rotulo();
      o.aoMudar();
    });
    painel.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-limpar')) { o.sel.clear(); rotulo(); lista(); o.aoMudar(); }
    });
    rotulo();
    return {
      el: el,
      setOpcoes: function (novas) {
        opcoes = novas;
        // Valor escolhido que sumiu da lista deixa de filtrar.
        var vals = new Set(novas.map(function (x) { return x.v; }));
        var mudou = false;
        Array.from(o.sel).forEach(function (v) { if (!vals.has(v)) { o.sel.delete(v); mudou = true; } });
        rotulo();
        if (!painel.classList.contains('hidden')) montarPainel();
        return mudou;
      }
    };
  }
  document.addEventListener('pointerdown', function (e) {
    document.querySelectorAll('.multi-painel:not(.hidden)').forEach(function (p) {
      if (!p.parentNode.contains(e.target)) {
        p.classList.add('hidden');
        $('.multi-btn', p.parentNode).setAttribute('aria-expanded', 'false');
      }
    });
  });

  function paginaHtml(total, pagina) {
    var ini = total ? pagina * POR_PAGINA + 1 : 0, fim = Math.min(total, (pagina + 1) * POR_PAGINA);
    var ultima = Math.max(0, Math.ceil(total / POR_PAGINA) - 1);
    return '<span>' + num(ini) + ' a ' + num(fim) + ' de ' + num(total) + '</span>' +
      '<div class="paginacao"><button type="button" class="btn" data-pg="-1" aria-label="Página anterior"' + (pagina <= 0 ? ' disabled' : '') + '>' + ico('esq') + '</button>' +
      '<button type="button" class="btn" data-pg="1" aria-label="Próxima página"' + (pagina >= ultima ? ' disabled' : '') + '>' + ico('dir') + '</button></div>';
  }

  // ══════════════ GRAVAÇÃO EM LOTES E DOCS DO PASSO 1 ══════════════
  // Grava `ops` em lotes de LOTE. escrever(lote, op, db) põe a operação no lote;
  // aoProgresso(ate, total) é opcional. Se falhar, o erro leva `feitos` (quantas já foram).
  function emLotes(ops, escrever, aoProgresso) {
    var db = firebase.firestore(), feitos = 0, cadeia = Promise.resolve();
    for (var i = 0; i < ops.length; i += LOTE) (function (ini) {
      cadeia = cadeia.then(function () {
        var lote = db.batch();
        ops.slice(ini, ini + LOTE).forEach(function (op) { escrever(lote, op, db); });
        if (aoProgresso) aoProgresso(Math.min(ini + LOTE, ops.length), ops.length);
        return lote.commit().then(function () { feitos = Math.min(ini + LOTE, ops.length); });
      });
    })(i);
    return cadeia.then(function () { return feitos; }, function (err) { err.feitos = feitos; throw err; });
  }

  // Atualiza campos de vários docs de `disparos` (ids de doc), com barra de andamento só se passar de um lote.
  function atualizarDisparos(ids, campos, titulo) {
    var prog = ids.length > LOTE ? abrirProgresso(titulo, 'Gravando…') : null;
    return emLotes(ids, function (lote, idDoc, db) { lote.update(db.collection('disparos').doc(idDoc), campos); }, prog ? function (ate, total) {
      prog.definir('Gravando: ' + num(ate) + ' de ' + num(total) + '…', ate / total * 100);
    } : null).then(function () { if (prog) prog.fechar(); }, function (err) { if (prog) prog.fechar(); throw err; });
  }
  function msgParou(err, unidade) {
    return (err && err.feitos ? 'Parou no meio: ' + num(err.feitos) + ' ' + unidade + ' já foram gravados. Confira a tabela e repita para os que faltam. ' : '') + msgErro(err);
  }

  // Docs do passo 1 de uma lista de contatos (os mesmos campos que o Iniciar grava).
  // Mesmo telefone em mais de um cadastro: sai uma mensagem só (o primeiro na ordem de envio).
  function docsDoPasso1(contatos, campId, m1, ordemBase, agora) {
    var itens = R.ordenarParaEnvio(contatos.map(function (c) { return { c: c, nome: c.nome, ultimo: c.ultimo }; }));
    var visto = {}, unicos = [];
    itens.forEach(function (x) { if (!visto[x.c.fim8]) { visto[x.c.fim8] = true; unicos.push(x.c); } });
    var donos = R.atribuirDonos(unicos.map(function (c) { return { candidatos: c.candidatos }; }), derivar().ativos);
    return unicos.map(function (c, i) {
      return R.montarDisparo({
        campanha: campId, idOportunidade: c.idOportunidade, idCliente: c.id, nomeCompleto: c.nome, telefone: c.tel, vendedor: donos[i].vendedor,
        tipo: c.tipo, modelo: m1[c.tipo], ultimo: c.ultimo, ordem: ordemBase + i, agora: agora
      });
    });
  }

  // ══════════════ LISTA DE CONTATOS (Nova campanha, Adicionar e Contatos) ══════════════
  var FILTROS_CONTATO = [
    { chave: 'tipo', rotulo: 'Tipo de contato', valores: function (c) { return [c.tipo]; }, opcoes: function () { return R.TIPOS.map(function (t) { return { v: t, t: TIPO_ROTULO[t] }; }); } },
    { chave: 'funil', rotulo: 'Tem funil', valores: function (c) { return [c.temFunil ? 'sim' : 'nao']; }, opcoes: function () { return [{ v: 'sim', t: 'Sim' }, { v: 'nao', t: 'Não' }]; } },
    { chave: 'etapa', rotulo: 'Etapa', valores: function (c) { return [c.etapa || '__sem']; }, opcoes: function (cs) { return distintos(cs, function (c) { return c.etapa; }, 'Sem etapa'); } },
    { chave: 'venda', rotulo: 'Tem venda', valores: function (c) { return [c.temVenda ? 'sim' : 'nao']; }, opcoes: function () { return [{ v: 'sim', t: 'Sim' }, { v: 'nao', t: 'Não' }]; } },
    { chave: 'dono', rotulo: 'Dono do lead', valores: function (c) { return [c.donoId || '__rodizio']; }, opcoes: function (cs, d) {
      var m = {};
      cs.forEach(function (c) { if (c.donoId) m[c.donoId] = d.nomeVend(c.donoId) || c.donoId; });
      var l = Object.keys(m).map(function (k) { return { v: k, t: m[k] }; }).sort(function (a, b) { return a.t.localeCompare(b.t, 'pt-BR'); });
      return l.concat([{ v: '__rodizio', t: 'Sem dono ativo (rodízio)' }]);
    } },
    { chave: 'mes', rotulo: 'Mês do último movimento', valores: function (c) { return [c.mesChave || '__sem']; }, opcoes: function (cs) {
      var m = {};
      cs.forEach(function (c) { if (c.mesChave) m[c.mesChave] = c.mesRotulo; });
      var l = Object.keys(m).sort().reverse().map(function (k) { return { v: k, t: m[k] }; });
      return l.concat([{ v: '__sem', t: 'Sem movimento' }]);
    } },
    { chave: 'resp', rotulo: 'Resposta na última campanha', valores: function (c) { return [c.resp]; }, opcoes: function () {
      return ['respondeu', 'clicou', 'nao_interagiu', 'nao_entregue', 'falha_envio', 'saiu', 'nunca'].map(function (k) { return { v: k, t: RESP_ROTULO[k] }; });
    } },
    { chave: 'origem', rotulo: 'Origem', valores: function (c) { return [c.origem || '__sem']; }, opcoes: function (cs) { return distintos(cs, function (c) { return c.origem; }, 'Sem origem'); } },
    { chave: 'etiqueta', rotulo: 'Etiqueta', valores: function (c) { return c.etiquetas.length ? c.etiquetas : ['__sem']; }, opcoes: function (cs) {
      var m = {};
      cs.forEach(function (c) { c.etiquetas.forEach(function (e) { m[e] = true; }); });
      return Object.keys(m).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); }).map(function (k) { return { v: k, t: k }; }).concat([{ v: '__sem', t: 'Sem etiqueta' }]);
    } }
  ];
  function distintos(lista, fn, rotuloVazio) {
    var m = {};
    lista.forEach(function (x) { var v = fn(x); if (v) m[v] = true; });
    return Object.keys(m).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); }).map(function (k) { return { v: k, t: k }; }).concat([{ v: '__sem', t: rotuloVazio }]);
  }

  // cfg: { sel: Set|null (seleção por id de contato), naCampanha: fn -> Set de telFim8, aoMudar: fn }
  // Sem `sel` (tela Contatos) ninguém aparece riscado nem com motivo: o bloqueio só existe na seleção para campanha.
  function criarListaContatos(host, cfg) {
    var F = {};
    FILTROS_CONTATO.forEach(function (f) { F[f.chave] = new Set(); });
    var busca = '', pagina = 0;
    var selecionavel = !!cfg.sel;
    host.innerHTML =
      '<div class="filtros" data-r="filtros"></div>' +
      (selecionavel ? '<div class="barra-selecao"><button type="button" class="btn btn-fantasma" data-acao="pagina">Selecionar a página</button><button type="button" class="btn btn-fantasma" data-acao="todos">Selecionar todos os filtrados</button><button type="button" class="btn btn-fantasma" data-acao="limpar">Limpar seleção</button><span class="contador" data-r="contador"></span></div>' : '') +
      '<div class="tabela-wrap"><table class="tabela"><thead><tr>' + (selecionavel ? '<th class="col-caixa" aria-label="Selecionar"></th>' : '') +
      '<th>Nome</th><th>Telefone</th><th>Tipo</th><th>Dono do lead</th><th>Etapa</th><th>Tem venda</th><th>Resposta na última campanha</th><th>Dias desde o último disparo</th></tr></thead><tbody data-r="corpo"></tbody></table></div>' +
      '<div class="rodape-tabela" data-r="rodape"></div>';
    var barra = $('[data-r="filtros"]', host);
    var multis = {};
    FILTROS_CONTATO.forEach(function (f) {
      var m = criarMulti({ rotulo: f.rotulo, opcoes: [], sel: F[f.chave], aoMudar: function () { pagina = 0; render(); } });
      multis[f.chave] = m;
      barra.appendChild(m.el);
    });
    var campoBusca = document.createElement('input');
    campoBusca.type = 'search'; campoBusca.className = 'entrada busca'; campoBusca.placeholder = 'Buscar nome ou telefone…';
    campoBusca.setAttribute('aria-label', 'Buscar contato');
    campoBusca.addEventListener('input', function () { busca = campoBusca.value; pagina = 0; render(); });
    barra.appendChild(campoBusca);

    var contatosAtuais = [];
    function comMotivo() {
      var d = derivar();
      var na = cfg.naCampanha ? cfg.naCampanha() : null;
      return (d.contatos || []).map(function (c) {
        c.motivo = selecionavel ? R.motivoDeExclusao(c, d.optout, na) : '';
        return c;
      });
    }
    function filtrar(todos) {
      var b = semAcento(busca).trim(), bd = R.digitos(busca);
      return todos.filter(function (c) {
        for (var i = 0; i < FILTROS_CONTATO.length; i++) {
          var f = FILTROS_CONTATO[i], s = F[f.chave];
          if (!s.size) continue;
          if (!f.valores(c).some(function (v) { return s.has(v); })) return false;
        }
        if (b) {
          var okNome = semAcento(c.nome).indexOf(b) !== -1;
          var okTel = bd.length >= 3 && c.telefone.replace(/\D/g, '').indexOf(bd) !== -1;
          if (!okNome && !okTel) return false;
        }
        return true;
      }).sort(function (a, b2) { return a.nome.localeCompare(b2.nome, 'pt-BR'); });
    }
    function atualizarOpcoes(todos) {
      var d = derivar(), mudou = false;
      FILTROS_CONTATO.forEach(function (f) { if (multis[f.chave].setOpcoes(f.opcoes(todos, d))) mudou = true; });
      return mudou;
    }
    function render() {
      var d = derivar();
      var corpo = $('[data-r="corpo"]', host), rodape = $('[data-r="rodape"]', host);
      if (!d.contatos) { corpo.innerHTML = '<tr><td colspan="9" class="vazio">Carregando contatos…</td></tr>'; if (cfg.aoFiltrar) cfg.aoFiltrar([]); return; }
      var todos = comMotivo();
      var filtrados = filtrar(todos);
      if (cfg.aoFiltrar) cfg.aoFiltrar(filtrados);
      var extra = cfg.filtroExtra ? cfg.filtroExtra() : null;
      contatosAtuais = extra ? filtrados.filter(extra) : filtrados;
      var ultima = Math.max(0, Math.ceil(contatosAtuais.length / POR_PAGINA) - 1);
      if (pagina > ultima) pagina = ultima;
      var fatia = contatosAtuais.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
      corpo.innerHTML = fatia.length ? fatia.map(function (c) {
        var fora = !!c.motivo;
        var riscado = fora ? ' riscado' : '';
        return '<tr' + (fora ? ' class="fora"' : '') + ' data-id="' + esc(c.id) + '">' +
          (selecionavel ? '<td class="col-caixa">' + (fora ? '' : '<input type="checkbox" aria-label="Selecionar ' + esc(c.nome) + '"' + (cfg.sel.has(c.id) ? ' checked' : '') + '>') + '</td>' : '') +
          '<td><span class="nome' + riscado + '">' + esc(c.nome || 'Sem nome') + '</span>' + (fora ? '<span class="motivo">' + esc(c.motivo) + '</span>' : '') + '</td>' +
          '<td class="nowrap' + riscado + '">' + esc(R.formatarTelefone(c.telefone)) + '</td>' +
          '<td>' + esc(TIPO_ROTULO[c.tipo]) + '</td>' +
          '<td>' + (c.donoId ? esc(c.donoNome) : '<span class="suave">Rodízio</span>') + '</td>' +
          '<td>' + (c.etapa ? esc(c.etapa) : '<span class="suave">Sem funil</span>') + '</td>' +
          '<td>' + (c.temVenda ? 'Sim' : 'Não') + '</td>' +
          '<td>' + esc(RESP_ROTULO[c.resp]) + '</td>' +
          '<td class="nowrap">' + (c.diasDisparo == null ? '<span class="suave">Nunca</span>' : (c.diasDisparo === 0 ? 'Hoje' : c.diasDisparo + (c.diasDisparo === 1 ? ' dia' : ' dias'))) + '</td></tr>';
      }).join('') : '<tr><td colspan="9" class="vazio">Nenhum contato com esses filtros.</td></tr>';
      rodape.innerHTML = paginaHtml(contatosAtuais.length, pagina);
      if (selecionavel) $('[data-r="contador"]', host).textContent = num(cfg.sel.size) + (cfg.sel.size === 1 ? ' selecionado' : ' selecionados');
    }
    host.addEventListener('click', function (e) {
      var pg = e.target.closest('[data-pg]');
      if (pg) { pagina += Number(pg.getAttribute('data-pg')); render(); return; }
      var ac = e.target.closest('[data-acao]');
      if (!ac) return;
      var a = ac.getAttribute('data-acao');
      var livres = function (l) { return l.filter(function (c) { return !c.motivo; }); };
      if (a === 'pagina') livres(contatosAtuais.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)).forEach(function (c) { cfg.sel.add(c.id); });
      else if (a === 'todos') livres(contatosAtuais).forEach(function (c) { cfg.sel.add(c.id); });
      else if (a === 'limpar') cfg.sel.clear();
      render();
      if (cfg.aoMudar) cfg.aoMudar();
    });
    host.addEventListener('change', function (e) {
      var cx = e.target;
      if (cx.type !== 'checkbox' || !cx.closest('tr[data-id]')) return;
      var id = cx.closest('tr').getAttribute('data-id');
      if (cx.checked) cfg.sel.add(id); else cfg.sel.delete(id);
      $('[data-r="contador"]', host).textContent = num(cfg.sel.size) + (cfg.sel.size === 1 ? ' selecionado' : ' selecionados');
      if (cfg.aoMudar) cfg.aoMudar();
    });
    return {
      atualizar: function () {
        var d = derivar();
        if (d.contatos) atualizarOpcoes(comMotivo());
        render();
      },
      irInicio: function () { pagina = 0; render(); },
      todos: function () { return comMotivo(); },
      filtrados: function () { return contatosAtuais; }
    };
  }

  // ══════════════ CONVERSA (modal) ══════════════
  var MIDIA = {};
  function buscarMidia(driveId) {
    if (!MIDIA[driveId]) {
      MIDIA[driveId] = chamarServidor('disparoMidia', { driveId: driveId }).then(function (r) {
        var bin = atob(r.base64 || ''), bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return { url: URL.createObjectURL(new Blob([bytes], { type: r.mime || 'application/octet-stream' })), mime: r.mime || '' };
      });
      MIDIA[driveId].catch(function () { delete MIDIA[driveId]; });
    }
    return MIDIA[driveId];
  }

  function textoDoModelo(modelo, ds, camp) {
    var corpo = String(modelo.corpo || '');
    var prazo = (camp && camp.prazo) || '(prazo da campanha)';
    return corpo.replace(/\{\{1\}\}/g, ds.nomeLead || '').replace(/\{\{2\}\}/g, ds.referencia || '').replace(/\{\{3\}\}/g, prazo);
  }

  function ticks(ds) {
    if (ds.lidoEm) return '<span class="lido">' + ico('tick2') + '</span>';
    if (ds.entregueEm) return ico('tick2');
    return ico('tick');
  }

  function abrirConversa(info) {
    var msgs = [], assinatura = '';
    var corpo = document.createElement('div');
    corpo.innerHTML =
      '<div class="conversa-cabeca">' +
        '<div><small>Nome</small><b>' + esc(info.nome) + '</b></div>' +
        '<div><small>Telefone</small><b>' + esc(info.telefone) + '</b></div>' +
        '<div><small>Dono do lead</small><b>' + esc(info.dono || '—') + '</b></div>' +
        '<div><small>Etapa no funil</small><b>' + esc(info.etapa || '—') + '</b></div>' +
        '<div><small>Campanha</small><b>' + esc(info.campanha || '—') + '</b></div>' +
        '<div data-r="robo">' + (info.robo ? selo('robo', 'Robô') : '') + '</div>' +
      '</div><div class="conversa" data-r="linha"></div><p class="ajuda" style="margin:10px 0 0">Só leitura: esta tela não responde ao contato.</p>';
    var parar = null;
    var m = abrirModal({
      titulo: 'Conversa', corpo: corpo, aoFechar: function () {
        if (parar) parar();
        OUVINTES = OUVINTES.filter(function (f) { return f !== desenhar; });
      }, rodape: [{ texto: 'Fechar', aoClicar: function (mm) { mm.fechar(); } }]
    });
    var linha = $('[data-r="linha"]', corpo);

    function desenhar() {
      var d = derivar();
      var ds = (d.disparosPorTel[info.telFim8] || []).slice().sort(function (a, b) { return (a.enviadoEm || a.criadoEm || 0) - (b.enviadoEm || b.criadoEm || 0); });
      var ev = [];
      ds.forEach(function (x) {
        if (x.enviadoEm) ev.push({ em: x.enviadoEm, k: 'modelo', d: x });
        else if (x.status === 'erro') ev.push({ em: x.criadoEm || 0, k: 'erro', d: x });
      });
      msgs.forEach(function (x) { ev.push({ em: x.em || 0, k: 'msg', m: x }); });
      ev.sort(function (a, b) { return a.em - b.em; });
      var sig = ev.map(function (e) { return (e.m ? e.m._id : e.d._id) + (e.d ? '|' + (e.d.entregueEm || 0) + '|' + (e.d.lidoEm || 0) : ''); }).join(',') + '#' + Object.keys(d.modeloMap).length;
      if (sig === assinatura) return;
      assinatura = sig;
      if (!ev.length) { linha.innerHTML = '<div class="balao-nota">Nenhuma mensagem ainda.</div>'; return; }
      var ultimoDia = '', html = '';
      ev.forEach(function (e) {
        var dia = e.em ? diaLongo(e.em) : '';
        if (dia && dia !== ultimoDia) { html += '<div class="balao-nota">' + esc(dia) + '</div>'; ultimoDia = dia; }
        if (e.k === 'erro') {
          html += '<div class="balao-nota">Falha no envio' + (e.d.erroCodigo ? ' (código ' + esc(e.d.erroCodigo) + ')' : '') + '</div>';
        } else if (e.k === 'modelo') {
          var modelo = d.modeloMap[e.d.modelo], camp = d.campMap[e.d.campanha];
          var texto = modelo ? textoDoModelo(modelo, e.d, camp) : 'Mensagem do modelo «' + e.d.modelo + '» (texto não disponível).';
          var botoes = modelo && Array.isArray(modelo.botoes) ? modelo.botoes : [];
          html += '<div class="balao-linha saida"><div class="balao">' + esc(texto) + '<div class="meta">' + hora(e.em) + ' ' + ticks(e.d) + '</div></div>' +
            (botoes.length ? '<div class="balao-botoes">' + botoes.map(function (b) { return '<span>' + esc(b.texto) + '</span>'; }).join('') + '</div>' : '') + '</div>';
        } else {
          var x = e.m, md = x.midia && x.midia.driveId ? x.midia : null, conteudo = '';
          if (md && x.tipo === 'audio') conteudo = '<button type="button" class="btn btn-fantasma btn-mini" data-ouvir="' + esc(md.driveId) + '">' + ico('play') + ' Ouvir</button>';
          else if (md && x.tipo === 'image') conteudo = '<span data-foto="' + esc(md.driveId) + '" class="suave pequeno">Carregando foto…</span>';
          else if (md) conteudo = '<button type="button" class="btn btn-fantasma btn-mini" data-abrir="' + esc(md.driveId) + '" data-nome="' + esc(md.nomeArquivo || 'arquivo') + '">' + ico('doc') + ' ' + esc(md.nomeArquivo || 'Abrir arquivo') + '</button>';
          else if (!x.texto) conteudo = '<span class="suave">[' + esc(x.tipo || 'mensagem') + ']</span>';
          html += '<div class="balao-linha ' + (x.direcao === 'saida' ? 'saida' : 'entrada') + '"><div class="balao">' + conteudo + (conteudo && x.texto ? '<br>' : '') + esc(x.texto || '') + '<div class="meta">' + (x.em ? hora(x.em) : '') + '</div></div></div>';
        }
      });
      linha.innerHTML = html;
      linha.querySelectorAll('[data-foto]').forEach(function (s) {
        var id = s.getAttribute('data-foto');
        buscarMidia(id).then(function (r) {
          var img = document.createElement('img');
          img.className = 'miniatura'; img.alt = 'Foto enviada pelo contato'; img.src = r.url;
          img.addEventListener('click', function () {
            abrirModal({ titulo: 'Foto', sobre: true, corpo: '<img class="foto-grande" alt="Foto enviada pelo contato" src="' + esc(r.url) + '">' });
          });
          if (s.parentNode) s.parentNode.replaceChild(img, s);
        }, function () { s.textContent = 'Foto indisponível.'; });
      });
    }
    linha.addEventListener('click', function (e) {
      var o = e.target.closest('[data-ouvir]'), a = e.target.closest('[data-abrir]');
      if (o) {
        o.disabled = true; o.textContent = 'Carregando…';
        buscarMidia(o.getAttribute('data-ouvir')).then(function (r) {
          var au = document.createElement('audio');
          au.controls = true; au.autoplay = true; au.src = r.url;
          o.parentNode.replaceChild(au, o);
        }, function (err) { o.disabled = false; o.textContent = 'Ouvir'; toast(err.message, true); });
      } else if (a) {
        a.disabled = true;
        buscarMidia(a.getAttribute('data-abrir')).then(function (r) {
          a.disabled = false;
          var link = document.createElement('a');
          link.href = r.url; link.download = a.getAttribute('data-nome');
          document.body.appendChild(link); link.click(); link.remove();
        }, function (err) { a.disabled = false; toast(err.message, true); });
      }
    });

    OUVINTES.push(desenhar);
    desenhar();
    // Só as mensagens deste telefone (consulta por telFim8), ao vivo enquanto o modal está aberto.
    window.SGFireReady.then(function () {
      if (m.fechado) return;
      parar = escutarComRetry(function () {
        return firebase.firestore().collection('mensagens_disparo').where('telFim8', '==', info.telFim8);
      }, function (snap) {
        msgs = [];
        snap.forEach(function (doc) { var x = doc.data(); x._id = doc.id; msgs.push(x); });
        desenhar();
      }, 'mensagens_disparo', function (err) { toast('Não consegui carregar as mensagens: ' + msgErro(err), true); });
    });
  }

  function infoConversa(d, ult, etapa, donoNome, robo) {
    var camp = d.campMap[ult.campanha];
    return {
      telFim8: ult.telFim8, nome: ult.nomeLeadCompleto || ult.nomeLead || '', telefone: R.formatarTelefone(ult.telLead),
      dono: donoNome, etapa: etapa, campanha: camp ? camp.titulo : ult.campanha, robo: robo
    };
  }

  // ══════════════ TELAS ══════════════
  var TELAS = {};

  // ---------- 1. Campanhas ----------
  TELAS.campanhas = {
    menu: 'campanhas', nec: ['campanhas', 'disparos', 'vendedores'],
    montar: function (el) {
      var fVend = new Set();
      el.innerHTML =
        '<div class="topo"><h1>Campanhas</h1><div class="acoes"><button type="button" class="btn btn-principal" id="b-nova">' + ico('mais') + ' Nova campanha</button></div></div>' +
        '<div class="filtros"><a class="btn" href="#/modelos">Modelos de mensagem</a><button type="button" class="btn" id="b-imp">Importar contatos</button><span id="f-vend"></span></div>' +
        '<div id="kpis"></div><div id="cartoes" class="lista-cartoes"></div>';
      var bNova = $('#b-nova', el), bImp = $('#b-imp', el);
      somenteAdmin(bNova); somenteAdmin(bImp);
      bNova.addEventListener('click', function () { irPara('#/nova'); });
      bImp.addEventListener('click', function () { irPara('#/contatos/importar'); });
      var multi = criarMulti({ rotulo: 'Vendedor', opcoes: [], sel: fVend, aoMudar: desenhar });
      $('#f-vend', el).appendChild(multi.el);
      $('#cartoes', el).addEventListener('click', function (e) {
        var c = e.target.closest('[data-id]');
        if (c) irPara('#/campanha/' + encodeURIComponent(c.getAttribute('data-id')));
      });
      function desenhar() {
        var d = derivar();
        var vs = d.vendedores.filter(function (v) { return v.Nome; }).sort(function (a, b) { return String(a.Nome).localeCompare(String(b.Nome), 'pt-BR'); });
        multi.setOpcoes(vs.map(function (v) { return { v: v.id, t: v.Nome }; }));
        var filtra = function (x) { return !fVend.size || fVend.has(String(x.idVendedor)); };
        var camps = Object.keys(d.campMap).map(function (k) { return d.campMap[k]; }).sort(function (a, b) {
          return (CAMPANHA_ORDEM[a.status] == null ? 9 : CAMPANHA_ORDEM[a.status]) - (CAMPANHA_ORDEM[b.status] == null ? 9 : CAMPANHA_ORDEM[b.status]) || paraMs(b.criadoEm) - paraMs(a.criadoEm);
        });
        var fila = 0, enviados = 0, resp = 0, nao = 0, custo = 0;
        var cartoes = camps.map(function (c) {
          var docs = (d.disparosPorCamp[c._id] || []).filter(filtra);
          var n = R.contar(docs, typeof c.custoPorMensagem === 'number' ? c.custoPorMensagem : CUSTO_PADRAO);
          fila += n.fila; enviados += n.enviados; resp += n.responderam; nao += n.naoEntregues; custo += n.custo;
          var ativas = n.total - n.canceladas;
          var pct = ativas ? Math.round((ativas - n.fila) / ativas * 100) : 0;
          return '<button type="button" class="cartao" data-id="' + esc(c._id) + '"><div class="cartao-topo">' + ico('whatsapp', 'wa') +
            '<span class="cartao-titulo">' + esc(c.titulo || 'Sem título') + '</span>' + selo(esc(c.status || 'rascunho'), CAMPANHA_ROTULO[c.status] || c.status || 'Rascunho') +
            '<span class="progresso-bloco"><span class="progresso" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></span>' + pct + '%</span></div>' +
            '<div class="cartao-nums"><span>Enviados: <b>' + num(n.enviados) + '</b></span><span>Entregues: <b>' + num(n.entregues) + '</b></span><span>Lidos: <b>' + num(n.lidos) +
            '</b></span><span>Clicaram: <b>' + num(n.clicaram) + '</b></span><span>Responderam: <b>' + num(n.responderam) + '</b></span><span>Saíram: <b>' + num(n.sairam) +
            '</b></span><span>Custo: <b>' + moeda(n.custo) + '</b></span></div></button>';
        });
        $('#kpis', el).innerHTML = kpisHtml([
          { rotulo: 'Na fila', valor: num(fila), icone: 'relogio' }, { rotulo: 'Enviados', valor: num(enviados), icone: 'enviar' },
          { rotulo: 'Responderam', valor: num(resp), icone: 'balao' }, { rotulo: 'Não entregue', valor: num(nao), icone: 'alerta', destaque: nao > 0 },
          { rotulo: 'Custo', valor: moeda(custo), icone: 'carteira' }
        ]);
        $('#cartoes', el).innerHTML = cartoes.length ? cartoes.join('') :
          '<div class="bloco vazio">Nenhuma campanha ainda. ' + (SOU_ADMIN ? 'Use “Nova campanha” para começar.' : 'O administrador cria as campanhas.') + '</div>';
      }
      desenhar();
      return { atualizar: desenhar };
    }
  };

  // ---------- 2. Detalhe da campanha ----------
  function gruposDaCampanha(d, camp) {
    var g = {};
    (d.disparosPorCamp[camp._id] || []).forEach(function (x) {
      var k = x.telFim8 || x._id;
      (g[k] = g[k] || []).push(x);
    });
    return Object.keys(g).map(function (k) {
      var ds = g[k];
      var ult = ds.reduce(function (m, x) {
        var px = x.passo || 1, pm = m.passo || 1;
        return px > pm || (px === pm && (x.criadoEm || 0) > (m.criadoEm || 0)) ? x : m;
      }, ds[0]);
      var lead = ult.idOportunidade ? d.leadPorOp[ult.idOportunidade] : null;
      var donoId = lead && lead.IdVendedor ? lead.IdVendedor : ult.idVendedor;
      var enviadoEm = 0;
      ds.forEach(function (x) { if (x.enviadoEm && x.enviadoEm > enviadoEm) enviadoEm = x.enviadoEm; });
      return {
        chave: k, docs: ds, ult: ult, status: R.statusDoContato(ds), etapa: lead && lead.Etapa ? String(lead.Etapa) : 'Sem funil',
        donoNome: d.nomeVend(donoId) || ult.nomeVendedor || '', nome: ult.nomeLeadCompleto || ult.nomeLead || '',
        tel: R.formatarTelefone(ult.telLead), robo: ds.some(function (x) { return x.robo === true; }), enviadoEm: enviadoEm,
        recente: enviadoEm || ult.criadoEm || 0,
        removivel: R.podeRemover(ds), devolver: R.podeDevolver(ds)
      };
    }).sort(function (a, b) { return b.recente - a.recente; });
  }

  TELAS.campanha = {
    menu: 'campanhas', nec: ['campanhas', 'disparos', 'vendedores', 'funil', 'modelos'],
    montar: function (el, args) {
      var id = args[0];
      var fVend = new Set(), fStatus = new Set(), fEtapa = new Set(), busca = '', pagina = 0;
      var selRem = new Set(), porChave = {}, fatiaAtual = [], gerencia = false;
      el.innerHTML =
        '<a class="voltar-link" href="#/campanhas">' + ico('esq') + ' Voltar para campanhas</a>' +
        '<div class="topo"><div><div class="titulo-linha"><h1 data-r="titulo"></h1><span data-r="selo"></span></div></div>' +
        '<div class="acoes"><span class="progresso-bloco" data-r="prog"></span><button type="button" class="btn hidden" data-r="adicionar">' + ico('mais') + ' Adicionar contatos</button><button type="button" class="btn hidden" data-r="acao"></button></div></div>' +
        '<div data-r="kpis"></div>' +
        '<div class="filtros" data-r="filtros"></div>' +
        '<div class="barra-selecao hidden" data-r="barra-sel"><button type="button" class="btn btn-fantasma" data-sel-acao="pagina">Selecionar a página</button><button type="button" class="btn btn-fantasma" data-sel-acao="todos">Selecionar todos os filtrados</button><button type="button" class="btn btn-fantasma" data-sel-acao="limpar">Limpar seleção</button><button type="button" class="btn btn-perigo" data-sel-acao="remover">Remover da campanha</button><span class="contador" data-r="contador"></span></div>' +
        '<div class="tabela-wrap"><table class="tabela"><thead><tr><th class="col-caixa hidden" data-r="th-caixa" aria-label="Selecionar"></th><th>Nome</th><th>Telefone</th><th>Dono do lead</th><th>Etapa no funil</th><th>Mensagem</th><th>Status</th><th>Último disparo</th><th></th></tr></thead><tbody data-r="corpo"></tbody></table></div>' +
        '<div class="rodape-tabela" data-r="rodape"></div>';
      var barra = $('[data-r="filtros"]', el);
      var mV = criarMulti({ rotulo: 'Vendedor', opcoes: [], sel: fVend, aoMudar: function () { pagina = 0; desenhar(); } });
      var mS = criarMulti({
        rotulo: 'Status', sel: fStatus, aoMudar: function () { pagina = 0; desenhar(); },
        opcoes: ['fila', 'enviado', 'entregue', 'lido', 'clicou', 'respondeu', 'saiu', 'erro', 'removido'].map(function (k) { return { v: k, t: STATUS_ROTULO[k] }; })
      });
      var mE = criarMulti({ rotulo: 'Etapa no funil', opcoes: [], sel: fEtapa, aoMudar: function () { pagina = 0; desenhar(); } });
      var campoBusca = document.createElement('input');
      campoBusca.type = 'search'; campoBusca.className = 'entrada busca'; campoBusca.placeholder = 'Buscar contato…';
      campoBusca.setAttribute('aria-label', 'Buscar contato');
      campoBusca.addEventListener('input', function () { busca = campoBusca.value; pagina = 0; desenhar(); });
      [mV.el, mS.el, mE.el, campoBusca].forEach(function (x) { barra.appendChild(x); });
      var visiveis = [];
      // Clicar num cartão filtra a tabela pelos contatos daquele número; clicar de novo desfaz.
      var algum = function (f) { return function (g) { return g.docs.some(f); }; };
      var KPI_GRUPO = {
        fila: algum(function (x) { return x.status === 'fila' && !x.removidoEm; }),
        enviados: algum(function (x) { return x.status === 'enviado' || (x.status === 'saiu' && x.enviadoEm); }),
        entregues: algum(function (x) { return x.entregueEm; }),
        lidos: algum(function (x) { return x.lidoEm; }),
        clicaram: algum(function (x) { return x.tocouEm; }),
        responderam: algum(function (x) { return x.respondeuEm; }),
        sairam: algum(function (x) { return x.status === 'saiu'; }),
        removidos: function (g) { return g.status === 'removido'; },
        erro: algum(function (x) { return x.status === 'erro'; })
      };
      var kpiAtivo = ligarKpis($('[data-r="kpis"]', el), function () { pagina = 0; desenhar(); });
      var bAdicionar = $('[data-r="adicionar"]', el);
      somenteAdmin(bAdicionar);
      bAdicionar.addEventListener('click', function () { irPara('#/campanha/' + encodeURIComponent(id) + '/adicionar'); });

      el.addEventListener('click', function (e) {
        var pg = e.target.closest('[data-pg]');
        if (pg) { pagina += Number(pg.getAttribute('data-pg')); desenhar(); return; }
        var sa = e.target.closest('[data-sel-acao]');
        if (sa) {
          var a = sa.getAttribute('data-sel-acao');
          var livres = function (l) { return l.filter(function (g) { return g.removivel; }); };
          if (a === 'pagina') livres(fatiaAtual).forEach(function (g) { selRem.add(g.chave); });
          else if (a === 'todos') livres(visiveis).forEach(function (g) { selRem.add(g.chave); });
          else if (a === 'limpar') selRem.clear();
          else if (a === 'remover') { removerGrupos(Array.from(selRem).map(function (k) { return porChave[k]; }).filter(function (g) { return g && g.removivel; })); return; }
          desenhar();
          return;
        }
        var rm = e.target.closest('[data-remover]');
        if (rm) { removerGrupos([porChave[rm.getAttribute('data-remover')]].filter(function (g) { return g && g.removivel; })); return; }
        var dv = e.target.closest('[data-devolver]');
        if (dv) { devolverGrupo(porChave[dv.getAttribute('data-devolver')], dv); return; }
        var conv = e.target.closest('[data-conversa]');
        if (conv) {
          var g = visiveis.filter(function (x) { return x.chave === conv.getAttribute('data-conversa'); })[0];
          if (g) abrirConversa(infoConversa(derivar(), g.ult, g.etapa === 'Sem funil' ? '' : g.etapa, g.donoNome, g.robo));
          return;
        }
        var rb = e.target.closest('[data-robo]');
        if (rb) desmarcarRobo(visiveis.filter(function (x) { return x.chave === rb.getAttribute('data-robo'); })[0], rb);
      });

      el.addEventListener('change', function (e) {
        var cx = e.target;
        if (cx.type !== 'checkbox' || !cx.hasAttribute('data-sel')) return;
        if (cx.checked) selRem.add(cx.getAttribute('data-sel')); else selRem.delete(cx.getAttribute('data-sel'));
        contadorSel();
      });
      function contadorSel() {
        $('[data-r="contador"]', el).textContent = num(selRem.size) + (selRem.size === 1 ? ' selecionado' : ' selecionados');
        $('[data-sel-acao="remover"]', el).disabled = !selRem.size;
      }

      function removerGrupos(gs) {
        if (!gs.length) return;
        var n = gs.length;
        confirmar({
          titulo: 'Remover da campanha',
          texto: num(n) + (n === 1 ? ' contato sai' : ' contatos saem') + ' desta campanha. Quem ainda não recebeu não vai receber; quem já recebeu não recebe as próximas mensagens. O que já foi enviado fica no histórico.',
          ok: 'Remover', perigo: true
        }).then(function (sim) {
          if (!sim) return;
          var uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : '';
          var ids = [];
          gs.forEach(function (g) { g.docs.forEach(function (x) { ids.push(x._id); }); });
          atualizarDisparos(ids, { removidoEm: Date.now(), removidoPor: uid }, 'Removendo contatos').then(function () {
            gs.forEach(function (g) { selRem.delete(g.chave); });
            toast(num(n) + (n === 1 ? ' contato removido da campanha.' : ' contatos removidos da campanha.'));
            desenhar();
          }, function (err) { toast(msgParou(err, 'registros'), true); });
        });
      }

      function devolverGrupo(g, btn) {
        if (!g || !g.devolver) return;
        btn.disabled = true;
        var apagar = firebase.firestore.FieldValue.delete();
        var ids = g.docs.filter(function (x) { return x.removidoEm; }).map(function (x) { return x._id; });
        atualizarDisparos(ids, { removidoEm: apagar, removidoPor: apagar }, 'Devolvendo contato').then(function () {
          toast('Contato devolvido à campanha.');
        }, function (err) { btn.disabled = false; toast(msgParou(err, 'registros'), true); });
      }

      function desmarcarRobo(g, btn) {
        if (!g) return;
        confirmar({
          titulo: 'Desmarcar robô',
          texto: 'Marcar ' + esc(g.nome || 'este contato') + ' como pessoa de verdade? Os avisos de resposta dele voltam a chegar ao vendedor.', ok: 'Desmarcar'
        }).then(function (sim) {
          if (!sim) return;
          btn.disabled = true;
          var db = firebase.firestore(), uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : '';
          var lote = db.batch();
          g.docs.filter(function (x) { return x.robo === true; }).forEach(function (x) {
            lote.update(db.collection('disparos').doc(x._id), { robo: false, roboDesmarcadoPor: uid, roboDesmarcadoEm: Date.now() });
          });
          lote.commit().then(function () { toast('Robô desmarcado.'); }, function (err) { btn.disabled = false; toast(msgErro(err), true); });
        });
      }

      function alterarStatus(camp, novo) {
        firebase.firestore().collection('campanhas').doc(camp._id).update({ status: novo, atualizadoEm: Date.now() }).then(function () {
          toast(novo === 'pausada' ? 'Campanha pausada. Nada novo sai enquanto ela estiver assim.' : 'Campanha retomada.');
        }, function (err) { toast(msgErro(err), true); });
      }

      function desenhar() {
        if (!$('[data-r="titulo"]', el)) return;
        var d = derivar(), camp = d.campMap[id];
        if (!camp) {
          el.innerHTML = '<a class="voltar-link" href="#/campanhas">' + ico('esq') + ' Voltar para campanhas</a><div class="bloco vazio">Campanha não encontrada.</div>';
          return;
        }
        $('[data-r="titulo"]', el).textContent = camp.titulo || 'Sem título';
        $('[data-r="selo"]', el).innerHTML = selo(esc(camp.status || 'rascunho'), CAMPANHA_ROTULO[camp.status] || camp.status || 'Rascunho');
        var acao = $('[data-r="acao"]', el);
        if (camp.status === 'ativa' || camp.status === 'pausada' || camp.status === 'rascunho') {
          acao.classList.remove('hidden');
          acao.textContent = camp.status === 'ativa' ? 'Pausar' : camp.status === 'pausada' ? 'Retomar' : 'Editar';
          acao.onclick = function () {
            if (camp.status === 'rascunho') irPara('#/nova/' + encodeURIComponent(camp._id));
            else alterarStatus(camp, camp.status === 'ativa' ? 'pausada' : 'ativa');
          };
          if (!SOU_ADMIN) somenteAdmin(acao);
        } else acao.classList.add('hidden');
        bAdicionar.classList.toggle('hidden', camp.status !== 'ativa' && camp.status !== 'pausada');

        var grupos = gruposDaCampanha(d, camp);
        porChave = {};
        grupos.forEach(function (g) { porChave[g.chave] = g; });
        // Só administrador mexe, e só enquanto a campanha ainda pode mandar mensagem.
        gerencia = SOU_ADMIN && (camp.status === 'ativa' || camp.status === 'pausada');
        $('[data-r="barra-sel"]', el).classList.toggle('hidden', !gerencia);
        $('[data-r="th-caixa"]', el).classList.toggle('hidden', !gerencia);
        Array.from(selRem).forEach(function (k) { if (!porChave[k] || !porChave[k].removivel) selRem.delete(k); });
        var vs = {}, es = {};
        grupos.forEach(function (g) { vs[g.ult.idVendedor] = d.nomeVend(g.ult.idVendedor) || g.ult.nomeVendedor || g.ult.idVendedor; es[g.etapa] = true; });
        mV.setOpcoes(Object.keys(vs).map(function (k) { return { v: k, t: vs[k] }; }).sort(function (a, b) { return a.t.localeCompare(b.t, 'pt-BR'); }));
        mE.setOpcoes(Object.keys(es).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); }).map(function (k) { return { v: k, t: k }; }));

        // Os números contam só quem passa pelos filtros e pela busca da tabela.
        var b = semAcento(busca).trim(), bd = R.digitos(busca);
        var base = grupos.filter(function (g) {
          if ((fVend.size && !fVend.has(String(g.ult.idVendedor))) || (fStatus.size && !fStatus.has(g.status)) || (fEtapa.size && !fEtapa.has(g.etapa))) return false;
          if (!b) return true;
          return semAcento(g.nome).indexOf(b) !== -1 || (bd.length >= 3 && String(g.ult.telLead || '').indexOf(bd) !== -1) || (bd.length >= 3 && g.tel.replace(/\D/g, '').indexOf(bd) !== -1);
        });
        var docs = [];
        base.forEach(function (g) { docs = docs.concat(g.docs); });
        var n = R.contar(docs, typeof camp.custoPorMensagem === 'number' ? camp.custoPorMensagem : CUSTO_PADRAO);
        var ativas = n.total - n.canceladas;
        var pct = ativas ? Math.round((ativas - n.fila) / ativas * 100) : 0;
        var removidos = base.filter(function (g) { return g.status === 'removido'; }).length;
        $('[data-r="prog"]', el).innerHTML = '<span class="progresso"><i style="width:' + pct + '%"></i></span>' + pct + '%';
        $('[data-r="kpis"]', el).innerHTML = kpisHtml([
          { rotulo: 'Na fila', valor: num(n.fila), icone: 'relogio', chave: 'fila' }, { rotulo: 'Enviados', valor: num(n.enviados), icone: 'enviar', chave: 'enviados' },
          { rotulo: 'Entregues', valor: num(n.entregues), icone: 'check', chave: 'entregues' }, { rotulo: 'Lidos', valor: num(n.lidos), icone: 'check', chave: 'lidos' },
          { rotulo: 'Clicaram', valor: num(n.clicaram), icone: 'cursor', chave: 'clicaram' }, { rotulo: 'Responderam', valor: num(n.responderam), icone: 'balao', chave: 'responderam' },
          { rotulo: 'Saíram', valor: num(n.sairam), icone: 'saida', chave: 'sairam' }, { rotulo: 'Removidos', valor: num(removidos), icone: 'fechar', chave: 'removidos' },
          { rotulo: 'Não entregue', valor: num(n.naoEntregues), icone: 'alerta', destaque: n.naoEntregues > 0, chave: 'erro' },
          { rotulo: 'Custo', valor: moeda(n.custo), icone: 'carteira' }
        ], kpiAtivo());

        visiveis = KPI_GRUPO[kpiAtivo()] ? base.filter(KPI_GRUPO[kpiAtivo()]) : base;
        var ultima = Math.max(0, Math.ceil(visiveis.length / POR_PAGINA) - 1);
        if (pagina > ultima) pagina = ultima;
        var fatia = fatiaAtual = visiveis.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
        $('[data-r="corpo"]', el).innerHTML = fatia.length ? fatia.map(function (g) {
          var u = g.ult;
          var quando = g.enviadoEm ? '<span title="' + esc(dataHora(g.enviadoEm)) + '">' + esc(haDias(g.enviadoEm)) + '</span>' : '<span class="suave">Na fila</span>';
          var caixa = gerencia ? '<td class="col-caixa">' + (g.removivel ? '<input type="checkbox" data-sel="' + esc(g.chave) + '" aria-label="Selecionar ' + esc(g.nome || 'contato') + '"' + (selRem.has(g.chave) ? ' checked' : '') + '>' : '') + '</td>' : '';
          return '<tr>' + caixa + '<td class="nome">' + esc(g.nome || 'Sem nome') + '</td><td class="nowrap">' + esc(g.tel) + '</td><td>' + esc(g.donoNome || '—') + '</td><td>' + esc(g.etapa) + '</td>' +
            '<td class="nowrap">' + esc(TIPO_ROTULO[u.segmento] || u.segmento || '—') + ', passo ' + (u.passo || 1) + '</td>' +
            '<td>' + selo(g.status, STATUS_ROTULO[g.status]) + (g.robo ? ' ' + selo('robo', 'Robô') +
              (SOU_ADMIN ? ' <button type="button" class="btn btn-fantasma btn-mini" data-robo="' + esc(g.chave) + '">Desmarcar robô</button>' : '') : '') + '</td>' +
            '<td class="nowrap">' + quando + '</td>' +
            '<td><div class="acoes-linha"><button type="button" class="btn btn-fantasma" data-conversa="' + esc(g.chave) + '">Ver conversa</button>' +
              (gerencia && g.removivel ? '<button type="button" class="btn btn-fantasma" data-remover="' + esc(g.chave) + '">Remover</button>' : '') +
              (gerencia && g.devolver ? '<button type="button" class="btn btn-fantasma" data-devolver="' + esc(g.chave) + '">Devolver à campanha</button>' : '') + '</div></td></tr>';
        }).join('') : '<tr><td colspan="' + (gerencia ? 9 : 8) + '" class="vazio">' + (grupos.length ? 'Nenhum contato com esses filtros.' : 'Esta campanha ainda não tem contatos.') + '</td></tr>';
        $('[data-r="rodape"]', el).innerHTML = paginaHtml(visiveis.length, pagina);
        contadorSel();
      }
      desenhar();
      return { atualizar: desenhar };
    }
  };

  // ---------- 3. Nova campanha (e edição do rascunho) ----------
  TELAS.nova = {
    menu: 'campanhas', rodape: true, nec: ['campanhas', 'disparos', 'vendedores', 'funil', 'clientes', 'vendas', 'pipelines', 'optout', 'modelos'],
    montar: function (el, args) {
      var d0 = derivar();
      var idEdicao = args[0] || '';
      var camp0 = idEdicao ? d0.campMap[idEdicao] : null;
      if (idEdicao && !camp0) { el.innerHTML = '<a class="voltar-link" href="#/campanhas">' + ico('esq') + ' Voltar para campanhas</a><div class="bloco vazio">Campanha não encontrada.</div>'; return {}; }
      if (camp0 && camp0.status !== 'rascunho') { irPara('#/campanha/' + encodeURIComponent(idEdicao)); return {}; }
      var N = {
        id: idEdicao, titulo: camp0 ? camp0.titulo || '' : '', prazo: camp0 ? camp0.prazo || '' : '',
        custo: camp0 && typeof camp0.custoPorMensagem === 'number' ? camp0.custoPorMensagem : CUSTO_PADRAO,
        passos: camp0 && Array.isArray(camp0.passos) && camp0.passos.length ? JSON.parse(JSON.stringify(camp0.passos)) : [{ ordem: 1, diasEspera: 0, modelos: {} }],
        sel: new Set(camp0 && Array.isArray(camp0.selecionados) ? camp0.selecionados.map(String) : []),
        gravando: false
      };

      el.innerHTML =
        '<a class="voltar-link" href="#/campanhas">' + ico('esq') + ' Voltar para campanhas</a>' +
        '<div class="topo"><h1>' + (idEdicao ? 'Editar campanha' : 'Nova campanha') + '</h1></div>' +
        '<section class="bloco"><h2><span class="bloco-num">1</span>Título e prazo</h2><div class="grade-campos">' +
          '<div class="campo"><label for="n-titulo">Título</label><input class="entrada" id="n-titulo" type="text" maxlength="120" placeholder="Ex.: Reativação Novembro"></div>' +
          '<div class="campo"><label for="n-prazo">Prazo (vai no {{3}} da mensagem)</label><input class="entrada" id="n-prazo" type="text" maxlength="60" placeholder="Ex.: sexta-feira, 31/10"><span class="ajuda">Em branco, vale o prazo padrão do servidor.</span></div>' +
          '<div class="campo"><label for="n-custo">Custo por mensagem (R$)</label><input class="entrada" id="n-custo" type="number" min="0" step="0.01"></div>' +
        '</div></section>' +
        '<section class="bloco"><h2><span class="bloco-num">2</span>Mensagens</h2><p class="ajuda" style="margin-top:-6px">Um modelo por tipo de contato em cada passo. Tipo sem modelo não recebe aquele passo. Só aparecem modelos aprovados.</p>' +
          '<div data-r="passos"></div><button type="button" class="btn" data-r="mais-passo">' + ico('mais') + ' Passo</button></section>' +
        '<section class="bloco"><h2><span class="bloco-num">3</span>Contatos</h2><div data-r="lista"></div></section>' +
        '<div class="rodape-fixo"><div class="resumo"><div><small>Selecionados</small><b data-r="r-sel">0</b></div><div><small>Mensagens no passo 1</small><b data-r="r-msg">0</b></div><div><small>Custo estimado</small><b data-r="r-custo">R$ 0,00</b></div></div>' +
          '<div class="acoes"><button type="button" class="btn" data-r="salvar">Salvar rascunho</button><button type="button" class="btn btn-principal" data-r="iniciar">Iniciar campanha</button></div></div>';

      var inTitulo = $('#n-titulo', el), inPrazo = $('#n-prazo', el), inCusto = $('#n-custo', el);
      inTitulo.value = N.titulo; inPrazo.value = N.prazo; inCusto.value = N.custo;
      inTitulo.addEventListener('input', function () { N.titulo = inTitulo.value; });
      inPrazo.addEventListener('input', function () { N.prazo = inPrazo.value; });
      inCusto.addEventListener('input', function () { var v = parseFloat(inCusto.value); N.custo = isFinite(v) && v >= 0 ? v : CUSTO_PADRAO; rodape(); });
      var bSalvar = $('[data-r="salvar"]', el), bIniciar = $('[data-r="iniciar"]', el);
      somenteAdmin(bSalvar); somenteAdmin(bIniciar); somenteAdmin($('[data-r="mais-passo"]', el));

      function naCampanha() {
        var s = new Set();
        if (N.id) (derivar().disparosPorCamp[N.id] || []).forEach(function (x) { s.add(x.telFim8); });
        return s;
      }
      var lista = criarListaContatos($('[data-r="lista"]', el), { sel: N.sel, naCampanha: naCampanha, aoMudar: rodape });

      function opcoesModelo(atual) {
        var d = derivar(), nomes = {};
        L('modelos').forEach(function (m) { if (m.status === 'APPROVED') nomes[m.nome || m._id] = true; });
        var lis = Object.keys(nomes).sort();
        var html = '<option value="">Sem mensagem</option>' + lis.map(function (n) { return '<option value="' + esc(n) + '"' + (n === atual ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
        if (atual && !nomes[atual]) html += '<option value="' + esc(atual) + '" selected>' + esc(atual) + ' (não aprovado)</option>';
        return html;
      }
      function desenharPassos() {
        $('[data-r="passos"]', el).innerHTML = N.passos.map(function (p, i) {
          return '<div class="passo"><div class="passo-topo"><h3>Passo ' + p.ordem + '</h3>' +
            (i > 0 ? '<div class="campo"><label for="dias-' + i + '">Dias sem resposta antes de mandar</label><input class="entrada" id="dias-' + i + '" type="number" min="1" step="1" value="' + (p.diasEspera || 1) + '" data-dias="' + i + '"></div>' +
              '<button type="button" class="btn btn-fantasma" data-rm="' + i + '"' + (SOU_ADMIN ? '' : ' disabled title="' + DICA_ADMIN + '"') + '>Remover passo</button>' : '<span class="suave pequeno">Sai assim que a campanha começa</span>') +
            '</div><div class="tipos">' + R.TIPOS.map(function (t) {
              return '<div class="campo"><label for="m-' + i + '-' + t.replace(' ', '_') + '">' + esc(TIPO_ROTULO[t]) + '</label><select class="entrada" id="m-' + i + '-' + t.replace(' ', '_') + '" data-i="' + i + '" data-tipo="' + esc(t) + '">' + opcoesModelo(p.modelos[t]) + '</select></div>';
            }).join('') + '</div></div>';
        }).join('');
      }
      el.addEventListener('change', function (e) {
        var t = e.target;
        if (t.hasAttribute('data-tipo')) {
          var p = N.passos[Number(t.getAttribute('data-i'))];
          if (t.value) p.modelos[t.getAttribute('data-tipo')] = t.value; else delete p.modelos[t.getAttribute('data-tipo')];
          rodape();
        } else if (t.hasAttribute('data-dias')) {
          var v = parseInt(t.value, 10);
          N.passos[Number(t.getAttribute('data-dias'))].diasEspera = isFinite(v) && v >= 1 ? v : 1;
          t.value = N.passos[Number(t.getAttribute('data-dias'))].diasEspera;
        }
      });
      el.addEventListener('click', function (e) {
        if (e.target.closest('[data-r="mais-passo"]')) {
          N.passos.push({ ordem: N.passos.length + 1, diasEspera: 3, modelos: {} });
          desenharPassos();
        }
        var rm = e.target.closest('[data-rm]');
        if (rm) {
          N.passos.splice(Number(rm.getAttribute('data-rm')), 1);
          N.passos.forEach(function (p, i) { p.ordem = i + 1; });
          desenharPassos();
        }
      });

      // Quem entra de verdade: selecionado, sem motivo de exclusão (inclusive "já está nesta campanha").
      function elegiveis() {
        var d = derivar(), na = naCampanha();
        var itens = [];
        N.sel.forEach(function (cid) {
          var c = d.contatosPorId[cid];
          if (c && !R.motivoDeExclusao(c, d.optout, na)) itens.push(c);
        });
        return itens;
      }
      function resumo() {
        var itens = elegiveis(), m1 = N.passos[0].modelos;
        var prev = itens.filter(function (c) { return !!m1[c.tipo]; });
        return { selecionados: itens.length, previstas: prev.length, itens: prev, custo: prev.length * N.custo };
      }
      function rodape() {
        var r = derivar().contatos ? resumo() : { selecionados: 0, previstas: 0, custo: 0 };
        $('[data-r="r-sel"]', el).textContent = num(r.selecionados);
        $('[data-r="r-msg"]', el).textContent = num(r.previstas);
        $('[data-r="r-custo"]', el).textContent = moeda(r.custo);
      }

      function docCampanha(extra) {
        var passos = N.passos.map(function (p, i) {
          var modelos = {};
          Object.keys(p.modelos).forEach(function (t) { if (p.modelos[t]) modelos[t] = p.modelos[t]; });
          return { ordem: i + 1, diasEspera: i === 0 ? 0 : (p.diasEspera || 1), modelos: modelos };
        });
        var doc = { titulo: N.titulo.trim(), status: 'rascunho', prazo: N.prazo.trim(), passos: passos, custoPorMensagem: N.custo, atualizadoEm: Date.now() };
        if (!N.id) { N.id = novoId(); doc.criadoEm = Date.now(); doc.criadoPor = firebase.auth().currentUser ? firebase.auth().currentUser.uid : ''; }
        return Object.assign(doc, extra || {});
      }
      function gravarRascunho() {
        if (!N.titulo.trim()) { toast('Dê um título à campanha antes de salvar.', true); inTitulo.focus(); return Promise.resolve(false); }
        var existia = !!N.id;
        var doc = docCampanha({ selecionados: Array.from(N.sel) });
        return firebase.firestore().collection('campanhas').doc(N.id).set(doc, { merge: true }).then(function () {
          if (!existia && location.hash.indexOf('#/nova') === 0) history.replaceState(null, '', '#/nova/' + encodeURIComponent(N.id));
          return true;
        });
      }
      bSalvar.addEventListener('click', function () {
        if (N.gravando) return;
        N.gravando = true; bSalvar.disabled = true;
        gravarRascunho().then(function (ok) { if (ok) toast('Rascunho salvo.'); }, function (err) { toast(msgErro(err), true); })
          .then(function () { N.gravando = false; if (SOU_ADMIN) bSalvar.disabled = false; });
      });

      function validar() {
        if (!N.titulo.trim()) return 'Dê um título à campanha.';
        var m1 = N.passos[0].modelos;
        if (!Object.keys(m1).some(function (t) { return m1[t]; })) return 'Escolha ao menos um modelo no passo 1.';
        for (var i = 1; i < N.passos.length; i++) {
          if (!Object.keys(N.passos[i].modelos).length) return 'O passo ' + (i + 1) + ' está sem nenhum modelo. Escolha um ou remova o passo.';
        }
        if (!derivar().ativos.length) return 'Nenhum vendedor ativo com WhatsApp para receber os leads.';
        if (!(N.custo >= 0)) return 'Custo por mensagem inválido.';
        return '';
      }
      bIniciar.addEventListener('click', function () {
        if (N.gravando) return;
        var erro = validar();
        if (erro) { toast(erro, true); return; }
        var r = resumo();
        // Os contatos já foram gravados numa tentativa anterior, mas a campanha não chegou a ficar ativa.
        if (!r.previstas && N.id && (derivar().disparosPorCamp[N.id] || []).length) {
          confirmar({ titulo: 'Ativar campanha', texto: 'Os contatos desta campanha já estão na fila. Falta só ativá-la.', ok: 'Ativar campanha' }).then(function (sim) {
            if (!sim) return;
            ativarCampanha().then(function () { toast('Campanha ativada.'); irPara('#/campanha/' + encodeURIComponent(N.id)); }, function (err) { toast(msgErro(err), true); });
          });
          return;
        }
        if (!r.previstas) { toast('Nenhum contato selecionado recebe mensagem no passo 1. Escolha contatos de tipos que tenham modelo.', true); return; }
        confirmar({
          titulo: 'Iniciar campanha',
          texto: 'A campanha <b>' + esc(N.titulo.trim()) + '</b> vai entrar na fila com <b>' + num(r.previstas) + '</b> mensagens no passo 1, com custo estimado de <b>' + moeda(r.custo) +
            '</b>. As mensagens saem aos poucos, pelo servidor. Depois de iniciar, a campanha deixa de ser rascunho e não dá mais para editar a seleção.',
          ok: 'Iniciar campanha'
        }).then(function (sim) { if (sim) iniciar(); });
      });

      function iniciar() {
        N.gravando = true; bIniciar.disabled = true; bSalvar.disabled = true;
        var prog = abrirProgresso('Iniciando campanha', 'Salvando a campanha…');
        var gravados = 0, total = 0;
        function falhou(err) {
          prog.fechar();
          N.gravando = false; if (SOU_ADMIN) { bIniciar.disabled = false; bSalvar.disabled = false; }
          toast((gravados ? 'Parou no meio: ' + num(gravados) + ' de ' + num(total) + ' contatos já foram gravados. Clique em Iniciar de novo para completar. ' : '') + msgErro(err), true);
        }
        gravarRascunho().then(function (ok) {
          if (!ok) throw new Error('Não foi possível salvar a campanha.');
          var docs = docsDoPasso1(resumo().itens, N.id, N.passos[0].modelos, L('disparos').length, Date.now());
          total = docs.length;
          var db = firebase.firestore(), cadeia = Promise.resolve();
          for (var i = 0; i < docs.length; i += LOTE) (function (ini) {
            cadeia = cadeia.then(function () {
              var lote = db.batch();
              docs.slice(ini, ini + LOTE).forEach(function (x) { lote.set(db.collection('disparos').doc(x.id), x.dados); });
              prog.definir('Gravando contatos: ' + num(Math.min(ini + LOTE, total)) + ' de ' + num(total) + '…', Math.min(ini + LOTE, total) / total * 95);
              return lote.commit().then(function () { gravados = Math.min(ini + LOTE, total); });
            });
          })(i);
          return cadeia;
        }).then(function () {
          prog.definir('Ativando a campanha…', 98);
          return ativarCampanha();
        }).then(function () {
          prog.fechar();
          toast('Campanha iniciada. As mensagens saem aos poucos, a partir da próxima rodada do servidor.');
          irPara('#/campanha/' + encodeURIComponent(N.id));
        }).catch(falhou);
      }
      function ativarCampanha() {
        return firebase.firestore().collection('campanhas').doc(N.id).update({
          status: 'ativa', iniciadoEm: Date.now(), atualizadoEm: Date.now(), selecionados: firebase.firestore.FieldValue.delete()
        });
      }

      desenharPassos();
      lista.atualizar();
      rodape();
      return {
        atualizar: function () {
          // Recalcula a lista e o rodapé; os passos só mudam de modelo quando a pessoa mexe (não perde o que ela escolheu).
          lista.atualizar(); rodape();
          if (!$('.passo :focus', el)) desenharPassos();
        }
      };
    }
  };

  // ---------- 3b. Adicionar contatos a uma campanha ativa ou pausada ----------
  // Rota #/campanha/<id>/adicionar. Grava só o passo 1, igual ao Iniciar; os passos seguintes o servidor agenda.
  TELAS.adicionar = {
    menu: 'campanhas', rodape: true, nec: ['campanhas', 'disparos', 'vendedores', 'funil', 'clientes', 'vendas', 'pipelines', 'optout', 'modelos'],
    montar: function (el, args) {
      var id = args[0];
      var camp0 = derivar().campMap[id];
      if (!camp0) { el.innerHTML = '<a class="voltar-link" href="#/campanhas">' + ico('esq') + ' Voltar para campanhas</a><div class="bloco vazio">Campanha não encontrada.</div>'; return {}; }
      if (camp0.status !== 'ativa' && camp0.status !== 'pausada') { irPara('#/campanha/' + encodeURIComponent(id)); return {}; }
      var S = { sel: new Set(), gravando: false };

      el.innerHTML =
        '<a class="voltar-link" href="#/campanha/' + encodeURIComponent(id) + '">' + ico('esq') + ' Voltar para a campanha</a>' +
        '<div class="topo"><div><h1>Adicionar contatos</h1><p class="suave" style="margin:4px 0 0" data-r="camp"></p></div></div>' +
        '<section class="bloco"><h2>Contatos</h2><p class="ajuda" style="margin-top:-6px" data-r="aviso"></p><div data-r="lista"></div></section>' +
        '<div class="rodape-fixo"><div class="resumo"><div><small>Selecionados</small><b data-r="r-sel">0</b></div><div><small>Mensagens previstas</small><b data-r="r-msg">0</b></div>' +
          '<div class="hidden" data-r="r-sem-box"><small>Sem modelo no passo 1</small><b data-r="r-sem">0</b></div><div><small>Custo estimado</small><b data-r="r-custo">R$ 0,00</b></div></div>' +
          '<div class="acoes"><button type="button" class="btn btn-principal" data-r="adicionar">Adicionar à campanha</button></div></div>';
      var bAdd = $('[data-r="adicionar"]', el);
      somenteAdmin(bAdd);

      function campAtual() { return derivar().campMap[id] || camp0; }
      function modelos1() { var p = campAtual().passos; return p && p[0] && p[0].modelos ? p[0].modelos : {}; }
      function custoMsg() { var c = campAtual().custoPorMensagem; return typeof c === 'number' && isFinite(c) ? c : CUSTO_PADRAO; }
      function naCampanha() {
        var s = new Set();
        (derivar().disparosPorCamp[id] || []).forEach(function (x) { s.add(x.telFim8); });
        return s;
      }
      var lista = criarListaContatos($('[data-r="lista"]', el), { sel: S.sel, naCampanha: naCampanha, aoMudar: rodape });

      // Quem entra de verdade: selecionado, sem motivo de exclusão (inclusive "já está nesta campanha").
      function resumo() {
        var d = derivar(), na = naCampanha(), m1 = modelos1(), itens = [];
        S.sel.forEach(function (cid) {
          var c = d.contatosPorId[cid];
          if (c && !R.motivoDeExclusao(c, d.optout, na)) itens.push(c);
        });
        var prev = itens.filter(function (c) { return !!m1[c.tipo]; });
        return { selecionados: itens.length, previstas: prev.length, itens: prev, semModelo: itens.length - prev.length, custo: prev.length * custoMsg() };
      }
      function rodape() {
        $('[data-r="camp"]', el).textContent = 'Campanha: ' + (campAtual().titulo || 'Sem título');
        var m1 = modelos1();
        var com = R.TIPOS.filter(function (t) { return !!m1[t]; }), sem = R.TIPOS.filter(function (t) { return !m1[t]; });
        $('[data-r="aviso"]', el).textContent = com.length
          ? 'Os contatos entram com a mensagem do passo 1 da campanha. Tipos com mensagem: ' + com.map(function (t) { return TIPO_ROTULO[t]; }).join(', ') + '.' +
            (sem.length ? ' Contato de tipo sem modelo no passo 1 (' + sem.map(function (t) { return TIPO_ROTULO[t]; }).join(', ') + ') não recebe mensagem e não entra.' : '')
          : 'O passo 1 desta campanha não tem nenhum modelo, então nenhum contato pode ser adicionado.';
        var r = derivar().contatos ? resumo() : { selecionados: 0, previstas: 0, semModelo: 0, custo: 0 };
        $('[data-r="r-sel"]', el).textContent = num(r.selecionados);
        $('[data-r="r-msg"]', el).textContent = num(r.previstas);
        $('[data-r="r-sem"]', el).textContent = num(r.semModelo);
        $('[data-r="r-sem-box"]', el).classList.toggle('hidden', !r.semModelo);
        $('[data-r="r-custo"]', el).textContent = moeda(r.custo);
      }

      // `ordem` continua depois da maior que a campanha já tem.
      function proximaOrdem() {
        var maior = -1;
        (derivar().disparosPorCamp[id] || []).forEach(function (x) { if (typeof x.ordem === 'number' && x.ordem > maior) maior = x.ordem; });
        return maior + 1;
      }

      bAdd.addEventListener('click', function () {
        if (S.gravando) return;
        var c = campAtual();
        if (c.status !== 'ativa' && c.status !== 'pausada') { toast('Esta campanha não aceita mais contatos.', true); return; }
        if (!derivar().ativos.length) { toast('Nenhum vendedor ativo com WhatsApp para receber os leads.', true); return; }
        var r = resumo();
        if (!r.previstas) { toast('Nenhum contato selecionado recebe mensagem no passo 1. Escolha contatos de tipos que tenham modelo.', true); return; }
        var docs = docsDoPasso1(r.itens, id, modelos1(), proximaOrdem(), Date.now());
        var n = docs.length;
        confirmar({
          titulo: 'Adicionar à campanha',
          texto: '<b>' + num(n) + '</b> ' + (n === 1 ? 'contato entra' : 'contatos entram') + ' na campanha <b>' + esc(c.titulo || 'Sem título') + '</b>, com custo estimado de <b>' + moeda(n * custoMsg()) + '</b>. ' +
            (c.status === 'ativa' ? 'Eles entram na fila e saem na próxima rodada do servidor.' : 'A campanha está pausada: eles ficam na fila e saem quando ela for retomada.') +
            (r.semModelo ? ' ' + num(r.semModelo) + (r.semModelo === 1 ? ' contato selecionado é de um tipo sem modelo no passo 1 e não entra.' : ' contatos selecionados são de tipos sem modelo no passo 1 e não entram.') : ''),
          ok: 'Adicionar'
        }).then(function (sim) { if (sim) gravar(docs); });
      });

      function gravar(docs) {
        S.gravando = true; bAdd.disabled = true;
        var prog = abrirProgresso('Adicionando contatos', 'Gravando contatos…');
        emLotes(docs, function (lote, x, db) { lote.set(db.collection('disparos').doc(x.id), x.dados); }, function (ate, total) {
          prog.definir('Gravando contatos: ' + num(ate) + ' de ' + num(total) + '…', ate / total * 100);
        }).then(function () {
          prog.fechar();
          toast(num(docs.length) + (docs.length === 1 ? ' contato adicionado.' : ' contatos adicionados.'));
          irPara('#/campanha/' + encodeURIComponent(id));
        }, function (err) {
          prog.fechar();
          S.gravando = false; if (SOU_ADMIN) bAdd.disabled = false;
          toast(msgParou(err, 'contatos') + (err && err.feitos ? ' Quem já entrou aparece como "já está nesta campanha"; selecione os demais e adicione de novo.' : ''), true);
        });
      }

      lista.atualizar();
      rodape();
      return { atualizar: function () { lista.atualizar(); rodape(); } };
    }
  };

  // ---------- 4. Contatos (base, filtros e importação) ----------
  function baixarModeloImportacao(formato) {
    // Exemplo fictício, montado em pedaços só pra não parecer número de cliente.
    var exemplo = '(91) ' + '9' + '0000-0000';
    if (formato === 'csv') {
      baixarArquivo('modelo-importacao-contatos.csv', new Blob(['﻿Nome;Telefone;Etiqueta\r\nMaria Exemplo;' + exemplo + ';Feira Solar\r\n'], { type: 'text/csv;charset=utf-8' }));
      return;
    }
    var ws = XLSX.utils.aoa_to_sheet([['Nome', 'Telefone', 'Etiqueta'], ['Maria Exemplo', exemplo, 'Feira Solar']]);
    // Telefone como texto (t: 's', z: '@'): o Excel não corta o zero nem vira notação científica.
    for (var r = 1; r <= 500; r++) ws[XLSX.utils.encode_cell({ r: r, c: 1 })] = { t: 's', v: r === 1 ? exemplo : '', z: '@' };
    ws['!ref'] = 'A1:C501';
    ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 24 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contatos');
    XLSX.writeFile(wb, 'modelo-importacao-contatos.xlsx');
  }

  function lerPlanilha(arquivo) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('Não consegui ler o arquivo.')); };
      fr.onload = function () {
        try {
          var wb = XLSX.read(fr.result, { type: 'array', raw: true, codepage: 65001 });
          var ws = wb.Sheets[wb.SheetNames[0]];
          if (!ws) throw new Error('O arquivo está vazio.');
          var linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
          if (!linhas.length) throw new Error('O arquivo está vazio.');
          var cab = linhas[0].map(function (c) { return semAcento(c).trim(); });
          var ach = function (nomes) {
            for (var i = 0; i < cab.length; i++) for (var j = 0; j < nomes.length; j++) if (cab[i].indexOf(nomes[j]) === 0) return i;
            return -1;
          };
          var iNome = ach(['nome']), iTel = ach(['telefone', 'celular', 'whatsapp', 'fone']), iEtq = ach(['etiqueta', 'tag']);
          var temCab = iNome !== -1 || iTel !== -1;
          if (!temCab) { iNome = 0; iTel = 1; iEtq = 2; }
          var dados = (temCab ? linhas.slice(1) : linhas).map(function (l) {
            return { nome: String(iNome >= 0 && l[iNome] != null ? l[iNome] : '').trim(), telefone: R.telefoneDeCelula(iTel >= 0 ? l[iTel] : ''), etiqueta: String(iEtq >= 0 && l[iEtq] != null ? l[iEtq] : '').trim() };
          }).filter(function (l) { return l.nome || l.telefone; });
          resolve(dados);
        } catch (e) { reject(e); }
      };
      fr.readAsArrayBuffer(arquivo);
    });
  }

  function abrirImportacao(onFim) {
    var estado = { linhas: null, analise: null, incluir: new Set(), aba: 'novos' };
    var corpo = document.createElement('div');
    corpo.innerHTML =
      '<div data-r="passo1">' +
        '<p style="margin-top:0">Envie um arquivo <b>.xlsx</b> ou <b>.csv</b> com as colunas <b>Nome</b>, <b>Telefone</b> e <b>Etiqueta</b> (opcional). Nada é gravado antes da prévia.</p>' +
        '<div class="grade-campos" style="grid-template-columns:1fr 1fr"><div class="campo"><label for="i-arq">Arquivo</label><input class="entrada" id="i-arq" type="file" accept=".xlsx,.xls,.csv"></div>' +
        '<div class="campo"><label for="i-etq">Etiqueta do arquivo todo</label><input class="entrada" id="i-etq" type="text" maxlength="60" placeholder="Usada nas linhas sem etiqueta"></div></div>' +
        '<p class="ajuda">Não tem o arquivo? Baixe o modelo: <button type="button" class="link-btn" data-modelo="xlsx">Excel (.xlsx)</button> ou <button type="button" class="link-btn" data-modelo="csv">CSV</button>. No modelo, o telefone já vem como texto.</p>' +
        '<p class="erro-campo hidden" data-r="erro"></p>' +
      '</div><div data-r="passo2" class="hidden"></div>';
    var m = abrirModal({
      titulo: 'Importar contatos', largo: true, corpo: corpo,
      rodape: [
        { texto: 'Cancelar', aoClicar: function (mm) { mm.fechar(); } },
        { texto: 'Ver prévia', classe: 'btn-principal', aoClicar: previa }
      ]
    });
    var bPrev = m.botoes[1];
    function erro(t) { var e = $('[data-r="erro"]', corpo); e.textContent = t; e.classList.toggle('hidden', !t); }
    corpo.addEventListener('click', function (e) {
      var md = e.target.closest('[data-modelo]');
      if (md) baixarModeloImportacao(md.getAttribute('data-modelo'));
    });

    function previa() {
      var arq = $('#i-arq', corpo).files[0];
      if (!arq) { erro('Escolha um arquivo.'); return; }
      erro('');
      bPrev.disabled = true; bPrev.textContent = 'Lendo…';
      lerPlanilha(arq).then(function (linhas) {
        if (!linhas.length) throw new Error('Não achei nenhuma linha com nome ou telefone.');
        var d = derivar();
        var cadastro = L('clientes').map(function (c) { return { id: String(c.IdCliente || c._id), docId: c._id, nome: nomeDoCliente(c), telefone: c.Telefone }; });
        estado.analise = R.analisarImportacao(linhas, cadastro, $('#i-etq', corpo).value);
        estado.incluir = new Set();
        estado.analise.existentes.forEach(function (x, i) { if (x.etiqueta) estado.incluir.add(i); });
        estado.aba = 'novos';
        mostrarPrevia();
      }).catch(function (e) { erro(e.message || 'Não consegui ler o arquivo.'); bPrev.disabled = false; bPrev.textContent = 'Ver prévia'; });
    }

    function tabelaPrevia() {
      var a = estado.analise, lim = 200, h = '';
      if (estado.aba === 'novos') {
        h = a.novos.slice(0, lim).map(function (x) { return '<tr><td>' + x.linha + '</td><td>' + esc(x.nome) + '</td><td class="nowrap">' + esc(x.formatado) + '</td><td>' + esc(x.etiqueta || '—') + '</td></tr>'; }).join('');
        return tabelaMini(['Linha', 'Nome', 'Telefone', 'Etiqueta'], h, a.novos.length, lim, 'Nenhum contato novo.');
      }
      if (estado.aba === 'existentes') {
        h = a.existentes.slice(0, lim).map(function (x, i) {
          return '<tr><td>' + (x.etiqueta ? '<input type="checkbox" data-inc="' + i + '"' + (estado.incluir.has(i) ? ' checked' : '') + ' aria-label="Incluir na etiqueta">' : '') + '</td><td>' + x.linha + '</td><td>' + esc(x.nome || '—') +
            '</td><td>' + esc(x.cadastro.nome || 'Sem nome') + '</td><td class="nowrap">' + esc(x.formatado) + '</td><td>' + esc(x.etiqueta || 'sem etiqueta') + '</td></tr>';
        }).join('');
        return tabelaMini(['Incluir na etiqueta', 'Linha', 'Nome no arquivo', 'Cadastro existente', 'Telefone', 'Etiqueta'], h, a.existentes.length, lim, 'Nenhum telefone do arquivo já está cadastrado.');
      }
      h = a.pulados.slice(0, lim).map(function (x) { return '<tr><td>' + x.linha + '</td><td>' + esc(x.nome || '—') + '</td><td class="nowrap">' + esc(x.telefone || '—') + '</td><td>' + esc(x.motivo) + '</td></tr>'; }).join('');
      return tabelaMini(['Linha', 'Nome', 'Telefone', 'Motivo'], h, a.pulados.length, lim, 'Nenhuma linha pulada.');
    }
    function tabelaMini(cols, linhas, total, lim, vazio) {
      if (!total) return '<div class="vazio">' + vazio + '</div>';
      return '<div class="tabela-wrap"><table class="tabela"><thead><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' + linhas + '</tbody></table></div>' +
        (total > lim ? '<p class="ajuda">Mostrando as primeiras ' + lim + ' de ' + num(total) + ' linhas.</p>' : '');
    }
    function mostrarPrevia() {
      var a = estado.analise, p2 = $('[data-r="passo2"]', corpo);
      $('[data-r="passo1"]', corpo).classList.add('hidden');
      p2.classList.remove('hidden');
      var abas = [['novos', 'Novos', a.novos.length], ['existentes', 'Já cadastrados', a.existentes.length], ['pulados', 'Pulados', a.pulados.length]];
      p2.innerHTML = '<p style="margin-top:0">Confira antes de gravar. Quem já está cadastrado (mesmo telefone) nunca é duplicado.</p>' +
        '<div class="abas">' + abas.map(function (x) { return '<button type="button" class="aba' + (estado.aba === x[0] ? ' ativa' : '') + '" data-aba="' + x[0] + '">' + x[1] + ' (' + num(x[2]) + ')</button>'; }).join('') + '</div>' +
        (estado.aba === 'pulados' && a.pulados.length ? '<p><button type="button" class="btn btn-fantasma" data-baixar-pulados>' + ico('baixar') + ' Baixar lista dos pulados</button></p>' : '') +
        (estado.aba === 'existentes' && a.existentes.length ? '<p class="ajuda">Marque os cadastros que devem ganhar a etiqueta do arquivo.</p>' : '') +
        tabelaPrevia();
      var temAlgo = a.novos.length || estado.incluir.size;
      m.botoes[1].classList.add('hidden');
      var ok = m.botoes[2];
      if (!ok) {
        var bt = document.createElement('button');
        bt.type = 'button'; bt.className = 'btn btn-principal'; bt.addEventListener('click', gravar);
        $('.modal-rodape', m.fundo).appendChild(bt);
        m.botoes.push(bt); ok = bt;
      }
      ok.textContent = 'Importar ' + num(a.novos.length) + (a.novos.length === 1 ? ' novo' : ' novos') + (estado.incluir.size ? ' e etiquetar ' + num(estado.incluir.size) : '');
      ok.disabled = !temAlgo || !SOU_ADMIN;
      if (!SOU_ADMIN) ok.title = DICA_ADMIN;
    }
    corpo.addEventListener('click', function (e) {
      var ab = e.target.closest('[data-aba]');
      if (ab) { estado.aba = ab.getAttribute('data-aba'); mostrarPrevia(); return; }
      if (e.target.closest('[data-baixar-pulados]')) {
        var l = ['Linha;Nome;Telefone;Motivo'].concat(estado.analise.pulados.map(function (x) { return [x.linha, x.nome, x.telefone, x.motivo].map(csvCelula).join(';'); }));
        baixarArquivo('contatos-pulados.csv', new Blob(['﻿' + l.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
      }
    });
    corpo.addEventListener('change', function (e) {
      var cx = e.target.closest('[data-inc]');
      if (!cx) return;
      var i = Number(cx.getAttribute('data-inc'));
      if (cx.checked) estado.incluir.add(i); else estado.incluir.delete(i);
      var ok = m.botoes[2];
      ok.textContent = 'Importar ' + num(estado.analise.novos.length) + (estado.analise.novos.length === 1 ? ' novo' : ' novos') + (estado.incluir.size ? ' e etiquetar ' + num(estado.incluir.size) : '');
      ok.disabled = !(estado.analise.novos.length || estado.incluir.size) || !SOU_ADMIN;
    });

    function gravar() {
      if (!SOU_ADMIN) return;
      var a = estado.analise, db = firebase.firestore();
      m.botoes.forEach(function (b) { b.disabled = true; });
      var ids = new Set(L('clientes').map(function (c) { return String(c.IdCliente || c._id); }));
      var ops = [];
      a.novos.forEach(function (x) {
        var id = novoId();
        while (ids.has(id)) id = novoId();
        ids.add(id);
        ops.push({ ref: db.collection('clientes').doc(id), dados: {
          IdCliente: id, 'Nome Razao Social': x.nome, 'Tipo Pessoa': 'Física', NomeMae: '', RG: '', DataExpedicaoRG: '', DataNascimento: '',
          Telefone: x.formatado, 'CPF ou CNPJ': '', Email: '', Endereco: '', CEP: '', Ocupacao: '', Renda: '', 'Status Cliente': 'Lead',
          Origem: R.ORIGEM_IMPORTADA, 'Vendedor Responsavel': '', CPFEquatorial: '', DataNascimentoEquatorial: '', NumeroUnidadeGeradora: '',
          UnidadesBeneficiarias: [], Etiquetas: x.etiqueta ? [x.etiqueta] : []
        }, novo: true });
      });
      Array.from(estado.incluir).forEach(function (i) {
        var x = a.existentes[i];
        ops.push({ ref: db.collection('clientes').doc(x.cadastro.docId), dados: { Etiquetas: firebase.firestore.FieldValue.arrayUnion(x.etiqueta) }, novo: false });
      });
      var prog = abrirProgresso('Importando contatos', 'Gravando…');
      var feitos = 0, cadeia = Promise.resolve();
      for (var i = 0; i < ops.length; i += LOTE) (function (ini) {
        cadeia = cadeia.then(function () {
          var lote = db.batch();
          ops.slice(ini, ini + LOTE).forEach(function (o) { if (o.novo) lote.set(o.ref, o.dados); else lote.update(o.ref, o.dados); });
          prog.definir('Gravando: ' + num(Math.min(ini + LOTE, ops.length)) + ' de ' + num(ops.length) + '…', Math.min(ini + LOTE, ops.length) / ops.length * 100);
          return lote.commit().then(function () { feitos = Math.min(ini + LOTE, ops.length); });
        });
      })(i);
      cadeia.then(function () {
        prog.fechar(); m.fechar();
        toast('Importação concluída: ' + num(a.novos.length) + ' novos' + (estado.incluir.size ? ' e ' + num(estado.incluir.size) + ' cadastros etiquetados' : '') + '.');
        if (onFim) onFim();
      }, function (err) {
        prog.fechar();
        m.botoes.forEach(function (b) { b.disabled = false; });
        toast((feitos ? 'Parou no meio: ' + num(feitos) + ' de ' + num(ops.length) + ' já foram gravados (importar de novo não duplica: telefones já cadastrados vão para “Já cadastrados”). ' : '') + msgErro(err), true);
      });
    }
  }

  TELAS.contatos = {
    menu: 'contatos', nec: ['clientes', 'funil', 'vendas', 'pipelines', 'optout', 'disparos', 'vendedores'],
    montar: function (el, args) {
      el.innerHTML =
        '<div class="topo"><h1>Contatos</h1><div class="acoes"><button type="button" class="btn" data-r="modelo">' + ico('baixar') + ' Baixar modelo</button><button type="button" class="btn btn-principal" data-r="importar">' + ico('upload') + ' Importar contatos</button></div></div>' +
        '<div data-r="kpis"></div><div data-r="lista"></div>';
      var bImp = $('[data-r="importar"]', el);
      somenteAdmin(bImp);
      bImp.addEventListener('click', function () { abrirImportacao(); });
      $('[data-r="modelo"]', el).addEventListener('click', function () {
        abrirModal({
          titulo: 'Baixar modelo', corpo: '<p style="margin:0">O modelo traz as colunas Nome, Telefone e Etiqueta e uma linha de exemplo. No Excel, a coluna Telefone já vem como texto.</p>',
          rodape: [
            { texto: 'Excel (.xlsx)', classe: 'btn-principal', aoClicar: function (m) { baixarModeloImportacao('xlsx'); m.fechar(); } },
            { texto: 'CSV', aoClicar: function (m) { baixarModeloImportacao('csv'); m.fechar(); } }
          ]
        });
      });
      // Os números contam só quem passa pelos filtros e pela busca da lista.
      // Clicar num cartão filtra a lista por ele, sem mudar os números dos outros.
      var KPI_CONTATO = {
        funil: function (c) { return c.temFunil; },
        semfunil: function (c) { return !c.temFunil; },
        importada: function (c) { return c.origem === R.ORIGEM_IMPORTADA; }
      };
      var kpiAtivo = ligarKpis($('[data-r="kpis"]', el), function () { lista.irInicio(); });
      var lista = criarListaContatos($('[data-r="lista"]', el), { aoFiltrar: kpis, filtroExtra: function () { return KPI_CONTATO[kpiAtivo()] || null; } });
      function kpis(cs) {
        var conta = function (k) { return cs.filter(KPI_CONTATO[k]).length; };
        $('[data-r="kpis"]', el).innerHTML = kpisHtml([
          { rotulo: 'Total', valor: num(cs.length), icone: 'balao', chave: '' }, { rotulo: 'Com funil', valor: num(conta('funil')), icone: 'check', chave: 'funil' },
          { rotulo: 'Sem funil', valor: num(conta('semfunil')), icone: 'relogio', chave: 'semfunil' },
          { rotulo: 'Base importada', valor: num(conta('importada')), icone: 'upload', chave: 'importada' }
        ], kpiAtivo());
      }
      function desenhar() { lista.atualizar(); }
      desenhar();
      if (args[0] === 'importar') {
        history.replaceState(null, '', '#/contatos');
        if (SOU_ADMIN) abrirImportacao(); else toast(DICA_ADMIN + ' importa contatos.', true);
      }
      return { atualizar: desenhar };
    }
  };

  // ---------- 5. Modelos ----------
  function previaBalao(corpo, prazoExemplo) {
    var texto = String(corpo || '')
      .replace(/\{\{1\}\}/g, 'Maria').replace(/\{\{2\}\}/g, 'outubro').replace(/\{\{3\}\}/g, prazoExemplo || 'sexta-feira, 31/10');
    return '<div class="balao-linha saida" style="max-width:100%"><div class="balao">' + (texto ? esc(texto) : '<span class="suave">A prévia aparece aqui.</span>') +
      '<div class="meta">' + hora(Date.now()) + '</div></div><div class="balao-botoes"><span>Falar com o atendente</span><span>Não tenho interesse agora</span></div></div>';
  }

  function abrirNovoModelo() {
    var corpo = document.createElement('div');
    corpo.innerHTML =
      '<div class="novo-modelo"><div>' +
        '<div class="campo"><label for="nm-nome">Nome do modelo</label><input class="entrada" id="nm-nome" type="text" maxlength="60" placeholder="ex.: reativacao_novembro_v1" autocomplete="off"><span class="ajuda">Só minúsculas, números e _.</span></div>' +
        '<div class="campo" style="margin-top:14px"><label for="nm-texto">Texto da mensagem</label>' +
        '<div class="inserir"><button type="button" class="btn btn-fantasma btn-mini" data-var="{{1}}">{{1}} nome</button><button type="button" class="btn btn-fantasma btn-mini" data-var="{{2}}">{{2}} referência</button><button type="button" class="btn btn-fantasma btn-mini" data-var="{{3}}">{{3}} prazo</button></div>' +
        '<textarea class="entrada" id="nm-texto" maxlength="1024" placeholder="Olá, {{1}}! Em {{2}} a gente conversou sobre energia solar…"></textarea><span class="ajuda" data-r="conta">0 de 1024 caracteres</span></div>' +
        '<p class="erro-campo hidden" data-r="erro"></p>' +
      '</div><div><div class="previa-titulo">Prévia no WhatsApp</div><div class="previa" data-r="previa"></div></div></div>';
    var m = abrirModal({
      titulo: 'Novo modelo', largo: true, corpo: corpo,
      rodape: [
        { texto: 'Cancelar', aoClicar: function (mm) { mm.fechar(); } },
        { texto: 'Enviar para análise', classe: 'btn-principal', aoClicar: enviar }
      ]
    });
    var inNome = $('#nm-nome', corpo), inTexto = $('#nm-texto', corpo), bEnviar = m.botoes[1];
    if (!SOU_ADMIN) somenteAdmin(bEnviar);
    function erro(t) { var e = $('[data-r="erro"]', corpo); e.textContent = t; e.classList.toggle('hidden', !t); }
    function previa() {
      $('[data-r="previa"]', corpo).innerHTML = previaBalao(inTexto.value);
      $('[data-r="conta"]', corpo).textContent = inTexto.value.length + ' de 1024 caracteres';
    }
    inNome.addEventListener('input', function () {
      var v = semAcento(inNome.value).replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      if (v !== inNome.value) inNome.value = v;
    });
    inTexto.addEventListener('input', previa);
    corpo.addEventListener('click', function (e) {
      var b = e.target.closest('[data-var]');
      if (!b) return;
      var v = b.getAttribute('data-var'), ini = inTexto.selectionStart, fim = inTexto.selectionEnd;
      inTexto.value = inTexto.value.slice(0, ini) + v + inTexto.value.slice(fim);
      inTexto.focus(); inTexto.selectionStart = inTexto.selectionEnd = ini + v.length;
      previa();
    });
    previa();

    function enviar() {
      var nome = inNome.value.trim(), texto = inTexto.value.trim();
      if (!nome) { erro('Dê um nome ao modelo.'); return; }
      if (derivar().modeloMap[nome]) { erro('Já existe um modelo com esse nome.'); return; }
      if (!texto) { erro('Escreva o texto da mensagem.'); return; }
      var usadas = {};
      (texto.match(/\{\{\d+\}\}/g) || []).forEach(function (v) { usadas[parseInt(v.slice(2), 10)] = true; });
      var maior = Math.max.apply(null, [0].concat(Object.keys(usadas).map(Number)));
      for (var i = 1; i <= maior; i++) if (!usadas[i]) { erro('Use as variáveis em ordem: {{1}}, depois {{2}}, depois {{3}}.'); return; }
      if (maior > 3) { erro('O modelo aceita no máximo as variáveis {{1}}, {{2}} e {{3}}.'); return; }
      erro('');
      bEnviar.disabled = true; bEnviar.textContent = 'Enviando…';
      chamarServidor('disparoCriarModelo', { nome: nome, corpo: texto }).then(function () {
        m.fechar();
        toast('Modelo enviado. Ele aparece como “Em análise” até a Meta responder.');
      }, function (err) {
        bEnviar.disabled = false; bEnviar.textContent = 'Enviar para análise';
        erro(err.message);
      });
    }
  }

  TELAS.modelos = {
    menu: 'modelos', nec: ['modelos'],
    montar: function (el) {
      el.innerHTML =
        '<div class="topo"><h1>Modelos</h1><div class="acoes"><button type="button" class="btn" data-r="sync">Atualizar status</button><button type="button" class="btn btn-principal" data-r="novo">' + ico('mais') + ' Novo modelo</button></div></div>' +
        '<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Nome</th><th>Texto</th><th>Status na Meta</th><th>Atualizado</th></tr></thead><tbody data-r="corpo"></tbody></table></div>';
      var bSync = $('[data-r="sync"]', el), bNovo = $('[data-r="novo"]', el);
      somenteAdmin(bSync); somenteAdmin(bNovo);
      bNovo.addEventListener('click', abrirNovoModelo);
      bSync.addEventListener('click', function () {
        bSync.disabled = true; bSync.textContent = 'Atualizando…';
        chamarServidor('disparoSincronizarModelos', {}).then(function () { toast('Status dos modelos atualizado.'); }, function (err) { toast(err.message, true); })
          .then(function () { bSync.textContent = 'Atualizar status'; if (SOU_ADMIN) bSync.disabled = false; });
      });
      function desenhar() {
        var ms = L('modelos').slice().sort(function (a, b) { return String(a.nome || a._id).localeCompare(String(b.nome || b._id)); });
        $('[data-r="corpo"]', el).innerHTML = ms.length ? ms.map(function (m) {
          var st = MODELO_STATUS[m.status] || [m.status || 'Sem status', 'neutro'];
          var em = paraMs(m.atualizadoEm);
          return '<tr><td class="nome">' + esc(m.nome || m._id) + '</td><td><span class="modelo-texto">' + esc(m.corpo || '') + '</span></td><td>' + selo(st[1], st[0]) +
            (m.status === 'REJECTED' && m.motivo ? '<span class="modelo-motivo">' + esc(m.motivo) + '</span>' : '') + '</td><td class="nowrap">' + (em ? esc(haTempo(em)) : '—') + '</td></tr>';
        }).join('') : '<tr><td colspan="4" class="vazio">Nenhum modelo ainda. ' + (SOU_ADMIN ? 'Use “Atualizar status” para trazer os modelos da Meta ou crie um novo.' : '') + '</td></tr>';
      }
      desenhar();
      return { atualizar: desenhar };
    }
  };

  // ══════════════ ROTEAMENTO ══════════════
  var TELA_ATUAL = null, ROTA_ATUAL = null, MONTADA = false;
  function irPara(hash) { if (location.hash === hash) rotear(); else location.hash = hash; }

  function marcarMenu(nome) {
    document.querySelectorAll('.menu a').forEach(function (a) {
      var ativo = a.getAttribute('data-nav') === nome;
      a.classList.toggle('ativo', ativo);
      if (ativo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function rotear() {
    if (TELA_ATUAL && TELA_ATUAL.destruir) TELA_ATUAL.destruir();
    TELA_ATUAL = null; MONTADA = false;
    fecharTodosModais();
    var partes = (location.hash || '#/campanhas').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    var chave = partes[0] || 'campanhas', args = partes.slice(1);
    // #/campanha/<id>/adicionar tem tela própria.
    if (chave === 'campanha' && args[1] === 'adicionar') { chave = 'adicionar'; args = [args[0]]; }
    var def = TELAS[chave];
    if (!def) { location.replace('#/campanhas'); return; }
    ROTA_ATUAL = { def: def, args: args };
    marcarMenu(def.menu);
    garantir(def.nec);
    window.scrollTo(0, 0);
    tentarMontar();
  }

  function tentarMontar() {
    if (!ROTA_ATUAL) return;
    var tela = $('#tela'), def = ROTA_ATUAL.def;
    if (MONTADA) { if (TELA_ATUAL && TELA_ATUAL.atualizar) TELA_ATUAL.atualizar(); return; }
    var falhou = def.nec.some(function (k) { return DADOS[k] && DADOS[k].erro; });
    if (falhou) {
      tela.innerHTML = '<div class="bloco vazio">Não consegui carregar os dados. Se você acabou de entrar, recarregue a página; se continuar, entre de novo pelo <a href="index.html">sistema</a>.</div>';
      return;
    }
    if (!prontos(def.nec)) { tela.innerHTML = '<div class="carregando">Carregando…</div>'; return; }
    tela.innerHTML = '';
    MONTADA = true;
    $('#principal').classList.toggle('com-rodape', !!def.rodape);
    TELA_ATUAL = def.montar(tela, ROTA_ATUAL.args) || {};
  }

  window.addEventListener('hashchange', rotear);
  window.SGFireReady.then(function () { rotear(); });
})();
