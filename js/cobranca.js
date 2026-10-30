// ════ COBRANÇA (sub-aba da tela de Vendas) ════
// Lista as OS concluídas que ainda não têm venda registrada (ou têm só parte do
// valor). A regra mora em js/cobranca-regra.js; aqui fica a tela e as gravações.
(function(){
  var ABA_KEY='sg_vendas_aba';
  var POR_PAGINA=10;
  var NOMES_SITUACAO={em_aberto:'Em aberto',diferenca:'Diferença a confirmar',a_conferir:'A conferir',sem_valor:'Valor não definido',quitada:'Quitada'};
  var PENDENTES=['em_aberto','diferenca','a_conferir','sem_valor'];

  var iniciado=false,pendenteRecalculo=false;
  var bruto={agendamentos:null,vendas:null,clientes:null,vendedores:null,servicos:null};
  // Escrita otimista: o que a pessoa acabou de gravar vale por cima do dado do
  // listener até o servidor responder. Os documentos do listener são compartilhados
  // com outras telas, então nunca são alterados no lugar: o overlay vale só aqui.
  var sobrepor={vendas:{},agend:{}};
  var linhas=[],vendasLista=[],mapaVendas={},mapaAg={},nomeCliente={},nomeVendedor={},nomeServico={};
  var ordem={col:'data',dir:'asc'},pagina=1;

  function el(id){ return document.getElementById(id); }
  function esc(s){ return window.SGUtil.escapeHtml(s); }
  function dinheiro(n){ return window.SGUtil.fmtMoney(n); }
  function souAdmin(){ return !!(window.SGAuth&&window.SGAuth.isAdmin()); }
  function sessao(){ return window.SG_SESSION||{}; }
  function fmtData(d){ return window.SGUtil.fmtDateBR(d); }
  function norm(s){ return window.SGCobrancaRegra.normalizar(s); }
  function toast(msg,erro){ window.SGToast.mostrar(msg,erro); }

  // ── Abas ──
  function lerAba(){ try{ return localStorage.getItem(ABA_KEY)==='cobranca'?'cobranca':'relatorio'; }catch(e){ return 'relatorio'; } }
  function guardarAba(aba){ try{ localStorage.setItem(ABA_KEY,aba); }catch(e){} }
  function mostrarAba(aba,foco){
    var cob=aba==='cobranca';
    el('v-painelRelatorio').style.display=cob?'none':'';
    el('v-painelCobranca').style.display=cob?'':'none';
    [['v-tabRelatorio',!cob],['v-tabCobranca',cob]].forEach(function(p){
      var b=el(p[0]);
      b.setAttribute('aria-selected',p[1]?'true':'false');
      b.tabIndex=p[1]?0:-1;
      if(p[1]&&foco)b.focus();
    });
    guardarAba(aba);
    if(cob)iniciarSePreciso();
  }
  function viewVendasAtiva(){ return el('view-vendas').classList.contains('active'); }
  // Só assina as coleções na primeira vez que a Cobrança aparece de verdade na
  // tela (cota do Firestore): aba lembrada do localStorage não conta se a tela de
  // Vendas ainda nem foi aberta.
  function iniciarSePreciso(){
    if(iniciado||!viewVendasAtiva()||el('v-painelCobranca').style.display==='none')return;
    iniciado=true;
    window.SGFireReady.then(function(){
      Object.keys(bruto).forEach(function(nome){
        window.SGUtil.assinarColecao(nome,function(lista){ bruto[nome]=lista; agendarRecalculo(); });
      });
    });
  }

  // ── Dados ──
  function agendarRecalculo(){
    if(pendenteRecalculo)return;
    pendenteRecalculo=true;
    setTimeout(function(){ pendenteRecalculo=false; recalcular(); },0); // as 5 coleções chegam em sequência: um cálculo só
  }
  function aplicar(base,ov){ return ov?Object.assign({},base,ov):base; }
  function recalcular(){
    var carregado=Object.keys(bruto).every(function(k){ return bruto[k]; });
    if(!carregado){ renderTudo(); return; }
    var ags=bruto.agendamentos.map(function(a){
      var o=sobrepor.agend[a.IdAgendamento];
      if(!o)return a;
      var c=Object.assign({},a,o);
      if(o.CobrancaAjuste===null)delete c.CobrancaAjuste;
      return c;
    });
    vendasLista=bruto.vendas.map(function(v){ return aplicar(v,sobrepor.vendas[v.IdVenda]); });
    mapaVendas={};vendasLista.forEach(function(v){ mapaVendas[v.IdVenda]=v; });
    mapaAg={};ags.forEach(function(a){ mapaAg[a.IdAgendamento]=a; });
    nomeCliente={};bruto.clientes.forEach(function(c){ if(c.IdCliente)nomeCliente[c.IdCliente]=c['Nome Razao Social']||c.Nome||c.IdCliente; });
    nomeVendedor={};bruto.vendedores.forEach(function(v){ if(v.IdVendedor)nomeVendedor[v.IdVendedor]=v.Nome||v.IdVendedor; });
    nomeServico={};bruto.servicos.forEach(function(s){ if(s.IdServico)nomeServico[s.IdServico]=s['Nome Servico']||s.IdServico; });
    var todas=window.SGCobrancaRegra.classificar({agendamentos:ags,vendas:vendasLista,clientes:bruto.clientes,hoje:new Date()});
    var meu=sessao().idVendedor;
    // Vendedor só enxerga OS dos clientes dele.
    linhas=todas.filter(function(l){
      if(l.situacao==='sem_cobranca')return false;
      return souAdmin()||String(l.idVendedorResp)===String(meu);
    });
    popularSelects();
    renderTudo();
  }
  function nomeDoCliente(l){ return nomeCliente[l.idCliente]||(mapaAg[l.idAgendamento]||{}).NomeCliente||l.idCliente||'—'; }

  function popularSelects(){
    var selV=el('cb-selVendedor'),selS=el('cb-selServico');
    var curV=selV.value||'__all__',curS=selS.value||'__all__';
    var idsV=[],idsS=[];
    linhas.forEach(function(l){
      if(l.idVendedorResp&&idsV.indexOf(l.idVendedorResp)===-1)idsV.push(l.idVendedorResp);
      if(l.idServico&&idsS.indexOf(l.idServico)===-1)idsS.push(l.idServico);
    });
    function nv(id){ return nomeVendedor[id]||id; }
    function ns(id){ return nomeServico[id]||id; }
    idsV.sort(function(a,b){ return nv(a).localeCompare(nv(b),'pt-BR'); });
    idsS.sort(function(a,b){ return ns(a).localeCompare(ns(b),'pt-BR'); });
    selV.innerHTML='<option value="__all__">Todos os vendedores</option>'+idsV.map(function(id){ return '<option value="'+esc(id)+'">'+esc(nv(id))+'</option>'; }).join('');
    selS.innerHTML='<option value="__all__">Todos os serviços</option>'+idsS.map(function(id){ return '<option value="'+esc(id)+'">'+esc(ns(id))+'</option>'; }).join('');
    selV.value=idsV.indexOf(curV)!==-1?curV:'__all__';
    selS.value=idsS.indexOf(curS)!==-1?curS:'__all__';
    el('cb-campoVendedor').style.display=souAdmin()?'':'none';
  }

  // ── Filtros ──
  function filtroBase(l){
    var v=el('cb-selVendedor').value,s=el('cb-selServico').value,b=norm(el('cb-busca').value);
    if(v!=='__all__'&&l.idVendedorResp!==v)return false;
    if(s!=='__all__'&&l.idServico!==s)return false;
    if(b&&norm(nomeDoCliente(l)).indexOf(b)===-1)return false;
    return true;
  }
  function passaSituacao(l){
    var s=el('cb-selSituacao').value;
    if(s==='todas')return true;
    if(s==='pendentes')return PENDENTES.indexOf(l.situacao)!==-1;
    return l.situacao===s;
  }

  // ── Situação como texto ──
  function rotuloSituacao(l){
    if(l.situacao==='em_aberto'&&l.ajuste&&l.ajuste.Tipo==='Parcial')return 'Parcial';
    if(l.situacao==='quitada'&&l.ajuste&&l.ajuste.Tipo==='Desconto'&&l.pago<l.valor)return 'Quitada com desconto';
    return NOMES_SITUACAO[l.situacao]||l.situacao;
  }
  function etiqueta(l){ return '<span class="cb-tag '+l.situacao+'">'+esc(rotuloSituacao(l))+'</span>'; }

  // ── Tabela ──
  function ordenar(lista){
    var c=ordem.col,m=ordem.dir==='asc'?1:-1;
    function t(l){ return l.data?l.data.getTime():0; }
    lista.sort(function(a,b){
      var r=0;
      if(c==='data')r=t(a)-t(b);
      else if(c==='dias')r=a.dias-b.dias;
      else if(c==='cliente')r=nomeDoCliente(a).localeCompare(nomeDoCliente(b),'pt-BR');
      else if(c==='servico')r=(nomeServico[a.idServico]||'').localeCompare(nomeServico[b.idServico]||'','pt-BR');
      else if(c==='vendedor')r=(nomeVendedor[a.idVendedorResp]||'').localeCompare(nomeVendedor[b.idVendedorResp]||'','pt-BR');
      else if(c==='valor')r=a.valor-b.valor;
      else if(c==='pago')r=a.pago-b.pago;
      else if(c==='saldo')r=a.saldo-b.saldo;
      else if(c==='situacao')r=rotuloSituacao(a).localeCompare(rotuloSituacao(b),'pt-BR');
      return r!==0?m*r:t(a)-t(b);
    });
  }
  function renderCabecalho(){
    document.querySelectorAll('#cb-tabela th.sortable').forEach(function(th){
      var col=th.getAttribute('data-sort');
      th.classList.toggle('sort-active',col===ordem.col);
      th.querySelector('.arrow-sort').classList.toggle('asc',col===ordem.col&&ordem.dir==='asc');
    });
  }
  function renderPaginacao(total){
    var p=el('cb-paginacao');
    if(total<=1){ p.innerHTML=''; return; }
    p.innerHTML='<button type="button" id="cb-pgAnterior" '+(pagina<=1?'disabled':'')+'>‹ Anterior</button>'+
      '<span class="pg-info">Página '+pagina+' de '+total+'</span>'+
      '<button type="button" id="cb-pgProxima" '+(pagina>=total?'disabled':'')+'>Próxima ›</button>';
    el('cb-pgAnterior').addEventListener('click',function(){ if(pagina>1){ pagina--; renderTudo(); } });
    el('cb-pgProxima').addEventListener('click',function(){ if(pagina<total){ pagina++; renderTudo(); } });
  }
  function renderTudo(){
    renderCabecalho();
    var vazio=el('cb-vazio'),tabela=el('cb-tabela'),tbody=el('cb-tbody');
    if(!Object.keys(bruto).every(function(k){ return bruto[k]; })){
      vazio.style.display='';vazio.innerHTML='<p>Carregando…</p>';
      tabela.style.display='none';el('cb-paginacao').innerHTML='';
      return;
    }
    // KPIs seguem vendedor, serviço e busca, mas não a situação escolhida.
    var base=linhas.filter(filtroBase);
    var ids={};base.forEach(function(l){ ids[l.idAgendamento]=true; });
    var vendasDoFiltro=vendasLista.filter(function(v){
      return Array.isArray(v.OsVinculadas)&&v.OsVinculadas.some(function(id){ return ids[id]; });
    });
    var r=window.SGCobrancaRegra.resumo(base,vendasDoFiltro,new Date());
    el('cb-kpiAberto').textContent=dinheiro(r.emAberto.valor);
    el('cb-kpiAbertoSub').textContent=r.emAberto.qtd+' OS';
    el('cb-kpiDif').textContent=dinheiro(r.diferencas.valor);
    el('cb-kpiDifSub').textContent=r.diferencas.qtd+' OS';
    el('cb-kpiSemValor').textContent=r.semValor.qtd;
    el('cb-kpiRecebido').textContent=dinheiro(r.recebidoMes);

    var lista=base.filter(passaSituacao);
    ordenar(lista);
    el('cb-hint').textContent=lista.length+' OS no filtro';
    if(!lista.length){
      vazio.style.display='';vazio.innerHTML='<p>Nenhuma OS encontrada com esses filtros.</p>';
      tabela.style.display='none';el('cb-paginacao').innerHTML='';
      return;
    }
    vazio.style.display='none';tabela.style.display='';
    var total=Math.max(1,Math.ceil(lista.length/POR_PAGINA));
    if(pagina>total)pagina=total;
    var inicio=(pagina-1)*POR_PAGINA;
    tbody.innerHTML=lista.slice(inicio,inicio+POR_PAGINA).map(function(l){
      return '<tr class="ag-row-click" tabindex="0" data-id="'+esc(l.idAgendamento)+'">'+
        '<td>'+fmtData(l.data)+'</td>'+
        '<td class="num">'+l.dias+'</td>'+
        '<td>'+esc(nomeDoCliente(l))+'</td>'+
        '<td>'+esc(nomeServico[l.idServico]||l.idServico||'—')+'</td>'+
        '<td>'+esc(nomeVendedor[l.idVendedorResp]||'—')+'</td>'+
        '<td class="num">'+(l.situacao==='sem_valor'?'—':dinheiro(l.valor))+'</td>'+
        '<td class="num">'+dinheiro(l.pago)+'</td>'+
        '<td class="num">'+dinheiro(l.saldo)+'</td>'+
        '<td>'+etiqueta(l)+'</td>'+
      '</tr>';
    }).join('');
    tbody.querySelectorAll('.ag-row-click').forEach(function(tr){
      var abrir=function(){ abrirDetalhe(tr.getAttribute('data-id')); };
      tr.addEventListener('click',abrir);
      tr.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); abrir(); } });
    });
    renderPaginacao(total);
  }

  // ── Gravação otimista ──
  // escritas: [{acao,payload}]; ov: {vendas:{id:campos},agend:{id:campos}}.
  // A tela já mostra o resultado; se o servidor recusar, o overlay sai e volta o que era.
  function executar(escritas,ov,msgOk){
    var vend=ov.vendas||{},agend=ov.agend||{};
    Object.keys(vend).forEach(function(id){ sobrepor.vendas[id]=vend[id]; });
    Object.keys(agend).forEach(function(id){ sobrepor.agend[id]=agend[id]; });
    function soltar(){
      Object.keys(vend).forEach(function(id){ delete sobrepor.vendas[id]; });
      Object.keys(agend).forEach(function(id){ delete sobrepor.agend[id]; });
    }
    recalcular();
    window.SGViewPanel.fechar();
    toast(msgOk);
    Promise.all(escritas.map(function(e){ return window.SGAuth.apiCall(e.acao,e.payload); })).then(function(rs){
      soltar();
      var falha=rs.filter(function(r){ return !r||!r.ok; })[0];
      recalcular();
      if(falha)toast(falha.erro||'Não foi possível salvar — a alteração foi desfeita.',true);
    }).catch(function(err){
      soltar();
      recalcular();
      toast('Erro de conexão — a alteração foi desfeita: '+err.message,true);
    });
  }
  function osDaVenda(v){ return Array.isArray(v.OsVinculadas)?v.OsVinculadas.slice():[]; }
  function gravarVinculo(idVenda,osVinculadas,msgOk){
    var ov={vendas:{}};ov.vendas[idVenda]={OsVinculadas:osVinculadas};
    executar([{acao:'vincularVendaOS',payload:{idVenda:idVenda,osVinculadas:osVinculadas}}],ov,msgOk);
  }
  function gravarAjuste(l,ajuste,msgOk){
    var ov={agend:{}};ov.agend[l.idAgendamento]={CobrancaAjuste:ajuste};
    executar([{acao:'salvarAjusteCobrancaOS',payload:{idAgendamento:l.idAgendamento,ajuste:ajuste}}],ov,msgOk);
  }
  function gravarValor(l,valor,idVenda){
    var ov={agend:{},vendas:{}};
    ov.agend[l.idAgendamento]={Valor:valor};
    var escritas=[{acao:'definirValorOS',payload:{idAgendamento:l.idAgendamento,valor:valor}}];
    if(idVenda){
      var arr=[l.idAgendamento];
      ov.vendas[idVenda]={OsVinculadas:arr};
      escritas.push({acao:'vincularVendaOS',payload:{idVenda:idVenda,osVinculadas:arr}});
    }
    executar(escritas,ov,'Valor da OS definido.');
  }
  function pedirAjuste(l,tipo){
    var dif=Math.round((l.valor-l.pago)*100)/100;
    var desconto=tipo==='Desconto';
    window.SGConfirm.perguntar({
      titulo:desconto?'Confirmar desconto':'Confirmar pagamento parcial',
      mensagem:desconto?'Registrar os '+dinheiro(dif)+' de diferença como desconto? A OS passa a constar como quitada.':'Registrar que o cliente pagou só parte? Os '+dinheiro(dif)+' continuam em aberto.',
      textoConfirmar:'Confirmar'
    }).then(function(ok){
      if(!ok)return;
      var s=sessao();
      gravarAjuste(l,{Tipo:tipo,Valor:dif,Por:s.nome||'',PorId:s.idVendedor||'',Em:new Date().toISOString()},desconto?'Desconto registrado.':'Pagamento parcial registrado.');
    });
  }

  // ── Detalhe ──
  function linhaDetalhe(rotulo,valor){ return '<div class="ad-row"><span class="dl">'+rotulo+'</span><span class="dv">'+valor+'</span></div>'; }
  function htmlCandidatas(l,rotuloBotao){
    if(!l.candidatas.length)return '<div class="hint">Nenhuma venda sem vínculo para esse cliente.</div>';
    return l.candidatas.map(function(id){
      var v=mapaVendas[id];
      if(!v)return '';
      return '<div class="cb-candidata"><span>'+fmtData(window.SGCobrancaRegra.parseData(v.DataVenda))+' · '+esc(nomeServico[v.IdServico]||v.IdServico||'—')+' · '+dinheiro(v.Valor)+'</span>'+
        '<button type="button" class="reset-btn" data-acao="candidata" data-venda="'+esc(id)+'">'+rotuloBotao+'</button></div>';
    }).join('');
  }
  function abrirDetalhe(id){
    var l=linhas.filter(function(x){ return x.idAgendamento===id; })[0];
    if(!l)return;
    var admin=souAdmin(),a=mapaAg[id]||{};
    var html='<div class="ad-section">'+
      '<div style="margin-bottom:8px;">'+etiqueta(l)+'</div>'+
      linhaDetalhe('Data da OS',fmtData(l.data)+' ('+l.dias+' dias)')+
      linhaDetalhe('Cliente',esc(nomeDoCliente(l)))+
      linhaDetalhe('Serviço',esc(nomeServico[l.idServico]||l.idServico||'—'))+
      linhaDetalhe('Vendedor',esc(nomeVendedor[l.idVendedorResp]||'—'))+
      linhaDetalhe('Técnico',esc(nomeVendedor[a.TecnicoResponsavel]||'—'))+
      linhaDetalhe('Valor da OS',l.situacao==='sem_valor'?'Não definido':dinheiro(l.valor))+
      linhaDetalhe('Pago',dinheiro(l.pago))+
      linhaDetalhe('Saldo',dinheiro(l.saldo))+
      (l.ajuste?linhaDetalhe(l.ajuste.Tipo==='Desconto'?'Desconto':'Pagamento parcial',dinheiro(l.ajuste.Valor)+(l.ajuste.Por?' · '+esc(l.ajuste.Por):'')):'')+
    '</div>';

    html+='<div class="ad-section"><h4>Vendas ligadas</h4>';
    if(!l.vendasLigadas.length)html+='<div class="hint">Nenhuma venda ligada a essa OS.</div>';
    l.vendasLigadas.forEach(function(x){
      var v=mapaVendas[x.idVenda]||{};
      html+=linhaDetalhe(fmtData(window.SGCobrancaRegra.parseData(v.DataVenda)),dinheiro(x.valorAplicado)+(x.automatico?' · automático':''));
      if(x.automatico){
        html+='<div class="cb-acoes">'+
          '<button type="button" class="connect-btn" data-acao="confirmar" data-venda="'+esc(x.idVenda)+'">Confirmar vínculo</button>'+
          '<button type="button" class="reset-btn" data-acao="desfazer" data-venda="'+esc(x.idVenda)+'">Desfazer</button></div>';
      }
    });
    html+='</div>';

    var acoes='';
    if(l.saldo>0&&l.situacao!=='sem_valor'&&l.situacao!=='quitada'){
      acoes+='<div class="cb-acoes"><button type="button" class="connect-btn" data-acao="pagamento">Registrar pagamento</button></div>';
    }
    if(l.situacao==='a_conferir'){
      acoes+='<h4 style="margin-top:14px;">Qual venda paga essa OS?</h4>'+htmlCandidatas(l,'Ligar esta venda');
    }
    if(l.situacao==='diferenca'){
      acoes+=admin?
        '<div class="cb-acoes"><button type="button" class="reset-btn" data-acao="desconto">Foi desconto</button><button type="button" class="reset-btn" data-acao="parcial">Pagamento parcial</button></div>':
        '<div class="hint" style="margin-top:10px;">Aguardando confirmação do administrador.</div>';
    }
    if(l.ajuste&&admin){
      acoes+='<div class="cb-acoes"><button type="button" class="reset-btn" data-acao="desfazerAjuste">Desfazer ajuste</button></div>';
    }
    if(l.situacao==='sem_valor'){
      if(admin){
        acoes+='<h4 style="margin-top:14px;">Usar o valor de uma venda</h4>'+htmlCandidatas(l,'Usar esta venda')+
          '<div class="cb-valor-direto"><input type="number" id="cb-valorDireto" step="0.01" min="0" placeholder="Valor da OS" aria-label="Valor da OS">'+
          '<button type="button" class="connect-btn" data-acao="salvarValor">Salvar valor</button></div>';
      }else{
        acoes+='<div class="hint" style="margin-top:10px;">Aguardando o administrador definir o valor da OS.</div>';
      }
    }
    if(acoes)html+='<div class="ad-section">'+acoes+'</div>';

    window.SGViewPanel.abrir({
      titulo:nomeDoCliente(l),
      html:html,
      onAbrir:function(){
        var corpo=el('vw-body');
        corpo.onclick=function(e){
          var b=e.target.closest?e.target.closest('button[data-acao]'):null;
          if(!b)return;
          var acao=b.getAttribute('data-acao'),idVenda=b.getAttribute('data-venda');
          if(acao==='pagamento'){
            window.SGViewPanel.fechar();
            window.SGVendas.abrirNovaVendaParaOS({idCliente:l.idCliente,nomeCliente:nomeDoCliente(l),idServico:l.idServico,valor:l.saldo,idsOS:[l.idAgendamento],idVendedor:l.idVendedorResp});
          }else if(acao==='confirmar'){
            gravarVinculo(idVenda,[l.idAgendamento],'Vínculo confirmado.');
          }else if(acao==='desfazer'){
            gravarVinculo(idVenda,[],'Vínculo desfeito.');
          }else if(acao==='candidata'&&l.situacao==='a_conferir'){
            var v=mapaVendas[idVenda]||{},arr=osDaVenda(v);
            if(arr.indexOf(l.idAgendamento)===-1)arr.push(l.idAgendamento);
            gravarVinculo(idVenda,arr,'Venda ligada à OS.');
          }else if(acao==='candidata'){
            var vv=mapaVendas[idVenda]||{};
            gravarValor(l,window.SGCobrancaRegra.numero(vv.Valor),idVenda);
          }else if(acao==='desconto'){
            pedirAjuste(l,'Desconto');
          }else if(acao==='parcial'){
            pedirAjuste(l,'Parcial');
          }else if(acao==='desfazerAjuste'){
            gravarAjuste(l,null,'Ajuste desfeito.');
          }else if(acao==='salvarValor'){
            var valor=parseFloat(el('cb-valorDireto').value);
            if(!(valor>0)){ toast('Informe um valor maior que zero.',true); return; }
            gravarValor(l,valor,null);
          }
        };
      }
    });
  }

  // ── Eventos ──
  function ligar(){
    var tabs=[el('v-tabRelatorio'),el('v-tabCobranca')];
    tabs[0].addEventListener('click',function(){ mostrarAba('relatorio'); });
    tabs[1].addEventListener('click',function(){ mostrarAba('cobranca'); });
    tabs.forEach(function(t,i){
      t.addEventListener('keydown',function(e){
        if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight'&&e.key!=='Home'&&e.key!=='End')return;
        e.preventDefault();
        var alvo=e.key==='Home'?0:e.key==='End'?1:1-i;
        mostrarAba(alvo===1?'cobranca':'relatorio',true);
      });
    });
    ['cb-selVendedor','cb-selServico','cb-selSituacao'].forEach(function(id){
      el(id).addEventListener('change',function(){ pagina=1; renderTudo(); });
    });
    el('cb-busca').addEventListener('input',function(){ pagina=1; renderTudo(); });
    el('cb-reset').addEventListener('click',function(){
      el('cb-selVendedor').value='__all__';el('cb-selServico').value='__all__';
      el('cb-busca').value='';el('cb-selSituacao').value='pendentes';
      pagina=1;renderTudo();
    });
    document.querySelectorAll('#cb-tabela th.sortable').forEach(function(th){
      th.addEventListener('click',function(){
        var col=th.getAttribute('data-sort');
        if(ordem.col===col)ordem.dir=ordem.dir==='asc'?'desc':'asc';
        else{ ordem.col=col; ordem.dir=(col==='cliente'||col==='servico'||col==='vendedor'||col==='situacao'||col==='data')?'asc':'desc'; }
        renderTudo();
      });
    });
    // A aba lembrada só assina quando a tela de Vendas vira a tela ativa.
    new MutationObserver(iniciarSePreciso).observe(el('view-vendas'),{attributes:true,attributeFilter:['class']});
    if(lerAba()==='cobranca')mostrarAba('cobranca');
  }
  ligar();
})();
