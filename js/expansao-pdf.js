(function (root) {
  'use strict';

  const AUSENTE = 'Não informado';
  const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const aliquota = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
  const formatos = [0, 1, 2, 6].reduce((resultado, casas) => {
    resultado[casas] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    return resultado;
  }, {});
  const cenarios = {
    atualCom: 'Usina atual · com créditos anteriores',
    atualSem: 'Usina atual · sem créditos anteriores',
    recuperadaCom: 'Usina recuperada · com créditos anteriores',
    recuperadaSem: 'Usina recuperada · sem créditos anteriores',
    expansaoCom: 'Recuperada + expansão · com créditos anteriores',
    expansaoSem: 'Recuperada + expansão · sem créditos anteriores',
    semSolar: 'Referência sem solar'
  };
  const css = '@page{size:A4;margin:15mm 14mm 21mm}' +
    '*{box-sizing:border-box}body{color:#1e1e1e;font:10pt/1.4 Arial,sans-serif;margin:0}main{width:100%}' +
    '.folha{padding-bottom:7mm}.folha+.folha{break-before:page}.marca{color:#003122;font-weight:700;border-bottom:2pt solid #78a527;padding-bottom:3mm;margin:0 0 7mm}' +
    'h1,h2,h3{color:#003122;margin:0 0 4mm;break-after:avoid}h1{font-size:23pt}h2{font-size:17pt}h3{font-size:11pt;margin-top:5mm}' +
    'p{margin:2mm 0}.grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:8mm}.grupo{margin:0 0 4mm;break-inside:avoid}' +
    'dt{color:#42564b;font-size:9pt}dd{margin:0;font-weight:700;overflow-wrap:anywhere}.potencias{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin-bottom:5mm}' +
    '.potencias div{background:#f2f7f2;border:1pt solid #dde8dd;padding:3mm;break-inside:avoid}.potencias strong{display:block;font-size:16pt;color:#003122}' +
    'table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5pt;margin:2mm 0 4mm}' +
    'thead{display:table-header-group}tr{break-inside:avoid}th,td{border-bottom:1px solid #d9e3db;padding:2mm 1.1mm;text-align:right;vertical-align:top;overflow-wrap:anywhere}' +
    'th{color:#003122;background:#edf4ed}th:first-child,td:first-child{text-align:left;width:31%}.financeiro th,.total th,.total td{font-weight:700;background:#edf4ed}' +
    'figure{margin:3mm 0;text-align:center}img{max-width:100%;max-height:217mm;object-fit:contain}.telhado img{max-height:175mm}' +
    '.comparacao{break-inside:avoid}.comparacao td:first-child{width:auto}.lembrete{color:#42564b;font-size:8.5pt}.anexo{break-inside:avoid}' +
    'footer{border-top:1px solid #d9e3db;padding-top:2mm;font-size:8pt;color:#42564b;text-align:center}' +
    '@media screen{tfoot{display:none}body{max-width:210mm;margin:8mm auto;padding:0 14mm}.folha{margin:0 0 12mm}.folha+.folha{border-top:1px solid #d9e3db;padding-top:5mm}}' +
    '@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}footer{position:fixed;bottom:0;left:0;right:0}tfoot td{height:7mm;padding:0;border:0}}';

  function esc(valor) {
    return String(valor ?? AUSENTE).replace(/[&<>"']/g, letra => ({ '&': '&amp;', '<': '&lt;',
      '>': '&gt;', '"': '&quot;', "'": '&#39;' }[letra]));
  }

  function numero(valor, casas = 2, unidade = '') {
    return Number.isFinite(valor) ? formatos[casas].format(valor) + unidade : AUSENTE;
  }

  function reais(valor) {
    return Number.isFinite(valor) ? moeda.format(valor) : AUSENTE;
  }

  function percentual(valor, comparacao = false) {
    if (comparacao) return numero(valor, 1, '%');
    return Number.isFinite(valor) ? aliquota.format(valor) + '%' : AUSENTE;
  }

  function data(valor, hora = false) {
    if (!valor) return AUSENTE;
    if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      return valor.split('-').reverse().join('/');
    }
    const d = typeof valor.toDate === 'function' ? valor.toDate()
      : Number.isFinite(valor.seconds) ? new Date(valor.seconds * 1000) : new Date(valor);
    if (!Number.isFinite(d.getTime())) return AUSENTE;
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Belem', dateStyle: 'short', ...(hora ? { timeStyle: 'short' } : {})
    }).format(d);
  }

  function vigencia(g) {
    return g.VigenciaInicio && g.VigenciaFim ? data(g.VigenciaInicio) + ' a ' + data(g.VigenciaFim) : AUSENTE;
  }

  function grupos(pares) {
    return '<dl class="grade">' + pares.map(([rotulo, valor]) => '<div class="grupo"><dt>' + esc(rotulo) +
      '</dt><dd>' + esc(valor === '' ? AUSENTE : valor) + '</dd></div>').join('') + '</dl>';
  }

  function secao(titulo, conteudo, classe = '') {
    return '<section class="folha ' + classe + '"><p class="marca">Solar Green Suporte · Proposta de Expansão</p>' +
      '<h2>' + titulo + '</h2>' + conteudo + '</section>';
  }

  function imagemLocal(url) {
    return typeof url === 'string' && /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(url);
  }

  function linhaFatura(item) {
    const campos = [item.quantidade, item.precoComTributos, item.tarifaSemTributos, item.pisCofins, item.icms, item.valor];
    return '<tr><td>' + esc(item.descricao) + '</td>' + campos.map((v, i) => '<td>' +
      (Number.isFinite(v) ? esc(numero(v, i === 1 || i === 2 ? 6 : 2)) : '—') + '</td>').join('') + '</tr>';
  }

  function tabelaFatura(itens, total, financeirosDaFatura) {
    const incluidos = (itens || []).filter(item => item.noTotal !== false);
    const cabecalho = '<thead><tr><th>Itens da fatura</th><th>Quant.<br>(kWh)</th>' +
      '<th>Preço c/ tributos<br>(R$/kWh)</th><th>Tarifa s/ tributos<br>(R$/kWh)</th><th>PIS/Cofins<br>(R$)</th>' +
      '<th>ICMS<br>(R$)</th><th>Valor<br>(R$)</th></tr></thead>';
    const eFinanceiro = item => financeirosDaFatura && (financeiro(item) || financeirosDaFatura.some(original =>
      original.descricao === item.descricao && original.valor === item.valor));
    const linhas = incluidos.filter(item => !eFinanceiro(item));
    const financeiros = incluidos.filter(eFinanceiro);
    const corpo = linhas.map(linhaFatura).join('') + (financeiros.length
      ? '<tr class="financeiro"><th colspan="7">Itens financeiros</th></tr>' + financeiros.map(linhaFatura).join('') : '');
    return '<table>' + cabecalho + '<tbody>' + (corpo || '<tr><td colspan="7">Itens não informados.</td></tr>') +
      '<tr class="total"><th colspan="6">Total a pagar</th><td>' + esc(reais(total)) + '</td></tr></tbody><tfoot><tr><td colspan="7"></td></tr></tfoot></table>';
  }

  function financeiro(item) {
    return ['sceeLiquido', 'financeiro', 'cip'].includes(item.tipo) || item.eventual === true || item.financeiro === true;
  }

  function quadroFioB(c, referencia) {
    const anos = [...new Set((c.fontes || []).map(fonte => fonte.ano))];
    const ano = anos[0] ?? Number(referencia?.slice(0, 4));
    if (c.homologada !== true || c.comparavel !== true || !Number.isFinite(c.diferencaPct) ||
        Math.abs(c.diferencaPct) <= 1 || anos.length > 1 || !Number.isInteger(ano) || ano < 2023) return '';
    const acima = c.diferencaPct > 0;
    const diferenca = percentual(Math.abs(c.diferencaPct), true);
    const frase = 'O Fio B cobrado nesta fatura está ' + diferenca + ' ' + (acima ? 'acima' : 'abaixo') +
      ' do previsto na Lei 14.300 para ' + ano;
    const base = c.fontes?.length === 1 ? c.fontes[0] : null;
    const detalhes = base ? ' (' + percentual(base.percentual * 100) + ' de ' + numero(base.tarifa, 6) + ')' : '';
    const linhas = [
      ['Fio B cobrado nesta fatura (GD II)', numero(c.cobrado, 6)],
      ['Previsto pela Lei 14.300 em ' + ano + detalhes, numero(c.previsto, 6)],
      ['Diferença', (acima ? '+' : '-') + diferenca]
    ];
    return '<div class="comparacao"><h3>Fio B cobrado × previsto em lei</h3><table><thead><tr><th></th><th>R$/kWh</th></tr></thead><tbody>' +
      linhas.map(([titulo, v]) => '<tr><td>' + esc(titulo) + '</td><td>' + esc(v) + '</td></tr>').join('') +
      '</tbody></table><p>' + esc(frase) + '</p></div>';
  }

  function tabelaCenarios(simulacao) {
    const linhas = (simulacao.cenarios || []).map(c => '<tr><td>' + esc(cenarios[c.nome] || c.nome) + '</td>' +
      [c.rede, c.injetado, c.creditoUsado, c.compensado, c.semCompensacao, c.saldoFinal].map(v =>
        '<td>' + esc(numero(v)) + '</td>').join('') + '<td>' + esc(reais(c.total)) + '</td></tr>').join('');
    const economia = (titulo, e = {}) => '<tr><td>' + titulo + '</td><td>' + esc(reais(e.contaReferencia)) +
      '</td><td>' + esc(reais(e.contaExpansao)) + '</td><td><strong>' + esc(reais(e.valor)) + '</strong></td></tr>';
    return '<table><thead><tr><th>Cenário</th><th>Rede<br>(kWh)</th><th>Injeção<br>(kWh)</th><th>Créditos usados<br>(kWh)</th>' +
      '<th>Compensado<br>(kWh)</th><th>Sem compensação<br>(kWh)</th><th>Saldo final<br>(kWh)</th><th>Conta<br>(R$)</th></tr></thead><tbody>' +
      (linhas || '<tr><td colspan="8">Cenários não informados.</td></tr>') + '</tbody></table>' +
      '<h3>Economia estimada</h3><table><thead><tr><th>Comparação</th><th>Conta de referência</th><th>Conta com expansão</th>' +
      '<th>Economia</th></tr></thead><tbody>' + economia('Considerando créditos anteriores', simulacao.economiaComCreditos) +
      economia('Sem usar créditos anteriores', simulacao.economiaSemCreditos) + '</tbody></table>';
  }

  function montarHtml(model = {}, { paginasDocumento = [] } = {}) {
    const { cliente = {}, fatura = {}, dimensionamento: d = {}, inversor = {}, expansao = {}, geracao: g = {},
      simulacao = {}, comparacaoFioB = {}, imagemTelhado, numeroProposta, vendedor } = model;
    const percentualFioB = percentual(Number.isFinite(g.PercentualFioBGD2)
      ? g.PercentualFioBGD2 * (g.PercentualFioBGD2 <= 1 ? 100 : 1) : null);
    const rodape = 'Gerado em ' + data(g.DataGeracao) + ' · Fio B GD II: ' + percentualFioB + ' (' + (g.AnoFioB ?? AUSENTE) +
      ') · Tarifas: ' + (g.ResolucaoTarifaria || AUSENTE) + ', ' + vigencia(g);
    const identificacao = secao('Cliente', grupos([
      ['Nome', cliente.Nome ?? cliente.nome], ['CPF / CNPJ', cliente['CPF ou CNPJ'] ?? cliente.CPF ?? cliente.cpf ?? cliente.cpfCnpj],
      ['Telefone', cliente.Telefone ?? cliente.telefone], ['E-mail', cliente.Email ?? cliente.email],
      ['Endereço', cliente.Endereco ?? cliente.endereco], ['Cidade', cliente.Cidade ?? cliente.cidade],
      ['CPF do titular Equatorial', cliente.CPFEquatorial ?? cliente.cpfEquatorial],
      ['Nascimento do titular Equatorial', cliente.DataNascimentoEquatorial ?? cliente.dataNascimentoEquatorial],
      ['Unidade consumidora', fatura.uc], ['Referência da fatura', fatura.referencia],
      ['Proposta', numeroProposta], ['Vendedor', vendedor], ['Geração (Belém)', data(g.DataGeracao, true)]
    ]) + '<h3>Parâmetros tarifários</h3>' + grupos([
      ['Ano do ciclo', g.AnoFioB], ['Percentual Fio B GD II', percentualFioB],
      ['Fonte do percentual Fio B', g.FonteFioBPercentual], ['Tarifa Fio B', numero(g.TarifaFioB, 6, ' R$/kWh')],
      ['Resolução', g.ResolucaoTarifaria], ['Vigência', vigencia(g)],
      ['ICMS', percentual(g.AliquotaICMS)], ['PIS', percentual(g.AliquotaPIS)],
      ['Cofins', percentual(g.AliquotaCofins)], ['Origem dos tributos',
        typeof g.OrigemTributos === 'object' && g.OrigemTributos
          ? Object.entries(g.OrigemTributos).map(([nome, fonte]) => nome + ' · ' + fonte).join(' / ') : g.OrigemTributos]
    ]));
    const potencia = (titulo, kwp) => '<div>' + titulo + '<strong>' + esc(numero(kwp, 2, ' kWp')) + '</strong></div>';
    const resumo = secao('Resumo da expansão', '<div class="potencias">' + potencia('Atual', d.kwpAtual) +
      potencia('A adicionar', d.kwpAdicional) + potencia('Total', d.kwpTotal) + '</div>' + grupos([
      ['Placas existentes', numero(d.placasExistentes, 0)], ['Placas novas', numero(d.placasNovas, 0)],
      ['Inversor sugerido', numero(inversor.kw, 2, ' kW')], ['Cidade', expansao.Cidade ?? expansao.cidade],
      ['Produtividade', numero(expansao.Produtividade ?? expansao.produtividade, 2, ' kWh/kWp/mês')],
      ['Geração nova', numero(d.geracaoNova, 2, ' kWh/mês')]
    ]));
    const telhado = secao('Telhado 3D', imagemLocal(imagemTelhado) ? '<figure class="telhado"><img alt="Arranjo ilustrativo dos módulos" src="' +
      imagemTelhado + '"><figcaption>' + esc(numero(d.placasExistentes, 0)) + ' existentes · ' + esc(numero(d.placasNovas, 0)) +
      ' a adicionar · Desenho ilustrativo</figcaption></figure>' : '<p>Ilustração indisponível.</p>');
    const simulada = (simulacao.cenarios || []).find(c => c.nome === 'expansaoCom') || {};
    const partes = [
      identificacao, resumo, telhado,
      secao('Fatura atual', tabelaFatura(fatura.itens, fatura.total) + quadroFioB(comparacaoFioB, fatura.referencia)),
      secao('Fatura simulada', tabelaFatura(simulada.linhas, simulada.total, fatura.itensFinanceiros || [])),
      secao('Cenários e economia', tabelaCenarios(simulacao))
    ];
    const paginas = paginasDocumento.filter(imagemLocal);
    if (!paginas.length) partes.push(secao('Documento do cliente anexado', '<p>Documento não informado.</p>'));
    paginas.forEach((img, i) => partes.push(secao('Documento do cliente anexado',
      '<figure><img alt="Documento do cliente, página ' + (i + 1) + '" src="' + img + '"></figure>', 'anexo')));
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Proposta de Expansão' +
      (numeroProposta ? ' · ' + esc(numeroProposta) : '') + '</title><style>' + css + '</style></head><body><main>' +
      partes.join('') + '</main><footer>' + esc(rodape) + '</footer></body></html>';
  }

  function abrirJanela() {
    const janela = root.open('', '_blank');
    if (!janela) throw new Error('Permita a abertura da janela de impressão para gerar a proposta.');
    janela.opener = null;
    return janela;
  }

  function imagemDoBlob(blob) {
    return new Promise((resolve, reject) => {
      const leitor = new root.FileReader();
      leitor.onload = () => imagemLocal(leitor.result) ? resolve(leitor.result) : reject(new Error('Imagem do documento inválida.'));
      leitor.onerror = () => reject(new Error('Não foi possível ler a imagem do documento.'));
      leitor.readAsDataURL(blob);
    });
  }

  async function renderizarDocumento(blob) {
    if (!blob) return [];
    if (blob.type === 'image/png' || blob.type === 'image/jpeg') return [await imagemDoBlob(blob)];
    if (blob.type !== 'application/pdf') throw new Error('Use um documento em PDF, JPG ou PNG.');
    const pdfjs = await root.SGExpansaoFaturaLeitor.carregarPdfJs();
    const tarefa = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false });
    try {
      const pdf = await tarefa.promise;
      const imagens = [];
      const canvas = root.document.createElement('canvas');
      for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const original = pagina.getViewport({ scale: 1 });
        const viewport = pagina.getViewport({ scale: Math.min(1550 / original.width, 2100 / original.height) });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await pagina.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
        imagens.push(canvas.toDataURL('image/jpeg', 0.92));
        pagina.cleanup();
      }
      return imagens;
    } finally {
      await tarefa.destroy().catch(() => {});
    }
  }

  async function imprimir(model, { janela = abrirJanela() } = {}) {
    if (!janela || janela.closed) throw new Error('Janela de impressão indisponível.');
    try {
      const paginasDocumento = await renderizarDocumento(model.documento);
      if (janela.closed) throw new Error('Janela de impressão indisponível.');
      janela.document.open();
      janela.document.write(montarHtml(model, { paginasDocumento }));
      janela.document.close();
      await Promise.all(Array.from(janela.document.images, img => img.decode()));
      if (janela.closed) throw new Error('Janela de impressão indisponível.');
      janela.focus();
      janela.print();
    } catch (erro) {
      if (!janela.closed) janela.close();
      throw erro;
    }
  }

  const api = { montarHtml, abrirJanela, imprimir };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SGExpansaoPdf = api;
})(typeof window !== 'undefined' ? window : null);

