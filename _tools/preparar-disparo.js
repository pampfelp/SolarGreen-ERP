/**
 * Monta a fila do disparo de reativação pela API do WhatsApp (2026-10-26).
 *
 * Lê o funil (pipeline Comercial) e grava um documento por lead em
 * `disparos/{CAMPANHA}-{IdOportunidade}`, com status `fila`. Quem manda é o
 * Apps Script (disparoEnviarLote), de hora em hora, com cota por vendedor.
 *
 * Segmentos:
 *   perdido  lead na etapa de papel "perdido"
 *   parado   lead aberto (nem ganho nem perdido) sem movimento há 30+ dias
 *            (última transição de etapa ou atividade)
 *
 * Dono: se o vendedor do lead está ativo e tem WhatsApp, fica com ele. Senão
 * o lead vai pro rodízio entre os vendedores ativos com WhatsApp (decisão do
 * Felipe, 2026-10-26). O IdVendedor do funil NÃO muda aqui: só muda quando o
 * lead interage (Apps Script).
 *
 * Ficam de fora: telefone inválido, telefone que pediu pra sair
 * (`disparo_optout`) e o mesmo telefone em mais de um lead (vai o mais recente).
 *
 * Uso (dentro de _tools/, com firebase-admin instalado):
 *   node preparar-disparo.js --key "C:\...\serviceAccount.json"            simulação + CSV
 *   node preparar-disparo.js --key "..." --commit                          grava a fila
 *   node preparar-disparo.js --key "..." --teste 5591984967373:Felipe --vendedor <IdVendedor> --commit
 *        disparo de teste pra um número, sem lead do funil (não mexe em funil)
 *
 * Rodar de novo não duplica: o id do documento é fixo por lead e campanha, e
 * documento que já existe é pulado.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CAMPANHA = 'r1';
const DIAS_PARADO = 30;
const MODELOS = { perdido: 'reativacao_perdido_v1', parado: 'reativacao_parado_v1' };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const args = process.argv.slice(2);
const arg = n => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : ''; };
const KEY = arg('--key');
const COMMIT = args.includes('--commit');
const TESTE = arg('--teste');
if (!KEY) { console.error('Faltou --key <serviceAccount.json>'); process.exit(1); }

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(KEY, 'utf8'))) });
const db = getFirestore();

const digitos = s => String(s || '').replace(/\D/g, '');
const fim8 = s => digitos(s).slice(-8);
// Telefone do ERP ("(91) 98496-7373", sem 55) para o formato da API (5591984967373).
function e164(s) {
  let d = digitos(s);
  if (d.length === 12 || d.length === 13) d = d.replace(/^55/, '');
  // Celular gravado sem o nono dígito (DDD + 8 dígitos começando em 6 a 9).
  if (d.length === 10 && /^[6-9]/.test(d.charAt(2))) d = d.slice(0, 2) + '9' + d.slice(2);
  return d.length === 10 || d.length === 11 ? '55' + d : '';
}
const primeiroNome = s => {
  const p = String(s || '').trim().split(/\s+/)[0] || '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
};
const ultimoEm = arr => (Array.isArray(arr) ? arr : []).reduce((m, x) => {
  const t = Date.parse(x && x.Em); return isNaN(t) ? m : Math.max(m, t);
}, 0);
function mesReferencia(ms) {
  const d = new Date(ms), hoje = new Date();
  return MESES[d.getMonth()] + (d.getFullYear() !== hoje.getFullYear() ? ' de ' + d.getFullYear() : '');
}
const csv = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

(async () => {
  const vs = await db.collection('vendedores').get();
  const vendedores = {};
  vs.forEach(d => { const v = d.data(); vendedores[d.id] = Object.assign({ id: d.id }, v); });
  const ativos = Object.values(vendedores).filter(v =>
    v.Tipo === 'Vendedor' && v.Status === 'Ativo' && e164(v.Telefone)
  ).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (!ativos.length) { console.error('Nenhum vendedor ativo com WhatsApp. Nada a fazer.'); process.exit(1); }
  const ativoPorId = {}; ativos.forEach(v => { ativoPorId[v.id] = v; });

  if (TESTE) return teste(ativoPorId);

  const ps = await db.collection('funil_pipelines').get();
  let comercial = null; const papel = {};
  ps.forEach(d => {
    const p = d.data();
    if (String(p.Nome || '').toLowerCase() === 'comercial') {
      comercial = d.id;
      (p.Etapas || []).forEach(e => { papel[e.Nome] = e.Papel || ''; });
    }
  });
  if (!comercial) { console.error('Pipeline Comercial não encontrado.'); process.exit(1); }

  const [funil, optout, existentes] = await Promise.all([
    db.collection('funil').where('Pipeline', '==', comercial)
      .select('Etapa', 'IdVendedor', 'IdCliente', 'Transicoes', 'Atividades', 'TelefoneCliente', 'NomeCliente').get(),
    db.collection('disparo_optout').get(),
    db.collection('disparos').select().get()
  ]);
  const saiu = new Set(); optout.forEach(d => saiu.add(d.id));
  const jaNaFila = new Set(); existentes.forEach(d => jaNaFila.add(d.id));

  const agora = Date.now();
  const candidatos = [];
  const fora = { semTelefone: 0, saiu: 0, telefoneRepetido: 0, jaNaFila: 0 };
  funil.forEach(doc => {
    const f = doc.data();
    const p = papel[f.Etapa] || '';
    if (p === 'ganho') return;
    const ultimo = Math.max(ultimoEm(f.Transicoes), ultimoEm(f.Atividades));
    let segmento;
    if (p === 'perdido') segmento = 'perdido';
    else if (ultimo && agora - ultimo >= DIAS_PARADO * 86400000) segmento = 'parado';
    else return;
    const tel = e164(f.TelefoneCliente);
    if (!tel) { fora.semTelefone++; return; }
    if (saiu.has(fim8(tel))) { fora.saiu++; return; }
    candidatos.push({ idOportunidade: doc.id, f, segmento, ultimo, tel });
  });

  // Mesmo telefone em mais de um lead: vai uma mensagem só, pelo lead mais recente.
  const porTel = {};
  candidatos.forEach(c => {
    const k = fim8(c.tel);
    if (!porTel[k] || c.ultimo > porTel[k].ultimo) porTel[k] = c;
  });
  const unicos = Object.values(porTel);
  fora.telefoneRepetido = candidatos.length - unicos.length;

  // Dono ativo primeiro, depois o rodízio, sempre na mesma ordem (mais antigo
  // primeiro), pra uma segunda simulação dar o mesmo resultado.
  unicos.sort((a, b) => (a.ultimo || 0) - (b.ultimo || 0));
  let vez = 0;
  const fila = [];
  unicos.forEach((c, i) => {
    const id = CAMPANHA + '-' + c.idOportunidade;
    if (jaNaFila.has(id)) { fora.jaNaFila++; return; }
    let v = ativoPorId[c.f.IdVendedor], redistribuido = false;
    if (!v) { v = ativos[vez % ativos.length]; vez++; redistribuido = true; }
    const nome = primeiroNome(c.f.NomeCliente);
    fila.push({
      id,
      dados: {
        campanha: CAMPANHA, idOportunidade: c.idOportunidade, idCliente: c.f.IdCliente || '',
        idVendedor: v.id, nomeVendedor: primeiroNome(v.Nome), telVendedor: e164(v.Telefone),
        donoAnterior: c.f.IdVendedor || '', redistribuido,
        nomeLead: nome || 'tudo bem', nomeLeadCompleto: c.f.NomeCliente || '',
        telLead: c.tel, telFim8: fim8(c.tel),
        segmento: c.segmento, modelo: MODELOS[c.segmento], referencia: mesReferencia(c.ultimo || agora),
        status: 'fila', ordem: i, criadoEm: agora
      }
    });
  });

  // Resumo
  const resumo = {};
  fila.forEach(({ dados: d }) => {
    const k = d.segmento + ' | ' + vendedores[d.idVendedor].Nome + (d.redistribuido ? ' (rodízio)' : '');
    resumo[k] = (resumo[k] || 0) + 1;
  });
  console.log('Vendedores no disparo: ' + ativos.map(v => v.Nome).join(', '));
  Object.keys(resumo).sort().forEach(k => console.log('  ' + k + ': ' + resumo[k]));
  console.log('Total na fila: ' + fila.length + ' | fora: ' + JSON.stringify(fora));
  console.log('Custo estimado (R$ 0,3217 por entregue): R$ ' + (fila.length * 0.3217).toFixed(2).replace('.', ','));
  const semNome = fila.filter(x => !primeiroNome(x.dados.nomeLeadCompleto)).length;
  if (semNome) console.log('Atenção: ' + semNome + ' lead(s) sem nome; a mensagem sai com "Oi, tudo bem".');

  // CSV pra conferência (tem dado de cliente: fica fora do git, em saida-disparo/).
  const pasta = path.join(__dirname, 'saida-disparo');
  fs.mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(pasta, 'fila-' + new Date().toISOString().slice(0, 10) + '.csv');
  const linhas = [['id', 'segmento', 'lead', 'telefone', 'vendedor', 'rodizio', 'referencia'].join(';')];
  fila.forEach(({ id, dados: d }) => linhas.push([id, d.segmento, d.nomeLeadCompleto, d.telLead, vendedores[d.idVendedor].Nome,
    d.redistribuido ? 'sim' : 'não', d.referencia].map(csv).join(';')));
  fs.writeFileSync(arquivo, '\ufeff' + linhas.join('\n'), 'utf8');
  console.log('CSV: ' + arquivo);

  if (!COMMIT) { console.log('\nSimulação. Nada foi gravado. Confira o CSV e rode de novo com --commit.'); return; }
  for (let i = 0; i < fila.length; i += 400) {
    const lote = db.batch();
    fila.slice(i, i + 400).forEach(({ id, dados }) => lote.create(db.collection('disparos').doc(id), dados));
    await lote.commit();
  }
  console.log('\nGravados ' + fila.length + ' disparos com status "fila".');
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });

// Disparo de teste: um número qualquer, sem lead do funil. O Apps Script não
// mexe em funil quando o disparo tem teste=true.
async function teste(ativoPorId) {
  const [telBruto, nome] = TESTE.split(':');
  const tel = e164(telBruto);
  const v = ativoPorId[arg('--vendedor')];
  if (!tel || !v) { console.error('Use --teste 5591XXXXXXXXX:Nome --vendedor <IdVendedor de um vendedor ativo>. Ativos: ' +
    Object.values(ativoPorId).map(x => x.Nome + ' = ' + x.id).join(', ')); process.exit(1); }
  const id = 'teste-' + crypto.randomBytes(4).toString('hex');
  const dados = {
    campanha: 'teste', idOportunidade: '', idVendedor: v.id, nomeVendedor: primeiroNome(v.Nome), telVendedor: e164(v.Telefone),
    nomeLead: primeiroNome(nome) || 'Teste', nomeLeadCompleto: nome || 'Teste', telLead: tel, telFim8: fim8(tel),
    segmento: 'perdido', modelo: MODELOS.perdido, referencia: mesReferencia(Date.now()), status: 'fila', ordem: -1,
    teste: true, criadoEm: Date.now()
  };
  console.log('Teste ' + id + ': ' + dados.nomeLead + ' -> vendedor ' + v.Nome);
  if (!COMMIT) { console.log('Simulação. Rode com --commit pra pôr na fila.'); return; }
  await db.collection('disparos').doc(id).create(dados);
  console.log('Na fila. Sai na próxima rodada do Apps Script (ou rode disparoEnviarLote pelo editor).');
}
