/**
 * dre-jev.js — pede ao Jev (TypeSafe) a categoria da DRE de um custo, pelo
 * Apps Script (a chave da TypeSafe fica nas Propriedades do script, nunca
 * aqui: crença 13). Só é chamado quando sugerir() não achou categoria.
 *
 * Falha em silêncio: sem rede, sem a ação publicada no Apps Script, erro ou
 * resposta baixa, devolve categoria '' e o formulário segue só com a regra.
 */
(function(){
  'use strict';
  var VAZIO={categoria:'',confianca:0};
  var cache={}; // mesma descrição na mesma sessão não paga duas vezes

  function pedir(descricao,ctx){
    if(!window.SGDre||!window.SGAuth)return Promise.resolve(VAZIO);
    var pedido=window.SGDre.montarPedidoJev(descricao,ctx);
    if(!pedido)return Promise.resolve(VAZIO);
    var chave=JSON.stringify(pedido.state);
    if(cache[chave])return cache[chave];
    cache[chave]=window.SGAuth.apiCall('sugerirCategoriaJev',{pedido:pedido}).then(function(resp){
      if(!resp||!resp.ok||!resp.resposta){ delete cache[chave]; return VAZIO; }
      return window.SGDre.lerRespostaJev(resp.resposta);
    }).catch(function(){ delete cache[chave]; return VAZIO; });
    return cache[chave];
  }

  window.SGDreJev={pedir:pedir};
})();
