/**
 * backfill-nome-cliente.js — grava NomeCliente/TelefoneCliente (desnormalizados)
 * nos docs de `funil`, `vendas` e `agendamentos` que já existem.
 *
 * Contexto: a partir de 2026-09-03 o painel admin para de baixar a coleção
 * `clientes` inteira (1.200 docs) só pra mostrar o nome do cliente na lista do
 * Funil/Vendas/Agendamentos — o nome passa a vir gravado na própria linha.
 * Os docs NOVOS já nascem com o campo (firestore-router.js). Este script
 * preenche os ANTIGOS, uma vez.
 *
 * Regras que este script SEGUE (crença 9 / antecipação F1):
 *   - Só ADICIONA os dois campos (merge). Nunca sobrescreve outro campo,
 *     nunca apaga, nunca cria doc.
 *   - Idempotente: doc que já está com o nome certo é pulado. Pode rodar
 *     de novo sem efeito.
 *   - Cliente não encontrado -> deixa o doc como está (não grava nome vazio).
 *   - Dry-run por padrão. Só grava com --commit.
 *
 * Uso (dentro de _tools/, com firebase-admin já instalado):
 *   node backfill-nome-cliente.js --key "C:\...\serviceAccount.json"
 *   node backfill-nome-cliente.js --key ... --commit
 *
 * Lê ~2.700 docs (clientes + funil + vendas + agendamentos). A cota de
 * leitura do Firestore desse projeto vive no limite — rodar depois do reset
 * (~04h BRT), igual à migração de ponto.
 *
 * A chave de service account fica FORA do repositório e é revogada no
 * console do Firebase depois do uso.
 */
'use strict';
const fs = require('fs');

const args = process.argv.slice(2);
function arg(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; }
const KEY = arg('--key');
const COMMIT = args.includes('--commit');
if (!KEY) { console.error('Faltou --key <serviceAccount.json>'); process.exit(1); }

const COLECOES = ['funil', 'vendas', 'agendamentos'];

(async () => {
  const { initializeApp, cert } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(KEY, 'utf8'))) });
  const db = getFirestore();

  // ── mapa IdCliente -> {nome, telefone} ──
  const cliSnap = await db.collection('clientes').get();
  const cli = {};
  cliSnap.forEach(d => {
    const c = d.data();
    cli[d.id] = {
      nome: (c['Nome Razao Social'] || c.Nome || '').trim(),
      telefone: (c.Telefone || '').trim(),
    };
  });
  console.log(`clientes lidos: ${cliSnap.size}`);

  const resumo = {};
  const writer = db.bulkWriter();
  let totalAtualizar = 0, totalOk = 0, totalSemCliente = 0, totalSemIdCliente = 0, falhas = 0;

  writer.onWriteError(err => {
    falhas++;
    console.error(`  falha em ${err.documentRef.path}: ${err.code} ${err.message}`);
    return err.failedAttempts < 3;
  });

  for (const col of COLECOES) {
    const snap = await db.collection(col).get();
    let atualizar = 0, ok = 0, semCliente = 0, semId = 0;
    snap.forEach(d => {
      const doc = d.data();
      const idCli = doc.IdCliente;
      if (!idCli) { semId++; return; }
      const alvo = cli[idCli];
      if (!alvo || !alvo.nome) { semCliente++; return; } // cliente sumiu / sem nome — deixa como está
      const nomeAtual = (doc.NomeCliente || '');
      const telAtual = (doc.TelefoneCliente || '');
      if (nomeAtual === alvo.nome && telAtual === alvo.telefone) { ok++; return; } // já certo
      atualizar++;
      if (COMMIT) {
        const patch = { NomeCliente: alvo.nome };
        if (alvo.telefone) patch.TelefoneCliente = alvo.telefone;
        writer.set(d.ref, patch, { merge: true }).then(() => {}).catch(() => {});
      }
    });
    resumo[col] = { total: snap.size, atualizar, jaOk: ok, semClienteEncontrado: semCliente, semIdCliente: semId };
    totalAtualizar += atualizar; totalOk += ok; totalSemCliente += semCliente; totalSemIdCliente += semId;
    console.log(`${col}: ${snap.size} docs | a atualizar ${atualizar} | já ok ${ok} | cliente não achado ${semCliente} | sem IdCliente ${semId}`);
  }

  if (COMMIT) await writer.close();

  console.log('\n──────── RESUMO ────────');
  console.log(JSON.stringify(resumo, null, 2));
  console.log(`\nA atualizar (total) ......... ${totalAtualizar}`);
  console.log(`Já corretos ................. ${totalOk}`);
  console.log(`Cliente não encontrado ..... ${totalSemCliente}  (deixados como estão)`);
  console.log(`Sem IdCliente .............. ${totalSemIdCliente}  (deixados como estão)`);
  if (COMMIT) {
    console.log(`Falhas de escrita .......... ${falhas}`);
    console.log('\nGravado (só NomeCliente/TelefoneCliente, merge). Nenhum outro campo tocado.');
    if (falhas) process.exit(1);
  } else {
    console.log('\nDRY-RUN. Nada foi gravado. Rode de novo com --commit pra aplicar.');
  }
})().catch(e => { console.error(e); process.exit(1); });
