/**
 * Foto ampliada — mesmo padrão do admin (SGFotoModal em js/sg-auth.js), só
 * que o app do técnico não carrega sg-auth.js (usa seu próprio conjunto de
 * módulos), então essa é a cópia local com a mesma API (abrir/fechar).
 *
 * Clicar numa foto de resposta (link do Drive OU base64 do Firestore) abre
 * em tela cheia aqui, em vez de tentar `window.open` numa aba nova —
 * `window.open(dataURI,'_blank')` é bloqueado silenciosamente pelo Chrome
 * (proteção contra phishing via data: URI), então não funciona assim que a
 * foto vem em base64 direto do Firestore.
 */
window.SGFotoModal=(function(){
  function fechar(){ var m=document.getElementById('sgFotoModal'); if(m)m.classList.add('hidden'); }
  function abrir(url){
    var modal=document.getElementById('sgFotoModal'),img=document.getElementById('sgFoto-img');
    if(!modal||!img||!url)return;
    img.src=url;
    modal.classList.remove('hidden');
  }
  document.addEventListener('DOMContentLoaded',function(){
    var modal=document.getElementById('sgFotoModal');
    if(!modal)return;
    modal.addEventListener('click',fechar);
    document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&!modal.classList.contains('hidden'))fechar(); });
  });
  return {abrir:abrir,fechar:fechar};
})();
