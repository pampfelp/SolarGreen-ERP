// ════ BOTÃO VOLTAR (celular e navegador) ════
// Pedido do Felipe, 2026-11-10: o voltar do Android saía do app e, no
// notebook, levava à página que estava aberta antes do sistema. A troca de
// tela e os painéis só mexiam em classe CSS, sem nenhuma entrada no
// histórico do navegador, então para ele o sistema inteiro era uma página só.
//
// Como funciona. Cada tela do menu vira uma entrada {sg:1,tela,n:0}. Cada
// camada aberta por cima dela (painel de detalhe, modal, gaveta do menu)
// acrescenta uma entrada, com n = quantas camadas estão abertas. As telas não
// precisam avisar nada: um MutationObserver conta as camadas visíveis e acerta
// o histórico sozinho, inclusive quando a camada fecha pelo próprio botão.
//
// O voltar fecha só a camada do topo, pelo MESMO botão que a pessoa usaria
// (seta do painel, Cancelar/Fechar do modal). Nunca pelo fundo escurecido
// #adBackdrop: ele é compartilhado e tocar nele fecha todos os painéis abertos.
//
// Serve aos dois apps. No painel (index.html) o controller avisa cada troca
// de tela. No app do técnico (indexdotecnico.html) não há menu: a base é
// criada sozinha, e as telas cheias (detalhe, dimensionamento) e a gaveta de
// notificações levam o atributo data-sg-camada e contam como camada.
(function(){
  var telaAtual=null;     // tela da entrada atual do histórico
  var nivel=0;            // camadas que o histórico atual representa
  var voltando=false;     // history.go() nosso em andamento
  var limiteVolta=null;
  var agendado=false;
  var restaurandoTela=false;
  var seq=0;
  var conhecidas=[];      // camadas abertas na última contagem
  var RE_FECHAR=/(cancelar|cancel|fechar)(btn)?$/i;

  if('scrollRestoration' in history)history.scrollRestoration='manual';

  function estado(n){ return {sg:1,tela:telaAtual,n:n}; }

  function estaAberta(el){
    if(!el||!el.isConnected)return false;
    var aberta;
    if(el.classList.contains('side-panel')||el.hasAttribute('data-sg-camada'))aberta=el.classList.contains('active');
    else if(el.classList.contains('sidebar'))aberta=el.classList.contains('mobile-open');
    else aberta=(el.classList.contains('modal-overlay')||el.classList.contains('sheet-overlay'))&&!el.classList.contains('hidden');
    return aberta&&getComputedStyle(el).display!=='none';
  }

  // Camadas abertas, da de baixo para a de cima: primeiro pelo z-index real
  // (modal 200 fica acima de painel 150), depois pela ordem em que abriram.
  function camadas(){
    var lista=[].slice.call(document.querySelectorAll('.side-panel.active, .modal-overlay:not(.hidden), .sheet-overlay:not(.hidden), .sidebar.mobile-open, [data-sg-camada].active')).filter(estaAberta);
    lista.forEach(function(el){ if(!el._sgSeq)el._sgSeq=++seq; });
    conhecidas.forEach(function(el){
      if(lista.indexOf(el)<0){ delete el._sgSeq; delete el._sgReabrir; }
    });
    conhecidas=lista.slice();
    return lista.sort(function(a,b){
      var za=parseInt(getComputedStyle(a).zIndex,10)||0, zb=parseInt(getComputedStyle(b).zIndex,10)||0;
      return za!==zb?za-zb:a._sgSeq-b._sgSeq;
    });
  }

  function fecharCamada(el){
    if(el.classList.contains('sidebar')){
      var fundo=document.getElementById('sidebar-backdrop'); if(fundo)fundo.click(); return;
    }
    if(el.classList.contains('side-panel')){
      var seta=el.querySelector('.ad-backbtn'); if(seta){ seta.click(); return; }
    }
    // Tela cheia e gaveta: só a seta do topo, ou tirar o "active". Nunca a
    // busca por nome abaixo: o detalhe do técnico tem #btn-cancelar, que é
    // "Cancelar agendamento".
    if(el.hasAttribute('data-sg-camada')){
      var volta=el.querySelector('.backbtn, .ad-backbtn');
      if(volta)volta.click(); else el.classList.remove('active');
      return;
    }
    var botoes=el.querySelectorAll('button');
    for(var i=0;i<botoes.length;i++){
      var b=botoes[i];
      if(b.disabled||b.offsetParent===null)continue;
      if(RE_FECHAR.test(b.id||'')||b.getAttribute('data-pop')==='fechar'){ b.click(); return; }
    }
    // Sem botão de fechar: o mesmo caminho do Esc (toque fora do cartão).
    // Modal que não pode ser dispensado, como o aviso obrigatório de
    // notificação, não tem esse caminho e continua aberto.
    el.click();
  }

  // Fecha camadas do topo até sobrarem `alvo`. Para quando uma camada se
  // recusa a fechar, e também quando fechar reabre o passo anterior (lápis da
  // visualização), porque aquele voltar já foi usado.
  function fecharAte(alvo){
    for(var i=0;i<30;i++){
      var abertas=camadas();
      if(abertas.length<=alvo)return;
      var topo=abertas[abertas.length-1], reabrir=topo._sgReabrir;
      fecharCamada(topo);
      if(estaAberta(topo))return;
      if(reabrir){ delete topo._sgReabrir; reabrir(); return; }
    }
  }

  function agendar(){
    if(agendado)return;
    agendado=true;
    setTimeout(function(){ agendado=false; sincronizar(); },0);
  }

  function sincronizar(){
    if(voltando||telaAtual===null)return;
    var n=camadas().length;
    while(nivel<n){ nivel++; history.pushState(estado(nivel),''); }
    if(n<nivel){
      // Camada fechada pelo próprio botão: tira do histórico as entradas que
      // sobraram, senão o próximo voltar não faria nada visível.
      voltando=true;
      history.go(n-nivel);
      limiteVolta=setTimeout(function(){
        voltando=false;
        var st=history.state; nivel=(st&&st.sg)?(st.n||0):0;
      },1000);
    }
  }

  window.addEventListener('popstate',function(e){
    var st=e.state;
    if(voltando){
      clearTimeout(limiteVolta); voltando=false;
      nivel=(st&&st.sg)?(st.n||0):0;
      agendar();
      return;
    }
    if(!st||!st.sg){
      // Entrada sem estado nosso: vira a base da tela atual.
      fecharAte(0); nivel=0;
      if(telaAtual!==null)history.replaceState(estado(0),'');
      return;
    }
    var anterior=nivel, alvo=st.n||0;
    if(st.tela!==telaAtual){
      fecharAte(0);
      telaAtual=st.tela; nivel=alvo;
      restaurandoTela=true;
      try{ if(window.SGControllerSwitchTo)window.SGControllerSwitchTo(st.tela); }
      finally{ restaurandoTela=false; }
      agendar();
      return;
    }
    nivel=alvo;
    if(camadas().length>alvo){ fecharAte(alvo); agendar(); return; }
    // Entrada que não fecha nada (sobra de recarga da página): passa direto
    // para a anterior, para o toque não parecer perdido.
    if(alvo<anterior||alvo===0&&anterior===0){ history.back(); return; }
    agendar();
  });

  // App sem menu (técnico): a primeira entrada vira a base.
  setTimeout(function(){ if(telaAtual===null)window.SGVoltar.telaMudou('inicio'); },0);

  new MutationObserver(agendar).observe(document.body,{attributes:true,attributeFilter:['class'],subtree:true});
  new MutationObserver(agendar).observe(document.body,{childList:true});

  window.SGVoltar={
    // Chamado pelo controller a cada troca de tela.
    telaMudou:function(nome){
      if(restaurandoTela){ telaAtual=nome; return; }
      if(telaAtual===null){ telaAtual=nome; nivel=0; history.replaceState(estado(0),''); return; }
      if(nome===telaAtual)return;
      telaAtual=nome;
      // Troca que o sistema faz sozinho (permissão que esconde a tela, link de
      // notificação ao abrir) substitui a entrada. O Chrome pula, no botão
      // voltar, a entrada deixada para trás por um pushState sem toque da
      // pessoa, e o voltar seguinte sairia do sistema.
      var semToque=navigator.userActivation&&!navigator.userActivation.isActive;
      if(nivel>0||semToque){ nivel=0; history.replaceState(estado(0),''); }
      else history.pushState(estado(0),'');
      agendar();
    },
    // A camada que acabou de abrir, ao ser fechada pelo voltar, chama `fn`
    // para reabrir o passo anterior. Usado pelo lápis da visualização
    // (SGViewPanel), que fecha a visualização antes de abrir o formulário.
    aoVoltarReabrir:function(fn){
      var antes=seq;
      function marcar(){
        var abertas=camadas(), topo=abertas[abertas.length-1];
        if(topo&&topo._sgSeq>antes){ topo._sgReabrir=fn; return true; }
        return false;
      }
      if(!marcar())setTimeout(marcar,50);
    }
  };
})();
