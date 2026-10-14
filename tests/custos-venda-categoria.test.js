// Fluxo de categoria na tela Custos da Venda: sugestão, obrigatoriedade e o que vai para o banco.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const DRE=require('../js/dre-categorias.js');

const els={};
function el(id){
  return els[id]||(els[id]={value:'',textContent:'',innerHTML:'',style:{},onchange:null,oninput:null,
    classList:{add(){},remove(){},toggle(){}},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}});
}
el('cv-selStatus').value='__all__';el('cv-selCategoria').value='__all__';
const chamadas=[];
let comboCfg=null;
const dk=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const context={
  setTimeout,clearTimeout,
  document:{addEventListener(){},getElementById:el,querySelectorAll:()=>[],createElement:()=>({set textContent(v){this.t=v},get innerHTML(){return String(this.t)}})},
  window:{
    SGDre:DRE,
    SGEpoca:{criar:()=>({marcar(){},atual:()=>1})},
    SGId:{gerar:()=>'novo-id'},
    SGToast:{mostrar(){}},
    SGViewPanel:{abrir(){},fechar(){}},
    SGCombo:{criar(cfg){comboCfg=cfg;}},
    SGAuth:{apiCall:(acao,payload)=>{chamadas.push({acao,payload});return Promise.resolve({ok:true,idCusto:payload.idCusto});}},
    SGUtil:{
      meuId:()=>'u1',escapeHtml:s=>String(s==null?'':s),fmtMoney:n=>'R$ '+n,
      dateKey:dk,fmtDateBR:d=>d?dk(d):'—',
      parseBRDate:s=>{const m=String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})/);return m?new Date(+m[3],+m[2]-1,+m[1]):null;}
    }
  }
};
let fonte=fs.readFileSync(path.join(__dirname,'../js/custos-venda.js'),'utf8').replace(/\r\n/g,'\n');
const marca='  window.custosVendaApp={init:init,atualizarClienteCache:atualizarClienteCache};';
assert.ok(fonte.includes(marca));
vm.runInNewContext(fonte.replace(marca,`  window.cvTeste={
    definir:function(c,v){custos=c;vendas=v;},
    abrirModal:abrirModal,salvar:salvar,
    custos:function(){return custos;},
    passa:passaCategoriaCv
  };`),context);
const T=context.window.cvTeste;

const vendas=[{IdVenda:'v-cli',IdCliente:'c1',IdServico:'s1',DataVenda:'10/10/2026',Valor:500},
              {IdVenda:'v-esc',IdCliente:'da6dbd89',IdServico:'',DataVenda:'10/10/2026',Valor:0}];
const base=()=>{ chamadas.length=0; el('cv-modalMsg').textContent=''; el('cv-categoria').value=''; };
const escolherVenda=id=>{ el('cv-idVenda').value=id; comboCfg.onSelecionar(id); };
const preencher=(valor,data)=>{ el('cv-valor').value=valor; el('cv-data').value=data||'2026-10-13'; el('cv-status').value='Pago'; };

// 1) Venda de cliente: descrição automática -> execução do serviço, aceita a sugestão -> origem 'regra'.
T.definir([],vendas); base();
T.abrirModal(null);
escolherVenda('v-cli'); preencher('150');
assert.equal(el('cv-categoria').value,'execucao_servico');
assert.match(el('cv-categoriaDica').textContent,/Sugerida/);
T.salvar();
assert.equal(chamadas.length,1);
assert.equal(chamadas[0].payload.categoria,'execucao_servico');
assert.equal(chamadas[0].payload.categoriaOrigem,'regra');

// 2) Escritório + descrição digitada: sugere pela palavra; trocar na mão vira 'manual'.
T.definir([],vendas); base();
T.abrirModal(null);
escolherVenda('v-esc'); preencher('120');
el('cv-descricao').value='Conta de internet'; el('cv-descricao').oninput();
assert.equal(el('cv-categoria').value,'utilidades');
el('cv-categoria').value='aluguel'; el('cv-categoria').onchange();
el('cv-descricao').value='Conta de internet dezembro'; el('cv-descricao').oninput(); // não pode sobrescrever a escolha
assert.equal(el('cv-categoria').value,'aluguel');
T.salvar();
assert.equal(chamadas[0].payload.categoria,'aluguel');
assert.equal(chamadas[0].payload.categoriaOrigem,'manual');

// 3) Sem categoria não salva e não chama o banco.
T.definir([],vendas); base();
T.abrirModal(null);
escolherVenda('v-esc'); preencher('10');
el('cv-descricao').value='Emanuelli Mendes do Rosário'; el('cv-descricao').oninput();
assert.equal(el('cv-categoria').value,'');
T.salvar();
assert.equal(chamadas.length,0);
assert.equal(el('cv-modalMsg').textContent,'Escolha a categoria do custo.');

// 4) Editar custo já categorizado pelo backfill, sem mexer na categoria: mantém a origem.
const existente={IdCusto:'c-1',IdVenda:'v-esc',Descricao:'Salário Débora',Valor:886.16,Status:'Pago',Data:'05/07/2026',Categoria:'folha',CategoriaOrigem:'backfill'};
T.definir([existente],vendas); base();
T.abrirModal('c-1');
assert.equal(el('cv-categoria').value,'folha');
T.salvar();
assert.equal(chamadas[0].payload.categoria,'folha');
assert.equal(chamadas[0].payload.categoriaOrigem,'backfill');

// 5) Custo antigo sem categoria abre com a sugestão pela descrição.
const antigo={IdCusto:'c-2',IdVenda:'v-esc',Descricao:'Aluguel Sala',Valor:5067.65,Status:'Pago',Data:'05/08/2026'};
T.definir([antigo],vendas); base();
T.abrirModal('c-2');
assert.equal(el('cv-categoria').value,'aluguel');

// 6) Filtro "a revisar" separa quem não tem categoria.
el('cv-selCategoria').value='__sem__';
assert.equal(T.passa({Categoria:''}),true);
assert.equal(T.passa({Categoria:'folha'}),false);
el('cv-selCategoria').value='folha';
assert.equal(T.passa({Categoria:'folha'}),true);
assert.equal(T.passa({Categoria:'aluguel'}),false);

console.log('custos-venda-categoria: todos os testes passaram');
