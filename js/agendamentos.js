// ════ AGENDAMENTOS ════
(function(){
  var _initialized=false;
  var _epoca=window.SGEpoca.criar();
  var agendamentos=[],clientesMap={},vendedoresMap={},servicosMap={},templatesPorServico={},templatesPorId={},respostasPorAgendamento={};
  var editandoId=null;
  var servicoOriginalEdicao=null;
  var paginaAtual=1;
  var ITENS_POR_PAGINA=10;
  var respostasCarregadasPara={};
  var agendamentoAtual=null;

  function apiCall(action,payload){ return window.SGAuth.apiCall(action,payload); }
  function meuId(){ return window.SGUtil.meuId(); }
  function escapeHtml(s){ return window.SGUtil.escapeHtml(s); }
  function parseBRDateTime(str){
    if(!str)return null; str=String(str).trim();
    var m=str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if(m)return new Date(parseInt(m[3],10),parseInt(m[2],10)-1,parseInt(m[1],10));
    // Agendamentos criados pelo app do técnico gravam "Data Inicio" em
    // YYYY-MM-DD — sem esse branch, new Date(str) trata como UTC meia-noite
    // e exibe o dia anterior em fusos negativos (bug clássico, ver
    // segundo-cerebro/padroes/javascript-patterns.md · parseDataLocal).
    var iso=str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso)return new Date(parseInt(iso[1],10),parseInt(iso[2],10)-1,parseInt(iso[3],10));
    var d=new Date(str); return isNaN(d.getTime())?null:d;
  }
  function dateKey(d){ return window.SGUtil.dateKey(d); }
  function statusSlug(s){return (s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'-');}

  function showMsg(texto,tipo){
    var el=document.getElementById('ag-modalMsg');
    el.className='uform-msg'+(tipo?' '+tipo:'');
    el.textContent=texto||'';
  }

  function nomeCliente(id){var c=clientesMap[id];return c?(c['Nome Razao Social']||c.Nome||id):id||'—';}
  function nomeVendedor(id){var v=vendedoresMap[id];return v?(v.Nome||id):id||'—';}
  function nomeServico(id){var s=servicosMap[id];return s?(s['Nome Servico']||id):id||'—';}

  var LOGO_DATA_URI='data:image/png;base64,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';

  // Identificação da prestadora de serviço — aparece na página de aceite da
  // Ordem de Serviço, junto com os dados do cliente.
  var EMPRESA_RAZAO_SOCIAL='Solar Suporte e Serviços LTDA';
  var EMPRESA_CNPJ='53.386.274/0001-27';
  var EMPRESA_EMAIL='solargreensuporte@gmail.com';

  function ordemTemplate(t){ var o=parseInt(t&&t.Ordem,10); return isNaN(o)?999:o; }

  function respostaTemValor(r){
    return !!(r&&(String(r.RespostaTexto||'').trim()||String(r.RespostaFoto||'').trim()||String(r.RespostaQuantidade||'').trim()));
  }
  function valorDaResposta(r){
    return r.RespostaFoto||r.RespostaQuantidade||r.RespostaTexto||'';
  }

  function garantirRespostas(idAgendamento){
    if(respostasCarregadasPara[idAgendamento])return Promise.resolve();
    return apiCall('getRespostasAgendamentosVendedor',{idsAgendamentos:[idAgendamento]}).then(function(resp){
      if(resp&&resp.ok){
        (resp.respostas||[]).forEach(function(r){
          if(!r.IdAgendamento)return;
          if(!respostasPorAgendamento[r.IdAgendamento])respostasPorAgendamento[r.IdAgendamento]=[];
          respostasPorAgendamento[r.IdAgendamento].push(r);
        });
        respostasCarregadasPara[idAgendamento]=true;
      }
    }).catch(function(){ /* silencioso — quem chamou trata a ausência de dados */ });
  }

  function renderRespostasHtml(a){
    var lista=(respostasPorAgendamento[a.IdAgendamento]||[]).filter(respostaTemValor);
    if(!lista.length){
      return '<div style="font-size:12.5px;color:var(--ink-faint);padding:6px 0;">Esse agendamento ainda não tem nenhuma resposta preenchida pelo técnico.</div>';
    }
    lista.sort(function(x,y){
      return ordemTemplate(templatesPorId[x.IdTemplate])-ordemTemplate(templatesPorId[y.IdTemplate]);
    });
    return lista.map(function(r){
      var tpl=templatesPorId[r.IdTemplate];
      var pergunta=tpl?tpl.TextoPergunta:('Pergunta '+r.IdTemplate);
      var servTag=(tpl&&tpl.IdServico&&String(tpl.IdServico)!==String(a.IdServico))?('Respondido no serviço: '+nomeServico(tpl.IdServico)):'';
      var valor=valorDaResposta(r);
      var isFoto=!!r.RespostaFoto&&/^https?:\/\//.test(r.RespostaFoto);
      var valorHtml=isFoto?('<img src="'+escapeHtml(r.RespostaFoto)+'" alt="foto" style="max-width:100%;max-height:200px;border-radius:8px;margin-top:6px;display:block;cursor:pointer;">'):('<div style="font-size:13px;color:var(--ink-soft);margin-top:2px;white-space:pre-wrap;">'+escapeHtml(valor)+'</div>');
      return '<div class="resp-item">'+
        '<div class="resp-q">'+escapeHtml(pergunta)+'</div>'+
        (servTag?'<div class="resp-servtag">'+escapeHtml(servTag)+'</div>':'')+
        valorHtml+
      '</div>';
    }).join('');
  }

  /**
   * Diálogo de "Motivo do cancelamento" — reaproveitado tanto pelo troca-status
   * rápido do painel de detalhe quanto pelo modal de edição do agendamento.
   * Resolve com o texto do motivo, ou com null se o usuário cancelou o diálogo
   * (nesse caso quem chamou não deve prosseguir com o cancelamento).
   */
  var mcResolve=null;
  function pedirMotivoCancelamento(motivoInicial){
    return new Promise(function(resolve){
      mcResolve=resolve;
      document.getElementById('mc-motivo').value=motivoInicial||'';
      document.getElementById('mc-msg').textContent='';
      document.getElementById('motivoCancelamentoModal').classList.remove('hidden');
      document.getElementById('mc-motivo').focus();
    });
  }
  function fecharModalMotivoCancelamento(resultado){
    document.getElementById('motivoCancelamentoModal').classList.add('hidden');
    if(mcResolve){ var r=mcResolve; mcResolve=null; r(resultado); }
  }
  document.getElementById('mc-cancelarBtn').addEventListener('click',function(){ fecharModalMotivoCancelamento(null); });
  document.getElementById('mc-confirmarBtn').addEventListener('click',function(){
    var v=document.getElementById('mc-motivo').value.trim();
    if(!v){ document.getElementById('mc-msg').textContent='Informe o motivo do cancelamento.'; return; }
    fecharModalMotivoCancelamento(v);
  });
  document.getElementById('motivoCancelamentoModal').addEventListener('click',function(e){ if(e.target.id==='motivoCancelamentoModal')fecharModalMotivoCancelamento(null); });

  // Modal de confirmação depois de mandar a OS pra assinatura — fica na
  // frente até a pessoa clicar OK (não some sozinho como um toast), com o
  // link já pronto pra copiar e mandar manualmente por WhatsApp se quiser.
  function abrirModalOSEnviada(email,link){
    document.getElementById('osEnviada-email').textContent=email;
    document.getElementById('osEnviada-link').value=link||'';
    document.getElementById('osEnviadaModal').classList.remove('hidden');
  }
  function fecharModalOSEnviada(){ document.getElementById('osEnviadaModal').classList.add('hidden'); }
  document.getElementById('osEnviada-okBtn').addEventListener('click',fecharModalOSEnviada);
  document.getElementById('osEnviada-copiarBtn').addEventListener('click',function(){
    var link=document.getElementById('osEnviada-link').value;
    navigator.clipboard.writeText(link).then(function(){
      showAgToast('Link copiado — já pode colar no WhatsApp.');
    }).catch(function(){
      showAgToast('Não foi possível copiar automaticamente. Link: '+link,true);
    });
  });
  document.getElementById('osEnviadaModal').addEventListener('click',function(e){ if(e.target.id==='osEnviadaModal')fecharModalOSEnviada(); });

  /**
   * Atualização "otimista": muda a linha da tabela e o painel na hora, sem
   * esperar o servidor — se der erro, desfaz e avisa. Se o novo status for
   * "Cancelado", exige motivoCancelamento (o chamador já deve ter aberto o
   * diálogo antes de chegar aqui).
   */
  function salvarStatusOtimista(a,novoStatus,btn,motivoCancelamento){
    var statusAnterior=a['Status Agendamento'];
    var motivoAnterior=a['Motivo Cancelamento'];
    a['Status Agendamento']=novoStatus;
    a['Motivo Cancelamento']=novoStatus==='Cancelado'?(motivoCancelamento||''):'';
    render();
    if(agendamentoAtual&&agendamentoAtual.IdAgendamento===a.IdAgendamento)atualizarPainelStatus(a);
    if(btn)btn.disabled=true;
    apiCall('atualizarStatusAgendamento',{solicitanteId:meuId(),idAgendamento:a.IdAgendamento,status:novoStatus,motivoCancelamento:motivoCancelamento||''}).then(function(resp){
      if(btn)btn.disabled=false;
      if(!resp||!resp.ok){
        a['Status Agendamento']=statusAnterior; a['Motivo Cancelamento']=motivoAnterior; render();
        if(agendamentoAtual&&agendamentoAtual.IdAgendamento===a.IdAgendamento)atualizarPainelStatus(a);
        showAgToast((resp&&resp.erro)||'Não foi possível salvar — status desfeito.',true);
        return;
      }
      showAgToast('Status atualizado.');
    }).catch(function(err){
      if(btn)btn.disabled=false;
      a['Status Agendamento']=statusAnterior; a['Motivo Cancelamento']=motivoAnterior; render();
      if(agendamentoAtual&&agendamentoAtual.IdAgendamento===a.IdAgendamento)atualizarPainelStatus(a);
      showAgToast('Erro de conexão — status desfeito: '+err.message,true);
    });
  }

  function atualizarPainelStatus(a){
    var status=(a['Status Agendamento']||'Agendado').trim();
    var badge=document.querySelector('#agendamentoDetalhe .ag-status-tag');
    if(badge){ badge.className='ag-status-tag '+statusSlug(status); badge.textContent=status; }
    var sel=document.getElementById('ad-statusSelect');
    if(sel)sel.value=status;
    var motivoRow=document.getElementById('ad-motivoRow'),motivoValor=document.getElementById('ad-motivoValor');
    if(motivoRow&&motivoValor){
      var motivo=a['Motivo Cancelamento']||'';
      motivoRow.style.display=motivo?'':'none';
      motivoValor.textContent=motivo;
    }
  }

  function showAgToast(texto,erro){
    var el=document.getElementById('ag-toast');
    if(!el){
      el=document.createElement('div');
      el.id='ag-toast';
      el.style.cssText='position:fixed;left:14px;right:14px;bottom:14px;max-width:420px;margin:0 auto;background:var(--sidebar-bg);color:#fff;padding:13px 16px;border-radius:11px;font-size:13px;z-index:200;box-shadow:0 10px 30px rgba(0,0,0,.3);transition:opacity .2s;';
      document.body.appendChild(el);
    }
    el.style.background=erro?'var(--debit)':'var(--sidebar-bg)';
    el.textContent=texto;
    el.style.opacity='1';
    clearTimeout(el._t);
    el._t=setTimeout(function(){ el.style.opacity='0'; },2800);
  }

  function abrirPainelDetalhe(idAgendamento){
    var a=agendamentos.filter(function(x){return String(x.IdAgendamento)===String(idAgendamento);})[0];
    if(!a)return;
    agendamentoAtual=a;
    var cliente=clientesMap[a.IdCliente]||{};
    var idVend=cliente['Vendedor Responsavel'];
    var vend=idVend?vendedoresMap[idVend]:null;
    var dt=parseBRDateTime(a['Data Inicio']);
    var dataFmt=dt?String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear():'—';
    var status=(a['Status Agendamento']||'Agendado').trim();

    document.getElementById('ad-title').textContent=nomeCliente(a.IdCliente);

    var html='';
    html+='<div class="ad-section">'+
      '<span class="ag-status-tag '+statusSlug(status)+'">'+escapeHtml(status)+'</span>'+
      '<div class="ad-row" style="margin-top:10px;"><span class="dl">Cliente</span><span class="dv">'+escapeHtml(nomeCliente(a.IdCliente))+'</span></div>'+
      (cliente.Endereco?'<div class="ad-row"><span class="dl">Endereço</span><span class="dv">'+escapeHtml(cliente.Endereco)+'</span></div>':'')+
      (cliente.Telefone?'<div class="ad-row"><span class="dl">Telefone</span><span class="dv">'+escapeHtml(cliente.Telefone)+'</span></div>':'')+
      (vend?'<div class="ad-row"><span class="dl">Vendedor</span><span class="dv">'+escapeHtml(vend.Nome||'—')+'</span></div>':'')+
      (vend&&vend.Telefone?'<div class="ad-row"><span class="dl">Telefone do Vendedor</span><span class="dv">'+escapeHtml(vend.Telefone)+'</span></div>':'')+
      '<div class="ad-row"><span class="dl">Serviço</span><span class="dv">'+escapeHtml(nomeServico(a.IdServico))+'</span></div>'+
      '<div class="ad-row"><span class="dl">Valor</span><span class="dv">'+(a.Valor?window.SGUtil.fmtMoney(a.Valor):'<span style="color:var(--debit);font-weight:600;">⚠ sem valor definido</span>')+'</span></div>'+
      '<div class="ad-row"><span class="dl">Técnico</span><span class="dv">'+escapeHtml(nomeVendedor(a.TecnicoResponsavel))+'</span></div>'+
      '<div class="ad-row"><span class="dl">Data</span><span class="dv">'+dataFmt+'</span></div>'+
      '<div class="ad-row"><span class="dl">Horário</span><span class="dv">'+escapeHtml((a['Hora inicio']||'—')+' – '+(a['Hora Fim']||'—'))+'</span></div>'+
      '<div class="ad-row" id="ad-motivoRow" style="'+(a['Motivo Cancelamento']?'':'display:none;')+'"><span class="dl">Motivo do cancelamento</span><span class="dv" id="ad-motivoValor">'+escapeHtml(a['Motivo Cancelamento']||'')+'</span></div>'+
      '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line);">'+
        '<label style="display:block;font-size:11px;font-weight:700;color:var(--ink-soft);margin-bottom:6px;">Editar status manualmente</label>'+
        '<div style="display:flex;gap:8px;">'+
          '<select id="ad-statusSelect" style="flex:1;font-size:13px;border:1px solid var(--line);border-radius:9px;padding:9px 10px;background:#fff;color:var(--ink);">'+
            '<option value="Agendado">Agendado</option>'+
            '<option value="Em Andamento">Em Andamento</option>'+
            '<option value="Concluído">Concluído</option>'+
            '<option value="Cancelado">Cancelado</option>'+
          '</select>'+
          '<button type="button" id="ad-statusSalvarBtn" style="flex:none;background:var(--sidebar-bg);color:#fff;border:none;border-radius:9px;padding:0 16px;font-weight:700;font-size:12.5px;cursor:pointer;">Salvar</button>'+
        '</div>'+
      '</div>'+
    '</div>';

    if(a['Quantidade de Modulos']||a['Modelo Modulos']||a['Quantidade Inversores']||a['Modelo Inversores']){
      html+='<div class="ad-section"><h4>Detalhes técnicos</h4>'+
        (a['Quantidade de Modulos']?'<div class="ad-row"><span class="dl">Qtd. módulos</span><span class="dv">'+escapeHtml(a['Quantidade de Modulos'])+'</span></div>':'')+
        (a['Modelo Modulos']?'<div class="ad-row"><span class="dl">Modelo módulos</span><span class="dv">'+escapeHtml(a['Modelo Modulos'])+'</span></div>':'')+
        (a['Quantidade Inversores']?'<div class="ad-row"><span class="dl">Qtd. inversores</span><span class="dv">'+escapeHtml(a['Quantidade Inversores'])+'</span></div>':'')+
        (a['Modelo Inversores']?'<div class="ad-row"><span class="dl">Modelo inversores</span><span class="dv">'+escapeHtml(a['Modelo Inversores'])+'</span></div>':'')+
      '</div>';
    }

    if(a['Observacao Comercial']){
      html+='<div class="ad-section"><h4>Observação comercial</h4><p style="font-size:13px;color:var(--ink);line-height:1.5;">'+escapeHtml(a['Observacao Comercial'])+'</p></div>';
    }

    html+='<div class="ad-section"><h4>Respostas do técnico</h4><div id="ad-respostas">'+
      (respostasCarregadasPara[idAgendamento]?renderRespostasHtml(a):'<div style="font-size:12.5px;color:var(--ink-faint);padding:6px 0;">Carregando respostas…</div>')+
    '</div></div>';

    if(a.LinkAssinaturaOS){
      html+='<div class="ad-section"><h4>Assinatura digital da OS</h4>'+
        '<div class="ad-row"><span class="dl">Status</span><span class="dv" id="ad-osStatusValor">'+escapeHtml(a.StatusAssinaturaOS||'Enviado')+'</span></div>'+
        (a.EnviadoAssinaturaOSEm?'<div class="ad-row"><span class="dl">Enviado em</span><span class="dv">'+escapeHtml(a.EnviadoAssinaturaOSEm)+'</span></div>':'')+
        '<p class="hint" style="margin:8px 0 10px;">Se o cliente não receber o e-mail (caixa cheia, filtro de spam etc), copie o link abaixo e mande direto por WhatsApp.</p>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">'+
          '<a class="connect-btn" id="ad-abrirLinkOSBtn" href="'+escapeHtml(a.LinkAssinaturaOS)+'" target="_blank" rel="noopener" style="text-decoration:none;font-size:12.5px;padding:9px 14px;">🔗 Abrir link</a>'+
          '<button type="button" class="reset-btn" id="ad-copiarLinkOSBtn" style="font-size:12.5px;padding:9px 14px;">📋 Copiar link</button>'+
          '<button type="button" class="reset-btn" id="ad-verificarStatusOSBtn" style="font-size:12.5px;padding:9px 14px;">🔄 Verificar status</button>'+
        '</div>'+
      '</div>';
    }

    document.getElementById('ad-body').innerHTML=html;

    var copiarLinkOSBtn=document.getElementById('ad-copiarLinkOSBtn');
    if(copiarLinkOSBtn){
      copiarLinkOSBtn.addEventListener('click',function(){
        navigator.clipboard.writeText(a.LinkAssinaturaOS).then(function(){
          showAgToast('Link copiado — já pode colar no WhatsApp.');
        }).catch(function(){
          showAgToast('Não foi possível copiar automaticamente. Link: '+a.LinkAssinaturaOS,true);
        });
      });
    }
    var verificarStatusOSBtn=document.getElementById('ad-verificarStatusOSBtn');
    if(verificarStatusOSBtn){
      verificarStatusOSBtn.addEventListener('click',function(){
        verificarStatusOSBtn.disabled=true; var textoOriginal=verificarStatusOSBtn.textContent; verificarStatusOSBtn.textContent='Verificando…';
        apiCall('verificarStatusOS',{solicitanteId:meuId(),idAgendamento:a.IdAgendamento}).then(function(resp){
          verificarStatusOSBtn.disabled=false; verificarStatusOSBtn.textContent=textoOriginal;
          if(!resp||!resp.ok){ showAgToast((resp&&resp.erro)||'Não foi possível verificar o status.',true); return; }
          a.StatusAssinaturaOS=resp.status;
          var statusEl=document.getElementById('ad-osStatusValor');
          if(statusEl)statusEl.textContent=resp.status;
          if(resp.refused)showAgToast('⚠️ '+resp.status+' — copie o link e mande manualmente por WhatsApp.',true);
          else showAgToast('Status atualizado: '+resp.status);
        }).catch(function(err){
          verificarStatusOSBtn.disabled=false; verificarStatusOSBtn.textContent=textoOriginal;
          showAgToast('Erro de conexão: '+err.message,true);
        });
      });
    }

    // A Ordem de Serviço (PDF + assinatura digital) só faz sentido depois do
    // atendimento concluído — assinar "declarando que o serviço foi
    // executado a contento" antes de ele acontecer não tem validade nenhuma.
    // Os botões continuam visíveis (cinza/bloqueados), não somem — assim
    // fica claro que a função existe, só não está liberada ainda.
    var concluido=normalizaTexto(status)==='concluido';
    document.getElementById('ad-pdfBtn').disabled=!concluido;
    document.getElementById('ad-assinaturaBtn').disabled=!concluido;
    document.getElementById('ad-osIndisponivelHint').style.display=concluido?'none':'';

    document.getElementById('ad-statusSelect').value=status;
    document.getElementById('ad-statusSalvarBtn').addEventListener('click',function(){
      var novoStatus=document.getElementById('ad-statusSelect').value;
      var btn=document.getElementById('ad-statusSalvarBtn');
      if(novoStatus==='Cancelado'){
        pedirMotivoCancelamento(a['Motivo Cancelamento']).then(function(motivo){
          if(motivo===null)return;
          salvarStatusOtimista(a,novoStatus,btn,motivo);
        });
        return;
      }
      salvarStatusOtimista(a,novoStatus,btn);
    });
    document.getElementById('ad-body').addEventListener('click',function(e){
      if(e.target.tagName==='IMG')window.open(e.target.src,'_blank');
    });

    document.getElementById('agendamentoDetalhe').classList.add('active');
    document.getElementById('adBackdrop').classList.add('active');

    if(!respostasCarregadasPara[idAgendamento]){
      garantirRespostas(idAgendamento).then(function(){
        if(!agendamentoAtual||agendamentoAtual.IdAgendamento!==idAgendamento)return;
        var secao=document.getElementById('ad-respostas');
        if(secao)secao.innerHTML=renderRespostasHtml(a);
      });
    }
  }

  function fecharPainelDetalhe(){
    document.getElementById('agendamentoDetalhe').classList.remove('active');
    document.getElementById('adBackdrop').classList.remove('active');
    agendamentoAtual=null;
  }

  function excluirAgendamento(){
    if(!agendamentoAtual)return;
    var nome=nomeCliente(agendamentoAtual.IdCliente);
    if(!confirm('Tem certeza que deseja excluir o agendamento de "'+nome+'"? Essa ação não pode ser desfeita.'))return;
    var idAgendamento=agendamentoAtual.IdAgendamento;
    var registroAnterior=Object.assign({},agendamentoAtual);

    agendamentos=agendamentos.filter(function(a){return String(a.IdAgendamento)!==String(idAgendamento);});
    fecharPainelDetalhe();
    render();
    showAgToast('Agendamento excluído.');

    apiCall('excluirAgendamento',{solicitanteId:meuId(),idAgendamento:idAgendamento}).then(function(resp){
      if(!resp||!resp.ok){
        if(window.SGUtil.ehNaoEncontrado(resp&&resp.erro))return; // já não existia mesmo — exclusão continua válida
        agendamentos.push(registroAnterior); render();
        showAgToast((resp&&resp.erro)||'Não foi possível excluir — o agendamento foi restaurado.',true);
      }
    }).catch(function(err){
      agendamentos.push(registroAnterior); render();
      showAgToast('Erro de conexão — o agendamento foi restaurado: '+err.message,true);
    });
  }

  // Monta o HTML completo da Ordem de Serviço (relatório de atendimento +
  // a página de aceite/cláusula no final, com espaço pra assinatura) — é
  // reaproveitado tanto pelo botão "🖨 Gerar PDF" (abre e imprime na hora)
  // quanto pelo botão "✍️ Enviar para assinatura digital" (o MESMO html vai
  // pro servidor virar um PDF de verdade e ser mandado pra Autentique).
  function montarHtmlOS(a){
    var idAgendamento=a.IdAgendamento;
    var cliente=clientesMap[a.IdCliente]||{};
    var lista=(respostasPorAgendamento[idAgendamento]||[]).filter(respostaTemValor);
    lista.sort(function(x,y){
      return ordemTemplate(templatesPorId[x.IdTemplate])-ordemTemplate(templatesPorId[y.IdTemplate]);
    });
    var dt=parseBRDateTime(a['Data Inicio']);
    var dataFmt=dt?String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear():'—';

    var linhas=lista.map(function(r){
      var tpl=templatesPorId[r.IdTemplate];
      var pergunta=tpl?tpl.TextoPergunta:('Pergunta '+r.IdTemplate);
      var isFoto=!!r.RespostaFoto&&/^https?:\/\//.test(r.RespostaFoto);
      var valorHtml=isFoto
        ?('<img src="'+r.RespostaFoto+'" style="max-width:280px;max-height:280px;border-radius:8px;border:1px solid #dde8dd;display:block;margin-top:6px;">')
        :('<div>'+escapeHtml(valorDaResposta(r))+'</div>');
      return '<div style="padding:10px 0;border-bottom:1px solid #eee;"><div style="font-weight:700;font-size:13px;margin-bottom:4px;">'+escapeHtml(pergunta)+'</div>'+valorHtml+'</div>';
    }).join('');

    // Página final: cláusula de aceite do serviço + linha de assinatura.
    // "page-break-before" garante que ela sempre comece numa folha nova,
    // tanto na impressão quanto no PDF gerado no servidor.
    var paginaAceite='<div style="page-break-before:always;padding-top:24px;">'+
      '<h1>Ordem de Serviço — Aceite do cliente</h1>'+
      '<div style="font-size:13px;margin:10px 0 18px;">'+
        '<div><strong>Prestador:</strong> '+escapeHtml(EMPRESA_RAZAO_SOCIAL)+'</div>'+
        '<div><strong>CNPJ:</strong> '+escapeHtml(EMPRESA_CNPJ)+'</div>'+
        '<div><strong>Valor do serviço:</strong> '+(a.Valor?escapeHtml(window.SGUtil.fmtMoney(a.Valor)):'—')+'</div>'+
      '</div>'+
      '<p style="font-size:13px;line-height:1.6;margin:16px 0 36px;">'+
        'Declaro que o serviço foi executado a contento, no valor de '+(a.Valor?escapeHtml(window.SGUtil.fmtMoney(a.Valor)):'—')+', '+
        'e autorizo o pagamento, ciente de que, após a execução, não cabe estorno por arrependimento '+
        '(art. 49 do CDC aplica-se apenas a compras fora do estabelecimento comercial dentro de 7 dias, '+
        'o que não é o caso aqui).'+
      '</p>'+
      '<p style="font-size:13px;line-height:1.6;margin:0 0 36px;">'+
        'Declaro também estar ciente de que, caso venha a adquirir um pacote com múltiplos serviços e este '+
        'pacote seja posteriormente cancelado, o valor deste serviço, já executado e registrado nesta Ordem '+
        'de Serviço, será deduzido do valor total do referido pacote.'+
      '</p>'+
      '<div style="display:flex;gap:40px;margin-top:50px;font-size:13px;">'+
        '<div style="flex:1;">'+
          '<div style="border-top:1px solid #1E1E1E;padding-top:6px;">Assinatura do prestador</div>'+
          '<div style="margin-top:14px;"><strong>'+escapeHtml(EMPRESA_RAZAO_SOCIAL)+'</strong></div>'+
          '<div style="margin-top:4px;">CNPJ: '+escapeHtml(EMPRESA_CNPJ)+'</div>'+
          '<div style="margin-top:4px;">'+escapeHtml(EMPRESA_EMAIL)+'</div>'+
          '<div style="margin-top:8px;color:#2c6e00;">✓ Assinado eletronicamente em '+dataFmt+'</div>'+
        '</div>'+
        '<div style="flex:1;">'+
          '<div style="border-top:1px solid #1E1E1E;padding-top:6px;">Assinatura do cliente</div>'+
          '<div style="margin-top:14px;"><strong>Nome:</strong> '+escapeHtml(nomeCliente(a.IdCliente))+'</div>'+
          '<div style="margin-top:4px;"><strong>Data:</strong> '+dataFmt+'</div>'+
        '</div>'+
      '</div>'+
    '</div>';

    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">'+
      '<title>Relatorio de Atendimento - '+escapeHtml(nomeCliente(a.IdCliente))+'</title>'+
      '<style>'+
      "body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1E1E1E;padding:24px;}"+
      '.letterhead{text-align:center;padding:10px 0 14px;}'+
      '.letterhead img{height:52px;}'+
      '.letterhead-bar{height:4px;background:#78D800;margin-bottom:24px;}'+
      'h1{font-size:18px;margin-bottom:4px;}'+
      '.sub{font-size:12px;color:#5a6b5a;margin-bottom:18px;}'+
      '.infobox{background:#F2F7F2;border-radius:8px;padding:14px 16px;margin-bottom:22px;font-size:13px;}'+
      '.infobox div{margin-bottom:4px;}'+
      '@media print{@page{margin:1.5cm;}}'+
      '</style></head><body>'+
      '<div class="letterhead"><img src="'+LOGO_DATA_URI+'" alt="Solar Green Suporte"></div>'+
      '<div class="letterhead-bar"></div>'+
      '<h1>Relatório de Atendimento</h1>'+
      '<div class="sub">Gerado em '+new Date().toLocaleDateString('pt-BR')+'</div>'+
      '<div class="infobox">'+
        '<div><strong>Cliente:</strong> '+escapeHtml(nomeCliente(a.IdCliente))+'</div>'+
        (cliente.Endereco?('<div><strong>Endereço:</strong> '+escapeHtml(cliente.Endereco)+'</div>'):'')+
        '<div><strong>Serviço:</strong> '+escapeHtml(nomeServico(a.IdServico))+'</div>'+
        '<div><strong>Técnico:</strong> '+escapeHtml(nomeVendedor(a.TecnicoResponsavel))+'</div>'+
        '<div><strong>Data:</strong> '+dataFmt+' · '+escapeHtml((a['Hora inicio']||'—')+' – '+(a['Hora Fim']||'—'))+'</div>'+
        '<div><strong>Status:</strong> '+escapeHtml(a['Status Agendamento']||'Agendado')+'</div>'+
      '</div>'+
      (linhas||'<p>Nenhuma resposta preenchida.</p>')+
      paginaAceite+
      '</body></html>';
  }

  // "garantirRespostas" primeiro: sem isso, clicar rápido demais (antes das
  // respostas do técnico terminarem de carregar em segundo plano) gera um
  // PDF com "Nenhuma resposta preenchida" mesmo já tendo fotos/respostas
  // salvas — foi exatamente esse race condition que causou o PDF mandado
  // pra Autentique sair sem as fotos.
  function gerarPdfRespostas(){
    if(!agendamentoAtual)return;
    var a=agendamentoAtual;
    var btn=document.getElementById('ad-pdfBtn');
    btn.disabled=true; var textoOriginal=btn.textContent; btn.textContent='Carregando respostas…';
    garantirRespostas(a.IdAgendamento).then(function(){
      btn.disabled=false; btn.textContent=textoOriginal;
      var htmlDoc=montarHtmlOS(a);
      var win=window.open('','_blank');
      win.document.write(htmlDoc);
      win.document.close();
      setTimeout(function(){win.print();},500);
    });
  }

  // Gera o PDF de verdade no servidor (a partir do MESMO html do "🖨 Gerar
  // PDF") e manda pra Autentique assinar — encadeado num só clique porque
  // o fileId do PDF só existe depois que ele é criado no Drive.
  function enviarOSParaAssinatura(){
    if(!agendamentoAtual)return;
    var a=agendamentoAtual;
    var cliente=clientesMap[a.IdCliente]||{};
    if(!cliente.Email){ showAgToast('Cadastre o e-mail do cliente antes de enviar a Ordem de Serviço pra assinatura digital.',true); return; }
    var btn=document.getElementById('ad-assinaturaBtn');
    btn.disabled=true; var textoOriginal=btn.textContent; btn.textContent='Carregando respostas…';
    garantirRespostas(a.IdAgendamento).then(function(){
      btn.textContent='Gerando PDF…';
      var html=montarHtmlOS(a);
      apiCall('gerarPdfOS',{solicitanteId:meuId(),idAgendamento:a.IdAgendamento,html:html}).then(function(resp){
        if(!resp||!resp.ok){ btn.disabled=false; btn.textContent=textoOriginal; showAgToast((resp&&resp.erro)||'Não foi possível gerar o PDF.',true); return; }
        btn.textContent='Enviando pra assinatura…';
        return apiCall('enviarOSParaAssinatura',{
          solicitanteId:meuId(),idAgendamento:a.IdAgendamento,fileId:resp.fileId,
          clienteNome:nomeCliente(a.IdCliente),clienteEmail:cliente.Email,
          nomeDocumento:'Ordem de Serviço - '+nomeCliente(a.IdCliente)
        }).then(function(resp2){
          btn.disabled=false; btn.textContent=textoOriginal;
          if(!resp2||!resp2.ok){ showAgToast((resp2&&resp2.erro)||'PDF gerado, mas não foi possível enviar pra assinatura.',true); return; }
          // Atualiza localmente (mesmo objeto referenciado em "agendamentos")
          // e reabre o painel pra seção "Assinatura digital da OS" (com o
          // link/status) já aparecer na hora, sem precisar fechar e reabrir.
          a.LinkAssinaturaOS=resp2.link||'';
          a.StatusAssinaturaOS='Enviado';
          a.EnviadoAssinaturaOSEm=new Date().toLocaleString('pt-BR');
          abrirPainelDetalhe(a.IdAgendamento);
          abrirModalOSEnviada(cliente.Email,resp2.link||'');
        });
      }).catch(function(err){
        btn.disabled=false; btn.textContent=textoOriginal;
        showAgToast('Erro de conexão: '+err.message,true);
      });
    });
  }

  function normalizaBuscaAg(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function textoBuscavelAgendamento(a){
    return normalizaBuscaAg([
      nomeCliente(a.IdCliente), nomeServico(a.IdServico), nomeVendedor(a.TecnicoResponsavel),
      a['Status Agendamento'], a['Data Inicio'], a['Hora inicio'], a['Hora Fim'],
      a['Observacao Comercial'], a['Modelo Modulos'], a['Modelo Inversores']
    ].join(' | '));
  }

  /**
   * Conta quantos agendamentos caem em cada status, respeitando os OUTROS
   * filtros ativos (data, técnico, busca) mas ignorando o de status — é
   * assim que cada KPI mostra "quantos apareceriam se eu clicasse aqui".
   */
  function contarPorStatus(){
    var from=document.getElementById('ag-dateFrom').value,to=document.getElementById('ag-dateTo').value;
    var tecnico=document.getElementById('ag-selTecnico').value;
    var busca=normalizaBuscaAg((document.getElementById('ag-buscaGeral')||{}).value||'').trim();
    var base=agendamentos.filter(function(a){
      var dt=parseBRDateTime(a['Data Inicio']); var dk=dt?dateKey(dt):null;
      if(from&&dk&&dk<from)return false; if(to&&dk&&dk>to)return false;
      if(tecnico!=='__all__'&&String(a.TecnicoResponsavel)!==tecnico)return false;
      if(busca&&textoBuscavelAgendamento(a).indexOf(busca)===-1)return false;
      return true;
    });
    var contagem={Todos:base.length,Agendado:0,'Em Andamento':0,'Concluído':0,Cancelado:0};
    base.forEach(function(a){
      var s=(a['Status Agendamento']||'').trim();
      if(contagem[s]!==undefined)contagem[s]++;
    });
    document.getElementById('ag-kpiAgendado').textContent=contagem.Agendado;
    document.getElementById('ag-kpiAndamento').textContent=contagem['Em Andamento'];
    document.getElementById('ag-kpiConcluido').textContent=contagem['Concluído'];
    document.getElementById('ag-kpiCancelado').textContent=contagem.Cancelado;
  }

  function getFiltered(){
    var from=document.getElementById('ag-dateFrom').value,to=document.getElementById('ag-dateTo').value;
    var tecnico=document.getElementById('ag-selTecnico').value;
    var statusBtn=document.querySelector('#view-agendamentos .ag-kpi-pill.active');
    var status=statusBtn?statusBtn.getAttribute('data-agstatus'):'__all__';
    var busca=normalizaBuscaAg((document.getElementById('ag-buscaGeral')||{}).value||'').trim();
    var lista=agendamentos.filter(function(a){
      var dt=parseBRDateTime(a['Data Inicio']); var dk=dt?dateKey(dt):null;
      if(from&&dk&&dk<from)return false; if(to&&dk&&dk>to)return false;
      if(tecnico!=='__all__'&&String(a.TecnicoResponsavel)!==tecnico)return false;
      if(status!=='__all__'&&(a['Status Agendamento']||'').trim()!==status)return false;
      if(busca&&textoBuscavelAgendamento(a).indexOf(busca)===-1)return false;
      return true;
    });
    var col=sortStateAg.col,dir=sortStateAg.dir,mult=dir==='asc'?1:-1;
    lista.sort(function(a,b){
      var va,vb;
      if(col==='data'){va=parseBRDateTime(a['Data Inicio']);vb=parseBRDateTime(b['Data Inicio']);return mult*((va?va.getTime():0)-(vb?vb.getTime():0));}
      if(col==='cliente'){va=nomeCliente(a.IdCliente);vb=nomeCliente(b.IdCliente);return mult*va.localeCompare(vb,'pt-BR');}
      if(col==='servico'){va=nomeServico(a.IdServico);vb=nomeServico(b.IdServico);return mult*va.localeCompare(vb,'pt-BR');}
      if(col==='tecnico'){va=nomeVendedor(a.TecnicoResponsavel);vb=nomeVendedor(b.TecnicoResponsavel);return mult*va.localeCompare(vb,'pt-BR');}
      if(col==='status'){va=(a['Status Agendamento']||'').trim();vb=(b['Status Agendamento']||'').trim();return mult*va.localeCompare(vb,'pt-BR');}
      return 0;
    });
    return lista;
  }
  var sortStateAg={col:'data',dir:'desc'};
  function updateSortHeadersAg(){
    document.querySelectorAll('#tblAgendamentos th.sortable').forEach(function(th){
      var col=th.getAttribute('data-sort');
      th.classList.toggle('sort-active',col===sortStateAg.col);
      var a=th.querySelector('.arrow-sort');
      a.textContent=(col===sortStateAg.col)?(sortStateAg.dir==='asc'?'▴':'▾'):'▾';
    });
  }

  function temRespostas(idAgendamento){
    var lista=respostasPorAgendamento[idAgendamento]||[];
    return lista.some(respostaTemValor);
  }

  function renderPaginacaoAg(totalPaginas){
    var el=document.getElementById('ag-paginacao');
    if(!el)return;
    if(totalPaginas<=1){ el.innerHTML=''; return; }
    el.innerHTML=
      '<button type="button" id="ag-pgAnterior" '+(paginaAtual<=1?'disabled':'')+'>‹ Anterior</button>'+
      '<span class="pg-info">Página '+paginaAtual+' de '+totalPaginas+'</span>'+
      '<button type="button" id="ag-pgProxima" '+(paginaAtual>=totalPaginas?'disabled':'')+'>Próxima ›</button>';
    var btnAnt=document.getElementById('ag-pgAnterior');
    if(btnAnt)btnAnt.addEventListener('click',function(){ if(paginaAtual>1){ paginaAtual--; render(); } });
    var btnProx=document.getElementById('ag-pgProxima');
    if(btnProx)btnProx.addEventListener('click',function(){ if(paginaAtual<totalPaginas){ paginaAtual++; render(); } });
  }

  function render(){
    var tbody=document.getElementById('ag-tbody');
    var filtrados=getFiltered();
    contarPorStatus();
    updateSortHeadersAg();
    if(!filtrados.length){
      tbody.innerHTML='';
      renderPaginacaoAg(0);
      document.getElementById('ag-emptyState').style.display='block';
      document.getElementById('ag-emptyState').querySelector('p').textContent='Nenhum agendamento no filtro selecionado.';
      return;
    }
    document.getElementById('ag-emptyState').style.display='none';

    var totalPaginas=Math.max(1,Math.ceil(filtrados.length/ITENS_POR_PAGINA));
    if(paginaAtual>totalPaginas)paginaAtual=totalPaginas;
    if(paginaAtual<1)paginaAtual=1;
    var inicio=(paginaAtual-1)*ITENS_POR_PAGINA;
    var pagina=filtrados.slice(inicio,inicio+ITENS_POR_PAGINA);

    tbody.innerHTML=pagina.map(function(a){
      var dt=parseBRDateTime(a['Data Inicio']);
      var dataFmt=dt?String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear():'—';
      var horario=(a['Hora inicio']||'—')+' – '+(a['Hora Fim']||'—');
      var status=(a['Status Agendamento']||'Agendado').trim();
      return '<tr class="ag-row-click" data-id="'+escapeHtml(a.IdAgendamento)+'">'+
        '<td>'+escapeHtml(nomeCliente(a.IdCliente))+'</td>'+
        '<td>'+escapeHtml(nomeServico(a.IdServico))+'</td>'+
        '<td>'+(a.Valor?window.SGUtil.fmtMoney(a.Valor):'<span style="color:var(--debit);font-weight:600;">sem valor</span>')+'</td>'+
        '<td>'+escapeHtml(nomeVendedor(a.TecnicoResponsavel))+'</td>'+
        '<td>'+dataFmt+'<br><span style="color:var(--ink-faint);font-size:11px;">'+escapeHtml(horario)+'</span></td>'+
        '<td><span class="ag-status-tag '+statusSlug(status)+'">'+escapeHtml(status)+'</span></td>'+
        '<td class="u-row-actions"><button data-id="'+escapeHtml(a.IdAgendamento)+'" class="ag-editar-btn">editar</button></td>'+
      '</tr>';
    }).join('');
    tbody.querySelectorAll('.ag-row-click').forEach(function(tr){
      tr.addEventListener('click',function(){ try{ abrirPainelDetalhe(tr.getAttribute('data-id')); }catch(err){ console.error('abrirPainelDetalhe falhou:',err); (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Não foi possível abrir esse registro (erro: '+err.message+'). Atualize a página e tente de novo.',true); } });
    });
    tbody.querySelectorAll('.ag-editar-btn').forEach(function(btn){
      btn.addEventListener('click',function(e){ e.stopPropagation(); openModal(btn.getAttribute('data-id')); });
    });
    renderPaginacaoAg(totalPaginas);
  }

  function normalizaTexto(s){
    return String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }
  function ehTecnico(v){ return normalizaTexto(v.Tipo)==='tecnico'; }

  function opcoesClienteAg(){
    return Object.keys(clientesMap).map(function(id){return clientesMap[id];})
      .sort(function(a,b){return (a['Nome Razao Social']||'').localeCompare(b['Nome Razao Social']||'','pt-BR');})
      .map(function(c){return {id:c.IdCliente,label:c['Nome Razao Social']||c.Nome||c.IdCliente};});
  }
  // Só serviços de Campo aparecem pra agendar — os administrativos (Adm) não fazem sentido aqui.
  function opcoesServicoAg(){
    return Object.keys(servicosMap).map(function(id){return servicosMap[id];})
      .filter(function(s){return normalizaTexto(s.TipoServico)==='campo';})
      .sort(function(a,b){return (a['Nome Servico']||'').localeCompare(b['Nome Servico']||'','pt-BR');})
      .map(function(s){return {id:s.IdServico,label:s['Nome Servico']||s.IdServico};});
  }
  // Só quem tem Tipo = "Tecnico" (sem diferenciar maiúscula/acento) pode ser
  // escolhido como responsável por uma ordem de serviço em campo.
  function opcoesTecnicoAg(){
    return Object.keys(vendedoresMap).map(function(id){return vendedoresMap[id];})
      .filter(function(v){return (v.Status||'').trim().toLowerCase()!=='inativo';})
      .filter(ehTecnico)
      .sort(function(a,b){return (a.Nome||'').localeCompare(b.Nome||'','pt-BR');})
      .map(function(v){return {id:v.IdVendedor,label:v.Nome};});
  }

  function populateSelects(){
    var vendedoresLista=Object.keys(vendedoresMap).map(function(id){return vendedoresMap[id];})
      .filter(function(v){return (v.Status||'').trim().toLowerCase()!=='inativo';})
      .sort(function(a,b){return (a.Nome||'').localeCompare(b.Nome||'','pt-BR');});

    var selTecnicoFiltro=document.getElementById('ag-selTecnico'),curT=selTecnicoFiltro.value||'__all__';
    selTecnicoFiltro.innerHTML='<option value="__all__">Todos os técnicos</option>'+
      vendedoresLista.map(function(v){return '<option value="'+escapeHtml(v.IdVendedor)+'">'+escapeHtml(v.Nome)+'</option>';}).join('');
    selTecnicoFiltro.value=curT;
  }

  // Alguns serviços do catálogo real têm "Tipo Cobranca" = Unitário mas só
  // preenchido o "Valor por módulo" (o "Valor" fixo ficou em branco) — nesse
  // caso trata como por módulo mesmo assim, senão o valor nunca autopreenche.
  function ehCobrancaPorModulo(servico){
    if(normalizaTexto(servico['Tipo Cobranca'])==='por modulo')return true;
    var fixo=parseFloat(String(servico.Valor||'').replace(',','.'));
    var unit=parseFloat(String(servico.ValorPorModulo||'').replace(',','.'));
    return isNaN(fixo)&&!isNaN(unit);
  }
  // Sugere o valor do serviço assim que ele é escolhido (ou quando a
  // quantidade de módulos muda, pra serviços cobrados por módulo) — o campo
  // continua editável, é só um ponto de partida pra não sair sem preço.
  function atualizarValorPadrao(){
    var idServico=document.getElementById('ag-idServico').value;
    var servico=idServico?servicosMap[idServico]:null;
    var campoValor=document.getElementById('ag-valor');
    if(!servico){ return; }
    if(ehCobrancaPorModulo(servico)){
      var qtd=parseFloat(document.getElementById('ag-qtdModulos').value)||0;
      var unit=parseFloat(String(servico.ValorPorModulo||'0').replace(',','.'))||0;
      campoValor.value=qtd>0?(qtd*unit).toFixed(2):'';
    } else {
      var fixo=parseFloat(String(servico.Valor||'').replace(',','.'));
      campoValor.value=isNaN(fixo)?'':fixo.toFixed(2);
    }
  }
  document.getElementById('ag-qtdModulos').addEventListener('input',function(){
    var idServico=document.getElementById('ag-idServico').value;
    var servico=idServico?servicosMap[idServico]:null;
    if(servico&&ehCobrancaPorModulo(servico))atualizarValorPadrao();
  });

  function alertaTrocaDeServico(){
    atualizarValorPadrao();
    var warnEl=document.getElementById('ag-servicoWarn');
    warnEl.className='uform-msg'; warnEl.textContent='';
    if(!editandoId||!servicoOriginalEdicao)return;
    var novoServico=document.getElementById('ag-idServico').value;
    if(novoServico===servicoOriginalEdicao)return;
    var qtd=contarRespostasDoServico(editandoId,servicoOriginalEdicao);
    if(qtd>0){
      warnEl.className='uform-msg success';
      warnEl.textContent='ℹ Esse agendamento já tem '+qtd+' resposta(s) preenchida(s) pro serviço anterior. Elas continuam salvas e o técnico vai continuar vendo essas respostas na tela dele, junto com as novas perguntas do serviço "'+escapeHtml(nomeServico(novoServico))+'".';
    }
  }

  function openModal(idAgendamento){
    editandoId=idAgendamento||null;
    showMsg('');
    var a=idAgendamento?agendamentos.filter(function(x){return String(x.IdAgendamento)===String(idAgendamento);})[0]:null;
    servicoOriginalEdicao=a?a.IdServico:null;
    document.getElementById('agendamentoModalTitle').textContent=a?'Editar agendamento':'Novo agendamento';

    window.SGCombo.criar({
      inputId:'ag-idClienteBusca', hiddenId:'ag-idCliente', dropdownId:'ag-idClienteDropdown',
      getOpcoes:opcoesClienteAg,
      valorInicial:a&&a.IdCliente?{id:a.IdCliente,label:nomeCliente(a.IdCliente)}:null,
      onSelecionar:validarCliente
    });
    window.SGCombo.criar({
      inputId:'ag-idServicoBusca', hiddenId:'ag-idServico', dropdownId:'ag-idServicoDropdown',
      getOpcoes:opcoesServicoAg,
      valorInicial:a&&a.IdServico?{id:a.IdServico,label:nomeServico(a.IdServico)}:null,
      onSelecionar:alertaTrocaDeServico
    });
    document.getElementById('ag-valor').value=a&&a.Valor!==undefined&&a.Valor!==''?parseFloat(String(a.Valor).replace(',','.')).toFixed(2):'';
    window.SGCombo.criar({
      inputId:'ag-tecnicoBusca', hiddenId:'ag-tecnico', dropdownId:'ag-tecnicoDropdown',
      getOpcoes:opcoesTecnicoAg,
      valorInicial:a&&a.TecnicoResponsavel?{id:a.TecnicoResponsavel,label:nomeVendedor(a.TecnicoResponsavel)}:null,
      onSelecionar:validarHorario
    });

    var dt=a?parseBRDateTime(a['Data Inicio']):null;
    document.getElementById('ag-dataInicio').value=dt?dateKey(dt):'';
    renderHoraGrid('ag-horaInicioGrid',HORAS_INICIO,a?(a['Hora inicio']||''):'','ag-horaInicio',function(){ atualizarDisponibilidadeHoraFim(); validarHorario(); });
    renderHoraGrid('ag-horaFimGrid',HORAS_FIM,a?(a['Hora Fim']||''):'','ag-horaFim',validarHorario);
    atualizarDisponibilidadeHoraFim();
    document.getElementById('ag-qtdModulos').value=a?(a['Quantidade de Modulos']||''):'';
    document.getElementById('ag-modeloModulos').value=a?(a['Modelo Modulos']||''):'';
    document.getElementById('ag-qtdInversores').value=a?(a['Quantidade Inversores']||''):'';
    document.getElementById('ag-modeloInversores').value=a?(a['Modelo Inversores']||''):'';
    document.getElementById('ag-observacao').value=a?(a['Observacao Comercial']||''):'';
    document.getElementById('ag-statusField').style.display=a?'block':'none';
    document.getElementById('ag-status').value=a?(a['Status Agendamento']||'Agendado'):'Agendado';
    document.getElementById('ag-servicoWarn').textContent='';
    document.getElementById('ag-clienteWarn').textContent='';
    document.getElementById('ag-horarioMsg').textContent='';
    validarCliente();
    document.getElementById('agendamentoModal').classList.remove('hidden');
    if(idAgendamento)garantirRespostas(idAgendamento);
  }
  function closeModal(){ document.getElementById('agendamentoModal').classList.add('hidden'); editandoId=null; servicoOriginalEdicao=null; }

  var HORAS_INICIO=['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];
  var HORAS_FIM=['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];

  function horaParaMinutos(hhmm){ var p=String(hhmm||'').split(':'); return (parseInt(p[0],10)||0)*60+(parseInt(p[1],10)||0); }

  function renderHoraGrid(containerId,horas,valorAtual,inputId,onChange){
    var el=document.getElementById(containerId);
    el.innerHTML=horas.map(function(h){
      return '<button type="button" class="hora-btn'+(h===valorAtual?' selected':'')+'" data-hora="'+h+'">'+h+'</button>';
    }).join('');
    document.getElementById(inputId).value=valorAtual||'';
    el.querySelectorAll('.hora-btn').forEach(function(btn){
      btn.addEventListener('click',function(){
        if(btn.disabled)return;
        el.querySelectorAll('.hora-btn').forEach(function(b){b.classList.remove('selected');});
        btn.classList.add('selected');
        document.getElementById(inputId).value=btn.getAttribute('data-hora');
        if(onChange)onChange();
      });
    });
  }

  function atualizarDisponibilidadeHoraFim(){
    var horaInicio=document.getElementById('ag-horaInicio').value;
    var grid=document.getElementById('ag-horaFimGrid');
    grid.querySelectorAll('.hora-btn').forEach(function(btn){
      var h=btn.getAttribute('data-hora');
      var invalido=!!(horaInicio&&horaParaMinutos(h)<=horaParaMinutos(horaInicio));
      btn.disabled=invalido;
      if(invalido&&btn.classList.contains('selected')){
        btn.classList.remove('selected');
        document.getElementById('ag-horaFim').value='';
      }
    });
  }

  function formatarDataBR(iso){
    var m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m?(m[3]+'/'+m[2]+'/'+m[1]):(iso||'');
  }

  /**
   * Regras vindas do AppSheet: hora fim > hora início, e nenhum outro
   * agendamento do MESMO técnico, no MESMO dia, com horário sobreposto.
   * Cancelados não contam como conflito — o horário fica livre de novo.
   */
  function validarHorario(){
    var msgEl=document.getElementById('ag-horarioMsg');
    msgEl.className='uform-msg'; msgEl.textContent='';
    var horaInicio=document.getElementById('ag-horaInicio').value;
    var horaFim=document.getElementById('ag-horaFim').value;
    var dataInicio=document.getElementById('ag-dataInicio').value;
    var tecnico=document.getElementById('ag-tecnico').value;
    if(!horaInicio||!horaFim)return true;
    if(horaParaMinutos(horaFim)<=horaParaMinutos(horaInicio)){
      msgEl.className='uform-msg error';
      msgEl.textContent='O horário fim deve ser maior que o início.';
      return false;
    }
    if(!dataInicio||!tecnico)return true;
    var conflito=agendamentos.filter(function(a){
      if(editandoId&&String(a.IdAgendamento)===String(editandoId))return false;
      if(String(a.TecnicoResponsavel)!==String(tecnico))return false;
      if(normalizaTexto(a['Status Agendamento'])==='cancelado')return false;
      var dtA=parseBRDateTime(a['Data Inicio']);
      if(!dtA||dateKey(dtA)!==dataInicio)return false;
      var aIni=a['Hora inicio'],aFim=a['Hora Fim'];
      if(!aIni||!aFim)return false;
      return horaParaMinutos(aIni)<horaParaMinutos(horaFim)&&horaParaMinutos(aFim)>horaParaMinutos(horaInicio);
    })[0];
    if(conflito){
      msgEl.className='uform-msg error';
      msgEl.textContent='Conflito! O técnico '+nomeVendedor(tecnico)+' já possui agendamento neste horário no dia '+formatarDataBR(dataInicio)+'.';
      return false;
    }
    return true;
  }

  function enderecoDoCliente(cliente){
    if(!cliente)return '';
    // A coluna pode estar como "Endereco" (sem acento, o padrão esperado) ou
    // "Endereço" (se alguém digitou/renomeou com acento na planilha) — aceita
    // as duas, pra não travar o agendamento por causa de acentuação.
    return String(cliente.Endereco||cliente['Endereço']||'').trim();
  }

  /**
   * Regra vinda do AppSheet: só deixa escolher (ou manter) um cliente que já
   * tem endereço cadastrado. O e-mail entrou na mesma regra (obrigatório
   * antes de agendar) porque é pra onde vai o link de assinatura digital da
   * Ordem de Serviço — sem e-mail, o cliente nunca recebe o link pra assinar.
   */
  function validarCliente(){
    var msgEl=document.getElementById('ag-clienteWarn');
    msgEl.className='uform-msg'; msgEl.textContent=''; msgEl.onclick=null;
    var idCliente=document.getElementById('ag-idCliente').value;
    if(!idCliente)return true;
    var cliente=clientesMap[idCliente];
    if(cliente&&!enderecoDoCliente(cliente)){
      msgEl.className='uform-msg error sg-msg-fix';
      msgEl.innerHTML='⚠️ Este cliente não possui endereço cadastrado — <strong>clique aqui pra atualizar o cadastro do cliente</strong>.';
      msgEl.onclick=function(){
        if(window.clientesApp&&window.clientesApp.abrirEdicao)window.clientesApp.abrirEdicao(idCliente);
      };
      return false;
    }
    if(cliente&&!String(cliente.Email||'').trim()){
      msgEl.className='uform-msg error sg-msg-fix';
      msgEl.innerHTML='⚠️ Este cliente não possui e-mail cadastrado (necessário pra enviar a Ordem de Serviço pra assinatura digital) — <strong>clique aqui pra atualizar o cadastro do cliente</strong>.';
      msgEl.onclick=function(){
        if(window.clientesApp&&window.clientesApp.abrirEdicao)window.clientesApp.abrirEdicao(idCliente);
      };
      return false;
    }
    return true;
  }

  document.getElementById('ag-dataInicio').addEventListener('change',validarHorario);

  function contarRespostasDoServico(idAgendamento,idServico){
    var templates=templatesPorServico[idServico]||[];
    if(!templates.length)return 0;
    var idsTemplate={}; templates.forEach(function(t){idsTemplate[t.IdTemplate]=true;});
    var respostas=respostasPorAgendamento[idAgendamento]||[];
    return respostas.filter(function(r){return idsTemplate[r.IdTemplate]&&respostaTemValor(r);}).length;
  }




  function salvar(){
    var idCliente=document.getElementById('ag-idCliente').value;
    var idServico=document.getElementById('ag-idServico').value;
    var tecnico=document.getElementById('ag-tecnico').value;
    var dataInicio=document.getElementById('ag-dataInicio').value;
    var valor=document.getElementById('ag-valor').value;
    if(!idCliente||!idServico||!tecnico||!dataInicio){ showMsg('Cliente, serviço, técnico e data são obrigatórios.','error'); return; }
    if(!valor||parseFloat(valor)<=0){ showMsg('Informe o valor do serviço — a OS não pode sair sem valor.','error'); return; }
    if(!document.getElementById('ag-horaInicio').value||!document.getElementById('ag-horaFim').value){ showMsg('Escolha o horário de início e fim.','error'); return; }
    if(!validarCliente()){ showMsg('Corrija o cadastro do cliente antes de continuar.','error'); return; }
    if(!validarHorario()){ showMsg('Corrija o horário antes de continuar.','error'); return; }

    var horaInicio=document.getElementById('ag-horaInicio').value;
    var horaFim=document.getElementById('ag-horaFim').value;
    var qtdModulos=document.getElementById('ag-qtdModulos').value;
    var modeloModulos=document.getElementById('ag-modeloModulos').value;
    var qtdInversores=document.getElementById('ag-qtdInversores').value;
    var modeloInversores=document.getElementById('ag-modeloInversores').value;
    var observacao=document.getElementById('ag-observacao').value;
    var status=editandoId?document.getElementById('ag-status').value:'Agendado';

    var ehNovo=!editandoId;
    var idAlvo=editandoId||window.SGId.gerar();
    var registroAnterior=!ehNovo?agendamentos.filter(function(a){return String(a.IdAgendamento)===String(idAlvo);})[0]:null;
    var registroAnteriorCopia=registroAnterior?Object.assign({},registroAnterior):null;
    var dataInicioBR=dataInicio.split('-').reverse().join('/'); // YYYY-MM-DD -> DD/MM/YYYY, igual o resto dos registros

    if(status==='Cancelado'){
      pedirMotivoCancelamento(registroAnterior?registroAnterior['Motivo Cancelamento']:'').then(function(motivo){
        if(motivo===null)return; // usuário desistiu do diálogo — não salva nada
        continuarSalvarAgendamento(motivo);
      });
      return;
    }
    continuarSalvarAgendamento('');

    function continuarSalvarAgendamento(motivoCancelamento){
      var registroNovo={
        IdAgendamento:idAlvo, IdCliente:idCliente, IdServico:idServico, Valor:valor,
        'Data Inicio':dataInicioBR, 'Hora inicio':horaInicio, 'Hora Fim':horaFim,
        TecnicoResponsavel:tecnico, 'Status Agendamento':status,
        'Motivo Cancelamento':motivoCancelamento,
        'Observacao Comercial':observacao,
        'Quantidade de Modulos':qtdModulos, 'Modelo Modulos':modeloModulos,
        'Quantidade Inversores':qtdInversores, 'Modelo Inversores':modeloInversores
      };
      var indice=agendamentos.findIndex(function(a){return String(a.IdAgendamento)===String(idAlvo);});
      if(indice===-1)agendamentos.push(registroNovo);
      else agendamentos[indice]=registroNovo;

      // Fecha o modal e atualiza a lista JÁ — sem esperar o servidor confirmar.
      closeModal();
      render();
      showAgToast(ehNovo?'Agendamento criado.':'Agendamento atualizado.');

      function desfazer(motivo){
        if(ehNovo)agendamentos=agendamentos.filter(function(a){return String(a.IdAgendamento)!==String(idAlvo);});
        else{ var idx=agendamentos.findIndex(function(a){return String(a.IdAgendamento)===String(idAlvo);}); if(idx!==-1&&registroAnteriorCopia)agendamentos[idx]=registroAnteriorCopia; }
        render();
        showAgToast(motivo,true);
      }

      apiCall('salvarAgendamento',{
        solicitanteId: meuId(),
        idAgendamento: idAlvo,
        idCliente: idCliente, idServico: idServico, tecnicoResponsavel: tecnico,
        valor: valor,
        dataInicio: dataInicio,
        horaInicio: horaInicio, horaFim: horaFim,
        quantidadeModulos: qtdModulos, modeloModulos: modeloModulos,
        quantidadeInversores: qtdInversores, modeloInversores: modeloInversores,
        observacaoComercial: observacao,
        statusAgendamento: status,
        motivoCancelamento: motivoCancelamento
      }).then(function(resp){
        if(!resp||!resp.ok){ desfazer((resp&&resp.erro)||'Não foi possível salvar — a alteração foi desfeita.'); return; }
        // se o servidor devolveu outro ID (implantação desatualizada, por ex.), corrige e redesenha na hora
        if(resp.idAgendamento&&String(resp.idAgendamento)!==String(idAlvo)){
          var idx2=agendamentos.findIndex(function(a){return String(a.IdAgendamento)===String(idAlvo);});
          if(idx2!==-1){ agendamentos[idx2].IdAgendamento=resp.idAgendamento; render(); }
        }
      }).catch(function(err){ desfazer('Erro de conexão — a alteração foi desfeita: '+err.message); });
    }
  }

  function setDefaultRange(){
    document.getElementById('ag-dateFrom').value='';
    document.getElementById('ag-dateTo').value='';
  }

  function aplicarDadosAgendamentos(resp){
    agendamentos=resp.agendamentos||[];
    clientesMap={}; (resp.clientes||[]).forEach(function(c){if(c.IdCliente)clientesMap[c.IdCliente]=c;});
    vendedoresMap={}; (resp.vendedores||[]).forEach(function(v){if(v.IdVendedor)vendedoresMap[v.IdVendedor]=v;});
    servicosMap={}; (resp.servicos||[]).forEach(function(s){if(s.IdServico)servicosMap[s.IdServico]=s;});
    templatesPorServico={};
    templatesPorId={};
    (resp.templates||[]).forEach(function(t){
      if(t.IdTemplate)templatesPorId[t.IdTemplate]=t;
      if(!t.IdServico)return;
      if(!templatesPorServico[t.IdServico])templatesPorServico[t.IdServico]=[];
      templatesPorServico[t.IdServico].push(t);
    });
    respostasPorAgendamento={};
    respostasCarregadasPara={};
    (resp.respostas||[]).forEach(function(r){
      if(!r.IdAgendamento)return;
      if(!respostasPorAgendamento[r.IdAgendamento])respostasPorAgendamento[r.IdAgendamento]=[];
      respostasPorAgendamento[r.IdAgendamento].push(r);
    });
    populateSelects();
    document.getElementById('ag-lastUpdate').textContent='Atualizado em '+new Date().toLocaleDateString('pt-BR')+' às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    render();
  }

  /**
   * Cache-first: se já tem dados salvos localmente, mostra na hora (sem
   * "Conectando…") e busca uma versão atualizada em segundo plano — só troca
   * a tela quando os dados novos chegarem, sem piscar loading a cada troca
   * de aba. Na primeira vez (sem cache ainda), mostra o carregando normal.
   */
  function carregar(){
    var cache=window.SGCache&&window.SGCache.get('agendamentos');
    var temCache=!!(cache&&cache.dados);
    if(temCache){
      aplicarDadosAgendamentos(cache.dados);
    }
    var epocaInicio=_epoca.atual();
    apiCall('getAgendamentosData',{}).then(function(resp){
      if(!resp||!resp.ok){
        if(!temCache){
          document.getElementById('ag-emptyState').style.display='block';
          document.getElementById('ag-emptyState').querySelector('p').textContent=(resp&&resp.erro)||'Não foi possível carregar os agendamentos.';
        }
        return;
      }
      if(window.SGCache)window.SGCache.set('agendamentos',resp);
      if(_epoca.atual()!==epocaInicio)return;
      if(!temCache)paginaAtual=1;
      aplicarDadosAgendamentos(resp);
    }).catch(function(err){
      if(!temCache){
        document.getElementById('ag-emptyState').style.display='block';
        document.getElementById('ag-emptyState').querySelector('p').textContent='Erro de conexão: '+err.message;
      }
    });
  }

  function init(){
    if(_initialized)return;
    if(!window.SG_SESSION)return;
    _initialized=true;
    document.getElementById('ag-appVersion').textContent='v'+(document.getElementById('appVersionFoot')?document.getElementById('appVersionFoot').textContent:'');
    setDefaultRange();

    document.getElementById('ag-novoBtn').addEventListener('click',function(){ openModal(null); });
    document.getElementById('ag-cancelBtn').addEventListener('click',closeModal);
    document.getElementById('ag-salvarBtn').addEventListener('click',salvar);
    document.getElementById('agendamentoModal').addEventListener('click',function(e){ if(e.target.id==='agendamentoModal')closeModal(); });

    document.getElementById('ad-fecharBtn').addEventListener('click',fecharPainelDetalhe);
    document.getElementById('adBackdrop').addEventListener('click',fecharPainelDetalhe);
    document.getElementById('ad-pdfBtn').addEventListener('click',gerarPdfRespostas);
    document.getElementById('ad-assinaturaBtn').addEventListener('click',enviarOSParaAssinatura);
    document.getElementById('ad-editarBtn').addEventListener('click',function(){
      if(agendamentoAtual)openModal(agendamentoAtual.IdAgendamento);
    });
    document.getElementById('ad-excluirBtn').addEventListener('click',excluirAgendamento);

    document.getElementById('ag-dateFrom').addEventListener('change',function(){ paginaAtual=1; render(); });
    document.getElementById('ag-dateTo').addEventListener('change',function(){ paginaAtual=1; render(); });
    document.getElementById('ag-selTecnico').addEventListener('change',function(){ paginaAtual=1; render(); });
    document.getElementById('ag-buscaGeral').addEventListener('input',function(){ paginaAtual=1; render(); });
    document.querySelectorAll('#view-agendamentos .ag-kpi-pill').forEach(function(pill){
      pill.addEventListener('click',function(){
        var jaAtivo=pill.classList.contains('active');
        document.querySelectorAll('#view-agendamentos .ag-kpi-pill').forEach(function(p){p.classList.remove('active');});
        if(!jaAtivo)pill.classList.add('active');
        paginaAtual=1; render();
      });
    });
    document.getElementById('ag-resetFiltros').addEventListener('click',function(){
      document.getElementById('ag-selTecnico').value='__all__';
      document.getElementById('ag-buscaGeral').value='';
      setDefaultRange();
      document.querySelectorAll('#view-agendamentos .ag-kpi-pill').forEach(function(p){p.classList.remove('active');});
      document.querySelectorAll('#view-agendamentos .qr-btn[data-agrange]').forEach(function(b){b.classList.remove('active');});
      document.querySelector('#view-agendamentos .qr-btn[data-agrange="all"]').classList.add('active');
      paginaAtual=1; render();
    });
    document.querySelectorAll('#view-agendamentos .qr-btn[data-agrange]').forEach(function(btn){
      btn.addEventListener('click',function(){
        document.querySelectorAll('#view-agendamentos .qr-btn[data-agrange]').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');
        var range=btn.getAttribute('data-agrange'),now=new Date();
        function dk(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
        if(range==='all'){ setDefaultRange(); }
        else if(range==='month'){ document.getElementById('ag-dateFrom').value=dk(new Date(now.getFullYear(),now.getMonth(),1)); document.getElementById('ag-dateTo').value=dk(new Date(now.getFullYear(),now.getMonth()+1,0)); }
        else { var n=parseInt(range,10),from=new Date(now); from.setDate(from.getDate()-(n-1)); document.getElementById('ag-dateFrom').value=dk(from); document.getElementById('ag-dateTo').value=dk(now); }
        paginaAtual=1; render();
      });
    });

    document.querySelectorAll('#tblAgendamentos th.sortable').forEach(function(th){
      th.addEventListener('click',function(){
        var col=th.getAttribute('data-sort');
        if(sortStateAg.col===col){sortStateAg.dir=sortStateAg.dir==='asc'?'desc':'asc';}
        else{sortStateAg.col=col;sortStateAg.dir=(col==='cliente'||col==='servico'||col==='tecnico'||col==='status')?'asc':'desc';}
        render();
      });
    });

    carregar();
  }

  /**
   * Chamado por outros módulos (hoje só Clientes) quando um cliente é salvo
   * em outro lugar, pra manter o cache local em dia sem precisar recarregar
   * a tela inteira — inclusive pra revalidar o aviso de endereço na hora.
   */
  function atualizarClienteCache(clienteObj){
    if(!clienteObj||!clienteObj.IdCliente)return;
    clientesMap[clienteObj.IdCliente]=clienteObj;
    if(document.getElementById('ag-idCliente')&&document.getElementById('ag-idCliente').value===clienteObj.IdCliente&&typeof validarCliente==='function')validarCliente();
    if(_initialized)render();
  }

  window.agendamentosApp={init:init,atualizarClienteCache:atualizarClienteCache};
})();


