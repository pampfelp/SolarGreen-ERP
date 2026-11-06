// ════ AVISO DE VERSÃO NOVA (2026-11-06) ════
// Pedido do Felipe: quando sobe uma atualização, a página aberta tem de saber
// que ficou para trás e mostrar o botão "Atualizar". Vale para todas as telas
// (ERP, técnico, disparos, ponto, proposta, planilha, fotos, lista de material).
//
// Como sabe: de tempos em tempos busca o próprio HTML no servidor e compara
// com o que está rodando. Todo deploy sobe o ?v= dos arquivos que mudaram
// (crença 7), então um arquivo com ?v= que a página não carregou = versão
// nova. Mudança só no HTML também conta (comparação do texto com o da
// primeira busca). Sem número de versão para lembrar de trocar.
//
// Arquivo independente: não usa o CSS nem o JS de nenhuma tela.
(function(){
  if(window.SGAtualizar)return;
  var INTERVALO_MS=5*60*1000;
  var _base=null, _checando=false, _mostrado=false;

  function caminho(u){
    try{ var x=new URL(u,location.href); return x.pathname+x.search; }catch(e){ return String(u); }
  }
  // Arquivos com ?v= que um documento carrega (script e link).
  function versoes(doc){
    var s={};
    Array.prototype.forEach.call(doc.querySelectorAll('script[src],link[href]'),function(e){
      var u=e.getAttribute('src')||e.getAttribute('href')||'';
      if(u.indexOf('?v=')!==-1)s[caminho(u)]=true;
    });
    return s;
  }
  function resumo(texto){
    var t=String(texto).replace(/\s+/g,' '), h=5381;
    for(var i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))|0;
    return h+':'+t.length;
  }

  function checar(){
    if(_mostrado||_checando||document.hidden||navigator.onLine===false||!window.fetch||!window.DOMParser)return;
    _checando=true;
    // ?sgv= fura o cache da CDN do GitHub Pages; o sw.js deixa passar sem guardar.
    fetch(location.pathname+'?sgv='+Date.now(),{cache:'no-store'}).then(function(r){
      return r.ok?r.text():null;
    }).then(function(texto){
      if(!texto)return;
      var novo=versoes(new DOMParser().parseFromString(texto,'text/html')), atual=versoes(document);
      var mudou=Object.keys(novo).some(function(k){ return !atual[k]; });
      var h=resumo(texto);
      if(_base===null)_base=h; else if(h!==_base)mudou=true;
      if(mudou)mostrar();
    }).catch(function(){ /* sem rede agora: tenta na próxima */ }).then(function(){ _checando=false; });
  }

  function atualizar(botao){
    botao.disabled=true; botao.textContent='Atualizando';
    // Renova o HTML no cache do navegador antes de recarregar (páginas sem service worker).
    fetch(location.href,{cache:'reload'}).catch(function(){}).then(function(){ location.reload(); });
  }

  function mostrar(){
    if(_mostrado)return;
    _mostrado=true;
    var css=document.createElement('style');
    css.textContent=
      '#sg-atualizar{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;'+
      'display:flex;align-items:center;gap:12px;max-width:calc(100vw - 24px);box-sizing:border-box;background:#003122;color:#fff;'+
      'border-radius:999px;padding:8px 8px 8px 18px;box-shadow:0 10px 30px rgba(0,0,0,.28);'+
      'font:600 13px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}'+
      '#sg-atualizar span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'+
      '#sg-atualizar button{flex:none;background:#78D800;color:#003122;border:none;border-radius:999px;padding:9px 16px;'+
      'font:700 13px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;cursor:pointer;}'+
      '#sg-atualizar button:disabled{opacity:.7;cursor:default;}';
    document.head.appendChild(css);
    var barra=document.createElement('div');
    barra.id='sg-atualizar'; barra.setAttribute('role','status');
    barra.innerHTML='<span>Tem versão nova do sistema.</span><button type="button">Atualizar</button>';
    document.body.appendChild(barra);
    barra.querySelector('button').addEventListener('click',function(){ atualizar(this); });
  }

  function iniciar(){
    setTimeout(checar,5000);
    setInterval(checar,INTERVALO_MS);
    document.addEventListener('visibilitychange',function(){ if(!document.hidden)checar(); });
    window.addEventListener('online',checar);
  }
  window.SGAtualizar={checar:checar};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar); else iniciar();
})();
