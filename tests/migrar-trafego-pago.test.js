// _tools/migrar-trafego-pago.js: o plano só move de marketing para trafego_pago o que é anúncio ou compra de lead.
const assert=require('node:assert/strict');
const M=require('../_tools/migrar-trafego-pago.js');

const doc=(id,Categoria,Descricao,extra)=>({id,data:Object.assign({Categoria,Descricao,Valor:100,Data:'01/10/2026',Status:'Pago'},extra)});
const p=M.planejar([
  doc('a','marketing','Investimento em Anuncios',{CategoriaOrigem:'backfill'}),
  doc('b','marketing','Anuncio Facebook',{CategoriaOrigem:'manual'}),
  doc('c','marketing','Investimento em leads'),
  doc('d','marketing','Crédito para prospecção Felipe Morais'),   // prospecção fica em marketing
  doc('h','marketing','Investimento em Leads (prospecção)'),       // idem, mesmo dizendo leads (Felipe, 2026-10-21)
  doc('e','trafego_pago','Meta Ads outubro'),                     // já migrado: não entra de novo
  doc('f','folha','Salário Leonardo'),                            // outra categoria: nunca mexe
  doc('g','','Anuncio Google Ads'),                               // sem categoria: é trabalho do backfill, não deste script
]);
assert.equal(p.jaEmTrafego,1);
assert.deepEqual(p.itens.map(i=>[i.id,i.acao]),[['a','mover'],['b','mover'],['c','mover'],['d','fica em marketing'],['h','fica em marketing']]);
assert.equal(p.itens[1].origemAntes,'manual','o CSV mostra quem tinha escolhido marketing à mão');
assert.ok(M.csv(p.itens).split('\n')[0].startsWith('id;descricao'));

const o=M.contarOrigens(['Tráfego pago','Tráfego pago','- tráfego','Site','',null,'indicação Bene',' Tráfego pago ']);
assert.deepEqual(o[0],{origem:'Tráfego pago',n:3,le:'tráfego'},'espaço nas pontas conta como a mesma origem');
assert.deepEqual(o.find(x=>x.origem==='').le,'sem origem'); assert.equal(o.find(x=>x.origem==='').n,2);
assert.equal(o.find(x=>x.origem==='Site').le,'site'); assert.equal(o.find(x=>x.origem==='indicação Bene').le,'');
assert.equal(o.find(x=>x.origem==='- tráfego').le,'tráfego');

console.log('migrar-trafego-pago: todos os testes passaram');
