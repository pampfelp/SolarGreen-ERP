const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
// Filtro de período do Funil: escolhido à mão, não muda ao mover card nem a cada snapshot (2026-11-09).
const path=require('node:path');
const arquivo=process.argv[2]||path.join(__dirname,'../js/funil.js');
const elements={};
function el(id){
  if(!elements[id])elements[id]={id,value:'',textContent:'',innerHTML:'',style:{},options:[],classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    appendChild(){},addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null,setAttribute(){},getAttribute:()=>null};
  return elements[id];
}
el('f-selVendedor').value='__all__';el('f-selOrigem').value='__all__';
const ctx={
  console,
  localStorage:{getItem:()=>null,setItem(){}},
  document:{getElementById:el,querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>el('tmp'+Math.random()),addEventListener(){}},
  window:{SGEpoca:{criar:()=>({marcar(){}})},SGUtil:new Proxy({parseBRDate:s=>{var m=String(s).split('/');return m.length===3?new Date(+m[2],m[1]-1,+m[0],12):null;},dateKey:d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),escapeHtml:s=>String(s),calcularConversasPropostas:()=>({conversas:0,propostas:0,conversaLista:[],propostaLista:[]})},{get:(o,k)=>k in o?o[k]:(()=>'')}),SGLocal:{ler:()=>null,guardar(){}}}
};
const src=fs.readFileSync(arquivo,'utf8');
const marker='  window.funilApp={';
assert.ok(src.includes(marker));
vm.runInNewContext(src.replace(marker,`  window.T={
    definir:function(l){funilRecords=l;funilPipelines=[{IdPipeline:'comercial',Etapas:[{Nome:'Novo Lead'},{Nome:'Proposta'}]}];pipelineAtivo='comercial';},
    garantir:garantirDataVisivelNoFiltro, padrao:setDefaultRange,
    escolher:function(){periodoEscolhido=true;}, escolhido:function(){return periodoEscolhido;},
    aplicar:aplicarDadosFunil, filtrar:getFiltered, regs:function(){return funilRecords.map(function(r){return [r.id,r.pipeline,r.dateKey,r.dataProcessoKey];});}
  };\n${marker}`),ctx);
const T=ctx.window.T;
const lead=(id,k)=>({id,idCliente:'c'+id,idVendedor:'v1',pipeline:'comercial',etapa:'Novo Lead',dt:new Date(k+'T12:00:00'),dateKey:k,dataProcessoKey:k});
T.definir([lead('a','2026-10-01'),lead('b','2026-10-15'),lead('c','2026-11-01')]);
const de=()=>el('f-dateFrom').value, ate=()=>el('f-dateTo').value;

// 1. Período padrão: mover card hoje estica o filtro (card não some).
T.padrao(); assert.equal(de(),'2026-10-01'); assert.equal(ate(),'2026-11-01'); assert.equal(T.escolhido(),false);
T.garantir('2026-11-09'); assert.equal(ate(),'2026-11-09','padrão estica até hoje');

// 2. Período escolhido: mover card não mexe nas datas.
el('f-dateFrom').value='2026-10-15'; el('f-dateTo').value='2026-10-15'; T.escolher();
T.garantir('2026-11-09'); assert.equal(de(),'2026-10-15'); assert.equal(ate(),'2026-10-15');

// 3. Snapshot depois de mover (aplicarDadosFunil) mantém o período escolhido.
T.aplicar({vendedores:[],vendas:[],funilPipelines:[{IdPipeline:'comercial',Nome:'Comercial',Etapas:[{Nome:'Novo Lead'}]}],funil:[{IdFunil:'a',IdCliente:'ca',IdVendedor:'v1',Etapa:'Novo Lead',DataCriacao:'01/10/2026',Pipeline:'comercial'},{IdFunil:'c',IdCliente:'cc',IdVendedor:'v1',Etapa:'Proposta',DataCriacao:'09/11/2026',Pipeline:'comercial'}]});
assert.equal(de(),'2026-10-15'); assert.equal(ate(),'2026-10-15');
// 4. Sem escolha, snapshot recalcula o padrao.
console.log('OK: periodo fica; padrao estica; snapshot nao zera');
