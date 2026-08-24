// ════ CUSTOS RECORRENTES (somente administradores) ════
(function(){
  var _initialized=false;
  var custos=[];
  var editandoId=null;
  var paginaAtual=1, ITENS_POR_PAGINA=10;
  var sortState={col:'descricao',dir:'asc'};
  var APP_VERSION='2026-07-16-1';
  var _epoca=window.SGEpoca.criar();

  function apiCall(action,extra){ return window.SGAuth.apiCall(action,extra); }
  function escapeHtml(s){ return window.SGUtil.escapeHtml(s); }
  function fmtMoney(n){ return window.SGUtil.fmtMoney(n); }
  function normalizaBuscaCr(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function textoBuscavelCr(c){ return normalizaBuscaCr([c.Descricao,c.Categoria,c.Status,c['Dia Vencimento']].join(' | ')); }

  function sortCustosRows(lista){
    var col=sortState.col,dir=sortState.dir,mult=dir==='asc'?1:-1;
    lista.sort(function(a,b){
      if(col==='descricao'){return mult*String(a.Descricao||'').localeCompare(String(b.Descricao||''),'pt-BR');}
      if(col==='categoria'){return mult*String(a.Categoria||'').localeCompare(String(b.Categoria||''),'pt-BR');}
      if(col==='vencimento'){return mult*((parseInt(a['Dia Vencimento'],10)||0)-(parseInt(b['Dia Vencimento'],10)||0));}
      if(col==='valor'){var va=(String(a.Valor||'0').indexOf(',')!==-1?parseFloat(String(a.Valor||'0').replace(/\./g,'').replace(',','.')):parseFloat(a.Valor))||0,vb=(String(b.Valor||'0').indexOf(',')!==-1?parseFloat(String(b.Valor||'0').replace(/\./g,'').replace(',','.')):parseFloat(b.Valor))||0;return mult*(va-vb);}
      if(col==='status'){return mult*String(a.Status||'').localeCompare(String(b.Status||''),'pt-BR');}
      return 0;
    });
  }
  function updateSortHeadersCr(){
    document.querySelectorAll('#view-custorecorrente th.sortable').forEach(function(th){
      var col=th.getAttribute('data-sort');
      th.classList.toggle('sort-active',col===sortState.col);
      var a=th.querySelector('.arrow-sort');
      a.classList.toggle('asc',col===sortState.col&&sortState.dir==='asc');
    });
  }

  function categoriasExistentes(){
    var set={};
    custos.forEach(function(c){ if(c.Categoria)set[c.Categoria]=true; });
    return Object.keys(set).sort(function(a,b){return a.localeCompare(b,'pt-BR');});
  }

  function popularFiltroCategoria(){
    var sel=document.getElementById('crec-selCategoria');
    var atual=sel.value||'__all__';
    sel.innerHTML='<option value="__all__">Todas</option>'+categoriasExistentes().map(function(c){return '<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>';}).join('');
    sel.value=atual;
    document.getElementById('crec-categoriaList').innerHTML=categoriasExistentes().map(function(c){return '<option value="'+escapeHtml(c)+'">';}).join('');
  }

  function getBaseSemStatus(){
    var categoria=document.getElementById('crec-selCategoria').value;
    var busca=normalizaBuscaCr(document.getElementById('crec-buscaGeral').value||'').trim();
    return custos.filter(function(c){
      if(categoria!=='__all__'&&c.Categoria!==categoria)return false;
      if(busca&&textoBuscavelCr(c).indexOf(busca)===-1)return false;
      return true;
    });
  }

  function getFiltered(){
    var categoria=document.getElementById('crec-selCategoria').value;
    var status=document.getElementById('crec-selStatus').value;
    var busca=normalizaBuscaCr(document.getElementById('crec-buscaGeral').value||'').trim();
    return custos.filter(function(c){
      if(categoria!=='__all__'&&c.Categoria!==categoria)return false;
      if(status!=='__all__'&&(c.Status||'').trim().toLowerCase()!==status.toLowerCase())return false;
      if(busca&&textoBuscavelCr(c).indexOf(busca)===-1)return false;
      return true;
    });
  }

  function renderPaginacao(totalPaginas){
    var el=document.getElementById('crec-paginacao');
    if(totalPaginas<=1){el.innerHTML='';return;}
    el.innerHTML='<button type="button" id="crec-pgAnterior" '+(paginaAtual<=1?'disabled':'')+'>‹ Anterior</button><span class="pg-info">Página '+paginaAtual+' de '+totalPaginas+'</span><button type="button" id="crec-pgProxima" '+(paginaAtual>=totalPaginas?'disabled':'')+'>Próxima ›</button>';
    var a=document.getElementById('crec-pgAnterior'); if(a)a.addEventListener('click',function(){if(paginaAtual>1){paginaAtual--;render();}});
    var p=document.getElementById('crec-pgProxima'); if(p)p.addEventListener('click',function(){if(paginaAtual<totalPaginas){paginaAtual++;render();}});
  }

  function render(){
    popularFiltroCategoria();
    var base=getBaseSemStatus();
    var filtrados=getFiltered();
    var ativoTotal=base.filter(function(c){return (c.Status||'').trim().toLowerCase()==='ativo';}).reduce(function(s,c){return s+((String(c.Valor||'0').indexOf(',')!==-1?parseFloat(String(c.Valor||'0').replace(/\./g,'').replace(',','.')):parseFloat(c.Valor))||0);},0);
    var inativoTotal=base.filter(function(c){return (c.Status||'').trim().toLowerCase()!=='ativo';}).reduce(function(s,c){return s+((String(c.Valor||'0').indexOf(',')!==-1?parseFloat(String(c.Valor||'0').replace(/\./g,'').replace(',','.')):parseFloat(c.Valor))||0);},0);
    document.getElementById('crec-kpiAtivo').textContent=fmtMoney(ativoTotal);
    document.getElementById('crec-kpiInativo').textContent=fmtMoney(inativoTotal);
    document.getElementById('crec-kpiTotal').textContent=filtrados.length;
    var statusAtivo=document.getElementById('crec-selStatus').value;
    document.querySelectorAll('#view-custorecorrente .kpi-clickable').forEach(function(k){
      k.classList.toggle('active',k.getAttribute('data-crecstatus').toLowerCase()===statusAtivo.toLowerCase());
    });

    sortCustosRows(filtrados);
    updateSortHeadersCr();

    var totalPaginas=Math.max(1,Math.ceil(filtrados.length/ITENS_POR_PAGINA));
    if(paginaAtual>totalPaginas)paginaAtual=totalPaginas;
    if(paginaAtual<1)paginaAtual=1;
    var inicio=(paginaAtual-1)*ITENS_POR_PAGINA;
    var pagina=filtrados.slice(inicio,inicio+ITENS_POR_PAGINA);

    var tbody=document.getElementById('crec-tbody');
    if(!pagina.length){
      tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--ink-faint);padding:30px;">Nenhum custo recorrente cadastrado ainda.</td></tr>';
      renderPaginacao(0);
      return;
    }
    tbody.innerHTML=pagina.map(function(c){
      var ativo=(c.Status||'').trim().toLowerCase()==='ativo';
      return '<tr class="ag-row-click" data-id="'+escapeHtml(c.IdCR)+'">'+
        '<td>'+escapeHtml(c.Descricao||'—')+'</td>'+
        '<td>'+escapeHtml(c.Categoria||'—')+'</td>'+
        '<td>'+(c['Dia Vencimento']?('dia '+escapeHtml(c['Dia Vencimento'])):'—')+'</td>'+
        '<td class="num">'+fmtMoney(c.Valor)+'</td>'+
        '<td><span class="ag-status-tag '+(ativo?'concluido':'cancelado')+'">'+escapeHtml(c.Status||'—')+'</span></td>'+
        '<td class="u-row-actions"></td>'+
      '</tr>';
    }).join('');
    tbody.querySelectorAll('.ag-row-click').forEach(function(tr){
      tr.addEventListener('click',function(){ try{ abrirVisualizacaoCR(tr.getAttribute('data-id')); }catch(err){ console.error('abrirVisualizacaoCR falhou:',err); (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Não foi possível abrir esse registro (erro: '+err.message+').',true); } });
    });
    renderPaginacao(totalPaginas);
    document.getElementById('crec-lastUpdate').textContent='Atualizado em '+new Date().toLocaleDateString('pt-BR')+' às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }

  /**
   * Painel de VISUALIZAÇÃO do custo recorrente — abre ao clicar na linha.
   * Lápis chama abrirModal(id) pra editar; lixeira exclui direto.
   */
  function abrirVisualizacaoCR(idCR){
    var c=custos.filter(function(x){return String(x.IdCR)===String(idCR);})[0];
    if(!c)return;
    editandoId=idCR;
    var ativo=(c.Status||'').trim().toLowerCase()==='ativo';
    var html='<div class="ad-section">'+
      '<span class="ag-status-tag '+(ativo?'concluido':'cancelado')+'">'+escapeHtml(c.Status||'—')+'</span>'+
      '<div class="ad-row" style="margin-top:10px;"><span class="dl">Descrição</span><span class="dv">'+escapeHtml(c.Descricao||'—')+'</span></div>'+
      '<div class="ad-row"><span class="dl">Categoria</span><span class="dv">'+escapeHtml(c.Categoria||'—')+'</span></div>'+
      '<div class="ad-row"><span class="dl">Vencimento</span><span class="dv">'+(c['Dia Vencimento']?('dia '+escapeHtml(c['Dia Vencimento'])):'—')+'</span></div>'+
      '<div class="ad-row"><span class="dl">Valor</span><span class="dv">'+fmtMoney(c.Valor)+'</span></div>'+
    '</div>';

    window.SGViewPanel.abrir({
      titulo:c.Descricao||'Custo recorrente',
      html:html,
      onEditar:function(){ abrirModal(idCR); },
      onExcluir:function(){ editandoId=idCR; excluir(); }
    });
  }

  function abrirModal(idCR){
    var c=idCR?custos.filter(function(x){return String(x.IdCR)===String(idCR);})[0]:null;
    editandoId=idCR||null;
    document.getElementById('crModalTitle').textContent=c?'Editar custo recorrente':'Novo custo recorrente';
    document.getElementById('crec-descricao').value=c?(c.Descricao||''):'';
    document.getElementById('crec-categoria').value=c?(c.Categoria||''):'';
    document.getElementById('crec-diaVencimento').value=c?(c['Dia Vencimento']||''):'';
    document.getElementById('crec-valor').value=c?c.Valor:'';
    document.getElementById('crec-status').value=c?(c.Status||'Ativo'):'Ativo';
    document.getElementById('crec-excluirBtn').style.display=c?'block':'none';
    document.getElementById('crec-modalMsg').textContent='';
    document.getElementById('custoRecorrenteDetalhe').classList.add('active');
  }
  function fecharModal(){ document.getElementById('custoRecorrenteDetalhe').classList.remove('active'); editandoId=null; }

  function salvar(){
    var descricao=document.getElementById('crec-descricao').value.trim();
    var categoria=document.getElementById('crec-categoria').value.trim();
    var diaVencimento=document.getElementById('crec-diaVencimento').value;
    var valor=document.getElementById('crec-valor').value;
    var status=document.getElementById('crec-status').value;
    var msgEl=document.getElementById('crec-modalMsg');
    if(!descricao){ msgEl.className='uform-msg error'; msgEl.textContent='Informe a descrição.'; return; }
    if(!valor){ msgEl.className='uform-msg error'; msgEl.textContent='Informe o valor.'; return; }

    var ehNovo=!editandoId;
    var idAlvo=editandoId||window.SGId.gerar();
    var registroAnteriorCopia=!ehNovo?Object.assign({},custos.filter(function(x){return String(x.IdCR)===String(idAlvo);})[0]):null;

    var registroNovo={IdCR:idAlvo,Descricao:descricao,'Dia Vencimento':diaVencimento,Valor:valor,Categoria:categoria,Status:status};
    var indice=custos.findIndex(function(x){return String(x.IdCR)===String(idAlvo);});
    if(indice===-1)custos.push(registroNovo);
    else custos[indice]=registroNovo;
    _epoca.marcar();

    fecharModal();
    render();
    (window.SGToast?window.SGToast.mostrar:function(t){})(ehNovo?'Custo recorrente criado.':'Custo recorrente atualizado.');

    apiCall('salvarCustoRecorrente',{idCR:idAlvo,descricao:descricao,diaVencimento:diaVencimento,valor:valor,categoria:categoria,status:status}).then(function(resp){
      if(!resp||!resp.ok){
        if(ehNovo)custos=custos.filter(function(x){return String(x.IdCR)!==String(idAlvo);});
        else{ var idx=custos.findIndex(function(x){return String(x.IdCR)===String(idAlvo);}); if(idx!==-1&&registroAnteriorCopia)custos[idx]=registroAnteriorCopia; }
        _epoca.marcar();
        render();
        (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})((resp&&resp.erro)||'Não foi possível salvar — a alteração foi desfeita.',true);
        return;
      }
      if(resp.idCR&&String(resp.idCR)!==String(idAlvo)){
        var idx2=custos.findIndex(function(x){return String(x.IdCR)===String(idAlvo);});
        if(idx2!==-1){ custos[idx2].IdCR=resp.idCR; render(); }
      }
    }).catch(function(err){
      if(ehNovo)custos=custos.filter(function(x){return String(x.IdCR)!==String(idAlvo);});
      else{ var idx=custos.findIndex(function(x){return String(x.IdCR)===String(idAlvo);}); if(idx!==-1&&registroAnteriorCopia)custos[idx]=registroAnteriorCopia; }
      _epoca.marcar();
      render();
      (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Erro de conexão — a alteração foi desfeita: '+err.message,true);
    });
  }

  function excluir(){
    if(!editandoId)return;
    window.SGConfirm.perguntar({titulo:'Excluir custo recorrente',mensagem:'Tem certeza que deseja excluir esse custo recorrente? Essa ação não pode ser desfeita.',textoConfirmar:'Excluir',perigo:true}).then(function(ok){
      if(!ok)return;
      var idAlvo=editandoId;
      var registroAnterior=custos.filter(function(x){return String(x.IdCR)===String(idAlvo);})[0];
      custos=custos.filter(function(x){return String(x.IdCR)!==String(idAlvo);});
      _epoca.marcar();
      fecharModal();
      if(window.SGViewPanel)window.SGViewPanel.fechar();
      render();
      (window.SGToast?window.SGToast.mostrar:function(t){})('Custo recorrente excluído.');

      apiCall('excluirCustoRecorrente',{idCR:idAlvo,solicitanteId:(window.SG_SESSION&&window.SG_SESSION.idVendedor)||''}).then(function(resp){
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
    document.getElementById('crec-emptyState').style.display='none';
    document.getElementById('crec-appVersion').textContent='v'+APP_VERSION;
    render();
  }

  function carregar(){
    var cache=window.SGCache&&window.SGCache.get('custorecorrente');
    var temCache=!!(cache&&cache.dados);
    if(temCache)aplicarDados(cache.dados);
    var epocaInicio=_epoca.atual();
    apiCall('getCustoRecorrenteData',{}).then(function(resp){
      if(!resp||!resp.ok){
        if(!temCache){
          document.getElementById('crec-emptyState').style.display='block';
          document.getElementById('crec-emptyState').querySelector('p').textContent=(resp&&resp.erro)||'Não foi possível carregar.';
        }
        return;
      }
      if(window.SGCache)window.SGCache.set('custorecorrente',resp);
      if(_epoca.atual()!==epocaInicio)return; // algo mudou aqui na tela enquanto essa busca estava no ar — não sobrescreve
      aplicarDados(resp);
    }).catch(function(err){
      if(!temCache){
        document.getElementById('crec-emptyState').style.display='block';
        document.getElementById('crec-emptyState').querySelector('p').textContent='Erro de conexão: '+err.message;
      }
    });
  }

  function init(){
    if(_initialized)return;
    if(!window.SGAuth||!window.SGAuth.isAdmin())return;
    _initialized=true;
    document.getElementById('crec-novoBtn').addEventListener('click',function(){ abrirModal(null); });
    document.getElementById('crec-fecharBtn').addEventListener('click',fecharModal);
    document.getElementById('crec-salvarBtn').addEventListener('click',salvar);
    document.getElementById('crec-excluirBtn').addEventListener('click',excluir);
    document.getElementById('crec-selCategoria').addEventListener('change',function(){ paginaAtual=1; render(); });
    document.getElementById('crec-selStatus').addEventListener('change',function(){ paginaAtual=1; render(); });
    document.getElementById('crec-buscaGeral').addEventListener('input',function(){ paginaAtual=1; render(); });
    document.querySelectorAll('#view-custorecorrente .kpi-clickable').forEach(function(k){
      k.addEventListener('click',function(){
        var alvo=k.getAttribute('data-crecstatus');
        var sel=document.getElementById('crec-selStatus');
        sel.value=(sel.value.toLowerCase()===alvo.toLowerCase())?'__all__':alvo;
        paginaAtual=1; render();
      });
    });
    document.getElementById('crec-resetFiltros').addEventListener('click',function(){
      document.getElementById('crec-selCategoria').value='__all__';document.getElementById('crec-selStatus').value='__all__';document.getElementById('crec-buscaGeral').value='';
      paginaAtual=1; render();
    });
    document.querySelectorAll('#view-custorecorrente th.sortable').forEach(function(th){
      th.addEventListener('click',function(){
        var col=th.getAttribute('data-sort');
        if(sortState.col===col){sortState.dir=sortState.dir==='asc'?'desc':'asc';}
        else{sortState.col=col;sortState.dir=(col==='descricao'||col==='categoria'||col==='status')?'asc':'desc';}
        render();
      });
    });
    carregar();
  }

  window.custoRecorrenteApp={init:init};
})();


