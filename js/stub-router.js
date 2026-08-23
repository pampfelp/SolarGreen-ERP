/**
 * Roteador "casca" — pra testar a arquitetura nova sem NENHUMA chamada real
 * ao backend antigo (Google Apps Script/planilha). Tudo que ainda não foi
 * migrado pro Firestore (Dashboard, Custos da Venda, Custos Recorrentes,
 * Relatórios, Serviços, Planos, Catálogo Solar, Metas, Usuários, Permissões,
 * Agendamentos do admin, Ponto Eletrônico) responde aqui com um "vazio de
 * verdade" no MESMO formato que cada tela espera no caminho de sucesso —
 * assim a tela renderiza normalmente (lista vazia, "nenhum registro
 * encontrado"), sem erro de conexão e sem tocar em dado real. O conteúdo
 * dessas telas é migrado de verdade depois, num passo separado.
 *
 * Estende window.SGFireActions (não substitui) — as ações já migradas de
 * verdade (getClientesData, salvarVenda, getFunilData, etc., definidas em
 * firestore-router.js) continuam batendo no Firestore normalmente. Esse
 * arquivo precisa carregar DEPOIS de firestore-router.js.
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
    // js/agendamentos.js (agenda do admin — diferente da do app do técnico)
    getAgendamentosData: function(){ return ok({agendamentos:[],clientes:[],vendedores:[],servicos:[],templates:[],respostas:[]}); },
    getRespostasAgendamentosVendedor: function(){ return ok({respostas:[]}); },
    salvarAgendamento: okEcho('idAgendamento'),
    atualizarStatusAgendamento: function(){ return ok(); },
    excluirAgendamento: function(){ return ok(); },
    gerarPdfOS: function(){ return ok({fileId:''}); },
    enviarOSParaAssinatura: function(){ return ok({link:''}); },
    verificarStatusOS: function(){ return ok({status:'',refused:false}); },

    // js/catalogo.js
    getCatalogoProdutos: function(){ return ok({modulos:[],inversores:[]}); },
    salvarModulo: okEcho('idModulo'),
    excluirModulo: function(){ return ok(); },
    salvarInversor: okEcho('idInversor'),
    excluirInversor: function(){ return ok(); },

    // js/custo-recorrente.js
    getCustoRecorrenteData: function(){ return ok({custos:[]}); },
    salvarCustoRecorrente: okEcho('idCR'),
    excluirCustoRecorrente: function(){ return ok(); },

    // js/custos-venda.js
    getCustosVendaData: function(){ return ok({custos:[],vendas:[],clientes:[],servicos:[]}); },
    salvarCustoVenda: okEcho('idCusto'),
    excluirCustoVenda: function(){ return ok(); },

    // js/dashboard.js + js/relatorios.js (getVendasData/getFunilData já são
    // reais — vêm do Firestore via firestore-router.js, não precisam de stub)
    getRelatoriosData: function(){ return ok({relatorios:[],vendedores:[]}); },
    salvarRelatorio: okEcho('idRelatorio'),
    excluirRelatorio: function(){ return ok(); },

    // js/metas.js
    getMetasData: function(){ return ok({metas:[]}); },
    salvarMeta: okEcho('idMeta'),
    excluirMeta: function(){ return ok(); },

    // js/permissoes.js (getPermissoesData também é chamado no login, por
    // sg-auth.js, pra montar o menu — precisa responder sempre)
    getPermissoesData: function(){ return ok({telas:[],tipos:[],permissoes:[]}); },
    salvarPermissoes: function(){ return ok(); },

    // js/planos.js
    getPlanosData: function(){ return ok({planos:[],clientes:[],vendedores:[]}); },
    salvarPlano: okEcho('idPlano'),
    excluirPlano: function(){ return ok(); },

    // js/ponto.js — getData dispara sozinho logo após o login (autoConnect),
    // não só quando o usuário abre a aba de Ponto.
    getData: function(){ return ok({vendedores:[],ponto:[],overrides:{}}); },
    setOverride: function(){ return ok(); },

    // js/servicos.js — catálogo de serviços/checklist do ADMIN (diferente da
    // coleção servicos do Firestore, já usada de verdade por Vendas/Funil)
    getServicosData: function(){ return ok({servicos:[],templates:[]}); },
    salvarServico: okEcho('idServico'),
    excluirServico: function(){ return ok(); },
    salvarTemplate: okEcho('idTemplate'),
    excluirTemplate: function(){ return ok(); },

    // js/usuarios.js
    listVendedoresAdmin: function(){ return ok({vendedores:[]}); },
    salvarVendedor: okEcho('idVendedor')
  };

  window.SGFireActions=Object.assign({},window.SGFireActions,stubs);
})();
