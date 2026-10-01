const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const elementos={};
function elemento(id){
  if(elementos[id])return elementos[id];
  const e={value:'',textContent:'',style:{},options:[],attributes:{},listeners:{},classList:{remove(){},toggle(){}},
    addEventListener(k,fn){this.listeners[k]=fn;},contains(){return true;},appendChild(node){this.options.push(node);},
    setAttribute(k,v){this.attributes[k]=v;},append(...nodes){this.textContent+=nodes.map(n=>n.textContent).join('');}};
  Object.defineProperty(e,'innerHTML',{get(){return this.html||'';},set(s){this.html=s;if(id==='fat-month'){this.options=[...s.matchAll(/value="(\d{4}-\d{2})"/g)].map(m=>({value:m[1]}));this.value=this.options[0]?.value||'';}if(id==='fat-seller'){this.options=[{value:'__all__'}];this.value='__all__';}}});
  if(id==='fat-chart')e.clientWidth=1400;
  elementos[id]=e;return e;
}
const listas={
  vendedores:[{IdVendedor:'a',Nome:'Ana Lima',Tipo:'Vendedor',Status:'Ativo',FotoPerfil:'data:image/jpeg;base64,AAAA'},{IdVendedor:'b',Nome:'Bruno Costa',Tipo:'Vendedor',Status:'Ativo'},{IdVendedor:'c',Nome:'CEO',Tipo:'CEO',Status:'Ativo'}],
  metas:[{IdMeta:'m',Ano:2026,Mes:10,Valor:3000}],
  metas_individuais:[{IdMetaIndividual:'mi',IdVendedor:'a',Ano:2026,Mes:10,ValorMeta:2000}],
  vendas:[
    {IdVenda:'1',IdCliente:'cliente',IdVendedor:'a',DataVenda:'2026-10-01',Valor:1000,NomeCliente:'Cliente A'},
    {IdVenda:'2',IdCliente:'cliente',IdVendedor:'b',DataVenda:'01/10/2026',Valor:2000,NomeCliente:'Cliente B'},
    {IdVenda:'3',IdCliente:'cliente',IdVendedor:'c',DataVenda:'2026-10-01',Valor:500},
    {IdVenda:'4',IdCliente:'da6dbd89',IdVendedor:'a',DataVenda:'2026-10-01',Valor:800},
    {IdVenda:'5',IdCliente:'cliente',IdVendedor:'a',DataVenda:'2026-09-01',Valor:1000}
  ]
};
const RealDate=Date;
let mockToday='2026-10-01T12:00:00-03:00';
class TestDate extends RealDate{constructor(...args){super(...(args.length?args:[mockToday]));}static now(){return new RealDate(mockToday).getTime();}}
const callbacks={},events={};
const context={
  Date:TestDate,Math,performance:{now:()=>0},cancelAnimationFrame(){},requestAnimationFrame(){},clearTimeout(){},setTimeout:fn=>{fn();return 1;},
  document:{getElementById:elemento,createElement:()=>({textContent:''}),createTextNode:s=>({textContent:s})},
  window:{
    SGAuth:{isAdmin:()=>true},SGFireReady:Promise.resolve(),matchMedia:()=>({matches:true}),
    innerWidth:1536,innerHeight:864,addEventListener:(nome,fn)=>{events[nome]=fn;},
    SGUtil:{
      fmtMoney:n=>'R$ '+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}),
      parseBRNumber:n=>Number(n)||0,
      parseBRDate:s=>{const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return new TestDate(+m[1],+m[2]-1,+m[3]);const b=String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})/);return b?new TestDate(+b[3],+b[2]-1,+b[1]):null;},
      dateKey:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
      fmtDateBR:d=>`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`,
      assinarColecao:(nome,fn)=>{callbacks[nome]=fn;fn(listas[nome]);}
    }
  }
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/faturamento.js'),'utf8'),context);
(async()=>{
  context.window.faturamentoApp.init();
  await Promise.resolve();
  assert.equal(elemento('fat-value').textContent,'R$ 3.000,00');
  assert.equal(elemento('fat-percent').textContent,'85,7%'); // meta efetiva: 2.000 + 1.500
  assert.equal(elemento('fat-sales-count').textContent,'2'); // CEO e aporte excluídos
  assert.equal(elemento('fat-ticket').textContent,'R$ 1.500,00');
  assert.match(elemento('fat-chart-canvas').innerHTML,/fat-line-expected/);
  assert.match(elemento('fat-chart-canvas').innerHTML,/fat-line-actual/);
  assert.match(elemento('fat-chart-canvas').innerHTML,/viewBox="0 0 1400 233"/);
  context.window.innerWidth=390;
  elemento('fat-chart').clientWidth=326;
  events.resize();
  assert.match(elemento('fat-chart-canvas').innerHTML,/viewBox="0 0 650 220"/);
  assert.match(elemento('fat-compare').textContent,/\+200,0%/);
  callbacks.vendas([...listas.vendas,{IdVenda:'6',IdCliente:'cliente',IdVendedor:'a',DataVenda:'2026-10-01',Valor:500}]);
  assert.equal(elemento('fat-value').textContent,'R$ 3.500,00');
  assert.equal(elemento('fat-percent').textContent,'100,0%');
  assert.equal(elemento('fat-progress-fill').style.width,'100%');
  mockToday='2026-10-04T12:00:00-03:00';
  callbacks.vendas([...listas.vendas,{IdVenda:'6',IdCliente:'cliente',IdVendedor:'a',DataVenda:'2026-10-01',Valor:500},
    {IdVenda:'7',IdCliente:'cliente',IdVendedor:'a',DataVenda:'2026-10-02',Valor:400},
    {IdVenda:'8',IdCliente:'cliente',IdVendedor:'b',DataVenda:'2026-10-03',Valor:900}]);
  assert.equal(elemento('fat-value').textContent,'R$ 4.800,00');
  elemento('fat-seller').value='a';
  elemento('fat-seller').listeners.change.call(elemento('fat-seller'));
  assert.equal(elemento('fat-value').textContent,'R$ 1.900,00');
  assert.equal(elemento('fat-progress-meta').textContent,'Meta R$ 2.000,00 · Faltam R$ 100,00');
  const alvo=dia=>({getAttribute:()=>String(dia),closest(){return this;}});
  elemento('fat-chart').listeners.click({target:alvo(2),shiftKey:false});
  assert.equal(elemento('fat-value').textContent,'R$ 400,00');
  assert.equal(elemento('fat-title').textContent,'Faturamento no dia');
  assert.equal(elemento('fat-date-from').value,'2026-10-02');
  assert.equal(elemento('fat-date-to').value,'2026-10-02');
  assert.match(elemento('fat-progress-meta').textContent,/Meta proporcional R\$ 90,91/);
  elemento('fat-chart').listeners.click({target:alvo(1),shiftKey:false});
  elemento('fat-chart').listeners.click({target:alvo(3),shiftKey:true});
  assert.equal(elemento('fat-value').textContent,'R$ 1.900,00');
  assert.equal(elemento('fat-title').textContent,'Faturamento no período');
  assert.equal(elemento('fat-date-from').value,'2026-10-01');
  assert.equal(elemento('fat-date-to').value,'2026-10-03');
  elemento('fat-date-from').value='2026-10-02';
  elemento('fat-date-to').value='2026-10-02';
  elemento('fat-date-to').listeners.change();
  assert.equal(elemento('fat-value').textContent,'R$ 400,00');
  elemento('fat-date-from').value='2026-10-03';
  elemento('fat-date-from').listeners.change({target:{id:'fat-date-from'}});
  assert.equal(elemento('fat-date-from').value,'2026-10-03');
  assert.equal(elemento('fat-date-to').value,'2026-10-03');
  elemento('fat-clear-filter').listeners.click();
  assert.equal(elemento('fat-value').textContent,'R$ 1.900,00');
  elemento('fat-seller').value='__all__';
  elemento('fat-seller').listeners.change.call(elemento('fat-seller'));
  assert.equal(elemento('fat-value').textContent,'R$ 4.800,00');
  elemento('fat-tooltip').parentElement={getBoundingClientRect:()=>({left:0,width:1400})};
  const alvoSemVenda=alvo(4);alvoSemVenda.getBoundingClientRect=()=>({left:120,width:30});
  elemento('fat-chart').listeners.mouseover({target:alvoSemVenda});
  assert.equal(elemento('fat-tooltip').hidden,false);
  assert.equal(elemento('fat-tooltip-sales').textContent,'Vendas no dia: R$ 0,00');
  assert.match(elemento('fat-tooltip-delta').textContent,/Superávit:/);
  elemento('fat-tab-ranking').listeners.click();
  assert.equal(elemento('fat-ranking-card').hidden,false);
  assert.match(elemento('fat-ranking-podium').innerHTML,/Bruno Costa/);
  assert.match(elemento('fat-ranking-podium').innerHTML,/R\$ 2\.900,00/);
  assert.match(elemento('fat-ranking-podium').innerHTML,/<img src="data:image\/jpeg;base64,AAAA"/);
  assert.match(elemento('fat-ranking-podium').innerHTML,/data:image\/jpeg;base64,AAAA/);
  elemento('fat-ranking-podium').listeners.click({target:{closest:()=>({getAttribute:()=> 'b'})}});
  assert.equal(elemento('fat-seller').value,'b');
  assert.equal(elemento('fat-value').textContent,'R$ 2.900,00');
  elemento('fat-ranking-evolucao').listeners.click();
  assert.match(elemento('fat-ranking-race').innerHTML,/fat-race-reference/);
  assert.match(elemento('fat-ranking-race').innerHTML,/fat-race-line/);
  assert.match(elemento('fat-ranking-race').innerHTML,/fat-race-avatar/);
  assert.equal(elemento('fat-ranking-race').hidden,false);
  elemento('fat-ranking-card').getBoundingClientRect=()=>({left:0,width:1400});
  const alvoCorrida=alvo(4);alvoCorrida.getBoundingClientRect=()=>({left:120,width:30});
  elemento('fat-ranking-race').listeners.mouseover({target:alvoCorrida});
  assert.match(elemento('fat-ranking-tooltip').innerHTML,/Meta média até o dia: R\$ 159,09/); // (2.000 + 1.500) / 2, proporcional a 2 de 22 dias úteis
  elemento('fat-seller').value='__all__';
  elemento('fat-seller').listeners.change.call(elemento('fat-seller'));
  elemento('fat-ranking-race').listeners.click({target:{closest:()=>({getAttribute:()=> '2'})},shiftKey:false});
  assert.equal(elemento('fat-value').textContent,'R$ 400,00');
  assert.equal(elemento('fat-progress-title').textContent,'Faturado vs. meta proporcional');
  elemento('fat-tab-faturamento').listeners.click();
  assert.equal(elemento('fat-chart-card').hidden,false);
  console.log('Faturamento: cálculo, filtros, meta proporcional, tooltip, gráfico e atualização ao vivo OK');
})().catch(err=>{console.error(err);process.exitCode=1;});
