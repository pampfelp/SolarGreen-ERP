// ════ CUSTOS DA VENDA ════
(function(){
  var _initialized=false;
  var _epoca=window.SGEpoca.criar();
  var custos=[],vendas=[],clientesMap={},servicosMap={};
  // Cliente cadastrado via "+ Cadastrar cliente" no Funil, na mesma sessão —
  // sem isso, essa tela só enxergaria ele depois de recarregar a página.
  document.addEventListener('sg:cliente-criado',function(e){ if(e.detail&&e.detail.IdCliente)clientesMap[e.detail.IdCliente]=e.detail; });
  var editandoId=null;
  var ID_CLIENTE_APORTE_SOCIOS='da6dbd89'; // Cliente Teste 1 — gaveta de custo de escritório, não é venda real
  var paginaAtual=1, ITENS_POR_PAGINA=10;
  var sortState={col:'data',dir:'desc'};
  var APP_VERSION='2026-07-16-1';

  function apiCall(action,extra){ return window.SGAuth.apiCall(action,extra); }
  function meuId(){ return window.SGUtil.meuId(); }
  function escapeHtml(s){ return window.SGUtil.escapeHtml(s); }
  function fmtMoney(n){ return window.SGUtil.fmtMoney(n); }
  function parseBRDate(str){ return window.SGUtil.parseBRDate(str); }
  function dateKeyFromDate(d){ return window.SGUtil.dateKey(d); }
  function fmtDateBRcv(d){ return window.SGUtil.fmtDateBR(d); }
  function normalizaBuscaCv(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

  function nomeCliente(id){ var c=clientesMap[id]; return c?(c['Nome Razao Social']||c.Nome||id):'—'; }
  function nomeServico(id){ var s=servicosMap[id]; return s?(s['Nome Servico']||id):'—'; }

  /**
   * Chamado pelo módulo de Clientes quando um cliente é salvo em outro
   * lugar, pra manter o cache local em dia e a lista redesenhada na hora.
   */
  function atualizarClienteCache(clienteObj){
    if(!clienteObj||!clienteObj.IdCliente)return;
    clientesMap[clienteObj.IdCliente]=clienteObj;
    if(_initialized)render();
  }

  function vendaPorId(idVenda){ return vendas.filter(function(v){return String(v.IdVenda)===String(idVenda);})[0]; }
  function ehVendaEscritorio(v){ return v&&v.IdCliente===ID_CLIENTE_APORTE_SOCIOS; }
  function labelDaVenda(idVenda){
    var v=vendaPorId(idVenda);
    if(!v)return idVenda?('Venda '+String(idVenda).slice(0,8)):'—';
    var dt=parseBRDate(v.DataVenda);
    if(ehVendaEscritorio(v))return 'Custo de Escritório — '+fmtDateBRcv(dt)+' — '+fmtMoney(v.Valor);
    return nomeCliente(v.IdCliente)+' — '+nomeServico(v.IdServico)+' — '+fmtDateBRcv(dt)+' — '+fmtMoney(v.Valor);
  }
  function gerarDescricaoAutomaticaCv(idVenda,valorAtual){
    var v=vendaPorId(idVenda);
    if(!v)return '';
    var dt=parseBRDate(v.DataVenda);
    var valorFmt=valorAtual!==undefined&&valorAtual!==''?valorAtual:'';
    if(ehVendaEscritorio(v))return 'Referente a custo de escritório (despesa geral da empresa) em '+fmtDateBRcv(dt)+'. Valor: R$'+valorFmt;
    return 'Referente aos custos de operação do serviço de '+nomeServico(v.IdServico)+' no cliente '+nomeCliente(v.IdCliente)+' em '+fmtDateBRcv(dt)+'. Valor: R$'+valorFmt;
  }

  function opcoesVendaCv(){
    return vendas.slice().sort(function(a,b){
      var da=parseBRDate(a.DataVenda),db=parseBRDate(b.DataVenda);
      return (db?db.getTime():0)-(da?da.getTime():0);
    }).map(function(v){ return {id:v.IdVenda,label:labelDaVenda(v.IdVenda)}; });
  }

  function textoBuscavelCusto(c){
    var v=vendaPorId(c.IdVenda);
    return normalizaBuscaCv([
      c.Descricao, c.Status, c.Data,
      v?nomeCliente(v.IdCliente):'', v?nomeServico(v.IdServico):'',
      // Valor (2026-09-01, pedido do Felipe): busca tanto o formatado
      // ("R$ 39,87") quanto o número cru, pra "39,87", "39.87" ou só "39"
      // encontrarem o lançamento — o Valor às vezes vem salvo com vírgula,
      // às vezes com ponto, dependendo de quem lançou.
      fmtMoney(c.Valor), c.Valor
    ].join(' | '));
  }

  function sortCustosRows(lista){
    var col=sortState.col,dir=sortState.dir,mult=dir==='asc'?1:-1;
    lista.sort(function(a,b){
      if(col==='data'){var da=parseBRDate(a.Data),db=parseBRDate(b.Data);return mult*((da?da.getTime():0)-(db?db.getTime():0));}
      if(col==='descricao'){return mult*String(a.Descricao||'').localeCompare(String(b.Descricao||''),'pt-BR');}
      if(col==='venda'){return mult*labelDaVenda(a.IdVenda).localeCompare(labelDaVenda(b.IdVenda),'pt-BR');}
      if(col==='valor'){var va=(String(a.Valor||'0').indexOf(',')!==-1?parseFloat(String(a.Valor||'0').replace(/\./g,'').replace(',','.')):parseFloat(a.Valor))||0,vb=(String(b.Valor||'0').indexOf(',')!==-1?parseFloat(String(b.Valor||'0').replace(/\./g,'').replace(',','.')):parseFloat(b.Valor))||0;return mult*(va-vb);}
      if(col==='status'){return mult*String(a.Status||'').localeCompare(String(b.Status||''),'pt-BR');}
      return 0;
    });
  }
  function updateSortHeadersCv(){
    document.querySelectorAll('#view-custosvenda th.sortable').forEach(function(th){
      var col=th.getAttribute('data-sort');
      th.classList.toggle('sort-active',col===sortState.col);
      var a=th.querySelector('.arrow-sort');
      a.classList.toggle('asc',col===sortState.col&&sortState.dir==='asc');
    });
  }

  /** Igual getFiltered, mas SEM aplicar o filtro de status — usada pros KPIs
   *  clicáveis mostrarem o total de verdade (senão clicar num deles zerava
   *  o outro, o que não faz sentido pra um filtro). */
  function getBaseSemStatus(){
    var from=document.getElementById('cv-dateFrom').value,to=document.getElementById('cv-dateTo').value;
    var busca=normalizaBuscaCv(document.getElementById('cv-buscaGeral').value||'').trim();
    return custos.filter(function(c){
      var dt=parseBRDate(c.Data),dk=dt?dateKeyFromDate(dt):null;
      if(from&&dk&&dk<from)return false; if(to&&dk&&dk>to)return false;
      if(busca&&textoBuscavelCusto(c).indexOf(busca)===-1)return false;
      return true;
    });
  }

  function getFiltered(){
    var from=document.getElementById('cv-dateFrom').value,to=document.getElementById('cv-dateTo').value;
    var status=document.getElementById('cv-selStatus').value;
    var busca=normalizaBuscaCv(document.getElementById('cv-buscaGeral').value||'').trim();
    return custos.filter(function(c){
      var dt=parseBRDate(c.Data),dk=dt?dateKeyFromDate(dt):null;
      if(from&&dk&&dk<from)return false; if(to&&dk&&dk>to)return false;
      if(status!=='__all__'&&(c.Status||'').trim().toLowerCase()!==status.toLowerCase())return false;
      if(busca&&textoBuscavelCusto(c).indexOf(busca)===-1)return false;
      return true;
    });
  }

  function renderPaginacao(totalPaginas){
    var el=document.getElementById('cv-paginacao');
    if(totalPaginas<=1){el.innerHTML='';return;}
    el.innerHTML='<button type="button" id="cv-pgAnterior" '+(paginaAtual<=1?'disabled':'')+'>‹ Anterior</button><span class="pg-info">Página '+paginaAtual+' de '+totalPaginas+'</span><button type="button" id="cv-pgProxima" '+(paginaAtual>=totalPaginas?'disabled':'')+'>Próxima ›</button>';
    var a=document.getElementById('cv-pgAnterior'); if(a)a.addEventListener('click',function(){if(paginaAtual>1){paginaAtual--;render();}});
    var p=document.getElementById('cv-pgProxima'); if(p)p.addEventListener('click',function(){if(paginaAtual<totalPaginas){paginaAtual++;render();}});
  }

  function render(){
    var base=getBaseSemStatus();
    var filtrados=getFiltered();
    var pago=base.filter(function(c){return (c.Status||'').trim().toLowerCase()==='pago';}).reduce(function(s,c){return s+((String(c.Valor||'0').indexOf(',')!==-1?parseFloat(String(c.Valor||'0').replace(/\./g,'').replace(',','.')):parseFloat(c.Valor))||0);},0);
    var pendente=base.filter(function(c){return (c.Status||'').trim().toLowerCase()!=='pago';}).reduce(function(s,c){return s+((String(c.Valor||'0').indexOf(',')!==-1?parseFloat(String(c.Valor||'0').replace(/\./g,'').replace(',','.')):parseFloat(c.Valor))||0);},0);
    document.getElementById('cv-kpiPago').textContent=fmtMoney(pago);
    document.getElementById('cv-kpiPendente').textContent=fmtMoney(pendente);
    document.getElementById('cv-kpiTotal').textContent=filtrados.length;
    var statusAtivo=document.getElementById('cv-selStatus').value;
    document.querySelectorAll('#view-custosvenda .kpi-clickable').forEach(function(k){
      k.classList.toggle('active',k.getAttribute('data-cvstatus').toLowerCase()===statusAtivo.toLowerCase());
    });

    sortCustosRows(filtrados);
    updateSortHeadersCv();

    var totalPaginas=Math.max(1,Math.ceil(filtrados.length/ITENS_POR_PAGINA));
    if(paginaAtual>totalPaginas)paginaAtual=totalPaginas;
    if(paginaAtual<1)paginaAtual=1;
    var inicio=(paginaAtual-1)*ITENS_POR_PAGINA;
    var pagina=filtrados.slice(inicio,inicio+ITENS_POR_PAGINA);

    var tbody=document.getElementById('cv-tbody');
    if(!pagina.length){
      tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--ink-faint);padding:30px;">Nenhum custo encontrado.</td></tr>';
      renderPaginacao(0);
      return;
    }
    tbody.innerHTML=pagina.map(function(c){
      var dt=parseBRDate(c.Data);
      var pago2=(c.Status||'').trim().toLowerCase()==='pago';
      return '<tr class="ag-row-click" data-id="'+escapeHtml(c.IdCusto)+'">'+
        '<td>'+fmtDateBRcv(dt)+'</td>'+
        '<td style="max-width:280px;font-size:11.5px;color:var(--ink-soft);">'+escapeHtml((c.Descricao||'').slice(0,120))+((c.Descricao||'').length>120?'…':'')+'</td>'+
        '<td>'+escapeHtml(labelDaVenda(c.IdVenda))+'</td>'+
        '<td class="num">'+fmtMoney(c.Valor)+'</td>'+
        '<td><span class="ag-status-tag '+(pago2?'concluido':'agendado')+'">'+escapeHtml(c.Status||'—')+'</span></td>'+
        '<td class="u-row-actions"></td>'+
      '</tr>';
    }).join('');
    tbody.querySelectorAll('.ag-row-click').forEach(function(tr){
      tr.addEventListener('click',function(){ try{ abrirVisualizacaoCusto(tr.getAttribute('data-id')); }catch(err){ console.error('abrirVisualizacaoCusto falhou:',err); (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Não foi possível abrir esse registro (erro: '+err.message+').',true); } });
    });
    renderPaginacao(totalPaginas);
    document.getElementById('cv-lastUpdate').textContent='Atualizado em '+new Date().toLocaleDateString('pt-BR')+' às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }

  /**
   * Painel de VISUALIZAÇÃO do custo — abre ao clicar na linha da tabela.
   * Lápis chama abrirModal(id) pra editar de verdade; lixeira exclui direto.
   */
  function abrirVisualizacaoCusto(idCusto){
    var c=custos.filter(function(x){return String(x.IdCusto)===String(idCusto);})[0];
    if(!c)return;
    editandoId=idCusto;
    var dt=parseBRDate(c.Data);
    var pago2=(c.Status||'').trim().toLowerCase()==='pago';
    var html='<div class="ad-section">'+
      '<span class="ag-status-tag '+(pago2?'concluido':'agendado')+'">'+escapeHtml(c.Status||'—')+'</span>'+
      '<div class="ad-row" style="margin-top:10px;"><span class="dl">Venda</span><span class="dv">'+escapeHtml(labelDaVenda(c.IdVenda))+'</span></div>'+
      '<div class="ad-row"><span class="dl">Valor</span><span class="dv">'+fmtMoney(c.Valor)+'</span></div>'+
      '<div class="ad-row"><span class="dl">Data</span><span class="dv">'+fmtDateBRcv(dt)+'</span></div>'+
    '</div>'+
    (c.Descricao?'<div class="ad-section"><h4>Descrição</h4><p style="font-size:13px;color:var(--ink);line-height:1.5;">'+escapeHtml(c.Descricao)+'</p></div>':'');

    window.SGViewPanel.abrir({
      titulo:'Custo — '+labelDaVenda(c.IdVenda),
      html:html,
      onEditar:function(){ abrirModal(idCusto); },
      onExcluir:function(){ editandoId=idCusto; excluir(); }
    });
  }

  function abrirModal(idCusto){
    var c=idCusto?custos.filter(function(x){return String(x.IdCusto)===String(idCusto);})[0]:null;
    editandoId=idCusto||null;
    document.getElementById('cvModalTitle').textContent=c?'Editar custo':'Novo custo';
    var descricaoEditadaManualmente=!!c; // editando um já existente, não mexe na descrição sozinho
    window.SGCombo.criar({
      inputId:'cv-idVendaBusca', hiddenId:'cv-idVenda', dropdownId:'cv-idVendaDropdown',
      getOpcoes:opcoesVendaCv,
      valorInicial:c&&c.IdVenda?{id:c.IdVenda,label:labelDaVenda(c.IdVenda)}:null,
      onSelecionar:function(idVendaSelecionada){
        if(descricaoEditadaManualmente)return;
        document.getElementById('cv-descricao').value=gerarDescricaoAutomaticaCv(idVendaSelecionada,document.getElementById('cv-valor').value);
      }
    });
    document.getElementById('cv-descricao').value=c?(c.Descricao||''):'';
    document.getElementById('cv-valor').value=c?c.Valor:'';
    var dt=c?parseBRDate(c.Data):new Date();
    document.getElementById('cv-data').value=dt?dateKeyFromDate(dt):'';
    document.getElementById('cv-status').value=c?(c.Status||'Aguardando Pagamento'):'Aguardando Pagamento';
    document.getElementById('cv-excluirBtn').style.display=c?'block':'none';
    document.getElementById('cv-modalMsg').textContent='';
    document.getElementById('cv-descricao').oninput=function(){ descricaoEditadaManualmente=true; };
    document.getElementById('cv-valor').oninput=function(){
      if(descricaoEditadaManualmente)return;
      document.getElementById('cv-descricao').value=gerarDescricaoAutomaticaCv(document.getElementById('cv-idVenda').value,document.getElementById('cv-valor').value);
    };
    document.getElementById('custoVendaDetalhe').classList.add('active');
  }
  function fecharModal(){ document.getElementById('custoVendaDetalhe').classList.remove('active'); editandoId=null; }

  function salvar(){
    var idVenda=document.getElementById('cv-idVenda').value;
    var descricao=document.getElementById('cv-descricao').value.trim();
    var valor=document.getElementById('cv-valor').value;
    var dataVal=document.getElementById('cv-data').value;
    var status=document.getElementById('cv-status').value;
    var msgEl=document.getElementById('cv-modalMsg');
    if(!idVenda){ msgEl.className='uform-msg error'; msgEl.textContent='Selecione a venda vinculada.'; return; }
    if(!valor){ msgEl.className='uform-msg error'; msgEl.textContent='Informe o valor.'; return; }
    if(!dataVal){ msgEl.className='uform-msg error'; msgEl.textContent='Escolha a data.'; return; }

    var ehNovo=!editandoId;
    var idAlvo=editandoId||window.SGId.gerar();
    var registroAnteriorCopia=!ehNovo?Object.assign({},custos.filter(function(x){return String(x.IdCusto)===String(idAlvo);})[0]):null;
    var dataBR=dataVal.split('-').reverse().join('/');

    var registroNovo={IdCusto:idAlvo,IdVenda:idVenda,Descricao:descricao,Valor:valor,Status:status,Data:dataBR};
    var indice=custos.findIndex(function(x){return String(x.IdCusto)===String(idAlvo);});
    if(indice===-1)custos.push(registroNovo);
    else custos[indice]=registroNovo;
    _epoca.marcar();

    fecharModal();
    render();
    (window.SGToast?window.SGToast.mostrar:function(t){})(ehNovo?'Custo criado.':'Custo atualizado.');

    apiCall('salvarCustoVenda',{idCusto:idAlvo,idVenda:idVenda,descricao:descricao,valor:valor,status:status,data:dataVal}).then(function(resp){
      if(!resp||!resp.ok){
        if(ehNovo)custos=custos.filter(function(x){return String(x.IdCusto)!==String(idAlvo);});
        else{ var idx=custos.findIndex(function(x){return String(x.IdCusto)===String(idAlvo);}); if(idx!==-1&&registroAnteriorCopia)custos[idx]=registroAnteriorCopia; }
        _epoca.marcar();
        render();
        (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})((resp&&resp.erro)||'Não foi possível salvar — a alteração foi desfeita.',true);
        return;
      }
      if(resp.idCusto&&String(resp.idCusto)!==String(idAlvo)){
        var idx2=custos.findIndex(function(x){return String(x.IdCusto)===String(idAlvo);});
        if(idx2!==-1){ custos[idx2].IdCusto=resp.idCusto; render(); }
      }
    }).catch(function(err){
      if(ehNovo)custos=custos.filter(function(x){return String(x.IdCusto)!==String(idAlvo);});
      else{ var idx=custos.findIndex(function(x){return String(x.IdCusto)===String(idAlvo);}); if(idx!==-1&&registroAnteriorCopia)custos[idx]=registroAnteriorCopia; }
      _epoca.marcar();
      render();
      (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Erro de conexão — a alteração foi desfeita: '+err.message,true);
    });
  }

  function excluir(){
    if(!editandoId)return;
    window.SGConfirm.perguntar({titulo:'Excluir custo',mensagem:'Tem certeza que deseja excluir esse custo? Essa ação não pode ser desfeita.',textoConfirmar:'Excluir',perigo:true}).then(function(ok){
      if(!ok)return;
      var idAlvo=editandoId;
      var registroAnterior=custos.filter(function(x){return String(x.IdCusto)===String(idAlvo);})[0];
      custos=custos.filter(function(x){return String(x.IdCusto)!==String(idAlvo);});
      _epoca.marcar();
      fecharModal();
      if(window.SGViewPanel)window.SGViewPanel.fechar();
      render();
      (window.SGToast?window.SGToast.mostrar:function(t){})('Custo excluído.');

      apiCall('excluirCustoVenda',{idCusto:idAlvo,solicitanteId:meuId()}).then(function(resp){
        if(!resp||!resp.ok){
          if(window.SGUtil&&window.SGUtil.ehNaoEncontrado(resp&&resp.erro))return;
          if(registroAnterior)custos.push(registroAnterior);
          _epoca.marcar();
          render();
          (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})((resp&&resp.erro)||'Não foi possível excluir — restaurado.',true);
        }
      }).catch(function(err){
        if(registroAnterior)custos.push(registroAnterior);
        _epoca.marcar();
        render();
        (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Erro de conexão — restaurado: '+err.message,true);
      });
    });
  }

  function aplicarDados(resp){
    custos=resp.custos||[];
    vendas=resp.vendas||[];
    clientesMap={};(resp.clientes||[]).forEach(function(c){if(c.IdCliente)clientesMap[c.IdCliente]=c;});
    servicosMap={};(resp.servicos||[]).forEach(function(s){if(s.IdServico)servicosMap[s.IdServico]=s;});
    document.getElementById('cv-emptyState').style.display='none';
    document.getElementById('cv-appVersion').textContent='v'+APP_VERSION;
    render();
  }

  function carregar(){
    var cache=window.SGCache&&window.SGCache.get('custosvenda');
    var temCache=!!(cache&&cache.dados);
    if(temCache)aplicarDados(cache.dados);
    var epocaInicio=_epoca.atual();
    apiCall('getCustosVendaData',{}).then(function(resp){
      if(!resp||!resp.ok){
        if(!temCache){
          document.getElementById('cv-emptyState').style.display='block';
          document.getElementById('cv-emptyState').querySelector('p').textContent=(resp&&resp.erro)||'Não foi possível carregar.';
        }
        return;
      }
      if(window.SGCache)window.SGCache.set('custosvenda',resp);
      if(_epoca.atual()!==epocaInicio)return;
      aplicarDados(resp);
    }).catch(function(err){
      if(!temCache){
        document.getElementById('cv-emptyState').style.display='block';
        document.getElementById('cv-emptyState').querySelector('p').textContent='Erro de conexão: '+err.message;
      }
    });
  }

  function init(){
    if(_initialized)return;
    if(!window.SG_SESSION)return;
    _initialized=true;
    document.getElementById('cv-novoBtn').addEventListener('click',function(){ abrirModal(null); });
    document.getElementById('cv-fecharBtn').addEventListener('click',fecharModal);
    document.getElementById('cv-salvarBtn').addEventListener('click',salvar);
    document.getElementById('cv-excluirBtn').addEventListener('click',excluir);
    document.getElementById('cv-dateFrom').addEventListener('change',function(){ paginaAtual=1; document.querySelectorAll('.qr-btn[data-cvrange]').forEach(function(b){b.classList.remove('active');}); render(); });
    document.getElementById('cv-dateTo').addEventListener('change',function(){ paginaAtual=1; document.querySelectorAll('.qr-btn[data-cvrange]').forEach(function(b){b.classList.remove('active');}); render(); });
    document.querySelectorAll('.qr-btn[data-cvrange]').forEach(function(btn){
      btn.addEventListener('click',function(){
        document.querySelectorAll('.qr-btn[data-cvrange]').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');
        var range=btn.getAttribute('data-cvrange'),now=new Date();
        function dk(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
        if(range==='month'){var f=new Date(now.getFullYear(),now.getMonth(),1),l=new Date(now.getFullYear(),now.getMonth()+1,0);document.getElementById('cv-dateFrom').value=dk(f);document.getElementById('cv-dateTo').value=dk(l);}
        else{var n=parseInt(range,10),fr=new Date(now);fr.setDate(fr.getDate()-(n-1));document.getElementById('cv-dateFrom').value=dk(fr);document.getElementById('cv-dateTo').value=dk(now);}
        paginaAtual=1; render();
      });
    });
    document.getElementById('cv-selStatus').addEventListener('change',function(){ paginaAtual=1; render(); });
    document.getElementById('cv-buscaGeral').addEventListener('input',function(){ paginaAtual=1; render(); });
    document.querySelectorAll('#view-custosvenda .kpi-clickable').forEach(function(k){
      k.addEventListener('click',function(){
        var alvo=k.getAttribute('data-cvstatus');
        var sel=document.getElementById('cv-selStatus');
        sel.value=(sel.value.toLowerCase()===alvo.toLowerCase())?'__all__':alvo;
        paginaAtual=1; render();
      });
    });
    document.getElementById('cv-resetFiltros').addEventListener('click',function(){
      document.getElementById('cv-dateFrom').value='';document.getElementById('cv-dateTo').value='';
      document.getElementById('cv-selStatus').value='__all__';document.getElementById('cv-buscaGeral').value='';
      document.querySelectorAll('.qr-btn[data-cvrange]').forEach(function(b){b.classList.remove('active');});
      paginaAtual=1; render();
    });
    document.querySelectorAll('#view-custosvenda th.sortable').forEach(function(th){
      th.addEventListener('click',function(){
        var col=th.getAttribute('data-sort');
        if(sortState.col===col){sortState.dir=sortState.dir==='asc'?'desc':'asc';}
        else{sortState.col=col;sortState.dir=(col==='descricao'||col==='venda'||col==='status')?'asc':'desc';}
        render();
      });
    });
    carregar();
  }

  window.custosVendaApp={init:init,atualizarClienteCache:atualizarClienteCache};
})();


