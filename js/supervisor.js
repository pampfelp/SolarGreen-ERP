// ════ SUPERVISOR DE VENDAS (2026-11-05) ════
// O que o vendedor faz a partir do sininho. Os avisos (supervisor_contato,
// supervisor_lembrete, supervisor_pergunta) são gerados pelo Apps Script
// (seção "SUPERVISOR DE VENDAS" do legado/CODE GS.txt) na coleção
// `notificacoes`; aqui só se trata o clique.
//
//   Enviar (contato e lembrete): abre o WhatsApp do cliente com a mensagem da
//     etapa (js/supervisor-mensagens.js), grava Tentativa de Contato, limpa a
//     data e agenda a pergunta (1h30 depois, teto 17h30 do dia útil).
//   Marcar data (pergunta): diálogo de data e hora, grava ProximoContatoEm.
//
// O diálogo de data também serve o Funil, ao mover um lead para etapa do
// supervisor (SGSupervisor.pedirProximoContato).
(function(){
  function R(){ return window.SupervisorRegras; }
  function el(id){ return document.getElementById(id); }
  function toast(t,erro){ if(window.SGToast)window.SGToast.mostrar(t,erro); }
  function apiCall(acao,dados){ return window.SGAuth.apiCall(acao,dados); }

  // ── Diálogo de data e hora do próximo contato ──
  var _resolver=null;
  function fecharDialogo(valor){
    var modal=el('supProximoModal');
    if(modal)modal.classList.add('hidden');
    if(_resolver){ var r=_resolver; _resolver=null; r(valor); }
  }
  // Promise com o ms escolhido, ou null se cancelar.
  function pedirProximoContato(opts){
    var o=opts||{};
    return new Promise(function(resolve){
      var modal=el('supProximoModal');
      if(!modal||!R()){ resolve(null); return; }
      if(_resolver)_resolver(null);
      _resolver=resolve;
      el('sup-titulo').textContent=o.titulo||'Próximo contato';
      el('sup-mensagem').textContent=o.mensagem||'';
      el('sup-confirmarBtn').textContent=o.textoConfirmar||'Salvar';
      el('sup-msg').textContent='';
      var c=R().camposDoMs(R().temDataValida(o.valorInicial,Date.now())?o.valorInicial:null);
      el('sup-data').value=c.data;
      el('sup-hora').value=c.hora;
      modal.classList.remove('hidden');
      setTimeout(function(){ el('sup-data').focus(); },0);
    });
  }
  function confirmarDialogo(){
    var ms=R().msDosCampos(el('sup-data').value,el('sup-hora').value);
    var erro=R().erroDaData(ms,Date.now());
    if(erro){ el('sup-msg').textContent=erro; return; }
    fecharDialogo(ms);
  }
  document.addEventListener('DOMContentLoaded',function(){
    var modal=el('supProximoModal');
    if(!modal)return;
    el('sup-cancelarBtn').addEventListener('click',function(){ fecharDialogo(null); });
    el('sup-confirmarBtn').addEventListener('click',confirmarDialogo);
    modal.addEventListener('click',function(e){ if(e.target===modal)fecharDialogo(null); });
    document.addEventListener('keydown',function(e){
      if(modal.classList.contains('hidden'))return;
      if(e.key==='Escape')fecharDialogo(null);
      if(e.key==='Enter'){ e.preventDefault(); confirmarDialogo(); }
    });
    registrarAcoes();
  });

  // ── Ações do sininho ──
  function abrirLead(id){
    if(window.SGControllerSwitchTo)window.SGControllerSwitchTo('funil');
    if(window.funilApp&&window.funilApp.abrirLead)window.funilApp.abrirLead(id);
  }
  function nomeCliente(a){ return R().primeiroNome(a.nome)||'o cliente'; }

  function enviar(notif){
    var a=(notif&&notif.acao)||{};
    if(!a.idOportunidade){ toast('Aviso sem lead.',true); return; }
    if(notif.resolvidaEm){ toast('Esse aviso já foi resolvido.'); abrirLead(a.idOportunidade); return; }
    var tel=R().telefoneWa(a.telefone);
    if(!tel){
      toast(nomeCliente(a)+' está sem telefone no cadastro. Atualize o cliente e registre o contato pelo Funil.',true);
      abrirLead(a.idOportunidade);
      return;
    }
    var vendedor=a.nomeVendedor||((window.SG_SESSION||{}).nome)||'';
    var texto=window.SupervisorMensagens.mensagem(a.etapa,{nome:a.nome,vendedor:vendedor});
    // Abre antes de qualquer espera, senão o navegador bloqueia a janela.
    window.open('https://wa.me/'+tel+'?text='+encodeURIComponent(texto),'_blank','noopener');

    var pergunta=R().horarioDaPergunta(Date.now());
    apiCall('registrarAtividadeFunil',{
      idOportunidade:a.idOportunidade, tipo:R().TIPO_TENTATIVA,
      observacao:'Mensagem da etapa '+(a.etapa||'')+' aberta no WhatsApp pelo aviso do supervisor.',
      resolverAviso:notif.id
    }).then(function(resp){
      if(!resp||!resp.ok)toast((resp&&resp.erro)||'Não foi possível registrar a tentativa de contato.',true);
    }).catch(function(err){ toast('Erro de conexão — tentativa não registrada: '+err.message,true); });
    apiCall('atualizarProximoContatoFunil',{
      idOportunidade:a.idOportunidade, proximoContatoEm:null, supervisorPerguntaEm:pergunta
    }).then(function(resp){
      if(!resp||!resp.ok){ toast((resp&&resp.erro)||'Não foi possível agendar a pergunta da próxima data.',true); return; }
      toast('Tentativa registrada. Em '+R().textoDataHora(pergunta)+' eu pergunto a próxima data para falar com '+nomeCliente(a)+'.');
    }).catch(function(err){ toast('Erro de conexão — pergunta não agendada: '+err.message,true); });
  }

  function perguntar(notif){
    var a=(notif&&notif.acao)||{};
    if(!a.idOportunidade){ toast('Aviso sem lead.',true); return; }
    if(notif.resolvidaEm){ toast('Esse aviso já foi resolvido.'); abrirLead(a.idOportunidade); return; }
    pedirProximoContato({titulo:'Próximo contato',mensagem:'Qual a próxima data para falar com '+nomeCliente(a)+'?'}).then(function(ms){
      if(ms===null)return;
      apiCall('atualizarProximoContatoFunil',{
        idOportunidade:a.idOportunidade, proximoContatoEm:ms, supervisorPerguntaEm:null, resolverAviso:notif.id
      }).then(function(resp){
        if(!resp||!resp.ok){ toast((resp&&resp.erro)||'Não foi possível salvar o próximo contato.',true); return; }
        toast('Próximo contato com '+nomeCliente(a)+' em '+R().textoDataHora(ms)+'.');
      }).catch(function(err){ toast('Erro de conexão — próximo contato não salvo: '+err.message,true); });
    });
  }

  // O sininho (js/notificacoes.js) mostra o botão e repassa o clique.
  var _registrado=false;
  function registrarAcoes(){
    var N=window.SGNotificacoes;
    if(_registrado||!N||typeof N.registrarAcao!=='function'||!R())return;
    var T=R().TIPOS_AVISO;
    N.registrarAcao(T.contato,{botao:'Enviar',aoClicar:enviar});
    N.registrarAcao(T.lembrete,{botao:'Enviar',aoClicar:enviar});
    N.registrarAcao(T.pergunta,{botao:'Marcar data',aoClicar:perguntar});
    _registrado=true;
  }
  registrarAcoes();

  window.SGSupervisor={pedirProximoContato:pedirProximoContato,enviar:enviar,perguntar:perguntar};
})();
