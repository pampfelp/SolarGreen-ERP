// Tipo da perda do funil. Os casos são motivos reais gravados em funil.MotivoPerda (lidos em 2026-11-03).
const assert=require('node:assert/strict');
const path=require('node:path');
const P=require(path.join(__dirname,'../js/perda-categorias.js'));

const tipo=m=>P.sugerir(m).tipo;
const casos=[
  ['Sem interesse','sem_interesse'],
  ['Disparo: não tem interesse agora','sem_interesse'],
  ['cliente não está interessado','sem_interesse'],
  ['pediu para não mandar mensagem','sem_interesse'],
  ['Número errado','contato_invalido'],
  ['númeor errado','contato_invalido'],
  ['não tem what','contato_invalido'],
  ['Contato errado','contato_invalido'],
  ['Bloqueio','bloqueou'],
  ['cliente bloqueou','bloqueou'],
  ['Sem resposta','sem_resposta'],
  ['8 tentativa de contato','sem_resposta'],
  ['Tentatias de contato perdidas','sem_resposta'],
  ['ele vive viajando e n responde nenhuma mensagem','sem_resposta'],
  ['ultimato','sem_resposta'],
  ['Contratou outra empresa','concorrente'],
  ['ja tem um empresa prestadora de serviços','concorrente'],
  ['já fechou com outra empresa','concorrente'],
  ['achou caro e fez com outra empresa','concorrente'],
  ['cliente pegou o orçamento e bloqueou','preco'],
  ['sem dinheiro','preco'],
  ['estava sem limite no cartão','preco'],
  ['não aceitou pagar a taxa de deslocamento','preco'],
  ['Não quis fazer por conta do valor','preco'],
  ['cliente nao está pagando o financimento','preco'],
  ['o esposo ia resolver com outra empresa','concorrente'], // a outra empresa pesa mais que o esposo
  ['vou ver com meu marido','decisor'],
  ['mnadaram eu desistir','decisor'],
  ['vou ver e te retorno','adiou'],
  ['vou deixar pra ver isso depois','adiou'],
  ['desconfiança LGPD','desconfianca'],
  ['lead desqualificado','fora_perfil'],
  ['outro municipio','fora_perfil'],
  ['vai vender a casa dela junto com as placas','fora_perfil']
];
for(const [m,esperado] of casos)assert.equal(tipo(m),esperado,'"'+m+'" deveria ser '+esperado+', veio '+tipo(m));

// Sem regra: tipo vazio, para o funil perguntar ao Jev
assert.equal(tipo('FALECIMENTO'),'');
assert.equal(tipo(''),'');
assert.equal(P.sugerir('Sem interesse').origem,'palavra');

// tipoDoLead: o gravado vence; sem gravado, a regra; sem regra, outros; sem motivo, vazio
assert.equal(P.tipoDoLead('decisor','sem interesse'),'decisor');
assert.equal(P.tipoDoLead('id_invalido','sem interesse'),'sem_interesse');
assert.equal(P.tipoDoLead('','FALECIMENTO'),'outros');
assert.equal(P.tipoDoLead('',''),'');
assert.equal(P.rotuloDe(''),'Sem motivo preenchido');
assert.equal(P.rotuloDe('preco'),'Preço ou sem dinheiro');

// Pedido do Jev: o proxy do Apps Script só aceita uma pergunta 'categoria' do tipo choice e descrição até 300
const ped=P.montarPedidoJev('FALECIMENTO');
assert.deepEqual(Object.keys(ped.questions),['categoria']);
assert.equal(ped.questions.categoria.type,'choice');
assert.deepEqual(Object.keys(ped.questions.categoria.criteria),P.TIPOS.map(t=>t.id));
assert.equal(P.montarPedidoJev('x'.repeat(500)).state.descricao.length,300);
assert.equal(P.montarPedidoJev('ok'),null);

// Resposta do Jev: abaixo do limiar ou inválida vira outros
const resp=(choice,p)=>({answers:{categoria:{type:'choice',choice,probabilities:{[choice]:p}}}});
assert.deepEqual(P.lerRespostaJev(resp('preco',0.92)),{tipo:'preco',confianca:0.92});
assert.equal(P.lerRespostaJev(resp('preco',0.5)).tipo,'outros');
assert.equal(P.lerRespostaJev(resp('inventado',0.99)).tipo,'outros');
assert.equal(P.lerRespostaJev(null).tipo,'outros');

console.log('perda-categorias: todos os testes passaram');
