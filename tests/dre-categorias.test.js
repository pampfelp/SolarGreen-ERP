const assert=require('node:assert/strict');
const path=require('node:path');
const D=require(path.join(__dirname,'../js/dre-categorias.js'));

const cat=(desc,ctx)=>D.sugerir(desc,ctx).categoria;

// Descrições reais (lançamentos de custos_venda, análise de 2026-09-02).
const casos=[
  ['Salário Marcio Batista','folha'],
  ['salário Leonardo','folha'],
  ['Salario Felipe Morais','folha'],
  ['Adiantamento Salario Leonardo Lins','folha'],
  ['Retirada Sócio Felipe Pamplona','retirada_socios'],
  ['Aluguel Sala','aluguel'],
  ['Emprestimo Inteligente','emprestimos'],
  ['Pagamento Emprestimo Inteligente','emprestimos'],
  ['Acerto emprestimo pix','emprestimos'],
  ['Taxa CNPJ SolarGreen','impostos_taxas'],
  ['Maquininha de Cartão de Crédito','taxas_bancarias'],
  ['Diarista até dia 03 de agosto','limpeza'],
  ['Semana Diarista 15/06 até 19/06','limpeza'],
  ['Conta de internet','utilidades'],
  ['Pagamento internet','utilidades'],
  ['Compras Escritório','utilidades'],
  ['Água Escritório','utilidades'],
  ['Galão de água para beber','utilidades'],
  ['Chip Corporativo','software'],
  ['Mensalidade IA','software'],
  ['Sistema Monitoramento','software'],
  ['Assinatura - Plataforma de Documentos','software'],
  ['Corrida 99','transporte'],
  ['Uber','transporte'],
  ['Prejuízo Pagamento Cliente','perdas'],
  ['Comissão Semanal Leonardo','comissoes'],
  ['Investimento em Anuncios','trafego_pago'],   // 2026-10-21: anúncio saiu de marketing para tráfego pago
  ['Anuncio Facebook','trafego_pago'],
  ['Meta Ads outubro','trafego_pago'],
  ['Tráfego pago Google Ads','trafego_pago'],
  ['Crédito para prospecção Felipe Morais','marketing'],
  ['Investimento em leads','trafego_pago'],     // compra de lead conta como tráfego (Felipe, 2026-10-21)
  ['Investimento em Leads (prospecção)','marketing'], // com prospecção fica em marketing (Felipe, 2026-10-21)
  ['Almoço Débora','beneficios'],
  ['pizza comemoração','beneficios'],
  ['Referente aos custos de operação do serviço de Vistoria no cliente X em 10/08/2026. Valor: R$150','execucao_servico'],
];
for(const [desc,esperado] of casos)assert.equal(cat(desc),esperado,desc);

// O que a regra NÃO deve adivinhar: devolve '' (= a revisar).
for(const desc of ['Emanuelli Mendes do Rosário','Material extra',''])
  assert.equal(cat(desc),'',desc);

// Decisões do Felipe em 2026-10-14 sobre os lançamentos que a primeira regra deixou para revisar.
for(const [desc,esperado] of [
  ['Acerto Pix','taxas_bancarias'],['Acerto no Pix','taxas_bancarias'],   // tarifa do banco pelo pix crédito
  ['Pix Felipe Vieira Dias','utilidades'],                                // pix para pessoa = mesma categoria da compra de escritório
  ['Desconhecido','perdas'],['Nu Bank 81,45','perdas'],['Estorno cartão de crédito cliente marco antonio','perdas'],
  ['Ponta de prova','execucao_servico'],                                  // ferramenta do multímetro
  ['Emprestei para Benedito','emprestimos'],
  ['Devolução Juliana Cruz Rodrigues','utilidades'],                      // ressarcimento a colaboradora (categoria assumida, falta ele confirmar)
  ['Google IA','software'],['Claude IA','software'],['Créditos Claude Code','software'],['Sistema Orbi Monitoramento + Chat','software'],
  ['Plano Telefone Celular','software'],['Pagamento plano telefone','software'],
  ['Panificadora','utilidades'],['Adiantamento Leonardo Lins','folha'],['Recisão Eduardo Jorge','folha'],
  ['Consultoria Contabil','servicos_profissionais'],
  ['Folha da equipe','folha'],                                              // categoria de texto livre dos Custos Recorrentes
  ['Retirada Felipe Pamplona até 17 julho','retirada_socios'],
  ['Pix transporte (Abono) 50 Leo + 20 Douglas','beneficios']
])assert.equal(cat(desc),esperado,desc);

// "Felipe Pamplona" (sócio) continua retirada; qualquer outro adiantamento é folha.
assert.equal(cat('Adiantamento Felipe Pamplona'),'retirada_socios');
assert.equal(cat('Adiantamento Felipe Morais'),'folha');

// Descrição gerada pelo sistema para a venda do escritório não diz a natureza.
assert.equal(cat('Referente a custo de escritório (despesa geral da empresa) em 10/08/2026. Valor: R$50',{ehEscritorio:true}),'');
// "Energia solar" no nome do serviço não pode virar "utilidades".
assert.equal(cat('Referente aos custos de operação do serviço de Limpeza de Energia Solar no cliente Y em 01/09/2026. Valor: R$520',{ehEscritorio:false}),'execucao_servico');
// Custo de serviço apontando para a venda do escritório: sem categoria e com aviso.
const conflito=D.sugerir('Referente aos custos de operação do serviço de Vistoria no cliente X em 10/08/2026. Valor: R$150',{ehEscritorio:true});
assert.equal(conflito.categoria,'');
assert.ok(conflito.aviso);

// Venda de cliente sem palavra-chave: vira execução do serviço pela venda.
assert.deepEqual(D.sugerir('Material extra',{ehEscritorio:false}),{categoria:'execucao_servico',origem:'venda',aviso:''});
// Venda do escritório sem palavra-chave: sem sugestão.
assert.equal(cat('Material extra',{ehEscritorio:true}),'');
// Sem saber o tipo da venda: sem sugestão.
assert.equal(cat('Material extra'),'');
// Despesa geral numa venda de cliente: sugere, mas avisa.
assert.ok(D.sugerir('Aluguel Sala',{ehEscritorio:false}).aviso);
// Transporte e almoço da equipe podem ser do serviço: sem aviso.
assert.equal(D.sugerir('Uber',{ehEscritorio:false}).aviso,'');

// Vocabulário: todo ID de regra existe no plano, e todo grupo existe.
for(const c of D.CATEGORIAS){
  assert.ok(D.grupoDe(c.id),'grupo inexistente para '+c.id);
  assert.ok(D.ehCategoriaValida(c.id));
}
assert.equal(new Set(D.CATEGORIAS.map(c=>c.id)).size,D.CATEGORIAS.length,'ID de categoria duplicado');
assert.equal(D.rotuloDe(''),'A revisar');
assert.equal(D.rotuloDe('id_que_nao_existe'),'id_que_nao_existe');

console.log('dre-categorias: todos os testes passaram');
