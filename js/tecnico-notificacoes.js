// ════ NOTIFICAÇÕES DO APP DO TÉCNICO (2026-11-05) ════
// Sininho com os avisos de agendamento (coleção `notificacoes`, onde `para` traz o
// idVendedor do técnico), lido/não lido em `notificacoes_lidas/{idVendedor}` e o
// registro deste aparelho em `push_tokens`, com a mesma chave VAPID do ERP
// (js/notificacoes.js). É o mesmo desenho do ERP, copiado porque este HTML é
// standalone. O id do técnico é o da sessão (SGAuth.getSession().idVendedor), o mesmo
// que o agendamento guarda em TecnicoResponsavel e que o aparelho grava em push_tokens.
(function(){
  var session=SGAuth.getSession();
  if(!session)return; // tela de login já cuida disso

  // Mesma chave pública do ERP (Firebase > Cloud Messaging > Certificados push da Web).
  var VAPID_KEY='BHzWwgAWuJDgNd5AfwMthRlqu2vmylHO6IRGaO5V0j7sg4GQ4u2GlTnYmFyDpizSIijXalO_xs4ioi40p1O5uEk';

  var DURACAO_POPUP_MS=15000;
  var MAX_POPUPS=5;
  var JANELA_LISTA_MS=30*24*60*60*1000;
  var JANELA_POPUP_MS=24*60*60*1000;
  var MAX_LISTA=50;
  // Chaves próprias: o ERP roda na mesma origem e usa sg_push_token e sg_notif_mostrados.
  var KEY_MOSTRADOS='sg_notif_mostrados_tecnico';
  var KEY_TOKEN='sg_push_token_tecnico';
  var TEXTO_ATIVAR='Agora o sistema de técnicos possui notificações de agendamentos. Ative para usar o sistema.';

  var _docs=null, _lidas=null, _todas=[];
  var _mostrados=lerLocal(KEY_MOSTRADOS)||{};
  var _abertos={}, _fila=[];

  function el(id){ return document.getElementById(id); }
  function esc(s){ var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }
  function db(){ return firebase.firestore(); }
  function meuId(){ return String(session.idVendedor||''); }
  function lerLocal(k){ try{ return JSON.parse(localStorage.getItem(k)||'null'); }catch(e){ return null; } }
  function gravarLocal(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){ /* sem storage: só perde a memória do aparelho */ } }
  function aviso(texto,erro){
    var t=el('toast');
    if(!t)return;
    t.textContent=texto; t.className='toast'+(erro?' error':'');
    clearTimeout(t._timer);
    t._timer=setTimeout(function(){ t.classList.add('hidden'); },3200);
  }

  var ICONE_SINO='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  var ICONE_ALERTA='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  var ICONE_FECHAR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';

  // ── Montagem dos avisos ────────────────────────────────────────────────
  // Aviso agendado para o futuro (enviarEmMs) só aparece na hora; resolvido sai da contagem.
  function montar(docs){
    var agora=Date.now(), corte=agora-JANELA_LISTA_MS, me=meuId(), out=[];
    docs.forEach(function(d){
      var ms=d.criadoEmMs||0;
      if(ms<corte||(d.enviarEmMs&&d.enviarEmMs>agora)||!(d.para||[]).some(function(p){ return String(p)===me; }))return;
      out.push({id:d.id,ms:d.enviarEmMs||ms,titulo:d.titulo||'Aviso',corpo:d.corpo||'',url:d.url||'',tipo:d.tipo||'',resolvida:!!d.resolvidaEm});
    });
    return out.sort(function(a,b){ return b.ms-a.ms; }).slice(0,MAX_LISTA);
  }
  function recombinar(){ _todas=montar(_docs||[]); }
  function ehAtencao(n){ return n.titulo==='Cancelado'; }
  function quando(ms){
    var d=Date.now()-ms;
    if(d<60000)return 'agora';
    if(d<3600000)return 'há '+Math.floor(d/60000)+' min';
    if(d<86400000)return 'há '+Math.floor(d/3600000)+' h';
    var t=new Date(ms);
    function z(n){ return String(n).padStart(2,'0'); }
    return z(t.getDate())+'/'+z(t.getMonth()+1)+' '+z(t.getHours())+':'+z(t.getMinutes());
  }
  function lida(n){ return !!(n.resolvida||(_lidas&&_lidas[n.id])); }

  // ── Lida / não lida (sincronizado entre aparelhos) ────────────────────
  function refLidas(){ return db().collection('notificacoes_lidas').doc(meuId()); }
  function marcarLida(ids){
    var patch={};
    ids.forEach(function(id){ if(!(_lidas&&_lidas[id]))patch[id]=Date.now(); });
    if(!Object.keys(patch).length)return;
    _lidas=Object.assign({},_lidas||{},patch);
    atualizarTela();
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
    sino.type='button'; sino.id='sg-notif-sino'; sino.className='icon-btn'; sino.setAttribute('aria-label','Notificações'); sino.title='Notificações';
    sino.innerHTML=ICONE_SINO+'<span class="sg-notif-badge" id="sg-notif-badge"></span>';
    var acoes=document.querySelector('.topbar-actions');
    acoes.insertBefore(sino,acoes.firstChild);
    var painel=document.createElement('div');
    painel.id='sg-notif-painel';
    painel.innerHTML='<div class="sg-notif-cab"><h4>Notificações</h4><button type="button" id="sg-notif-todas">Marcar todas como lidas</button></div>'+
      '<div id="sg-notif-push"></div><div id="sg-notif-lista"></div>';
    var pilha=document.createElement('div');
    pilha.id='sg-notif-pilha';
    document.body.appendChild(painel); document.body.appendChild(pilha);

    sino.addEventListener('click',function(e){ e.stopPropagation(); painel.classList.toggle('active'); if(painel.classList.contains('active'))renderPush(); });
    document.addEventListener('click',function(e){ if(!painel.contains(e.target)&&!sino.contains(e.target))painel.classList.remove('active'); });
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
      fecharPopup(id);
      if(e.target.closest('.sg-notif-x'))return;
      var n=_todas.filter(function(x){ return x.id===id; })[0];
      if(n)abrir(n);
    });
  }

  function itemHtml(n){
    return '<span class="sg-notif-ico">'+(ehAtencao(n)?ICONE_ALERTA:ICONE_SINO)+'</span>'+
      '<div class="sg-notif-txt"><div class="tag">'+esc(n.titulo)+'</div><div class="principal">'+esc(n.corpo)+'</div><div class="sub">'+esc(quando(n.ms))+'</div></div>';
  }
  function atualizarTela(){
    var naoLidas=_todas.filter(function(n){ return !lida(n); }).length;
    var badge=el('sg-notif-badge');
    badge.textContent=naoLidas>9?'9+':String(naoLidas);
    badge.style.display=naoLidas?'flex':'none';
    el('sg-notif-todas').style.display=naoLidas?'':'none';
    el('sg-notif-lista').innerHTML=_todas.length?_todas.map(function(n){
      return '<div class="sg-notif-item'+(lida(n)?'':' nova')+(ehAtencao(n)?' atencao':'')+'" data-notif="'+esc(n.id)+'">'+itemHtml(n)+'</div>';
    }).join(''):'<div class="sg-notif-vazio">Nenhuma notificação nos últimos 30 dias.</div>';
    Object.keys(_abertos).forEach(function(id){
      var n=_todas.filter(function(x){ return x.id===id; })[0];
      if(!n||lida(n))fecharPopup(id);
    });
  }

  // ── Popup ──────────────────────────────────────────────────────────────
  function mostrarPopups(){
    if(_lidas===null||_docs===null)return;   // sem saber o que já foi lido, não mostra nada
    var corte=Date.now()-JANELA_POPUP_MS;
    var novos=_todas.filter(function(n){ return n.ms>=corte&&!lida(n)&&!_mostrados[n.id]&&!_abertos[n.id]&&!_fila.some(function(f){ return f.id===n.id; }); });
    if(!novos.length)return;
    novos.slice(0,MAX_POPUPS).reverse().forEach(function(n){ _fila.push(n); });
    esvaziarFila();
  }
  function esvaziarFila(){
    if(document.hidden||!_fila.length)return;
    _fila.splice(0).forEach(abrirPopup);
    var agora=Date.now();
    Object.keys(_mostrados).forEach(function(id){ if(agora-_mostrados[id]>JANELA_LISTA_MS)delete _mostrados[id]; });
    gravarLocal(KEY_MOSTRADOS,_mostrados);
  }
  function abrirPopup(n){
    _mostrados[n.id]=Date.now();
    var ids=Object.keys(_abertos);
    if(ids.length>=MAX_POPUPS)fecharPopup(ids[0]);
    var pop=document.createElement('div');
    pop.className='sg-notif-pop'+(ehAtencao(n)?' atencao':'');
    pop.setAttribute('data-notif',n.id);
    pop.setAttribute('role','status');
    pop.innerHTML=itemHtml(n)+'<button type="button" class="sg-notif-x" aria-label="Fechar">'+ICONE_FECHAR+'</button>'+
      '<span class="sg-notif-tempo" style="animation-duration:'+DURACAO_POPUP_MS+'ms"></span>';
    el('sg-notif-pilha').insertBefore(pop,el('sg-notif-pilha').firstChild);
    _abertos[n.id]=setTimeout(function(){ fecharPopup(n.id); },DURACAO_POPUP_MS);
  }
  function fecharPopup(id){
    clearTimeout(_abertos[id]);
    delete _abertos[id];
    var pop=el('sg-notif-pilha').querySelector('[data-notif="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]');
    if(pop)pop.remove();
  }
  document.addEventListener('visibilitychange',esvaziarFila);

  // ── Abrir o agendamento que o aviso aponta ────────────────────────────
  function abrir(n){
    marcarLida([n.id]);
    abrirLink(n.url);
  }
  // O app abre antes de a lista de OS chegar; tenta por alguns segundos.
  function abrirAgendamento(id,tentativa){
    tentativa=tentativa||0;
    if(window.TecnicoApp&&window.TecnicoApp.abrirAgendamento(id))return;
    if(tentativa<12)setTimeout(function(){ abrirAgendamento(id,tentativa+1); },700);
    else aviso('Esta ordem de serviço não está mais na sua lista.',true);
  }
  function abrirLink(url){
    var p;
    try{ p=new URL(url||'',location.href).searchParams; }catch(e){ return; }
    if(p.get('notif'))marcarLida([p.get('notif')]);
    if(p.get('agendamento'))abrirAgendamento(p.get('agendamento'));
  }

  // ── Push neste aparelho ────────────────────────────────────────────────
  function ehIOS(){ return /iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1); }
  function instalado(){ return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true; }
  function pushPossivel(){
    return !!(VAPID_KEY&&window.firebase&&firebase.messaging&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window);
  }
  function ativoAqui(){
    var salvo=lerLocal(KEY_TOKEN);
    return pushPossivel()&&Notification.permission==='granted'&&!!(salvo&&salvo.token&&salvo.idVendedor===meuId());
  }
  // Situação do aparelho: 'ativo', 'ios' (sem o app instalado), 'inviavel' (navegador sem
  // push), 'bloqueado' (permissão negada) ou 'ativar' (falta pedir a permissão).
  function situacao(){
    if(!VAPID_KEY)return 'inviavel';
    if(ehIOS()&&!instalado())return 'ios';
    if(!pushPossivel())return 'inviavel';
    if(Notification.permission==='denied')return 'bloqueado';
    return ativoAqui()?'ativo':'ativar';
  }
  var TEXTO_SITUACAO={
    ios:'No iPhone, as notificações só chegam com o app instalado na tela de início (Compartilhar, Adicionar à Tela de Início).',
    inviavel:'Este navegador não recebe notificações com o app fechado.',
    bloqueado:'As notificações estão bloqueadas neste aparelho. Libere nas configurações do site para receber os avisos com o app fechado.'
  };

  function renderPush(){
    var box=el('sg-notif-push'), s=situacao();
    if(!VAPID_KEY){ box.innerHTML=''; return; }
    var texto=s==='ativo'?'Notificações ligadas neste aparelho.':(TEXTO_SITUACAO[s]||'Receba o aviso de agendamento mesmo com o app fechado.');
    var botao=s==='ativar';
    box.innerHTML='<div class="sg-notif-push'+(botao?' acao':'')+'"><span>'+esc(texto)+'</span>'+(botao?'<button type="button" id="sg-notif-ativar">Ativar neste aparelho</button>':'')+'</div>';
    if(botao)el('sg-notif-ativar').addEventListener('click',function(){ ativar(this,renderPush); });
  }

  // O pedido de permissão sai direto do clique (exigência do iPhone): nada de async antes.
  function ativar(botao,depois){
    botao.disabled=true; botao.textContent='Ativando';
    var ok=false;
    Notification.requestPermission().then(function(perm){
      if(perm==='granted')return registrarAparelho(true).then(function(){ ok=true; });
    }).catch(function(err){
      console.error('Notificações: falha ao ativar',err);
    }).then(function(){ depois(ok); });
  }

  function hash(texto){
    return crypto.subtle.digest('SHA-256',new TextEncoder().encode(texto)).then(function(buf){
      return Array.prototype.map.call(new Uint8Array(buf),function(b){ return b.toString(16).padStart(2,'0'); }).join('').slice(0,40);
    });
  }

  // Guarda o endereço de push deste aparelho em nome do técnico. O Firebase troca esse
  // endereço de tempos em tempos, então confere a cada abertura e só grava quando mudou.
  function registrarAparelho(forcar){
    if(!pushPossivel()||Notification.permission!=='granted')return Promise.resolve();
    var pronto=navigator.serviceWorker.ready;
    var limite=new Promise(function(_,rej){ setTimeout(function(){ rej(new Error('O app ainda não terminou de instalar. Tente de novo em instantes.')); },10000); });
    return Promise.race([pronto,limite]).then(function(reg){
      return firebase.messaging().getToken({vapidKey:VAPID_KEY,serviceWorkerRegistration:reg});
    }).then(function(token){
      if(!token)throw new Error('O Firebase não devolveu o endereço de push.');
      var salvo=lerLocal(KEY_TOKEN);
      if(!forcar&&salvo&&salvo.token===token&&salvo.idVendedor===meuId())return;
      return window.TecnicoFireReady.then(function(){ return hash(token); }).then(function(id){
        var antigo=salvo&&salvo.id&&salvo.id!==id?db().collection('push_tokens').doc(salvo.id).delete().catch(function(){}):null;
        return Promise.all([antigo,db().collection('push_tokens').doc(id).set({
          token:token, idVendedor:meuId(), aparelho:navigator.userAgent.slice(0,200), atualizadoEm:Date.now()
        })]).then(function(){ gravarLocal(KEY_TOKEN,{id:id,token:token,idVendedor:meuId()}); });
      });
    }).catch(function(err){ console.error('Notificações: não registrou o aparelho',err); throw err; });
  }

  // Ao sair do app, o aparelho para de receber os avisos de quem saiu.
  function esquecerAparelho(){
    var salvo=lerLocal(KEY_TOKEN);
    try{ localStorage.removeItem(KEY_TOKEN); }catch(e){}
    if(!salvo||!salvo.id||!window.firebase)return Promise.resolve();
    var apagar=db().collection('push_tokens').doc(salvo.id).delete().catch(function(){});
    return Promise.race([apagar,new Promise(function(r){ setTimeout(r,1500); })]);
  }

  // ── Diálogo de ativação (obrigatório desde 2026-11-06) ─────────────────
  // Pedido do Felipe: sem notificação ligada no aparelho, o app não deixa
  // trabalhar. A tela cobre o app até a permissão sair; não tem "Agora não".
  // Permissão já dada e só o registro do endereço pendente não trava (o
  // registro tenta de novo em silêncio). Sem internet no campo também não
  // trava: o pedido precisa de rede e o técnico precisa trabalhar offline.
  // Lista liberada (tela Usuários do ERP, 2026-11-06): vendedores/{id}.LiberadoNotificacao.
  // null = ainda não leu o cadastro; a trava espera.
  var _liberado=null;
  function escutarLiberado(){
    var limite=setTimeout(function(){ if(_liberado===null){ _liberado=false; dialogoAtivacao(); } },6000);
    window.TecnicoFireReady.then(function(){
      db().collection('vendedores').where('IdVendedor','==',meuId()).limit(1).onSnapshot(function(snap){
        clearTimeout(limite);
        _liberado=!snap.empty&&!!snap.docs[0].data().LiberadoNotificacao;
        if(_liberado){ var ov=el('notif-ativar-overlay'); if(ov)ov.remove(); } else dialogoAtivacao();
      },function(err){ clearTimeout(limite); console.error('Notificações: não leu a lista liberada',err); _liberado=false; dialogoAtivacao(); });
    });
  }
  function precisaAtivar(){
    var s=situacao();
    if(_liberado!==false)return false;
    if(s==='ativo')return false;
    if(pushPossivel()&&Notification.permission==='granted')return false;
    if(s==='ativar'&&navigator.onLine===false)return false;
    return true;
  }
  var TEXTO_BOTAO={ ativar:'Ativar', bloqueado:'Já liberei', ios:'Conferir de novo', inviavel:'Conferir de novo' };
  function dialogoAtivacao(){
    var s=situacao();
    if(!precisaAtivar()||el('notif-ativar-overlay'))return;
    var ov=document.createElement('div');
    ov.id='notif-ativar-overlay'; ov.className='sheet-overlay notif-obrigatorio';
    ov.innerHTML='<div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="notif-ativar-titulo">'+
      '<h3 id="notif-ativar-titulo">Notificações de agendamentos</h3>'+
      '<p class="notif-ativar-txt">'+esc(TEXTO_ATIVAR)+'</p>'+
      (TEXTO_SITUACAO[s]?'<p class="notif-ativar-txt">'+esc(TEXTO_SITUACAO[s])+'</p>':'')+
      '<div class="notif-ativar-erro" id="notif-ativar-erro"></div>'+
      '<div class="sheet-actions">'+
        '<button type="button" class="btn-limpar" id="notif-ativar-sair">Sair</button>'+
        '<button type="button" class="btn-aplicar" id="notif-ativar-ok">'+TEXTO_BOTAO[s]+'</button>'+
      '</div></div>';
    document.body.appendChild(ov);
    function fechar(){ ov.remove(); }
    // Sair pelo mesmo botão do topo (esquece o aparelho e volta ao login).
    el('notif-ativar-sair').addEventListener('click',function(){ var b=el('btn-logout'); if(b)b.click(); });
    // Bloqueado, iPhone sem instalar ou navegador sem push: a pessoa resolve fora
    // do app e confere de novo (recarregar relê a permissão).
    if(s!=='ativar')el('notif-ativar-ok').addEventListener('click',function(){ location.reload(); });
    if(s==='ativar')el('notif-ativar-ok').addEventListener('click',function(){
      var botao=this;
      ativar(botao,function(ok){
        if(ok){ fechar(); renderPush(); aviso('Notificações ativadas neste aparelho.'); return; }
        // Permissão dada mas o endereço não registrou (rede): libera; o registro tenta de novo depois.
        if(!precisaAtivar()){ fechar(); renderPush(); return; }
        if(situacao()==='bloqueado'){ fechar(); renderPush(); dialogoAtivacao(); return; }
        botao.disabled=false; botao.textContent='Ativar';
        el('notif-ativar-erro').textContent='Não foi possível ativar agora. Confira a conexão e tente de novo.';
      });
    });
  }

  // ── Início ─────────────────────────────────────────────────────────────
  function escutarAvisos(simples,tentativa){
    var q=db().collection('notificacoes').where('para','array-contains',meuId());
    // Com o índice (para + criadoEmMs) lê só os últimos 30 dias; sem ele, lê tudo do
    // técnico e filtra na tela.
    if(!simples)q=q.where('criadoEmMs','>=',Date.now()-JANELA_LISTA_MS);
    q.onSnapshot(function(snap){
      _docs=[]; snap.forEach(function(d){ _docs.push(Object.assign({id:d.id},d.data())); });
      recombinar(); atualizarTela(); mostrarPopups();
    },function(err){
      if(err&&err.code==='failed-precondition'&&!simples){ escutarAvisos(true,0); return; }
      if(err&&err.code==='permission-denied'&&(tentativa||0)<3){
        setTimeout(function(){ escutarAvisos(simples,(tentativa||0)+1); },1200*((tentativa||0)+1));
        return;
      }
      console.error('Notificações: escuta de avisos caiu',err);
      _docs=_docs||[]; recombinar(); atualizarTela(); mostrarPopups();
    });
  }

  function iniciar(){
    construir();
    recombinar(); atualizarTela();
    window.TecnicoFireReady.then(function(){
      refLidas().onSnapshot(function(snap){
        _lidas=(snap.exists&&snap.data().lidas)||{};
        atualizarTela(); mostrarPopups();
      },function(err){ console.error('Notificações: escuta de lidas caiu',err); _lidas=_lidas||{}; mostrarPopups(); });
      escutarAvisos(false,0);
    });
    setInterval(function(){ recombinar(); atualizarTela(); mostrarPopups(); },60000);

    if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',function(e){
      if(e.data&&e.data.tipo==='sg-notif-abrir')abrirLink(e.data.url);
    });
    // Clique na notificação do sistema com o app fechado: o endereço traz ?agendamento=.
    if(/[?&](agendamento|notif)=/.test(location.search)){
      var url=location.href;
      history.replaceState(null,'',location.pathname+location.hash);
      abrirLink(url);
    }
    registrarAparelho(false).catch(function(){}).then(escutarLiberado);
    // Voltou a internet no campo: agora a ativação pode sair.
    window.addEventListener('online',dialogoAtivacao);
  }

  window.TecnicoNotificacoes={esquecerAparelho:esquecerAparelho};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);
  else iniciar();
})();
