// ════ VENDAS ════
(function(){
(function(){

  var _epoca=window.SGEpoca.criar();
  var vendedoresMap={},sortState={col:'faturado',dir:'desc'},vendedoresAtivosVenda=[],vendasRecords=[],metasRecords=[],funilRecords=[],custosVendaRecords=[],servicosMap={};
  var clientesMap={};
  // Cliente cadastrado via "+ Cadastrar cliente" no Funil, na mesma sessão —
  // sem isso, essa tela só enxergaria ele depois de recarregar a página.
  document.addEventListener('sg:cliente-criado',function(e){ if(e.detail&&e.detail.IdCliente)clientesMap[e.detail.IdCliente]=e.detail; });
  var vendedoresTodosMapVendas={};
  var metasIndividuaisMap={}; // 'idVendedor|ano|mes' -> valor da sobreposição
  var vendaAtual=null;
  var custoEditandoId=null;
  var vPaginaAtual=1, V_ITENS_POR_PAGINA=10;
  var API_URL_KEY='ponto_api_url',API_KEY_KEY='ponto_api_key';
  var DEFAULT_API_URL='https://script.google.com/macros/s/AKfycbzFCy8PyBZBODgA34xrlLTVUUNhKBIlguJT3ectH7Yus-VW1n41GcCclc5q_Yj0Di2O7g/exec';
  var DEFAULT_API_KEY='1234';
  var ID_CLIENTE_APORTE_SOCIOS='da6dbd89'; // Cliente Teste 1 — aporte de sócios, não conta como faturamento/meta
  var vendasRecordsFaturamento=[];
  var vendasEscritorioIds={}; // idVenda -> true, pra qualquer venda "gaveta" do Cliente Teste 1 (custo de escritório lançado nela)
  var APP_VERSION='2026-07-16-1';
  document.getElementById('v-appVersion').textContent='v'+APP_VERSION;
  document.getElementById('appVersionFoot').textContent=APP_VERSION;

  function getApiUrl(){return(localStorage.getItem(API_URL_KEY)||'').trim()||DEFAULT_API_URL;}
  function getApiKey(){return(localStorage.getItem(API_KEY_KEY)||'').trim()||DEFAULT_API_KEY;}
  function setApiCreds(u,k){localStorage.setItem(API_URL_KEY,u.trim());localStorage.setItem(API_KEY_KEY,k.trim());}
  function hasApiCreds(){return !!getApiUrl()&&!!getApiKey();}
  // Delega pra SGAuth.apiCall (mesmos localStorage keys) — ganha
  // solicitanteId automático (Fase A), a causa raiz do bug original nesse
  // módulo. getApiUrl/getApiKey/hasApiCreds continuam — hasApiCreds() é
  // usado em fetchFromApi() pra decidir se tenta buscar antes de chamar.
  function apiCall(action,extra){ return window.SGAuth.apiCall(action,extra); }
  function setSyncPill(state,text){var pill=document.getElementById('v-syncPill'),pt=document.getElementById('v-syncPillText');if(!pill)return;pill.style.display='flex';pill.classList.remove('saving','error');if(state==='saving')pill.classList.add('saving');if(state==='error')pill.classList.add('error');pt.textContent=text;}
  function setUpdateClock(){var d=new Date();document.getElementById('v-lastUpdate').textContent='Atualizado em '+d.toLocaleDateString('pt-BR')+' às '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
  setUpdateClock();
  function parseBRNumber(val){ return window.SGUtil.parseBRNumber(val); }
  function parseBRDate(str){ return window.SGUtil.parseBRDate(str); }
  function dateKey(d){ return window.SGUtil.dateKey(d); }
  function fmtMoney(n){ return window.SGUtil.fmtMoney(n); }
  function escapeHtml(s){ return window.SGUtil.escapeHtml(s); }
  function isDiaUtil(d){var dow=d.getDay();return dow!==0&&dow!==6;}
  function countDiasUteis(start,end){var count=0,cursor=new Date(start.getTime());while(cursor<=end){if(isDiaUtil(cursor))count++;cursor.setDate(cursor.getDate()+1);}return count;}
  function isVendedorAtivo(v){return(v.Tipo||'').trim()==='Vendedor'&&(v.Status||'').trim()==='Ativo';}
  // Vendas feitas pelo CEO não entram nos indicadores/meta agregados da
  // empresa (ele já não conta como "vendedor ativo" pra divisão de meta, mas
  // as vendas dele continuavam inflando Faturado/Ticket/Lucro/Saldo) — mas
  // continuam aparecendo normalmente na linha dele na tabela por vendedor,
  // e se alguém filtrar especificamente por ele no seletor.
  function vendaEhDeCEO(v){var vd=vendedoresMap[v.idVendedor];return !!(vd&&(vd.Tipo||'').trim().toLowerCase()==='ceo');}
  function nomeFor(id){var v=vendedoresMap[id];return(v&&v.Nome)||('Vendedor '+String(id).slice(0,8));}

  function processVendedores(list){vendedoresMap={};vendedoresAtivosVenda=[];list.forEach(function(v){if(!v.IdVendedor)return;vendedoresMap[v.IdVendedor]=v;if(isVendedorAtivo(v))vendedoresAtivosVenda.push(v.IdVendedor);});}
  function processVendas(list){var out=[];list.forEach(function(o){if(!o.IdVenda)return;var dt=parseBRDate(o.DataVenda);if(!dt)return;out.push({idVenda:o.IdVenda,idCliente:o.IdCliente,idServico:o.IdServico,idVendedor:o.IdVendedor,dt:dt,dateKey:dateKey(dt),valor:parseBRNumber(o.Valor),nomeCliente:(o.NomeCliente||'').trim(),telefoneCliente:(o.TelefoneCliente||'').trim()});});return out;}

  /**
   * Preenche clientesMap com o nome já gravado em cada venda
   * (NomeCliente — 2026-09-03), pra lista/histórico/detalhe mostrarem o nome
   * SEM baixar a coleção `clientes` inteira (era uma das causas de estourar a
   * cota diária de leitura). A coleção só carrega sob demanda, quando o
   * seletor de cliente de "Nova venda" é aberto. Ver
   * segundo-cerebro/padroes/dados-e-seguranca.md.
   */
  function seedClientesDoDenormVendas(records){
    (records||[]).forEach(function(r){
      if(!r.idCliente||clientesMap[r.idCliente])return;
      if(!r.nomeCliente)return;
      clientesMap[r.idCliente]={IdCliente:r.idCliente,'Nome Razao Social':r.nomeCliente,Telefone:r.telefoneCliente||'',_parcial:true};
    });
  }
  var _clientesAssinadosVendas=false;
  function garantirClientesCarregadosVendas(){
    if(_clientesAssinadosVendas)return;
    _clientesAssinadosVendas=true;
    window.SGUtil.assinarColecao('clientes',function(lista){
      lista.forEach(function(c){ if(c.IdCliente)clientesMap[c.IdCliente]=c; });
      var busca=document.getElementById('vm-clienteBusca');
      if(busca&&document.activeElement===busca)busca.dispatchEvent(new Event('focus'));
    });
  }
  function processMetas(list){var out=[];list.forEach(function(o){if(!o.IdMeta)return;out.push({mes:parseInt(o.Mes,10),ano:parseInt(o.Ano,10),valor:parseBRNumber(o.Valor)});});return out;}
  /**
   * Taxas de conversão médias (Novos Contatos/Conversas/Propostas) agora vêm
   * direto da movimentação do Funil, não mais de um lançamento manual diário
   * (ver segundo-cerebro/padroes/funil-crm.md). Cada lead do funil vira um
   * registro com a data de criação (pra contar "Novos Contatos" por período,
   * por lead — nunca por movimentação) e o array de Transições (pra contar
   * "Conversas"/"Propostas" como eventos dentro do período).
   */
  function processFunilVendas(list){
    var out=[];
    list.forEach(function(o){
      var id=o.IdOportunidade||o.IdFunil;
      if(!id)return;
      var dt=parseBRDate(o.DataCriacao||o['Data Criacao']||'');
      if(!dt)return;
      // idCliente/dt/etapa adicionados em 2026-08-24 pro drill-down dos KPIs
      // clicáveis (ver ligarDrillDownKpisVendas) — antes esse registro só
      // trazia o mínimo pras contas de conversão, sem dar pra identificar
      // QUEM é o lead por trás do número.
      out.push({id:id,idCliente:o.IdCliente,idVendedor:o.IdVendedor,etapa:(o.Etapa||'').trim(),dt:dt,dateKey:dateKey(dt),transicoes:o.Transicoes||[],atividades:o.Atividades||[]});
    });
    return out;
  }
  function processCustosVenda(list){var out=[];list.forEach(function(o){if(!o.IdCusto)return;var dt=parseBRDate(o.Data);out.push({id:o.IdCusto,idVenda:o.IdVenda,descricao:(o.Descricao||'').trim(),status:(o.Status||'').trim(),dt:dt,dateKey:dt?dateKey(dt):null,valor:parseBRNumber(o.Valor)});});return out;}
  function processServicos(list){var map={};list.forEach(function(o){if(!o.IdServico)return;map[o.IdServico]=o['Nome Servico']||o.IdServico;});return map;}

  function sortVendedorRows(rows){
    var col=sortState.col,dir=sortState.dir;
    rows.sort(function(a,b){
      if(col==='vendedor'){var c=a.nome.localeCompare(b.nome,'pt-BR');return dir==='asc'?c:-c;}
      var fm={meta:'meta',faturado:'faturado',metaAteHoje:'metaAteHoje',ritmo:'ritmo',vendas:'vendas',ticket:'ticket',necessarias:'necessarias',progresso:'progresso'};
      var key=fm[col]||'faturado',av=a[key],bv=b[key];
      if(key==='necessarias'){if(av===-1&&bv===-1)return 0;if(av===-1)return 1;if(bv===-1)return -1;}
      return dir==='asc'?(av-bv):-(av-bv);
    });
  }

  function populateSelects(){
    var selV=document.getElementById('selVendedor'),curV=selV.value||'__all__';
    var idsV=Object.keys(vendedoresMap).filter(function(id){return vendasRecords.some(function(v){return v.idVendedor===id;})||vendedoresAtivosVenda.indexOf(id)!==-1;});
    idsV.sort(function(a,b){return nomeFor(a).localeCompare(nomeFor(b),'pt-BR');});
    selV.innerHTML='<option value="__all__">Todos os vendedores</option>';
    idsV.forEach(function(id){var opt=document.createElement('option');opt.value=id;opt.textContent=nomeFor(id);selV.appendChild(opt);});
    selV.value=idsV.indexOf(curV)!==-1||curV==='__all__'?curV:'__all__';
    var selS=document.getElementById('selServico'),curS=selS.value||'__all__';
    var idsS=Object.keys(servicosMap).filter(function(id){return vendasRecords.some(function(v){return v.idServico===id;});});
    idsS.sort(function(a,b){return servicosMap[a].localeCompare(servicosMap[b],'pt-BR');});
    selS.innerHTML='<option value="__all__">Todos os serviços</option>';
    idsS.forEach(function(id){var opt=document.createElement('option');opt.value=id;opt.textContent=servicosMap[id];selS.appendChild(opt);});
    selS.value=idsS.indexOf(curS)!==-1||curS==='__all__'?curS:'__all__';
  }

  function setDefaultDateRange(){var now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1),last=new Date(now.getFullYear(),now.getMonth()+1,0);document.getElementById('v-dateFrom').value=dateKey(first);document.getElementById('v-dateTo').value=dateKey(last);}
  function getMetaDoMes(ano,mes){var m=metasRecords.filter(function(x){return x.ano===ano&&x.mes===mes;})[0];return m?m.valor:0;}
  function parseISODate(s){var p=s.split('-');return new Date(parseInt(p[0],10),parseInt(p[1],10)-1,parseInt(p[2],10));}

  function metaOverrideDoVendedor(idVendedor,ano,mes){
    return metasIndividuaisMap[idVendedor+'|'+ano+'|'+mes]||null;
  }

  function computeMetaContext(){
    var toStr=document.getElementById('v-dateTo').value,refDate=toStr?parseISODate(toStr):new Date();
    var ano=refDate.getFullYear(),mes=refDate.getMonth()+1;
    var metaEmpresaBruta=getMetaDoMes(ano,mes),nVA=vendedoresAtivosVenda.length||1;
    var metaIndPadrao=nVA>0?metaEmpresaBruta/nVA:0;

    // Meta efetiva de cada vendedor ativo: usa a sobreposição manual quando
    // existir, senão cai na fatia padrão (empresa ÷ ativos). A meta "da
    // empresa" pro contexto agregado passa a ser a SOMA dessas metas
    // efetivas — mesmo que ultrapasse o valor bruto cadastrado na aba Metas,
    // porque é isso que reflete o que foi combinado pessoa a pessoa.
    var somaMetasEfetivas=0;
    vendedoresAtivosVenda.forEach(function(id){
      var over=metaOverrideDoVendedor(id,ano,mes);
      somaMetasEfetivas+=over?over.valor:metaIndPadrao;
    });
    var metaEmpresaEfetiva=somaMetasEfetivas;

    var p1=new Date(ano,mes-1,1),pu=new Date(ano,mes,0),du=countDiasUteis(p1,pu);
    var mdE=du>0?metaEmpresaEfetiva/du:0;
    var hoje=new Date();hoje=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate());
    var limite=refDate<hoje?refDate:hoje;if(limite<p1)limite=new Date(p1.getTime()-86400000);
    var fimC=limite>pu?pu:limite,dud=fimC>=p1?countDiasUteis(p1,fimC):0;
    var mahE=mdE*dud;
    var iR=hoje>p1?hoje:p1,dur=iR<=pu?countDiasUteis(iR,pu):0;
    return{ano:ano,mes:mes,metaEmpresa:metaEmpresaBruta,metaEmpresaEfetiva:metaEmpresaEfetiva,
      metaIndividual:metaIndPadrao,metaDiariaEmpresa:mdE,diasUteisMes:du,diasUteisDecorridos:dud,
      diasUteisRestantes:dur,metaAteHojeEmpresa:mahE,nVendedoresAtivos:nVA};
  }

  /**
   * Meta efetiva de UM vendedor específico (override manual se existir,
   * senão a fatia padrão) — usada quando o filtro está travado numa pessoa só.
   */
  function metaEfetivaDoVendedor(idVendedor,ano,mes,metaIndPadrao){
    var over=metaOverrideDoVendedor(idVendedor,ano,mes);
    return over?over.valor:metaIndPadrao;
  }


  /**
   * O custo de escritório é despesa geral, não pertence a um vendedor/serviço
   * específico — mas quando o filtro está travado numa pessoa/serviço só, não
   * faz sentido jogar o custo de escritório da empresa INTEIRA em cima de uma
   * fatia. Rateia proporcional à fatia de faturamento do filtro atual: se o
   * filtro representa 20% do faturamento total da empresa no período, ele
   * carrega 20% do custo de escritório — não os 100%.
   */
  function custoEscritorioProporcional(ceTotal,fatFiltrado){
    var from=document.getElementById('v-dateFrom').value,to=document.getElementById('v-dateTo').value;
    var fatTotalPeriodo=vendasRecordsFaturamento.filter(function(v){
      if(from&&v.dateKey<from)return false;
      if(to&&v.dateKey>to)return false;
      if(vendaEhDeCEO(v))return false;
      return true;
    }).reduce(function(s,v){return s+v.valor;},0);
    if(fatTotalPeriodo<=0)return 0;
    var proporcao=fatFiltrado/fatTotalPeriodo;
    return ceTotal*proporcao;
  }

  function getFiltered(){
    var from=document.getElementById('v-dateFrom').value,to=document.getElementById('v-dateTo').value;
    var vendedor=document.getElementById('selVendedor').value,servico=document.getElementById('selServico').value;
    function passaFiltro(v){if(from&&v.dateKey<from)return false;if(to&&v.dateKey>to)return false;if(vendedor!=='__all__'&&v.idVendedor!==vendedor)return false;if(servico!=='__all__'&&v.idServico!==servico)return false;return true;}
    var vendasTodas=vendasRecords.filter(passaFiltro); // pra tabela de vendas individuais (mostra tudo, inclusive aporte de sócios)
    var vendas=vendasRecordsFaturamento.filter(passaFiltro); // pra faturamento/meta/ticket médio (sem aporte de sócios)
    // "Novos Contatos" conta por lead criado no período (nunca por movimentação —
    // ver segundo-cerebro/padroes/funil-crm.md), então filtra só por dateKey de
    // criação + vendedor, sem filtro de serviço (funil não tem "serviço" definido
    // logo na criação do lead, em geral).
    var funilNovosContatos=funilRecords.filter(function(f){if(from&&f.dateKey<from)return false;if(to&&f.dateKey>to)return false;if(vendedor!=='__all__'&&f.idVendedor!==vendedor)return false;return true;});
    var vendaIds={};vendasTodas.forEach(function(v){vendaIds[v.idVenda]=true;});
    // Custos de OPERAÇÃO pertencem a uma venda — então seguem o vendedor/serviço/data
    // DESSA venda (cada serviço/vendedor carrega o custo do que ele mesmo gerou).
    var custosOperacao=custosVendaRecords.filter(function(c){
      if(vendasEscritorioIds[c.idVenda])return false;
      if((c.status||'').trim().toLowerCase()!=='pago')return false;
      return !!vendaIds[c.idVenda];
    });
    // Custo de ESCRITÓRIO é despesa geral da empresa — não pertence a nenhum
    // vendedor/serviço específico, então só respeita o filtro de data.
    var custosEscritorio=custosVendaRecords.filter(function(c){
      if(!vendasEscritorioIds[c.idVenda])return false;
      if((c.status||'').trim().toLowerCase()!=='pago')return false;
      if(c.dateKey){if(from&&c.dateKey<from)return false;if(to&&c.dateKey>to)return false;}
      return true;
    });
    return{vendas:vendas,vendasTodas:vendasTodas,funilNovosContatos:funilNovosContatos,custos:custosOperacao,custosEscritorio:custosEscritorio,from:from,to:to,vendedor:vendedor};
  }

  function render(){
    var ctx=computeMetaContext(),filtered=getFiltered(),vs=document.getElementById('selVendedor').value;
    // Meta "selecionada": se um vendedor específico está no filtro, é a meta
    // efetiva DELE (sobreposição manual se existir); senão é a soma de todas
    // as metas efetivas de todo mundo — que pode passar do valor bruto
    // cadastrado na aba Metas, e tudo bem, é o que reflete a realidade.
    var metaSelecionada=vs==='__all__'?ctx.metaEmpresaEfetiva:metaEfetivaDoVendedor(vs,ctx.ano,ctx.mes,ctx.metaIndividual);
    var metaDiariaRitmo=ctx.diasUteisMes>0?metaSelecionada/ctx.diasUteisMes:0; // ritmo constante, usado só pra "meta até hoje"
    var metaDiariaSelecionada=ctx.diasUteisRestantes>0?metaSelecionada/ctx.diasUteisRestantes:0; // exibida no card — quanto falta fazer por dia útil daqui pro fim do mês
    var metaAteHojeSelecionada=metaDiariaRitmo*ctx.diasUteisDecorridos;

    document.getElementById('metaEmpresa').textContent=fmtMoney(ctx.metaEmpresaEfetiva);document.getElementById('metaEmpresaSub').textContent='soma das metas de '+ctx.nVendedoresAtivos+' vendedor(es) — cadastrada p/ '+String(ctx.mes).padStart(2,'0')+'/'+ctx.ano+': '+fmtMoney(ctx.metaEmpresa);
    document.getElementById('metaIndividual').textContent=fmtMoney(vs==='__all__'?(ctx.nVendedoresAtivos>0?ctx.metaEmpresaEfetiva/ctx.nVendedoresAtivos:0):metaSelecionada);
    document.getElementById('metaIndividualSub').textContent=vs==='__all__'?('÷ '+ctx.nVendedoresAtivos+' vendedor(es) ativo(s) — soma pode passar da meta bruta se houver metas manuais'):(metaOverrideDoVendedor(vs,ctx.ano,ctx.mes)?'meta manual definida pra essa pessoa':'fatia padrão (empresa ÷ ativos)');
    document.getElementById('metaDiaria').textContent=fmtMoney(metaDiariaSelecionada);document.getElementById('metaDiariaSub').textContent='meta '+(vs==='__all__'?'da empresa':'individual')+' ÷ '+ctx.diasUteisRestantes+' dia(s) útil(eis) restante(s)';
    document.getElementById('metaAteHoje').textContent=fmtMoney(metaAteHojeSelecionada);document.getElementById('metaAteHojeSub').textContent=ctx.diasUteisDecorridos+' dia(s) útil(eis) decorrido(s)';
    document.getElementById('metaHint').textContent=vs==='__all__'?'soma das metas de '+ctx.nVendedoresAtivos+' vendedor(es) ativo(s), manuais quando existirem':'cota individual de '+nomeFor(vs);
    // Indicadores agregados da empresa ("Todos os vendedores") não contam
    // vendas nem custos do CEO — mas só nessa visão agregada: se alguém
    // filtrar especificamente pelo CEO no seletor, os números dele aparecem
    // normalmente (é o que a pessoa pediu ao filtrar por ele). filtered.vendas
    // e filtered.custos continuam intactos pra tabela por vendedor abaixo.
    var vendasKPI=vs==='__all__'?filtered.vendas.filter(function(v){return !vendaEhDeCEO(v);}):filtered.vendas;
    var vendaIdsCEO={};filtered.vendasTodas.forEach(function(v){if(vendaEhDeCEO(v))vendaIdsCEO[v.idVenda]=true;});
    var custosKPI=vs==='__all__'?filtered.custos.filter(function(c){return !vendaIdsCEO[c.idVenda];}):filtered.custos;
    var fat=vendasKPI.reduce(function(s,v){return s+v.valor;},0),ma=metaSelecionada;
    var pct=ma>0?(fat/ma)*100:0,fill=document.getElementById('progressFill');
    fill.style.width=Math.min(pct,100)+'%';fill.classList.remove('over','behind');
    if(pct>=100)fill.classList.add('over');else if(pct<(ctx.diasUteisMes>0?(ctx.diasUteisDecorridos/ctx.diasUteisMes)*100-15:0))fill.classList.add('behind');
    document.getElementById('progressPct').textContent=pct.toFixed(1).replace('.',',')+' %';
    document.getElementById('progressFaturado').textContent=fmtMoney(fat)+' faturado';
    document.getElementById('progressFaltante').textContent=fmtMoney(Math.max(ma-fat,0))+' faltam';
    var nV=vendasKPI.length,tm=nV>0?fat/nV:0,tmH=vendasRecordsFaturamento.length>0?vendasRecordsFaturamento.reduce(function(s,v){return s+v.valor;},0)/vendasRecordsFaturamento.length:0;
    var ticket=tm>0?tm:tmH,ticketProj=tm<=0&&tmH>0;
    var mr=Math.max(ma-fat,0),vn=ticket>0?Math.ceil(mr/ticket):(mr>0?null:0);
    var vnt=ticket>0?Math.ceil(ma/ticket):(ma>0?null:0);
    var cv=custosKPI.reduce(function(s,c){return s+c.valor;},0),ce=filtered.custosEscritorio.reduce(function(s,c){return s+c.valor;},0);
    document.getElementById('kpiFaturado').textContent=fmtMoney(fat);document.getElementById('kpiFaturadoSub').textContent=nV+' venda(s)';
    document.getElementById('kpiTicket').textContent=fmtMoney(ticket);document.getElementById('kpiTicketSub').textContent=ticketProj?'média histórica (projetado)':(vs==='__all__'?'geral':'de '+nomeFor(vs));
    document.getElementById('kpiVendasFeitas').textContent=nV;
    document.getElementById('kpiVendasNecessarias').textContent=vn===null?'—':vn;document.getElementById('kpiVendasNecessariasSub').textContent=vn===null?'sem ticket médio':(vn===0?'meta atingida':'restantes');
    document.getElementById('kpiCustosVenda').textContent=fmtMoney(cv);document.getElementById('kpiCustosVendaSub').textContent=custosKPI.length+' lançamento(s) pago(s)';
    document.getElementById('kpiCustosEscritorio').textContent=fmtMoney(ce);
    var aporte=filtered.vendasTodas.filter(function(v){return v.idCliente===ID_CLIENTE_APORTE_SOCIOS;}).reduce(function(s,v){return s+v.valor;},0);
    document.getElementById('kpiAporteSocios').textContent=fmtMoney(aporte);
    var lucroOperacional=fat-cv;
    document.getElementById('kpiLucroOperacional').textContent=fmtMoney(lucroOperacional);
    document.getElementById('kpiLucroOperacionalSub').textContent=fmtMoney(fat)+' faturado − '+fmtMoney(cv)+' de custos';
    var saldoPeriodo=fat+aporte-cv-custoEscritorioProporcional(ce,fat);
    document.getElementById('kpiSaldoPeriodo').textContent=fmtMoney(saldoPeriodo);
    // Base: vendedores ativos (para a meta ficar sempre visível), mais qualquer
    // vendedor (ativo ou não) que tenha vendas no período filtrado — assim
    // inativar alguém não faz o faturamento dele "sumir" da tabela comparativa.
    var idsSet={};
    if(vs==='__all__'){
      vendedoresAtivosVenda.forEach(function(id){idsSet[id]=true;});
      filtered.vendas.forEach(function(v){idsSet[v.idVendedor]=true;});
    }else{
      idsSet[vs]=true;
    }
    var ids=Object.keys(idsSet);
    var linhas=ids.map(function(id){
      var vv=filtered.vendas.filter(function(v){return v.idVendedor===id;}),fv=vv.reduce(function(s,v){return s+v.valor;},0),nv=vv.length;
      var tvp=nv>0?fv/nv:0,tvh=vendasRecordsFaturamento.filter(function(v){return v.idVendedor===id;});
      var th=tvh.length>0?tvh.reduce(function(s,v){return s+v.valor;},0)/tvh.length:tmH;
      var tv=tvp>0?tvp:th,tvE=tvp<=0&&tv>0;
      var ativo=isVendedorAtivo(vendedoresMap[id]||{});
      var override=metaOverrideDoVendedor(id,ctx.ano,ctx.mes);
      var mi=ativo?(override?override.valor:ctx.metaIndividual):0,rv=ativo?Math.max(mi-fv,0):0,nv2=ativo?(tv>0?Math.ceil(rv/tv):(rv>0?null:0)):-1;
      // "meta até hoje" desse vendedor: mesma proporção dos dias úteis decorridos,
      // só que aplicada em cima da meta DELE (padrão ou sobreposta).
      var mhv=ativo&&ctx.diasUteisMes>0?(mi/ctx.diasUteisMes)*ctx.diasUteisDecorridos:0,ri=ativo?(fv-mhv):0;
      var pv=ativo&&mi>0?Math.min((fv/mi)*100,100):0;
      return{id:id,nome:nomeFor(id),ativo:ativo,meta:mi,temOverride:!!override,faturado:fv,metaAteHoje:mhv,ritmo:ri,vendas:nv,ticket:tv,ticketProjetado:tvE,necessarias:nv2===null?-1:nv2,progresso:pv};
    });
    sortVendedorRows(linhas);
    var rh='';
    linhas.forEach(function(row){
      var rc=row.ritmo>0.4?'pos':(row.ritmo<-0.4?'neg':'zero');
      var inactiveTag=row.ativo?'':' <span class="inactive-tag">inativo</span>';
      var metaCellHtml=row.ativo
        ?(fmtMoney(row.meta)+(row.temOverride?' <span title="Meta individual definida manualmente" style="color:var(--accent-deep);"><span class="inline-ico" style="margin-right:0;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></span></span>':'')+
          ' <button type="button" class="meta-edit-btn" data-id="'+escapeHtml(row.id)+'" data-nome="'+escapeHtml(row.nome)+'" data-meta="'+row.meta+'" data-override="'+(row.temOverride?'1':'0')+'" title="Definir meta individual"><span class="inline-ico" style="margin-right:0;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span></button>')
        :'—';
      rh+='<tr><td class="person-name">'+escapeHtml(row.nome)+inactiveTag+'</td><td class="num">'+metaCellHtml+'</td><td class="num">'+fmtMoney(row.faturado)+'</td><td class="num">'+(row.ativo?fmtMoney(row.metaAteHoje):'—')+'</td><td class="num bal '+(row.ativo?rc:'zero')+'">'+(row.ativo?((row.ritmo>=0?'+':'-')+fmtMoney(Math.abs(row.ritmo))):'—')+'</td><td class="num">'+row.vendas+'</td><td class="num">'+fmtMoney(row.ticket)+(row.ticketProjetado?' <span title="Projetado" style="color:var(--ink-faint);">*</span>':'')+'</td><td class="num">'+(row.necessarias===-1?'—':row.necessarias)+'</td><td>'+(row.ativo?('<span class="mini-track"><span class="mini-fill" style="width:'+row.progresso.toFixed(0)+'%;"></span></span><span style="font-size:11.5px;color:var(--ink-soft);">'+row.progresso.toFixed(0)+'%</span>'):'<span style="font-size:11.5px;color:var(--ink-faint);">—</span>')+'</td></tr>';
    });
    document.getElementById('tbodyVendedores').innerHTML=rh||'<tr><td colspan="9" style="text-align:center;color:var(--ink-faint);padding:30px;">Nenhum vendedor no filtro.</td></tr>';
    document.getElementById('tbodyVendedores').querySelectorAll('.meta-edit-btn').forEach(function(btn){
      btn.addEventListener('click',function(){
        abrirModalMetaIndividual(btn.getAttribute('data-id'),btn.getAttribute('data-nome'),parseFloat(btn.getAttribute('data-meta'))||0,btn.getAttribute('data-override')==='1',ctx.ano,ctx.mes);
      });
    });

    /**
     * Taxas de conversão médias — direto da movimentação do Funil (não mais
     * lançamento manual diário, ver funil-crm.md):
     * - Novos Contatos: leads criados no período (filtered.funilNovosContatos,
     *   já filtrado por dateKey de criação + vendedor acima em getFiltered).
     * - Conversas: no máximo 1 por LEAD por DIA (não por transição — ver
     *   SGUtil.calcularConversasPropostas), contando qualquer transição
     *   EXCETO "Tentativa de Contato".
     * - Propostas: no máximo 1 por LEAD por DIA cujo destino foi Negociação/
     *   Serviço Agendado/Ganho (equivalente a "proposta apresentada").
     * IMPORTANTE — mesma COORTE de "Novos Contatos", não "todo mundo que se
     * mexeu": só entram transições de leads que TAMBÉM foram criados dentro
     * desse período (mesmo filtro de filtered.funilNovosContatos) — ver
     * funil-crm.md pra explicação completa de por que isso importa.
     * Escopo do vendedor: mantido pelo idVendedor do LEAD, igual antes.
     */
    var tc=filtered.funilNovosContatos.length;
    var ETAPAS_PROPOSTA_VENDAS=['Negociação','Serviço Agendado','Ganho'];
    var kpisFunilVendas=window.SGUtil.calcularConversasPropostas(filtered.funilNovosContatos,filtered.from,filtered.to,ETAPAS_PROPOSTA_VENDAS);
    var tcv=kpisFunilVendas.conversas;
    var tp=kpisFunilVendas.propostas;
    // "Total" (2026-08-25, pedido do Felipe) — mesmo princípio do Funil:
    // conta conversa/proposta de QUALQUER lead do vendedor filtrado, sem
    // restringir aos criados no período. Só informativo — a % continua
    // vindo do número restrito (kpisFunilVendas) acima.
    var todosDoVendedorVendas=funilRecords.filter(function(f){return filtered.vendedor==='__all__'||f.idVendedor===filtered.vendedor;});
    var kpisFunilVendasTotal=window.SGUtil.calcularConversasPropostas(todosDoVendedorVendas,filtered.from,filtered.to,ETAPAS_PROPOSTA_VENDAS);
    // mesma exclusão do CEO que já vale pra Faturado/Ticket/Vendas feitas
    // (vendasKPI acima) — sem isso a Taxa de conversão "Vendas" contava
    // 4 vendas a mais que o card "Vendas feitas" logo acima, um número
    // batendo com outro na mesma tela.
    var tvr=vendasKPI.length;
    document.getElementById('funilContatos').textContent=tc;document.getElementById('funilVendas').textContent=tvr;
    // 2026-08-25 (pedido do Felipe): número GRANDE do card = total (sem
    // restrição de cohorte); número pequeno = restrito ao período (o que
    // alimenta a %, que continua vindo só dele).
    document.getElementById('funilConversas').textContent=tcv+' no período';
    document.getElementById('funilPropostas').textContent=tp+' no período';
    document.getElementById('funilConversasTotal').textContent=kpisFunilVendasTotal.conversas;
    document.getElementById('funilPropostasTotal').textContent=kpisFunilVendasTotal.propostas;
    document.getElementById('funilConvContato').textContent=tc>0?((tcv/tc)*100).toFixed(1).replace('.',',')+' %':'—';
    document.getElementById('funilConvConversa').textContent=tcv>0?((tp/tcv)*100).toFixed(1).replace('.',',')+' %':'—';
    document.getElementById('funilConvProposta').textContent=tp>0?((tvr/tp)*100).toFixed(1).replace('.',',')+' %':'—';
    ligarDrillDownKpisVendas(filtered.funilNovosContatos,kpisFunilVendas,todosDoVendedorVendas,kpisFunilVendasTotal,vendasKPI);

    // Fallback histórico (sem filtro de período/vendedor) pra quando o período
    // selecionado não tem dado suficiente pra calcular uma taxa — mesma lógica
    // de antes, só que a fonte agora é o funil inteiro em vez do histórico de
    // relatórios manuais.
    var hc=funilRecords.length;
    var kpisFunilHist=window.SGUtil.calcularConversasPropostas(funilRecords,null,null,ETAPAS_PROPOSTA_VENDAS);
    var hcv=kpisFunilHist.conversas;
    var hp=kpisFunilHist.propostas;
    // esse fallback é sempre agregado (não filtra por vendedor), então segue
    // a mesma regra de vendasKPI: nunca conta venda do CEO aqui.
    var hvr=vendasRecordsFaturamento.filter(function(v){return !vendaEhDeCEO(v);}).length;
    var tvpp=tp>0?tvr/tp:null,tpc=tcv>0?tp/tcv:null,tcc=tc>0?tcv/tc:null;
    var tvph=hp>0?hvr/hp:null,tpch=hcv>0?hp/hcv:null,tcch=hc>0?hcv/hc:null;
    var tax1=tvpp!==null?tvpp:tvph,tax2=tpc!==null?tpc:tpch,tax3=tcc!==null?tcc:tcch;
    var taxP=(tvpp===null&&tax1!==null)||(tpc===null&&tax2!==null)||(tcc===null&&tax3!==null);

    function projetarFunil(va){
      if(va===null||va<=0)return{leads:0,conversas:0,propostas:0,vendas:0,ok:va===0};
      if(!tax1||!tax2||!tax3)return{leads:null,conversas:null,propostas:null,vendas:va,ok:false};
      var pn=Math.ceil(va/tax1),cn=Math.ceil(pn/tax2),ln=Math.ceil(cn/tax3);
      return{leads:ln,conversas:cn,propostas:pn,vendas:va,ok:true};
    }
    function renderForecast(prefix,p,subEl,subLbl){
      document.getElementById(prefix+'Leads').textContent=p.leads===null?'—':p.leads;document.getElementById(prefix+'Conversas').textContent=p.conversas===null?'—':p.conversas;document.getElementById(prefix+'Propostas').textContent=p.propostas===null?'—':p.propostas;document.getElementById(prefix+'Vendas').textContent=p.vendas;
      document.getElementById(subEl).textContent=p.leads===null?'sem conversões para projetar':subLbl+(taxP?' · taxas projetadas':'');
    }
    var pT=projetarFunil(vnt);renderForecast('fcTotal',pT,'fcTotalSub',vnt===0?'meta é zero':'considerando '+vnt+' venda(s)');
    var pR=projetarFunil(vn);renderForecast('fcRestante',pR,'fcRestanteSub',vn===0?'meta atingida':'considerando '+vn+' venda(s) restante(s)');
    function div(p,d){if(d<=0)return{leads:null,conversas:null,propostas:null,vendas:null};function f(v){return v===null?null:(v===0?0:Math.ceil(v/d));}return{leads:f(p.leads),conversas:f(p.conversas),propostas:f(p.propostas),vendas:f(p.vendas)};}
    function renderSimples(prefix,p){document.getElementById(prefix+'Leads').textContent=p.leads===null?'—':p.leads;document.getElementById(prefix+'Conversas').textContent=p.conversas===null?'—':p.conversas;document.getElementById(prefix+'Propostas').textContent=p.propostas===null?'—':p.propostas;document.getElementById(prefix+'Vendas').textContent=p.vendas===null?'—':p.vendas;}
    var na=ctx.nVendedoresAtivos||1;
    renderSimples('fcTotalVendedor',div(pT,na));renderSimples('fcRestanteVendedor',div(pR,na));
    document.getElementById('fcTotalVendedorSub').textContent='÷ '+na+' vendedor(es)';document.getElementById('fcRestanteVendedorSub').textContent='÷ '+na+' vendedor(es)';
    document.getElementById('fcPorVendedorHint').textContent='meta total e restante ÷ '+na+' vendedor(es) ativo(s)'+(taxP?' · taxas projetadas':'');
    var dr=ctx.diasUteisRestantes||0,dd=na*dr;
    renderSimples('fcTotalDia',div(pT,dd));renderSimples('fcRestanteDia',div(pR,dd));
    var ds=dr>0?'÷ '+na+' × '+dr+' dia(s) útil(eis) restante(s)':'sem dias úteis restantes';
    document.getElementById('fcTotalDiaSub').textContent=ds;document.getElementById('fcRestanteDiaSub').textContent=ds;
    document.getElementById('fcPorDiaHint').textContent=(dr>0?'dividindo pelos '+dr+' dia(s) útil(eis) restantes':'sem dias úteis restantes')+(taxP?' · taxas projetadas':'');
    setUpdateClock();
    renderVendasTable(filtered.vendasTodas);
  }

  function nomeClienteVenda(id){var c=clientesMap[id];return c?(c['Nome Razao Social']||c.Nome||id):id;}
  function fmtDateBRVendas(d){ return d?(String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear()):'—'; }

  /**
   * Clique nos números do widget "Taxas de conversão" abre a lista exata de
   * clientes/leads por trás daquele KPI (2026-08-24, pedido do Felipe —
   * mesmo recurso adicionado no Funil, ver js/funil.js:ligarDrillDownKpisFunil).
   * "Vendas" aqui já vem com valor de verdade (vendasKPI tem `.valor`,
   * diferente do funil.js que só sabe idVenda/idCliente/idVendedor/data).
   */
  function ligarDrillDownKpisVendas(novosContatos,kpisFunilVendas,todosDoVendedorVendas,kpisFunilVendasTotal,vendasKPI){
    var leadsById={};
    (novosContatos||[]).forEach(function(r){ leadsById[r.id]=r; });
    var todosLeadsById={};
    (todosDoVendedorVendas||[]).forEach(function(r){ todosLeadsById[r.id]=r; });

    document.getElementById('funilContatos').onclick=function(){
      var linhas=(novosContatos||[]).map(function(r){
        return [nomeClienteVenda(r.idCliente),nomeFor(r.idVendedor),r.dt?fmtDateBRVendas(r.dt):'—',r.etapa];
      });
      window.SGListaModal.abrir({titulo:'Novos contatos',subtitulo:linhas.length+' lead(s) criado(s) no período/vendedor filtrados',colunas:['Cliente','Vendedor','Criado em','Etapa atual'],linhas:linhas});
    };
    document.getElementById('funilConversas').onclick=function(){
      var linhas=kpisFunilVendas.conversaLista.map(function(item){
        var r=leadsById[item.leadId];
        return [r?nomeClienteVenda(r.idCliente):'—',r?nomeFor(r.idVendedor):'—',fmtDateBRVendas(new Date(item.dia+'T00:00:00')),item.etapa];
      });
      window.SGListaModal.abrir({titulo:'Conversas',subtitulo:linhas.length+' conversa(s) — no máx. 1 por lead, por dia',colunas:['Cliente','Vendedor','Dia da conversa','Etapa'],linhas:linhas});
    };
    document.getElementById('funilPropostas').onclick=function(){
      var linhas=kpisFunilVendas.propostaLista.map(function(item){
        var r=leadsById[item.leadId];
        return [r?nomeClienteVenda(r.idCliente):'—',r?nomeFor(r.idVendedor):'—',fmtDateBRVendas(new Date(item.dia+'T00:00:00')),item.etapa];
      });
      window.SGListaModal.abrir({titulo:'Propostas',subtitulo:linhas.length+' proposta(s) — no máx. 1 por lead, por dia',colunas:['Cliente','Vendedor','Dia da proposta','Etapa'],linhas:linhas});
    };
    document.getElementById('funilConversasTotal').onclick=function(){
      var linhas=kpisFunilVendasTotal.conversaLista.map(function(item){
        var r=todosLeadsById[item.leadId];
        return [r?nomeClienteVenda(r.idCliente):'—',r?nomeFor(r.idVendedor):'—',fmtDateBRVendas(new Date(item.dia+'T00:00:00')),item.etapa];
      });
      window.SGListaModal.abrir({titulo:'Conversas — total do período',subtitulo:linhas.length+' conversa(s), qualquer lead (não só os criados no período)',colunas:['Cliente','Vendedor','Dia da conversa','Etapa'],linhas:linhas});
    };
    document.getElementById('funilPropostasTotal').onclick=function(){
      var linhas=kpisFunilVendasTotal.propostaLista.map(function(item){
        var r=todosLeadsById[item.leadId];
        return [r?nomeClienteVenda(r.idCliente):'—',r?nomeFor(r.idVendedor):'—',fmtDateBRVendas(new Date(item.dia+'T00:00:00')),item.etapa];
      });
      window.SGListaModal.abrir({titulo:'Propostas — total do período',subtitulo:linhas.length+' proposta(s), qualquer lead (não só os criados no período)',colunas:['Cliente','Vendedor','Dia da proposta','Etapa'],linhas:linhas});
    };
    document.getElementById('funilVendas').onclick=function(){
      var linhas=(vendasKPI||[]).map(function(v){
        return [nomeClienteVenda(v.idCliente),nomeFor(v.idVendedor),v.dt?fmtDateBRVendas(v.dt):'—',fmtMoney(v.valor)];
      });
      window.SGListaModal.abrir({titulo:'Vendas',subtitulo:linhas.length+' venda(s) no período/vendedor filtrados',colunas:['Cliente','Vendedor','Data da venda','Valor'],linhas:linhas});
    };
  }

  /**
   * Chamado pelo módulo de Clientes quando um cliente é salvo em outro
   * lugar, pra manter o cache local em dia e a tabela de Vendas redesenhada
   * na hora — sem isso, um nome corrigido em Clientes só aparecia aqui depois
   * de recarregar a tela inteira.
   */
  function atualizarClienteCache(clienteObj){
    if(!clienteObj||!clienteObj.IdCliente)return;
    clientesMap[clienteObj.IdCliente]=clienteObj;
    render();
  }
  window.vendasApp={atualizarClienteCache:atualizarClienteCache};

  function renderVendasPaginacao(totalPaginas){
    var el=document.getElementById('v-vendasPaginacao');
    if(!el)return;
    if(totalPaginas<=1){ el.innerHTML=''; return; }
    el.innerHTML=
      '<button type="button" id="v-pgAnterior" '+(vPaginaAtual<=1?'disabled':'')+'>‹ Anterior</button>'+
      '<span class="pg-info">Página '+vPaginaAtual+' de '+totalPaginas+'</span>'+
      '<button type="button" id="v-pgProxima" '+(vPaginaAtual>=totalPaginas?'disabled':'')+'>Próxima ›</button>';
    var btnAnt=document.getElementById('v-pgAnterior');
    if(btnAnt)btnAnt.addEventListener('click',function(){ if(vPaginaAtual>1){ vPaginaAtual--; render(); } });
    var btnProx=document.getElementById('v-pgProxima');
    if(btnProx)btnProx.addEventListener('click',function(){ if(vPaginaAtual<totalPaginas){ vPaginaAtual++; render(); } });
  }

  var sortStateVendasTbl={col:'data',dir:'desc'};
  function sortVendasTabela(lista){
    var col=sortStateVendasTbl.col,dir=sortStateVendasTbl.dir,mult=dir==='asc'?1:-1;
    lista.sort(function(a,b){
      var va,vb;
      if(col==='data'){return mult*(a.dt.getTime()-b.dt.getTime());}
      if(col==='cliente'){va=nomeClienteVenda(a.idCliente);vb=nomeClienteVenda(b.idCliente);return mult*va.localeCompare(vb,'pt-BR');}
      if(col==='servico'){va=servicosMap[a.idServico]||'';vb=servicosMap[b.idServico]||'';return mult*va.localeCompare(vb,'pt-BR');}
      if(col==='vendedor'){va=nomeFor(a.idVendedor);vb=nomeFor(b.idVendedor);return mult*va.localeCompare(vb,'pt-BR');}
      if(col==='valor'){return mult*(a.valor-b.valor);}
      return 0;
    });
  }
  function updateSortHeadersVendasTbl(){
    document.querySelectorAll('#tblVendasIndividuais th.sortable').forEach(function(th){
      var col=th.getAttribute('data-sort');
      th.classList.toggle('sort-active',col===sortStateVendasTbl.col);
      var a=th.querySelector('.arrow-sort');
      a.classList.toggle('asc',col===sortStateVendasTbl.col&&sortStateVendasTbl.dir==='asc');
    });
  }

  function normalizaBuscaVendas(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function textoBuscavelVenda(v){
    return normalizaBuscaVendas([
      nomeClienteVenda(v.idCliente), servicosMap[v.idServico]||v.idServico, nomeFor(v.idVendedor),
      fmtDateBRVendas(v.dt), v.valor
    ].join(' | '));
  }

  function renderVendasTable(vendas){
    var tbody=document.getElementById('v-vendasTbody');
    if(!tbody)return;
    var busca=normalizaBuscaVendas((document.getElementById('v-buscaGeral')||{}).value||'').trim();
    var base=busca?vendas.filter(function(v){return textoBuscavelVenda(v).indexOf(busca)!==-1;}):vendas;
    var ordenadas=base.slice();
    sortVendasTabela(ordenadas);
    updateSortHeadersVendasTbl();
    document.getElementById('v-vendasHint').textContent=ordenadas.length+' venda(s) no período filtrado'+(busca?' · busca: "'+document.getElementById('v-buscaGeral').value+'"':'');
    if(!ordenadas.length){
      tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--ink-faint);padding:30px;">Nenhuma venda no período/filtro.</td></tr>';
      renderVendasPaginacao(0);
      return;
    }
    var totalPaginas=Math.max(1,Math.ceil(ordenadas.length/V_ITENS_POR_PAGINA));
    if(vPaginaAtual>totalPaginas)vPaginaAtual=totalPaginas;
    if(vPaginaAtual<1)vPaginaAtual=1;
    var inicio=(vPaginaAtual-1)*V_ITENS_POR_PAGINA;
    var pagina=ordenadas.slice(inicio,inicio+V_ITENS_POR_PAGINA);
    tbody.innerHTML=pagina.map(function(v){
      var isAporte=v.idCliente===ID_CLIENTE_APORTE_SOCIOS;
      return '<tr class="ag-row-click" data-id="'+escapeHtml(v.idVenda)+'">'+
        '<td>'+fmtDateBRVendas(v.dt)+'</td>'+
        '<td>'+escapeHtml(nomeClienteVenda(v.idCliente))+(isAporte?' <span style="font-size:10px;font-weight:700;color:var(--warn);border:1px solid var(--warn);border-radius:6px;padding:1px 6px;margin-left:4px;">APORTE SÓCIOS</span>':'')+'</td>'+
        '<td>'+escapeHtml(servicosMap[v.idServico]||v.idServico||'—')+'</td>'+
        '<td>'+escapeHtml(nomeFor(v.idVendedor))+'</td>'+
        '<td class="num">'+fmtMoney(v.valor)+'</td>'+
      '</tr>';
    }).join('');
    tbody.querySelectorAll('.ag-row-click').forEach(function(tr){
      tr.addEventListener('click',function(){ try{ abrirPainelVenda(tr.getAttribute('data-id')); }catch(err){ console.error('abrirPainelVenda falhou:',err); (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Não foi possível abrir esse registro (erro: '+err.message+'). Atualize a página e tente de novo.',true); } });
    });
    renderVendasPaginacao(totalPaginas);
  }

  function showVendaMsg(texto,erro){
    var el=document.getElementById('vm-msg');
    el.className='uform-msg'+(erro?' error':'');
    el.textContent=texto||'';
  }

  function opcoesClienteVenda(){
    garantirClientesCarregadosVendas(); // abriu o seletor de cliente = precisa da lista completa
    return Object.keys(clientesMap).map(function(id){return clientesMap[id];})
      .sort(function(a,b){return (a['Nome Razao Social']||a.Nome||'').localeCompare(b['Nome Razao Social']||b.Nome||'','pt-BR');})
      .map(function(c){return {id:c.IdCliente,label:c['Nome Razao Social']||c.Nome||c.IdCliente};});
  }
  function opcoesServicoVenda(){
    return Object.keys(servicosMap).sort(function(a,b){return servicosMap[a].localeCompare(servicosMap[b],'pt-BR');})
      .map(function(id){return {id:id,label:servicosMap[id]};});
  }
  function opcoesVendedorVenda(){
    return Object.keys(vendedoresTodosMapVendas).map(function(id){return vendedoresTodosMapVendas[id];})
      .filter(function(v){return (v.Status||'').trim().toLowerCase()!=='inativo';})
      .sort(function(a,b){return (a.Nome||'').localeCompare(b.Nome||'','pt-BR');})
      .map(function(v){return {id:v.IdVendedor,label:v.Nome};});
  }

  function abrirModalVenda(idVenda){
    var v=idVenda?vendasRecords.filter(function(x){return String(x.idVenda)===String(idVenda);})[0]:null;
    vendaAtual=v;
    document.getElementById('vendaModalTitle').textContent=v?'Editar venda':'Nova venda';

    window.SGCombo.criar({
      inputId:'vm-clienteBusca', hiddenId:'vm-cliente', dropdownId:'vm-clienteDropdown',
      getOpcoes:opcoesClienteVenda,
      valorInicial:v&&v.idCliente?{id:v.idCliente,label:nomeClienteVenda(v.idCliente)}:null
    });
    window.SGCombo.criar({
      inputId:'vm-servicoBusca', hiddenId:'vm-servico', dropdownId:'vm-servicoDropdown',
      getOpcoes:opcoesServicoVenda,
      valorInicial:v&&v.idServico?{id:v.idServico,label:servicosMap[v.idServico]||v.idServico}:null
    });
    var vendedorInicial=v?v.idVendedor:(window.SG_SESSION?window.SG_SESSION.idVendedor:null);
    window.SGCombo.criar({
      inputId:'vm-vendedorBusca', hiddenId:'vm-vendedor', dropdownId:'vm-vendedorDropdown',
      getOpcoes:opcoesVendedorVenda,
      valorInicial:vendedorInicial?{id:vendedorInicial,label:nomeFor(vendedorInicial)}:null
    });

    document.getElementById('vm-data').value=v?v.dateKey:'';
    document.getElementById('vm-valor').value=v?v.valor:'';
    showVendaMsg('');
    document.getElementById('vendaModal').classList.remove('hidden');
  }
  function fecharModalVenda(){ document.getElementById('vendaModal').classList.add('hidden'); }

  var mimContexto=null; // {idVendedor, ano, mes}
  var NOMES_MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

  function abrirModalMetaIndividual(idVendedor,nome,metaAtual,temOverride,ano,mes){
    mimContexto={idVendedor:idVendedor,ano:ano,mes:mes};
    document.getElementById('mim-title').textContent='Meta individual — '+nome;
    document.getElementById('mim-sub').textContent='Só pra '+NOMES_MESES[mes-1]+'/'+ano+' — nos outros meses continua usando a meta padrão (empresa ÷ vendedores ativos).';
    document.getElementById('mim-valor').value=metaAtual?metaAtual.toFixed(2):'';
    document.getElementById('mim-removerBtn').style.display=temOverride?'block':'none';
    document.getElementById('mim-msg').textContent='';
    document.getElementById('metaIndividualModal').classList.remove('hidden');
  }
  function fecharModalMetaIndividual(){ document.getElementById('metaIndividualModal').classList.add('hidden'); mimContexto=null; }

  function salvarMetaIndividualOverride(){
    if(!mimContexto)return;
    var valor=document.getElementById('mim-valor').value;
    var msgEl=document.getElementById('mim-msg');
    if(!valor||parseFloat(valor)<=0){ msgEl.className='uform-msg error'; msgEl.textContent='Informe um valor de meta maior que zero.'; return; }
    var btn=document.getElementById('mim-salvarBtn');
    btn.disabled=true; btn.textContent='Salvando…';
    apiCall('salvarMetaIndividual',{idVendedor:mimContexto.idVendedor,ano:mimContexto.ano,mes:mimContexto.mes,valorMeta:valor}).then(function(resp){
      btn.disabled=false; btn.textContent='Salvar';
      if(!resp||!resp.ok){ msgEl.className='uform-msg error'; msgEl.textContent=(resp&&resp.erro)||'Não foi possível salvar.'; return; }
      fecharModalMetaIndividual();
      // Não precisa mais rebuscar aqui (2026-09-01): o listener ao vivo de
      // 'metas_individuais' (ver fetchFromApi/assinarColecao) já recebe essa
      // gravação sozinho, inclusive a do próprio usuário — chamar
      // fetchFromApi() de novo só empilharia mais um assinante duplicado.
    }).catch(function(err){ btn.disabled=false; btn.textContent='Salvar'; msgEl.className='uform-msg error'; msgEl.textContent='Erro de conexão: '+err.message; });
  }

  function removerMetaIndividualOverride(){
    if(!mimContexto)return;
    window.SGConfirm.perguntar({titulo:'Remover meta individual',mensagem:'Remover a meta individual desse vendedor pra esse mês? Ele volta a usar a meta padrão dividida entre os vendedores ativos.',textoConfirmar:'Remover'}).then(function(ok){
      if(!ok)return;
      var btn=document.getElementById('mim-removerBtn');
      btn.disabled=true; btn.textContent='Removendo…';
      apiCall('excluirMetaIndividual',{idVendedor:mimContexto.idVendedor,ano:mimContexto.ano,mes:mimContexto.mes}).then(function(resp){
        btn.disabled=false; btn.textContent='Remover (usar padrão)';
        if(!resp||!resp.ok)return;
        fecharModalMetaIndividual();
        // Idem: o listener ao vivo já reflete a exclusão sozinho.
      });
    });
  }

  function salvarVenda(){
    var idCliente=document.getElementById('vm-cliente').value;
    var idServico=document.getElementById('vm-servico').value;
    var idVendedor=document.getElementById('vm-vendedor').value;
    var dataVenda=document.getElementById('vm-data').value;
    var valor=document.getElementById('vm-valor').value;
    if(!idCliente||!idServico||!idVendedor||!dataVenda||!valor){ showVendaMsg('Preencha todos os campos.',true); return; }

    var ehNovo=!vendaAtual;
    var idVenda=vendaAtual?vendaAtual.idVenda:window.SGId.gerar();
    var registroAnterior=vendaAtual?Object.assign({},vendaAtual):null;
    var indiceExistente=vendasRecords.findIndex(function(x){return String(x.idVenda)===String(idVenda);});
    var dt=parseBRDate(dataVenda.split('-').reverse().join('/'));
    var registroNovo={idVenda:idVenda,idCliente:idCliente,idServico:idServico,idVendedor:idVendedor,dt:dt,dateKey:dataVenda,valor:parseFloat(valor)||0};
    if(indiceExistente===-1)vendasRecords.push(registroNovo);
    else vendasRecords[indiceExistente]=registroNovo;
    _epoca.marcar();

    fecharModalVenda();
    render();
    window.SGToast.mostrar(ehNovo?'Venda criada.':'Venda atualizada.');

    apiCall('salvarVenda',{
      idVenda: idVenda,
      idCliente:idCliente, idServico:idServico, idVendedor:idVendedor, dataVenda:dataVenda, valor:valor
    }).then(function(resp){
      if(!resp||!resp.ok){
        if(ehNovo)vendasRecords=vendasRecords.filter(function(x){return String(x.idVenda)!==String(idVenda);});
        else{ var idx=vendasRecords.findIndex(function(x){return String(x.idVenda)===String(idVenda);}); if(idx!==-1&&registroAnterior)vendasRecords[idx]=registroAnterior; }
        _epoca.marcar();
        render();
        window.SGToast.mostrar((resp&&resp.erro)||'Não foi possível salvar — a alteração foi desfeita.',true);
        return;
      }
      // se o servidor devolveu outro ID (ex: implantação do Code.gs desatualizada), corrige na hora
      if(resp.idVenda&&String(resp.idVenda)!==String(idVenda)){
        var idx2=vendasRecords.findIndex(function(x){return String(x.idVenda)===String(idVenda);});
        if(idx2!==-1)vendasRecords[idx2].idVenda=resp.idVenda;
        render();
      }
    }).catch(function(err){
      if(ehNovo)vendasRecords=vendasRecords.filter(function(x){return String(x.idVenda)!==String(idVenda);});
      else{ var idx=vendasRecords.findIndex(function(x){return String(x.idVenda)===String(idVenda);}); if(idx!==-1&&registroAnterior)vendasRecords[idx]=registroAnterior; }
      _epoca.marcar();
      render();
      window.SGToast.mostrar('Erro de conexão — a alteração foi desfeita: '+err.message,true);
    });
  }

  /**
   * Monta a descrição padrão do custo, no mesmo formato que já era usado
   * manualmente: "Referente aos custos de operação do serviço de X no
   * cliente Y em DD/MM/AAAA. Valor: R$Z" — pré-preenche quando abre o
   * formulário e atualiza sozinha enquanto o valor muda, mas só até a
   * pessoa editar a descrição manualmente (aí para de mexer, respeita o texto dela).
   */
  function gerarDescricaoAutomaticaCusto(v,valorAtual){
    var nomeServ=servicosMap[v.idServico]||v.idServico||'';
    var nomeCli=nomeClienteVenda(v.idCliente)||'';
    var dataFmt=fmtDateBRVendas(v.dt);
    var valorFmt=valorAtual!==undefined&&valorAtual!==''?valorAtual:'';
    return 'Referente aos custos de operação do serviço de '+nomeServ+' no cliente '+nomeCli+' em '+dataFmt+'. Valor: R$'+valorFmt;
  }

  function renderCustosVendaHtml(idVenda){
    var lista=custosVendaRecords.filter(function(c){return String(c.idVenda)===String(idVenda);});
    lista.sort(function(a,b){return (b.dt?b.dt.getTime():0)-(a.dt?a.dt.getTime():0);});
    var total=lista.reduce(function(s,c){return s+c.valor;},0);
    var itensHtml=lista.length?lista.map(function(c){
      return '<div class="resp-item custo-item-click" data-custo-id="'+escapeHtml(c.id)+'" style="cursor:pointer;">'+
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">'+
          '<div style="flex:1;">'+
            '<div class="resp-q">'+escapeHtml(c.descricao||'(sem descrição)')+'</div>'+
            '<div style="font-size:11.5px;color:var(--ink-faint);margin-top:2px;">'+(c.dt?fmtDateBRVendas(c.dt):'—')+' · <span style="font-weight:700;color:'+(c.status.toLowerCase()==='pago'?'var(--accent-deep)':'var(--warn)')+';">'+escapeHtml(c.status||'Aguardando Pagamento')+'</span></div>'+
          '</div>'+
          '<div style="text-align:right;flex:none;">'+
            '<div style="font-weight:700;font-size:13px;">'+fmtMoney(c.valor)+'</div>'+
            '<button type="button" class="custo-del-btn" data-custo-id="'+escapeHtml(c.id)+'" title="Excluir custo" style="color:var(--debit);background:none;border:none;font-size:15px;cursor:pointer;padding:2px 4px;"><span class="inline-ico" style="margin-right:0;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></span></button>'+
          '</div>'+
        '</div>'+
      '</div>';
    }).join(''):'<div style="font-size:12.5px;color:var(--ink-faint);padding:6px 0;">Nenhum custo lançado pra essa venda ainda.</div>';
    return '<div class="ad-row" style="border:none;padding-bottom:10px;"><span class="dl">Total de custos</span><span class="dv">'+fmtMoney(total)+'</span></div>'+itensHtml;
  }

  function abrirPainelVenda(idVenda){
    var v=vendasRecords.filter(function(x){return String(x.idVenda)===String(idVenda);})[0];
    if(!v)return;
    vendaAtual=v;
    document.getElementById('vd-title').textContent=nomeClienteVenda(v.idCliente);
    var html='<div class="ad-section">'+
      '<div class="ad-row"><span class="dl">Cliente</span><span class="dv">'+escapeHtml(nomeClienteVenda(v.idCliente))+'</span></div>'+
      '<div class="ad-row"><span class="dl">Serviço</span><span class="dv">'+escapeHtml(servicosMap[v.idServico]||v.idServico||'—')+'</span></div>'+
      '<div class="ad-row"><span class="dl">Vendedor</span><span class="dv">'+escapeHtml(nomeFor(v.idVendedor))+'</span></div>'+
      '<div class="ad-row"><span class="dl">Data</span><span class="dv">'+fmtDateBRVendas(v.dt)+'</span></div>'+
      '<div class="ad-row"><span class="dl">Valor</span><span class="dv">'+fmtMoney(v.valor)+'</span></div>'+
    '</div>'+
    '<div class="ad-section">'+
      '<h4>Custos da venda</h4>'+
      '<div id="vd-custosLista">'+renderCustosVendaHtml(v.idVenda)+'</div>'+
      '<button type="button" class="connect-btn" id="vd-addCustoToggle" style="width:100%;margin-top:10px;">+ Adicionar custo</button>'+
      '<div id="vd-custoForm" class="hidden" style="margin-top:12px;">'+
        '<div class="uform-field"><label>Descrição</label><textarea id="vc-descricao" rows="3" placeholder="Ex: Combustível, material, comissão…"></textarea></div>'+
        '<div class="uform-field"><label>Valor</label><input type="number" id="vc-valor" step="0.01" min="0"></div>'+
        '<div class="uform-field"><label>Status</label><select id="vc-status"><option value="Pago">Pago</option><option value="Aguardando Pagamento">Aguardando Pagamento</option></select></div>'+
        '<div class="uform-field"><label>Data</label><input type="date" id="vc-data"></div>'+
        '<div style="display:flex;gap:8px;">'+
          '<button type="button" class="reset-btn" id="vc-excluirBtn" style="color:var(--debit);display:none;"><span class="inline-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></span>Excluir</button>'+
          '<button type="button" class="reset-btn" id="vc-cancelarBtn" style="display:none;flex:1;">Cancelar</button>'+
          '<button type="button" class="connect-btn" id="vc-salvarBtn" style="flex:1;">Salvar custo</button>'+
        '</div>'+
      '</div>'+
    '</div>';
    document.getElementById('vd-body').innerHTML=html;
    custoEditandoId=null;
    document.getElementById('vc-data').value=dateKey(new Date());
    var descricaoEditadaManualmente=false;
    document.getElementById('vc-descricao').addEventListener('input',function(){ descricaoEditadaManualmente=true; });
    document.getElementById('vc-valor').addEventListener('input',function(){
      if(descricaoEditadaManualmente)return;
      document.getElementById('vc-descricao').value=gerarDescricaoAutomaticaCusto(v,document.getElementById('vc-valor').value);
    });

    document.getElementById('vd-addCustoToggle').addEventListener('click',function(){
      abrirFormularioCusto(v,null);
    });
    document.getElementById('vc-cancelarBtn').addEventListener('click',function(){
      document.getElementById('vd-custoForm').classList.add('hidden');
      custoEditandoId=null;
    });
    document.getElementById('vc-salvarBtn').addEventListener('click',function(){ salvarCustoVendaInline(v); });
    document.getElementById('vc-excluirBtn').addEventListener('click',function(){ if(custoEditandoId)excluirCustoVenda(custoEditandoId,v.idVenda); });
    wireCustoDelButtons(v.idVenda);
    wireCustoItemClick(v);

    document.getElementById('vendaDetalhe').classList.add('active');
    document.getElementById('adBackdrop').classList.add('active');
  }

  /**
   * Abre o formulário de custo — sem idCusto é "novo" (com a descrição já
   * sugerida automaticamente), com idCusto é edição (pré-preenche tudo,
   * inclusive a descrição existente, sem sobrescrever o que a pessoa escreveu).
   */
  function abrirFormularioCusto(v,idCusto){
    custoEditandoId=idCusto||null;
    var c=idCusto?custosVendaRecords.filter(function(x){return String(x.id)===String(idCusto);})[0]:null;
    document.getElementById('vc-descricao').value=c?(c.descricao||''):gerarDescricaoAutomaticaCusto(v,'');
    document.getElementById('vc-valor').value=c?c.valor:'';
    document.getElementById('vc-status').value=c?(c.status||'Aguardando Pagamento'):'Aguardando Pagamento';
    document.getElementById('vc-data').value=c?c.dateKey:dateKey(new Date());
    document.getElementById('vc-excluirBtn').style.display=c?'block':'none';
    document.getElementById('vc-cancelarBtn').style.display='block';
    document.getElementById('vd-custoForm').classList.remove('hidden');
  }

  function wireCustoItemClick(v){
    document.getElementById('vd-body').querySelectorAll('.custo-item-click').forEach(function(item){
      item.addEventListener('click',function(e){
        if(e.target.classList.contains('custo-del-btn'))return;
        abrirFormularioCusto(v,item.getAttribute('data-custo-id'));
      });
    });
  }

  /**
   * Reconecta o clique de "excluir" nos custos — precisa ser chamado toda
   * vez que a lista de custos é redesenhada (adicionar, corrigir ID, etc.),
   * já que refazer o innerHTML apaga os listeners antigos.
   */
  function wireCustoDelButtons(idVenda){
    document.getElementById('vd-body').querySelectorAll('.custo-del-btn').forEach(function(btn){
      btn.addEventListener('click',function(e){ e.stopPropagation(); excluirCustoVenda(btn.getAttribute('data-custo-id'),idVenda); });
    });
  }

  function fecharPainelVenda(){
    document.getElementById('vendaDetalhe').classList.remove('active');
    document.getElementById('adBackdrop').classList.remove('active');
    vendaAtual=null;
  }

  function salvarCustoVendaInline(v){
    var idVenda=v.idVenda;
    var descricao=document.getElementById('vc-descricao').value.trim();
    var valor=document.getElementById('vc-valor').value;
    var status=document.getElementById('vc-status').value;
    var dataStr=document.getElementById('vc-data').value;
    if(!valor){ return; }

    var ehNovo=!custoEditandoId;
    var idCusto=custoEditandoId||window.SGId.gerar();
    var registroAnteriorCopia=!ehNovo?Object.assign({},custosVendaRecords.filter(function(c){return String(c.id)===String(idCusto);})[0]):null;

    var registroNovo={id:idCusto,idVenda:idVenda,descricao:descricao,status:status,dt:parseBRDate(dataStr.split('-').reverse().join('/')),dateKey:dataStr,valor:parseFloat(valor)||0};
    var indice=custosVendaRecords.findIndex(function(c){return String(c.id)===String(idCusto);});
    if(indice===-1)custosVendaRecords.push(registroNovo);
    else custosVendaRecords[indice]=registroNovo;
    _epoca.marcar();

    document.getElementById('vd-custosLista').innerHTML=renderCustosVendaHtml(idVenda);
    wireCustoDelButtons(idVenda);
    wireCustoItemClick(v);
    document.getElementById('vd-custoForm').classList.add('hidden');
    custoEditandoId=null;
    window.SGToast.mostrar(ehNovo?'Custo adicionado.':'Custo atualizado.');

    apiCall('salvarCustoVenda',{
      idCusto:idCusto, idVenda:idVenda, descricao:descricao,
      valor:valor, status:status, data:dataStr
    }).then(function(resp){
      if(!resp||!resp.ok){
        if(ehNovo)custosVendaRecords=custosVendaRecords.filter(function(c){return String(c.id)!==String(idCusto);});
        else{ var idx=custosVendaRecords.findIndex(function(c){return String(c.id)===String(idCusto);}); if(idx!==-1&&registroAnteriorCopia)custosVendaRecords[idx]=registroAnteriorCopia; }
        _epoca.marcar();
        document.getElementById('vd-custosLista').innerHTML=renderCustosVendaHtml(idVenda);
        wireCustoDelButtons(idVenda);
        wireCustoItemClick(v);
        window.SGToast.mostrar((resp&&resp.erro)||'Não foi possível salvar o custo — desfeito.',true);
        return;
      }
      if(resp.idCusto&&String(resp.idCusto)!==String(idCusto)){
        var reg=custosVendaRecords.filter(function(c){return String(c.id)===String(idCusto);})[0];
        if(reg)reg.id=resp.idCusto;
        document.getElementById('vd-custosLista').innerHTML=renderCustosVendaHtml(idVenda);
        wireCustoDelButtons(idVenda);
        wireCustoItemClick(v);
      }
    }).catch(function(err){
      if(ehNovo)custosVendaRecords=custosVendaRecords.filter(function(c){return String(c.id)!==String(idCusto);});
      else{ var idx=custosVendaRecords.findIndex(function(c){return String(c.id)===String(idCusto);}); if(idx!==-1&&registroAnteriorCopia)custosVendaRecords[idx]=registroAnteriorCopia; }
      _epoca.marcar();
      document.getElementById('vd-custosLista').innerHTML=renderCustosVendaHtml(idVenda);
      wireCustoDelButtons(idVenda);
      wireCustoItemClick(v);
      window.SGToast.mostrar('Erro de conexão — custo desfeito: '+err.message,true);
    });
  }

  function excluirCustoVenda(idCusto,idVenda){
    window.SGConfirm.perguntar({titulo:'Excluir custo',mensagem:'Excluir esse custo?',textoConfirmar:'Excluir',perigo:true}).then(function(ok){
      if(!ok)return;
      var registroAnterior=custosVendaRecords.filter(function(c){return String(c.id)===String(idCusto);})[0];
      if(custoEditandoId===idCusto){
        document.getElementById('vd-custoForm').classList.add('hidden');
        custoEditandoId=null;
      }

      custosVendaRecords=custosVendaRecords.filter(function(c){return String(c.id)!==String(idCusto);});
      _epoca.marcar();
      document.getElementById('vd-custosLista').innerHTML=renderCustosVendaHtml(idVenda);
      wireCustoDelButtons(idVenda);
      wireCustoItemClick(vendaAtual);
      window.SGToast.mostrar('Custo excluído.');

      apiCall('excluirCustoVenda',{idCusto:idCusto,solicitanteId:(window.SG_SESSION&&window.SG_SESSION.idVendedor)||''}).then(function(resp){
        if(!resp||!resp.ok){
          if(window.SGUtil.ehNaoEncontrado(resp&&resp.erro))return;
          if(registroAnterior)custosVendaRecords.push(registroAnterior);
          _epoca.marcar();
          document.getElementById('vd-custosLista').innerHTML=renderCustosVendaHtml(idVenda);
          wireCustoDelButtons(idVenda);
          wireCustoItemClick(vendaAtual);
          window.SGToast.mostrar((resp&&resp.erro)||'Não foi possível excluir — restaurado.',true);
        }
      }).catch(function(err){
        if(registroAnterior)custosVendaRecords.push(registroAnterior);
        _epoca.marcar();
        document.getElementById('vd-custosLista').innerHTML=renderCustosVendaHtml(idVenda);
        wireCustoDelButtons(idVenda);
        wireCustoItemClick(vendaAtual);
        window.SGToast.mostrar('Erro de conexão — custo restaurado: '+err.message,true);
      });
    });
  }

  function excluirVenda(){
    if(!vendaAtual)return;
    window.SGConfirm.perguntar({titulo:'Excluir venda',mensagem:'Tem certeza que deseja excluir essa venda? Essa ação não pode ser desfeita.',textoConfirmar:'Excluir',perigo:true}).then(function(ok){
      if(!ok)return;
      var idVenda=vendaAtual.idVenda;
      var registroAnterior=Object.assign({},vendaAtual);

      vendasRecords=vendasRecords.filter(function(x){return String(x.idVenda)!==String(idVenda);});
      _epoca.marcar();
      fecharPainelVenda();
      render();
      window.SGToast.mostrar('Venda excluída.');

      apiCall('excluirVenda',{idVenda:idVenda,solicitanteId:(window.SG_SESSION&&window.SG_SESSION.idVendedor)||''}).then(function(resp){
        if(!resp||!resp.ok){
          if(window.SGUtil.ehNaoEncontrado(resp&&resp.erro))return;
          vendasRecords.push(registroAnterior); _epoca.marcar(); render();
          window.SGToast.mostrar((resp&&resp.erro)||'Não foi possível excluir — a venda foi restaurada.',true);
        }
      }).catch(function(err){
        vendasRecords.push(registroAnterior); _epoca.marcar(); render();
        window.SGToast.mostrar('Erro de conexão — a venda foi restaurada: '+err.message,true);
      });
    });
  }

  function aplicarDadosVendas(resp){
    var vVendedores=window.SGAuth?window.SGAuth.filterByOwner(resp.vendedores||[],'IdVendedor'):(resp.vendedores||[]);
    var vVendas=window.SGAuth?window.SGAuth.filterByOwner(resp.vendas||[],'IdVendedor'):(resp.vendas||[]);
    var vFunil=window.SGAuth?window.SGAuth.filterByOwner(resp.funil||[],'IdVendedor'):(resp.funil||[]);
    processVendedores(vVendedores);
    vendedoresTodosMapVendas={};(resp.vendedores||[]).forEach(function(v){if(v.IdVendedor)vendedoresTodosMapVendas[v.IdVendedor]=v;});
    metasIndividuaisMap={};(resp.metasIndividuais||[]).forEach(function(m){
      if(!m.IdVendedor)return;
      var chave=m.IdVendedor+'|'+parseInt(m.Ano,10)+'|'+parseInt(m.Mes,10);
      metasIndividuaisMap[chave]={id:m.IdMetaIndividual,valor:parseBRNumber(m.ValorMeta)};
    });
    // clientesMap não é mais zerado (resp.clientes vem vazio — Vendas não
    // assina mais essa coleção). Preenchido pelo nome gravado em cada venda.
    (resp.clientes||[]).forEach(function(c){if(c.IdCliente)clientesMap[c.IdCliente]=c;});
    vendasRecords=processVendas(vVendas);metasRecords=processMetas(resp.metas||[]);funilRecords=processFunilVendas(vFunil);custosVendaRecords=processCustosVenda(resp.custosVenda||[]);servicosMap=processServicos(resp.servicos||[]);
    seedClientesDoDenormVendas(vendasRecords);
    // Rede de segurança pré-backfill (ver funil.js): se muita venda ainda não
    // tem NomeCliente, carrega `clientes` uma vez em vez de mostrar o id.
    var semNomeV=vendasRecords.filter(function(v){return v.idCliente&&!clientesMap[v.idCliente];}).length;
    if(vendasRecords.length&&semNomeV>vendasRecords.length*0.2)garantirClientesCarregadosVendas();
    // As vendas do "Cliente Teste 1" (da6dbd89) são aporte de sócios, não faturamento
    // de verdade — continuam aparecendo na lista/histórico, mas não entram em
    // nenhuma conta de faturamento, ticket médio ou meta.
    vendasRecordsFaturamento=vendasRecords.filter(function(v){return v.idCliente!==ID_CLIENTE_APORTE_SOCIOS;});
    // Qualquer venda lançada sob o Cliente Teste 1 é uma "gaveta" de custo de
    // escritório, não só uma canônica — sem isso, custo lançado numa
    // venda-gaveta diferente contava como custo de venda real.
    vendasEscritorioIds={};vendasRecords.forEach(function(v){if(v.idCliente===ID_CLIENTE_APORTE_SOCIOS)vendasEscritorioIds[v.idVenda]=true;});
    populateSelects();setDefaultDateRange();
    document.getElementById('v-emptyState').style.display='none';document.getElementById('v-mainContent').style.display='block';render();
    setSyncPill('ok','Sincronizado');
  }

  /**
   * 2026-09-01: passou a usar `SGUtil.assinarColecao` (registro compartilhado
   * de listeners, `js/sg-auth.js`) em vez de `apiCall('getVendasData')` —
   * antes essa tela baixava 8 coleções inteiras (uma delas, `funil`, com
   * quase 1000 documentos) de forma incondicional, TODA VEZ que a página
   * carregava, mesmo se a pessoa nunca abrisse a aba Vendas — este módulo
   * roda um `autoConnect` no carregamento do script, sem esperar a tela ser
   * visitada. Foi uma das causas de estourar a cota diária de leitura do
   * Firestore — ver segundo-cerebro/padroes/dados-e-seguranca.md. Como o
   * registro é compartilhado, se Funil/Clientes já tiverem carregado
   * `funil`/`clientes`/`vendedores`/`servicos` na mesma sessão, essa tela
   * não paga nada de novo por elas.
   */
  var dadosBrutosVendas={vendedores:[],vendas:[],funil:[],clientes:[],servicos:[],metas:[],custosVenda:[],metasIndividuais:[]};
  function recombinarDadosVendas(){
    aplicarDadosVendas(dadosBrutosVendas);
    if(window.SGCache)window.SGCache.set('vendas',dadosBrutosVendas);
  }
  function fetchFromApi(){
    if(!hasApiCreds())return;
    var cache=window.SGCache&&window.SGCache.get('vendas');
    if(cache&&cache.dados)aplicarDadosVendas(cache.dados); // pintura instantânea, antes do 1º snapshot
    window.SGFireReady.then(function(){
      window.SGUtil.assinarColecao('vendedores',function(lista){ dadosBrutosVendas.vendedores=lista; recombinarDadosVendas(); });
      window.SGUtil.assinarColecao('vendas',function(lista){ dadosBrutosVendas.vendas=lista; recombinarDadosVendas(); });
      window.SGUtil.assinarColecao('funil',function(lista){ dadosBrutosVendas.funil=lista; recombinarDadosVendas(); });
      // `clientes` só carrega sob demanda (garantirClientesCarregadosVendas),
      // quando o seletor de cliente de "Nova venda" abre. 2026-09-03.
      window.SGUtil.assinarColecao('servicos',function(lista){ dadosBrutosVendas.servicos=lista; recombinarDadosVendas(); });
      window.SGUtil.assinarColecao('metas',function(lista){ dadosBrutosVendas.metas=lista; recombinarDadosVendas(); });
      window.SGUtil.assinarColecao('custos_venda',function(lista){ dadosBrutosVendas.custosVenda=lista; recombinarDadosVendas(); });
      window.SGUtil.assinarColecao('metas_individuais',function(lista){ dadosBrutosVendas.metasIndividuais=lista; recombinarDadosVendas(); });
    });
  }

  (function autoConnect(){if(!window.SG_SESSION)return;if(getApiUrl()&&getApiKey())fetchFromApi();})();
  document.getElementById('v-dateFrom').addEventListener('change',render);document.getElementById('v-dateTo').addEventListener('change',render);document.getElementById('selVendedor').addEventListener('change',render);document.getElementById('selServico').addEventListener('change',render);
  document.getElementById('v-buscaGeral').addEventListener('input',function(){ vPaginaAtual=1; render(); });
  document.getElementById('v-resetFiltros').addEventListener('click',function(){document.getElementById('selVendedor').value='__all__';document.getElementById('selServico').value='__all__';document.getElementById('v-buscaGeral').value='';setDefaultDateRange();document.querySelectorAll('.qr-btn[data-range]').forEach(function(b){b.classList.remove('active');});render();});
  /**
   * "Tudo" (2026-08-31, pedido do Felipe): igual ao mesmo atalho já
   * existente no Funil/Agendamentos — cobre do dia mais antigo ao mais
   * recente entre TODOS os registros já carregados (vendas + funil),
   * não só um intervalo fixo de dias.
   */
  function setRangeTudoVendas(){
    var chaves=vendasRecords.map(function(v){return v.dateKey;}).concat(funilRecords.map(function(f){return f.dateKey;})).filter(Boolean).sort();
    if(!chaves.length){ setDefaultDateRange(); return; }
    document.getElementById('v-dateFrom').value=chaves[0];
    document.getElementById('v-dateTo').value=chaves[chaves.length-1];
  }
  document.querySelectorAll('.qr-btn[data-range]').forEach(function(btn){
    btn.addEventListener('click',function(){
      document.querySelectorAll('.qr-btn[data-range]').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');
      var range=btn.getAttribute('data-range'),now=new Date();
      function dk(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
      if(range==='all'){setRangeTudoVendas();}else if(range==='month'){var f=new Date(now.getFullYear(),now.getMonth(),1),l=new Date(now.getFullYear(),now.getMonth()+1,0);document.getElementById('v-dateFrom').value=dk(f);document.getElementById('v-dateTo').value=dk(l);}else{var n=parseInt(range,10),fr=new Date(now);fr.setDate(fr.getDate()-(n-1));document.getElementById('v-dateFrom').value=dk(fr);document.getElementById('v-dateTo').value=dk(now);}
      render();
    });
  });

  document.getElementById('v-novaVendaBtn').addEventListener('click',function(){ abrirModalVenda(null); });
  document.getElementById('vm-cancelarBtn').addEventListener('click',fecharModalVenda);
  document.getElementById('vm-salvarBtn').addEventListener('click',salvarVenda);
  document.getElementById('vendaModal').addEventListener('click',function(e){ if(e.target.id==='vendaModal')fecharModalVenda(); });
  document.getElementById('mim-cancelarBtn').addEventListener('click',fecharModalMetaIndividual);
  document.getElementById('mim-salvarBtn').addEventListener('click',salvarMetaIndividualOverride);
  document.getElementById('mim-removerBtn').addEventListener('click',removerMetaIndividualOverride);
  document.getElementById('metaIndividualModal').addEventListener('click',function(e){ if(e.target.id==='metaIndividualModal')fecharModalMetaIndividual(); });
  document.getElementById('vd-fecharBtn').addEventListener('click',fecharPainelVenda);
  document.getElementById('vd-excluirBtn').addEventListener('click',excluirVenda);
  document.getElementById('vd-editarBtn').addEventListener('click',function(){ if(vendaAtual)abrirModalVenda(vendaAtual.idVenda); });
  var adBackdropVendas=document.getElementById('adBackdrop');
  if(adBackdropVendas)adBackdropVendas.addEventListener('click',fecharPainelVenda);
  function updateSortHeaders(){document.querySelectorAll('#tblTicketVendedor th.sortable').forEach(function(th){var col=th.getAttribute('data-sort');th.classList.toggle('sort-active',col===sortState.col);var a=th.querySelector('.arrow-sort');a.classList.toggle('asc',col===sortState.col&&sortState.dir==='asc');});}
  document.querySelectorAll('#tblTicketVendedor th.sortable').forEach(function(th){th.addEventListener('click',function(){var col=th.getAttribute('data-sort');if(sortState.col===col){sortState.dir=sortState.dir==='asc'?'desc':'asc';}else{sortState.col=col;sortState.dir=col==='vendedor'?'asc':'desc';}updateSortHeaders();render();});});
  document.querySelectorAll('#tblVendasIndividuais th.sortable').forEach(function(th){th.addEventListener('click',function(){var col=th.getAttribute('data-sort');if(sortStateVendasTbl.col===col){sortStateVendasTbl.dir=sortStateVendasTbl.dir==='asc'?'desc':'asc';}else{sortStateVendasTbl.col=col;sortStateVendasTbl.dir=(col==='cliente'||col==='servico'||col==='vendedor')?'asc':'desc';}render();});});
  updateSortHeaders();

})();
})();

