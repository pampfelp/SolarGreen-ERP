// ════ AUTENTICAÇÃO (SGAuth) ════
(function(){
  var SESSION_KEY='sg_auth_session';
  var SESSION_DURATION_MS=7*24*60*60*1000; // 7 dias
  var DEFAULT_API_URL='https://script.google.com/macros/s/AKfycbzFCy8PyBZBODgA34xrlLTVUUNhKBIlguJT3ectH7Yus-VW1n41GcCclc5q_Yj0Di2O7g/exec';
  var DEFAULT_API_KEY='1234';

  function apiUrl(){ return (localStorage.getItem('ponto_api_url')||'').trim()||DEFAULT_API_URL; }
  function apiKey(){ return (localStorage.getItem('ponto_api_key')||'').trim()||DEFAULT_API_KEY; }

  function authCall(action,payload){
    // Piloto de migração pro Firestore: só essas ações (login tratado à parte,
    // em initLoginScreen) vão pro Firestore — o resto continua no Apps Script
    // de sempre. Ver js/firestore-router.js.
    if(window.SGFireActions&&window.SGFireActions[action]){
      return window.SGFireActions[action](payload||{});
    }
    // Injeta solicitanteId automaticamente a partir de window.SG_SESSION —
    // a MESMA fonte que isAdmin()/filterByOwner()/SGUtil.meuId() já usam
    // (setada uma vez no script de trava no topo do <body>, a partir do
    // localStorage). Antes cada módulo precisava lembrar de mandar isso
    // manualmente em toda chamada, e boa parte esquecia (foi assim que o
    // bug do solicitanteId faltando apareceu em 9 lugares diferentes).
    // "auto" entra ANTES do payload no Object.assign, então quem já manda
    // solicitanteId própria (chamadas já corrigidas manualmente) continua
    // funcionando igual.
    var s=window.SG_SESSION;
    // Nesse piloto, quem está logado tem um uid do Firebase Auth como
    // idVendedor — não é uma linha de verdade na aba Vendedores do Apps
    // Script. Se mandarmos esse uid como solicitanteId pro backend antigo, o
    // Code.gs (linha ~92, isSolicitanteAtivo_) não reconhece o uid, entende
    // que "esse vendedor foi desativado" e devolve sessaoInvalida:true — o
    // que faz o app DESLOGAR SOZINHO (clearSession + reload) alguns segundos
    // depois do login, assim que o aquecimento em segundo plano chama as
    // outras abas ainda não convertidas pro Firestore (Agendamentos, Planos,
    // Relatórios, etc.). Era isso que parecia "os registros somem": não eram
    // clientes/vendas/funil se apagando, era a sessão inteira sendo derrubada
    // por uma checagem do backend antigo que não tem como saber desse uid.
    // Por isso, não mandamos solicitanteId nas chamadas que ainda vão pro
    // Apps Script — só as ações do piloto (Firestore) usam window.SG_SESSION.
    var auto={};
    var body=Object.assign({action:action,chave:apiKey()},auto,payload||{});
    // 'ponto_api_url'/'ponto_api_key' também são usadas pela tela "Conectar
    // por link" (Ponto/Vendas/Funil) pra apontar pra uma planilha própria —
    // se alguém salvar ali um link/chave errado (ou a tela nem devia estar
    // acessível pra essa pessoa), TODA chamada do sistema passa a mandar pra
    // esse endpoint quebrado pra sempre, sem nenhum jeito óbvio de resetar
    // pela interface (foi o que travou funil/agendamentos/clientes/proposta
    // de um vendedor até a gente achar). Se havia uma customização salva e a
    // chamada falhar — erro do servidor, rede fora do ar, ou resposta que
    // nem é JSON (URL customizada simplesmente errada) — descarta a
    // customização e tenta de novo só com o padrão, assim o sistema se
    // autocorrige sozinho em vez de travar pra sempre.
    var custom=!!(localStorage.getItem('ponto_api_url')||localStorage.getItem('ponto_api_key'));
    function tentarComPadrao(){
      localStorage.removeItem('ponto_api_url');
      localStorage.removeItem('ponto_api_key');
      var retryBody=Object.assign({action:action,chave:DEFAULT_API_KEY},auto,payload||{});
      return fetch(DEFAULT_API_URL,{method:'POST',cache:'no-store',body:JSON.stringify(retryBody)}).then(function(r){return r.json();});
    }
    return fetch(apiUrl(),{method:'POST',cache:'no-store',body:JSON.stringify(body)}).then(function(r){return r.json();}).then(function(resp){
      if(resp&&resp.ok===false&&custom)return tentarComPadrao();
      return resp;
    }).catch(function(err){
      if(custom)return tentarComPadrao();
      throw err;
    });
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
  // Funções com acesso total ao sistema. Mantenha isso em sincronia com
  // ADMIN_ROLES no Code.gs.
  var SG_ADMIN_ROLES=['admin','administrador','ceo','gestor','gerente'];
  function isAdmin(){
    var s=window.SG_SESSION;
    if(!s) return false;
    var t=(s.tipo||'').trim().toLowerCase();
    return SG_ADMIN_ROLES.indexOf(t)!==-1;
  }

  // Filtra uma lista de objetos vindos da API pelo IdVendedor/Funcionario do usuário logado,
  // a menos que ele seja Admin. Usado pelas telas de Ponto/Vendas/Funil.
  function filterByOwner(list,field){
    var s=window.SG_SESSION;
    if(!s||isAdmin()) return list||[];
    var meId=String(s.idVendedor);
    return (list||[]).filter(function(o){ return String(o[field])===meId; });
  }

  window.SGAuth={ getSession:getSession, isAdmin:isAdmin, filterByOwner:filterByOwner, apiCall:authCall };

  // Cache local por aba: guarda a última resposta boa de cada tela no
  // localStorage, pra trocar de aba mostrar os dados na hora (sem "Conectando…")
  // enquanto busca uma versão atualizada em segundo plano, sem travar nada.
  // TTL do cache local: 12h. Sem isso, se a busca "de verdade" falhar
  // silenciosamente por qualquer motivo, a tela ficava presa mostrando dados
  // antigos pra sempre (ex: cliente sem endereço mesmo já tendo sido
  // corrigido na planilha há dias) — sem nenhum aviso de que era cache velho.
  var SG_CACHE_TTL_MS=12*60*60*1000;
  window.SGCache={
    get:function(chave){
      try{
        var raw=localStorage.getItem('sg_cache_'+chave);
        if(!raw)return null;
        var parsed=JSON.parse(raw);
        if(parsed&&parsed.ts&&(Date.now()-parsed.ts)>SG_CACHE_TTL_MS)return null; // cache velho demais — trata como se não existisse
        return parsed;
      }catch(e){ return null; }
    },
    set:function(chave,dados){
      try{ localStorage.setItem('sg_cache_'+chave,JSON.stringify({ts:Date.now(),dados:dados})); }
      catch(e){ /* localStorage cheio/indisponível — não é crítico, só não guarda cache dessa vez */ }
    }
  };

  /**
   * Resolve uma condição de corrida real: uma tela busca dado (cache-first,
   * depois confirma com o servidor em segundo plano). Se, ENQUANTO essa
   * busca ainda está no ar, a pessoa criar/editar/excluir algo (otimista —
   * já aparece na hora), e DEPOIS a busca antiga (que começou antes dessa
   * edição) finalmente responder, ela reescreve a lista inteira com um
   * retrato de ANTES da edição — e o que a pessoa acabou de fazer some da
   * tela, mesmo já tendo sido salvo direitinho no servidor.
   *
   * Cada tela pega sua PRÓPRIA "época" (window.SGEpoca.criar()) — não é
   * compartilhada entre telas, uma edição em Vendas não deve fazer o Funil
   * descartar a resposta dele à toa. Uso: cada edição otimista chama
   * epoca.marcar(); toda busca guarda epoca.atual() antes de disparar o
   * fetch, e ao aplicar a resposta, só sobrescreve a tela se a época não
   * tiver mudado nesse meio tempo — senão, só atualiza o cache (pro próximo
   * carregamento já vir certo) e deixa a tela como está, com a edição
   * recente intacta.
   */
  window.SGEpoca={
    criar:function(){
      var contador=0;
      return{ marcar:function(){ contador++; }, atual:function(){ return contador; } };
    }
  };

  // Combo de busca reutilizável: qualquer módulo pode transformar um
  // input+hidden+dropdown numa caixa "digita pra filtrar, clica pra
  // escolher", com botão opcional de "+ Adicionar" pra criar uma opção
  // nova na hora sem sair do formulário.
  // Gera um ID no mesmo formato do servidor (8 caracteres) — é isso que
  // permite criar um registro OTIMISTA: a tela já sabe o ID final antes
  // mesmo do servidor confirmar, então dá pra atualizar a lista na hora,
  // sem esperar a viagem de ida e volta pro Apps Script.
  window.SGId={
    gerar:function(){
      if(window.crypto&&window.crypto.randomUUID)return window.crypto.randomUUID().replace(/-/g,'').substring(0,8);
      var s='';
      for(var i=0;i<8;i++)s+=Math.floor(Math.random()*16).toString(16);
      return s;
    }
  };

  // Toast genérico reaproveitado por qualquer módulo pra avisos rápidos
  // (usado principalmente quando uma alteração otimista precisa ser desfeita).
  window.SGToast={
    mostrar:function(texto,erro){
      var el=document.getElementById('sg-toast-global');
      if(!el){
        el=document.createElement('div');
        el.id='sg-toast-global';
        el.style.cssText='position:fixed;left:14px;right:14px;bottom:14px;max-width:420px;margin:0 auto;background:#003122;color:#fff;padding:13px 16px;border-radius:11px;font-size:13px;z-index:300;box-shadow:0 10px 30px rgba(0,0,0,.3);transition:opacity .2s;opacity:0;';
        document.body.appendChild(el);
      }
      el.style.background=erro?'#dc2626':'#003122';
      el.textContent=texto;
      el.style.opacity='1';
      clearTimeout(el._t);
      el._t=setTimeout(function(){ el.style.opacity='0'; },3200);
    }
  };

  /**
   * Indicador global de sincronização (bolinha no canto superior direito).
   * Diferente do padrão com onSnapshot/hasPendingWrites (documentado em
   * segundo-cerebro/padroes/javascript-patterns.md) — esse piloto do
   * Firestore usa leitura/escrita "de uma vez" (get/set), não listener em
   * tempo real, então em vez de escutar hasPendingWrites, cada escrita
   * (js/firestore-router.js) avisa aqui quando começa e quando termina.
   * Mesma ideia, mesmo resultado visual: verde = tudo confirmado pelo
   * servidor; amarelo com número = quantas escritas ainda estão em voo.
   * Clicar na bolinha abre o painel com o que está pendente.
   */
  window.SGSync=(function(){
    var pendentes={}; // id -> {coleção, resumo}
    var proximoId=1;

    function badge(){ return document.getElementById('sg-sync-badge'); }
    function texto(){ return document.getElementById('sg-sync-text'); }

    function renderPainel(){
      var corpo=document.getElementById('sg-sync-panel-body');
      if(!corpo)return;
      var ids=Object.keys(pendentes);
      if(!ids.length){ corpo.innerHTML='<div class="empty">Nada pendente.</div>'; return; }
      corpo.innerHTML=ids.map(function(id){
        var p=pendentes[id];
        return '<div class="item"><span class="col">'+escapeHtmlSync(p.colecao)+'</span><span>'+escapeHtmlSync(p.resumo)+'</span></div>';
      }).join('');
    }
    function escapeHtmlSync(s){ var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }

    function render(){
      var b=badge(); if(!b)return;
      if(!window.SG_SESSION){ b.style.display='none'; return; }
      var n=Object.keys(pendentes).length;
      b.style.display='flex';
      if(n>0){ b.classList.add('pending'); texto().textContent=n+' pendente'+(n>1?'s':''); }
      else{ b.classList.remove('pending'); texto().textContent='Sincronizado'; }
      renderPainel();
    }

    function iniciar(colecao,resumo){
      var id=proximoId++;
      pendentes[id]={colecao:colecao,resumo:resumo};
      render();
      return id;
    }
    function concluir(id){
      delete pendentes[id];
      render();
    }

    document.addEventListener('DOMContentLoaded',function(){
      var b=badge();
      if(b)b.addEventListener('click',function(){ document.getElementById('sg-sync-panel').classList.toggle('active'); });
      render();
    });

    return {iniciar:iniciar,concluir:concluir};
  })();

  /**
   * Painel de VISUALIZAÇÃO compartilhado por todas as telas com tabelas de
   * linhas clicáveis. Clicar numa linha abre esse painel (somente leitura,
   * sem nada editável); o botão de lápis no topo é que abre o formulário de
   * edição de verdade — e o de lixeira exclui direto, sem precisar entrar
   * no formulário. Cada módulo só passa o HTML de exibição e os callbacks.
   */
  window.SGViewPanel=(function(){
    function fechar(){
      var p=document.getElementById('viewDetalhe'),b=document.getElementById('adBackdrop');
      if(p)p.classList.remove('active');
      if(b)b.classList.remove('active');
    }
    function abrir(config){
      var painel=document.getElementById('viewDetalhe');
      if(!painel)return;
      document.getElementById('vw-title').textContent=(config&&config.titulo)||'Detalhes';
      document.getElementById('vw-body').innerHTML=(config&&config.html)||'';
      var editBtn=document.getElementById('vw-editarBtn');
      var trashBtn=document.getElementById('vw-excluirBtn');
      editBtn.style.display=(config&&config.onEditar)?'flex':'none';
      trashBtn.style.display=(config&&config.onExcluir)?'flex':'none';
      editBtn.onclick=function(){ fechar(); if(config&&config.onEditar)config.onEditar(); };
      trashBtn.onclick=function(){ if(config&&config.onExcluir)config.onExcluir(); };
      document.getElementById('vw-fecharBtn').onclick=fechar;
      document.getElementById('adBackdrop').onclick=fechar;
      document.getElementById('adBackdrop').classList.add('active');
      painel.classList.add('active');
      if(config&&config.onAbrir)config.onAbrir();
    }
    return {abrir:abrir,fechar:fechar};
  })();

  // Erro de "não encontrado" numa EXCLUSÃO não é uma falha de verdade — significa
  // que o registro já não existe (foi excluído antes, ou nunca existiu direito
  // por causa de algum descompasso passado). Nesse caso o resultado desejado
  // (não existir mais) já está garantido, então não faz sentido desfazer.
  window.SGUtil={
    ehNaoEncontrado:function(erro){ return !!(erro&&/n[aã]o encontrad[oa]/i.test(String(erro))); },
    // Pega só os dígitos do telefone (ignora hífen, espaço, parênteses, +55…)
    // e devolve os últimos 8 — é o "miolo" do número, sem DDD nem 9 na frente,
    // que costuma ser igual mesmo quando a pessoa digita o número de formas
    // diferentes ("91 98765-4321" vs "5591987654321" vs "98765-4321").
    ultimos8DigitosTelefone:function(tel){
      var digitos=String(tel||'').replace(/\D/g,'');
      return digitos.length>=8?digitos.slice(-8):null; // menos de 8 dígitos não é telefone válido pra comparar
    },
    // Procura, numa lista de clientes, se já existe alguém com os mesmos
    // últimos 8 dígitos de telefone. idClienteIgnorar exclui o próprio
    // registro (necessário ao EDITAR um cliente já existente).
    encontrarClienteMesmoTelefone:function(telefone,listaClientes,idClienteIgnorar){
      var alvo=window.SGUtil.ultimos8DigitosTelefone(telefone);
      if(!alvo)return null;
      for(var i=0;i<listaClientes.length;i++){
        var c=listaClientes[i];
        if(idClienteIgnorar&&String(c.IdCliente)===String(idClienteIgnorar))continue;
        if(window.SGUtil.ultimos8DigitosTelefone(c.Telefone)===alvo)return c;
      }
      return null;
    },

    /**
     * Formatters/parsers compartilhados — antes cada um dos ~14 módulos da
     * tela tinha sua PRÓPRIA cópia dessas mesmas funções (é por isso que o
     * bug do solicitanteId conseguiu se esconder em 9 lugares diferentes).
     * Migração módulo a módulo: ver plano em .claude/plans — cada módulo
     * troca sua cópia local por SGUtil.* e apaga a própria, um de cada vez.
     */
    escapeHtml:function(s){ var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; },
    // Convenção de sinal do módulo Vendas ("-R$ 1.234,56") — corrige de propósito
    // o bug do Funil, cuja cópia local faz Math.abs() e perde o sinal negativo.
    fmtMoney:function(n){
      var v;
      if(typeof n==='string'){ v = n.indexOf(',')!==-1 ? parseFloat(n.replace(/\./g,'').replace(',','.'))||0 : parseFloat(n)||0; }
      else v = parseFloat(n)||0;
      var sinal = v<0?'-':'';
      return sinal+'R$ '+Math.abs(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    },
    parseBRDate:function(str){
      if(!str)return null; str=String(str).trim();
      var m=str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if(m)return new Date(+m[3],+m[2]-1,+m[1]);
      var d=new Date(str.substring(0,10)); return isNaN(d)?null:d;
    },
    parseBRNumber:function(v){
      if(v===''||v===null||v===undefined)return 0;
      if(typeof v==='number')return v;
      var s=String(v).trim().replace(/R\$\s?/g,'');
      if(s.indexOf(',')!==-1)s=s.replace(/\./g,'').replace(',','.');
      var n=parseFloat(s); return isNaN(n)?0:n;
    },
    dateKey:function(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); },
    fmtDateBR:function(d){ return d?(String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear()):'—'; },
    meuId:function(){ return window.SG_SESSION&&window.SG_SESSION.idVendedor; },
    souAdmin:function(){ return !!(window.SGAuth&&window.SGAuth.isAdmin()); }
  };

  // Cache de "quem pode ver o quê" — carregado uma vez por sessão (uma
  // chamada leve e cacheada no servidor) e consultado toda vez que o menu
  // lateral decide o que mostrar. Administradores nunca passam por essa
  // checagem — sempre veem tudo, não importa o que a matriz diga.
  window.SGPermissoes=(function(){
    var carregado=false, tela2tipo={}; // chave: tipo+'|'+tela -> true/false

    function chave(tipo,telaChave){ return tipo+'|'+telaChave; }

    function carregar(){
      if(window.SGAuth&&window.SGAuth.isAdmin()){ carregado=true; return Promise.resolve(); }
      if(!window.SG_SESSION||!window.SGAuth)return Promise.resolve();
      return window.SGAuth.apiCall('getPermissoesData',{}).then(function(resp){
        if(resp&&resp.ok){
          tela2tipo={};
          (resp.permissoes||[]).forEach(function(p){ tela2tipo[chave(p.tipo,p.tela)]=p.permitido; });
        }
        carregado=true;
        aplicarNoMenu();
      }).catch(function(){ carregado=true; }); // se falhar, segue com o padrão (tudo liberado) — nunca trava o login
    }

    function podeVer(telaChave){
      if(window.SGAuth&&window.SGAuth.isAdmin())return true;
      if(!window.SG_SESSION)return true;
      var tipo=window.SG_SESSION.tipo||'';
      var v=tela2tipo[chave(tipo,telaChave)];
      return v===undefined?true:v; // padrão: liberado, se não houver registro explícito
    }

    return {
      carregar:carregar,
      podeVer:podeVer,
      carregado:function(){ return carregado; },
      definirCache:function(telasIgnored,tiposIgnored,mapa){ tela2tipo=mapa||{}; aplicarNoMenu(); },
      aplicarNoMenu:aplicarNoMenu
    };

    // Esconde do menu (e tira do ar, se estiver aberta) qualquer tela que o
    // cargo da pessoa não pode ver. Administradores nunca passam por aqui.
    function aplicarNoMenu(){
      if(window.SGAuth&&window.SGAuth.isAdmin())return;
      var TELAS=['dashboard','ponto','vendas','funil','clientes','agendamentos','planos','relatorios','custosvenda','servicos'];
      var atual=localStorage.getItem('sg_active_view')||'ponto';
      var escondeuAtual=false;
      TELAS.forEach(function(t){
        if(!podeVer(t)){
          var nav=document.getElementById('nav-'+t);
          var view=document.getElementById('view-'+t);
          if(nav)nav.style.display='none';
          if(view)view.classList.remove('active');
          if(atual===t)escondeuAtual=true;
        }
      });
      if(escondeuAtual&&window.SGControllerSwitchTo){
        var primeiraVisivel=TELAS.filter(function(t){return podeVer(t);})[0]||'ponto';
        window.SGControllerSwitchTo(primeiraVisivel);
      }
    }
  })();

  window.SGCombo={
    criar:function(config){
      var input=document.getElementById(config.inputId);
      var hidden=document.getElementById(config.hiddenId);
      var dropdown=document.getElementById(config.dropdownId);
      if(!input||!hidden||!dropdown)return null;

      function escapeHtmlCombo(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}

      if(config.valorInicial){ hidden.value=config.valorInicial.id||''; input.value=config.valorInicial.label||''; }
      else{ hidden.value=''; input.value=''; }

      function render(filtro){
        var termo=(filtro||'').trim().toLowerCase();
        var todas=config.getOpcoes()||[];
        var lista=todas.filter(function(o){ return !termo||String(o.label||'').toLowerCase().indexOf(termo)!==-1; }).slice(0,60);
        if(!lista.length){
          dropdown.innerHTML='<div class="combo-empty">Nenhuma opção encontrada.</div>';
        }else{
          dropdown.innerHTML=lista.map(function(o){
            return '<div class="combo-item" data-id="'+escapeHtmlCombo(o.id)+'" data-label="'+escapeHtmlCombo(o.label)+'">'+escapeHtmlCombo(o.label)+'</div>';
          }).join('');
        }
        dropdown.classList.remove('hidden');
        dropdown.querySelectorAll('.combo-item').forEach(function(item){
          item.addEventListener('mousedown',function(e){
            e.preventDefault();
            var id=item.getAttribute('data-id'),label=item.getAttribute('data-label');
            hidden.value=id; input.value=label;
            dropdown.classList.add('hidden');
            if(config.onSelecionar)config.onSelecionar(id,label);
          });
        });
      }

      if(!input.dataset.comboWired){
        input.dataset.comboWired='1';
        input.addEventListener('input',function(){ hidden.value=''; render(input.value); });
        input.addEventListener('focus',function(){ render(input.value); });
        input.addEventListener('blur',function(){ setTimeout(function(){ dropdown.classList.add('hidden'); },150); });
      }

      if(config.addBtnId&&config.onAdicionar){
        var addBtn=document.getElementById(config.addBtnId);
        if(addBtn&&!addBtn.dataset.comboWired){
          addBtn.dataset.comboWired='1';
          addBtn.addEventListener('click',config.onAdicionar);
        }
      }

      return {
        setValor:function(id,label){ hidden.value=id||''; input.value=label||''; }
      };
    }
  };

  function showMsg(elId,texto,tipo){
    var el=document.getElementById(elId);
    el.className='sg-login-msg'+(tipo?' '+tipo:'');
    el.textContent=texto||'';
  }
  function goStep(id){
    document.querySelectorAll('#sg-login-screen .sg-step').forEach(function(s){s.classList.remove('active');});
    document.getElementById(id).classList.add('active');
    ['sg-login-msg','sg-esqueci-msg','sg-redefinir-msg','sg-primeiro-msg'].forEach(function(m){showMsg(m,'');});
  }

  function paintUserChip(){
    var s=getSession();
    if(!s) return;
    document.getElementById('sg-user-name').textContent=s.nome||s.email;
    document.getElementById('sg-user-role').textContent=isAdmin()?'Administrador':(s.tipo||'Usuário');
  }

  function initLoginScreen(){
    var pendingPrimeiroAcesso=null; // {usuario, senhaAtual} enquanto aguarda criação da senha própria

    var loginBtn=document.getElementById('sg-login-btn');
    loginBtn.addEventListener('click',function(){
      var email=document.getElementById('sg-login-email').value.trim();
      var senha=document.getElementById('sg-login-senha').value;
      if(!email||!senha){ showMsg('sg-login-msg','Preencha e-mail e senha.','error'); return; }
      loginBtn.disabled=true; loginBtn.textContent='Entrando…';
      // Piloto de migração: login agora é Firebase Auth (e-mail/senha), não mais
      // o Apps Script. O registro em vendedores/{uid} guarda nome/tipo — se for
      // o primeiro login desse usuário (uid sem registro ainda), cria como admin
      // automaticamente (só faz sentido porque, nesse piloto, quem tem acesso ao
      // Firebase Auth do projeto já é de confiança).
      firebase.auth().signInWithEmailAndPassword(email,senha).then(function(cred){
        var uid=cred.user.uid;
        var ref=firebase.firestore().collection('vendedores').doc(uid);
        return ref.get().then(function(doc){
          if(doc.exists)return doc.data();
          var novo={IdVendedor:uid,Nome:(cred.user.email||'').split('@')[0],Email:cred.user.email||email,Tipo:'admin',Status:'Ativo'};
          return ref.set(novo).then(function(){ return novo; });
        });
      }).then(function(dados){
        loginBtn.disabled=false; loginBtn.textContent='Entrar';
        setSession({idVendedor:dados.IdVendedor,nome:dados.Nome,email:dados.Email,tipo:dados.Tipo});
        location.reload();
      }).catch(function(err){
        loginBtn.disabled=false; loginBtn.textContent='Entrar';
        showMsg('sg-login-msg','Não foi possível entrar: '+(err.message||err.code||err),'error');
      });
    });
    document.getElementById('sg-login-senha').addEventListener('keydown',function(e){ if(e.key==='Enter') loginBtn.click(); });

    var primeiroBtn=document.getElementById('sg-primeiro-btn');
    primeiroBtn.addEventListener('click',function(){
      if(!pendingPrimeiroAcesso){ goStep('sg-step-login'); return; }
      var s1=document.getElementById('sg-primeiro-senha1').value;
      var s2=document.getElementById('sg-primeiro-senha2').value;
      if(!s1||!s2){ showMsg('sg-primeiro-msg','Preencha os dois campos.','error'); return; }
      if(s1!==s2){ showMsg('sg-primeiro-msg','As senhas não coincidem.','error'); return; }
      if(s1.length<6){ showMsg('sg-primeiro-msg','A senha deve ter pelo menos 6 caracteres.','error'); return; }
      primeiroBtn.disabled=true; primeiroBtn.textContent='Salvando…';
      authCall('trocarSenha',{idVendedor:pendingPrimeiroAcesso.usuario.idVendedor,senhaAtual:pendingPrimeiroAcesso.senhaAtual,novaSenha:s1}).then(function(resp){
        primeiroBtn.disabled=false; primeiroBtn.textContent='Salvar e entrar';
        if(!resp||!resp.ok){ showMsg('sg-primeiro-msg',(resp&&resp.erro)||'Não foi possível salvar a senha.','error'); return; }
        setSession(pendingPrimeiroAcesso.usuario);
        pendingPrimeiroAcesso=null;
        location.reload();
      }).catch(function(err){
        primeiroBtn.disabled=false; primeiroBtn.textContent='Salvar e entrar';
        showMsg('sg-primeiro-msg','Erro de conexão: '+err.message,'error');
      });
    });

    document.getElementById('sg-go-esqueci').addEventListener('click',function(){
      document.getElementById('sg-esqueci-email').value=document.getElementById('sg-login-email').value.trim();
      goStep('sg-step-esqueci');
    });
    document.getElementById('sg-back-login-1').addEventListener('click',function(){ goStep('sg-step-login'); });
    document.getElementById('sg-back-login-2').addEventListener('click',function(){ goStep('sg-step-login'); });

    var esqueciBtn=document.getElementById('sg-esqueci-btn');
    esqueciBtn.addEventListener('click',function(){
      var email=document.getElementById('sg-esqueci-email').value.trim();
      if(!email){ showMsg('sg-esqueci-msg','Informe seu e-mail.','error'); return; }
      esqueciBtn.disabled=true; esqueciBtn.textContent='Enviando…';
      authCall('esqueciSenha',{email:email}).then(function(resp){
        esqueciBtn.disabled=false; esqueciBtn.textContent='Enviar código';
        if(!resp||!resp.ok){ showMsg('sg-esqueci-msg',(resp&&resp.erro)||'Não foi possível enviar o código.','error'); return; }
        document.getElementById('sg-redefinir-token').value='';
        document.getElementById('sg-redefinir-senha1').value='';
        document.getElementById('sg-redefinir-senha2').value='';
        goStep('sg-step-redefinir');
        showMsg('sg-redefinir-msg','Código enviado! Confira seu e-mail (e a caixa de spam).','success');
        document.getElementById('sg-step-redefinir').dataset.email=email;
      }).catch(function(err){
        esqueciBtn.disabled=false; esqueciBtn.textContent='Enviar código';
        showMsg('sg-esqueci-msg','Erro de conexão: '+err.message,'error');
      });
    });

    var redefinirBtn=document.getElementById('sg-redefinir-btn');
    redefinirBtn.addEventListener('click',function(){
      var email=document.getElementById('sg-step-redefinir').dataset.email||document.getElementById('sg-esqueci-email').value.trim();
      var token=document.getElementById('sg-redefinir-token').value.trim();
      var s1=document.getElementById('sg-redefinir-senha1').value;
      var s2=document.getElementById('sg-redefinir-senha2').value;
      if(!token||!s1||!s2){ showMsg('sg-redefinir-msg','Preencha o código e a nova senha.','error'); return; }
      if(s1!==s2){ showMsg('sg-redefinir-msg','As senhas não coincidem.','error'); return; }
      if(s1.length<6){ showMsg('sg-redefinir-msg','A senha deve ter pelo menos 6 caracteres.','error'); return; }
      redefinirBtn.disabled=true; redefinirBtn.textContent='Salvando…';
      authCall('redefinirSenha',{email:email,token:token,novaSenha:s1}).then(function(resp){
        redefinirBtn.disabled=false; redefinirBtn.textContent='Salvar nova senha';
        if(!resp||!resp.ok){ showMsg('sg-redefinir-msg',(resp&&resp.erro)||'Não foi possível redefinir a senha.','error'); return; }
        document.getElementById('sg-login-email').value=email;
        document.getElementById('sg-login-senha').value='';
        goStep('sg-step-login');
        showMsg('sg-login-msg','Senha criada! Faça login com a nova senha.','success');
      }).catch(function(err){
        redefinirBtn.disabled=false; redefinirBtn.textContent='Salvar nova senha';
        showMsg('sg-redefinir-msg','Erro de conexão: '+err.message,'error');
      });
    });
  }

  function initLoggedUI(){
    paintUserChip();
    document.getElementById('sg-logout-btn').addEventListener('click',function(){
      clearSession();
      location.reload();
    });
    var navUsuarios=document.getElementById('nav-usuarios');
    if(navUsuarios&&isAdmin()) navUsuarios.style.display='';
    var navPermissoes=document.getElementById('nav-permissoes');
    if(navPermissoes&&isAdmin()) navPermissoes.style.display='';
    var navMetas=document.getElementById('nav-metas');
    if(navMetas&&isAdmin()) navMetas.style.display='';
    var navCustoRecorrente=document.getElementById('nav-custorecorrente');
    if(navCustoRecorrente&&isAdmin()) navCustoRecorrente.style.display='';
    if(window.SGPermissoes)window.SGPermissoes.carregar();
    aquecerAbasEmSegundoPlano();
  }

  /**
   * Ponto e Vendas já carregam de cara (não são "preguiçosas"). Todas as
   * outras abas só buscam dado da planilha na primeira vez que a pessoa
   * clica nelas — por isso a PRIMEIRA visita a qualquer aba é lenta, e só
   * fica rápida da segunda vez em diante (quando o cache local já existe).
   *
   * Essa função chama o init() de cada uma dessas abas sozinha, por trás,
   * pouco depois do login — assim, quando a pessoa realmente clicar numa
   * aba, o cache já vai estar quente e a troca é instantânea, igual já
   * acontecia da segunda visita em diante.
   *
   * Cada init() já contém sua própria trava de admin (as abas administrativas
   * simplesmente não fazem nada se quem estiver logado não for admin) e sua
   * própria trava de "já inicializei" (não constrói a tela de novo se a
   * pessoa já tiver clicado nela antes desse aquecimento rodar).
   *
   * As chamadas são espalhadas no tempo (não todas de uma vez) pra não
   * sobrecarregar o Apps Script com várias execuções simultâneas — ele lida
   * mal com um monte de pedidos ao mesmo tempo vindos da mesma sessão.
   */
  function aquecerAbasEmSegundoPlano(){
    var modulos=[
      'dashboardApp','funilApp','agendamentosApp','clientesApp','planosApp','relatoriosApp',
      'custosVendaApp','metasApp','custoRecorrenteApp','servicosApp',
      'usuariosApp','permissoesApp'
    ];
    modulos.forEach(function(nomeModulo,i){
      setTimeout(function(){
        var modulo=window[nomeModulo];
        if(modulo&&typeof modulo.init==='function')modulo.init();
      }, 900+i*450); // primeiro dá espaço pra aba atual e pro Ponto/Vendas carregarem sem concorrência
    });
  }

  document.addEventListener('DOMContentLoaded',function(){
    initLoginScreen();
    if(getSession()){ initLoggedUI(); }
  });
})();

