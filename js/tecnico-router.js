// ════ FIRESTORE ROUTER — APP DO TÉCNICO (piloto offline) ════
// Intercepta as ações do app do técnico e responde do Firestore, no mesmo
// formato que o Apps Script devolvia — tecnico-agendamentos.js e
// tecnico-dimensionamento.js não precisam mudar a lógica de renderização.
// Diferente do piloto do admin, aqui a persistência offline (ver
// tecnico-firebase-init.js) está ligada, então as MESMAS chamadas get()/
// set() abaixo continuam funcionando sem sinal.
(function(){
  function db(){ return firebase.firestore(); }

  function snapshotToArray(snap){
    var out=[]; snap.forEach(function(doc){ out.push(doc.data()); }); return out;
  }
  function getColecao(nome){ return db().collection(nome).get().then(snapshotToArray); }
  function semUndefined(obj){
    Object.keys(obj).forEach(function(k){ if(obj[k]===undefined) delete obj[k]; });
    return obj;
  }
  function paraNumero(v){
    if(v===''||v===null||v===undefined)return 0;
    if(typeof v==='number')return v;
    var n=parseFloat(String(v).replace(',','.'));
    return isNaN(n)?0:n;
  }
  var ADMIN_ROLES=['admin','administrador','ceo','gestor','gerente'];
  function isAdminSessao(){
    var s=(window.SGAuth&&window.SGAuth.getSession&&window.SGAuth.getSession())||null;
    return !!(s&&ADMIN_ROLES.indexOf((s.tipo||'').trim().toLowerCase())!==-1);
  }

  function getAgendamentosTecnico(p){
    return Promise.all([
      getColecao('agendamentos'),getColecao('clientes'),getColecao('vendedores'),
      getColecao('servicos'),getColecao('templates')
    ]).then(function(r){
      var todos=r[0];
      var meus=isAdminSessao()?todos:todos.filter(function(a){ return String(a.TecnicoResponsavel)===String(p.solicitanteId); });
      return {ok:true, agendamentos:meus, clientes:r[1], vendedores:r[2], servicos:r[3], templates:r[4]};
    }).catch(function(err){ return {ok:false,erro:err.message}; });
  }

  function getRespostasAgendamentos(p){
    var ids=p.idsAgendamentos||[];
    if(!ids.length) return Promise.resolve({ok:true,respostas:[]});
    // Firestore "in" aceita até 30 valores — a tela já pagina de 10 em 10,
    // então uma única consulta sempre cobre a página pedida.
    return db().collection('agendamentos_respostas').where('IdAgendamento','in',ids.slice(0,30)).get()
      .then(snapshotToArray)
      .then(function(respostas){ return {ok:true, respostas:respostas}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }

  function isObrigatorio(v){
    if(v===true)return true;
    if(v===false||v===undefined||v===null||v==='')return false;
    var s=String(v).trim().toUpperCase();
    return s==='VERDADEIRO'||s==='TRUE'||s==='SIM'||s==='1';
  }
  function temValor(r){
    return !!(r&&(String(r.RespostaTexto||'').trim()||String(r.RespostaFoto||'').trim()||String(r.RespostaQuantidade||'').trim()));
  }

  /**
   * Mesma regra do Code.gs original (atualizarStatusAutomatico): nunca mexe
   * num agendamento já Cancelado/Concluído; na primeira resposta salva,
   * "Agendado"->"Em Andamento"; quando todos os campos OBRIGATÓRIOS do
   * serviço têm valor, ->"Concluído". Roda depois de toda resposta salva
   * (texto/número/lista OU foto).
   */
  function atualizarStatusAutomatico(idAgendamento){
    var agRef=db().collection('agendamentos').doc(idAgendamento);
    return Promise.all([
      agRef.get(),
      getColecao('templates'),
      db().collection('agendamentos_respostas').where('IdAgendamento','==',idAgendamento).get().then(snapshotToArray)
    ]).then(function(r){
      var agSnap=r[0], templates=r[1], respostas=r[2];
      if(!agSnap.exists)return null;
      var ag=agSnap.data();
      var statusAtual=String(ag['Status Agendamento']||'').trim();
      var statusNorm=statusAtual.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
      if(statusNorm==='cancelado'||statusNorm==='concluido')return null;

      var obrigatorios=templates.filter(function(t){ return String(t.IdServico)===String(ag.IdServico)&&isObrigatorio(t.Obrigatorio); });
      var porTemplate={}; respostas.forEach(function(rr){ porTemplate[rr.IdTemplate]=rr; });
      var todosObrigatoriosOk=obrigatorios.length>0&&obrigatorios.every(function(t){ return temValor(porTemplate[t.IdTemplate]); });
      var temAlguma=respostas.some(temValor);

      var novoStatus=null;
      if(todosObrigatoriosOk)novoStatus='Concluído';
      else if(temAlguma&&statusNorm==='agendado')novoStatus='Em Andamento';

      if(novoStatus&&novoStatus!==statusAtual){
        var patch={'Status Agendamento':novoStatus};
        if(novoStatus==='Concluído')patch.DataRelatorio=new Date().toISOString();
        return agRef.update(patch).then(function(){ return novoStatus; });
      }
      return null;
    });
  }

  function salvarRespostasAgendamento(p){
    var idAgendamento=p.idAgendamento, respostas=p.respostas||[];
    if(!idAgendamento) return Promise.resolve({ok:false,erro:'idAgendamento é obrigatório.'});
    return getColecao('templates').then(function(templates){
      var tplById={}; templates.forEach(function(t){ if(t.IdTemplate)tplById[t.IdTemplate]=t; });
      var batch=db().batch();
      respostas.forEach(function(r){
        if(!r.idTemplate)return;
        var tpl=tplById[r.idTemplate];
        var tipo=tpl?String(tpl.TipoInput||'').trim():'Texto';
        var campo=(tipo==='Number')?'RespostaQuantidade':'RespostaTexto';
        var valor=(r.resposta===undefined||r.resposta===null)?'':r.resposta;
        var idDoc=idAgendamento+'_'+r.idTemplate;
        var patch={IdResposta:idDoc,IdAgendamento:idAgendamento,IdTemplate:r.idTemplate};
        patch[campo]=valor;
        batch.set(db().collection('agendamentos_respostas').doc(idDoc),patch,{merge:true});
      });
      return batch.commit();
    }).then(function(){
      return atualizarStatusAutomatico(idAgendamento);
    }).then(function(novoStatus){
      return {ok:true, novoStatus:novoStatus};
    }).catch(function(err){ return {ok:false,erro:err.message}; });
  }

  function uploadFotoResposta(p){
    var idAgendamento=p.idAgendamento, idTemplate=p.idTemplate, base64=p.base64;
    if(!idAgendamento||!idTemplate||!base64) return Promise.resolve({ok:false,erro:'Dados incompletos.'});
    var mimeType=p.mimeType||'image/jpeg';
    var dataUri='data:'+mimeType+';base64,'+base64;
    // Rede de segurança: um documento do Firestore tem limite de ~1MiB. A
    // compressão client-side (comprimirImagem, em tecnico-agendamentos.js)
    // já mantém isso bem abaixo na prática — isso aqui só evita um erro
    // confuso do servidor se algo pular a compressão.
    if(dataUri.length>900000) return Promise.resolve({ok:false,erro:'Foto muito grande mesmo depois de comprimida — tente tirar de novo.'});
    var idDoc=idAgendamento+'_'+idTemplate;
    return db().collection('agendamentos_respostas').doc(idDoc).set({
      IdResposta:idDoc, IdAgendamento:idAgendamento, IdTemplate:idTemplate, RespostaFoto:dataUri
    },{merge:true}).then(function(){
      return atualizarStatusAutomatico(idAgendamento);
    }).then(function(novoStatus){
      return {ok:true, url:dataUri, novoStatus:novoStatus};
    }).catch(function(err){ return {ok:false,erro:err.message}; });
  }

  function atualizarStatusAgendamento(p){
    var idAgendamento=p.idAgendamento, status=p.status;
    if(!idAgendamento||!status) return Promise.resolve({ok:false,erro:'Dados incompletos.'});
    var statusNorm=String(status).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    if(statusNorm==='cancelado'&&!String(p.motivoCancelamento||'').trim()){
      return Promise.resolve({ok:false,erro:'Informe o motivo do cancelamento.'});
    }
    var patch={'Status Agendamento':status,'Motivo Cancelamento':statusNorm==='cancelado'?p.motivoCancelamento:''};
    if(statusNorm==='concluido')patch.DataRelatorio=new Date().toISOString();
    return db().collection('agendamentos').doc(idAgendamento).update(patch)
      .then(function(){ return {ok:true}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }

  function getCatalogoProdutos(){
    return Promise.all([getColecao('produtos_modulos'),getColecao('produtos_inversores')]).then(function(r){
      return {ok:true, modulos:r[0], inversores:r[1].map(function(inv){
        var out=Object.assign({},inv);
        out.mpptsConfig=inv.mpptsConfig||[];
        return out;
      })};
    }).catch(function(err){ return {ok:false,erro:err.message}; });
  }

  function salvarModulo(p){
    var modelo=String(p.modelo||'').trim();
    if(!modelo) return Promise.resolve({ok:false,erro:'Modelo do módulo é obrigatório.'});
    var id=p.idModulo||(window.SGId?window.SGId.gerar():String(Date.now()));
    var ref=db().collection('produtos_modulos').doc(id);
    return ref.get().then(function(snap){
      var agora=new Date().toISOString();
      var doc=semUndefined({
        IdModulo:id, Marca:p.marca||'', Modelo:modelo,
        AlturaM:paraNumero(p.alturaM), LarguraM:paraNumero(p.larguraM), PotenciaW:paraNumero(p.potenciaW),
        VocV:paraNumero(p.vocV), IscA:paraNumero(p.iscA), PesoKg:paraNumero(p.pesoKg),
        DataAtualizacao:agora, DataCriacao: snap.exists?undefined:agora
      });
      return ref.set(doc,{merge:true});
    }).then(function(){ return {ok:true,idModulo:id}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }

  function salvarInversor(p){
    var modelo=String(p.modelo||'').trim();
    if(!modelo) return Promise.resolve({ok:false,erro:'Modelo do inversor é obrigatório.'});
    var id=p.idInversor||(window.SGId?window.SGId.gerar():String(Date.now()));
    var ref=db().collection('produtos_inversores').doc(id);
    return ref.get().then(function(snap){
      var agora=new Date().toISOString();
      var doc=semUndefined({
        IdInversor:id, Marca:p.marca||'', Modelo:modelo,
        PotenciaMaxCC_W:paraNumero(p.potenciaMaxCC_W), PotenciaNomCC_W:paraNumero(p.potenciaNomCC_W),
        TensaoEntradaMaxV:paraNumero(p.tensaoEntradaMaxV), MpptMinV:paraNumero(p.mpptMinV), MpptMaxV:paraNumero(p.mpptMaxV),
        StartupV:paraNumero(p.startupV), NumMppts:paraNumero(p.numMppts), mpptsConfig:p.mpptsConfig||[],
        PotenciaAtivaNomCA_W:paraNumero(p.potenciaAtivaNomCA_W), TensaoCANominalV:paraNumero(p.tensaoCANominalV),
        CorrenteMaxCA_A:paraNumero(p.correnteMaxCA_A), Fases:p.fases||'',
        DataAtualizacao:agora, DataCriacao: snap.exists?undefined:agora
      });
      return ref.set(doc,{merge:true});
    }).then(function(){ return {ok:true,idInversor:id}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }

  // Espera o Firebase Auth confirmar a sessão restaurada (ver
  // tecnico-firebase-init.js) antes de tocar no Firestore.
  function comAuthPronto(fn){
    return function(payload){ return window.TecnicoFireReady.then(function(){ return fn(payload); }); };
  }
  // Avisa o indicador de sincronização (TecnicoSync, em tecnico-auth.js)
  // enquanto uma escrita está em voo — só nas ações de escrita.
  function comSync(colecao,resumoFn,fn){
    return function(payload){
      var idPendente=window.TecnicoSync?window.TecnicoSync.iniciar(colecao,resumoFn(payload)):null;
      function finalizar(){ if(window.TecnicoSync&&idPendente!==null)window.TecnicoSync.concluir(idPendente); }
      return fn(payload).then(function(resp){ finalizar(); return resp; }).catch(function(err){ finalizar(); throw err; });
    };
  }

  window.TecnicoFireActions={
    getAgendamentosTecnico:comAuthPronto(getAgendamentosTecnico),
    getRespostasAgendamentos:comAuthPronto(getRespostasAgendamentos),
    salvarRespostasAgendamento:comSync('agendamentos_respostas',function(p){return 'checklist da OS '+p.idAgendamento;},comAuthPronto(salvarRespostasAgendamento)),
    uploadFotoResposta:comSync('agendamentos_respostas',function(p){return 'foto da OS '+p.idAgendamento;},comAuthPronto(uploadFotoResposta)),
    atualizarStatusAgendamento:comSync('agendamentos',function(p){return 'status da OS '+p.idAgendamento+' → '+p.status;},comAuthPronto(atualizarStatusAgendamento)),
    getCatalogoProdutos:comAuthPronto(getCatalogoProdutos),
    salvarModulo:comSync('produtos_modulos',function(p){return p.modelo||p.idModulo;},comAuthPronto(salvarModulo)),
    salvarInversor:comSync('produtos_inversores',function(p){return p.modelo||p.idInversor;},comAuthPronto(salvarInversor))
  };
})();
