/**
 * Roteador "casca" — pra testar a arquitetura nova sem NENHUMA chamada real
 * ao backend antigo (Google Apps Script/planilha), SÓ pras telas cujo dado
 * de verdade ainda não existe em nenhum lugar (nunca foram migradas: ficam
 * vazias mesmo, de propósito, até serem migradas). Dashboard, Custos da
 * Venda, Custos Recorrentes, Relatórios, Planos, Metas, Permissões,
 * Agendamentos do admin e Ponto Eletrônico caem aqui.
 *
 * Usuários, Serviços e Catálogo Solar NÃO ficam aqui — o dado deles
 * (vendedores/servicos/templates/produtos_modulos/produtos_inversores) já é
 * Firestore de verdade desde o piloto original (sustenta login, os combos
 * de Vendas/Funil e o checklist do app do técnico), então essas 3 telas têm
 * implementação real em firestore-router.js, não stub.
 *
 * Estende window.SGFireActions (não substitui) — as ações já migradas de
 * verdade (getClientesData, salvarVenda, getFunilData, getCatalogoProdutos,
 * etc., definidas em firestore-router.js) continuam batendo no Firestore
 * normalmente. Esse arquivo precisa carregar DEPOIS de firestore-router.js.
 */
(function(){
  function ok(extra){ return Promise.resolve(Object.assign({ok:true},extra||{})); }
  function okEcho(idField){
    return function(payload){
      var extra={};
      if(payload&&payload[idField]!==undefined)extra[idField]=payload[idField];
      return ok(extra);
    };
  }

  var stubs={
    // js/agendamentos.js (agenda do admin) — implementação real em
    // firestore-router.js, não stub (mesma coleção do app do técnico).
    // Só PDF/assinatura digital seguem sem integração nesse piloto.

    // js/catalogo.js — implementação real em firestore-router.js, não stub

    // js/custo-recorrente.js — Custos Recorrentes não depende de nenhuma
    // coleção já migrada, fica vazio mesmo até ser migrado de verdade.
    getCustoRecorrenteData: function(){ return ok({custos:[]}); },
    salvarCustoRecorrente: okEcho('idCR'),
    excluirCustoRecorrente: function(){ return ok(); },

    // js/custos-venda.js — getCustosVendaData tem implementação real em
    // firestore-router.js (vendas/clientes/servicos já são Firestore de
    // verdade); só salvar/excluir custo ficam stub (Custos da Venda em si
    // ainda não tem coleção própria).
    salvarCustoVenda: okEcho('idCusto'),
    excluirCustoVenda: function(){ return ok(); },

    // js/relatorios.js — getRelatoriosData tem implementação real em
    // firestore-router.js (vendedores já é Firestore de verdade); só
    // salvar/excluir relatório ficam stub.
    salvarRelatorio: okEcho('idRelatorio'),
    excluirRelatorio: function(){ return ok(); },

    // js/metas.js — Metas não depende de nenhuma coleção já migrada.
    getMetasData: function(){ return ok({metas:[]}); },
    salvarMeta: okEcho('idMeta'),
    excluirMeta: function(){ return ok(); },

    // js/permissoes.js (getPermissoesData também é chamado no login, por
    // sg-auth.js, pra montar o menu — precisa responder sempre)
    getPermissoesData: function(){ return ok({telas:[],tipos:[],permissoes:[]}); },
    salvarPermissoes: function(){ return ok(); },

    // js/planos.js — getPlanosData tem implementação real em
    // firestore-router.js (clientes/vendedores já são Firestore de
    // verdade); só salvar/excluir plano ficam stub.
    salvarPlano: okEcho('idPlano'),
    excluirPlano: function(){ return ok(); },

    // js/ponto.js — getData tem implementação real em firestore-router.js
    // (vendedores já é Firestore de verdade); só setOverride fica stub
    // (Ponto Eletrônico em si ainda não tem coleção própria). Dispara
    // sozinho logo após o login (autoConnect), não só ao abrir a aba.
    setOverride: function(){ return ok(); },

    // js/servicos.js — implementação real em firestore-router.js, não stub

    // js/usuarios.js — implementação real em firestore-router.js, não stub
  };

  window.SGFireActions=Object.assign({},window.SGFireActions,stubs);
})();
