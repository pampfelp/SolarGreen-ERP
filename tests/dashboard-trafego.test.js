// Dashboard: seção Tráfego pago ligada ao dashboard.js de verdade, num DOM simulado e com dados fictícios.
// Confere que a coleção clientes só é lida quando a seção aparece, os números, os links e o que quem não é admin vê.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function montar({admin,comObserver}){
  const els={};
  const el=id=>els[id]||(els[id]={id,value:'',textContent:'',innerHTML:'',style:{},dataset:{},handlers:{},options:[],
    classList:{add(){},remove(){},toggle(){}},
    appendChild(o){this.options.push(o);},
    addEventListener(t,f){(this.handlers[t]=this.handlers[t]||[]).push(f);},
    dispatchEvent(e){(this.handlers[e.type]||[]).forEach(f=>f(e));return true;},
    querySelectorAll:()=>[],querySelector:()=>null});
  el('db-selVendedor').value='__all__'; el('db-selServico').value='__all__';
  el('db-dateFrom').value='2026-10-01'; el('db-dateTo').value='2026-10-21';
  const assinadas=[]; const nav=[]; const observados=[];
  const dk=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const br=s=>{const m=String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})/);return m?new Date(+m[3],+m[2]-1,+m[1]):null;};
  const num=v=>{if(typeof v==='number')return v;let s=String(v==null?'':v).replace(/[R$\s]/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');const n=parseFloat(s);return isNaN(n)?0:n;};
  const dados={
    vendedores:[{IdVendedor:'v1',Nome:'Ana'}],
    servicos:[{IdServico:'s1','Nome Servico':'Limpeza'}],
    clientes:[{IdCliente:'c1',Origem:'Tráfego pago'},{IdCliente:'c2',Origem:'- tráfego'},{IdCliente:'c3',Origem:'Site'},
              {IdCliente:'c4',Origem:'indicação Bene'},{IdCliente:'c5',Origem:''}],
    vendas:[{IdVenda:'V1',IdCliente:'c1',IdServico:'s1',IdVendedor:'v1',DataVenda:'05/10/2026',Valor:3000},
            {IdVenda:'V2',IdCliente:'c2',IdServico:'s1',IdVendedor:'v1',DataVenda:'08/10/2026',Valor:2000},
            {IdVenda:'V3',IdCliente:'c3',IdServico:'s1',IdVendedor:'v1',DataVenda:'09/10/2026',Valor:1000},
            {IdVenda:'V4',IdCliente:'c4',IdServico:'s1',IdVendedor:'v1',DataVenda:'10/10/2026',Valor:9000},  // outra origem
            {IdVenda:'V5',IdCliente:'c5',IdServico:'s1',IdVendedor:'v1',DataVenda:'11/10/2026',Valor:700},   // sem origem
            {IdVenda:'V9',IdCliente:'da6dbd89',IdServico:'',IdVendedor:'v1',DataVenda:'01/10/2026',Valor:0}], // gaveta do escritório
    custos_venda:[
      {IdCusto:'C1',IdVenda:'V9',Status:'Pago',Valor:'1.200,00',Data:'02/10/2026',Categoria:'trafego_pago'},
      {IdCusto:'C2',IdVenda:'V9',Status:'Pago',Valor:'300',Data:'03/10/2026',Categoria:'marketing'},          // não é tráfego
      {IdCusto:'C3',IdVenda:'V9',Status:'Aguardando Pagamento',Valor:'999',Data:'04/10/2026',Categoria:'trafego_pago'} // não pago
    ],
    agendamentos:[],
    funil:[{IdOportunidade:'f1',DataCriacao:'01/10/2026',IdVendedor:'v1',IdServico:'s1',IdCliente:'c1',Etapa:'Ganho'},
           {IdOportunidade:'f2',DataCriacao:'02/10/2026',IdVendedor:'v1',IdServico:'s1',IdCliente:'c2',Etapa:'Negociação'},
           {IdOportunidade:'f3',DataCriacao:'03/10/2026',IdVendedor:'v1',IdServico:'s1',IdCliente:'c9',Etapa:'Novo Lead',Origem:'Site'}, // cliente fora do cadastro, lead do site
           {IdOportunidade:'f4',DataCriacao:'04/10/2026',IdVendedor:'v1',IdServico:'s1',IdCliente:'c4',Etapa:'Novo Lead'}]
  };
  const context={
    Event:function(t){this.type=t;},
    document:{addEventListener(){},getElementById:el,querySelectorAll:()=>[],querySelector:()=>el('x'),
      createElement:()=>({value:'',textContent:''})},
    localStorage:{getItem:()=>null,setItem(){}},
    window:{
      SG_SESSION:{uid:'u1'},
      SGEpoca:{criar:()=>({marcar(){},atual:()=>1})},
      SGFireReady:Promise.resolve(),
      SGCache:{get:()=>null,set(){}},
      SGAuth:{isAdmin:()=>admin,apiCall:()=>Promise.resolve({ok:false})},
      SGControllerSwitchTo:n=>{nav.push(n);},
      SGUtil:{
        escapeHtml:s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
        fmtMoney:n=>'R$ '+Number(n||0).toFixed(2).replace('.',','),
        parseBRDate:br,parseBRNumber:num,dateKey:dk,fmtDateBR:d=>d?dk(d):'—',
        assinarColecao:(nome,cb)=>{assinadas.push(nome);cb(dados[nome]||[]);},
        calcularConversasPropostas:leads=>({conversas:leads.length,propostas:leads.filter(l=>l.etapa==='Negociação'||l.etapa==='Ganho').length}),
        desdeJanelaFunil:()=>'x'
      }
    }
  };
  if(comObserver)context.window.IntersectionObserver=function(cb){this.observe=n=>observados.push({n,cb,obs:this});this.disconnect=()=>{this.desligado=true;};};
  context.window.SGDre=require('../js/dre-categorias.js');
  vm.createContext(context);
  for(const f of ['dre-dashboard.js','trafego-dashboard.js','dashboard.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+f),'utf8').replace(/\r\n/g,'\n'),context);
  return {context,el,assinadas,nav,observados};
}
const espera=()=>new Promise(r=>setTimeout(r,20));

(async()=>{
  // ── Administrador: clientes só é lida quando a seção aparece
  const A=montar({admin:true,comObserver:true});
  A.context.window.dashboardApp.init();
  await espera();
  assert.ok(!A.assinadas.includes('clientes'),'não lê clientes antes de a seção aparecer');
  assert.ok(A.el('db-tpKpis').innerHTML.includes('Carregando a origem dos clientes'));
  assert.equal(A.observados.length,1); assert.equal(A.observados[0].n.id,'db-trafego');
  A.observados[0].cb([{isIntersecting:true}]);                  // rolou até a seção
  await espera();
  assert.ok(A.assinadas.includes('clientes')); assert.ok(A.observados[0].obs.desligado,'observa uma vez só');

  const k=A.el('db-tpKpis').innerHTML;
  // Investido: só o trafego_pago pago (R$ 1.200; marketing e o não pago ficam fora). Rateio do escritório = 100% sem filtro.
  for(const t of ['R$ 1.200,00','>3<','R$ 400,00 por lead','>3<','R$ 6.000,00','3 vendas desses clientes','R$ 400,00','5,0x'])
    assert.ok(k.includes(t),'KPIs sem '+t);
  const o=A.el('db-tpOrigens').innerHTML;
  assert.ok(o.includes('R$ 5.000')&&o.includes('R$ 1.000'),'tráfego 5.000 e site 1.000');
  assert.ok(o.includes('<strong>Tráfego pago</strong> e <strong>- tráfego</strong>'),'grafias lidas do cadastro');
  assert.ok(A.el('db-tpFunil').innerHTML.includes('Novos contatos</span><span>3<'),'3 leads: c1, c2 e o do site sem cadastro');
  assert.ok(A.el('db-tpSemOrigem').innerHTML.includes('1 venda do período (R$ 700,00)'));
  assert.ok(A.el('db-tpMeses').innerHTML.includes('out/2026 (até dia 21)'));

  // Links
  const clique=A.el('db-trafego').handlers.click[0];
  clique({target:{closest:s=>s==='#db-tpAbrirCustos'?{}:null}});
  assert.deepEqual(A.nav,['custosvenda']); assert.equal(A.el('cv-selCategoria').value,'trafego_pago'); assert.equal(A.el('cv-selStatus').value,'Pago');
  let mudou=0; A.el('v-selOrigem').addEventListener('change',()=>mudou++);
  clique({target:{closest:s=>s==='#db-tpVerSemOrigem'?{}:null}});
  assert.equal(A.nav[1],'vendas'); assert.equal(A.el('v-selOrigem').value,'__vazio__'); assert.equal(mudou,1);
  assert.ok(A.el('v-selOrigem').options.some(x=>x.value==='__vazio__'),'cria a opção (sem origem) se ainda não existe');
  assert.equal(A.el('v-dateFrom').value,'2026-10-01'); assert.equal(A.el('v-dateTo').value,'2026-10-21');

  // Filtro de período mexe na seção
  const mudar=(id,valor)=>{A.el(id).value=valor;(A.el(id).handlers.change||[]).forEach(f=>f());};
  mudar('db-dateFrom','2026-11-01'); mudar('db-dateTo','2026-11-30');
  assert.ok(A.el('db-tpMeses').innerHTML.includes('Nenhum investimento nem venda'));
  assert.equal(A.el('db-tpSemOrigem').innerHTML,'');

  // Navegador sem IntersectionObserver: lê na hora (não fica preso em "Carregando").
  const S=montar({admin:true,comObserver:false});
  S.context.window.dashboardApp.init(); await espera();
  assert.ok(S.assinadas.includes('clientes')); assert.ok(S.el('db-tpKpis').innerHTML.includes('R$ 1.200,00'));

  // ── Quem não é administrador: nada de tráfego e nenhuma leitura de clientes
  const U=montar({admin:false,comObserver:true});
  U.context.window.dashboardApp.init(); await espera();
  assert.equal(U.observados.length,0); assert.ok(!U.assinadas.includes('clientes'));
  assert.equal(U.el('db-tpKpis').innerHTML,'');

  console.log('dashboard-trafego: todos os testes passaram');
})().catch(e=>{console.error(e);process.exit(1);});
