// ════ FIREBASE (app do técnico — piloto offline) ════
// Mesmo projeto do painel admin (config pública, não é segredo). Cópia
// própria (não importada de js/firebase-init.js) porque esse HTML é
// standalone, igual já era o padrão desse arquivo pra autenticação.
(function(){
  var firebaseConfig={
    projectId: "solargreen-21313",
    appId: "1:980826142154:web:a7d053312f2ad5c240cb33",
    storageBucket: "solargreen-21313.firebasestorage.app",
    apiKey: "AIzaSyC50rNjz7cd_1_aWDBMuz84QqOFwPRV1aE",
    authDomain: "solargreen-21313.firebaseapp.com",
    messagingSenderId: "980826142154"
  };
  firebase.initializeApp(firebaseConfig);

  // Persistência offline (IndexedDB) — é isso que faz get()/set() continuarem
  // funcionando sem sinal (leitura vem do cache local, escrita fica na fila
  // e sincroniza sozinha quando a conexão voltar). "synchronizeTabs" evita
  // erro "failed-precondition" se o técnico abrir o app em 2 abas ao mesmo
  // tempo — nesse caso, as abas compartilham o mesmo cache local.
  //
  // 2026-09-28: synchronizeTabs desligado, mesma correção do painel admin
  // (js/firebase-init.js, onde está o porquê completo). Resumo: os apps
  // desta pasta são mesma origem, dividem esse IndexedDB, e a negociação de
  // aba primária entre eles dispara o bug aberto do SDK "INTERNAL ASSERTION
  // FAILED", que mata o Firestore da página. Com false, a segunda aba cai no
  // catch abaixo e roda sem cache local — pro técnico, que trabalha com o
  // PWA instalado e uma aba só, na prática não muda nada.
  firebase.firestore().enablePersistence({synchronizeTabs:false}).catch(function(err){
    console.warn('Persistência offline não disponível neste navegador:',err.code);
  });

  // Mesma rede de segurança do painel admin: se o bug do SDK estourar, a
  // instância do Firestore morre até recarregar. No campo isso é pior que no
  // escritório — o técnico preenche o checklist inteiro achando que salvou.
  function firestoreMorreu(){
    if(document.getElementById('sg-fs-morto'))return;
    var barra=document.createElement('div');
    barra.id='sg-fs-morto';
    barra.style.cssText='position:fixed;left:0;right:0;top:0;z-index:2100;background:#dc2626;color:#fff;padding:12px 16px;font-size:13px;line-height:1.45;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;';
    var texto=document.createElement('span');
    texto.textContent='A conexão com o banco travou. Nada que você preencher agora vai salvar — recarregue antes de continuar.';
    var botao=document.createElement('button');
    botao.type='button';
    botao.textContent='Recarregar';
    botao.style.cssText='background:#fff;color:#dc2626;border:0;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;';
    botao.addEventListener('click',function(){ location.reload(); });
    barra.appendChild(texto); barra.appendChild(botao);
    (document.body||document.documentElement).appendChild(barra);
  }
  window.TecnicoFirestoreFatal={
    verificar:function(erro){
      if(erro&&String(erro.message||erro).indexOf('INTERNAL ASSERTION FAILED')!==-1){ firestoreMorreu(); return true; }
      return false;
    }
  };
  window.addEventListener('error',function(e){ window.TecnicoFirestoreFatal.verificar(e.error||e.message); });
  window.addEventListener('unhandledrejection',function(e){ window.TecnicoFirestoreFatal.verificar(e.reason); });

  // Mesma ideia do painel admin: espera o Firebase Auth confirmar a sessão
  // restaurada antes de qualquer leitura/escrita — senão a checagem de
  // "está logado?" roda antes da sessão terminar de restaurar.
  window.TecnicoFireReady=new Promise(function(resolve){
    var unsub=firebase.auth().onAuthStateChanged(function(user){ unsub(); resolve(user); });
  });

  /**
   * Cópia enxuta de SGUtil.escutarComRetry (js/sg-auth.js, painel admin) —
   * esse HTML é standalone e não carrega aquele arquivo. Necessária porque
   * um onSnapshot aberto logo após o login pode nascer com "permission-denied"
   * (o token do Firebase Auth ainda não propagou pra camada de rede) e,
   * diferente de get()/set(), não se recupera sozinho depois.
   */
  window.TecnicoUtil={
    escutarComRetry:function(criarQuery,aoReceber,nomeDebug){
      var parado=false,unsubAtual=null,timer=null,tentativas=0;
      var MAX_TENTATIVAS=4;
      function tentar(){
        if(parado)return;
        tentativas++;
        unsubAtual=criarQuery().onSnapshot(aoReceber,function(err){
          if(parado)return;
          if(err&&err.code==='permission-denied'&&tentativas<MAX_TENTATIVAS){
            timer=setTimeout(tentar,1200*tentativas);
            return;
          }
          console.error('Escuta ao vivo falhou ('+(nomeDebug||'?')+'):',err);
        });
      }
      tentar();
      return function pararEscuta(){ parado=true; if(timer)clearTimeout(timer); if(unsubAtual)unsubAtual(); };
    }
  };
})();
