// ════ CONTROLLER ════
(function(){
  var views={dashboard:document.getElementById('view-dashboard'),ponto:document.getElementById('view-ponto'),vendas:document.getElementById('view-vendas'),funil:document.getElementById('view-funil'),agendamentos:document.getElementById('view-agendamentos'),clientes:document.getElementById('view-clientes'),planos:document.getElementById('view-planos'),relatorios:document.getElementById('view-relatorios'),custosvenda:document.getElementById('view-custosvenda'),custorecorrente:document.getElementById('view-custorecorrente'),servicos:document.getElementById('view-servicos'),catalogo:document.getElementById('view-catalogo'),metas:document.getElementById('view-metas'),usuarios:document.getElementById('view-usuarios'),permissoes:document.getElementById('view-permissoes')};
  var navLinks={dashboard:document.getElementById('nav-dashboard'),ponto:document.getElementById('nav-ponto'),vendas:document.getElementById('nav-vendas'),funil:document.getElementById('nav-funil'),agendamentos:document.getElementById('nav-agendamentos'),clientes:document.getElementById('nav-clientes'),planos:document.getElementById('nav-planos'),relatorios:document.getElementById('nav-relatorios'),custosvenda:document.getElementById('nav-custosvenda'),custorecorrente:document.getElementById('nav-custorecorrente'),servicos:document.getElementById('nav-servicos'),catalogo:document.getElementById('nav-catalogo'),metas:document.getElementById('nav-metas'),usuarios:document.getElementById('nav-usuarios'),permissoes:document.getElementById('nav-permissoes')};
  function switchTo(name){
    if((name==='usuarios'||name==='permissoes'||name==='metas'||name==='custorecorrente')&&(!window.SGAuth||!window.SGAuth.isAdmin()))name='ponto';
    Object.keys(views).forEach(function(k){if(!views[k]||!navLinks[k])return;views[k].classList.toggle('active',k===name);navLinks[k].classList.toggle('active',k===name);});
    localStorage.setItem('sg_active_view',name);
    if(name==='dashboard'&&window.dashboardApp)window.dashboardApp.init();
    if(name==='funil'&&window.funilApp)window.funilApp.init();
    if(name==='agendamentos'&&window.agendamentosApp)window.agendamentosApp.init();
    if(name==='planos'&&window.planosApp)window.planosApp.init();
    if(name==='relatorios'&&window.relatoriosApp)window.relatoriosApp.init();
    if(name==='custosvenda'&&window.custosVendaApp)window.custosVendaApp.init();
    if(name==='custorecorrente'&&window.custoRecorrenteApp)window.custoRecorrenteApp.init();
    if(name==='servicos'&&window.servicosApp)window.servicosApp.init();
    if(name==='catalogo'&&window.catalogoApp)window.catalogoApp.init();
    if(name==='metas'&&window.metasApp)window.metasApp.init();
    if(name==='clientes'&&window.clientesApp)window.clientesApp.init();
    if(name==='usuarios'&&window.usuariosApp)window.usuariosApp.init();
    if(name==='permissoes'&&window.permissoesApp)window.permissoesApp.init();
  }
  navLinks.dashboard.addEventListener('click',function(e){e.preventDefault();switchTo('dashboard');});
  navLinks.ponto.addEventListener('click',function(e){e.preventDefault();switchTo('ponto');});
  navLinks.vendas.addEventListener('click',function(e){e.preventDefault();switchTo('vendas');});
  navLinks.funil.addEventListener('click',function(e){e.preventDefault();switchTo('funil');});
  if(navLinks.agendamentos)navLinks.agendamentos.addEventListener('click',function(e){e.preventDefault();switchTo('agendamentos');});
  if(navLinks.planos)navLinks.planos.addEventListener('click',function(e){e.preventDefault();switchTo('planos');});
  if(navLinks.relatorios)navLinks.relatorios.addEventListener('click',function(e){e.preventDefault();switchTo('relatorios');});
  if(navLinks.custosvenda)navLinks.custosvenda.addEventListener('click',function(e){e.preventDefault();switchTo('custosvenda');});
  if(navLinks.custorecorrente)navLinks.custorecorrente.addEventListener('click',function(e){e.preventDefault();switchTo('custorecorrente');});
  if(navLinks.servicos)navLinks.servicos.addEventListener('click',function(e){e.preventDefault();switchTo('servicos');});
  if(navLinks.catalogo)navLinks.catalogo.addEventListener('click',function(e){e.preventDefault();switchTo('catalogo');});
  if(navLinks.metas)navLinks.metas.addEventListener('click',function(e){e.preventDefault();switchTo('metas');});
  if(navLinks.clientes)navLinks.clientes.addEventListener('click',function(e){e.preventDefault();switchTo('clientes');});
  if(navLinks.usuarios)navLinks.usuarios.addEventListener('click',function(e){e.preventDefault();switchTo('usuarios');});
  if(navLinks.permissoes)navLinks.permissoes.addEventListener('click',function(e){e.preventDefault();switchTo('permissoes');});
  window.SGControllerSwitchTo=switchTo; // exposto pra SGPermissoes poder trocar de tela se a atual for escondida
  var saved=localStorage.getItem('sg_active_view')||'ponto';
  if(!views[saved])saved='ponto';
  switchTo(saved);
  // Se as permissões já tiverem carregado antes desse controller rodar (ex: cache
  // rápido), aplica o filtro na hora — senão, SGPermissoes.carregar() já chama
  // aplicarNoMenu() sozinho assim que a resposta chegar.
  if(window.SGPermissoes&&window.SGPermissoes.carregado())window.SGPermissoes.aplicarNoMenu();
})();

(function(){
  var sidebar=document.querySelector('.sidebar'),btn=document.getElementById('sidebarToggle'),ico=document.getElementById('toggleIco'),KEY='sg_sidebar_collapsed';
  function apply(collapsed,animate){if(!animate){sidebar.style.transition='none';requestAnimationFrame(function(){sidebar.style.transition='';});}sidebar.classList.toggle('collapsed',collapsed);ico.classList.toggle('collapsed-ico',collapsed);btn.title=collapsed?'Expandir menu':'Recolher menu';}
  apply(localStorage.getItem(KEY)==='1',false);
  btn.addEventListener('click',function(){var c=!sidebar.classList.contains('collapsed');apply(c,true);localStorage.setItem(KEY,c?'1':'0');});
  // Em telas ≤760px a sidebar vira gaveta lateral (ver CSS) e o botão de recolher fica oculto — não é necessário nesse layout.
})();

// ── Menu mobile: hambúrguer abre a sidebar como gaveta, com fundo escurecido atrás ──
(function(){
  var sidebarEl=document.querySelector('.sidebar');
  var btnAbrir=document.getElementById('btn-abrir-menu');
  var backdrop=document.getElementById('sidebar-backdrop');
  if(!sidebarEl||!btnAbrir||!backdrop)return;
  function abrirMenuMobile(){ sidebarEl.classList.add('mobile-open'); backdrop.classList.add('active'); }
  function fecharMenuMobile(){ sidebarEl.classList.remove('mobile-open'); backdrop.classList.remove('active'); }
  btnAbrir.addEventListener('click',abrirMenuMobile);
  backdrop.addEventListener('click',fecharMenuMobile);
  // Tocar em qualquer item do menu já fecha a gaveta — senão a pessoa troca de
  // tela e o menu continua aberto por cima, tampando o conteúdo.
  sidebarEl.querySelectorAll('nav a').forEach(function(a){ a.addEventListener('click',fecharMenuMobile); });
})();
