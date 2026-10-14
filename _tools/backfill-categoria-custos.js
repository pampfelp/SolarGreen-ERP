/**
 * backfill-categoria-custos.js — grava Categoria (e CategoriaOrigem:'backfill')
 * nos docs de `custos_venda` que ainda não têm categoria, usando a mesma regra
 * que o formulário do ERP (js/dre-categorias.js). Prepara a base para a DRE.
 *
 * Regras que este script SEGUE (crença 9, antecipação A13 e F1):
 *   - Dry-run por padrão: só lê, imprime o resumo e grava o CSV do plano.
 *     Só escreve no Firestore com --commit.
 *   - Só ADICIONA Categoria e CategoriaOrigem (merge). Nunca sobrescreve
 *     categoria que já existe, nunca apaga, nunca cria doc.
 *   - Idempotente: doc que já tem Categoria é pulado. Pode rodar de novo.
 *   - Só grava quando a regra tem sugestão E nenhum aviso. Sem sugestão ou com
 *     aviso (ex.: despesa geral lançada numa venda de cliente) o doc fica de
 *     fora, para conferir na tela com o filtro "A revisar".
 *   - Com --commit, antes de escrever salva em disco o backup dos docs que vai
 *     alterar e a lista de IDs; depois relê e confere a contagem.
 *
 * A saída (CSV, backup, IDs) tem nome de funcionário e valores. Fica em
 * _tools/saida-categoria-custos/ e essa pasta está no .gitignore.
 *
 * Uso (dentro de _tools/, com firebase-admin já instalado):
 *   node backfill-categoria-custos.js --key "C:\...\serviceAccount.json"
 *   node backfill-categoria-custos.js --key ... --commit
 *
 * Lê custos_venda + vendas inteiros (centenas de docs). A cota de leitura do
 * Firestore deste projeto vive no limite: rodar depois do reset (~04h BRT).
 * A chave de service account fica FORA do repositório e é revogada no console
 * do Firebase depois do uso.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DRE = require('../js/dre-categorias.js');

const ID_CLIENTE_ESCRITORIO = 'da6dbd89'; // Cliente Teste 1: gaveta do escritório (mesmo valor de custos-venda.js)

/** Decide, sem tocar no banco, o que fazer com cada custo. Exportada para teste. */
function planejar(custos, vendas) {
  const clienteDaVenda = {};
  vendas.forEach(v => { clienteDaVenda[v.id] = v.data.IdCliente; });
  const itens = [];
  let jaComCategoria = 0;
  custos.forEach(c => {
    const d = c.data;
    if (d.Categoria) { jaComCategoria++; return; }
    const idCliente = clienteDaVenda[d.IdVenda];
    const tipoVenda = idCliente === undefined ? 'sem venda' : (idCliente === ID_CLIENTE_ESCRITORIO ? 'escritório' : 'cliente');
    const ctx = tipoVenda === 'sem venda' ? undefined : { ehEscritorio: tipoVenda === 'escritório' };
    const s = DRE.sugerir(d.Descricao, ctx);
    let acao;
    if (!s.categoria) acao = 'revisar';
    else if (s.aviso) acao = 'revisar (aviso)';
    else acao = 'gravar';
    itens.push({ id: c.id, descricao: d.Descricao || '', valor: d.Valor, data: d.Data || '', status: d.Status || '',
      tipoVenda, categoria: s.categoria, origem: s.origem, aviso: s.aviso, acao });
  });
  return { itens, jaComCategoria };
}

/** Só vai ao Jev o que a regra deixou sem categoria e sem aviso (aviso = a regra achou algo e desconfiou). */
function elegiveisParaJev(plano) {
  return plano.itens.filter(i => i.acao === 'revisar' && !i.categoria && !i.aviso);
}

/** Uma chamada à API da TypeSafe, com recuo em 429 e 529. Devolve {categoria,confianca} ou null se não houve pedido. */
async function consultarJev(item, chave, fetchFn) {
  const pedido = DRE.montarPedidoJev(item.descricao, item.tipoVenda === 'sem venda' ? undefined : { ehEscritorio: item.tipoVenda === 'escritório' });
  if (!pedido) return null;
  const corpo = JSON.stringify({ model: 'jev-latest', state: pedido.state, questions: pedido.questions });
  for (let tentativa = 0; ; tentativa++) {
    const r = await fetchFn('https://api.typesafe.ai/v1/systemone', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + chave }, body: corpo });
    if ((r.status === 429 || r.status === 529) && tentativa < 4) { await new Promise(res => setTimeout(res, 1000 * 2 ** tentativa)); continue; }
    if (!r.ok) throw new Error('Jev respondeu ' + r.status);
    return DRE.lerRespostaJev(await r.json());
  }
}

/** Marca o item com a sugestão do Jev. Nunca grava sozinha: a ação é 'sugerida (jev)' até o --incluir-jev. */
function aplicarJev(item, lido) {
  item.confianca = lido.confianca;
  if (!lido.categoria) return;
  item.categoria = lido.categoria; item.origem = 'jev'; item.acao = 'sugerida (jev)';
}

function num(v) {
  if (typeof v === 'number') return v;
  let s = String(v == null ? '' : v).replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function csv(itens) {
  const esc = x => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"';
  const linhas = [['id', 'data', 'descricao', 'valor', 'status', 'venda', 'acao', 'categoria_id', 'categoria', 'grupo_dre', 'sugerida_por', 'aviso', 'confianca_jev']];
  itens.forEach(i => {
    const g = DRE.grupoDe(i.categoria);
    linhas.push([i.id, i.data, i.descricao, String(num(i.valor)).replace('.', ','), i.status, i.tipoVenda, i.acao,
      i.categoria, i.categoria ? DRE.rotuloDe(i.categoria) : '', g ? g.nome : '', i.origem, i.aviso, typeof i.confianca === 'number' ? i.confianca.toFixed(2).replace('.', ',') : '']);
  });
  return '\ufeff' + linhas.map(l => l.map(esc).join(';')).join('\r\n') + '\r\n'; // BOM + ; para abrir certo no Excel pt-BR
}

function resumo(plano) {
  const { itens, jaComCategoria } = plano;
  console.log(`\nJá com categoria (pulados) ......... ${jaComCategoria}`);
  console.log(`Sem categoria (analisados) ......... ${itens.length}`);
  ['gravar', 'sugerida (jev)', 'revisar (aviso)', 'revisar'].forEach(a => {
    const sel = itens.filter(i => i.acao === a);
    console.log(`  ${a.padEnd(16)} ${String(sel.length).padStart(4)} lançamentos  R$ ${sel.reduce((s, i) => s + num(i.valor), 0).toFixed(2)}`);
  });
  console.log('\nPor categoria (só o que seria gravado):');
  DRE.CATEGORIAS.forEach(c => {
    const sel = itens.filter(i => i.acao === 'gravar' && i.categoria === c.id);
    if (sel.length) console.log(`  ${String(sel.length).padStart(4)}  R$ ${sel.reduce((s, i) => s + num(i.valor), 0).toFixed(2).padStart(10)}  [${DRE.grupoDe(c.id).nome}] ${c.nome}`);
  });
  const rev = itens.filter(i => i.acao !== 'gravar');
  if (rev.length) {
    console.log('\nFicam para conferir na tela (maiores primeiro, até 25):');
    rev.sort((a, b) => num(b.valor) - num(a.valor)).slice(0, 25).forEach(i =>
      console.log(`  R$ ${num(i.valor).toFixed(2).padStart(9)}  ${i.tipoVenda.padEnd(10)} ${i.descricao.slice(0, 60)}${i.aviso ? '  [' + i.aviso + ']' : ''}`));
  }
}

module.exports = { planejar, csv, elegiveisParaJev, consultarJev, aplicarJev };

if (require.main === module) {
  const args = process.argv.slice(2);
  const arg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const KEY = arg('--key');
  const COMMIT = args.includes('--commit');
  const USAR_JEV = args.includes('--jev');             // consulta o Jev (TypeSafe) para o que a regra deixou sem categoria
  const INCLUIR_JEV = args.includes('--incluir-jev');  // com --commit, grava também as sugestões do Jev (CategoriaOrigem 'jev')
  if (!KEY) { console.error('Faltou --key <serviceAccount.json>'); process.exit(1); }
  const SAIDA = path.join(__dirname, 'saida-categoria-custos');

  (async () => {
    const { initializeApp, cert } = require('firebase-admin/app');
    const { getFirestore } = require('firebase-admin/firestore');
    initializeApp({ credential: cert(JSON.parse(fs.readFileSync(KEY, 'utf8'))) });
    const db = getFirestore();

    const [cSnap, vSnap] = await Promise.all([db.collection('custos_venda').get(), db.collection('vendas').get()]);
    console.log(`custos_venda lidos: ${cSnap.size} | vendas lidas: ${vSnap.size}`);
    const custos = [], vendas = [];
    cSnap.forEach(d => custos.push({ id: d.id, data: d.data() }));
    vSnap.forEach(d => vendas.push({ id: d.id, data: d.data() }));

    const plano = planejar(custos, vendas);

    if (USAR_JEV) {
      // A chave vem do ambiente, nunca de arquivo do repositório. A descrição vai como está para a TypeSafe.
      const chaveJev = process.env.TYPESAFE_API_KEY;
      if (!chaveJev) { console.error('Faltou a variável de ambiente TYPESAFE_API_KEY.'); process.exit(1); }
      const fila = elegiveisParaJev(plano);
      console.log(`\nJev: consultando ${fila.length} lançamentos que a regra deixou sem categoria...`);
      let feitos = 0, falhasJev = 0;
      const trabalhador = async () => {
        while (fila.length) {
          const item = fila.shift();
          try { const lido = await consultarJev(item, chaveJev, fetch); if (lido) aplicarJev(item, lido); }
          catch (e) { falhasJev++; console.error(`  Jev falhou em ${item.id}: ${e.message}`); }
          if (++feitos % 25 === 0) console.log(`  ${feitos} consultados`);
        }
      };
      await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()]);
      console.log(`Jev: ${feitos} consultados, ${falhasJev} falhas.`);
    }

    resumo(plano);

    fs.mkdirSync(SAIDA, { recursive: true });
    const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const arqCsv = path.join(SAIDA, `plano-${carimbo}.csv`);
    fs.writeFileSync(arqCsv, csv(plano.itens), 'utf8');
    console.log(`\nPlano completo salvo em: ${arqCsv}`);

    const gravar = plano.itens.filter(i => i.acao === 'gravar' || (INCLUIR_JEV && i.acao === 'sugerida (jev)'));
    if (!COMMIT) {
      console.log(`\nDRY-RUN. Nada foi gravado. Com --commit seriam gravados ${gravar.length} docs.`);
      return;
    }
    if (!gravar.length) { console.log('\nNada a gravar.'); return; }

    // Backup e lista de IDs ANTES de escrever (se cair no meio, dá para saber o que foi tocado).
    const porId = {}; custos.forEach(c => { porId[c.id] = c.data; });
    fs.writeFileSync(path.join(SAIDA, `backup-${carimbo}.json`), JSON.stringify(gravar.map(i => ({ id: i.id, antes: porId[i.id] })), null, 2));
    fs.writeFileSync(path.join(SAIDA, `ids-${carimbo}.json`), JSON.stringify(gravar.map(i => i.id)));

    const writer = db.bulkWriter();
    let falhas = 0;
    writer.onWriteError(err => { falhas++; console.error(`  falha em ${err.documentRef.path}: ${err.code} ${err.message}`); return err.failedAttempts < 3; });
    gravar.forEach(i => {
      writer.set(db.collection('custos_venda').doc(i.id), { Categoria: i.categoria, CategoriaOrigem: i.origem === 'jev' ? 'jev' : 'backfill' }, { merge: true }).then(() => {}).catch(() => {});
    });
    await writer.close();

    const depois = await db.collection('custos_venda').get();
    let comCat = 0; depois.forEach(d => { if (d.data().Categoria) comCat++; });
    console.log(`\nGravados: ${gravar.length - falhas} de ${gravar.length} | falhas: ${falhas}`);
    console.log(`Conferência: antes ${plano.jaComCategoria} com categoria, depois ${comCat} (esperado ${plano.jaComCategoria + gravar.length - falhas}) de ${depois.size} docs.`);
    console.log('Só Categoria e CategoriaOrigem foram gravados (merge). Nenhum outro campo tocado.');
    if (falhas || comCat !== plano.jaComCategoria + gravar.length - falhas) process.exit(1);
  })().catch(e => { console.error(e); process.exit(1); });
}
