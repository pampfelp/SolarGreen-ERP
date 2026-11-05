// ════ SUPERVISÃO (2026-11-05) ════
// Botão "Supervisão" ao lado do sininho, com os clientes de hoje do
// supervisor de vendas (avisos supervisor_* da coleção `notificacoes`).
//
//   Vendedor: a lista dele, com Enviar (abre o WhatsApp com a mensagem da
//     etapa, pelo js/supervisor.js) e Marcar data. É para onde leva o push de
//     resumo (index.html?supervisao=1).
//   Gestão: além da própria lista, um bloco por vendedor com feitos e
//     pendentes do dia. A cópia do resumo (push "Supervisão: Fulano") leva
//     para cá, sem passar pelo sininho dela (pedido do Felipe, 05/11).
//
// Feito = o aviso tem resolvidaEm (o vendedor enviou, marcou data ou o lead
// saiu do supervisor). Contato marcado para mais tarde aparece com a hora.
(function(){
  var TIPOS=/^supervisor_(contato|lembrete|pergunta)$/;
  var MOSTRAR=8;   // linhas antes do "Ver todos"

  var _iniciado=false, _itens=[], _vendedores={}, _cancelar=null, _dia='', _abertos={}, _clicados={};

  function R(){ return window.SupervisorRegras; }
  function el(id){ return document.getElementById(id); }
  function meuId(){ return String((window.SG_SESSION||{}).idVendedor||''); }
  function souGestao(){ return !!(window.SGAuth&&window.SGAuth.isAdmin()); }
  function esc(s){ return window.SGUtil&&window.SGUtil.escapeHtml?window.SGUtil.escapeHtml(s):String(s==null?'':s); }
  function hora(ms){ try{ return new Date(ms).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Belem'}); }catch(e){ return ''; } }

  var ICONE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';

  // ── Dados ──
  function situacao(n){
    if(n.resolvidaEm||_clicados[n.id])return 'feito';
    if(n.enviarEmMs&&n.enviarEmMs>Date.now())return 'depois';
    return 'pendente';
  }
  function ordem(n){ return {pendente:0,depois:1,feito:2}[situacao(n)]; }
  function ordenar(lista){
    return lista.slice().sort(function(a,b){
      return ordem(a)-ordem(b)||((a.enviarEmMs||a.criadoEmMs||0)-(b.enviarEmMs||b.criadoEmMs||0));
    });
  }
  function contar(lista){
    var c={total:lista.length,feito:0,pendente:0,depois:0};
    lista.forEach(function(n){ c[situacao(n)]++; });
    return c;
  }
  function meus(){ var me=meuId(); return _itens.filter(function(n){ return n.para.indexOf(me)!==-1; }); }
  function porVendedor(){
    var me=meuId(), grupos={};
    _itens.forEach(function(n){
      var id=n.para[0];
      if(!id||id===me)return;
      (grupos[id]=grupos[id]||[]).push(n);
    });
    return grupos;
  }

  function escutar(){
    if(_cancelar){ try{ _cancelar(); }catch(e){} _cancelar=null; }
    _dia=R().chaveDia(Date.now());
    var inicio=R().inicioDoDia(Date.now()), gestao=souGestao();
    _cancelar=window.SGUtil.escutarComRetry(function(){
      var q=firebase.firestore().collection('notificacoes');
      // Gestão lê os avisos do dia de todos (filtro de tipo aqui, sem índice novo);
      // o vendedor, só os dele, pelo mesmo índice do sininho.
      return gestao?q.where('criadoEmMs','>=',inicio):q.where('para','array-contains',meuId()).where('criadoEmMs','>=',inicio);
    },function(snap){
      var lista=[];
      snap.forEach(function(doc){
        var x=doc.data();
        if(!TIPOS.test(String(x.tipo||'')))return;
        lista.push({id:doc.id,tipo:x.tipo,para:(x.para||[]).map(String),titulo:x.titulo||'',corpo:x.corpo||'',
          acao:x.acao||{},resolvidaEm:x.resolvidaEm||null,enviarEmMs:x.enviarEmMs||null,criadoEmMs:x.criadoEmMs||0});
      });
      _itens=lista;
      Object.keys(_clicados).forEach(function(id){ if(lista.some(function(n){ return n.id===id&&n.resolvidaEm; }))delete _clicados[id]; });
      render();
    },'supervisao');
  }

  // ── Tela ──
  function rotulo(n){
    var a=n.acao||{}, etapa=a.etapa||'';
    if(n.tipo==='supervisor_contato')return 'Contato marcado'+(n.enviarEmMs?' para '+hora(n.enviarEmMs):'')+(etapa?' · '+etapa:'');
    if(n.tipo==='supervisor_pergunta')return 'Falta marcar a próxima data';
    return (etapa?etapa+' · ':'')+'prazo vencido';
  }
  function nome(n){ return (n.acao&&n.acao.nome)||String(n.titulo||'').replace(/ está sem próximo contato$/,'').replace(/^Falar com | hoje$/g,'')||'Cliente'; }
  function direita(n,comBotao){
    var s=situacao(n);
    if(s==='feito')return '<span class="sg-sup-feito">'+(n.resolvidaEm?'Feito '+hora(n.resolvidaEm):'Enviado')+'</span>';
    if(!comBotao)return s==='depois'?'<span class="sg-sup-hora">Às '+hora(n.enviarEmMs)+'</span>':'<span class="sg-sup-pend">Pendente</span>';
    var texto=n.tipo==='supervisor_pergunta'?'Marcar data':'Enviar';
    return '<button type="button" data-sup-acao="'+esc(n.id)+'">'+texto+'</button>';
  }
  function linhas(lista,chave,comBotao){
    var todos=!!_abertos[chave], vis=todos?lista:lista.slice(0,MOSTRAR);
    var html='<div class="sg-sup-lista">'+vis.map(function(n){
      return '<div class="sg-sup-cli"><div class="quem"><b>'+esc(nome(n))+'</b><span>'+esc(rotulo(n))+'</span></div>'+direita(n,comBotao)+'</div>';
    }).join('')+'</div>';
    if(lista.length>MOSTRAR)html+='<button type="button" class="sg-sup-ver" data-sup-ver="'+esc(chave)+'">'+(todos?'Mostrar menos':'Ver todos os '+lista.length)+'</button>';
    return html;
  }
  function legenda(c){
    var p=[];
    p.push('<span class="sg-sup-feito">'+c.feito+(c.feito===1?' feito':' feitos')+'</span>');
    p.push('<span class="sg-sup-pend">'+c.pendente+(c.pendente===1?' pendente':' pendentes')+'</span>');
    if(c.depois)p.push('<span class="sg-sup-hora">'+c.depois+' mais tarde</span>');
    return p.join(' · ');
  }
  function bloco(titulo,lista,chave,comBotao,aberto){
    var c=contar(lista), pct=c.total?Math.round(100*c.feito/c.total):0;
    return '<div class="sg-sup-bloco"><div class="sg-sup-topo"><span class="sg-sup-nome">'+esc(titulo)+'</span><span class="sg-sup-num">'+c.total+(c.total===1?' cliente':' clientes')+'</span></div>'+
      '<div class="sg-sup-barra"><i style="width:'+pct+'%"></i></div><div class="sg-sup-leg">'+legenda(c)+'</div>'+
      (aberto||_abertos['lista:'+chave]?linhas(ordenar(lista),chave,comBotao):'<button type="button" class="sg-sup-ver" data-sup-lista="'+esc(chave)+'">Ver os clientes</button>')+'</div>';
  }

  function render(){
    if(!_iniciado)return;
    if(_dia&&_dia!==R().chaveDia(Date.now())){ escutar(); return; }
    var mine=meus(), grupos=souGestao()?porVendedor():{}, ids=Object.keys(grupos);
    var badge=contar(mine).pendente;
    if(!mine.length&&ids.length)ids.forEach(function(id){ badge+=contar(grupos[id]).pendente; });
    var b=el('sg-sup-badge');
    b.textContent=badge>99?'99+':String(badge);
    b.style.display=badge?'inline-flex':'none';

    var html='';
    if(mine.length)html+=bloco('Seus clientes de hoje',mine,'meus',true,true);
    ids.sort(function(a,b){ return String((_vendedores[a]||{}).Nome||a).localeCompare(String((_vendedores[b]||{}).Nome||b)); });
    ids.forEach(function(id){ html+=bloco((_vendedores[id]||{}).Nome||'Vendedor',grupos[id],id,false,false); });
    if(!html)html='<div class="sg-sup-vazio">Nenhum cliente do supervisor para hoje.</div>';
    el('sg-sup-conteudo').innerHTML=html;
    el('sg-sup-hora').textContent='Atualizado '+hora(Date.now());
  }

  function abrir(){
    if(!_iniciado)return;
    var notif=el('sg-notif-painel');
    if(notif)notif.classList.remove('active');
    el('sg-sup-painel').classList.add('active');
    render();
  }
  function fechar(){ var p=el('sg-sup-painel'); if(p)p.classList.remove('active'); }

  function acionar(id){
    var n=_itens.filter(function(x){ return x.id===id; })[0];
    if(!n||!window.SGSupervisor)return;
    if(n.tipo==='supervisor_pergunta'){ window.SGSupervisor.perguntar(n); return; }
    // Enviar abre o WhatsApp na hora; marca aqui para não abrir duas vezes enquanto o servidor resolve.
    _clicados[id]=true;
    window.SGSupervisor.enviar(n);
    render();
  }

  function construir(){
    var btn=document.createElement('button');
    btn.type='button'; btn.id='sg-sup-btn'; btn.setAttribute('aria-label','Supervisão');
    btn.innerHTML=ICONE+'<span>Supervisão</span><span class="sg-sup-badge" id="sg-sup-badge"></span>';
    var painel=document.createElement('div');
    painel.id='sg-sup-painel';
    painel.innerHTML='<div class="sg-notif-cab"><h4>Supervisão · hoje</h4><button type="button" id="sg-sup-hora"></button></div><div id="sg-sup-conteudo"></div>';
    document.body.appendChild(btn); document.body.appendChild(painel);
    btn.addEventListener('click',function(e){ e.stopPropagation(); if(painel.classList.contains('active'))fechar(); else abrir(); });
    // O painel se redesenha no clique (Enviar, Ver todos): o alvo some do DOM e
    // não pode contar como clique fora.
    document.addEventListener('click',function(e){ if(e.target.isConnected&&!painel.contains(e.target)&&!btn.contains(e.target))fechar(); });
    painel.addEventListener('click',function(e){
      var acao=e.target.closest('[data-sup-acao]');
      if(acao){ acionar(acao.getAttribute('data-sup-acao')); return; }
      var ver=e.target.closest('[data-sup-ver]');
      if(ver){ var k=ver.getAttribute('data-sup-ver'); _abertos[k]=!_abertos[k]; render(); return; }
      var lista=e.target.closest('[data-sup-lista]');
      if(lista){ _abertos['lista:'+lista.getAttribute('data-sup-lista')]=true; render(); }
    });
  }

  function init(){
    if(_iniciado||!window.SG_SESSION||!meuId()||!window.SGUtil||!R()||!window.SGFireReady)return;
    _iniciado=true;
    construir();
    render();
    if(souGestao())window.SGUtil.assinarColecao('vendedores',function(lista){
      _vendedores={}; lista.forEach(function(v){ _vendedores[String(v.IdVendedor)]=v; });
      render();
    });
    window.SGFireReady.then(escutar);
    // Situação "mais tarde" vira "pendente" com o tempo.
    setInterval(render,60000);
    if(/[?&]supervisao=1(&|$)/.test(location.search))abrir();
  }

  window.SGSupervisao={init:init,abrir:abrir};
})();
