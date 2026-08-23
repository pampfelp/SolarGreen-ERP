(function(){
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(function(){}); }
  var DISMISS_KEY='sg_install_dismissed_v1';
  var banner=document.getElementById('sg-install-banner');
  if(!banner)return;
  var msgEl=document.getElementById('sg-ib-msg');
  var deferredPrompt=null;

  function jaInstalado(){ return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true; }
  function foiDispensado(){ try{ return localStorage.getItem(DISMISS_KEY)==='1'; }catch(e){ return false; } }
  function mostrar(){ if(jaInstalado()||foiDispensado())return; banner.classList.add('show'); }
  function esconder(){ banner.classList.remove('show'); }

  document.getElementById('sg-ib-fechar').addEventListener('click',function(){
    esconder();
    try{ localStorage.setItem(DISMISS_KEY,'1'); }catch(e){}
  });
  document.getElementById('sg-ib-instalar').addEventListener('click',function(){
    if(deferredPrompt){
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function(){ deferredPrompt=null; esconder(); });
    }else{
      alert('Pra instalar: toque no ícone de compartilhar do navegador e escolha "Adicionar à Tela de Início".');
    }
  });

  window.addEventListener('beforeinstallprompt',function(e){
    e.preventDefault();
    deferredPrompt=e;
    mostrar();
  });

  var isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)&&!window.MSStream;
  if(isIOS&&!jaInstalado()&&!foiDispensado()){
    if(msgEl)msgEl.textContent='No iPhone: toque em Compartilhar (□↑) e depois em "Adicionar à Tela de Início".';
    setTimeout(mostrar,2500);
  }
})();
