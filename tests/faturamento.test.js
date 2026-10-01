const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const elementos={};
function elemento(id){
  if(elementos[id])return elementos[id];
  const e={value:'',textContent:'',style:{},options:[],attributes:{},classList:{remove(){},toggle(){}},
    addEventListener(){},setAttribute(k,v){this.attributes[k]=v;},append(...nodes){this.textContent+=nodes.map(n=>n.textContent).join('');}};
  Object.defineProperty(e,'innerHTML',{get(){return this.html||'';},set(s){this.html=s;if(id==='fat-month'){this.options=[...s.matchAll(/value="(\d{4}-\d{2})"/g)].map(m=>({value:m[1]}));this.value=this.options[0]?.value||'';}}});
  elementos[id]=e;return e;
}
const listas={
  vendedores:[{IdVendedor:'a',Tipo:'Vendedor',Status:'Ativo'},{IdVendedor:'b',Tipo:'Vendedor',Status:'Ativo'},{IdVendedor:'c',Tipo:'CEO',Status:'Ativo'}],
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
class TestDate extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-01T12:00:00-03:00']));}static now(){return new RealDate('2026-10-01T12:00:00-03:00').getTime();}}
const callbacks={};
const context={
  Date:TestDate,Math,performance:{now:()=>0},cancelAnimationFrame(){},requestAnimationFrame(){},
  document:{getElementById:elemento,createElement:()=>({textContent:''}),createTextNode:s=>({textContent:s})},
  window:{
    SGAuth:{isAdmin:()=>true},SGFireReady:Promise.resolve(),matchMedia:()=>({matches:true}),
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
  assert.match(elemento('fat-chart').innerHTML,/fat-line-expected/);
  assert.match(elemento('fat-chart').innerHTML,/fat-line-actual/);
  assert.match(elemento('fat-compare').textContent,/\+200,0%/);
  callbacks.vendas([...listas.vendas,{IdVenda:'6',IdCliente:'cliente',IdVendedor:'a',DataVenda:'2026-10-01',Valor:500}]);
  assert.equal(elemento('fat-value').textContent,'R$ 3.500,00');
  assert.equal(elemento('fat-percent').textContent,'100,0%');
  assert.equal(elemento('fat-progress-fill').style.width,'100%');
  console.log('Faturamento: cálculo, exclusões, meta efetiva, gráfico e atualização ao vivo OK');
})().catch(err=>{console.error(err);process.exitCode=1;});
