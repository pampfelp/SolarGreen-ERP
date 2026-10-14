// Jev: montagem do pedido, leitura da resposta e o passo do backfill (fetch simulado, sem rede nem chave).
const assert=require('node:assert/strict');
const DRE=require('../js/dre-categorias.js');
const { elegiveisParaJev, consultarJev, aplicarJev, csv } = require('../_tools/backfill-categoria-custos.js');

// Pedido: 15 categorias + "nenhuma", uma pergunta só, descrição cortada em 300.
const p=DRE.montarPedidoJev('Pix para a Maria do almoço de domingo',{ehEscritorio:true});
assert.deepEqual(Object.keys(p.questions),['categoria']);
assert.equal(p.questions.categoria.type,'choice');
assert.equal(Object.keys(p.questions.categoria.criteria).length,DRE.CATEGORIAS.length+1);
assert.ok('nenhuma' in p.questions.categoria.criteria);
assert.equal(p.state.venda,'despesa do escritório');
assert.equal(DRE.montarPedidoJev('x'.repeat(500)).state.descricao.length,300);

// Sem pedido: curta demais e descrição gerada pelo próprio sistema.
assert.equal(DRE.montarPedidoJev('ab'),null);
assert.equal(DRE.montarPedidoJev('Referente a custo de escritorio em 10/10'),null);
assert.equal(DRE.montarPedidoJev('Referente aos custos de operacao do servico de Vistoria'),null);

// Resposta: só vale categoria válida com probabilidade >= limiar.
const resp=(choice,prob)=>({answers:{categoria:{type:'choice',choice,confidence:0.5,probabilities:{[choice]:prob}}}});
assert.deepEqual(DRE.lerRespostaJev(resp('folha',0.93)),{categoria:'folha',confianca:0.93});
assert.equal(DRE.lerRespostaJev(resp('folha',0.5)).categoria,'');      // abaixo do limiar
assert.equal(DRE.lerRespostaJev(resp('nenhuma',0.99)).categoria,'');   // "nenhuma" vira a revisar
assert.equal(DRE.lerRespostaJev(resp('inventada',0.99)).categoria,''); // fora do vocabulário
assert.equal(DRE.lerRespostaJev(null).categoria,'');
assert.equal(DRE.lerRespostaJev({answers:{}}).categoria,'');

// Elegíveis: só 'revisar' sem categoria e sem aviso.
const itens=[
  {id:'1',acao:'revisar',categoria:'',aviso:'',descricao:'Pix Maria Souza',tipoVenda:'escritório'},
  {id:'2',acao:'revisar (aviso)',categoria:'',aviso:'confira',descricao:'Aluguel',tipoVenda:'cliente'},
  {id:'3',acao:'gravar',categoria:'folha',aviso:'',descricao:'Salário',tipoVenda:'escritório'},
];
assert.deepEqual(elegiveisParaJev({itens}).map(i=>i.id),['1']);

(async()=>{
  // consultarJev: URL, cabeçalho, corpo com modelo fixo e recuo em 429.
  const chamadas=[];
  const respostas=[{status:429,ok:false},{status:200,ok:true,json:async()=>resp('utilidades',0.91)}];
  const fetchFalso=async(url,init)=>{chamadas.push({url,init});return respostas.shift();};
  const lido=await consultarJev(itens[0],'CHAVE-DE-TESTE',fetchFalso);
  assert.equal(chamadas.length,2);
  assert.equal(chamadas[0].url,'https://api.typesafe.ai/v1/systemone');
  assert.equal(chamadas[0].init.headers.Authorization,'Bearer CHAVE-DE-TESTE');
  const corpo=JSON.parse(chamadas[0].init.body);
  assert.equal(corpo.model,'jev-latest');
  assert.equal(corpo.state.descricao,'Pix Maria Souza');
  assert.deepEqual(lido,{categoria:'utilidades',confianca:0.91});

  // Erro que não é 429/529 propaga.
  await assert.rejects(()=>consultarJev(itens[0],'k',async()=>({status:401,ok:false})),/401/);
  // Descrição sem pedido não chama a API.
  assert.equal(await consultarJev({descricao:'ab',tipoVenda:'cliente'},'k',async()=>{throw new Error('não devia chamar');}),null);

  // aplicarJev: vira 'sugerida (jev)', nunca 'gravar'; sem categoria só guarda a confiança.
  const a={id:'1',acao:'revisar',categoria:'',origem:'',aviso:''};
  aplicarJev(a,{categoria:'utilidades',confianca:0.91});
  assert.equal(a.acao,'sugerida (jev)'); assert.equal(a.origem,'jev'); assert.equal(a.categoria,'utilidades');
  const b={id:'2',acao:'revisar',categoria:'',origem:'',aviso:''};
  aplicarJev(b,{categoria:'',confianca:0.4});
  assert.equal(b.acao,'revisar'); assert.equal(b.confianca,0.4);

  // CSV traz a confiança com vírgula decimal.
  assert.match(csv([Object.assign({valor:'1',data:'',status:'',tipoVenda:'escritório',descricao:'x'},a)]),/"0,91"/);

  console.log('dre-jev: todos os testes passaram');
})().catch(e=>{console.error(e);process.exit(1);});
