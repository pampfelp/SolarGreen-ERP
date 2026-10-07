import {GROUPS, generateMaterials} from './rules.js?v=20261007c';

const config = {
  projectId: 'solargreen-21313',
  appId: '1:980826142154:web:a7d053312f2ad5c240cb33',
  apiKey: 'AIzaSyC50rNjz7cd_1_aWDBMuz84QqOFwPRV1aE',
  authDomain: 'solargreen-21313.firebaseapp.com',
  messagingSenderId: '980826142154',
};
// Preencher só depois de verificar o serviço real e as chaves no Render.
const API_URL = '';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = {user: null, vendor: null, client: null, appointment: null, items: [], photos: [], aiText: '', warning: '', stats: null, listId: null, savedAt: null};
let db;
let statusTimer;
let installPrompt;

function status(message, error = false) {
  const el = $('#status');
  el.textContent = message;
  el.style.background = error ? '#a32920' : '';
  el.classList.add('show');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.classList.remove('show'), 6000);
}
function setTab(tab) {
  document.body.dataset.tab = tab;
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
}
function measureValues() {
  const m = {};
  ['modules', 'watts', 'inverter', 'floors', 'ac', 'dc', 'ground', 'roof'].forEach(id => m[id] = $('#' + id).value);
  m.inverterOutput = $('#inverter-output').value;
  $$('.seg').forEach(seg => m[seg.dataset.field] = seg.querySelector('.on')?.dataset.value || '');
  return m;
}
function fillMeasures(m = {}) {
  ['modules', 'watts', 'inverter', 'floors', 'ac', 'dc', 'ground'].forEach(id => $('#' + id).value = m[id] ?? (id === 'floors' ? 1 : ''));
  if (m.roof) $('#roof').value = m.roof;
  $('#inverter-output').value = m.inverterOutput || (m.connection === 'Mono 127 V' ? 'Mono 127 V' : m.connection === 'Trifásico' ? 'Trifásico 220 V' : 'Mono 220 V');
  $$('.seg').forEach(seg => {
    const value = m[seg.dataset.field] || (seg.dataset.field === 'connection' ? 'Bifásico 220 V' : '');
    if (!value) return;
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.value === value));
  });
}
function updateStats() {
  const m = measureValues();
  const power = Number(m.modules) * Number(m.watts) / 1000;
  $('#stat-kwp').textContent = power > 0 ? power.toLocaleString('pt-BR', {maximumFractionDigits: 2}) : '—';
  $('#stat-items').textContent = state.items.length;
  $('#stat-ac').textContent = m.ac ? m.ac + ' m' : '—';
  $('#stat-dc').textContent = m.dc ? m.dc + ' m' : '—';
  $('#tab-item-count').textContent = state.items.length;
  $('#tab-photo-count').textContent = state.photos.length;
  $('#photo-count').textContent = state.photos.length + (state.photos.length === 1 ? ' foto' : ' fotos');
  $('#list-total').textContent = state.items.length + ' itens · 6 grupos';
  $('#warning').textContent = state.warning || 'Confira as especificações e as quantidades antes de comprar.';
  $('#last-edit').textContent = state.savedAt ? 'Salvo em ' + new Date(state.savedAt).toLocaleString('pt-BR') : 'Ainda não salva';
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('i');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#' + name);
  svg.append(use);
  return svg;
}
function renderItems() {
  const root = $('#material-list');
  root.replaceChildren();
  GROUPS.forEach(group => {
    const groupItems = state.items.filter(item => item.group === group);
    const section = el('div', 'sec');
    if (group !== 'Parte CA' && group !== 'Proteção') section.classList.add('coll');
    if (group === 'Parte CA') section.classList.add('compact-mobile');
    if (group === 'Proteção') section.classList.add('mobile-coll');
    if (group === 'Proteção') section.classList.add('protection');
    const head = el('button', 'sh');
    head.type = 'button';
    const initiallyClosed = section.classList.contains('coll') || (matchMedia('(max-width:700px)').matches && section.classList.contains('mobile-coll'));
    head.setAttribute('aria-expanded', String(!initiallyClosed));
    head.append(el('h3', '', group), el('span', 'cnt', String(groupItems.length)), icon(initiallyClosed ? 'down' : 'up'));
    head.querySelector('svg').classList.add('chev');
    head.addEventListener('click', () => {
      if (matchMedia('(max-width:700px)').matches && section.classList.contains('compact-mobile')) {
        section.classList.remove('compact-mobile');
        return;
      }
      if (matchMedia('(max-width:700px)').matches && section.classList.contains('mobile-coll')) {
        section.classList.remove('mobile-coll');
        head.setAttribute('aria-expanded', 'true');
        head.querySelector('use').setAttribute('href', '#up');
        return;
      }
      section.classList.toggle('coll');
      head.setAttribute('aria-expanded', !section.classList.contains('coll'));
      head.querySelector('use').setAttribute('href', section.classList.contains('coll') ? '#down' : '#up');
    });
    section.append(head);
    const rows = el('div', 'rows');
    groupItems.forEach(item => {
      const row = el('div', 'row');
      const check = el('button', 'chk' + (item.checked ? ' is-checked' : ''));
      check.type = 'button';
      check.setAttribute('aria-label', item.checked ? 'Desmarcar item' : 'Marcar item');
      check.append(icon('check'));
      check.addEventListener('click', () => { item.checked = !item.checked; check.classList.toggle('is-checked', item.checked); check.setAttribute('aria-label', item.checked ? 'Desmarcar item' : 'Marcar item'); markEdited(item); });
      const quantity = el('input', 'q');
      quantity.value = item.quantity;
      quantity.setAttribute('aria-label', 'Quantidade de ' + item.description);
      quantity.addEventListener('change', () => { item.quantity = quantity.value.trim(); markEdited(item); });
      const unit = el('input', 'unit-input u');
      unit.value = item.unit;
      unit.setAttribute('aria-label', 'Unidade de ' + item.description);
      unit.addEventListener('change', () => { item.unit = unit.value.trim(); mobileUnit.value = item.unit; fitMobileUnit(); markEdited(item); });
      const wrap = el('div', 'd-wrap');
      const description = el('textarea', 'd');
      description.rows = 1;
      description.value = item.description;
      description.setAttribute('aria-label', 'Descrição do item');
      description.addEventListener('change', () => { item.description = description.value.trim(); markEdited(item); });
      description.addEventListener('input', () => { description.style.height = 'auto'; description.style.height = description.scrollHeight + 'px'; });
      const note = el('textarea', 'note');
      note.rows = 1;
      note.value = item.note || '';
      note.hidden = !item.note;
      description.addEventListener('focus', () => { note.hidden = false; });
      note.addEventListener('blur', () => { if (!note.value.trim()) note.hidden = true; });
      note.addEventListener('input', () => { note.style.height = 'auto'; note.style.height = note.scrollHeight + 'px'; });
      note.setAttribute('aria-label', 'Observação de ' + item.description);
      note.addEventListener('change', () => { item.note = note.value.trim(); markEdited(item); });
      const source = el('span', 'tag ' + (item.source === 'IA' ? 'ia' : item.source === 'Editado' ? 'e' : 'r'), item.source);
      const mobileUnit = el('input', 'mobile-unit');
      mobileUnit.value = item.unit;
      mobileUnit.setAttribute('aria-label', 'Unidade de ' + item.description);
      const fitMobileUnit = () => { mobileUnit.style.width = Math.max(2, Math.min(14, mobileUnit.value.length + 1)) + 'ch'; };
      fitMobileUnit();
      mobileUnit.addEventListener('input', fitMobileUnit);
      mobileUnit.addEventListener('change', () => { item.unit = mobileUnit.value.trim(); unit.value = item.unit; markEdited(item); });
      const mobileSource = el('span', 'mobile-tag tag ' + (item.source === 'IA' ? 'ia' : item.source === 'Editado' ? 'e' : 'r'), item.source);
      wrap.append(description, mobileUnit, mobileSource, note);
      const remove = el('button', 'del');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Excluir ' + item.description);
      remove.append(icon('trash'));
      remove.addEventListener('click', () => { state.items = state.items.filter(x => x.id !== item.id); renderItems(); });
      row.append(check, quantity, unit, wrap, source, remove);
      rows.append(row);
      requestAnimationFrame(() => { description.style.height = 'auto'; description.style.height = description.scrollHeight + 'px'; });
      if (item.note) requestAnimationFrame(() => { note.style.height = 'auto'; note.style.height = note.scrollHeight + 'px'; });
    });
    section.append(rows);
    const add = el('button', 'addi');
    add.type = 'button';
    add.append(icon('plus'), el('span', '', 'Adicionar item'));
    add.addEventListener('click', () => {
      state.items.push({id: crypto.randomUUID(), group, quantity: '1', unit: 'un', description: 'Novo item', note: '', source: 'Editado', checked: true});
      section.classList.remove('coll');
      renderItems();
      const input = [...$('#material-list').querySelectorAll('.row .d')].at(-1);
      input?.focus(); input?.select();
    });
    section.append(add);
    root.append(section);
  });
  updateStats();
}
function markEdited(item) {
  item.source = 'Editado';
  state.savedAt = null;
  const row = [...$$('.row')].find(r => r.querySelector('.d')?.value === item.description);
  if (row) row.querySelectorAll('.tag').forEach(tag => { tag.className = tag.classList.contains('mobile-tag') ? 'mobile-tag tag e' : 'tag e'; tag.textContent = 'Editado'; });
  updateStats();
}
function generate() {
  const result = generateMaterials(measureValues());
  if (state.items.length && !confirm('Gerar outra lista substitui a edição atual. Continuar?')) return;
  state.items = result.items;
  state.warning = result.warning;
  state.savedAt = null;
  renderItems();
  setTab('list');
  status('Lista base gerada. Confira os itens antes de comprar.');
}
function setClientLabel() {
  const name = state.client ? (state.client['Nome Razao Social'] || state.client.Nome || state.client.IdCliente || 'Cliente') : 'Selecionar cliente ou OS';
  const suffix = state.appointment ? ' · OS ' + (state.appointment.IdAgendamento || '') : '';
  $('#client-label').textContent = name + suffix;
  $('#client-label-mobile').textContent = name;
}
async function getVendor(user) {
  let doc = await db.collection('vendedores').doc(user.uid).get();
  if (!doc.exists && user.email) {
    const snap = await db.collection('vendedores').where('Email', '==', user.email).limit(1).get();
    doc = snap.docs[0];
  }
  if (!doc?.exists) throw new Error('Seu login existe, mas não há cadastro de usuário no ERP.');
  const vendor = doc.data();
  if (vendor.SenhaTemporaria) throw new Error('Troque a senha temporária no ERP antes de entrar aqui.');
  if (String(vendor.Status || 'Ativo').toLowerCase() !== 'ativo') throw new Error('Usuário inativo no ERP.');
  return vendor;
}
async function loadSavedList() {
  if (!state.client) return;
  const id = state.client.IdCliente + '__' + (state.appointment?.IdAgendamento || 'avulsa');
  state.listId = id;
  const doc = await db.collection('listas_material').doc(id).get();
  if (doc.exists) {
    const data = doc.data();
    fillMeasures(data.medidas || {});
    state.items = Array.isArray(data.itens) ? data.itens : [];
    state.warning = data.medidas?.inverterOutput ? (data.aviso || '') : `${data.aviso || ''} Lista anterior à separação entre rede e inversor: confirme a saída CA e gere novamente.`.trim();
    state.aiText = data.leituraIA || '';
    state.savedAt = data.atualizadoEm?.toDate?.()?.toISOString() || null;
    $('#ai-read').textContent = state.aiText ? 'O que a IA leu: ' + state.aiText : 'O que a IA leu: adicione fotos e toque em “Ler fotos com IA”.';
    renderItems();
    setTab('list');
    status('Lista salva carregada do ERP.');
  } else {
    state.items = []; state.aiText = ''; state.warning = ''; state.savedAt = null;
    if (!state.appointment) fillMeasures({});
    renderItems();
    status('Cliente selecionado. Preencha ou importe as medidas.');
  }
}
function responseValue(response) { return response.RespostaQuantidade ?? response.RespostaTexto ?? ''; }
async function loadAppointment(appointment) {
  state.appointment = appointment;
  const clientDoc = await db.collection('clientes').doc(String(appointment.IdCliente)).get();
  state.client = clientDoc.exists ? clientDoc.data() : {IdCliente: appointment.IdCliente, 'Nome Razao Social': appointment.NomeCliente || appointment.IdCliente};
  state.client.IdCliente ||= appointment.IdCliente;
  setClientLabel();
  const [answers, templates] = await Promise.all([
    db.collection('agendamentos_respostas').where('IdAgendamento', '==', appointment.IdAgendamento).get(),
    db.collection('templates').where('IdServico', '==', appointment.IdServico).get()
  ]);
  const textByTemplate = new Map(templates.docs.map(d => [String(d.data().IdTemplate || d.id), String(d.data().TextoPergunta || '').toLowerCase()]));
  const m = {};
  answers.forEach(doc => {
    const r = doc.data();
    const q = textByTemplate.get(String(r.IdTemplate)) || '';
    const value = responseValue(r);
    if (/quantidade.*cabo.*inversor.*padr[aã]o|cabo.*ca.*percurso/i.test(q)) m.ac = value;
    else if (/quantidade.*cabo cc|cabo cc.*percurso/i.test(q)) m.dc = value;
    else if (/cabo aterramento.*inversor/i.test(q)) m.ground = value;
    else if (/quantidade de andares/i.test(q)) m.floors = value;
    else if (/quantidade total de m[oó]dulos/i.test(q)) m.modules = value;
    else if (/estrutura do telhado/i.test(q)) m.roof = /fibrocimento/i.test(value) ? 'Fibrocimento sobre madeira' : value;
  });
  fillMeasures(m);
  await loadSavedList();
}
async function selectClient(client) {
  state.client = client;
  state.client.IdCliente ||= client.id;
  state.appointment = null;
  setClientLabel();
  const snap = await db.collection('agendamentos').where('IdCliente', '==', state.client.IdCliente).limit(10).get();
  const results = $('#client-results');
  results.replaceChildren();
  if (!$('#client-dialog').open) $('#client-dialog').showModal();
  if (!snap.empty) {
    results.append(el('p', '', 'Escolha uma OS ou continue com uma lista avulsa:'));
    snap.forEach(doc => {
      const ag = {...doc.data(), IdAgendamento: doc.data().IdAgendamento || doc.id};
      const button = el('button', '', 'OS ' + ag.IdAgendamento + ' · ' + (ag.NomeServico || ag.Servico || 'vistoria'));
      button.addEventListener('click', async () => { $('#client-dialog').close(); await loadAppointment(ag); });
      results.append(button);
    });
  }
  const button = el('button', '', 'Continuar sem OS');
  button.addEventListener('click', async () => { $('#client-dialog').close(); await loadSavedList(); });
  results.append(button);
}
async function searchClient(query) {
  const results = $('#client-results');
  results.textContent = 'Buscando no ERP…';
  const id = query.trim();
  const [clientDoc, appointmentDoc] = await Promise.all([
    db.collection('clientes').doc(id).get(),
    db.collection('agendamentos').doc(id).get()
  ]);
  if (appointmentDoc.exists) { await loadAppointment({...appointmentDoc.data(), IdAgendamento: appointmentDoc.data().IdAgendamento || appointmentDoc.id}); $('#client-dialog').close(); return; }
  if (clientDoc.exists) { await selectClient({...clientDoc.data(), IdCliente: clientDoc.data().IdCliente || clientDoc.id}); return; }
  const snap = await db.collection('clientes').where('Nome Razao Social', '>=', id).where('Nome Razao Social', '<=', id + '\uf8ff').limit(8).get();
  results.replaceChildren();
  if (snap.empty) { results.textContent = 'Nenhum cliente ou OS encontrado. Confira o ID ou o início exato do nome.'; return; }
  snap.forEach(doc => {
    const client = {...doc.data(), IdCliente: doc.data().IdCliente || doc.id};
    const button = el('button', '', (client['Nome Razao Social'] || client.Nome || client.IdCliente) + ' · ' + client.IdCliente);
    button.addEventListener('click', () => selectClient(client).catch(e => status(e.message, true)));
    results.append(button);
  });
}
async function save() {
  if (!state.client) throw new Error('Selecione um cliente do ERP antes de salvar.');
  if (!state.items.length) throw new Error('Gere ou adicione itens antes de salvar.');
  const id = state.client.IdCliente + '__' + (state.appointment?.IdAgendamento || 'avulsa');
  const record = {
    clienteId: String(state.client.IdCliente),
    idAgendamento: String(state.appointment?.IdAgendamento || ''),
    medidas: measureValues(),
    itens: state.items.map(({id, group, quantity, unit, description, note, source, checked}) => ({id, group, quantity, unit, description, note, source, checked})),
    aviso: state.warning,
    leituraIA: state.aiText,
    autorUid: state.user.uid,
    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
  };
  await db.collection('listas_material').doc(id).set(record);
  state.listId = id;
  state.savedAt = new Date().toISOString();
  updateStats();
  status('Lista salva no ERP.');
}
function renderPhotos() {
  const root = $('#thumbs');
  root.replaceChildren();
  state.photos.forEach((photo, index) => {
    const thumb = el('button', 'thumb');
    thumb.type = 'button';
    thumb.style.backgroundImage = 'url(' + photo + ')';
    thumb.setAttribute('aria-label', 'Remover foto ' + (index + 1));
    thumb.title = 'Toque para remover';
    thumb.addEventListener('click', () => { state.photos.splice(index, 1); renderPhotos(); });
    root.append(thumb);
  });
  const add = el('button', 'add');
  add.type = 'button'; add.setAttribute('aria-label', 'Adicionar foto'); add.append(icon('plus'));
  add.addEventListener('click', () => $('#photo-input').click());
  root.append(add);
  updateStats();
}
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a foto.')); };
    image.src = url;
  });
}
async function addPhotos(files) {
  for (const file of [...files].slice(0, 8 - state.photos.length)) {
    if (!file.type.startsWith('image/')) continue;
    state.photos.push(await resizeImage(file));
  }
  renderPhotos();
  status(state.photos.length + ' foto(s) prontas para análise.');
}
async function analyzePhotos() {
  if (!API_URL) throw new Error('A leitura por IA ainda precisa do serviço Render e das chaves dos provedores.');
  if (!state.photos.length) throw new Error('Adicione pelo menos uma foto.');
  if (!state.items.length) throw new Error('Gere a lista base antes de ler as fotos.');
  const button = $('#ai-button'); button.disabled = true;
  const stages = $$('#cascade .c');
  stages.forEach(c => c.className = 'c wait');
  try {
    const token = await state.user.getIdToken();
    const res = await fetch(API_URL + '/analyze', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token},
      body: JSON.stringify({photos: state.photos, measures: measureValues(), items: state.items})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'A análise das fotos falhou.');
    const selected = ['gemini', 'gpt', 'claude'].indexOf(data.provider);
    stages.forEach((c, i) => c.className = 'c ' + (i < selected ? 'off' : i === selected ? 'ok' : 'wait'));
    if (!Array.isArray(data.items)) throw new Error('A IA devolveu uma lista inválida.');
    for (const incoming of data.items.slice(0, 100)) {
      if (!GROUPS.includes(incoming.group) || !incoming.description) continue;
      state.items.push({id: crypto.randomUUID(), group: incoming.group, quantity: String(incoming.quantity || 'conferir'), unit: String(incoming.unit || 'un'), description: String(incoming.description).slice(0, 200), note: String(incoming.note || '').slice(0, 300), source: 'IA', checked: true});
    }
    state.aiText = String(data.summary || '').slice(0, 1500);
    $('#ai-read').textContent = 'O que a IA leu: ' + state.aiText;
    state.savedAt = null;
    renderItems(); setTab('list');
    status('Fotos analisadas por ' + data.provider.toUpperCase() + '. Confira os itens sugeridos.');
  } finally { button.disabled = false; }
}
function printList() {
  if (!state.items.length) { status('Gere a lista antes de exportar.', true); return; }
  const sheet = $('#print-sheet');
  sheet.replaceChildren();
  sheet.append(el('p', 'print-brand', 'SOLAR GREEN · FERRAMENTA TÉCNICA'));
  sheet.append(el('h1', '', 'Lista de material'));
  const client = state.client ? (state.client['Nome Razao Social'] || state.client.Nome || state.client.IdCliente) : 'Lista sem cliente';
  const subtitle = [client, state.appointment?.IdAgendamento ? 'OS ' + state.appointment.IdAgendamento : '',
    new Date().toLocaleDateString('pt-BR')].filter(Boolean).join(' · ');
  sheet.append(el('p', 'print-subtitle', subtitle));
  const m = measureValues();
  sheet.append(el('p', 'print-summary', [
    Number(m.modules) * Number(m.watts) / 1000 ? (Number(m.modules) * Number(m.watts) / 1000).toLocaleString('pt-BR') + ' kWp' : '',
    m.inverter ? m.inverter + ' kW de inversor' : '',
    m.ac ? m.ac + ' m CA' : '',
    m.dc ? m.dc + ' m CC' : ''
  ].filter(Boolean).join('  ·  ')));
  sheet.append(el('p', 'print-warning', state.warning || 'Sugestão técnica. Confira antes de comprar.'));
  GROUPS.forEach(group => {
    const entries = state.items.filter(item => item.group === group);
    if (!entries.length) return;
    const section = el('section', 'print-group');
    section.append(el('h2', '', group + ' · ' + entries.length + ' itens'));
    entries.forEach(item => {
      const row = el('div', 'print-row');
      row.append(el('span', 'print-qty', item.quantity + ' ' + item.unit));
      const body = el('div', '');
      body.append(el('strong', '', item.description));
      if (item.note) body.append(el('small', '', item.note));
      row.append(body);
      section.append(row);
    });
    sheet.append(section);
  });
  sheet.append(el('p', 'print-footer', 'Sugestão técnica. Conferir quantidades, manuais, projeto e local antes da compra.'));
  window.print();
}
function setupPwa() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js', {scope: './', updateViaCache: 'none'}).catch(console.warn);
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; if (!sessionStorage.getItem('lm-install-dismiss')) $('#install-banner').hidden = false; });
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (isIos && !navigator.standalone && !sessionStorage.getItem('lm-install-dismiss')) { $('#install-text').textContent = 'No Safari: Compartilhar → Adicionar à Tela de Início.'; $('#install-button').hidden = true; $('#install-banner').hidden = false; }
  $('#install-button').addEventListener('click', async () => { if (installPrompt) { await installPrompt.prompt(); $('#install-banner').hidden = true; } });
  $('#install-dismiss').addEventListener('click', () => { sessionStorage.setItem('lm-install-dismiss', '1'); $('#install-banner').hidden = true; });
}
function wire() {
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault(); $('#login-error').textContent = '';
    try { await firebase.auth().signInWithEmailAndPassword($('#login-email').value.trim(), $('#login-password').value); }
    catch (e) { $('#login-error').textContent = 'Não foi possível entrar. Confira e-mail e senha.'; }
  });
  $('#logout-button').addEventListener('click', () => firebase.auth().signOut());
  $$('.seg button').forEach(button => button.addEventListener('click', () => { button.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('on')); button.classList.add('on'); updateStats(); }));
  $$('#measure-form input').forEach(input => input.addEventListener('input', updateStats));
  $('#measure-form').addEventListener('submit', event => { event.preventDefault(); try { generate(); } catch (e) { status(e.message, true); } });
  $$('.tabs button').forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab)));
  $('#client-button').addEventListener('click', () => $('#client-dialog').showModal());
  $('#client-button-mobile').addEventListener('click', () => $('#client-dialog').showModal());
  $('#close-dialog').addEventListener('click', () => $('#client-dialog').close());
  $('#client-search-form').addEventListener('submit', event => { event.preventDefault(); searchClient($('#client-search').value).catch(e => status(e.message, true)); });
  $('#save-button').addEventListener('click', () => save().catch(e => status(e.message, true)));
  $$('.export-button').forEach(button => button.addEventListener('click', printList));
  $('#photo-drop').addEventListener('click', () => $('#photo-input').click());
  $('#photo-input').addEventListener('change', e => addPhotos(e.target.files).catch(err => status(err.message, true)));
  $('#photo-drop').addEventListener('dragover', e => e.preventDefault());
  $('#photo-drop').addEventListener('drop', e => { e.preventDefault(); addPhotos(e.dataTransfer.files).catch(err => status(err.message, true)); });
  $('#ai-button').addEventListener('click', () => analyzePhotos().catch(e => status(e.message, true)));
}
async function init() {
  wire(); setupPwa(); renderItems(); renderPhotos(); setTab('measures');
  if (!API_URL) {
    $('#ai-button').disabled = true;
    $('#ai-read').textContent = 'O que a IA leu: integração aguardando serviço e chaves de API.';
  }
  firebase.initializeApp(config);
  db = firebase.firestore();
  firebase.auth().onAuthStateChanged(async user => {
    state.user = user;
    if (!user) { state.vendor = null; $('#app-shell').hidden = true; $('#auth-screen').hidden = false; return; }
    try {
      state.vendor = await getVendor(user);
      $('#auth-screen').hidden = true; $('#app-shell').hidden = false;
      const params = new URLSearchParams(location.search);
      const appointmentId = params.get('agendamentoId');
      const clientId = params.get('clienteId');
      if (appointmentId) {
        const doc = await db.collection('agendamentos').doc(appointmentId).get();
        if (doc.exists) await loadAppointment({...doc.data(), IdAgendamento: doc.data().IdAgendamento || doc.id});
        else status('OS não encontrada no ERP.', true);
      } else if (clientId) {
        const doc = await db.collection('clientes').doc(clientId).get();
        if (doc.exists) await selectClient({...doc.data(), IdCliente: doc.data().IdCliente || doc.id});
        else status('Cliente não encontrado no ERP.', true);
      }
    } catch (e) {
      $('#app-shell').hidden = true; $('#auth-screen').hidden = false;
      $('#login-error').textContent = e.message || 'Falha ao conferir acesso ao ERP.';
      await firebase.auth().signOut();
    }
  });
}
window.addEventListener('load', () => init().catch(e => { $('#auth-screen').hidden = false; $('#login-error').textContent = 'Não foi possível iniciar o app. Atualize a página.'; console.error(e); }));
