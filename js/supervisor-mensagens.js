/**
 * supervisor-mensagens.js: a mensagem pronta que o supervisor de vendas abre no
 * WhatsApp do vendedor, por etapa do Comercial (2026-11-05).
 *
 * ESTE É O ÚNICO LUGAR DESTES TEXTOS (crença 21). Trocar um texto é trocar aqui
 * e subir o ?v= no index.html; nada mais muda.
 *
 * RASCUNHO, AINDA NÃO APROVADO PELO FELIPE (crença 19). Enquanto APROVADO for
 * false, o sistema funciona com estes textos; ao aprovar, troque os textos pelo
 * que ele aprovou ao pé da letra e mude APROVADO para true. Os mesmos rascunhos
 * estão no fim do plano "SolarGreen - Notificações e supervisor - plano -
 * 2026-11-05.md", seção "Rascunhos de mensagem por etapa".
 *
 * Campos: {nome} é o primeiro nome do cliente, {vendedor} o primeiro nome de
 * quem envia. Sem preço, prazo nem promessa.
 */
(function (root) {
  'use strict';

  var APROVADO = false;

  var POR_ETAPA = {
    'Tentativa de Contato': 'Oi, {nome}! Aqui é {vendedor}, da Solar Green Suporte. Tentei falar com você sobre a sua usina solar. Posso te fazer uma pergunta rápida sobre ela?',
    'Retomar Contato': 'Oi, {nome}! Aqui é {vendedor}, da Solar Green Suporte. Vi que você respondeu a nossa mensagem sobre a sua usina. Posso te ajudar com alguma dúvida sobre ela?',
    'Gerar Proposta': 'Oi, {nome}! Aqui é {vendedor}, da Solar Green Suporte. Para montar a sua proposta, preciso confirmar alguns detalhes da sua usina. Pode falar agora?',
    'Negociação': 'Oi, {nome}! Aqui é {vendedor}, da Solar Green Suporte. Conseguiu olhar com calma a proposta da sua usina? Se ficou alguma dúvida, me fala que eu te explico.'
  };
  // Etapa do Comercial criada depois, sem texto próprio.
  var PADRAO = 'Oi, {nome}! Aqui é {vendedor}, da Solar Green Suporte. Estou passando para saber da sua usina solar. Posso te ajudar com alguma coisa?';

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
