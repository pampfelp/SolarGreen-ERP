/**
 * migrar-ponto.js — traz as batidas de ponto da planilha (aba "Ponto
 * Eletronico", escrita pelo AppSheet) para a coleção `ponto` do Firestore.
 *
 * Contexto: a migração de 2026-08-24 semeou ~435 batidas e congelou ali,
 * porque o AppSheet continuou escrevendo só na planilha. Este script
 * fecha a diferença. Depois do cutover (app ponto.html no ar, AppSheet
 * desligado) roda uma última vez pra pegar as batidas do último dia.
 *
 * Regras que este script SEGUE (crença 9 / antecipação F1):
 *   - Compara por IdPonto contra o que já existe e grava SÓ o que é novo.
 *   - Nunca sobrescreve, nunca apaga, nunca toca em `ponto_overrides`.
 *   - Dry-run por padrão. Só grava com --commit.
 *
 * Uso:
 *   npm i firebase-admin           (uma vez, nesta pasta _tools/)
 *   node migrar-ponto.js --key "C:\...\serviceAccount.json" --export "C:\...\Ponto Eletronico (4).html"
 *   node migrar-ponto.js --key ... --export ... --commit
 *
 * A chave de service account fica FORA do repositório e é revogada no
 * console do Firebase depois do uso.
 */
'use strict';
const fs = require('fs');

// ── args ──
const args = process.argv.slice(2);
function arg(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; }
const KEY = arg('--key');
const EXPORT = arg('--export');
const COMMIT = args.includes('--commit');
if (!KEY || !EXPORT) {
  console.error('Faltou --key <serviceAccount.json> e/ou --export <Ponto Eletronico.html>');
  process.exit(1);
}

// ── parse do export HTML da planilha ──
function parseExport(path) {
  const src = fs.readFileSync(path, 'utf8');
  const table = (src.match(/<table[\s\S]*?<\/table>/) || [])[0];
  if (!table) throw new Error('Nenhuma <table> encontrada no export.');
  const trs = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  const cells = tr => (tr.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g) || []).map(td =>
    td.replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .trim()
  );
  // linha 0 = letras de coluna; linha 1 = cabeçalho real; resto = dados
  const header = cells(trs[1]).slice(1);
  const rows = [];
  for (let i = 2; i < trs.length; i++) {
    const c = cells(trs[i]).slice(1);
    if (!c.some(x => x)) continue; // linha em branco no meio da planilha
    const o = {}; header.forEach((h, idx) => o[h] = c[idx] || '');
    rows.push(o);
  }
  return { header, rows };
}

const TIPOS_OK = ['Entrada', 'Almoço', 'Retorno Almoço', 'Saída'];
function canonTipo(raw) {
  const s = (raw || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (s.includes('entrada')) return 'Entrada';
  if (s.includes('retorno')) return 'Retorno Almoço';
  if (s.startsWith('almo')) return 'Almoço';
  if (s.startsWith('sa')) return 'Saída';
  return raw || '';
}
function dateKeyFromStr(s) {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

(async () => {
  const { initializeApp, cert } = require('firebase-admin/app');
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(KEY, 'utf8'))) });
  const db = getFirestore();

  // A cota de LEITURA do Firestore desse projeto vive estourando (crença 10).
  // Então este script quase não lê: a deduplicação é feita com .create(),
  // que já falha sozinho ("ALREADY_EXISTS") se o IdPonto já existir —
  // custo zero de leitura, e F1-safe por construção (nunca sobrescreve).
  // A única leitura é `vendedores` (poucas dezenas de docs), e mesmo essa
  // é opcional: se a cota recusar, o script segue sem o mapa de nomes.
  const nomePorId = {};
  const vendedorConhecido = new Set();
  try {
    const vendSnap = await db.collection('vendedores').get();
    vendSnap.forEach(d => {
      const v = d.data();
      vendedorConhecido.add(d.id);
      if (v.IdVendedor) { vendedorConhecido.add(String(v.IdVendedor)); nomePorId[String(v.IdVendedor)] = v.Nome || ''; }
    });
    console.log(`vendedores lidos: ${vendSnap.size}`);
  } catch (e) {
    console.log(`(não deu pra ler vendedores: ${e.code || e.message} — seguindo sem o mapa de nomes)`);
  }

  const { header, rows } = parseExport(EXPORT);
  console.log(`Export da planilha: ${rows.length} linhas | colunas: ${header.join(', ')}`);

  // transforma todas as linhas com IdPonto num doc candidato
  const candidatos = [];
  const semId = [];
  const funcionarioDesconhecido = new Set();
  let tipoEstranho = 0;

  for (const r of rows) {
    const id = (r.IdPonto || '').trim();
    if (!id) { semId.push(r); continue; } // sem IdPonto não dá pra deduplicar — fica de fora
    const func = (r.Funcionario || '').trim();
    if (func && vendedorConhecido.size && !vendedorConhecido.has(func)) funcionarioDesconhecido.add(func);
    const tipo = canonTipo(r.Tipo);
    if (!TIPOS_OK.includes(tipo)) tipoEstranho++;
    candidatos.push({
      IdPonto: id,
      Funcionario: func,
      Tipo: tipo,
      'Data e Hora': (r['Data e Hora'] || '').trim(),
      DataKey: dateKeyFromStr(r['Data e Hora']),
      // caminho relativo do AppSheet — não resolve como imagem, guardado só
      // pra rastreio (as fotos históricas vivem na pasta do AppSheet no Drive)
      'Foto Selfie': (r['Foto Selfie'] || '').trim(),
      Localizacao: (r.Localizacao || '').trim(),
      // a coluna "Endereço" da planilha só tem "pt-BR" (bug do AppSheet) — descartada
      'Endereço': '',
      Origem: 'appsheet',
      MigradoEm: FieldValue.serverTimestamp(),
    });
  }

  const datas = candidatos.map(n => dateKeyFromStr(n['Data e Hora'])).filter(Boolean).sort();
  console.log('\n──────── RESUMO ────────');
  console.log(`Linhas com IdPonto ............ ${candidatos.length}`);
  console.log(`Linhas sem IdPonto (ignoradas)  ${semId.length}`);
  if (datas.length) console.log(`Intervalo das datas .......... ${datas[0]} → ${datas[datas.length - 1]}`);
  if (tipoEstranho) console.log(`Tipo fora do padrão .......... ${tipoEstranho}`);
  if (funcionarioDesconhecido.size) console.log(`Funcionário sem vendedor: ${[...funcionarioDesconhecido].join(', ')}`);
  const porFunc = {};
  candidatos.forEach(n => { const k = nomePorId[n.Funcionario] || n.Funcionario || '(sem)'; porFunc[k] = (porFunc[k] || 0) + 1; });
  console.log('Por funcionário:', JSON.stringify(porFunc));

  fs.writeFileSync(__dirname + '/migrar-ponto-previa.json', JSON.stringify(candidatos, null, 2));
  console.log('Prévia salva em _tools/migrar-ponto-previa.json');

  if (!COMMIT) {
    console.log('\nDRY-RUN. Nada foi gravado. A deduplicação de verdade acontece no --commit');
    console.log('(cada batida é um .create() — as que já existem são puladas automaticamente).');
    return;
  }

  console.log(`\nGravando com .create() (as que já existem são puladas)…`);
  const writer = db.bulkWriter();
  let inseridas = 0, jaExistiam = 0, falhas = 0;
  writer.onWriteError(err => {
    if (err.code === 6 /* ALREADY_EXISTS */) { jaExistiam++; return false; }
    falhas++;
    console.error(`  falha em ${err.documentRef.id}: ${err.code} ${err.message}`);
    return err.failedAttempts < 3; // re-tenta erro transitório (ex.: cota) até 3x
  });
  for (const doc of candidatos) {
    writer.create(db.collection('ponto').doc(doc.IdPonto), doc).then(() => { inseridas++; }).catch(() => {});
  }
  await writer.close();

  console.log('\n──────── RESULTADO ────────');
  console.log(`Inseridas (novas) ............ ${inseridas}`);
  console.log(`Já existiam (puladas) ........ ${jaExistiam}`);
  console.log(`Falhas ...................... ${falhas}`);
  console.log('`ponto_overrides` não foi tocada.');
  if (falhas) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
