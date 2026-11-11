(function () {
  'use strict';

  const CAMPOS_CLIENTE = {
    nome: 'expNome', cpf: 'expCpf', cidade: 'expCidade', endereco: 'expEndereco', email: 'expEmail',
    telefone: 'expTelefone', cpfEquatorial: 'expCpfEquatorial', dataNascimentoEquatorial: 'expDataNascEquatorial'
  };
  const CAMPOS_FATURA = [
    ['Cabeçalho', [
      ['distribuidora', 'Distribuidora'], ['municipio', 'Município'], ['cep', 'CEP'], ['uc', 'Unidade consumidora'],
      ['grupo', 'Grupo'], ['subgrupo', 'Subgrupo'], ['subclasse', 'Subclasse'], ['modalidade', 'Modalidade'],
      ['posto', 'Posto tarifário (tarifa branca)'], ['tipoFornecimento', 'Fornecimento'],
      ['referencia', 'Referência', 'month'], ['vencimento', 'Vencimento', 'date'], ['total', 'Total (R$)', 'n']
    ]],
    ['Medição', [
      ['dataLeituraAnterior', 'Leitura anterior', 'date'], ['dataLeituraAtual', 'Leitura atual', 'date'],
      ['consumoMedido', 'Consumo medido (kWh)', 'n'], ['consumoFaturado', 'Consumo faturado (kWh)', 'n'],
      ['injetadoNoCiclo', 'Injetado no ciclo (kWh)', 'n'], ['consumoSemCompensacao', 'Sem compensação (kWh)', 'n'],
      ['consumoCompensado', 'Compensado (kWh)', 'n']
    ]],
    ['Compensação SCEE', [
      ['regimeGD', 'Enquadramento atual'], ['regimeCreditosAntigos', 'Enquadramento dos créditos anteriores'],
      ['creditosAntigosNasLinhas', 'Créditos antigos nas linhas (kWh)', 'n'],
      ['creditosAntigosUsados', 'Créditos antigos usados (kWh)', 'n'],
      ['saldoInicialElegivel', 'Saldo inicial elegível (kWh)', 'n'],
      ['saldoDisponivel', 'Saldo atualizado (kWh)', 'n'], ['saldoAExpirar', 'A expirar (kWh)', 'n'],
      ['creditosExpirados', 'Expirados (kWh)', 'n']
    ]],
    ['Tributos e tarifas', [
      ['aliquotaICMS', 'ICMS (%)', 'n'], ['aliquotaPIS', 'PIS (%)', 'n'], ['aliquotaCofins', 'Cofins (%)', 'n'],
      ['aliquotaPisCofins', 'PIS/Cofins (%)', 'n'], ['tarifaGD2SemTributos', 'GD II sem tributos (R$/kWh)', 'n'],
      ['tarifaGD2ComTributos', 'GD II com tributos (R$/kWh)', 'n']
    ]]
  ];
  const ITENS = {
    consumo: 'Consumo', consumoCompensado: 'Consumo compensado', energiaInjetada: 'Energia injetada',
    creditoAnterior: 'Crédito de mês anterior', gd2: 'Parcela GD II', gd3: 'Parcela GD III',
    sceeBruto: 'Benefício bruto SCEE', sceeLiquido: 'Benefício líquido SCEE', bandeira: 'Bandeira',
    cip: 'CIP/Cosip', servico: 'Serviço', multa: 'Multa', juros: 'Juros',
    parcelamento: 'Parcelamento', financeiro: 'Outro item financeiro', outro: 'Outro item'
  };
  const FINANCEIROS = new Set(['cip', 'servico', 'multa', 'juros', 'parcelamento', 'financeiro']);
  const EVENTUAIS = new Set(['multa', 'juros', 'parcelamento']);
  const TIPOS_ANEXO = { Documento: 'Documento do cliente', Fatura: 'Fatura Equatorial' };
  const CENARIOS = {
    atualCom: 'Atual, com créditos anteriores', atualSem: 'Atual, sem créditos anteriores',
    recuperadaCom: 'Recuperada, com créditos anteriores', recuperadaSem: 'Recuperada, sem créditos anteriores',
    expansaoCom: 'Expansão, com créditos anteriores', expansaoSem: 'Expansão, sem créditos anteriores',
    semSolar: 'Sem solar'
  };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (n, dec = 2) => Number.isFinite(n)
    ? n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';
  const dinheiro = n => Number.isFinite(n) ? 'R$ ' + fmt(n) : '—';
  const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
  const copia = dados => JSON.parse(JSON.stringify(dados));
  const eDecimal = n => Number.isFinite(n) ? String(n).replace('.', ',') : '';

  function numero(texto) {
    const entrada = String(texto ?? '').trim().replace(/[−–]/g, '-');
    const simples = entrada.includes(',') ? entrada.replace(/\./g, '').replace(',', '.') : entrada;
    return /^-?\d+(?:\.\d+)?$/.test(simples) && Number.isFinite(Number(simples)) ? Number(simples) : null;
  }

  function checarResposta(resp, aviso) {
    if (!resp?.ok) throw new Error(resp?.erro || aviso);
    return resp;
  }

  function criar({ apiCall, getClientes, guessCidade, showToast }) {
    const $ = id => document.getElementById(id);
    const painel = $('tab-expansao');
    const campos = grupo => Array.from(painel.querySelectorAll('[data-' + grupo + ']'));
    const noCampo = (grupo, campo) => painel.querySelector('[data-' + grupo + '="' + campo + '"]');
    const sessao = () => window.SG_SESSION || {};
    const usuario = () => window.firebase?.auth().currentUser;
    const baseFatura = () => ({ origem: {}, itens: [], itensFinanceiros: [], avisosFinanceiros: [], revisada: false });
    const erros = erro => showToast(erro?.message || 'Não foi possível concluir a ação.', false);
    const locais = new Map();
    const clientesDaAba = new Map();
    let config = {};
    let catalogo = { modulos: [], inversores: [] };
    let fatura = baseFatura(), anexos = {}, modulos = [], tarifas = [], regras = [];
    let bandeiraManual = null;
    let produto = null, numeroConsulta = 0, urlAnexo = null, telhado = null, chaveTelhado = '';
    let clienteId = '', salvo = null, resultado = null, erroCalculo = '', selecionados = [];
    let liberado = false, entrou = false, ocupacao = false, visualizacao = false, recalc = false;
    let acessoPendente, comboCliente;
    let atualizaPendente = false, observacaoAnterior = '', cidadeManual = '', alterou = false;
    let produtividadeAutomatica = null, produtividadeEditada = false;
    const nomesOrigem = { lido: 'Lido', editado: 'Editado', 'não encontrado': 'Não encontrado' };

    function aviso(texto) {
      $('expAviso').textContent = texto || '';
    }

    function clientes() {
      const lista = new Map((getClientes() || []).map(c => [c.id, c]));
      for (const [id, c] of clientesDaAba) lista.set(id, c);
      return [...lista.values()];
    }

    function clienteAtual() {
      const c = { id: clienteId };
      for (const [chave, id] of Object.entries(CAMPOS_CLIENTE)) c[chave] = $(id)?.value.trim() || '';
      return c;
    }

    function preencherCliente(c = {}) {
      clienteId = c.id || '';
      comboCliente?.setValor(clienteId, c.nome || '');
      for (const [chave, id] of Object.entries(CAMPOS_CLIENTE)) {
        if ($(id)) $(id).value = c[chave] || (chave === 'cidade' ? guessCidade(c.endereco) : '') || '';
      }
    }

    function temRascunho() {
      return Boolean(clienteId || locais.size || fatura.revisada || fatura.itens.length || salvo);
    }

    function mudarCliente(id) {
      const c = clientes().find(item => item.id === id);
      const trocar = () => {
        if (id !== clienteId) {
          fatura = baseFatura();
          anexos = {};
          locais.clear();
          cidadeManual = '';
          alterou = true;
          renderFatura();
        }
        preencherCliente(c);
        renderAnexos();
        atualizarProdutividade();
      };
      if (id !== clienteId && (locais.size || Object.keys(anexos).length || fatura.itens.length || fatura.revisada)) {
        comboCliente?.setValor(clienteId, clienteAtual().nome);
        window.abrirDialogoGerador('Trocar cliente', 'Os anexos e dados da fatura serão retirados desta proposta.', 'Trocar cliente', trocar);
      } else trocar();
    }

    async function salvarCliente() {
      const c = clienteAtual();
      if (!c.nome) throw new Error('Informe o nome do cliente.');
      const existente = Boolean(c.id);
      c.id ||= window.SGId?.gerar?.() || crypto.randomUUID();
      const resp = await apiCall(existente ? 'updateCliente' : 'salvarCliente', {
        ...c, idCliente: c.id, cpfCnpj: c.cpf, statusCliente: 'Ativo',
        vendedorResponsavel: sessao().idVendedor || ''
      });
      checarResposta(resp, 'O cadastro do cliente não foi salvo.');
      clientesDaAba.set(c.id, c);
      preencherCliente(c);
      showToast('Cadastro do cliente salvo.');
    }

    function opcoesCatalogo(campo, dados, idCampo, placeholder) {
      if (!campo) return;
      const atual = campo.value;
      campo.replaceChildren(new Option(placeholder, ''));
      const opcoes = dados.map(item => ({
        id: item[idCampo], rotulo: [item.Marca, item.Modelo].filter(Boolean).join(' ')
      })).filter(item => item.id && item.rotulo).sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
      for (const item of opcoes) campo.add(new Option(item.rotulo, item.id));
      if (atual && !opcoes.some(item => item.id === atual)) campo.add(new Option('Modelo salvo na proposta', atual));
      campo.value = atual;
    }

    function produtoEscolhido() {
      const id = noCampo('expansao', 'idModulo').value;
      const item = catalogo.modulos.find(m => m.IdModulo === id);
      if (!item) return;
      noCampo('expansao', 'wp').value = item.PotenciaW || '';
      noCampo('expansao', 'alturaM').value = item.AlturaM || '';
      noCampo('expansao', 'larguraM').value = item.LarguraM || '';
    }

    function dataCampos(grupo) {
      return Object.fromEntries(campos(grupo).map(el => [
        el.dataset[grupo],
        el.type === 'checkbox' ? el.checked : (el.type === 'number' || el.inputMode === 'decimal') ? numero(el.value) : el.value.trim()
      ]));
    }

    function preencherCampos(grupo, valores) {
      for (const el of campos(grupo)) {
        const valor = valores[el.dataset[grupo]];
        if (el.type === 'checkbox') el.checked = Boolean(valor);
        else {
          if (el.tagName === 'SELECT' && valor && !Array.from(el.options).some(o => o.value === valor)) {
            el.add(new Option(String(valor), valor));
          }
          el.value = valor ?? '';
        }
      }
    }

    async function atualizarProdutividade({ preservar = false } = {}) {
      const seq = ++numeroConsulta;
      const escolha = cidadeManual;
      preservar ||= produtividadeEditada;
      if (!preservar) produto = null;
      const retorno = await window.SGExpansaoProdutividade.resolver({
        cidadeEscolhida: escolha === '__regional' ? 'Outra cidade' : escolha,
        cidadeFatura: fatura.municipio, cepFatura: fatura.cep,
        cidadeCadastro: clienteAtual().cidade,
        mesCiclo: Number((noCampo('expansao', 'referenciaFutura').value || fatura.referencia)?.slice(5, 7)),
        faixasCep: config.faixasCep || []
      });
      if (seq !== numeroConsulta) return;
      produto = retorno;
      const cidade = noCampo('expansao', 'cidade');
      cidade.replaceChildren(new Option('Identificar pela fatura', ''), new Option('Outra cidade', '__regional'));
      retorno.cidades.forEach(nome => cidade.add(new Option(nome, nome)));
      if (escolha && !Array.from(cidade.options).some(o => o.value === escolha)) cidade.add(new Option(escolha, escolha));
      cidade.value = escolha || retorno.cidade || '';
      if (!preservar && retorno.status === 'ok') {
        produtividadeAutomatica = noCampo('expansao', 'meta').value === 'ciclo'
          ? retorno.produtividadeMes || retorno.mediaMensal : retorno.mediaMensal;
        noCampo('expansao', 'produtividade').value = produtividadeAutomatica;
        noCampo('expansao', 'fonteProdutividade').value = retorno.fonte;
      } else if (!preservar) {
        noCampo('expansao', 'produtividade').value = '';
        noCampo('expansao', 'fonteProdutividade').value = '';
      }
      $('expCidadeOrigem').textContent = [retorno.origemCidade, retorno.aviso,
        retorno.produtividadeMes ? 'No mês da fatura: ' + fmt(retorno.produtividadeMes) + ' kWh/kWp.' : ''
      ].filter(Boolean).join(' · ');
      agendarResultado();
    }

    async function carregarConfig() {
      const db = window.firebase.firestore();
      const [padrao, fiob, tarifasAtuais] = await Promise.all(
        ['expansao_padrao', 'fiob_gd2', 'tarifas_equatorial_pa'].map(id => db.collection('config').doc(id).get({ source: 'server' }))
      );
      config = { ...padrao.data(), fiob: fiob.data() || {}, tarifas: tarifasAtuais.data() || {} };
    }

    async function carregarAba() {
      if (entrou) return;
      if (acessoPendente) return acessoPendente;
      acessoPendente = (async () => {
        aviso('Consultando acesso e catálogo…');
        try {
          await window.SGFireReady;
          const u = usuario();
          if (!u || u.isAnonymous) throw new Error('Entre no ERP para consultar a expansão.');
          const acesso = await window.firebase.firestore().collection('expansao_equipe').doc(u.uid).get({ source: 'server' });
          if (acesso.data()?.Ativo !== true) throw new Error('Seu acesso à Proposta de Expansão ainda não foi liberado.');
          liberado = true;
          await Promise.all([
            carregarConfig(),
            apiCall('getCatalogoProdutos').then(r => {
              catalogo = checarResposta(r, 'Não foi possível consultar o catálogo.');
              opcoesCatalogo(noCampo('expansao', 'idModulo'), catalogo.modulos, 'IdModulo', 'Selecione o módulo');
              opcoesCatalogo(noCampo('usina', 'idInversor'), catalogo.inversores, 'IdInversor', 'Selecione o inversor');
            }),
            carregarHistorico()
          ]);
          entrou = true;
          aviso('');
          atualizarProdutividade();
        } catch (e) {
          liberado = false;
          aviso(e.message);
        } finally {
          acessoPendente = null;
          atualizarModo();
        }
      })();
      return acessoPendente;
    }

    async function executar(acao) {
      if (!liberado || ocupacao) return;
      ocupacao = true;
      atualizarModo();
      try { await acao(); }
      catch (e) { erros(e); }
      finally {
        ocupacao = false;
        atualizarModo();
      }
    }

    function campoDinamico(label, attr, valor, tipo = 'text') {
      const tipoHtml = tipo === 'n' ? 'text" inputmode="decimal' : tipo;
      return '<label class="field"><span>' + esc(label) + '</span><input type="' + tipoHtml + '" ' + attr + ' value="' +
        esc(tipo === 'n' ? eDecimal(valor) : valor) + '"></label>';
    }

    function campoFatura([campo, label, tipo]) {
      const origem = nomesOrigem[fatura.origem?.[campo]] || 'Não encontrado';
      return '<label class="field"><span>' + esc(label) + ' · <small data-origem="' + campo + '">' + origem +
        '</small></span><input data-fatura="' + campo + '" type="' + (tipo === 'n' ? 'text" inputmode="decimal' : tipo || 'text') +
        '" value="' + esc(tipo === 'n' ? eDecimal(fatura[campo]) : fatura[campo]) + '"></label>';
    }

    function tipoItem(atual) {
      return Object.entries(ITENS).map(([value, label]) =>
        '<option value="' + esc(value) + '"' + (value === atual ? ' selected' : '') + '>' + esc(label) + '</option>').join('');
    }

    function renderItens() {
      const itens = $('expItensFatura');
      if (!itens) return;
      itens.innerHTML = fatura.itens.map((item, i) =>
        '<div class="exp-medida" data-linha="' + i + '"><div class="frow">' +
        '<label class="field"><span>Tipo do item</span><select data-item="tipo">' + tipoItem(item.tipo) + '</select></label>' +
        campoDinamico('Descrição', 'data-item="descricao"', item.descricao) + '</div><div class="frow tri">' +
        [['quantidade', 'Quantidade (kWh)'], ['precoComTributos', 'Preço com tributos (R$/kWh)'],
          ['tarifaSemTributos', 'Tarifa sem tributos (R$/kWh)'], ['pisCofins', 'PIS/Cofins (R$)'],
          ['icms', 'ICMS (R$)'], ['valor', 'Valor com sinal (R$)']]
          .map(([campo, label]) => campoDinamico(label, 'data-item="' + campo + '"', item[campo], 'n')).join('') +
        '</div><div class="actions-row"><label><input type="checkbox" data-item="noTotal"' +
        (item.noTotal === false ? '' : ' checked') + '> Lançado no total</label>' +
        '<button type="button" class="btn btn-secondary" data-remover-item="' + i + '">Remover item</button></div></div>').join('');
    }

    function renderFatura() {
      $('expRevisao').innerHTML = (fatura.avisos || []).map(a => '<p class="exp-copy">' + esc(a) + '</p>').join('') +
        CAMPOS_FATURA.map(([grupo, lista], i) =>
          '<details' + (i === 0 ? ' open' : '') + '><summary>' + esc(grupo) +
          '</summary><div class="frow">' + lista.map(campoFatura).join('') + '</div></details>').join('') +
        '<details><summary>Itens da fatura e lançamentos financeiros</summary><div id="expItensFatura"></div>' +
        '<button type="button" class="btn btn-secondary" data-novo-item>Adicionar item</button></details>' +
        (fatura.avisosFinanceiros || []).map(a => '<p class="exp-copy">Aviso na fatura: ' + esc(a.descricao) + '</p>').join('') +
        '<label class="exp-copy"><input id="expConfereFatura" type="checkbox"' + (fatura.revisada ? ' checked' : '') +
        '> Revisei os dados e itens da fatura</label>';
      renderItens();
    }

    function recalcularItens() {
      fatura.itensFinanceiros = fatura.itens.filter(item => FINANCEIROS.has(item.tipo) && item.noTotal !== false)
        .map(item => ({ ...item, eventual: EVENTUAIS.has(item.tipo) }));
    }

    function invalidarRevisao() {
      fatura.revisada = false;
      if ($('expConfereFatura')) $('expConfereFatura').checked = false;
    }

    function renderModulos() {
      $('expModulosAtuais').innerHTML = modulos.map((m, i) =>
        '<div class="exp-medida" data-modulo-linha="' + i + '"><div class="frow">' +
        campoDinamico('Quantidade', 'data-modulo="qtd"', m.qtd, 'n') +
        campoDinamico('Potência unitária (Wp)', 'data-modulo="wp"', m.wp, 'n') +
        '</div><div class="actions-row"><button type="button" class="btn btn-secondary" data-remover-modulo="' +
        i + '">Remover módulo</button></div></div>').join('');
    }

    function renderTarifas() {
      $('expTarifas').innerHTML = '<details><summary>Faixas de consumo, bandeira e tarifas de compensação</summary>' +
        '<p class="exp-copy">Preencha os valores da fatura ou de uma referência tarifária conferida. Informe o tamanho de cada faixa em kWh. A última faixa fica sem limite.</p>' +
        '<div id="expFaixas">' + tarifas.map((t, i) => '<div class="exp-medida" data-faixa-linha="' + i + '"><div class="frow">' +
        campoDinamico('Descrição', 'data-faixa="descricao"', t.descricao || 'Consumo') +
        campoDinamico('Tamanho da faixa (kWh)', 'data-faixa="kwhFaixa"', t.kwhFaixa, 'n') +
        campoDinamico('Preço com tributos (R$/kWh)', 'data-faixa="precoComTributos"', t.precoComTributos, 'n') +
        campoDinamico('Tarifa sem tributos (R$/kWh)', 'data-faixa="tarifaSemTributos"', t.tarifaSemTributos, 'n') +
        '</div><button type="button" class="btn btn-secondary" data-remover-faixa="' + i + '">Remover faixa</button></div>').join('') +
        '</div><button type="button" class="btn btn-secondary" data-nova-faixa>Adicionar faixa</button>' +
        campoDinamico('Bandeira revisada (R$/kWh com tributos)', 'id="expBandeiraManual"', bandeiraManual, 'n') +
        '<p class="exp-copy">Informe as rubricas por regime quando faltarem na fatura. Use sinal negativo para deduções e informe a fonte.</p>' +
        regras.map((r, i) => '<div class="exp-medida" data-regra-linha="' + i + '"><div class="frow">' +
          '<label class="field"><span>Regime</span><select data-regra="regime">' +
          ['GD I', 'GD II', 'GD III'].map(gd => '<option' + (r.regime === gd ? ' selected' : '') + '>' + gd + '</option>').join('') +
          '</select></label><label class="field"><span>Rubrica</span><select data-regra="tipo">' + tipoItem(r.tipo) +
          '</select></label>' + campoDinamico('Descrição da rubrica', 'data-regra="descricao"', r.descricao) +
          campoDinamico('Fonte', 'data-regra="fonte"', r.fonte) +
          [['valorPorKWh', 'Valor com tributos e sinal (R$/kWh)'], ['tarifaSemTributos', 'Tarifa sem tributos (R$/kWh)'],
            ['pisCofinsPorKWh', 'PIS/Cofins por kWh'], ['icmsPorKWh', 'ICMS por kWh']]
            .map(([key, label]) => campoDinamico(label, 'data-regra="' + key + '"', r[key], 'n')).join('') +
          '</div><button type="button" class="btn btn-secondary" data-remover-regra="' + i + '">Remover rubrica</button></div>').join('') +
        '<button type="button" class="btn btn-secondary" data-nova-regra>Adicionar rubrica</button></details>';
    }

    function tarifasRevisadas() {
      if (!regras.length && bandeiraManual === null) return null;
      const porRegime = {};
      for (const r of regras) {
        if (!r.fonte?.trim() || !r.descricao?.trim() || !Number.isFinite(r.valorPorKWh)) {
          throw new Error('Complete a descrição, a fonte e o valor das rubricas de compensação.');
        }
        const { regime, valorPorKWh, ...resto } = r;
        (porRegime[regime] ||= []).push({
          ...resto, valorPorKWh: Math.abs(valorPorKWh), precoComTributos: Math.abs(valorPorKWh),
          sinal: valorPorKWh < 0 ? -1 : 1, ocultarQuantidade: ['sceeBruto', 'sceeLiquido'].includes(r.tipo)
        });
      }
      return {
        porRegime,
        ...(bandeiraManual === null ? {} : { bandeiras: [{ tipo: 'bandeira', descricao: 'Bandeira tarifária', precoComTributos: bandeiraManual }] })
      };
    }

    function renderAnexos() {
      $('expAnexos').innerHTML = Object.entries(TIPOS_ANEXO).map(([tipo, label]) => {
        const anexo = anexos[tipo];
        const local = locais.get(tipo);
        const nome = local?.name || anexo?.Nome || '';
        const tamanho = local?.size || anexo?.Tamanho;
        const aceita = tipo === 'Fatura' ? '.pdf,application/pdf' : '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
        const id = 'expArquivo' + tipo;
        const url = anexo?.DriveFileId ? 'https://drive.google.com/file/d/' + encodeURIComponent(anexo.DriveFileId) + '/view' : null;
        const texto = !clienteId ? 'Selecione ou salve o cliente para anexar.' : 'Arraste ou escolha o arquivo';
        return '<div class="field" data-anexo-area="' + tipo + '"><span>' + esc(label) + '</span>' +
          '<input type="file" id="' + id + '" data-anexo="' + tipo + '" accept="' + aceita + '" hidden' +
          (!clienteId || visualizacao || (salvo?.Geracao && !recalc) ? ' disabled' : '') + '>' +
          (nome
            ? '<div class="exp-medida"><div>' + esc(nome) + ' · ' + fmt(tamanho / 1024, 0) +
              ' KB' + (!anexo ? ' · Envio pendente' : '') + '</div><div class="actions-row">' +
              '<button type="button" class="btn btn-secondary" data-ver-anexo="' + tipo + '">Ver</button>' +
              (url ? '<a class="btn btn-secondary" target="_blank" rel="noopener noreferrer" href="' + url + '">Abrir no Drive</a>' : '') +
              (!visualizacao && (!salvo?.Geracao || recalc) ? '<button type="button" class="btn btn-secondary" data-escolher-anexo="' + tipo + '">Trocar</button>' : '') +
              '</div></div>'
            : '<button type="button" class="add-svc-btn" data-escolher-anexo="' + tipo + '"' +
              (!clienteId || visualizacao || (salvo?.Geracao && !recalc) ? ' disabled' : '') + '>' + esc(texto) + '</button>') + '</div>';
      }).join('');
    }

    async function enviarArquivo(tipo, arquivo) {
      const nome = arquivo.name.toLowerCase();
      const aceito = nome.endsWith('.pdf') || (tipo === 'Documento' && /\.(jpe?g|png)$/.test(nome));
      if (!aceito || !arquivo.size || arquivo.size > 10 * 1024 * 1024) {
        throw new Error(tipo === 'Fatura' ? 'Selecione um PDF de até 10 MB.' : 'Selecione um PDF, JPG ou PNG de até 10 MB.');
      }
      if (!clienteId) throw new Error('Selecione ou salve o cliente para anexar.');
      alterou = true;
      locais.set(tipo, arquivo);
      delete anexos[tipo];
      if (tipo === 'Fatura') { fatura = baseFatura(); renderFatura(); agendarResultado(); }
      aviso('Enviando ' + TIPOS_ANEXO[tipo].toLowerCase() + ' ao Drive…');
      renderAnexos();
      try {
        anexos[tipo] = await window.SGExpansaoAnexos.enviar(clienteId, tipo, arquivo);
        showToast('Arquivo anexado no Drive.');
      } finally {
        aviso('');
        renderAnexos();
      }
    }

    async function obterAnexo(tipo) {
      if (locais.has(tipo)) return locais.get(tipo);
      if (!anexos[tipo] || !salvo?.IdPropostaExpansao) throw new Error('Anexo indisponível nesta proposta.');
      return window.SGExpansaoAnexos.baixar(salvo.IdPropostaExpansao, tipo);
    }

    async function verAnexo(tipo) {
      const blob = await obterAnexo(tipo);
      fecharAnexo();
      urlAnexo = URL.createObjectURL(blob);
      const imagem = blob.type.startsWith('image/');
      const el = document.createElement(imagem ? 'img' : 'iframe');
      if (imagem) el.alt = TIPOS_ANEXO[tipo];
      else el.title = TIPOS_ANEXO[tipo];
      el.src = urlAnexo;
      $('expAnexoTitulo').textContent = TIPOS_ANEXO[tipo];
      $('expAnexoConteudo').replaceChildren(el);
      $('expAnexoDialog').showModal();
    }

    function fecharAnexo() {
      if (urlAnexo) URL.revokeObjectURL(urlAnexo);
      urlAnexo = null;
      $('expAnexoConteudo').replaceChildren();
    }

    async function lerFatura() {
      aviso('Lendo a fatura no navegador…');
      try {
        fatura = await window.SGExpansaoFaturaLeitor.lerFatura(await obterAnexo('Fatura'));
        fatura.revisada = false;
        renderFatura();
        cidadeManual = '';
        noCampo('expansao', 'cidade').value = '';
        atualizarProdutividade();
        agendarResultado();
      } finally { aviso(''); }
    }

    function dadosCalculo({ rascunho = false } = {}) {
      const u = dataCampos('usina');
      const e = dataCampos('expansao');
      const inversorAtual = catalogo.inversores.find(i => i.IdInversor === u.idInversor);
      const fonte = window.SGExpansaoProdutividade.produtividadeManual({ valor: e.produtividade, fonte: e.fonteProdutividade });
      if (!rascunho && fonte.status !== 'ok') throw new Error('Informe a produtividade e a fonte usadas.');
      if (!rascunho && (tarifas.some((f, i) => !(f.precoComTributos >= 0 && Number.isFinite(f.precoComTributos))
          || (i < tarifas.length - 1 && !(f.kwhFaixa > 0))) || (bandeiraManual !== null && bandeiraManual < 0))) {
        throw new Error('Revise o preço, o limite das faixas e a bandeira tarifária.');
      }
      return {
        usinaAtual: { ...u, modulosAtuais: modulos, inversorAtual: inversorAtual || null,
          desempenho: u.desempenho == null ? null : u.desempenho / 100,
          desempenhoAlvo: u.desempenhoAlvo == null ? null : u.desempenhoAlvo / 100,
          prReferencia: u.prReferencia == null ? null : u.prReferencia / 100 },
        expansao: { ...e, cidadeManual, origemCidade: produto?.origemCidade || '',
          produtividade: fonte.mediaMensal ?? e.produtividade, fonteProdutividade: fonte.fonte ?? e.fonteProdutividade,
          fracaoUtil: e.fracaoUtil ?? 1, faixasConsumo: tarifas,
          tarifasRevisadas: rascunho ? null : tarifasRevisadas(),
          rubricasRevisadas: regras, bandeiraManual: bandeiraManual }
      };
    }

    function calcularAgora() {
      if (salvo?.Geracao && !recalc && salvo.Resumo?.Resultado) return salvo.Resumo.Resultado;
      const dados = dadosCalculo();
      return window.SGExpansaoProposta.calcular({
        fatura, ...dados, config, catalogo: catalogo.inversores
      });
    }

    function agendarResultado() {
      if (atualizaPendente) return;
      atualizaPendente = true;
      window.requestAnimationFrame(() => {
        atualizaPendente = false;
        try { resultado = calcularAgora(); erroCalculo = ''; }
        catch (e) { resultado = null; erroCalculo = e.message; }
        renderConferencia();
        renderResultado();
        atualizarModo();
      });
    }

    function renderConferencia() {
      const nomes = { consumoFaturado: 'Consumo faturado', creditosAntigos: 'Créditos antigos',
        totalFatura: 'Soma dos itens', beneficioScee: 'Benefício SCEE' };
      const checagens = resultado?.conferencia || window.SGExpansaoCalculo.conferirFatura(fatura);
      $('expChecagens').innerHTML = checagens.map(c => {
        const formatar = c.campo === 'totalFatura' || c.campo === 'beneficioScee' ? dinheiro : n => fmt(n) + ' kWh';
        const estado = c.ok === true ? 'Conferido' : c.ok === false
          ? 'Calculado ' + formatar(c.calculado) + ' · informado ' + formatar(c.informado) +
            ' · diferença ' + formatar(c.diferenca)
          : 'Dados pendentes';
        return '<div class="exp-ponto' + (c.ok === true ? ' exp-verde' : '') + '">' +
          esc(nomes[c.campo]) + ' · ' + esc(estado) + '</div>';
      }).join('') + (!Number.isFinite(fatura.saldoDisponivel)
        ? '<p class="exp-copy">Saldo não informado na fatura. Solicite o extrato SCEE.</p>' : '');
      const comp = resultado?.comparacaoFioB || window.SGExpansaoCalculo.compararFioB({
        inicio: fatura.dataLeituraAnterior, fim: fatura.dataLeituraAtual,
        vigencias: config.tarifas?.vigencias, subclasse: fatura.subclasse, modalidade: fatura.modalidade,
        posto: fatura.posto, percentuais: config.fiob?.percentuais, cobrado: fatura.tarifaGD2SemTributos,
        precoComTributos: fatura.tarifaGD2ComTributos, kwhCompensados: fatura.consumoCompensado
      });
      $('expFioB').innerHTML = comp.comparavel
        ? '<div class="exp-medida"><strong>Fio B cobrado × previsto</strong><span>R$ ' +
          fmt(comp.cobrado, 6) + ' × R$ ' + fmt(comp.previsto, 6) + ' por kWh</span><span>Diferença: ' +
          fmt(comp.diferencaPct, 1) + '% · ' + dinheiro(comp.diferencaReais) + ' sem tributos · ' +
          dinheiro(comp.diferencaReaisComTributos) + ' com tributos</span><span class="exp-copy">' +
          esc([...new Set((comp.fontes || []).map(v => v.resolucao).filter(Boolean))].join(' / ')) +
          ' · Lei 14.300, art. 27</span></div>'
        : '<p class="exp-copy">Fio B não comparável. ' + esc(comp.motivo || '') + '</p>';
    }

    function kpi(label, valor, detalhe = '') {
      return '<div class="perda-kpi"><div class="pk-label">' + esc(label) + '</div><div class="pk-val">' +
        esc(valor) + '</div><div class="pk-sub">' + esc(detalhe) + '</div></div>';
    }

    function medida(rotulo, valor, detalhe, classe = '') {
      return '<div class="exp-medida ' + classe + '"><span>' + esc(rotulo) + '</span><strong>' +
        esc(valor) + '</strong><span class="exp-copy">' + esc(detalhe) + '</span></div>';
    }

    function tabelaCenarios(s) {
      return '<div class="exp-table" tabindex="0" aria-label="Cenários de faturamento"><table><thead><tr>' +
        ['Cenário', 'Rede (kWh)', 'Injeção', 'Créditos usados', 'Compensado', 'Sem compensação', 'Crédito novo', 'Saldo final', 'Total']
          .map(h => '<th scope="col">' + h + '</th>').join('') +
        '</tr></thead><tbody>' + s.cenarios.map(c => '<tr><th scope="row">' + esc(CENARIOS[c.nome]) + '</th>' +
          [c.rede, c.injetado, c.creditoUsado, c.compensado, c.semCompensacao, c.creditoNovo, c.saldoFinal]
            .map(n => '<td>' + fmt(n) + '</td>').join('') + '<td>' + dinheiro(c.total) + '</td></tr>').join('') +
        '</tbody></table></div>';
    }

    function renderResultado() {
      const host = $('expResultado');
      const antigoTelhado = $('expTelhado');
      if (!resultado) {
        limparTelhado();
        host.innerHTML = '<p class="exp-help">' + esc(erroCalculo || 'Complete os dados para calcular a expansão.') + '</p>';
        renderResumo();
        return;
      }
      const { dimensionamento: d, inversor, simulacao: s, recuperacao } = resultado;
      const exp = dataCampos('expansao');
      const resumoEconomia = (titulo, r) => kpi(titulo, dinheiro(r.valor),
        dinheiro(r.contaReferencia) + ' → ' + dinheiro(r.contaExpansao));
      const qtd = n => Number.isFinite(n) ? fmt(n, 0) + ' placas' : 'Quantidade não informada';
      const modelos = (inversor?.modelos || []).map(m => [m.Marca, m.Modelo].filter(Boolean).join(' '));
      host.innerHTML = '<div class="perda-card"><h3 class="card-head">Indicadores do ciclo</h3><div class="exp-kpis">' +
        kpi('Consumo faturado', fmt(fatura.consumoFaturado) + ' kWh', 'Medido: ' + fmt(fatura.consumoMedido) + ' kWh') +
        kpi('Injetado no ciclo', fmt(fatura.injetadoNoCiclo) + ' kWh', fatura.referencia) +
        kpi('Compensado', fmt(fatura.consumoCompensado) + ' kWh', fmt(fatura.consumoSemCompensacao) + ' kWh sem compensação') +
        kpi('Créditos antigos', fmt(s.cenarios[0]?.creditoUsado) + ' kWh',
          Number.isFinite(fatura.saldoDisponivel) ? 'Saldo: ' + fmt(fatura.saldoDisponivel) + ' kWh' : 'Saldo não informado') +
        kpi('Desempenho atual', Number.isFinite(recuperacao?.desempenho) ? fmt(recuperacao.desempenho * 100) + '%' : '—',
          'Recuperação: ' + fmt(recuperacao?.recuperacaoMensal ?? 0) + ' kWh/mês') +
        kpi('Residual a cobrir', fmt(d.residual) + ' kWh', 'Geração média de referência') + '</div></div>' +
        '<div class="exp-placas">' + medida('Atual', fmt(d.kwpAtual) + ' kWp', qtd(d.placasExistentes)) +
        medida('A adicionar', fmt(d.kwpAdicional) + ' kWp', qtd(d.placasNovas) + ' × ' + fmt(exp.wp, 0) + ' Wp · ' + fmt(d.geracaoNova) + ' kWh/mês') +
        medida('Total', fmt(d.kwpTotal) + ' kWp', Number.isFinite(d.placasExistentes) ? qtd(d.placasExistentes + d.placasNovas) : 'Quantidade parcial', 'destaque') +
        '</div><div class="exp-ponto' + (inversor?.kw ? ' exp-verde' : '') + '">' +
        (inversor?.kw ? '<strong>Inversor sugerido: ' + fmt(inversor.kw, 2) + ' kW</strong> · Overload ' + fmt(inversor.overload) +
          (modelos.length ? ' · ' + esc(modelos.join(', ')) : ' · Potência de referência da configuração') :
          '<strong>Inversor sem sugestão.</strong> Confira a potência atual e o catálogo para o fornecimento.') +
        (typeof inversor?.atualSuporta === 'boolean' ? ' Inversor atual ' + (inversor.atualSuporta ? 'comporta' : 'excede o limite para') + ' a potência calculada.' : '') +
        ' A compatibilidade elétrica depende do projeto e da distribuidora.</div>' +
        '<h3 class="exp-subhead">Arranjo dos módulos</h3><div id="expTelhado"></div>' +
        '<h3 class="exp-subhead">Comparação de contas</h3>' + tabelaCenarios(s) +
        '<div class="perda-card exp-economia"><h3 class="card-head">Economia estimada</h3><div class="frow">' +
        resumoEconomia('Considerando créditos anteriores', s.economiaComCreditos) +
        resumoEconomia('Sem usar créditos anteriores', s.economiaSemCreditos) + '</div></div>' +
        '<p class="exp-help">Valor dos créditos antigos usados no ciclo: ' + dinheiro(s.valorCreditosUsados) + '.</p>' +
        (s.premissas.length ? '<ul class="exp-copy">' + s.premissas.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>' : '');
      montarTelhado(d, exp, antigoTelhado);
      renderResumo();
    }

    function limparTelhado() {
      telhado?.dispose();
      telhado = null;
      chaveTelhado = '';
    }

    function montarTelhado(d, e, anterior) {
      const dados = { placasExistentes: d.placasExistentes, placasNovas: d.placasNovas, alturaM: e.alturaM, larguraM: e.larguraM };
      const chave = JSON.stringify(dados);
      const area = $('expTelhado');
      if (chave === chaveTelhado && anterior && telhado) {
        area.replaceWith(anterior);
        return;
      }
      limparTelhado();
      chaveTelhado = chave;
      area.textContent = 'Preparando o desenho do telhado…';
      import('./expansao-telhado3d.js?v=20261111c').then(() => {
        if (!area.isConnected || chave !== chaveTelhado) return;
        area.replaceChildren();
        telhado = window.SGExpansaoTelhado3D.montar(area, dados);
      }).catch(() => {
        if (area.isConnected) area.textContent = 'Desenho do telhado indisponível.';
      });
    }

    function renderResumo() {
      const r = resultado?.resumo || {};
      $('expResumo').innerHTML = [
        ['Potência total', Number.isFinite(r.KwpTotal) ? fmt(r.KwpTotal) + ' kWp' : '—'],
        ['Placas a adicionar', fmt(r.PlacasNovas, 0)],
        ['Economia com créditos', dinheiro(r.EconomiaComCreditos)],
        ['Economia sem créditos', dinheiro(r.EconomiaSemCreditos)]
      ].map(([k, v]) => '<div class="sum-row"><span>' + k + '</span><strong class="sum-val">' + v + '</strong></div>').join('');
    }

    function renderHistorico() {
      const soma = chave => selecionados.reduce((n, item) => n + (Number(item.Resumo?.[chave]) || 0), 0);
      const tem = chave => selecionados.some(item => Number.isFinite(item.Resumo?.[chave]));
      const uid = usuario()?.uid;
      const linhas = selecionados.slice().sort((a, b) => String(b.Data).localeCompare(String(a.Data)));
      $('expHistorico').innerHTML = [
        ['Propostas', selecionados.length],
        ['Potência adicional somada', tem('KwpAdicional') ? fmt(soma('KwpAdicional')) + ' kWp' : '—'],
        ['Economia somada com créditos', tem('EconomiaComCreditos') ? dinheiro(soma('EconomiaComCreditos')) : '—']
      ].map(([k, v]) => '<div class="sum-row"><span>' + k + '</span><strong>' + v + '</strong></div>').join('') +
        (linhas.length ? linhas.map(p => '<div class="hist-item"><div class="hi-num">' + esc(p.Numero || p.IdPropostaExpansao) +
          '</div><div class="hi-nome">' + esc(p.NomeCliente || 'Cliente') +
          '</div><div class="hi-meta">' + esc(p.Data) + ' · ' + esc(p.Status) +
          '</div><div class="actions-row"><button type="button" class="btn btn-secondary" data-abrir-proposta="' +
          esc(p.IdPropostaExpansao) + '">Ver</button>' + (p.OwnerUid === uid
            ? '<button type="button" class="btn btn-secondary" data-editar-proposta="' + esc(p.IdPropostaExpansao) +
              '"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 20l4-1 12-12-3-3L5 16zM14 7l3 3"/></svg> Editar</button>'
            : '') + '</div></div>').join('') : '<p class="exp-copy">Nenhuma proposta salva.</p>');
    }

    async function carregarHistorico() {
      const r = checarResposta(await apiCall('getPropostasExpansao', {}), 'Não foi possível consultar o histórico.');
      selecionados = r.propostas || [];
      renderHistorico();
    }

    async function abrirProposta(id, editar) {
      const r = checarResposta(await apiCall('getPropostasExpansao', { id }), 'Não foi possível abrir a proposta.');
      if (!r.proposta) throw new Error('Proposta não encontrada.');
      const p = r.proposta;
      salvo = p;
      visualizacao = !editar || p.OwnerUid !== usuario()?.uid;
      recalc = false;
      locais.clear();
      anexos = p.Anexos || {};
      fatura = { ...baseFatura(), ...p.Fatura };
      modulos = p.UsinaAtual?.modulosAtuais || [];
      tarifas = p.Expansao?.faixasConsumo || [];
      regras = p.Expansao?.rubricasRevisadas || [];
      bandeiraManual = p.Expansao?.bandeiraManual ?? null;
      cidadeManual = p.Expansao?.cidadeManual || '';
      produtividadeEditada = Boolean(p.Expansao?.produtividade);
      preencherCliente(p.Resumo?.Cliente || clientes().find(c => c.id === p.IdCliente) || { id: p.IdCliente, nome: p.NomeCliente });
      preencherCampos('usina', { ...p.UsinaAtual, considerarRecuperacao: p.UsinaAtual?.considerarRecuperacao !== false,
        desempenho: p.UsinaAtual?.desempenho == null ? null : p.UsinaAtual.desempenho * 100,
        desempenhoAlvo: p.UsinaAtual?.desempenhoAlvo == null ? null : p.UsinaAtual.desempenhoAlvo * 100,
        prReferencia: p.UsinaAtual?.prReferencia == null ? null : p.UsinaAtual.prReferencia * 100 });
      preencherCampos('expansao', p.Expansao || {});
      preencherCampos('proposta', p);
      renderAnexos(); renderFatura(); renderModulos(); renderTarifas();
      agendarResultado();
      painel.scrollIntoView({ block: 'start' });
      const anterior = p.Geracao?.PercentualFioBGD2;
      const ano = Number(hoje().slice(0, 4));
      const atual = config.fiob?.percentuais?.[ano];
      const parametros = p.Geracao?.ParametrosTarifarios;
      const comparacao = parametros?.comparacaoFioB;
      const resolucaoMudou = comparacao?.comparavel && !config.tarifas?.vigencias?.some(v =>
        v.resolucao === p.Geracao.ResolucaoTarifaria && v.inicio <= hoje() && v.fim >= hoje());
      aviso(p.Geracao && ((atual != null && anterior !== atual) || resolucaoMudou)
        ? 'Há parâmetros tarifários mais recentes. A geração salva continua usando a referência original.' : '');
      $('expCidadeOrigem').textContent = p.Expansao?.origemCidade || '';
      if (!p.Geracao) atualizarProdutividade({ preservar: Boolean(p.Expansao?.produtividade) });
    }

    function propostaEntrada(calculado, p) {
      const c = clienteAtual();
      const dono = sessao();
      const dados = dadosCalculo({ rascunho: !calculado });
      return copia({
        ...p, IdCliente: c.id, NomeCliente: c.nome, IdVendedor: dono.idVendedor || '', NomeVendedor: dono.nome || '',
        Fatura: fatura, UsinaAtual: dados.usinaAtual, Expansao: dados.expansao,
        Resumo: { ...calculado?.resumo, Resultado: calculado, Cliente: c },
        Anexos: anexos, VersaoCalculo: '20261111c'
      });
    }

    function conferirGeracao(r) {
      if (!fatura.revisada) throw new Error('Confirme a revisão dos dados e dos itens da fatura.');
      if (!Number.isFinite(fatura.total) || !fatura.referencia) throw new Error('Revise a referência e o total da fatura.');
      if (!r || !Number.isFinite(r.resumo.EconomiaComCreditos) || !Number.isFinite(r.resumo.EconomiaSemCreditos)) {
        throw new Error('Complete os dados e as tarifas para calcular as duas economias.');
      }
    }

    async function salvarDados(gerar = false) {
      if (!clienteId) throw new Error('Selecione ou salve o cliente antes de salvar a proposta.');
      if (visualizacao) return salvo;
      const p = dataCampos('proposta');
      const gravado = salvo?.Geracao && !recalc;
      const novaGeracao = recalc || (!gravado && (gerar || p.Status !== 'Rascunho'));
      if (!p.Numero) {
        p.Numero = 'EXP-' + (window.SGId?.gerar?.() || crypto.randomUUID()).slice(0, 8).toUpperCase();
        noCampo('proposta', 'Numero').value = p.Numero;
      }
      p.Data ||= hoje();
      let calculado = null;
      try { calculado = calcularAgora(); } catch (e) { if (novaGeracao) throw e; }
      if (novaGeracao) conferirGeracao(calculado);
      for (const [tipo, local] of locais.entries()) {
        if (!anexos[tipo]) anexos[tipo] = await window.SGExpansaoAnexos.enviar(clienteId, tipo, local);
      }
      const entrada = gravado ? p : propostaEntrada(calculado, p);
      aviso('Salvando a proposta…');
      const resp = checarResposta(await apiCall('salvarPropostaExpansao', {
        id: salvo?.IdPropostaExpansao, proposta: entrada,
        versaoEsperada: salvo?.VersaoRegistro, gerar, recalcular: recalc,
        geracao: calculado?.geracao
      }), 'Não foi possível salvar a proposta.');
      salvo = resp.proposta || { ...salvo, ...entrada, IdPropostaExpansao: resp.id, VersaoRegistro: resp.versao, OwnerUid: usuario()?.uid };
      if (resp.novaGeracao && !resp.proposta) {
        const releitura = checarResposta(await apiCall('getPropostasExpansao', { id: resp.id }), 'A proposta foi salva. Reabra para conferir a geração.');
        if (releitura.proposta?.VersaoRegistro !== resp.versao) throw new Error('A proposta mudou em outra sessão. Reabra o registro.');
        salvo = releitura.proposta;
      }
      recalc = false;
      alterou = false;
      aviso('');
      showToast('Proposta de expansão salva.');
      renderAnexos();
      agendarResultado();
      carregarHistorico().catch(erros);
      registrarObservacao();
      return salvo;
    }

    async function registrarObservacao() {
      if (!fatura.revisada || !fatura.referencia || !fatura.subclasse || !fatura.modalidade) return;
      const u = usuario();
      if (!u) return;
      const consumo = [...new Set(fatura.itens.filter(i => i.tipo === 'consumo').map(i => i.tarifaSemTributos).filter(Number.isFinite))];
      const bandeira = [...new Set(fatura.itens.filter(i => i.tipo === 'bandeira').map(i => i.tarifaSemTributos).filter(Number.isFinite))];
      const comp = resultado?.comparacaoFioB || {};
      const dados = { referencia: fatura.referencia, subclasse: fatura.subclasse, modalidade: fatura.modalidade };
      for (const [k, v] of Object.entries({
        icmsPct: fatura.aliquotaICMS, pisPct: fatura.aliquotaPIS, cofinsPct: fatura.aliquotaCofins,
        tarifaConsumo: consumo.length === 1 ? consumo[0] : null, tarifaGD2: fatura.tarifaGD2SemTributos,
        bandeira: bandeira.length === 1 ? bandeira[0] : null,
        fioBPrevisto: comp.previsto, diferencaFioBPct: comp.diferencaPct
      })) if (Number.isFinite(v)) dados[k] = v;
      const chave = JSON.stringify(dados);
      if (observacaoAnterior === chave || Object.keys(dados).length === 3) return;
      observacaoAnterior = chave;
      try {
        checarResposta(await window.SGAuth.apiCallOficial('registrarTarifaObservada', {
          idToken: await u.getIdToken(), observacao: dados
        }), 'A observação tarifária não foi gravada.');
      } catch (e) {
        if (observacaoAnterior === chave) observacaoAnterior = '';
        showToast('A observação tarifária ficou pendente. Ela será tentada no próximo salvamento.', false);
      }
    }

    async function gerarPdf(janela) {
      try {
        const p = visualizacao || (salvo?.Geracao && !recalc && !alterou) ? salvo : await salvarDados(true);
        const r = p?.Resumo?.Resultado;
        if (!p?.Geracao || !r) throw new Error('Calcule e salve uma geração antes de imprimir.');
        const documento = p.Anexos?.Documento ? await obterAnexo('Documento') : null;
        if (!telhado) {
          await import('./expansao-telhado3d.js?v=20261111c');
          const e = p.Expansao;
          const d = r.dimensionamento;
          const area = $('expTelhado');
          if (area && !telhado) {
            area.replaceChildren();
            telhado = window.SGExpansaoTelhado3D.montar(area, {
              placasExistentes: d.placasExistentes, placasNovas: d.placasNovas, alturaM: e.alturaM, larguraM: e.larguraM
            });
          }
        }
        const imagem = await telhado?.snapshotPNG().catch(() => null);
        await window.SGExpansaoPdf.imprimir({
          cliente: p.Resumo.Cliente, fatura: p.Fatura, dimensionamento: r.dimensionamento,
          inversor: r.inversor || {}, expansao: p.Expansao, geracao: p.Geracao, simulacao: r.simulacao,
          comparacaoFioB: r.comparacaoFioB, imagemTelhado: imagem, documento,
          numeroProposta: p.Numero, vendedor: p.NomeVendedor
        }, { janela });
      } catch (e) {
        janela?.close();
        throw e;
      }
    }

    function atualizarModo() {
      const somenteLeitura = !liberado || visualizacao;
      const congelado = Boolean(salvo?.Geracao && !recalc);
      $('expFormulario').disabled = !liberado || ocupacao;
      for (const el of $('expFormulario').querySelectorAll('input,select,textarea,button')) {
        if (el.matches('[data-ver-anexo]')) continue;
        if (el.matches('[data-proposta]')) { el.disabled = somenteLeitura; continue; }
        if (el.matches('[data-anexo],[data-escolher-anexo]')) el.disabled = somenteLeitura || congelado || !clienteId;
        else if (el.id === 'expLerFatura') el.disabled = somenteLeitura || congelado || !(locais.has('Fatura') || anexos.Fatura);
        else el.disabled = somenteLeitura || congelado;
      }
      $('expNova').disabled = !liberado || ocupacao;
      $('expSalvar').disabled = somenteLeitura || ocupacao;
      $('expSalvar').textContent = ocupacao ? 'Aguarde…' : recalc ? 'Salvar recálculo' : 'Salvar';
      $('expPdf').disabled = !liberado || ocupacao || (visualizacao ? !salvo?.Geracao : !resultado);
      const autor = salvo?.OwnerUid === usuario()?.uid;
      $('expRecalcular').hidden = !salvo?.Geracao || !autor || recalc;
      $('expRecalcular').disabled = !liberado || ocupacao;
      $('expModo').textContent = !liberado ? '' : recalc ? 'Revise os dados e salve o recálculo para gerar uma nova versão.'
        : visualizacao ? 'Visualização da proposta' : congelado ? 'Parâmetros congelados na geração salva.' : '';
    }

    async function recalcular() {
      await carregarConfig();
      visualizacao = false;
      recalc = true;
      alterou = true;
      aviso('');
      renderAnexos();
      agendarResultado();
    }

    function nova() {
      numeroConsulta++;
      bandeiraManual = null;
      salvo = null; resultado = null; produto = null; erroCalculo = '';
      visualizacao = false; recalc = false; alterou = false; cidadeManual = '';
      produtividadeAutomatica = null; produtividadeEditada = false;
      locais.clear();
      fatura = baseFatura(); anexos = {}; modulos = []; tarifas = []; regras = [];
      preencherCliente();
      preencherCampos('usina', { baseDesempenho: 'geracaoPrevista', considerarRecuperacao: true });
      preencherCampos('expansao', { meta: 'recorrente', fracaoUtil: 1, regimeExpansao: 'GD II' });
      preencherCampos('proposta', { Data: hoje(), Status: 'Rascunho' });
      $('expCidadeOrigem').textContent = '';
      renderAnexos(); renderFatura(); renderModulos(); renderTarifas();
      aviso('');
      atualizarModo();
      agendarResultado();
      if (entrou) atualizarProdutividade();
    }

    function aplicarCampo(el) {
      if (Object.values(CAMPOS_CLIENTE).includes(el.id) || el.matches('[data-proposta],[data-usina],[data-expansao],[data-fatura],[data-item],[data-faixa],[data-regra],[data-modulo],[data-cliente-exp],#expBandeiraManual,#expConfereFatura')) {
        alterou = true;
      }
      if (el.hasAttribute('data-fatura')) {
        const campo = el.dataset.fatura;
        fatura[campo] = el.inputMode === 'decimal' ? numero(el.value) : el.value.trim() || null;
        fatura.origem[campo] = 'editado';
        painel.querySelector('[data-origem="' + campo + '"]').textContent = 'Editado';
        invalidarRevisao();
      }
      if (el.hasAttribute('data-item')) {
        const campo = el.dataset.item;
        const item = fatura.itens[el.closest('[data-linha]').dataset.linha];
        item[campo] = el.type === 'checkbox' ? el.checked : el.inputMode === 'decimal' ? numero(el.value) : el.value.trim();
        recalcularItens();
        invalidarRevisao();
      }
      if (el.hasAttribute('data-modulo')) modulos[el.closest('[data-modulo-linha]').dataset.moduloLinha][el.dataset.modulo] = numero(el.value);
      if (el.hasAttribute('data-faixa')) tarifas[el.closest('[data-faixa-linha]').dataset.faixaLinha][el.dataset.faixa] =
        el.inputMode === 'decimal' ? numero(el.value) : el.value.trim();
      if (el.hasAttribute('data-regra')) regras[el.closest('[data-regra-linha]').dataset.regraLinha][el.dataset.regra] =
        el.inputMode === 'decimal' ? numero(el.value) : el.value.trim();
      if (el.id === 'expBandeiraManual') bandeiraManual = numero(el.value);
      if (el.id === 'expConfereFatura') {
        fatura.revisada = el.checked;
        if (el.checked) window.requestAnimationFrame(registrarObservacao);
      }
      if (el.dataset.expansao === 'produtividade' && numero(el.value) !== produtividadeAutomatica) {
        produtividadeEditada = true;
        const fonte = noCampo('expansao', 'fonteProdutividade');
        if (fonte.value === produto?.fonte) fonte.value = '';
      }
      agendarResultado();
    }

    function novoCliente() {
      mudarCliente('');
      $('expNome').focus();
    }

    function abrirComConfirmacao(id, editar) {
      const abrir = () => executar(async () => { await abrirProposta(id, editar); alterou = false; });
      if (alterou && temRascunho()) {
        window.abrirDialogoGerador('Abrir outra proposta', 'Os dados não salvos desta proposta serão perdidos.', 'Abrir proposta', abrir);
      } else abrir();
    }

    function conectar() {
      comboCliente = window.SGCombo.criar({
        inputId: 'expSelClienteBusca', hiddenId: 'expSelCliente', dropdownId: 'expSelClienteDropdown',
        getOpcoes: () => clientes().map(c => ({ id: c.id, label: c.nome })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
        onSelecionar: mudarCliente
      });
      $('expSyncBtn').addEventListener('click', () => executar(async () => {
        await salvarCliente();
        renderAnexos();
        atualizarProdutividade();
      }));
      $('expNovoCliente').addEventListener('click', novoCliente);
      $('expLerFatura').addEventListener('click', () => executar(async () => { await lerFatura(); alterou = true; }));
      $('expSalvar').addEventListener('click', () => executar(async () => {
        try { await salvarDados(); } finally { aviso(''); }
      }));
      $('expRecalcular').addEventListener('click', () => executar(recalcular));
      $('expNova').addEventListener('click', () => {
        const mensagem = alterou && temRascunho() ? 'Os dados não salvos serão perdidos.' : 'O formulário será limpo.';
        window.abrirDialogoGerador('Nova proposta', mensagem, 'Criar proposta', nova);
      });
      $('expPdf').addEventListener('click', () => {
        if (ocupacao || !liberado) return;
        let janela;
        try { janela = window.SGExpansaoPdf.abrirJanela(); }
        catch (e) { erros(e); return; }
        executar(async () => { try { await gerarPdf(janela); } finally { aviso(''); } });
      });
      $('expAnexoDialog').addEventListener('close', fecharAnexo);

      painel.addEventListener('input', event => aplicarCampo(event.target));
      painel.addEventListener('change', event => {
        const el = event.target;
        if (el.dataset.anexo && el.files[0]) {
          executar(async () => { await enviarArquivo(el.dataset.anexo, el.files[0]); });
        }
        if (el.dataset.expansao === 'idModulo') { produtoEscolhido(); agendarResultado(); }
        if (el.dataset.expansao === 'cidade') { cidadeManual = el.value; produtividadeEditada = false; atualizarProdutividade(); }
        if (['meta', 'referenciaFutura'].includes(el.dataset.expansao)) atualizarProdutividade();
        if (el.id === 'expCidade' || ['municipio', 'cep', 'referencia'].includes(el.dataset.fatura)) atualizarProdutividade();
      });
      painel.addEventListener('dragover', event => {
        if (event.target.closest('[data-anexo-area]') && clienteId && !visualizacao && (!salvo?.Geracao || recalc)) event.preventDefault();
      });
      painel.addEventListener('drop', event => {
        const area = event.target.closest('[data-anexo-area]');
        if (!area) return;
        event.preventDefault();
        if (visualizacao || (salvo?.Geracao && !recalc) || !event.dataTransfer.files[0]) return;
        executar(() => enviarArquivo(area.dataset.anexoArea, event.dataTransfer.files[0]));
      });
      painel.addEventListener('click', event => {
        const botao = event.target.closest('button');
        if (!botao || botao.disabled || !liberado || ocupacao) return;
        const d = botao.dataset;
        if (d.escolherAnexo) $('expArquivo' + d.escolherAnexo).click();
        if (d.verAnexo) executar(() => verAnexo(d.verAnexo));
        if (d.abrirProposta) abrirComConfirmacao(d.abrirProposta, false);
        if (d.editarProposta) abrirComConfirmacao(d.editarProposta, true);
        const alterar = (lista, indice, criarItem, atualizar) => {
          if (indice == null) lista.push(criarItem);
          else lista.splice(Number(indice), 1);
          alterou = true;
          atualizar();
          agendarResultado();
        };
        if (botao.id === 'expAddModulo' || d.removerModulo != null) {
          alterar(modulos, d.removerModulo, { qtd: null, wp: null }, renderModulos);
        }
        if ('novoItem' in d || d.removerItem != null) {
          alterar(fatura.itens, d.removerItem, { tipo: 'consumo', descricao: '', noTotal: true },
            () => { recalcularItens(); renderItens(); invalidarRevisao(); });
        }
        if ('novaFaixa' in d || d.removerFaixa != null) {
          alterar(tarifas, d.removerFaixa, {}, () => { renderTarifas(); $('expTarifas').querySelector('details').open = true; });
        }
        if ('novaRegra' in d || d.removerRegra != null) {
          alterar(regras, d.removerRegra, { regime: 'GD II', tipo: 'gd2' },
            () => { renderTarifas(); $('expTarifas').querySelector('details').open = true; });
        }
      });
    }

    conectar();
    nova();
    return { abrir: carregarAba, atualizarClientes: () => {
      if (entrou && !salvo && clienteId && clientes().some(c => c.id === clienteId)) renderAnexos();
    } };
  }

  window.SGExpansaoTela = { criar };
})();
