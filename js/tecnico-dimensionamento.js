// ==== Dimensionamento Solar (tela dedicada, dentro do mesmo indexdotecnico) ====
(function(){
const state = {
  roofs: [ { largura:null, altura:null, orientation:'auto', facing:'', customModule:{enabled:false, modH:null, modW:null, power:null, vocMod:null, iscMod:null, idCatalogo:null, pesoKg:null} } ],
  activeTab: 0
};

// ==== Catálogo de módulos/inversores — autopreenchimento ====
// Único ponto dessa tela que fala com o backend (o resto é 100% client-side).
let modulosCatalogo = [];
let inversoresCatalogo = [];
let globalModuloPesoKg = null; // só existe quando o módulo padrão vem do catálogo (não tem campo manual)

function carregarCatalogoProdutos(){
  if(typeof SGAuth === 'undefined' || !SGAuth.apiCall) return;
  SGAuth.apiCall('getCatalogoProdutos', {}).then(function(resp){
    if(!resp || !resp.ok) return;
    modulosCatalogo = resp.modulos || [];
    inversoresCatalogo = resp.inversores || [];
    popularSelectModulos(document.getElementById('moduloCatalogoSelect'), '');
    document.querySelectorAll('.roof-module-select').forEach(function(sel){ var i=parseInt(sel.dataset.i); popularSelectModulos(sel, (state.roofs[i]&&state.roofs[i].customModule.idCatalogo)||''); });
    if(typeof popularSelectInversores === 'function') popularSelectInversores(document.getElementById('inversorCatalogoSelect'), '');
  }).catch(function(){}); // catálogo é um bônus — se falhar, a tela continua funcionando 100% manual
}

function popularSelectModulos(selectEl, valorSelecionado){
  if(!selectEl) return;
  var opts = '<option value="">— Personalizado —</option>' + modulosCatalogo.map(function(m){
    var label = (m.Marca ? m.Marca + ' — ' : '') + (m.Modelo || m.IdModulo) + ' (' + (m.PotenciaW||'?') + 'W)';
    return '<option value="'+escapeHtml(m.IdModulo)+'">'+escapeHtml(label)+'</option>';
  }).join('');
  selectEl.innerHTML = opts;
  selectEl.value = valorSelecionado || '';
}

function abrirNovoModuloSheet(){
  ['nm-marca','nm-modelo','nm-alturaM','nm-larguraM','nm-potenciaW','nm-pesoKg','nm-vocV','nm-iscA'].forEach(function(id){ document.getElementById(id).value=''; });
  document.getElementById('nm-msg').textContent='';
  document.getElementById('novo-modulo-overlay').classList.remove('hidden');
}
function fecharNovoModuloSheet(){ document.getElementById('novo-modulo-overlay').classList.add('hidden'); }

function salvarNovoModuloRapido(){
  var modelo = document.getElementById('nm-modelo').value.trim();
  var msgEl = document.getElementById('nm-msg');
  if(!modelo){ msgEl.textContent='Informe o modelo do módulo.'; return; }
  var payload = {
    marca: document.getElementById('nm-marca').value.trim(),
    modelo: modelo,
    alturaM: document.getElementById('nm-alturaM').value,
    larguraM: document.getElementById('nm-larguraM').value,
    potenciaW: document.getElementById('nm-potenciaW').value,
    pesoKg: document.getElementById('nm-pesoKg').value,
    vocV: document.getElementById('nm-vocV').value,
    iscA: document.getElementById('nm-iscA').value
  };
  var btn = document.getElementById('btn-nm-salvar');
  btn.disabled = true;
  SGAuth.apiCall('salvarModulo', payload).then(function(resp){
    btn.disabled = false;
    if(!resp || !resp.ok){ msgEl.textContent = (resp && resp.erro) || 'Não foi possível salvar.'; return; }
    modulosCatalogo.push(Object.assign({IdModulo: resp.idModulo, Marca: payload.marca, Modelo: payload.modelo,
      AlturaM: payload.alturaM, LarguraM: payload.larguraM, PotenciaW: payload.potenciaW,
      PesoKg: payload.pesoKg, VocV: payload.vocV, IscA: payload.iscA}));
    popularSelectModulos(document.getElementById('moduloCatalogoSelect'), '');
    document.querySelectorAll('.roof-module-select').forEach(function(sel){ var i=parseInt(sel.dataset.i); popularSelectModulos(sel, (state.roofs[i]&&state.roofs[i].customModule.idCatalogo)||''); });
    fecharNovoModuloSheet();
  }).catch(function(err){ btn.disabled = false; msgEl.textContent = 'Erro de conexão: '+err.message; });
}

// ==== Inversor do catálogo + configuração por MPPT ====
// mpptsConfigAtual = [{maxIsc,maxStrings}, ...] (1 item por MPPT) do inversor
// selecionado/editado no formulário principal — é o que computeStringPlan() usa
// pra alocar strings respeitando a capacidade individual de cada MPPT.
let mpptsConfigAtual = [];

function popularSelectInversores(selectEl, valorSelecionado){
  if(!selectEl) return;
  var opts = '<option value="">— Personalizado —</option>' + inversoresCatalogo.map(function(v){
    var label = (v.Marca ? v.Marca + ' — ' : '') + (v.Modelo || v.IdInversor) + ' (' + (v.NumMppts||'?') + ' MPPT)';
    return '<option value="'+escapeHtml(v.IdInversor)+'">'+escapeHtml(label)+'</option>';
  }).join('');
  selectEl.innerHTML = opts;
  selectEl.value = valorSelecionado || '';
}

/**
 * Renderiza uma tabela de "corrente máxima + nº de strings" por MPPT dentro de
 * wrapEl, a partir de configArray ([{maxIsc,maxStrings}]) — reaproveitada tanto
 * pelo formulário principal (seção 05) quanto pelo cadastro rápido de inversor.
 * onChange(i, campo, valor) é chamado a cada edição de campo.
 */
function renderMpptsTable(wrapEl, configArray, onChange){
  if(!wrapEl) return;
  if(!configArray.length){ wrapEl.innerHTML = '<div style="font-size:12px;color:var(--text-dim);padding:6px 0;">Informe o número de MPPTs acima.</div>'; return; }
  wrapEl.innerHTML = configArray.map(function(cfg,i){
    return '<div class="mppt-cfg-row" data-i="'+i+'" style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">'+
      '<span style="font-size:12px;color:var(--text-dim);width:56px;flex:none;">MPPT '+(i+1)+'</span>'+
      '<input type="number" class="mppt-maxisc" step="0.1" placeholder="Corrente máx. (A)" value="'+(cfg.maxIsc!==undefined&&cfg.maxIsc!==null?cfg.maxIsc:'')+'" style="flex:1;">'+
      '<input type="number" class="mppt-maxstrings" step="1" min="0" placeholder="Nº strings" value="'+(cfg.maxStrings!==undefined&&cfg.maxStrings!==null?cfg.maxStrings:'')+'" style="width:100px;">'+
    '</div>';
  }).join('');
  wrapEl.querySelectorAll('.mppt-cfg-row').forEach(function(row){
    var i = parseInt(row.getAttribute('data-i'),10);
    row.querySelector('.mppt-maxisc').addEventListener('input', function(e){ onChange(i,'maxIsc',e.target.value); });
    row.querySelector('.mppt-maxstrings').addEventListener('input', function(e){ onChange(i,'maxStrings',e.target.value); });
  });
}

function redimensionarMpptsConfigAtual(n){
  n = Math.max(0, parseInt(n,10)||0);
  while(mpptsConfigAtual.length<n) mpptsConfigAtual.push({maxIsc:'',maxStrings:''});
  mpptsConfigAtual.length = n;
  renderMpptsTable(document.getElementById('mpptsConfigWrap'), mpptsConfigAtual, function(i,campo,valor){
    mpptsConfigAtual[i][campo] = valor;
    renderStringPlan();
  });
}

let mpptsConfigNovoInversor = [];

function abrirNovoInversorSheet(){
  ['ni-marca','ni-modelo','ni-potenciaMaxCC','ni-potenciaNomCC','ni-tensaoEntradaMax','ni-startupV','ni-mpptMinV','ni-mpptMaxV','ni-potenciaAtivaNomCA','ni-tensaoCANominal','ni-correnteMaxCA','ni-numMppts'].forEach(function(id){ document.getElementById(id).value=''; });
  document.getElementById('ni-fases').value='Monofasico';
  document.getElementById('ni-msg').textContent='';
  mpptsConfigNovoInversor = [];
  renderMpptsTable(document.getElementById('ni-mpptsWrap'), mpptsConfigNovoInversor, function(i,campo,valor){ mpptsConfigNovoInversor[i][campo]=valor; });
  document.getElementById('novo-inversor-overlay').classList.remove('hidden');
}
function fecharNovoInversorSheet(){ document.getElementById('novo-inversor-overlay').classList.add('hidden'); }

function salvarNovoInversorRapido(){
  var modelo = document.getElementById('ni-modelo').value.trim();
  var msgEl = document.getElementById('ni-msg');
  if(!modelo){ msgEl.textContent='Informe o modelo do inversor.'; return; }
  var mpptsConfigPayload = mpptsConfigNovoInversor.map(function(c){ return { maxIsc: parseFloat(String(c.maxIsc||'0').replace(',','.'))||0, maxStrings: parseInt(c.maxStrings,10)||0 }; });
  var payload = {
    marca: document.getElementById('ni-marca').value.trim(),
    modelo: modelo,
    potenciaMaxCC_W: document.getElementById('ni-potenciaMaxCC').value,
    potenciaNomCC_W: document.getElementById('ni-potenciaNomCC').value,
    tensaoEntradaMaxV: document.getElementById('ni-tensaoEntradaMax').value,
    startupV: document.getElementById('ni-startupV').value,
    mpptMinV: document.getElementById('ni-mpptMinV').value,
    mpptMaxV: document.getElementById('ni-mpptMaxV').value,
    numMppts: document.getElementById('ni-numMppts').value,
    mpptsConfig: mpptsConfigPayload,
    potenciaAtivaNomCA_W: document.getElementById('ni-potenciaAtivaNomCA').value,
    tensaoCANominalV: document.getElementById('ni-tensaoCANominal').value,
    correnteMaxCA_A: document.getElementById('ni-correnteMaxCA').value,
    fases: document.getElementById('ni-fases').value
  };
  var btn = document.getElementById('btn-ni-salvar');
  btn.disabled = true;
  SGAuth.apiCall('salvarInversor', payload).then(function(resp){
    btn.disabled = false;
    if(!resp || !resp.ok){ msgEl.textContent = (resp && resp.erro) || 'Não foi possível salvar.'; return; }
    inversoresCatalogo.push(Object.assign({IdInversor: resp.idInversor, Marca: payload.marca, Modelo: payload.modelo,
      PotenciaMaxCC_W: payload.potenciaMaxCC_W, PotenciaNomCC_W: payload.potenciaNomCC_W,
      TensaoEntradaMaxV: payload.tensaoEntradaMaxV, MpptMinV: payload.mpptMinV, MpptMaxV: payload.mpptMaxV,
      StartupV: payload.startupV, NumMppts: payload.numMppts, mpptsConfig: mpptsConfigPayload,
      PotenciaAtivaNomCA_W: payload.potenciaAtivaNomCA_W, TensaoCANominalV: payload.tensaoCANominalV,
      CorrenteMaxCA_A: payload.correnteMaxCA_A, Fases: payload.fases}));
    popularSelectInversores(document.getElementById('inversorCatalogoSelect'), '');
    fecharNovoInversorSheet();
  }).catch(function(err){ btn.disabled = false; msgEl.textContent = 'Erro de conexão: '+err.message; });
}

function num(v){ const n = parseFloat(v); return isNaN(n) ? null : n; }

function fitCount(total, mod){
  if(!total || !mod || total<=0 || mod<=0) return 0;
  const floorCount = Math.floor(total/mod + 1e-9);
  const overhang = (floorCount+1)*mod - total;
  return (overhang <= 0.10 + 1e-9) ? floorCount+1 : floorCount;
}

// Packs a rectangle using ONE fixed orientation (main grid + recursively
// packed leftover L-strips), returning the full total for that orientation.
function packOriented(largura, altura, modH, modW, orientation, x, y, depth, forceOrientation){
  const rows = orientation==='retrato' ? fitCount(altura, modH) : fitCount(altura, modW);
  const perRow = orientation==='retrato' ? fitCount(largura, modW) : fitCount(largura, modH);
  const alongRow = orientation==='retrato' ? modW : modH;
  const alongCol = orientation==='retrato' ? modH : modW;
  const mainTotal = rows*perRow;
  if(mainTotal === 0) return { total:0, rows:0, blocks:[] };

  const usedW = perRow*alongRow, usedH = rows*alongCol;
  const block = { x, y, w:usedW, h:usedH, rows, perRow, alongRow, alongCol,
                   orientation, total:mainTotal, isMain: depth===0 };

  // A área residual (sobra) SEMPRE explora as duas orientações livremente e
  // fica com a que couber mais módulos, mesmo quando o usuário trava a grade
  // principal em "Retrato" ou "Paisagem" — travar a orientação é uma escolha
  // sobre a grade principal (estética/alinhamento), não uma renúncia aos
  // módulos que só cabem na sobra virando a orientação ali. Por isso aqui
  // sempre passa null (automático) pro preenchimento residual, nunca o
  // forceOrientation recebido.
  const bottom = packRoof(largura, altura-usedH, modH, modW, null, x, y+usedH, depth+1);
  const side   = packRoof(largura-usedW, usedH, modH, modW, null, x+usedW, y, depth+1);

  return {
    total: mainTotal + bottom.total + side.total,
    rows: rows + bottom.rows + side.rows,
    blocks: [block, ...bottom.blocks, ...side.blocks]
  };
}

// Recursively packs a rectangle: places the best-fit grid, then tries to
// squeeze extra modules into the leftover L-shaped strips (bottom + side).
// When orientation is 'auto' (or unset), BOTH orientations are packed fully
// (including their own leftover area) and whichever yields more total
// modules wins — not just whichever main grid looks bigger on its own.
function packRoof(largura, altura, modH, modW, forceOrientation, x, y, depth){
  x = x||0; y = y||0; depth = depth||0;
  if(!largura || !altura || !modH || !modW || largura<=0.02 || altura<=0.02 || depth>6){
    return { total:0, rows:0, blocks:[] };
  }
  if(forceOrientation === 'retrato' || forceOrientation === 'paisagem'){
    return packOriented(largura, altura, modH, modW, forceOrientation, x, y, depth, forceOrientation);
  }
  const pRetrato = packOriented(largura, altura, modH, modW, 'retrato', x, y, depth, null);
  const pPaisagem = packOriented(largura, altura, modH, modW, 'paisagem', x, y, depth, null);
  if(pRetrato.total === 0 && pPaisagem.total === 0) return { total:0, rows:0, blocks:[] };
  if(pRetrato.total !== pPaisagem.total) return pRetrato.total > pPaisagem.total ? pRetrato : pPaisagem;
  return pRetrato.rows <= pPaisagem.rows ? pRetrato : pPaisagem;
}

function screwsPerRail(railLength){
  if(railLength<=2.4+0.001) return 2;
  if(railLength<=4.8+0.001) return 3;
  return Math.ceil(railLength/1.6)+1;
}

function calcMaterials(pack, railLength, andares, cablePerFloor){
  if(!pack || !pack.blocks.length) return null;
  let totalRails=0, structScrews=0, finalScrews=0, cableFlat=0;
  pack.blocks.forEach(b=>{
    const rowLength = b.perRow * b.alongRow;
    const railsPerLine = Math.ceil(rowLength/railLength);
    const railsPerRow = railsPerLine*2;
    totalRails += b.rows * railsPerRow;
    structScrews += b.rows * railsPerRow * screwsPerRail(railLength);
    finalScrews += b.rows * 2;
    cableFlat += b.total * b.alongRow;
  });
  const interClamps = (pack.total*2) - finalScrews;
  const cableDescida = (andares||0) * cablePerFloor;
  const cableTotal = cableFlat + cableDescida;
  return { totalRails, structScrews, finalScrews, interClamps, cableFlat, cableDescida, cableTotal };
}

function fmt(n, d){
  if(n===null || n===undefined || isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', {minimumFractionDigits:d||0, maximumFractionDigits:d||0});
}

// A escapeHtml da tela de OS (linha ~887) vive numa IIFE diferente desta —
// não é visível aqui, por isso essa tela precisa da própria cópia.
function escapeHtml(s){ var d = document.createElement('div'); d.textContent = s==null ? '' : String(s); return d.innerHTML; }

function getModuleDims(){
  const h = num(document.getElementById('modH').value);
  const w = num(document.getElementById('modW').value);
  return { modH: h, modW: w };
}

function getRoofModuleDims(roof, globalH, globalW){
  if(roof.customModule && roof.customModule.enabled){
    return {
      modH: roof.customModule.modH || globalH,
      modW: roof.customModule.modW || globalW
    };
  }
  return { modH: globalH, modW: globalW };
}

function getRoofPower(roof, globalPower){
  if(roof.customModule && roof.customModule.enabled && roof.customModule.power){
    return roof.customModule.power;
  }
  return globalPower;
}

function getRoofElectrical(roof, globalVoc, globalIsc){
  if(roof.customModule && roof.customModule.enabled){
    return {
      voc: roof.customModule.voc || null,
      isc: roof.customModule.isc || null,
      isCustom: true
    };
  }
  return { voc: globalVoc, isc: globalIsc, isCustom:false };
}

// Peso só entra no sistema via seleção no catálogo (não tem campo manual pra
// não poluir o formulário pra quem nunca usa isso) — se não veio de lá, fica
// desconhecido e simplesmente não soma no peso total.
function getRoofWeight(roof, globalWeight){
  if(roof.customModule && roof.customModule.enabled && roof.customModule.pesoKg){
    return roof.customModule.pesoKg;
  }
  return globalWeight;
}

function getHouseFloors(){
  return num(document.getElementById('houseFloors').value) || 0;
}

function getRailLength(){
  const sel = document.getElementById('railSelect').value;
  if(sel === 'custom'){
    const c = num(document.getElementById('railCustom').value);
    return c && c>0 ? c : 2.4;
  }
  return parseFloat(sel);
}

function buildTabs(){
  const tabsEl = document.getElementById('roofTabs');
  tabsEl.innerHTML = '';
  state.roofs.forEach((r,i)=>{
    const b = document.createElement('button');
    b.className = 'tab-btn' + (i===state.activeTab?' active':'');
    b.textContent = 'Telhado ' + (i+1);
    b.onclick = ()=>{ state.activeTab = i; buildTabs(); renderRoofPanels(); };
    tabsEl.appendChild(b);
  });
}

function svgDiagram(largura, altura, pack){
  if(!pack || !pack.blocks.length || !largura || !altura) return '';
  const padL=34, padT=18, padR=14, padB=14, boxW=360, boxH=200;
  const scale = Math.min(boxW/largura, boxH/altura);
  const drawW = largura*scale, drawH = altura*scale;
  const vbW = drawW+padL+padR, vbH = drawH+padT+padB;
  let cells = '';
  pack.blocks.forEach(block=>{
    const cellW = block.alongRow*scale, cellH = block.alongCol*scale;
    const cls = block.isMain ? 'mod-rect' : 'mod-rect mod-rect-extra';
    for(let r=0;r<block.rows;r++){
      for(let c=0;c<block.perRow;c++){
        const x = padL + (block.x + c*block.alongRow)*scale + 1;
        const y = padT + (block.y + r*block.alongCol)*scale + 1;
        cells += `<rect class="${cls}" x="${x}" y="${y}" width="${cellW-2}" height="${cellH-2}"/>`;
      }
    }
  });
  return `<svg viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${padL}" y="${padT}" width="${drawW}" height="${drawH}" fill="none" stroke="var(--line-strong)" stroke-dasharray="3,3"/>
    ${cells}
    <line class="dim-line" x1="${padL}" y1="${padT-6}" x2="${padL+drawW}" y2="${padT-6}"/>
    <text class="dim-text" x="${padL+drawW/2}" y="${padT-9}" text-anchor="middle">${largura} m</text>
    <line class="dim-line" x1="${padL-6}" y1="${padT}" x2="${padL-6}" y2="${padT+drawH}"/>
    <text class="dim-text" x="${padL-9}" y="${padT+drawH/2}" text-anchor="middle" transform="rotate(-90 ${padL-9} ${padT+drawH/2})">${altura} m</text>
  </svg>`;
}

function renderRoofPanels(){
  const wrap = document.getElementById('roofPanels');
  wrap.innerHTML = '';
  const {modH, modW} = getModuleDims();
  const railLength = getRailLength();
  const cablePerFloor = num(document.getElementById('cablePerFloor').value) || 3.5;

  state.roofs.forEach((roof, i)=>{
    const panel = document.createElement('div');
    panel.className = 'roof-body' + (i===state.activeTab ? '' : ' hidden');

    const eff = getRoofModuleDims(roof, modH, modW);
    const pack = packRoof(roof.largura, roof.altura, eff.modH, eff.modW, roof.orientation);
    const hasFit = pack && pack.total > 0;
    const mainBlock = hasFit ? pack.blocks.find(b=>b.isMain) : null;
    const extraTotal = hasFit ? pack.total - mainBlock.total : 0;
    const mat = hasFit ? calcMaterials(pack, railLength, getHouseFloors(), cablePerFloor) : null;

    panel.innerHTML = `
      <div>
        <div class="grid" style="grid-template-columns:1fr 1fr;">
          <div class="field">
            <label>Largura do telhado (m)</label>
            <input type="number" step="0.01" class="roof-input" data-i="${i}" data-k="largura" value="${roof.largura ?? ''}">
          </div>
          <div class="field">
            <label>Altura do telhado (m)</label>
            <input type="number" step="0.01" class="roof-input" data-i="${i}" data-k="altura" value="${roof.altura ?? ''}">
          </div>
          <div class="field" style="grid-column:1/-1;">
            <label>Orientação da água do telhado (face solar)</label>
            <select class="roof-facing" data-i="${i}">
              <option value="" ${roof.facing===''?'selected':''}>Não definida</option>
              <option value="norte" ${roof.facing==='norte'?'selected':''}>Norte</option>
              <option value="leste" ${roof.facing==='leste'?'selected':''}>Leste</option>
              <option value="sul" ${roof.facing==='sul'?'selected':''}>Sul</option>
              <option value="oeste" ${roof.facing==='oeste'?'selected':''}>Oeste</option>
            </select>
          </div>
        </div>
        <div class="orient-toggle" style="margin:14px 0 4px;display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="orient-btn ${roof.orientation==='auto'?'active':''}" data-i="${i}" data-o="auto">Automática</button>
          <button type="button" class="orient-btn ${roof.orientation==='retrato'?'active':''}" data-i="${i}" data-o="retrato">Retrato</button>
          <button type="button" class="orient-btn ${roof.orientation==='paisagem'?'active':''}" data-i="${i}" data-o="paisagem">Paisagem</button>
        </div>

        <div class="switch-row">
          <label class="switch">
            <input type="checkbox" class="custom-mod-toggle" data-i="${i}" ${roof.customModule.enabled ? 'checked' : ''}>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
          <span class="switch-label">Usar outro tamanho de módulo</span>
        </div>
        ${roof.customModule.enabled ? `
        <div class="field" style="margin-top:10px;">
          <label>Módulo do catálogo (preenche tudo, inclusive Voc/Isc)</label>
          <select class="roof-module-select" data-i="${i}"><option value="">— Personalizado —</option></select>
        </div>
        <div class="grid" style="grid-template-columns:1fr 1fr 1fr;margin-top:10px;">
          <div class="field">
            <label>Altura do módulo (m)</label>
            <input type="number" step="0.001" class="custom-mod-input" data-i="${i}" data-k="modH" value="${roof.customModule.modH ?? ''}">
          </div>
          <div class="field">
            <label>Largura do módulo (m)</label>
            <input type="number" step="0.001" class="custom-mod-input" data-i="${i}" data-k="modW" value="${roof.customModule.modW ?? ''}">
          </div>
          <div class="field">
            <label>Potência (W)</label>
            <input type="number" step="1" class="custom-mod-input" data-i="${i}" data-k="power" value="${roof.customModule.power ?? ''}">
          </div>
        </div>
        <div class="hint-box" style="margin-top:10px;">Se não selecionar do catálogo, informe o Voc/Isc deste módulo personalizado lá embaixo, na seção "05 · Dimensionamento de strings" — é lá que o cálculo de strings/MPPT realmente usa esses valores.</div>` : ''}
        ${hasFit ? svgDiagram(roof.largura, roof.altura, pack) : '<div class="readout" style="text-align:center;color:var(--text-dim);">Preencha módulo e telhado para ver o encaixe</div>'}
      </div>
      <div>
        ${hasFit ? `<span class="orient-tag">${mainBlock.orientation} · ${mainBlock.rows} fila(s) × ${mainBlock.perRow}${extraTotal>0 ? ` <span style="opacity:.75">+ ${extraTotal} na área residual</span>` : ''}</span>` : ''}
        <div class="readout">
          <div class="readout-row"><span class="k">Módulos que cabem</span><span class="v">${hasFit ? pack.total : '—'}</span></div>
          <div class="readout-row"><span class="k">Trilhos (total)</span><span class="v">${mat ? mat.totalRails : '—'}</span></div>
          <div class="readout-row"><span class="k">Parafusos estruturais</span><span class="v">${mat ? mat.structScrews : '—'}</span></div>
          <div class="readout-row"><span class="k">Parafusos finais</span><span class="v">${mat ? mat.finalScrews : '—'}</span></div>
          <div class="readout-row"><span class="k">Grampos intermediários</span><span class="v">${mat ? mat.interClamps : '—'}</span></div>
          <div class="readout-row"><span class="k">Cabo (telhado)</span><span class="v">${mat ? fmt(mat.cableFlat,2)+' m' : '—'}</span></div>
          <div class="readout-row"><span class="k">Cabo (descida)</span><span class="v">${mat ? fmt(mat.cableDescida,2)+' m' : '—'}</span></div>
          <div class="readout-row"><span class="k">Cabo total</span><span class="v">${mat ? fmt(mat.cableTotal,2)+' m' : '—'}</span></div>
        </div>
      </div>
    `;
    wrap.appendChild(panel);
  });

  wrap.querySelectorAll('.roof-input').forEach(inp=>{
    inp.addEventListener('blur', (e)=>{
      const i = parseInt(e.target.dataset.i), k = e.target.dataset.k;
      state.roofs[i][k] = num(e.target.value);
      renderRoofPanels();
      renderTotals();
      renderInverter();
      renderStringPlan();
    });
  });

  wrap.querySelectorAll('.orient-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const i = parseInt(e.target.dataset.i), o = e.target.dataset.o;
      state.roofs[i].orientation = o;
      renderRoofPanels();
      renderTotals();
      renderInverter();
      renderStringPlan();
    });
  });

  wrap.querySelectorAll('.roof-facing').forEach(sel=>{
    sel.addEventListener('change', (e)=>{
      const i = parseInt(e.target.dataset.i);
      state.roofs[i].facing = e.target.value;
      renderTotals();
      renderStringPlan();
    });
  });

  wrap.querySelectorAll('.custom-mod-toggle').forEach(tog=>{
    tog.addEventListener('change', (e)=>{
      const i = parseInt(e.target.dataset.i);
      state.roofs[i].customModule.enabled = e.target.checked;
      renderRoofPanels();
      renderTotals();
      renderInverter();
      renderStringPlan();
    });
  });

  wrap.querySelectorAll('.custom-mod-input').forEach(inp=>{
    inp.addEventListener('blur', (e)=>{
      const i = parseInt(e.target.dataset.i), k = e.target.dataset.k;
      state.roofs[i].customModule[k] = num(e.target.value);
      renderRoofPanels();
      renderTotals();
      renderInverter();
      renderStringPlan();
    });
  });

  wrap.querySelectorAll('.roof-module-select').forEach(sel=>{
    const i = parseInt(sel.dataset.i);
    popularSelectModulos(sel, state.roofs[i].customModule.idCatalogo || '');
    sel.addEventListener('change', (e)=>{
      const i = parseInt(e.target.dataset.i);
      const mod = modulosCatalogo.find(m=>String(m.IdModulo)===String(e.target.value));
      state.roofs[i].customModule.idCatalogo = e.target.value || null;
      if(mod){
        state.roofs[i].customModule.modH = num(mod.AlturaM);
        state.roofs[i].customModule.modW = num(mod.LarguraM);
        state.roofs[i].customModule.power = num(mod.PotenciaW);
        state.roofs[i].customModule.voc = num(mod.VocV);
        state.roofs[i].customModule.isc = num(mod.IscA);
        state.roofs[i].customModule.pesoKg = num(mod.PesoKg);
      }
      renderRoofPanels();
      renderTotals();
      renderInverter();
      renderStringPlan();
    });
  });

  renderCustomModuleVocInputs();
}

function renderCustomModuleVocInputs(){
  const container = document.getElementById('customModuleVocInputs');
  if(!container) return;
  const activeRoofs = state.roofs.map((r,i)=>({r,i})).filter(x=>x.r.customModule.enabled);
  if(!activeRoofs.length){ container.innerHTML = ''; return; }

  container.innerHTML = activeRoofs.map(({r,i})=>{
    const powerLabel = r.customModule.power ? `${fmt(r.customModule.power,0)} W` : `Telhado ${i+1}`;
    return `<div class="grid" style="grid-template-columns:1fr 1fr;margin-top:10px;">
      <div class="field">
        <label>Voc do módulo · ${powerLabel} (Telhado ${i+1})</label>
        <input type="number" step="0.01" class="roof-voc-input" data-i="${i}" value="${r.customModule.voc ?? ''}">
      </div>
      <div class="field">
        <label>Isc do módulo · ${powerLabel} (Telhado ${i+1})</label>
        <input type="number" step="0.01" class="roof-isc-input" data-i="${i}" value="${r.customModule.isc ?? ''}">
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.roof-voc-input').forEach(inp=>{
    inp.addEventListener('blur', (e)=>{
      state.roofs[parseInt(e.target.dataset.i)].customModule.voc = num(e.target.value);
      renderStringPlan();
    });
  });
  container.querySelectorAll('.roof-isc-input').forEach(inp=>{
    inp.addEventListener('blur', (e)=>{
      state.roofs[parseInt(e.target.dataset.i)].customModule.isc = num(e.target.value);
      renderStringPlan();
    });
  });
}

function getAllLayouts(){
  const {modH, modW} = getModuleDims();
  const railLength = getRailLength();
  const cablePerFloor = num(document.getElementById('cablePerFloor').value) || 3.5;
  return state.roofs.map(r=>{
    const eff = getRoofModuleDims(r, modH, modW);
    const pack = packRoof(r.largura, r.altura, eff.modH, eff.modW, r.orientation);
    const mat = (pack && pack.total>0) ? calcMaterials(pack, railLength, getHouseFloors(), cablePerFloor) : null;
    return { pack, mat, roof:r };
  });
}

function renderTotals(){
  const all = getAllLayouts();
  const sum = (key, obj)=> all.reduce((a,x)=> a + (x[obj] ? (x[obj][key]||0) : 0), 0);
  const totalModules = all.reduce((a,x)=> a + (x.pack ? x.pack.total : 0), 0);
  const totalRows = all.reduce((a,x)=> a + (x.pack ? x.pack.rows : 0), 0);
  const totalRails = sum('totalRails','mat');
  const totalStruct = sum('structScrews','mat');
  const totalFinal = sum('finalScrews','mat');
  const totalInter = sum('interClamps','mat');
  const totalCable = sum('cableTotal','mat');
  const totalWeight = all.reduce((a,x)=>{
    if(!x.pack || !x.pack.total) return a;
    const w = getRoofWeight(x.roof, globalModuloPesoKg);
    return a + (w ? x.pack.total*w : 0);
  }, 0);

  const grid = document.getElementById('totalsGrid');
  grid.innerHTML = `
    <div class="stat hero"><div class="label">Total de módulos</div><div class="val">${totalModules}</div></div>
    <div class="stat"><div class="label">Filas (total)</div><div class="val">${totalRows}</div></div>
    <div class="stat"><div class="label">Trilhos</div><div class="val">${totalRails}</div></div>
    <div class="stat"><div class="label">Parafusos estruturais</div><div class="val">${totalStruct}</div></div>
    <div class="stat"><div class="label">Parafusos finais</div><div class="val">${totalFinal}</div></div>
    <div class="stat"><div class="label">Grampos intermediários</div><div class="val">${totalInter}</div></div>
    <div class="stat"><div class="label">Cabo solar</div><div class="val">${fmt(totalCable,2)} <small>m</small></div></div>
    ${totalWeight>0 ? `<div class="stat"><div class="label">Peso total dos módulos</div><div class="val">${fmt(totalWeight,1)} <small>kg</small></div></div>` : ''}
  `;
}

function renderInverter(){
  const all = getAllLayouts();
  const totalModulesMax = all.reduce((a,x)=> a + (x.pack ? x.pack.total : 0), 0);
  const mode = document.querySelector('input[name=qtyMode]:checked').value;
  const manualQty = num(document.getElementById('manualQty').value);
  const modPower = num(document.getElementById('modPower').value);
  const invMax = num(document.getElementById('invMax').value);

  document.getElementById('manualQtyWrap').style.display = mode==='manual' ? 'block' : 'none';

  let qty = mode==='max' ? totalModulesMax : (manualQty || 0);
  let kwp = null;
  if(mode==='max'){
    const kwpSum = all.reduce((a,x)=>{
      if(!x.pack || !x.pack.total) return a;
      const power = getRoofPower(x.roof, modPower);
      return a + (power ? (x.pack.total*power)/1000 : 0);
    }, 0);
    kwp = kwpSum>0 ? kwpSum : null;
  } else {
    kwp = (modPower && qty) ? (qty*modPower)/1000 : null;
  }

  document.getElementById('outQty').textContent = qty || '—';
  document.getElementById('outKwp').textContent = kwp!==null ? fmt(kwp,2)+' kWp' : '—';

  const statusEl = document.getElementById('invStatus');
  statusEl.innerHTML = '';
  if(mode==='manual' && manualQty && totalModulesMax){
    if(manualQty > totalModulesMax){
      statusEl.innerHTML = `<div class="status warn">A quantidade definida (${manualQty}) excede o máximo que cabe nos telhados (${totalModulesMax}).</div>`;
    } else {
      statusEl.innerHTML = `<div class="status ok">Quantidade definida cabe nos telhados (máximo: ${totalModulesMax}).</div>`;
    }
  }
  if(kwp!==null && invMax){
    const cls = kwp <= invMax ? 'ok' : 'warn';
    const msg = kwp <= invMax
      ? `Potência do sistema (${fmt(kwp,2)} kWp) dentro do limite do inversor (${fmt(invMax,2)} kWp).`
      : `Potência do sistema (${fmt(kwp,2)} kWp) excede a potência máxima do inversor (${fmt(invMax,2)} kWp).`;
    statusEl.innerHTML += `<div class="status ${cls}">${msg}</div>`;
  }
}

// --- String / MPPT dimensioning ---

const FACING_LABELS = { norte:'Norte', leste:'Leste', sul:'Sul', oeste:'Oeste', '': 'Sem orientação definida' };
const FACING_ORDER = ['norte','leste','sul','oeste',''];

// Splits `total` modules into as-equal-as-possible strings, each string's
// module count within [modsMin, modsMax]. Prefers using every module; if it
// can't, maximizes modules used and reports the rest as leftover.
function bestStringSplit(total, modsMin, modsMax){
  if(!total || total<=0) return { strings:0, sizes:[], leftover:0 };
  const maxPossibleStrings = Math.max(1, Math.floor(total/Math.max(modsMin,1)));
  let s = Math.max(1, Math.ceil(total/modsMax));
  for(; s<=maxPossibleStrings; s++){
    const base = Math.floor(total/s), rem = total % s;
    const topSize = base + (rem>0 ? 1 : 0);
    if(base >= modsMin && topSize <= modsMax){
      const sizes = [];
      for(let k=0;k<s;k++) sizes.push(k<rem ? base+1 : base);
      return { strings:s, sizes, leftover:0 };
    }
  }
  // couldn't use 100% of modules within the valid range — pack full-size
  // strings and keep a final partial one only if it still meets the minimum.
  const fullStrings = Math.floor(total/modsMax);
  const remainder = total - fullStrings*modsMax;
  let strings = fullStrings, sizes = Array(fullStrings).fill(modsMax), leftover = remainder;
  if(remainder >= modsMin){ strings++; sizes.push(remainder); leftover = 0; }
  return { strings, sizes, leftover };
}

function stringColor(mpptIndex, stringIndex, stringCount){
  const hue = (mpptIndex * 61) % 360;
  const lightness = stringCount<=1 ? 46 : 30 + Math.round((stringIndex/(stringCount-1))*32);
  return `hsl(${hue} 62% ${lightness}%)`;
}

function computeStringPlan(){
  const globalVoc = num(document.getElementById('vocMod').value);
  const globalIsc = num(document.getElementById('iscMod').value);
  const startupV = num(document.getElementById('startupV').value);
  const mpptMinV = num(document.getElementById('mpptMinV').value);
  const mpptMaxV = num(document.getElementById('mpptMaxV').value);
  const numMppts = num(document.getElementById('numMppts').value);

  // Cada MPPT tem sua própria corrente máxima e seu próprio número de strings —
  // alguns inversores têm MPPTs desiguais entre si (ex: MPPT1/4=60A/2 strings,
  // MPPT2/3=48A/1 string), então isso não pode mais ser um valor único global.
  const slotsConfig = mpptsConfigAtual.map(c=>({ maxIsc: num(c.maxIsc), maxStrings: num(c.maxStrings) }));
  const slotsValidos = slotsConfig.length>0 && slotsConfig.every(s=>s.maxIsc>0 && s.maxStrings>0);

  if(!mpptMinV || !mpptMaxV || !numMppts || !slotsValidos){
    return { ready:false };
  }

  const all = getAllLayouts();
  // group modules by facing + effective Voc/Isc (roofs with a custom module
  // have their own electrical spec; everyone else uses the global one)
  const groups = {};
  const groupOrder = [];
  const missingSpecRoofs = [];

  all.forEach((x,i)=>{
    if(!x.pack || !x.pack.total) return;
    const facing = x.roof.facing || '';
    const elec = getRoofElectrical(x.roof, globalVoc, globalIsc);
    if(!elec.voc || !elec.isc){
      if(elec.isCustom) missingSpecRoofs.push(i);
      return;
    }
    const power = (x.roof.customModule && x.roof.customModule.enabled && x.roof.customModule.power) ? x.roof.customModule.power : null;
    const key = facing + '|' + elec.voc + '|' + elec.isc;
    if(!groups[key]){
      groups[key] = { facing, voc:elec.voc, isc:elec.isc, power, total:0, roofRefs:[] };
      groupOrder.push(key);
    }
    groups[key].total += x.pack.total;
    groups[key].roofRefs.push({ i, count: x.pack.total });
  });

  if(!groupOrder.length){
    let error = null;
    if(missingSpecRoofs.length){
      error = `Informe o Voc e o Isc do módulo customizado do(s) telhado(s): ${missingSpecRoofs.map(i=>i+1).join(', ')}.`;
    } else if(!globalVoc || !globalIsc){
      error = 'Informe o Voc e o Isc do módulo padrão.';
    }
    return { ready:true, error, groupResults:[], totalMpptsUsed:0, mpptsAvailable:numMppts, mpptsLeftover:numMppts, minStringVoltage:0, startupV, layouts:all, roofColorSlices:{} };
  }

  // sort: by facing order, then by descending power (nicer grouping in the UI)
  groupOrder.sort((a,b)=>{
    const ga=groups[a], gb=groups[b];
    const fi = FACING_ORDER.indexOf(ga.facing) - FACING_ORDER.indexOf(gb.facing);
    if(fi!==0) return fi;
    return (gb.power||0) - (ga.power||0);
  });

  // Pool de MPPTs físicos, compartilhado entre todos os grupos (é o mesmo
  // inversor) — cada slot só aceita mais uma string se sobrar espaço (strings)
  // E corrente, processados na ordem em que aparecem no cadastro (MPPT 1
  // primeiro). Um MPPT só pode ter strings de UMA orientação/tipo de módulo —
  // misturar facing/Voc/Isc diferentes no mesmo MPPT não é fisicamente
  // possível (o rastreamento de máxima potência de um MPPT único não faz
  // sentido pra duas curvas I-V diferentes), então groupKey trava o slot
  // assim que a primeira string entra nele.
  const slots = slotsConfig.map((s,idx)=>({ id: idx+1, maxIsc: s.maxIsc, maxStrings: s.maxStrings, stringsUsadas:0, correnteUsada:0, groupKey:null }));
  const groupResults = [];
  const roofColorSlices = {};

  groupOrder.forEach(key=>{
    const g = groups[key];
    const modsMax = Math.floor(mpptMaxV/g.voc + 1e-9);
    const modsMin = Math.ceil(mpptMinV/g.voc - 1e-9);
    if(modsMax < 1 || modsMax < modsMin){
      groupResults.push({ facing:g.facing, voc:g.voc, isc:g.isc, power:g.power, totalModules:g.total,
        usedModules:0, unusedModules:g.total, mppts:[], noMppts:false,
        error:`Nenhuma quantidade de módulos em série encaixa na faixa de tensão da MPPT (${fmt(mpptMinV,0)}–${fmt(mpptMaxV,0)} V) com Voc de ${fmt(g.voc,2)} V.` });
      g.roofRefs.forEach(r=> roofColorSlices[r.i] = Array(r.count).fill(null));
      return;
    }

    const split = bestStringSplit(g.total, modsMin, modsMax);
    if(split.strings === 0){
      groupResults.push({ facing:g.facing, voc:g.voc, isc:g.isc, power:g.power, totalModules:g.total, usedModules:0, unusedModules:g.total, mppts:[], noMppts:false });
      g.roofRefs.forEach(r=> roofColorSlices[r.i] = Array(r.count).fill(null));
      return;
    }

    // Aloca cada string desse grupo no primeiro slot com espaço (strings) e
    // corrente sobrando — na ordem dos MPPTs cadastrados.
    const usadosPorSlot = {}; // id do slot -> array de tamanhos (nº de módulos) das strings dele
    let unusedModules = split.leftover;
    let sobrouStringSemMppt = false;

    split.sizes.forEach(sz=>{
      const slot = slots.find(s =>
        (s.groupKey===null || s.groupKey===key) &&
        s.stringsUsadas < s.maxStrings &&
        (s.correnteUsada + g.isc) <= s.maxIsc + 1e-9
      );
      if(!slot){ unusedModules += sz; sobrouStringSemMppt = true; return; }
      slot.groupKey = key;
      slot.stringsUsadas++;
      slot.correnteUsada += g.isc;
      if(!usadosPorSlot[slot.id]) usadosPorSlot[slot.id] = [];
      usadosPorSlot[slot.id].push(sz);
    });

    const mppts = [];
    const colorSlots = [];
    Object.keys(usadosPorSlot).map(Number).sort((a,b)=>a-b).forEach(id=>{
      const chunk = usadosPorSlot[id];
      const slot = slots.find(s=>s.id===id);
      const stringsArr = chunk.map((sz,idx)=>{
        const voltage = sz*g.voc;
        const color = stringColor(id, idx, chunk.length);
        const label = `String ${idx+1} · MPPT ${id} · ${fmt(voltage,0)} V`;
        for(let m=0;m<sz;m++) colorSlots.push({ color, label });
        return { modules:sz, voltage, current:g.isc, color, label, index:idx+1 };
      });
      mppts.push({
        id,
        strings: stringsArr,
        totalCurrent: chunk.length*g.isc,
        totalMaxIsc: slot.maxIsc,
        modules: chunk.reduce((a,b)=>a+b,0)
      });
    });
    for(let u=0; u<unusedModules; u++) colorSlots.push(null);

    // hand out this group's colored slots to the roofs that contributed to it, in order
    let cursor = 0;
    g.roofRefs.forEach(r=>{
      roofColorSlices[r.i] = colorSlots.slice(cursor, cursor+r.count);
      cursor += r.count;
    });

    groupResults.push({
      facing:g.facing, voc:g.voc, isc:g.isc, power:g.power, totalModules:g.total, usedModules: g.total-unusedModules, unusedModules,
      mppts, noMppts: sobrouStringSemMppt
    });
  });

  // A tensão de partida do inversor é conferida por MPPT (strings de um mesmo
  // MPPT ficam em paralelo, então a tensão não soma entre elas) — o pior caso
  // do sistema é a string com MENOS módulos, então comparamos a tensão MÍNIMA
  // encontrada com a tensão de partida, não a soma de todas as strings do
  // sistema inteiro (que nunca corresponde a nenhuma grandeza elétrica real).
  const allStringVoltages = [];
  groupResults.forEach(g=> g.mppts.forEach(m=> m.strings.forEach(s=> allStringVoltages.push(s.voltage))));
  const minStringVoltage = allStringVoltages.length ? Math.min(...allStringVoltages) : 0;
  const startupOk = startupV ? (allStringVoltages.length>0 && minStringVoltage >= startupV) : null;

  const totalMpptsUsed = slots.filter(s=>s.stringsUsadas>0).length;

  return {
    ready:true, missingSpecRoofs,
    groupResults, totalMpptsUsed, mpptsAvailable:numMppts, mpptsLeftover:numMppts-totalMpptsUsed,
    minStringVoltage, startupV, startupOk, layouts:all, roofColorSlices
  };
}

function svgDiagramColored(largura, altura, pack, colorSlice){
  if(!pack || !pack.blocks.length || !largura || !altura) return '';
  const padL=34, padT=18, padR=14, padB=14, boxW=360, boxH=200;
  const scale = Math.min(boxW/largura, boxH/altura);
  const drawW = largura*scale, drawH = altura*scale;
  const vbW = drawW+padL+padR, vbH = drawH+padT+padB;
  let cells = ''; let slotIdx = 0;
  pack.blocks.forEach(block=>{
    const cellW = block.alongRow*scale, cellH = block.alongCol*scale;
    for(let r=0;r<block.rows;r++){
      for(let c=0;c<block.perRow;c++){
        const x = padL + (block.x + c*block.alongRow)*scale + 1;
        const y = padT + (block.y + r*block.alongCol)*scale + 1;
        const slot = colorSlice ? colorSlice[slotIdx] : null;
        const fill = slot ? slot.color : 'rgba(255,255,255,0.06)';
        const stroke = slot ? 'rgba(0,0,0,0.4)' : 'var(--line-strong)';
        cells += `<rect x="${x}" y="${y}" width="${cellW-2}" height="${cellH-2}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
        slotIdx++;
      }
    }
  });
  return `<svg viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${padL}" y="${padT}" width="${drawW}" height="${drawH}" fill="none" stroke="var(--line-strong)" stroke-dasharray="3,3"/>
    ${cells}
    <text class="dim-text" x="${padL+drawW/2}" y="${padT-9}" text-anchor="middle">${largura} m</text>
    <text class="dim-text" x="${padL-9}" y="${padT+drawH/2}" text-anchor="middle" transform="rotate(-90 ${padL-9} ${padT+drawH/2})">${altura} m</text>
  </svg>`;
}

function roofStringLegend(colorSlice){
  if(!colorSlice || !colorSlice.length){
    return '<div style="font-size:12px;color:var(--text-dim);">Sem strings atribuídas ainda</div>';
  }
  const seen = new Map();
  let hasUnassigned = false;
  colorSlice.forEach(s=>{
    if(s){ if(!seen.has(s.label)) seen.set(s.label, s.color); }
    else hasUnassigned = true;
  });
  let html = '<div class="legend-list">' + [...seen.entries()].map(([label,color])=>
    `<div class="legend-chip"><span class="legend-swatch" style="background:${color};"></span>${label.toUpperCase()}</div>`
  ).join('') + '</div>';
  if(hasUnassigned){
    html += '<div class="legend-chip" style="margin-top:6px;"><span class="legend-swatch" style="background:rgba(255,255,255,0.15);"></span>SEM STRING</div>';
  }
  return html;
}

function renderStringPlan(){
  const out = document.getElementById('stringPlanOutput');
  const plan = computeStringPlan();

  if(!plan.ready){
    out.innerHTML = `<div class="readout" style="text-align:center;color:var(--text-dim);">Preencha os dados do módulo e da MPPT para calcular as strings</div>`;
    return;
  }
  if(plan.error && !plan.groupResults.length){
    out.innerHTML = `<div class="status warn">${plan.error}</div>`;
    return;
  }

  let html = `<div class="totals-grid" style="margin-bottom:16px;">
    <div class="stat"><div class="label">MPPTs usadas</div><div class="val">${plan.totalMpptsUsed}<small> / ${plan.mpptsAvailable}</small></div></div>
    <div class="stat"><div class="label">Menor tensão de string</div><div class="val">${fmt(plan.minStringVoltage,1)}<small> V</small></div></div>
  </div>`;

  if(plan.error){
    html += `<div class="status warn">${plan.error}</div>`;
  }

  if(plan.startupV){
    const cls = plan.startupOk ? 'ok' : 'warn';
    html += `<div class="status ${cls}">${plan.startupOk
      ? `A string mais fraca do sistema (${fmt(plan.minStringVoltage,1)} V) atinge a tensão de partida do inversor (${fmt(plan.startupV,0)} V).`
      : `A string mais fraca do sistema (${fmt(plan.minStringVoltage,1)} V) fica abaixo da tensão de partida do inversor (${fmt(plan.startupV,0)} V) — o inversor pode não ligar.`}</div>`;
  }

  if(plan.mpptsLeftover < 0 || plan.groupResults.some(g=>g.noMppts)){
    html += `<div class="status warn">Não há MPPTs suficientes para acomodar todas as orientações/módulos com strings equilibradas — parte dos módulos ficaria sem string.</div>`;
  }

  if(!plan.groupResults.length){
    html += `<div class="readout" style="text-align:center;color:var(--text-dim);">Nenhum módulo calculado ainda nos telhados.</div>`;
  }

  plan.groupResults.forEach(g=>{
    const modLabel = g.power ? `Módulo ${fmt(g.power,0)}W` : `Voc ${fmt(g.voc,2)}V`;
    html += `<div class="readout" style="margin-top:14px;">
      <div class="readout-row"><span class="k">Face ${FACING_LABELS[g.facing]} · ${modLabel}</span><span class="v">${g.usedModules} / ${g.totalModules} módulos</span></div>
      <div class="readout-row"><span class="k">Voc / Isc do módulo</span><span class="v">${fmt(g.voc,2)} V / ${fmt(g.isc,2)} A</span></div>
      ${g.unusedModules>0 ? `<div class="readout-row"><span class="k" style="color:var(--warn);">Módulos sem string</span><span class="v" style="color:var(--warn);">${g.unusedModules}</span></div>` : ''}
      ${g.error ? `<div class="readout-row"><span class="k" style="color:var(--danger);">${g.error}</span></div>` : ''}
    </div>`;
    if(g.mppts.length){
      html += `<div class="mppt-grid">`;
      g.mppts.forEach(m=>{
        const hue = (m.id*61)%360;
        html += `<div class="mppt-card" style="border-color:hsl(${hue} 45% 32%);">
          <div class="mppt-card-title" style="color:hsl(${hue} 70% 68%);">MPPT ${m.id}</div>
          <div class="mppt-card-sub">${m.modules} módulos · ${fmt(m.totalCurrent,2)} A / ${fmt(m.totalMaxIsc,2)} A</div>
          <div class="string-list">`;
        m.strings.forEach((s,idx)=>{
          html += `<div class="string-chip" style="background:${s.color};">
            <span>String ${idx+1}</span><span>${s.modules} mód · ${fmt(s.voltage,1)} V</span>
          </div>`;
        });
        html += `</div></div>`;
      });
      html += `</div>`;
    }
  });

  if(plan.layouts && plan.layouts.some(x=>x.pack && x.pack.total)){
    html += `<div class="section-label">Telhados com strings identificadas por cor</div>`;
    plan.layouts.forEach((x,i)=>{
      if(!x.pack || !x.pack.total) return;
      const slice = plan.roofColorSlices ? plan.roofColorSlices[i] : null;
      html += `<div class="roof-string-block">
        <div class="roof-string-title">Telhado ${i+1}${x.roof.facing ? ' · '+FACING_LABELS[x.roof.facing] : ''}</div>
        ${svgDiagramColored(x.roof.largura, x.roof.altura, x.pack, slice)}
        ${roofStringLegend(slice)}
      </div>`;
    });
  }

  out.innerHTML = html;
}

function rebuildRoofCount(newCount){
  const current = state.roofs.length;
  if(newCount > current){
    for(let i=current;i<newCount;i++) state.roofs.push({largura:null, altura:null, orientation:'auto', facing:'', customModule:{enabled:false, modH:null, modW:null, power:null, vocMod:null, iscMod:null, idCatalogo:null, pesoKg:null}});
  } else if(newCount < current){
    state.roofs = state.roofs.slice(0, newCount);
    if(state.activeTab >= newCount) state.activeTab = newCount-1;
  }
  buildTabs();
  renderRoofPanels();
  renderTotals();
  renderInverter();
  renderStringPlan();
}

document.getElementById('modH').addEventListener('blur', ()=>{ renderRoofPanels(); renderTotals(); renderInverter(); renderStringPlan(); });
document.getElementById('modW').addEventListener('blur', ()=>{ renderRoofPanels(); renderTotals(); renderInverter(); renderStringPlan(); });
document.getElementById('cablePerFloor').addEventListener('blur', ()=>{ renderRoofPanels(); renderTotals(); });
document.getElementById('houseFloors').addEventListener('blur', ()=>{ renderRoofPanels(); renderTotals(); });
document.getElementById('modPower').addEventListener('blur', renderInverter);
document.getElementById('modPower').addEventListener('blur', renderStringPlan);

document.getElementById('railSelect').addEventListener('change', (e)=>{
  document.getElementById('railCustomWrap').style.display = e.target.value==='custom' ? 'block' : 'none';
  renderRoofPanels(); renderTotals(); renderStringPlan();
});
document.getElementById('railCustom').addEventListener('blur', ()=>{ renderRoofPanels(); renderTotals(); });

document.getElementById('roofCount').addEventListener('blur', (e)=>{
  let n = parseInt(e.target.value);
  if(!n || n<1) n = 1;
  if(n>20) n = 20;
  e.target.value = n;
  rebuildRoofCount(n);
});

document.querySelectorAll('input[name=qtyMode]').forEach(r=> r.addEventListener('change', renderInverter));
document.getElementById('manualQty').addEventListener('blur', renderInverter);
document.getElementById('invMax').addEventListener('blur', renderInverter);

['vocMod','iscMod','startupV','mpptMinV','mpptMaxV'].forEach(id=>{
  document.getElementById(id).addEventListener('blur', renderStringPlan);
});
document.getElementById('numMppts').addEventListener('input', (e)=>{ redimensionarMpptsConfigAtual(e.target.value); renderStringPlan(); });

document.getElementById('moduloCatalogoSelect').addEventListener('change', (e)=>{
  const mod = modulosCatalogo.find(m=>String(m.IdModulo)===String(e.target.value));
  globalModuloPesoKg = mod ? num(mod.PesoKg) : null;
  if(mod){
    document.getElementById('modH').value = mod.AlturaM ?? '';
    document.getElementById('modW').value = mod.LarguraM ?? '';
    document.getElementById('modPower').value = mod.PotenciaW ?? '';
    document.getElementById('vocMod').value = mod.VocV ?? '';
    document.getElementById('iscMod').value = mod.IscA ?? '';
  }
  renderRoofPanels(); renderTotals(); renderInverter(); renderStringPlan();
});

document.getElementById('btn-abrir-novo-modulo').addEventListener('click', abrirNovoModuloSheet);
document.getElementById('btn-nm-cancelar').addEventListener('click', fecharNovoModuloSheet);
document.getElementById('btn-nm-salvar').addEventListener('click', salvarNovoModuloRapido);
document.getElementById('novo-modulo-overlay').addEventListener('click', (e)=>{ if(e.target.id==='novo-modulo-overlay') fecharNovoModuloSheet(); });

document.getElementById('inversorCatalogoSelect').addEventListener('change', (e)=>{
  const inv = inversoresCatalogo.find(v=>String(v.IdInversor)===String(e.target.value));
  if(inv){
    document.getElementById('startupV').value = inv.StartupV ?? '';
    document.getElementById('mpptMinV').value = inv.MpptMinV ?? '';
    document.getElementById('mpptMaxV').value = inv.MpptMaxV ?? '';
    document.getElementById('numMppts').value = inv.NumMppts ?? '';
    const potMaxW = num(inv.PotenciaMaxCC_W);
    document.getElementById('invMax').value = potMaxW ? (potMaxW/1000) : '';
    mpptsConfigAtual = (inv.mpptsConfig||[]).map(c=>({maxIsc:c.maxIsc, maxStrings:c.maxStrings}));
    renderMpptsTable(document.getElementById('mpptsConfigWrap'), mpptsConfigAtual, (i,campo,valor)=>{ mpptsConfigAtual[i][campo]=valor; renderStringPlan(); });
  }
  renderInverter();
  renderStringPlan();
});
document.getElementById('btn-abrir-novo-inversor').addEventListener('click', abrirNovoInversorSheet);
document.getElementById('btn-ni-cancelar').addEventListener('click', fecharNovoInversorSheet);
document.getElementById('btn-ni-salvar').addEventListener('click', salvarNovoInversorRapido);
document.getElementById('novo-inversor-overlay').addEventListener('click', (e)=>{ if(e.target.id==='novo-inversor-overlay') fecharNovoInversorSheet(); });
document.getElementById('ni-numMppts').addEventListener('input', (e)=>{
  const n = Math.max(0, parseInt(e.target.value,10)||0);
  while(mpptsConfigNovoInversor.length<n) mpptsConfigNovoInversor.push({maxIsc:'',maxStrings:''});
  mpptsConfigNovoInversor.length = n;
  renderMpptsTable(document.getElementById('ni-mpptsWrap'), mpptsConfigNovoInversor, (i,campo,valor)=>{ mpptsConfigNovoInversor[i][campo]=valor; });
});

buildTabs();
renderRoofPanels();
renderTotals();
renderInverter();
redimensionarMpptsConfigAtual(document.getElementById('numMppts').value);
renderStringPlan();
carregarCatalogoProdutos();

  var backBtn = document.getElementById('btn-dim-back');
  if (backBtn) backBtn.addEventListener('click', function(){
    document.getElementById('screen-dimensionamento').classList.remove('active');
  });

  /**
   * Monta um PDF (via janela de impressão do navegador) no formato de
   * memorial técnico de projeto elétrico fotovoltaico, com os dados que já
   * estão preenchidos na tela: módulo/inversor, telhado a telhado (com
   * diagrama de encaixe), dimensionamento de strings/MPPT e lista de
   * materiais consolidada. Não substitui ART — é só um documento técnico
   * de apoio gerado a partir do que o técnico levantou em campo.
   */
  function gerarPDFProjeto(){
    var mod = getModuleDims();
    var modPower = num(document.getElementById('modPower').value);
    var invMax = num(document.getElementById('invMax').value);
    var railLength = getRailLength();
    var all = getAllLayouts();
    var plan = computeStringPlan();
    var session = (window.SGAuth && window.SGAuth.getSession()) || {};

    var roofsComDados = all.filter(function(x){ return x.pack && x.pack.total>0; });
    if(!roofsComDados.length){
      alert('Preencha ao menos um telhado (dimensões + módulo) antes de gerar o PDF.');
      return;
    }

    var totalModules = all.reduce(function(a,x){ return a + (x.pack?x.pack.total:0); },0);
    var totalKwp = all.reduce(function(a,x){
      if(!x.pack || !x.pack.total) return a;
      var power = getRoofPower(x.roof, modPower);
      return a + (power ? (x.pack.total*power)/1000 : 0);
    },0);
    var totalRails = all.reduce(function(a,x){ return a + (x.mat?x.mat.totalRails:0); },0);
    var totalStruct = all.reduce(function(a,x){ return a + (x.mat?x.mat.structScrews:0); },0);
    var totalFinal = all.reduce(function(a,x){ return a + (x.mat?x.mat.finalScrews:0); },0);
    var totalInter = all.reduce(function(a,x){ return a + (x.mat?x.mat.interClamps:0); },0);
    var totalCable = all.reduce(function(a,x){ return a + (x.mat?x.mat.cableTotal:0); },0);
    var totalWeight = all.reduce(function(a,x){
      if(!x.pack || !x.pack.total) return a;
      var w = getRoofWeight(x.roof, globalModuloPesoKg);
      return a + (w ? x.pack.total*w : 0);
    },0);

    var invCompatHtml = '';
    if(invMax && totalKwp>0){
      var ok = totalKwp <= invMax;
      invCompatHtml = '<div class="status-box '+(ok?'ok':'warn')+'">'+
        (ok
          ? 'Potência do sistema ('+fmt(totalKwp,2)+' kWp) dentro do limite do inversor ('+fmt(invMax,2)+' kWp).'
          : 'ATENÇÃO: potência do sistema ('+fmt(totalKwp,2)+' kWp) excede o limite do inversor ('+fmt(invMax,2)+' kWp).')+
        '</div>';
    }

    var roofsHtml = roofsComDados.map(function(x,idxVisible){
      var i = all.indexOf(x);
      var r = x.roof;
      var slice = plan.roofColorSlices ? plan.roofColorSlices[i] : null;
      var diagram = svgDiagramColored(r.largura, r.altura, x.pack, slice);
      var legenda = roofStringLegend(slice);
      var mat = x.mat;
      return '<div class="roof-block">'+
        '<h3>Telhado '+(i+1)+' &mdash; '+fmt(r.largura,2)+' × '+fmt(r.altura,2)+' m &mdash; '+(FACING_LABELS[r.facing]||'sem orientação definida')+'</h3>'+
        '<div class="roof-grid">'+
          '<div class="roof-diagram">'+diagram+legenda+'</div>'+
          '<table class="tbl">'+
            '<tr><td>Módulos nesse telhado</td><td>'+x.pack.total+'</td></tr>'+
            '<tr><td>Filas</td><td>'+x.pack.rows+'</td></tr>'+
            '<tr><td>Trilhos</td><td>'+(mat?mat.totalRails:'—')+'</td></tr>'+
            '<tr><td>Parafusos estruturais</td><td>'+(mat?mat.structScrews:'—')+'</td></tr>'+
            '<tr><td>Parafusos finais</td><td>'+(mat?mat.finalScrews:'—')+'</td></tr>'+
            '<tr><td>Grampos intermediários</td><td>'+(mat?mat.interClamps:'—')+'</td></tr>'+
            '<tr><td>Cabo solar (telhado + descida)</td><td>'+(mat?fmt(mat.cableTotal,2)+' m':'—')+'</td></tr>'+
          '</table>'+
        '</div>'+
      '</div>';
    }).join('');

    var stringHtml = '';
    if(plan.ready && plan.error){
      stringHtml = '<div class="status-box warn">'+plan.error+'</div>';
    } else if(plan.ready && plan.groupResults && plan.groupResults.length){
      plan.groupResults.forEach(function(g){
        stringHtml += '<h3>'+(FACING_LABELS[g.facing]||'Sem orientação definida')+(g.power?' &mdash; '+fmt(g.power,0)+' W':'')+' &mdash; Voc '+fmt(g.voc,2)+' V · Isc '+fmt(g.isc,2)+' A</h3>';
        if(g.error){
          stringHtml += '<div class="status-box warn">'+g.error+'</div>';
        } else {
          stringHtml += '<table class="tbl"><thead><tr><th>MPPT</th><th>String</th><th>Módulos em série</th><th>Tensão (V)</th><th>Corrente (A)</th></tr></thead><tbody>';
          g.mppts.forEach(function(m){
            m.strings.forEach(function(s){
              stringHtml += '<tr><td>MPPT '+m.id+'</td><td>String '+s.index+'</td><td>'+s.modules+'</td><td>'+fmt(s.voltage,1)+'</td><td>'+fmt(s.current,2)+'</td></tr>';
            });
          });
          stringHtml += '</tbody></table>';
          if(g.unusedModules>0){
            stringHtml += '<div class="status-box warn">'+g.unusedModules+' módulo(s) desse grupo não entraram em nenhuma string (MPPTs insuficientes) — não incluídos na conexão elétrica acima.</div>';
          }
        }
      });
      if(plan.startupV){
        stringHtml += '<div class="status-box '+(plan.startupOk?'ok':'warn')+'">'+
          (plan.startupOk
            ? 'A string mais fraca do sistema ('+fmt(plan.minStringVoltage,1)+' V) atinge a tensão de partida do inversor ('+fmt(plan.startupV,0)+' V).'
            : 'ATENÇÃO: a string mais fraca do sistema ('+fmt(plan.minStringVoltage,1)+' V) fica abaixo da tensão de partida do inversor ('+fmt(plan.startupV,0)+' V) — o inversor pode não ligar.')+
        '</div>';
      }
      stringHtml += '<div class="status-box" style="background:#f2f7f2;color:#4a5a4a;border-color:#dde8dd;">MPPTs usadas: '+plan.totalMpptsUsed+' de '+plan.mpptsAvailable+' disponíveis.</div>';
    } else {
      stringHtml = '<div class="status-box warn">Preencha Voc/Isc do módulo e os dados da MPPT (seção 05) para calcular o dimensionamento elétrico de strings.</div>';
    }

    // ── Planta baixa: reúne os telhados por orientação (Norte em cima, Sul
    // embaixo, Leste à direita, Oeste à esquerda), cada um com o diagrama
    // colorido por string e a legenda de MPPT/quantidade — dá pro técnico
    // enxergar o sistema inteiro de uma vez, não telhado por telhado.
    var plantaBaixaHtml = '';
    if(plan.ready && plan.groupResults && plan.groupResults.length){
      var porFacingPB = { norte:[], sul:[], leste:[], oeste:[], outros:[] };
      roofsComDados.forEach(function(x){
        var i = all.indexOf(x);
        var r = x.roof;
        var slicePB = plan.roofColorSlices ? plan.roofColorSlices[i] : null;
        var cellHtml = '<div class="pb-roof">'+
          '<div class="pb-roof-title">Telhado '+(i+1)+' &middot; '+fmt(r.largura,2)+'×'+fmt(r.altura,2)+' m</div>'+
          svgDiagramColored(r.largura, r.altura, x.pack, slicePB)+
          roofStringLegend(slicePB)+
        '</div>';
        var fKey = r.facing||'';
        (porFacingPB[fKey]||porFacingPB.outros).push(cellHtml);
      });
      var temOrientacaoPB = porFacingPB.norte.length||porFacingPB.sul.length||porFacingPB.leste.length||porFacingPB.oeste.length;
      if(temOrientacaoPB){
        var roseIcon='<svg class="pb-rose" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">'+
          '<circle cx="32" cy="32" r="30" fill="none" stroke="#dde8dd" stroke-width="1.5"/>'+
          '<path d="M32 6 L37 30 L32 26 L27 30 Z" fill="#78D800"/>'+
          '<path d="M32 58 L27 34 L32 38 L37 34 Z" fill="#c7d6c7"/>'+
          '<path d="M58 32 L34 27 L38 32 L34 37 Z" fill="#c7d6c7"/>'+
          '<path d="M6 32 L30 37 L26 32 L30 27 Z" fill="#c7d6c7"/>'+
          '<text x="32" y="16" text-anchor="middle" font-size="8" font-weight="700" fill="#003122" font-family="IBM Plex Mono, monospace">N</text>'+
        '</svg>';
        plantaBaixaHtml =
          '<div class="pb-compass">'+
            '<div class="pb-cell pb-norte"><div class="pb-dir">Norte</div>'+(porFacingPB.norte.join('')||'<div class="pb-empty">Sem telhado nessa face</div>')+'</div>'+
            '<div class="pb-cell pb-oeste"><div class="pb-dir">Oeste</div>'+(porFacingPB.oeste.join('')||'<div class="pb-empty">Sem telhado nessa face</div>')+'</div>'+
            '<div class="pb-cell pb-center">'+roseIcon+'</div>'+
            '<div class="pb-cell pb-leste"><div class="pb-dir">Leste</div>'+(porFacingPB.leste.join('')||'<div class="pb-empty">Sem telhado nessa face</div>')+'</div>'+
            '<div class="pb-cell pb-sul"><div class="pb-dir">Sul</div>'+(porFacingPB.sul.join('')||'<div class="pb-empty">Sem telhado nessa face</div>')+'</div>'+
          '</div>'+
          (porFacingPB.outros.length ? '<div class="pb-outros"><div class="pb-dir">Sem orientação definida</div>'+porFacingPB.outros.join('')+'</div>' : '');
      }
    }

    var win = window.open('','_blank');
    win.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Projeto Elétrico Fotovoltaico</title>'+
    '<style>'+
    '*{box-sizing:border-box;margin:0;padding:0;}'+
    ':root{--line-strong:#c7d6c7;}'+
    'body{font-family:Inter,sans-serif;font-size:13px;color:#1e1e1e;padding:40px;max-width:900px;margin:auto;}'+
    'h1{font-size:21px;font-weight:900;color:#003122;}h1 span{color:#78D800;}'+
    '.doc-sub{font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#3a5cc4;margin-top:6px;}'+
    '.doc-meta{font-size:11.5px;color:#5a6b5a;margin-top:10px;line-height:1.6;}'+
    'header{border-bottom:2px solid #003122;padding-bottom:16px;margin-bottom:26px;}'+
    'section{margin-bottom:28px;}'+
    'section > .tag{font-family:"IBM Plex Mono",monospace;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:#78D800;margin-bottom:8px;}'+
    'section > h2{font-size:15px;font-weight:700;color:#003122;margin-bottom:12px;}'+
    'h3{font-size:13px;font-weight:700;color:#003122;margin:16px 0 8px;}'+
    '.tbl{width:100%;border-collapse:collapse;font-family:"IBM Plex Mono",monospace;font-size:11.5px;margin-bottom:10px;}'+
    '.tbl td,.tbl th{padding:6px 8px;border-bottom:1px solid #dde8dd;text-align:left;}'+
    '.tbl th{text-transform:uppercase;font-size:9.5px;letter-spacing:.05em;color:#5a6b5a;border-bottom:2px solid #003122;}'+
    '.tbl tr td:first-child{color:#5a6b5a;}'+
    '.tbl tr td:last-child{text-align:right;font-weight:700;}'+
    '.tbl thead tr th:last-child{text-align:left;}'+
    '.status-box{font-size:11.5px;padding:9px 12px;border-radius:6px;border:1px solid;margin-bottom:10px;font-family:"IBM Plex Mono",monospace;}'+
    '.status-box.ok{background:#eef9d6;border-color:#78D800;color:#2c6e00;}'+
    '.status-box.warn{background:#fdecea;border-color:#dc2626;color:#c0392b;}'+
    '.roof-block{page-break-inside:avoid;border:1px solid #dde8dd;border-radius:8px;padding:14px 16px;margin-bottom:14px;}'+
    '.roof-grid{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;}'+
    '.roof-diagram{flex:0 0 260px;width:260px;}'+
    '.roof-diagram svg{width:260px;height:260px;display:block;background:#F2F7F2;border:1px solid #dde8dd;border-radius:4px;}'+
    '.mod-rect{fill:rgba(120,216,0,0.28);stroke:#5aaa00;stroke-width:1;}'+
    '.mod-rect-extra{fill:rgba(166,224,106,0.35);stroke:#3a5cc4;stroke-dasharray:2,1.5;}'+
    '.dim-line{stroke:#3a5cc4;stroke-width:1;}'+
    '.dim-text{fill:#3a5cc4;font-family:"IBM Plex Mono",monospace;font-size:9px;}'+
    '.roof-grid .tbl{flex:1 1 260px;}'+
    '.legend-list{display:flex;flex-direction:column;gap:4px;margin-top:8px;}'+
    '.legend-chip{display:flex;align-items:center;gap:7px;font-family:"IBM Plex Mono",monospace;font-size:9.5px;letter-spacing:.02em;color:#5a6b5a;}'+
    '.legend-swatch{width:11px;height:11px;border-radius:2px;flex-shrink:0;display:inline-block;border:1px solid rgba(0,0,0,.15);}'+
    '.pb-compass{display:grid;grid-template-columns:1fr 1.3fr 1fr;grid-template-areas:". norte ." "oeste centro leste" ". sul .";gap:14px;align-items:start;page-break-inside:avoid;}'+
    '.pb-norte{grid-area:norte;} .pb-sul{grid-area:sul;} .pb-leste{grid-area:leste;} .pb-oeste{grid-area:oeste;}'+
    '.pb-center{grid-area:centro;display:flex;align-items:center;justify-content:center;min-height:100%;}'+
    '.pb-dir{font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#78D800;font-weight:700;text-align:center;margin-bottom:8px;}'+
    '.pb-roof{page-break-inside:avoid;border:1px solid #dde8dd;border-radius:8px;padding:10px;margin-bottom:10px;width:190px;margin-left:auto;margin-right:auto;}'+
    '.pb-roof-title{font-size:10.5px;font-weight:700;color:#003122;margin-bottom:6px;text-align:center;}'+
    '.pb-roof svg{width:170px;height:170px;display:block;margin:0 auto;background:#F2F7F2;border:1px solid #dde8dd;border-radius:4px;}'+
    '.pb-empty{text-align:center;color:#c4d4c4;font-size:11px;padding:24px 0;border:1px dashed #dde8dd;border-radius:8px;}'+
    '.pb-rose{width:64px;height:64px;}'+
    '.pb-outros{margin-top:16px;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;}'+
    '.pb-outros .pb-dir{width:100%;}'+
    '.disclaimer{margin-top:30px;padding:14px 16px;background:#f2f7f2;border-radius:8px;font-size:10.5px;color:#5a6b5a;line-height:1.6;}'+
    '.footer{margin-top:16px;text-align:center;font-size:10px;color:#9aab9a;letter-spacing:.04em;}'+
    '@media print{body{padding:20px;} .roof-block{page-break-inside:avoid;}}'+
    '*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}'+
    '</style></head><body>'+

    '<header>'+
      '<h1>SOLAR GREEN <span>SUPORTE</span></h1>'+
      '<div class="doc-sub">Projeto Elétrico Fotovoltaico &middot; Memorial Técnico de Dimensionamento</div>'+
      '<div class="doc-meta">Gerado em '+new Date().toLocaleDateString('pt-BR')+' às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+
        (session.nome?' &middot; Responsável técnico: '+escapeHtml(session.nome):'')+'</div>'+
    '</header>'+

    '<section>'+
      '<div class="tag">01 &middot; Especificações do sistema</div>'+
      '<h2>Módulo, inversor e potência instalada</h2>'+
      '<table class="tbl">'+
        '<tr><td>Módulo padrão</td><td>'+(mod.modH&&mod.modW ? fmt(mod.modH,3)+' × '+fmt(mod.modW,3)+' m' : '—')+'</td></tr>'+
        '<tr><td>Potência do módulo</td><td>'+(modPower?fmt(modPower,0)+' W':'—')+'</td></tr>'+
        '<tr><td>Comprimento do trilho</td><td>'+fmt(railLength,1)+' m</td></tr>'+
        '<tr><td>Quantidade total de módulos</td><td>'+totalModules+'</td></tr>'+
        '<tr><td>Potência total do sistema</td><td>'+(totalKwp?fmt(totalKwp,2)+' kWp':'—')+'</td></tr>'+
        '<tr><td>Potência máxima do inversor</td><td>'+(invMax?fmt(invMax,2)+' kWp':'—')+'</td></tr>'+
      '</table>'+
      invCompatHtml+
    '</section>'+

    '<section>'+
      '<div class="tag">02 &middot; Telhados</div>'+
      '<h2>Disposição dos módulos por telhado</h2>'+
      roofsHtml+
    '</section>'+

    '<section>'+
      '<div class="tag">03 &middot; Dimensionamento elétrico</div>'+
      '<h2>Strings e MPPTs</h2>'+
      stringHtml+
    '</section>'+

    '<section>'+
      '<div class="tag">04 &middot; Lista de materiais</div>'+
      '<h2>Consolidado de todos os telhados</h2>'+
      '<table class="tbl">'+
        '<tr><td>Trilhos</td><td>'+totalRails+'</td></tr>'+
        '<tr><td>Parafusos estruturais</td><td>'+totalStruct+'</td></tr>'+
        '<tr><td>Parafusos finais</td><td>'+totalFinal+'</td></tr>'+
        '<tr><td>Grampos intermediários</td><td>'+totalInter+'</td></tr>'+
        '<tr><td>Cabo solar (total)</td><td>'+fmt(totalCable,2)+' m</td></tr>'+
        (totalWeight>0 ? '<tr><td>Peso total dos módulos</td><td>'+fmt(totalWeight,1)+' kg</td></tr>' : '')+
      '</table>'+
    '</section>'+

    (plantaBaixaHtml ?
    '<section>'+
      '<div class="tag">05 &middot; Planta baixa</div>'+
      '<h2>Visão geral do sistema por orientação</h2>'+
      plantaBaixaHtml+
    '</section>' : '')+

    '<div class="disclaimer"><strong>Aviso:</strong> documento técnico gerado automaticamente pelo sistema Solar Green a partir dos dados levantados em campo. Não substitui projeto assinado por responsável técnico habilitado (ART) quando exigido por norma ou pela concessionária local.</div>'+
    '<div class="footer">Solar Green Suporte &nbsp;&middot;&nbsp; Documento gerado em '+new Date().toLocaleDateString('pt-BR')+'</div>'+

    '</body></html>');
    win.document.close();
    setTimeout(function(){ win.print(); }, 500);
  }

  var btnGerarPdf = document.getElementById('btn-gerar-pdf-projeto');
  if(btnGerarPdf) btnGerarPdf.addEventListener('click', gerarPDFProjeto);
})();
