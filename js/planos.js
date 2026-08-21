// ════ PLANOS (clientes assinantes) ════
(function(){
  var _initialized=false;
  var _epoca=window.SGEpoca.criar();
  var planos=[], clientesMap={}, vendedoresMap={};
  var editandoId=null;
  var paginaAtual=1, ITENS_POR_PAGINA=10;
  var sortState={col:'cliente',dir:'asc'};
  var filtroStatusPlanos='__all__';
  var APP_VERSION='2026-07-16-1';

  function apiCall(action,extra){ return window.SGAuth.apiCall(action,extra); }
  function escapeHtml(s){ return window.SGUtil.escapeHtml(s); }
  function isMarcado(v){ if(v===true)return true; if(v===false||v===undefined||v===null||v==='')return false; var s=String(v).trim().toUpperCase(); return s==='VERDADEIRO'||s==='TRUE'||s==='SIM'||s==='1'; }
  function normalizaTextoPl(s){ return String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function nomeCliente(id){ var c=clientesMap[id]; return c?(c['Nome Razao Social']||c.Nome||id):id; }
  function idVendedorDoCliente(idCliente){ var c=clientesMap[idCliente]; return c?(c['Vendedor Responsavel']||''):''; }
  function nomeVendedorDoCliente(idCliente){ var idV=idVendedorDoCliente(idCliente); var v=vendedoresMap[idV]; return v?(v.Nome||idV):(idV?idV:'—'); }
  function fmtMoney(n){ return window.SGUtil.fmtMoney(n); }
  function parseBRDate(str){ return window.SGUtil.parseBRDate(str); }
  function fmtDateBR(d){ return window.SGUtil.fmtDateBR(d); }
  function dateKeyFromDate(d){ return window.SGUtil.dateKey(d); }

  function renderPaginacao(totalPaginas){
    var el=document.getElementById('pl-paginacao');
    if(!el)return;
    if(totalPaginas<=1){el.innerHTML='';return;}
    el.innerHTML='<button type="button" id="pl-pgAnterior" '+(paginaAtual<=1?'disabled':'')+'>‹ Anterior</button><span class="pg-info">Página '+paginaAtual+' de '+totalPaginas+'</span><button type="button" id="pl-pgProxima" '+(paginaAtual>=totalPaginas?'disabled':'')+'>Próxima ›</button>';
    var a=document.getElementById('pl-pgAnterior'); if(a)a.addEventListener('click',function(){if(paginaAtual>1){paginaAtual--;render();}});
    var p=document.getElementById('pl-pgProxima'); if(p)p.addEventListener('click',function(){if(paginaAtual<totalPaginas){paginaAtual++;render();}});
  }

  function popularSelectVendedorPl(){
    var sel=document.getElementById('pl-selVendedor');
    var atual=sel.value||'__all__';
    sel.innerHTML='<option value="__all__">Todos os vendedores</option>'+
      Object.keys(vendedoresMap).map(function(id){return vendedoresMap[id];})
        .filter(function(v){return normalizaTextoPl(v.Tipo)==='vendedor';})
        .sort(function(a,b){return (a.Nome||'').localeCompare(b.Nome||'','pt-BR');})
        .map(function(v){return '<option value="'+escapeHtml(v.IdVendedor)+'">'+escapeHtml(v.Nome)+'</option>';}).join('');
    sel.value=atual;
  }

  function sortPlanosRows(lista){
    var col=sortState.col,dir=sortState.dir,mult=dir==='asc'?1:-1;
    lista.sort(function(a,b){
      var va,vb;
      if(col==='cliente'){va=nomeCliente(a.IdCliente);vb=nomeCliente(b.IdCliente);return mult*va.localeCompare(vb,'pt-BR');}
      if(col==='vendedor'){va=nomeVendedorDoCliente(a.IdCliente);vb=nomeVendedorDoCliente(b.IdCliente);return mult*va.localeCompare(vb,'pt-BR');}
      if(col==='tipo'){va=a.TipoAssinatura||'';vb=b.TipoAssinatura||'';return mult*va.localeCompare(vb,'pt-BR');}
      if(col==='status'){va=a.Status||'';vb=b.Status||'';return mult*va.localeCompare(vb,'pt-BR');}
      if(col==='valor'){va=(String(a.Valor||'0').indexOf(',')!==-1?parseFloat(String(a.Valor||'0').replace(/\./g,'').replace(',','.')):parseFloat(a.Valor))||0;vb=(String(b.Valor||'0').indexOf(',')!==-1?parseFloat(String(b.Valor||'0').replace(/\./g,'').replace(',','.')):parseFloat(b.Valor))||0;return mult*(va-vb);}
      if(col==='vencimento'){va=parseBRDate(a.DiaVencimento);vb=parseBRDate(b.DiaVencimento);va=va?va.getTime():-Infinity;vb=vb?vb.getTime():-Infinity;return mult*(va-vb);}
      return 0;
    });
  }

  function updateSortHeadersPl(){
    document.querySelectorAll('#view-planos th.sortable').forEach(function(th){
      var col=th.getAttribute('data-sort');
      th.classList.toggle('sort-active',col===sortState.col);
      var a=th.querySelector('.arrow-sort');
      a.textContent=(col===sortState.col)?(sortState.dir==='asc'?'▴':'▾'):'▾';
    });
  }

  function render(){
    var filtroVendedor=(document.getElementById('pl-selVendedor')||{}).value||'__all__';
    var planosFiltrados=filtroVendedor==='__all__'?planos:planos.filter(function(p){return idVendedorDoCliente(p.IdCliente)===filtroVendedor;});

    var ativos=planosFiltrados.filter(function(p){return (p.Status||'').trim().toLowerCase()==='ativo';});
    var inativos=planosFiltrados.filter(function(p){return (p.Status||'').trim().toLowerCase()!=='ativo';});
    var receita=ativos.filter(function(p){return normalizaTextoPl(p.TipoAssinatura)==='mensal';}).reduce(function(s,p){var v=p.Valor;if(typeof v==='string')v=(v.indexOf(',')!==-1?parseFloat(v.replace(/\./g,'').replace(',','.')):parseFloat(v))||0;else v=parseFloat(v)||0;return s+v;},0);
    document.getElementById('pl-kpiAtivos').textContent=ativos.length;
    document.getElementById('pl-kpiInativos').textContent=inativos.length;
    document.getElementById('pl-kpiReceita').textContent=fmtMoney(receita);
    document.querySelectorAll('#view-planos .kpi-clickable').forEach(function(k){
      k.classList.toggle('active',k.getAttribute('data-plstatus')===filtroStatusPlanos);
    });

    // o filtro de status (clicando nos KPIs) só se aplica na TABELA — os
    // próprios KPIs continuam mostrando o total de cada um, senão clicar
    // num deles zerava o outro, o que não faz sentido pra um filtro clicável
    var planosParaTabela=filtroStatusPlanos==='__all__'?planosFiltrados:
      (filtroStatusPlanos==='Ativo'?ativos:inativos);

    var ordenados=planosParaTabela.slice();
    sortPlanosRows(ordenados);
    updateSortHeadersPl();

    var totalPaginas=Math.max(1,Math.ceil(ordenados.length/ITENS_POR_PAGINA));
    if(paginaAtual>totalPaginas)paginaAtual=totalPaginas;
    if(paginaAtual<1)paginaAtual=1;
    var inicio=(paginaAtual-1)*ITENS_POR_PAGINA;
    var pagina=ordenados.slice(inicio,inicio+ITENS_POR_PAGINA);

    document.getElementById('pl-tableHint').textContent=ordenados.length+' plano(s) cadastrado(s)';

    var tbody=document.getElementById('pl-tbody');
    if(!pagina.length){
      tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--ink-faint);padding:30px;">Nenhum plano cadastrado ainda.</td></tr>';
      renderPaginacao(0);
      return;
    }
    tbody.innerHTML=pagina.map(function(p){
      var servicos=[];
      if(isMarcado(p.Monitoramento))servicos.push('Monitoramento');
      if(isMarcado(p.VistoriaDiagnostica))servicos.push('Vistoria');
      if(isMarcado(p.Limpeza))servicos.push('Limpeza');
      if(isMarcado(p.ManutencaoPreventiva))servicos.push('Manutenção');
      var ativo=(p.Status||'').trim().toLowerCase()==='ativo';
      var venc=parseBRDate(p.DiaVencimento);
      return '<tr class="ag-row-click" data-id="'+escapeHtml(p.IdPlano)+'">'+
        '<td>'+escapeHtml(nomeCliente(p.IdCliente))+'</td>'+
        '<td>'+escapeHtml(nomeVendedorDoCliente(p.IdCliente))+'</td>'+
        '<td>'+escapeHtml(p.TipoAssinatura||'—')+'</td>'+
        '<td class="num">'+fmtMoney(p.Valor)+'</td>'+
        '<td>'+(venc?fmtDateBR(venc):'—')+'</td>'+
        '<td style="font-size:11.5px;color:var(--ink-soft);">'+(servicos.length?escapeHtml(servicos.join(', ')):'—')+'</td>'+
        '<td><span class="ag-status-tag '+(ativo?'concluido':'cancelado')+'">'+escapeHtml(p.Status||'—')+'</span></td>'+
      '</tr>';
    }).join('');
    tbody.querySelectorAll('.ag-row-click').forEach(function(tr){
      tr.addEventListener('click',function(){ try{ abrirVisualizacaoPlano(tr.getAttribute('data-id')); }catch(err){ console.error('abrirVisualizacaoPlano falhou:',err); (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Não foi possível abrir esse registro (erro: '+err.message+'). Atualize a página e tente de novo.',true); } });
    });
    renderPaginacao(totalPaginas);
    document.getElementById('pl-lastUpdate').textContent='Atualizado em '+new Date().toLocaleDateString('pt-BR')+' às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }

  function popularSelectCliente(){
    var sel=document.getElementById('pm-cliente');
    sel.innerHTML='<option value="">— Selecionar cliente…</option>'+
      Object.keys(clientesMap).map(function(id){return clientesMap[id];})
        .sort(function(a,b){return (a['Nome Razao Social']||a.Nome||'').localeCompare(b['Nome Razao Social']||b.Nome||'','pt-BR');})
        .map(function(c){return '<option value="'+escapeHtml(c.IdCliente)+'">'+escapeHtml(c['Nome Razao Social']||c.Nome||c.IdCliente)+'</option>';}).join('');
  }

  /**
   * Painel de VISUALIZAÇÃO do plano — abre ao clicar na linha. Lápis chama
   * abrirModalPlano(id) pra editar; lixeira exclui direto.
   */
  function abrirVisualizacaoPlano(idPlano){
    var p=planos.filter(function(x){return String(x.IdPlano)===String(idPlano);})[0];
    if(!p)return;
    editandoId=idPlano;
    var servicos=[];
    if(isMarcado(p.Monitoramento))servicos.push('Monitoramento');
    if(isMarcado(p.VistoriaDiagnostica))servicos.push('Vistoria');
    if(isMarcado(p.Limpeza))servicos.push('Limpeza');
    if(isMarcado(p.ManutencaoPreventiva))servicos.push('Manutenção');
    var ativo=(p.Status||'').trim().toLowerCase()==='ativo';
    var venc=parseBRDate(p.DiaVencimento);
    var dataAss=parseBRDate(p.DataAssinatura);
    var html='<div class="ad-section">'+
      '<span class="ag-status-tag '+(ativo?'concluido':'cancelado')+'">'+escapeHtml(p.Status||'—')+'</span>'+
      '<div class="ad-row" style="margin-top:10px;"><span class="dl">Cliente</span><span class="dv">'+escapeHtml(nomeCliente(p.IdCliente))+'</span></div>'+
      '<div class="ad-row"><span class="dl">Vendedor</span><span class="dv">'+escapeHtml(nomeVendedorDoCliente(p.IdCliente))+'</span></div>'+
      '<div class="ad-row"><span class="dl">Tipo</span><span class="dv">'+escapeHtml(p.TipoAssinatura||'—')+'</span></div>'+
      '<div class="ad-row"><span class="dl">Valor</span><span class="dv">'+fmtMoney(p.Valor)+'</span></div>'+
      '<div class="ad-row"><span class="dl">Assinado em</span><span class="dv">'+(dataAss?fmtDateBR(dataAss):'—')+'</span></div>'+
      '<div class="ad-row"><span class="dl">Vencimento</span><span class="dv">'+(venc?fmtDateBR(venc):'—')+'</span></div>'+
      '<div class="ad-row"><span class="dl">Serviços inclusos</span><span class="dv">'+(servicos.length?escapeHtml(servicos.join(', ')):'—')+'</span></div>'+
    '</div>';

    window.SGViewPanel.abrir({
      titulo:nomeCliente(p.IdCliente),
      html:html,
      onEditar:function(){ abrirModalPlano(idPlano); },
      onExcluir:function(){ editandoId=idPlano; excluirPlano(); }
    });
  }

  function abrirModalPlano(idPlano){
    popularSelectCliente();
    var p=idPlano?planos.filter(function(x){return String(x.IdPlano)===String(idPlano);})[0]:null;
    editandoId=idPlano||null;
    document.getElementById('planoModalTitle').textContent=p?'Editar plano':'Novo plano';
    document.getElementById('pm-cliente').value=p?(p.IdCliente||''):'';
    document.getElementById('pm-tipo').value=p?(p.TipoAssinatura||'Mensal'):'Mensal';
    document.getElementById('pm-valor').value=p?p.Valor:'';
    var da=p?parseBRDate(p.DataAssinatura):null;
    document.getElementById('pm-dataAssinatura').value=da?dateKeyFromDate(da):'';
    var venc=p?parseBRDate(p.DiaVencimento):null;
    document.getElementById('pm-vencimento').value=venc?dateKeyFromDate(venc):'';
    document.getElementById('pm-status').value=p?(p.Status||'Ativo'):'Ativo';
    document.getElementById('pm-monitoramento').checked=p?isMarcado(p.Monitoramento):false;
    document.getElementById('pm-vistoria').checked=p?isMarcado(p.VistoriaDiagnostica):false;
    document.getElementById('pm-limpeza').checked=p?isMarcado(p.Limpeza):false;
    document.getElementById('pm-manutencao').checked=p?isMarcado(p.ManutencaoPreventiva):false;
    document.getElementById('pm-excluirBtn').style.display=p?'block':'none';
    document.getElementById('pm-msg').textContent='';
    document.getElementById('pm-msg').className='uform-msg';
    document.getElementById('pm-msg').onclick=null;
    document.getElementById('planoModal').classList.remove('hidden');
  }
  function fecharModalPlano(){ document.getElementById('planoModal').classList.add('hidden'); editandoId=null; }

  function salvarPlano(){
    var idCliente=document.getElementById('pm-cliente').value;
    var tipo=document.getElementById('pm-tipo').value;
    if(!idCliente||!tipo){ var m=document.getElementById('pm-msg'); m.className='uform-msg error'; m.textContent='Cliente e tipo de assinatura são obrigatórios.'; m.onclick=null; return; }

    // O plano depende de saber acessar a fatura de energia (Equatorial) do
    // titular — que pode ser uma pessoa diferente de quem assina o contrato.
    // Sem esses dois dados no cadastro do cliente, não dá pra operar o plano.
    var clienteDoPlano=clientesMap[idCliente];
    var cpfEqOk=clienteDoPlano&&String(clienteDoPlano.CPFEquatorial||'').trim();
    var dataNascEqOk=clienteDoPlano&&String(clienteDoPlano.DataNascimentoEquatorial||'').trim();
    if(!cpfEqOk||!dataNascEqOk){
      var m2=document.getElementById('pm-msg');
      m2.className='uform-msg error sg-msg-fix';
      m2.innerHTML='Esse cliente ainda não tem CPF e data de nascimento do titular Equatorial cadastrados — <strong>clique aqui pra preencher no cadastro do cliente</strong>.';
      m2.onclick=function(){
        if(window.clientesApp&&window.clientesApp.abrirEdicao)window.clientesApp.abrirEdicao(idCliente);
      };
      return;
    }

    var valor=document.getElementById('pm-valor').value;
    var dataAssinatura=document.getElementById('pm-dataAssinatura').value;
    var diaVencimento=document.getElementById('pm-vencimento').value;
    var status=document.getElementById('pm-status').value;
    var monitoramento=document.getElementById('pm-monitoramento').checked;
    var vistoria=document.getElementById('pm-vistoria').checked;
    var limpeza=document.getElementById('pm-limpeza').checked;
    var manutencao=document.getElementById('pm-manutencao').checked;

    var ehNovo=!editandoId;
    var idPlano=editandoId||window.SGId.gerar();
    var registroAnterior=!ehNovo?planos.filter(function(p){return String(p.IdPlano)===String(idPlano);})[0]:null;
    var registroAnteriorCopia=registroAnterior?Object.assign({},registroAnterior):null;

    function dataBRDe(iso){ if(!iso)return ''; var partes=iso.split('-'); return partes[2]+'/'+partes[1]+'/'+partes[0]; }
    var registroNovo={
      IdPlano:idPlano, IdCliente:idCliente, TipoAssinatura:tipo, Valor:valor,
      DataAssinatura:dataBRDe(dataAssinatura), DiaVencimento:dataBRDe(diaVencimento), Status:status,
      Monitoramento:monitoramento, VistoriaDiagnostica:vistoria, Limpeza:limpeza, ManutencaoPreventiva:manutencao
    };
    var indice=planos.findIndex(function(p){return String(p.IdPlano)===String(idPlano);});
    if(indice===-1)planos.push(registroNovo);
    else planos[indice]=registroNovo;
    _epoca.marcar();

    fecharModalPlano();
    render();
    mostrarToastPlanos(ehNovo?'Plano criado.':'Plano atualizado.');

    apiCall('salvarPlano',{
      idPlano: idPlano,
      idCliente: idCliente, tipoAssinatura: tipo,
      valor: valor, dataAssinatura: dataAssinatura, diaVencimento: diaVencimento, status: status,
      monitoramento: monitoramento, vistoriaDiagnostica: vistoria, limpeza: limpeza, manutencaoPreventiva: manutencao
    }).then(function(resp){
      if(!resp||!resp.ok){
        if(ehNovo)planos=planos.filter(function(p){return String(p.IdPlano)!==String(idPlano);});
        else{ var idx=planos.findIndex(function(p){return String(p.IdPlano)===String(idPlano);}); if(idx!==-1&&registroAnteriorCopia)planos[idx]=registroAnteriorCopia; }
        _epoca.marcar();
        render();
        mostrarToastPlanos((resp&&resp.erro)||'Não foi possível salvar — a alteração foi desfeita.',true);
        return;
      }
      if(resp.idPlano&&String(resp.idPlano)!==String(idPlano)){
        var idx2=planos.findIndex(function(p){return String(p.IdPlano)===String(idPlano);});
        if(idx2!==-1)planos[idx2].IdPlano=resp.idPlano;
        render();
      }
    }).catch(function(err){
      if(ehNovo)planos=planos.filter(function(p){return String(p.IdPlano)!==String(idPlano);});
      else{ var idx=planos.findIndex(function(p){return String(p.IdPlano)===String(idPlano);}); if(idx!==-1&&registroAnteriorCopia)planos[idx]=registroAnteriorCopia; }
      _epoca.marcar();
      render();
      mostrarToastPlanos('Erro de conexão — a alteração foi desfeita: '+err.message,true);
    });
  }

  function excluirPlano(){
    if(!editandoId)return;
    if(!confirm('Tem certeza que deseja excluir esse plano? Essa ação não pode ser desfeita.'))return;
    var idPlano=editandoId;
    var registroAnterior=planos.filter(function(p){return String(p.IdPlano)===String(idPlano);})[0];

    planos=planos.filter(function(p){return String(p.IdPlano)!==String(idPlano);});
    _epoca.marcar();
    fecharModalPlano();
    if(window.SGViewPanel)window.SGViewPanel.fechar();
    render();
    mostrarToastPlanos('Plano excluído.');

    apiCall('excluirPlano',{idPlano:idPlano,solicitanteId:(window.SG_SESSION&&window.SG_SESSION.idVendedor)||''}).then(function(resp){
      if(!resp||!resp.ok){
        if(window.SGUtil.ehNaoEncontrado(resp&&resp.erro))return;
        if(registroAnterior)planos.push(registroAnterior);
        _epoca.marcar();
        render();
        mostrarToastPlanos((resp&&resp.erro)||'Não foi possível excluir — o plano foi restaurado.',true);
      }
    }).catch(function(err){
      if(registroAnterior)planos.push(registroAnterior);
      _epoca.marcar();
      render();
      mostrarToastPlanos('Erro de conexão — o plano foi restaurado: '+err.message,true);
    });
  }

  function mostrarToastPlanos(texto,erro){ window.SGToast.mostrar(texto,erro); }

  function aplicarDados(resp){
    planos=resp.planos||[];
    clientesMap={};(resp.clientes||[]).forEach(function(c){if(c.IdCliente)clientesMap[c.IdCliente]=c;});
    vendedoresMap={};(resp.vendedores||[]).forEach(function(v){if(v.IdVendedor)vendedoresMap[v.IdVendedor]=v;});
    popularSelectVendedorPl();
    document.getElementById('pl-emptyState').style.display='none';
    document.getElementById('pl-appVersion').textContent='v'+APP_VERSION;
    render();
  }

  function carregar(){
    var cache=window.SGCache&&window.SGCache.get('planos');
    var temCache=!!(cache&&cache.dados);
    if(temCache)aplicarDados(cache.dados);
    var epocaInicio=_epoca.atual();
    apiCall('getPlanosData',{}).then(function(resp){
      if(!resp||!resp.ok){
        if(!temCache){document.getElementById('pl-emptyState').style.display='block';document.getElementById('pl-emptyState').querySelector('p').textContent=(resp&&resp.erro)||'Não foi possível carregar os planos.';}
        return;
      }
      if(window.SGCache)window.SGCache.set('planos',resp);
      if(_epoca.atual()!==epocaInicio)return;
      aplicarDados(resp);
    }).catch(function(err){
      if(!temCache){document.getElementById('pl-emptyState').style.display='block';document.getElementById('pl-emptyState').querySelector('p').textContent='Erro de conexão: '+err.message;}
    });
  }

  function init(){
    if(_initialized)return;
    if(!window.SG_SESSION)return;
    _initialized=true;
    document.getElementById('pl-novoBtn').addEventListener('click',function(){ abrirModalPlano(null); });
    document.getElementById('pm-cancelarBtn').addEventListener('click',fecharModalPlano);
    document.getElementById('pm-salvarBtn').addEventListener('click',salvarPlano);
    document.getElementById('pm-excluirBtn').addEventListener('click',excluirPlano);
    document.getElementById('planoModal').addEventListener('click',function(e){ if(e.target.id==='planoModal')fecharModalPlano(); });
    document.getElementById('pl-selVendedor').addEventListener('change',function(){ paginaAtual=1; render(); });
    document.querySelectorAll('#view-planos .kpi-clickable').forEach(function(k){
      k.addEventListener('click',function(){
        var alvo=k.getAttribute('data-plstatus');
        filtroStatusPlanos=(filtroStatusPlanos===alvo)?'__all__':alvo;
        paginaAtual=1; render();
      });
    });
    document.querySelectorAll('#view-planos th.sortable').forEach(function(th){
      th.addEventListener('click',function(){
        var col=th.getAttribute('data-sort');
        if(sortState.col===col){sortState.dir=sortState.dir==='asc'?'desc':'asc';}
        else{sortState.col=col;sortState.dir=(col==='cliente'||col==='vendedor'||col==='tipo'||col==='status')?'asc':'desc';}
        render();
      });
    });
    carregar();
  }

  /**
   * Chamado por outros módulos (hoje só Clientes) quando um cliente é salvo
   * em outro lugar, pra manter o cache local em dia sem precisar recarregar
   * a tela inteira.
   */
  function atualizarClienteCache(clienteObj){
    if(!clienteObj||!clienteObj.IdCliente)return;
    clientesMap[clienteObj.IdCliente]=clienteObj;
    if(_initialized)render();
  }

  window.planosApp={init:init,atualizarClienteCache:atualizarClienteCache};
})();


