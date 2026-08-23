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
      // Só registra uma transição de verdade se a etapa MUDOU (ou é a
      // primeira gravação) — sem essa checagem, editar só a observação/valor
      // de um lead (sem mudar de etapa) registraria uma transição falsa toda
      // vez, inflando "tempo médio" e "já passaram" sem o lead ter se
      // movido de verdade.
      var etapaMudou=!snap.exists||snap.data().Etapa!==p.etapa;
      var doc=semUndefined({
        IdOportunidade:id, IdCliente:p.idCliente, IdVendedor:p.idVendedor, IdServico:p.idServico||'',
        Etapa:p.etapa, Observacoes:p.observacoes||'', 'Valor Estimado':parseFloat(p.valorEstimado)||0,
        MotivoPerda:p.motivoPerda||'',
        DataCriacao: snap.exists?undefined:(agora.getFullYear()+'-'+String(agora.getMonth()+1).padStart(2,'0')+'-'+String(agora.getDate()).padStart(2,'0')),
        // Acumula toda etapa por onde o lead já passou (não sobrescreve —
        // arrayUnion só soma), pro "Relatório do funil" saber quantos leads
        // JÁ passaram por uma etapa, não só quantos estão nela agora. Leads
        // criados antes dessa mudança só começam a acumular a partir da
        // próxima vez que mudarem de etapa — não tem histórico retroativo.
        EtapasPassadas: etapaMudou?firebase.firestore.FieldValue.arrayUnion(p.etapa):undefined,
        // Histórico COM horário de cada transição — separado de
        // EtapasPassadas (que só marca presença, sem quando) porque
        // "tempo médio por etapa" precisa saber quando cada troca aconteceu,
        // não só que aconteceu.
        Transicoes: etapaMudou?firebase.firestore.FieldValue.arrayUnion({Etapa:p.etapa,Em:agora.toISOString()}):undefined
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

  function paraNumero(v){
    if(v===''||v===null||v===undefined)return 0;
    if(typeof v==='number')return v;
    var n=parseFloat(String(v).replace(',','.'));
    return isNaN(n)?0:n;
  }

  // ── Usuários (tela "Usuários do Sistema") ──
  // vendedores já é 100% Firestore desde o piloto original (é a coleção que
  // sustenta o próprio login); essa tela só lista/edita o que já existe lá.
  // Criar um vendedor NOVO por aqui grava o documento, mas não cria conta no
  // Firebase Auth (isso exigiria Admin SDK/Cloud Function) — a pessoa só
  // consegue logar de verdade se alguém criar o Auth dela separadamente.
  function listVendedoresAdmin(){
    return getColecao('vendedores').then(function(vendedores){
      return {ok:true, vendedores:vendedores};
    }).catch(function(err){ return {ok:false, erro:err.message}; });
  }
  function salvarVendedor(p){
    var id=p.idVendedor;
    if(!id) return Promise.resolve({ok:false,erro:'idVendedor é obrigatório.'});
    var doc={IdVendedor:id, Nome:p.nome||'', Email:p.email||'', Telefone:p.telefone||'', Tipo:p.tipo||'', Status:p.status||'Ativo'};
    return db().collection('vendedores').doc(id).set(doc,{merge:true})
      .then(function(){ return {ok:true,idVendedor:id}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }

  // ── Serviços (catálogo de serviços + checklist do técnico) ──
  // servicos/templates já são Firestore de verdade (usados por Vendas/Funil
  // e pelo checklist do app do técnico) — essa tela é quem cadastra/edita.
  function getServicosData(){
    return Promise.all([getColecao('servicos'),getColecao('templates')]).then(function(r){
      return {ok:true, servicos:r[0], templates:r[1]};
    }).catch(function(err){ return {ok:false, erro:err.message}; });
  }
  function salvarServico(p){
    var id=p.idServico;
    if(!id) return Promise.resolve({ok:false,erro:'idServico é obrigatório.'});
    var doc={
      IdServico:id, 'Nome Servico':p.nomeServico||'', 'Tipo Cobranca':p.tipoCobranca||'',
      TipoServico:p.tipoServico||'', Descricao:p.descricao||'',
      Valor:paraNumero(p.valor), ValorPorModulo:paraNumero(p.valorPorModulo)
    };
    return db().collection('servicos').doc(id).set(doc,{merge:true})
      .then(function(){ return {ok:true,idServico:id}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }
  function excluirServico(p){
    return db().collection('servicos').doc(p.idServico).delete()
      .then(function(){ return {ok:true}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }
  function salvarTemplate(p){
    var id=p.idTemplate;
    if(!id) return Promise.resolve({ok:false,erro:'idTemplate é obrigatório.'});
    var doc={
      IdTemplate:id, IdServico:p.idServico||'', Ordem:paraNumero(p.ordem),
      TextoPergunta:p.textoPergunta||'', TipoInput:p.tipoInput||'Texto',
      OpcoesEnum:p.opcoesEnum||'', Obrigatorio:!!p.obrigatorio
    };
    return db().collection('templates').doc(id).set(doc,{merge:true})
      .then(function(){ return {ok:true,idTemplate:id}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }
  function excluirTemplate(p){
    return db().collection('templates').doc(p.idTemplate).delete()
      .then(function(){ return {ok:true}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }

  // ── Catálogo Solar (módulos/inversores) ──
  // Mesmas coleções e mesmo mapeamento de campos já usados por
  // tecnico-router.js (getCatalogoProdutos/salvarModulo/salvarInversor) —
  // um módulo/inversor cadastrado por qualquer um dos dois apps aparece no
  // outro, porque é a mesma coleção do Firestore.
  function getCatalogoProdutos(){
    return Promise.all([getColecao('produtos_modulos'),getColecao('produtos_inversores')]).then(function(r){
      return {ok:true, modulos:r[0], inversores:r[1].map(function(inv){
        var out=Object.assign({},inv); out.mpptsConfig=inv.mpptsConfig||[]; return out;
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
  function excluirModulo(p){
    return db().collection('produtos_modulos').doc(p.idModulo).delete()
      .then(function(){ return {ok:true}; })
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
  function excluirInversor(p){
    return db().collection('produtos_inversores').doc(p.idInversor).delete()
      .then(function(){ return {ok:true}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }

  // ── Agendamentos (visão do admin — todos os técnicos, não só 1) ──
  // Mesma coleção `agendamentos` que o app do técnico já usa de verdade
  // (tecnico-router.js) — um agendamento criado num app aparece no outro.
  function getAgendamentosData(){
    return Promise.all([
      getColecao('agendamentos'),getColecao('clientes'),getColecao('vendedores'),
      getColecao('servicos'),getColecao('templates')
    ]).then(function(r){
      return {ok:true, agendamentos:r[0], clientes:r[1], vendedores:r[2], servicos:r[3], templates:r[4], respostas:[]};
    }).catch(function(err){ return {ok:false, erro:err.message}; });
  }
  function getRespostasAgendamentosVendedor(p){
    var ids=p.idsAgendamentos||[];
    if(!ids.length) return Promise.resolve({ok:true,respostas:[]});
    return db().collection('agendamentos_respostas').where('IdAgendamento','in',ids.slice(0,30)).get()
      .then(snapshotToArray)
      .then(function(respostas){ return {ok:true, respostas:respostas}; })
      .catch(function(err){ return {ok:false, erro:err.message}; });
  }
  function salvarAgendamento(p){
    var id=p.idAgendamento;
    if(!id) return Promise.resolve({ok:false,erro:'idAgendamento é obrigatório.'});
    var doc=semUndefined({
      IdAgendamento:id, IdCliente:p.idCliente||'', IdServico:p.idServico||'',
      TecnicoResponsavel:p.tecnicoResponsavel||'', Valor:paraNumero(p.valor),
      'Data Inicio':p.dataInicio||'', 'Hora inicio':p.horaInicio||'', 'Hora Fim':p.horaFim||'',
      'Status Agendamento':p.statusAgendamento||'Agendado', 'Motivo Cancelamento':p.motivoCancelamento||'',
      'Observacao Comercial':p.observacaoComercial||'',
      'Quantidade de Modulos':p.quantidadeModulos||'', 'Modelo Modulos':p.modeloModulos||'',
      'Quantidade Inversores':p.quantidadeInversores||'', 'Modelo Inversores':p.modeloInversores||''
    });
    return db().collection('agendamentos').doc(id).set(doc,{merge:true})
      .then(function(){ return {ok:true,idAgendamento:id}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }
  function atualizarStatusAgendamento(p){
    var id=p.idAgendamento;
    if(!id||!p.status) return Promise.resolve({ok:false,erro:'Dados incompletos.'});
    var patch={'Status Agendamento':p.status,'Motivo Cancelamento':p.status==='Cancelado'?(p.motivoCancelamento||''):''};
    return db().collection('agendamentos').doc(id).update(patch)
      .then(function(){ return {ok:true}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }
  function excluirAgendamento(p){
    return db().collection('agendamentos').doc(p.idAgendamento).delete()
      .then(function(){ return {ok:true}; })
      .catch(function(err){ return {ok:false,erro:err.message}; });
  }
  // PDF e assinatura digital (Autentique) dependem de integrações externas
  // que não fazem parte desse piloto — sem Apps Script real por trás, não
  // tem como gerar PDF nem mandar pra assinatura de verdade. Erro claro em
  // vez de fingir sucesso.
  function semIntegracaoNessePiloto(){
    return Promise.resolve({ok:false,erro:'Geração de PDF/assinatura digital ainda não faz parte desse piloto Firestore.'});
  }

  // ── Telas que combinam dado JÁ real (clientes/vendedores/servicos/vendas)
  // com dado que genuinamente ainda não existe em nenhum lugar (custos da
  // venda, relatórios, planos, ponto/overrides) — a parte real vem do
  // Firestore, a parte não migrada fica vazia mesmo, de propósito.
  function getCustosVendaData(){
    return Promise.all([getColecao('vendas'),getColecao('clientes'),getColecao('servicos')]).then(function(r){
      return {ok:true, custos:[], vendas:r[0], clientes:r[1], servicos:r[2]};
    }).catch(function(err){ return {ok:false, erro:err.message}; });
  }
  function getRelatoriosData(){
    return getColecao('vendedores').then(function(vendedores){
      return {ok:true, relatorios:[], vendedores:vendedores};
    }).catch(function(err){ return {ok:false, erro:err.message}; });
  }
  function getPlanosData(){
    return Promise.all([getColecao('clientes'),getColecao('vendedores')]).then(function(r){
      return {ok:true, planos:[], clientes:r[0], vendedores:r[1]};
    }).catch(function(err){ return {ok:false, erro:err.message}; });
  }
  function getDataPonto(){
    return getColecao('vendedores').then(function(vendedores){
      return {ok:true, vendedores:vendedores, ponto:[], overrides:{}};
    }).catch(function(err){ return {ok:false, erro:err.message}; });
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

  // Avisa o indicador global de sincronização (window.SGSync, em sg-auth.js)
  // enquanto uma escrita está em voo — só nas ações de escrita, nunca nas de
  // leitura (getXData). "resumoFn" descreve o registro pra aparecer no
  // painel de pendências (ex: nome do cliente, valor da venda).
  function comSync(colecao,resumoFn,fn){
    return function(payload){
      var idPendente=window.SGSync?window.SGSync.iniciar(colecao,resumoFn(payload)):null;
      function finalizar(){ if(window.SGSync&&idPendente!==null)window.SGSync.concluir(idPendente); }
      return fn(payload).then(function(resp){ finalizar(); return resp; }).catch(function(err){ finalizar(); throw err; });
    };
  }

  window.SGFireActions={
    getClientesData:comAuthPronto(getClientesData),
    salvarCliente:comSync('clientes',function(p){return p.nome||p.idCliente;},comAuthPronto(salvarCliente)),
    excluirCliente:comSync('clientes',function(p){return 'excluir '+p.idCliente;},comAuthPronto(excluirCliente)),
    getVendasData:comAuthPronto(getVendasData),
    salvarVenda:comSync('vendas',function(p){return 'venda de R$ '+(p.valor||0);},comAuthPronto(salvarVenda)),
    excluirVenda:comSync('vendas',function(p){return 'excluir '+p.idVenda;},comAuthPronto(excluirVenda)),
    getFunilData:comAuthPronto(getFunilData),
    salvarFunil:comSync('funil',function(p){return 'lead ('+(p.etapa||'')+')';},comAuthPronto(salvarFunil)),
    excluirFunil:comSync('funil',function(p){return 'excluir '+p.idOportunidade;},comAuthPronto(excluirFunil)),

    listVendedoresAdmin:comAuthPronto(listVendedoresAdmin),
    salvarVendedor:comSync('vendedores',function(p){return p.nome||p.idVendedor;},comAuthPronto(salvarVendedor)),

    getServicosData:comAuthPronto(getServicosData),
    salvarServico:comSync('servicos',function(p){return p.nomeServico||p.idServico;},comAuthPronto(salvarServico)),
    excluirServico:comSync('servicos',function(p){return 'excluir '+p.idServico;},comAuthPronto(excluirServico)),
    salvarTemplate:comSync('templates',function(p){return p.textoPergunta||p.idTemplate;},comAuthPronto(salvarTemplate)),
    excluirTemplate:comSync('templates',function(p){return 'excluir '+p.idTemplate;},comAuthPronto(excluirTemplate)),

    getCatalogoProdutos:comAuthPronto(getCatalogoProdutos),
    salvarModulo:comSync('produtos_modulos',function(p){return p.modelo||p.idModulo;},comAuthPronto(salvarModulo)),
    excluirModulo:comSync('produtos_modulos',function(p){return 'excluir '+p.idModulo;},comAuthPronto(excluirModulo)),
    salvarInversor:comSync('produtos_inversores',function(p){return p.modelo||p.idInversor;},comAuthPronto(salvarInversor)),
    excluirInversor:comSync('produtos_inversores',function(p){return 'excluir '+p.idInversor;},comAuthPronto(excluirInversor)),

    getAgendamentosData:comAuthPronto(getAgendamentosData),
    getRespostasAgendamentosVendedor:comAuthPronto(getRespostasAgendamentosVendedor),
    salvarAgendamento:comSync('agendamentos',function(p){return 'agendamento de '+(p.idCliente||'');},comAuthPronto(salvarAgendamento)),
    atualizarStatusAgendamento:comSync('agendamentos',function(p){return 'status → '+(p.status||'');},comAuthPronto(atualizarStatusAgendamento)),
    excluirAgendamento:comSync('agendamentos',function(p){return 'excluir '+p.idAgendamento;},comAuthPronto(excluirAgendamento)),
    gerarPdfOS:semIntegracaoNessePiloto,
    enviarOSParaAssinatura:semIntegracaoNessePiloto,
    verificarStatusOS:semIntegracaoNessePiloto,

    getCustosVendaData:comAuthPronto(getCustosVendaData),
    getRelatoriosData:comAuthPronto(getRelatoriosData),
    getPlanosData:comAuthPronto(getPlanosData),
    getData:comAuthPronto(getDataPonto)
  };
})();
