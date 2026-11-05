/**
 * supervisor-mensagens.js: a mensagem pronta que o supervisor de vendas abre no
 * WhatsApp do vendedor, por etapa do Comercial (2026-11-05).
 *
 * ESTE É O ÚNICO LUGAR DESTES TEXTOS (crença 21). Trocar um texto é trocar aqui
 * e subir o ?v= no index.html; nada mais muda.
 *
 * APROVADO PELO FELIPE em 2026-11-05 (crença 19): ele deu o sentido de cada
 * etapa e o texto de Retomar Contato e Negociação, e mandou lapidar pelo método
 * da Ootto (dm-script-writer e cta-writer: o motivo antes do pedido, uma
 * pergunta fácil de responder no fim) e publicar. Sentido das etapas:
 * Tentativa = chamamos e não respondeu; Retomar = respondeu e combinamos de
 * falar depois, com ou sem proposta; Gerar Proposta = proposta em elaboração
 * ou com mudança de preço; Negociação = já tem o preço, falta fechar.
 *
 * Campos: {nome} é o primeiro nome do cliente, {vendedor} o primeiro nome de
 * quem envia. Sem valor em reais.
 */
(function (root) {
  'use strict';

  var APROVADO = true;

  var POR_ETAPA = {
    'Tentativa de Contato': 'Oi, {nome}! Aqui é {vendedor}, da Solar Green. Uma pergunta rápida sobre a sua usina solar: ela continua gerando como no começo ou a conta de luz voltou a subir?',
    'Retomar Contato': 'Oi, {nome}! Aqui é {vendedor}, da Solar Green. A gente tentou se falar há um tempo, e a nossa proposta continua de pé. Que tal continuarmos a conversa hoje? Me diz o melhor horário pra você.',
    'Gerar Proposta': 'Oi, {nome}! Aqui é {vendedor}, da Solar Green. Estou finalizando a sua proposta e quero que ela venha certa para a sua usina. Posso te fazer duas perguntas rápidas agora?',
    'Negociação': 'E aí, {nome}? O que achou da proposta? Essa condição vale para este mês, e nos próximos os preços devem passar por um ajuste. Posso já reservar o seu serviço para esta semana?'
  };
  // Etapa do Comercial criada depois, sem texto próprio.
  var PADRAO = 'Oi, {nome}! Aqui é {vendedor}, da Solar Green. Passando para saber da sua usina solar. Ficou alguma dúvida que eu possa resolver hoje?';

  function primeiro(s) { return String(s == null ? '' : s).trim().split(/\s+/)[0] || ''; }
  function capitalizar(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''; }

  function mensagem(etapa, dados) {
    var d = dados || {};
    var nome = capitalizar(primeiro(d.nome));
    var vendedor = capitalizar(primeiro(d.vendedor)) || 'a equipe';
    var texto = Object.prototype.hasOwnProperty.call(POR_ETAPA, etapa) ? POR_ETAPA[etapa] : PADRAO;
    // Sem nome no cadastro, "Oi, !" vira "Oi!".
    return texto.replace(nome ? /\{nome\}/g : /, \{nome\}/g, nome).replace(/\{vendedor\}/g, vendedor);
  }

  var api = { APROVADO: APROVADO, POR_ETAPA: POR_ETAPA, PADRAO: PADRAO, mensagem: mensagem };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SupervisorMensagens = api;
})(typeof window !== 'undefined' ? window : null);
