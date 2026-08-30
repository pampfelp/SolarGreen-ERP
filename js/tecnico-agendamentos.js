// ════ APP DO TÉCNICO ════
(function(){
  var session=SGAuth.getSession();
  if(!session)return; // tela de login já cuida disso

  var agendamentos=[],clientesMap={},vendedoresMap={},servicosMap={},templatesPorServico={},templatesPorId={},templatesTodos=[],respostasMap={};
  var statusFiltro=null; // null = todos
  var rangeFiltro='all';
  var servicoFiltro='',vendedorFiltro=''; // '' = todos
  var agendamentoAtual=null;
  var paginaAtual=1;
  var ITENS_POR_PAGINA=10;
  var respostasCarregadasPara={}; // idAgendamento -> true, já buscou respostas desse
  var carregandoPagina=false;
  var paginaGeracaoAtual=0;

  function escapeHtml(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}

  /**
   * A coluna "Obrigatorio" da aba Templates é uma caixa de seleção (checkbox)
   * do Google Sheets — o Apps Script lê isso como um BOOLEANO true/false, não
   * como o texto "VERDADEIRO"/"FALSO" que aparece na planilha. Essa função
   * reconhece os dois formatos, pra nunca depender de qual dos dois vier.
   */
  function isObrigatorio(valor){
    if(valor===true)return true;
    if(valor===false||valor===undefined||valor===null||valor==='')return false;
    var s=String(valor).trim().toUpperCase();
    return s==='VERDADEIRO'||s==='TRUE'||s==='SIM'||s==='1';
  }
  function statusSlug(s){return (s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'-');}
  function statusLabelDisplay(status){
    var s=(status||'').trim();
    if(s==='Agendado')return 'Pendente';
    if(s==='Em Andamento')return 'Em Andamento';
    return s||'Pendente';
  }
  function parseBRDate(str){
    if(!str)return null; str=String(str).trim();
    var m=str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if(m)return new Date(parseInt(m[3],10),parseInt(m[2],10)-1,parseInt(m[1],10));
    // Evita o bug clássico de fuso horário: "2026-08-22" não pode virar
    // `new Date(str)` direto (isso parseia como UTC meia-noite e, no fuso
    // do Brasil, exibe o dia anterior) — ver segundo-cerebro/padroes/
    // javascript-patterns.md (parseDataLocal).
    var iso=str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso)return new Date(parseInt(iso[1],10),parseInt(iso[2],10)-1,parseInt(iso[3],10));
    var d=new Date(str); return isNaN(d.getTime())?null:d;
  }
  function dateKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function fmtDataCurta(d){return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');}

  function showToast(texto,isError){
    var t=document.getElementById('toast');
    t.textContent=texto;
    t.className='toast'+(isError?' error':'');
    clearTimeout(t._timer);
    t._timer=setTimeout(function(){ t.classList.add('hidden'); },2600);
  }

  function nomeCliente(id){var c=clientesMap[id];return c?(c['Nome Razao Social']||c.Nome||id):id||'—';}
  function nomeVendedor(id){var v=vendedoresMap[id];return v?(v.Nome||id):id||'—';}
  function nomeServico(id){var s=servicosMap[id];return s?(s['Nome Servico']||id):id||'—';}
  function nomeVendedorDoCliente(idCliente){
    var c=clientesMap[idCliente];
    var idVend=c&&c['Vendedor Responsavel'];
    return idVend?nomeVendedor(idVend):'—';
  }

  // ── Lista ──

  function contagens(){
    var c={'Agendado':0,'Em Andamento':0,'Concluído':0,'Cancelado':0};
    // Os KPIs contam dentro do que já está filtrado por data/serviço/vendedor
    // (tudo, menos o próprio status — já que é isso que estamos contando).
    agendamentos.forEach(function(a){
      if(!passaRange(a))return;
      if(servicoFiltro&&String(a.IdServico)!==servicoFiltro)return;
      if(vendedorFiltro){
        var cliente=clientesMap[a.IdCliente];
        var idVend=cliente&&cliente['Vendedor Responsavel'];
        if(String(idVend)!==vendedorFiltro)return;
      }
      var st=(a['Status Agendamento']||'Agendado').trim();
      if(c[st]!==undefined)c[st]++;
    });
    return c;
  }

  function passaRange(a){
    if(rangeFiltro==='all')return true;
    var dt=parseBRDate(a['Data Inicio']); if(!dt)return false;
    var hoje=new Date(); hoje.setHours(0,0,0,0);
    var dk=dateKey(dt),dkHoje=dateKey(hoje);
    if(rangeFiltro==='today')return dk===dkHoje;
    if(rangeFiltro==='week'){
      var fimSemana=new Date(hoje); fimSemana.setDate(fimSemana.getDate()+7);
      return dt.getTime()>=hoje.getTime()&&dt.getTime()<=fimSemana.getTime();
    }
    return true;
  }

  function getFiltrados(){
    return agendamentos.filter(function(a){
      if(statusFiltro&&(a['Status Agendamento']||'Agendado').trim()!==statusFiltro)return false;
      if(!passaRange(a))return false;
      if(servicoFiltro&&String(a.IdServico)!==servicoFiltro)return false;
      if(vendedorFiltro){
        var cliente=clientesMap[a.IdCliente];
        var idVend=cliente&&cliente['Vendedor Responsavel'];
        if(String(idVend)!==vendedorFiltro)return false;
      }
      return true;
    }).sort(function(a,b){
      var da=parseBRDate(a['Data Inicio']),db=parseBRDate(b['Data Inicio']);
      var diaA=da?da.getTime():0,diaB=db?db.getTime():0;
      if(diaA!==diaB)return diaB-diaA;
      // Mesmo dia: desempata por Hora Fim decrescente — mesmo critério do
      // painel admin (js/agendamentos.js).
      return String(b['Hora Fim']||'').localeCompare(String(a['Hora Fim']||''));
    });
  }

  function renderKPIs(){
    var c=contagens();
    document.getElementById('kn-agendado').textContent=c['Agendado'];
    document.getElementById('kn-em-andamento').textContent=c['Em Andamento'];
    document.getElementById('kn-concluido').textContent=c['Concluído'];
    document.getElementById('kn-cancelado').textContent=c['Cancelado'];
  }

  function fotoFachadaUrl(a){
    // Busca em TODOS os serviços, não só no atual — assim a foto continua
    // aparecendo mesmo se o agendamento mudar de serviço depois.
    var tpls=templatesTodos.filter(function(t){
      return (t.TipoInput||'').trim()==='Foto' && /fachada/i.test(t.TextoPergunta||'');
    });
    for(var i=0;i<tpls.length;i++){
      var r=respostasMap[a.IdAgendamento+'|'+tpls[i].IdTemplate];
      if(r&&r.RespostaFoto&&/^(https?:|data:image)/.test(r.RespostaFoto))return r.RespostaFoto;
    }
    return null;
  }

  function carregarRespostasParaIds(ids){
    var faltando=ids.filter(function(id){return !respostasCarregadasPara[id];});
    if(!faltando.length)return Promise.resolve();
    return SGAuth.apiCall('getRespostasAgendamentos',{solicitanteId:session.idVendedor,idsAgendamentos:faltando}).then(function(resp){
      if(resp&&resp.ok){
        (resp.respostas||[]).forEach(function(r){ respostasMap[r.IdAgendamento+'|'+r.IdTemplate]=r; });
        // Marca como carregado assim que a resposta chega — fica em cache de
        // verdade (não busca de novo ao voltar pra essa página/OS). Se alguma
        // foto específica não resolveu (link antigo quebrado/arquivo sumiu do
        // Drive), ela continua mostrando o aviso — o técnico corrige tocando
        // em "editar" nela, sem precisar que o app fique tentando de novo
        // sozinho toda hora (isso é o que deixava tudo lento sempre).
        faltando.forEach(function(id){ respostasCarregadasPara[id]=true; });
      }else{
        // NÃO marca como carregado — assim tenta de novo na próxima vez (reabrir, trocar de página, etc.)
        showToast((resp&&resp.erro)||'Não foi possível carregar as respostas dessa página.',true);
      }
    }).catch(function(err){
      showToast('Erro de conexão ao buscar respostas: '+err.message,true);
    });
  }

  function renderPaginacao(totalPaginas){
    var el=document.getElementById('paginacao');
    if(!el)return;
    if(totalPaginas<=1){ el.innerHTML=''; return; }
    el.innerHTML=
      '<button type="button" id="pg-anterior" '+(paginaAtual<=1?'disabled':'')+'>‹ Anterior</button>'+
      '<span class="pg-info">Página '+paginaAtual+' de '+totalPaginas+'</span>'+
      '<button type="button" id="pg-proxima" '+(paginaAtual>=totalPaginas?'disabled':'')+'>Próxima ›</button>';
    var btnAnt=document.getElementById('pg-anterior');
    if(btnAnt)btnAnt.addEventListener('click',function(){ if(paginaAtual>1){ paginaAtual--; renderLista(); window.scrollTo(0,0); } });
    var btnProx=document.getElementById('pg-proxima');
    if(btnProx)btnProx.addEventListener('click',function(){ if(paginaAtual<totalPaginas){ paginaAtual++; renderLista(); window.scrollTo(0,0); } });
  }

  function renderLista(){
    var filtrados=getFiltrados();
    var wrap=document.getElementById('list-items'),empty=document.getElementById('list-empty');

    if(!filtrados.length){
      wrap.innerHTML='';
      renderPaginacao(0);
      empty.classList.remove('hidden');
      empty.querySelector('p').textContent='Nenhuma ordem de serviço nesse filtro.';
      return;
    }

    var totalPaginas=Math.max(1,Math.ceil(filtrados.length/ITENS_POR_PAGINA));
    if(paginaAtual>totalPaginas)paginaAtual=totalPaginas;
    if(paginaAtual<1)paginaAtual=1;

    var inicio=(paginaAtual-1)*ITENS_POR_PAGINA;
    var pagina=filtrados.slice(inicio,inicio+ITENS_POR_PAGINA);
    var idsDaPagina=pagina.map(function(a){return a.IdAgendamento;});
    var minhaGeracao=++paginaGeracaoAtual; // evita corrida se o usuário trocar de página rápido

    empty.classList.add('hidden');

    // Mostra a lista JÁ, sem esperar nada do Drive — nome, serviço, data, status
    // não dependem de foto nenhuma. As miniaturas de fachada entram depois,
    // por cima, assim que (e se) a busca de respostas dessa página terminar.
    desenharCards(pagina);
    renderPaginacao(totalPaginas);

    var precisaBuscar=idsDaPagina.some(function(id){return !respostasCarregadasPara[id];});
    if(precisaBuscar){
      carregarRespostasParaIds(idsDaPagina).then(function(){
        if(minhaGeracao!==paginaGeracaoAtual)return; // usuário já saiu dessa página, não redesenha à toa
        desenharCards(pagina); // agora com as miniaturas de fachada que já resolveram
      });
    }
  }

  function desenharCards(pagina){
    var wrap=document.getElementById('list-items');
    wrap.innerHTML=pagina.map(function(a){
      var dt=parseBRDate(a['Data Inicio']);
      var status=(a['Status Agendamento']||'Agendado').trim();
      var cliente=clientesMap[a.IdCliente]||{};
      var contato=cliente.Telefone||'—';
      var fachadaUrl=fotoFachadaUrl(a);
      return '<div class="os-card st-'+statusSlug(status)+'" data-id="'+escapeHtml(a.IdAgendamento)+'">'+
        (fachadaUrl?'<img class="os-thumb" src="'+escapeHtml(fachadaUrl)+'" alt="fachada">':'')+
        '<div class="os-left">'+
          '<div class="oc-nome">'+escapeHtml(nomeCliente(a.IdCliente))+'</div>'+
          '<div class="oc-serv">'+escapeHtml(nomeServico(a.IdServico))+'</div>'+
          '<div class="oc-vend">Vendedor: '+escapeHtml(nomeVendedorDoCliente(a.IdCliente))+'</div>'+
          '<div class="oc-vend">Contato Cliente: '+escapeHtml(contato)+'</div>'+
        '</div>'+
        '<div class="os-right">'+
          '<div class="oc-data">'+(dt?fmtDataCurta(dt):'—')+'</div>'+
          '<div class="oc-hora">'+escapeHtml((a['Hora inicio']||'—')+'–'+(a['Hora Fim']||'—'))+'</div>'+
          '<div class="os-status-badge st-'+statusSlug(status)+'">'+escapeHtml(statusLabelDisplay(status))+'</div>'+
        '</div>'+
      '</div>';
    }).join('');
    wrap.querySelectorAll('.os-card').forEach(function(card){
      card.addEventListener('click',function(){ abrirDetalhe(card.getAttribute('data-id')); });
    });
  }

  document.querySelectorAll('.kpi-card').forEach(function(card){
    card.addEventListener('click',function(){
      var status=card.getAttribute('data-status');
      if(statusFiltro===status){
        statusFiltro=null;
        document.querySelectorAll('.kpi-card').forEach(function(c){c.classList.remove('active');});
      }else{
        statusFiltro=status;
        document.querySelectorAll('.kpi-card').forEach(function(c){c.classList.remove('active');});
        card.classList.add('active','st-'+statusSlug(status));
      }
      paginaAtual=1;
      renderLista();
    });
  });

  document.querySelectorAll('.qchip').forEach(function(chip){
    chip.addEventListener('click',function(){
      document.querySelectorAll('.qchip').forEach(function(c){c.classList.remove('active');});
      chip.classList.add('active');
      rangeFiltro=chip.getAttribute('data-range');
      paginaAtual=1;
      renderKPIs();
      renderLista();
    });
  });

  document.getElementById('btn-refresh').addEventListener('click',function(){ carregar(); });
  var btnAbrirDim=document.getElementById('btn-abrir-dimensionamento');
  if(btnAbrirDim)btnAbrirDim.addEventListener('click',function(){
    document.getElementById('screen-dimensionamento').classList.add('active');
  });

  // ── Filtro (serviço / vendedor) ──

  function popularFiltros(){
    var servicosPresentes={},vendedoresPresentes={};
    agendamentos.forEach(function(a){
      if(a.IdServico&&servicosMap[a.IdServico])servicosPresentes[a.IdServico]=servicosMap[a.IdServico];
      var cliente=clientesMap[a.IdCliente];
      var idVend=cliente&&cliente['Vendedor Responsavel'];
      if(idVend&&vendedoresMap[idVend])vendedoresPresentes[idVend]=vendedoresMap[idVend];
    });

    var selServ=document.getElementById('filtro-servico'),curServ=servicoFiltro;
    selServ.innerHTML='<option value="">Todos os serviços</option>'+
      Object.keys(servicosPresentes).map(function(id){return servicosPresentes[id];})
        .sort(function(x,y){return (x['Nome Servico']||'').localeCompare(y['Nome Servico']||'','pt-BR');})
        .map(function(s){return '<option value="'+escapeHtml(s.IdServico)+'">'+escapeHtml(s['Nome Servico']||s.IdServico)+'</option>';}).join('');
    selServ.value=curServ;

    var selVend=document.getElementById('filtro-vendedor'),curVend=vendedorFiltro;
    selVend.innerHTML='<option value="">Todos os vendedores</option>'+
      Object.keys(vendedoresPresentes).map(function(id){return vendedoresPresentes[id];})
        .sort(function(x,y){return (x.Nome||'').localeCompare(y.Nome||'','pt-BR');})
        .map(function(v){return '<option value="'+escapeHtml(v.IdVendedor)+'">'+escapeHtml(v.Nome)+'</option>';}).join('');
    selVend.value=curVend;
  }

  function atualizarIconeFiltro(){
    var btn=document.getElementById('btn-filtros');
    btn.classList.toggle('has-filters',!!(servicoFiltro||vendedorFiltro));
  }

  document.getElementById('btn-filtros').addEventListener('click',function(){
    popularFiltros();
    document.getElementById('filtros-overlay').classList.remove('hidden');
  });
  document.getElementById('filtros-overlay').addEventListener('click',function(e){
    if(e.target.id==='filtros-overlay')document.getElementById('filtros-overlay').classList.add('hidden');
  });
  document.getElementById('btn-aplicar-filtros').addEventListener('click',function(){
    servicoFiltro=document.getElementById('filtro-servico').value;
    vendedorFiltro=document.getElementById('filtro-vendedor').value;
    atualizarIconeFiltro();
    document.getElementById('filtros-overlay').classList.add('hidden');
    paginaAtual=1;
    renderKPIs();
    renderLista();
  });
  document.getElementById('btn-limpar-filtros').addEventListener('click',function(){
    servicoFiltro=''; vendedorFiltro='';
    document.getElementById('filtro-servico').value='';
    document.getElementById('filtro-vendedor').value='';
    atualizarIconeFiltro();
    document.getElementById('filtros-overlay').classList.add('hidden');
    paginaAtual=1;
    renderKPIs();
    renderLista();
  });

  // ── Detalhe + formulário ──

  function respostaTemValor(r){
    return !!(r&&(String(r.RespostaTexto||'').trim()||String(r.RespostaFoto||'').trim()||String(r.RespostaQuantidade||'').trim()));
  }
  function valorParaTipo(r,tipo){
    if(!r)return '';
    if(tipo==='Foto')return r.RespostaFoto||'';
    if(tipo==='Number')return r.RespostaQuantidade||'';
    return r.RespostaTexto||'';
  }
  function respostaAtual(idAgendamento,idTemplate,tipo){
    return valorParaTipo(respostasMap[idAgendamento+'|'+idTemplate],tipo);
  }

  function campoHtml(tpl,idAgendamento){
    var tipo=(tpl.TipoInput||'Texto').trim();
    var obrig=isObrigatorio(tpl.Obrigatorio);
    var reqMark=obrig?'<span class="req">*</span>':'';
    var valorAtual=respostaAtual(idAgendamento,tpl.IdTemplate,tipo);
    var fid='campo_'+tpl.IdTemplate;
    var servTag=(tpl.IdServico&&agendamentoAtual&&String(tpl.IdServico)!==String(agendamentoAtual.IdServico))
      ?('<div class="ph-status" style="margin-top:-2px;margin-bottom:6px;">Respondido no serviço: '+escapeHtml(nomeServico(tpl.IdServico))+'</div>')
      :'';

    if(tipo==='Foto'){
      var temFoto=valorAtual&&/^(https?:|data:image)/.test(valorAtual);
      return '<div class="form-field" data-tipo="Foto" data-tpl="'+escapeHtml(tpl.IdTemplate)+'" data-obrig="'+(obrig?'1':'0')+'">'+
        '<label>'+escapeHtml(tpl.TextoPergunta)+reqMark+'</label>'+servTag+
        '<div class="photo-field'+(temFoto?' filled':'')+'" id="ph-'+fid+'">'+
          (temFoto?'<img src="'+escapeHtml(valorAtual)+'" alt="foto">':'')+
          '<div class="ph-btn-row">'+
            '<label class="ph-btn" for="'+fid+'_cam">📷 Tirar foto</label>'+
            '<label class="ph-btn" for="'+fid+'_gal">🖼 Galeria</label>'+
          '</div>'+
          (temFoto?'<div class="ph-status" style="margin-top:4px;">Trocar: escolha uma opção acima</div>':'')+
          '<input type="file" accept="image/*" capture="environment" id="'+fid+'_cam" data-target="'+fid+'">'+
          '<input type="file" accept="image/*" id="'+fid+'_gal" data-target="'+fid+'">'+
          (temFoto?('<button type="button" class="ph-btn-remover" data-target="'+fid+'" data-tpl="'+escapeHtml(tpl.IdTemplate)+'">🗑 Remover foto</button>'+
            '<div class="ph-confirma-remover hidden" id="phc-'+fid+'">'+
              '<span>Remover esta foto?</span>'+
              '<button type="button" class="ph-confirma-sim" data-target="'+fid+'" data-tpl="'+escapeHtml(tpl.IdTemplate)+'">Sim, remover</button>'+
              '<button type="button" class="ph-confirma-nao" data-target="'+fid+'">Cancelar</button>'+
            '</div>'):'')+
          '<div class="ph-status" id="phs-'+fid+'"></div>'+
        '</div>'+
      '</div>';
    }
    if(tipo==='YesNo'){
      var isSim=String(valorAtual).trim().toLowerCase()==='sim';
      var isNao=String(valorAtual).trim().toLowerCase()==='não'||String(valorAtual).trim().toLowerCase()==='nao';
      return '<div class="form-field" data-tipo="YesNo" data-tpl="'+escapeHtml(tpl.IdTemplate)+'" data-obrig="'+(obrig?'1':'0')+'">'+
        '<label>'+escapeHtml(tpl.TextoPergunta)+reqMark+'</label>'+servTag+
        '<div class="yesno-row">'+
          '<button type="button" class="yn-btn'+(isSim?' selected':'')+'" data-val="Sim">Sim</button>'+
          '<button type="button" class="yn-btn no-btn'+(isNao?' selected':'')+'" data-val="Não">Não</button>'+
        '</div>'+
        '<input type="hidden" id="'+fid+'" value="'+escapeHtml(isSim?'Sim':(isNao?'Não':''))+'">'+
        '<div class="field-status" id="fs-'+fid+'"></div>'+
      '</div>';
    }
    if(tipo==='Enum'){
      var opcoes=(tpl.OpcoesEnum||'').split(',').map(function(o){return o.trim();}).filter(Boolean);
      return '<div class="form-field" data-tipo="Enum" data-tpl="'+escapeHtml(tpl.IdTemplate)+'" data-obrig="'+(obrig?'1':'0')+'">'+
        '<label>'+escapeHtml(tpl.TextoPergunta)+reqMark+'</label>'+servTag+
        '<select id="'+fid+'"><option value="">— Selecionar…</option>'+
          opcoes.map(function(o){return '<option value="'+escapeHtml(o)+'"'+(o===valorAtual?' selected':'')+'>'+escapeHtml(o)+'</option>';}).join('')+
        '</select>'+
        '<div class="field-status" id="fs-'+fid+'"></div>'+
      '</div>';
    }
    if(tipo==='Number'){
      return '<div class="form-field" data-tipo="Number" data-tpl="'+escapeHtml(tpl.IdTemplate)+'" data-obrig="'+(obrig?'1':'0')+'">'+
        '<label>'+escapeHtml(tpl.TextoPergunta)+reqMark+'</label>'+servTag+
        '<input type="number" id="'+fid+'" value="'+escapeHtml(valorAtual)+'">'+
        '<div class="field-status" id="fs-'+fid+'"></div>'+
      '</div>';
    }
    // Texto (padrão)
    return '<div class="form-field" data-tipo="Texto" data-tpl="'+escapeHtml(tpl.IdTemplate)+'" data-obrig="'+(obrig?'1':'0')+'">'+
      '<label>'+escapeHtml(tpl.TextoPergunta)+reqMark+'</label>'+servTag+
      '<textarea id="'+fid+'">'+escapeHtml(valorAtual)+'</textarea>'+
      '<div class="field-status" id="fs-'+fid+'"></div>'+
    '</div>';
  }

  var debounceTimers={};

  function localColunaPara(tipo){ return tipo==='Number'?'RespostaQuantidade':'RespostaTexto'; }

  function salvarCampoIndividual(idAgendamento,idTemplate,valor,tipo,statusEl){
    if(statusEl){ statusEl.className='field-status'; statusEl.textContent='Salvando…'; statusEl.onclick=null; }
    // Otimista: com o app offline, a Promise do Firestore só resolve quando o
    // servidor confirmar (mesmo com enablePersistence — ela NÃO resolve só
    // por ter sido enfileirada localmente, ver tecnico-firebase-init.js). Se
    // essa tela esperasse essa Promise pra dar feedback, o campo ficaria
    // "Salvando…" travado até a conexão voltar. Por isso a resposta é
    // aplicada localmente e a UI já mostra "Salvo ✓" na hora — a bolinha de
    // sincronização (TecnicoSync, via comSync no router) é quem mostra o
    // estado real "ainda sincronizando"; aqui só tratamos erro de verdade,
    // que só pode ser confirmado quando a Promise realmente resolver/rejeitar.
    var atual=respostasMap[idAgendamento+'|'+idTemplate]||{};
    atual[localColunaPara(tipo)]=valor;
    respostasMap[idAgendamento+'|'+idTemplate]=atual;
    if(statusEl){
      statusEl.className='field-status ok';
      statusEl.textContent='Salvo ✓';
      setTimeout(function(){ if(statusEl&&statusEl.textContent==='Salvo ✓')statusEl.textContent=''; },2000);
    }
    atualizarProgressoObrigatorios();
    SGAuth.apiCall('salvarRespostasAgendamento',{
      solicitanteId:session.idVendedor, idAgendamento:idAgendamento,
      respostas:[{idTemplate:idTemplate,resposta:valor}]
    }).then(function(resp){
      if(!resp||!resp.ok){
        if(statusEl){
          statusEl.className='field-status error';
          statusEl.textContent='Não salvou — toque pra tentar de novo';
          statusEl.onclick=function(){ salvarCampoIndividual(idAgendamento,idTemplate,valor,tipo,statusEl); };
        }
        return;
      }
      if(resp.novoStatus)aplicarNovoStatusLocal(resp.novoStatus);
    }).catch(function(err){
      if(statusEl){
        statusEl.className='field-status error';
        statusEl.textContent='Erro de conexão — toque pra tentar de novo';
        statusEl.onclick=function(){ salvarCampoIndividual(idAgendamento,idTemplate,valor,tipo,statusEl); };
      }
    });
  }

  function wireCampoEvents(idAgendamento,escopo){
    var raiz=escopo||document;
    raiz.querySelectorAll('.yn-btn').forEach(function(btn){
      if(btn.getAttribute('data-wired'))return;
      btn.setAttribute('data-wired','1');
      btn.addEventListener('click',function(){
        var row=btn.closest('.form-field');
        row.querySelectorAll('.yn-btn').forEach(function(b){b.classList.remove('selected');});
        btn.classList.add('selected');
        var valor=btn.getAttribute('data-val');
        row.querySelector('input[type=hidden]').value=valor;
        var idTemplate=row.getAttribute('data-tpl');
        var statusEl=row.querySelector('.field-status');
        salvarCampoIndividual(idAgendamento,idTemplate,valor,'YesNo',statusEl);
      });
    });
    raiz.querySelectorAll('.form-field[data-tipo="Enum"] select').forEach(function(select){
      if(select.getAttribute('data-wired'))return;
      select.setAttribute('data-wired','1');
      select.addEventListener('change',function(){
        var row=select.closest('.form-field');
        var idTemplate=row.getAttribute('data-tpl');
        var statusEl=row.querySelector('.field-status');
        salvarCampoIndividual(idAgendamento,idTemplate,select.value,'Enum',statusEl);
      });
    });
    raiz.querySelectorAll('.form-field[data-tipo="Texto"] textarea, .form-field[data-tipo="Number"] input[type=number]').forEach(function(campo){
      if(campo.getAttribute('data-wired'))return;
      campo.setAttribute('data-wired','1');
      var row=campo.closest('.form-field');
      var idTemplate=row.getAttribute('data-tpl');
      var tipo=row.getAttribute('data-tipo');
      var statusEl=row.querySelector('.field-status');
      var salvarAgora=function(){
        clearTimeout(debounceTimers[idTemplate]);
        debounceTimers[idTemplate]=null;
        salvarCampoIndividual(idAgendamento,idTemplate,campo.value.trim(),tipo,statusEl);
      };
      campo.addEventListener('input',function(){
        if(statusEl){ statusEl.className='field-status'; statusEl.textContent='digitando…'; }
        atualizarProgressoObrigatorios();
        clearTimeout(debounceTimers[idTemplate]);
        debounceTimers[idTemplate]=setTimeout(salvarAgora,900);
      });
      campo.addEventListener('blur',function(){
        if(debounceTimers[idTemplate])salvarAgora();
      });
    });
    raiz.querySelectorAll('.photo-field input[type=file]').forEach(function(input){
      if(input.getAttribute('data-wired'))return;
      input.setAttribute('data-wired','1');
      input.addEventListener('change',function(){
        var file=input.files&&input.files[0];
        if(!file)return;
        var row=input.closest('.form-field');
        var idTemplate=row.getAttribute('data-tpl');
        var target=input.getAttribute('data-target');
        var statusEl=document.getElementById('phs-'+target);
        statusEl.textContent='Preparando foto…';
        comprimirImagem(file,1600,0.8).then(function(blob){
          // MOSTRA A FOTO NA HORA — a partir do arquivo local, sem esperar o
          // upload. Em campo com sinal fraco isso é o que mais importa: o
          // técnico vê confirmação visual imediata, o envio acontece atrás.
          var urlLocal=URL.createObjectURL(blob);
          var box=document.getElementById('ph-'+target);
          box.classList.add('filled');
          var img=box.querySelector('img');
          if(!img){ img=document.createElement('img'); box.insertBefore(img,box.firstChild); }
          img.src=urlLocal;
          statusEl.textContent='Enviando foto… ('+Math.round(blob.size/1024)+' KB)';

          function tentarEnviar(){
            var reader=new FileReader();
            reader.onload=function(){
              var dataUri=reader.result;
              var base64=dataUri.split(',')[1];
              // Otimista: a foto vai pro Firestore (não mais pro Drive), e a
              // Promise do `set()` só resolve quando o servidor confirmar —
              // mesmo com enablePersistence, ela NÃO resolve só por ter sido
              // enfileirada localmente (ver tecnico-firebase-init.js). Sem
              // sinal, ela fica pendente até reconectar. Por isso o estado
              // local (respostasMap, progresso de obrigatórios) já é
              // atualizado aqui, na hora — a bolinha de sincronização
              // (TecnicoSync) é quem mostra que a foto ainda não confirmou
              // no servidor; esse texto de status só reporta erro de
              // verdade, quando a Promise realmente resolver/rejeitar.
              var atual=respostasMap[idAgendamento+'|'+idTemplate]||{};
              atual.RespostaFoto=dataUri;
              respostasMap[idAgendamento+'|'+idTemplate]=atual;
              statusEl.textContent='Foto salva — sincronizando…';
              atualizarProgressoObrigatorios();
              SGAuth.apiCall('uploadFotoResposta',{
                solicitanteId:session.idVendedor, idAgendamento:idAgendamento, idTemplate:idTemplate,
                base64:base64, mimeType:'image/jpeg', nomeArquivo:(file.name||'foto').replace(/\.[^.]+$/,'')+'.jpg'
              }).then(function(resp){
                if(!resp||!resp.ok){
                  statusEl.innerHTML=escapeHtml((resp&&resp.erro)||'Falha ao enviar — a foto continua na tela, salva só no aparelho.');
                  statusEl.innerHTML+=' <button type="button" class="ph-retry-btn" data-target="'+target+'">Tentar de novo</button>';
                  wireRetryFoto(statusEl,target,tentarEnviar);
                  return;
                }
                // troca a prévia local (blob:, não sobrevive a um
                // recarregamento de página) pela mesma imagem já persistida.
                URL.revokeObjectURL(urlLocal);
                img.src=resp.url;
                statusEl.textContent='Foto enviada ✓';
                if(resp.novoStatus)aplicarNovoStatusLocal(resp.novoStatus);
              }).catch(function(err){
                statusEl.innerHTML='Erro de conexão — a foto continua na tela, salva só no aparelho.';
                statusEl.innerHTML+=' <button type="button" class="ph-retry-btn" data-target="'+target+'">Tentar de novo</button>';
                wireRetryFoto(statusEl,target,tentarEnviar);
              });
            };
            reader.readAsDataURL(blob);
          }
          tentarEnviar();
        }).catch(function(err){
          statusEl.textContent='Erro ao preparar a foto: '+err.message;
        });
      });
    });
    // "Remover foto" — pedido do Felipe: até aqui só dava pra TROCAR a foto
    // (escolher outra), não dava pra deixar o campo vazio de novo. Confirma
    // inline (sem confirm() nativo, ver segundo-cerebro/padroes/design-
    // system.md) antes de remover de verdade.
    raiz.querySelectorAll('.ph-btn-remover').forEach(function(btn){
      if(btn.getAttribute('data-wired'))return;
      btn.setAttribute('data-wired','1');
      btn.addEventListener('click',function(){
        var target=btn.getAttribute('data-target');
        btn.classList.add('hidden');
        var confirma=document.getElementById('phc-'+target);
        if(confirma)confirma.classList.remove('hidden');
      });
    });
    raiz.querySelectorAll('.ph-confirma-nao').forEach(function(btn){
      if(btn.getAttribute('data-wired'))return;
      btn.setAttribute('data-wired','1');
      btn.addEventListener('click',function(){
        var target=btn.getAttribute('data-target');
        var confirma=document.getElementById('phc-'+target);
        if(confirma)confirma.classList.add('hidden');
        var removerBtn=document.querySelector('.ph-btn-remover[data-target="'+target+'"]');
        if(removerBtn)removerBtn.classList.remove('hidden');
      });
    });
    raiz.querySelectorAll('.ph-confirma-sim').forEach(function(btn){
      if(btn.getAttribute('data-wired'))return;
      btn.setAttribute('data-wired','1');
      btn.addEventListener('click',function(){
        var idTemplate=btn.getAttribute('data-tpl');
        var row=btn.closest('.form-field');
        var tpl=templatesPorId[idTemplate];
        if(!row||!tpl)return;
        var chave=idAgendamento+'|'+idTemplate;
        var respostaAnterior=respostasMap[chave]?Object.assign({},respostasMap[chave]):null;

        // Redesenha o campo do zero a partir do respostasMap atual — mesma
        // função que já monta o campo na primeira vez (campoHtml), só que
        // chamada de novo depois de mudar a resposta em memória. Usada tanto
        // pro otimista (sem foto) quanto pra desfazer se o servidor recusar
        // (respostaAnterior de volta).
        function redesenhar(){
          var alvo=document.querySelector('.form-field[data-tpl="'+idTemplate+'"]')||row;
          var wrapper=document.createElement('div');
          wrapper.innerHTML=campoHtml(tpl,idAgendamento);
          var novoNode=wrapper.firstElementChild;
          alvo.replaceWith(novoNode);
          wireCampoEvents(idAgendamento,novoNode);
          return novoNode;
        }

        // Otimista: já troca pro estado "sem foto" na tela.
        var atual=respostasMap[chave]||{};
        atual.RespostaFoto='';
        respostasMap[chave]=atual;
        redesenhar();
        atualizarProgressoObrigatorios();

        SGAuth.apiCall('removerFotoResposta',{
          solicitanteId:session.idVendedor,idAgendamento:idAgendamento,idTemplate:idTemplate
        }).then(function(resp){
          if(!resp||!resp.ok){
            respostasMap[chave]=respostaAnterior;
            var novoNode=redesenhar();
            atualizarProgressoObrigatorios();
            var statusEl=novoNode.querySelector('.ph-status');
            if(statusEl)statusEl.textContent=(resp&&resp.erro)||'Não foi possível remover — foto restaurada.';
            return;
          }
          if(resp.novoStatus)aplicarNovoStatusLocal(resp.novoStatus);
        }).catch(function(err){
          respostasMap[chave]=respostaAnterior;
          var novoNode=redesenhar();
          atualizarProgressoObrigatorios();
          var statusEl=novoNode.querySelector('.ph-status');
          if(statusEl)statusEl.textContent='Erro de conexão — foto restaurada.';
        });
      });
    });
  }

  function wireRetryFoto(statusEl,target,tentarEnviar){
    var btn=statusEl.querySelector('.ph-retry-btn[data-target="'+target+'"]');
    if(!btn)return;
    btn.addEventListener('click',function(){
      statusEl.textContent='Enviando foto…';
      tentarEnviar();
    });
  }

  /**
   * Redimensiona/comprime a foto no navegador antes de enviar (fotos de celular
   * costumam ter vários MB — isso evita que o envio falhe em conexão fraca).
   */
  function medidasAlvo(w,h,maxDim){
    if(w>h&&w>maxDim){ return {w:maxDim,h:Math.round(h*maxDim/w)}; }
    if(h>=w&&h>maxDim){ return {w:Math.round(w*maxDim/h),h:maxDim}; }
    return {w:w,h:h};
  }

  function desenharEExportar(source,w,h,qualidade){
    return new Promise(function(resolve,reject){
      var canvas=document.createElement('canvas');
      canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(source,0,0,w,h);
      canvas.toBlob(function(blob){
        if(!blob){ reject(new Error('Não foi possível comprimir a imagem.')); return; }
        resolve(blob);
      },'image/jpeg',qualidade);
    });
  }

  /**
   * Foto de câmera moderna facilmente vem em 12+ megapixels — decodificar
   * isso via <img>/onload (caminho antigo) carrega a imagem em resolução
   * TOTAL na memória antes de reduzir, o que trava a aba por vários
   * segundos num aparelho mais fraco. createImageBitmap é decodificado de
   * forma mais eficiente (em muitos navegadores, fora da thread principal),
   * evitando esse travamento — mesmo resultado visual, só mais rápido.
   * Cai pro caminho antigo (<img>) se o navegador não suportar.
   */
  function comprimirImagem(file,maxDim,qualidade){
    if(typeof createImageBitmap==='function'){
      return createImageBitmap(file).then(function(bitmap){
        var alvo=medidasAlvo(bitmap.width,bitmap.height,maxDim);
        return desenharEExportar(bitmap,alvo.w,alvo.h,qualidade).then(function(blob){
          bitmap.close();
          return blob;
        }, function(err){ bitmap.close(); throw err; });
      }).catch(function(){
        return comprimirImagemViaImg(file,maxDim,qualidade);
      });
    }
    return comprimirImagemViaImg(file,maxDim,qualidade);
  }

  function comprimirImagemViaImg(file,maxDim,qualidade){
    return new Promise(function(resolve,reject){
      var img=new Image();
      var url=URL.createObjectURL(file);
      img.onload=function(){
        URL.revokeObjectURL(url);
        var alvo=medidasAlvo(img.width,img.height,maxDim);
        desenharEExportar(img,alvo.w,alvo.h,qualidade).then(resolve,reject);
      };
      img.onerror=function(){ URL.revokeObjectURL(url); reject(new Error('Não foi possível ler o arquivo de imagem.')); };
      img.src=url;
    });
  }

  function coletarRespostas(){
    var respostas=[],faltando=[];
    document.querySelectorAll('#form-section .form-field').forEach(function(row){
      var idTemplate=row.getAttribute('data-tpl');
      var tipo=row.getAttribute('data-tipo');
      var obrig=row.getAttribute('data-obrig')==='1';
      var tpl=templatesPorId[idTemplate];
      var rotulo=tpl?tpl.TextoPergunta:idTemplate;
      if(tipo==='Foto'){
        if(obrig&&!respostaAtual(agendamentoAtual.IdAgendamento,idTemplate,'Foto'))faltando.push(rotulo);
        return; // fotos já são salvas sozinhas no upload
      }
      var fid='campo_'+idTemplate;
      var el=document.getElementById(fid);
      var valor=el?el.value.trim():'';
      if(obrig&&!valor)faltando.push(rotulo);
      respostas.push({idTemplate:idTemplate,resposta:valor});
    });
    return {respostas:respostas,faltando:faltando};
  }


  function ordemTemplate(t){ var o=parseInt(t&&t.Ordem,10); return isNaN(o)?999:o; }

  function respostaRowHtml(tpl,a){
    var tipo=(tpl.TipoInput||'Texto').trim();
    var obrig=isObrigatorio(tpl.Obrigatorio);
    var reqMark=obrig?'<span class="req">*</span>':'';
    var valor=respostaAtual(a.IdAgendamento,tpl.IdTemplate,tipo);
    var servTag=(tpl.IdServico&&String(tpl.IdServico)!==String(a.IdServico))
      ?(' <span style="color:var(--ink-faint);font-weight:600;">· '+escapeHtml(nomeServico(tpl.IdServico))+'</span>')
      :'';
    var preview;
    if(tipo==='Foto'){
      if(valor&&/^(https?:|data:image)/.test(valor)){
        preview='<img src="'+escapeHtml(valor)+'" style="max-width:130px;max-height:130px;border-radius:8px;margin-top:6px;display:block;object-fit:cover;">';
      }else if(valor){
        preview='<div style="font-size:12px;color:var(--debit);margin-top:4px;">⚠ foto não reconhecida ("'+escapeHtml(valor)+'") — toque em editar pra reenviar.</div>';
      }else{
        preview='<div style="font-size:12.5px;color:var(--ink-faint);margin-top:2px;">Sem foto ainda.</div>';
      }
    }else{
      preview='<div style="font-size:13px;color:var(--ink-soft);margin-top:2px;white-space:pre-wrap;">'+escapeHtml(valor||'—')+'</div>';
    }
    return '<div class="resp-row" style="padding:11px 0;border-bottom:1px solid var(--bg);">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">'+
        '<div style="font-weight:700;font-size:13px;">'+escapeHtml(tpl.TextoPergunta)+reqMark+servTag+'</div>'+
        '<button type="button" class="resp-edit-btn" data-tpl="'+escapeHtml(tpl.IdTemplate)+'" style="background:none;border:none;color:var(--accent-deep);font-size:11.5px;font-weight:700;text-decoration:underline;cursor:pointer;flex:none;padding:2px;">editar</button>'+
      '</div>'+
      preview+
      '<div class="resp-edit-slot hidden" data-slot="'+escapeHtml(tpl.IdTemplate)+'" style="margin-top:8px;"></div>'+
    '</div>';
  }

  function renderFormulario(a){
    // "Respostas" já dadas (de qualquer serviço, mescladas) em modo leitura + editar,
    // e um botão "+ Add" que revela só as perguntas do serviço atual que ainda faltam —
    // igual ao painel "Respostas" do AppSheet.
    var idsRespondidos={};
    var templatesRespondidos=[];
    templatesTodos.forEach(function(t){
      var r=respostasMap[a.IdAgendamento+'|'+t.IdTemplate];
      if(respostaTemValor(r)){ idsRespondidos[t.IdTemplate]=true; templatesRespondidos.push(t); }
    });
    templatesRespondidos.sort(function(x,y){return ordemTemplate(x)-ordemTemplate(y);});

    var pendentes=(templatesPorServico[a.IdServico]||[]).filter(function(t){return !idsRespondidos[t.IdTemplate];})
      .sort(function(x,y){return ordemTemplate(x)-ordemTemplate(y);});

    var htmlRespondidas=templatesRespondidos.length
      ? templatesRespondidos.map(function(t){return respostaRowHtml(t,a);}).join('')
      : '<p style="font-size:12.5px;color:var(--ink-faint);padding:6px 0 2px;">Nenhuma resposta preenchida ainda. Toque em "+ Add" pra começar.</p>';

    var htmlPendentes=pendentes.length
      ? '<div id="pendentes-wrap" class="hidden" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line);">'+
          pendentes.map(function(t){return campoHtml(t,a.IdAgendamento);}).join('')+
        '</div>'
      : '';

    var botaoAdd=pendentes.length
      ? '<button type="button" class="btn-add-pendentes" id="btn-add-pendentes"><span class="plus-badge">+</span> Adicionar respostas <span style="color:var(--accent-deep);opacity:.75;">('+pendentes.length+' pendente'+(pendentes.length>1?'s':'')+')</span></button>'
      : '<p style="font-size:12px;color:var(--ink-faint);margin-top:10px;">✓ Todas as perguntas do serviço atual já foram respondidas.</p>';

    return '<div class="det-section" id="form-section">'+
      '<h3>Respostas <span style="color:var(--ink-faint);font-weight:600;">'+templatesRespondidos.length+'</span></h3>'+
      '<div id="respondidas-wrap">'+htmlRespondidas+'</div>'+
      htmlPendentes+
      botaoAdd+
    '</div>';
  }

  function wireRespostasCard(idAgendamento){
    var addBtn=document.getElementById('btn-add-pendentes');
    if(addBtn)addBtn.addEventListener('click',function(){
      var wrap=document.getElementById('pendentes-wrap');
      wrap.classList.toggle('hidden');
      wireCampoEvents(idAgendamento,wrap);
      atualizarProgressoObrigatorios();
    });
    document.querySelectorAll('.resp-edit-btn').forEach(function(btn){
      btn.addEventListener('click',function(){
        var idTemplate=btn.getAttribute('data-tpl');
        var slot=document.querySelector('.resp-edit-slot[data-slot="'+idTemplate+'"]');
        if(!slot)return;
        if(!slot.dataset.montado){
          var tpl=templatesPorId[idTemplate];
          if(!tpl)return;
          slot.innerHTML=campoHtml(tpl,idAgendamento);
          slot.dataset.montado='1';
          wireCampoEvents(idAgendamento,slot);
        }
        slot.classList.toggle('hidden');
        btn.textContent=slot.classList.contains('hidden')?'editar':'fechar';
        atualizarProgressoObrigatorios();
      });
    });
  }

  function abrirDetalhe(idAgendamento){
    var a=agendamentos.filter(function(x){return String(x.IdAgendamento)===String(idAgendamento);})[0];
    if(!a)return;
    agendamentoAtual=a;
    var status=(a['Status Agendamento']||'Agendado').trim();
    var cliente=clientesMap[a.IdCliente]||{};
    var servico=servicosMap[a.IdServico]||{};
    var dt=parseBRDate(a['Data Inicio']);
    var dataFmt=dt?String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear():'—';

    document.getElementById('det-title').textContent=nomeCliente(a.IdCliente);

    var html='';
    html+='<div class="det-section">'+
      '<span class="status-badge st-'+statusSlug(status)+'">'+escapeHtml(statusLabelDisplay(status))+'</span>'+
      '<div class="det-row" style="margin-top:12px;"><span class="dl">Cliente</span><span class="dv">'+escapeHtml(nomeCliente(a.IdCliente))+'</span></div>'+
      (cliente.Endereco?'<div class="det-row"><span class="dl">Endereço</span><span class="dv">'+escapeHtml(cliente.Endereco)+'</span></div>':'')+
      (cliente.Telefone?'<div class="det-row"><span class="dl">Telefone</span><span class="dv">'+escapeHtml(cliente.Telefone)+'</span></div>':'')+
      (function(){
        var idVend=cliente['Vendedor Responsavel'];
        var vend=idVend?vendedoresMap[idVend]:null;
        if(!vend)return '';
        return '<div class="det-row"><span class="dl">Vendedor</span><span class="dv">'+escapeHtml(vend.Nome||'—')+'</span></div>'+
          (vend.Telefone?'<div class="det-row"><span class="dl">Telefone do Vendedor</span><span class="dv">'+escapeHtml(vend.Telefone)+'</span></div>':'');
      })()+
      '<div class="det-row"><span class="dl">Serviço</span><span class="dv">'+escapeHtml(nomeServico(a.IdServico))+'</span></div>'+
      (servico.TipoServico?'<div class="det-row"><span class="dl">Tipo</span><span class="dv">'+escapeHtml(servico.TipoServico)+'</span></div>':'')+
      '<div class="det-row"><span class="dl">Data</span><span class="dv">'+dataFmt+'</span></div>'+
      '<div class="det-row"><span class="dl">Horário</span><span class="dv">'+escapeHtml((a['Hora inicio']||'—')+' – '+(a['Hora Fim']||'—'))+'</span></div>'+
      '<div class="det-row" id="det-motivoRow" style="'+(a['Motivo Cancelamento']?'':'display:none;')+'"><span class="dl">Motivo do cancelamento</span><span class="dv" id="det-motivoValor">'+escapeHtml(a['Motivo Cancelamento']||'')+'</span></div>'+
      '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--bg);">'+
        '<label style="display:block;font-size:11px;font-weight:700;color:var(--ink-soft);margin-bottom:6px;">Editar status manualmente</label>'+
        '<div style="display:flex;gap:8px;">'+
          '<select id="status-manual" style="flex:1;font-size:13px;border:1px solid var(--line);border-radius:9px;padding:9px 10px;background:#fff;color:var(--ink);">'+
            '<option value="Agendado">Pendente</option>'+
            '<option value="Em Andamento">Aguardando</option>'+
            '<option value="Concluído">Concluído</option>'+
            '<option value="Cancelado">Cancelado</option>'+
          '</select>'+
          '<button type="button" id="btn-salvar-status" style="flex:none;background:var(--sidebar-bg);color:#fff;border:none;border-radius:9px;padding:0 16px;font-weight:700;font-size:12.5px;cursor:pointer;">Salvar</button>'+
        '</div>'+
      '</div>'+
    '</div>';

    if(a['Quantidade de Modulos']||a['Modelo Modulos']||a['Quantidade Inversores']||a['Modelo Inversores']){
      html+='<div class="det-section"><h3>Detalhes técnicos</h3>'+
        (a['Quantidade de Modulos']?'<div class="det-row"><span class="dl">Qtd. módulos</span><span class="dv">'+escapeHtml(a['Quantidade de Modulos'])+'</span></div>':'')+
        (a['Modelo Modulos']?'<div class="det-row"><span class="dl">Modelo módulos</span><span class="dv">'+escapeHtml(a['Modelo Modulos'])+'</span></div>':'')+
        (a['Quantidade Inversores']?'<div class="det-row"><span class="dl">Qtd. inversores</span><span class="dv">'+escapeHtml(a['Quantidade Inversores'])+'</span></div>':'')+
        (a['Modelo Inversores']?'<div class="det-row"><span class="dl">Modelo inversores</span><span class="dv">'+escapeHtml(a['Modelo Inversores'])+'</span></div>':'')+
      '</div>';
    }

    if(a['Observacao Comercial']){
      html+='<div class="det-section"><h3>Observação do vendedor</h3><p style="font-size:13px;color:var(--ink);line-height:1.5;">'+escapeHtml(a['Observacao Comercial'])+'</p></div>';
    }

    var statusNorm=statusSlug(status);

    // A seção de respostas some primeiro com um "carregando" leve — o resto da
    // tela (dados do cliente, status, etc.) já aparece na hora, sem esperar nada.
    var jaTemDados=respostasCarregadasPara[a.IdAgendamento];
    html+=jaTemDados
      ? renderFormulario(a)
      : '<div class="det-section" id="form-section"><h3>Respostas</h3><p style="font-size:12.5px;color:var(--ink-faint);padding:8px 0;">Carregando respostas…</p></div>';

    document.getElementById('det-body').innerHTML=html;
    document.getElementById('status-manual').value=(a['Status Agendamento']||'Agendado').trim();
    document.getElementById('btn-salvar-status').addEventListener('click',function(){
      var novoStatus=document.getElementById('status-manual').value;
      var btnStatus=document.getElementById('btn-salvar-status');
      if(statusSlug(novoStatus)==='concluido'){
        var st=computeObrigStatus(a);
        if(st.total>0&&st.preenchidos<st.total){
          showToast('Faltam '+(st.total-st.preenchidos)+' campo(s) obrigatório(s) — preencha antes de marcar como Concluído.',true);
          return;
        }
      }
      if(novoStatus==='Cancelado'){
        pedirMotivoCancelamento(a['Motivo Cancelamento']).then(function(motivo){
          if(motivo===null)return;
          salvarStatusOtimista(a,novoStatus,btnStatus,motivo);
        });
        return;
      }
      salvarStatusOtimista(a,novoStatus,btnStatus);
    });
    wireCampoEvents(a.IdAgendamento);
    wireRespostasCard(a.IdAgendamento);

    montarAcoes(a,statusNorm);

    document.getElementById('screen-detalhe').classList.add('active');

    if(!jaTemDados){
      var minhaAbertura=idAgendamento;
      carregarRespostasParaIds([idAgendamento]).then(function(){
        // só redesenha a seção de respostas se o técnico ainda estiver olhando essa mesma OS
        if(!agendamentoAtual||agendamentoAtual.IdAgendamento!==minhaAbertura)return;
        var secao=document.getElementById('form-section');
        if(secao)secao.outerHTML=renderFormulario(a);
        wireCampoEvents(a.IdAgendamento);
        wireRespostasCard(a.IdAgendamento);
        atualizarProgressoObrigatorios(); // as respostas só chegaram agora — recalcula o contador e o botão
      });
    }
  }

  function computeObrigStatus(a){
    var templates=(templatesPorServico[a.IdServico]||[]).filter(function(t){
      return isObrigatorio(t.Obrigatorio);
    });
    var total=templates.length, preenchidos=0, faltando=[];
    templates.forEach(function(t){
      var tipo=(t.TipoInput||'Texto').trim();
      var valor;
      if(tipo==='Foto'){
        valor=respostaAtual(a.IdAgendamento,t.IdTemplate,'Foto');
      }else{
        var el=document.getElementById('campo_'+t.IdTemplate);
        valor=el?el.value.trim():respostaAtual(a.IdAgendamento,t.IdTemplate,tipo);
      }
      if(valor&&String(valor).trim()!==''){ preenchidos++; } else { faltando.push(t.TextoPergunta); }
    });
    return {total:total,preenchidos:preenchidos,faltando:faltando};
  }

  function atualizarProgressoObrigatorios(){
    if(!agendamentoAtual)return;
    var st=computeObrigStatus(agendamentoAtual);
    var el=document.getElementById('obrig-progress');
    if(el){
      if(st.total===0){
        el.textContent='';
      }else{
        var completo=st.preenchidos>=st.total;
        el.textContent=(completo?'✓ ':'')+st.preenchidos+'/'+st.total+' campos obrigatórios preenchidos';
        el.className='obrig-progress'+(completo?' completo':'');
      }
    }
    var btnConcluir=document.getElementById('btn-concluir');
    if(btnConcluir)btnConcluir.disabled=(st.total>0&&st.preenchidos<st.total);
  }

  function montarAcoes(a,statusNorm){
    var actions=document.querySelector('.det-actions');
    if(actions)actions.remove();
    var div=document.createElement('div');
    div.className='det-actions';

    if(statusNorm==='concluido'||statusNorm==='cancelado'){
      div.innerHTML='<button class="btn-save-draft" id="btn-rascunho" style="margin-top:10px;">Salvar alterações</button>';
    }else{
      div.innerHTML='<div id="obrig-progress" class="obrig-progress"></div>'+
        '<button class="btn-finish" id="btn-concluir" style="margin-top:6px;">Concluir atendimento</button>'+
        '<button type="button" class="actions-handle" id="btn-actions-toggle">Mais opções <span class="chev">▾</span></button>'+
        '<div class="actions-extra" id="actions-extra">'+
          '<button class="btn-save-draft" id="btn-rascunho">Salvar rascunho</button>'+
          (statusNorm==='agendado'?'<button class="btn-cancel-link" id="btn-iniciar" style="color:var(--accent-deep);">Marcar como Em Andamento</button>':'')+
          '<button class="btn-cancel-link" id="btn-cancelar">Cancelar agendamento</button>'+
        '</div>';
    }

    document.getElementById('det-body').parentNode.appendChild(div);
    atualizarProgressoObrigatorios();

    var toggleBtn=document.getElementById('btn-actions-toggle');
    if(toggleBtn)toggleBtn.addEventListener('click',function(){
      var extra=document.getElementById('actions-extra');
      var open=extra.classList.toggle('open');
      toggleBtn.classList.toggle('open',open);
      toggleBtn.innerHTML=open?'Menos opções <span class="chev">▾</span>':'Mais opções <span class="chev">▾</span>';
    });

    var btnIniciar=document.getElementById('btn-iniciar');
    if(btnIniciar)btnIniciar.addEventListener('click',function(){
      salvarStatusOtimista(a,'Em Andamento',btnIniciar);
    });

    var btnCancelar=document.getElementById('btn-cancelar');
    if(btnCancelar)btnCancelar.addEventListener('click',function(){
      pedirMotivoCancelamento(a['Motivo Cancelamento']).then(function(motivo){
        if(motivo===null)return;
        salvarStatusOtimista(a,'Cancelado',null,motivo);
        fecharDetalhe();
      });
    });

    var btnRascunho=document.getElementById('btn-rascunho');
    if(btnRascunho)btnRascunho.addEventListener('click',function(){
      var coleta=coletarRespostas();
      // Otimista, mesmo padrão do "Concluir atendimento" logo abaixo: sem
      // sinal, a Promise do Firestore só resolve quando reconectar (ver nota
      // em salvarCampoIndividual) — travar o botão em "Salvando…" até lá
      // daria a impressão de que o app emperrou.
      showToast('Respostas salvas.');
      SGAuth.apiCall('salvarRespostasAgendamento',{solicitanteId:session.idVendedor,idAgendamento:a.IdAgendamento,respostas:coleta.respostas}).then(function(resp){
        if(!resp||!resp.ok){ showToast((resp&&resp.erro)||'Aviso: nem todas as respostas foram salvas. Reabra essa OS pra conferir.',true); return; }
        if(resp.novoStatus)aplicarNovoStatusLocal(resp.novoStatus);
      }).catch(function(err){ showToast('Aviso: erro de conexão salvando respostas — reabra essa OS pra conferir.',true); });
    });

    var btnConcluir=document.getElementById('btn-concluir');
    if(btnConcluir)btnConcluir.addEventListener('click',function(){
      var coleta=coletarRespostas();
      if(coleta.faltando.length){
        showToast('Faltam campos obrigatórios: '+coleta.faltando.slice(0,2).join(', ')+(coleta.faltando.length>2?'…':''),true);
        return;
      }
      // Otimista: já marca como concluído na tela e fecha — o salvamento
      // final das respostas (a maioria já foi salva sozinha campo a campo)
      // acontece em segundo plano, sem o técnico precisar esperar.
      showToast('Atendimento concluído! ✓');
      salvarStatusOtimista(a,'Concluído',null);
      fecharDetalhe();
      SGAuth.apiCall('salvarRespostasAgendamento',{solicitanteId:session.idVendedor,idAgendamento:a.IdAgendamento,respostas:coleta.respostas}).then(function(resp){
        if(!resp||!resp.ok)showToast('Aviso: nem todas as respostas foram salvas ('+((resp&&resp.erro)||'erro')+'). Reabra essa OS pra conferir.',true);
      }).catch(function(err){
        showToast('Aviso: erro de conexão salvando respostas — reabra essa OS pra conferir.',true);
      });
    });
  }

  /**
   * Atualiza o status na TELA imediatamente (lista, KPIs, badge, seletor) —
   * sem esperar nenhuma resposta do servidor.
   */
  function aplicarStatusNaTela(novoStatus,motivoCancelamento){
    if(!novoStatus||!agendamentoAtual)return;
    agendamentoAtual['Status Agendamento']=novoStatus;
    if(motivoCancelamento!==undefined)agendamentoAtual['Motivo Cancelamento']=motivoCancelamento;
    var a=agendamentos.filter(function(x){return String(x.IdAgendamento)===String(agendamentoAtual.IdAgendamento);})[0];
    if(a){ a['Status Agendamento']=novoStatus; if(motivoCancelamento!==undefined)a['Motivo Cancelamento']=motivoCancelamento; }
    var statusNorm=statusSlug(novoStatus);
    var badge=document.querySelector('#det-body .status-badge');
    if(badge){ badge.className='status-badge st-'+statusNorm; badge.textContent=statusLabelDisplay(novoStatus); }
    var selManual=document.getElementById('status-manual');
    if(selManual)selManual.value=novoStatus;
    var motivoRow=document.getElementById('det-motivoRow'),motivoValor=document.getElementById('det-motivoValor');
    if(motivoRow&&motivoValor){
      var motivo=agendamentoAtual['Motivo Cancelamento']||'';
      motivoRow.style.display=motivo?'':'none';
      motivoValor.textContent=motivo;
    }
    montarAcoes(agendamentoAtual,statusNorm);
    renderKPIs();
    renderLista();
  }

  function aplicarNovoStatusLocal(novoStatus){
    aplicarStatusNaTela(novoStatus);
    showToast('Status atualizado automaticamente para "'+statusLabelDisplay(novoStatus)+'".');
  }

  /**
   * Diálogo de "Motivo do cancelamento" — sheet reaproveitado tanto pelo
   * seletor manual de status quanto pelo botão "Cancelar agendamento".
   * Resolve com o texto do motivo, ou com null se o técnico desistiu do
   * diálogo (nesse caso quem chamou não deve prosseguir com o cancelamento).
   */
  var motivoCancelResolve=null;
  function pedirMotivoCancelamento(motivoInicial){
    return new Promise(function(resolve){
      motivoCancelResolve=resolve;
      document.getElementById('motivo-cancelamento-texto').value=motivoInicial||'';
      document.getElementById('motivo-cancelamento-msg').textContent='';
      document.getElementById('motivo-cancelamento-overlay').classList.remove('hidden');
      document.getElementById('motivo-cancelamento-texto').focus();
    });
  }
  function fecharMotivoCancelamento(resultado){
    document.getElementById('motivo-cancelamento-overlay').classList.add('hidden');
    if(motivoCancelResolve){ var r=motivoCancelResolve; motivoCancelResolve=null; r(resultado); }
  }
  document.getElementById('btn-motivo-cancelar').addEventListener('click',function(){ fecharMotivoCancelamento(null); });
  document.getElementById('btn-motivo-confirmar').addEventListener('click',function(){
    var v=document.getElementById('motivo-cancelamento-texto').value.trim();
    if(!v){ document.getElementById('motivo-cancelamento-msg').textContent='Informe o motivo do cancelamento.'; return; }
    fecharMotivoCancelamento(v);
  });
  document.getElementById('motivo-cancelamento-overlay').addEventListener('click',function(e){ if(e.target.id==='motivo-cancelamento-overlay')fecharMotivoCancelamento(null); });

  /**
   * Atualização "otimista": muda a tela NA HORA e só depois salva no servidor
   * em segundo plano. Se der erro, desfaz a mudança na tela e avisa. Se o
   * novo status for "Cancelado", exige motivoCancelamento (quem chamou já
   * deve ter aberto o diálogo antes de chegar aqui).
   */
  function salvarStatusOtimista(a,novoStatus,btn,motivoCancelamento){
    var statusAnterior=a['Status Agendamento'];
    var motivoAnterior=a['Motivo Cancelamento'];
    var motivoNovo=novoStatus==='Cancelado'?(motivoCancelamento||''):'';
    aplicarStatusNaTela(novoStatus,motivoNovo);
    if(btn)btn.disabled=true;
    SGAuth.apiCall('atualizarStatusAgendamento',{solicitanteId:session.idVendedor,idAgendamento:a.IdAgendamento,status:novoStatus,motivoCancelamento:motivoNovo}).then(function(resp){
      if(btn)btn.disabled=false;
      if(!resp||!resp.ok){
        aplicarStatusNaTela(statusAnterior,motivoAnterior);
        showToast((resp&&resp.erro)||'Não foi possível salvar — status desfeito.',true);
        return;
      }
      showToast('Status atualizado.');
    }).catch(function(err){
      if(btn)btn.disabled=false;
      aplicarStatusNaTela(statusAnterior,motivoAnterior);
      showToast('Erro de conexão — status desfeito: '+err.message,true);
    });
  }


  function fecharDetalhe(){
    document.getElementById('screen-detalhe').classList.remove('active');
    agendamentoAtual=null;
  }
  document.getElementById('btn-back').addEventListener('click',fecharDetalhe);

  // ── Carregamento ──

  var unsubListaAoVivo=null;
  var ADMIN_ROLES_=['admin','administrador','ceo','gestor','gerente'];
  /**
   * Escuta ao vivo da lista de OS (2026-08-30, bug reportado pelo Felipe):
   * "carregar()" só busca os agendamentos 1x, no boot da tela (mais o botão
   * "Atualizar" manual) — se o vendedor criasse ou editasse um agendamento
   * (por exemplo preenchendo a Observação Comercial) DEPOIS que o técnico já
   * tinha aberto o app, o dado só aparecia depois de um F5/Atualizar manual;
   * na tela, na hora, parecia simplesmente que a observação "não aparecia".
   * Mesmo padrão já usado no painel admin (js/agendamentos.js ·
   * iniciarEscutaAoVivoLista) — qualquer mudança na coleção inteira, de
   * qualquer origem, atualiza a lista sozinha, sem precisar recarregar.
   */
  function iniciarEscutaAoVivoLista(){
    if(unsubListaAoVivo)return;
    if(typeof firebase==='undefined'||!firebase.firestore)return;
    var souAdmin=ADMIN_ROLES_.indexOf((session.tipo||'').trim().toLowerCase())!==-1;
    unsubListaAoVivo=window.TecnicoUtil.escutarComRetry(function(){
      return firebase.firestore().collection('agendamentos');
    },function(snap){
      var todos=[]; snap.forEach(function(doc){ todos.push(doc.data()); });
      agendamentos=souAdmin?todos:todos.filter(function(a){ return String(a.TecnicoResponsavel)===String(session.idVendedor); });
      renderKPIs();
      renderLista();
    },'lista de OS do técnico');
  }

  function carregar(callback){
    SGAuth.apiCall('getAgendamentosTecnico',{solicitanteId:session.idVendedor}).then(function(resp){
      if(!resp||!resp.ok){
        document.getElementById('list-empty').classList.remove('hidden');
        document.getElementById('list-empty').querySelector('p').textContent=(resp&&resp.erro)||'Não foi possível carregar suas ordens de serviço.';
        return;
      }
      agendamentos=resp.agendamentos||[];
      clientesMap={}; (resp.clientes||[]).forEach(function(c){if(c.IdCliente)clientesMap[c.IdCliente]=c;});
      vendedoresMap={}; (resp.vendedores||[]).forEach(function(v){if(v.IdVendedor)vendedoresMap[v.IdVendedor]=v;});
      servicosMap={}; (resp.servicos||[]).forEach(function(s){if(s.IdServico)servicosMap[s.IdServico]=s;});
      templatesPorServico={};
      templatesPorId={};
      templatesTodos=resp.templates||[];
      templatesTodos.forEach(function(t){
        if(t.IdTemplate)templatesPorId[t.IdTemplate]=t;
        if(!t.IdServico)return;
        if(!templatesPorServico[t.IdServico])templatesPorServico[t.IdServico]=[];
        templatesPorServico[t.IdServico].push(t);
      });
      respostasMap={};
      respostasCarregadasPara={}; // recarregou tudo — esquece o que já tinha sido buscado antes

      renderKPIs();
      renderLista();
      if(callback)callback();
    }).catch(function(err){
      document.getElementById('list-empty').classList.remove('hidden');
      document.getElementById('list-empty').querySelector('p').textContent='Erro de conexão: '+err.message;
    });
  }

  carregar();
  // Espera o Firebase Auth confirmar a sessão restaurada antes de abrir o
  // listener — senão dá "permission-denied" (request.auth ainda null) e,
  // diferente de get/set, o onSnapshot não se recupera sozinho depois (ver
  // mesmo cuidado em js/agendamentos.js do painel admin).
  window.TecnicoFireReady.then(iniciarEscutaAoVivoLista);
})();
