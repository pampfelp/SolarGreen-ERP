/**
 * perda-categorias.js — tipo de perda do funil (2026-11-03).
 *
 * O vendedor continua escrevendo o motivo em texto livre (MotivoPerda). Na hora
 * em que ele confirma, o sistema grava também o tipo (TipoPerda, o ID abaixo) e
 * de onde ele veio (TipoPerdaOrigem: 'palavra' ou 'jev'). O nome do tipo fica só
 * aqui (crença 14): renomear é editar este arquivo, sem mexer no que está gravado.
 *
 * Primeira camada: palavras-chave, determinística. Quando nenhuma regra pega,
 * devolve tipo '' e o funil pergunta ao Jev pelo mesmo proxy da DRE
 * (sugerirCategoriaJev no Apps Script, que só aceita a pergunta 'categoria').
 * Abaixo do limiar o tipo fica 'outros'.
 *
 * Substitui o classificarMotivo de js/dre-dashboard.js, que agrupava o texto na
 * leitura. Também é carregado por Node (análise e testes).
 */
(function(root){
  'use strict';

  var TIPOS=[
    {id:'contato_invalido',nome:'Contato inválido (número errado, sem WhatsApp)'},
    {id:'sem_resposta',nome:'Parou de responder'},
    {id:'bloqueou',nome:'Bloqueou'},
    {id:'sem_interesse',nome:'Sem interesse'},
    {id:'concorrente',nome:'Já tem empresa / fechou com outra'},
    {id:'preco',nome:'Preço ou sem dinheiro'},
    {id:'decisor',nome:'Depende de outra pessoa decidir'},
    {id:'adiou',nome:'Adiou ("vou ver e te retorno")'},
    {id:'desconfianca',nome:'Desconfiança / LGPD'},
    {id:'fora_perfil',nome:'Fora do perfil (cidade, sem usina, desqualificado)'},
    {id:'outros',nome:'Outros'}
  ];

  // A ordem importa: a primeira que casar vence. Texto já sem acento.
  var REGRAS=[
    ['concorrente',/outra empresa|outro empresa|ja tem (uma |um |o )?(empresa|suporte)|ja tem suporte|contrat(ou|rou)|fechou com|fez com|presta(dora)? (de )?servic|chamou outr|solicitou outr|ja mandou faz|ja fez o servic|integrador (faz|ja)/],
    ['preco',/caro|dinheiro|valor|desloc|orcamento|limite|cartao|pagar a taxa|nao pag|sem condic|condicoes|financ|desempregad/],
    ['decisor',/marido|esposo|esposa|mulher dele|filh[oa]|socio|familia|m(an|na)daram (eu )?desist|ver com (o|a) /],
    ['desconfianca',/lgpd|desconfi|golpe|processar|como conseguiu (meu|o) (numero|contato)/],
    ['contato_invalido',/errad|eroad|errrad|numeor|nao (tem |esta (mais |mas )?no )?wh?at|sem what|nao e (o|a) (cliente|dono)|ddd|nao existe/],
    ['bloqueou',/bloque|bloqui/],
    ['adiou',/depois|mais tarde|retorno (eu|ele|ela)|vai ver|vou ver|proximo mes|outra hora|outro momento|ano que vem|mais pra frente|agora nao/],
    ['sem_interesse',/interess|nao mandar mensag|nao quer|desist|nao precisa|surtad/],
    ['sem_resposta',/sem resposta|sem retorno|sem contato|nao respond|nao retorn|nao atend|nao deu retorno|tentati|ultimato|visualiz|viaj|sumiu|ignor/],
    ['fora_perfil',/desqualific|outro municipio|outra cidade|mora em|fora da (area|regiao)|breves|vender a casa|nao tem (usina|placa|energia solar)|instalou (ha|faz) pouco/]
  ];

  var LIMIAR_JEV=0.8;

  function norm(s){
    return String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  }
  function porId(id){
    for(var i=0;i<TIPOS.length;i++){ if(TIPOS[i].id===id)return TIPOS[i]; }
    return null;
  }
  function ehTipoValido(id){ return !!porId(id); }
  function rotuloDe(id){ var t=porId(id); return t?t.nome:(id?String(id):'Sem motivo preenchido'); }

  /** Motivo em texto livre -> {tipo, origem}. tipo '' = nenhuma regra pegou (vale perguntar ao Jev). */
  function sugerir(motivo){
    var d=norm(motivo);
    if(!d)return {tipo:'',origem:''};
    // "Disparo: não tem interesse agora" é gravado pelo próprio sistema.
    if(/^disparo:/.test(d))return {tipo:'sem_interesse',origem:'palavra'};
    for(var i=0;i<REGRAS.length;i++){
      if(REGRAS[i][1].test(d))return {tipo:REGRAS[i][0],origem:'palavra'};
    }
    return {tipo:'',origem:''};
  }

  /** Tipo de um lead já gravado: o campo, se veio; senão a regra; senão 'outros'. '' = sem motivo. */
  function tipoDoLead(tipoGravado,motivo){
    if(ehTipoValido(tipoGravado))return tipoGravado;
    if(!norm(motivo))return '';
    return sugerir(motivo).tipo||'outros';
  }

  /** Pedido para o proxy sugerirCategoriaJev. null = motivo curto demais para valer a chamada. */
  function montarPedidoJev(motivo){
    var d=String(motivo==null?'':motivo).trim();
    if(norm(d).length<4)return null;
    var criteria={};
    TIPOS.forEach(function(t){ criteria[t.id]=t.nome; });
    return {state:{descricao:d.slice(0,300)},questions:{categoria:{type:'choice',
      instructions:'Uma empresa de manutenção de usina solar perdeu esta venda. O texto é o motivo que o vendedor escreveu. Qual tipo de perda descreve melhor? Se o texto não disser o bastante, responda outros.',
      criteria:criteria}}};
  }

  /** Resposta do proxy -> {tipo, confianca}. Abaixo do limiar, ou inválida, vira 'outros'. */
  function lerRespostaJev(resp){
    var a=resp&&resp.answers&&resp.answers.categoria;
    if(!a||a.type!=='choice')return {tipo:'outros',confianca:0};
    var p=a.probabilities&&typeof a.probabilities[a.choice]==='number'?a.probabilities[a.choice]:a.confidence;
    var conf=typeof p==='number'?p:0;
    if(!ehTipoValido(a.choice)||conf<LIMIAR_JEV)return {tipo:'outros',confianca:conf};
    return {tipo:a.choice,confianca:conf};
  }

  var api={TIPOS:TIPOS,LIMIAR_JEV:LIMIAR_JEV,porId:porId,ehTipoValido:ehTipoValido,rotuloDe:rotuloDe,
    sugerir:sugerir,tipoDoLead:tipoDoLead,montarPedidoJev:montarPedidoJev,lerRespostaJev:lerRespostaJev};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.SGPerda=api;
})(typeof window!=='undefined'?window:null);
