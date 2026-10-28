/**
 * Monta a fila do disparo de reativação pela API do WhatsApp (2026-10-26).
 *
 * Lê o funil (pipeline Comercial) e grava um documento por lead em
 * `disparos/{CAMPANHA}-{IdOportunidade}`, com status `fila`. Quem manda é o
 * Apps Script (disparoEnviarLote), de hora em hora, com cota por vendedor.
 *
 * Segmentos:
 *   perdido    lead na etapa de papel "perdido"
 *   parado     lead aberto sem movimento há 30+ dias (última transição de
 *              etapa ou atividade)
 *   aberto     lead aberto com movimento mais recente (entra desde 28/10)
 *   sem funil  cliente do cadastro sem nenhum lead no funil: ganha um lead
 *              "Novo Lead" no Comercial na hora de gravar (28/10)
 *
 * Regra de 28/10 (Felipe): entra todo mundo que não tem venda criada, menos
 * as etapas Ganho, Negociação e Serviço Agendado (papel ganho ou proposta), e
 * Gerar Proposta só com 20+ dias parado.
 *
 * Dono: se o vendedor do lead (ou o Vendedor Responsavel do cliente) está
 * ativo e tem WhatsApp, fica com ele. Senão o lead vai pro rodízio entre os
 * vendedores ativos com WhatsApp (decisão do Felipe, 2026-10-26). O IdVendedor
 * de lead que já existe NÃO muda aqui: só muda quando o lead interage (Apps
 * Script).
 *
 * Ficam de fora: cliente com venda (IdCliente ou telefone em `vendas`),
 * telefone inválido, telefone que pediu pra sair (`disparo_optout`), telefone
 * que já está em algum disparo e o mesmo telefone em mais de um lead (vai o
 * mais recente).
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
const DIAS_PROPOSTA = 20;
// Lead criado para cliente sem funil: o mesmo serviço e valor que os vendedores
// usam no lead novo (Vistoria de Diagnóstico, R$ 400).
const SERVICO_NOVO = 'c2ad6230', VALOR_NOVO = 400;
// Sem data de contato, o "Em {{2}} a gente entrou em contato" vira "Em outra ocasião".
const REFERENCIA_SEM_FUNIL = 'outra ocasião';
// Um modelo só pra todos os segmentos (decisão do Felipe, 2026-10-26): o texto
// não cita proposta nem vendedor. O segmento continua no disparo pra notificação.
const MODELOS = { perdido: 'reativacao_usina_v1', parado: 'reativacao_usina_v1', aberto: 'reativacao_usina_v1', 'sem funil': 'reativacao_usina_v1' };
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

  if (TESTE) return teste(vendedores);

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

  const [funil, todoFunil, clientes, vendas, optout, existentes] = await Promise.all([
    db.collection('funil').where('Pipeline', '==', comercial)
      .select('Etapa', 'IdVendedor', 'IdCliente', 'Transicoes', 'Atividades', 'TelefoneCliente', 'NomeCliente').get(),
    db.collection('funil').select('IdCliente', 'TelefoneCliente').get(),
    db.collection('clientes').get(),
    db.collection('vendas').select('IdCliente', 'TelefoneCliente').get(),
    db.collection('disparo_optout').get(),
    db.collection('disparos').select('telFim8').get()
  ]);
  const saiu = new Set(); optout.forEach(d => saiu.add(d.id));
  const jaNaFila = new Set(), telNaFila = new Set();
  existentes.forEach(d => { jaNaFila.add(d.id); telNaFila.add(d.get('telFim8')); });
  // Quem tem venda criada fica de fora, achado pelo IdCliente ou pelo telefone.
  const vendeuId = new Set(), vendeuTel = new Set();
  vendas.forEach(d => {
    const v = d.data();
    if (v.IdCliente) vendeuId.add(String(v.IdCliente));
    if (fim8(v.TelefoneCliente).length === 8) vendeuTel.add(fim8(v.TelefoneCliente));
  });
  const vendeu = (idCliente, tel) => (idCliente && vendeuId.has(String(idCliente))) || vendeuTel.has(fim8(tel));
  const comFunilId = new Set(), comFunilTel = new Set();
  todoFunil.forEach(d => {
    const f = d.data();
    if (f.IdCliente) comFunilId.add(String(f.IdCliente));
    if (fim8(f.TelefoneCliente).length === 8) comFunilTel.add(fim8(f.TelefoneCliente));
  });

  const agora = Date.now();
  const candidatos = [];
  const fora = { vendeu: 0, semTelefone: 0, saiu: 0, telefoneRepetido: 0, jaNaFila: 0 };
  function aceitar(c) {
    if (!c.tel) { fora.semTelefone++; return; }
    if (saiu.has(fim8(c.tel))) { fora.saiu++; return; }
    if (telNaFila.has(fim8(c.tel)) && !jaNaFila.has(CAMPANHA + '-' + c.idOportunidade)) { fora.jaNaFila++; return; }
    candidatos.push(c);
  }
  funil.forEach(doc => {
    const f = doc.data();
    const p = papel[f.Etapa] || '';
    if (p === 'ganho' || p === 'proposta') return;
    const ultimo = Math.max(ultimoEm(f.Transicoes), ultimoEm(f.Atividades));
    const dias = ultimo ? (agora - ultimo) / 86400000 : Infinity;
    if (f.Etapa === 'Gerar Proposta' && dias < DIAS_PROPOSTA) return;
    if (vendeu(f.IdCliente, f.TelefoneCliente)) { fora.vendeu++; return; }
    const segmento = p === 'perdido' ? 'perdido' : dias >= DIAS_PARADO ? 'parado' : 'aberto';
    aceitar({ idOportunidade: doc.id, f, segmento, ultimo, tel: e164(f.TelefoneCliente) });
  });

  // Cliente do cadastro sem nenhum lead no funil (em qualquer pipeline) e sem
  // venda: ganha um lead novo, com id gerado aqui no formato do ERP.
  clientes.forEach(doc => {
    const c = doc.data();
    const idCliente = String(c.IdCliente || doc.id);
    if (comFunilId.has(idCliente) || comFunilTel.has(fim8(c.Telefone))) return;
    if (vendeu(idCliente, c.Telefone)) { fora.vendeu++; return; }
    const f = { IdCliente: idCliente, IdVendedor: c['Vendedor Responsavel'] || '', NomeCliente: c['Nome Razao Social'] || '', TelefoneCliente: c.Telefone };
    aceitar({ idOportunidade: crypto.randomBytes(4).toString('hex'), f, segmento: 'sem funil', ultimo: 0, tel: e164(c.Telefone), novo: true });
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
  // primeiro), pra uma segunda simulação dar o mesmo resultado. A ordem
  // continua depois dos disparos que já existem.
  unicos.sort((a, b) => (a.ultimo || 0) - (b.ultimo || 0) || String(a.f.NomeCliente).localeCompare(String(b.f.NomeCliente)));
  let vez = 0;
  const fila = [];
  unicos.forEach((c, i) => {
    const id = CAMPANHA + '-' + c.idOportunidade;
    if (jaNaFila.has(id)) { fora.jaNaFila++; return; }
    i += existentes.size;
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
        segmento: c.segmento, modelo: MODELOS[c.segmento],
        referencia: c.novo ? REFERENCIA_SEM_FUNIL : mesReferencia(c.ultimo || agora),
        status: 'fila', ordem: i, criadoEm: agora
      },
      // Lead novo no Comercial, do jeito que o salvarFunil do ERP grava.
      funil: c.novo ? {
        IdOportunidade: c.idOportunidade, IdCliente: c.f.IdCliente, IdVendedor: v.id, IdServico: SERVICO_NOVO,
        Etapa: 'Novo Lead', Observacoes: 'Cliente sem funil incluído no disparo de reativação (' + new Date(agora).toLocaleDateString('pt-BR', { timeZone: 'America/Belem' }) + ').',
        'Valor Estimado': VALOR_NOVO, MotivoPerda: '', NomeCliente: c.f.NomeCliente, TelefoneCliente: c.f.TelefoneCliente,
        Pipeline: comercial, DataCriacao: new Date(agora).toLocaleDateString('en-CA', { timeZone: 'America/Belem' }),
        EtapasPassadas: ['Novo Lead'], Transicoes: [{ Etapa: 'Novo Lead', Em: new Date(agora).toISOString() }]
      } : null
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
  console.log('Total na fila: ' + fila.length + ' | leads novos no funil: ' + fila.filter(x => x.funil).length + ' | fora: ' + JSON.stringify(fora));
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
  // Lead novo e disparo no mesmo lote: um não existe sem o outro.
  const { FieldValue } = require('firebase-admin/firestore');
  for (let i = 0; i < fila.length; i += 200) {
    const lote = db.batch();
    fila.slice(i, i + 200).forEach(({ id, dados, funil }) => {
      if (funil) lote.create(db.collection('funil').doc(funil.IdOportunidade), Object.assign({ CriadoEm: FieldValue.serverTimestamp() }, funil));
      lote.create(db.collection('disparos').doc(id), dados);
    });
    await lote.commit();
  }
  console.log('\nGravados ' + fila.length + ' disparos com status "fila" e ' + fila.filter(x => x.funil).length + ' leads novos no funil.');
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });

// Disparo de teste: um número qualquer, sem lead do funil. O Apps Script não
// mexe em funil quando o disparo tem teste=true. O "vendedor" do teste pode ser
// qualquer usuário ativo com WhatsApp (ex.: o próprio Felipe), e "proprio" no
// lugar do telefone usa o WhatsApp desse usuário como o do lead.
async function teste(vendedores) {
  const [telBruto, nome] = TESTE.split(':');
  const v = vendedores[arg('--vendedor')];
  const tel = telBruto === 'proprio' && v ? e164(v.Telefone) : e164(telBruto);
  if (!tel || !v || v.Status !== 'Ativo' || !e164(v.Telefone)) { console.error('Use --teste 5591XXXXXXXXX:Nome (ou proprio:Nome) --vendedor <IdVendedor ativo com WhatsApp>.'); process.exit(1); }
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
