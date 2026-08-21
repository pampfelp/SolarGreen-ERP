// ════ PERMISSÕES (somente administradores) ════
(function(){
  var _initialized=false;
  var _epoca=window.SGEpoca.criar();
  var telas=[], tipos=[], permissoesMap={}; // chave: tipo+'|'+tela -> true/false

  function apiCall(action,payload){ return window.SGAuth.apiCall(action,payload); }
  function escapeHtml(s){ return window.SGUtil.escapeHtml(s); }
  function chave(tipo,telaChave){ return tipo+'|'+telaChave; }

  function permitido(tipo,telaChave){
    var v=permissoesMap[chave(tipo,telaChave)];
    return v===undefined?true:v; // padrão: liberado, se não houver registro explícito
  }

  function render(){
    var thead=document.getElementById('perm-theadRow');
    thead.innerHTML='<th>Função</th>'+telas.map(function(t){return '<th>'+escapeHtml(t.label)+'</th>';}).join('');

    var tbody=document.getElementById('perm-tbody');
    if(!tipos.length){
      tbody.innerHTML='';
      document.getElementById('perm-emptyState').style.display='block';
      document.getElementById('perm-emptyState').querySelector('p').textContent='Nenhuma função não-administrativa encontrada ainda (cadastre um Vendedor ou Técnico na tela Usuários pra ela aparecer aqui).';
      return;
    }
    document.getElementById('perm-emptyState').style.display='none';
    tbody.innerHTML=tipos.map(function(tipo){
      return '<tr><td>'+escapeHtml(tipo)+'</td>'+
        telas.map(function(t){
          var marcado=permitido(tipo,t.chave);
          return '<td><input type="checkbox" class="perm-check" data-tipo="'+escapeHtml(tipo)+'" data-tela="'+escapeHtml(t.chave)+'" '+(marcado?'checked':'')+'></td>';
        }).join('')+
      '</tr>';
    }).join('');
  }

  function salvar(){
    var lista=[];
    document.querySelectorAll('.perm-check').forEach(function(chk){
      lista.push({tipo:chk.getAttribute('data-tipo'),tela:chk.getAttribute('data-tela'),permitido:chk.checked});
    });
    var btn=document.getElementById('perm-salvarBtn');
    var msgEl=document.getElementById('perm-msg');
    btn.disabled=true; btn.textContent='Salvando…'; msgEl.textContent='';
    apiCall('salvarPermissoes',{solicitanteId:window.SG_SESSION?window.SG_SESSION.idVendedor:'',permissoes:lista}).then(function(resp){
      btn.disabled=false; btn.textContent='Salvar permissões';
      if(!resp||!resp.ok){ msgEl.style.color='var(--debit)'; msgEl.textContent=(resp&&resp.erro)||'Não foi possível salvar.'; return; }
      msgEl.style.color='var(--accent-deep)'; msgEl.textContent='Salvo! As mudanças já valem no próximo acesso de cada pessoa.';
      // atualiza o mapa local (pra não precisar recarregar) e o cache global usado pelo menu
      permissoesMap={};
      lista.forEach(function(p){ permissoesMap[chave(p.tipo,p.tela)]=p.permitido; });
      _epoca.marcar();
      if(window.SGPermissoes)window.SGPermissoes.definirCache(telas,tipos,permissoesMap);
      if(window.SGCache)window.SGCache.set('permissoes_tela',{ok:true,telas:telas,tipos:tipos,permissoes:lista});
    }).catch(function(err){
      btn.disabled=false; btn.textContent='Salvar permissões';
      msgEl.style.color='var(--debit)'; msgEl.textContent='Erro de conexão: '+err.message;
    });
  }

  function carregar(){
    var cache=window.SGCache&&window.SGCache.get('permissoes_tela');
    var temCache=!!(cache&&cache.dados);
    if(temCache)aplicarRespostaPermissoes(cache.dados);
    var epocaInicio=_epoca.atual();
    apiCall('getPermissoesData',{}).then(function(resp){
      if(!resp||!resp.ok){
        if(!temCache){
          document.getElementById('perm-emptyState').style.display='block';
          document.getElementById('perm-emptyState').querySelector('p').textContent=(resp&&resp.erro)||'Não foi possível carregar.';
        }
        return;
      }
      if(window.SGCache)window.SGCache.set('permissoes_tela',resp);
      if(_epoca.atual()!==epocaInicio)return;
      aplicarRespostaPermissoes(resp);
    }).catch(function(err){
      if(!temCache){
        document.getElementById('perm-emptyState').style.display='block';
        document.getElementById('perm-emptyState').querySelector('p').textContent='Erro de conexão: '+err.message;
      }
    });
  }
  function aplicarRespostaPermissoes(resp){
    telas=resp.telas||[]; tipos=resp.tipos||[];
    permissoesMap={};
    (resp.permissoes||[]).forEach(function(p){ permissoesMap[chave(p.tipo,p.tela)]=p.permitido; });
    render();
  }

  function init(){
    if(_initialized)return;
    if(!window.SGAuth||!window.SGAuth.isAdmin())return; // trava extra no front (o backend também recusa)
    _initialized=true;
    document.getElementById('perm-appVersion').textContent='v'+(document.getElementById('appVersionFoot')?document.getElementById('appVersionFoot').textContent:'');
    document.getElementById('perm-salvarBtn').addEventListener('click',salvar);
    carregar();
  }

  window.permissoesApp={init:init};
})();


