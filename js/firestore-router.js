// ════ FIRESTORE ROUTER (piloto: login + clientes + vendas + funil) ════
// Intercepta só essas ações e responde com Firestore, no formato exato que o
// Apps Script já devolvia (mesmos nomes de campo) — assim clientes.js,
// vendas.js e funil.js não precisam mudar NADA na leitura/renderização.
// Todo o resto do sistema continua batendo no Apps Script de sempre.
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

  function getClientesData(){
    return Promise.all([getColecao('clientes'),getColecao('vendedores')]).then(function(r){
      return {ok:true, clientes:r[0], vendedores:r[1]};
    }).catch(function(err){ return {ok:false, erro:err.message}; });
  }

  function salvarCliente(p){
    var id=p.idCliente;
    if(!id) return Promise.resolve({ok:false,erro:'idCliente é obrigatório.'});
    var doc={
      IdCliente:id,
      'Nome Razao Social':p.nome||'',
      'Tipo Pessoa':p.tipoPessoa||'',
      Telefone:p.telefone||'',
      'CPF ou CNPJ':p.cpfCnpj||'',
      Email:p.email||'',
      Endereco:p.endereco||'',
      'Status Cliente':p.statusCliente||'',
      'Vendedor Responsavel':p.vendedorResponsavel||'',
      CPFEquatorial:p.cpfEquatorial||'',
      DataNascimentoEquatorial:p.dataNascimentoEquatorial||''
    };
    return db().collection('clientes').doc(id).set(doc)
      .then(function(){ return {ok:true,idCliente:id}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }

  function excluirCliente(p){
    return db().collection('clientes').doc(p.idCliente).delete()
      .then(function(){ return {ok:true}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }

  function getVendasData(){
    return Promise.all([getColecao('vendedores'),getColecao('vendas'),getColecao('clientes'),getColecao('servicos')]).then(function(r){
      return {ok:true, vendedores:r[0], vendas:r[1], clientes:r[2], servicos:r[3],
        metas:[], metasIndividuais:[], relatorios:[], custosVenda:[]};
    }).catch(function(err){ return {ok:false, erro:err.message}; });
  }

  function salvarVenda(p){
    var id=p.idVenda;
    if(!id) return Promise.resolve({ok:false,erro:'idVenda é obrigatório.'});
    var doc={
      IdVenda:id, IdCliente:p.idCliente, IdServico:p.idServico, IdVendedor:p.idVendedor,
      DataVenda:p.dataVenda||'', Valor:parseFloat(p.valor)||0
    };
    return db().collection('vendas').doc(id).set(doc)
      .then(function(){ return {ok:true,idVenda:id}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }

  function excluirVenda(p){
    return db().collection('vendas').doc(p.idVenda).delete()
      .then(function(){ return {ok:true}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }

  function getFunilData(){
    return Promise.all([getColecao('vendedores'),getColecao('funil'),getColecao('clientes'),getColecao('servicos')]).then(function(r){
      return {ok:true, vendedores:r[0], funil:r[1], clientes:r[2], servicos:r[3], funilLog:[], funilSLA:[]};
    }).catch(function(err){ return {ok:false, erro:err.message}; });
  }

  function salvarFunil(p){
    // O frontend SEMPRE manda idOportunidade (já gera o ID otimista mesmo pra
    // lead novo — mesmo padrão de clientes/vendas), então não dá pra usar
    // "veio idOportunidade?" pra saber se é criação. Em vez disso, confere se
    // o documento já existe de verdade no Firestore antes de decidir se grava
    // DataCriacao agora ou preserva a que já estava lá.
    var id=p.idOportunidade||(window.SGId?window.SGId.gerar():String(Date.now()));
    var ref=db().collection('funil').doc(id);
    return ref.get().then(function(snap){
      var agora=new Date();
      var doc=semUndefined({
        IdOportunidade:id, IdCliente:p.idCliente, IdVendedor:p.idVendedor, IdServico:p.idServico||'',
        Etapa:p.etapa, Observacoes:p.observacoes||'', 'Valor Estimado':parseFloat(p.valorEstimado)||0,
        MotivoPerda:p.motivoPerda||'',
        DataCriacao: snap.exists?undefined:(agora.getFullYear()+'-'+String(agora.getMonth()+1).padStart(2,'0')+'-'+String(agora.getDate()).padStart(2,'0'))
      });
      return ref.set(doc,{merge:true});
    }).then(function(){ return {ok:true,idOportunidade:id}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }

  function excluirFunil(p){
    return db().collection('funil').doc(p.idOportunidade).delete()
      .then(function(){ return {ok:true}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }

  // Espera o Firebase Auth confirmar a sessão restaurada antes de tocar no
  // Firestore — senão a primeira leitura logo após um F5 chega antes da
  // sessão terminar de restaurar e as rules recusam com "permission denied"
  // (ver window.SGFireReady em firebase-init.js).
  function comAuthPronto(fn){
    return function(payload){
      return window.SGFireReady.then(function(){ return fn(payload); });
    };
  }

  window.SGFireActions={
    getClientesData:comAuthPronto(getClientesData), salvarCliente:comAuthPronto(salvarCliente), excluirCliente:comAuthPronto(excluirCliente),
    getVendasData:comAuthPronto(getVendasData), salvarVenda:comAuthPronto(salvarVenda), excluirVenda:comAuthPronto(excluirVenda),
    getFunilData:comAuthPronto(getFunilData), salvarFunil:comAuthPronto(salvarFunil), excluirFunil:comAuthPronto(excluirFunil)
  };
})();
