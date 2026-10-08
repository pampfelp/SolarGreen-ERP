// Testa a antessala de leads do site contra o emulador do Firestore:
//  1) as regras (firestore.rules): o que o público pode e não pode fazer
//  2) o motor de promoção (js/leads-site-motor.js)
// Uso, na pasta _tools:  node testar-leads-site.js
// Precisa de Java e do jar do emulador que o firebase-tools já baixou em
// ~/.cache/firebase/emulators. Nada é gravado em produção.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const PORTA = 8089;
const HOST = '127.0.0.1';
const PROJETO = 'demo-sg-leads';
const JAR = path.join(os.homedir(), '.cache', 'firebase', 'emulators', 'cloud-firestore-emulator-v1.19.8.jar');
const RAIZ = path.join(__dirname, '..');
process.env.FIRESTORE_EMULATOR_HOST = HOST + ':' + PORTA;

let falhas = 0, passou = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok     ' : 'FALHOU ') + msg); cond ? passou++ : falhas++; };
const esperar = ms => new Promise(r => setTimeout(r, ms));

function portaAberta() {
  return new Promise(res => { const s = net.connect(PORTA, HOST); s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
}

const BASE = 'http://' + HOST + ':' + PORTA + '/v1/projects/' + PROJETO + '/databases/(default)/documents';
// Token sem assinatura: o emulador aceita e usa como "usuário logado" nas regras.
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const LOGADO = 'Bearer ' + b64({ alg: 'none' }) + '.' + b64({ user_id: 'u1', sub: 'u1' }) + '.';

async function gravarComoPublico(colecao, id, campos, { comoLogado = false, tempo = true } = {}) {
  // commit com serverTimestamp (REQUEST_TIME), que é o que o SDK do site faz
  const fields = {};
  for (const [k, v] of Object.entries(campos)) fields[k] = valor(v);
  const write = { update: { name: 'projects/' + PROJETO + '/databases/(default)/documents/' + colecao + '/' + id, fields },
    currentDocument: { exists: false } };
  if (tempo) write.updateTransforms = [{ fieldPath: 'criadoEm', setToServerValue: 'REQUEST_TIME' }];
  const r = await fetch(BASE.replace('/documents', '/documents:commit'), {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(comoLogado ? { Authorization: LOGADO } : {}) },
    body: JSON.stringify({ writes: [write] }),
  });
  return r.status;
}
function valor(v) {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  return { doubleValue: v };
}
async function metodo(m, caminho, { comoLogado = false, corpo } = {}) {
  const r = await fetch(BASE + '/' + caminho, { method: m, headers: { 'Content-Type': 'application/json', ...(comoLogado ? { Authorization: LOGADO } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  return r.status;
}

function leadValido(id, extra = {}) {
  return { id, nome: 'Maria Teste', whatsapp: '91987598592', whatsappFim8: '87598592', servico: 'Limpeza e manutenção',
    consentimento: true, origem: 'Site', status: 'novo', ...extra };
}

async function testarRegras() {
  console.log('\n== Regras: o que o público pode fazer ==');
  ok(await gravarComoPublico('leads_site', 'a1', leadValido('a1')) === 200, 'público cria lead válido');
  ok(await gravarComoPublico('leads_site', 'a2', leadValido('a2', { cidade: 'Belém', calcPlacas: 12, calcPotenciaW: 585, calcKwp: 7.02, calcCidade: 'Belém', calcForaDaLista: false, calcDesempenho: 0.82, calcTarifa: 0.98, calcPerdaAno: 1974.3, tempoPreenchimentoMs: 5200, suspeito: false, pagina: '/', utmSource: 'instagram', consentimentoVersao: '2026-09-29' })) === 200, 'público cria lead com diagnóstico da calculadora');
  console.log('-- recusas');
  ok(await gravarComoPublico('leads_site', 'b1', leadValido('b1', { admin: true })) === 403, 'campo extra não previsto é recusado (mass assignment)');
  ok(await gravarComoPublico('leads_site', 'b2', leadValido('b2', { consentimento: false })) === 403, 'sem consentimento é recusado');
  ok(await gravarComoPublico('leads_site', 'b3', leadValido('b3', { whatsapp: '9198' })) === 403, 'telefone curto é recusado');
  ok(await gravarComoPublico('leads_site', 'b4', leadValido('b4', { whatsapp: '91987598592abc' })) === 403, 'telefone com letra é recusado');
  ok(await gravarComoPublico('leads_site', 'b5', leadValido('b5', { whatsappFim8: '12345678' })) === 403, 'fim8 que não bate com o telefone é recusado');
  ok(await gravarComoPublico('leads_site', 'b6', leadValido('outro')) === 403, 'campo id diferente do id do documento é recusado');
  ok(await gravarComoPublico('leads_site', 'b7', leadValido('b7', { status: 'promovido' })) === 403, 'status diferente de "novo" é recusado');
  ok(await gravarComoPublico('leads_site', 'b8', leadValido('b8', { origem: 'Instagram' })) === 403, 'origem diferente de "Site" é recusada');
  ok(await gravarComoPublico('leads_site', 'b9', leadValido('b9', { nome: 'x'.repeat(121) })) === 403, 'nome com 121 caracteres é recusado');
  ok(await gravarComoPublico('leads_site', 'b10', leadValido('b10', { calcPlacas: '12' })) === 403, 'número enviado como texto é recusado');
  ok(await gravarComoPublico('leads_site', 'b11', leadValido('b11', { calcDesempenho: 5 })) === 403, 'desempenho absurdo é recusado');
  ok(await gravarComoPublico('leads_site', 'b12', leadValido('b12'), { tempo: false }) === 403, 'sem carimbo de horário do servidor é recusado');
  ok(await gravarComoPublico('leads_site', 'b13', { ...leadValido('b13'), criadoEm: 'ontem' }, { tempo: false }) === 403, 'horário escrito pelo cliente é recusado');
  ok(await gravarComoPublico('clientes', 'x1', { nome: 'invasor' }, { tempo: false }) === 403, 'público não escreve em clientes');
  ok(await gravarComoPublico('funil', 'x2', { nome: 'invasor' }, { tempo: false }) === 403, 'público não escreve em funil');
  console.log('-- o público nunca lê nem altera');
  ok(await metodo('GET', 'leads_site/a1') === 403, 'público não lê um lead');
  ok(await metodo('GET', 'leads_site') === 403, 'público não lista os leads');
  ok(await metodo('PATCH', 'leads_site/a1?updateMask.fieldPaths=nome', { corpo: { fields: { nome: { stringValue: 'x' } } } }) === 403, 'público não altera um lead');
  ok(await metodo('DELETE', 'leads_site/a1') === 403, 'público não apaga um lead');
  console.log('-- equipe logada');
  ok(await metodo('GET', 'leads_site/a1', { comoLogado: true }) === 200, 'equipe logada lê o lead');
  ok(await metodo('PATCH', 'leads_site/a1?updateMask.fieldPaths=status', { comoLogado: true, corpo: { fields: { status: { stringValue: 'promovido' } } } }) === 200, 'equipe logada atualiza o status');
  ok(await metodo('DELETE', 'leads_site/a1', { comoLogado: true }) === 403, 'ninguém apaga lead, nem a equipe');
  console.log('-- tarifa pública');
  ok(await metodo('PATCH', 'config_publica/site?updateMask.fieldPaths=tarifa', { comoLogado: true, corpo: { fields: { tarifa: { doubleValue: 0.98 } } } }) === 200, 'equipe grava a tarifa pública');
  ok(await metodo('GET', 'config_publica/site') === 200, 'público lê a tarifa');
  ok(await metodo('PATCH', 'config_publica/site?updateMask.fieldPaths=tarifa', { corpo: { fields: { tarifa: { doubleValue: 9 } } } }) === 403, 'público não altera a tarifa');
  ok(await metodo('GET', 'config/rodizio_site') === 403, 'público não lê `config` (só `config_publica`)');
  console.log('-- notificações (2026-10-08)');
  const aparelho = { fields: { token: { stringValue: 'tok-1' }, idVendedor: { stringValue: 'V1' }, aparelho: { stringValue: 'teste' }, atualizadoEm: { integerValue: '1' } } };
  ok(await metodo('PATCH', 'push_tokens/h1', { corpo: aparelho }) === 403, 'público não cadastra aparelho de push');
  ok(await metodo('PATCH', 'push_tokens/h1', { comoLogado: true, corpo: aparelho }) === 200, 'equipe logada cadastra o próprio aparelho');
  ok(await metodo('PATCH', 'push_tokens/h2', { comoLogado: true, corpo: { fields: { ...aparelho.fields, admin: { booleanValue: true } } } }) === 403, 'aparelho com campo fora do previsto é recusado');
  ok(await metodo('GET', 'push_tokens/h1', { comoLogado: true }) === 403 && await metodo('GET', 'push_tokens', { comoLogado: true }) === 403, 'ninguém logado lê ou lista os aparelhos (só o Apps Script)');
  ok(await metodo('DELETE', 'push_tokens/h1', { comoLogado: true }) === 200, 'equipe logada apaga o aparelho ao sair');
  ok(await metodo('PATCH', 'notificacoes_lidas/V1', { comoLogado: true, corpo: { fields: { lidas: { mapValue: { fields: { 'x:lead': { integerValue: '1' } } } } } } }) === 200, 'equipe logada grava o que já leu');
  ok(await metodo('GET', 'notificacoes_lidas/V1') === 403, 'público não lê as notificações lidas');
}

async function testarMotor() {
  console.log('\n== Motor de promoção ==');
  const { initializeApp } = require('firebase-admin/app');
  const { getFirestore, Timestamp } = require('firebase-admin/firestore');
  initializeApp({ projectId: PROJETO });
  const db = getFirestore();
  const motor = require(path.join(RAIZ, 'js', 'leads-site-motor.js'));

  const fim8 = t => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-8) : null; };
  const formatar = v => { const d = String(v).replace(/\D/g, '').slice(-11); return d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7) : d; };
  const lista = async c => (await db.collection(c).get()).docs.map(d => d.data());
  let contador = 0, chamadasFunil = 0;
  const limpar = async () => { for (const c of ['leads_site', 'clientes', 'funil', 'vendedores', 'servicos', 'funil_pipelines', 'config']) { const s = await db.collection(c).get(); for (const d of s.docs) await d.ref.delete(); } };

  function novoMotor(extra = {}) {
    let agoraFixo = extra.agora;
    const deps = {
      db, agora: () => (agoraFixo || Date.now()), sessao: () => ({ idVendedor: 'ADM1' }),
      gerarId: () => 'id' + (++contador), ehVendedorAtivo: v => (v.Tipo || '').trim() === 'Vendedor' && (v.Status || '').trim() === 'Ativo',
      fim8, formatarTelefone: formatar, log: () => {},
      obterClientes: () => lista('clientes'), obterVendedores: () => lista('vendedores'), obterServicos: () => lista('servicos'), obterPipelines: () => lista('funil_pipelines'),
      salvarCliente: async p => { await db.collection('clientes').doc(p.idCliente).set({ IdCliente: p.idCliente, 'Nome Razao Social': p.nome, 'Tipo Pessoa': p.tipoPessoa, Telefone: p.telefone, Origem: p.origem, 'Status Cliente': p.statusCliente, 'Vendedor Responsavel': p.vendedorResponsavel }); return { ok: true }; },
      salvarFunil: async p => { await db.collection('funil').doc(p.idOportunidade).set({ IdOportunidade: p.idOportunidade, IdCliente: p.idCliente, IdVendedor: p.idVendedor, IdServico: p.idServico, Etapa: p.etapa, Observacoes: p.observacoes, 'Valor Estimado': p.valorEstimado, Pipeline: p.pipeline, Origem: p.origem, VendedorAnterior: p.vendedorAnterior || null }, { merge: true }); return { ok: true }; },
      ...extra.deps,
    };
    const original = deps.salvarFunil;
    deps.salvarFunil = async p => { chamadasFunil++; return original(p); };
    return { motor: motor.criar(deps), deps, fixarAgora: t => { agoraFixo = t; } };
  }
  // O que o navegador entrega ao motor: os documentos com o horário em milissegundos.
  async function listaDoNavegador() {
    return (await db.collection('leads_site').get()).docs.map(d => { const x = d.data(); x.criadoEmMs = x.criadoEm && x.criadoEm.toMillis ? x.criadoEm.toMillis() : (x.criadoEmMs || 0); return x; });
  }
  // Sem horário informado, o lead nasce há 2 min: já passou da espera pelo
  // sorteio do Apps Script, então o navegador sorteia sozinho (caso que estes
  // testes cobrem). A espera em si tem teste próprio (11).
  async function semear(id, extra = {}, criadoEmMs) {
    await db.collection('leads_site').doc(id).set({ ...leadValido(id), criadoEm: Timestamp.fromMillis(criadoEmMs || Date.now() - 2 * 60 * 1000), ...extra });
  }
  const get = async (c, id) => (await db.collection(c).doc(id).get()).data();
  const ativos = async () => { await db.collection('vendedores').doc('V1').set({ IdVendedor: 'V1', Tipo: 'Vendedor', Status: 'Ativo' }); await db.collection('vendedores').doc('V2').set({ IdVendedor: 'V2', Tipo: 'Vendedor', Status: 'Ativo' }); await db.collection('vendedores').doc('V3').set({ IdVendedor: 'V3', Tipo: 'Vendedor', Status: 'Inativo' }); await db.collection('vendedores').doc('T1').set({ IdVendedor: 'T1', Tipo: 'Técnico', Status: 'Ativo' }); };

  // 1) unidade: serviço, pipeline, observação
  const servicos = [{ IdServico: 'S1', 'Nome Servico': 'Lavagem e Manutenção Preventiva' }, { IdServico: 'S2', 'Nome Servico': 'Monitoramento Remoto' }, { IdServico: 'S3', 'Nome Servico': 'Homologação Equatorial' }];
  ok(motor.mapearServico('Limpeza e manutenção', servicos) === 'S1', 'serviço "Limpeza e manutenção" casa com o catálogo pelo nome');
  ok(motor.mapearServico('Monitoramento', servicos) === 'S2' && motor.mapearServico('Regularização na Equatorial', servicos) === 'S3', 'monitoramento e regularização casam');
  ok(motor.mapearServico('Ainda não sei', servicos) === '' && motor.mapearServico('Expansão da usina', servicos) === '', 'sem correspondência: lead entra sem serviço');
  // Catálogo real da Solar Green (conferido em produção, 2026-09-29): "Limpeza e
  // manutenção" bate em quatro serviços diferentes ao mesmo tempo. Adivinhar
  // qual é pior que deixar em branco pro vendedor escolher com o cliente.
  const catalogoReal = ['Manutenção Corretiva', 'Limpeza no Telhado', 'Manutenção Drywall', 'Limpeza', 'Manutenção Preventiva',
    'Homologaçaõ Sistema Fotovoltaico', 'Plano de Monitoramento 49,90', 'Plano Monitoramento R$39,90', 'Expansão de Módulos', 'Vistoria de Diagnóstico']
    .map((n, i) => ({ IdServico: 'R' + i, 'Nome Servico': n }));
  ok(motor.mapearServico('Limpeza e manutenção', catalogoReal) === '', '"Limpeza e manutenção" no catálogo real (4 candidatos) fica sem serviço, não adivinha');
  ok(motor.mapearServico('Monitoramento', catalogoReal) === '', '"Monitoramento" no catálogo real (2 planos concorrentes) também fica sem serviço');
  ok(motor.mapearServico('Regularização na Equatorial', catalogoReal) === 'R5', 'só a Regularização tem candidato único no catálogo real (Homologaçaõ)');
  ok(motor.mapearServico('Expansão da usina', catalogoReal) === 'R8', 'e só a Expansão tem candidato único (Expansão de Módulos)');
  ok(motor.escolherPipeline([{ IdPipeline: 'P9', Nome: 'Administrativo', Etapas: [{ Nome: 'A fazer' }] }, { IdPipeline: 'P1', Nome: 'Comercial', Etapas: [{ Nome: 'Novo Lead' }] }]) === 'P1', 'pipeline é o Comercial (com "Novo Lead")');
  const obs = motor.montarObservacoes({ servico: 'Monitoramento', cidade: 'Belém', calcPlacas: 12, calcPotenciaW: 585, calcKwp: 7.02, calcCidade: 'Belém', calcDesempenho: 0.82, calcTarifa: 0.98, calcPerdaAno: 1974, utmSource: 'instagram' }, false);
  ok(/12 placas de 585 W \(7,02 kWp\) em Belém/.test(obs) && /desempenho estimado 82%/.test(obs) && /R\$ 1\.974 por ano/.test(obs) && /tarifa R\$ 0,98\/kWh/.test(obs) && /Campanha: instagram/.test(obs), 'observação leva o diagnóstico da calculadora');

  // 2) promoção de cliente novo, dono em rodízio
  await limpar(); await ativos(); await db.collection('funil_pipelines').doc('P1').set({ IdPipeline: 'P1', Nome: 'Comercial', Etapas: [{ Nome: 'Novo Lead', Ordem: 1 }] });
  for (const s of servicos) await db.collection('servicos').doc(s.IdServico).set(s);
  let { motor: m1 } = novoMotor();
  const tel = n => '9198800000' + n;
  for (let i = 1; i <= 5; i++) await semear('r' + i, { nome: 'Lead ' + i, whatsapp: tel(i), whatsappFim8: tel(i).slice(-8), calcPlacas: 12, calcPotenciaW: 585, calcKwp: 7.02, calcPerdaAno: 1974 }, 1000 + i);
  await m1.processar(await listaDoNavegador());
  const funis = await lista('funil');
  const donos = [];
  for (let i = 1; i <= 5; i++) donos.push((await get('leads_site', 'r' + i)).idVendedor);
  ok(funis.length === 5, '5 leads viraram 5 leads no funil');
  ok(JSON.stringify(donos) === JSON.stringify(['V1', 'V2', 'V1', 'V2', 'V1']), 'rodízio só entre vendedores ativos (V3 inativo e técnico ficam fora): ' + donos.join(','));
  const r1 = await get('leads_site', 'r1');
  const f1 = funis.find(f => f.IdCliente === r1.idCliente);
  ok(f1.Etapa === 'Novo Lead' && f1.Origem === 'Site' && f1.Pipeline === 'P1' && f1['Valor Estimado'] === 0 && f1.IdServico === 'S1', 'lead nasce em "Novo Lead", origem Site, pipeline Comercial, valor 0, serviço mapeado');
  const c1 = await get('clientes', r1.idCliente);
  ok(c1.Origem === 'Site' && c1['Status Cliente'] === 'Lead' && c1['Nome Razao Social'] === 'Lead 1' && /^\(91\) 98800-0001$/.test(c1.Telefone), 'cliente novo: origem Site, status Lead, telefone formatado');
  ok((await get('leads_site', 'r1')).status === 'promovido' && (await get('leads_site', 'r1')).clienteJaExistia === false, 'lead da antessala fica "promovido" e aponta para o cliente e o lead do funil');

  // 3) cliente que já existe (formatos diferentes de telefone)
  await limpar(); await ativos(); await db.collection('funil_pipelines').doc('P1').set({ IdPipeline: 'P1', Nome: 'Comercial', Etapas: [{ Nome: 'Novo Lead' }] });
  await db.collection('clientes').doc('C7').set({ IdCliente: 'C7', 'Nome Razao Social': 'Ana Antiga', Telefone: '+55 (91) 98759-8592' });
  ({ motor: m1 } = novoMotor());
  await semear('e1', { whatsapp: '91987598592', whatsappFim8: '87598592', nome: 'Ana Nova' });
  await m1.processar(await listaDoNavegador());
  ok((await lista('clientes')).length === 1 && (await get('leads_site', 'e1')).idCliente === 'C7' && (await get('leads_site', 'e1')).clienteJaExistia === true, 'telefone igual nos 8 últimos dígitos reaproveita o cliente, sem duplicar');
  ok((await lista('funil')).length === 1 && (await lista('funil'))[0].IdCliente === 'C7', 'o lead novo aponta para o cliente que já existia');

  // 4) duplicado em 24 h
  await semear('d1', { whatsapp: '91987598592', whatsappFim8: '87598592' }, 5000);
  await m1.processar(await listaDoNavegador());
  ok((await get('leads_site', 'd1')).status === 'duplicado' && (await get('leads_site', 'd1')).duplicadoDe === 'e1' && (await lista('funil')).length === 1, 'mesmo telefone e mesmo serviço em 24 h vira "duplicado" e não cria outro lead');
  await semear('d2', { whatsapp: '91987598592', whatsappFim8: '87598592', servico: 'Monitoramento' }, 6000);
  await m1.processar(await listaDoNavegador());
  ok((await get('leads_site', 'd2')).status === 'promovido' && (await lista('funil')).length === 2, 'mesmo telefone, serviço diferente: é outro lead');

  // 5) suspeito não é promovido
  await semear('s1', { suspeito: true, whatsapp: '91981112222', whatsappFim8: '81112222' });
  const antes = (await lista('clientes')).length;
  await m1.processar(await listaDoNavegador());
  ok((await get('leads_site', 's1')).status === 'suspeito' && (await lista('clientes')).length === antes, 'lead suspeito fica separado e nada é criado');

  // 3b) cliente que já tinha vendedor: lead vai pro da vez e leva o nome do anterior
  await db.collection('clientes').doc('C8').set({ IdCliente: 'C8', 'Nome Razao Social': 'Bia Antiga', Telefone: '91 98444-0000', 'Vendedor Responsavel': 'V2' });
  await semear('ant1', { whatsapp: '91984440000', whatsappFim8: '84440000', nome: 'Bia' });
  await m1.processar(await listaDoNavegador());
  const ant1 = await get('leads_site', 'ant1');
  const funilAnt = (await lista('funil')).find(f => f.IdCliente === 'C8');
  ok(ant1.idCliente === 'C8' && ant1.idVendedor !== 'V2' && ant1.vendedorAnterior === '', 'sem nome cadastrado para o vendedor anterior, a marca fica vazia (V2 sem Nome)');
  await db.collection('vendedores').doc('V2').set({ IdVendedor: 'V2', Nome: 'Bruno Antigo', Tipo: 'Vendedor', Status: 'Ativo' });
  await db.collection('clientes').doc('C9').set({ IdCliente: 'C9', 'Nome Razao Social': 'Caio Antigo', Telefone: '91 98333-0000', 'Vendedor Responsavel': 'V2' });
  await db.collection('config').doc('rodizio_site').set({ ultimoIdVendedor: 'V2', atualizadoEm: 1 });   // a próxima da vez é V1
  await semear('ant2', { whatsapp: '91983330000', whatsappFim8: '83330000', nome: 'Caio' });
  await m1.processar(await listaDoNavegador());
  const ant2 = await get('leads_site', 'ant2');
  const funilAnt2 = (await lista('funil')).find(f => f.IdCliente === 'C9');
  ok(ant2.idVendedor === 'V1' && ant2.vendedorAnterior === 'Bruno Antigo' && funilAnt2.VendedorAnterior === 'Bruno Antigo' && /Vendedor anterior deste cliente: Bruno Antigo/.test(funilAnt2.Observacoes), 'cliente que já tinha vendedor: lead vai pro da vez (V1) e leva o nome do anterior');
  await db.collection('config').doc('rodizio_site').set({ ultimoIdVendedor: 'V1', atualizadoEm: 2 });   // a próxima da vez é V2
  await db.collection('clientes').doc('C10').set({ IdCliente: 'C10', 'Nome Razao Social': 'Dora Antiga', Telefone: '91 98222-0000', 'Vendedor Responsavel': 'V2' });
  await semear('ant3', { whatsapp: '91982220000', whatsappFim8: '82220000', nome: 'Dora' });
  await m1.processar(await listaDoNavegador());
  ok((await get('leads_site', 'ant3')).idVendedor === 'V2' && (await get('leads_site', 'ant3')).vendedorAnterior === '', 'quando o da vez é o mesmo vendedor de antes, não há marca de "anterior"');

  // 6) dois navegadores ao mesmo tempo: só um promove
  await limpar(); await ativos(); await db.collection('funil_pipelines').doc('P1').set({ IdPipeline: 'P1', Nome: 'Comercial', Etapas: [{ Nome: 'Novo Lead' }] });
  chamadasFunil = 0;
  const A = novoMotor().motor, B = novoMotor().motor;
  await semear('k1', { whatsapp: '91985550001', whatsappFim8: '85550001' });
  const lk = await listaDoNavegador();
  await Promise.all([A.processar(lk), B.processar(lk)]);
  ok((await lista('funil')).length === 1 && (await lista('clientes')).length === 1, 'dois navegadores processando o mesmo lead criam um lead só');
  ok(chamadasFunil === 1, 'e só um deles chegou a gravar no funil (a transação de reivindicação decide): ' + chamadasFunil + ' gravação');
  // lista velha: o navegador ainda acha que o lead é "novo", mas o documento já foi promovido
  const antes6 = chamadasFunil;
  await A.processar(lk);
  ok(chamadasFunil === antes6, 'lista desatualizada não promove de novo um lead que já foi promovido');

  // 7) quem reivindicou caiu no meio: outro retoma com os mesmos ids
  await limpar(); await ativos(); await db.collection('funil_pipelines').doc('P1').set({ IdPipeline: 'P1', Nome: 'Comercial', Etapas: [{ Nome: 'Novo Lead' }] });
  const agora = Date.now();
  await semear('p1', { status: 'processando', processandoEm: agora - 5 * 60 * 1000, idOportunidade: 'OPX', idClienteNovo: 'CLX', whatsapp: '91985550002', whatsappFim8: '85550002' });
  await semear('p2', { status: 'processando', processandoEm: agora - 5 * 1000, idOportunidade: 'OPY', idClienteNovo: 'CLY', whatsapp: '91985550003', whatsappFim8: '85550003' });
  const { motor: mp } = novoMotor();
  await mp.processar(await listaDoNavegador());
  const p1 = await get('leads_site', 'p1');
  ok(p1.status === 'promovido' && p1.idOportunidade === 'OPX' && p1.idCliente === 'CLX', 'lead "processando" parado há 5 min é retomado com os mesmos ids');
  ok((await get('leads_site', 'p2')).status === 'processando', 'lead "processando" há 5 s não é tocado (outro navegador está nele)');

  // 8) erro vira status visível e dá pra tentar de novo
  await limpar(); await ativos(); await db.collection('funil_pipelines').doc('P1').set({ IdPipeline: 'P1', Nome: 'Comercial', Etapas: [{ Nome: 'Novo Lead' }] });
  let quebrar = true;
  const { motor: me } = novoMotor({ deps: { salvarFunil: async p => quebrar ? { ok: false, erro: 'sem permissão' } : { ok: (await db.collection('funil').doc(p.idOportunidade).set({ IdOportunidade: p.idOportunidade, Etapa: p.etapa }), true) } } });
  await semear('z1', { whatsapp: '91985550004', whatsappFim8: '85550004' });
  await me.processar(await listaDoNavegador());
  const z1 = await get('leads_site', 'z1');
  ok(z1.status === 'erro' && /sem permissão/.test(z1.erroPromocao), 'falha ao criar o lead vira status "erro" com o motivo, e o loop segue');
  quebrar = false;
  await db.collection('leads_site').doc('z1').update({ status: 'novo' });
  await me.processar(await listaDoNavegador());
  ok((await get('leads_site', 'z1')).status === 'promovido' && (await lista('funil')).length === 1, 'depois de voltar a "novo", a nova tentativa promove');

  // 9) sem vendedor ativo
  await limpar(); await db.collection('funil_pipelines').doc('P1').set({ IdPipeline: 'P1', Nome: 'Comercial', Etapas: [{ Nome: 'Novo Lead' }] });
  const { motor: mn } = novoMotor();
  await semear('n1', { whatsapp: '91985550005', whatsappFim8: '85550005' });
  await mn.processar(await listaDoNavegador());
  const n1 = await get('leads_site', 'n1');
  ok(n1.status === 'promovido' && n1.idVendedor === 'ADM1' && /Nenhum vendedor ativo/.test((await lista('funil'))[0].Observacoes), 'sem vendedor ativo: cai em quem está com o ERP aberto e avisa na observação');

  // 10) ordem de chegada
  await limpar(); await ativos(); await db.collection('funil_pipelines').doc('P1').set({ IdPipeline: 'P1', Nome: 'Comercial', Etapas: [{ Nome: 'Novo Lead' }] });
  const { motor: mo } = novoMotor();
  await semear('o2', { whatsapp: '91985550007', whatsappFim8: '85550007' }, 2000);
  await semear('o1', { whatsapp: '91985550006', whatsappFim8: '85550006' }, 1000);
  await mo.processar(await listaDoNavegador());
  ok((await get('leads_site', 'o1')).idVendedor === 'V1' && (await get('leads_site', 'o2')).idVendedor === 'V2', 'o lead que chegou primeiro é o primeiro do rodízio');
  // 11) lead recém-chegado espera o sorteio do Apps Script
  await limpar(); await ativos(); await db.collection('funil_pipelines').doc('P1').set({ IdPipeline: 'P1', Nome: 'Comercial', Etapas: [{ Nome: 'Novo Lead' }] });
  const agendados = [], avisados = [];
  const { motor: mw } = novoMotor({ deps: { agendar: (fn, ms) => { agendados.push(ms); return 1; }, cancelar: () => {}, avisar: id => avisados.push(id) } });
  await semear('w1', { whatsapp: '91985550008', whatsappFim8: '85550008' }, Date.now() - 10 * 1000);
  await mw.processar(await listaDoNavegador());
  ok((await get('leads_site', 'w1')).status === 'novo' && (await lista('funil')).length === 0, 'lead de 10 s sem sorteio do servidor não é promovido pelo navegador');
  ok(agendados.length === 1 && agendados[0] > 45000 && agendados[0] <= 61000, 'e o motor agenda nova passada pro fim da espera (' + agendados[0] + ' ms)');
  await semear('w2', { whatsapp: '91985550009', whatsappFim8: '85550009', suspeito: true }, Date.now());
  await mw.processar(await listaDoNavegador());
  ok((await get('leads_site', 'w2')).status === 'suspeito' && avisados.includes('w2'), 'suspeito não espera sorteio: é separado na hora e o servidor é avisado');

  // 12) com sorteio do servidor, o navegador usa o vendedor e o id sorteados
  await db.collection('config').doc('rodizio_site').set({ ultimoIdVendedor: 'V1', atualizadoEm: 1 });
  await db.collection('leads_site').doc('w1').update({ idVendedorSorteado: 'V1', idOportunidade: 'OPSRV' });
  await mw.processar(await listaDoNavegador());
  const w1 = await get('leads_site', 'w1');
  ok(w1.status === 'promovido' && w1.idVendedor === 'V1' && (await get('funil', 'OPSRV')).IdVendedor === 'V1', 'lead sorteado no servidor vira lead no Funil com o vendedor e o id do sorteio');
  ok((await get('config', 'rodizio_site')).ultimoIdVendedor === 'V1', 'e o navegador não gira o rodízio de novo');
  ok(avisados.includes('w1'), 'depois de promover, o servidor é avisado');

  await testarAppsScript(db, novoMotor, listaDoNavegador, semear, get, lista, limpar, ativos);
}

// 13) O código do Apps Script (legado/CODE GS.txt) rodando de verdade contra o
// emulador. Os serviços do Google são trocados por equivalentes locais: o
// Firestore REST vai pro emulador, o login da conta de serviço devolve o token
// de administrador do emulador e o envio de push só é anotado.
function carregarAppsScript(pushes) {
  const vm = require('vm');
  const crypto = require('crypto');
  const { execFileSync } = require('child_process');
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = { project_id: PROJETO, client_email: 'teste@demo.iam', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const resposta = (cod, texto) => ({ getResponseCode: () => cod, getContentText: () => texto });
  function pedir(url, op = {}) {
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(op.payload.assertion)) return resposta(400, 'jwt malformado');
      return resposta(200, JSON.stringify({ access_token: 'owner' }));
    }
    if (url.startsWith('https://fcm.googleapis.com/')) {
      const m = JSON.parse(op.payload).message;
      pushes.push(m);
      return m.token === 'tok-morto' ? resposta(404, '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}') : resposta(200, '{}');
    }
    const local = url.replace('https://firestore.googleapis.com', 'http://' + HOST + ':' + PORTA);
    const args = ['-s', '-X', (op.method || 'get').toUpperCase(), '-H', 'Authorization: Bearer owner', '-w', '\n%{http_code}'];
    if (op.payload) args.push('-H', 'Content-Type: application/json', '--data-binary', '@-');
    const saida = execFileSync('curl', [...args, local], { input: op.payload || '', encoding: 'utf8' });
    const i = saida.lastIndexOf('\n');
    return resposta(Number(saida.slice(i + 1)), saida.slice(0, i));
  }
  const cache = {};
  const ctx = vm.createContext({
    console, JSON, Date, Math, Number, String, Object, Array, encodeURIComponent,
    UrlFetchApp: { fetch: pedir, fetchAll: lista => lista.map(p => pedir(p.url, p)) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      base64EncodeWebSafe: x => { const b = Buffer.from(typeof x === 'string' ? x : Uint8Array.from(x, n => n & 255)).toString('base64url'); return b + '='.repeat((4 - b.length % 4) % 4); },
      computeRsaSha256Signature: (txt, chave) => Array.from(crypto.sign('sha256', Buffer.from(txt), chave), n => (n > 127 ? n - 256 : n)),
    },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => k === 'FIREBASE_SERVICE_ACCOUNT' ? JSON.stringify(sa) : null }) },
    Logger: { log: () => {} },
  });
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'legado', 'CODE GS.txt'), 'utf8'), ctx);
  return ctx;
}

async function testarAppsScript(db, novoMotor, listaDoNavegador, semear, get, lista, limpar, ativos) {
  console.log('\n== Apps Script: sorteio e push (avisarLeadSite) ==');
  const pushes = [];
  const gs = carregarAppsScript(pushes);
  const avisar = id => JSON.parse(JSON.stringify(gs.actionAvisarLeadSite({ id })));
  const para = tok => pushes.filter(p => p.token === tok);

  await limpar(); await ativos(); await db.collection('funil_pipelines').doc('P1').set({ IdPipeline: 'P1', Nome: 'Comercial', Etapas: [{ Nome: 'Novo Lead' }] });
  for (const c of ['push_tokens']) { const s = await db.collection(c).get(); for (const d of s.docs) await d.ref.delete(); }
  await db.collection('vendedores').doc('V1').set({ IdVendedor: 'V1', Nome: 'Vera', Tipo: 'Vendedor', Status: 'Ativo' });
  await db.collection('vendedores').doc('G1').set({ IdVendedor: 'G1', Nome: 'Felipe', Tipo: 'CEO', Status: 'Ativo' });
  await db.collection('vendedores').doc('G2').set({ IdVendedor: 'G2', Nome: 'Ex-gerente', Tipo: 'Gerente', Status: 'Inativo' });
  for (const [id, dono, tok] of [['a', 'V1', 'tok-v1'], ['b', 'V2', 'tok-v2'], ['c', 'G1', 'tok-g1'], ['d', 'G1', 'tok-morto'], ['e', 'G2', 'tok-g2']]) {
    await db.collection('push_tokens').doc(id).set({ token: tok, idVendedor: dono, aparelho: 'teste', atualizadoEm: 1 });
  }

  ok(avisar('../x').ok === false && avisar('naoexiste').ok === false, 'id inválido ou contato inexistente não faz nada');

  await semear('g1', { nome: 'Maria', cidade: 'Belém' }, Date.now());
  const r1 = avisar('g1');
  const g1 = await get('leads_site', 'g1');
  ok(r1.ok && r1.vendedor === 'V1' && g1.idVendedorSorteado === 'V1' && /^[0-9a-f]{8}$/.test(g1.idOportunidade) && g1.avisoLeadEm > 0, 'contato novo: sorteia V1, reserva o id do lead e marca o aviso (' + JSON.stringify(r1) + ')');
  ok(((await get('config', 'rodizio_site')) || {}).ultimoIdVendedor === 'V1', 'o rodízio anda no mesmo documento que o ERP usa');
  ok(para('tok-v1').length === 1 && para('tok-v1')[0].data.titulo === 'Novo lead do site pra você' && para('tok-v1')[0].data.url === 'index.html?lead=' + g1.idOportunidade + '&notif=g1:lead', 'vendedor da vez recebe o push com o link do lead');
  ok(para('tok-g1').length === 1 && /para Vera/.test(para('tok-g1')[0].data.corpo), 'gestão recebe o push dizendo pra quem foi');
  ok(para('tok-v2').length === 0 && para('tok-g2').length === 0, 'o outro vendedor e a gestão inativa não recebem');
  ok(!(await get('push_tokens', 'd')) && !!(await get('push_tokens', 'c')), 'aparelho que o Firebase diz não existir mais sai da lista; o que funciona fica');
  const total1 = pushes.length;
  ok(avisar('g1').acao === 'já avisado' && pushes.length === total1, 'chamar de novo não repete o push nem o sorteio');

  const { motor: mg } = novoMotor({ deps: { avisar: id => avisar(id) } });
  await mg.processar(await listaDoNavegador());
  const g1b = await get('leads_site', 'g1');
  ok(g1b.status === 'promovido' && ((await get('funil', g1.idOportunidade)) || {}).IdVendedor === 'V1', 'o ERP promove na hora com o vendedor e o id sorteados no servidor');
  ok(pushes.length === total1, 'e o aviso depois da promoção não manda outro push');

  await semear('g2', { nome: 'João', whatsapp: '91985550010', whatsappFim8: '85550010' }, Date.now());
  ok(avisar('g2').vendedor === 'V2', 'o contato seguinte vai pro próximo da vez (V2)');

  await semear('g3', { nome: 'Robô', suspeito: true, whatsapp: '91985550011', whatsappFim8: '85550011' }, Date.now());
  const antes3 = pushes.length;
  ok(avisar('g3').acao === 'suspeito' && !(await get('leads_site', 'g3')).idVendedorSorteado, 'suspeito não entra no sorteio');
  const novos3 = pushes.slice(antes3);
  ok(novos3.length === 1 && novos3[0].token === 'tok-g1' && novos3[0].data.notifId === 'g3:suspeito', 'suspeito avisa só a gestão');

  // ERP promoveu sozinho (servidor fora do ar na hora): o aviso sai depois.
  await semear('g4', { nome: 'Carla', status: 'promovido', idVendedor: 'V2', idOportunidade: 'OP4', whatsapp: '91985550012', whatsappFim8: '85550012' });
  const antes4 = pushes.length;
  ok(avisar('g4').acao === 'lead' && pushes.slice(antes4).map(p => p.token).sort().join() === 'tok-g1,tok-v2', 'lead promovido pelo navegador sem aviso: avisa o vendedor dele e a gestão');

  await semear('g5', { nome: 'Davi', status: 'erro', erroPromocao: 'falhou', whatsapp: '91985550013', whatsappFim8: '85550013' });
  const antes5 = pushes.length;
  ok(avisar('g5').acao === 'erro' && pushes.slice(antes5).map(p => p.token).join() === 'tok-g1', 'erro na promoção avisa só a gestão');

  await semear('g6', { nome: 'Eva', status: 'duplicado', whatsapp: '91985550014', whatsappFim8: '85550014' });
  const antes6 = pushes.length;
  avisar('g6');
  ok(pushes.length === antes6, 'duplicado não gera aviso');

  const gs3 = carregarAppsScript([]);
  const respostas = [];
  for (let i = 0; i < 42; i++) respostas.push(gs3.actionAvisarLeadSite({ id: 'naoexiste' }).erro);
  ok(respostas[39] === 'contato não encontrado' && /muitas chamadas/.test(respostas[40]), 'chamada em loop é cortada depois de 40 por minuto');

  await db.collection('vendedores').doc('V1').update({ Status: 'Inativo' });
  await db.collection('vendedores').doc('V2').update({ Status: 'Inativo' });
  await semear('g7', { nome: 'Fábio', whatsapp: '91985550015', whatsappFim8: '85550015' }, Date.now());
  const gs2 = carregarAppsScript(pushes);   // cache novo: a lista de vendedores fica guardada 1 min
  ok(JSON.parse(JSON.stringify(gs2.actionAvisarLeadSite({ id: 'g7' }))).acao === 'sem vendedor ativo' && !(await get('leads_site', 'g7')).idVendedorSorteado, 'sem vendedor ativo, não sorteia (o navegador cobre depois da espera)');
}


(async () => {
  if (!fs.existsSync(JAR)) { console.log('Emulador não encontrado em ' + JAR); process.exit(2); }
  const emu = spawn('java', ['-jar', JAR, '--host', HOST, '--port', String(PORTA)], { stdio: 'ignore' });
  let saida = 1;
  try {
    for (let i = 0; i < 60 && !(await portaAberta()); i++) await esperar(500);
    if (!(await portaAberta())) throw new Error('o emulador não subiu');
    const regras = fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8');
    const r = await fetch('http://' + HOST + ':' + PORTA + '/emulator/v1/projects/' + PROJETO + ':securityRules', {
      method: 'PUT', body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: regras }] } }) });
    if (!r.ok) throw new Error('regras recusadas pelo emulador: ' + (await r.text()).slice(0, 400));
    await testarRegras();
    await testarMotor();
    console.log('\n' + (falhas ? falhas + ' falharam, ' : '') + passou + ' passaram.');
    saida = falhas ? 1 : 0;
  } catch (e) {
    console.error('Erro no teste:', e); saida = 1;
  } finally {
    emu.kill();
    setTimeout(() => process.exit(saida), 300);
  }
})();
