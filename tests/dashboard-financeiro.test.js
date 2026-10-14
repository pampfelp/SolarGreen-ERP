// Dashboard: liga os filtros e os dados reais do dashboard.js aos blocos financeiros (DRE, categorias, custo fixo, produção).
// Roda o dashboard.js de verdade num DOM simulado, com dados fictícios.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function montar({admin}){
  const els={};
  const el=id=>els[id]||(els[id]={id,value:'',textContent:'',innerHTML:'',style:{},dataset:{},handlers:{},options:[],
    classList:{add(){},remove(){},toggle(){}},
    addEventListener(t,f){(this.handlers[t]=this.handlers[t]||[]).push(f);},
    dispatchEvent(e){(this.handlers[e.type]||[]).forEach(f=>f(e));return true;},
    querySelectorAll:()=>[],querySelector:()=>null});
  el('db-selVendedor').value='__all__'; el('db-selServico').value='__all__';
  const chamadas=[]; const nav=[];
  const dk=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const br=s=>{const m=String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})/);return m?new Date(+m[3],+m[2]-1,+m[1]):null;};
  const num=v=>{if(typeof v==='number')return v;let s=String(v==null?'':v).replace(/[R$\s]/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');const n=parseFloat(s);return isNaN(n)?0:n;};
  const dados={
    vendedores:[{IdVendedor:'v1',Nome:'Ana'}],
    servicos:[{IdServico:'s1','Nome Servico':'Vistoria'}],
    vendas:[{IdVenda:'V1',IdCliente:'c1',IdServico:'s1',IdVendedor:'v1',DataVenda:'10/10/2026',Valor:1000},
            {IdVenda:'V2',IdCliente:'da6dbd89',IdServico:'',IdVendedor:'v1',DataVenda:'10/10/2026',Valor:0}],
    custos_venda:[
      {IdCusto:'C1',IdVenda:'V1',Status:'Pago',Valor:'100',Data:'10/10/2026',Categoria:'execucao_servico'},
      {IdCusto:'C2',IdVenda:'V2',Status:'Pago',Valor:'200,00',Data:'10/10/2026',Categoria:'folha'},
      {IdCusto:'C3',IdVenda:'V2',Status:'Pago',Valor:'50',Data:'10/10/2026',Categoria:'retirada_socios'},
      {IdCusto:'C4',IdVenda:'V2',Status:'Pago',Valor:'10',Data:'10/10/2026'},                        // sem categoria
      {IdCusto:'C5',IdVenda:'V2',Status:'Aguardando Pagamento',Valor:'999',Data:'10/10/2026',Categoria:'aluguel'} // não pago: fora do caixa
    ],
    agendamentos:[{'Data Inicio':'10/10/2026 09:00','Status Agendamento':'Concluído',TecnicoResponsavel:'v1',IdServico:'s1'},
                  {'Data Inicio':'10/10/2026 10:00','Status Agendamento':'Cancelado',TecnicoResponsavel:'v1',IdServico:'s1'}],
    funil:[{IdOportunidade:'f1',Etapa:'Perdido',MotivoPerda:'número errado',DataCriacao:'10/10/2026',IdVendedor:'v1',IdServico:'s1',IdCliente:'c9'}]
  };
  const context={
    Event:function(t){this.type=t;},
    document:{addEventListener(){},getElementById:el,querySelectorAll:()=>[],querySelector:()=>el('x')},
    localStorage:{getItem:()=>null,setItem(){}},
    window:{
      SG_SESSION:{uid:'u1'},
      SGEpoca:{criar:()=>({marcar(){},atual:()=>1})},
      SGFireReady:Promise.resolve(),
      SGCache:{get:()=>null,set(){}},
      SGAuth:{isAdmin:()=>admin,apiCall:(acao)=>{chamadas.push(acao);
        if(acao==='getCustoRecorrenteData')return Promise.resolve({ok:true,custos:[{Descricao:'Aluguel da sala',Categoria:'Aluguel',Valor:2300,Status:'Ativo'},{Descricao:'Antigo',Categoria:'Aluguel',Valor:500,Status:'Inativo'}]});
        return Promise.resolve({ok:false});}},
      SGControllerSwitchTo:n=>{nav.push(n);},
      SGUtil:{
        escapeHtml:s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
        fmtMoney:n=>'R$ '+Number(n||0).toFixed(2).replace('.',','),
        parseBRDate:br,parseBRNumber:num,dateKey:dk,fmtDateBR:d=>d?dk(d):'—',
        assinarColecao:(nome,cb)=>{cb(dados[nome]||[]);},
        calcularConversasPropostas:()=>({conversas:0,propostas:0}),
        desdeJanelaFunil:()=>'x'
      }
    }
  };
  context.window.SGDre=require('../js/dre-categorias.js');
  context.window.SGDreDash=null; // carregado abaixo, no mesmo contexto
  vm.createContext(context);
  // O módulo do dashboard roda no mesmo contexto (como no navegador) para enxergar window.SGDre.
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/dre-dashboard.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/dashboard.js'),'utf8').replace(/\r\n/g,'\n'),context);
  return {context,el,chamadas,nav,els};
}

(async()=>{
  // ── Administrador: vê tudo, e os números fecham com os KPIs do dashboard
  const A=montar({admin:true});
  A.context.window.dashboardApp.init();
  await new Promise(r=>setTimeout(r,20));
  const dre=A.el('db-dre').innerHTML;
  // receita 1000; custo de serviço 100; folha 200; sem categoria 10; retiradas 50 => antes 690, após 640. O pago de aluguel (999) está "Aguardando" e fica fora.
  for(const t of ['R$ 1000,00','R$ 100,00','R$ 200,00','R$ 10,00','R$ 690,00','R$ 640,00'].map(x=>x.replace('R$ 1000,00','R$ 1.000,00')))
    assert.ok(dre.includes(t),'DRE sem '+t);
  assert.ok(!dre.includes('R$ 999,00'),'custo não pago não entra no caixa');
  assert.equal(A.el('db-kpiCustos').textContent,'R$ 360,00');
  assert.equal(A.el('db-kpiLucro').textContent,'R$ 640,00','resultado após retiradas = lucro operacional do dashboard');

  const cats=A.el('db-catBars').innerHTML;
  assert.ok(cats.includes('data-cat="execucao_servico"')&&cats.includes('data-cat="folha"')&&cats.includes('data-cat="__sem__"')&&!cats.includes('data-cat="aluguel"'));
  assert.ok(A.el('db-catChips').innerHTML.includes('A revisar (1)'));

  // Chip de grupo filtra as barras
  const cliqueCategorias=A.el('db-categorias').handlers.click[0];
  cliqueCategorias({target:{closest:s=>s==='.dd-chip'?{getAttribute:()=>'socios'}:null}});
  assert.ok(A.el('db-catBars').innerHTML.includes('data-cat="retirada_socios"')&&!A.el('db-catBars').innerHTML.includes('data-cat="folha"'));
  // Clicar numa categoria abre Custos da Venda já filtrado
  cliqueCategorias({target:{closest:s=>s==='.dd-bar[data-cat]'?{getAttribute:()=>'folha'}:null}});
  assert.deepEqual(A.nav,['custosvenda']); assert.equal(A.el('cv-selCategoria').value,'folha');
  // "A revisar" leva o valor que o filtro de Custos da Venda entende
  cliqueCategorias({target:{closest:s=>s==='.dd-bar[data-cat]'?{getAttribute:()=>'__sem__'}:null}});
  assert.equal(A.el('cv-selCategoria').value,'__sem__');

  // Custo fixo: só ativo
  assert.ok(A.chamadas.includes('getCustoRecorrenteData'));
  assert.ok(A.el('db-fixoTotal').innerHTML.includes('R$ 2.300,00')&&!A.el('db-fixoTotal').innerHTML.includes('R$ 2.800,00'));

  // Produção
  assert.ok(A.el('db-prodTecnicos').innerHTML.includes('Ana')&&A.el('db-prodTecnicos').innerHTML.includes('/ 2'));
  assert.ok(A.el('db-prodServicos').innerHTML.includes('Vistoria')&&A.el('db-prodServicos').innerHTML.includes('data-servico="s1"'));
  assert.ok(A.el('db-prodMotivos').innerHTML.includes('Contato / número errado'));
  // Clique no tipo de serviço filtra o dashboard por ele
  A.el('db-prodServicos').handlers.click[0]({target:{closest:s=>s==='.dd-bar[data-servico]'?{getAttribute:()=>'s1'}:null}});
  assert.equal(A.el('db-selServico').value,'s1');

  // ── Quem não é administrador não recebe DRE, categorias nem custo fixo; produção continua
  const U=montar({admin:false});
  U.context.window.dashboardApp.init();
  await new Promise(r=>setTimeout(r,20));
  assert.equal(U.el('db-dre').innerHTML,'');
  assert.equal(U.el('db-catBars').innerHTML,'');
  assert.ok(!U.chamadas.includes('getCustoRecorrenteData'),'não lê custo recorrente');
  assert.ok(U.el('db-prodTecnicos').innerHTML.includes('Ana'));

  console.log('dashboard-financeiro: todos os testes passaram');
})().catch(e=>{console.error(e);process.exit(1);});
