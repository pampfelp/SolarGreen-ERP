// Regressão de 2026-10-07: o vendedor logado via a meta da empresa inteira como
// se fosse a dele, porque o rateio contava só os vendedores que sobram depois
// do filtro por dono (ele mesmo). Números reais de outubro/2026.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function rodar(sessao,papelAdmin){
  const elements={};
  function el(id){
    return elements[id]||(elements[id]={value:'',textContent:'',innerHTML:'',style:{},disabled:false,
      classList:{add(){},remove(){},toggle(){}},addEventListener(){},appendChild(){},querySelector(){return el('_'+id);},querySelectorAll(){return [];}});
  }
  for(const id of ['selVendedor','selServico','v-selOrigem'])el(id).value='__all__';
  const context={
    localStorage:{getItem:()=>null},
    document:{getElementById:el,createElement:()=>el('_novo'),addEventListener(){},querySelectorAll:()=>[]},
    window:{
      SG_SESSION:sessao,
      SGEpoca:{criar:()=>({marcar(){}})},
      SGFireReady:{then(){}}, // a escuta real não roda no teste; os dados entram por aplicar()
      SGAuth:{
        isAdmin:()=>papelAdmin,
        filterByOwner:(lista,campo)=>papelAdmin?lista:lista.filter(o=>String(o[campo])===sessao.idVendedor)
      },
      SGUtil:{calcularConversasPropostas:()=>({conversas:0,propostas:0})}
    }
  };
  context.window.SGUtil.parseBRNumber=v=>Number(v)||0;
  context.window.SGUtil.parseBRDate=s=>{const p=String(s).split('-');return new Date(+p[0],+p[1]-1,+p[2]);};
  context.window.SGUtil.dateKey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  context.window.SGUtil.fmtMoney=n=>'R$ '+n.toFixed(2);
  context.window.SGUtil.escapeHtml=s=>String(s);
  const source=fs.readFileSync(path.join(__dirname,'../js/vendas.js'),'utf8');
  const marker='  updateSortHeaders();\n\n})();';
  assert.ok(source.includes(marker));
  vm.runInNewContext(source.replace(marker,`  window.vendasMetaTeste={aplicar:aplicarDadosVendas,render:render};\n${marker}`),context);
  context.window.vendasMetaTeste.aplicar({
    vendedores:[
      {IdVendedor:'2554f20b',Nome:'Leonardo Lins',Tipo:'Vendedor',Status:'Ativo'},
      {IdVendedor:'cdfdfb00',Nome:'Marcilene Rodrigues',Tipo:'Vendedor',Status:'Ativo'},
      {IdVendedor:'0ff2dcb8',Nome:'Renatiane Siqueira',Tipo:'Vendedor',Status:'Inativo'}
    ],
    vendas:[],funil:[],clientes:[],servicos:[],custosVenda:[],
    metas:[{IdMeta:'8e5cac00',Ano:2026,Mes:10,Valor:35000}],
    metasIndividuais:[{IdMetaIndividual:'cdfdfb00_2026_10',IdVendedor:'cdfdfb00',Ano:2026,Mes:10,ValorMeta:19000}]
  });
  // setDefaultDateRange usa o mês corrente; fixa outubro pra o teste não
  // depender do dia em que roda.
  el('v-dateFrom').value='2026-10-01';el('v-dateTo').value='2026-10-31';
  context.window.vendasMetaTeste.render();
  return {el,context};
}

// Visão do Leonardo: sem meta manual em outubro, fica com a fatia padrão.
{
  const {el}=rodar({idVendedor:'2554f20b',tipo:'Vendedor'},false);
  assert.equal(el('metaIndividual').textContent,'R$ 17500.00','meta individual do Leonardo é 35.000 ÷ 2 ativos');
  assert.equal(el('metaEmpresa').textContent,'R$ 36500.00','meta da empresa soma 19.000 da Marcilene e 17.500 do Leonardo');
  assert.match(el('metaEmpresaSub').textContent,/de 2 vendedor/);
  assert.match(el('metaHint').textContent,/cota individual de Leonardo Lins/);
  assert.match(el('progressFaltante').textContent,/^R\$ 17500\.00/);
  assert.match(el('tbodyVendedores').innerHTML,/Leonardo Lins/);
  assert.doesNotMatch(el('tbodyVendedores').innerHTML,/Marcilene/,'vendedor continua vendo só a própria linha');
  assert.match(el('tbodyVendedores').innerHTML,/R\$ 17500\.00/);
  assert.match(el('fcTotalVendedorSub').textContent,/÷ 1 vendedor/,'a projeção dele não se divide pela equipe');
}

// Visão do admin com "todos": continua a soma das metas efetivas da equipe.
{
  const {el}=rodar({idVendedor:'admin1',tipo:'Administrador'},true);
  assert.equal(el('metaEmpresa').textContent,'R$ 36500.00');
  assert.equal(el('metaIndividual').textContent,'R$ 18250.00','média da equipe no card individual, como antes');
  assert.match(el('progressFaltante').textContent,/^R\$ 36500\.00/);
  assert.match(el('tbodyVendedores').innerHTML,/Marcilene Rodrigues/);
  assert.match(el('tbodyVendedores').innerHTML,/R\$ 19000\.00/);
  assert.match(el('tbodyVendedores').innerHTML,/R\$ 17500\.00/);
  assert.match(el('fcTotalVendedorSub').textContent,/÷ 2 vendedor/);
}

console.log('vendas-meta-vendedor: ok');
