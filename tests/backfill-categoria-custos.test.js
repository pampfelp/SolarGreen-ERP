const assert=require('node:assert/strict');
const { planejar, csv } = require('../_tools/backfill-categoria-custos.js');

const vendas=[{id:'v1',data:{IdCliente:'c1'}},{id:'v-esc',data:{IdCliente:'da6dbd89'}}];
const c=(id,IdVenda,Descricao,extra)=>({id,data:Object.assign({IdVenda,Descricao,Valor:'100,00',Data:'01/08/2026',Status:'Pago'},extra||{})});
const plano=planejar([
  c('a','v-esc','Salário Débora'),
  c('b','v1','Referente aos custos de operação do serviço de Vistoria no cliente X em 10/08/2026. Valor: R$150'),
  c('c','v-esc','Emanuelli Mendes do Rosário'),
  c('d','v1','Aluguel Sala'),                      // despesa geral numa venda de cliente: aviso
  c('e','v-esc','Aluguel Sala',{Categoria:'aluguel',CategoriaOrigem:'manual'}), // já categorizado: pula
  c('f','venda-que-sumiu','Uber'),
  c('g','venda-que-sumiu','Material extra'),
],vendas);

const acao=id=>plano.itens.find(i=>i.id===id).acao;
assert.equal(plano.jaComCategoria,1);
assert.equal(plano.itens.length,6);
assert.equal(acao('a'),'gravar');
assert.equal(acao('b'),'gravar');
assert.equal(acao('c'),'revisar');
assert.equal(acao('d'),'revisar (aviso)');   // não grava sozinho
assert.equal(acao('f'),'gravar');            // sem a venda, a palavra basta
assert.equal(acao('g'),'revisar');           // sem a venda e sem palavra: não chuta
assert.equal(plano.itens.find(i=>i.id==='a').categoria,'folha');
assert.equal(plano.itens.find(i=>i.id==='e'),undefined);

// Rodar de novo sobre o resultado já gravado não tem mais nada a gravar (idempotência).
const gravados=new Set(plano.itens.filter(i=>i.acao==='gravar').map(i=>i.id));
const segunda=planejar([
  c('a','v-esc','Salário Débora',{Categoria:'folha',CategoriaOrigem:'backfill'}),
  c('c','v-esc','Emanuelli Mendes do Rosário'),
],vendas);
assert.equal(segunda.itens.filter(i=>i.acao==='gravar').length,0);
assert.ok(gravados.has('a'));

// CSV abre no Excel pt-BR: BOM, ponto e vírgula, vírgula decimal, aspas escapadas.
const out=csv([{id:'x',descricao:'Diz "oi"',valor:'1.234,50',data:'01/08/2026',status:'Pago',tipoVenda:'cliente',categoria:'folha',origem:'palavra',aviso:'',acao:'gravar'}]);
assert.ok(out.startsWith('\ufeff"id";"data"'));
assert.match(out,/"Diz ""oi""";"1234,5"/);

console.log('backfill-categoria-custos: todos os testes passaram');
