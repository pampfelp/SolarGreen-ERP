/**
 * dre-categorias.js — categorias dos Custos da Venda para a DRE (2026-10-13).
 *
 * Fonte única do vocabulário (crença 14): o que se grava em custos_venda é o
 * ID da categoria ('folha', 'execucao_servico'…), nunca o nome. O nome e o
 * grupo da DRE ficam só aqui, então renomear ou mudar uma categoria de grupo
 * é editar este arquivo, sem mexer em nenhum dado já gravado.
 *
 * Os grupos e as categorias abaixo são uma PROPOSTA, derivada da análise de
 * setembro/2026 (Relatórios Claude/SolarGreen - Analise de Dados 2026-09).
 * Quem fecha o plano de contas é o Felipe/contador.
 *
 * sugerir(descricao, ctx) é determinístico (palavras-chave + o tipo da venda
 * vinculada). Quando não tem certeza devolve categoria '' (= "a revisar"),
 * nunca chuta. É a primeira camada; qualquer classificador por modelo
 * (ex.: Jev) só entraria depois dela, nos casos em que ela devolve ''.
 *
 * Também é carregado por Node (_tools/backfill-categoria-custos.js e testes).
 */
(function(root){
  'use strict';

  var GRUPOS=[
    {id:'cpv',nome:'Custo dos serviços prestados'},
    {id:'pessoal',nome:'Despesas com pessoal'},
    {id:'comercial',nome:'Despesas comerciais'},
    {id:'administrativo',nome:'Despesas administrativas'},
    {id:'financeiro',nome:'Despesas financeiras'},
    {id:'perdas',nome:'Perdas'},
    {id:'socios',nome:'Retiradas dos sócios'}
  ];

  var CATEGORIAS=[
    {id:'execucao_servico',nome:'Execução do serviço (mão de obra e material)',grupo:'cpv'},
    {id:'folha',nome:'Folha da equipe (salário, adiantamento, rescisão)',grupo:'pessoal'},
    {id:'beneficios',nome:'Vale transporte, refeição e alimentação da equipe',grupo:'pessoal'},
    {id:'comissoes',nome:'Comissões de vendas',grupo:'comercial'},
    {id:'marketing',nome:'Marketing, anúncios e leads',grupo:'comercial'},
    {id:'aluguel',nome:'Aluguel',grupo:'administrativo'},
    {id:'utilidades',nome:'Energia, internet, água e material de escritório',grupo:'administrativo'},
    {id:'limpeza',nome:'Diarista e limpeza',grupo:'administrativo'},
    {id:'software',nome:'Software, sistemas e telefonia',grupo:'administrativo'},
    {id:'transporte',nome:'Transporte e deslocamento',grupo:'administrativo'},
    {id:'impostos_taxas',nome:'Impostos e taxas',grupo:'administrativo'},
    {id:'servicos_profissionais',nome:'Serviços profissionais (contabilidade e consultoria)',grupo:'administrativo'},
    {id:'taxas_bancarias',nome:'Tarifas bancárias e taxas de cartão',grupo:'financeiro'},
    {id:'emprestimos',nome:'Parcelas de empréstimo',grupo:'financeiro'},
    {id:'perdas',nome:'Prejuízo e inadimplência',grupo:'perdas'},
    {id:'retirada_socios',nome:'Retiradas e pró-labore dos sócios',grupo:'socios'}
  ];

  // Categorias que, mesmo lançadas numa venda de cliente, podem ser do próprio
  // serviço (corrida até o cliente, almoço da equipe no dia). As outras, se
  // aparecerem numa venda de cliente, geram aviso pra conferir.
  var PODE_SER_DO_SERVICO=['transporte','beneficios','execucao_servico'];

  // Descrições geradas pelo próprio sistema (gerarDescricaoAutomaticaCv e a
  // do painel da venda). Dizem a natureza do lançamento, não o assunto.
  var RX_SERVICO_AUTO=/^referente aos custos de operacao do servico|^referente a limpeza executada|custo instala|valor operacao nao identificado|material \+ mao de obra/;
  var RX_ESCRITORIO_AUTO=/^referente a custo de escritorio/;

  // Ordem importa: a primeira que casar vence. Texto já normalizado
  // (minúsculo, sem acento).
  var REGRAS=[
    ['retirada_socios',/retirada (de )?socio|pro.?labore|(retirada|adiantamento|fisioterapia) felipe pamplona/],
    ['folha',/salario|encargo|rescisao|recisao|adiantamento|decimo terceiro|\bferias\b|\bfgts\b|\binss\b/],
    ['comissoes',/comiss/],
    ['beneficios',/vale.?(transporte|refeicao|alimentacao)|abono|almoco|lanche|pizza|suco|refeic|confraterniz/],
    ['limpeza',/diarista|faxin/],
    ['aluguel',/aluguel/],
    ['emprestimos',/emprestimo|financiamento|emprestei/],
    ['taxas_bancarias',/taxa (de )?cartao|tarifa|maquininha|\biof\b|acerto (no )?pix/],
    ['impostos_taxas',/taxa cnpj|\bdas\b|simples nacional|imposto|\biss(qn)?\b|alvara|iptu/],
    ['servicos_profissionais',/consultoria|contabil|contador/],
    ['software',/sistema (monitoramento|mensagem|casamento)|app monitoramento|plataforma|wavoip|mensalidade ia|\bia\b|claude|orbi|telefone|celular|chip|software|hospedagem|dominio/],
    ['execucao_servico',/ponta de prova|multimetro|ferramenta/],
    ['marketing',/anuncio|investimento em leads|prospec|facebook|meta ads|google ads|trafego/],
    ['transporte',/corrida|\buber\b|\b99\b|passagem|desloca|combustivel|gasolina|pedagio|estacionamento/],
    ['utilidades',/conta de (energia|internet|agua)|pagamento internet|energia ref|\bagua\b|material (de )?escritorio|compras? (do mes|escritorio|mateus)|papel higienico|galao|\bcafe\b/],
    ['perdas',/prejuizo|inadimpl|calote|estorno|^desconhecido|^nu ?bank/],
    ['utilidades',/panificadora|padaria|^devolucao |^pix [a-z]/]
  ];

  function norm(s){
    return String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  }

  function porId(id){
    for(var i=0;i<CATEGORIAS.length;i++){ if(CATEGORIAS[i].id===id)return CATEGORIAS[i]; }
    return null;
  }
  function ehCategoriaValida(id){ return !!porId(id); }
  /** Nome para mostrar. Vazio = "A revisar". ID desconhecido aparece cru, nunca some (crença 32). */
  function rotuloDe(id){
    if(!id)return 'A revisar';
    var c=porId(id);
    return c?c.nome:String(id);
  }
  function grupoDe(id){
    var c=porId(id);
    if(!c)return null;
    for(var i=0;i<GRUPOS.length;i++){ if(GRUPOS[i].id===c.grupo)return GRUPOS[i]; }
    return null;
  }

  var SEM_SUGESTAO={categoria:'',origem:'',aviso:''};

  /**
   * ctx.ehEscritorio: true  = venda vinculada é a "gaveta" do escritório
   *                   false = venda de cliente de verdade
   *                   ausente = não se sabe
   * Devolve {categoria,origem,aviso}. origem: 'palavra' | 'venda' | ''.
   */
  function sugerir(descricao,ctx){
    var d=norm(descricao);
    var esc=ctx?ctx.ehEscritorio:undefined;
    var vendaReal=(esc===false);

    if(RX_ESCRITORIO_AUTO.test(d))return SEM_SUGESTAO;
    if(RX_SERVICO_AUTO.test(d)){
      if(esc===true)return {categoria:'',origem:'',aviso:'A descrição é de custo de serviço, mas a venda vinculada é a do escritório. Confira.'};
      return {categoria:'execucao_servico',origem:'palavra',aviso:''};
    }
    for(var i=0;i<REGRAS.length;i++){
      if(REGRAS[i][1].test(d)){
        var cat=REGRAS[i][0];
        var aviso=(vendaReal&&PODE_SER_DO_SERVICO.indexOf(cat)===-1)
          ?'Lançado numa venda de cliente, mas a descrição parece despesa geral. Confira.':'';
        return {categoria:cat,origem:'palavra',aviso:aviso};
      }
    }
    if(vendaReal)return {categoria:'execucao_servico',origem:'venda',aviso:''};
    return SEM_SUGESTAO;
  }

  // Jev (TypeSafe): segunda camada, só para o que sugerir() devolve vazio. O
  // formulário, o proxy do Apps Script e o backfill montam o pedido e leem a
  // resposta por aqui, para o vocabulário ficar num lugar só (crença 14).
  // O limiar é um palpite conservador: a calibração do Jev neste domínio não
  // foi medida (ideias-futuras.md, seção Jev).
  var LIMIAR_JEV=0.8;

  /** Pedido para POST /v1/systemone. null = não vale chamar (descrição curta ou gerada pelo sistema). */
  function montarPedidoJev(descricao,ctx){
    var d=norm(descricao);
    if(d.length<4||RX_SERVICO_AUTO.test(d)||RX_ESCRITORIO_AUTO.test(d))return null;
    var criteria={};
    CATEGORIAS.forEach(function(c){ criteria[c.id]=c.nome; });
    criteria.nenhuma='Nenhuma das anteriores, ou a descrição não diz o bastante (por exemplo, só o nome de uma pessoa)';
    var estado={descricao:String(descricao).trim().slice(0,300)};
    if(ctx&&typeof ctx.ehEscritorio==='boolean')estado.venda=ctx.ehEscritorio?'despesa do escritório':'serviço de cliente';
    return {state:estado,questions:{categoria:{type:'choice',
      instructions:'Qual categoria da DRE de uma empresa de energia solar descreve melhor este custo? Se a descrição não bastar, responda nenhuma.',
      criteria:criteria}}};
  }

  /** Resposta da API -> {categoria,confianca}. Categoria vazia = "a revisar" (nenhuma, inválida ou abaixo do limiar). */
  function lerRespostaJev(resp){
    var a=resp&&resp.answers&&resp.answers.categoria;
    if(!a||a.type!=='choice')return {categoria:'',confianca:0};
    var p=a.probabilities&&typeof a.probabilities[a.choice]==='number'?a.probabilities[a.choice]:a.confidence;
    var conf=typeof p==='number'?p:0;
    if(!ehCategoriaValida(a.choice)||conf<LIMIAR_JEV)return {categoria:'',confianca:conf};
    return {categoria:a.choice,confianca:conf};
  }

  var api={GRUPOS:GRUPOS,CATEGORIAS:CATEGORIAS,porId:porId,ehCategoriaValida:ehCategoriaValida,rotuloDe:rotuloDe,grupoDe:grupoDe,sugerir:sugerir,
    LIMIAR_JEV:LIMIAR_JEV,montarPedidoJev:montarPedidoJev,lerRespostaJev:lerRespostaJev};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.SGDre=api;
})(typeof window!=='undefined'?window:null);
