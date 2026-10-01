const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const elements={};
function el(id){
  return elements[id]||(elements[id]={value:'',textContent:'',innerHTML:'',style:{},onclick:null,classList:{remove(){}}});
}
el('f-selVendedor').value='__all__';
el('f-selOrigem').value='Tráfego pago';
const origemSelect=el('f-selOrigem');
origemSelect.options=[];
origemSelect.appendChild=function(option){this.options.push(option);};
Object.defineProperty(origemSelect,'innerHTML',{get(){return this.html||'';},set(html){this.html=html;this.options=[{value:'__all__'}];}});
let leiturasClientes=0;
const context={
  localStorage:{getItem:()=>null},
  document:{getElementById:id=>['fd-clienteDropdown','fd-cliente','clienteRapidoDetalhe'].includes(id)?null:el(id),querySelector:()=>null,createElement:()=>({value:'',textContent:''})},
  window:{
    SGEpoca:{criar:()=>({})},
    SGUtil:{calcularConversasPropostas:()=>({conversas:0,propostas:0,conversaLista:[],propostaLista:[]}),escapeHtml:s=>String(s),assinarColecao:(nome,callback)=>{assert.equal(nome,'clientes');leiturasClientes++;callback([]);}}
  }
};
const source=fs.readFileSync(path.join(__dirname,'../js/funil.js'),'utf8');
const marker='  window.funilApp={init:init,atualizarClienteCache:atualizarClienteCache};';
assert.ok(source.includes(marker));
vm.runInNewContext(source.replace(marker,`  window.funilTeste={
    definir:function(leads,clientes,vendas){
      funilRecords=leads;clientesMap=clientes;vendasRecords=vendas;
      funilPipelines=[{IdPipeline:'comercial',Etapas:[{Nome:'Novo Lead',Papel:''},{Nome:'Ganho',Papel:'ganho'}]}];
      pipelineAtivo='comercial';
    },
    filtrar:getFiltered,
    conversao:renderKpisConversaoFunil,
    relatorio:abrirRelatorioFunil,
    carregarOrigens:garantirClientesCarregados
  };\n${marker}`),context);

const dia=new Date(2026,9,1);
const lead=(id,cliente)=>({id,idCliente:cliente,idVendedor:'v1',pipeline:'comercial',etapa:'Novo Lead',dt:dia,dateKey:'2026-10-01',dataProcessoKey:'2026-10-01',valor:100});
context.window.funilTeste.definir(
  [lead('a','pago'),lead('b','indicacao'),lead('c','sem-origem')],
  {pago:{Origem:'Tráfego pago'},indicacao:{Origem:'Indicação'},'sem-origem':{Origem:''}},
  [{idCliente:'pago',idVendedor:'v1',dateKey:'2026-10-01'},{idCliente:'indicacao',idVendedor:'v1',dateKey:'2026-10-01'}]
);
context.window.funilTeste.carregarOrigens();
context.window.funilTeste.carregarOrigens();
assert.equal(leiturasClientes,1);
assert.ok(origemSelect.options.some(o=>o.value==='Indicação'));
assert.ok(origemSelect.options.some(o=>o.value==='__vazio__'));
assert.equal(origemSelect.value,'Tráfego pago');
assert.equal(context.window.funilTeste.filtrar().allPeriod.length,1);
context.window.funilTeste.conversao();
assert.equal(el('f-convContatos').textContent,1);
assert.equal(el('f-convVendas').textContent,1);
context.window.funilTeste.relatorio();
assert.match(el('f-relatorioFiltroInfo').textContent,/Origem: Tráfego pago/);
assert.match(el('f-relatorioTbody').innerHTML,/Novo Lead<\/td><td[^>]*>1<\/td>/);
el('f-selOrigem').value='__vazio__';
assert.equal(context.window.funilTeste.filtrar().allPeriod.length,1);
el('f-selOrigem').value='__all__';
assert.equal(context.window.funilTeste.filtrar().allPeriod.length,3);
context.window.funilTeste.conversao();
assert.equal(el('f-convContatos').textContent,3);
assert.equal(el('f-convVendas').textContent,2);
context.window.funilTeste.relatorio();
assert.match(el('f-relatorioTbody').innerHTML,/Novo Lead<\/td><td[^>]*>3<\/td>/);
console.log('Funil: filtro de origem em leads e conversão OK');
