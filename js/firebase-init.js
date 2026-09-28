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

  // Persistência offline (2026-09-01): guarda uma cópia local (IndexedDB) de
  // todo documento que já passou por um onSnapshot. Sem isso, reabrir a
  // página reabre cada listener do zero e o servidor manda a COLEÇÃO INTEIRA
  // de novo, mesmo que nada tenha mudado — foi a causa raiz de estourar a
  // cota diária de leitura do Firestore (achado em 2026-08-31/09-01, ver
  // segundo-cerebro/padroes/dados-e-seguranca.md). Com persistência, reabrir
  // o MESMO listener manda só a diferença desde a última vez. "catch" sem
  // travar nada: alguns navegadores/contextos recusam (aba anônima, várias
  // abas sem synchronizeTabs) — nesse caso o app cai pra leitura normal, só
  // perde o desconto de cota entre sessões, mesma postura do app do técnico
  // (js/tecnico-firebase-init.js), copiado daqui.
  //
  // synchronizeTabs saiu em 2026-09-28. Com ele ligado, os quatro apps desta
  // pasta (painel, técnico, ponto, planilha) são MESMA ORIGEM e disputam
  // entre si quem é a aba primária desse IndexedDB — é nessa negociação que
  // mora o bug aberto do SDK "INTERNAL ASSERTION FAILED: Unexpected state"
  // (firebase-js-sdk #7884/#8250, sem correção até a 12.3.0), que mata a
  // instância do Firestore da página inteira. Desligado, cada aba tenta ser
  // dona sozinha: a primeira fica com o cache local, a segunda cai no catch
  // abaixo (failed-precondition) e roda sem cache — perde o desconto de cota
  // SÓ nessa segunda aba, em troca de não travar nenhuma das duas. Se um dia
  // o SDK corrigir, é só voltar pra true aqui e nos outros dois inits.
  firebase.firestore().enablePersistence({synchronizeTabs:false}).catch(function(err){
    console.warn('Persistência offline não disponível neste navegador:',err.code);
  });

  // O bug acima não dá pra consertar por dentro: quando estoura, toda
  // leitura/escrita seguinte joga exceção e os onSnapshot param de entregar,
  // até recarregar. Sem isso aqui, a tela mostra "Erro de conexão" (que não é
  // conexão nenhuma), a pessoa continua trabalhando e nada mais salva.
  function firestoreMorreu(){
    if(document.getElementById('sg-fs-morto'))return;
    var barra=document.createElement('div');
    barra.id='sg-fs-morto';
    barra.style.cssText='position:fixed;left:0;right:0;top:0;z-index:2100;background:#dc2626;color:#fff;padding:12px 16px;font-size:13px;line-height:1.45;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;';
    var texto=document.createElement('span');
    texto.textContent='A conexão com o banco travou nesta aba. Nada que você fizer agora vai salvar — recarregue pra voltar ao normal.';
    var botao=document.createElement('button');
    botao.type='button';
    botao.textContent='Recarregar';
    botao.style.cssText='background:#fff;color:#dc2626;border:0;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;';
    botao.addEventListener('click',function(){ location.reload(); });
    barra.appendChild(texto); barra.appendChild(botao);
    (document.body||document.documentElement).appendChild(barra);
  }
  window.SGFirestoreFatal={
    // Chamado de dois lugares porque o erro aparece de duas formas: como
    // exceção solta do SDK (os listeners abaixo) e como promessa rejeitada
    // que o app já trata e viraria só um toast errado (js/firestore-router.js).
    verificar:function(erro){
      if(erro&&String(erro.message||erro).indexOf('INTERNAL ASSERTION FAILED')!==-1){ firestoreMorreu(); return true; }
      return false;
    }
  };
  window.addEventListener('error',function(e){ window.SGFirestoreFatal.verificar(e.error||e.message); });
  window.addEventListener('unhandledrejection',function(e){ window.SGFirestoreFatal.verificar(e.reason); });

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
