/**
 * backfill-vendedor-cliente.js — preenche o "Vendedor Responsavel" do cliente
 * que está vazio com o dono do lead dele no funil (2026-11-03).
 *
 * Contexto: o disparo grava o vendedor só em funil/{id}.IdVendedor. Os
 * clientes importados nascem com 'Vendedor Responsavel' vazio e ficavam assim,
 * mesmo com lead e agendamento. Cobrança, venda da cobrança e OS leem o dono
 * do cliente. Daqui pra frente o Apps Script grava (disparoDonoNoCliente_);
 * este script corrige os que já existem, uma vez.
 *
 * Regras:
 *   - Só cliente com 'Vendedor Responsavel' vazio. Quem tem dono não é tocado.
 *   - O vendedor vem dos leads do funil com o mesmo IdCliente. Se todos têm o
 *     mesmo dono, ele entra. Leads com donos diferentes: fica de fora e vai
 *     para a lista de conflitos, pra o Felipe decidir.
 *   - Grava só esse campo, com pré-condição de updateTime: se o ERP mexeu no
 *     cliente depois da leitura, a gravação falha e o cliente fica como está.
 *   - Dry-run por padrão. Só grava com --commit, e antes salva o backup com a
 *     lista do que vai mudar.
 *
 * Uso (dentro de _tools/, com firebase-admin instalado):
 *   node backfill-vendedor-cliente.js --key "C:\...\serviceAccount.json"
 *   node backfill-vendedor-cliente.js --key ... --backup "C:\...\backup.json" --commit
 */
'use strict';
const fs = require('fs');

const args = process.argv.slice(2);
function arg(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; }
const KEY = arg('--key');
const BACKUP = arg('--backup');
const COMMIT = args.includes('--commit');
if (!KEY) { console.error('Faltou --key <serviceAccount.json>'); process.exit(1); }
if (COMMIT && !BACKUP) { console.error('Com --commit, informe --backup <arquivo.json>'); process.exit(1); }

(async () => {
  const { initializeApp, cert } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(KEY, 'utf8'))) });
  const db = getFirestore();

  const [vendSnap, cliSnap, funilSnap] = await Promise.all([
    db.collection('vendedores').get(),
    db.collection('clientes').select('Vendedor Responsavel', 'Nome Razao Social', 'Origem').get(),
    db.collection('funil').select('IdCliente', 'IdVendedor').get(),
  ]);
  const nomeVend = {};
  vendSnap.forEach(d => { const v = d.data(); nomeVend[String(v.IdVendedor || d.id)] = { nome: v.Nome || '', ativo: v.Status === 'Ativo' }; });

  // IdCliente -> conjunto de donos dos leads dele
  const donos = {};
  funilSnap.forEach(d => {
    const f = d.data();
    const idCli = String(f.IdCliente || ''), idV = String(f.IdVendedor || '').trim();
    if (!idCli || !idV) return;
    (donos[idCli] = donos[idCli] || new Set()).add(idV);
  });

  const mudar = [], conflitos = [];
  let vazios = 0, semLead = 0;
  cliSnap.forEach(d => {
    const c = d.data();
    if (String(c['Vendedor Responsavel'] || '').trim()) return;
    vazios++;
    const s = donos[d.id];
    if (!s) { semLead++; return; }
    const item = { idCliente: d.id, nome: c['Nome Razao Social'] || '', origem: c.Origem || '', updateTime: d.updateTime };
    if (s.size > 1) { conflitos.push(Object.assign(item, { donos: [...s].map(v => (nomeVend[v] || {}).nome || v) })); return; }
    const idV = [...s][0];
    mudar.push(Object.assign(item, { idVendedor: idV, vendedor: (nomeVend[idV] || {}).nome || '(não achado)', ativo: !!(nomeVend[idV] || {}).ativo }));
  });

  const porOrigem = {}, porVend = {};
  mudar.forEach(m => {
    porOrigem[m.origem || '(vazia)'] = (porOrigem[m.origem || '(vazia)'] || 0) + 1;
    const k = m.vendedor + (m.ativo ? '' : ' (inativo)');
    porVend[k] = (porVend[k] || 0) + 1;
  });

  console.log(`clientes lidos: ${cliSnap.size} | leads lidos: ${funilSnap.size}`);
  console.log(`sem vendedor: ${vazios} | sem lead com dono: ${semLead} | conflitos: ${conflitos.length} | a preencher: ${mudar.length}`);
  console.log('\nA preencher por origem:'); Object.entries(porOrigem).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${k}: ${n}`));
  console.log('\nA preencher por vendedor:'); Object.entries(porVend).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${k}: ${n}`));
  if (conflitos.length) {
    console.log('\nConflitos (ficam de fora):');
    conflitos.forEach(c => console.log(`  ${c.idCliente}  ${c.nome}  [${c.donos.join(' / ')}]`));
  }
  if (args.includes('--lista')) {
    console.log('\nLista:');
    mudar.forEach(m => console.log(`  ${m.idCliente}  ${m.nome}  ->  ${m.vendedor}`));
  }

  if (!COMMIT) { console.log('\nDRY-RUN. Nada foi gravado. Rode com --backup <arquivo> --commit pra aplicar.'); return; }

  fs.writeFileSync(BACKUP, JSON.stringify({
    geradoEm: new Date().toISOString(), campo: 'Vendedor Responsavel', valorAnterior: '',
    clientes: mudar.map(m => ({ idCliente: m.idCliente, nome: m.nome, idVendedor: m.idVendedor, vendedor: m.vendedor })), conflitos,
  }, null, 2));
  console.log(`\nBackup: ${BACKUP}`);

  let ok = 0, falhas = 0;
  const writer = db.bulkWriter();
  writer.onWriteError(err => { falhas++; console.error(`  falha em ${err.documentRef.path}: ${err.code} ${err.message}`); return false; });
  mudar.forEach(m => {
    writer.update(db.collection('clientes').doc(m.idCliente), { 'Vendedor Responsavel': m.idVendedor }, { lastUpdateTime: m.updateTime })
      .then(() => { ok++; }).catch(() => {});
  });
  await writer.close();
  console.log(`Gravados: ${ok} | falhas: ${falhas}`);
  if (falhas) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
