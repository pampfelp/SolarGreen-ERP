// ════ SERVIÇOS + TEMPLATES (somente administradores) ════
(function(){
  var _initialized=false;
  var _epoca=window.SGEpoca.criar();
  var servicos=[],templates=[];
  var servicoAtualId=null;
  var sortState={col:'nome',dir:'asc'};
  var APP_VERSION='2026-07-16-1';
  var TIPOS_INPUT=['Texto','Number','Foto','Lista','Sim/Nao'];

  function apiCall(action,extra){ return window.SGAuth.apiCall(action,extra); }
  function escapeHtml(s){ return window.SGUtil.escapeHtml(s); }
  // Guarda o '—' pra vazio (só esse módulo faz isso) antes de delegar pro formatter compartilhado.
  function fmtMoney(n){ if(n===undefined||n===null||n==='')return '—'; return window.SGUtil.fmtMoney(n); }
  function normalizaBuscaSv(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function isObrigatorioSv(v){ if(v===true)return true; if(v===false||v===undefined||v===null||v==='')return false; var s=String(v).trim().toUpperCase(); return s==='VERDADEIRO'||s==='TRUE'||s==='SIM'||s==='1'; }
  function templatesDoServico(idServico){ return templates.filter(function(t){return String(t.IdServico)===String(idServico);}).sort(function(a,b){return (parseInt(a.Ordem,10)||0)-(parseInt(b.Ordem,10)||0);}); }
  function textoBuscavelServico(s){ return normalizaBuscaSv([s['Nome Servico'],s['Tipo Cobranca'],s.TipoServico,s.Descricao].join(' | ')); }

  function sortServicosRows(lista){
    var col=sortState.col,dir=sortState.dir,mult=dir==='asc'?1:-1;
    lista.sort(function(a,b){
      if(col==='nome'){return mult*String(a['Nome Servico']||'').localeCompare(String(b['Nome Servico']||''),'pt-BR');}
      if(col==='cobranca'){return mult*String(a['Tipo Cobranca']||'').localeCompare(String(b['Tipo Cobranca']||''),'pt-BR');}
      if(col==='tipo'){return mult*String(a.TipoServico||'').localeCompare(String(b.TipoServico||''),'pt-BR');}
      if(col==='valor'){var va=(String(a.Valor||'0').indexOf(',')!==-1?parseFloat(String(a.Valor||'0').replace(/\./g,'').replace(',','.')):parseFloat(a.Valor))||0,vb=(String(b.Valor||'0').indexOf(',')!==-1?parseFloat(String(b.Valor||'0').replace(/\./g,'').replace(',','.')):parseFloat(b.Valor))||0;return mult*(va-vb);}
      if(col==='valormodulo'){var va2=(String(a.ValorPorModulo||'0').indexOf(',')!==-1?parseFloat(String(a.ValorPorModulo||'0').replace(/\./g,'').replace(',','.')):parseFloat(a.ValorPorModulo))||0,vb2=(String(b.ValorPorModulo||'0').indexOf(',')!==-1?parseFloat(String(b.ValorPorModulo||'0').replace(/\./g,'').replace(',','.')):parseFloat(b.ValorPorModulo))||0;return mult*(va2-vb2);}
      if(col==='perguntas'){return mult*(templatesDoServico(a.IdServico).length-templatesDoServico(b.IdServico).length);}
      return 0;
    });
  }
  function updateSortHeadersSv(){
    document.querySelectorAll('#view-servicos th.sortable').forEach(function(th){
      var col=th.getAttribute('data-sort');
      th.classList.toggle('sort-active',col===sortState.col);
      var a=th.querySelector('.arrow-sort');
      a.textContent=(col===sortState.col)?(sortState.dir==='asc'?'▴':'▾'):'▾';
    });
  }

  function render(){
    var busca=normalizaBuscaSv(document.getElementById('sv-buscaGeral').value||'').trim();
    var filtrados=busca?servicos.filter(function(s){return textoBuscavelServico(s).indexOf(busca)!==-1;}):servicos.slice();
    sortServicosRows(filtrados);
    updateSortHeadersSv();

    var tbody=document.getElementById('sv-tbody');
    if(!filtrados.length){
      tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--ink-faint);padding:30px;">Nenhum serviço encontrado.</td></tr>';
      return;
    }
    tbody.innerHTML=filtrados.map(function(s){
      var nPerg=templatesDoServico(s.IdServico).length;
      return '<tr class="ag-row-click" data-id="'+escapeHtml(s.IdServico)+'">'+
        '<td>'+escapeHtml(s['Nome Servico']||'—')+'</td>'+
        '<td>'+escapeHtml(s['Tipo Cobranca']||'—')+'</td>'+
        '<td>'+escapeHtml(s.TipoServico||'—')+'</td>'+
        '<td class="num">'+fmtMoney(s.Valor)+'</td>'+
        '<td class="num">'+fmtMoney(s.ValorPorModulo)+'</td>'+
        '<td>'+nPerg+' pergunta(s)</td>'+
      '</tr>';
    }).join('');
    tbody.querySelectorAll('.ag-row-click').forEach(function(tr){
      tr.addEventListener('click',function(){ try{ abrirVisualizacaoServico(tr.getAttribute('data-id')); }catch(err){ console.error('abrirVisualizacaoServico falhou:',err); (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Não foi possível abrir esse registro (erro: '+err.message+').',true); } });
    });
    document.getElementById('sv-lastUpdate').textContent='Atualizado em '+new Date().toLocaleDateString('pt-BR')+' às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }

  function renderPerguntas(){
    var lista=servicoAtualId?templatesDoServico(servicoAtualId):[];
    var wrap=document.getElementById('sv-perguntasWrap');
    if(!servicoAtualId){
      wrap.innerHTML='<div style="text-align:center;color:var(--ink-faint);font-size:12.5px;padding:14px;">Salve o serviço primeiro pra poder adicionar perguntas.</div>';
      return;
    }
    if(!lista.length){
      wrap.innerHTML='<div style="text-align:center;color:var(--ink-faint);font-size:12.5px;padding:14px;">Nenhuma pergunta cadastrada ainda.</div>';
      return;
    }
    wrap.innerHTML=lista.map(function(t){
      return '<div class="tpl-row" data-id="'+escapeHtml(t.IdTemplate)+'" style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px;">'+
        '<input type="text" class="tpl-pergunta" value="'+escapeHtml(t.TextoPergunta||'')+'" placeholder="Texto da pergunta" style="width:100%;margin-bottom:6px;padding:7px 9px;border:1px solid var(--line);border-radius:7px;font-size:12.5px;">'+
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">'+
          '<select class="tpl-tipo" style="font-size:11.5px;padding:5px 7px;border:1px solid var(--line);border-radius:6px;">'+
            TIPOS_INPUT.map(function(tp){return '<option value="'+tp+'"'+(t.TipoInput===tp?' selected':'')+'>'+tp+'</option>';}).join('')+
          '</select>'+
          '<input type="text" class="tpl-opcoes" value="'+escapeHtml(t.OpcoesEnum||'')+'" placeholder="opções (se Lista), separadas por vírgula" style="flex:1;min-width:140px;font-size:11.5px;padding:5px 7px;border:1px solid var(--line);border-radius:6px;">'+
          '<input type="number" class="tpl-ordem" value="'+escapeHtml(t.Ordem||'')+'" placeholder="ordem" style="width:64px;font-size:11.5px;padding:5px 7px;border:1px solid var(--line);border-radius:6px;">'+
          '<label style="font-size:11px;display:flex;align-items:center;gap:3px;white-space:nowrap;"><input type="checkbox" class="tpl-obrigatorio" '+(isObrigatorioSv(t.Obrigatorio)?'checked':'')+'> obrigatória</label>'+
          '<button type="button" class="tpl-excluir" style="margin-left:auto;color:var(--debit);background:none;border:none;cursor:pointer;font-size:11.5px;">excluir</button>'+
        '</div>'+
      '</div>';
    }).join('');
    wrap.querySelectorAll('.tpl-row').forEach(function(row){
      var idTpl=row.getAttribute('data-id');
      function salvarLinha(){ salvarPergunta(idTpl,row); }
      row.querySelector('.tpl-pergunta').addEventListener('blur',salvarLinha);
      row.querySelector('.tpl-tipo').addEventListener('change',salvarLinha);
      row.querySelector('.tpl-opcoes').addEventListener('blur',salvarLinha);
      row.querySelector('.tpl-ordem').addEventListener('blur',salvarLinha);
      row.querySelector('.tpl-obrigatorio').addEventListener('change',salvarLinha);
      row.querySelector('.tpl-excluir').addEventListener('click',function(){ excluirPergunta(idTpl); });
    });
  }

  function salvarPergunta(idTpl,row){
    var textoPergunta=row.querySelector('.tpl-pergunta').value.trim();
    if(!textoPergunta)return; // não salva pergunta vazia
    var tipoInput=row.querySelector('.tpl-tipo').value;
    var opcoesEnum=row.querySelector('.tpl-opcoes').value;
    var ordem=row.querySelector('.tpl-ordem').value;
    var obrigatorio=row.querySelector('.tpl-obrigatorio').checked;

    var indice=templates.findIndex(function(x){return String(x.IdTemplate)===String(idTpl);});
    if(indice!==-1){
      templates[indice]=Object.assign({},templates[indice],{TextoPergunta:textoPergunta,TipoInput:tipoInput,OpcoesEnum:opcoesEnum,Ordem:ordem,Obrigatorio:obrigatorio});
      _epoca.marcar();
    }

    apiCall('salvarTemplate',{idTemplate:idTpl,idServico:servicoAtualId,ordem:ordem,textoPergunta:textoPergunta,tipoInput:tipoInput,opcoesEnum:opcoesEnum,obrigatorio:obrigatorio}).then(function(resp){
      if(!resp||!resp.ok){ (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})((resp&&resp.erro)||'Não foi possível salvar a pergunta.',true); return; }
      if(resp.idTemplate&&String(resp.idTemplate)!==String(idTpl)){
        var idx=templates.findIndex(function(x){return String(x.IdTemplate)===String(idTpl);});
        if(idx!==-1){ templates[idx].IdTemplate=resp.idTemplate; renderPerguntas(); }
      }
    }).catch(function(err){ (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Erro de conexão: '+err.message,true); });
  }

  function excluirPergunta(idTpl){
    if(!confirm('Excluir essa pergunta do checklist? Essa ação não pode ser desfeita.'))return;
    var registroAnterior=templates.filter(function(x){return String(x.IdTemplate)===String(idTpl);})[0];
    templates=templates.filter(function(x){return String(x.IdTemplate)!==String(idTpl);});
    _epoca.marcar();
    renderPerguntas();
    render();

    apiCall('excluirTemplate',{idTemplate:idTpl,solicitanteId:(window.SG_SESSION&&window.SG_SESSION.idVendedor)||''}).then(function(resp){
      if(!resp||!resp.ok){
        if(window.SGUtil&&window.SGUtil.ehNaoEncontrado(resp&&resp.erro))return;
        if(registroAnterior)templates.push(registroAnterior);
        _epoca.marcar();
        renderPerguntas(); render();
        (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})((resp&&resp.erro)||'Não foi possível excluir — restaurado.',true);
      }
    }).catch(function(err){
      if(registroAnterior)templates.push(registroAnterior);
      _epoca.marcar();
      renderPerguntas(); render();
      (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Erro de conexão — restaurado: '+err.message,true);
    });
  }

  function novaPergunta(){
    if(!servicoAtualId){ (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Salve o serviço primeiro.',true); return; }
    var idNovo=window.SGId.gerar();
    var ordemSugerida=templatesDoServico(servicoAtualId).length+1;
    var registroNovo={IdTemplate:idNovo,IdServico:servicoAtualId,Ordem:String(ordemSugerida),TextoPergunta:'Nova pergunta',TipoInput:'Texto',OpcoesEnum:'',Obrigatorio:false};
    templates.push(registroNovo);
    _epoca.marcar();
    renderPerguntas();
    render();
    apiCall('salvarTemplate',{idTemplate:idNovo,idServico:servicoAtualId,ordem:String(ordemSugerida),textoPergunta:'Nova pergunta',tipoInput:'Texto',opcoesEnum:'',obrigatorio:false}).then(function(resp){
      if(!resp||!resp.ok){
        templates=templates.filter(function(x){return String(x.IdTemplate)!==String(idNovo);});
        _epoca.marcar();
        renderPerguntas(); render();
        (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})((resp&&resp.erro)||'Não foi possível criar a pergunta.',true);
      }
    });
  }

  /**
   * Painel de VISUALIZAÇÃO do serviço — abre ao clicar na linha. Lápis chama
   * abrirPainel(id) pra editar de verdade (inclusive as perguntas do
   * checklist); lixeira exclui direto.
   */
  function abrirVisualizacaoServico(idServico){
    var s=servicos.filter(function(x){return String(x.IdServico)===String(idServico);})[0];
    if(!s)return;
    servicoAtualId=idServico;
    var nPerg=templatesDoServico(idServico).length;
    var html='<div class="ad-section">'+
      '<div class="ad-row"><span class="dl">Tipo de cobrança</span><span class="dv">'+escapeHtml(s['Tipo Cobranca']||'—')+'</span></div>'+
      '<div class="ad-row"><span class="dl">Tipo de serviço</span><span class="dv">'+escapeHtml(s.TipoServico||'—')+'</span></div>'+
      '<div class="ad-row"><span class="dl">Valor</span><span class="dv">'+fmtMoney(s.Valor)+'</span></div>'+
      '<div class="ad-row"><span class="dl">Valor por módulo</span><span class="dv">'+fmtMoney(s.ValorPorModulo)+'</span></div>'+
      '<div class="ad-row"><span class="dl">Checklist</span><span class="dv">'+nPerg+' pergunta(s)</span></div>'+
    '</div>'+
    (s.Descricao?'<div class="ad-section"><h4>Descrição</h4><p style="font-size:13px;color:var(--ink);line-height:1.5;">'+escapeHtml(s.Descricao)+'</p></div>':'');

    window.SGViewPanel.abrir({
      titulo:s['Nome Servico']||'Serviço',
      html:html,
      onEditar:function(){ abrirPainel(idServico); },
      onExcluir:function(){ servicoAtualId=idServico; excluirServico(); }
    });
  }

  function abrirPainel(idServico){
    var s=idServico?servicos.filter(function(x){return String(x.IdServico)===String(idServico);})[0]:null;
    servicoAtualId=idServico||null;
    document.getElementById('sv-title').textContent=s?(s['Nome Servico']||'Serviço'):'Novo serviço';
    document.getElementById('sv-nome').value=s?(s['Nome Servico']||''):'';
    document.getElementById('sv-tipoCobranca').value=s?(s['Tipo Cobranca']||'Unitário'):'Unitário';
    document.getElementById('sv-tipoServico').value=s?(s.TipoServico||'Campo'):'Campo';
    document.getElementById('sv-descricao').value=s?(s.Descricao||''):'';
    document.getElementById('sv-valor').value=s?s.Valor:'';
    document.getElementById('sv-valorPorModulo').value=s?s.ValorPorModulo:'';
    document.getElementById('sv-excluirBtn').style.display=s?'block':'none';
    document.getElementById('sv-novaPerguntaBtn').style.display=s?'inline-block':'none';
    document.getElementById('sv-msg').textContent='';
    renderPerguntas();
    document.getElementById('servicoDetalhe').classList.add('active');
  }
  function fecharPainel(){ document.getElementById('servicoDetalhe').classList.remove('active'); servicoAtualId=null; }

  function salvarServico(){
    var nome=document.getElementById('sv-nome').value.trim();
    var msgEl=document.getElementById('sv-msg');
    if(!nome){ msgEl.className='uform-msg error'; msgEl.textContent='Informe o nome do serviço.'; return; }

    var tipoCobranca=document.getElementById('sv-tipoCobranca').value;
    var tipoServico=document.getElementById('sv-tipoServico').value;
    var descricao=document.getElementById('sv-descricao').value;
    var valor=document.getElementById('sv-valor').value;
    var valorPorModulo=document.getElementById('sv-valorPorModulo').value;

    var ehNovo=!servicoAtualId;
    var idAlvo=servicoAtualId||window.SGId.gerar();
    var registroAnteriorCopia=!ehNovo?Object.assign({},servicos.filter(function(x){return String(x.IdServico)===String(idAlvo);})[0]):null;

    var registroNovo={IdServico:idAlvo,'Nome Servico':nome,'Tipo Cobranca':tipoCobranca,TipoServico:tipoServico,Descricao:descricao,Valor:valor,ValorPorModulo:valorPorModulo};
    var indice=servicos.findIndex(function(x){return String(x.IdServico)===String(idAlvo);});
    if(indice===-1)servicos.push(registroNovo);
    else servicos[indice]=registroNovo;
    _epoca.marcar();

    var abriaNovo=ehNovo;
    servicoAtualId=idAlvo;
    document.getElementById('sv-title').textContent=nome;
    document.getElementById('sv-excluirBtn').style.display='block';
    document.getElementById('sv-novaPerguntaBtn').style.display='inline-block';
    render();
    renderPerguntas();
    (window.SGToast?window.SGToast.mostrar:function(t){})(ehNovo?'Serviço criado.':'Serviço atualizado.');

    apiCall('salvarServico',{idServico:idAlvo,nomeServico:nome,tipoCobranca:tipoCobranca,tipoServico:tipoServico,descricao:descricao,valor:valor,valorPorModulo:valorPorModulo}).then(function(resp){
      if(!resp||!resp.ok){
        if(abriaNovo)servicos=servicos.filter(function(x){return String(x.IdServico)!==String(idAlvo);});
        else{ var idx=servicos.findIndex(function(x){return String(x.IdServico)===String(idAlvo);}); if(idx!==-1&&registroAnteriorCopia)servicos[idx]=registroAnteriorCopia; }
        if(abriaNovo)servicoAtualId=null;
        _epoca.marcar();
        render();
        msgEl.className='uform-msg error'; msgEl.textContent=(resp&&resp.erro)||'Não foi possível salvar — a alteração foi desfeita.';
        return;
      }
      if(resp.idServico&&String(resp.idServico)!==String(idAlvo)){
        var idx2=servicos.findIndex(function(x){return String(x.IdServico)===String(idAlvo);});
        if(idx2!==-1){ servicos[idx2].IdServico=resp.idServico; servicoAtualId=resp.idServico; render(); }
      }
    }).catch(function(err){
      if(abriaNovo){ servicos=servicos.filter(function(x){return String(x.IdServico)!==String(idAlvo);}); servicoAtualId=null; }
      else{ var idx=servicos.findIndex(function(x){return String(x.IdServico)===String(idAlvo);}); if(idx!==-1&&registroAnteriorCopia)servicos[idx]=registroAnteriorCopia; }
      _epoca.marcar();
      render();
      msgEl.className='uform-msg error'; msgEl.textContent='Erro de conexão — a alteração foi desfeita: '+err.message;
    });
  }

  function excluirServico(){
    if(!servicoAtualId)return;
    if(!confirm('Tem certeza que deseja excluir esse serviço? As perguntas do checklist dele NÃO são apagadas automaticamente. Essa ação não pode ser desfeita.'))return;
    var idAlvo=servicoAtualId;
    var registroAnterior=servicos.filter(function(x){return String(x.IdServico)===String(idAlvo);})[0];
    servicos=servicos.filter(function(x){return String(x.IdServico)!==String(idAlvo);});
    _epoca.marcar();
    fecharPainel();
    if(window.SGViewPanel)window.SGViewPanel.fechar();
    render();
    (window.SGToast?window.SGToast.mostrar:function(t){})('Serviço excluído.');

    apiCall('excluirServico',{idServico:idAlvo,solicitanteId:(window.SG_SESSION&&window.SG_SESSION.idVendedor)||''}).then(function(resp){
      if(!resp||!resp.ok){
        if(window.SGUtil&&window.SGUtil.ehNaoEncontrado(resp&&resp.erro))return;
        if(registroAnterior)servicos.push(registroAnterior);
        _epoca.marcar();
        render();
        (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})((resp&&resp.erro)||'Não foi possível excluir — restaurado.',true);
      }
    }).catch(function(err){
      if(registroAnterior)servicos.push(registroAnterior);
      _epoca.marcar();
      render();
      (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Erro de conexão — restaurado: '+err.message,true);
    });
  }

  function aplicarDados(resp){
    servicos=resp.servicos||[];
    templates=resp.templates||[];
    document.getElementById('sv-emptyState').style.display='none';
    document.getElementById('sv-appVersion').textContent='v'+APP_VERSION;
    render();
  }

  function carregar(){
    var cache=window.SGCache&&window.SGCache.get('servicos_tela');
    var temCache=!!(cache&&cache.dados);
    if(temCache)aplicarDados(cache.dados);
    var epocaInicio=_epoca.atual();
    apiCall('getServicosData',{}).then(function(resp){
      if(!resp||!resp.ok){
        if(!temCache){
          document.getElementById('sv-emptyState').style.display='block';
          document.getElementById('sv-emptyState').querySelector('p').textContent=(resp&&resp.erro)||'Não foi possível carregar.';
        }
        return;
      }
      if(window.SGCache)window.SGCache.set('servicos_tela',resp);
      if(_epoca.atual()!==epocaInicio)return;
      aplicarDados(resp);
    }).catch(function(err){
      if(!temCache){
        document.getElementById('sv-emptyState').style.display='block';
        document.getElementById('sv-emptyState').querySelector('p').textContent='Erro de conexão: '+err.message;
      }
    });
  }

  function init(){
    if(_initialized)return;
    if(!window.SG_SESSION)return; // agora é controlado pela matriz de permissões, não mais admin-only fixo
    _initialized=true;
    document.getElementById('sv-novoBtn').addEventListener('click',function(){ abrirPainel(null); });
    document.getElementById('sv-fecharBtn').addEventListener('click',fecharPainel);
    document.getElementById('sv-salvarBtn').addEventListener('click',salvarServico);
    document.getElementById('sv-excluirBtn').addEventListener('click',excluirServico);
    document.getElementById('sv-novaPerguntaBtn').addEventListener('click',novaPergunta);
    document.getElementById('sv-buscaGeral').addEventListener('input',render);
    document.querySelectorAll('#view-servicos th.sortable').forEach(function(th){
      th.addEventListener('click',function(){
        var col=th.getAttribute('data-sort');
        if(sortState.col===col){sortState.dir=sortState.dir==='asc'?'desc':'asc';}
        else{sortState.col=col;sortState.dir=(col==='nome'||col==='cobranca'||col==='tipo')?'asc':'desc';}
        render();
      });
    });
    carregar();
  }

  window.servicosApp={init:init};
})();


