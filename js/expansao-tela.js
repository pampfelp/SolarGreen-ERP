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
  // Campos da fatura com opções fixas: viram combo digitável. O valor é o vocabulário que o
  // cálculo e o registro de tarifas usam; o rótulo é o que o operador lê.
  const FIXOS = {
    subclasse: [['residencial', 'Residencial'], ['desconto social', 'Desconto social'], ['tarifa social', 'Tarifa social'],
      ['baixa renda', 'Baixa renda'], ['rural', 'Rural'], ['comercial', 'Comercial'], ['industrial', 'Industrial']],
    modalidade: [['convencional', 'Convencional'], ['tarifa branca', 'Tarifa branca']],
    tipoFornecimento: [['monofasico', 'Monofásico'], ['bifasico', 'Bifásico'], ['trifasico', 'Trifásico']],
    grupo: [['B', 'B (baixa tensão)'], ['A', 'A (média ou alta tensão)']],
    subgrupo: [['B1', 'B1 residencial'], ['B2', 'B2 rural'], ['B3', 'B3 demais classes'], ['B4', 'B4 iluminação pública'], ['A4', 'A4']],
    posto: [['', 'Não se aplica'], ['ponta', 'Ponta'], ['intermediario', 'Intermediário'], ['fora ponta', 'Fora ponta']],
    regimeGD: [['', 'Não informado'], ['GD I', 'GD I'], ['GD II', 'GD II'], ['GD III', 'GD III']],
    regimeCreditosAntigos: [['', 'Não informado'], ['GD I', 'GD I'], ['GD II', 'GD II'], ['GD III', 'GD III']]
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
    let produtividadeAutomatica = null, produtividadeEditada = false, editandoRefGD2 = false;
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
      const prod = numero(noCampo('expansao', 'produtividade').value);
      $('expProdutividadeInfo').textContent = prod
        ? 'Produtividade usada: ' + fmt(prod) + ' kWh por kWp ao mês' + (retorno.cidade ? ' (' + retorno.cidade + ')' : ' (média regional)') +
          '. Para trocar, abra "Avançado".'
        : 'Produtividade indisponível: informe em "Avançado" com a fonte.';
      sincronizarCombos();
      agendarResultado();
    }

    // Menu selecionável no padrão do sistema (SGCombo): cada <select data-combo> ganha o combo
    // digitável por cima e continua sendo a fonte do valor, para o resto da tela não mudar.
    const combos = new Map();

    function prepararCombos(raiz = painel) {
      for (const select of raiz.querySelectorAll('select[data-combo]')) {
        if (combos.has(select) || !select.id) continue;
        const wrap = document.createElement('div');
        wrap.className = 'combo-wrap';
        wrap.innerHTML = '<input type="text" autocomplete="off" id="' + select.id + 'Busca" placeholder="Clique e escolha">' +
          '<input type="hidden" id="' + select.id + 'Valor"><div class="combo-dropdown hidden" id="' + select.id + 'Lista"></div>';
        select.after(wrap);
        select.hidden = true;
        const rotulo = painel.querySelector('label[for="' + select.id + '"]');
        if (rotulo) rotulo.htmlFor = select.id + 'Busca';
        const entrada = wrap.querySelector('input[type=text]');
        const opcoes = () => Array.from(select.options)
          .filter(o => o.value !== '' || select.hasAttribute('data-combo-vazio')
            || (FIXOS[select.dataset.fatura] || []).some(([v]) => v === ''))
          .map(o => ({ id: o.value, label: o.text }));
        const combo = window.SGCombo.criar({
          inputId: select.id + 'Busca', hiddenId: select.id + 'Valor', dropdownId: select.id + 'Lista',
          getOpcoes: opcoes, listaInteiraAoFocar: true,
          onSelecionar: id => {
            if (select.value === id) return;
            select.value = id;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        // Texto digitado sem escolher da lista volta para a opção atual ao sair do campo.
        entrada.addEventListener('blur', () => setTimeout(() => sincronizarCombo(select), 180));
        combos.set(select, { combo, entrada });
        sincronizarCombo(select);
      }
    }

    function sincronizarCombo(select) {
      const c = combos.get(select);
      if (!c || !select.isConnected) { combos.delete(select); return; }
      c.entrada.disabled = select.disabled;
      if (document.activeElement === c.entrada) return;
      const opcao = select.selectedOptions[0];
      if (select.value === '' && !(FIXOS[select.dataset.fatura] || []).some(([v]) => v === '')) {
        c.entrada.placeholder = opcao?.text || 'Clique e escolha';
        c.combo?.setValor('', '');
        return;
      }
      c.combo?.setValor(select.value, opcao ? opcao.text : '');
    }

    function sincronizarCombos() {
      for (const select of Array.from(combos.keys())) sincronizarCombo(select);
    }

    async function carregarConfig() {
      const db = window.firebase.firestore();
      const [padrao, fiob, tarifasAtuais] = await Promise.all(
        ['expansao_padrao', 'fiob_gd2', 'tarifas_equatorial_pa'].map(id => db.collection('config').doc(id).get({ source: 'server' }))
      );
      // A referência é opcional: se a leitura falhar, a aba continua e a premissa avisa que ela falta.
      const refGD2 = await lerDocReferenciaGD2().catch(() => null);
      config = { ...padrao.data(), fiob: fiob.data() || {}, tarifas: tarifasAtuais.data() || {}, referenciaGD2: refGD2 };
    }

    async function lerDocReferenciaGD2() {
      const doc = await window.firebase.firestore().collection('expansao_referencias').doc('gd2').get({ source: 'server' });
      const d = doc.exists ? doc.data() : null;
      return d ? {
        referencia: d.Referencia, tarifaSemTributos: d.TarifaSemTributos, precoComTributos: d.PrecoComTributos,
        pisCofinsPorKWh: d.PisCofinsPorKWh ?? null, icmsPorKWh: d.IcmsPorKWh ?? null,
        subclasse: d.Subclasse ?? null, modalidade: d.Modalidade ?? null, fonte: d.Fonte, origem: d.Origem,
        atualizadoPorNome: d.AtualizadoPorNome || ''
      } : null;
    }

    const mesAno = ref => /^\d{4}-\d{2}$/.test(ref || '') ? ref.slice(5) + '/' + ref.slice(0, 4) : '—';

    function renderReferenciaGD2() {
      const host = $('expReferenciaGD2');
      if (!host) return;
      const r = config.referenciaGD2;
      if (!editandoRefGD2) {
        host.innerHTML = (r
          ? '<div class="exp-medida"><span>Fatura de ' + esc(mesAno(r.referencia)) + ' · ' + (r.origem === 'manual' ? 'editada' : 'lida') +
            '</span><strong>R$ ' + fmt(r.tarifaSemTributos, 6) + ' sem tributos · R$ ' + fmt(r.precoComTributos, 6) +
            ' com tributos, por kWh</strong><span class="exp-copy">' + esc(r.fonte) +
            (r.atualizadoPorNome ? ' · ' + esc(r.atualizadoPorNome) : '') + '</span></div>'
          : '<p class="exp-copy">Nenhuma referência salva. Ela é gravada ao salvar uma proposta cuja fatura tem a parcela GD II.</p>') +
          '<p class="exp-copy">Usada quando a fatura do cliente não tem a parcela GD II (usina em GD I ou sem compensação). ' +
          'Cada fatura nova com a parcela atualiza a referência.</p>' +
          '<button type="button" class="btn btn-secondary" data-ref-gd2="editar">' + (r ? 'Editar referência' : 'Cadastrar referência') + '</button>';
        return;
      }
      host.innerHTML = '<div class="frow">' +
        campoDinamico('Mês da fatura', 'data-ref-gd2-campo="referencia"', r?.referencia || '', 'month') +
        campoDinamico('GD II sem tributos (R$/kWh)', 'data-ref-gd2-campo="tarifaSemTributos"', r?.tarifaSemTributos, 'n') +
        campoDinamico('GD II com tributos (R$/kWh)', 'data-ref-gd2-campo="precoComTributos"', r?.precoComTributos, 'n') +
        campoDinamico('PIS/Cofins da GD II (R$/kWh)', 'data-ref-gd2-campo="pisCofinsPorKWh"', r?.pisCofinsPorKWh, 'n') +
        campoDinamico('ICMS da GD II (R$/kWh)', 'data-ref-gd2-campo="icmsPorKWh"', r?.icmsPorKWh, 'n') +
        campoDinamico('Fonte', 'data-ref-gd2-campo="fonte"', r?.origem === 'manual' ? r.fonte : '') +
        '</div><div class="actions-row"><button type="button" class="btn btn-primary" data-ref-gd2="salvar">Salvar referência</button>' +
        '<button type="button" class="btn btn-secondary" data-ref-gd2="cancelar">Cancelar</button></div>';
    }

    async function recarregarReferenciaGD2() {
      config.referenciaGD2 = await lerDocReferenciaGD2();
      renderReferenciaGD2();
      agendarResultado();
    }

    async function salvarReferenciaManual() {
      const v = campo => painel.querySelector('[data-ref-gd2-campo="' + campo + '"]')?.value ?? '';
      const referencia = {
        referencia: v('referencia'), tarifaSemTributos: numero(v('tarifaSemTributos')), precoComTributos: numero(v('precoComTributos')),
        pisCofinsPorKWh: numero(v('pisCofinsPorKWh')), icmsPorKWh: numero(v('icmsPorKWh')), fonte: v('fonte').trim()
      };
      checarResposta(await apiCall('salvarReferenciaGD2', { referencia, origem: 'manual', nomeUsuario: sessao().nome || '' }),
        'A referência GD II não foi salva.');
      editandoRefGD2 = false;
      await recarregarReferenciaGD2();
      showToast('Referência GD II salva.');
    }

    // Depois de salvar uma proposta cuja fatura revisada tem a parcela GD II, ela vira a referência das próximas.
    async function atualizarReferenciaPelaFatura(numeroProposta) {
      if (!fatura.revisada) return;
      const ref = window.SGExpansaoCalculo.referenciaGD2DaFatura(fatura);
      if (!ref) return;
      try {
        const r = checarResposta(await apiCall('salvarReferenciaGD2', {
          referencia: { ...ref, fonte: 'Fatura de ' + mesAno(ref.referencia) + ', proposta ' + numeroProposta },
          origem: 'fatura', nomeUsuario: sessao().nome || ''
        }), 'A referência GD II não foi atualizada.');
        if (r.alterada) {
          await recarregarReferenciaGD2();
          showToast('Referência GD II atualizada pela fatura de ' + mesAno(ref.referencia) + '.');
        }
      } catch (e) {
        showToast('A referência GD II não foi atualizada. ' + e.message, false);
      }
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
          aplicarModuloPadrao();
          renderReferenciaGD2();
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

    // Módulo novo por padrão (decisão do Felipe, 12/11): o mais usado nas propostas salvas;
    // sem histórico, o da configuração; sem configuração, o DMEGC 620 Wp do catálogo.
    function moduloPadrao() {
      const contagem = new Map();
      for (const p of selecionados) {
        const id = p.Expansao?.idModulo;
        if (id && catalogo.modulos.some(m => m.IdModulo === id)) contagem.set(id, (contagem.get(id) || 0) + 1);
      }
      const maisUsado = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (maisUsado) return maisUsado;
      if (config.idModuloPadrao && catalogo.modulos.some(m => m.IdModulo === config.idModuloPadrao)) return config.idModuloPadrao;
      return catalogo.modulos.find(m => /DM620M10RT-B72HST/i.test(m.Modelo || ''))?.IdModulo || '';
    }

    function aplicarModuloPadrao() {
      const campo = noCampo('expansao', 'idModulo');
      if (!campo || campo.value || salvo || visualizacao) return;
      const id = moduloPadrao();
      if (!id) return;
      campo.value = id;
      produtoEscolhido();
      sincronizarCombos();
      agendarResultado();
    }

    function campoFatura([campo, label, tipo]) {
      const origem = nomesOrigem[fatura.origem?.[campo]] || 'Não encontrado';
      if (FIXOS[campo]) {
        const atual = fatura[campo] ?? '';
        const opcoes = FIXOS[campo].slice();
        if (atual && !opcoes.some(([v]) => v === atual)) opcoes.push([atual, atual]);
        if (!opcoes.some(([v]) => v === '')) opcoes.unshift(['', 'Escolha']);
        return '<div class="field"><label for="expFatura_' + campo + '">' + esc(label) + ' · <small data-origem="' + campo + '">' +
          origem + '</small></label><select id="expFatura_' + campo + '" data-fatura="' + campo + '" data-combo>' +
          opcoes.map(([v, r]) => '<option value="' + esc(v) + '"' + (v === atual ? ' selected' : '') + '>' + esc(r) + '</option>').join('') +
          '</select></div>';
      }
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
        '<div class="field"><label for="expItemTipo' + i + '">Tipo do item</label><select id="expItemTipo' + i +
        '" data-item="tipo" data-combo>' + tipoItem(item.tipo) + '</select></div>' +
        campoDinamico('Descrição', 'data-item="descricao"', item.descricao) + '</div><div class="frow tri">' +
        [['quantidade', 'Quantidade (kWh)'], ['precoComTributos', 'Preço com tributos (R$/kWh)'],
          ['tarifaSemTributos', 'Tarifa sem tributos (R$/kWh)'], ['pisCofins', 'PIS/Cofins (R$)'],
          ['icms', 'ICMS (R$)'], ['valor', 'Valor com sinal (R$)']]
          .map(([campo, label]) => campoDinamico(label, 'data-item="' + campo + '"', item[campo], 'n')).join('') +
        '</div><div class="actions-row"><label><input type="checkbox" data-item="noTotal"' +
        (item.noTotal === false ? '' : ' checked') + '> Lançado no total</label>' +
        '<button type="button" class="btn btn-secondary" data-remover-item="' + i + '">Remover item</button></div></div>').join('');
      prepararCombos(itens);
    }

    const mesAnoRef = ref => /^\d{4}-\d{2}$/.test(ref || '') ? ref.slice(5) + '/' + ref.slice(0, 4) : '—';
    const dataBR = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.slice(8) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';

    // Os seis números que o operador compara com o PDF; o resto fica em "Ver e corrigir".
    function renderResumoFatura() {
      const lida = Number.isFinite(fatura.consumoFaturado) || fatura.itens.length > 0;
      if (!lida) {
        $('expResumoFatura').innerHTML = '<p class="exp-help">Depois de ler a fatura, os números principais aparecem aqui para conferência.</p>';
        return;
      }
      const creditos = fatura.creditosAntigosNasLinhas ?? fatura.creditosAntigosUsados;
      $('expResumoFatura').innerHTML = '<div class="exp-kpis">' +
        kpi('Referência', mesAnoRef(fatura.referencia), dataBR(fatura.dataLeituraAnterior) && dataBR(fatura.dataLeituraAtual)
          ? 'Leituras ' + dataBR(fatura.dataLeituraAnterior) + ' a ' + dataBR(fatura.dataLeituraAtual) : '') +
        kpi('Consumo faturado', fmt(fatura.consumoFaturado) + ' kWh', 'Medido: ' + fmt(fatura.consumoMedido) + ' kWh') +
        kpi('Injetado no mês', fmt(fatura.injetadoNoCiclo) + ' kWh', 'Energia que a usina mandou para a rede') +
        kpi('Compensado', fmt(fatura.consumoCompensado) + ' kWh', fmt(fatura.consumoSemCompensacao) + ' kWh pagos sem compensação') +
        kpi('Créditos antigos usados', fmt(creditos) + ' kWh', 'Sobra de meses anteriores usada nesta fatura') +
        kpi('Total da fatura', dinheiro(fatura.total), fatura.vencimento ? 'Vence em ' + dataBR(fatura.vencimento) : '') +
        '</div>';
    }

    function renderFatura() {
      renderResumoFatura();
      $('expRevisao').innerHTML = (fatura.avisos || []).map(a => '<p class="exp-copy">' + esc(a) + '</p>').join('') +
        '<details><summary>Ver e corrigir todos os campos lidos</summary>' +
        CAMPOS_FATURA.map(([grupo, lista]) => '<h3 class="exp-subhead">' + esc(grupo) + '</h3><div class="frow">' +
          lista.map(campoFatura).join('') + '</div>').join('') +
        '<h3 class="exp-subhead">Itens da fatura e lançamentos financeiros</h3><div id="expItensFatura"></div>' +
        '<button type="button" class="btn btn-secondary exp-inline" data-novo-item>Adicionar item</button></details>' +
        (fatura.avisosFinanceiros || []).map(a => '<p class="exp-copy">Aviso na fatura: ' + esc(a.descricao) + '</p>').join('') +
        '<label class="exp-confere' + (fatura.revisada ? ' ok' : '') + '"><input id="expConfereFatura" type="checkbox"' +
        (fatura.revisada ? ' checked' : '') + '><span><strong>Conferi os números com a fatura em PDF.</strong> ' +
        'Se algum estiver diferente, corrija em "Ver e corrigir todos os campos lidos" antes de marcar.</span></label>';
      renderItens();
      prepararCombos($('expRevisao'));
    }

    function recalcularItens() {
      fatura.itensFinanceiros = fatura.itens.filter(item => FINANCEIROS.has(item.tipo) && item.noTotal !== false)
        .map(item => ({ ...item, eventual: EVENTUAIS.has(item.tipo) }));
    }

    function invalidarRevisao() {
      fatura.revisada = false;
      if ($('expConfereFatura')) {
        $('expConfereFatura').checked = false;
        $('expConfereFatura').closest('.exp-confere')?.classList.remove('ok');
      }
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
      // A tabela mensal da cidade só vale enquanto a produtividade não foi editada à mão.
      const mensal = produto?.status === 'ok' && !produtividadeEditada && Array.isArray(produto.mensal) ? produto.mensal : null;
      return {
        usinaAtual: { ...u, modulosAtuais: modulos.filter(m => m.qtd > 0 && m.wp > 0), inversorAtual: inversorAtual || null,
          desempenho: u.desempenho == null ? null : u.desempenho / 100,
          desempenhoAlvo: u.desempenhoAlvo == null ? null : u.desempenhoAlvo / 100,
          prReferencia: u.prReferencia == null ? null : u.prReferencia / 100 },
        expansao: { ...e, cidadeManual, origemCidade: produto?.origemCidade || '',
          produtividade: fonte.mediaMensal ?? e.produtividade, fonteProdutividade: fonte.fonte ?? e.fonteProdutividade,
          fracaoUtil: e.fracaoUtil ?? 1, faixasConsumo: tarifas, produtividadeMensal: mensal,
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
        renderDiagnostico();
        renderResultado();
        atualizarModo();
      });
    }

    function renderConferencia() {
      const nomes = {
        consumoFaturado: 'Consumo faturado = compensado + sem compensação',
        creditosAntigos: 'Créditos antigos = compensado − injetado no mês',
        totalFatura: 'Soma dos itens = total da fatura', beneficioScee: 'Benefício SCEE = ICMS + PIS/Cofins da linha'
      };
      const lida = Number.isFinite(fatura.consumoFaturado) || fatura.itens.length > 0;
      const checagens = lida ? (resultado?.conferencia || window.SGExpansaoCalculo.conferirFatura(fatura)) : [];
      $('expChecagens').innerHTML = checagens.filter(c => c.ok !== null).map(c => {
        const formatar = c.campo === 'totalFatura' || c.campo === 'beneficioScee' ? dinheiro : n => fmt(n) + ' kWh';
        const estado = c.ok === true
          ? 'Confere' + (Math.abs(c.diferenca || 0) >= 0.005 ? ' (diferença de ' + formatar(Math.abs(c.diferenca)) + ', arredondamento)' : '')
          : 'Não confere: calculado ' + formatar(c.calculado) + ', na fatura ' + formatar(c.informado) +
            '. Confira os campos em "Ver e corrigir".';
        return '<div class="exp-ponto' + (c.ok === true ? ' exp-verde' : '') + '">' +
          esc(nomes[c.campo]) + ' · ' + esc(estado) + '</div>';
      }).join('') + (lida && fatura.consumoCompensado > 0 && !Number.isFinite(fatura.saldoDisponivel)
        ? '<p class="exp-copy">A fatura não traz o saldo de créditos que ainda resta. Ele está no extrato de créditos da Equatorial; sem ele, o cálculo usa os créditos usados neste mês como mínimo.</p>' : '');
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
        : Number.isFinite(fatura.tarifaGD2SemTributos)
          ? '<p class="exp-copy">Fio B não comparável. ' + esc(comp.motivo || '') + '</p>' : '';
    }

    function kpi(label, valor, detalhe = '') {
      return '<div class="perda-kpi"><div class="pk-label">' + esc(label) + '</div><div class="pk-val">' +
        esc(valor) + '</div><div class="pk-sub">' + esc(detalhe) + '</div></div>';
    }

    function medida(rotulo, valor, detalhe, classe = '') {
      return '<div class="exp-medida ' + classe + '"><span>' + esc(rotulo) + '</span><strong>' +
        esc(valor) + '</strong><span class="exp-copy">' + esc(detalhe) + '</span></div>';
    }

    // Só os cenários que valem para este cliente (SGExpansaoProposta.cenariosAplicaveis).
    function tabelaCenarios(s, recuperacao) {
      const linhas = window.SGExpansaoProposta.cenariosAplicaveis(s, recuperacao);
      return '<div class="exp-table" tabindex="0" aria-label="Comparação de contas"><table><thead><tr>' +
        ['Situação', 'Energia da rede (kWh)', 'Compensado (kWh)', 'Sem compensação (kWh)', 'Conta']
          .map(h => '<th scope="col">' + h + '</th>').join('') +
        '</tr></thead><tbody>' + linhas.map(c => '<tr><th scope="row">' + esc(c.rotulo) + '</th>' +
          [c.rede, c.compensado, c.semCompensacao].map(n => '<td>' + fmt(n) + '</td>').join('') +
          '<td>' + dinheiro(c.total) + '</td></tr>').join('') + '</tbody></table></div>';
    }

    // O que falta, em ordem, para chegar ao PDF. Alimenta a lista lateral, a barra de passos
    // e a mensagem do resultado enquanto ele não pode ser calculado.
    function pendencias() {
      const u = dataCampos('usina');
      const e = dataCampos('expansao');
      const kwp = modulos.reduce((s, m) => s + ((m.qtd > 0 && m.wp > 0) ? m.qtd * m.wp / 1000 : 0), 0) || u.kwpAtual || 0;
      const lida = Number.isFinite(fatura.consumoFaturado) || fatura.itens.length > 0;
      const economia = resultado && window.SGExpansaoProposta.economiaDestaque(resultado.simulacao).principal;
      return [
        { passo: 1, ok: Boolean(clienteId), texto: 'Escolher o cliente' },
        { passo: 2, ok: Boolean(locais.has('Fatura') || anexos.Fatura), texto: 'Anexar a fatura em PDF' },
        { passo: 2, ok: lida, texto: 'Clicar em Ler fatura' },
        { passo: 2, ok: Boolean(fatura.revisada), texto: 'Conferir os números e marcar a confirmação' },
        { passo: 3, ok: kwp > 0, texto: 'Informar as placas instaladas' },
        { passo: 3, ok: u.desempenho > 0, texto: 'Informar o desempenho da usina', opcional: true },
        { passo: 4, ok: e.wp > 0, texto: 'Escolher o módulo novo' },
        { passo: 4, ok: e.produtividade > 0, texto: 'Produtividade da cidade' },
        { passo: 5, ok: Number.isFinite(economia?.valor), texto: 'Ver o resultado' }
      ];
    }

    function renderProgresso() {
      const lista = pendencias();
      const obrigatorias = lista.filter(i => !i.opcional);
      const proxima = obrigatorias.find(i => !i.ok);
      const nomes = ['Cliente', 'Fatura', 'Usina atual', 'Expansão', 'Resultado e PDF'];
      const alvo = ['expClienteCard', 'expPasso2', 'expPasso3', 'expPasso4', 'expPasso5'];
      $('expPassos').innerHTML = nomes.map((nome, i) => {
        const doPasso = obrigatorias.filter(p => p.passo === i + 1);
        const estado = doPasso.every(p => p.ok) ? 'feito' : proxima?.passo === i + 1 ? 'atual' : '';
        return '<button type="button" class="' + estado + '" data-ir-passo="' + alvo[i] + '"><span class="exp-num">' +
          (estado === 'feito' ? '✓' : i + 1) + '</span>' + esc(nome) + '</button>';
      }).join('');
      $('expFalta').innerHTML = (salvo?.Geracao && !recalc
        ? '<div class="pronto">Proposta gerada. Use Gerar PDF para imprimir de novo.</div>'
        : proxima ? '<div class="proximo">Próximo: ' + esc(proxima.texto) + ' (passo ' + proxima.passo + ')</div>'
          : '<div class="pronto">Tudo pronto. Clique em Gerar PDF.</div>') +
        lista.map(i => '<div class="item' + (i.ok ? ' ok' : '') + '">' + esc(i.texto) + (i.opcional ? ' (opcional)' : '') + '</div>').join('');
      return proxima;
    }

    // Passo 3: o desempenho vale para as datas de leitura da fatura; a tela diz se a usina
    // está gerando o esperado e quanto falta.
    function renderDiagnostico() {
      const inicio = dataBR(fatura.dataLeituraAnterior), fim = dataBR(fatura.dataLeituraAtual);
      $('expDesempenhoRotulo').textContent = inicio && fim
        ? 'Desempenho da usina de ' + inicio + ' a ' + fim + ' (%)' : 'Desempenho da usina no período da fatura (%)';
      const r = resultado?.recuperacao;
      const u = dataCampos('usina');
      let html = '';
      if (r && Number.isFinite(r.desempenho)) {
        const pct = fmt(r.desempenho * 100, 0) + '%';
        html = r.recuperacaoMensal > 0.005
          ? '<div class="exp-ponto">Está gerando ' + pct + ' do esperado' + (r.fonte === 'periodo da fatura' ? ' no período da fatura' : '') +
            '. Faltaram ' + fmt(r.recuperacao, 0) + ' kWh; a proposta soma ' + fmt(r.recuperacaoMensal, 0) +
            ' kWh/mês de recuperação da usina atual.</div>'
          : '<div class="exp-ponto exp-verde">Está gerando o que deveria (' + pct + ' do esperado).</div>';
      } else if (u.desempenho > 0) {
        html = '<p class="exp-copy">Para avaliar o desempenho, informe as placas instaladas e leia a fatura.</p>';
      }
      $('expDiagnostico').innerHTML = html;
      const atual = resultado?.regimeAtual;
      $('expRegimeInfo').textContent = resultado
        ? 'Enquadramento: usina atual ' + (atual || 'não identificado na fatura, considerado ' + (resultado.regimeExpansao || 'GD II')) +
          (u.regimeAtual ? ' (informado)' : atual ? ' (lido da fatura)' : '') +
          ' · placas novas ' + (resultado.regimeExpansao || 'GD II') + ' (ligações a partir de 2023).'
        : '';
    }

    function renderResultado() {
      const host = $('expResultado');
      const antigoTelhado = $('expTelhado');
      const proxima = renderProgresso();
      if (!resultado) {
        limparTelhado();
        host.innerHTML = '<p class="exp-help">' + (proxima
          ? 'Para calcular, falta: <strong>' + esc(proxima.texto) + '</strong> (passo ' + proxima.passo + ').'
          : esc(erroCalculo || 'Complete os dados para calcular a expansão.')) + '</p>' +
          (proxima && erroCalculo ? '<p class="exp-copy">' + esc(erroCalculo) + '</p>' : '');
        renderResumo();
        return;
      }
      const { dimensionamento: d, inversor, simulacao: s, recuperacao } = resultado;
      const exp = dataCampos('expansao');
      const destaque = window.SGExpansaoProposta.economiaDestaque(s);
      const modelos = (inversor?.modelos || []).map(m => [m.Marca, m.Modelo].filter(Boolean).join(' '));
      const listaModelos = modelos.slice(0, 6).join(', ') + (modelos.length > 6 ? ' e mais ' + (modelos.length - 6) : '');
      const p = destaque.principal || {};
      host.innerHTML = '<div class="perda-card exp-destaques-card"><div class="exp-destaques">' +
        kpi('Adicionar', fmt(d.placasNovas, 0) + ' placas', fmt(exp.wp, 0) + ' Wp cada · ' + fmt(d.kwpAdicional) +
          ' kWp · total da usina ' + fmt(d.kwpTotal) + ' kWp') +
        kpi('Inversor sugerido', inversor?.kw ? fmt(inversor.kw, 0) + ' kW' : 'Sem sugestão',
          inversor?.kw ? 'Overload ' + fmt(inversor.overload) + (modelos.length ? ' · ' + modelos.length + ' modelos no catálogo' : '')
            : 'Nenhum modelo do catálogo serve para este fornecimento') +
        kpi('Economia por mês', dinheiro(p.valor), dinheiro(p.contaReferencia) + ' → ' + dinheiro(p.contaExpansao)) +
        '</div></div>' +
        (destaque.contaDeHoje ? '<p class="exp-help">A fatura usou créditos antigos. Comparado com a conta de hoje (' +
          dinheiro(destaque.contaDeHoje.contaReferencia) + '), a economia é de ' + dinheiro(destaque.contaDeHoje.valor) +
          '. Quando os créditos acabarem, a diferença passa a ser a de cima.</p>' : '') +
        (inversor?.kw && modelos.length ? '<p class="exp-copy">Modelos de ' + fmt(inversor.kw, 0) + ' kW: ' + esc(listaModelos) + '.' +
          (typeof inversor.atualSuporta === 'boolean' ? ' O inversor instalado ' + (inversor.atualSuporta ? 'comporta' : 'não comporta') +
            ' a potência total.' : '') + ' A compatibilidade elétrica depende do projeto e da distribuidora.</p>' : '') +
        '<h3 class="exp-subhead">Arranjo dos módulos</h3><div id="expTelhado"></div>' +
        '<h3 class="exp-subhead">Comparação de contas</h3>' + tabelaCenarios(s, recuperacao) +
        (s.premissas.length ? '<details><summary>Premissas do cálculo (' + s.premissas.length + ')</summary><ul class="exp-copy">' +
          s.premissas.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></details>' : '');
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
      const destaque = resultado ? window.SGExpansaoProposta.economiaDestaque(resultado.simulacao) : {};
      $('expResumo').innerHTML = [
        ['Placas a adicionar', fmt(r.PlacasNovas, 0)],
        ['Potência total', Number.isFinite(r.KwpTotal) ? fmt(r.KwpTotal) + ' kWp' : '—'],
        ['Inversor sugerido', Number.isFinite(r.InversorSugeridoKW) ? fmt(r.InversorSugeridoKW, 0) + ' kW' : '—'],
        ['Economia por mês', dinheiro(destaque.principal?.valor)],
        ...(destaque.contaDeHoje ? [['Comparado à conta de hoje', dinheiro(destaque.contaDeHoje.valor)]] : [])
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
      atualizarReferenciaPelaFatura(salvo.Numero || p.Numero);
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
          comparacaoFioB: r.comparacaoFioB, recuperacao: r.recuperacao, imagemTelhado: imagem, documento,
          numeroProposta: p.Numero, vendedor: p.NomeVendedor
        }, { janela });
      } catch (e) {
        janela?.close();
        throw e;
      }
    }

    function atualizarModo() {
      queueMicrotask(sincronizarCombos);
      const somenteLeitura = !liberado || visualizacao;
      const congelado = Boolean(salvo?.Geracao && !recalc);
      $('expFormulario').disabled = !liberado || ocupacao;
      for (const el of $('expFormulario').querySelectorAll('input,select,textarea,button')) {
        if (el.matches('[data-ver-anexo]')) continue;
        // A referência GD II vale para todas as propostas; não depende da proposta aberta estar congelada.
        if (el.matches('[data-ref-gd2],[data-ref-gd2-campo]')) { el.disabled = !liberado; continue; }
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
      fatura = baseFatura(); anexos = {}; modulos = [{ qtd: null, wp: null }]; tarifas = []; regras = [];
      preencherCliente();
      preencherCampos('usina', { baseDesempenho: 'geracaoPrevista', considerarRecuperacao: true });
      preencherCampos('expansao', { meta: 'recorrente', fracaoUtil: 1, regimeExpansao: 'GD II' });
      preencherCampos('proposta', { Data: hoje(), Status: 'Rascunho' });
      $('expCidadeOrigem').textContent = '';
      renderAnexos(); renderFatura(); renderModulos(); renderTarifas();
      aviso('');
      atualizarModo();
      agendarResultado();
      if (entrou) { atualizarProdutividade(); aplicarModuloPadrao(); }
    }

    function aplicarCampo(el) {
      if (Object.values(CAMPOS_CLIENTE).includes(el.id) || el.matches('[data-proposta],[data-usina],[data-expansao],[data-fatura],[data-item],[data-faixa],[data-regra],[data-modulo],[data-cliente-exp],#expBandeiraManual,#expConfereFatura')) {
        alterou = true;
      }
      if (el.hasAttribute('data-fatura')) {
        const campo = el.dataset.fatura;
        fatura[campo] = el.inputMode === 'decimal' ? numero(el.value) : el.value.trim() || null;
        fatura.origem[campo] = 'editado';
        renderResumoFatura();
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
        el.closest('.exp-confere')?.classList.toggle('ok', el.checked);
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
        if (el.dataset.expansao === 'meta') $('expResidualCampo').hidden = el.value !== 'residual';
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
        if (d.irPasso) $(d.irPasso)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (d.refGd2 === 'editar' || d.refGd2 === 'cancelar') {
          editandoRefGD2 = d.refGd2 === 'editar';
          renderReferenciaGD2();
          atualizarModo();
        }
        if (d.refGd2 === 'salvar') executar(salvarReferenciaManual);
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
    prepararCombos();
    nova();
    return { abrir: carregarAba, atualizarClientes: () => {
      if (entrou && !salvo && clienteId && clientes().some(c => c.id === clienteId)) renderAnexos();
    } };
  }

  window.SGExpansaoTela = { criar };
})();
