/**
 * backfill-criado-em.js — grava `CriadoEm` (Timestamp de verdade) em cada
 * lead do `funil` que já existe, a partir do `DataCriacao` string.
 *
 * Contexto (item 2, 2026-09-03): o Funil e o Dashboard vão passar a escutar
 * só os leads criados nos últimos 18 meses (`.where('CriadoEm','>=', corte)`)
 * em vez da coleção inteira — junto com o item 1 (não baixar `clientes`), é o
 * que tira a carga fria de dentro da cota diária de leitura do Firestore.
 *
 * O `DataCriacao` de hoje NÃO serve pra essa query: está em dois formatos
 * misturados — "dd/mm/aaaa" nos leads da migração de 24/08, "aaaa-mm-dd" nos
 * criados depois. Este script lê os dois, converte pra Timestamp (meio-dia
 * local, pra não cair no dia errado por fuso) e grava em `CriadoEm`. Os leads
 * NOVOS já nascem com o campo (firestore-router.js).
 *
 * No fim, liga `config/migracao.criadoEmFunil = true` — é esse flag que faz o
 * front começar a usar a janela. Antes dele, `.where('CriadoEm','>=',...)`
 * esconderia todo lead sem o campo. Só liga se NENHUMA gravação falhar.
 *
 * Regras (crença 9 / antecipação F1):
 *   - Só adiciona o campo `CriadoEm` (merge). Nunca sobrescreve outro campo,
 *     nunca apaga.
 *   - Idempotente: lead que já tem `CriadoEm` é pulado. Pode rodar de novo.
 *   - Lead sem `DataCriacao` parseável: deixado como está (já é invisível no
 *     Funil hoje — processFunil descarta lead sem data).
 *   - Dry-run por padrão. Só grava com --commit.
 *
 * Uso (dentro de _tools/, com firebase-admin instalado):
 *   node backfill-criado-em.js --key "C:\...\serviceAccount.json"
 *   node backfill-criado-em.js --key ... --commit
 *
 * Roda depois do reset da cota (~04h BRT) — lê a coleção `funil` inteira
 * (~1.000 docs). A chave de service account fica FORA do repo e é revogada
 * depois.
 */
'use strict';
const fs = require('fs');

const args = process.argv.slice(2);
function arg(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; }
const KEY = arg('--key');
const COMMIT = args.includes('--commit');
if (!KEY) { console.error('Faltou --key <serviceAccount.json>'); process.exit(1); }

// "dd/mm/aaaa" ou "aaaa-mm-dd" -> Date no meio-dia local, ou null
function parseData(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], 12, 0, 0);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
  return null;
}

(async () => {
  const { initializeApp, cert } = require('firebase-admin/app');
  const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(KEY, 'utf8'))) });
  const db = getFirestore();

  const snap = await db.collection('funil').get();
  console.log(`funil: ${snap.size} docs`);

  let jaTem = 0, semData = 0, aGravar = 0, falhas = 0;
  const amostraSemData = [];
  const writer = db.bulkWriter();
  writer.onWriteError(err => {
    falhas++;
    console.error(`  falha em ${err.documentRef.id}: ${err.code} ${err.message}`);
    return err.failedAttempts < 3;
  });

  snap.forEach(d => {
    const doc = d.data();
    if (doc.CriadoEm) { jaTem++; return; }
    const dt = parseData(doc.DataCriacao || doc['Data Criacao'] || doc.Data);
    if (!dt) {
      semData++;
      if (amostraSemData.length < 10) amostraSemData.push(d.id + ' (DataCriacao=' + JSON.stringify(doc.DataCriacao) + ')');
      return;
    }
    aGravar++;
    if (COMMIT) writer.set(d.ref, { CriadoEm: Timestamp.fromDate(dt) }, { merge: true }).then(() => {}).catch(() => {});
  });

  if (COMMIT) await writer.close();

  console.log('\n──────── RESUMO ────────');
  console.log(`Já tinham CriadoEm ......... ${jaTem}`);
  console.log(`A gravar .................. ${aGravar}`);
  console.log(`Sem DataCriacao parseável .. ${semData}  (deixados como estão — já invisíveis no Funil)`);
  if (amostraSemData.length) console.log('  amostra:', amostraSemData.join(' | '));

  if (!COMMIT) {
    console.log('\nDRY-RUN. Nada foi gravado. Rode com --commit pra aplicar.');
    return;
  }

  console.log(`\nFalhas de escrita ......... ${falhas}`);
  if (falhas > 0) {
    console.log('\nNÃO liguei config/migracao.criadoEmFunil (teve falha). Corrija e rode de novo.');
    process.exit(1);
  }

  await db.collection('config').doc('migracao').set({
    criadoEmFunil: true,
    criadoEmFunilEm: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log('\nOK. config/migracao.criadoEmFunil = true — o Funil e o Dashboard já podem usar a janela.');
  console.log('(recarregue o painel admin depois de publicar os JS novos)');
})().catch(e => { console.error(e); process.exit(1); });
