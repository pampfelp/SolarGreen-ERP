/**
 * supervisor-regras.js: regras puras do supervisor de vendas (2026-11-05).
 *
 * O vendedor marca a data do próximo contato; na hora, o sistema avisa com a
 * mensagem da etapa pronta, depois pergunta a próxima data e lembra dos leads
 * vermelhos sem data (até 25 por vendedor por dia). Nada aqui toca em DOM, rede
 * ou Firestore: entra dado, sai resultado.
 *
 * Usado pelo Funil (js/funil.js), pelo sininho (js/supervisor.js), pelo teste
 * em Node (tests/supervisor-regras.test.js) e pelo Apps Script: a seção
 * "SUPERVISOR DE VENDAS" do legado/CODE GS.txt traz uma cópia literal deste
 * arquivo, e o teste falha se as duas divergirem.
 *
 * Hora sempre de Belém (UTC-3, sem horário de verão), calculada pelo número,
 * nunca pelo fuso da máquina que roda.
 */
(function (root) {
  'use strict';

  var MIN_MS = 60000;
  var HORA_MS = 60 * MIN_MS;
  var DIA_MS = 24 * HORA_MS;
  var FUSO_BELEM_MS = -3 * HORA_MS;

  // Só o pipeline Comercial entra no supervisor (o que tem "Novo Lead",
  // preferindo o nome Comercial, mesma escolha de js/leads-site-motor.js).
  var PIPELINE_NOME = 'comercial';
  var ETAPA_ENTRADA = 'Novo Lead';
  // Fora do supervisor: estas etapas pelo nome e as de papel ganho e perdido.
  var ETAPAS_FORA = ['Novo Lead', 'Serviço Agendado'];
  var PAPEIS_FORA = ['ganho', 'perdido'];

  var TIPO_TENTATIVA = 'Tentativa de Contato';
  var TIPOS_CONVERSA = ['Conversa no WhatsApp', 'Ligação'];
  // Qual Tentativa de Contato deixa a bolinha verde: 'todas' (também a
  // registrada à mão no Funil) ou 'supervisor' (só a do Enviar do aviso, que
  // grava Origem: 'supervisor'). O Felipe decidiu pela do supervisor; a manual
  // ainda espera a palavra dele (2026-11-05). Trocar só aqui.
  var TENTATIVA_ZERA_PRAZO = 'todas';
  var ORIGEM_SUPERVISOR = 'supervisor';

  var LIMITE_POR_VENDEDOR = 25;
  var HORAS_LEMBRETE = [9, 13, 16];      // seg a sex
  var JANELA_LEMBRETE_MS = HORA_MS;      // gatilho atrasado ainda manda dentro de 1 h
  var PERGUNTA_DEPOIS_MS = 90 * MIN_MS;  // 1h30 depois do Enviar
  var LOTE_HORA = 17, LOTE_MINUTO = 30;  // pergunta que passaria disso vai às 17h30

  var TIPOS_AVISO = { contato: 'supervisor_contato', lembrete: 'supervisor_lembrete', pergunta: 'supervisor_pergunta' };

  // ── Texto ───────────────────────────────────────────────────────────────
  function normalizar(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }
  function primeiroNome(nome) {
    var p = String(nome == null ? '' : nome).trim().split(/\s+/)[0] || '';
    return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
  }
  function digitos(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
  // Telefone do cadastro para o wa.me (55 + DDD + número); '' se não der.
  function telefoneWa(s) {
    var d = digitos(s);
    if (d.length === 12 || d.length === 13) d = d.replace(/^55/, '');
    if (d.length === 10 && /^[6-9]/.test(d.charAt(2))) d = d.slice(0, 2) + '9' + d.slice(2);
    return d.length === 10 || d.length === 11 ? '55' + d : '';
  }

  // ── Hora de Belém ───────────────────────────────────────────────────────
  function partes(ms) {
    var d = new Date(ms + FUSO_BELEM_MS);
    return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate(), hora: d.getUTCHours(), minuto: d.getUTCMinutes(), semana: d.getUTCDay() };
  }
  function msBelem(ano, mes, dia, hora, minuto) { return Date.UTC(ano, mes - 1, dia, hora || 0, minuto || 0) - FUSO_BELEM_MS; }
  function dois(n) { return (n < 10 ? '0' : '') + n; }
  function chaveDia(ms) { var p = partes(ms); return p.ano + '-' + dois(p.mes) + '-' + dois(p.dia); }
  function inicioDoDia(ms) { var p = partes(ms); return msBelem(p.ano, p.mes, p.dia, 0, 0); }
  function ehDiaUtil(ms) { var s = partes(ms).semana; return s >= 1 && s <= 5; }
  // Dias corridos de meia-noite a meia-noite (mesma conta do getDiasNaEtapa do Funil).
  function diasEntre(deMs, ateMs) { return Math.round((inicioDoDia(ateMs) - inicioDoDia(deMs)) / DIA_MS); }
  // "dd/mm/aaaa" ou "aaaa-mm-dd" (os dois formatos do DataCriacao) à meia-noite de Belém.
  function dataTextoMs(s) {
    var t = String(s == null ? '' : s).trim(), m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t))) return msBelem(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t))) return msBelem(+m[3], +m[2], +m[1]);
    return null;
  }

  // Campos <input type="date"> e <input type="time"> para ms, e o contrário.
  // null se faltar um dos dois ou estiver fora do formato.
  function msDosCampos(data, hora) {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data || '')), h = /^(\d{2}):(\d{2})/.exec(String(hora || ''));
    if (!d || !h || +h[1] > 23 || +h[2] > 59) return null;
    return msBelem(+d[1], +d[2], +d[3], +h[1], +h[2]);
  }
  function camposDoMs(ms) {
    if (typeof ms !== 'number') return { data: '', hora: '' };
    var p = partes(ms);
    return { data: chaveDia(ms), hora: dois(p.hora) + ':' + dois(p.minuto) };
  }
  function textoDataHora(ms) {
    var p = partes(ms);
    return dois(p.dia) + '/' + dois(p.mes) + '/' + p.ano + ' às ' + dois(p.hora) + ':' + dois(p.minuto);
  }
  // Erro de preenchimento da data do próximo contato, ou '' se está certa.
  function erroDaData(ms, agoraMs) {
    if (typeof ms !== 'number') return 'Informe a data e a hora do próximo contato.';
    if (ms < agoraMs - MIN_MS) return 'A data do próximo contato precisa ser daqui para a frente.';
    return '';
  }

  // Quando sai a pergunta "Qual a próxima data?" depois do Enviar: 1h30 depois,
  // sem passar das 17h30 do dia útil. Depois das 17h30 ou no fim de semana, vai
  // para as 17h30 do próximo dia útil.
  function horarioDaPergunta(cliqueMs) {
    var p = partes(cliqueMs);
    var lote = msBelem(p.ano, p.mes, p.dia, LOTE_HORA, LOTE_MINUTO);
    if (ehDiaUtil(cliqueMs) && cliqueMs < lote) return Math.min(cliqueMs + PERGUNTA_DEPOIS_MS, lote);
    var d = inicioDoDia(cliqueMs) + DIA_MS;
    while (!ehDiaUtil(d)) d += DIA_MS;
    var q = partes(d);
    return msBelem(q.ano, q.mes, q.dia, LOTE_HORA, LOTE_MINUTO);
  }

  // Horário de lembrete em que "agora" cai (9h, 13h ou 16h, seg a sex, com até
  // 1 h de folga para gatilho atrasado). null fora deles.
  function horarioDoLembrete(agoraMs) {
    if (!ehDiaUtil(agoraMs)) return null;
    var p = partes(agoraMs);
    for (var i = HORAS_LEMBRETE.length - 1; i >= 0; i--) {
      var ms = msBelem(p.ano, p.mes, p.dia, HORAS_LEMBRETE[i], 0);
      if (agoraMs >= ms && agoraMs < ms + JANELA_LEMBRETE_MS) return { chave: chaveDia(agoraMs) + '-' + HORAS_LEMBRETE[i], hora: HORAS_LEMBRETE[i], ms: ms };
    }
    return null;
  }

  // ── Pipeline e etapa ────────────────────────────────────────────────────
  function ordenados(pipelines) { return (pipelines || []).slice().sort(function (a, b) { return (a.Ordem || 0) - (b.Ordem || 0); }); }
  function pipelineDoSupervisor(pipelines) {
    var candidatos = (pipelines || []).filter(function (p) {
      return (p.Etapas || []).some(function (e) { return e.Nome === ETAPA_ENTRADA; });
    });
    var comercial = candidatos.filter(function (p) { return normalizar(p.Nome) === PIPELINE_NOME; })[0];
    var achado = comercial || candidatos[0];
    return achado ? String(achado.IdPipeline || '') : '';
  }
  // Card sem Pipeline gravado cai no primeiro pipeline (mesma regra do processFunil).
  function idPipelineDoLead(idPipeline, pipelines) {
    return String(idPipeline || (ordenados(pipelines)[0] || {}).IdPipeline || '');
  }
  function etapaConfig(idPipeline, nomeEtapa, pipelines) {
    var pipe = (pipelines || []).filter(function (p) { return String(p.IdPipeline) === String(idPipeline); })[0];
    return pipe && pipe.Etapas ? pipe.Etapas.filter(function (e) { return e.Nome === nomeEtapa; })[0] || null : null;
  }

  // A etapa está no supervisor? É o que decide se a data do próximo contato é
  // obrigatória ao mover, ao registrar conversa e ao criar o lead.
  function etapaNoSupervisor(nomeEtapa, idPipeline, pipelines) {
    var sup = pipelineDoSupervisor(pipelines);
    if (!sup || idPipelineDoLead(idPipeline, pipelines) !== sup) return false;
    if (!nomeEtapa) return false;
    var nome = normalizar(nomeEtapa);
    if (ETAPAS_FORA.some(function (e) { return normalizar(e) === nome; })) return false;
    var cfg = etapaConfig(sup, nomeEtapa, pipelines);
    return !(cfg && PAPEIS_FORA.indexOf(cfg.Papel || '') !== -1);
  }

  // ── Prazo (bolinha) ─────────────────────────────────────────────────────
  function emMs(v) {
    if (typeof v === 'number') return v;
    var t = Date.parse(v);
    return isNaN(t) ? null : t;
  }
  function ultimaAtividadeMs(atividades, tipos) {
    var best = null;
    (atividades || []).forEach(function (a) {
      if (tipos.indexOf(a && a.Tipo) === -1) return;
      var t = emMs(a.Em);
      if (t !== null && (best === null || t > best)) best = t;
    });
    return best;
  }
  // Espelho do computeDataProcesso do Funil: última entrada na etapa atual
  // (ou a criação) e a última Conversa no WhatsApp/Ligação, o que for mais novo.
  function dataProcessoMs(lead) {
    var best = null;
    (lead.transicoes || []).forEach(function (t) {
      if (String(t && t.Etapa || '').trim() !== lead.etapa) return;
      var ms = emMs(t.Em);
      if (ms !== null && (best === null || ms > best)) best = ms;
    });
    if (best === null) best = lead.criadoMs;
    var conversa = ultimaAtividadeMs(lead.atividades, TIPOS_CONVERSA);
    if (conversa !== null && (best === null || conversa > best)) best = conversa;
    return best;
  }
  // A Tentativa de Contato zera só a cor do prazo: a bolinha conta a partir
  // dela, e a data da etapa (KPIs, gráfico de movimentações) não muda.
  function tentativaZeraPrazo(atividade, modo) {
    if (!atividade || atividade.Tipo !== TIPO_TENTATIVA) return false;
    return (modo || TENTATIVA_ZERA_PRAZO) === 'todas' || atividade.Origem === ORIGEM_SUPERVISOR;
  }
  function inicioDoPrazoMs(dataProcesso, atividades, modo) {
    var tentativa = null;
    (atividades || []).forEach(function (a) {
      if (!tentativaZeraPrazo(a, modo)) return;
      var t = emMs(a.Em);
      if (t !== null && (tentativa === null || t > tentativa)) tentativa = t;
    });
    if (tentativa !== null && (dataProcesso == null || tentativa > dataProcesso)) return tentativa;
    return dataProcesso;
  }
  function vazio(v) { return v === '' || v === undefined || v === null; }
  // Mesma regra do getSLAColor: prazo vazio fica verde, 0 vira na hora.
  function corDoPrazo(dias, cfg) {
    if (!cfg) return 'green';
    if (!vazio(cfg.DiasVermelho) && dias >= cfg.DiasVermelho) return 'red';
    if (!vazio(cfg.DiasAmarelo) && dias >= cfg.DiasAmarelo) return 'yellow';
    return 'green';
  }

  // Data marcada só conta de hoje em diante: data de dia anterior que ninguém
  // tratou vale como "sem data", senão o lead nunca mais seria lembrado.
  function temDataValida(proximoContatoEm, agoraMs) {
    return typeof proximoContatoEm === 'number' && proximoContatoEm >= inicioDoDia(agoraMs);
  }

  /**
   * Lead já normalizado: { id, etapa, pipeline, idVendedor, transicoes,
   * atividades, criadoMs, proximoContatoEm }.
   */
  function situacaoDoLead(lead, pipelines, agoraMs) {
    var idPipe = idPipelineDoLead(lead.pipeline, pipelines);
    var noSupervisor = etapaNoSupervisor(lead.etapa, idPipe, pipelines);
    var inicio = inicioDoPrazoMs(dataProcessoMs(lead), lead.atividades);
    var cfg = etapaConfig(idPipe, lead.etapa, pipelines);
    var dias = inicio == null ? 0 : diasEntre(inicio, agoraMs);
    var cor = corDoPrazo(dias, cfg);
    return {
      noSupervisor: noSupervisor, cor: cor, dias: dias,
      atraso: cfg && !vazio(cfg.DiasVermelho) ? dias - cfg.DiasVermelho : 0,
      semData: !temDataValida(lead.proximoContatoEm, agoraMs)
    };
  }

  // ── Fila diária dos vermelhos sem data ──────────────────────────────────
  /**
   * Até `limite` leads por vendedor ativo, divididos entre as etapas: uma
   * rodada pega o mais vermelho de cada etapa, a próxima o segundo, e assim
   * por diante. A etapa cujo mais vermelho está mais atrasado começa a rodada.
   * Lead com pergunta da próxima data pendente fica fora: ela já pede a mesma
   * coisa. Devolve { idVendedor: [idLead, ...] } na ordem de escolha.
   */
  function montarFila(leads, pipelines, idsVendedoresAtivos, agoraMs, limite) {
    var max = limite || LIMITE_POR_VENDEDOR;
    var ativos = (idsVendedoresAtivos || []).map(String);
    var porVendedor = {};
    (leads || []).forEach(function (l) {
      var v = String(l.idVendedor || '');
      if (ativos.indexOf(v) === -1) return;
      var s = situacaoDoLead(l, pipelines, agoraMs);
      if (!s.noSupervisor || s.cor !== 'red' || !s.semData || perguntaPendente(l, pipelines, agoraMs)) return;
      var porEtapa = porVendedor[v] = porVendedor[v] || {};
      (porEtapa[l.etapa] = porEtapa[l.etapa] || []).push({ id: String(l.id), atraso: s.atraso });
    });
    var fila = {};
    Object.keys(porVendedor).forEach(function (v) {
      var grupos = Object.keys(porVendedor[v]).map(function (etapa) {
        return { etapa: etapa, itens: porVendedor[v][etapa].sort(function (a, b) { return b.atraso - a.atraso || (a.id < b.id ? -1 : 1); }) };
      }).sort(function (a, b) { return b.itens[0].atraso - a.itens[0].atraso || (a.etapa < b.etapa ? -1 : 1); });
      var escolhidos = [];
      for (var rodada = 0; escolhidos.length < max; rodada++) {
        var pegou = false;
        for (var g = 0; g < grupos.length && escolhidos.length < max; g++) {
          if (grupos[g].itens[rodada]) { escolhidos.push(grupos[g].itens[rodada].id); pegou = true; }
        }
        if (!pegou) break;
      }
      fila[v] = escolhidos;
    });
    return fila;
  }

  // ── Avisos ──────────────────────────────────────────────────────────────
  // Id do documento em notificacoes: tipo:idLead:chave. A chave é a data
  // marcada (contato), a hora da pergunta ou o dia-hora do lembrete, então
  // remarcar gera aviso novo e repetir a varredura não duplica.
  function idAviso(tipo, idLead, chave) { return tipo + ':' + idLead + ':' + chave; }
  function lerIdAviso(id) {
    var p = String(id || '').split(':');
    return p.length === 3 ? { tipo: p[0], idLead: p[1], chave: p[2] } : null;
  }

  // Contato que chega na hora: data de hoje em diante, até `antecedenciaMs` à frente.
  function contatoNaHora(lead, pipelines, agoraMs, antecedenciaMs) {
    if (!temDataValida(lead.proximoContatoEm, agoraMs)) return false;
    if (lead.proximoContatoEm > agoraMs + (antecedenciaMs || 0)) return false;
    return etapaNoSupervisor(lead.etapa, idPipelineDoLead(lead.pipeline, pipelines), pipelines);
  }

  // O aviso pendente ainda faz sentido? Se não, a varredura resolve e não reenvia.
  function avisoAindaVale(id, lead, pipelines, agoraMs) {
    var a = lerIdAviso(id);
    if (!a || !lead) return false;
    var s = situacaoDoLead(lead, pipelines, agoraMs);
    if (!s.noSupervisor) return false;
    if (a.tipo === TIPOS_AVISO.contato) return lead.proximoContatoEm === Number(a.chave);
    if (a.tipo === TIPOS_AVISO.pergunta) return s.semData;
    if (a.tipo === TIPOS_AVISO.lembrete) return a.chave.indexOf(chaveDia(agoraMs)) === 0 && s.cor === 'red' && s.semData;
    return false;
  }

  function perguntaPendente(lead, pipelines, agoraMs) {
    var a = lerIdAviso(lead.avisoId);
    return !!a && a.tipo === TIPOS_AVISO.pergunta && avisoAindaVale(lead.avisoId, lead, pipelines, agoraMs);
  }

  // Título e corpo que o vendedor vê no sininho e no push (texto interno, não vai ao cliente).
  function textoDoAviso(tipo, d) {
    var nome = primeiroNome(d.nome) || 'o cliente';
    var semTel = !d.temTelefone ? ' O cadastro está sem telefone: abra o lead e atualize antes de enviar.' : '';
    if (tipo === TIPOS_AVISO.contato) {
      return { titulo: 'Falar com ' + nome + ' hoje', corpo: (d.etapa || '') + '. A mensagem da etapa está pronta para enviar.' + semTel };
    }
    if (tipo === TIPOS_AVISO.lembrete) {
      var dias = d.atrasoDias > 0 ? ' há ' + d.atrasoDias + (d.atrasoDias === 1 ? ' dia' : ' dias') : '';
      return { titulo: nome + ' está sem próximo contato', corpo: (d.etapa || '') + ', prazo vencido' + dias + '. Envie a mensagem pronta ou marque uma data no Funil.' + semTel };
    }
    return { titulo: 'Qual a próxima data para falar com ' + nome + '?', corpo: 'Toque para marcar o próximo contato.' };
  }

  var api = {
    LIMITE_POR_VENDEDOR: LIMITE_POR_VENDEDOR, HORAS_LEMBRETE: HORAS_LEMBRETE, PERGUNTA_DEPOIS_MS: PERGUNTA_DEPOIS_MS,
    ETAPAS_FORA: ETAPAS_FORA, PAPEIS_FORA: PAPEIS_FORA, TIPO_TENTATIVA: TIPO_TENTATIVA, TIPOS_CONVERSA: TIPOS_CONVERSA,
    TENTATIVA_ZERA_PRAZO: TENTATIVA_ZERA_PRAZO, ORIGEM_SUPERVISOR: ORIGEM_SUPERVISOR, tentativaZeraPrazo: tentativaZeraPrazo,
    TIPOS_AVISO: TIPOS_AVISO,
    normalizar: normalizar, primeiroNome: primeiroNome, telefoneWa: telefoneWa,
    partes: partes, msBelem: msBelem, chaveDia: chaveDia, inicioDoDia: inicioDoDia, ehDiaUtil: ehDiaUtil,
    diasEntre: diasEntre, dataTextoMs: dataTextoMs,
    msDosCampos: msDosCampos, camposDoMs: camposDoMs, textoDataHora: textoDataHora, erroDaData: erroDaData,
    horarioDaPergunta: horarioDaPergunta, horarioDoLembrete: horarioDoLembrete,
    pipelineDoSupervisor: pipelineDoSupervisor, idPipelineDoLead: idPipelineDoLead, etapaConfig: etapaConfig,
    etapaNoSupervisor: etapaNoSupervisor,
    dataProcessoMs: dataProcessoMs, inicioDoPrazoMs: inicioDoPrazoMs, corDoPrazo: corDoPrazo,
    temDataValida: temDataValida, situacaoDoLead: situacaoDoLead, montarFila: montarFila,
    idAviso: idAviso, lerIdAviso: lerIdAviso, contatoNaHora: contatoNaHora, avisoAindaVale: avisoAindaVale, perguntaPendente: perguntaPendente,
    textoDoAviso: textoDoAviso
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SupervisorRegras = api;
})(typeof window !== 'undefined' ? window : this);
