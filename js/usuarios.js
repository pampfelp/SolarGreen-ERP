// ════ USUÁRIOS (somente administradores) ════
(function(){
  var _initialized=false;
  var _epoca=window.SGEpoca.criar();
  var usuarios=[];
  var editandoId=null; // null = criando novo

  function apiCall(action,payload){ return window.SGAuth.apiCall(action,payload); }
  function meuId(){ return window.SGUtil.meuId(); }

  function showMsg(texto,tipo){
    var el=document.getElementById('u-modalMsg');
    el.className='uform-msg'+(tipo?' '+tipo:'');
    el.textContent=texto||'';
  }

  function escapeHtml(s){ return window.SGUtil.escapeHtml(s); }

  function render(){
    var tbody=document.getElementById('u-tbody');
    if(!usuarios.length){
      tbody.innerHTML='';
      document.getElementById('u-emptyState').style.display='block';
      document.getElementById('u-emptyState').querySelector('p').textContent='Nenhum usuário cadastrado ainda.';
      return;
    }
    document.getElementById('u-emptyState').style.display='none';
    var ordenados=usuarios.slice().sort(function(a,b){return (a.Nome||'').localeCompare(b.Nome||'','pt-BR');});
    tbody.innerHTML=ordenados.map(function(u){
      var statusCls=(u.Status||'').trim().toLowerCase()==='inativo'?'inativo':'ativo';
      return '<tr>'+
        '<td>'+escapeHtml(u.Nome)+'</td>'+
        '<td>'+escapeHtml(u.Email)+'</td>'+
        '<td>'+escapeHtml(u.Telefone||'—')+'</td>'+
        '<td>'+escapeHtml(u.Tipo||'—')+'</td>'+
        '<td><span class="u-status-tag '+statusCls+'">'+escapeHtml(u.Status||'—')+'</span></td>'+
        '<td class="u-row-actions"><button data-id="'+escapeHtml(u.IdVendedor)+'" class="u-editar-btn">editar</button></td>'+
      '</tr>';
    }).join('');
    tbody.querySelectorAll('.u-editar-btn').forEach(function(btn){
      btn.addEventListener('click',function(){ openModal(btn.getAttribute('data-id')); });
    });
  }

  function carregar(){
    var cache=window.SGCache&&window.SGCache.get('usuarios');
    var temCache=!!(cache&&cache.dados);
    if(temCache){ usuarios=cache.dados.vendedores||[]; render(); }
    var epocaInicio=_epoca.atual();
    apiCall('listVendedoresAdmin',{solicitanteId:meuId()}).then(function(resp){
      if(!resp||!resp.ok){
        if(!temCache){
          document.getElementById('u-emptyState').style.display='block';
          document.getElementById('u-emptyState').querySelector('p').textContent=(resp&&resp.erro)||'Não foi possível carregar os usuários.';
        }
        return;
      }
      if(window.SGCache)window.SGCache.set('usuarios',resp);
      if(_epoca.atual()!==epocaInicio)return;
      usuarios=resp.vendedores||[];
      render();
    }).catch(function(err){
      if(!temCache){
        document.getElementById('u-emptyState').style.display='block';
        document.getElementById('u-emptyState').querySelector('p').textContent='Erro de conexão: '+err.message;
      }
    });
  }

  function openModal(idVendedor){
    editandoId=idVendedor||null;
    showMsg('');
    var u=idVendedor?usuarios.filter(function(x){return String(x.IdVendedor)===String(idVendedor);})[0]:null;
    document.getElementById('usuarioModalTitle').textContent=u?'Editar usuário':'Novo usuário';
    document.getElementById('u-nome').value=u?(u.Nome||''):'';
    document.getElementById('u-email').value=u?(u.Email||''):'';
    document.getElementById('u-telefone').value=u?(u.Telefone||''):'';
    document.getElementById('u-tipo').value=u?(u.Tipo||''):'';
    document.getElementById('u-status').value=(u&&u.Status)||'Ativo';
    document.getElementById('usuarioModal').classList.remove('hidden');
  }
  function closeModal(){ document.getElementById('usuarioModal').classList.add('hidden'); editandoId=null; }

  function salvar(){
    var nome=document.getElementById('u-nome').value.trim();
    var email=document.getElementById('u-email').value.trim();
    var telefone=document.getElementById('u-telefone').value.trim();
    var tipo=document.getElementById('u-tipo').value.trim();
    var status=document.getElementById('u-status').value;
    if(!nome||!email){ showMsg('Nome e e-mail são obrigatórios.','error'); return; }

    var ehNovo=!editandoId;
    var idAlvo=editandoId||window.SGId.gerar();
    var registroAnteriorCopia=!ehNovo?Object.assign({},usuarios.filter(function(x){return String(x.IdVendedor)===String(idAlvo);})[0]):null;

    var registroNovo={IdVendedor:idAlvo,Nome:nome,Email:email,Telefone:telefone,Tipo:tipo,Status:status};
    var indice=usuarios.findIndex(function(x){return String(x.IdVendedor)===String(idAlvo);});
    if(indice===-1)usuarios.push(registroNovo);
    else usuarios[indice]=registroNovo;
    _epoca.marcar();

    closeModal();
    render();
    (window.SGToast?window.SGToast.mostrar:function(t){})(ehNovo?'Usuário criado.':'Usuário atualizado.');

    apiCall('salvarVendedor',{
      solicitanteId:meuId(), idVendedor:idAlvo,
      nome:nome, email:email, telefone:telefone, tipo:tipo, status:status
    }).then(function(resp){
      if(!resp||!resp.ok){
        if(ehNovo)usuarios=usuarios.filter(function(x){return String(x.IdVendedor)!==String(idAlvo);});
        else{ var idx=usuarios.findIndex(function(x){return String(x.IdVendedor)===String(idAlvo);}); if(idx!==-1&&registroAnteriorCopia)usuarios[idx]=registroAnteriorCopia; }
        _epoca.marcar();
        render();
        (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})((resp&&resp.erro)||'Não foi possível salvar — a alteração foi desfeita.',true);
        return;
      }
      if(resp.idVendedor&&String(resp.idVendedor)!==String(idAlvo)){
        var idx2=usuarios.findIndex(function(x){return String(x.IdVendedor)===String(idAlvo);});
        if(idx2!==-1){ usuarios[idx2].IdVendedor=resp.idVendedor; render(); }
      }
    }).catch(function(err){
      if(ehNovo)usuarios=usuarios.filter(function(x){return String(x.IdVendedor)!==String(idAlvo);});
      else{ var idx=usuarios.findIndex(function(x){return String(x.IdVendedor)===String(idAlvo);}); if(idx!==-1&&registroAnteriorCopia)usuarios[idx]=registroAnteriorCopia; }
      render();
      (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})('Erro de conexão — a alteração foi desfeita: '+err.message,true);
    });
  }

  function init(){
    if(_initialized)return;
    if(!window.SGAuth||!window.SGAuth.isAdmin())return; // trava extra no front (o backend também recusa)
    _initialized=true;
    document.getElementById('u-appVersion').textContent='v'+(document.getElementById('appVersionFoot')?document.getElementById('appVersionFoot').textContent:'');
    document.getElementById('u-novoBtn').addEventListener('click',function(){ openModal(null); });
    document.getElementById('u-cancelBtn').addEventListener('click',closeModal);
    document.getElementById('u-salvarBtn').addEventListener('click',salvar);
    document.getElementById('usuarioModal').addEventListener('click',function(e){ if(e.target.id==='usuarioModal')closeModal(); });
    carregar();
  }

  window.usuariosApp={init:init};
})();


