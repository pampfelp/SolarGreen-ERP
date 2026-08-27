// ════ DASHBOARD COMERCIAL/FINANCEIRO ════
(function(){
  var _initialized=false;
  var _epoca=window.SGEpoca.criar();
  var vendasRecords=[],custosVendaRecords=[],relatoriosRecords=[],funilRecords=[];
  var vendedoresMap={},clientesMap={},servicosMap={};
  // Cliente cadastrado via "+ Cadastrar cliente" no Funil, na mesma sessão —
  // sem isso, essa tela só enxergaria ele depois de recarregar a página.
  document.addEventListener('sg:cliente-criado',function(e){ if(e.detail&&e.detail.IdCliente)clientesMap[e.detail.IdCliente]=e.detail; });
  var ID_CLIENTE_APORTE_SOCIOS='da6dbd89';
  var vendasEscritorioIds={}; // idVenda -> true, pra qualquer venda "gaveta" do Cliente Teste 1 (custo de escritório lançado nela)
  var APP_VERSION='2026-07-16-1';
  var chartAnchorDay=null;

  function apiCall(action,extra){ return window.SGAuth.apiCall(action,extra); }
  function escapeHtml(s){ return window.SGUtil.escapeHtml(s); }
  function fmtMoney(n){ return window.SGUtil.fmtMoney(n); }
  function parseBRDate(str){ return window.SGUtil.parseBRDate(str); }
  function parseISOSimples(iso){ var p=iso.split('-'); return new Date(+p[0],+p[1]-1,+p[2]); }
  function parseBRNumber(v){ return window.SGUtil.parseBRNumber(v); }
  function dateKey(d){ return window.SGUtil.dateKey(d); }
  function fmtDateBR(d){ return window.SGUtil.fmtDateBR(d); }
  function fmtDateBRDoISO(iso){ var p=iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
  function nomeVendedor(id){ var v=vendedoresMap[id]; return v?(v.Nome||id):'—'; }
  function nomeServico(id){ var s=servicosMap[id]; return s?(s['Nome Servico']||id):'—'; }

  function processVendas(list){var out=[];list.forEach(function(o){if(!o.IdVenda)return;var dt=parseBRDate(o.DataVenda);if(!dt)return;out.push({idVenda:o.IdVenda,idCliente:o.IdCliente,idServico:o.IdServico,idVendedor:o.IdVendedor,dt:dt,dateKey:dateKey(dt),valor:parseBRNumber(o.Valor)});});return out;}
  function processCustosVenda(list){var out=[];list.forEach(function(o){if(!o.IdCusto)return;var dt=parseBRDate(o.Data);out.push({idCusto:o.IdCusto,idVenda:o.IdVenda,status:String(o.Status||''),dt:dt,dateKey:dt?dateKey(dt):null,valor:parseBRNumber(o.Valor)});});return out;}
  function processRelatorios(list){var out=[];list.forEach(function(o){if(!o.IdRelatorio)return;var dt=parseBRDate(o.Data);if(!dt)return;out.push({idVendedor:o.IdVendedor,dt:dt,dateKey:dateKey(dt),contatos:parseBRNumber(o['Novos Contatos']),conversas:parseBRNumber(o.Conversas),propostas:parseBRNumber(o['Propostas Apresentadas']),vendas:parseBRNumber(o.Vendas)});});return out;}
  function processFunil(list){var out=[];list.forEach(function(o){var id=o.IdOportunidade||o.IdFunil;if(!id)return;var dt=parseBRDate(o.DataCriacao||o['Data Criacao']||'');out.push({id:id,idCliente:o.IdCliente,idVendedor:o.IdVendedor,idServico:o.IdServico,etapa:o.Etapa,dt:dt,dateKey:dt?dateKey(dt):null});});return out;}

  function getFiltered(){
    var from=document.getElementById('db-dateFrom').value,to=document.getElementById('db-dateTo').value;
    var vendedor=document.getElementById('db-selVendedor').value,servico=document.getElementById('db-selServico').value;
    function passa(v){ if(from&&v.dateKey<from)return false; if(to&&v.dateKey>to)return false; if(vendedor!=='__all__'&&v.idVendedor!==vendedor)return false; if(servico!=='__all__'&&v.idServico!==servico)return false; return true; }
    var vendasTodas=vendasRecords.filter(passa);
    var vendasFat=vendasTodas.filter(function(v){return v.idCliente!==ID_CLIENTE_APORTE_SOCIOS;});
    var vendaIds={}; vendasTodas.forEach(function(v){vendaIds[v.idVenda]=true;});
    var custosOp=custosVendaRecords.filter(function(c){ return !vendasEscritorioIds[c.idVenda] && c.status.toLowerCase()==='pago' && vendaIds[c.idVenda]; });
    var custosEsc=custosVendaRecords.filter(function(c){
      if(!vendasEscritorioIds[c.idVenda])return false;
      if(c.status.toLowerCase()!=='pago')return false;
      if(c.dateKey){ if(from&&c.dateKey<from)return false; if(to&&c.dateKey>to)return false; }
      return true;
    });
    var relatorios=relatoriosRecords.filter(function(r){ if(from&&r.dateKey<from)return false; if(to&&r.dateKey>to)return false; if(vendedor!=='__all__'&&r.idVendedor!==vendedor)return false; return true; });
    var leads=funilRecords.filter(function(l){ if(!l.dateKey)return false; if(from&&l.dateKey<from)return false; if(to&&l.dateKey>to)return false; if(vendedor!=='__all__'&&l.idVendedor!==vendedor)return false; if(servico!=='__all__'&&l.idServico!==servico)return false; return true; });
    return {vendasTodas:vendasTodas,vendasFat:vendasFat,custosOp:custosOp,custosEsc:custosEsc,relatorios:relatorios,leads:leads};
  }

  /** Custo de escritório é despesa geral — rateado proporcional à fatia de
   *  faturamento do filtro atual (mesmo padrão já usado na tela de Vendas),
   *  pra não jogar o custo da empresa inteira em cima de um recorte. */
  function custoEscritorioProporcional(ceTotal,fatFiltrado){
    var from=document.getElementById('db-dateFrom').value,to=document.getElementById('db-dateTo').value;
    var fatTotalPeriodo=vendasRecords.filter(function(v){
      if(v.idCliente===ID_CLIENTE_APORTE_SOCIOS)return false;
      if(from&&v.dateKey<from)return false; if(to&&v.dateKey>to)return false;
      return true;
    }).reduce(function(s,v){return s+v.valor;},0);
    if(fatTotalPeriodo<=0)return 0;
    return ceTotal*(fatFiltrado/fatTotalPeriodo);
  }

  function setRangeDias(qtdDias){
    var hoje=new Date(); var de=new Date(hoje); de.setDate(hoje.getDate()-qtdDias);
    document.getElementById('db-dateFrom').value=dateKey(de);
    document.getElementById('db-dateTo').value=dateKey(hoje);
  }
  function setRangeEsteMes(){
    var hoje=new Date(); var inicio=new Date(hoje.getFullYear(),hoje.getMonth(),1);
    document.getElementById('db-dateFrom').value=dateKey(inicio);
    document.getElementById('db-dateTo').value=dateKey(hoje);
  }
  function setRangeTudo(){
    if(!vendasRecords.length){ document.getElementById('db-dateFrom').value=''; document.getElementById('db-dateTo').value=''; return; }
    var datas=vendasRecords.map(function(v){return v.dateKey;}).sort();
    document.getElementById('db-dateFrom').value=datas[0];
    document.getElementById('db-dateTo').value=datas[datas.length-1];
  }

  function popularSelects(){
    var selV=document.getElementById('db-selVendedor'),curV=selV.value||'__all__';
    selV.innerHTML='<option value="__all__">Todos os vendedores</option>'+
      Object.keys(vendedoresMap).map(function(id){return vendedoresMap[id];}).sort(function(a,b){return (a.Nome||'').localeCompare(b.Nome||'','pt-BR');})
        .map(function(v){return '<option value="'+escapeHtml(v.IdVendedor)+'">'+escapeHtml(v.Nome)+'</option>';}).join('');
    if([].slice.call(selV.options).some(function(o){return o.value===curV;}))selV.value=curV;

    var selS=document.getElementById('db-selServico'),curS=selS.value||'__all__';
    selS.innerHTML='<option value="__all__">Todos os serviços</option>'+
      Object.keys(servicosMap).map(function(id){return servicosMap[id];}).sort(function(a,b){return (a['Nome Servico']||'').localeCompare(b['Nome Servico']||'','pt-BR');})
        .map(function(s){return '<option value="'+escapeHtml(s.IdServico)+'">'+escapeHtml(s['Nome Servico'])+'</option>';}).join('');
    if([].slice.call(selS.options).some(function(o){return o.value===curS;}))selS.value=curS;
  }

  function selecionarPeriodoChart(dayKey,toKey,isShift){
    var fi=document.getElementById('db-dateFrom'),ti=document.getElementById('db-dateTo');
    if(isShift&&chartAnchorDay){
      var lo=dayKey<chartAnchorDay?dayKey:chartAnchorDay,hi=dayKey<chartAnchorDay?chartAnchorDay:dayKey;
      fi.value=lo; ti.value=hi;
    }else{
      chartAnchorDay=dayKey; fi.value=dayKey; ti.value=toKey||dayKey;
    }
    document.querySelectorAll('#view-dashboard .qr-btn[data-dbrange]').forEach(function(b){b.classList.remove('active');});
    render();
  }

  function highlightLineSelection(){
    var from=document.getElementById('db-dateFrom').value,to=document.getElementById('db-dateTo').value;
    document.querySelectorAll('#db-lineWrap .linechart-dot').forEach(function(dot){
      var k=dot.getAttribute('data-key'),kTo=dot.getAttribute('data-tokey');
      var dentro=!!(from&&to&&((k>=from&&k<=to)||(kTo>=from&&kTo<=to)||(k<=from&&kTo>=to)));
      dot.classList.toggle('selected',dentro);
    });
  }

  function renderLineChart(vendasFat){
    var wrap=document.getElementById('db-lineWrap');
    if(!vendasFat.length){ wrap.innerHTML='<div class="chart-empty">Nenhum dado no período</div>'; return; }
    var byDay={}; vendasFat.forEach(function(v){ byDay[v.dateKey]=(byDay[v.dateKey]||0)+v.valor; });
    var dts=vendasFat.map(function(v){return v.dt.getTime();});
    var minDt=new Date(Math.min.apply(null,dts)),maxDt=new Date(Math.max.apply(null,dts));
    var fromVal=document.getElementById('db-dateFrom').value,toVal=document.getElementById('db-dateTo').value;
    if(fromVal){var fd=parseISOSimples(fromVal); if(fd<minDt)minDt=fd;}
    if(toVal){var td=parseISOSimples(toVal); if(td>maxDt)maxDt=td;}

    var pontos=[],cursor=new Date(minDt.getFullYear(),minDt.getMonth(),minDt.getDate()),end=new Date(maxDt.getFullYear(),maxDt.getMonth(),maxDt.getDate());
    while(cursor<=end){ var k=dateKey(cursor); pontos.push({key:k,toKey:k,label:fmtDateBR(cursor),value:byDay[k]||0}); cursor.setDate(cursor.getDate()+1); }

    var pontosFinal=pontos;
    if(pontos.length>60){ // agrupa por semana pra não poluir quando o período é muito longo
      var porSemana={};
      pontos.forEach(function(p){
        var d=parseISOSimples(p.key); var inicioSemana=new Date(d); inicioSemana.setDate(d.getDate()-d.getDay());
        var chaveSemana=dateKey(inicioSemana);
        if(!porSemana[chaveSemana])porSemana[chaveSemana]={key:chaveSemana,toKey:p.key,label:fmtDateBR(inicioSemana),value:0};
        porSemana[chaveSemana].value+=p.value; porSemana[chaveSemana].toKey=p.key;
      });
      pontosFinal=Object.keys(porSemana).sort().map(function(k){return porSemana[k];});
    }

    var w=1000,h=220,padL=10,padR=10,padT=16,padB=28;
    var maxV=Math.max.apply(null,pontosFinal.map(function(p){return p.value;}))||1;
    var n=pontosFinal.length,stepX=n>1?(w-padL-padR)/(n-1):0;
    function x(i){return padL+i*stepX;}
    function y(v){return h-padB-(v/maxV)*(h-padT-padB);}
    var pathD=pontosFinal.map(function(p,i){return (i===0?'M':'L')+x(i).toFixed(1)+','+y(p.value).toFixed(1);}).join(' ');
    var areaD=pathD+' L'+x(n-1).toFixed(1)+','+(h-padB)+' L'+x(0).toFixed(1)+','+(h-padB)+' Z';
    var circles=pontosFinal.map(function(p,i){return '<circle class="linechart-dot" data-key="'+p.key+'" data-tokey="'+p.toKey+'" data-label="'+escapeHtml(p.label)+'" data-value="'+p.value+'" cx="'+x(i).toFixed(1)+'" cy="'+y(p.value).toFixed(1)+'" r="4"></circle>';}).join('');
    var passoLabel=Math.max(1,Math.ceil(n/10));
    var labels=pontosFinal.map(function(p,i){ if(i%passoLabel!==0&&i!==n-1)return ''; return '<text class="linechart-label" x="'+x(i).toFixed(1)+'" y="'+(h-8)+'" text-anchor="middle">'+escapeHtml(p.label)+'</text>'; }).join('');

    wrap.innerHTML='<svg viewBox="0 0 '+w+' '+h+'" class="linechart-svg" preserveAspectRatio="none">'+
      '<path d="'+areaD+'" class="linechart-area"></path>'+
      '<path d="'+pathD+'" class="linechart-line" vector-effect="non-scaling-stroke"></path>'+
      circles+labels+
    '</svg><div class="linechart-tooltip" id="db-lineTooltip"></div>';

    wrap.querySelectorAll('.linechart-dot').forEach(function(dot){
      dot.addEventListener('mouseenter',function(){
        var tt=document.getElementById('db-lineTooltip');
        var wrapRect=wrap.getBoundingClientRect(),dotRect=dot.getBoundingClientRect();
        tt.textContent=dot.getAttribute('data-label')+': '+fmtMoney(dot.getAttribute('data-value'));
        tt.style.left=(dotRect.left-wrapRect.left+dotRect.width/2)+'px';
        tt.style.top=(dotRect.top-wrapRect.top)+'px';
        tt.style.opacity='1';
      });
      dot.addEventListener('mouseleave',function(){ var tt=document.getElementById('db-lineTooltip'); if(tt)tt.style.opacity='0'; });
      dot.addEventListener('click',function(e){ selecionarPeriodoChart(dot.getAttribute('data-key'),dot.getAttribute('data-tokey'),e.shiftKey); });
    });
    highlightLineSelection();
  }

  function renderHBars(containerId,mapaValores,funcaoNome,idSelectAlvo){
    var container=document.getElementById(containerId);
    var entradas=Object.keys(mapaValores).map(function(id){return {id:id,valor:mapaValores[id]};}).sort(function(a,b){return b.valor-a.valor;}).slice(0,8);
    if(!entradas.length){ container.innerHTML='<div class="chart-empty" style="height:80px;">Nenhum dado no período</div>'; return; }
    var maxV=entradas[0].valor||1;
    var selecionado=document.getElementById(idSelectAlvo).value;
    container.innerHTML=entradas.map(function(e){
      var pct=Math.max(2,Math.round((e.valor/maxV)*100));
      var ativo=selecionado===e.id;
      return '<div class="hbar-row'+(ativo?' selected':'')+'" data-id="'+escapeHtml(e.id)+'">'+
        '<div class="hbar-label" title="'+escapeHtml(funcaoNome(e.id))+'">'+escapeHtml(funcaoNome(e.id))+'</div>'+
        '<div class="hbar-track"><div class="hbar-fill" style="width:'+pct+'%;"></div></div>'+
        '<div class="hbar-value">'+fmtMoney(e.valor)+'</div>'+
      '</div>';
    }).join('');
    container.querySelectorAll('.hbar-row').forEach(function(row){
      row.addEventListener('click',function(){
        var sel=document.getElementById(idSelectAlvo),id=row.getAttribute('data-id');
        sel.value=(sel.value===id)?'__all__':id;
        render();
      });
    });
  }

  function renderFunilConversao(relatorios){
    var contatos=relatorios.reduce(function(s,r){return s+r.contatos;},0);
    var conversas=relatorios.reduce(function(s,r){return s+r.conversas;},0);
    var propostas=relatorios.reduce(function(s,r){return s+r.propostas;},0);
    var vendas=relatorios.reduce(function(s,r){return s+r.vendas;},0);
    var etapas=[{label:'Novos contatos',valor:contatos,cor:'#3b82f6'},{label:'Conversas',valor:conversas,cor:'var(--accent)'},{label:'Propostas apresentadas',valor:propostas,cor:'var(--warn)'},{label:'Vendas fechadas',valor:vendas,cor:'var(--accent-deep)'}];
    var maxV=Math.max(contatos,1);
    document.getElementById('db-funilConversao').innerHTML=etapas.map(function(e){
      var pct=Math.max(2,Math.round((e.valor/maxV)*100));
      var pctDoContato=contatos>0?Math.round(e.valor/contatos*100):0;
      return '<div style="margin-bottom:12px;">'+
        '<div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px;"><span style="font-weight:600;color:var(--ink-soft);">'+e.label+'</span><span style="font-weight:700;">'+e.valor+(e.label!=='Novos contatos'?' · '+pctDoContato+'% dos contatos':'')+'</span></div>'+
        '<div class="hbar-track" style="height:16px;"><div class="hbar-fill" style="width:'+pct+'%;background:'+e.cor+';"></div></div>'+
      '</div>';
    }).join('');
  }

  function renderInsight(f,faturamento,custosTotais,lucro,ticketMedio,conversao,novosLeads){
    var el=document.getElementById('db-insightText');
    if(!f.vendasFat.length&&!f.relatorios.length&&!f.leads.length){ el.textContent='Sem dados no período/filtro selecionado.'; return; }
    var partes=[];
    var from=document.getElementById('db-dateFrom').value,to=document.getElementById('db-dateTo').value;
    var periodoTexto=(from&&to)?('entre '+fmtDateBRDoISO(from)+' e '+fmtDateBRDoISO(to)):'no período selecionado';

    partes.push('No período '+periodoTexto+', o faturamento foi de <strong>'+fmtMoney(faturamento)+'</strong>, com '+f.vendasFat.length+' venda(s) e ticket médio de <strong>'+fmtMoney(ticketMedio)+'</strong>.');

    if(custosTotais>0){
      var margemPct=faturamento>0?(lucro/faturamento*100):0;
      partes.push('Os custos somaram '+fmtMoney(custosTotais)+', resultando num lucro operacional de <strong>'+fmtMoney(lucro)+'</strong>'+(faturamento>0?(' (margem de '+margemPct.toFixed(1).replace('.',',')+'%)'):'')+'.');
    }

    var porVendedor={};
    f.vendasFat.forEach(function(v){ porVendedor[v.idVendedor]=(porVendedor[v.idVendedor]||0)+v.valor; });
    var idsVendedores=Object.keys(porVendedor);
    if(idsVendedores.length>1){
      idsVendedores.sort(function(a,b){return porVendedor[b]-porVendedor[a];});
      var liderId=idsVendedores[0];
      var fatiaLider=faturamento>0?(porVendedor[liderId]/faturamento*100):0;
      partes.push('<strong>'+escapeHtml(nomeVendedor(liderId))+'</strong> liderou o período, respondendo por '+fatiaLider.toFixed(0)+'% do faturamento.');
    }

    if(f.relatorios.length){
      partes.push('A taxa de conversão de propostas em vendas ficou em <strong>'+conversao.toFixed(1).replace('.',',')+'%</strong>, com '+novosLeads+' novo(s) lead(s) entrando no funil.');
    }

    if(f.vendasFat.length>=4){
      var datasOrdenadas=f.vendasFat.map(function(v){return v.dt.getTime();}).sort(function(a,b){return a-b;});
      var meio=datasOrdenadas[Math.floor(datasOrdenadas.length/2)];
      var primeiraMetade=f.vendasFat.filter(function(v){return v.dt.getTime()<meio;}).reduce(function(s,v){return s+v.valor;},0);
      var segundaMetade=f.vendasFat.filter(function(v){return v.dt.getTime()>=meio;}).reduce(function(s,v){return s+v.valor;},0);
      if(primeiraMetade>0){
        var variacao=((segundaMetade-primeiraMetade)/primeiraMetade*100);
        if(Math.abs(variacao)>=8){
          partes.push('O ritmo de vendas '+(variacao>0?'acelerou':'desacelerou')+' na segunda metade do período ('+(variacao>0?'+':'')+variacao.toFixed(0)+'%).');
        }
      }
    }

    el.innerHTML=partes.join(' ');
  }

  function render(){
    var f=getFiltered();
    var faturamento=f.vendasFat.reduce(function(s,v){return s+v.valor;},0);
    var custosOpTotal=f.custosOp.reduce(function(s,c){return s+c.valor;},0);
    var custosEscTotal=f.custosEsc.reduce(function(s,c){return s+c.valor;},0);
    var custosEscProporcional=custoEscritorioProporcional(custosEscTotal,faturamento);
    var custosTotais=custosOpTotal+custosEscProporcional;
    var lucro=faturamento-custosTotais;
    var ticketMedio=f.vendasFat.length>0?faturamento/f.vendasFat.length:0;
    var propostasTotal=f.relatorios.reduce(function(s,r){return s+r.propostas;},0);
    var vendasRelTotal=f.relatorios.reduce(function(s,r){return s+r.vendas;},0);
    var conversao=propostasTotal>0?(vendasRelTotal/propostasTotal*100):0;
    var novosLeads=f.leads.length;

    document.getElementById('db-kpiFaturamento').textContent=fmtMoney(faturamento);
    document.getElementById('db-kpiFaturamentoSub').textContent=f.vendasFat.length+' venda(s) no período/filtro';
    document.getElementById('db-kpiCustos').textContent=fmtMoney(custosTotais);
    document.getElementById('db-kpiLucro').textContent=fmtMoney(lucro);
    document.getElementById('db-kpiLucro').style.color=lucro>=0?'var(--accent-deep)':'var(--debit)';
    document.getElementById('db-kpiTicket').textContent=fmtMoney(ticketMedio);
    document.getElementById('db-kpiTicketSub').textContent='faturamento ÷ nº de vendas';
    document.getElementById('db-kpiConversao').textContent=conversao.toFixed(1).replace('.',',')+'%';
    document.getElementById('db-kpiConversaoSub').textContent=vendasRelTotal+' vendas / '+propostasTotal+' propostas (Relatórios)';
    document.getElementById('db-kpiLeads').textContent=novosLeads;
    document.getElementById('db-kpiLeadsSub').textContent='criados no período, no Funil';

    var porVendedor={}; f.vendasFat.forEach(function(v){ porVendedor[v.idVendedor]=(porVendedor[v.idVendedor]||0)+v.valor; });
    var porServico={}; f.vendasFat.forEach(function(v){ porServico[v.idServico]=(porServico[v.idServico]||0)+v.valor; });

    renderLineChart(f.vendasFat);
    renderHBars('db-barVendedores',porVendedor,nomeVendedor,'db-selVendedor');
    renderHBars('db-barServicos',porServico,nomeServico,'db-selServico');
    renderFunilConversao(f.relatorios);
    renderInsight(f,faturamento,custosTotais,lucro,ticketMedio,conversao,novosLeads);

    document.getElementById('db-lastUpdate').textContent='Atualizado em '+new Date().toLocaleDateString('pt-BR')+' às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }

  function aplicarDados(vendasResp,funilResp,relatoriosResp){
    vendedoresMap={}; (vendasResp.vendedores||[]).forEach(function(v){if(v.IdVendedor)vendedoresMap[v.IdVendedor]=v;});
    clientesMap={}; (vendasResp.clientes||[]).forEach(function(c){if(c.IdCliente)clientesMap[c.IdCliente]=c;});
    servicosMap={}; (vendasResp.servicos||[]).forEach(function(s){if(s.IdServico)servicosMap[s.IdServico]=s;});
    vendasRecords=processVendas(vendasResp.vendas||[]);
    // Qualquer venda lançada sob o Cliente Teste 1 é uma "gaveta" de custo de
    // escritório, não só uma canônica — sem isso, custo lançado numa
    // venda-gaveta diferente contava como custo de venda real.
    vendasEscritorioIds={};vendasRecords.forEach(function(v){if(v.idCliente===ID_CLIENTE_APORTE_SOCIOS)vendasEscritorioIds[v.idVenda]=true;});
    custosVendaRecords=processCustosVenda(vendasResp.custosVenda||[]);
    relatoriosRecords=processRelatorios((relatoriosResp&&relatoriosResp.relatorios)||[]);
    funilRecords=processFunil((funilResp&&funilResp.funil)||[]);
    popularSelects();
    if(!document.getElementById('db-dateFrom').value&&!document.getElementById('db-dateTo').value)setRangeTudo();
    document.getElementById('db-emptyState').style.display='none';
    document.getElementById('db-appVersion').textContent='v'+APP_VERSION;
    render();
  }

  function carregar(){
    var cacheKey='dashboard_comercial';
    var cache=window.SGCache&&window.SGCache.get(cacheKey);
    var temCache=!!(cache&&cache.dados);
    if(temCache)aplicarDados(cache.dados.vendas,cache.dados.funil,cache.dados.relatorios);

    var epocaInicio=_epoca.atual();
    Promise.all([apiCall('getVendasData',{}),apiCall('getFunilData',{}),apiCall('getRelatoriosData',{})]).then(function(resps){
      var vendasResp=resps[0],funilResp=resps[1],relatoriosResp=resps[2];
      if(!vendasResp||!vendasResp.ok){
        if(!temCache){ document.getElementById('db-emptyState').style.display='block'; document.getElementById('db-emptyState').querySelector('p').textContent=(vendasResp&&vendasResp.erro)||'Não foi possível carregar.'; }
        return;
      }
      if(window.SGCache)window.SGCache.set(cacheKey,{vendas:vendasResp,funil:funilResp,relatorios:relatoriosResp});
      if(_epoca.atual()!==epocaInicio)return;
      aplicarDados(vendasResp,funilResp,relatoriosResp);
    }).catch(function(err){
      if(!temCache){ document.getElementById('db-emptyState').style.display='block'; document.getElementById('db-emptyState').querySelector('p').textContent='Erro de conexão: '+err.message; }
    });
  }

  function init(){
    if(_initialized)return;
    if(!window.SG_SESSION)return;
    _initialized=true;
    document.getElementById('db-dateFrom').addEventListener('change',function(){ document.querySelectorAll('#view-dashboard .qr-btn[data-dbrange]').forEach(function(b){b.classList.remove('active');}); render(); });
    document.getElementById('db-dateTo').addEventListener('change',function(){ document.querySelectorAll('#view-dashboard .qr-btn[data-dbrange]').forEach(function(b){b.classList.remove('active');}); render(); });
    document.getElementById('db-selVendedor').addEventListener('change',render);
    document.getElementById('db-selServico').addEventListener('change',render);
    document.querySelectorAll('#view-dashboard .qr-btn[data-dbrange]').forEach(function(btn){
      btn.addEventListener('click',function(){
        document.querySelectorAll('#view-dashboard .qr-btn[data-dbrange]').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');
        var r=btn.getAttribute('data-dbrange');
        if(r==='30')setRangeDias(30); else if(r==='90')setRangeDias(90); else if(r==='month')setRangeEsteMes(); else setRangeTudo();
        render();
      });
    });
    document.getElementById('db-resetFiltros').addEventListener('click',function(){
      document.getElementById('db-selVendedor').value='__all__';
      document.getElementById('db-selServico').value='__all__';
      document.querySelectorAll('#view-dashboard .qr-btn[data-dbrange]').forEach(function(b){b.classList.remove('active');});
      document.querySelector('#view-dashboard .qr-btn[data-dbrange="all"]').classList.add('active');
      setRangeTudo();
      render();
    });
    carregar();
  }

  window.dashboardApp={init:init};
})();


