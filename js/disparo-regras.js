/**
 * disparo-regras.js: regras puras da tela de campanhas de disparo (2026-10-29).
 *
 * Portadas de _tools/preparar-disparo.js para a página (disparos.html) e para o
 * teste em Node (tests/disparo-regras.test.js). Nada aqui toca em DOM, rede ou
 * Firestore: entra dado, sai resultado.
 */
(function (root) {
  'use strict';

  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var TIPOS = ['perdido', 'parado', 'aberto', 'sem funil', 'importado'];
  var DIAS_PARADO = 30;
  var DIA_MS = 86400000;
  // Sem data de contato, o "Em {{2}} a gente entrou em contato" vira "Em outra ocasião".
  var REFERENCIA_SEM_FUNIL = 'outra ocasião';
  var ERRO_SEM_WHATSAPP = '131026';
  var ORIGEM_IMPORTADA = 'Base Importada';
  // Campos que a página grava ao criar um disparo. As firestore.rules aceitam exatamente estes.
  var CAMPOS_CRIACAO = ['campanha', 'idOportunidade', 'idCliente', 'idVendedor', 'nomeVendedor', 'telVendedor',
    'nomeLead', 'nomeLeadCompleto', 'telLead', 'telFim8', 'segmento', 'modelo', 'referencia', 'ordem', 'status', 'passo', 'criadoEm'];

  function digitos(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
  function fim8(s) { return digitos(s).slice(-8); }

  // Telefone do ERP (com DDD, sem 55) para o formato da API (55 + DDD + número).
  function e164(s) {
    var d = digitos(s);
    if (d.length === 12 || d.length === 13) d = d.replace(/^55/, '');
    // Celular gravado sem o nono dígito (DDD + 8 dígitos começando em 6 a 9).
    if (d.length === 10 && /^[6-9]/.test(d.charAt(2))) d = d.slice(0, 2) + '9' + d.slice(2);
    return d.length === 10 || d.length === 11 ? '55' + d : '';
  }

  // "(DDD) 9XXXX-XXXX" a partir de qualquer forma válida; devolve o texto original se não for válido.
  function formatarTelefone(s) {
    var e = e164(s);
    if (!e) return String(s == null ? '' : s).trim();
    var n = e.slice(2), ddd = n.slice(0, 2), resto = n.slice(2);
    return '(' + ddd + ') ' + resto.slice(0, resto.length - 4) + '-' + resto.slice(-4);
  }

  // Célula de planilha vira texto de telefone: número do Excel perde o formato, então volta inteiro.
  function telefoneDeCelula(v) {
    if (typeof v === 'number' && isFinite(v)) return String(Math.round(v));
    return String(v == null ? '' : v).trim();
  }

  function primeiroNome(s) {
    var p = String(s || '').trim().split(/\s+/)[0] || '';
    return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
  }

  function ultimoEm(arr) {
    return (Array.isArray(arr) ? arr : []).reduce(function (m, x) {
      var t = Date.parse(x && x.Em);
      return isNaN(t) ? m : Math.max(m, t);
    }, 0);
  }

  function mesReferencia(ms, agora) {
    var hoje = new Date(agora == null ? Date.now() : agora), d = new Date(ms);
    return MESES[d.getMonth()] + (d.getFullYear() !== hoje.getFullYear() ? ' de ' + d.getFullYear() : '');
  }

  // Tipo do contato. `lead` é o lead do Comercial mais recente do contato (ou null);
  // `papel` o papel da etapa dele ('perdido', 'ganho', 'proposta', ''); `ultimo` o ms do último movimento.
  function tipoDoContato(entrada, agora) {
    var e = entrada || {};
    if (!e.temLead) return e.origem === ORIGEM_IMPORTADA ? 'importado' : 'sem funil';
    if (e.papel === 'perdido') return 'perdido';
    var t = agora == null ? Date.now() : agora;
    var dias = e.ultimo ? (t - e.ultimo) / DIA_MS : Infinity;
    return dias >= DIAS_PARADO ? 'parado' : 'aberto';
  }

  function referenciaDoContato(tipo, ultimo, agora) {
    if (tipo === 'sem funil' || tipo === 'importado') return REFERENCIA_SEM_FUNIL;
    var t = agora == null ? Date.now() : agora;
    return mesReferencia(ultimo || t, t);
  }

  // Vendedores que podem receber lead: tipo vendedor, ativos e com WhatsApp. Ordem fixa por id.
  function vendedoresAtivos(vendedores) {
    return (vendedores || []).filter(function (v) {
      return String(v.Tipo || '').trim().toLowerCase() === 'vendedor' && v.Status === 'Ativo' && !!e164(v.Telefone);
    }).sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });
  }

  // Dono do lead: o primeiro candidato (dono do lead, depois Vendedor Responsavel) que está
  // ativo com WhatsApp; senão rodízio, devolvido como '' pra quem chama distribuir.
  function donoPreferido(candidatos, ativos) {
    var porId = {};
    (ativos || []).forEach(function (v) { porId[String(v.id)] = v; });
    for (var i = 0; i < (candidatos || []).length; i++) {
      var c = candidatos[i];
      if (c != null && c !== '' && porId[String(c)]) return String(c);
    }
    return '';
  }

  // itens: [{ candidatos: [idDono, idResponsavel] }] na ordem de envio.
  // Devolve [{ vendedor, rodizio }] na mesma ordem. Sem ninguém ativo, vendedor fica null.
  function atribuirDonos(itens, ativos) {
    var porId = {};
    (ativos || []).forEach(function (v) { porId[String(v.id)] = v; });
    var vez = 0;
    return (itens || []).map(function (it) {
      var id = donoPreferido(it.candidatos, ativos);
      if (id) return { vendedor: porId[id], rodizio: false };
      if (!ativos || !ativos.length) return { vendedor: null, rodizio: true };
      var v = ativos[vez % ativos.length];
      vez++;
      return { vendedor: v, rodizio: true };
    });
  }

  // Ordem de envio: o mais antigo primeiro, depois por nome, pra duas simulações darem o mesmo resultado.
  function ordenarParaEnvio(itens) {
    return (itens || []).slice().sort(function (a, b) {
      return (a.ultimo || 0) - (b.ultimo || 0) || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    });
  }

  // Situação do contato na campanha mais recente em que ele entrou.
  // disparos: todos os docs de disparos do mesmo telefone (telFim8).
  // Devolve { campanha, resposta } com resposta em: saiu, respondeu, clicou, nao_entregue,
  // falha_envio, nao_interagiu, nunca. "nao_entregue" é só o erro 131026 (número sem WhatsApp).
  function respostaNaUltimaCampanha(disparos) {
    var docs = (disparos || []).filter(Boolean);
    if (!docs.length) return { campanha: '', resposta: 'nunca' };
    var ultimo = docs.reduce(function (m, d) { return (d.criadoEm || 0) >= (m.criadoEm || 0) ? d : m; }, docs[0]);
    var camp = docs.filter(function (d) { return d.campanha === ultimo.campanha; });
    var algum = function (fn) { return camp.some(fn); };
    var enviou = algum(function (d) { return !!d.enviadoEm || d.status === 'enviado' || d.status === 'saiu'; });
    var erro = camp.filter(function (d) { return d.status === 'erro'; });
    var r;
    if (algum(function (d) { return d.status === 'saiu'; })) r = 'saiu';
    else if (algum(function (d) { return !!d.respondeuEm; })) r = 'respondeu';
    else if (algum(function (d) { return !!d.tocouEm; })) r = 'clicou';
    else if (!enviou && erro.some(function (d) { return String(d.erroCodigo) === ERRO_SEM_WHATSAPP; })) r = 'nao_entregue';
    else if (!enviou && erro.length) r = 'falha_envio';
    else if (enviou) r = 'nao_interagiu';
    else r = 'nunca';
    return { campanha: ultimo.campanha, resposta: r };
  }

  // Motivo de o contato ficar fora da seleção (string vazia = pode entrar).
  // c: { tel, fim8, resposta }; optout: objeto/Set de telFim8; naCampanha: Set/objeto de telFim8 já nesta campanha.
  function motivoDeExclusao(c, optout, naCampanha) {
    var tem = function (col, k) { return !!col && (typeof col.has === 'function' ? col.has(k) : col[k] === true); };
    if (!c.tel) return 'Telefone inválido';
    if (tem(optout, c.fim8)) return 'Pediu para não receber';
    if (c.resposta === 'nao_entregue') return 'Número sem WhatsApp na última campanha';
    if (tem(naCampanha, c.fim8)) return 'Já está nesta campanha';
    return '';
  }

  function chaveDoContato(idOportunidade, idCliente) {
    return idOportunidade ? String(idOportunidade) : 'c' + idCliente;
  }

  function idDoDisparo(campanha, chave, passo) {
    return campanha + '-' + chave + '-p' + passo;
  }

  // Doc de disparo do passo 1 (campos de criação, os mesmos que as firestore.rules aceitam).
  function montarDisparo(p) {
    var v = p.vendedor || {};
    var nome = primeiroNome(p.nomeCompleto);
    var chave = chaveDoContato(p.idOportunidade, p.idCliente);
    var passo = p.passo || 1;
    var tel = e164(p.telefone);
    return {
      id: idDoDisparo(p.campanha, chave, passo),
      dados: {
        campanha: p.campanha,
        idOportunidade: p.idOportunidade || '',
        idCliente: String(p.idCliente || ''),
        idVendedor: String(v.id || ''),
        nomeVendedor: primeiroNome(v.Nome),
        telVendedor: e164(v.Telefone),
        nomeLead: nome || 'tudo bem',
        nomeLeadCompleto: p.nomeCompleto || '',
        telLead: tel,
        telFim8: fim8(tel),
        segmento: p.tipo,
        modelo: p.modelo,
        referencia: referenciaDoContato(p.tipo, p.ultimo, p.agora),
        ordem: p.ordem,
        status: 'fila',
        passo: passo,
        criadoEm: p.agora == null ? Date.now() : p.agora
      }
    };
  }

  // Números de uma lista de disparos (as definições valem em todas as telas).
  // Doc removido da campanha (removidoEm) não conta como "na fila"; `canceladas` são essas mensagens
  // que não vão mais sair (a tela tira do progresso).
  function contar(disparos, custoPorMensagem) {
    var n = { total: 0, fila: 0, canceladas: 0, enviados: 0, entregues: 0, lidos: 0, clicaram: 0, responderam: 0, sairam: 0, naoEntregues: 0, custo: 0 };
    (disparos || []).forEach(function (d) {
      n.total++;
      if (d.status === 'fila') { if (d.removidoEm) n.canceladas++; else n.fila++; }
      if (d.status === 'enviado' || (d.status === 'saiu' && d.enviadoEm)) n.enviados++;
      if (d.entregueEm) n.entregues++;
      if (d.lidoEm) n.lidos++;
      if (d.tocouEm) n.clicaram++;
      if (d.respondeuEm) n.responderam++;
      if (d.status === 'saiu') n.sairam++;
      if (d.status === 'erro') n.naoEntregues++;
    });
    var c = typeof custoPorMensagem === 'number' && isFinite(custoPorMensagem) ? custoPorMensagem : 0.32;
    n.custo = n.enviados * c;
    return n;
  }

  // Situação de um contato (todos os docs dele na campanha), pro selo da tabela.
  // Ordem de peso: saiu, respondeu, erro, clicou, lido, entregue, enviado, fila.
  // "removido" vale por cima de todos, quando o contato foi tirado da campanha.
  var PESO_STATUS = { saiu: 8, respondeu: 7, erro: 6, clicou: 5, lido: 4, entregue: 3, enviado: 2, fila: 1 };
  function statusDoDisparo(d) {
    if (d.status === 'saiu') return 'saiu';
    if (d.respondeuEm) return 'respondeu';
    if (d.status === 'erro') return 'erro';
    if (d.tocouEm) return 'clicou';
    if (d.lidoEm) return 'lido';
    if (d.entregueEm) return 'entregue';
    if (d.status === 'enviado') return 'enviado';
    return 'fila';
  }
  function statusSemRemocao(docs) {
    var melhor = 'fila';
    (docs || []).forEach(function (d) {
      var s = statusDoDisparo(d);
      if (PESO_STATUS[s] > PESO_STATUS[melhor]) melhor = s;
    });
    return melhor;
  }
  // Tirado da campanha: algum doc tem removidoEm e nenhum envio saiu depois da remoção mais recente.
  function removidoDoContato(docs) {
    var rem = 0, env = 0;
    (docs || []).forEach(function (d) {
      if (d.removidoEm && d.removidoEm > rem) rem = d.removidoEm;
      if (d.enviadoEm && d.enviadoEm > env) env = d.enviadoEm;
    });
    return rem > 0 && !(env > rem);
  }
  function statusDoContato(docs) {
    return removidoDoContato(docs) ? 'removido' : statusSemRemocao(docs);
  }
  // Status final: a pessoa saiu, respondeu ou o envio falhou. Nesses casos remover ou devolver não muda nada.
  function statusFinal(docs) {
    var s = statusSemRemocao(docs);
    return s === 'saiu' || s === 'respondeu' || s === 'erro';
  }
  function podeRemover(docs) { return !removidoDoContato(docs) && !statusFinal(docs); }
  function podeDevolver(docs) { return removidoDoContato(docs) && !statusFinal(docs); }

  // Importação: lê linhas { nome, telefone, etiqueta } e separa em novos, já cadastrados e pulados.
  // clientes: [{ id, nome, telefone }]; etiquetaPadrao vale pra linha sem etiqueta.
  function analisarImportacao(linhas, clientes, etiquetaPadrao) {
    var porFim8 = {};
    (clientes || []).forEach(function (c) {
      var k = fim8(c.telefone);
      if (k.length === 8 && !porFim8[k]) porFim8[k] = c;
    });
    var visto = {}, r = { novos: [], existentes: [], pulados: [] };
    (linhas || []).forEach(function (l, i) {
      var linha = i + 2; // linha na planilha, contando o cabeçalho
      var etiqueta = String(l.etiqueta || '').trim() || String(etiquetaPadrao || '').trim();
      var nome = String(l.nome || '').trim();
      var tel = e164(l.telefone);
      var base = { linha: linha, nome: nome, telefone: String(l.telefone == null ? '' : l.telefone), etiqueta: etiqueta };
      if (!tel) { r.pulados.push(Object.assign(base, { motivo: 'Telefone inválido' })); return; }
      var k = fim8(tel);
      if (visto[k]) { r.pulados.push(Object.assign(base, { motivo: 'Telefone repetido no arquivo (linha ' + visto[k] + ')' })); return; }
      visto[k] = linha;
      if (porFim8[k]) { r.existentes.push(Object.assign(base, { tel: tel, formatado: formatarTelefone(tel), cadastro: porFim8[k] })); return; }
      if (!nome) { r.pulados.push(Object.assign(base, { motivo: 'Nome em branco' })); return; }
      r.novos.push(Object.assign(base, { tel: tel, formatado: formatarTelefone(tel) }));
    });
    return r;
  }

  var api = {
    MESES: MESES, TIPOS: TIPOS, DIAS_PARADO: DIAS_PARADO, REFERENCIA_SEM_FUNIL: REFERENCIA_SEM_FUNIL,
    ERRO_SEM_WHATSAPP: ERRO_SEM_WHATSAPP, ORIGEM_IMPORTADA: ORIGEM_IMPORTADA, CAMPOS_CRIACAO: CAMPOS_CRIACAO,
    digitos: digitos, fim8: fim8, e164: e164, formatarTelefone: formatarTelefone, telefoneDeCelula: telefoneDeCelula,
    primeiroNome: primeiroNome, ultimoEm: ultimoEm, mesReferencia: mesReferencia,
    tipoDoContato: tipoDoContato, referenciaDoContato: referenciaDoContato,
    vendedoresAtivos: vendedoresAtivos, donoPreferido: donoPreferido, atribuirDonos: atribuirDonos,
    ordenarParaEnvio: ordenarParaEnvio, respostaNaUltimaCampanha: respostaNaUltimaCampanha,
    motivoDeExclusao: motivoDeExclusao, chaveDoContato: chaveDoContato, idDoDisparo: idDoDisparo,
    montarDisparo: montarDisparo, contar: contar, statusDoDisparo: statusDoDisparo, statusDoContato: statusDoContato,
    podeRemover: podeRemover, podeDevolver: podeDevolver,
    analisarImportacao: analisarImportacao
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DisparoRegras = api;
})(typeof window !== 'undefined' ? window : null);
