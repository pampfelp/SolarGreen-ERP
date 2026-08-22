// ════ FIREBASE (piloto: login + clientes + vendas + funil no Firestore) ════
// Config pública do projeto Firebase "SolarGreen" — não é segredo, pode ficar
// no código-fonte (a segurança de verdade fica nas firestore.rules).
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

  // O Firebase Auth restaura a sessão salva (IndexedDB) de forma ASSÍNCRONA
  // depois do initializeApp — se o Firestore for chamado antes disso (ex: a
  // tela de Clientes carregando os dados logo após o F5), request.auth ainda
  // está null nas rules e a chamada volta "Missing or insufficient
  // permissions", mesmo a pessoa estando logada de verdade. Esse Promise só
  // resolve depois do PRIMEIRO onAuthStateChanged (usuário restaurado, ou
  // null se ninguém estava logado) — o router do Firestore espera por ele
  // antes de qualquer leitura/escrita.
  window.SGFireReady=new Promise(function(resolve){
    var unsub=firebase.auth().onAuthStateChanged(function(user){ unsub(); resolve(user); });
  });
})();
