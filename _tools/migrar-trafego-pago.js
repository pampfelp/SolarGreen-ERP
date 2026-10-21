/**
 * migrar-trafego-pago.js — passa para a categoria nova trafego_pago (2026-10-21)
 * os custos_venda que estão em marketing e cuja descrição é de anúncio, Meta,
 * Google Ads, tráfego ou compra de lead (mesma regra de js/dre-categorias.js).
 * Também mostra as Origens escritas nos clientes, para conferir quais grafias
 * a seção Tráfego pago do Dashboard vai ler como tráfego.
 *
 * Segue as mesmas regras do backfill-categoria-custos.js:
 *   - Dry-run por padrão: só lê, imprime o resumo e grava o CSV do plano.
 *     Só escreve no Firestore com --commit.
 *   - Só troca Categoria de 'marketing' para 'trafego_pago' e marca
 *     CategoriaOrigem 'backfill' (merge). Nenhum outro campo, nenhuma outra categoria.
 *   - Idempotente: o que já está em trafego_pago não entra de novo.
 *   - Com --commit, salva backup e IDs antes de escrever; depois relê e confere.
 *
 * A saída tem descrição e valor de custo: fica em _tools/saida-categoria-custos/
 * (no .gitignore). No terminal não sai nome nem telefone de cliente, só a Origem.
 *
 * Uso (dentro de _tools/):
 *   node migrar-trafego-pago.js --key "C:\...\serviceAccount.json"
 *   node migrar-trafego-pago.js --key ... --commit
 *
 * Lê custos_venda (~450 docs) e clientes (~1.400 docs, só o campo Origem).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DRE = require('../js/dre-categorias.js');

/** Decide, sem tocar no banco, o que muda. Exportada para teste. */
function planejar(custos) {
  const itens = [];
  let jaEmTrafego = 0;
  custos.forEach(c => {
    const d = c.data;
    if (d.Categoria === 'trafego_pago') { jaEmTrafego++; return; }
    if (d.Categoria !== 'marketing') return;
    const nova = DRE.sugerir(d.Descricao).categoria;
    itens.push({ id: c.id, descricao: d.Descricao || '', valor: d.Valor, data: d.Data || '', status: d.Status || '',
      origemAntes: d.CategoriaOrigem || '', acao: nova === 'trafego_pago' ? 'mover' : 'fica em marketing' });
  });
  return { itens, jaEmTrafego };
}

/** Contagem das Origens dos clientes, da mais comum para a menos. Exportada para teste. */
function contarOrigens(origens) {
  const mapa = {};
  origens.forEach(o => { const k = String(o == null ? '' : o).trim(); mapa[k] = (mapa[k] || 0) + 1; });
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  return Object.keys(mapa).map(o => ({ origem: o, n: mapa[o], le: !o ? 'sem origem' : (norm(o).includes('trafego') ? 'tráfego' : (norm(o) === 'site' ? 'site' : '')) }))
    .sort((a, b) => b.n - a.n);
}

function csv(itens) {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  return ['id;descricao;valor;data;status;categoria_origem_antes;acao']
    .concat(itens.map(i => [i.id, i.descricao, i.valor, i.data, i.status, i.origemAntes, i.acao].map(q).join(';'))).join('\n');
}

module.exports = { planejar, contarOrigens, csv };

if (require.main === module) {
  const args = process.argv.slice(2);
  const arg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const KEY = arg('--key');
  const COMMIT = args.includes('--commit');
  if (!KEY) { console.error('Faltou --key <serviceAccount.json>'); process.exit(1); }
  const SAIDA = path.join(__dirname, 'saida-categoria-custos');

  (async () => {
    const { initializeApp, cert } = require('firebase-admin/app');
    const { getFirestore } = require('firebase-admin/firestore');
    initializeApp({ credential: cert(JSON.parse(fs.readFileSync(KEY, 'utf8'))) });
    const db = getFirestore();

    const [cSnap, cliSnap] = await Promise.all([db.collection('custos_venda').get(), db.collection('clientes').select('Origem').get()]);
    console.log(`custos_venda lidos: ${cSnap.size} | clientes lidos: ${cliSnap.size}`);

    const origens = []; cliSnap.forEach(d => origens.push(d.get('Origem')));
    console.log('\nOrigens dos clientes (quantos · origem · como a seção lê):');
    contarOrigens(origens).forEach(o => console.log(`  ${String(o.n).padStart(5)}  ${o.origem || '(vazio)'}${o.le ? '  -> ' + o.le : ''}`));

    const custos = []; cSnap.forEach(d => custos.push({ id: d.id, data: d.data() }));
    const plano = planejar(custos);
    const mover = plano.itens.filter(i => i.acao === 'mover');
    console.log(`\nJá em trafego_pago: ${plano.jaEmTrafego} | em marketing: ${plano.itens.length} | vão para trafego_pago: ${mover.length}`);
    plano.itens.forEach(i => console.log(`  ${i.acao === 'mover' ? 'MOVE' : 'fica'}  ${i.data.padEnd(10)}  ${String(i.valor).padStart(9)}  ${i.descricao}`));

    fs.mkdirSync(SAIDA, { recursive: true });
    const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const arqCsv = path.join(SAIDA, `trafego-plano-${carimbo}.csv`);
    fs.writeFileSync(arqCsv, csv(plano.itens), 'utf8');
    console.log(`\nPlano salvo em: ${arqCsv}`);

    if (!COMMIT) { console.log(`\nDRY-RUN. Nada foi gravado. Com --commit seriam movidos ${mover.length} custos.`); return; }
    if (!mover.length) { console.log('\nNada a mover.'); return; }

    const porId = {}; custos.forEach(c => { porId[c.id] = c.data; });
    fs.writeFileSync(path.join(SAIDA, `trafego-backup-${carimbo}.json`), JSON.stringify(mover.map(i => ({ id: i.id, antes: porId[i.id] })), null, 2));
    fs.writeFileSync(path.join(SAIDA, `trafego-ids-${carimbo}.json`), JSON.stringify(mover.map(i => i.id)));

    const writer = db.bulkWriter();
    let falhas = 0;
    writer.onWriteError(err => { falhas++; console.error(`  falha em ${err.documentRef.path}: ${err.code} ${err.message}`); return err.failedAttempts < 3; });
    mover.forEach(i => { writer.set(db.collection('custos_venda').doc(i.id), { Categoria: 'trafego_pago', CategoriaOrigem: 'backfill' }, { merge: true }).then(() => {}).catch(() => {}); });
    await writer.close();

    const depois = await db.collection('custos_venda').where('Categoria', '==', 'trafego_pago').get();
    console.log(`\nMovidos: ${mover.length - falhas} de ${mover.length} | falhas: ${falhas}`);
    console.log(`Conferência: em trafego_pago antes ${plano.jaEmTrafego}, depois ${depois.size} (esperado ${plano.jaEmTrafego + mover.length - falhas}).`);
    if (falhas || depois.size !== plano.jaEmTrafego + mover.length - falhas) process.exit(1);
  })().catch(e => { console.error(e); process.exit(1); });
}
