// ════ CATÁLOGO SOLAR (módulos e inversores) ════
(function(){
  var _epoca=window.SGEpoca.criar();
  var modulos=[],inversores=[];
  var moduloAtualId=null,inversorAtualId=null;
  var abaAtiva='modulos';
  var mpptsConfigAtual=[]; // array {maxIsc,maxStrings} do inversor aberto no painel — 1 item por MPPT
  var APP_VERSION='2026-07-16-1';
  var FASES_LABEL={Monofasico:'Monofásico',Bifasico:'Bifásico',Trifasico:'Trifásico'};

  function apiCall(action,extra){ return window.SGAuth.apiCall(action,extra); }
  function escapeHtml(s){ return window.SGUtil.escapeHtml(s); }
  function normalizaBuscaCat(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function fmtNum(n,d){ if(n===undefined||n===null||n==='')return '—'; var v=parseFloat(n); if(isNaN(v))return '—'; return v.toLocaleString('pt-BR',{minimumFractionDigits:d||0,maximumFractionDigits:d||2}); }

  function trocarAba(nome){
    abaAtiva=nome;
    document.getElementById('cat-tabModulos').classList.toggle('active',nome==='modulos');
    document.getElementById('cat-tabInversores').classList.toggle('active',nome==='inversores');
    document.getElementById('cat-wrapModulos').style.display=nome==='modulos'?'':'none';
    document.getElementById('cat-wrapInversores').style.display=nome==='inversores'?'':'none';
    document.getElementById('cat-novoModuloBtn').style.display=nome==='modulos'?'':'none';
    document.getElementById('cat-novoInversorBtn').style.display=nome==='inversores'?'':'none';
    render();
  }

  function render(){
    var busca=normalizaBuscaCat(document.getElementById('cat-buscaGeral').value||'').trim();
    if(abaAtiva==='modulos'){
      var lista=busca?modulos.filter(function(m){return normalizaBuscaCat((m.Marca||'')+' '+(m.Modelo||'')).indexOf(busca)!==-1;}):modulos.slice();
      var tbody=document.getElementById('cat-tbodyModulos');
      if(!lista.length){ tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--ink-faint);padding:30px;">Nenhum módulo cadastrado.</td></tr>'; }
      else{
        tbody.innerHTML=lista.map(function(m){
          return '<tr class="ag-row-click" data-id="'+escapeHtml(m.IdModulo)+'">'+
            '<td>'+escapeHtml(m.Marca||'—')+'</td>'+
            '<td>'+escapeHtml(m.Modelo||'—')+'</td>'+
            '<td class="num">'+fmtNum(m.AlturaM,3)+' × '+fmtNum(m.LarguraM,3)+'</td>'+
            '<td class="num">'+fmtNum(m.PotenciaW,0)+'</td>'+
            '<td class="num">'+fmtNum(m.VocV,2)+'</td>'+
            '<td class="num">'+fmtNum(m.IscA,2)+'</td>'+
            '<td class="num">'+fmtNum(m.PesoKg,1)+'</td>'+
          '</tr>';
        }).join('');
        tbody.querySelectorAll('.ag-row-click').forEach(function(tr){
          tr.addEventListener('click',function(){ abrirVisualizacaoModulo(tr.getAttribute('data-id')); });
        });
      }
    }else{
      var lista2=busca?inversores.filter(function(v){return normalizaBuscaCat((v.Marca||'')+' '+(v.Modelo||'')).indexOf(busca)!==-1;}):inversores.slice();
      var tbody2=document.getElementById('cat-tbodyInversores');
      if(!lista2.length){ tbody2.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--ink-faint);padding:30px;">Nenhum inversor cadastrado.</td></tr>'; }
      else{
        tbody2.innerHTML=lista2.map(function(v){
          return '<tr class="ag-row-click" data-id="'+escapeHtml(v.IdInversor)+'">'+
            '<td>'+escapeHtml(v.Marca||'—')+'</td>'+
            '<td>'+escapeHtml(v.Modelo||'—')+'</td>'+
            '<td class="num">'+fmtNum(v.PotenciaMaxCC_W,0)+'</td>'+
            '<td class="num">'+fmtNum(v.MpptMinV,0)+'–'+fmtNum(v.MpptMaxV,0)+'</td>'+
            '<td class="num">'+fmtNum(v.NumMppts,0)+'</td>'+
            '<td>'+escapeHtml(FASES_LABEL[v.Fases]||v.Fases||'—')+'</td>'+
          '</tr>';
        }).join('');
        tbody2.querySelectorAll('.ag-row-click').forEach(function(tr){
          tr.addEventListener('click',function(){ abrirVisualizacaoInversor(tr.getAttribute('data-id')); });
        });
      }
    }
    document.getElementById('cat-lastUpdate').textContent='Atualizado em '+new Date().toLocaleDateString('pt-BR')+' às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }

  // ── Módulos ──

  function abrirVisualizacaoModulo(idModulo){
    var m=modulos.filter(function(x){return String(x.IdModulo)===String(idModulo);})[0];
    if(!m)return;
    var html='<div class="ad-section">'+
      '<div class="ad-row"><span class="dl">Altura × Largura</span><span class="dv">'+fmtNum(m.AlturaM,3)+' × '+fmtNum(m.LarguraM,3)+' m</span></div>'+
      '<div class="ad-row"><span class="dl">Potência</span><span class="dv">'+fmtNum(m.PotenciaW,0)+' W</span></div>'+
      '<div class="ad-row"><span class="dl">Voc</span><span class="dv">'+fmtNum(m.VocV,2)+' V</span></div>'+
      '<div class="ad-row"><span class="dl">Isc</span><span class="dv">'+fmtNum(m.IscA,2)+' A</span></div>'+
      '<div class="ad-row"><span class="dl">Peso</span><span class="dv">'+fmtNum(m.PesoKg,1)+' kg</span></div>'+
    '</div>';
    window.SGViewPanel.abrir({
      titulo:(m.Marca?m.Marca+' — ':'')+(m.Modelo||'Módulo'),
      html:html,
      onEditar:function(){ abrirPainelModulo(idModulo); },
      onExcluir:function(){ moduloAtualId=idModulo; excluirModulo(); }
    });
  }

  function abrirPainelModulo(idModulo){
    var m=idModulo?modulos.filter(function(x){return String(x.IdModulo)===String(idModulo);})[0]:null;
    moduloAtualId=idModulo||null;
    document.getElementById('mod-title').textContent=m?(m.Modelo||'Módulo'):'Novo módulo';
    document.getElementById('mod-marca').value=m?(m.Marca||''):'';
    document.getElementById('mod-modelo').value=m?(m.Modelo||''):'';
    document.getElementById('mod-alturaM').value=m?m.AlturaM:'';
    document.getElementById('mod-larguraM').value=m?m.LarguraM:'';
    document.getElementById('mod-potenciaW').value=m?m.PotenciaW:'';
    document.getElementById('mod-pesoKg').value=m?m.PesoKg:'';
    document.getElementById('mod-vocV').value=m?m.VocV:'';
    document.getElementById('mod-iscA').value=m?m.IscA:'';
    document.getElementById('mod-excluirBtn').style.display=m?'block':'none';
    document.getElementById('mod-msg').textContent='';
    document.getElementById('moduloDetalhe').classList.add('active');
  }
  function fecharPainelModulo(){ document.getElementById('moduloDetalhe').classList.remove('active'); moduloAtualId=null; }

  function salvarModulo(){
    var modelo=document.getElementById('mod-modelo').value.trim();
    var msgEl=document.getElementById('mod-msg');
    if(!modelo){ msgEl.className='uform-msg error'; msgEl.textContent='Informe o modelo do módulo.'; return; }

    var payload={
      idModulo:moduloAtualId||undefined,
      marca:document.getElementById('mod-marca').value.trim(),
      modelo:modelo,
      alturaM:document.getElementById('mod-alturaM').value,
      larguraM:document.getElementById('mod-larguraM').value,
      potenciaW:document.getElementById('mod-potenciaW').value,
      pesoKg:document.getElementById('mod-pesoKg').value,
      vocV:document.getElementById('mod-vocV').value,
      iscA:document.getElementById('mod-iscA').value
    };
    var ehNovo=!moduloAtualId;
    var idAlvo=moduloAtualId||window.SGId.gerar();
    var registroAnteriorCopia=!ehNovo?Object.assign({},modulos.filter(function(x){return String(x.IdModulo)===String(idAlvo);})[0]):null;
    var registroNovo={IdModulo:idAlvo,Marca:payload.marca,Modelo:payload.modelo,AlturaM:payload.alturaM,LarguraM:payload.larguraM,PotenciaW:payload.potenciaW,PesoKg:payload.pesoKg,VocV:payload.vocV,IscA:payload.iscA};
    var indice=modulos.findIndex(function(x){return String(x.IdModulo)===String(idAlvo);});
    if(indice===-1)modulos.push(registroNovo); else modulos[indice]=registroNovo;
    _epoca.marcar();

    moduloAtualId=idAlvo;
    document.getElementById('mod-title').textContent=payload.modelo;
    document.getElementById('mod-excluirBtn').style.display='block';
    render();
    window.SGToast.mostrar(ehNovo?'Módulo criado.':'Módulo atualizado.');

    apiCall('salvarModulo',payload).then(function(resp){
      if(!resp||!resp.ok){
        if(ehNovo)modulos=modulos.filter(function(x){return String(x.IdModulo)!==String(idAlvo);});
        else{ var idx=modulos.findIndex(function(x){return String(x.IdModulo)===String(idAlvo);}); if(idx!==-1&&registroAnteriorCopia)modulos[idx]=registroAnteriorCopia; }
        if(ehNovo)moduloAtualId=null;
        _epoca.marcar(); render();
        msgEl.className='uform-msg error'; msgEl.textContent=(resp&&resp.erro)||'Não foi possível salvar — a alteração foi desfeita.';
        return;
      }
      if(resp.idModulo&&String(resp.idModulo)!==String(idAlvo)){
        var idx2=modulos.findIndex(function(x){return String(x.IdModulo)===String(idAlvo);});
        if(idx2!==-1){ modulos[idx2].IdModulo=resp.idModulo; moduloAtualId=resp.idModulo; render(); }
      }
    }).catch(function(err){
      if(ehNovo){ modulos=modulos.filter(function(x){return String(x.IdModulo)!==String(idAlvo);}); moduloAtualId=null; }
      else{ var idx=modulos.findIndex(function(x){return String(x.IdModulo)===String(idAlvo);}); if(idx!==-1&&registroAnteriorCopia)modulos[idx]=registroAnteriorCopia; }
      _epoca.marcar(); render();
      msgEl.className='uform-msg error'; msgEl.textContent='Erro de conexão — a alteração foi desfeita: '+err.message;
    });
  }

  function excluirModulo(){
    if(!moduloAtualId)return;
    window.SGConfirm.perguntar({titulo:'Excluir módulo',mensagem:'Tem certeza que deseja excluir esse módulo do catálogo? Essa ação não pode ser desfeita.',textoConfirmar:'Excluir',perigo:true}).then(function(ok){
      if(!ok)return;
      var idAlvo=moduloAtualId;
      var registroAnterior=modulos.filter(function(x){return String(x.IdModulo)===String(idAlvo);})[0];
      modulos=modulos.filter(function(x){return String(x.IdModulo)!==String(idAlvo);});
      _epoca.marcar();
      fecharPainelModulo();
      if(window.SGViewPanel)window.SGViewPanel.fechar();
      render();
      window.SGToast.mostrar('Módulo excluído.');

      apiCall('excluirModulo',{idModulo:idAlvo,solicitanteId:(window.SG_SESSION&&window.SG_SESSION.idVendedor)||''}).then(function(resp){
        if(!resp||!resp.ok){
          if(window.SGUtil&&window.SGUtil.ehNaoEncontrado(resp&&resp.erro))return;
          if(registroAnterior)modulos.push(registroAnterior);
          _epoca.marcar(); render();
          window.SGToast.mostrar((resp&&resp.erro)||'Não foi possível excluir — restaurado.',true);
        }
      }).catch(function(err){
        if(registroAnterior)modulos.push(registroAnterior);
        _epoca.marcar(); render();
        window.SGToast.mostrar('Erro de conexão — restaurado: '+err.message,true);
      });
    });
  }

  // ── Inversores ──

  function renderMpptsConfig(){
    var wrap=document.getElementById('inv-mpptsWrap');
    if(!mpptsConfigAtual.length){ wrap.innerHTML='<div style="text-align:center;color:var(--ink-faint);font-size:12.5px;padding:10px;">Informe o número de MPPTs acima.</div>'; return; }
    wrap.innerHTML=mpptsConfigAtual.map(function(cfg,i){
      return '<div class="mppt-cfg-row" data-i="'+i+'" style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">'+
        '<span style="font-size:12px;color:var(--ink-faint);width:56px;flex:none;">MPPT '+(i+1)+'</span>'+
        '<input type="number" class="mppt-maxisc" step="0.1" placeholder="Corrente máx. (A)" value="'+(cfg.maxIsc!==undefined&&cfg.maxIsc!==null?cfg.maxIsc:'')+'" style="flex:1;font-size:12.5px;padding:7px 9px;border:1px solid var(--line);border-radius:7px;">'+
        '<input type="number" class="mppt-maxstrings" step="1" min="0" placeholder="Nº strings" value="'+(cfg.maxStrings!==undefined&&cfg.maxStrings!==null?cfg.maxStrings:'')+'" style="width:100px;font-size:12.5px;padding:7px 9px;border:1px solid var(--line);border-radius:7px;">'+
      '</div>';
    }).join('');
    wrap.querySelectorAll('.mppt-cfg-row').forEach(function(row){
      var i=parseInt(row.getAttribute('data-i'),10);
      row.querySelector('.mppt-maxisc').addEventListener('input',function(e){ mpptsConfigAtual[i].maxIsc=e.target.value; });
      row.querySelector('.mppt-maxstrings').addEventListener('input',function(e){ mpptsConfigAtual[i].maxStrings=e.target.value; });
    });
  }

  function redimensionarMpptsConfig(n){
    n=Math.max(0,parseInt(n,10)||0);
    while(mpptsConfigAtual.length<n)mpptsConfigAtual.push({maxIsc:'',maxStrings:''});
    mpptsConfigAtual.length=n;
    renderMpptsConfig();
  }

  function abrirVisualizacaoInversor(idInversor){
    var v=inversores.filter(function(x){return String(x.IdInversor)===String(idInversor);})[0];
    if(!v)return;
    var mpptsHtml=(v.mpptsConfig||[]).map(function(c,i){return '<div class="ad-row"><span class="dl">MPPT '+(i+1)+'</span><span class="dv">'+fmtNum(c.maxIsc,1)+' A · '+fmtNum(c.maxStrings,0)+' string(s)</span></div>';}).join('');
    var html='<div class="ad-section">'+
      '<div class="ad-row"><span class="dl">Potência máx. CC</span><span class="dv">'+fmtNum(v.PotenciaMaxCC_W,0)+' W</span></div>'+
      '<div class="ad-row"><span class="dl">Potência nom. CC</span><span class="dv">'+fmtNum(v.PotenciaNomCC_W,0)+' W</span></div>'+
      '<div class="ad-row"><span class="dl">Tensão entrada máxima</span><span class="dv">'+fmtNum(v.TensaoEntradaMaxV,0)+' V</span></div>'+
      '<div class="ad-row"><span class="dl">Janela MPPT</span><span class="dv">'+fmtNum(v.MpptMinV,0)+'–'+fmtNum(v.MpptMaxV,0)+' V</span></div>'+
      '<div class="ad-row"><span class="dl">Tensão mínima de partida</span><span class="dv">'+fmtNum(v.StartupV,0)+' V</span></div>'+
      '<div class="ad-row"><span class="dl">Potência ativa nominal CA</span><span class="dv">'+fmtNum(v.PotenciaAtivaNomCA_W,0)+' W</span></div>'+
      '<div class="ad-row"><span class="dl">Tensão CA nominal</span><span class="dv">'+fmtNum(v.TensaoCANominalV,0)+' V</span></div>'+
      '<div class="ad-row"><span class="dl">Corrente máxima CA</span><span class="dv">'+fmtNum(v.CorrenteMaxCA_A,1)+' A</span></div>'+
      '<div class="ad-row"><span class="dl">Fases</span><span class="dv">'+escapeHtml(FASES_LABEL[v.Fases]||v.Fases||'—')+'</span></div>'+
    '</div>'+
    '<div class="ad-section"><h4>Configuração por MPPT</h4>'+(mpptsHtml||'<div style="font-size:12.5px;color:var(--ink-faint);">Nenhum MPPT configurado.</div>')+'</div>';
    window.SGViewPanel.abrir({
      titulo:(v.Marca?v.Marca+' — ':'')+(v.Modelo||'Inversor'),
      html:html,
      onEditar:function(){ abrirPainelInversor(idInversor); },
      onExcluir:function(){ inversorAtualId=idInversor; excluirInversor(); }
    });
  }

  function abrirPainelInversor(idInversor){
    var v=idInversor?inversores.filter(function(x){return String(x.IdInversor)===String(idInversor);})[0]:null;
    inversorAtualId=idInversor||null;
    document.getElementById('inv-title').textContent=v?(v.Modelo||'Inversor'):'Novo inversor';
    document.getElementById('inv-marca').value=v?(v.Marca||''):'';
    document.getElementById('inv-modelo').value=v?(v.Modelo||''):'';
    document.getElementById('inv-potenciaMaxCC').value=v?v.PotenciaMaxCC_W:'';
    document.getElementById('inv-potenciaNomCC').value=v?v.PotenciaNomCC_W:'';
    document.getElementById('inv-tensaoEntradaMax').value=v?v.TensaoEntradaMaxV:'';
    document.getElementById('inv-startupV').value=v?v.StartupV:'';
    document.getElementById('inv-mpptMinV').value=v?v.MpptMinV:'';
    document.getElementById('inv-mpptMaxV').value=v?v.MpptMaxV:'';
    document.getElementById('inv-potenciaAtivaNomCA').value=v?v.PotenciaAtivaNomCA_W:'';
    document.getElementById('inv-tensaoCANominal').value=v?v.TensaoCANominalV:'';
    document.getElementById('inv-correnteMaxCA').value=v?v.CorrenteMaxCA_A:'';
    document.getElementById('inv-fases').value=v?(v.Fases||'Monofasico'):'Monofasico';
    document.getElementById('inv-numMppts').value=v?v.NumMppts:'';
    mpptsConfigAtual=(v&&v.mpptsConfig)?v.mpptsConfig.map(function(c){return {maxIsc:c.maxIsc,maxStrings:c.maxStrings};}):[];
    renderMpptsConfig();
    document.getElementById('inv-excluirBtn').style.display=v?'block':'none';
    document.getElementById('inv-msg').textContent='';
    document.getElementById('inversorDetalhe').classList.add('active');
  }
  function fecharPainelInversor(){ document.getElementById('inversorDetalhe').classList.remove('active'); inversorAtualId=null; }

  function salvarInversor(){
    var modelo=document.getElementById('inv-modelo').value.trim();
    var msgEl=document.getElementById('inv-msg');
    if(!modelo){ msgEl.className='uform-msg error'; msgEl.textContent='Informe o modelo do inversor.'; return; }

    var mpptsConfigPayload=mpptsConfigAtual.map(function(c){return {maxIsc:parseFloat(String(c.maxIsc||'0').replace(',','.'))||0,maxStrings:parseInt(c.maxStrings,10)||0};});
    var payload={
      idInversor:inversorAtualId||undefined,
      marca:document.getElementById('inv-marca').value.trim(),
      modelo:modelo,
      potenciaMaxCC_W:document.getElementById('inv-potenciaMaxCC').value,
      potenciaNomCC_W:document.getElementById('inv-potenciaNomCC').value,
      tensaoEntradaMaxV:document.getElementById('inv-tensaoEntradaMax').value,
      startupV:document.getElementById('inv-startupV').value,
      mpptMinV:document.getElementById('inv-mpptMinV').value,
      mpptMaxV:document.getElementById('inv-mpptMaxV').value,
      numMppts:document.getElementById('inv-numMppts').value,
      mpptsConfig:mpptsConfigPayload,
      potenciaAtivaNomCA_W:document.getElementById('inv-potenciaAtivaNomCA').value,
      tensaoCANominalV:document.getElementById('inv-tensaoCANominal').value,
      correnteMaxCA_A:document.getElementById('inv-correnteMaxCA').value,
      fases:document.getElementById('inv-fases').value
    };
    var ehNovo=!inversorAtualId;
    var idAlvo=inversorAtualId||window.SGId.gerar();
    var registroAnteriorCopia=!ehNovo?Object.assign({},inversores.filter(function(x){return String(x.IdInversor)===String(idAlvo);})[0]):null;
    var registroNovo={
      IdInversor:idAlvo,Marca:payload.marca,Modelo:payload.modelo,
      PotenciaMaxCC_W:payload.potenciaMaxCC_W,PotenciaNomCC_W:payload.potenciaNomCC_W,
      TensaoEntradaMaxV:payload.tensaoEntradaMaxV,MpptMinV:payload.mpptMinV,MpptMaxV:payload.mpptMaxV,
      StartupV:payload.startupV,NumMppts:payload.numMppts,mpptsConfig:mpptsConfigPayload,
      PotenciaAtivaNomCA_W:payload.potenciaAtivaNomCA_W,TensaoCANominalV:payload.tensaoCANominalV,
      CorrenteMaxCA_A:payload.correnteMaxCA_A,Fases:payload.fases
    };
    var indice=inversores.findIndex(function(x){return String(x.IdInversor)===String(idAlvo);});
    if(indice===-1)inversores.push(registroNovo); else inversores[indice]=registroNovo;
    _epoca.marcar();

    inversorAtualId=idAlvo;
    document.getElementById('inv-title').textContent=payload.modelo;
    document.getElementById('inv-excluirBtn').style.display='block';
    render();
    window.SGToast.mostrar(ehNovo?'Inversor criado.':'Inversor atualizado.');

    apiCall('salvarInversor',payload).then(function(resp){
      if(!resp||!resp.ok){
        if(ehNovo)inversores=inversores.filter(function(x){return String(x.IdInversor)!==String(idAlvo);});
        else{ var idx=inversores.findIndex(function(x){return String(x.IdInversor)===String(idAlvo);}); if(idx!==-1&&registroAnteriorCopia)inversores[idx]=registroAnteriorCopia; }
        if(ehNovo)inversorAtualId=null;
        _epoca.marcar(); render();
        msgEl.className='uform-msg error'; msgEl.textContent=(resp&&resp.erro)||'Não foi possível salvar — a alteração foi desfeita.';
        return;
      }
      if(resp.idInversor&&String(resp.idInversor)!==String(idAlvo)){
        var idx2=inversores.findIndex(function(x){return String(x.IdInversor)===String(idAlvo);});
        if(idx2!==-1){ inversores[idx2].IdInversor=resp.idInversor; inversorAtualId=resp.idInversor; render(); }
      }
    }).catch(function(err){
      if(ehNovo){ inversores=inversores.filter(function(x){return String(x.IdInversor)!==String(idAlvo);}); inversorAtualId=null; }
      else{ var idx=inversores.findIndex(function(x){return String(x.IdInversor)===String(idAlvo);}); if(idx!==-1&&registroAnteriorCopia)inversores[idx]=registroAnteriorCopia; }
      _epoca.marcar(); render();
      msgEl.className='uform-msg error'; msgEl.textContent='Erro de conexão — a alteração foi desfeita: '+err.message;
    });
  }

  function excluirInversor(){
    if(!inversorAtualId)return;
    window.SGConfirm.perguntar({titulo:'Excluir inversor',mensagem:'Tem certeza que deseja excluir esse inversor do catálogo? Essa ação não pode ser desfeita.',textoConfirmar:'Excluir',perigo:true}).then(function(ok){
      if(!ok)return;
      var idAlvo=inversorAtualId;
      var registroAnterior=inversores.filter(function(x){return String(x.IdInversor)===String(idAlvo);})[0];
      inversores=inversores.filter(function(x){return String(x.IdInversor)!==String(idAlvo);});
      _epoca.marcar();
      fecharPainelInversor();
      if(window.SGViewPanel)window.SGViewPanel.fechar();
      render();
      window.SGToast.mostrar('Inversor excluído.');

      apiCall('excluirInversor',{idInversor:idAlvo,solicitanteId:(window.SG_SESSION&&window.SG_SESSION.idVendedor)||''}).then(function(resp){
        if(!resp||!resp.ok){
          if(window.SGUtil&&window.SGUtil.ehNaoEncontrado(resp&&resp.erro))return;
          if(registroAnterior)inversores.push(registroAnterior);
          _epoca.marcar(); render();
          window.SGToast.mostrar((resp&&resp.erro)||'Não foi possível excluir — restaurado.',true);
        }
      }).catch(function(err){
        if(registroAnterior)inversores.push(registroAnterior);
        _epoca.marcar(); render();
        window.SGToast.mostrar('Erro de conexão — restaurado: '+err.message,true);
      });
    });
  }

  // ── Carregamento ──

  function aplicarDados(resp){
    modulos=resp.modulos||[];
    inversores=resp.inversores||[];
    document.getElementById('cat-emptyState').style.display='none';
    document.getElementById('cat-appVersion').textContent='v'+APP_VERSION;
    render();
  }

  function carregar(){
    var cache=window.SGCache&&window.SGCache.get('catalogo_tela');
    var temCache=!!(cache&&cache.dados);
    if(temCache)aplicarDados(cache.dados);
    var epocaInicio=_epoca.atual();
    apiCall('getCatalogoProdutos',{}).then(function(resp){
      if(!resp||!resp.ok){
        if(!temCache){
          document.getElementById('cat-emptyState').style.display='block';
          document.getElementById('cat-emptyState').querySelector('p').textContent=(resp&&resp.erro)||'Não foi possível carregar.';
        }
        return;
      }
      if(window.SGCache)window.SGCache.set('catalogo_tela',resp);
      if(_epoca.atual()!==epocaInicio)return;
      aplicarDados(resp);
    }).catch(function(err){
      if(!temCache){
        document.getElementById('cat-emptyState').style.display='block';
        document.getElementById('cat-emptyState').querySelector('p').textContent='Erro de conexão: '+err.message;
      }
    });
  }

  var _initialized=false;
  function init(){
    if(_initialized)return;
    if(!window.SG_SESSION)return;
    _initialized=true;
    document.getElementById('cat-tabModulos').addEventListener('click',function(){ trocarAba('modulos'); });
    document.getElementById('cat-tabInversores').addEventListener('click',function(){ trocarAba('inversores'); });
    document.getElementById('cat-novoModuloBtn').addEventListener('click',function(){ abrirPainelModulo(null); });
    document.getElementById('cat-novoInversorBtn').addEventListener('click',function(){ abrirPainelInversor(null); });
    document.getElementById('mod-fecharBtn').addEventListener('click',fecharPainelModulo);
    document.getElementById('mod-salvarBtn').addEventListener('click',salvarModulo);
    document.getElementById('mod-excluirBtn').addEventListener('click',excluirModulo);
    document.getElementById('inv-fecharBtn').addEventListener('click',fecharPainelInversor);
    document.getElementById('inv-salvarBtn').addEventListener('click',salvarInversor);
    document.getElementById('inv-excluirBtn').addEventListener('click',excluirInversor);
    document.getElementById('inv-numMppts').addEventListener('input',function(e){ redimensionarMpptsConfig(e.target.value); });
    document.getElementById('cat-buscaGeral').addEventListener('input',render);
    carregar();
  }

  window.catalogoApp={init:init};
})();


