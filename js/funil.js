// ════ FUNIL ════
(function(){

  var funilRecords  = [];
  var funilLogRecords = [];   // ← log de transições de etapa
  var funilSLAMap   = {};     // ← regras de SLA por etapa { etapa: { diasAmarelo, diasVermelho } }
  var vendedoresMap = {};
  var vendedoresTodosMap = {}; // sem filtro por dono — pro dropdown de atribuição
  var clientesMap   = {};
  var servicosMapFunil = {};
  var _initialized  = false;
  var _epoca=window.SGEpoca.criar();
  var sortState     = { col: 'dataProcesso', dir: 'desc' };
  var visaoAtual    = localStorage.getItem('sg_funil_visao')||'lista';
  var leadAtual     = null; // lead aberto no painel lateral (null = criando um novo)

  var ETAPAS = ['Novo Lead','Tentativa de Contato','Retomar Contato','Gerar Proposta','Negociação','Serviço Agendado','Ganho','Perdido'];

  var DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbzFCy8PyBZBODgA34xrlLTVUUNhKBIlguJT3ectH7Yus-VW1n41GcCclc5q_Yj0Di2O7g/exec';
  var DEFAULT_API_KEY = '1234';
  var API_URL_KEY = 'ponto_api_url';
  var API_KEY_KEY = 'ponto_api_key';
  var APP_VERSION = '2026-07-16-1';

  function getApiUrl(){ return (localStorage.getItem(API_URL_KEY)||'').trim()||DEFAULT_API_URL; }
  function getApiKey(){ return (localStorage.getItem(API_KEY_KEY)||'').trim()||DEFAULT_API_KEY; }

  // Delega pra SGAuth.apiCall (mesmos localStorage keys que getApiUrl/getApiKey
  // acima) — ganha injeção automática de solicitanteId (Fase A), que era
  // exatamente o que faltava nas chamadas deste módulo.
  function apiCall(action,extra){ return window.SGAuth.apiCall(action,extra); }

  // Corrige de propósito um bug real: a versão antiga fazia Math.abs(n) sem
  // devolver o sinal, então valor negativo aparecia como positivo na tela.
  function fmtMoney(n){ return window.SGUtil.fmtMoney(n); }

  function parseBRDate(str){ return window.SGUtil.parseBRDate(str); }

  // parseia data E hora para comparar logs corretamente
  function parseBRDateTime(str){
    if(!str)return null; str=str.toString().trim();
    var m=str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if(m)return new Date(+m[3],+m[2]-1,+m[1],+m[4],+m[5],m[6]?+m[6]:0);
    var m2=str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if(m2)return new Date(+m2[3],+m2[2]-1,+m2[1]);
    var d=new Date(str); return isNaN(d)?null:d;
  }

  function dateKey(d){ return window.SGUtil.dateKey(d); }
  function fmtDateBR(d){ return window.SGUtil.fmtDateBR(d); }
  function escapeHtml(s){ return window.SGUtil.escapeHtml(s); }
  function nomeFor(id){ if(!id)return'—'; var v=vendedoresMap[id]||vendedoresTodosMap[id];return(v&&(v.Nome||v.nome))||String(id).slice(0,8); }
  function nomeClienteFor(id){ if(!id)return'—';var c=clientesMap[id];return(c&&(c['Nome Razao Social']||c.Nome))||String(id).slice(0,8); }
  function telefoneClienteFor(id){ if(!id)return''; var c=clientesMap[id]; return c?(c.Telefone||''):''; }
  function copiarTelefone(tel,e){
    if(e)e.stopPropagation();
    if(!tel)return;
    var feito=function(){ (window.SGToast?window.SGToast.mostrar:function(t){})('Telefone copiado: '+tel); };
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(tel).then(feito).catch(function(){
        var ta=document.createElement('textarea');ta.value=tel;document.body.appendChild(ta);ta.select();
        try{document.execCommand('copy');feito();}catch(err){} document.body.removeChild(ta);
      });
    }else{
      var ta=document.createElement('textarea');ta.value=tel;document.body.appendChild(ta);ta.select();
      try{document.execCommand('copy');feito();}catch(err){} document.body.removeChild(ta);
    }
  }
  function nomeServicoFunil(id){ if(!id)return'—'; var s=servicosMapFunil[id]; return(s&&s['Nome Servico'])||String(id).slice(0,8); }

  // ─────────────────────────────────────────────────────────────
  // FunilLog: processa e calcula DataDoProcesso
  // ─────────────────────────────────────────────────────────────

  function processFunilLog(list){
    return list.map(function(o){
      var dt=parseBRDateTime(o.Datahora||o.DataHora||'');
      return{idOportunidade:o.IdOportunidade||'',etapaAnterior:(o.EtapaAnterior||'').trim(),etapaNova:(o.EtapaNova||'').trim(),dt:dt};
    }).filter(function(r){return !!r.dt;});
  }

  // processa regras SLA
  function processFunilSLA(list){
    var map={};
    list.forEach(function(o){
      if(!o.Etapa)return;
      map[o.Etapa.trim()]={
        diasAmarelo:parseInt(o.DiasAmarelo,10)||999,
        diasVermelho:parseInt(o.DiasVermelho,10)||999
      };
    });
    return map;
  }

  // data mais recente no log onde o lead transitou para a etapa atual.
  // Fallback: data de criação do lead.
  function computeDataProcesso(lead,logRecords){
    var matching=logRecords.filter(function(l){
      return l.idOportunidade===lead.id && l.etapaNova===lead.etapa;
    });
    if(!matching.length)return lead.dt;
    var best=matching[0];
    for(var i=1;i<matching.length;i++){if(matching[i].dt>best.dt)best=matching[i];}
    return best.dt;
  }

  // dias corridos entre dataProcesso e hoje (meia-noite para meia-noite)
  function getDiasNaEtapa(dataProcesso){
    var hoje=new Date(),hM=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate());
    var dpM=new Date(dataProcesso.getFullYear(),dataProcesso.getMonth(),dataProcesso.getDate());
    return Math.floor((hM-dpM)/(1000*60*60*24));
  }

  // cor SLA baseada nas regras da planilha
  function getSLAColor(dias,etapa){
    var regra=funilSLAMap[etapa];
    if(!regra)return'green';
    if(dias>=regra.diasVermelho)return'red';
    if(dias>=regra.diasAmarelo)return'yellow';
    return'green';
  }

  // ─────────────────────────────────────────────────────────────

  function sortLeadRows(rows){
    var col=sortState.col,dir=sortState.dir,mult=dir==='asc'?1:-1;
    rows.sort(function(a,b){
      var av,bv;
      switch(col){
        case 'data':        av=a.dt.getTime();                       bv=b.dt.getTime();                       break;
        case 'dataProcesso':av=a.dataProcesso?a.dataProcesso.getTime():0; bv=b.dataProcesso?b.dataProcesso.getTime():0; break;
        case 'dias':        av=a.diasNaEtapa;                        bv=b.diasNaEtapa;                        break;
        case 'cliente':     av=nomeClienteFor(a.idCliente);          bv=nomeClienteFor(b.idCliente);          break;
        case 'vendedor':    av=nomeFor(a.idVendedor);                bv=nomeFor(b.idVendedor);                break;
        case 'etapa':       av=a.etapa;                              bv=b.etapa;                              break;
        case 'obs':         av=a.obs;                                bv=b.obs;                                break;
        case 'valor':       av=a.valor;                              bv=b.valor;                              break;
        case 'motivoPerda': av=a.motivoPerda;                        bv=b.motivoPerda;                        break;
        default:            av=a.dataProcesso?a.dataProcesso.getTime():0; bv=b.dataProcesso?b.dataProcesso.getTime():0;
      }
      if(typeof av==='string')return mult*av.localeCompare(bv,'pt-BR');
      return mult*(av-bv);
    });
  }

  function processFunil(list){
    return list.map(function(o){
      var dt=parseBRDate(o.DataCriacao||o['Data Criacao']||o.Data||'');
      return{
        id:o.IdFunil||o.IdOportunidade,idCliente:o.IdCliente,idVendedor:o.IdVendedor,idServico:o.IdServico,
        etapa:(o.Etapa||'').trim(),obs:(o.Observacoes||o.Observacao||o.Observação||'').trim(),
        motivoPerda:(o.MotivoPerda||o['Motivo Perda']||'').trim(),dt:dt,dateKey:dt?dateKey(dt):null,
        valor:parseFloat(String((o['Valor Estimado']!==undefined&&o['Valor Estimado']!=='')?o['Valor Estimado']:(o.Valor||'0')).replace(',','.'))||0,
        etapasPassadas:o.EtapasPassadas||[],
        transicoes:o.Transicoes||[],
        // Campos calculados após enriquecimento com log/SLA
        dataProcesso:null,dataProcessoKey:null,diasNaEtapa:0,slaColor:'green',temLog:false
      };
    }).filter(function(r){return !!r.dt;});
  }

  // enriquece cada lead com dataProcesso, dataProcessoKey, diasNaEtapa e slaColor
  function enriquecerComSLA(records){
    records.forEach(function(r){
      r.dataProcesso = computeDataProcesso(r,funilLogRecords);
      r.dataProcessoKey = r.dataProcesso ? dateKey(r.dataProcesso) : r.dateKey; // ← chave usada para o filtro de período
      r.temLog = r.dataProcesso !== r.dt; // se diverge de dt, veio do log
      r.diasNaEtapa = getDiasNaEtapa(r.dataProcesso);
      r.slaColor = getSLAColor(r.diasNaEtapa,r.etapa);
    });
  }

  function updateSortHeaders(){
    document.querySelectorAll('#view-funil th.sortable').forEach(function(th){
      var col=th.getAttribute('data-sort');
      th.classList.toggle('sort-active',col===sortState.col);
      var arrow=th.querySelector('.arrow-sort');if(!arrow)return;
      arrow.textContent=(col===sortState.col)?(sortState.dir==='asc'?'▴':'▾'):'▾';
    });
  }

  function getEtapaAtiva(){ var pill=document.querySelector('.stage-pill.active');return pill?pill.getAttribute('data-stage'):'__all__'; }

  // ← CORREÇÃO: o filtro de período agora usa dataProcessoKey (data da última
  // movimentação de etapa, vinda do FunilLog) em vez de dateKey (data de
  // criação do lead). Isso replica o comportamento "Ultima Atualização" do AppSheet.
  function normalizaBuscaFunil(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function textoBuscavelLead(r){
    return normalizaBuscaFunil([
      nomeClienteFor(r.idCliente), nomeFor(r.idVendedor), nomeServicoFunil(r.idServico),
      r.etapa, r.obs, r.motivoPerda, r.dt?fmtDateBR(r.dt):''
    ].join(' | '));
  }

  /**
   * Move/criar/editar um lead atualiza dataProcessoKey pra hoje (rastreia
   * "última movimentação" pro SLA) — sem isso, se o filtro de período ativo
   * não incluir hoje, o lead recém-mexido some da tela (some de TODAS as
   * colunas, não só da antiga) até a página recarregar e o filtro padrão
   * ser recalculado. Chamar antes do render() sempre que dataProcessoKey
   * mudar por uma ação do usuário — nunca deixa a própria ação escondida.
   */
  function garantirDataVisivelNoFiltro(dataProcessoKey){
    var toEl=document.getElementById('f-dateTo'),fromEl=document.getElementById('f-dateFrom');
    if(!toEl||!fromEl||!dataProcessoKey)return;
    if(toEl.value&&dataProcessoKey>toEl.value)toEl.value=dataProcessoKey;
    if(fromEl.value&&dataProcessoKey<fromEl.value)fromEl.value=dataProcessoKey;
  }

  function getFiltered(){
    var from=document.getElementById('f-dateFrom').value,to=document.getElementById('f-dateTo').value;
    var vend=document.getElementById('f-selVendedor').value,etapa=getEtapaAtiva();
    var busca=normalizaBuscaFunil((document.getElementById('f-buscaGeral')||{}).value||'').trim();
    var allPeriod=funilRecords.filter(function(r){
      if(from&&r.dataProcessoKey<from)return false; if(to&&r.dataProcessoKey>to)return false;
      if(vend!=='__all__'&&r.idVendedor!==vend)return false;
      if(busca&&textoBuscavelLead(r).indexOf(busca)===-1)return false;
      return true;
    });
    var byStage=etapa==='__all__'?allPeriod:allPeriod.filter(function(r){return r.etapa===etapa;});
    return{allPeriod:allPeriod,byStage:byStage};
  }

  function refreshKpisAndTable(){
    var f=getFiltered(),etapa=getEtapaAtiva(),etapaLabel=etapa==='__all__'?'todas as etapas':etapa;
    var total=f.allPeriod.length,count=f.byStage.length;
    var valor=f.byStage.reduce(function(s,r){return s+r.valor;},0);
    var pct=total>0?(count/total*100):0,ticket=count>0?valor/count:0;

    document.getElementById('f-kpiLeads').textContent=count;
    document.getElementById('f-kpiLeadsSub').textContent=etapaLabel+' · '+(document.getElementById('f-dateFrom').value||'')+' a '+(document.getElementById('f-dateTo').value||'');
    document.getElementById('f-kpiValor').textContent=fmtMoney(valor);document.getElementById('f-kpiValorSub').textContent=count+' lead(s)';
    document.getElementById('f-kpiPct').textContent=pct.toFixed(1).replace('.',',')+' %';document.getElementById('f-kpiPctSub').textContent=count+' de '+total+' lead(s)';
    document.getElementById('f-kpiTicket').textContent=fmtMoney(ticket);

    var kc=document.getElementById('f-kpiEtapaCard');kc.classList.remove('won','lost','accent');
    if(etapa==='Ganho')kc.classList.add('won');else if(etapa==='Perdido')kc.classList.add('lost');else kc.classList.add('accent');

    var sorted=f.byStage.slice();sortLeadRows(sorted);
    var rows='';
    sorted.forEach(function(r){
      var badgeClass=r.etapa==='Ganho'?'ganho':(r.etapa==='Perdido'?'perdido':'ativo');
      var dpStr=r.dataProcesso?fmtDateBR(r.dataProcesso):'—';
      var dpTag=r.temLog?'<span class="dp-log-tag">log</span>':'';
      var slaHtml='<span class="sla-cell sla-'+r.slaColor+'"><span class="sla-dot"></span>'+r.diasNaEtapa+'d</span>';
      var telefone=telefoneClienteFor(r.idCliente);
      var telHtml=telefone?
        '<span class="tel-copy" title="Clique para copiar" data-tel="'+escapeHtml(telefone)+'">'+escapeHtml(telefone)+' &#128203;</span>':
        '<span style="color:var(--ink-faint);">—</span>';
      rows+=
        '<tr class="ag-row-click" data-id="'+escapeHtml(r.id)+'">'+
        '<td class="dp-date">'+dpStr+dpTag+'</td>'+
        '<td>'+slaHtml+'</td>'+
        '<td>'+escapeHtml(nomeClienteFor(r.idCliente))+'</td>'+
        '<td class="tel-cell">'+telHtml+'</td>'+
        '<td>'+escapeHtml(nomeFor(r.idVendedor))+'</td>'+
        '<td><span class="stage-badge '+badgeClass+'">'+escapeHtml(r.etapa)+'</span></td>'+
        '<td class="obs-cell" title="'+escapeHtml(r.obs)+'">'+escapeHtml(r.obs||'—')+'</td>'+
        '<td class="num">'+fmtMoney(r.valor)+'</td>'+
        '<td style="font-size:12px;color:var(--ink-soft);">'+escapeHtml(r.motivoPerda||'—')+'</td>'+
        '</tr>';
    });
    document.getElementById('f-tbody').innerHTML=rows||
      '<tr><td colspan="9" style="text-align:center;color:var(--ink-faint);padding:30px;">Nenhum lead nesta etapa/período.</td></tr>';
    document.getElementById('f-tbody').querySelectorAll('.ag-row-click').forEach(function(tr){
      tr.addEventListener('click',function(){ try{ abrirVisualizacaoLead(tr.getAttribute('data-id')); }catch(err){ console.error('abrirVisualizacaoLead falhou:',err); (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Não foi possível abrir esse registro (erro: '+err.message+'). Atualize a página e tente de novo.',true); } });
    });
    document.getElementById('f-tbody').querySelectorAll('.tel-copy').forEach(function(el){
      el.addEventListener('click',function(e){ copiarTelefone(el.getAttribute('data-tel'),e); });
    });

    renderKanban(f.allPeriod);

    document.getElementById('f-tableTitle').textContent=etapa==='__all__'?'no período':'— '+etapa;
    document.getElementById('f-tableHint').textContent=count+' lead(s) encontrado(s) · ordenado por data da última movimentação';
    var d=new Date();
    document.getElementById('f-lastUpdate').textContent='Atualizado em '+d.toLocaleDateString('pt-BR')+' às '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    return f;
  }

  /**
   * O Kanban sempre mostra TODAS as etapas como colunas (senão perderia a
   * graça de ver o funil inteiro) — mas respeita o período/vendedor
   * filtrados. Se tiver uma etapa específica marcada nos filtros, só destaca
   * aquela coluna (as outras ficam esmaecidas) em vez de escondê-las.
   */
  function renderKanban(rowsDoPeriodo){
    var wrap=document.getElementById('f-kanbanWrap');
    var etapaAtiva=getEtapaAtiva();
    var porEtapa={};
    ETAPAS.forEach(function(e){porEtapa[e]=[];});
    rowsDoPeriodo.forEach(function(r){
      if(!porEtapa[r.etapa])porEtapa[r.etapa]=[];
      porEtapa[r.etapa].push(r);
    });
    wrap.innerHTML=ETAPAS.map(function(etapa){
      var lista=(porEtapa[etapa]||[]).slice();
      lista.sort(function(a,b){return (b.dataProcesso?b.dataProcesso.getTime():0)-(a.dataProcesso?a.dataProcesso.getTime():0);});
      var valorTotal=lista.reduce(function(s,r){return s+r.valor;},0);
      var esmaecido=(etapaAtiva!=='__all__'&&etapaAtiva!==etapa)?'opacity:.4;':'';
      var cardsHtml=lista.length?lista.map(function(r){
        var slaHtml='<span class="sla-cell sla-'+r.slaColor+'"><span class="sla-dot"></span>'+r.diasNaEtapa+'d</span>';
        return '<div class="kanban-card" data-id="'+escapeHtml(r.id)+'">'+
          '<div class="kcard-nome">'+escapeHtml(nomeClienteFor(r.idCliente))+'</div>'+
          '<div class="kcard-vend">'+escapeHtml(nomeFor(r.idVendedor))+'</div>'+
          '<div class="kcard-foot"><span class="kcard-valor">'+fmtMoney(r.valor)+'</span>'+slaHtml+'</div>'+
        '</div>';
      }).join(''):'<div class="kanban-col-empty">Nenhum lead aqui.</div>';
      var corDot=etapa==='Ganho'?'#78D800':(etapa==='Perdido'?'var(--debit)':'var(--accent-deep)');
      return '<div class="kanban-col" data-etapa="'+escapeHtml(etapa)+'" style="'+esmaecido+'">'+
        '<div class="kanban-col-head"><div class="kc-top"><span class="kc-dot" style="background:'+corDot+'"></span><div class="kc-nome">'+escapeHtml(etapa)+'</div></div><div class="kc-sub">'+lista.length+' lead(s) · '+fmtMoney(valorTotal)+'</div></div>'+
        '<div class="kanban-col-body" data-etapa="'+escapeHtml(etapa)+'">'+cardsHtml+'</div>'+
      '</div>';
    }).join('');
    wrap.querySelectorAll('.kanban-card').forEach(function(card){
      card.addEventListener('click',function(){ if(Date.now()-ultimoDragKanbanTerminouEm<300)return; abrirVisualizacaoLead(card.getAttribute('data-id')); });
    });
    ativarDragDropKanban();
  }

  /**
   * Drag-and-drop do Kanban por Pointer Events — funciona com mouse, toque
   * e caneta igual (o "draggable" nativo do HTML5 nunca dispara em toque no
   * iOS/Android, então arrastar um card não fazia nada no celular). Move o
   * card seguindo o dedo/cursor com um "ghost" flutuante, destaca a coluna
   * embaixo do ponteiro, e rola o kanban horizontalmente sozinho quando o
   * card chega perto da borda — sem isso não dava pra soltar numa coluna
   * fora da tela sem arrastar em duas etapas.
   */
  var arrastarKanbanEstado=null;
  var esperaLongPressKanban=null;
  var LONG_PRESS_KANBAN_MS=380;
  var LONG_PRESS_KANBAN_TOLERANCIA=10;
  var dragDropKanbanGlobalPronto=false;
  var ultimoDragKanbanTerminouEm=0;
  var AUTOSCROLL_KANBAN_ZONA=56;
  var AUTOSCROLL_KANBAN_VEL_MAX=16;
  var autoScrollKanbanRAF=null,autoScrollKanbanWrap=null,autoScrollKanbanDir=0,autoScrollKanbanVel=0;

  function destacarColunaKanbanSobPonto(x,y){
    var elUnder=document.elementFromPoint(x,y);
    var col=elUnder?elUnder.closest('.kanban-col'):null;
    document.querySelectorAll('.kanban-col.kanban-col-dragover').forEach(function(c){ if(c!==col)c.classList.remove('kanban-col-dragover'); });
    if(col)col.classList.add('kanban-col-dragover');
    return col;
  }
  function pararAutoScrollKanban(){
    autoScrollKanbanDir=0;
    if(autoScrollKanbanRAF){ cancelAnimationFrame(autoScrollKanbanRAF); autoScrollKanbanRAF=null; }
  }
  function passoAutoScrollKanban(){
    if(!autoScrollKanbanDir||!arrastarKanbanEstado||!arrastarKanbanEstado.dragging){ autoScrollKanbanRAF=null; return; }
    autoScrollKanbanWrap.scrollLeft+=autoScrollKanbanDir*autoScrollKanbanVel;
    destacarColunaKanbanSobPonto(arrastarKanbanEstado.lastClientX,arrastarKanbanEstado.lastClientY);
    autoScrollKanbanRAF=requestAnimationFrame(passoAutoScrollKanban);
  }
  function atualizarAutoScrollKanban(clientX){
    var wrapEl=document.getElementById('f-kanbanWrap');
    if(!wrapEl){ pararAutoScrollKanban(); return; }
    var rect=wrapEl.getBoundingClientRect();
    var distEsquerda=clientX-rect.left,distDireita=rect.right-clientX;
    var dir=0,vel=0;
    if(distEsquerda<AUTOSCROLL_KANBAN_ZONA&&wrapEl.scrollLeft>0){
      dir=-1; vel=AUTOSCROLL_KANBAN_VEL_MAX*(1-Math.max(distEsquerda,0)/AUTOSCROLL_KANBAN_ZONA);
    }else if(distDireita<AUTOSCROLL_KANBAN_ZONA&&wrapEl.scrollLeft<wrapEl.scrollWidth-wrapEl.clientWidth-1){
      dir=1; vel=AUTOSCROLL_KANBAN_VEL_MAX*(1-Math.max(distDireita,0)/AUTOSCROLL_KANBAN_ZONA);
    }
    autoScrollKanbanWrap=wrapEl; autoScrollKanbanDir=dir; autoScrollKanbanVel=Math.max(vel,3);
    if(dir===0){ pararAutoScrollKanban(); return; }
    if(!autoScrollKanbanRAF)autoScrollKanbanRAF=requestAnimationFrame(passoAutoScrollKanban);
  }
  function cancelarEsperaLongPressKanban(){
    if(esperaLongPressKanban){
      clearTimeout(esperaLongPressKanban.timer);
      esperaLongPressKanban=null;
    }
  }
  function iniciarArrasteKanban(card,id,pointerId,clientX,clientY,offsetX,offsetY,width){
    arrastarKanbanEstado={
      card:card,id:id,pointerId:pointerId,
      startX:clientX,startY:clientY,
      offsetX:offsetX,offsetY:offsetY,
      width:width,dragging:true,ghost:null,
      lastClientX:clientX,lastClientY:clientY
    };
    var estado=arrastarKanbanEstado;
    estado.card.classList.add('kcard-dragging');
    try{ estado.card.setPointerCapture(pointerId); }catch(err){}
    estado.ghost=estado.card.cloneNode(true);
    estado.ghost.classList.add('kcard-ghost');
    estado.ghost.style.width=estado.width+'px';
    document.body.appendChild(estado.ghost);
    estado.ghost.style.left=(clientX-offsetX)+'px';
    estado.ghost.style.top=(clientY-offsetY)+'px';
    destacarColunaKanbanSobPonto(clientX,clientY);
  }
  function onDragKanbanPointerMove(e){
    /* Enquanto o toque ainda está no período de "pressionar e segurar" (antes do
       arraste começar de fato), qualquer movimento é intenção de rolar a coluna,
       não de arrastar — cancela a espera e deixa o navegador rolar normalmente. */
    if(esperaLongPressKanban&&esperaLongPressKanban.pointerId===e.pointerId){
      var dxE=e.clientX-esperaLongPressKanban.startX,dyE=e.clientY-esperaLongPressKanban.startY;
      if(Math.abs(dxE)>LONG_PRESS_KANBAN_TOLERANCIA||Math.abs(dyE)>LONG_PRESS_KANBAN_TOLERANCIA)cancelarEsperaLongPressKanban();
      return;
    }
    var estado=arrastarKanbanEstado;
    if(!estado||estado.pointerId!==e.pointerId)return;
    if(!estado.dragging){
      /* Só acontece com mouse: sem ambiguidade com rolagem, arrasta ao mover
         sem precisar segurar (o toque já vira arraste antes de chegar aqui). */
      var dx=e.clientX-estado.startX,dy=e.clientY-estado.startY;
      if(Math.abs(dx)<8&&Math.abs(dy)<8)return;
      estado.dragging=true;
      estado.card.classList.add('kcard-dragging');
      try{ estado.card.setPointerCapture(estado.pointerId); }catch(err){}
      estado.ghost=estado.card.cloneNode(true);
      estado.ghost.classList.add('kcard-ghost');
      estado.ghost.style.width=estado.width+'px';
      document.body.appendChild(estado.ghost);
    }
    e.preventDefault();
    estado.lastClientX=e.clientX; estado.lastClientY=e.clientY;
    estado.ghost.style.left=(e.clientX-estado.offsetX)+'px';
    estado.ghost.style.top=(e.clientY-estado.offsetY)+'px';
    destacarColunaKanbanSobPonto(e.clientX,e.clientY);
    atualizarAutoScrollKanban(e.clientX);
  }
  function onDragKanbanPointerUp(e){
    if(esperaLongPressKanban&&esperaLongPressKanban.pointerId===e.pointerId)cancelarEsperaLongPressKanban();
    var estado=arrastarKanbanEstado;
    if(!estado||estado.pointerId!==e.pointerId)return;
    arrastarKanbanEstado=null;
    pararAutoScrollKanban();
    if(!estado.dragging)return;
    var elUnder=document.elementFromPoint(e.clientX,e.clientY);
    var colFinal=elUnder?elUnder.closest('.kanban-col'):null;
    document.querySelectorAll('.kanban-col.kanban-col-dragover').forEach(function(c){ c.classList.remove('kanban-col-dragover'); });
    estado.card.classList.remove('kcard-dragging');
    ultimoDragKanbanTerminouEm=Date.now();
    if(estado.ghost&&estado.ghost.parentNode)estado.ghost.parentNode.removeChild(estado.ghost);
    if(colFinal){
      var novaEtapa=colFinal.getAttribute('data-etapa');
      if(novaEtapa)moverLeadParaEtapa(estado.id,novaEtapa);
    }
  }
  function ativarDragDropKanban(){
    if(!dragDropKanbanGlobalPronto){
      dragDropKanbanGlobalPronto=true;
      document.addEventListener('pointermove',onDragKanbanPointerMove,{passive:false});
      document.addEventListener('pointerup',onDragKanbanPointerUp);
      document.addEventListener('pointercancel',onDragKanbanPointerUp);
    }
    document.querySelectorAll('#f-kanbanWrap .kanban-card').forEach(function(card){
      card.addEventListener('pointerdown',function(e){
        if(e.pointerType==='mouse'&&e.button!==0)return;
        var rect=card.getBoundingClientRect();
        var id=card.getAttribute('data-id');
        var offsetX=e.clientX-rect.left,offsetY=e.clientY-rect.top;

        if(e.pointerType==='mouse'){
          arrastarKanbanEstado={
            card:card,id:id,pointerId:e.pointerId,
            startX:e.clientX,startY:e.clientY,
            offsetX:offsetX,offsetY:offsetY,
            width:rect.width,dragging:false,ghost:null
          };
          return;
        }

        /* Toque/caneta: só inicia o arraste depois de pressionar e segurar —
           assim um toque rápido continua rolando a coluna verticalmente. */
        cancelarEsperaLongPressKanban();
        var pointerId=e.pointerId,clientX=e.clientX,clientY=e.clientY;
        esperaLongPressKanban={
          pointerId:pointerId,startX:clientX,startY:clientY,
          timer:setTimeout(function(){
            esperaLongPressKanban=null;
            iniciarArrasteKanban(card,id,pointerId,clientX,clientY,offsetX,offsetY,rect.width);
          },LONG_PRESS_KANBAN_MS)
        };
      });
    });
  }

  /**
   * "Agora" = quantos leads estão na etapa nesse momento. "Já passaram" =
   * quantos leads têm essa etapa em etapasPassadas (acumulada via arrayUnion
   * a cada mudança — ver salvarFunil no router), incluindo os que já saíram
   * dela. "Conversão" = já passaram ÷ total de leads criados. "Tempo médio" =
   * média de dias que os leads que já passaram por ali ficaram na etapa,
   * calculado a partir de Transicoes (histórico COM horário — diferente de
   * etapasPassadas, que só marca presença sem quando).
   *
   * Novo Lead é caso especial em Agora/Já passaram/Conversão: TODO lead que
   * existe já foi "novo" uma vez, mesmo que tenha sido cadastrado direto
   * numa etapa mais adiante (ex.: fechou por WhatsApp e já entrou como
   * Serviço Agendado, sem nunca ter Etapa="Novo Lead" gravado). Contar só
   * quem passou literalmente por "Novo Lead" (etapa/etapasPassadas)
   * SUBESTIMA o denominador e infla a conversão de todo o resto do funil —
   * mesmo princípio já usado no KPI "Novos leads no funil" do Dashboard,
   * que conta por data de criação, não por etapa atual.
   *
   * Sobre a lista INTEIRA carregada, sem filtro de período/busca (relatório
   * é uma foto geral, não do recorte).
   */
  function abrirRelatorioFunil(){
    var totalCriados=funilRecords.length;
    var agoraTs=new Date();
    var tbody=document.getElementById('f-relatorioTbody');
    tbody.innerHTML=ETAPAS.map(function(etapa){
      var ehNovoLead=(etapa==='Novo Lead');
      var agora=ehNovoLead?totalCriados:funilRecords.filter(function(r){return r.etapa===etapa;}).length;
      var jaPassaram=ehNovoLead?totalCriados:funilRecords.filter(function(r){return (r.etapasPassadas||[]).indexOf(etapa)!==-1;}).length;
      var conversao=totalCriados>0?(jaPassaram/totalCriados*100):0;

      var duracoesDias=[];
      funilRecords.forEach(function(r){
        var trans=(r.transicoes||[]).slice().sort(function(a,b){return new Date(a.Em)-new Date(b.Em);});
        for(var i=0;i<trans.length;i++){
          if(trans[i].Etapa!==etapa)continue;
          var inicio=new Date(trans[i].Em);
          var fim=(i+1<trans.length)?new Date(trans[i+1].Em):agoraTs;
          duracoesDias.push((fim-inicio)/86400000);
        }
      });
      var tempoMedioTxt='—';
      if(duracoesDias.length>0){
        var media=duracoesDias.reduce(function(s,d){return s+d;},0)/duracoesDias.length;
        tempoMedioTxt=media<1?'<1d':Math.round(media)+'d';
      }

      return '<tr>'+
        '<td style="padding:8px;border-bottom:1px solid var(--line);">'+escapeHtml(etapa)+'</td>'+
        '<td style="padding:8px;border-bottom:1px solid var(--line);text-align:right;font-family:var(--mono);">'+agora+'</td>'+
        '<td style="padding:8px;border-bottom:1px solid var(--line);text-align:right;font-family:var(--mono);">'+jaPassaram+'</td>'+
        '<td style="padding:8px;border-bottom:1px solid var(--line);text-align:right;font-family:var(--mono);">'+conversao.toFixed(1).replace('.',',')+'%</td>'+
        '<td style="padding:8px;border-bottom:1px solid var(--line);text-align:right;font-family:var(--mono);">'+tempoMedioTxt+'</td>'+
      '</tr>';
    }).join('');
    document.getElementById('funilRelatorioModal').classList.remove('hidden');
  }
  function fecharRelatorioFunil(){
    document.getElementById('funilRelatorioModal').classList.add('hidden');
  }

  /**
   * Move um lead pra outra etapa arrastando no Kanban — mesmo efeito de
   * mudar a etapa pelo painel lateral (registra no FunilLog, recalcula SLA),
   * só que direto, sem precisar abrir o painel. Otimista: atualiza a tela
   * na hora, salva por trás, desfaz sozinho se o servidor recusar.
   */
  function moverLeadParaEtapa(idLead,novaEtapa){
    var indice=funilRecords.findIndex(function(x){return String(x.id)===String(idLead);});
    if(indice===-1)return;
    var leadOriginal=funilRecords[indice];
    if(leadOriginal.etapa===novaEtapa)return; // soltou na mesma coluna, não faz nada

    var registroAnterior=Object.assign({},leadOriginal);
    var agora=new Date();
    var etapasPassadasAntes=leadOriginal.etapasPassadas||[];
    var etapasPassadasNovo=etapasPassadasAntes.indexOf(novaEtapa)===-1?etapasPassadasAntes.concat([novaEtapa]):etapasPassadasAntes;
    var transicoesNovo=(leadOriginal.transicoes||[]).concat([{Etapa:novaEtapa,Em:agora.toISOString()}]);
    var registroNovo=Object.assign({},leadOriginal,{
      etapa:novaEtapa, dataProcesso:agora, dataProcessoKey:dateKey(agora),
      diasNaEtapa:0, slaColor:'green', temLog:true, etapasPassadas:etapasPassadasNovo, transicoes:transicoesNovo
    });
    funilRecords[indice]=registroNovo;
    garantirDataVisivelNoFiltro(registroNovo.dataProcessoKey);
    _epoca.marcar();
    render();
    mostrarToastFunil(nomeClienteFor(leadOriginal.idCliente)+' movido para "'+novaEtapa+'".');

    apiCall('salvarFunil',{
      idOportunidade: idLead,
      idCliente: leadOriginal.idCliente, idVendedor: leadOriginal.idVendedor,
      idServico: leadOriginal.idServico,
      etapa: novaEtapa,
      observacoes: leadOriginal.obs,
      valorEstimado: leadOriginal.valor,
      motivoPerda: leadOriginal.motivoPerda
    }).then(function(resp){
      if(!resp||!resp.ok){
        var idx=funilRecords.findIndex(function(x){return String(x.id)===String(idLead);});
        if(idx!==-1)funilRecords[idx]=registroAnterior;
        _epoca.marcar();
        render();
        mostrarToastFunil((resp&&resp.erro)||'Não foi possível mover — desfeito.',true);
      }
    }).catch(function(err){
      var idx=funilRecords.findIndex(function(x){return String(x.id)===String(idLead);});
      if(idx!==-1)funilRecords[idx]=registroAnterior;
      _epoca.marcar();
      render();
      mostrarToastFunil('Erro de conexão — desfeito: '+err.message,true);
    });
  }

  /**
   * Painel de VISUALIZAÇÃO do lead — é o que abre ao clicar numa linha da
   * tabela ou num card do Kanban. Só leitura; o lápis no topo é que chama
   * abrirPainelLead(id) pra editar de verdade, e a lixeira exclui direto.
   */
  function abrirVisualizacaoLead(idOportunidade){
    var r=funilRecords.filter(function(x){return String(x.id)===String(idOportunidade);})[0];
    if(!r)return;
    leadAtual=r;
    var c=clientesMap[r.idCliente]||{};
    var badgeClass=r.etapa==='Ganho'?'ganho':(r.etapa==='Perdido'?'perdido':'ativo');
    var html='<div class="ad-section">'+
      '<span class="stage-badge '+badgeClass+'">'+escapeHtml(r.etapa)+'</span>'+
      '<div class="ad-row" style="margin-top:10px;"><span class="dl">Cliente</span><span class="dv">'+escapeHtml(nomeClienteFor(r.idCliente))+'</span></div>'+
      (c.Telefone?'<div class="ad-row"><span class="dl">Telefone</span><span class="dv">'+escapeHtml(c.Telefone)+'</span></div>':'')+
      (c.Email?'<div class="ad-row"><span class="dl">E-mail</span><span class="dv">'+escapeHtml(c.Email)+'</span></div>':'')+
      (c.Endereco?'<div class="ad-row"><span class="dl">Endereço</span><span class="dv">'+escapeHtml(c.Endereco)+'</span></div>':'')+
      '<div class="ad-row"><span class="dl">Vendedor</span><span class="dv">'+escapeHtml(nomeFor(r.idVendedor))+'</span></div>'+
      '<div class="ad-row"><span class="dl">Serviço</span><span class="dv">'+escapeHtml(nomeServicoFunil(r.idServico))+'</span></div>'+
      '<div class="ad-row"><span class="dl">Valor estimado</span><span class="dv">'+fmtMoney(r.valor)+'</span></div>'+
      (r.motivoPerda?'<div class="ad-row"><span class="dl">Motivo da perda</span><span class="dv">'+escapeHtml(r.motivoPerda)+'</span></div>':'')+
    '</div>';
    if(r.obs){
      html+='<div class="ad-section"><h4>Observações</h4><p style="font-size:13px;color:var(--ink);line-height:1.5;">'+escapeHtml(r.obs)+'</p></div>';
    }
    html+='<div class="ad-section"><h4>Histórico</h4>'+
      '<div class="ad-row"><span class="dl">Criado em</span><span class="dv">'+(r.dt?fmtDateBR(r.dt):'—')+'</span></div>'+
      '<div class="ad-row"><span class="dl">Nessa etapa desde</span><span class="dv">'+(r.dataProcesso?fmtDateBR(r.dataProcesso):'—')+'</span></div>'+
      '<div class="ad-row"><span class="dl">Dias na etapa</span><span class="dv">'+r.diasNaEtapa+' dia(s)</span></div>'+
    '</div>';

    window.SGViewPanel.abrir({
      titulo:nomeClienteFor(r.idCliente),
      html:html,
      onEditar:function(){ abrirPainelLead(idOportunidade); },
      onExcluir:function(){ leadAtual=r; excluirLead(); }
    });
  }

  /**
   * Abre o painel lateral pra editar um lead existente (idOportunidade) ou
   * criar um novo (idOportunidade null/undefined).
   */
  function abrirPainelLead(idOportunidade){
    var r=idOportunidade?funilRecords.filter(function(x){return String(x.id)===String(idOportunidade);})[0]:null;
    leadAtual=r;

    document.getElementById('fd-title').textContent=r?nomeClienteFor(r.idCliente):'Novo lead';
    document.getElementById('fd-excluirBtn').style.display=r?'flex':'none';

    var etapasOpts=ETAPAS.map(function(e){return '<option value="'+escapeHtml(e)+'">'+escapeHtml(e)+'</option>';}).join('');

    var html='<div class="ad-section">'+
      '<div class="uform-field">'+
        '<label>Cliente <span class="req">*</span></label>'+
        '<div class="combo-with-toggle">'+
          '<div class="combo-wrap">'+
            '<input type="text" id="fd-clienteBusca" placeholder="Digite o nome do cliente…" autocomplete="off">'+
            '<input type="hidden" id="fd-cliente">'+
            '<div class="combo-dropdown hidden" id="fd-clienteDropdown"></div>'+
          '</div>'+
          '<button type="button" class="combo-toggle-btn" id="fd-clienteInfoToggle" title="Ver contato e endereço do cliente" aria-expanded="false">&#9662;</button>'+
        '</div>'+
        '<div class="cliente-info-panel hidden" id="fd-clienteInfoPanel"></div>'+
        '<button type="button" class="reset-btn" id="fd-cadastrarClienteBtn" style="width:100%;margin-top:8px;">+ Cadastrar cliente</button>'+
      '</div>'+
      '<div class="uform-field">'+
        '<label>Vendedor responsável <span class="req">*</span></label>'+
        '<div class="combo-wrap">'+
          '<input type="text" id="fd-vendedorBusca" placeholder="Digite o nome do vendedor…" autocomplete="off">'+
          '<input type="hidden" id="fd-vendedor">'+
          '<div class="combo-dropdown hidden" id="fd-vendedorDropdown"></div>'+
        '</div>'+
      '</div>'+
      '<div class="uform-field">'+
        '<label>Serviço <span class="req">*</span></label>'+
        '<div class="combo-wrap">'+
          '<input type="text" id="fd-servicoBusca" placeholder="Digite o nome do serviço…" autocomplete="off">'+
          '<input type="hidden" id="fd-servico">'+
          '<div class="combo-dropdown hidden" id="fd-servicoDropdown"></div>'+
        '</div>'+
        '<button type="button" class="reset-btn" id="fd-addServicoBtn" style="width:100%;margin-top:8px;">+ Adicionar serviço</button>'+
      '</div>'+
      '<div class="uform-field">'+
        '<label>Etapa <span class="req">*</span></label>'+
        '<select id="fd-etapa">'+etapasOpts+'</select>'+
      '</div>'+
      '<div class="uform-field" id="fd-motivoPerdaWrap" style="display:none;"><label>Motivo da perda</label><input type="text" id="fd-motivoPerda" placeholder="Ex: Contratou outra empresa"></div>'+
      '<div class="uform-field"><label>Valor estimado <span class="req">*</span></label><input type="number" id="fd-valor" step="0.01" min="0"></div>'+
      '<div class="uform-field"><label>Observações</label><textarea id="fd-obs" rows="4" style="width:100%;font-family:var(--sans);font-size:13px;border:1px solid var(--line);border-radius:7px;padding:9px 12px;background:#fff;color:var(--ink);resize:vertical;"></textarea></div>'+
    '</div>';

    if(r){
      html+='<div class="ad-section"><h4>Histórico</h4>'+
        '<div class="ad-row"><span class="dl">Criado em</span><span class="dv">'+(r.dt?fmtDateBR(r.dt):'—')+'</span></div>'+
        '<div class="ad-row"><span class="dl">Nessa etapa desde</span><span class="dv">'+(r.dataProcesso?fmtDateBR(r.dataProcesso):'—')+'</span></div>'+
        '<div class="ad-row"><span class="dl">Dias na etapa</span><span class="dv">'+r.diasNaEtapa+' dia(s)</span></div>'+
      '</div>';
    }

    document.getElementById('fd-body').innerHTML=html;
    document.getElementById('fd-cliente').value=r?(r.idCliente||''):'';
    document.getElementById('fd-clienteBusca').value=r?nomeClienteFor(r.idCliente):'';
    wireComboCliente();
    wireToggleInfoClienteFunil();
    renderInfoClienteFunil();
    document.getElementById('fd-cadastrarClienteBtn').addEventListener('click',function(){ abrirClienteRapido(); });

    window.SGCombo.criar({
      inputId:'fd-vendedorBusca', hiddenId:'fd-vendedor', dropdownId:'fd-vendedorDropdown',
      getOpcoes:function(){
        return Object.keys(vendedoresTodosMap).map(function(id){return vendedoresTodosMap[id];})
          .filter(function(v){return (v.Status||'').trim().toLowerCase()!=='inativo';})
          .sort(function(a,b){return (a.Nome||'').localeCompare(b.Nome||'','pt-BR');})
          .map(function(v){return {id:v.IdVendedor,label:v.Nome};});
      },
      valorInicial:r?{id:r.idVendedor,label:nomeFor(r.idVendedor)}:(window.SG_SESSION?{id:window.SG_SESSION.idVendedor,label:nomeFor(window.SG_SESSION.idVendedor)}:null)
    });

    function opcoesServico(){
      return Object.keys(servicosMapFunil).map(function(id){return servicosMapFunil[id];})
        .sort(function(a,b){return (a['Nome Servico']||'').localeCompare(b['Nome Servico']||'','pt-BR');})
        .map(function(s){return {id:s.IdServico,label:s['Nome Servico']||s.IdServico};});
    }
    window.SGCombo.criar({
      inputId:'fd-servicoBusca', hiddenId:'fd-servico', dropdownId:'fd-servicoDropdown',
      getOpcoes:opcoesServico,
      valorInicial:r&&r.idServico?{id:r.idServico,label:nomeServicoFunil(r.idServico)}:null,
      addBtnId:'fd-addServicoBtn',
      onAdicionar:function(){
        window.SGConfirm.pedirTexto({titulo:'Novo serviço',mensagem:'Nome do novo serviço:',textoConfirmar:'Criar'}).then(function(nome){
          if(!nome)return;
          apiCall('criarServicoRapido',{nomeServico:nome.trim()}).then(function(resp){
            if(!resp||!resp.ok){ mostrarToastFunil((resp&&resp.erro)||'Não foi possível criar o serviço.',true); return; }
            servicosMapFunil[resp.idServico]={IdServico:resp.idServico,'Nome Servico':resp.nomeServico};
            document.getElementById('fd-servico').value=resp.idServico;
            document.getElementById('fd-servicoBusca').value=resp.nomeServico;
            mostrarToastFunil('Serviço "'+resp.nomeServico+'" criado.');
          });
        });
      }
    });

    document.getElementById('fd-etapa').value=r?r.etapa:'Novo Lead';
    document.getElementById('fd-valor').value=r?(r.valor||''):'';
    document.getElementById('fd-obs').value=r?(r.obs||''):'';
    document.getElementById('fd-motivoPerda').value=r?(r.motivoPerda||''):'';
    atualizarVisibilidadeMotivoPerda();
    document.getElementById('fd-etapa').addEventListener('change',atualizarVisibilidadeMotivoPerda);

    document.getElementById('funilDetalhe').classList.add('active');
    document.getElementById('adBackdrop').classList.add('active');
  }

  /**
   * Combo de busca de cliente: digita o nome, aparece uma lista filtrada
   * embaixo, clica pra escolher. Substitui o <select> gigante de antes.
   */
  function wireComboCliente(){
    var input=document.getElementById('fd-clienteBusca');
    var hidden=document.getElementById('fd-cliente');
    var dropdown=document.getElementById('fd-clienteDropdown');

    function renderOpcoes(filtro){
      var termo=(filtro||'').trim().toLowerCase();
      var lista=Object.keys(clientesMap).map(function(id){return clientesMap[id];})
        .filter(function(c){
          if(!termo)return true;
          var nome=(c['Nome Razao Social']||c.Nome||'').toLowerCase();
          return nome.indexOf(termo)!==-1;
        })
        .sort(function(a,b){return (a['Nome Razao Social']||a.Nome||'').localeCompare(b['Nome Razao Social']||b.Nome||'','pt-BR');})
        .slice(0,60);
      if(!lista.length){
        dropdown.innerHTML='<div class="combo-empty">Nenhum cliente encontrado com esse nome.</div>';
      }else{
        dropdown.innerHTML=lista.map(function(c){
          return '<div class="combo-item" data-id="'+escapeHtml(c.IdCliente)+'" data-nome="'+escapeHtml(c['Nome Razao Social']||c.Nome||'')+'">'+escapeHtml(c['Nome Razao Social']||c.Nome||c.IdCliente)+'</div>';
        }).join('');
      }
      dropdown.classList.remove('hidden');
      dropdown.querySelectorAll('.combo-item').forEach(function(item){
        item.addEventListener('mousedown',function(e){ // mousedown (não click) pra disparar antes do blur do input
          e.preventDefault();
          hidden.value=item.getAttribute('data-id');
          input.value=item.getAttribute('data-nome');
          dropdown.classList.add('hidden');
          renderInfoClienteFunil();
        });
      });
    }
    input.addEventListener('input',function(){ hidden.value=''; renderOpcoes(input.value); renderInfoClienteFunil(); });
    input.addEventListener('focus',function(){ renderOpcoes(input.value); });
    input.addEventListener('blur',function(){ setTimeout(function(){ dropdown.classList.add('hidden'); },150); });
  }

  /**
   * Painel de contato/endereço do cliente selecionado no lead — some por
   * padrão, abre ao clicar na seta ao lado do campo Cliente. O conteúdo é
   * sempre recalculado na hora de abrir (e também é atualizado toda vez que
   * a seleção do cliente muda), então nunca fica com dado velho na tela.
   */
  function renderInfoClienteFunil(){
    var painel=document.getElementById('fd-clienteInfoPanel');
    if(!painel)return;
    var idCliente=document.getElementById('fd-cliente')?document.getElementById('fd-cliente').value:'';
    var c=idCliente?clientesMap[idCliente]:null;
    if(!c){
      painel.innerHTML='<div class="cip-row"><span class="cip-val">Selecione um cliente para ver telefone, e-mail e endereço.</span></div>';
      return;
    }
    var telefone=c.Telefone||'—';
    var email=c.Email||'—';
    var cpfCnpj=c['CPF ou CNPJ']||c.CPFEquatorial||'—';
    var endereco=c.Endereco||'—';
    painel.innerHTML=
      '<div class="cip-row"><span class="cip-label">Telefone</span><span class="cip-val">'+escapeHtml(telefone)+'</span></div>'+
      '<div class="cip-row"><span class="cip-label">E-mail</span><span class="cip-val">'+escapeHtml(email)+'</span></div>'+
      '<div class="cip-row"><span class="cip-label">CPF/CNPJ</span><span class="cip-val">'+escapeHtml(cpfCnpj)+'</span></div>'+
      '<div class="cip-row"><span class="cip-label">Endereço</span><span class="cip-val">'+escapeHtml(endereco)+'</span></div>';
  }

  function wireToggleInfoClienteFunil(){
    var btn=document.getElementById('fd-clienteInfoToggle');
    var painel=document.getElementById('fd-clienteInfoPanel');
    if(!btn||!painel||btn.dataset.wired)return;
    btn.dataset.wired='1';
    btn.addEventListener('click',function(){
      var abrindo=painel.classList.contains('hidden');
      if(abrindo)renderInfoClienteFunil();
      painel.classList.toggle('hidden',!abrindo);
      btn.classList.toggle('open',abrindo);
      btn.setAttribute('aria-expanded',abrindo?'true':'false');
    });
  }

  /**
   * Cadastro rápido de cliente — abre POR CIMA do painel do lead (que
   * continua ativo por baixo). Ao salvar ou voltar, some e o lead continua
   * de onde parou.
   */
  function abrirClienteRapido(){
    document.getElementById('cr-nome').value='';
    document.getElementById('cr-tipoPessoa').value='Física';
    document.getElementById('cr-telefone').value='';
    document.getElementById('cr-cpfCnpj').value='';
    document.getElementById('cr-email').value='';
    document.getElementById('cr-endereco').value='';
    document.getElementById('cr-msg').textContent='';
    document.getElementById('cr-avisoDuplicado').classList.add('hidden');
    document.getElementById('cr-avisoDuplicadoDetalhe').textContent='';
    document.getElementById('cr-avisoDuplicadoDetalhe').className='';
    document.getElementById('cr-avisoDuplicadoDetalhe').onclick=null;
    document.getElementById('cr-confirmarDiferente').checked=false;
    document.getElementById('cr-titularSim').checked=false;
    document.getElementById('cr-titularNao').checked=false;
    document.getElementById('cr-cpfEquatorial').value='';
    document.getElementById('cr-cpfEquatorial').readOnly=false;
    document.getElementById('cr-dataNascimentoEquatorial').value='';
    window.SGCombo.criar({
      inputId:'cr-vendedorBusca', hiddenId:'cr-vendedor', dropdownId:'cr-vendedorDropdown',
      getOpcoes:function(){
        return Object.keys(vendedoresTodosMap).map(function(id){return vendedoresTodosMap[id];})
          .filter(function(v){return (v.Status||'').trim().toLowerCase()!=='inativo';})
          .sort(function(a,b){return (a.Nome||'').localeCompare(b.Nome||'','pt-BR');})
          .map(function(v){return {id:v.IdVendedor,label:v.Nome};});
      },
      valorInicial:window.SG_SESSION?{id:window.SG_SESSION.idVendedor,label:nomeFor(window.SG_SESSION.idVendedor)}:null
    });
    document.getElementById('clienteRapidoDetalhe').classList.add('active');
  }
  function fecharClienteRapido(){
    document.getElementById('clienteRapidoDetalhe').classList.remove('active');
  }
  /**
   * Mesma ideia do módulo Clientes: verifica ao digitar, não só ao salvar —
   * a caixinha só fica visível enquanto o problema realmente existir.
   */
  function verificarDuplicidadeClienteRapido(){
    var caixa=document.getElementById('cr-avisoDuplicado');
    var detalheEl=document.getElementById('cr-avisoDuplicadoDetalhe');
    var telefone=document.getElementById('cr-telefone').value.trim();
    var endereco=document.getElementById('cr-endereco').value.trim();
    var confirmado=document.getElementById('cr-confirmarDiferente').checked;

    function esconder(){
      caixa.classList.add('hidden');
      detalheEl.textContent=''; detalheEl.className=''; detalheEl.onclick=null;
    }

    if(!telefone||endereco||confirmado){ esconder(); return null; }

    var listaClientes=Object.keys(clientesMap).map(function(id){return clientesMap[id];});
    var duplicado=window.SGUtil.encontrarClienteMesmoTelefone(telefone,listaClientes,null);
    if(!duplicado){ esconder(); return null; }

    var nomeDuplicado=duplicado['Nome Razao Social']||duplicado.Nome||'(sem nome)';
    caixa.classList.remove('hidden');
    detalheEl.className='sg-msg-fix';
    detalheEl.innerHTML='Encontrado: "'+escapeHtml(nomeDuplicado)+'" — telefone '+escapeHtml(duplicado.Telefone||'—')+' (mesmos 8 últimos dígitos). <strong>Clique aqui pra abrir esse cliente.</strong>';
    detalheEl.onclick=function(){
      if(window.clientesApp&&window.clientesApp.abrirEdicao)window.clientesApp.abrirEdicao(duplicado.IdCliente);
    };
    return duplicado;
  }

  function salvarClienteRapido(){
    var nome=document.getElementById('cr-nome').value.trim();
    var tipoPessoa=document.getElementById('cr-tipoPessoa').value;
    var telefone=document.getElementById('cr-telefone').value.trim();
    var msgEl=document.getElementById('cr-msg');
    if(!nome){ msgEl.className='uform-msg error'; msgEl.textContent='Nome é obrigatório.'; return; }
    if(!tipoPessoa){ msgEl.className='uform-msg error'; msgEl.textContent='Tipo de pessoa é obrigatório.'; return; }
    if(!telefone){ msgEl.className='uform-msg error'; msgEl.textContent='Telefone é obrigatório.'; return; }

    var cpfCnpj=document.getElementById('cr-cpfCnpj').value.trim();
    var email=document.getElementById('cr-email').value.trim();
    var endereco=document.getElementById('cr-endereco').value.trim();
    var vendedorResponsavel=document.getElementById('cr-vendedor').value||(window.SG_SESSION?window.SG_SESSION.idVendedor:'');
    var cpfEquatorial=document.getElementById('cr-cpfEquatorial').value.trim();
    var dataNascimentoEquatorialVal=document.getElementById('cr-dataNascimentoEquatorial').value;

    // Telefone repetido + endereço em branco = provável duplicata. Só deixa
    // passar se a pessoa confirmar explicitamente que é um cliente diferente.
    var confirmado=document.getElementById('cr-confirmarDiferente').checked;
    if(!endereco&&!confirmado){
      var duplicado=verificarDuplicidadeClienteRapido();
      if(duplicado){
        msgEl.className='uform-msg error'; msgEl.textContent='Já existe um contato cadastrado para esse número';
        return;
      }
    }
    document.getElementById('cr-avisoDuplicado').classList.add('hidden');

    var idCliente=window.SGId.gerar();

    // adiciona na memória local e já seleciona no lead — sem esperar o servidor
    clientesMap[idCliente]={IdCliente:idCliente,Nome:nome,'Nome Razao Social':nome,Telefone:telefone,'Tipo Pessoa':tipoPessoa,CPFEquatorial:cpfEquatorial};
    _epoca.marcar();
    document.getElementById('fd-cliente').value=idCliente;
    document.getElementById('fd-clienteBusca').value=nome;
    renderInfoClienteFunil();
    fecharClienteRapido();
    mostrarToastFunil('Cliente cadastrado.');

    apiCall('salvarCliente',{
      idCliente:idCliente,
      nome:nome, tipoPessoa:tipoPessoa, telefone:telefone,
      cpfCnpj:cpfCnpj, email:email, endereco:endereco, vendedorResponsavel:vendedorResponsavel,
      confirmarClienteDiferente:confirmado,
      cpfEquatorial:cpfEquatorial, dataNascimentoEquatorial:dataNascimentoEquatorialVal
    }).then(function(resp){
      if(!resp||!resp.ok){
        delete clientesMap[idCliente];
        // se o lead ainda estiver com esse cliente selecionado, limpa (não dá pra manter apontando pra um cliente que não existe)
        if(document.getElementById('fd-cliente')&&document.getElementById('fd-cliente').value===idCliente){
          document.getElementById('fd-cliente').value='';
          document.getElementById('fd-clienteBusca').value='';
          renderInfoClienteFunil();
        }
        mostrarToastFunil((resp&&resp.erro)||'Não foi possível cadastrar o cliente — desfeito. Selecione ou cadastre de novo.',true);
        return;
      }
      if(resp.idCliente&&String(resp.idCliente)!==String(idCliente)){
        clientesMap[resp.idCliente]=clientesMap[idCliente];
        delete clientesMap[idCliente];
        if(document.getElementById('fd-cliente')&&document.getElementById('fd-cliente').value===idCliente){
          document.getElementById('fd-cliente').value=resp.idCliente;
          renderInfoClienteFunil();
        }
      }
    }).catch(function(err){
      delete clientesMap[idCliente];
      if(document.getElementById('fd-cliente')&&document.getElementById('fd-cliente').value===idCliente){
        document.getElementById('fd-cliente').value='';
        document.getElementById('fd-clienteBusca').value='';
        renderInfoClienteFunil();
      }
      mostrarToastFunil('Erro de conexão — cadastro do cliente desfeito: '+err.message,true);
    });
  }

  function atualizarVisibilidadeMotivoPerda(){
    var etapa=document.getElementById('fd-etapa').value;
    document.getElementById('fd-motivoPerdaWrap').style.display=(etapa==='Perdido')?'block':'none';
  }

  function fecharPainelLead(){
    document.getElementById('funilDetalhe').classList.remove('active');
    document.getElementById('adBackdrop').classList.remove('active');
    leadAtual=null;
  }

  function salvarLead(){
    var idCliente=document.getElementById('fd-cliente').value;
    var idVendedor=document.getElementById('fd-vendedor').value;
    var idServico=document.getElementById('fd-servico').value;
    var etapa=document.getElementById('fd-etapa').value;
    var valor=document.getElementById('fd-valor').value;
    if(!idCliente){ mostrarToastFunil('Selecione um cliente.',true); return; }
    if(!idVendedor){ mostrarToastFunil('Selecione o vendedor responsável.',true); return; }
    if(!idServico){ mostrarToastFunil('Selecione o serviço.',true); return; }
    if(!etapa){ mostrarToastFunil('Selecione a etapa.',true); return; }
    if(!valor){ mostrarToastFunil('Informe o valor estimado.',true); return; }

    var obs=document.getElementById('fd-obs').value;
    var motivoPerda=document.getElementById('fd-motivoPerda').value;
    var ehNovo=!leadAtual;
    var id=leadAtual?leadAtual.id:window.SGId.gerar();
    var agora=new Date();

    // Guarda o estado anterior pra poder desfazer se o servidor recusar.
    var registroAnterior=leadAtual?Object.assign({},leadAtual):null;
    var indiceExistente=funilRecords.findIndex(function(x){return String(x.id)===String(id);});

    var etapaMudouLocal=!leadAtual||leadAtual.etapa!==etapa;
    var etapasPassadasAntes=(leadAtual&&leadAtual.etapasPassadas)||[];
    var etapasPassadasNovo=etapasPassadasAntes.indexOf(etapa)===-1?etapasPassadasAntes.concat([etapa]):etapasPassadasAntes;
    var transicoesAntes=(leadAtual&&leadAtual.transicoes)||[];
    var transicoesNovo=etapaMudouLocal?transicoesAntes.concat([{Etapa:etapa,Em:agora.toISOString()}]):transicoesAntes;
    var registroNovo={
      id:id, idCliente:idCliente, idVendedor:idVendedor, idServico:idServico,
      etapa:etapa, obs:obs, valor:parseFloat(valor)||0, motivoPerda:motivoPerda,
      dt:leadAtual?leadAtual.dt:agora,
      dataProcesso:agora, dataProcessoKey:dateKey(agora),
      diasNaEtapa:(leadAtual&&leadAtual.etapa===etapa)?leadAtual.diasNaEtapa:0,
      slaColor:(leadAtual&&leadAtual.etapa===etapa)?leadAtual.slaColor:'green',
      temLog:true, etapasPassadas:etapasPassadasNovo, transicoes:transicoesNovo
    };
    if(indiceExistente===-1)funilRecords.push(registroNovo);
    else funilRecords[indiceExistente]=registroNovo;
    garantirDataVisivelNoFiltro(registroNovo.dataProcessoKey);
    _epoca.marcar();

    // Já atualiza a tela, fecha o painel e avisa — sem esperar o servidor.
    fecharPainelLead();
    render();
    mostrarToastFunil(ehNovo?'Lead criado.':'Lead atualizado.');

    function desfazer(motivo){
      if(ehNovo){ funilRecords=funilRecords.filter(function(x){return String(x.id)!==String(id);}); }
      else{ var idx=funilRecords.findIndex(function(x){return String(x.id)===String(id);}); if(idx!==-1&&registroAnterior)funilRecords[idx]=registroAnterior; }
      _epoca.marcar();
      render();
      mostrarToastFunil(motivo,true);
    }

    apiCall('salvarFunil',{
      idOportunidade: id,
      idCliente: idCliente, idVendedor: idVendedor,
      idServico: idServico,
      etapa: etapa,
      observacoes: obs,
      valorEstimado: valor,
      motivoPerda: motivoPerda
    }).then(function(resp){
      if(!resp||!resp.ok){ desfazer((resp&&resp.erro)||'Não foi possível salvar — a alteração foi desfeita.'); return; }
      // Se o servidor devolveu um ID diferente do que o navegador gerou (ex:
      // implantação antiga do Code.gs que ainda ignora o ID enviado), corrige
      // o ID local na hora — senão editar/excluir esse lead depois falharia
      // com "não encontrado", porque o ID da tela não bateria com o da planilha.
      if(resp.idOportunidade&&String(resp.idOportunidade)!==String(id)){
        var idx=funilRecords.findIndex(function(x){return String(x.id)===String(id);});
        if(idx!==-1)funilRecords[idx].id=resp.idOportunidade;
        if(leadAtual&&String(leadAtual.id)===String(id))leadAtual.id=resp.idOportunidade;
        render(); // redesenha AGORA — senão a linha na tela continua com o data-id antigo
      }
      // sincroniza em segundo plano, sem interromper o usuário, pra pegar
      // dataProcesso/dias na etapa/SLA calculados de verdade a partir do log.
      setTimeout(function(){ fetchData(false); },600);
    }).catch(function(err){ desfazer('Erro de conexão — a alteração foi desfeita: '+err.message); });
  }

  function excluirLead(){
    if(!leadAtual)return;
    window.SGConfirm.perguntar({titulo:'Excluir lead',mensagem:'Excluir esse lead do funil? Essa ação não pode ser desfeita.',textoConfirmar:'Excluir',perigo:true}).then(function(ok){
      if(!ok)return;
      var id=leadAtual.id;
      var registroAnterior=Object.assign({},leadAtual);

      funilRecords=funilRecords.filter(function(x){return String(x.id)!==String(id);});
      _epoca.marcar();
      fecharPainelLead();
      if(window.SGViewPanel)window.SGViewPanel.fechar();
      render();
      mostrarToastFunil('Lead excluído.');

      apiCall('excluirFunil',{idOportunidade:id,solicitanteId:(window.SG_SESSION&&window.SG_SESSION.idVendedor)||''}).then(function(resp){
        if(!resp||!resp.ok){
          if(window.SGUtil.ehNaoEncontrado(resp&&resp.erro))return; // já não existia — exclusão continua válida
          funilRecords.push(registroAnterior); _epoca.marcar(); render();
          mostrarToastFunil((resp&&resp.erro)||'Não foi possível excluir — o lead foi restaurado.',true);
        }
      }).catch(function(err){
        funilRecords.push(registroAnterior); _epoca.marcar(); render();
        mostrarToastFunil('Erro de conexão — o lead foi restaurado: '+err.message,true);
      });
    });
  }

  function mostrarToastFunil(texto,erro){
    var el=document.getElementById('ag-toast')||(function(){
      var e=document.createElement('div');
      e.id='ag-toast';
      e.style.cssText='position:fixed;left:14px;right:14px;bottom:14px;max-width:420px;margin:0 auto;background:var(--sidebar-bg);color:#fff;padding:13px 16px;border-radius:11px;font-size:13px;z-index:200;box-shadow:0 10px 30px rgba(0,0,0,.3);transition:opacity .2s;';
      document.body.appendChild(e);
      return e;
    })();
    el.style.background=erro?'var(--debit)':'var(--sidebar-bg)';
    el.textContent=texto;
    el.style.opacity='1';
    clearTimeout(el._t);
    el._t=setTimeout(function(){ el.style.opacity='0'; },2800);
  }

  function render(){
    chartAnchorDay=null;
    var f=refreshKpisAndTable();renderChart(f.allPeriod);
  }

  // ← O gráfico agora agrupa por dataProcessoKey também, pra ficar consistente
  // com o filtro (senão apareceriam dias fora do período selecionado).
  function renderChart(records){
    var container=document.getElementById('f-chartBars');
    if(!records.length){container.innerHTML='<div class="chart-empty">Nenhum dado no período</div>';return;}
    var byDay={},minDt=null,maxDt=null;
    records.forEach(function(r){
      var k=r.dataProcessoKey,dtRef=r.dataProcesso||r.dt;
      byDay[k]=(byDay[k]||0)+1;
      if(!minDt||dtRef<minDt)minDt=dtRef;
      if(!maxDt||dtRef>maxDt)maxDt=dtRef;
    });
    var days=[],cursor=new Date(minDt.getFullYear(),minDt.getMonth(),minDt.getDate()),end=new Date(maxDt.getFullYear(),maxDt.getMonth(),maxDt.getDate());
    while(cursor<=end){var k=dateKey(cursor);days.push({k:k,label:String(cursor.getDate()).padStart(2,'0')+'/'+String(cursor.getMonth()+1).padStart(2,'0'),count:byDay[k]||0});cursor.setDate(cursor.getDate()+1);}
    var maxVal=Math.max.apply(null,days.map(function(d){return d.count;}))||1;
    var html='';
    days.forEach(function(day){
      var pct=Math.round((day.count/maxVal)*85);
      html+='<div class="chart-col" data-day="'+day.k+'" title="Clique para filtrar · Shift+clique para período"><div class="bar-fill" style="height:'+(pct||1)+'%;">'+(day.count>0?'<span class="bar-count">'+day.count+'</span>':'')+'</div><span class="bar-label">'+day.label+'</span></div>';
    });
    container.innerHTML=html;
    container.querySelectorAll('.chart-col').forEach(function(col){col.addEventListener('click',function(e){var k=col.getAttribute('data-day');if(!k)return;selectChartDay(k,e.shiftKey);});});
    highlightChartSelection();
    document.getElementById('f-chartSub').textContent=days.length+' dia(s) · '+records.length+' lead(s) · data da última movimentação';
  }

  var chartAnchorDay=null;
  function selectChartDay(dayKey,isShift){
    var fi=document.getElementById('f-dateFrom'),ti=document.getElementById('f-dateTo');
    if(isShift&&chartAnchorDay){var lo=dayKey<chartAnchorDay?dayKey:chartAnchorDay,hi=dayKey<chartAnchorDay?chartAnchorDay:dayKey;fi.value=lo;ti.value=hi;}
    else{chartAnchorDay=dayKey;fi.value=dayKey;ti.value=dayKey;}
    document.querySelectorAll('#view-funil .qr-btn[data-frange]').forEach(function(b){b.classList.remove('active');});
    refreshKpisAndTable();highlightChartSelection();
  }

  function highlightChartSelection(){
    var from=document.getElementById('f-dateFrom').value,to=document.getElementById('f-dateTo').value;
    document.querySelectorAll('#f-chartBars .chart-col').forEach(function(col){var k=col.getAttribute('data-day');col.classList.toggle('selected',!!(k&&from&&to&&k>=from&&k<=to));});
  }

  function populateVendedorSelect(){
    var sel=document.getElementById('f-selVendedor'),cur=sel.value||'__all__',ids={};
    funilRecords.forEach(function(r){if(r.idVendedor)ids[r.idVendedor]=true;});
    var list=Object.keys(ids).sort(function(a,b){return nomeFor(a).localeCompare(nomeFor(b),'pt-BR');});
    sel.innerHTML='<option value="__all__">Todos os vendedores</option>';
    list.forEach(function(id){var opt=document.createElement('option');opt.value=id;opt.textContent=nomeFor(id);sel.appendChild(opt);});
    if(list.indexOf(cur)!==-1)sel.value=cur;
  }

  // ← usa dataProcessoKey pra definir o range padrão também
  function setDefaultRange(){
    if(!funilRecords.length)return;
    var dates=funilRecords.map(function(r){return r.dataProcessoKey;}).sort();
    document.getElementById('f-dateFrom').value=dates[0];document.getElementById('f-dateTo').value=dates[dates.length-1];
  }

  function aplicarDadosFunil(resp){
    var fVendedores=window.SGAuth?window.SGAuth.filterByOwner(resp.vendedores||[],'IdVendedor'):(resp.vendedores||[]);
    var fFunil=window.SGAuth?window.SGAuth.filterByOwner(resp.funil||[],'IdVendedor'):(resp.funil||[]);
    vendedoresMap={};fVendedores.forEach(function(v){if(v.IdVendedor)vendedoresMap[v.IdVendedor]=v;});
    // Sem filtro por dono — usado só pro dropdown "atribuir a" no painel de edição,
    // já que qualquer vendedor pode passar um lead pra outro colega.
    vendedoresTodosMap={};(resp.vendedores||[]).forEach(function(v){if(v.IdVendedor)vendedoresTodosMap[v.IdVendedor]=v;});
    clientesMap={};(resp.clientes||[]).forEach(function(c){if(c.IdCliente)clientesMap[c.IdCliente]=c;});
    servicosMapFunil={};(resp.servicos||[]).forEach(function(s){if(s.IdServico)servicosMapFunil[s.IdServico]=s;});

    // carrega log e SLA antes de processar os leads
    funilLogRecords = processFunilLog(resp.funilLog||[]);
    funilSLAMap     = processFunilSLA(resp.funilSLA||[]);

    funilRecords=processFunil(fFunil);
    enriquecerComSLA(funilRecords); // calcula dataProcesso/dataProcessoKey/dias/slaColor

    populateVendedorSelect();setDefaultRange();
    document.getElementById('f-emptyState').style.display='none';document.getElementById('f-mainContent').style.display='block';
    document.getElementById('f-appVersion').textContent='v'+APP_VERSION;
    render();
  }

  function fetchData(showStatus){
    var cache=window.SGCache&&window.SGCache.get('funil');
    var temCache=!!(cache&&cache.dados);
    if(temCache)aplicarDadosFunil(cache.dados);
    var epocaInicio=_epoca.atual();
    apiCall('getFunilData').then(function(resp){
      if(!resp||!resp.ok){if(showStatus&&!temCache)window.SGToast.mostrar((resp&&resp.erro)||'Não foi possível conectar.',true);return;}
      if(window.SGCache)window.SGCache.set('funil',resp);
      if(_epoca.atual()!==epocaInicio)return;
      aplicarDadosFunil(resp);
    }).catch(function(err){if(showStatus&&!temCache)window.SGToast.mostrar('Erro: '+err.message,true);});
  }

  function init(){
    if(_initialized)return;
    if(!window.SG_SESSION)return;
    _initialized=true;
    document.getElementById('f-appVersion').textContent='v'+APP_VERSION;
    document.getElementById('f-dateFrom').addEventListener('change',render);
    document.getElementById('f-dateTo').addEventListener('change',render);
    document.getElementById('f-selVendedor').addEventListener('change',render);
    document.getElementById('f-buscaGeral').addEventListener('input',render);
    document.getElementById('f-resetFiltros').addEventListener('click',function(){
      document.getElementById('f-selVendedor').value='__all__';document.getElementById('f-buscaGeral').value='';setDefaultRange();
      document.querySelectorAll('.stage-pill').forEach(function(p){p.classList.remove('active');});
      document.querySelector('.stage-pill[data-stage="__all__"]').classList.add('active');
      document.querySelectorAll('.qr-btn[data-frange]').forEach(function(b){b.classList.remove('active');});render();
    });
    document.querySelectorAll('#view-funil th.sortable').forEach(function(th){
      th.addEventListener('click',function(){
        var col=th.getAttribute('data-sort');
        if(sortState.col===col){sortState.dir=sortState.dir==='asc'?'desc':'asc';}
        else{sortState.col=col;sortState.dir=(['cliente','vendedor','etapa','obs','motivoPerda'].indexOf(col)!==-1)?'asc':'desc';}
        updateSortHeaders();render();
      });
    });
    updateSortHeaders();
    document.querySelectorAll('.stage-pill').forEach(function(pill){
      pill.addEventListener('click',function(){document.querySelectorAll('.stage-pill').forEach(function(p){p.classList.remove('active');});pill.classList.add('active');render();});
    });
    document.querySelectorAll('.qr-btn[data-frange]').forEach(function(btn){
      btn.addEventListener('click',function(){
        document.querySelectorAll('.qr-btn[data-frange]').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');
        var range=btn.getAttribute('data-frange'),now=new Date();
        function dk(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
        if(range==='all'){setDefaultRange();}else if(range==='month'){document.getElementById('f-dateFrom').value=dk(new Date(now.getFullYear(),now.getMonth(),1));document.getElementById('f-dateTo').value=dk(new Date(now.getFullYear(),now.getMonth()+1,0));}else{var n=parseInt(range,10),from=new Date(now);from.setDate(from.getDate()-(n-1));document.getElementById('f-dateFrom').value=dk(from);document.getElementById('f-dateTo').value=dk(now);}
        render();
      });
    });
    function aplicarVisao(){
      var listaAtiva=visaoAtual==='lista';
      document.getElementById('f-listaWrap').style.display=listaAtiva?'block':'none';
      document.getElementById('f-kanbanWrap').style.display=listaAtiva?'none':'flex';
      document.getElementById('f-viewLista').classList.toggle('active',listaAtiva);
      document.getElementById('f-viewKanban').classList.toggle('active',!listaAtiva);
    }
    aplicarVisao();
    document.getElementById('f-viewLista').addEventListener('click',function(){ visaoAtual='lista'; localStorage.setItem('sg_funil_visao','lista'); aplicarVisao(); });
    document.getElementById('f-viewKanban').addEventListener('click',function(){ visaoAtual='kanban'; localStorage.setItem('sg_funil_visao','kanban'); aplicarVisao(); });

    document.getElementById('f-novoLeadBtn').addEventListener('click',function(){ abrirPainelLead(null); });
    document.getElementById('f-relatorioBtn').addEventListener('click',abrirRelatorioFunil);
    document.getElementById('f-relatorioFecharBtn').addEventListener('click',fecharRelatorioFunil);
    document.getElementById('funilRelatorioModal').addEventListener('click',function(e){ if(e.target.id==='funilRelatorioModal')fecharRelatorioFunil(); });
    document.getElementById('fd-fecharBtn').addEventListener('click',fecharPainelLead);
    document.getElementById('fd-salvarBtn').addEventListener('click',salvarLead);
    document.getElementById('fd-excluirBtn').addEventListener('click',excluirLead);
    document.getElementById('cr-fecharBtn').addEventListener('click',fecharClienteRapido);
    document.getElementById('cr-salvarBtn').addEventListener('click',salvarClienteRapido);
    // Máscara sempre ligada ANTES dos listeners abaixo — assim, quando "Sim"
    // copia o valor pro campo Equatorial, já copia formatado.
    window.SGUtil.aplicarMascara(document.getElementById('cr-telefone'),window.SGUtil.formatarTelefone);
    window.SGUtil.aplicarMascara(document.getElementById('cr-cpfCnpj'),window.SGUtil.formatarCpfCnpj);
    window.SGUtil.aplicarMascara(document.getElementById('cr-cpfEquatorial'),window.SGUtil.formatarCpfCnpj);
    document.getElementById('cr-titularSim').addEventListener('change',function(){
      document.getElementById('cr-cpfEquatorial').value=document.getElementById('cr-cpfCnpj').value;
      document.getElementById('cr-cpfEquatorial').readOnly=true;
    });
    document.getElementById('cr-titularNao').addEventListener('change',function(){
      document.getElementById('cr-cpfEquatorial').readOnly=false;
    });
    document.getElementById('cr-cpfCnpj').addEventListener('input',function(){
      if(document.getElementById('cr-titularSim').checked)document.getElementById('cr-cpfEquatorial').value=this.value;
    });
    document.getElementById('cr-telefone').addEventListener('input',verificarDuplicidadeClienteRapido);
    document.getElementById('cr-endereco').addEventListener('input',verificarDuplicidadeClienteRapido);
    document.getElementById('cr-confirmarDiferente').addEventListener('change',verificarDuplicidadeClienteRapido);
    document.getElementById('adBackdrop').addEventListener('click',function(){
      // se o cadastro rápido de cliente estiver aberto por cima, fecha só ele
      // (o lead continua aberto por baixo); senão, fecha o painel do lead.
      if(document.getElementById('clienteRapidoDetalhe').classList.contains('active')){ fecharClienteRapido(); return; }
      fecharPainelLead();
    });

    fetchData(true);
  }

  /**
   * Chamado por outros módulos (hoje só Clientes) quando um cliente é salvo
   * em outro lugar, pra manter o cache local em dia sem precisar recarregar
   * a tela inteira.
   */
  function atualizarClienteCache(clienteObj){
    if(!clienteObj||!clienteObj.IdCliente)return;
    clientesMap[clienteObj.IdCliente]=clienteObj;
    // se o painel de contato/endereço do lead tiver esse cliente aberto na hora, atualiza na tela também
    var fdCliente=document.getElementById('fd-cliente');
    if(fdCliente&&fdCliente.value===clienteObj.IdCliente&&typeof renderInfoClienteFunil==='function')renderInfoClienteFunil();
    // redesenha a lista/kanban na hora — sem isso, o nome só aparecia certo
    // depois de recarregar a tela inteira, mesmo já tendo o dado certo em memória.
    if(_initialized)render();
  }

  window.funilApp={init:init,atualizarClienteCache:atualizarClienteCache};

})();


