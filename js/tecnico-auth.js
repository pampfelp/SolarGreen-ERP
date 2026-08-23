// ════ AUTENTICAÇÃO ════
var SGAuth=(function(){
  var SESSION_KEY='sg_auth_session';
  var SESSION_DURATION_MS=7*24*60*60*1000;
  var DEFAULT_API_URL='https://script.google.com/macros/s/AKfycbzFCy8PyBZBODgA34xrlLTVUUNhKBIlguJT3ectH7Yus-VW1n41GcCclc5q_Yj0Di2O7g/exec';
  var DEFAULT_API_KEY='1234';

  function apiCall(action,payload){
    // Piloto de migração pro Firestore: as ações do app do técnico (lista de
    // OS, checklist, foto, catálogo) vão pro Firestore — login é tratado à
    // parte, no wiring abaixo. O resto (esqueciSenha/redefinirSenha, fora do
    // escopo desse piloto) continua batendo no Apps Script de sempre.
    if(window.TecnicoFireActions&&window.TecnicoFireActions[action]){
      return window.TecnicoFireActions[action](payload||{});
    }
    var body=Object.assign({action:action,chave:DEFAULT_API_KEY},payload||{});
    return fetch(DEFAULT_API_URL,{method:'POST',body:JSON.stringify(body)}).then(function(r){return r.json();});
  }
  function getSession(){
    try{
      var raw=localStorage.getItem(SESSION_KEY);
      var s=raw?JSON.parse(raw):null;
      if(s&&s.idVendedor&&s.expiresAt&&Date.now()<s.expiresAt) return s;
    }catch(e){}
    return null;
  }
  function setSession(usuario){
    var s={idVendedor:usuario.idVendedor,nome:usuario.nome,email:usuario.email,tipo:usuario.tipo||'',expiresAt:Date.now()+SESSION_DURATION_MS};
    localStorage.setItem(SESSION_KEY,JSON.stringify(s));
    return s;
  }
  function clearSession(){ localStorage.removeItem(SESSION_KEY); }

  return {apiCall:apiCall,getSession:getSession,setSession:setSession,clearSession:clearSession};
})();

(function(){
  function showMsg(elId,texto,tipo){
    var el=document.getElementById(elId);
    el.className='msg'+(tipo?' '+tipo:'');
    el.textContent=texto||'';
  }
  function goStep(id){
    document.querySelectorAll('#login-screen .lstep').forEach(function(s){s.classList.remove('active');});
    document.getElementById(id).classList.add('active');
    ['msg-login','msg-esqueci','msg-redefinir','msg-primeiro'].forEach(function(m){showMsg(m,'');});
  }

  var pendingPrimeiro=null;

  var loginBtn=document.getElementById('btn-login');
  loginBtn.addEventListener('click',function(){
    var email=document.getElementById('in-email').value.trim();
    var senha=document.getElementById('in-senha').value;
    if(!email||!senha){ showMsg('msg-login','Preencha e-mail e senha.','error'); return; }
    loginBtn.disabled=true; loginBtn.textContent='Entrando…';
    // Piloto de migração: login agora é Firebase Auth (e-mail/senha), não
    // mais o Apps Script — mesma mudança já feita no painel admin. Primeiro
    // login de um uid novo cria o registro em vendedores/{uid} como
    // "tecnico" (o admin faz o mesmo bootstrap, mas como "admin" — cada
    // app assume o papel de quem normalmente entra por ele nesse piloto).
    firebase.auth().signInWithEmailAndPassword(email,senha).then(function(cred){
      var uid=cred.user.uid;
      var ref=firebase.firestore().collection('vendedores').doc(uid);
      return ref.get().then(function(doc){
        if(doc.exists)return doc.data();
        var novo={IdVendedor:uid,Nome:(cred.user.email||'').split('@')[0],Email:cred.user.email||email,Tipo:'tecnico',Status:'Ativo'};
        return ref.set(novo).then(function(){ return novo; });
      });
    }).then(function(dados){
      loginBtn.disabled=false; loginBtn.textContent='Entrar';
      SGAuth.setSession({idVendedor:dados.IdVendedor,nome:dados.Nome,email:dados.Email,tipo:dados.Tipo});
      location.reload();
    }).catch(function(err){
      loginBtn.disabled=false; loginBtn.textContent='Entrar';
      showMsg('msg-login','Não foi possível entrar: '+(err.message||err.code||err),'error');
    });
  });
  document.getElementById('in-senha').addEventListener('keydown',function(e){ if(e.key==='Enter') loginBtn.click(); });

  var primeiroBtn=document.getElementById('btn-primeiro');
  primeiroBtn.addEventListener('click',function(){
    if(!pendingPrimeiro){ goStep('step-login'); return; }
    var s1=document.getElementById('in-primeiro1').value,s2=document.getElementById('in-primeiro2').value;
    if(!s1||!s2){ showMsg('msg-primeiro','Preencha os dois campos.','error'); return; }
    if(s1!==s2){ showMsg('msg-primeiro','As senhas não coincidem.','error'); return; }
    if(s1.length<6){ showMsg('msg-primeiro','A senha deve ter pelo menos 6 caracteres.','error'); return; }
    primeiroBtn.disabled=true; primeiroBtn.textContent='Salvando…';
    SGAuth.apiCall('trocarSenha',{idVendedor:pendingPrimeiro.usuario.idVendedor,senhaAtual:pendingPrimeiro.senhaAtual,novaSenha:s1}).then(function(resp){
      primeiroBtn.disabled=false; primeiroBtn.textContent='Salvar e entrar';
      if(!resp||!resp.ok){ showMsg('msg-primeiro',(resp&&resp.erro)||'Não foi possível salvar a senha.','error'); return; }
      SGAuth.setSession(pendingPrimeiro.usuario);
      pendingPrimeiro=null;
      location.reload();
    }).catch(function(err){
      primeiroBtn.disabled=false; primeiroBtn.textContent='Salvar e entrar';
      showMsg('msg-primeiro','Erro de conexão: '+err.message,'error');
    });
  });

  document.getElementById('go-esqueci').addEventListener('click',function(){
    document.getElementById('in-esqueci-email').value=document.getElementById('in-email').value.trim();
    goStep('step-esqueci');
  });
  document.getElementById('back-login-1').addEventListener('click',function(){ goStep('step-login'); });
  document.getElementById('back-login-2').addEventListener('click',function(){ goStep('step-login'); });

  var esqueciBtn=document.getElementById('btn-esqueci');
  esqueciBtn.addEventListener('click',function(){
    var email=document.getElementById('in-esqueci-email').value.trim();
    if(!email){ showMsg('msg-esqueci','Informe seu e-mail.','error'); return; }
    esqueciBtn.disabled=true; esqueciBtn.textContent='Enviando…';
    SGAuth.apiCall('esqueciSenha',{email:email}).then(function(resp){
      esqueciBtn.disabled=false; esqueciBtn.textContent='Enviar código';
      if(!resp||!resp.ok){ showMsg('msg-esqueci',(resp&&resp.erro)||'Não foi possível enviar o código.','error'); return; }
      document.getElementById('in-token').value='';
      document.getElementById('in-senha1').value='';
      document.getElementById('in-senha2').value='';
      document.getElementById('step-redefinir').dataset.email=email;
      goStep('step-redefinir');
      showMsg('msg-redefinir','Código enviado! Confira seu e-mail (e o spam).','success');
    }).catch(function(err){
      esqueciBtn.disabled=false; esqueciBtn.textContent='Enviar código';
      showMsg('msg-esqueci','Erro de conexão: '+err.message,'error');
    });
  });

  var redefinirBtn=document.getElementById('btn-redefinir');
  redefinirBtn.addEventListener('click',function(){
    var email=document.getElementById('step-redefinir').dataset.email||document.getElementById('in-esqueci-email').value.trim();
    var token=document.getElementById('in-token').value.trim();
    var s1=document.getElementById('in-senha1').value,s2=document.getElementById('in-senha2').value;
    if(!token||!s1||!s2){ showMsg('msg-redefinir','Preencha o código e a nova senha.','error'); return; }
    if(s1!==s2){ showMsg('msg-redefinir','As senhas não coincidem.','error'); return; }
    if(s1.length<6){ showMsg('msg-redefinir','A senha deve ter pelo menos 6 caracteres.','error'); return; }
    redefinirBtn.disabled=true; redefinirBtn.textContent='Salvando…';
    SGAuth.apiCall('redefinirSenha',{email:email,token:token,novaSenha:s1}).then(function(resp){
      redefinirBtn.disabled=false; redefinirBtn.textContent='Salvar nova senha';
      if(!resp||!resp.ok){ showMsg('msg-redefinir',(resp&&resp.erro)||'Não foi possível redefinir a senha.','error'); return; }
      document.getElementById('in-email').value=email;
      document.getElementById('in-senha').value='';
      goStep('step-login');
      showMsg('msg-login','Senha criada! Faça login com a nova senha.','success');
    }).catch(function(err){
      redefinirBtn.disabled=false; redefinirBtn.textContent='Salvar nova senha';
      showMsg('msg-redefinir','Erro de conexão: '+err.message,'error');
    });
  });

  document.getElementById('btn-logout').addEventListener('click',function(){
    SGAuth.clearSession();
    location.reload();
  });

  // Decide qual tela mostrar ao carregar
  var session=SGAuth.getSession();
  if(session){
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.add('active');
    document.getElementById('userline').textContent=session.nome+(session.tipo?' · '+session.tipo:'');
  }
})();

/**
 * Indicador global de sincronização — mesma variante "contador manual" do
 * painel admin (window.SGSync), copiada aqui como TecnicoSync porque esse
 * HTML é standalone (não carrega js/sg-auth.js). Verde = nada pendente;
 * amarelo com número = quantas escritas ainda estão em voo (relevante de
 * verdade aqui: com o app offline, uma escrita pode ficar pendente por
 * bastante tempo até a conexão voltar — ver tecnico-firebase-init.js).
 */
window.TecnicoSync=(function(){
  var pendentes={}; var proximoId=1;
  function badge(){ return document.getElementById('tec-sync-badge'); }
  function escapeHtmlSync(s){ var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }

  function renderPainel(){
    var corpo=document.getElementById('tec-sync-panel-body');
    if(!corpo)return;
    var ids=Object.keys(pendentes);
    if(!ids.length){ corpo.innerHTML='<div class="empty">Nada pendente.</div>'; return; }
    corpo.innerHTML=ids.map(function(id){
      var p=pendentes[id];
      return '<div class="item"><span class="col">'+escapeHtmlSync(p.colecao)+'</span><span>'+escapeHtmlSync(p.resumo)+'</span></div>';
    }).join('');
  }
  function render(){
    var b=badge(); if(!b)return;
    if(!SGAuth.getSession()){ b.style.display='none'; return; }
    var n=Object.keys(pendentes).length;
    b.style.display='flex';
    if(n>0){ b.classList.add('pending'); b.title=n+' pendente'+(n>1?'s':''); }
    else{ b.classList.remove('pending'); b.title='Sincronizado'; }
    renderPainel();
  }
  function iniciar(colecao,resumo){ var id=proximoId++; pendentes[id]={colecao:colecao,resumo:resumo}; render(); return id; }
  function concluir(id){ delete pendentes[id]; render(); }

  document.addEventListener('DOMContentLoaded',function(){
    var b=badge();
    if(b)b.addEventListener('click',function(){ document.getElementById('tec-sync-panel').classList.toggle('active'); });
    render();
  });

  return {iniciar:iniciar,concluir:concluir};
})();
