// ════ USUÁRIOS (somente administradores) ════
(function(){
  var _initialized=false;
  var _epoca=window.SGEpoca.criar();
  var usuarios=[];
  var editandoId=null; // null = criando novo
  var fotoNova=null, fotoPendente=false, fotoEpoca=0;

  function apiCall(action,payload){ return window.SGAuth.apiCall(action,payload); }
  function meuId(){ return window.SGUtil.meuId(); }

  function showMsg(texto,tipo){
    var el=document.getElementById('u-modalMsg');
    el.className='uform-msg'+(tipo?' '+tipo:'');
    el.textContent=texto||'';
  }

  function escapeHtml(s){ return window.SGUtil.escapeHtml(s); }
  function fotoValida(uri){return /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(uri||'')&&uri.length<80000;}
  function mostrarFoto(uri,nome){
    var preview=document.getElementById('u-foto-preview');
    preview.textContent=(nome||'').trim().split(/\s+/).slice(0,2).map(function(p){return p[0]||'';}).join('').toUpperCase()||'SG';
    if(fotoValida(uri)){
      var img=document.createElement('img');img.src=uri;img.alt='';preview.textContent='';preview.appendChild(img);
    }
  }
  function comprimirFoto(file){
    function exportar(source,w,h){
      var canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),lado=Math.min(w,h);
      canvas.width=192;canvas.height=192;ctx.fillStyle='#fff';ctx.fillRect(0,0,192,192);
      ctx.drawImage(source,(w-lado)/2,(h-lado)/2,lado,lado,0,0,192,192);
      return canvas.toDataURL('image/jpeg',.78);
    }
    if(typeof createImageBitmap==='function')return createImageBitmap(file).then(function(bitmap){
      var uri=exportar(bitmap,bitmap.width,bitmap.height);bitmap.close();return uri;
    }).catch(function(){return viaImagem();});
    return viaImagem();
    function viaImagem(){return new Promise(function(resolve,reject){
      var img=new Image(),url=URL.createObjectURL(file);
      img.onload=function(){URL.revokeObjectURL(url);resolve(exportar(img,img.width,img.height));};
      img.onerror=function(){URL.revokeObjectURL(url);reject(new Error('Não foi possível ler esta imagem.'));};
      img.src=url;
    });}
  }

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
    fotoNova=null;fotoPendente=false;fotoEpoca++;
    showMsg('');
    document.getElementById('u-formWrap').classList.remove('hidden');
    document.getElementById('u-sucessoWrap').classList.add('hidden');
    var u=idVendedor?usuarios.filter(function(x){return String(x.IdVendedor)===String(idVendedor);})[0]:null;
    document.getElementById('usuarioModalTitle').textContent=u?'Editar usuário':'Novo usuário';
    document.getElementById('u-nome').value=u?(u.Nome||''):'';
    document.getElementById('u-email').value=u?(u.Email||''):'';
    document.getElementById('u-telefone').value=u?(u.Telefone||''):'';
    document.getElementById('u-tipo').value=u?(u.Tipo||''):'';
    document.getElementById('u-status').value=(u&&u.Status)||'Ativo';
    document.getElementById('u-foto').value='';
    mostrarFoto(u&&u.FotoPerfil, u&&u.Nome);
    document.getElementById('u-notaSenha').style.display=u?'block':'none';
    document.getElementById('usuarioModal').classList.remove('hidden');
  }
  function closeModal(){ document.getElementById('usuarioModal').classList.add('hidden'); editandoId=null; fotoEpoca++; }

  // Senha compartilhada de primeiro acesso — mesma usada nas 8 contas
  // criadas em 2026-08-24 (ver segundo cérebro). Todo mundo passa pela
  // tela "Crie sua senha" no primeiro login (SenhaTemporaria:true),
  // então não precisa ser secreta nem única por pessoa.
  var SENHA_PADRAO='SolarGreen@2026';

  // Cria a conta de login (Firebase Auth) e o cadastro (Firestore) juntos —
  // pedido do Felipe (2026-08-24): antes, "Novo usuário" só gravava o
  // Firestore, sem nenhuma conta de verdade pra pessoa entrar (só editar
  // um usuário JÁ existente funcionava). Usa uma instância SECUNDÁRIA do
  // Firebase pra criar a conta sem derrubar a sessão de quem tá logado
  // criando (senão o createUserWithEmailAndPassword trocaria a sessão
  // ativa pra da pessoa recém-criada).
  function criarNovoUsuarioComLogin(nome,email,telefone,tipo,status,foto){
    var salvarBtn=document.getElementById('u-salvarBtn');
    salvarBtn.disabled=true; salvarBtn.textContent='Criando…';
    var db=firebase.firestore();
    db.collection('vendedores').where('Email','==',email).limit(1).get().then(function(snap){
      var legado=snap.empty?null:snap.docs[0];
      var appSecundario=firebase.apps.filter(function(a){return a.name==='sg-criar-usuario';})[0]
        ||firebase.initializeApp(firebase.app().options,'sg-criar-usuario');
      var authSecundario=appSecundario.auth();
      return authSecundario.createUserWithEmailAndPassword(email,SENHA_PADRAO).then(function(cred){
        var uid=cred.user.uid;
        return authSecundario.signOut().then(function(){
          if(legado){
            // Já existe cadastro com esse e-mail (ex.: vendedor migrado da
            // planilha, nunca tinha logado) — não duplica nem move: só
            // marca SenhaTemporaria, o login já sabe achar esse registro
            // pelo e-mail e usar o ID dele (ver js/sg-auth.js), preservando
            // todo o histórico que já referencia esse ID antigo.
            var dadosLegado={Nome:nome,Telefone:telefone,Tipo:tipo,Status:status,SenhaTemporaria:true};
            if(foto)dadosLegado.FotoPerfil=foto;
            return legado.ref.set(dadosLegado,{merge:true})
              .then(function(){ return {reaproveitou:true}; });
          }
          var doc={IdVendedor:uid,Nome:nome,Email:email,Telefone:telefone,Tipo:tipo,Status:status,SenhaTemporaria:true};
          if(foto)doc.FotoPerfil=foto;
          return db.collection('vendedores').doc(uid).set(doc).then(function(){ return {reaproveitou:false}; });
        });
      });
    }).then(function(resultado){
      salvarBtn.disabled=false; salvarBtn.textContent='Salvar';
      document.getElementById('u-formWrap').classList.add('hidden');
      document.getElementById('u-sucessoWrap').classList.remove('hidden');
      document.getElementById('u-sucessoTexto').textContent=resultado.reaproveitou
        ?('Já existia um cadastro de '+nome+' (histórico mantido) — agora com login habilitado.')
        :(nome+' já pode entrar no sistema.');
      document.getElementById('u-sucessoSenha').textContent=SENHA_PADRAO;
      carregar();
    }).catch(function(err){
      salvarBtn.disabled=false; salvarBtn.textContent='Salvar';
      var msg=err.code==='auth/email-already-in-use'
        ?'Já existe uma CONTA DE LOGIN com esse e-mail — a pessoa já consegue entrar, não precisa criar de novo.'
        :err.code==='auth/invalid-email'
        ?'E-mail inválido.'
        :'Não foi possível criar: '+(err.message||err.code);
      showMsg(msg,'error');
    });
  }

  function salvar(){
    var nome=document.getElementById('u-nome').value.trim();
    var email=document.getElementById('u-email').value.trim();
    var telefone=document.getElementById('u-telefone').value.trim();
    var tipo=document.getElementById('u-tipo').value.trim();
    var status=document.getElementById('u-status').value;
    if(!nome||!email){ showMsg('Nome e e-mail são obrigatórios.','error'); return; }
    if(fotoPendente){showMsg('Aguarde a foto terminar de preparar.','error');return;}

    if(!editandoId){ criarNovoUsuarioComLogin(nome,email,telefone,tipo,status,fotoNova); return; }

    // Edição de usuário já existente — otimista, igual ao resto do sistema
    // (criar conta nova é o caso especial acima, tratado à parte porque
    // depende do Firebase Auth responder antes de saber o ID de verdade).
    var idAlvo=editandoId;
    var registroAnteriorCopia=Object.assign({},usuarios.filter(function(x){return String(x.IdVendedor)===String(idAlvo);})[0]);

    var registroNovo=Object.assign({},registroAnteriorCopia,{Nome:nome,Email:email,Telefone:telefone,Tipo:tipo,Status:status});
    if(fotoNova)registroNovo.FotoPerfil=fotoNova;
    var indice=usuarios.findIndex(function(x){return String(x.IdVendedor)===String(idAlvo);});
    if(indice!==-1)usuarios[indice]=registroNovo;
    _epoca.marcar();

    closeModal();
    render();
    (window.SGToast?window.SGToast.mostrar:function(t){})('Usuário atualizado.');

    apiCall('salvarVendedor',{
      solicitanteId:meuId(), idVendedor:idAlvo,
      nome:nome, email:email, telefone:telefone, tipo:tipo, status:status, fotoPerfil:fotoNova
    }).then(function(resp){
      if(!resp||!resp.ok){
        var idx=usuarios.findIndex(function(x){return String(x.IdVendedor)===String(idAlvo);});
        if(idx!==-1)usuarios[idx]=registroAnteriorCopia;
        _epoca.marcar();
        render();
        (window.SGToast?window.SGToast.mostrar:function(t){alert(t);})((resp&&resp.erro)||'Não foi possível salvar — a alteração foi desfeita.',true);
      }
    }).catch(function(err){
      var idx=usuarios.findIndex(function(x){return String(x.IdVendedor)===String(idAlvo);});
      if(idx!==-1)usuarios[idx]=registroAnteriorCopia;
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
    document.getElementById('u-foto').addEventListener('change',function(){
      var file=this.files&&this.files[0];if(!file)return;
      if(!/^image\//.test(file.type)){showMsg('Escolha um arquivo de imagem.','error');this.value='';return;}
      fotoNova=null;fotoPendente=true;var epoca=++fotoEpoca;showMsg('Preparando foto…');
      comprimirFoto(file).then(function(uri){
        if(epoca!==fotoEpoca)return;
        fotoPendente=false;
        if(!fotoValida(uri)){showMsg('A foto ficou grande demais. Escolha outra imagem.','error');return;}
        fotoNova=uri;mostrarFoto(uri,document.getElementById('u-nome').value);showMsg('Foto pronta para salvar.','success');
      }).catch(function(err){if(epoca!==fotoEpoca)return;fotoPendente=false;showMsg(err.message||'Não foi possível preparar a foto.','error');});
    });
    document.getElementById('u-sucessoFecharBtn').addEventListener('click',closeModal);
    document.getElementById('usuarioModal').addEventListener('click',function(e){ if(e.target.id==='usuarioModal')closeModal(); });
    carregar();
  }

  window.usuariosApp={init:init};
})();


