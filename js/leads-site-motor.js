// ════ LEADS DO SITE: motor de promoção (2026-09-29) ════
// O site institucional da Solar Green nunca escreve em `funil` nem em `clientes`.
// Ele grava numa antessala (`leads_site`, só criação, sem leitura pública) e
// este motor, rodando dentro do ERP autenticado, promove cada lead: acha ou
// cria o cliente (mesmos 8 últimos dígitos do telefone), escolhe o vendedor em
// rodízio e cria o lead em "Novo Lead" com a origem "Site".
// Ver segundo-cerebro: crença 12 e Site Solar Green/docs/01-acervo-empresa.md §8.
//
// Este arquivo NÃO toca em window nem no firebase global: tudo entra por
// `deps`, o que deixa o mesmo código rodar no navegador e nos testes contra o
// emulador (_tools/testar-leads-site.js).
(function(raiz){
  var LIMITE_PROCESSANDO_MS=2*60*1000;   // "processando" há mais que isso = quem reivindicou caiu no meio
  var JANELA_DUPLICADO_MS=24*60*60*1000;

  // Serviço escolhido no formulário do site -> serviço do catálogo do ERP,
  // por nome. Sem correspondência, o lead entra sem serviço (o vendedor define).
  var SERVICOS_SITE=[
    {rotulo:'Limpeza e manutenção',padrao:/limpeza|manuten/i},
    {rotulo:'Monitoramento',padrao:/monitor/i},
    {rotulo:'Regularização na Equatorial',padrao:/regulariz|homolog|equatorial/i},
    {rotulo:'Expansão da usina',padrao:/expans|ampli/i}
  ];

  function semAcento(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,''); }

  // Confere com o catálogo real (2026-09-29): o mesmo padrão de nome pode achar
  // mais de um serviço ("Limpeza e manutenção" bate em "Limpeza", "Manutenção
  // Preventiva", "Manutenção Corretiva" e "Manutenção Drywall" ao mesmo tempo).
  // Adivinhar qual delas o cliente quis é pior que deixar em branco: o vendedor
  // já lê o pedido certo na observação e escolhe o serviço com a pessoa ao
  // telefone. Só preenche quando existe exatamente UM serviço candidato.
  function mapearServico(rotuloSite,servicos){
    var alvo=null;
    SERVICOS_SITE.forEach(function(s){ if(!alvo&&s.rotulo===rotuloSite)alvo=s; });
    if(!alvo)return '';
    var achados=[];
    for(var i=0;i<servicos.length;i++){
      var nome=semAcento(servicos[i]['Nome Servico']||servicos[i].Nome||'');
      if(alvo.padrao.test(nome))achados.push(String(servicos[i].IdServico||''));
    }
    return achados.length===1?achados[0]:'';
  }

  // Pipeline onde o lead nasce: o que tem a etapa "Novo Lead", com preferência
  // pelo chamado "Comercial".
  function escolherPipeline(pipelines){
    var candidatos=(pipelines||[]).filter(function(p){
      return (p.Etapas||[]).some(function(e){ return e.Nome==='Novo Lead'; });
    });
    var comercial=candidatos.filter(function(p){ return semAcento(p.Nome).toLowerCase()==='comercial'; })[0];
    var achado=comercial||candidatos[0];
    return achado?String(achado.IdPipeline||''):'';
  }

  function moeda(n){ return 'R$ '+Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0}); }

  // Texto que o vendedor lê na observação do lead: quem é, o que pediu e o
  // diagnóstico que a calculadora do site já mostrou pra pessoa.
  function montarObservacoes(lead,clienteJaExistia,vendedorAnterior){
    var linhas=['Lead do site (formulário).','Serviço de interesse: '+(lead.servico||'não informado')+'.'];
    if(lead.cidade)linhas.push('Cidade informada: '+lead.cidade+'.');
    if(lead.calcPlacas){
      var d='Diagnóstico da calculadora do site: '+lead.calcPlacas+' placas de '+(lead.calcPotenciaW||'?')+' W';
      if(lead.calcKwp)d+=' ('+String(lead.calcKwp).replace('.',',')+' kWp)';
      if(lead.calcCidade)d+=' em '+lead.calcCidade+(lead.calcForaDaLista?' (cidade fora da lista, média da região)':'');
      if(lead.calcDesempenho)d+=', desempenho estimado '+Math.round(lead.calcDesempenho*100)+'%';
      if(lead.calcTarifa)d+=', tarifa R$ '+Number(lead.calcTarifa).toFixed(2).replace('.',',')+'/kWh';
      if(lead.calcPerdaAno)d+=', perda estimada '+moeda(lead.calcPerdaAno)+' por ano';
      linhas.push(d+'.');
    }
    var origem=[lead.utmSource,lead.utmMedium,lead.utmCampaign].filter(Boolean).join(' / ');
    if(origem)linhas.push('Campanha: '+origem+'.');
    linhas.push(clienteJaExistia?'Cliente já estava cadastrado (mesmo telefone).':'Cliente novo, criado a partir do site.');
    if(vendedorAnterior)linhas.push('Vendedor anterior deste cliente: '+vendedorAnterior+'.');
    return linhas.join('\n');
  }

  function criar(deps){
    var emAndamento=false, refazer=false, ultimaLista=[];

    function ref(id){ return deps.db.collection('leads_site').doc(String(id)); }
    function atualizar(id,patch){ return ref(id).update(patch); }

    // Só um navegador por vez promove o mesmo lead: quem ganhar a transação
    // fica com ele. Os ids do cliente e do lead novos são gravados junto, então
    // uma segunda tentativa (se o navegador cair no meio) reaproveita os mesmos.
    function reivindicar(id,suspeitoDestino){
      var r=ref(id);
      return deps.db.runTransaction(function(tx){
        return tx.get(r).then(function(snap){
          if(!snap.exists)return null;
          var d=snap.data();
          var agora=deps.agora();
          var parado=d.status==='processando'&&(agora-(d.processandoEm||0))>LIMITE_PROCESSANDO_MS;
          if(d.status!=='novo'&&!parado)return null;
          if(suspeitoDestino){ tx.update(r,{status:'suspeito'}); return null; }
          var patch={
            status:'processando', processandoEm:agora, processandoPor:String(deps.sessao().idVendedor||''),
            idOportunidade:d.idOportunidade||deps.gerarId(), idClienteNovo:d.idClienteNovo||deps.gerarId()
          };
          tx.update(r,patch);
          var completo={}; Object.keys(d).forEach(function(k){ completo[k]=d[k]; });
          Object.keys(patch).forEach(function(k){ completo[k]=patch[k]; });
          completo.id=snap.id;
          return completo;
        });
      });
    }

    // Vendedor da vez: próximo, por IdVendedor, depois do último sorteado.
    // Sem vendedor ativo, o lead não pode ficar sem dono nem sumir: cai em
    // quem estiver com o ERP aberto e a observação avisa.
    function escolherVendedor(vendedores){
      var ativos=(vendedores||[]).filter(deps.ehVendedorAtivo).sort(function(a,b){
        return String(a.IdVendedor).localeCompare(String(b.IdVendedor));
      });
      if(!ativos.length)return Promise.resolve({idVendedor:String(deps.sessao().idVendedor||''),semAtivo:true});
      var r=deps.db.collection('config').doc('rodizio_site');
      return deps.db.runTransaction(function(tx){
        return tx.get(r).then(function(snap){
          var ultimo=snap.exists?snap.data().ultimoIdVendedor:'';
          var idx=-1;
          ativos.forEach(function(v,i){ if(String(v.IdVendedor)===String(ultimo))idx=i; });
          var prox=ativos[(idx+1)%ativos.length];
          tx.set(r,{ultimoIdVendedor:String(prox.IdVendedor),atualizadoEm:deps.agora()});
          return {idVendedor:String(prox.IdVendedor),semAtivo:false};
        });
      });
    }

    function ehDuplicado(lead,lista){
      var fim8=deps.fim8(lead.whatsapp);
      if(!fim8)return null;
      var agora=deps.agora();
      for(var i=0;i<lista.length;i++){
        var o=lista[i];
        if(o.id===lead.id||o.status!=='promovido')continue;
        if(o.servico!==lead.servico)continue;
        if(deps.fim8(o.whatsapp)!==fim8)continue;
        if(agora-(o.promovidoEmMs||0)<=JANELA_DUPLICADO_MS)return o;
      }
      return null;
    }

    function ok(resp,acao){
      if(!resp||!resp.ok)throw new Error((resp&&resp.erro)||('falha em '+acao));
      return resp;
    }

    function promover(lead,lista){
      var dup=ehDuplicado(lead,lista);
      if(dup)return atualizar(lead.id,{status:'duplicado',duplicadoDe:dup.id,erroPromocao:''});
      return Promise.all([deps.obterClientes(),deps.obterVendedores(),deps.obterServicos(),deps.obterPipelines()]).then(function(r){
        var clientes=r[0], vendedores=r[1], servicos=r[2], pipelines=r[3];
        var fim8=deps.fim8(lead.whatsapp);
        var existente=null;
        if(fim8)clientes.forEach(function(c){ if(!existente&&deps.fim8(c.Telefone)===fim8)existente=c; });
        return escolherVendedor(vendedores).then(function(esc){
          var idCliente=existente?String(existente.IdCliente):lead.idClienteNovo;
          // Cliente que já existia vai pro vendedor da vez (decisão de 2026-09-29), mas o
          // lead leva uma marca com o nome de quem já cuidava dele.
          var vendedorAnterior='';
          if(existente&&existente['Vendedor Responsavel']){
            vendedores.forEach(function(v){
              if(String(v.IdVendedor)===String(existente['Vendedor Responsavel'])&&String(v.IdVendedor)!==esc.idVendedor)vendedorAnterior=v.Nome||'';
            });
          }
          var criarCliente=existente?Promise.resolve():deps.salvarCliente({
            idCliente:idCliente, nome:lead.nome, tipoPessoa:'Física', telefone:deps.formatarTelefone(lead.whatsapp),
            origem:'Site', statusCliente:'Lead', vendedorResponsavel:esc.idVendedor
          }).then(function(resp){ ok(resp,'criar o cliente'); });
          return criarCliente.then(function(){
            var obs=montarObservacoes(lead,!!existente,vendedorAnterior);
            if(esc.semAtivo)obs+='\nNenhum vendedor ativo no momento do cadastro: lead atribuído a quem estava com o ERP aberto.';
            return deps.salvarFunil({
              idOportunidade:lead.idOportunidade, idCliente:idCliente, idVendedor:esc.idVendedor,
              idServico:mapearServico(lead.servico,servicos), etapa:'Novo Lead', observacoes:obs,
              valorEstimado:0, motivoPerda:'', pipeline:escolherPipeline(pipelines), origem:'Site', vendedorAnterior:vendedorAnterior
            });
          }).then(function(resp){ ok(resp,'criar o lead no funil'); }).then(function(){
            var agora=deps.agora();
            return atualizar(lead.id,{
              status:'promovido', idCliente:idCliente, idVendedor:esc.idVendedor, clienteJaExistia:!!existente, vendedorAnterior:vendedorAnterior,
              promovidoEm:new Date(agora).toISOString(), promovidoEmMs:agora, erroPromocao:''
            });
          });
        });
      });
    }

    function tratar(lead,lista){
      var suspeito=lead.suspeito===true&&lead.status==='novo';
      return reivindicar(lead.id,suspeito).then(function(reivindicado){
        if(!reivindicado)return null;
        return promover(reivindicado,lista).catch(function(err){
          return atualizar(lead.id,{status:'erro',erroPromocao:String((err&&err.message)||err).slice(0,300)}).catch(function(e2){
            if(deps.log)deps.log('Não consegui nem registrar o erro do lead '+lead.id,e2);
          });
        });
      });
    }

    function pendentes(lista){
      var agora=deps.agora();
      return lista.filter(function(l){
        if(l.status==='novo')return true;
        return l.status==='processando'&&(agora-(l.processandoEm||0))>LIMITE_PROCESSANDO_MS;
      }).sort(function(a,b){ return (a.criadoEmMs||0)-(b.criadoEmMs||0); });
    }

    // Chamado a cada atualização da coleção. Serial de propósito: o rodízio e a
    // conferência de duplicado dependem de um lead terminar antes do próximo.
    function processar(lista){
      ultimaLista=lista;
      if(emAndamento){ refazer=true; return Promise.resolve(); }
      var fila=pendentes(lista);
      if(!fila.length)return Promise.resolve();
      emAndamento=true;
      var seguinte=Promise.resolve();
      fila.forEach(function(lead){ seguinte=seguinte.then(function(){ return tratar(lead,ultimaLista); }); });
      return seguinte.catch(function(err){ if(deps.log)deps.log('Motor de leads do site falhou:',err); }).then(function(){
        emAndamento=false;
        if(refazer){ refazer=false; return processar(ultimaLista); }
      });
    }

    return {processar:processar,escolherVendedor:escolherVendedor,atualizar:atualizar,pendentes:pendentes};
  }

  var api={criar:criar,mapearServico:mapearServico,escolherPipeline:escolherPipeline,montarObservacoes:montarObservacoes,
    LIMITE_PROCESSANDO_MS:LIMITE_PROCESSANDO_MS};
  raiz.SGLeadsSiteMotor=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
