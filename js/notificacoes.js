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
(function(){
  // Chave pública do certificado Web Push (Firebase > Configurações do
  // projeto > Cloud Messaging > Certificados push da Web). Vazia, o push fica
  // desligado e o sininho e o popup continuam funcionando.
  var VAPID_KEY='';

  var DURACAO_POPUP_MS=15000;
  var MAX_POPUPS=5;
  var JANELA_LISTA_MS=30*24*60*60*1000;   // o sininho mostra os últimos 30 dias
  var JANELA_POPUP_MS=24*60*60*1000;      // popup só pra aviso de até 24 h atrás
  var MAX_LISTA=50;
  var KEY_MOSTRADOS='sg_notif_mostrados'; // popups já mostrados neste aparelho
  var KEY_TOKEN='sg_push_token';

  var _iniciado=false, _leads=null, _lidas=null, _todas=[], _vendedores={};
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
    return out.sort(function(a,b){ return b.ms-a.ms; }).slice(0,MAX_LISTA);
  }

  function titulo(n){
    if(n.tipo==='suspeito')return 'Contato suspeito no site';
    if(n.tipo==='erro')return 'Contato do site não virou lead';
    return 'Novo lead do site';
  }
  function linhaPrincipal(n){ return n.nome+(n.servico?' · '+n.servico:''); }
  function linhaDetalhe(n){
    var partes=[];
    if(n.cidade)partes.push(n.cidade);
    partes.push(quando(n.ms));
    if(n.tipo==='lead'&&souGestao())partes.push('para '+((_vendedores[n.idVendedor]||{}).Nome||'vendedor da vez'));
    if(n.tipo!=='lead')partes.push('abrir Leads do site');
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
  function lida(id){ return !!(_lidas&&_lidas[id]); }

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
  function podar(lidas){
    var vivos={}; _todas.forEach(function(n){ if(lidas[n.id])vivos[n.id]=lidas[n.id]; });
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
      var n=_todas.filter(function(x){ return x.id===id; })[0];
      if(n)abrir(n);
    });
  }

  function atualizarTela(){
    var naoLidas=_todas.filter(function(n){ return !lida(n.id); }).length;
    var badge=el('sg-notif-badge');
    badge.textContent=naoLidas>9?'9+':String(naoLidas);
    badge.style.display=naoLidas?'flex':'none';
    el('sg-notif-todas').style.display=naoLidas?'':'none';
    el('sg-notif-lista').innerHTML=_todas.length?_todas.map(function(n){
      return '<div class="sg-notif-item'+(lida(n.id)?'':' nova')+(n.tipo!=='lead'?' atencao':'')+'" data-notif="'+esc(n.id)+'">'+
        '<span class="sg-notif-ico">'+(n.tipo==='lead'?ICONE_SINO:ICONE_ALERTA)+'</span>'+
        '<div class="sg-notif-txt"><div class="tag">'+esc(titulo(n))+'</div><div class="principal">'+esc(linhaPrincipal(n))+'</div><div class="sub">'+esc(linhaDetalhe(n))+'</div></div></div>';
    }).join(''):'<div class="sg-notif-vazio">Nenhum lead do site nos últimos 30 dias.</div>';
    // Lido em outro aparelho: o popup daqui some também.
    Object.keys(_abertos).forEach(function(id){ if(lida(id))fecharPopup(id); });
  }

  // ── Popup ──────────────────────────────────────────────────────────────
  function mostrarPopups(){
    if(_lidas===null||_leads===null)return;   // sem saber o que já foi lido, não mostra nada
    var corte=Date.now()-JANELA_POPUP_MS;
    var novos=_todas.filter(function(n){ return n.ms>=corte&&!lida(n.id)&&!_mostrados[n.id]&&!_abertos[n.id]&&!_fila.some(function(f){ return f.id===n.id; }); });
    if(!novos.length)return;
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
    pop.className='sg-notif-pop'+(n.tipo!=='lead'?' atencao':'');
    pop.setAttribute('data-notif',n.id);
    pop.setAttribute('role','status');
    pop.innerHTML='<span class="sg-notif-ico">'+(n.tipo==='lead'?ICONE_SINO:ICONE_ALERTA)+'</span>'+
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
    abrirDestino(n.tipo==='lead'?{lead:n.idOportunidade}:{tela:'leadssite'});
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
  function init(){
    if(_iniciado||!window.SG_SESSION||!meuId()||!window.leadsSiteApp||!window.SGUtil)return;
    _iniciado=true;
    construir();
    atualizarTela();
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
    window.leadsSiteApp.aoAtualizar(function(lista){
      _leads=lista; _todas=montar(lista);
      atualizarTela(); mostrarPopups();
    });
    window.leadsSiteApp.init();
    // Texto de "há 5 min" envelhece; redesenha a cada minuto.
    setInterval(atualizarTela,60000);

    if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',function(e){
      if(e.data&&e.data.tipo==='sg-notif-abrir')tratarLink(e.data.url);
    });
    if(/[?&](lead|tela|notif)=/.test(location.search)){
      var url=location.href;
      history.replaceState(null,'',location.pathname+location.hash);
      tratarLink(url);
    }
    registrarAparelho(false).catch(function(){});
  }

  window.SGNotificacoes={init:init,esquecerAparelho:esquecerAparelho};
})();
