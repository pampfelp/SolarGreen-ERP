const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const elements={};
function el(id){
  return elements[id]||(elements[id]={value:'',textContent:'',innerHTML:'',style:{},classList:{add(){},remove(){}},addEventListener(){},querySelectorAll(){return [];}});
}
for(const id of ['selVendedor','selServico','v-selOrigem'])el(id).value='__all__';
el('v-dateFrom').value='2026-10-01';
el('v-dateTo').value='2026-10-31';
const origemSelect=el('v-selOrigem');
origemSelect.options=[];
origemSelect.appendChild=function(option){this.options.push(option);};
Object.defineProperty(origemSelect,'innerHTML',{get(){return this.html||'';},set(html){this.html=html;this.options=[{value:'__all__'}];}});
let leiturasClientes=0;
const context={
  localStorage:{getItem:()=>null},
  document:{
    getElementById:el,
    createElement:()=>({value:'',textContent:''}),
    addEventListener(){},
    querySelectorAll:()=>[]
  },
  window:{
    SGEpoca:{criar:()=>({marcar(){}})},
    SGUtil:{assinarColecao:(nome,callback)=>{
      assert.equal(nome,'clientes');
      leiturasClientes++;
      callback([
        {IdCliente:'pago',Origem:'Tráfego pago'},
        {IdCliente:'indicacao',Origem:'Indicação'},
        {IdCliente:'sem-origem',Origem:''}
      ]);
    }}
  }
};
const source=fs.readFileSync(path.join(__dirname,'../js/vendas.js'),'utf8');
const marker='  updateSortHeaders();\n\n})();';
assert.ok(source.includes(marker));
vm.runInNewContext(source.replace(marker,`  window.vendasOrigemTeste={
    definir:function(vendas,funil,custos){
      vendasRecords=vendas;vendasRecordsFaturamento=vendas;
      funilRecords=funil;custosVendaRecords=custos;
    },
    filtrar:getFiltered,
    carregarOrigens:garantirClientesCarregadosVendas
  };
${marker}`),context);

const venda=(id,cliente)=>({idVenda:id,idCliente:cliente,idVendedor:'v1',idServico:'s1',dateKey:'2026-10-10',valor:100});
const lead=(id,cliente)=>({id,idCliente:cliente,idVendedor:'v1',dateKey:'2026-10-10'});
context.window.vendasOrigemTeste.definir(
  [venda('a','pago'),venda('b','indicacao'),venda('c','sem-origem')],
  [lead('la','pago'),lead('lb','indicacao'),lead('lc','sem-origem')],
  [{idVenda:'a',status:'Pago',valor:10},{idVenda:'b',status:'Pago',valor:20}]
);
assert.equal(context.window.vendasOrigemTeste.filtrar().vendas.length,3);
assert.equal(leiturasClientes,0,'o uso normal de Vendas não deve carregar clientes');
context.window.vendasOrigemTeste.carregarOrigens();
context.window.vendasOrigemTeste.carregarOrigens();
assert.equal(leiturasClientes,1);
assert.ok(origemSelect.options.some(o=>o.value==='Indicação'));
assert.ok(origemSelect.options.some(o=>o.value==='__vazio__'));
origemSelect.value='Tráfego pago';
let filtrado=context.window.vendasOrigemTeste.filtrar();
assert.equal(filtrado.vendas.length,1);
assert.equal(filtrado.vendas[0].idCliente,'pago');
assert.equal(filtrado.funilNovosContatos.length,1);
assert.equal(filtrado.custos.length,1);
el('v-dateFrom').value='2026-10-11';
assert.equal(context.window.vendasOrigemTeste.filtrar().vendas.length,0);
el('v-dateFrom').value='2026-10-01';
origemSelect.value='__vazio__';
filtrado=context.window.vendasOrigemTeste.filtrar();
assert.equal(filtrado.vendas.length,1);
assert.equal(filtrado.vendas[0].idCliente,'sem-origem');
origemSelect.value='__all__';
filtrado=context.window.vendasOrigemTeste.filtrar();
assert.equal(filtrado.vendas.length,3);
assert.equal(filtrado.funilNovosContatos.length,3);
console.log('Vendas: filtro de origem em vendas, leads e custos OK');
