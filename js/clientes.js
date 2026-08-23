// ════ CLIENTES (cadastro) ════
(function(){
  var _initialized=false;
  var _epoca=window.SGEpoca.criar();
  var clientes=[], vendedoresMap={};
  var editandoId=null;
  var paginaAtual=1, ITENS_POR_PAGINA=10;
  var buscaFiltro='';
  var sortState={col:'nome',dir:'asc'};
  var APP_VERSION='2026-07-16-1';

  function apiCall(action,extra){ return window.SGAuth.apiCall(action,extra); }
  function escapeHtml(s){ return window.SGUtil.escapeHtml(s); }
  function nomeVendedor(id){ var v=vendedoresMap[id]; return v?v.Nome:'—'; }

  /**
   * Cada tela guarda sua própria cópia dos clientes (carregada só quando a
   * tela é visitada), então salvar um cliente aqui não atualiza sozinho o
   * que Funil/Agendamentos/Planos/Vendas/Custos da Venda têm em memória —
   * cada uma tinha sua própria "foto" dos clientes, tirada em momentos
   * diferentes, e nada avisava as outras quando uma mudava. Por isso essa
   * função avisa todos os módulos que já tiverem sido carregados nessa
   * sessão: cada um recebe o registro atualizado (atualizarClienteCache),
   * corrige o próprio mapa em memória E redesenha a lista/painel que estiver
   * na tela AGORA — não só na próxima vez que a pessoa visitar aquela aba.
   * É isso que faz um nome corrigido em Clientes aparecer na hora em
   * qualquer outra tela já aberta, sem precisar recarregar a página.
   */
  function propagarAtualizacaoCliente(clienteObj){
    [window.funilApp,window.agendamentosApp,window.planosApp,window.vendasApp,window.custosVendaApp].forEach(function(app){
      if(app&&app.atualizarClienteCache)app.atualizarClienteCache(clienteObj);
    });
  }

  function sortClientesRows(lista){
    var col=sortState.col,dir=sortState.dir,mult=dir==='asc'?1:-1;
    lista.sort(function(a,b){
      var va,vb;
      if(col==='nome'){va=a['Nome Razao Social']||a.Nome||'';vb=b['Nome Razao Social']||b.Nome||'';return mult*va.localeCompare(vb,'pt-BR');}
      if(col==='tipo'){va=a['Tipo Pessoa']||'';vb=b['Tipo Pessoa']||'';return mult*va.localeCompare(vb,'pt-BR');}
      if(col==='telefone'){va=a.Telefone||'';vb=b.Telefone||'';return mult*va.localeCompare(vb,'pt-BR');}
      if(col==='email'){va=a.Email||'';vb=b.Email||'';return mult*va.localeCompare(vb,'pt-BR');}
      if(col==='vendedor'){va=nomeVendedor(a['Vendedor Responsavel']);vb=nomeVendedor(b['Vendedor Responsavel']);return mult*va.localeCompare(vb,'pt-BR');}
      if(col==='status'){va=a['Status Cliente']||'';vb=b['Status Cliente']||'';return mult*va.localeCompare(vb,'pt-BR');}
      return 0;
    });
  }
  function updateSortHeadersCl(){
    document.querySelectorAll('#view-clientes th.sortable').forEach(function(th){
      var col=th.getAttribute('data-sort');
      th.classList.toggle('sort-active',col===sortState.col);
      var a=th.querySelector('.arrow-sort');
      a.textContent=(col===sortState.col)?(sortState.dir==='asc'?'▴':'▾'):'▾';
    });
  }

  function renderPaginacao(totalPaginas){
    var el=document.getElementById('cl-paginacao');
    if(!el)return;
    if(totalPaginas<=1){el.innerHTML='';return;}
    el.innerHTML='<button type="button" id="cl-pgAnterior" '+(paginaAtual<=1?'disabled':'')+'>‹ Anterior</button><span class="pg-info">Página '+paginaAtual+' de '+totalPaginas+'</span><button type="button" id="cl-pgProxima" '+(paginaAtual>=totalPaginas?'disabled':'')+'>Próxima ›</button>';
    var a=document.getElementById('cl-pgAnterior'); if(a)a.addEventListener('click',function(){if(paginaAtual>1){paginaAtual--;render();}});
    var p=document.getElementById('cl-pgProxima'); if(p)p.addEventListener('click',function(){if(paginaAtual<totalPaginas){paginaAtual++;render();}});
  }

  function normalizaBuscaCl(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function textoBuscavelCliente(c){
    return normalizaBuscaCl([
      c['Nome Razao Social']||c.Nome, c['Tipo Pessoa'], c.Telefone, c.Email,
      nomeVendedor(c['Vendedor Responsavel']), c['Status Cliente']
    ].join(' | '));
  }

  // KPIs sempre sobre a lista COMPLETA (nunca sobre o resultado da busca) —
  // assim continuam respondendo "quanto no total, por status" mesmo enquanto
  // a pessoa usa a busca pra achar um cliente específico embaixo.
  function renderKpisClientes(){
    var porStatus={Lead:0,Cliente:0,Inativo:0};
    clientes.forEach(function(c){
      var s=(c['Status Cliente']||'').trim();
      if(porStatus[s]!==undefined)porStatus[s]++;
    });
    document.getElementById('cl-kpiTotal').textContent=clientes.length;
    document.getElementById('cl-kpiLead').textContent=porStatus.Lead;
    document.getElementById('cl-kpiCliente').textContent=porStatus.Cliente;
    document.getElementById('cl-kpiInativo').textContent=porStatus.Inativo;
  }

  function render(){
    renderKpisClientes();
    var termo=normalizaBuscaCl(buscaFiltro).trim();
    var filtrados=clientes.filter(function(c){
      if(!termo)return true;
      return textoBuscavelCliente(c).indexOf(termo)!==-1;
    });
    sortClientesRows(filtrados);
    updateSortHeadersCl();

    var totalPaginas=Math.max(1,Math.ceil(filtrados.length/ITENS_POR_PAGINA));
    if(paginaAtual>totalPaginas)paginaAtual=totalPaginas;
    if(paginaAtual<1)paginaAtual=1;
    var inicio=(paginaAtual-1)*ITENS_POR_PAGINA;
    var pagina=filtrados.slice(inicio,inicio+ITENS_POR_PAGINA);

    document.getElementById('cl-tableHint').textContent=filtrados.length+' cliente(s) encontrado(s)';

    var tbody=document.getElementById('cl-tbody');
    if(!pagina.length){
      tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--ink-faint);padding:30px;">Nenhum cliente encontrado.</td></tr>';
      renderPaginacao(0);
      return;
    }
    tbody.innerHTML=pagina.map(function(c){
      var status=(c['Status Cliente']||'—').trim();
      var statusClass=status.toLowerCase()==='cliente'?'concluido':(status.toLowerCase()==='inativo'?'cancelado':'agendado');
      return '<tr class="ag-row-click" data-id="'+escapeHtml(c.IdCliente)+'">'+
        '<td>'+escapeHtml(c['Nome Razao Social']||c.Nome||'—')+'</td>'+
        '<td>'+escapeHtml(c['Tipo Pessoa']||'—')+'</td>'+
        '<td>'+escapeHtml(c.Telefone||'—')+'</td>'+
        '<td style="font-size:12.5px;color:var(--ink-soft);">'+escapeHtml(c.Email||'—')+'</td>'+
        '<td>'+escapeHtml(nomeVendedor(c['Vendedor Responsavel']))+'</td>'+
        '<td><span class="ag-status-tag '+statusClass+'">'+escapeHtml(status||'—')+'</span></td>'+
      '</tr>';
    }).join('');
    tbody.querySelectorAll('.ag-row-click').forEach(function(tr){
      tr.addEventListener('click',function(){ try{ abrirVisualizacaoCliente(tr.getAttribute('data-id')); }catch(err){ console.error('abrirVisualizacaoCliente falhou:',err); (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Não foi possível abrir esse registro (erro: '+err.message+'). Atualize a página e tente de novo.',true); } });
    });
    renderPaginacao(totalPaginas);
    document.getElementById('cl-lastUpdate').textContent='Atualizado em '+new Date().toLocaleDateString('pt-BR')+' às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }

  function wireComboVendedor(valorInicial){
    window.SGCombo.criar({
      inputId:'cm-vendedorBusca', hiddenId:'cm-vendedor', dropdownId:'cm-vendedorDropdown',
      getOpcoes:function(){
        return Object.keys(vendedoresMap).map(function(id){return vendedoresMap[id];})
          .filter(function(v){return (v.Status||'').trim().toLowerCase()!=='inativo';})
          .sort(function(a,b){return (a.Nome||'').localeCompare(b.Nome||'','pt-BR');})
          .map(function(v){return {id:v.IdVendedor,label:v.Nome};});
      },
      valorInicial:valorInicial
    });
  }

  function parseBRDateCl(str){ return window.SGUtil.parseBRDate(str); }
  function dateKeyDoISOCl(d){ return window.SGUtil.dateKey(d); }

  /** Enquanto "Sim" estiver marcado, o CPF Equatorial acompanha o CPF do
   *  cliente ao vivo — se a pessoa mudar de ideia e marcar "Não", libera
   *  o campo pra digitar o CPF de outra pessoa. */
  function sincronizarTitularEquatorial(){
    var sim=document.getElementById('cm-titularSim').checked;
    var campoCpfEq=document.getElementById('cm-cpfEquatorial');
    if(sim){
      campoCpfEq.value=document.getElementById('cm-cpfCnpj').value;
      campoCpfEq.readOnly=true;
    }else{
      campoCpfEq.readOnly=false;
    }
  }

  /**
   * Painel de VISUALIZAÇÃO do cliente — abre ao clicar numa linha da tabela.
   * Só leitura; o lápis abre abrirModalCliente(id) pra editar de verdade.
   */
  function abrirVisualizacaoCliente(idCliente){
    var c=clientes.filter(function(x){return String(x.IdCliente)===String(idCliente);})[0];
    if(!c)return;
    editandoId=idCliente;
    var status=c['Status Cliente']||'Lead';
    var html='<div class="ad-section">'+
      '<div class="ad-row"><span class="dl">Nome / Razão Social</span><span class="dv">'+escapeHtml(c['Nome Razao Social']||c.Nome||'—')+'</span></div>'+
      '<div class="ad-row"><span class="dl">Tipo de pessoa</span><span class="dv">'+escapeHtml(c['Tipo Pessoa']||'—')+'</span></div>'+
      '<div class="ad-row"><span class="dl">Telefone</span><span class="dv">'+escapeHtml(c.Telefone||'—')+'</span></div>'+
      '<div class="ad-row"><span class="dl">CPF/CNPJ</span><span class="dv">'+escapeHtml(c['CPF ou CNPJ']||'—')+'</span></div>'+
      '<div class="ad-row"><span class="dl">E-mail</span><span class="dv">'+escapeHtml(c.Email||'—')+'</span></div>'+
      '<div class="ad-row"><span class="dl">Endereço</span><span class="dv">'+escapeHtml(c.Endereco||'—')+'</span></div>'+
      '<div class="ad-row"><span class="dl">Status</span><span class="dv">'+escapeHtml(status)+'</span></div>'+
      '<div class="ad-row"><span class="dl">Vendedor responsável</span><span class="dv">'+escapeHtml(nomeVendedor(c['Vendedor Responsavel']))+'</span></div>'+
    '</div>';

    window.SGViewPanel.abrir({
      titulo:c['Nome Razao Social']||c.Nome||'Cliente',
      html:html,
      onEditar:function(){ abrirModalCliente(idCliente); },
      onExcluir:function(){ editandoId=idCliente; excluirCliente(); }
    });
  }

  function abrirModalCliente(idCliente){
    var c=idCliente?clientes.filter(function(x){return String(x.IdCliente)===String(idCliente);})[0]:null;
    editandoId=idCliente||null;
    document.getElementById('clienteModalTitle').textContent=c?'Editar cliente':'Novo cliente';
    document.getElementById('cm-nome').value=c?(c['Nome Razao Social']||c.Nome||''):'';
    document.getElementById('cm-tipoPessoa').value=c?(c['Tipo Pessoa']||'Física'):'Física';
    document.getElementById('cm-telefone').value=c?window.SGUtil.formatarTelefone(c.Telefone||''):'';
    document.getElementById('cm-cpfCnpj').value=c?window.SGUtil.formatarCpfCnpj(c['CPF ou CNPJ']||''):'';
    document.getElementById('cm-email').value=c?(c.Email||''):'';
    document.getElementById('cm-endereco').value=c?(c.Endereco||''):'';
    document.getElementById('cm-status').value=c?(c['Status Cliente']||'Lead'):'Lead';
    document.getElementById('cm-excluirBtn').style.display=c?'block':'none';
    document.getElementById('cm-msg').textContent='';
    document.getElementById('cm-avisoDuplicado').classList.add('hidden');
    document.getElementById('cm-avisoDuplicadoDetalhe').textContent='';
    document.getElementById('cm-avisoDuplicadoDetalhe').className='';
    document.getElementById('cm-avisoDuplicadoDetalhe').onclick=null;
    document.getElementById('cm-confirmarDiferente').checked=false;

    var cpfEq=c?(c.CPFEquatorial||''):'';
    var dtNascEq=c?parseBRDateCl(c.DataNascimentoEquatorial):null;
    document.getElementById('cm-dataNascimentoEquatorial').value=dtNascEq?dateKeyDoISOCl(dtNascEq):'';
    // se o CPF Equatorial já registrado bate com o CPF do próprio cliente, assume "Sim";
    // se tem CPF Equatorial mas é diferente, assume "Não"; sem nenhum registro ainda, deixa em branco
    var cpfCliente=(c&&c['CPF ou CNPJ']||'').replace(/\D/g,'');
    var cpfEqLimpo=cpfEq.replace(/\D/g,'');
    document.getElementById('cm-titularSim').checked=false;
    document.getElementById('cm-titularNao').checked=false;
    if(cpfEqLimpo){
      if(cpfEqLimpo===cpfCliente&&cpfCliente)document.getElementById('cm-titularSim').checked=true;
      else document.getElementById('cm-titularNao').checked=true;
    }
    document.getElementById('cm-cpfEquatorial').value=window.SGUtil.formatarCpfCnpj(cpfEq);
    document.getElementById('cm-cpfEquatorial').readOnly=document.getElementById('cm-titularSim').checked;

    var idVend=c?c['Vendedor Responsavel']:'';
    wireComboVendedor(idVend&&vendedoresMap[idVend]?{id:idVend,label:vendedoresMap[idVend].Nome}:null);
    document.getElementById('clienteModal').classList.remove('hidden');
  }
  function fecharModalCliente(){ document.getElementById('clienteModal').classList.add('hidden'); document.getElementById('clienteModal').style.zIndex=''; editandoId=null; }

  /**
   * Verifica se o telefone digitado bate com outro cliente já cadastrado, e
   * mostra/esconde a caixinha de aviso na hora — não só quando clica em
   * Salvar. Assim a caixinha só fica visível enquanto o problema realmente
   * existir; ao preencher endereço, marcar a confirmação, trocar o telefone
   * ou abrir o formulário de novo, ela some sozinha.
   */
  function verificarDuplicidadeCliente(){
    var caixa=document.getElementById('cm-avisoDuplicado');
    var detalheEl=document.getElementById('cm-avisoDuplicadoDetalhe');
    var telefone=document.getElementById('cm-telefone').value.trim();
    var endereco=document.getElementById('cm-endereco').value.trim();
    var confirmado=document.getElementById('cm-confirmarDiferente').checked;

    function esconder(){
      caixa.classList.add('hidden');
      detalheEl.textContent=''; detalheEl.className=''; detalheEl.onclick=null;
    }

    // Só faz sentido checar em cadastro NOVO (editar um cliente que já
    // existe nunca vai "bater" com ele mesmo); e só enquanto o telefone
    // estiver preenchido, sem endereço e sem confirmação manual.
    if(editandoId||!telefone||endereco||confirmado){ esconder(); return null; }

    var duplicado=window.SGUtil.encontrarClienteMesmoTelefone(telefone,clientes,editandoId);
    if(!duplicado){ esconder(); return null; }

    var nomeDuplicado=duplicado['Nome Razao Social']||duplicado.Nome||'(sem nome)';
    caixa.classList.remove('hidden');
    detalheEl.className='sg-msg-fix';
    detalheEl.innerHTML='Encontrado: "'+escapeHtml(nomeDuplicado)+'" — telefone '+escapeHtml(duplicado.Telefone||'—')+' (mesmos 8 últimos dígitos). <strong>Clique aqui pra abrir esse cliente.</strong>';
    var idDuplicado=duplicado.IdCliente;
    detalheEl.onclick=function(){ abrirModalCliente(idDuplicado); };
    return duplicado;
  }

  function salvarCliente(){
    var nome=document.getElementById('cm-nome').value.trim();
    var tipoPessoa=document.getElementById('cm-tipoPessoa').value;
    var telefone=document.getElementById('cm-telefone').value.trim();
    var msgEl=document.getElementById('cm-msg');
    if(!nome){ msgEl.className='uform-msg error'; msgEl.textContent='Nome é obrigatório.'; return; }
    if(!tipoPessoa){ msgEl.className='uform-msg error'; msgEl.textContent='Tipo de pessoa é obrigatório.'; return; }
    if(!telefone){ msgEl.className='uform-msg error'; msgEl.textContent='Telefone é obrigatório.'; return; }

    var cpfCnpj=document.getElementById('cm-cpfCnpj').value.trim();
    var email=document.getElementById('cm-email').value.trim();
    var endereco=document.getElementById('cm-endereco').value.trim();
    var statusCliente=document.getElementById('cm-status').value;
    var vendedorResponsavel=document.getElementById('cm-vendedor').value;
    var cpfEquatorial=document.getElementById('cm-cpfEquatorial').value.trim();
    var dataNascimentoEquatorialVal=document.getElementById('cm-dataNascimentoEquatorial').value;

    var ehNovo=!editandoId;
    // Só checa duplicidade em cadastro NOVO — editar um cliente que já existe
    // não deveria disparar isso (ele nunca vai "bater" com ele mesmo, mas por
    // segurança já exclui o próprio ID da busca de qualquer forma).
    var confirmado=document.getElementById('cm-confirmarDiferente').checked;
    if(ehNovo&&!endereco&&!confirmado){
      var duplicado=verificarDuplicidadeCliente();
      if(duplicado){
        msgEl.className='uform-msg error'; msgEl.textContent='Já existe um contato cadastrado para esse número';
        return;
      }
    }
    document.getElementById('cm-avisoDuplicado').classList.add('hidden');

    var idCliente=editandoId||window.SGId.gerar();
    var registroAnterior=!ehNovo?clientes.filter(function(c){return String(c.IdCliente)===String(idCliente);})[0]:null;
    var registroAnteriorCopia=registroAnterior?Object.assign({},registroAnterior):null;

    var registroNovo={
      IdCliente:idCliente, 'Nome Razao Social':nome, 'Tipo Pessoa':tipoPessoa, Telefone:telefone,
      'CPF ou CNPJ':cpfCnpj, Email:email, Endereco:endereco, 'Status Cliente':statusCliente,
      'Vendedor Responsavel':vendedorResponsavel, CPFEquatorial:cpfEquatorial,
      DataNascimentoEquatorial:dataNascimentoEquatorialVal?dataNascimentoEquatorialVal.split('-').reverse().join('/'):''
    };
    var indice=clientes.findIndex(function(c){return String(c.IdCliente)===String(idCliente);});
    if(indice===-1)clientes.push(registroNovo);
    else clientes[indice]=registroNovo;
    _epoca.marcar();
    propagarAtualizacaoCliente(registroNovo);

    fecharModalCliente();
    render();
    window.SGToast.mostrar(ehNovo?'Cliente criado.':'Cliente atualizado.');

    apiCall('salvarCliente',{
      idCliente:idCliente,
      nome:nome, tipoPessoa:tipoPessoa, telefone:telefone,
      cpfCnpj:cpfCnpj, email:email, endereco:endereco,
      statusCliente:statusCliente, vendedorResponsavel:vendedorResponsavel,
      confirmarClienteDiferente:confirmado,
      cpfEquatorial:cpfEquatorial, dataNascimentoEquatorial:dataNascimentoEquatorialVal
    }).then(function(resp){
      if(!resp||!resp.ok){
        if(ehNovo)clientes=clientes.filter(function(c){return String(c.IdCliente)!==String(idCliente);});
        else{ var idx=clientes.findIndex(function(c){return String(c.IdCliente)===String(idCliente);}); if(idx!==-1&&registroAnteriorCopia)clientes[idx]=registroAnteriorCopia; }
        _epoca.marcar();
        render();
        window.SGToast.mostrar((resp&&resp.erro)||'Não foi possível salvar — a alteração foi desfeita.',true);
        return;
      }
      if(resp.idCliente&&String(resp.idCliente)!==String(idCliente)){
        var idx2=clientes.findIndex(function(c){return String(c.IdCliente)===String(idCliente);});
        if(idx2!==-1)clientes[idx2].IdCliente=resp.idCliente;
        render();
      }
    }).catch(function(err){
      if(ehNovo)clientes=clientes.filter(function(c){return String(c.IdCliente)!==String(idCliente);});
      else{ var idx=clientes.findIndex(function(c){return String(c.IdCliente)===String(idCliente);}); if(idx!==-1&&registroAnteriorCopia)clientes[idx]=registroAnteriorCopia; }
      _epoca.marcar();
      render();
      window.SGToast.mostrar('Erro de conexão — a alteração foi desfeita: '+err.message,true);
    });
  }

  function excluirCliente(){
    if(!editandoId)return;
    window.SGConfirm.perguntar({titulo:'Excluir cliente',mensagem:'Tem certeza que deseja excluir esse cliente? Essa ação não pode ser desfeita.',textoConfirmar:'Excluir',perigo:true}).then(function(ok){
      if(!ok)return;
      var idCliente=editandoId;
      var registroAnterior=clientes.filter(function(c){return String(c.IdCliente)===String(idCliente);})[0];

      clientes=clientes.filter(function(c){return String(c.IdCliente)!==String(idCliente);});
      _epoca.marcar();
      fecharModalCliente();
      if(window.SGViewPanel)window.SGViewPanel.fechar();
      render();
      window.SGToast.mostrar('Cliente excluído.');

      apiCall('excluirCliente',{idCliente:idCliente}).then(function(resp){
        if(!resp||!resp.ok){
          if(window.SGUtil.ehNaoEncontrado(resp&&resp.erro))return;
          if(registroAnterior)clientes.push(registroAnterior);
          _epoca.marcar();
          render();
          window.SGToast.mostrar((resp&&resp.erro)||'Não foi possível excluir — o cliente foi restaurado.',true);
        }
      }).catch(function(err){
        if(registroAnterior)clientes.push(registroAnterior);
        _epoca.marcar();
        render();
        window.SGToast.mostrar('Erro de conexão — o cliente foi restaurado: '+err.message,true);
      });
    });
  }

  function aplicarDados(resp){
    clientes=resp.clientes||[];
    vendedoresMap={};(resp.vendedores||[]).forEach(function(v){if(v.IdVendedor)vendedoresMap[v.IdVendedor]=v;});
    document.getElementById('cl-emptyState').style.display='none';
    document.getElementById('cl-appVersion').textContent='v'+APP_VERSION;
    render();
  }

  function carregar(){
    var cache=window.SGCache&&window.SGCache.get('clientes');
    var temCache=!!(cache&&cache.dados);
    if(temCache)aplicarDados(cache.dados);
    var epocaInicio=_epoca.atual();
    apiCall('getClientesData',{}).then(function(resp){
      if(!resp||!resp.ok){
        if(!temCache){document.getElementById('cl-emptyState').style.display='block';document.getElementById('cl-emptyState').querySelector('p').textContent=(resp&&resp.erro)||'Não foi possível carregar os clientes.';}
        return;
      }
      if(window.SGCache)window.SGCache.set('clientes',resp);
      if(_epoca.atual()!==epocaInicio)return;
      aplicarDados(resp);
    }).catch(function(err){
      if(!temCache){document.getElementById('cl-emptyState').style.display='block';document.getElementById('cl-emptyState').querySelector('p').textContent='Erro de conexão: '+err.message;}
    });
  }

  function init(){
    if(_initialized)return;
    if(!window.SG_SESSION)return;
    _initialized=true;
    document.getElementById('cl-novoBtn').addEventListener('click',function(){ abrirModalCliente(null); });
    document.getElementById('cm-cancelarBtn').addEventListener('click',fecharModalCliente);
    document.getElementById('cm-salvarBtn').addEventListener('click',salvarCliente);
    document.getElementById('cm-titularSim').addEventListener('change',sincronizarTitularEquatorial);
    document.getElementById('cm-titularNao').addEventListener('change',sincronizarTitularEquatorial);
    // Máscara sempre ligada ANTES do listener de sincronização abaixo — assim,
    // quando "Sim" copia o valor pro campo Equatorial, já copia formatado.
    window.SGUtil.aplicarMascara(document.getElementById('cm-telefone'),window.SGUtil.formatarTelefone);
    window.SGUtil.aplicarMascara(document.getElementById('cm-cpfCnpj'),window.SGUtil.formatarCpfCnpj);
    window.SGUtil.aplicarMascara(document.getElementById('cm-cpfEquatorial'),window.SGUtil.formatarCpfCnpj);
    document.getElementById('cm-cpfCnpj').addEventListener('input',function(){ if(document.getElementById('cm-titularSim').checked)sincronizarTitularEquatorial(); });
    document.getElementById('cm-excluirBtn').addEventListener('click',excluirCliente);
    document.getElementById('cm-telefone').addEventListener('input',verificarDuplicidadeCliente);
    document.getElementById('cm-endereco').addEventListener('input',verificarDuplicidadeCliente);
    document.getElementById('cm-confirmarDiferente').addEventListener('change',verificarDuplicidadeCliente);
    document.getElementById('clienteModal').addEventListener('click',function(e){ if(e.target.id==='clienteModal')fecharModalCliente(); });
    document.getElementById('cl-buscaFiltro').addEventListener('input',function(){ buscaFiltro=this.value; paginaAtual=1; render(); });
    document.querySelectorAll('#view-clientes th.sortable').forEach(function(th){
      th.addEventListener('click',function(){
        var col=th.getAttribute('data-sort');
        if(sortState.col===col){sortState.dir=sortState.dir==='asc'?'desc':'asc';}
        else{sortState.col=col;sortState.dir=(col==='telefone')?'desc':'asc';}
        render();
      });
    });
    carregar();
  }

  /**
   * Permite que OUTRAS telas mandem abrir a edição de um cliente específico
   * aqui (ex: clicar num aviso de erro no Funil/Agendamentos/Planos que
   * aponta pra um cadastro de cliente incompleto). Abre o modal de cliente
   * POR CIMA da tela/formulário atual — não troca de aba, não fecha nada
   * que já estava aberto, então quem tava editando algo em outro lugar não
   * perde o que já tinha preenchido. Como os dados desse módulo só carregam
   * quando a tela é visitada, garante que o carregamento comece (init() é
   * seguro de chamar de novo — ele só roda uma vez) e espera a lista de
   * clientes ficar disponível antes de abrir (até ~4,5s).
   */
  function abrirEdicaoExterna(idCliente){
    if(window.clientesApp)window.clientesApp.init(); // garante que os dados comecem a carregar, mesmo sem visitar a aba
    function tentar(){
      if(clientes&&clientes.some(function(c){return String(c.IdCliente)===String(idCliente);})){
        abrirModalCliente(idCliente);
        // fica por cima de qualquer outro modal/painel que já estivesse aberto na tela de origem
        document.getElementById('clienteModal').style.zIndex='250';
        return true;
      }
      return false;
    }
    if(tentar())return;
    var tentativas=0;
    var iv=setInterval(function(){
      tentativas++;
      if(tentar()||tentativas>30)clearInterval(iv);
    },150);
  }

  window.clientesApp={init:init,abrirEdicao:abrirEdicaoExterna};
})();


