// ════ RELATÓRIOS (números diários do funil, por vendedor) ════
(function(){
  var _initialized=false;
  var _epoca=window.SGEpoca.criar();
  var relatorios=[],vendedoresMap={};
  var meuRegistroDeHoje=null; // se já existir lançamento pra hoje, guarda o IdRelatorio pra "salvar" virar "atualizar"
  var editandoId=null; // quando clica numa linha do histórico pra editar uma data passada
  var paginaAtual=1, ITENS_POR_PAGINA=10;
  var sortState={col:'data',dir:'desc'};
  var APP_VERSION='2026-07-16-1';

  function apiCall(action,extra){ return window.SGAuth.apiCall(action,extra); }
  function meuId(){ return window.SGUtil.meuId(); }
  function souAdmin(){ return window.SGUtil.souAdmin(); }
  function escapeHtml(s){ return window.SGUtil.escapeHtml(s); }
  function nomeVendedor(id){ var v=vendedoresMap[id]; return v?(v.Nome||id):id; }
  function dateKeyHoje(){ return window.SGUtil.dateKey(new Date()); }
  function parseBRDate(str){ return window.SGUtil.parseBRDate(str); }
  function dateKeyFromDate(d){ return window.SGUtil.dateKey(d); }
  function fmtDateBRRl(d){ return window.SGUtil.fmtDateBR(d); }

  function sortRelatoriosRows(lista){
    var col=sortState.col,dir=sortState.dir,mult=dir==='asc'?1:-1;
    lista.sort(function(a,b){
      if(col==='data'){var da=parseBRDate(a.Data),db=parseBRDate(b.Data);return mult*((da?da.getTime():0)-(db?db.getTime():0));}
      if(col==='vendedor'){return mult*nomeVendedor(a.IdVendedor).localeCompare(nomeVendedor(b.IdVendedor),'pt-BR');}
      if(col==='contatos'){return mult*((parseFloat(a['Novos Contatos'])||0)-(parseFloat(b['Novos Contatos'])||0));}
      if(col==='conversas'){return mult*((parseFloat(a.Conversas)||0)-(parseFloat(b.Conversas)||0));}
      if(col==='propostas'){return mult*((parseFloat(a['Propostas Apresentadas'])||0)-(parseFloat(b['Propostas Apresentadas'])||0));}
      if(col==='vendas'){return mult*((parseFloat(a.Vendas)||0)-(parseFloat(b.Vendas)||0));}
      return 0;
    });
  }
  function updateSortHeadersRl(){
    document.querySelectorAll('#view-relatorios th.sortable').forEach(function(th){
      var col=th.getAttribute('data-sort');
      th.classList.toggle('sort-active',col===sortState.col);
      var a=th.querySelector('.arrow-sort');
      a.textContent=(col===sortState.col)?(sortState.dir==='asc'?'▴':'▾'):'▾';
    });
  }

  function renderPaginacao(totalPaginas){
    var el=document.getElementById('rl-paginacao');
    if(totalPaginas<=1){el.innerHTML='';return;}
    el.innerHTML='<button type="button" id="rl-pgAnterior" '+(paginaAtual<=1?'disabled':'')+'>‹ Anterior</button><span class="pg-info">Página '+paginaAtual+' de '+totalPaginas+'</span><button type="button" id="rl-pgProxima" '+(paginaAtual>=totalPaginas?'disabled':'')+'>Próxima ›</button>';
    var a=document.getElementById('rl-pgAnterior'); if(a)a.addEventListener('click',function(){if(paginaAtual>1){paginaAtual--;render();}});
    var p=document.getElementById('rl-pgProxima'); if(p)p.addEventListener('click',function(){if(paginaAtual<totalPaginas){paginaAtual++;render();}});
  }

  function render(){
    var admin=souAdmin();
    var filtroVendedor=admin?((document.getElementById('rl-selVendedor')||{}).value||'__all__'):meuId();
    var lista=relatorios.filter(function(r){
      if(filtroVendedor!=='__all__'&&String(r.IdVendedor)!==String(filtroVendedor))return false;
      return true;
    });
    sortRelatoriosRows(lista);
    updateSortHeadersRl();

    document.getElementById('rl-tableTitle').textContent=admin?'(todos os vendedores)':'(seus lançamentos)';
    document.getElementById('rl-tableHint').textContent=lista.length+' lançamento(s)';

    var totalPaginas=Math.max(1,Math.ceil(lista.length/ITENS_POR_PAGINA));
    if(paginaAtual>totalPaginas)paginaAtual=totalPaginas;
    if(paginaAtual<1)paginaAtual=1;
    var inicio=(paginaAtual-1)*ITENS_POR_PAGINA;
    var pagina=lista.slice(inicio,inicio+ITENS_POR_PAGINA);

    var tbody=document.getElementById('rl-tbody');
    if(!pagina.length){
      tbody.innerHTML='<tr><td colspan="'+(admin?'7':'6')+'" style="text-align:center;color:var(--ink-faint);padding:30px;">Nenhum relatório lançado ainda.</td></tr>';
      renderPaginacao(0);
      return;
    }
    tbody.innerHTML=pagina.map(function(r){
      var dt=parseBRDate(r.Data);
      var souDono=String(r.IdVendedor)===String(meuId());
      var podeExcluir=admin||souDono;
      return '<tr class="ag-row-click" data-id="'+escapeHtml(r.IdRelatorio)+'">'+
        '<td>'+fmtDateBRRl(dt)+'</td>'+
        (admin?('<td>'+escapeHtml(nomeVendedor(r.IdVendedor))+'</td>'):'')+
        '<td class="num">'+escapeHtml(r['Novos Contatos']||0)+'</td>'+
        '<td class="num">'+escapeHtml(r.Conversas||0)+'</td>'+
        '<td class="num">'+escapeHtml(r['Propostas Apresentadas']||0)+'</td>'+
        '<td class="num">'+escapeHtml(r.Vendas||0)+'</td>'+
        '<td class="u-row-actions">'+(podeExcluir?'<button class="rl-excluir-btn" data-id="'+escapeHtml(r.IdRelatorio)+'" style="color:var(--debit);">excluir</button>':'')+'</td>'+
      '</tr>';
    }).join('');
    tbody.querySelectorAll('.ag-row-click').forEach(function(tr){
      tr.addEventListener('click',function(e){
        if(e.target.classList.contains('rl-excluir-btn'))return;
        try{ carregarParaEdicao(tr.getAttribute('data-id')); }
        catch(err){ console.error('carregarParaEdicao falhou:',err); (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Não foi possível abrir esse registro (erro: '+err.message+').',true); }
      });
    });
    tbody.querySelectorAll('.rl-excluir-btn').forEach(function(btn){
      btn.addEventListener('click',function(e){ e.stopPropagation(); excluirRelatorio(btn.getAttribute('data-id')); });
    });
    renderPaginacao(totalPaginas);
    document.getElementById('rl-lastUpdate').textContent='Atualizado em '+new Date().toLocaleDateString('pt-BR')+' às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }

  /**
   * Clicar numa linha do histórico carrega os valores dela no formulário do
   * topo pra editar — como o "salvar" sempre faz upsert por vendedor+data,
   * salvar de novo atualiza o mesmo registro em vez de duplicar.
   */
  function carregarParaEdicao(idRelatorio){
    var r=relatorios.filter(function(x){return String(x.IdRelatorio)===String(idRelatorio);})[0];
    if(!r)return;
    if(!souAdmin()&&String(r.IdVendedor)!==String(meuId()))return; // não-admin só edita o próprio
    editandoId=r.IdRelatorio;
    popularSelectVendedorFormulario();
    if(souAdmin())document.getElementById('rl-formVendedor').value=r.IdVendedor;
    var dt=parseBRDate(r.Data);
    document.getElementById('rl-data').value=dt?dateKeyFromDate(dt):'';
    document.getElementById('rl-contatos').value=r['Novos Contatos']||0;
    document.getElementById('rl-conversas').value=r.Conversas||0;
    document.getElementById('rl-propostas').value=r['Propostas Apresentadas']||0;
    document.getElementById('rl-vendas').value=r.Vendas||0;
    document.getElementById('rl-formTitle').textContent=fmtDateBRRl(dt)+(souAdmin()&&String(r.IdVendedor)!==String(meuId())?' — '+nomeVendedor(r.IdVendedor):'');
    document.getElementById('rl-msg').textContent='';
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function popularSelectVendedorFormulario(){
    var sel=document.getElementById('rl-formVendedor');
    if(souAdmin()){
      sel.disabled=false;
      var atual=sel.value||meuId();
      sel.innerHTML=Object.keys(vendedoresMap).map(function(id){return vendedoresMap[id];})
        .sort(function(a,b){return (a.Nome||'').localeCompare(b.Nome||'','pt-BR');})
        .map(function(v){return '<option value="'+escapeHtml(v.IdVendedor)+'">'+escapeHtml(v.Nome)+'</option>';}).join('');
      if([...sel.options].some(function(o){return o.value===atual;}))sel.value=atual;
      else sel.value=meuId();
    }else{
      // não-admin só pode lançar o próprio relatório — trava no próprio nome
      sel.innerHTML='<option value="'+escapeHtml(meuId())+'">'+escapeHtml(nomeVendedor(meuId()))+' (você)</option>';
      sel.value=meuId();
      sel.disabled=true;
    }
  }

  function preencherFormularioDeHoje(){
    editandoId=null;
    popularSelectVendedorFormulario();
    var vendedorAlvo=document.getElementById('rl-formVendedor').value||meuId();
    var hojeKey=dateKeyHoje();
    document.getElementById('rl-data').value=hojeKey;
    var existente=relatorios.filter(function(r){
      var dt=parseBRDate(r.Data);
      return String(r.IdVendedor)===String(vendedorAlvo)&&dt&&dateKeyFromDate(dt)===hojeKey;
    })[0];
    meuRegistroDeHoje=existente?existente.IdRelatorio:null;
    document.getElementById('rl-contatos').value=existente?(existente['Novos Contatos']||0):'';
    document.getElementById('rl-conversas').value=existente?(existente.Conversas||0):'';
    document.getElementById('rl-propostas').value=existente?(existente['Propostas Apresentadas']||0):'';
    document.getElementById('rl-vendas').value=existente?(existente.Vendas||0):'';
    document.getElementById('rl-formTitle').textContent='hoje'+(existente?' (já lançado — salvar atualiza)':'');
  }

  /** Roda quando o admin troca o vendedor no formulário — recarrega o que
   *  já existe pra essa pessoa+data, igual preencherFormularioDeHoje faz. */
  function aoTrocarVendedorFormulario(){
    editandoId=null;
    var vendedorAlvo=document.getElementById('rl-formVendedor').value;
    var dataAtual=document.getElementById('rl-data').value||dateKeyHoje();
    var existente=relatorios.filter(function(r){
      var dt=parseBRDate(r.Data);
      return String(r.IdVendedor)===String(vendedorAlvo)&&dt&&dateKeyFromDate(dt)===dataAtual;
    })[0];
    if(dataAtual===dateKeyHoje())meuRegistroDeHoje=existente?existente.IdRelatorio:null;
    document.getElementById('rl-contatos').value=existente?(existente['Novos Contatos']||0):'';
    document.getElementById('rl-conversas').value=existente?(existente.Conversas||0):'';
    document.getElementById('rl-propostas').value=existente?(existente['Propostas Apresentadas']||0):'';
    document.getElementById('rl-vendas').value=existente?(existente.Vendas||0):'';
    document.getElementById('rl-formTitle').textContent=(dataAtual===dateKeyHoje()?'hoje':fmtDateBRRl(parseBRDate(dataAtual.split('-').reverse().join('/'))))+(existente?' (já lançado — salvar atualiza)':'');
  }

  function salvarRelatorioHoje(){
    var dataVal=document.getElementById('rl-data').value;
    var msgEl=document.getElementById('rl-msg');
    if(!dataVal){ msgEl.className='uform-msg error'; msgEl.textContent='Escolha uma data.'; return; }
    var vendedorSelecionado=document.getElementById('rl-formVendedor').value||meuId();
    var registroExistente=editandoId&&souAdmin()?relatorios.filter(function(x){return String(x.IdRelatorio)===String(editandoId);})[0]:null;
    var idVendedorAlvo=registroExistente?registroExistente.IdVendedor:vendedorSelecionado;
    var idRelatorioAlvo=editandoId||meuRegistroDeHoje;

    var contatos=document.getElementById('rl-contatos').value||0;
    var conversas=document.getElementById('rl-conversas').value||0;
    var propostas=document.getElementById('rl-propostas').value||0;
    var vendas=document.getElementById('rl-vendas').value||0;

    var ehNovo=!idRelatorioAlvo;
    var idAlvo=idRelatorioAlvo||window.SGId.gerar();
    var registroAnteriorCopia=!ehNovo?(relatorios.filter(function(x){return String(x.IdRelatorio)===String(idAlvo);})[0]):null;
    if(registroAnteriorCopia)registroAnteriorCopia=Object.assign({},registroAnteriorCopia);

    var dataBR=dataVal.split('-').reverse().join('/');
    var registroNovo={IdRelatorio:idAlvo,IdVendedor:idVendedorAlvo,'Novos Contatos':contatos,Conversas:conversas,'Propostas Apresentadas':propostas,Vendas:vendas,Data:dataBR};
    var indice=relatorios.findIndex(function(x){return String(x.IdRelatorio)===String(idAlvo);});
    if(indice===-1)relatorios.push(registroNovo);
    else relatorios[indice]=registroNovo;
    if(String(idVendedorAlvo)===String(vendedorSelecionado)&&dataVal===dateKeyHoje())meuRegistroDeHoje=idAlvo;
    _epoca.marcar();

    msgEl.className='uform-msg'; msgEl.style.color='var(--accent-deep)'; msgEl.textContent='Relatório salvo ✓';
    editandoId=null;
    render();

    apiCall('salvarRelatorio',{
      idRelatorio:idAlvo, idVendedor:idVendedorAlvo, data:dataVal,
      novosContatos:contatos, conversas:conversas, propostas:propostas, vendas:vendas
    }).then(function(resp){
      if(!resp||!resp.ok){
        if(ehNovo)relatorios=relatorios.filter(function(x){return String(x.IdRelatorio)!==String(idAlvo);});
        else{ var idx=relatorios.findIndex(function(x){return String(x.IdRelatorio)===String(idAlvo);}); if(idx!==-1&&registroAnteriorCopia)relatorios[idx]=registroAnteriorCopia; }
        _epoca.marcar();
        render();
        msgEl.className='uform-msg error'; msgEl.textContent=(resp&&resp.erro)||'Não foi possível salvar — a alteração foi desfeita.';
        return;
      }
      if(resp.idRelatorio&&String(resp.idRelatorio)!==String(idAlvo)){
        var idx2=relatorios.findIndex(function(x){return String(x.IdRelatorio)===String(idAlvo);});
        if(idx2!==-1){ relatorios[idx2].IdRelatorio=resp.idRelatorio; if(meuRegistroDeHoje===idAlvo)meuRegistroDeHoje=resp.idRelatorio; render(); }
      }
    }).catch(function(err){
      if(ehNovo)relatorios=relatorios.filter(function(x){return String(x.IdRelatorio)!==String(idAlvo);});
      else{ var idx=relatorios.findIndex(function(x){return String(x.IdRelatorio)===String(idAlvo);}); if(idx!==-1&&registroAnteriorCopia)relatorios[idx]=registroAnteriorCopia; }
      _epoca.marcar();
      render();
      msgEl.className='uform-msg error'; msgEl.textContent='Erro de conexão — a alteração foi desfeita: '+err.message;
    });
  }

  function excluirRelatorio(idRelatorio){
    if(!confirm('Excluir esse lançamento de relatório? Essa ação não pode ser desfeita.'))return;
    var registroAnterior=relatorios.filter(function(x){return String(x.IdRelatorio)===String(idRelatorio);})[0];
    relatorios=relatorios.filter(function(x){return String(x.IdRelatorio)!==String(idRelatorio);});
    _epoca.marcar();
    render();
    (window.SGToast?window.SGToast.mostrar:function(t){})('Relatório excluído.');

    apiCall('excluirRelatorio',{solicitanteId:meuId(),idRelatorio:idRelatorio}).then(function(resp){
      if(!resp||!resp.ok){
        if(window.SGUtil&&window.SGUtil.ehNaoEncontrado(resp&&resp.erro))return; // já não existia mesmo
        if(registroAnterior)relatorios.push(registroAnterior);
        _epoca.marcar();
        render();
        (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})((resp&&resp.erro)||'Não foi possível excluir — restaurado.',true);
      }
    }).catch(function(err){
      if(registroAnterior)relatorios.push(registroAnterior);
      _epoca.marcar();
      render();
      (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Erro de conexão — restaurado: '+err.message,true);
    });
  }

  function popularSelectVendedorRl(){
    var sel=document.getElementById('rl-selVendedor');
    var atual=sel.value||'__all__';
    sel.innerHTML='<option value="__all__">Todos os vendedores</option>'+
      Object.keys(vendedoresMap).map(function(id){return vendedoresMap[id];})
        .sort(function(a,b){return (a.Nome||'').localeCompare(b.Nome||'','pt-BR');})
        .map(function(v){return '<option value="'+escapeHtml(v.IdVendedor)+'">'+escapeHtml(v.Nome)+'</option>';}).join('');
    sel.value=atual;
  }

  function aplicarDados(resp){
    relatorios=resp.relatorios||[];
    vendedoresMap={};(resp.vendedores||[]).forEach(function(v){if(v.IdVendedor)vendedoresMap[v.IdVendedor]=v;});
    if(souAdmin()){
      document.getElementById('rl-selVendedor').style.display='';
      document.getElementById('rl-thVendedor').style.display='';
      popularSelectVendedorRl();
    }
    if(!editandoId)preencherFormularioDeHoje();
    document.getElementById('rl-emptyState').style.display='none';
    document.getElementById('rl-appVersion').textContent='v'+APP_VERSION;
    render();
  }

  function carregar(){
    var cache=window.SGCache&&window.SGCache.get('relatorios');
    var temCache=!!(cache&&cache.dados);
    if(temCache)aplicarDados(cache.dados);
    var epocaInicio=_epoca.atual();
    apiCall('getRelatoriosData',{}).then(function(resp){
      if(!resp||!resp.ok){
        if(!temCache){
          document.getElementById('rl-emptyState').style.display='block';
          document.getElementById('rl-emptyState').querySelector('p').textContent=(resp&&resp.erro)||'Não foi possível carregar os relatórios.';
        }
        return;
      }
      if(window.SGCache)window.SGCache.set('relatorios',resp);
      if(_epoca.atual()!==epocaInicio)return;
      aplicarDados(resp);
    }).catch(function(err){
      if(!temCache){
        document.getElementById('rl-emptyState').style.display='block';
        document.getElementById('rl-emptyState').querySelector('p').textContent='Erro de conexão: '+err.message;
      }
    });
  }

  function init(){
    if(_initialized)return;
    if(!window.SG_SESSION)return;
    _initialized=true;
    document.getElementById('rl-salvarHojeBtn').addEventListener('click',salvarRelatorioHoje);
    document.getElementById('rl-formVendedor').addEventListener('change',aoTrocarVendedorFormulario);
    document.getElementById('rl-selVendedor').addEventListener('change',function(){ paginaAtual=1; render(); });
    document.querySelectorAll('#view-relatorios th.sortable').forEach(function(th){
      th.addEventListener('click',function(){
        var col=th.getAttribute('data-sort');
        if(sortState.col===col){sortState.dir=sortState.dir==='asc'?'desc':'asc';}
        else{sortState.col=col;sortState.dir=col==='vendedor'?'asc':'desc';}
        render();
      });
    });
    carregar();
  }

  window.relatoriosApp={init:init};
})();


