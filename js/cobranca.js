// ════ COBRANÇA (sub-aba da tela de Vendas) ════
// Lista as OS concluídas que ainda não têm venda registrada (ou têm só parte do
// valor). A regra mora em js/cobranca-regra.js; aqui fica a tela e as gravações.
(function(){
  var ABA_KEY='sg_vendas_aba';
  var POR_PAGINA=10;
  var NOMES_SITUACAO={em_aberto:'Em aberto',diferenca:'Diferença a confirmar',a_conferir:'A conferir',sem_valor:'Valor não definido',quitada:'Quitada'};

  // Apps Script: cria o link da InfinitePay (a chave fica lá, nunca na página).
  var API_URL='https://script.google.com/macros/s/AKfycbzFCy8PyBZBODgA34xrlLTVUUNhKBIlguJT3ectH7Yus-VW1n41GcCclc5q_Yj0Di2O7g/exec';
  var iniciado=false,pendenteRecalculo=false,aoCarregar=[];
  var bruto={agendamentos:null,vendas:null,clientes:null,vendedores:null,servicos:null,planos:null};
  // Escrita otimista: o que a pessoa acabou de gravar vale por cima do dado do
  // listener até o servidor responder. Os documentos do listener são compartilhados
  // com outras telas, então nunca são alterados no lugar: o overlay vale só aqui.
  var sobrepor={vendas:{},agend:{}};
  var linhas=[],vendasLista=[],mapaVendas={},mapaAg={},nomeCliente={},nomeVendedor={},nomeServico={};
  var planosLinhas=[],mapaPlanos={},mapaClientes={};
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
    if(!viewVendasAtiva()||el('v-painelCobranca').style.display==='none')return;
    assinar();
  }
  function assinar(){
    if(iniciado)return;
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
    setTimeout(function(){ pendenteRecalculo=false; recalcular(); },0); // as coleções chegam em sequência: um cálculo só
  }
  function aplicar(base,ov){ return ov?Object.assign({},base,ov):base; }
  function recalcular(){
    var carregado=Object.keys(bruto).every(function(k){ return bruto[k]; });
    if(!carregado){ renderTudo(); return; }
    var esperando=aoCarregar;aoCarregar=[];
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
    mapaClientes={};bruto.clientes.forEach(function(c){ if(c.IdCliente)mapaClientes[c.IdCliente]=c; });
    // Mensalidades: plano marcado para cobrança, ou que ainda tem mês em aberto.
    mapaPlanos={};
    planosLinhas=bruto.planos.filter(function(p){
      var cm=p.CobrancaMes||{};
      if(!window.SGCobrancaRegra.planoEntra(p)&&cm.Ativa!==true)return false;
      return souAdmin()||String((mapaClientes[p.IdCliente]||{})['Vendedor Responsavel']||'')===String(meu);
    });
    planosLinhas.forEach(function(p){ mapaPlanos[p.IdPlano]=p; });
    popularSelects();
    renderTudo();
    esperando.forEach(function(f){ f(); });
  }
  // Para quem chega de fora da aba (assinatura da OS, notificação): assina as
  // coleções se ainda não assinou e espera o primeiro cálculo.
  function quandoCarregar(){
    assinar();
    return new Promise(function(ok){
      if(Object.keys(bruto).every(function(k){ return bruto[k]; }))ok(); else aoCarregar.push(ok);
    });
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
    // Período pela data da OS; com período escolhido, OS sem data fica de fora.
    var de=window.SGCobrancaRegra.parseData(el('cb-dataDe').value),ate=window.SGCobrancaRegra.parseData(el('cb-dataAte').value);
    if((de||ate)&&!l.data)return false;
    if(de&&l.data<de)return false;
    if(ate&&l.data>ate)return false;
    return true;
  }
  function passaSituacao(l){
    return window.SGCobrancaRegra.GRUPOS[el('cb-selSituacao').value].indexOf(l.situacao)!==-1;
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
    renderPlanos();
    // KPIs seguem todos os filtros, inclusive situação e período.
    var lista=linhas.filter(function(l){ return filtroBase(l)&&passaSituacao(l); });
    var r=window.SGCobrancaRegra.resumo(lista);
    el('cb-kpiAberto').textContent=dinheiro(r.emAberto.valor);
    el('cb-kpiAbertoSub').textContent=r.emAberto.qtd+' OS';
    el('cb-kpiDif').textContent=dinheiro(r.diferencas.valor);
    el('cb-kpiDifSub').textContent=r.diferencas.qtd+' OS';
    el('cb-kpiQuitado').textContent=dinheiro(r.quitado.valor);
    el('cb-kpiQuitadoSub').textContent=r.quitado.qtd+' OS';
    el('cb-kpiDesconto').textContent=dinheiro(r.desconto.valor);
    el('cb-kpiDescontoSub').textContent=r.desconto.qtd+' OS';

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
      // Parcial confirmado já manda a primeira cobrança do saldo (pedido do Felipe).
      if(!desconto)enviarPelaSolarGreen(l,'parcial');
    });
  }

  // ── WhatsApp ──
  // Pela Solar Green (API oficial) ou, de reserva, pelo WhatsApp aberto no aparelho
  // de quem toca. Lembrete que a Meta recusa vira notificação para o vendedor, que
  // abre o WhatsApp dele com o texto e o link (Apps Script, cobrancaPedirReserva_).
  function chamarServidor(acao,dados){
    var u=window.firebase&&firebase.auth().currentUser;
    if(!u)return Promise.reject(new Error('Sessão expirada. Entre de novo.'));
    return u.getIdToken().then(function(t){
      return fetch(API_URL,{method:'POST',cache:'no-store',body:JSON.stringify(Object.assign({action:acao,idToken:t},dados))});
    }).then(function(r){ return r.json(); });
  }
  // Só cobra o que está em aberto de verdade: "A conferir" pode já estar paga, e
  // a diferença só entra depois que o admin confirma que foi pagamento parcial.
  function cobravel(l){
    return l.saldo>=1&&(l.situacao==='em_aberto'||(l.situacao==='diferenca'&&l.ajuste&&l.ajuste.Tipo==='Parcial'));
  }
  function clienteDe(l){ return bruto.clientes.filter(function(c){ return c.IdCliente===l.idCliente; })[0]||{}; }
  // Reserva: manda pelo WhatsApp de quem clicou. A janela abre já no clique
  // (senão o navegador bloqueia) e recebe o endereço do WhatsApp depois.
  function enviarWhats(l,tipo){
    var tel=window.SGCobrancaRegra.telefoneWhatsApp(clienteDe(l).Telefone);
    if(!tel){ toast('O cliente não tem um celular válido no cadastro.',true); return; }
    if(tipo!=='obrigado'&&!cobravel(l)){ toast('Essa OS não tem cobrança em aberto.',true); return; }
    var janela=window.open('','_blank');
    var a=mapaAg[l.idAgendamento]||{},link=a.CobrancaLink;
    var saldo=Math.round(l.saldo*100)/100;
    var precisaLink=tipo!=='obrigado'&&(!link||!a.CobrancaAtiva||Math.abs(window.SGCobrancaRegra.numero(link.Valor)-saldo)>0.009);
    var passo=tipo==='obrigado'?Promise.resolve({ok:true,url:''}):
      precisaLink?chamarServidor('cobrancaCriarLink',{idAgendamento:l.idAgendamento}):Promise.resolve({ok:true,url:link.Url});
    passo.then(function(r){
      if(!r||!r.ok)throw new Error((r&&r.erro)||'Não foi possível criar o link de pagamento.');
      var texto=window.SGCobrancaRegra.montarTexto(tipo,{nome:nomeDoCliente(l),servico:nomeServico[l.idServico]||'',data:l.data,valor:r.valor||saldo,pago:l.pago,link:r.url});
      if(tipo!=='obrigado'&&a.CobrancaPdfFileId)texto+='\n\nOrdem de serviço: https://drive.google.com/file/d/'+a.CobrancaPdfFileId+'/view';
      var destino='https://wa.me/'+tel+'?text='+encodeURIComponent(texto);
      if(janela)janela.location.href=destino; else location.href=destino;
      var s=sessao();
      window.SGAuth.apiCall('registrarEnvioCobranca',{idAgendamento:l.idAgendamento,envio:{Tipo:tipo,Em:new Date().toISOString(),Por:s.nome||'',PorId:s.idVendedor||''}});
    }).catch(function(err){
      if(janela)janela.close();
      toast(err.message,true);
    });
  }
  // Envio pelo número da Solar Green (API oficial, 2026-11-02): o servidor cria o
  // link se precisar e manda o modelo. tipo vazio = texto da hora.
  // pdfFileId: PDF da OS recém-gerado, que vai anexado no primeiro aviso.
  function enviarPelaSolarGreen(l,tipo,pdfFileId){
    toast('Enviando a mensagem pelo WhatsApp da Solar Green…');
    chamarServidor('cobrancaEnviar',{idAgendamento:l.idAgendamento,tipo:tipo||'',pdfFileId:pdfFileId||''}).then(function(r){
      if(r&&r.ok)toast('Mensagem enviada pelo WhatsApp da Solar Green.');
      else toast((r&&r.erro)||'Não foi possível enviar a mensagem.',true);
    }).catch(function(err){ toast('Erro de conexão: '+err.message,true); });
  }
  function htmlWhats(l){
    var a=mapaAg[l.idAgendamento]||{},html='';
    var envios=Array.isArray(a.CobrancaEnvios)?a.CobrancaEnvios:[];
    var ultimo=envios.length?envios[envios.length-1]:null;
    var info=a.CobrancaLink?linhaDetalhe('Link de pagamento',dinheiro(a.CobrancaLink.Valor)+(a.CobrancaAtiva?' · ativo':' · encerrado')):'';
    if(ultimo)info+=linhaDetalhe('Última mensagem',esc(new Date(ultimo.Em).toLocaleString('pt-BR'))+(ultimo.Por?' · '+esc(ultimo.Por):'')+(ultimo.Erro?' · <span class="hint">não saiu: '+esc(ultimo.Erro)+'</span>':''));
    if(cobravel(l)){
      var tipo=window.SGCobrancaRegra.tipoPelaHora(new Date());
      html+='<div class="cb-acoes"><button type="button" class="connect-btn" data-acao="api" data-tipo="">Enviar cobrança agora</button>'+
        '<button type="button" class="reset-btn" data-acao="whats" data-tipo="'+tipo+'">Mandar pelo meu WhatsApp</button></div>';
    }else if(l.situacao==='quitada'&&a.CobrancaAgradecer&&!a.CobrancaAgradecidoEm){
      html+='<div class="cb-acoes"><button type="button" class="connect-btn" data-acao="api" data-tipo="obrigado">Enviar agradecimento</button></div>';
    }
    if(!html&&!info)return '';
    return '<h4 style="margin-top:14px;">Cobrança pelo WhatsApp</h4>'+info+html;
  }

  // ── Mensalidade dos planos (2026-11-03) ──
  // Os planos marcados na tela de Planos recebem a cobrança do mês pelo WhatsApp
  // da Solar Green (Apps Script, cobrancaPlanos_). Aqui fica a lista, o envio na
  // hora, a reserva pelo WhatsApp de quem clica e o pagamento validado à mão.
  var NOMES_PLANO={em_aberto:'Em aberto',pago:'Pago no mês',aguardando:'Aguardando vencimento'};
  var CLASSE_PLANO={em_aberto:'em_aberto',pago:'quitada',aguardando:'sem_valor'};
  function vendedorDoPlano(p){ return (mapaClientes[p.IdCliente]||{})['Vendedor Responsavel']||''; }
  function nomeDoPlano(p){ return nomeCliente[p.IdCliente]||p.IdCliente||'—'; }
  function renderPlanos(){
    var tbody=el('cb-plTbody'),v=el('cb-selVendedor').value,b=norm(el('cb-busca').value),hoje=new Date();
    var lista=planosLinhas.filter(function(p){
      if(v!=='__all__'&&String(vendedorDoPlano(p))!==v)return false;
      return !b||norm(nomeDoPlano(p)).indexOf(b)!==-1;
    }).map(function(p){ return {p:p,s:window.SGCobrancaRegra.situacaoPlano(p,hoje)}; });
    lista.sort(function(a,c){ return (a.s.situacao==='em_aberto'?0:1)-(c.s.situacao==='em_aberto'?0:1)||nomeDoPlano(a.p).localeCompare(nomeDoPlano(c.p),'pt-BR'); });
    var abertos=lista.filter(function(x){ return x.s.situacao==='em_aberto'; });
    el('cb-plHint').textContent=lista.length+(lista.length===1?' plano':' planos')+' · '+abertos.length+' em aberto · '+dinheiro(abertos.reduce(function(t,x){ return t+x.s.valor; },0));
    el('cb-plVazio').style.display=lista.length?'none':'';
    el('cb-plTabela').style.display=lista.length?'':'none';
    tbody.innerHTML=lista.map(function(x){
      var p=x.p,s=x.s;
      var rotulo=NOMES_PLANO[s.situacao]+(s.situacao==='em_aberto'?' · '+s.nomes:'');
      return '<tr class="ag-row-click" tabindex="0" data-plano="'+esc(p.IdPlano)+'">'+
        '<td>'+esc(nomeDoPlano(p))+'</td>'+
        '<td>'+esc(nomeVendedor[vendedorDoPlano(p)]||'—')+'</td>'+
        '<td class="num">'+dinheiro(window.SGCobrancaRegra.numero(p.Valor))+'</td>'+
        '<td>Dia '+window.SGCobrancaRegra.diaVencimentoPlano(p)+'</td>'+
        '<td class="num">'+(s.situacao==='em_aberto'?dinheiro(s.valor):'—')+'</td>'+
        '<td><span class="cb-tag '+CLASSE_PLANO[s.situacao]+'">'+esc(rotulo)+'</span></td>'+
      '</tr>';
    }).join('');
  }
  function enviarPlanoSolarGreen(id,tipo){
    toast('Enviando a mensagem pelo WhatsApp da Solar Green…');
    chamarServidor('cobrancaPlanoEnviar',{idPlano:id,tipo:tipo||''}).then(function(r){
      if(r&&r.ok)toast('Mensagem enviada pelo WhatsApp da Solar Green.');
      else toast((r&&r.erro)||'Não foi possível enviar a mensagem.',true);
    }).catch(function(err){ toast('Erro de conexão: '+err.message,true); });
  }
  // Reserva: o servidor devolve o link e o texto prontos; a janela abre no clique.
  function enviarPlanoWhats(id){
    var p=mapaPlanos[id]||{};
    var tel=window.SGCobrancaRegra.telefoneWhatsApp((mapaClientes[p.IdCliente]||{}).Telefone);
    if(!tel){ toast('O cliente não tem um celular válido no cadastro.',true); return; }
    var janela=window.open('','_blank');
    chamarServidor('cobrancaPlanoCriarLink',{idPlano:id}).then(function(r){
      if(!r||!r.ok)throw new Error((r&&r.erro)||'Não foi possível criar o link de pagamento.');
      var destino='https://wa.me/'+tel+'?text='+encodeURIComponent(r.texto);
      if(janela)janela.location.href=destino; else location.href=destino;
    }).catch(function(err){
      if(janela)janela.close();
      toast(err.message,true);
    });
  }
  // Pagamento fora do link (dinheiro, Pix direto), inclusive adiantado: quita os
  // meses em aberto ou, sem nenhum, o próximo mês. Lança a venda (pedido do Felipe, 03/11).
  function validarPagamentoPlano(id){
    var p=mapaPlanos[id]||{};
    var meses=window.SGCobrancaRegra.mesesParaValidar(p,new Date());
    var valor=window.SGCobrancaRegra.numero(p.Valor)*meses.length;
    var aberto=window.SGCobrancaRegra.situacaoPlano(p,new Date()).situacao==='em_aberto';
    window.SGConfirm.perguntar({
      titulo:'Validar pagamento',
      mensagem:'Registrar que '+nomeDoPlano(p)+' pagou '+dinheiro(valor)+' da mensalidade de '+window.SGCobrancaRegra.nomeMeses(meses)+(aberto?'':' (adiantado)')+'? A venda é lançada, a cobrança desse mês para e o cliente recebe o agradecimento.',
      textoConfirmar:'Validar pagamento'
    }).then(function(ok){
      if(!ok)return;
      window.SGViewPanel.fechar();
      toast('Registrando o pagamento…');
      chamarServidor('cobrancaPlanoValidar',{idPlano:id}).then(function(r){
        if(r&&r.ok)toast('Pagamento de '+window.SGCobrancaRegra.nomeMeses(r.meses)+' registrado e venda lançada.');
        else toast((r&&r.erro)||'Não foi possível registrar.',true);
      }).catch(function(err){ toast('Erro de conexão: '+err.message,true); });
    });
  }
  function abrirPlano(id){
    var p=mapaPlanos[id];
    if(!p){ toast('Esse plano não está na cobrança mensal.',true); return; }
    var s=window.SGCobrancaRegra.situacaoPlano(p,new Date()),cm=p.CobrancaMes||{};
    var envios=Array.isArray(p.CobrancaEnvios)?p.CobrancaEnvios:[];
    var ultimo=envios.length?envios[envios.length-1]:null;
    var html='<div class="ad-section">'+
      '<div style="margin-bottom:8px;"><span class="cb-tag '+CLASSE_PLANO[s.situacao]+'">'+esc(NOMES_PLANO[s.situacao])+'</span></div>'+
      linhaDetalhe('Cliente',esc(nomeDoPlano(p)))+
      linhaDetalhe('Vendedor',esc(nomeVendedor[vendedorDoPlano(p)]||'—'))+
      linhaDetalhe('Mensalidade',dinheiro(window.SGCobrancaRegra.numero(p.Valor)))+
      linhaDetalhe('Vencimento','Todo dia '+window.SGCobrancaRegra.diaVencimentoPlano(p)+(p.DataAssinatura?'':' (plano sem data de assinatura)'))+
      (s.situacao==='em_aberto'?linhaDetalhe('Em aberto',esc(s.nomes)+' · '+dinheiro(s.valor)):'')+
      (cm.PagoEm&&s.situacao!=='em_aberto'?linhaDetalhe('Último pagamento',esc(new Date(cm.PagoEm).toLocaleString('pt-BR'))+(cm.ValidadoPor?' · validado por '+esc(cm.ValidadoPor):' · pelo link')):'')+
      (s.situacao!=='em_aberto'&&cm.PagoEm&&p.CobrancaUltimoMes?linhaDetalhe('Pago até',esc(window.SGCobrancaRegra.nomeMeses([p.CobrancaUltimoMes])+' de '+String(p.CobrancaUltimoMes).slice(0,4))):'')+
      (ultimo?linhaDetalhe('Última mensagem',esc(new Date(ultimo.Em).toLocaleString('pt-BR'))+(ultimo.Por?' · '+esc(ultimo.Por):'')+(ultimo.Erro?' · <span class="hint">não saiu: '+esc(ultimo.Erro)+'</span>':'')):'')+
    '</div>';
    var acoes='';
    if(window.SGCobrancaRegra.planoEntra(p)){
      acoes+='<div class="hint">'+(s.situacao==='em_aberto'?'Os lembretes saem às 8h, 15h e 18h (sábado 8h e 12h) até o pagamento.':'Sem mês em aberto: o botão já cobra a mensalidade deste mês.')+'</div>'+
        '<div class="cb-acoes"><button type="button" class="connect-btn" data-acao="planoApi">Enviar cobrança agora</button>'+
        '<button type="button" class="reset-btn" data-acao="planoWhats">Mandar pelo meu WhatsApp</button></div>';
    }
    if(souAdmin()&&(s.situacao==='em_aberto'||window.SGCobrancaRegra.planoEntra(p))){
      var mv=window.SGCobrancaRegra.mesesParaValidar(p,new Date());
      acoes+='<div class="cb-acoes"><button type="button" class="reset-btn" data-acao="planoValidar">Validar pagamento ('+esc(window.SGCobrancaRegra.nomeMeses(mv))+')</button></div>'+
        '<div class="hint">Para pagamento em dinheiro ou Pix direto, inclusive antes do vencimento. Lança a venda.</div>';
    }
    if(acoes)html+='<div class="ad-section"><h4>Cobrança pelo WhatsApp</h4>'+acoes+'</div>';
    window.SGViewPanel.abrir({
      titulo:nomeDoPlano(p),
      html:html,
      onAbrir:function(){
        el('vw-body').onclick=function(e){
          var b=e.target.closest?e.target.closest('button[data-acao]'):null;
          if(!b)return;
          var acao=b.getAttribute('data-acao');
          if(acao==='planoApi')enviarPlanoSolarGreen(id,'');
          else if(acao==='planoWhats')enviarPlanoWhats(id);
          else if(acao==='planoValidar')validarPagamentoPlano(id);
        };
      }
    });
  }

  // ── Link avulso (2026-11-03) ──
  // Qualquer valor, sem OS. Com cliente e serviço, o pagamento lança a venda
  // sozinho; sem eles, só avisa quem criou.
  function textoAvulso(nome,descricao,valor,url){
    var primeiro=String(nome||'').trim().split(/\s+/)[0]||'';
    primeiro=primeiro?primeiro.charAt(0).toUpperCase()+primeiro.slice(1).toLowerCase():'';
    return 'Olá'+(primeiro?', '+primeiro:'')+'! Aqui é da Solar Green. Segue o link para o pagamento de '+descricao+', no valor de '+dinheiro(valor)+', por Pix ou cartão:\n\n'+url;
  }
  function htmlLinkPronto(url,tel,texto){
    return '<div class="ad-section"><h4>Link criado</h4>'+
      '<input type="text" readonly id="cb-avUrl" class="cb-link-pronto" value="'+esc(url)+'" aria-label="Link de pagamento">'+
      '<div class="cb-acoes"><button type="button" class="connect-btn" data-acao="copiar">Copiar link</button>'+
      (tel?'<a class="reset-btn" target="_blank" rel="noopener" href="https://wa.me/'+tel+'?text='+encodeURIComponent(texto)+'">Mandar pelo meu WhatsApp</a>':'')+
      '</div></div>';
  }
  function carregarAvulsos(){
    if(!el('cb-avLista'))return;
    chamarServidor('cobrancaAvulsos',{}).then(function(r){
      var box=el('cb-avLista');
      if(!box)return;
      if(!r||!r.ok){ box.innerHTML='<div class="hint">'+esc((r&&r.erro)||'Não foi possível carregar.')+'</div>'; return; }
      if(!r.links.length){ box.innerHTML='<div class="hint">Nenhum link avulso ainda.</div>'; return; }
      box.innerHTML=r.links.map(function(x){
        var quem=x.idCliente?(nomeCliente[x.idCliente]||''):'';
        return '<div class="cb-candidata"><span>'+fmtData(new Date(x.criadoEm))+' · '+esc(x.descricao)+(quem?' · '+esc(quem):'')+' · '+dinheiro(x.valor)+(x.parcelas?' · até '+x.parcelas+'x sem juros':'')+
          (x.criadoPorNome&&souAdmin()?' · '+esc(x.criadoPorNome):'')+'</span>'+
          (x.pagoEm?'<span class="cb-tag quitada">Pago</span>':'<span class="cb-acoes" style="margin-top:0;"><button type="button" class="reset-btn" data-acao="copiarDaLista" data-url="'+esc(x.url)+'">Copiar</button></span>')+
        '</div>';
      }).join('');
    }).catch(function(err){ var box=el('cb-avLista'); if(box)box.innerHTML='<div class="hint">Erro de conexão: '+esc(err.message)+'</div>'; });
  }
  function copiar(texto){
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(texto).then(function(){ toast('Link copiado.'); },function(){ toast('Não deu para copiar; selecione o link e copie.',true); });
    }else toast('Selecione o link e copie.',true);
  }
  function abrirAvulso(){
    var servicos=bruto.servicos.slice().sort(function(a,b){ return String(a['Nome Servico']||'').localeCompare(String(b['Nome Servico']||''),'pt-BR'); });
    var html='<div class="ad-section">'+
      '<div class="uform-field"><label>Valor (R$)</label><input type="number" id="cb-avValor" step="0.01" min="1" placeholder="0,00"></div>'+
      '<div class="uform-field"><label>O que está sendo cobrado</label><input type="text" id="cb-avDescricao" maxlength="80" placeholder="Ex.: visita técnica extra"></div>'+
      '<div class="uform-field"><label>Cliente (opcional)</label><div class="combo-wrap">'+
        '<input type="text" id="cb-avClienteBusca" placeholder="Digite o nome do cliente…" autocomplete="off">'+
        '<input type="hidden" id="cb-avCliente"><div class="combo-dropdown hidden" id="cb-avClienteDropdown"></div></div></div>'+
      '<div class="uform-field"><label>Serviço (opcional)</label><select id="cb-avServico"><option value="">Sem serviço</option>'+
        servicos.map(function(x){ return '<option value="'+esc(x.IdServico)+'">'+esc(x['Nome Servico']||x.IdServico)+'</option>'; }).join('')+'</select></div>'+
      '<div class="uform-field"><label>Parcelas sem juros para o cliente (a Solar Green assume a taxa)</label><select id="cb-avParcelas">'+
        '<option value="">Pela tabela do valor</option>'+
        [1,2,3,4,5,6,7,8,9,10,11,12].map(function(n){ return '<option value="'+n+'">'+n+'x'+(n===1?' (só à vista sem juros)':'')+'</option>'; }).join('')+'</select>'+
        '<div class="hint" id="cb-avParcelasHint" style="margin-top:4px;"></div></div>'+
      '<div class="hint">Com cliente e serviço, o pagamento lança a venda sozinho. Sem eles, você recebe o aviso e lança a venda se for o caso.</div>'+
      '<div class="cb-acoes"><button type="button" class="connect-btn" data-acao="criarAvulso">Criar link</button></div>'+
    '</div><div id="cb-avPronto"></div>'+
    '<div class="ad-section"><h4>Links avulsos recentes</h4><div id="cb-avLista"><div class="hint">Carregando…</div></div></div>';
    window.SGViewPanel.abrir({
      titulo:'Link de pagamento avulso',
      html:html,
      onAbrir:function(){
        window.SGCombo.criar({
          inputId:'cb-avClienteBusca', hiddenId:'cb-avCliente', dropdownId:'cb-avClienteDropdown',
          getOpcoes:function(){
            return bruto.clientes.filter(function(c){ return c.IdCliente; })
              .map(function(c){ return {id:c.IdCliente,label:c['Nome Razao Social']||c.Nome||c.IdCliente}; })
              .sort(function(a,b){ return a.label.localeCompare(b.label,'pt-BR'); });
          }
        });
        carregarAvulsos();
        var dicaParcelas=function(){
          var v=parseFloat(el('cb-avValor').value),n=v>=1?window.SGCobrancaRegra.parcelasPelaTabela(v):0;
          el('cb-avParcelasHint').textContent=el('cb-avParcelas').value?'Acima disso, o juro do parcelamento fica com o cliente.':(n?'Pela tabela, para esse valor: até '+n+'x sem juros.':'');
        };
        el('cb-avValor').addEventListener('input',dicaParcelas);
        el('cb-avParcelas').addEventListener('change',dicaParcelas);
        el('vw-body').onclick=function(e){
          var b=e.target.closest?e.target.closest('button[data-acao]'):null;
          if(!b)return;
          var acao=b.getAttribute('data-acao');
          if(acao==='copiar')copiar(el('cb-avUrl').value);
          else if(acao==='copiarDaLista')copiar(b.getAttribute('data-url'));
          else if(acao==='criarAvulso')criarAvulso(b);
        };
      }
    });
  }
  function criarAvulso(b){
    var valor=parseFloat(el('cb-avValor').value),descricao=el('cb-avDescricao').value.trim();
    // Nome digitado sem escolher da lista não vale como cliente.
    var idCliente=el('cb-avClienteBusca').value.trim()?el('cb-avCliente').value:'';
    if(!(valor>=1)){ toast('O valor mínimo do link é R$ 1,00.',true); return; }
    if(!descricao){ toast('Escreva o que está sendo cobrado.',true); return; }
    b.disabled=true;b.textContent='Criando…';
    chamarServidor('cobrancaLinkAvulso',{valor:valor,descricao:descricao,idCliente:idCliente,idServico:el('cb-avServico').value,parcelas:el('cb-avParcelas').value}).then(function(r){
      b.disabled=false;b.textContent='Criar link';
      if(!r||!r.ok){ toast((r&&r.erro)||'Não foi possível criar o link.',true); return; }
      var cli=mapaClientes[idCliente]||{};
      var tel=window.SGCobrancaRegra.telefoneWhatsApp(cli.Telefone);
      el('cb-avPronto').innerHTML=htmlLinkPronto(r.url,tel,textoAvulso(cli['Nome Razao Social']||cli.Nome,descricao,r.valor,r.url));
      carregarAvulsos();
    }).catch(function(err){ b.disabled=false;b.textContent='Criar link'; toast('Erro de conexão: '+err.message,true); });
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
  // OS que uma venda paga hoje (vínculo gravado ou automático).
  function osPagasPela(idVenda){
    return linhas.filter(function(x){ return x.vendasLigadas.some(function(y){ return y.idVenda===idVenda; }); });
  }
  // Escolha livre (pedido do Felipe, 2026-10-30): qualquer venda do cliente, de
  // qualquer serviço, a mais próxima da data da OS primeiro. Venda que já paga
  // outra OS pode ser movida para esta ou ligada às duas (como o plano anual).
  function htmlEscolherVenda(l){
    var jaLigadas={};l.vendasLigadas.forEach(function(x){ jaLigadas[x.idVenda]=true; });
    var base=l.data?l.data.getTime():0;
    var lista=vendasLista.filter(function(v){ return v.IdCliente===l.idCliente&&!jaLigadas[v.IdVenda]; }).map(function(v){
      var d=window.SGCobrancaRegra.parseData(v.DataVenda);
      return {v:v,d:d,dist:d?Math.abs(d.getTime()-base):Infinity};
    }).sort(function(a,b){ return a.dist-b.dist; });
    if(!lista.length)return '<div class="hint">Nenhuma outra venda registrada para esse cliente.</div>';
    return lista.map(function(x){
      var outras=osPagasPela(x.v.IdVenda);
      var nota=outras.length?'<br><span class="hint">Já paga: '+outras.map(function(o){ return fmtData(o.data)+' '+esc(nomeServico[o.idServico]||'—'); }).join(', ')+'</span>':'';
      var botoes=outras.length?
        '<button type="button" class="reset-btn" data-acao="mover" data-venda="'+esc(x.v.IdVenda)+'">Mover para esta</button>'+
        '<button type="button" class="reset-btn" data-acao="somar" data-venda="'+esc(x.v.IdVenda)+'">Ligar às duas</button>':
        '<button type="button" class="reset-btn" data-acao="ligar" data-venda="'+esc(x.v.IdVenda)+'">Ligar</button>';
      return '<div class="cb-candidata"><span>'+fmtData(x.d)+' · '+esc(nomeServico[x.v.IdServico]||x.v.IdServico||'—')+' · '+dinheiro(x.v.Valor)+nota+'</span>'+
        '<span class="cb-acoes" style="margin-top:0;flex-wrap:nowrap;">'+botoes+'</span></div>';
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
      }else{
        html+='<div class="cb-acoes"><button type="button" class="reset-btn" data-acao="desligar" data-venda="'+esc(x.idVenda)+'">Desligar desta OS</button></div>';
      }
    });
    html+='</div>';

    var acoes=htmlWhats(l);
    if(l.saldo>0&&l.situacao!=='sem_valor'&&l.situacao!=='quitada'){
      acoes+='<div class="cb-acoes"><button type="button" class="connect-btn" data-acao="pagamento">Registrar pagamento</button></div>';
    }
    if(l.situacao!=='sem_valor'){
      acoes+='<h4 style="margin-top:14px;">Escolher a venda que paga essa OS</h4>'+htmlEscolherVenda(l);
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
          if(acao==='api'){
            enviarPelaSolarGreen(l,b.getAttribute('data-tipo'));
          }else if(acao==='whats'){
            enviarWhats(l,b.getAttribute('data-tipo'));
          }else if(acao==='pagamento'){
            window.SGViewPanel.fechar();
            window.SGVendas.abrirNovaVendaParaOS({idCliente:l.idCliente,nomeCliente:nomeDoCliente(l),idServico:l.idServico,valor:l.saldo,idsOS:[l.idAgendamento],idVendedor:l.idVendedorResp});
          }else if(acao==='confirmar'){
            gravarVinculo(idVenda,[l.idAgendamento],'Vínculo confirmado.');
          }else if(acao==='desfazer'){
            gravarVinculo(idVenda,[],'Vínculo desfeito.');
          }else if(acao==='ligar'||acao==='somar'){
            // "Ligar às duas" parte do que a venda paga hoje, inclusive o automático.
            var arr=acao==='somar'?osPagasPela(idVenda).map(function(o){ return o.idAgendamento; }):osDaVenda(mapaVendas[idVenda]||{});
            if(arr.indexOf(l.idAgendamento)===-1)arr.push(l.idAgendamento);
            gravarVinculo(idVenda,arr,'Venda ligada à OS.');
          }else if(acao==='mover'){
            gravarVinculo(idVenda,[l.idAgendamento],'Venda movida para esta OS.');
          }else if(acao==='desligar'){
            var resto=osDaVenda(mapaVendas[idVenda]||{}).filter(function(x){ return x!==l.idAgendamento; });
            gravarVinculo(idVenda,resto,'Venda desligada da OS.');
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
    ['cb-selVendedor','cb-selServico','cb-selSituacao','cb-dataDe','cb-dataAte'].forEach(function(id){
      el(id).addEventListener('change',function(){ pagina=1; renderTudo(); });
    });
    el('cb-busca').addEventListener('input',function(){ pagina=1; renderTudo(); });
    el('cb-avulsoBtn').addEventListener('click',function(){ quandoCarregar().then(abrirAvulso); });
    var plBody=el('cb-plTbody');
    plBody.addEventListener('click',function(e){ var tr=e.target.closest('tr[data-plano]'); if(tr)abrirPlano(tr.getAttribute('data-plano')); });
    plBody.addEventListener('keydown',function(e){ var tr=e.target.closest('tr[data-plano]'); if(tr&&e.key==='Enter'){ e.preventDefault(); abrirPlano(tr.getAttribute('data-plano')); } });
    el('cb-reset').addEventListener('click',function(){
      el('cb-selVendedor').value='__all__';el('cb-selServico').value='__all__';
      el('cb-busca').value='';el('cb-selSituacao').value='pendentes';
      el('cb-dataDe').value='';el('cb-dataAte').value='';
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

  function linhaDaOS(id){ return linhas.filter(function(x){ return x.idAgendamento===id; })[0]; }
  window.SGCobranca={
    // OS enviada para assinatura: a primeira mensagem, com o link, sai pelo
    // WhatsApp da Solar Green.
    enviarInicio:function(id,pdfFileId){
      enviarPelaSolarGreen({idAgendamento:id},'inicio',pdfFileId);
    },
    // Clique na notificação (pagamento recebido, cliente respondeu): abre o detalhe da OS.
    abrirDaNotificacao:function(id){
      if(window.SGControllerSwitchTo)window.SGControllerSwitchTo('vendas');
      mostrarAba('cobranca');
      quandoCarregar().then(function(){ if(linhaDaOS(id))abrirDetalhe(id); else toast('Essa OS não está mais na cobrança.',true); });
    },
    // Clique na notificação de mensalidade (pagamento, resposta do cliente).
    abrirPlano:function(id){
      if(window.SGControllerSwitchTo)window.SGControllerSwitchTo('vendas');
      mostrarAba('cobranca');
      quandoCarregar().then(function(){ abrirPlano(id); });
    }
  };
})();
