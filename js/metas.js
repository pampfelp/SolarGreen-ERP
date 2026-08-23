// ════ METAS (somente administradores) ════
(function(){
  var _initialized=false;
  var _epoca=window.SGEpoca.criar();
  var metas=[];
  var editandoId=null;
  var sortState={col:'ano',dir:'desc'};
  var APP_VERSION='2026-07-16-1';
  var NOMES_MESES=['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  function apiCall(action,extra){ return window.SGAuth.apiCall(action,extra); }
  function escapeHtml(s){ return window.SGUtil.escapeHtml(s); }
  function fmtMoney(n){ return window.SGUtil.fmtMoney(n); }

  function sortMetasRows(lista){
    var col=sortState.col,dir=sortState.dir,mult=dir==='asc'?1:-1;
    lista.sort(function(a,b){
      if(col==='ano'){var d=(Number(a.Ano)||0)-(Number(b.Ano)||0); if(d!==0)return mult*d; return mult*((Number(a.Mes)||0)-(Number(b.Mes)||0));}
      if(col==='mes'){return mult*((Number(a.Mes)||0)-(Number(b.Mes)||0));}
      if(col==='valor'){var va=(String(a.Valor||'0').indexOf(',')!==-1?parseFloat(String(a.Valor||'0').replace(/\./g,'').replace(',','.')):parseFloat(a.Valor))||0,vb=(String(b.Valor||'0').indexOf(',')!==-1?parseFloat(String(b.Valor||'0').replace(/\./g,'').replace(',','.')):parseFloat(b.Valor))||0;return mult*(va-vb);}
      return 0;
    });
  }
  function updateSortHeadersMt(){
    document.querySelectorAll('#view-metas th.sortable').forEach(function(th){
      var col=th.getAttribute('data-sort');
      th.classList.toggle('sort-active',col===sortState.col);
      var a=th.querySelector('.arrow-sort');
      a.textContent=(col===sortState.col)?(sortState.dir==='asc'?'▴':'▾'):'▾';
    });
  }

  function render(){
    var ordenadas=metas.slice();
    sortMetasRows(ordenadas);
    updateSortHeadersMt();
    document.getElementById('mt-tableHint').textContent=ordenadas.length+' meta(s) cadastrada(s)';
    var tbody=document.getElementById('mt-tbody');
    if(!ordenadas.length){
      tbody.innerHTML='<tr><td colspan="3" style="text-align:center;color:var(--ink-faint);padding:30px;">Nenhuma meta cadastrada ainda.</td></tr>';
      return;
    }
    tbody.innerHTML=ordenadas.map(function(m){
      return '<tr class="ag-row-click" data-id="'+escapeHtml(m.IdMeta)+'">'+
        '<td>'+escapeHtml(m.Ano)+'</td>'+
        '<td>'+escapeHtml(NOMES_MESES[Number(m.Mes)]||m.Mes)+'</td>'+
        '<td class="num">'+fmtMoney(m.Valor)+'</td>'+
      '</tr>';
    }).join('');
    tbody.querySelectorAll('.ag-row-click').forEach(function(tr){
      tr.addEventListener('click',function(){ try{ abrirVisualizacaoMeta(tr.getAttribute('data-id')); }catch(err){ console.error('abrirVisualizacaoMeta falhou:',err); (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Não foi possível abrir esse registro (erro: '+err.message+'). Atualize a página e tente de novo.',true); } });
    });
    document.getElementById('mt-lastUpdate').textContent='Atualizado em '+new Date().toLocaleDateString('pt-BR')+' às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }

  /**
   * Painel de VISUALIZAÇÃO da meta — abre ao clicar na linha. Lápis chama
   * abrirModalMeta(id) pra editar; lixeira exclui direto.
   */
  function abrirVisualizacaoMeta(idMeta){
    var m=metas.filter(function(x){return String(x.IdMeta)===String(idMeta);})[0];
    if(!m)return;
    editandoId=idMeta;
    var html='<div class="ad-section">'+
      '<div class="ad-row"><span class="dl">Ano</span><span class="dv">'+escapeHtml(m.Ano)+'</span></div>'+
      '<div class="ad-row"><span class="dl">Mês</span><span class="dv">'+escapeHtml(NOMES_MESES[Number(m.Mes)]||m.Mes)+'</span></div>'+
      '<div class="ad-row"><span class="dl">Valor</span><span class="dv">'+fmtMoney(m.Valor)+'</span></div>'+
    '</div>';

    window.SGViewPanel.abrir({
      titulo:(NOMES_MESES[Number(m.Mes)]||m.Mes)+'/'+m.Ano,
      html:html,
      onEditar:function(){ abrirModalMeta(idMeta); },
      onExcluir:function(){ editandoId=idMeta; excluirMeta(); }
    });
  }

  function abrirModalMeta(idMeta){
    var m=idMeta?metas.filter(function(x){return String(x.IdMeta)===String(idMeta);})[0]:null;
    editandoId=idMeta||null;
    document.getElementById('metaModalTitle').textContent=m?'Editar meta':'Nova meta';
    var hoje=new Date();
    document.getElementById('mt-ano').value=m?m.Ano:hoje.getFullYear();
    document.getElementById('mt-mes').value=m?m.Mes:(hoje.getMonth()+1);
    document.getElementById('mt-valor').value=m?m.Valor:'';
    document.getElementById('mt-excluirBtn').style.display=m?'block':'none';
    document.getElementById('mt-msg').textContent='';
    document.getElementById('metaDetalhe').classList.add('active');
  }
  function fecharModalMeta(){ document.getElementById('metaDetalhe').classList.remove('active'); editandoId=null; }

  function salvarMeta(){
    var ano=document.getElementById('mt-ano').value;
    var mes=document.getElementById('mt-mes').value;
    var valor=document.getElementById('mt-valor').value;
    var msgEl=document.getElementById('mt-msg');
    if(!ano||!mes||!valor){ msgEl.className='uform-msg error'; msgEl.textContent='Preencha ano, mês e valor.'; return; }

    // igual o servidor: se já existe uma meta pra esse ano+mês, é ELA que
    // vai ser atualizada, mesmo que a edição tenha sido aberta como "nova".
    var existente=metas.filter(function(x){return Number(x.Ano)===Number(ano)&&Number(x.Mes)===Number(mes);})[0];
    var idAlvo=editandoId||(existente?existente.IdMeta:null)||window.SGId.gerar();
    var ehNovo=!editandoId&&!existente;
    var registroAnteriorCopia=!ehNovo?Object.assign({},(existente||metas.filter(function(x){return String(x.IdMeta)===String(idAlvo);})[0])):null;

    var registroNovo={IdMeta:idAlvo,Ano:ano,Mes:mes,Valor:valor};
    var indice=metas.findIndex(function(x){return String(x.IdMeta)===String(idAlvo);});
    if(indice===-1)metas.push(registroNovo);
    else metas[indice]=registroNovo;
    _epoca.marcar();

    fecharModalMeta();
    render();
    msgEl.className=''; msgEl.textContent='';
    (window.SGToast?window.SGToast.mostrar:function(t){})(ehNovo?'Meta criada.':'Meta atualizada.');

    apiCall('salvarMeta',{idMeta:idAlvo,ano:ano,mes:mes,valor:valor}).then(function(resp){
      if(!resp||!resp.ok){
        if(ehNovo)metas=metas.filter(function(x){return String(x.IdMeta)!==String(idAlvo);});
        else{ var idx=metas.findIndex(function(x){return String(x.IdMeta)===String(idAlvo);}); if(idx!==-1&&registroAnteriorCopia)metas[idx]=registroAnteriorCopia; }
        _epoca.marcar();
        render();
        (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})((resp&&resp.erro)||'Não foi possível salvar — a alteração foi desfeita.',true);
        return;
      }
      if(resp.idMeta&&String(resp.idMeta)!==String(idAlvo)){
        var idx2=metas.findIndex(function(x){return String(x.IdMeta)===String(idAlvo);});
        if(idx2!==-1){ metas[idx2].IdMeta=resp.idMeta; render(); }
      }
    }).catch(function(err){
      if(ehNovo)metas=metas.filter(function(x){return String(x.IdMeta)!==String(idAlvo);});
      else{ var idx=metas.findIndex(function(x){return String(x.IdMeta)===String(idAlvo);}); if(idx!==-1&&registroAnteriorCopia)metas[idx]=registroAnteriorCopia; }
      _epoca.marcar();
      render();
      (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Erro de conexão — a alteração foi desfeita: '+err.message,true);
    });
  }

  function excluirMeta(){
    if(!editandoId)return;
    window.SGConfirm.perguntar({titulo:'Excluir meta',mensagem:'Tem certeza que deseja excluir essa meta? Essa ação não pode ser desfeita.',textoConfirmar:'Excluir',perigo:true}).then(function(ok){
      if(!ok)return;
      var idAlvo=editandoId;
      var registroAnterior=metas.filter(function(x){return String(x.IdMeta)===String(idAlvo);})[0];
      metas=metas.filter(function(x){return String(x.IdMeta)!==String(idAlvo);});
      _epoca.marcar();
      fecharModalMeta();
      if(window.SGViewPanel)window.SGViewPanel.fechar();
      render();
      (window.SGToast?window.SGToast.mostrar:function(t){})('Meta excluída.');

      apiCall('excluirMeta',{idMeta:idAlvo,solicitanteId:(window.SG_SESSION&&window.SG_SESSION.idVendedor)||''}).then(function(resp){
        if(!resp||!resp.ok){
          if(window.SGUtil&&window.SGUtil.ehNaoEncontrado(resp&&resp.erro))return;
          if(registroAnterior)metas.push(registroAnterior);
          _epoca.marcar();
          render();
          (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})((resp&&resp.erro)||'Não foi possível excluir — restaurado.',true);
        }
      }).catch(function(err){
        if(registroAnterior)metas.push(registroAnterior);
        _epoca.marcar();
        render();
        (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Erro de conexão — restaurado: '+err.message,true);
      });
    });
  }

  function aplicarDados(resp){
    metas=resp.metas||[];
    document.getElementById('mt-emptyState').style.display='none';
    document.getElementById('mt-appVersion').textContent='v'+APP_VERSION;
    render();
  }

  function carregar(){
    var cache=window.SGCache&&window.SGCache.get('metas');
    var temCache=!!(cache&&cache.dados);
    if(temCache)aplicarDados(cache.dados);
    var epocaInicio=_epoca.atual();
    apiCall('getMetasData',{}).then(function(resp){
      if(!resp||!resp.ok){
        if(!temCache){
          document.getElementById('mt-emptyState').style.display='block';
          document.getElementById('mt-emptyState').querySelector('p').textContent=(resp&&resp.erro)||'Não foi possível carregar as metas.';
        }
        return;
      }
      if(window.SGCache)window.SGCache.set('metas',resp);
      if(_epoca.atual()!==epocaInicio)return;
      aplicarDados(resp);
    }).catch(function(err){
      if(!temCache){
        document.getElementById('mt-emptyState').style.display='block';
        document.getElementById('mt-emptyState').querySelector('p').textContent='Erro de conexão: '+err.message;
      }
    });
  }

  function init(){
    if(_initialized)return;
    if(!window.SGAuth||!window.SGAuth.isAdmin())return; // trava extra no front (o backend também recusa se quiser)
    _initialized=true;
    document.getElementById('mt-novaBtn').addEventListener('click',function(){ abrirModalMeta(null); });
    document.getElementById('mt-fecharBtn').addEventListener('click',fecharModalMeta);
    document.getElementById('mt-salvarBtn').addEventListener('click',salvarMeta);
    document.getElementById('mt-excluirBtn').addEventListener('click',excluirMeta);
    document.querySelectorAll('#view-metas th.sortable').forEach(function(th){
      th.addEventListener('click',function(){
        var col=th.getAttribute('data-sort');
        if(sortState.col===col){sortState.dir=sortState.dir==='asc'?'desc':'asc';}
        else{sortState.col=col;sortState.dir='desc';}
        render();
      });
    });
    carregar();
  }

  window.metasApp={init:init};
})();


