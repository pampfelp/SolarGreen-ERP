const {chromium} = require('playwright');
const path = require('path');
const baseUrl = process.env.APP_URL || 'http://127.0.0.1:8765/';

const firebaseMock = `
var fixtures = {
  agendamentos: [
    {IdAgendamento:'os1', IdCliente:'teste', NomeCliente:'Cliente Conceição Teste', 'Data Inicio':'05/10/2026', 'Status Agendamento':'Agendado', IdServico:'s1'},
    {IdAgendamento:'os2', IdCliente:'outro', NomeCliente:'Outra Pessoa Teste', 'Data Inicio':'2026-09-28', 'Status Agendamento':'Concluído', IdServico:'s1'}
  ],
  servicos: [{IdServico:'s1', 'Nome Servico':'Instalação'}]
};
var emptyQuery = () => { const q = {get:async()=>({docs:[],empty:true,forEach(){}}), limit(){return q}, where(){return q}}; return q; };
window.firebase = {
  initializeApp(){},
  auth(){
    return {
      onAuthStateChanged(callback){setTimeout(()=>callback({uid:'test-user',email:'teste@example.com',getIdToken:async()=> 'test-token'}),0)},
      signOut:async()=>{}
    };
  },
  firestore(){
    return {collection(name){
      return {
        doc(id){return {
          get:async()=> name==='vendedores' ? {exists:true,data:()=>({Email:'teste@example.com',Status:'Ativo'})}
            : name==='clientes' && id==='teste' ? {exists:true,data:()=>({IdCliente:'teste','Nome Razao Social':'Cliente de teste'})}
            : name==='listas_material' && localStorage.getItem('test-list-'+id)
              ? {exists:true,data:()=>JSON.parse(localStorage.getItem('test-list-'+id))}
              : {exists:false},
          set:async(data)=>{if(name==='listas_material')localStorage.setItem('test-list-'+id,JSON.stringify(data))}
        }},
        where(){return emptyQuery()},
        get:async()=>{ const docs=(fixtures[name]||[]).map(d=>({id:d.IdAgendamento||d.IdServico,data:()=>d})); return {docs,empty:!docs.length,forEach:f=>docs.forEach(f)}; },
      };
    }};
  }
};
window.firebase.firestore.FieldValue={serverTimestamp:()=>new Date()};
`;

(async () => {
  const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const errors = [];
  for (const width of [1440, 390]) {
    const page = await browser.newPage({viewport:{width,height:1640},deviceScaleFactor:1});
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if(message.type()==='error') console.log('browser:',message.text()); });
    await page.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({contentType:'application/javascript',body:firebaseMock}));
    await page.goto(baseUrl, {waitUntil:'networkidle'});
    try { await page.locator('#app-shell').waitFor({state:'visible',timeout:8000}); }
    catch(e) { console.log('login error:',await page.locator('#login-error').textContent(),'page errors:',errors); throw e; }
    await page.locator('#modules').fill('9');
    await page.locator('#watts').fill('620');
    await page.locator('#inverter').fill('5');
    await page.locator('#floors').fill('2');
    for (const [id, value] of Object.entries({acIn:'5', acOut:'20', dcIn:'3', dcOut:'12', dcRoof:'10', ground:'3'})) await page.locator('#' + id).fill(value);
    if (await page.locator('#stat-ac').textContent() !== '25 m') throw new Error('CA total is not the sum of segments');
    if (await page.locator('#inverter-output').inputValue() !== 'Mono 220 V') throw new Error('Default inverter output is not mono 220 V');
    await page.screenshot({path:path.resolve(__dirname,'../test-results/measures-' + width + '.png'),fullPage:true});
    await page.locator('.gen').click();
    const count = await page.locator('.row').count();
    if (count !== 53) throw new Error('Expected 53 rows, got ' + count);
    const generatedText = await page.locator('#material-list .row .d').evaluateAll(nodes => nodes.map(node => node.value).join('\n'));
    if (!generatedText.includes('Disjuntor bipolar 32 A') || generatedText.includes('fase L3')) throw new Error('Mono 220 V inverter output was confused with grid phases');
    for (const expected of ['3/4" branco', '3/4" preto resistente a UV', 'Abraçadeira plástica', 'Abraçadeira tipo D com cunha', 'Eletroduto corrugado flexível', 'Haste de aterramento']) {
      if (!generatedText.includes(expected)) throw new Error('Missing item: ' + expected);
    }
    if (width === 1440) {
      await page.locator('[data-field="connection"] [data-value="Trifásico"]').click();
      await page.locator('.gen').click();
      const triGridText = await page.locator('#material-list .row .d').evaluateAll(nodes => nodes.map(node => node.value).join('\n'));
      if (!triGridText.includes('Disjuntor bipolar 32 A') || triGridText.includes('fase L3')) throw new Error('Three-phase grid changed the mono inverter circuit');
      await page.locator('[data-field="connection"] [data-value="Bifásico 220 V"]').click();
      await page.locator('.gen').click();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error('Horizontal overflow at ' + width);
    await page.screenshot({path:path.resolve(__dirname,'../test-results/app-' + width + '.png'),fullPage:true});
    const first = page.locator('.row').first();
    if (width === 390) {
      await first.locator('.mobile-unit').fill('barras');
      await first.locator('.mobile-unit').dispatchEvent('change');
      if (await first.locator('.u').inputValue() !== 'barras') throw new Error('Mobile unit edit failed');
    }
    await first.locator('.q').fill('31');
    await first.locator('.q').dispatchEvent('change');
    if (await first.locator('.tag').first().textContent() !== 'Editado') throw new Error('Edit origin missing');
    await page.close();
    console.log(width + 'px: ' + count + ' items, no overflow, editing works');
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const page = await browser.newPage({viewport:{width:390,height:900}});
  await page.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({contentType:'application/javascript',body:firebaseMock}));
  await page.goto(baseUrl + '?clienteId=teste',{waitUntil:'networkidle'});
  await page.getByText('Continuar sem OS').click();
  for(const [id,value] of Object.entries({modules:'9',watts:'620',inverter:'5',acOut:'25',dcOut:'25'})) await page.locator('#'+id).fill(value);
  await page.locator('.gen').click();
  await page.locator('.row').first().locator('.q').fill('33');
  await page.locator('.row').first().locator('.q').dispatchEvent('change');
  await page.locator('.tabs button[data-tab="photos"]').click();
  await page.locator('#photo-input').setInputFiles(path.resolve(__dirname,'../icon-192.png'));
  await page.locator('#thumbs .thumb').waitFor({state:'visible',timeout:5000});
  if(await page.locator('#thumbs .thumb').count()!==1) throw new Error('Photo compression/preview failed');
  await page.locator('.tabs button[data-tab="list"]').click();
  await page.locator('#save-button').click();
  if(!await page.locator('#status').textContent().then(s=>s.includes('salva'))) throw new Error('Save did not finish');
  await page.reload({waitUntil:'networkidle'});
  await page.getByText('Continuar sem OS').click();
  if(await page.locator('.row').first().locator('.q').inputValue()!=='33') throw new Error('Saved edit did not reload');
  if(await page.locator('.row').count()!==44) throw new Error('Saved list did not reload');
  if(await page.locator('#acOut').inputValue()!=='25') throw new Error('Segment did not reload');
  if(await page.locator('#inverter-output').inputValue()!=='Mono 220 V') throw new Error('Inverter output did not reload');
  await page.evaluate(() => {
    const key = 'test-list-teste__avulsa';
    const saved = JSON.parse(localStorage.getItem(key));
    delete saved.medidas.inverterOutput;
    for (const key of ['acIn','acOut','acFlex','dcIn','dcOut','dcRoof']) delete saved.medidas[key];
    saved.medidas.ac = '25'; saved.medidas.dc = '25';
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload({waitUntil:'networkidle'});
  await page.getByText('Continuar sem OS').click();
  if (!await page.locator('#warning').textContent().then(s => s.includes('Lista anterior à separação') && s.includes('divisão dos percursos'))) throw new Error('Legacy list was not flagged for review');
  if (await page.locator('#ac-vistoria').textContent() !== 'total informado: 25 m') throw new Error('Legacy CA total hint missing');
  if(await page.locator('#ai-button').isEnabled()) throw new Error('Unconfigured AI button must be disabled');
  await page.evaluate(() => { window.print = () => {}; });
  await page.locator('.export-button').first().click();
  await page.pdf({path:path.resolve(__dirname,'../test-results/test-print.pdf'),format:'A4',printBackground:true});
  console.log('ERP mock: save and reopen preserved 44 items, segments and edited quantity');
  await page.close();
  const osPage = await browser.newPage({viewport:{width:390,height:900}});
  osPage.on('pageerror', error => errors.push(error.message));
  await osPage.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({contentType:'application/javascript',body:firebaseMock}));
  await osPage.goto(baseUrl,{waitUntil:'networkidle'});
  await osPage.locator('#client-button-mobile').click();
  await osPage.locator('.os-option').first().waitFor({state:'visible',timeout:5000});
  if (await osPage.locator('.os-option').count() !== 2) throw new Error('OS list did not open with all OS');
  if (!(await osPage.locator('.os-option').first().textContent()).includes('Cliente Conceição Teste')) throw new Error('OS list is not sorted by date');
  await osPage.locator('#client-search').fill('conceicao');
  if (await osPage.locator('.os-option').count() !== 1) throw new Error('Accent-insensitive search failed');
  const optionText = await osPage.locator('.os-option').textContent();
  if (!optionText.includes('Instalação') || !optionText.includes('05/10/2026') || !optionText.includes('OS os1')) throw new Error('OS option label incomplete: ' + optionText);
  if (await osPage.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Horizontal overflow with OS dialog');
  await osPage.screenshot({path:path.resolve(__dirname,'../test-results/os-dialog-390.png')});
  await osPage.locator('.os-option').click();
  for(const [id,value] of Object.entries({modules:'9',watts:'620',inverter:'5',acIn:'5',acOut:'20',dcOut:'15',dcRoof:'10'})) await osPage.locator('#'+id).fill(value);
  await osPage.locator('.gen').click();
  await osPage.locator('#save-button').click();
  const savedOs = await osPage.evaluate(() => JSON.parse(localStorage.getItem('test-list-teste__os1') || 'null'));
  if (!savedOs || savedOs.idAgendamento !== 'os1' || savedOs.clienteId !== 'teste' || savedOs.medidas.acOut !== '20') throw new Error('List was not saved on the OS');
  console.log('OS dialog: lists OS, finds "conceicao" without accent, saves list on OS os1');
  await osPage.close();
  if (errors.length) throw new Error(errors.join('\n'));
  await browser.close();
})().catch(error => {console.error(error);process.exit(1)});
