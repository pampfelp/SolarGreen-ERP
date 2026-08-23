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
  firebase.firestore().enablePersistence({synchronizeTabs:true}).catch(function(err){
    console.warn('Persistência offline não disponível neste navegador:',err.code);
  });

  // Mesma ideia do painel admin: espera o Firebase Auth confirmar a sessão
  // restaurada antes de qualquer leitura/escrita — senão a checagem de
  // "está logado?" roda antes da sessão terminar de restaurar.
  window.TecnicoFireReady=new Promise(function(resolve){
    var unsub=firebase.auth().onAuthStateChanged(function(user){ unsub(); resolve(user); });
  });
})();
