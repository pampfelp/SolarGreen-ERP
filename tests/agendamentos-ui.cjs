const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
// Requer playwright-core no ambiente de testes (ou PLAYWRIGHT_MODULE com caminho do módulo).
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'maquetes','agendamentos-por-tecnico-2026-11-26');
fs.mkdirSync(out,{recursive:true});
const vendedores=[{IdVendedor:'T1',Nome:'Dalton Soares',Tipo:'Técnico',Status:'Ativo'},{IdVendedor:'T2',Nome:'Robson de Lima Marques',Tipo:'Tecnico',Status:'Ativo'},{IdVendedor:'T3',Nome:'Oziel Vanzeler',Tipo:'Técnico',Status:'Ativo'},{IdVendedor:'A1',Nome:'Pessoa administrativa',Tipo:'Admin',Status:'Ativo'}];
const servicos=[{IdServico:'S1','Nome Servico':'Vistoria de diagnóstico',TipoServico:'Campo'},{IdServico:'S2','Nome Servico':'Limpeza',TipoServico:'Campo'},{IdServico:'S3','Nome Servico':'Manutenção corretiva',TipoServico:'Campo'}];
const nomes=['Ana Costa','Carlos Lima','Bruno Alves','Paula Rocha','Marina Souza','Pedro Santos'];
const clientes=nomes.map((n,i)=>({IdCliente:'C'+i,'Nome Razao Social':n,Email:'exemplo'+i+'@example.com',Endereco:'Endereço de exemplo',Telefone:''}));
const criar=(id,t,c,s,ini,fim,extra={})=>({IdAgendamento:id,TecnicoResponsavel:t,IdCliente:'C'+c,NomeCliente:nomes[c],IdServico:s,'Data Inicio':'2026-11-30','Hora inicio':ini,'Hora Fim':fim,'Status Agendamento':'Agendado',DataCriacao:'2026-11-26T12:00:00Z',Valor:100,...extra});
const agendamentos=[criar('OS1','T1',0,'S1','08:00','10:00'),criar('OS2','T1',1,'S2','14:00','16:00'),criar('OS3','T2',2,'S3','09:00','11:00'),criar('OS4','T2',3,'S1','16:00','18:00'),criar('OS5','T3',4,'S2','08:00','10:00'),criar('OS6','T3',5,'S1','14:00','16:00')];
const dados={agendamentos,clientes,vendedores,servicos,templates:[],respostas:[]};
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file=path.join(root,name==='/'?'index.html':name);
  if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end();}
  let body=fs.readFileSync(file);
  if(file.endsWith('index.html'))body=body.toString('utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.ico':'image/x-icon','.json':'application/json'})[ext]||'application/octet-stream');
  res.end(body);
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.NAVEGADOR||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/Sao_Paulo',locale:'pt-BR'});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto(origin,{waitUntil:'networkidle'});
    await page.addScriptTag({url:origin+'/js/sg-auth.js'});
    await page.evaluate((fixture)=>{
      window.__fixture=fixture;window.__assinaturas={};window.__calls=[];
      window.SG_SESSION={idVendedor:'ADMIN-TESTE',nome:'Validação local',tipo:'Admin'};
      window.SGFireReady=Promise.resolve();
      window.SGCache={get:()=>({dados:window.__fixture}),set:()=>{}};
      window.SGUtil.assinarColecao=(nome,fn)=>{window.__assinaturas[nome]=fn;fn(window.__fixture[nome]||[]);return ()=>{};};
      window.SGUtil.buscarClientePorId=(id)=>Promise.resolve(window.__fixture.clientes.find(c=>c.IdCliente===id));
      window.SGAuth.apiCall=(action,payload)=>{window.__calls.push({action,payload});return Promise.resolve({ok:true,respostas:[]});};
      window.SGAuth.isAdmin=()=>true;
      window.fetch=()=>Promise.reject(new Error('Rede de negócio desativada no teste local'));
      document.documentElement.classList.remove('sg-locked');
      document.getElementById('sg-login-screen').style.display='none';
      document.querySelectorAll('.view').forEach(e=>e.classList.remove('active'));
      document.getElementById('view-agendamentos').classList.add('active');
      document.querySelectorAll('.sidebar a.active').forEach(e=>e.classList.remove('active'));
      document.getElementById('nav-agendamentos').classList.add('active');
      document.getElementById('sg-user-name').textContent='Validação local';
    },dados);
    for(const script of ['agenda-periodo.js','agendamentos-dia.js','agendamentos.js'])await page.addScriptTag({url:origin+'/js/'+script});
    await page.evaluate(()=>window.agendamentosApp.init());
    assert.equal(await page.locator('#ag-viewLista').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#ag-tbody tr').count(),6);
    await page.locator('#ag-dateFrom').fill('2026-11-01');await page.locator('#ag-dateFrom').dispatchEvent('change');
    await page.locator('#ag-viewTecnicos').click();
    await page.locator('#ag-diaSelecionado').fill('2026-11-30');await page.locator('#ag-diaSelecionado').dispatchEvent('change');
    assert.equal(await page.locator('.ag-tecnico-card').count(),3);
    assert.equal(await page.locator('#ag-diaKpiOcupadas').textContent(),'12 h');
    assert.equal(await page.locator('#ag-diaKpiDisponiveis').textContent(),'18 h');
    assert.equal(await page.locator('#tblAgendamentos').isVisible(),false);
    const ids=await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((id,i)=>id.startsWith('ag-')&&ids.indexOf(id)!==i);});assert.deepEqual(ids,[]);
    await page.locator('#ag-viewTecnicos').focus();
    await page.screenshot({path:path.join(out,'implementacao-desktop.png'),fullPage:true,animations:'disabled'});
    // Busca preserva toda a ocupação do técnico encontrado e não altera KPI.
    await page.locator('#ag-buscaGeral').fill('Ana Costa');
    assert.equal(await page.locator('.ag-tecnico-card').count(),1);
    assert.match(await page.locator('.ag-tecnico-card').textContent(),/Carlos Lima/);
    assert.equal(await page.locator('#ag-diaKpiOcupadas').textContent(),'12 h');
    await page.locator('#ag-buscaGeral').fill('');
    // Novo horário preenche formulário sem persistir.
    await page.locator('.ag-tecnico-card').filter({hasText:'Dalton Soares'}).locator('button.ag-dia-livre').first().focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#ag-dataInicio').inputValue(),'2026-11-30');
    assert.equal(await page.locator('#ag-tecnico').inputValue(),'T1');
    assert.equal(await page.locator('#ag-horaInicio').inputValue(),'10:00');
    assert.equal(await page.locator('#ag-horaFim').inputValue(),'14:00');
    assert.equal(await page.locator('#agendamentoModalTitle').textContent(),'Novo agendamento');
    assert.equal(await page.locator('#ag-statusField').isVisible(),false);
    await page.locator('#ag-cancelBtn').click();
    // Detalhe abre leitura; sair preserva o dia.
    await page.locator('button[data-agendamento="OS1"]').click();
    assert.match(await page.locator('#ad-title').textContent(),/Ana Costa/);
    await page.locator('#ad-fecharBtn').click();
    // Virada de mês e ano com teclado e retorno ao hoje local.
    await page.locator('#ag-diaProximo').focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#ag-diaSelecionado').inputValue(),'2026-12-01');
    assert.equal(await page.locator('button.ag-dia-livre').count(),3);
    await page.locator('#ag-diaSelecionado').fill('2026-12-31');await page.locator('#ag-diaSelecionado').dispatchEvent('change');await page.locator('#ag-diaProximo').click();
    assert.equal(await page.locator('#ag-diaSelecionado').inputValue(),'2027-01-01');await page.locator('#ag-diaAnterior').click();
    assert.equal(await page.locator('#ag-diaSelecionado').inputValue(),'2026-12-31');
    await page.locator('#ag-diaHoje').click();assert.equal(await page.locator('#ag-diaSelecionado').inputValue(),await page.evaluate(()=>window.SGUtil.dateKey(new Date())));
    await page.locator('#ag-diaSelecionado').fill('2026-11-30');await page.locator('#ag-diaSelecionado').dispatchEvent('change');
    // Cancelado libera a faixa, sobreposição usa união e atualização não requer recarregar.
    await page.evaluate(()=>{const a=window.__fixture.agendamentos;a[0]['Status Agendamento']='Cancelado';a.push({...a[1],IdAgendamento:'SOBREPOSTO','Hora inicio':'15:00','Hora Fim':'17:00'});window.__assinaturas.agendamentos(a);});
    assert.equal(await page.locator('#ag-diaKpiOcupadas').textContent(),'11 h');
    assert.equal(await page.locator('button.ag-dia-cancelado').count(),1);
    // OS multidiária continua ocupando no dia do meio.
    await page.evaluate(()=>{const a=window.__fixture.agendamentos;a.push({...a[2],IdAgendamento:'MULTI','Data Inicio':'2026-11-29','Data Fim':'2026-12-01','Hora Fim Servico':'12:00'});window.__assinaturas.agendamentos(a);});
    assert.equal(await page.locator('#ag-diaKpiOcupadas').textContent(),'17 h');
    assert.equal(await page.locator('.ag-tecnico-card').filter({hasText:'Robson de Lima Marques'}).locator('.ag-dia-livre').count(),0);
    // Dado legado sem horário nunca cria falsa disponibilidade.
    await page.evaluate(()=>{const a=window.__fixture.agendamentos;a.push({...a[4],IdAgendamento:'SEM-HORA','Hora inicio':''});window.__assinaturas.agendamentos(a);});
    assert.equal(await page.locator('.ag-tecnico-card').filter({hasText:'Oziel Vanzeler'}).locator('.ag-dia-livre').count(),0);
    assert.match(await page.locator('#ag-diaKpiDisponiveis').textContent(),/parcial/);
    // Só técnicos ativos aparecem, mesmo que outros responsáveis tenham OS no dia.
    await page.evaluate(()=>{const a=window.__fixture.agendamentos,v=window.__fixture.vendedores;v.push({IdVendedor:'INATIVO',Nome:'Técnico inativo de teste',Tipo:'Tecnico',Status:'Inativo'});window.__assinaturas.vendedores(v);a.push({...a[1],IdAgendamento:'ORFAO',TecnicoResponsavel:'ANTIGO'},{...a[1],IdAgendamento:'SEM-TECNICO',TecnicoResponsavel:''},{...a[1],IdAgendamento:'OS-INATIVO',TecnicoResponsavel:'INATIVO'});window.__assinaturas.agendamentos(a);});
    assert.equal(await page.locator('.ag-tecnico-card').count(),3);
    assert.equal(await page.locator('#ag-selTecnico option[value="INATIVO"]').count(),0);
    assert.equal(await page.locator('#ag-selTecnico option[value="ANTIGO"]').count(),0);
    assert.equal(await page.locator('#ag-diaKpiTecnicos').textContent(),'3');
    assert.equal(await page.locator('#ag-diaKpiAgendamentos').textContent(),'9');
    // Desativar em tempo real remove o técnico dos cards e do filtro.
    await page.evaluate(()=>{window.__fixture.vendedores[0].Status='Inativo';window.__assinaturas.vendedores(window.__fixture.vendedores);});
    assert.equal(await page.locator('.ag-tecnico-card').count(),2);
    assert.equal(await page.locator('#ag-selTecnico option[value="T1"]').count(),0);
    // Restaura fixture para print mobile e casos de texto longo.
    await page.evaluate((fixture)=>{window.__fixture=fixture;window.__assinaturas.agendamentos(fixture.agendamentos);window.__assinaturas.vendedores(fixture.vendedores);},dados);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    assert.equal(await page.locator('.ag-tecnico-card').count(),3);
    await page.locator('#ag-viewTecnicos').focus();
    await page.screenshot({path:path.join(out,'implementacao-celular.png'),fullPage:true,animations:'disabled'});
    assert.equal(await page.locator('.sidebar').evaluate(e=>e.getBoundingClientRect().right<=0),true);
    await page.evaluate(()=>{const v=window.__fixture.vendedores;v[0].Nome='Técnico com um nome muito extenso para conferência de quebra e acessibilidade';window.__assinaturas.vendedores(v);});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    // Vazio de busca não altera KPI e voltar à lista restaura período.
    await page.locator('#ag-buscaGeral').fill('naoexiste');assert.equal(await page.locator('.ag-tecnico-card').count(),0);
    await page.locator('#ag-buscaGeral').fill('');await page.locator('#ag-viewLista').click();
    assert.equal(await page.locator('#ag-dateFrom').inputValue(),'2026-11-01');
    assert.equal(await page.locator('#ag-tbody tr').count(),6);
    assert.equal(await page.locator('#ag-diaControles').isVisible(),false);
    assert.equal((await page.evaluate(()=>window.__calls)).some(c=>c.action==='salvarAgendamento'),false);
    assert.deepEqual(errors,[]);
    const result={ok:true,viewportDesktop:1440,viewportMobile:390,pageErrors:errors,testes:['lista preservada','cards e KPIs','busca sem falsa disponibilidade','formulário preenchido por teclado','detalhe','virada mês/ano e Hoje','cancelado e união','OS vários dias','sem horário','somente técnicos ativos','realtime','mobile sem overflow','texto longo','vazio','sem gravação real']};
    fs.writeFileSync(path.join(out,'validacao-ui.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
