// ════ NOTIFICAÇÕES DE LEAD DO SITE (2026-10-08) ════
// Sininho no canto direito, popup em pílula quando chega lead e push no
// celular/computador com o ERP fechado.
//
// De onde vem cada aviso: da escuta de `leads_site` que o motor de promoção
// já mantém aberta em toda sessão (js/leads-site.js). Nenhuma leitura nova de
// coleção. Gestão (SGAuth.isAdmin) vê todos os leads, os suspeitos e os que
// deram erro; vendedor vê só os leads que o rodízio passou pra ele.
//
// Lida/não lida fica em `notificacoes_lidas/{idVendedor}`, então ler no
// celular apaga no computador. O push é mandado pelo Apps Script
// (avisarLeadSite) pros aparelhos guardados em `push_tokens`.
//
// Desde 2026-10-26 entra também o disparo de reativação pela API do WhatsApp:
// cada toque no botão ou resposta vira um documento em `interacoes_disparo`
// (gravado pelo Apps Script) e aparece aqui como "Fulano interagiu com o
// disparo", pro vendedor do lead e pra gestão.
//
// Desde 2026-11-05 todo aviso que o Apps Script manda por push (cobrança,
// resposta de cobrança, link pago, OS, e os do supervisor de vendas) também fica
// guardado em `notificacoes/{notifId}` e aparece aqui. Cada pessoa escuta só os
// documentos com o próprio id em `para`. Aviso com `enviarEmMs` no futuro fica
// escondido e aparece sozinho na hora. `resolvidaEm` conta como lido. Lead do
// site e disparo continuam montados das coleções de origem; o documento deles em
// `notificacoes` não entra de novo. Quem quiser um botão no item registra a ação
// com SGNotificacoes.registrarAcao(tipo, {botao, aoClicar}).
(function(){
  // Chave pública do certificado Web Push (Firebase > Configurações do
  // projeto > Cloud Messaging > Certificados push da Web). Vazia, o push fica
  // desligado e o sininho e o popup continuam funcionando.
  var VAPID_KEY='BHzWwgAWuJDgNd5AfwMthRlqu2vmylHO6IRGaO5V0j7sg4GQ4u2GlTnYmFyDpizSIijXalO_xs4ioi40p1O5uEk';

  var DURACAO_POPUP_MS=15000;
  var MAX_POPUPS=5;
  var JANELA_LISTA_MS=30*24*60*60*1000;   // o sininho mostra os últimos 30 dias
  var JANELA_POPUP_MS=24*60*60*1000;      // popup só pra aviso de até 24 h atrás
  var MAX_LISTA=50;
  var ID_RESUMO='supervisor-resumo-';     // popup que junta vários avisos do supervisor
  var KEY_MOSTRADOS='sg_notif_mostrados'; // popups já mostrados neste aparelho
  var KEY_TOKEN='sg_push_token';

  var _iniciado=false, _leads=null, _interacoes=[], _lidas=null, _todas=[], _vendedores={};
  var _notifs=[], _resolvidas={}, _acoes={};   // coleção `notificacoes`, resolvidas por id e ações registradas
  var _mostrados=lerLocal(KEY_MOSTRADOS)||{};
  var _abertos={};   // popups na tela, por id
  var _fila=[];      // popups esperando a aba ficar visível

  function el(id){ return document.getElementById(id); }
  function esc(s){ return window.SGUtil.escapeHtml(s); }
  function db(){ return firebase.firestore(); }
  function meuId(){ return String((window.SG_SESSION||{}).idVendedor||''); }
  function souGestao(){ return !!(window.SGAuth&&window.SGAuth.isAdmin()); }
  function lerLocal(k){ try{ return JSON.parse(localStorage.getItem(k)||'null'); }catch(e){ return null; } }
  function gravarLocal(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){ /* sem storage: só perde a memória do aparelho */ } }

  var ICONE_SINO='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  var ICONE_ALERTA='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  var ICONE_FECHAR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';

  // ── Montagem dos avisos ────────────────────────────────────────────────
  function montar(lista){
    var me=meuId(), gestao=souGestao(), corte=Date.now()-JANELA_LISTA_MS, out=[];
    lista.forEach(function(l){
      var ms=l.criadoEmMs||l.promovidoEmMs||0;
      if(ms<corte)return;
      var base={ms:ms,nome:l.nome||'Sem nome',servico:l.servico||'',cidade:l.cidade||l.calcCidade||'',leadId:l.id};
      if(l.status==='promovido'&&(gestao||String(l.idVendedor)===me)){
        out.push(Object.assign(base,{id:l.id+':lead',tipo:'lead',idOportunidade:l.idOportunidade,idVendedor:l.idVendedor}));
      }else if(gestao&&(l.status==='suspeito'||l.status==='erro')){
        out.push(Object.assign(base,{id:l.id+':'+l.status,tipo:l.status}));
      }
    });
    return out;
  }
  // Interações com o disparo: o vendedor vê as dele, a gestão vê todas.
  function montarDisparo(lista){
    var me=meuId(), gestao=souGestao(), corte=Date.now()-JANELA_LISTA_MS, out=[];
    lista.forEach(function(x){
      if((x.criadoEmMs||0)<corte||!(gestao||String(x.idVendedor)===me))return;
      out.push({id:'disparo:'+x.id,tipo:'disparo',ms:x.criadoEmMs,nome:x.nomeLead||'Lead',acao:x.tipo,texto:x.texto||'',
        segmento:x.segmento||'',idOportunidade:x.idOportunidade,idVendedor:x.idVendedor});
    });
    return out;
  }
  // Avisos da coleção `notificacoes`. Lead e disparo já vêm montados acima.
  // Agendado (enviarEmMs no futuro) fica escondido até a hora; a tela é
  // remontada a cada minuto, então ele aparece sozinho.
  function montarNotificacoes(lista, jaMontados){
    var agora=Date.now(), corte=agora-JANELA_LISTA_MS, out=[], gestao=souGestao();
    _resolvidas={};
    lista.forEach(function(x){
      if(x.tipo==='lead'||x.tipo==='disparo'||jaMontados[x.id])return;
      // Gestão acompanha o supervisor de vendas só na tela Supervisão
      // (js/supervisao.js); o sininho dela fica com o resto (06/11).
      if(gestao&&/^supervisor_/.test(String(x.tipo||'')))return;
      if(x.enviarEmMs&&x.enviarEmMs>agora)return;
      var ms=x.enviarEmMs||x.criadoEmMs||0;
      if(ms<corte)return;
      if(x.resolvidaEm)_resolvidas[x.id]=true;
      out.push({id:x.id,tipo:x.tipo||'aviso',doc:true,ms:ms,titulo:x.titulo||'Aviso',corpo:x.corpo||'',url:x.url||'',acao:x.acao||null});
    });
    return out;
  }
  function recombinar(){
    var base=montar(_leads||[]).concat(montarDisparo(_interacoes)), ids={};
    base.forEach(function(n){ ids[n.id]=true; });
    _todas=base.concat(montarNotificacoes(_notifs,ids)).sort(function(a,b){ return b.ms-a.ms; }).slice(0,MAX_LISTA);
  }

  function ehAtencao(n){ return n.tipo==='suspeito'||n.tipo==='erro'; }
  function titulo(n){
    if(n.doc)return n.titulo;
    if(n.tipo==='suspeito')return 'Contato suspeito no site';
    if(n.tipo==='erro')return 'Contato do site não virou lead';
    if(n.tipo==='disparo')return 'Disparo de reativação';
    return 'Novo lead do site';
  }
  function linhaPrincipal(n){
    if(n.doc)return n.corpo;
    if(n.tipo==='disparo')return n.nome+' interagiu com o disparo';
    return n.nome+(n.servico?' · '+n.servico:'');
  }
  function linhaDetalhe(n){
    if(n.doc)return quando(n.ms);
    var partes=[];
    if(n.tipo==='disparo'){
      partes.push(n.acao==='toque'?'tocou no botão':'"'+n.texto.slice(0,60)+'"');
      if(n.segmento)partes.push(n.segmento);
    }
    if(n.cidade)partes.push(n.cidade);
    partes.push(quando(n.ms));
    if((n.tipo==='lead'||n.tipo==='disparo')&&souGestao())partes.push('para '+((_vendedores[n.idVendedor]||{}).Nome||'vendedor da vez'));
    if(ehAtencao(n))partes.push('abrir Leads do site');
    return partes.join(' · ');
  }
  function quando(ms){
    var d=Date.now()-ms;
    if(d<60000)return 'agora';
    if(d<3600000)return 'há '+Math.floor(d/60000)+' min';
    if(d<86400000)return 'há '+Math.floor(d/3600000)+' h';
    var t=new Date(ms);
    function z(n){ return String(n).padStart(2,'0'); }
    return z(t.getDate())+'/'+z(t.getMonth()+1)+' '+z(t.getHours())+':'+z(t.getMinutes());
  }
  function lida(id){ return !!(_lidas&&_lidas[id])||!!_resolvidas[id]; }
  function acaoRegistrada(n){ return n.acao&&n.acao.tipo&&_acoes[n.acao.tipo]; }

  // ── Lida / não lida (sincronizado entre aparelhos) ────────────────────
  function refLidas(){ return db().collection('notificacoes_lidas').doc(meuId()); }
  function marcarLida(ids){
    var patch={};
    ids.forEach(function(id){ if(!lida(id))patch[id]=Date.now(); });
    if(!Object.keys(patch).length)return;
    _lidas=Object.assign({},_lidas||{},patch);   // otimista: some do contador na hora
    atualizarTela();
    // O mapa só cresce. Passou de 300, regrava só o que ainda aparece na lista.
    var total=Object.keys(_lidas).length;
    var gravar=total>300?refLidas().set({lidas:podar(_lidas),atualizadoEm:Date.now()}):refLidas().set({lidas:patch,atualizadoEm:Date.now()},{merge:true});
    gravar.catch(function(err){ console.error('Notificações: não salvou a leitura',err); });
  }
  // Poda quando passa de 300: fica o que está na lista desta tela e tudo que foi
  // lido nos últimos 30 dias. O documento é o mesmo no ERP e no app do técnico,
  // e cada um mostra avisos diferentes; podar só pela lista de uma tela apagava a
  // leitura da outra, e o aviso voltava como não lido (06/11).
  function podar(lidas){
    var vivos={}, corte=Date.now()-JANELA_LISTA_MS;
    Object.keys(lidas).forEach(function(id){ if(lidas[id]>=corte)vivos[id]=lidas[id]; });
    _todas.forEach(function(n){ if(lidas[n.id])vivos[n.id]=lidas[n.id]; });
    return vivos;
  }

  // ── Tela: sininho e painel ─────────────────────────────────────────────
  function construir(){
    var sino=document.createElement('button');
    sino.type='button'; sino.id='sg-notif-sino'; sino.setAttribute('aria-label','Notificações');
    sino.innerHTML=ICONE_SINO+'<span class="sg-notif-badge" id="sg-notif-badge"></span>';
    var painel=document.createElement('div');
    painel.id='sg-notif-painel';
    painel.innerHTML='<div class="sg-notif-cab"><h4>Notificações</h4><button type="button" id="sg-notif-todas">Marcar todas como lidas</button></div>'+
      '<div id="sg-notif-push"></div><div id="sg-notif-lista"></div>';
    var pilha=document.createElement('div');
    pilha.id='sg-notif-pilha';
    document.body.appendChild(sino); document.body.appendChild(painel); document.body.appendChild(pilha);

    sino.addEventListener('click',function(e){ e.stopPropagation(); painel.classList.toggle('active'); if(painel.classList.contains('active'))renderPush(); });
    document.addEventListener('click',function(e){ if(!painel.contains(e.target)&&e.target!==sino)painel.classList.remove('active'); });
    el('sg-notif-todas').addEventListener('click',function(){ marcarLida(_todas.map(function(n){ return n.id; })); });
    el('sg-notif-lista').addEventListener('click',function(e){
      var item=e.target.closest('[data-notif]');
      if(!item)return;
      painel.classList.remove('active');
      var n=_todas.filter(function(x){ return x.id===item.getAttribute('data-notif'); })[0];
      if(n)abrir(n);
    });
    pilha.addEventListener('click',function(e){
      var pop=e.target.closest('.sg-notif-pop');
      if(!pop)return;
      var id=pop.getAttribute('data-notif');
      if(e.target.closest('.sg-notif-x')){ fecharPopup(id); return; }
      fecharPopup(id);
      // Resumo abre o sininho (sem deixar o clique fora do painel fechá-lo de novo).
      if(id.indexOf(ID_RESUMO)===0){ e.stopPropagation(); abrirSupervisao(); return; }
      var n=_todas.filter(function(x){ return x.id===id; })[0];
      if(n)abrir(n);
    });
    // Push de resumo do supervisor abre o ERP com o sininho aberto.
    if(/[?&]sininho=1(&|$)/.test(location.search)){ painel.classList.add('active'); renderPush(); }
  }

  function atualizarTela(){
    var naoLidas=_todas.filter(function(n){ return !lida(n.id); }).length;
    var badge=el('sg-notif-badge');
    badge.textContent=naoLidas>9?'9+':String(naoLidas);
    badge.style.display=naoLidas?'flex':'none';
    el('sg-notif-todas').style.display=naoLidas?'':'none';
    el('sg-notif-lista').innerHTML=_todas.length?_todas.map(function(n){
      return '<div class="sg-notif-item'+(lida(n.id)?'':' nova')+(ehAtencao(n)?' atencao':'')+'" data-notif="'+esc(n.id)+'">'+
        '<span class="sg-notif-ico">'+(ehAtencao(n)?ICONE_ALERTA:ICONE_SINO)+'</span>'+
        '<div class="sg-notif-txt"><div class="tag">'+esc(titulo(n))+'</div><div class="principal">'+esc(linhaPrincipal(n))+'</div><div class="sub">'+esc(linhaDetalhe(n))+'</div></div>'+
        (acaoRegistrada(n)?'<span class="sg-notif-acao">'+esc(_acoes[n.acao.tipo].botao||'Abrir')+'</span>':'')+'</div>';
    }).join(''):'<div class="sg-notif-vazio">Nenhuma notificação nos últimos 30 dias.</div>';
    // Lido em outro aparelho: o popup daqui some também.
    Object.keys(_abertos).forEach(function(id){ if(lida(id))fecharPopup(id); });
  }

  // ── Popup ──────────────────────────────────────────────────────────────
  function mostrarPopups(){
    if(_lidas===null||_leads===null)return;   // sem saber o que já foi lido, não mostra nada
    var corte=Date.now()-JANELA_POPUP_MS;
    var novos=_todas.filter(function(n){ return n.ms>=corte&&!lida(n.id)&&!_mostrados[n.id]&&!_abertos[n.id]&&!_fila.some(function(f){ return f.id===n.id; }); });
    if(!novos.length)return;
    // Vários avisos do supervisor de uma vez (lembretes das 9h, 13h e 16h,
    // lote das 17h30) viram um popup só; cada um continua no sininho (05/11).
    var doSupervisor=novos.filter(function(n){ return n.doc&&/^supervisor_/.test(n.tipo); });
    if(doSupervisor.length>1){
      var agora=Date.now();
      doSupervisor.forEach(function(n){ _mostrados[n.id]=agora; });
      novos=novos.filter(function(n){ return doSupervisor.indexOf(n)===-1; });
      novos.unshift({id:ID_RESUMO+agora,tipo:'supervisor_resumo',doc:true,ms:agora,titulo:'Supervisor de vendas',corpo:doSupervisor.length+' clientes para chamar. Toque para abrir a lista.',url:''});
    }
    // Mais antigo primeiro, pra o mais novo ficar no topo da pilha.
    novos.slice(0,MAX_POPUPS).reverse().forEach(function(n){ _fila.push(n); });
    esvaziarFila();
  }
  function esvaziarFila(){
    if(document.hidden||!_fila.length)return;
    var lote=_fila.splice(0);
    lote.forEach(abrirPopup);
    tocarSino();
    var agora=Date.now();
    Object.keys(_mostrados).forEach(function(id){ if(agora-_mostrados[id]>JANELA_LISTA_MS)delete _mostrados[id]; });
    gravarLocal(KEY_MOSTRADOS,_mostrados);
  }
  function abrirPopup(n){
    _mostrados[n.id]=Date.now();
    var pilha=el('sg-notif-pilha');
    // Limite de popups na tela: o mais antigo sai, o aviso continua no sininho.
    var ids=Object.keys(_abertos);
    if(ids.length>=MAX_POPUPS)fecharPopup(ids[0]);
    var pop=document.createElement('div');
    pop.className='sg-notif-pop'+(ehAtencao(n)?' atencao':'');
    pop.setAttribute('data-notif',n.id);
    pop.setAttribute('role','status');
    pop.innerHTML='<span class="sg-notif-ico">'+(ehAtencao(n)?ICONE_ALERTA:ICONE_SINO)+'</span>'+
      '<div class="sg-notif-txt"><div class="tag">'+esc(titulo(n))+'</div><div class="principal">'+esc(linhaPrincipal(n))+'</div><div class="sub">'+esc(linhaDetalhe(n))+'</div></div>'+
      '<button type="button" class="sg-notif-x" aria-label="Fechar">'+ICONE_FECHAR+'</button>'+
      '<span class="sg-notif-tempo" style="animation-duration:'+DURACAO_POPUP_MS+'ms"></span>';
    pilha.insertBefore(pop,pilha.firstChild);
    _abertos[n.id]=setTimeout(function(){ fecharPopup(n.id); },DURACAO_POPUP_MS);
  }
  function fecharPopup(id){
    clearTimeout(_abertos[id]);
    delete _abertos[id];
    var pop=el('sg-notif-pilha').querySelector('[data-notif="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]');
    if(pop)pop.remove();
  }
  document.addEventListener('visibilitychange',esvaziarFila);

  // Som de sininho gerado na hora (sem arquivo). O navegador só libera áudio
  // depois do primeiro clique ou toque na página; antes disso, fica mudo.
  var _audio=null;
  function liberarAudio(){
    if(_audio)return;
    var Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return;
    try{ _audio=new Ctx(); }catch(e){ _audio=null; }
  }
  document.addEventListener('pointerdown',liberarAudio,{once:true});
  document.addEventListener('keydown',liberarAudio,{once:true});
  function tocarSino(){
    if(!_audio)return;
    try{
      if(_audio.state==='suspended')_audio.resume();
      var t=_audio.currentTime;
      [[1318.5,0],[1760,0.16]].forEach(function(nota){
        [1,2.76].forEach(function(parcial,i){
          var osc=_audio.createOscillator(), vol=_audio.createGain();
          osc.type='sine';
          osc.frequency.value=nota[0]*parcial;
          vol.gain.setValueAtTime(0.0001,t+nota[1]);
          vol.gain.exponentialRampToValueAtTime(i?0.05:0.22,t+nota[1]+0.01);
          vol.gain.exponentialRampToValueAtTime(0.0001,t+nota[1]+(i?0.5:1.3));
          osc.connect(vol); vol.connect(_audio.destination);
          osc.start(t+nota[1]); osc.stop(t+nota[1]+1.4);
        });
      });
    }catch(e){ /* sem som não impede o aviso */ }
  }

  // ── Abrir o que a notificação aponta ──────────────────────────────────
  function abrir(n){
    marcarLida([n.id]);
    if(acaoRegistrada(n)){
      try{ _acoes[n.acao.tipo].aoClicar(n); }catch(err){ console.error('Notificações: a ação '+n.acao.tipo+' falhou',err); }
      return;
    }
    if(n.doc){ abrirUrl(n.url); return; }
    if(n.tipo==='disparo'){ if(n.idOportunidade)abrirDestino({lead:n.idOportunidade}); return; }
    abrirDestino(n.tipo==='lead'?{lead:n.idOportunidade}:{tela:'leadssite'});
  }
  // Link de aviso do sistema: do próprio ERP vira navegação interna; de fora
  // (wa.me da reserva de cobrança) abre em outra aba.
  function abrirUrl(url){
    if(!url)return;
    var u;
    try{ u=new URL(url,location.href); }catch(e){ return; }
    if(u.origin!==location.origin)window.open(u.href,'_blank','noopener');
    else tratarLink(u.href);
  }
  function abrirDestino(d){
    if(!window.SGControllerSwitchTo)return;
    if(d.lead){
      window.SGControllerSwitchTo('funil');
      if(window.funilApp&&window.funilApp.abrirLead)window.funilApp.abrirLead(d.lead);
    }else if(d.tela==='leadssite'){
      window.SGControllerSwitchTo('leadssite');
    }
  }
  // Clique na notificação do sistema: vem pela URL (ERP estava fechado) ou
  // por mensagem do service worker (ERP já estava aberto).
  function tratarLink(url){
    var p;
    try{ p=new URL(url,location.href).searchParams; }catch(e){ return; }
    if(p.get('notif'))marcarLida([p.get('notif')]);
    if(p.get('lead')||p.get('tela'))abrirDestino({lead:p.get('lead'),tela:p.get('tela')});
    if(p.get('cobranca')&&window.SGCobranca)window.SGCobranca.abrirDaNotificacao(p.get('cobranca'),p.get('msg'));
    if(p.get('cobrancaPlano')&&window.SGCobranca)window.SGCobranca.abrirPlano(p.get('cobrancaPlano'));
    // Push de resumo do supervisor (05/11): com o ERP já aberto, o clique chega
    // por aqui; antes não abria nada.
    if(p.get('supervisao')==='1')abrirSupervisao();
    else if(p.get('sininho')==='1')abrirSininho();
  }
  function abrirSininho(){
    var painel=el('sg-notif-painel');
    if(!painel)return;
    painel.classList.add('active'); renderPush();
  }
  function abrirSupervisao(){
    if(window.SGSupervisao)window.SGSupervisao.abrir(); else abrirSininho();
  }

  // ── Push neste aparelho ────────────────────────────────────────────────
  function ehIOS(){ return /iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1); }
  function instalado(){ return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true; }
  function pushPossivel(){
    return !!(VAPID_KEY&&window.firebase&&firebase.messaging&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window);
  }

  function renderPush(){
    var box=el('sg-notif-push');
    var texto='', botao=false;
    if(!VAPID_KEY){ box.innerHTML=''; return; }
    if(ehIOS()&&!instalado())texto='No iPhone, as notificações só chegam com o ERP instalado na tela de início (Compartilhar, Adicionar à Tela de Início).';
    else if(!pushPossivel())texto='Este navegador não recebe notificações com o ERP fechado.';
    else if(Notification.permission==='denied')texto='As notificações estão bloqueadas neste navegador. Libere nas configurações do site para receber os avisos com o ERP fechado.';
    else if(Notification.permission==='granted'&&lerLocal(KEY_TOKEN))texto='Notificações ligadas neste aparelho.';
    else { texto='Receba o aviso mesmo com o ERP fechado.'; botao=true; }
    box.innerHTML='<div class="sg-notif-push'+(botao?' acao':'')+'"><span>'+esc(texto)+'</span>'+(botao?'<button type="button" id="sg-notif-ativar">Ativar neste aparelho</button>':'')+'</div>';
    if(botao)el('sg-notif-ativar').addEventListener('click',function(){
      this.disabled=true; this.textContent='Ativando';
      // O pedido de permissão precisa sair direto do clique (exigência do iPhone).
      Notification.requestPermission().then(function(perm){
        if(perm==='granted')return registrarAparelho(true);
      }).catch(function(err){
        console.error('Notificações: falha ao ativar',err);
        if(window.SGToast)window.SGToast.mostrar('Não foi possível ativar as notificações: '+(err.message||err),true);
      }).then(renderPush);
    });
  }

  function hash(texto){
    return crypto.subtle.digest('SHA-256',new TextEncoder().encode(texto)).then(function(buf){
      return Array.prototype.map.call(new Uint8Array(buf),function(b){ return b.toString(16).padStart(2,'0'); }).join('').slice(0,40);
    });
  }

  // Guarda o endereço de push deste aparelho em nome de quem está logado. O
  // Firebase troca esse endereço de tempos em tempos, então confere a cada
  // abertura e só grava quando mudou.
  function registrarAparelho(forcar){
    if(!pushPossivel()||Notification.permission!=='granted')return Promise.resolve();
    return navigator.serviceWorker.ready.then(function(reg){
      return firebase.messaging().getToken({vapidKey:VAPID_KEY,serviceWorkerRegistration:reg});
    }).then(function(token){
      if(!token)return;
      var salvo=lerLocal(KEY_TOKEN);
      if(!forcar&&salvo&&salvo.token===token&&salvo.idVendedor===meuId())return;
      return hash(token).then(function(id){
        var antigo=salvo&&salvo.id&&salvo.id!==id?db().collection('push_tokens').doc(salvo.id).delete().catch(function(){}):null;
        return Promise.all([antigo,db().collection('push_tokens').doc(id).set({
          token:token, idVendedor:meuId(), aparelho:navigator.userAgent.slice(0,200), atualizadoEm:Date.now()
        })]).then(function(){ gravarLocal(KEY_TOKEN,{id:id,token:token,idVendedor:meuId()}); });
      });
    }).catch(function(err){ console.error('Notificações: não registrou o aparelho',err); throw err; });
  }

  // Ao sair do ERP, o aparelho para de receber os avisos de quem saiu.
  function esquecerAparelho(){
    var salvo=lerLocal(KEY_TOKEN);
    try{ localStorage.removeItem(KEY_TOKEN); }catch(e){}
    if(!salvo||!salvo.id||!window.firebase)return Promise.resolve();
    var apagar=db().collection('push_tokens').doc(salvo.id).delete().catch(function(){});
    return Promise.race([apagar,new Promise(function(r){ setTimeout(r,1500); })]);
  }

  // ── Início ─────────────────────────────────────────────────────────────
  // ── Ativação obrigatória (2026-11-06) ──────────────────────────────────
  // Pedido do Felipe: sem notificação ligada no aparelho, não dá para mexer no
  // ERP. Uma tela cobre tudo até a permissão sair; só tem Sair como escape.
  // Permissão dada e endereço ainda não registrado não trava (registrarAparelho
  // tenta de novo a cada abertura).
  function situacaoPush(){
    if(!VAPID_KEY)return 'ativo';
    if(ehIOS()&&!instalado())return 'ios';
    if(!pushPossivel())return 'inviavel';
    if(Notification.permission==='denied')return 'bloqueado';
    return Notification.permission==='granted'?'ativo':'ativar';
  }
  var TEXTO_OBRIGATORIO={
    ativar:'Para usar o ERP, ative as notificações neste aparelho. É por elas que chegam os leads, os lembretes de clientes, os pagamentos e as respostas no WhatsApp.',
    ios:'No iPhone, as notificações só funcionam com o ERP instalado na tela de início: toque em Compartilhar, depois em Adicionar à Tela de Início, e abra o ERP pelo ícone novo.',
    bloqueado:'As notificações estão bloqueadas neste navegador. Toque no cadeado ao lado do endereço do site, libere as notificações e depois toque em Já liberei.',
    inviavel:'Este navegador não recebe notificações. Abra o ERP no Chrome para continuar.'
  };
  // Lista liberada (tela Usuários, 2026-11-06): vendedores/{id}.LiberadoNotificacao.
  // Até ler o cadastro, não mostra a trava (null = ainda não sabe).
  var _liberado=null;
  function escutarLiberado(){
    var limite=setTimeout(function(){ if(_liberado===null){ _liberado=false; exigirAtivacao(); } },6000);
    window.SGFireReady.then(function(){
      db().collection('vendedores').where('IdVendedor','==',meuId()).limit(1).onSnapshot(function(snap){
        clearTimeout(limite);
        _liberado=!snap.empty&&!!snap.docs[0].data().LiberadoNotificacao;
        exigirAtivacao();
      },function(err){ clearTimeout(limite); console.error('Notificações: não leu a lista liberada',err); _liberado=false; exigirAtivacao(); });
    });
  }
  function exigirAtivacao(){
    var s=situacaoPush(), ov=el('sg-push-obrig');
    if(_liberado===null)return;
    if(s==='ativo'||_liberado){ if(ov)ov.remove(); return; }
    if(ov)return;
    ov=document.createElement('div');
    ov.id='sg-push-obrig'; ov.className='modal-overlay';
    ov.innerHTML='<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="sg-push-obrig-titulo">'+
      '<h3 id="sg-push-obrig-titulo">Ative as notificações</h3>'+
      '<p class="sg-push-obrig-txt">'+esc(TEXTO_OBRIGATORIO[s])+'</p>'+
      '<p class="sg-push-obrig-erro" id="sg-push-obrig-erro"></p>'+
      '<div class="modal-actions"><button type="button" class="reset-btn" id="sg-push-obrig-sair">Sair</button>'+
      '<button type="button" class="connect-btn" id="sg-push-obrig-ok">'+(s==='ativar'?'Ativar notificações':(s==='bloqueado'?'Já liberei':'Conferir de novo'))+'</button></div></div>';
    document.body.appendChild(ov);
    el('sg-push-obrig-sair').addEventListener('click',function(){ var b=el('sg-logout-btn'); if(b)b.click(); });
    el('sg-push-obrig-ok').addEventListener('click',function(){
      if(s!=='ativar'){ location.reload(); return; }
      var botao=this;
      botao.disabled=true; botao.textContent='Ativando';
      // O pedido de permissão sai direto do clique (exigência do iPhone).
      Notification.requestPermission().then(function(perm){
        if(perm==='granted')return registrarAparelho(true).catch(function(err){ console.error('Notificações: permissão dada, registro fica para depois',err); });
      }).catch(function(err){ console.error('Notificações: falha ao ativar',err); }).then(function(){
        var agora=situacaoPush();
        if(agora==='ativo'){ ov.remove(); renderPush(); if(window.SGToast)window.SGToast.mostrar('Notificações ativadas neste aparelho.'); return; }
        if(agora!==s){ ov.remove(); exigirAtivacao(); return; }   // virou bloqueado: mostra o caminho
        botao.disabled=false; botao.textContent='Ativar notificações';
        el('sg-push-obrig-erro').textContent='A permissão não foi dada. Toque em Ativar notificações e escolha Permitir.';
      });
    });
  }

  function init(){
    if(_iniciado||!window.SG_SESSION||!meuId()||!window.leadsSiteApp||!window.SGUtil)return;
    _iniciado=true;
    construir();
    atualizarTela();
    escutarLiberado();
    // Liberou nas configurações e voltou para a aba: confere sem precisar recarregar.
    document.addEventListener('visibilitychange',function(){ if(!document.hidden)exigirAtivacao(); });
    if(souGestao())window.SGUtil.assinarColecao('vendedores',function(lista){
      _vendedores={}; lista.forEach(function(v){ _vendedores[v.IdVendedor]=v; });
      atualizarTela();
    });
    window.SGFireReady.then(function(){
      refLidas().onSnapshot(function(snap){
        _lidas=(snap.exists&&snap.data().lidas)||{};
        atualizarTela(); mostrarPopups();
      },function(err){ console.error('Notificações: escuta de lidas caiu',err); _lidas=_lidas||{}; mostrarPopups(); });
    });
    // Só as pessoas em `para` e só os últimos 30 dias (índice composto em
    // firestore.indexes.json: para array-contains + criadoEmMs).
    window.SGFireReady.then(function(){
      window.SGUtil.escutarComRetry(function(){
        return db().collection('notificacoes').where('para','array-contains',meuId()).where('criadoEmMs','>=',Date.now()-JANELA_LISTA_MS);
      },function(snap){
        _notifs=[]; snap.forEach(function(doc){ var x=doc.data(); x.id=doc.id; _notifs.push(x); });
        recombinar(); atualizarTela(); mostrarPopups();
      },'notificacoes');
    });
    window.leadsSiteApp.aoAtualizar(function(lista){
      _leads=lista; recombinar();
      atualizarTela(); mostrarPopups();
    });
    // Só os últimos 30 dias: a coleção cresce a cada disparo e o sininho não
    // olha nada mais antigo que isso.
    window.SGUtil.assinarColecao('interacoes_disparo',function(lista){
      _interacoes=lista; recombinar();
      atualizarTela(); mostrarPopups();
    },{chave:'recentes',construirQuery:function(ref){ return ref.where('criadoEmMs','>=',Date.now()-JANELA_LISTA_MS); }});
    window.leadsSiteApp.init();
    // Texto de "há 5 min" envelhece e aviso agendado vence; remonta a cada minuto.
    setInterval(function(){ recombinar(); atualizarTela(); mostrarPopups(); },60000);

    if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',function(e){
      if(e.data&&e.data.tipo==='sg-notif-abrir')tratarLink(e.data.url);
    });
    if(/[?&](lead|tela|notif|cobranca|cobrancaPlano)=/.test(location.search)){
      var url=location.href;
      history.replaceState(null,'',location.pathname+location.hash);
      tratarLink(url);
    }
    registrarAparelho(false).catch(function(){});
  }

  // Quem quer botão no item registra o tipo da ação: o documento traz
  // acao:{tipo,...} e o clique (no item ou no botão) vai para aoClicar(notif),
  // com notif.id, notif.acao, notif.url etc. Sem registro, o clique abre a url.
  function registrarAcao(tipo,config){
    if(!tipo||!config||typeof config.aoClicar!=='function')throw new Error('registrarAcao: informe o tipo e aoClicar');
    _acoes[tipo]={botao:config.botao||'',aoClicar:config.aoClicar};
    if(_iniciado){ atualizarTela(); }
  }

  window.SGNotificacoes={init:init,esquecerAparelho:esquecerAparelho,registrarAcao:registrarAcao};
})();
