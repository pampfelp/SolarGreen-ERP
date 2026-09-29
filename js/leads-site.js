// ════ LEADS DO SITE (2026-09-29) ════
// Liga o motor de promoção (js/leads-site-motor.js) ao ERP e mostra a tela
// "Leads do site" pros administradores. O motor roda em toda sessão logada:
// o contato do site que chegar de madrugada é promovido pra Funil na primeira
// vez que alguém abrir o ERP, sem depender de um administrador estar online.
// A tela, o KPI e a tarifa da calculadora são só do administrador.
(function(){
  var _iniciado=false, _telaConstruida=false, _lista=[], _motor=null, _detalheId=null;
  var _ultima={}, _esperando={};   // coleções auxiliares (clientes, vendedores...) já recebidas

  function db(){ return firebase.firestore(); }
  function escapeHtml(s){ return window.SGUtil.escapeHtml(s); }
  function el(id){ return document.getElementById(id); }

  // Coleção auxiliar sob demanda: só abre a escuta (via registro compartilhado,
  // crença 10) na primeira vez que um lead precisa dela. Sem lead novo, o
  // motor não custa nenhuma leitura de `clientes`.
  function obterLista(nome){
    return new Promise(function(resolve){
      if(_ultima[nome]){ resolve(_ultima[nome]); return; }
      (_esperando[nome]=_esperando[nome]||[]).push(resolve);
      if(_esperando[nome].length>1)return;
      window.SGUtil.assinarColecao(nome,function(lista){
        _ultima[nome]=lista;
        (_esperando[nome]||[]).splice(0).forEach(function(r){ r(lista); });
      });
    });
  }

  function normalizar(l){
    var c={}; Object.keys(l).forEach(function(k){ c[k]=l[k]; });
    c.criadoEmMs=l.criadoEm&&l.criadoEm.toMillis?l.criadoEm.toMillis():(l.criadoEmMs||0);
    return c;
  }

  function criarMotor(){
    function chamar(acao,payload){ return window.SGAuth.apiCall(acao,payload); }
    return window.SGLeadsSiteMotor.criar({
      db:db(),
      agora:function(){ return Date.now(); },
      sessao:function(){ return window.SG_SESSION||{}; },
      gerarId:function(){ return window.SGId.gerar(); },
      ehVendedorAtivo:function(v){ return window.SGUtil.ehVendedorAtivo(v); },   // a mesma regra do rateio de metas (js/vendas.js)
      fim8:function(t){ return window.SGUtil.ultimos8DigitosTelefone(t); },
      formatarTelefone:function(t){ return window.SGUtil.formatarTelefone(t); },
      obterClientes:function(){ return obterLista('clientes'); },
      obterVendedores:function(){ return obterLista('vendedores'); },
      obterServicos:function(){ return obterLista('servicos'); },
      obterPipelines:function(){ return obterLista('funil_pipelines'); },
      salvarCliente:function(p){ return chamar('salvarCliente',p); },
      salvarFunil:function(p){ return chamar('salvarFunil',p); },
      log:function(){ console.error.apply(console,arguments); }
    });
  }

  var ROTULO={novo:'Aguardando',processando:'Aguardando',promovido:'Promovido',duplicado:'Duplicado',suspeito:'Suspeito',erro:'Erro',descartado:'Descartado'};
  function pill(status){
    var cls=status==='promovido'?'ok':(status==='erro'?'ls-erro':((status==='novo'||status==='processando')?'incomplete':'weekend'));
    return '<span class="pill '+cls+'">'+escapeHtml(ROTULO[status]||status||'—')+'</span>';
  }
  function dataHora(ms){
    if(!ms)return '—';
    var d=new Date(ms);
    function z(n){ return String(n).padStart(2,'0'); }
    return z(d.getDate())+'/'+z(d.getMonth()+1)+' '+z(d.getHours())+':'+z(d.getMinutes());
  }
  function reais(n){ return window.SGUtil.fmtMoney(Number(n)||0); }

  function kpis(){
    var c={total:_lista.length,aguardando:0,promovido:0,duplicado:0,atencao:0};
    _lista.forEach(function(l){
      if(l.status==='novo'||l.status==='processando')c.aguardando++;
      else if(l.status==='promovido')c.promovido++;
      else if(l.status==='duplicado')c.duplicado++;
      else if(l.status==='suspeito'||l.status==='erro')c.atencao++;
    });
    el('ls-kpiTotal').textContent=c.total;
    el('ls-kpiAguardando').textContent=c.aguardando;
    el('ls-kpiPromovidos').textContent=c.promovido;
    el('ls-kpiDuplicados').textContent=c.duplicado;
    el('ls-kpiAtencao').textContent=c.atencao;
    el('ls-kpiAtencaoCard').style.outline=c.atencao?'2px solid var(--warn)':'';
  }

  function acoes(l){
    if(l.status==='suspeito')return '<button class="reset-btn" data-ls="promover" data-id="'+escapeHtml(l.id)+'">Promover</button> <button class="reset-btn" data-ls="descartar" data-id="'+escapeHtml(l.id)+'">Descartar</button>';
    if(l.status==='erro')return '<button class="reset-btn" data-ls="repetir" data-id="'+escapeHtml(l.id)+'">Tentar de novo</button>';
    if(l.status==='promovido')return '<button class="reset-btn" data-ls="funil" data-id="'+escapeHtml(l.id)+'">Ver no Funil</button>';
    return '';
  }

  function render(){
    kpis();
    var ordenada=_lista.slice().sort(function(a,b){ return (b.criadoEmMs||0)-(a.criadoEmMs||0); }).slice(0,150);
    el('ls-emptyState').style.display=ordenada.length?'none':'block';
    el('ls-tbody').innerHTML=ordenada.map(function(l){
      return '<tr data-id="'+escapeHtml(l.id)+'" style="cursor:pointer;">'+
        '<td>'+dataHora(l.criadoEmMs)+'</td>'+
        '<td>'+escapeHtml(l.nome||'—')+'</td>'+
        '<td>'+escapeHtml(window.SGUtil.formatarTelefone(l.whatsapp))+'</td>'+
        '<td>'+escapeHtml(l.cidade||l.calcCidade||'—')+'</td>'+
        '<td>'+escapeHtml(l.servico||'—')+'</td>'+
        '<td>'+(l.calcPerdaAno?escapeHtml(reais(l.calcPerdaAno))+'/ano':'—')+'</td>'+
        '<td>'+pill(l.status)+(l.status==='erro'&&l.erroPromocao?'<div style="font-size:11px;color:var(--debit);margin-top:3px;max-width:220px;">'+escapeHtml(l.erroPromocao)+'</div>':'')+'</td>'+
        '<td>'+acoes(l)+'</td></tr>';
    }).join('');
  }

  function toast(texto,erro){
    var t=el('ag-toast')||(function(){
      var e=document.createElement('div');
      e.id='ag-toast';
      e.style.cssText='position:fixed;left:14px;right:14px;bottom:14px;max-width:420px;margin:0 auto;background:var(--sidebar-bg);color:#fff;padding:13px 16px;border-radius:11px;font-size:13px;z-index:400;box-shadow:0 10px 30px rgba(0,0,0,.3);transition:opacity .2s;';
      document.body.appendChild(e);
      return e;
    })();
    t.style.background=erro?'var(--debit)':'var(--sidebar-bg)';
    t.textContent=texto;
    t.style.opacity='1';
    clearTimeout(t._t);
    t._t=setTimeout(function(){ t.style.opacity='0'; },2800);
  }
  function definirStatus(id,patch,msg){
    db().collection('leads_site').doc(id).update(patch).then(function(){
      if(msg)toast(msg);
    }).catch(function(err){ toast('Não foi possível atualizar: '+err.message,true); });
  }

  function nomeVendedor(id){
    var v=(_ultima.vendedores||[]).filter(function(x){ return String(x.IdVendedor)===String(id); })[0];
    return v?(v.Nome||id):(id||'—');
  }

  function abrirDetalhe(id){
    var l=_lista.filter(function(x){ return x.id===id; })[0];
    if(!l)return;
    _detalheId=id;
    function linha(rot,val){ return '<div class="ad-row"><span class="dl">'+escapeHtml(rot)+'</span><span class="dv">'+(val==null||val===''?'—':escapeHtml(val))+'</span></div>'; }
    var calc='';
    if(l.calcPlacas){
      calc='<div class="modal-sub" style="margin-top:14px;">Diagnóstico da calculadora</div>'+
        linha('Usina',l.calcPlacas+' placas de '+(l.calcPotenciaW||'?')+' W ('+String(l.calcKwp||'?').replace('.',',')+' kWp)')+
        linha('Cidade do cálculo',(l.calcCidade||'—')+(l.calcForaDaLista?' (fora da lista, média da região)':''))+
        linha('Desempenho estimado',l.calcDesempenho?Math.round(l.calcDesempenho*100)+'%':'—')+
        linha('Tarifa usada',l.calcTarifa?'R$ '+String(Number(l.calcTarifa).toFixed(2)).replace('.',',')+'/kWh':'—')+
        linha('Perda estimada',l.calcPerdaAno?reais(l.calcPerdaAno)+' por ano':'—');
    }
    var origem=[l.utmSource,l.utmMedium,l.utmCampaign].filter(Boolean).join(' / ');
    el('ls-detalheCorpo').innerHTML=
      linha('Recebido em',dataHora(l.criadoEmMs))+linha('Nome',l.nome)+linha('WhatsApp',window.SGUtil.formatarTelefone(l.whatsapp))+
      linha('Cidade informada',l.cidade)+linha('Serviço',l.servico)+linha('Situação',ROTULO[l.status]||l.status)+
      (l.status==='promovido'?linha('Vendedor da vez',nomeVendedor(l.idVendedor))+linha('Vendedor anterior',l.vendedorAnterior)+linha('Cliente',l.clienteJaExistia?'já cadastrado (mesmo telefone)':'novo, criado pelo site'):'')+
      (l.status==='duplicado'?linha('Repete o contato',l.duplicadoDe):'')+
      (l.erroPromocao?linha('Motivo do erro',l.erroPromocao):'')+
      calc+
      '<div class="modal-sub" style="margin-top:14px;">Origem</div>'+
      linha('Campanha',origem)+linha('Página',l.pagina)+linha('Tempo no formulário',l.tempoPreenchimentoMs?Math.round(l.tempoPreenchimentoMs/1000)+' s':'')+
      linha('Política aceita em',l.consentimentoVersao);
    el('leadSiteModal').classList.remove('hidden');
  }
  function fecharDetalhe(){ el('leadSiteModal').classList.add('hidden'); _detalheId=null; }

  function carregarTarifa(){
    db().collection('config_publica').doc('site').get().then(function(snap){
      var d=snap.exists?snap.data():{};
      el('ls-tarifa').value=d.tarifa||'';
      el('ls-tarifaMes').value=d.atualizadaEm||'';
    }).catch(function(){ /* segue sem a tarifa: o site usa a de reserva */ });
  }
  function salvarTarifa(){
    var msg=el('ls-tarifaMsg');
    var tarifa=parseFloat(el('ls-tarifa').value);
    var mes=el('ls-tarifaMes').value;
    if(!(tarifa>0)||!mes){ msg.className='uform-msg error'; msg.textContent='Informe a tarifa e o mês em que ela foi conferida.'; return; }
    var btn=el('ls-tarifaSalvar'); btn.disabled=true;
    db().collection('config_publica').doc('site').set({tarifa:tarifa,atualizadaEm:mes},{merge:true}).then(function(){
      btn.disabled=false; msg.className='uform-msg success'; msg.textContent='Salvo. A calculadora do site já usa esse valor.';
    }).catch(function(err){ btn.disabled=false; msg.className='uform-msg error'; msg.textContent='Não foi possível salvar: '+err.message; });
  }

  function construirTela(){
    if(_telaConstruida||!el('view-leadssite'))return;
    _telaConstruida=true;
    el('ls-appVersion').textContent='v'+(el('appVersionFoot')?el('appVersionFoot').textContent:'');
    el('ls-tbody').addEventListener('click',function(e){
      var b=e.target.closest('[data-ls]');
      if(b){
        e.stopPropagation();
        var id=b.getAttribute('data-id'), acao=b.getAttribute('data-ls');
        if(acao==='promover')definirStatus(id,{status:'novo',suspeito:false});
        else if(acao==='repetir')definirStatus(id,{status:'novo',erroPromocao:''});
        else if(acao==='funil'){ if(window.SGControllerSwitchTo)window.SGControllerSwitchTo('funil'); }
        else if(acao==='descartar')window.SGConfirm.perguntar({titulo:'Descartar contato',mensagem:'Descartar esse contato do site? Ele continua aqui na lista, marcado como descartado.',textoConfirmar:'Descartar',perigo:true}).then(function(ok){ if(ok)definirStatus(id,{status:'descartado'}); });
        return;
      }
      var tr=e.target.closest('tr[data-id]');
      if(tr)abrirDetalhe(tr.getAttribute('data-id'));
    });
    el('ls-detalheFechar').addEventListener('click',fecharDetalhe);
    el('leadSiteModal').addEventListener('click',function(e){ if(e.target.id==='leadSiteModal')fecharDetalhe(); });
    el('ls-tarifaSalvar').addEventListener('click',salvarTarifa);
    obterLista('vendedores');
    carregarTarifa();
    render();
  }

  // ── Funil do site (2026-09-29) ─────────────────────────────────────────
  // Kanban só com os leads que vieram do site (Origem 'Site'), pra marcar quem
  // comprou e quem não comprou. Cada "Comprou" / "Não comprou" grava
  // ConversaoSite e ConversaoEm no lead: é o dado que um dia alimenta o Pixel e a
  // API de Conversões do Facebook (ver plano do site, fase 6). Escuta só os leads
  // do site (query por Origem), nunca o funil inteiro.
  var _funilSite=[], _pipes=[], _funilTela=false, _pendenteMotivo=null;
  var MOTIVOS_NAO_COMPROU=['Preço','Sem resposta','Resolveu com outra empresa','Não precisa mais','Fora da área de atendimento','Outro'];

  function etapasOrdenadas(p){ return ((p&&p.Etapas)||[]).slice().sort(function(a,b){ return (a.Ordem||0)-(b.Ordem||0); }); }
  function pipelineDoSite(){
    var id='';
    _funilSite.forEach(function(l){ if(!id&&l.Pipeline)id=String(l.Pipeline); });
    var p=_pipes.filter(function(x){ return String(x.IdPipeline)===id; })[0];
    return p||_pipes.filter(function(x){ return (x.Etapas||[]).some(function(e){ return e.Nome==='Novo Lead'; }); })[0]||null;
  }
  function papelDe(etapas,nome){ var e=etapas.filter(function(x){ return x.Nome===nome; })[0]; return (e&&e.Papel)||''; }
  function msDoc(l){ return l.CriadoEm&&l.CriadoEm.toMillis?l.CriadoEm.toMillis():0; }

  function cartaoFunilSite(l,etapas){
    var opcoes=etapas.map(function(e){ return '<option value="'+escapeHtml(e.Nome)+'"'+(e.Nome===l.Etapa?' selected':'')+'>'+escapeHtml(e.Nome)+'</option>'; }).join('');
    var tel=window.SGUtil.formatarTelefone(l.TelefoneCliente||'');
    return '<div class="kanban-card" draggable="true" data-fs-id="'+escapeHtml(l.IdOportunidade)+'">'+
      '<div class="kcard-nome">'+escapeHtml(l.NomeCliente||'Sem nome')+'</div>'+
      '<div class="kcard-vend">'+escapeHtml(tel)+(tel?' · ':'')+escapeHtml(nomeVendedor(l.IdVendedor))+'</div>'+
      (l.VendedorAnterior?'<div style="margin-bottom:6px;"><span class="pill weekend">Antes: '+escapeHtml(l.VendedorAnterior)+'</span></div>':'')+
      '<div class="kcard-foot"><span style="font-size:11px;color:var(--ink-faint);">'+dataHora(msDoc(l))+'</span>'+
      '<select class="fs-mover" data-fs-id="'+escapeHtml(l.IdOportunidade)+'" style="font-size:11px;max-width:120px;" title="Mover para">'+opcoes+'</select></div></div>';
  }

  function renderFunilSite(){
    if(!_funilTela)return;
    var etapas=etapasOrdenadas(pipelineDoSite());
    var comprou=0,nao=0;
    _funilSite.forEach(function(l){ if(l.ConversaoSite==='comprou')comprou++; else if(l.ConversaoSite==='nao_comprou')nao++; });
    var total=_funilSite.length;
    el('fs-kpiTotal').textContent=total;
    el('fs-kpiAndamento').textContent=total-comprou-nao;
    el('fs-kpiComprou').textContent=comprou;
    el('fs-kpiNao').textContent=nao;
    el('fs-kpiTaxa').textContent=total?Math.round(comprou/total*100)+'%':'0%';
    el('fs-emptyState').style.display=etapas.length?'none':'block';
    el('fs-kanban').innerHTML=etapas.map(function(e){
      var cards=_funilSite.filter(function(l){ return l.Etapa===e.Nome; }).sort(function(a,b){ return msDoc(b)-msDoc(a); });
      return '<div class="kanban-col" data-fs-etapa="'+escapeHtml(e.Nome)+'">'+
        '<div class="kanban-col-head"><div class="kc-top"><span class="kc-dot"'+(e.Papel==='perdido'?' style="background:var(--debit);"':'')+'></span><span class="kc-nome">'+escapeHtml(e.Nome)+'</span></div>'+
        '<div class="kc-sub">'+cards.length+' lead'+(cards.length===1?'':'s')+'</div></div>'+
        '<div class="kanban-col-body">'+cards.map(function(l){ return cartaoFunilSite(l,etapas); }).join('')+'</div></div>';
    }).join('');
  }

  function gravarMovimento(l,etapa,motivo,conversao){
    var agora=new Date().toISOString();
    var conv=conversao||(l.ConversaoSite?'':undefined);
    window.SGAuth.apiCall('salvarFunil',{
      idOportunidade:l.IdOportunidade, idCliente:l.IdCliente, idVendedor:l.IdVendedor, idServico:l.IdServico||'',
      etapa:etapa, observacoes:l.Observacoes||'', valorEstimado:l['Valor Estimado']||0, motivoPerda:motivo||'',
      pipeline:l.Pipeline, conversaoSite:conv, conversaoEm:conversao?agora:(l.ConversaoSite?'':undefined)
    }).then(function(resp){
      if(!resp||!resp.ok)toast((resp&&resp.erro)||'Não foi possível mover o lead.',true);
    }).catch(function(err){ toast('Erro de conexão: '+err.message,true); });
  }

  function moverFunilSite(id,etapa){
    var l=_funilSite.filter(function(x){ return x.IdOportunidade===id; })[0];
    if(!l||l.Etapa===etapa)return;
    var papel=papelDe(etapasOrdenadas(pipelineDoSite()),etapa);
    if(papel==='perdido'){
      _pendenteMotivo={id:id,etapa:etapa};
      el('fs-motivo').innerHTML=MOTIVOS_NAO_COMPROU.map(function(m){ return '<option>'+escapeHtml(m)+'</option>'; }).join('');
      el('motivoSiteModal').classList.remove('hidden');
    }else if(papel==='ganho'){
      window.SGConfirm.perguntar({titulo:'Marcar como comprou',mensagem:'Marcar "'+(l.NomeCliente||'este lead')+'" como cliente que comprou?',textoConfirmar:'Comprou'}).then(function(ok){
        if(ok)gravarMovimento(l,etapa,'','comprou'); else renderFunilSite();
      });
    }else{
      gravarMovimento(l,etapa,'','');
    }
  }

  function construirFunilSite(){
    if(_funilTela||!el('view-funilsite'))return;
    _funilTela=true;
    var kan=el('fs-kanban');
    kan.addEventListener('change',function(e){
      var s=e.target.closest('.fs-mover');
      if(s)moverFunilSite(s.getAttribute('data-fs-id'),s.value);
    });
    kan.addEventListener('dragstart',function(e){
      var c=e.target.closest('.kanban-card');
      if(!c)return;
      e.dataTransfer.setData('text/plain',c.getAttribute('data-fs-id'));
      c.classList.add('kcard-dragging');
    });
    kan.addEventListener('dragend',function(e){
      var c=e.target.closest('.kanban-card');
      if(c)c.classList.remove('kcard-dragging');
      kan.querySelectorAll('.kanban-col-dragover').forEach(function(x){ x.classList.remove('kanban-col-dragover'); });
    });
    kan.addEventListener('dragover',function(e){
      var col=e.target.closest('.kanban-col');
      if(!col)return;
      e.preventDefault();
      kan.querySelectorAll('.kanban-col-dragover').forEach(function(x){ if(x!==col)x.classList.remove('kanban-col-dragover'); });
      col.classList.add('kanban-col-dragover');
    });
    kan.addEventListener('drop',function(e){
      var col=e.target.closest('.kanban-col');
      if(!col)return;
      e.preventDefault();
      col.classList.remove('kanban-col-dragover');
      moverFunilSite(e.dataTransfer.getData('text/plain'),col.getAttribute('data-fs-etapa'));
    });
    el('fs-motivoCancelar').addEventListener('click',function(){ _pendenteMotivo=null; el('motivoSiteModal').classList.add('hidden'); renderFunilSite(); });
    el('fs-motivoOk').addEventListener('click',function(){
      var p=_pendenteMotivo; _pendenteMotivo=null;
      el('motivoSiteModal').classList.add('hidden');
      if(!p)return;
      var l=_funilSite.filter(function(x){ return x.IdOportunidade===p.id; })[0];
      if(l)gravarMovimento(l,p.etapa,el('fs-motivo').value,'nao_comprou');
    });
    obterLista('vendedores').then(renderFunilSite);
    window.SGUtil.assinarColecao('funil',function(lista){ _funilSite=lista; renderFunilSite(); },
      {chave:'site',construirQuery:function(ref){ return ref.where('Origem','==','Site'); }});
    window.SGUtil.assinarColecao('funil_pipelines',function(lista){ _pipes=lista; renderFunilSite(); });
    renderFunilSite();
  }

  function init(){
    if(_iniciado)return;
    if(!window.SG_SESSION||!window.SGLeadsSiteMotor||!window.SGUtil||!window.SGUtil.ehVendedorAtivo)return;
    _iniciado=true;
    _motor=criarMotor();
    window.SGUtil.assinarColecao('leads_site',function(lista){
      _lista=lista.map(normalizar);
      if(_telaConstruida)render();
      try{ _motor.processar(_lista); }catch(err){ console.error('Leads do site:',err); }
    });
    if(window.SGAuth&&window.SGAuth.isAdmin()){ construirTela(); construirFunilSite(); }
  }

  window.leadsSiteApp={init:init};
})();
