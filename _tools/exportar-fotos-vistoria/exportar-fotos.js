// Script descartável — roda uma vez, localmente, pra baixar as fotos do
// checklist do serviço "Vistoria de Diagnóstico" (Firestore) numa pasta no
// computador do Felipe e, se PASTA_DRIVE_ID estiver preenchido, também numa
// pasta do Google Drive. Uso: acervo/portfólio pro TCC dele.
//
// A foto pode estar guardada de duas formas na mesma coleção
// (agendamentos_respostas.RespostaFoto): base64 embutido no documento
// (data:image/...;base64,...) ou um link do Drive
// (https://drive.google.com/thumbnail?id=...) — o script trata os dois.
//
// Precisa de uma serviceAccountKey.json nesta pasta (gerada no console do
// Firebase: Configurações do projeto > Contas de serviço > Gerar nova chave
// privada) com acesso ao Firestore. Se PASTA_DRIVE_ID for usado, a MESMA
// conta de serviço precisa ser compartilhada como Editor na pasta do Drive
// de destino (o e-mail está em serviceAccountKey.json, campo client_email).
//
// Depois de rodar, apague/revogue essa chave — ela não deve ficar espalhada.
//
// Uso: npm install && node exportar-fotos.js

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { GoogleAuth } = require('google-auth-library');

// ── CONFIGURAÇÃO ────────────────────────────────────────────────────────
// Nome do serviço (campo "Nome Servico" da coleção servicos) cujas fotos
// de checklist serão exportadas.
const NOME_SERVICO_ALVO = 'Vistoria de Diagnóstico';

// Pasta local onde as fotos serão salvas (criada automaticamente).
const PASTA_LOCAL = path.join(__dirname, 'fotos-vistoria-diagnostico');

// ID da pasta no Google Drive que também vai receber as fotos.
// Pegue o ID na URL da pasta (.../drive/folders/ESSE_PEDAÇO_AQUI),
// compartilhe a pasta com o client_email de serviceAccountKey.json como
// Editor, e cole o ID abaixo. Deixe '' pra pular o envio ao Drive (só
// salva localmente).
const PASTA_DRIVE_ID = '';
// ─────────────────────────────────────────────────────────────────────────

const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const auth = new GoogleAuth({
  credentials: serviceAccount,
  scopes: ['https://www.googleapis.com/auth/drive']
});

var REGEX_DIACRITICOS = new RegExp('[̀-ͯ]', 'g');
function normaliza(s) {
  return String(s || '')
    .normalize('NFD').replace(REGEX_DIACRITICOS, '')
    .toLowerCase().trim();
}

function sanitizaNomeArquivo(s) {
  return String(s || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
}

function formataData(valor) {
  if (!valor) return 'sem-data';
  // 'Data Inicio' normalmente vem como 'YYYY-MM-DD'; se vier assim, troca
  // pra DD-MM-YYYY (mais legível e sem caractere problemático em nome de
  // arquivo). Se vier em outro formato, só sanitiza e usa como está.
  var m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  return sanitizaNomeArquivo(valor);
}

function extensaoDoMime(mime) {
  if (/png/.test(mime)) return 'png';
  if (/webp/.test(mime)) return 'webp';
  if (/gif/.test(mime)) return 'gif';
  return 'jpg';
}

function extraiIdDrive(url) {
  var m = String(url).match(/[?&]id=([^&]+)/) || String(url).match(/\/d\/([^/]+)/);
  return m ? m[1] : null;
}

async function getAccessToken() {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return (token && token.token) ? token.token : token;
}

async function baixarFotoDrive(url) {
  const fileId = extraiIdDrive(url);
  if (!fileId) return null;
  const token = await getAccessToken();
  const resp = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!resp.ok) throw new Error('Drive respondeu ' + resp.status + ' ao baixar arquivo ' + fileId);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const mime = resp.headers.get('content-type') || 'image/jpeg';
  return { buffer, ext: extensaoDoMime(mime) };
}

function decodificarBase64(dataUri) {
  var m = dataUri.match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (!m) return null;
  return { buffer: Buffer.from(m[2], 'base64'), ext: extensaoDoMime(m[1]) };
}

async function uploadParaDrive(nomeArquivo, buffer, mime) {
  if (!PASTA_DRIVE_ID) return;
  const token = await getAccessToken();
  const boundary = 'sgexport' + Date.now();
  const metadata = JSON.stringify({ name: nomeArquivo, parents: [PASTA_DRIVE_ID] });
  const corpo = Buffer.concat([
    Buffer.from(
      '--' + boundary + '\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      metadata + '\r\n' +
      '--' + boundary + '\r\n' +
      'Content-Type: ' + mime + '\r\n\r\n', 'utf8'),
    buffer,
    Buffer.from('\r\n--' + boundary + '--', 'utf8')
  ]);
  const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'multipart/related; boundary=' + boundary
    },
    body: corpo
  });
  if (!resp.ok) throw new Error('Drive respondeu ' + resp.status + ' ao subir "' + nomeArquivo + '": ' + (await resp.text()));
}

// Firestore só aceita até 30 valores no operador 'in' — busca em lotes.
async function buscarPorIdsEmLotes(colecao, campo, ids) {
  const resultados = [];
  for (let i = 0; i < ids.length; i += 30) {
    const lote = ids.slice(i, i + 30);
    if (!lote.length) continue;
    const snap = await db.collection(colecao).where(campo, 'in', lote).get();
    snap.forEach(doc => resultados.push(doc.data()));
  }
  return resultados;
}

async function main() {
  fs.mkdirSync(PASTA_LOCAL, { recursive: true });

  console.log('Procurando o serviço "' + NOME_SERVICO_ALVO + '"...');
  const servicosSnap = await db.collection('servicos').get();
  const idsServico = [];
  servicosSnap.forEach(doc => {
    const d = doc.data();
    if (normaliza(d['Nome Servico']) === normaliza(NOME_SERVICO_ALVO)) idsServico.push(d.IdServico);
  });
  if (!idsServico.length) {
    console.log('Nenhum serviço encontrado com esse nome. Serviços existentes:');
    servicosSnap.forEach(doc => console.log('  - ' + doc.data()['Nome Servico']));
    process.exit(1);
  }
  console.log('Serviço(s) encontrado(s): ' + idsServico.join(', '));

  console.log('Buscando agendamentos desse serviço...');
  const agendamentos = await buscarPorIdsEmLotes('agendamentos', 'IdServico', idsServico);
  const agendamentoPorId = {};
  agendamentos.forEach(a => { agendamentoPorId[a.IdAgendamento] = a; });
  console.log(agendamentos.length + ' agendamento(s) encontrado(s).');

  console.log('Buscando os campos do checklist desse serviço...');
  const templates = await buscarPorIdsEmLotes('templates', 'IdServico', idsServico);
  const templatePorId = {};
  templates.forEach(t => { templatePorId[t.IdTemplate] = t; });

  console.log('Buscando as respostas com foto...');
  const idsAgendamento = Object.keys(agendamentoPorId);
  const respostas = await buscarPorIdsEmLotes('agendamentos_respostas', 'IdAgendamento', idsAgendamento);
  const comFoto = respostas.filter(r => r.RespostaFoto && String(r.RespostaFoto).trim());
  console.log(comFoto.length + ' resposta(s) com foto.');

  const usados = new Map();
  let ok = 0, falhou = 0;

  for (const r of comFoto) {
    const agendamento = agendamentoPorId[r.IdAgendamento] || {};
    const template = templatePorId[r.IdTemplate] || {};
    const nomeCliente = sanitizaNomeArquivo(agendamento.NomeCliente || 'Cliente desconhecido');
    const data = formataData(agendamento['Data Inicio']);
    const campo = sanitizaNomeArquivo(template.TextoPergunta || r.IdTemplate || 'campo');

    const base = nomeCliente + ' - ' + data + ' - ' + campo;
    const contador = usados.get(base) || 0;
    const nomeArquivoSemExt = contador > 0 ? (base + ' (' + (contador + 1) + ')') : base;
    usados.set(base, contador + 1);

    try {
      const valor = String(r.RespostaFoto);
      let resultado = null;
      if (/^data:image/.test(valor)) {
        resultado = decodificarBase64(valor);
      } else if (/drive\.google\.com/.test(valor)) {
        resultado = await baixarFotoDrive(valor);
      }
      if (!resultado) { console.log('  (pulei — formato não reconhecido) ' + base); falhou++; continue; }

      const nomeArquivo = nomeArquivoSemExt + '.' + resultado.ext;
      fs.writeFileSync(path.join(PASTA_LOCAL, nomeArquivo), resultado.buffer);
      if (PASTA_DRIVE_ID) {
        await uploadParaDrive(nomeArquivo, resultado.buffer, 'image/' + (resultado.ext === 'jpg' ? 'jpeg' : resultado.ext));
      }
      ok++;
      if (ok % 25 === 0) console.log('  ' + ok + ' fotos exportadas até agora...');
    } catch (err) {
      console.log('  erro em "' + base + '": ' + err.message);
      falhou++;
    }
  }

  console.log('\nConcluído: ' + ok + ' foto(s) salva(s) em ' + PASTA_LOCAL + (PASTA_DRIVE_ID ? ' e enviada(s) ao Drive' : '') + '.');
  if (falhou) console.log(falhou + ' resposta(s) não puderam ser baixadas (ver mensagens de erro acima).');
}

main().catch(err => { console.error(err); process.exit(1); });
