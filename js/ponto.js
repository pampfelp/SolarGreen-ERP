// ════ PONTO ELETRÔNICO ════
(function(){
(function(){

  var _epoca=window.SGEpoca.criar();
  var rawVendedores = null;
  var rawPonto = null;
  var vendedoresMap = {};
  var pontoRecords = [];
  var dailyRecords = [];
  var overrides = {};
  var useApi = true;

  var OVERRIDES_STORAGE_KEY = 'ponto_overrides_v1';
  var API_URL_KEY = 'ponto_api_url';
  var API_KEY_KEY = 'ponto_api_key';
  var DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbzFCy8PyBZBODgA34xrlLTVUUNhKBIlguJT3ectH7Yus-VW1n41GcCclc5q_Yj0Di2O7g/exec';
  var DEFAULT_API_KEY = '1234';
  var APP_VERSION = '2026-07-16-1';
  document.getElementById('p-appVersion').textContent = 'v' + APP_VERSION;
  document.getElementById('appVersionFoot').textContent = APP_VERSION;

  function loadOverrides(){ try{ var r=localStorage.getItem(OVERRIDES_STORAGE_KEY); overrides=r?JSON.parse(r):{}; }catch(e){ overrides={}; } }
  function saveOverridesLocalCache(){ try{ localStorage.setItem(OVERRIDES_STORAGE_KEY,JSON.stringify(overrides)); }catch(e){} }
  function overrideKey(f,d){ return f+'|'+d; }
  function getOverride(f,d){ return overrides[overrideKey(f,d)]||null; }
  function getApiUrl(){ return (localStorage.getItem(API_URL_KEY)||'').trim()||DEFAULT_API_URL; }
  function getApiKey(){ return (localStorage.getItem(API_KEY_KEY)||'').trim()||DEFAULT_API_KEY; }
  function setApiCreds(u,k){ localStorage.setItem(API_URL_KEY,u.trim()); localStorage.setItem(API_KEY_KEY,k.trim()); }
  function hasApiCreds(){ return !!getApiUrl()&&!!getApiKey(); }

  // Delega pra SGAuth.apiCall — que lê os MESMOS localStorage keys
  // (ponto_api_url/ponto_api_key) que getApiUrl()/getApiKey() acima, então
  // o comportamento é idêntico, só sem reimplementar o fetch aqui. Ganha de
  // graça a injeção automática de solicitanteId (Fase A) e cache:'no-store'.
  // getApiUrl/getApiKey/hasApiCreds continuam existindo — hasApiCreds() é
  // usado antes de chamar apiCall pra decidir se tenta salvar ou não.
  function apiCall(action,extra){ return window.SGAuth.apiCall(action,extra); }

  function setSyncPill(state,text){
    var pill=document.getElementById('p-syncPill'),pt=document.getElementById('p-syncPillText');
    if(!pill)return; pill.style.display='flex'; pill.classList.remove('saving','error');
    if(state==='saving')pill.classList.add('saving'); if(state==='error')pill.classList.add('error');
    pt.textContent=text;
  }

  function setOverride(funcionario,dateKeyStr,data){
    var key=overrideKey(funcionario,dateKeyStr);
    var existiaAntes=Object.prototype.hasOwnProperty.call(overrides,key);
    var valorAnterior=existiaAntes?Object.assign({},overrides[key]):null;
    if(!data||(!data.abonado&&!data.entrada&&!data.almoco&&!data.retorno&&!data.saida)){ delete overrides[key]; }
    else{ overrides[key]=data; }
    _epoca.marcar();
    saveOverridesLocalCache();

    function desfazer(motivo){
      if(existiaAntes)overrides[key]=valorAnterior; else delete overrides[key];
      _epoca.marcar();
      saveOverridesLocalCache();
      buildDailyRecords();
      render();
      if(window.SGToast)window.SGToast.mostrar(motivo,true);
    }

    if(useApi&&hasApiCreds()){
      setSyncPill('saving','Salvando na planilha…');
      apiCall('setOverride',{funcionario:funcionario,data:dateKeyStr,abonado:!!(data&&data.abonado),entrada:(data&&data.entrada)||'',almoco:(data&&data.almoco)||'',retorno:(data&&data.retorno)||'',saida:(data&&data.saida)||''}).then(function(resp){
        if(resp&&resp.ok){ setSyncPill('ok','Sincronizado com a planilha'); }
        else{ setSyncPill('error','Falha ao salvar'); desfazer((resp&&resp.erro)||'Não foi possível salvar na planilha — a alteração foi desfeita.'); }
      }).catch(function(err){ setSyncPill('error','Sem conexão'); desfazer('Erro de conexão — a alteração foi desfeita: '+err.message); });
    }
  }

  loadOverrides();

  function setUpdateClock(){ var d=new Date(); document.getElementById('p-lastUpdate').textContent='Atualizado em '+d.toLocaleDateString('pt-BR')+' às '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }
  setUpdateClock();

  function readFile(file,cb){
    var reader=new FileReader();
    reader.onload=function(e){ var data=new Uint8Array(e.target.result); var wb=XLSX.read(data,{type:'array',cellDates:true}); var sheet=wb.Sheets[wb.SheetNames[0]]; cb(XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:''})); };
    reader.readAsArrayBuffer(file);
  }

  function findHeaderRowIndex(rows,cols){ for(var i=0;i<Math.min(rows.length,10);i++){var r=rows[i].map(function(c){return(c||'').toString().trim();}); if(cols.filter(function(c){return r.indexOf(c)!==-1;}).length===cols.length)return i;} return -1; }

  function rowsToObjects(rows,hi){ var headers=rows[hi].map(function(c){return(c||'').toString().trim();}); var out=[]; for(var i=hi+1;i<rows.length;i++){var row=rows[i];if(!row||row.every(function(c){return c===''||c===undefined||c===null;}))continue; var obj={}; headers.forEach(function(h,idx){if(h)obj[h]=(row[idx]!==undefined&&row[idx]!==null)?row[idx].toString().trim():''}); out.push(obj);} return out; }

  function processVendedores(rows){ var hi=findHeaderRowIndex(rows,['IdVendedor','Nome']); if(hi===-1)hi=0; var objs=rowsToObjects(rows,hi); var map={}; objs.forEach(function(o){if(o.IdVendedor)map[o.IdVendedor]={nome:o.Nome||o.IdVendedor,status:(o.Status||'').trim()};}); return map; }

  function parseDateTime(str){ if(!str)return null; str=str.toString().trim(); var m=str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/); if(m)return new Date(parseInt(m[3]),parseInt(m[2])-1,parseInt(m[1]),parseInt(m[4]),parseInt(m[5]),m[6]?parseInt(m[6]):0); var d=new Date(str); if(!isNaN(d.getTime()))return d; return null; }

  function dateKey(d){ return window.SGUtil.dateKey(d); }

  function processPonto(rows){ var hi=findHeaderRowIndex(rows,['Funcionario','Tipo']); if(hi===-1)hi=0; var objs=rowsToObjects(rows,hi); var recs=[]; objs.forEach(function(o){var dt=parseDateTime(o['Data e Hora']||o['Data']||''); if(!dt)return; recs.push({funcionario:o['Funcionario']||o['Colaborador']||'',tipo:(o['Tipo']||'').trim(),dt:dt,dateKey:dateKey(dt)});}); return recs; }

  function processVendedoresFromObjects(objs){ var map={}; objs.forEach(function(o){if(o.IdVendedor)map[o.IdVendedor]={nome:o.Nome||o.IdVendedor,status:(o.Status||'').trim()};}); return map; }

  function processPontoFromObjects(objs){ var recs=[]; objs.forEach(function(o){var dt=parseDateTime(o['Data e Hora']||o['Data']||''); if(!dt)return; recs.push({funcionario:o['Funcionario']||o['Colaborador']||'',tipo:(o['Tipo']||'').trim(),dt:dt,dateKey:dateKey(dt)});}); return recs; }

  function fmtHM(m,ws){ var sign=m<0?'-':(ws?'+':''); var abs=Math.abs(Math.round(m)); return sign+String(Math.floor(abs/60)).padStart(2,'0')+':'+String(abs%60).padStart(2,'0'); }
  function fmtHMfromTime(dt){ if(!dt)return null; return String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0'); }
  var DOW_NAMES=['dom','seg','ter','qua','qui','sex','sáb'];
  function addDays(d,n){ var r=new Date(d.getTime()); r.setDate(r.getDate()+n); return r; }
  function timeStrToDateOnDay(d,t){ if(!t)return null; var m=t.match(/^(\d{1,2}):(\d{2})$/); if(!m)return null; return new Date(d.getFullYear(),d.getMonth(),d.getDate(),parseInt(m[1],10),parseInt(m[2],10),0); }

  function buildDayRecordFromMarks(funcionario,dk,dateObj,marks){
    var dow=dateObj.getDay(),isWeekend=dow===0||dow===6;
    var entrada=(marks&&marks.entrada)||null,almoco=(marks&&marks.almoco)||null,retorno=(marks&&marks.retorno)||null,saida=(marks&&marks.saida)||null;
    var override=getOverride(funcionario,dk),isAbonado=false,isEdited=false;
    if(override){
      if(override.entrada){entrada=timeStrToDateOnDay(dateObj,override.entrada);isEdited=true;}
      if(override.almoco){almoco=timeStrToDateOnDay(dateObj,override.almoco);isEdited=true;}
      if(override.retorno){retorno=timeStrToDateOnDay(dateObj,override.retorno);isEdited=true;}
      if(override.saida){saida=timeStrToDateOnDay(dateObj,override.saida);isEdited=true;}
      if(override.abonado)isAbonado=true;
    }
    var workedMinutes=0,hasAnyMark=!!(entrada||almoco||retorno||saida),complete=!!(entrada&&almoco&&retorno&&saida);
    if(entrada&&saida){ var ts=(saida.getTime()-entrada.getTime())/60000,ls=0; if(almoco&&retorno){ls=(retorno.getTime()-almoco.getTime())/60000;if(ls<0)ls=0;} workedMinutes=ts-ls; if(workedMinutes<0)workedMinutes=0; }
    var noTarget=isWeekend||isAbonado,targetMinutes=noTarget?0:480;
    var dayBalance=noTarget?workedMinutes:(hasAnyMark?(workedMinutes-targetMinutes):-targetMinutes);
    return {funcionario:funcionario,dateKey:dk,dateObj:dateObj,dow:dow,isWeekend:isWeekend,isAbonado:isAbonado,isEdited:isEdited,entrada:entrada,almoco:almoco,retorno:retorno,saida:saida,hasAnyMark:hasAnyMark,complete:complete,workedMinutes:workedMinutes,targetMinutes:targetMinutes,dayBalance:dayBalance};
  }

  function buildDailyRecords(){
    dailyRecords=[];
    if(!pontoRecords.length)return;
    var byPersonDay={},globalMax=null;
    // Início do histórico de CADA colaborador — não um início global (senão
    // um colaborador contratado depois "herdaria" dias devidos de antes
    // dele nem trabalhar aqui, contados a partir do primeiro ponto de
    // qualquer outra pessoa no sistema).
    var primeiroRegistroPorPessoa={};
    function marcaPrimeiro(funcionario,dtDiaSomente){
      if(!primeiroRegistroPorPessoa[funcionario]||dtDiaSomente<primeiroRegistroPorPessoa[funcionario]){
        primeiroRegistroPorPessoa[funcionario]=dtDiaSomente;
      }
    }
    pontoRecords.forEach(function(r){
      var key=r.funcionario+'|'+r.dateKey;
      if(!byPersonDay[key])byPersonDay[key]={funcionario:r.funcionario,dateKey:r.dateKey,marks:{}};
      var b=byPersonDay[key],tipo=r.tipo;
      if(tipo==='Entrada'){if(!b.marks.entrada||r.dt<b.marks.entrada)b.marks.entrada=r.dt;}
      else if(tipo==='Almoço'){if(!b.marks.almoco||r.dt<b.marks.almoco)b.marks.almoco=r.dt;}
      else if(tipo==='Retorno Almoço'){if(!b.marks.retorno||r.dt<b.marks.retorno)b.marks.retorno=r.dt;}
      else if(tipo==='Saída'){if(!b.marks.saida||r.dt>b.marks.saida)b.marks.saida=r.dt;}
      if(globalMax===null||r.dt>globalMax)globalMax=r.dt;
      marcaPrimeiro(r.funcionario,new Date(r.dt.getFullYear(),r.dt.getMonth(),r.dt.getDate()));
    });
    var funcionariosSet={};
    pontoRecords.forEach(function(r){funcionariosSet[r.funcionario]=true;});
    Object.keys(overrides).forEach(function(key){
      var sep=key.lastIndexOf('|');if(sep===-1)return;
      var funcionario=key.substring(0,sep),dk=key.substring(sep+1);
      funcionariosSet[funcionario]=true;
      var parts=dk.split('-');if(parts.length!==3)return;
      var dt=new Date(parseInt(parts[0],10),parseInt(parts[1],10)-1,parseInt(parts[2],10));
      if(isNaN(dt.getTime()))return;
      if(globalMax===null||dt>globalMax)globalMax=dt;
      marcaPrimeiro(funcionario,dt); // um abono/edição também pode ser o primeiro registro de alguém
    });
    if(globalMax===null)return;
    var rangeEnd=new Date(globalMax.getFullYear(),globalMax.getMonth(),globalMax.getDate());
    Object.keys(funcionariosSet).forEach(function(funcionario){
      var rangeStartPessoa=primeiroRegistroPorPessoa[funcionario];
      if(!rangeStartPessoa)return; // sem nenhum registro/abono, não tem o que gerar
      var cursor=new Date(rangeStartPessoa.getTime());
      while(cursor<=rangeEnd){
        var dk=dateKey(cursor),key=funcionario+'|'+dk,bucket=byPersonDay[key];
        dailyRecords.push(buildDayRecordFromMarks(funcionario,dk,new Date(cursor.getTime()),bucket?bucket.marks:null));
        cursor=addDays(cursor,1);
      }
    });
    dailyRecords.sort(function(a,b){if(a.funcionario!==b.funcionario)return 0;return a.dateObj-b.dateObj;});
  }

  function nomeFor(id){var v=vendedoresMap[id];return(v&&v.nome)||('Colaborador '+String(id||'—').slice(0,8));}
  function statusFor(id){var v=vendedoresMap[id];return(v&&v.status)||'';}
  function isAtivo(id){var s=statusFor(id).toLowerCase();if(!s)return true;return s.indexOf('inativ')===-1&&s.indexOf('demit')===-1&&s.indexOf('desligad')===-1;}
  var statusFilter='ativos';

  function populateColaboradorSelect(){
    var sel=document.getElementById('selColaborador'),cur=sel.value||'__all__';
    var ids=Array.from(new Set(pontoRecords.map(function(r){return r.funcionario;})));
    if(statusFilter==='ativos')ids=ids.filter(function(id){return isAtivo(id);});
    ids.sort(function(a,b){return nomeFor(a).localeCompare(nomeFor(b),'pt-BR');});
    sel.innerHTML='<option value="__all__">Todos os colaboradores</option>';
    ids.forEach(function(id){var opt=document.createElement('option');opt.value=id;opt.textContent=nomeFor(id)+(!isAtivo(id)?' (inativo)':'');sel.appendChild(opt);});
    sel.value=ids.indexOf(cur)!==-1||cur==='__all__'?cur:'__all__';
  }

  function setDefaultDateRange(){ if(!dailyRecords.length)return; document.getElementById('p-dateFrom').value=dateKey(dailyRecords[0].dateObj); document.getElementById('p-dateTo').value=dateKey(dailyRecords[dailyRecords.length-1].dateObj); }

  function getFiltered(){
    var from=document.getElementById('p-dateFrom').value,to=document.getElementById('p-dateTo').value,colab=document.getElementById('selColaborador').value;
    return dailyRecords.filter(function(d){
      if(from&&d.dateKey<from)return false; if(to&&d.dateKey>to)return false;
      if(colab!=='__all__'&&d.funcionario!==colab)return false;
      if(statusFilter==='ativos'&&!isAtivo(d.funcionario))return false; return true;
    });
  }

  function escapeHtml(s){ return window.SGUtil.escapeHtml(s); }

  function render(){
    var filtered=getFiltered(),colab=document.getElementById('selColaborador').value,showingAll=colab==='__all__';
    document.getElementById('colColaborador').style.display=showingAll?'':'none';
    var runningByPerson={},rowsHtml='',totalWorked=0,totalTarget=0,incompleteCount=0,faltaCount=0;
    var sortedFiltered=filtered.slice().sort(function(a,b){ if(showingAll){var nc=nomeFor(a.funcionario).localeCompare(nomeFor(b.funcionario),'pt-BR');if(nc!==0)return nc;} return a.dateObj-b.dateObj; });
    var lastPerson=null;
    sortedFiltered.forEach(function(d){
      totalWorked+=d.workedMinutes;totalTarget+=d.targetMinutes;
      if(d.hasAnyMark&&!d.complete)incompleteCount++;
      if(!d.isAbonado&&!d.isWeekend&&!d.hasAnyMark)faltaCount++;
      if(runningByPerson[d.funcionario]===undefined)runningByPerson[d.funcionario]=0;
      runningByPerson[d.funcionario]+=d.dayBalance;
      var running=runningByPerson[d.funcionario],isNewGroup=showingAll&&d.funcionario!==lastPerson;
      lastPerson=d.funcionario;
      var sp,sc;
      if(d.isAbonado){sp='Abonado';sc='abonado';}else if(d.isWeekend&&!d.hasAnyMark){sp='Fim de semana';sc='weekend';}else if(!d.hasAnyMark){sp='Falta';sc='incomplete';}else if(!d.complete){sp='Incompleto';sc='incomplete';}else{sp='Completo';sc='ok';}
      var dbc=d.dayBalance>0.4?'pos':(d.dayBalance<-0.4?'neg':'zero'),rbc=running>0.4?'pos':(running<-0.4?'neg':'zero');
      rowsHtml+='<tr class="'+(d.isWeekend?'weekend ':'')+( isNewGroup?'group-start':'')+'">';
      if(showingAll)rowsHtml+='<td class="person-name">'+(isNewGroup?escapeHtml(nomeFor(d.funcionario))+(!isAtivo(d.funcionario)?' <span class="inactive-tag">inativo</span>':''):'')+'</td>';
      rowsHtml+='<td><span class="daynum">'+String(d.dateObj.getDate()).padStart(2,'0')+'/'+String(d.dateObj.getMonth()+1).padStart(2,'0')+'</span><span class="dow">'+DOW_NAMES[d.dow]+'</span>'+(d.isEdited?'<span class="edited-dot"></span>':'')+'</td>';
      rowsHtml+='<td class="num mark'+(d.entrada?'':' missing')+'">'+(fmtHMfromTime(d.entrada)||'—')+'</td>';
      rowsHtml+='<td class="num mark'+(d.almoco?'':' missing')+'">'+(fmtHMfromTime(d.almoco)||'—')+'</td>';
      rowsHtml+='<td class="num mark'+(d.retorno?'':' missing')+'">'+(fmtHMfromTime(d.retorno)||'—')+'</td>';
      rowsHtml+='<td class="num mark'+(d.saida?'':' missing')+'">'+(fmtHMfromTime(d.saida)||'—')+'</td>';
      rowsHtml+='<td class="num mark">'+(d.hasAnyMark?fmtHM(d.workedMinutes,false):'—')+'</td>';
      rowsHtml+='<td class="num bal '+dbc+'">'+fmtHM(d.dayBalance,true)+'</td>';
      rowsHtml+='<td class="num bal '+rbc+'">'+fmtHM(running,true)+'</td>';
      rowsHtml+='<td><span class="pill '+sc+'">'+sp+'</span></td>';
      rowsHtml+='<td class="num"><button class="row-edit-btn" data-funcionario="'+escapeHtml(d.funcionario)+'" data-datekey="'+d.dateKey+'">&#9998;</button></td>';
      rowsHtml+='</tr>';
    });
    document.getElementById('tbody').innerHTML=rowsHtml||'<tr><td colspan="11" style="text-align:center;color:var(--ink-faint);padding:30px;">Nenhum registro no período.</td></tr>';
    document.querySelectorAll('.row-edit-btn').forEach(function(btn){ btn.addEventListener('click',function(){ openEditModal(btn.getAttribute('data-funcionario'),btn.getAttribute('data-datekey')); }); });
    var tb=totalWorked-totalTarget;
    document.getElementById('kpiWorked').textContent=fmtHM(totalWorked,false);
    document.getElementById('kpiTarget').textContent=fmtHM(totalTarget,false);
    document.getElementById('kpiBalance').textContent=fmtHM(tb,true);
    document.getElementById('kpiIncomplete').textContent=incompleteCount;
    document.getElementById('kpiFalta').textContent=faltaCount;
    var fc=document.getElementById('kpiFaltaCard');fc.classList.remove('discount-active');if(faltaCount>0)fc.classList.add('discount-active');
    var bc=document.getElementById('kpiBalanceCard');bc.classList.remove('balance-pos','balance-neg');if(tb>0.4)bc.classList.add('balance-pos');else if(tb<-0.4)bc.classList.add('balance-neg');
    var dp=0;if(tb<-0.4&&totalTarget>0)dp=(Math.abs(tb)/totalTarget)*100;
    document.getElementById('kpiDiscount').textContent=dp.toFixed(2).replace('.',',')+' %';
    var dc=document.getElementById('kpiDiscountCard');dc.classList.remove('discount-active');if(dp>0)dc.classList.add('discount-active');
    document.getElementById('kpiDiscountSub').textContent=dp>0?(fmtHM(Math.abs(tb),false)+' de falta ÷ '+fmtHM(totalTarget,false)+' devidas'):'sem déficit no período';
    var nP=new Set(filtered.map(function(d){return d.funcionario;})).size,nW=filtered.filter(function(d){return!d.isWeekend;}).length;
    document.getElementById('kpiWorkedSub').textContent=nP+(nP===1?' colaborador':' colaboradores')+' · '+filtered.length+' dia(s)';
    document.getElementById('kpiIncompleteSub').textContent='de '+nW+' dia(s) útil(eis) no período';
    document.getElementById('kpiFaltaSub').textContent=faltaCount>0?'de '+nW+' dia(s) útil(eis) no período':'nenhuma falta no período';
    var se=document.getElementById('personSummary');
    if(showingAll&&nP>1){
      var pp={};filtered.forEach(function(d){if(!pp[d.funcionario])pp[d.funcionario]=0;pp[d.funcionario]+=d.dayBalance;});
      var ids=Object.keys(pp).sort(function(a,b){return nomeFor(a).localeCompare(nomeFor(b),'pt-BR');});
      se.innerHTML=ids.map(function(id){var bal=pp[id],cls=bal>0.4?'pos':(bal<-0.4?'neg':'');return'<div class="person-chip"><div class="nm">'+escapeHtml(nomeFor(id))+'</div><div class="bal '+cls+'">'+fmtHM(bal,true)+'</div></div>';}).join('');
      se.style.display='flex';
    }else{se.style.display='none';se.innerHTML='';}
  }

  function buildReportFrom(vMap,pRecords,ov){
    vendedoresMap=vMap;pontoRecords=pRecords;
    if(ov){overrides=ov;saveOverridesLocalCache();}
    buildDailyRecords();populateColaboradorSelect();setDefaultDateRange();
    document.getElementById('p-emptyState').style.display='none';document.getElementById('p-mainContent').style.display='block';
    render();setUpdateClock();
  }

  function tryBuildReport(){ if(rawVendedores&&rawPonto){buildReportFrom(processVendedores(rawVendedores),processPonto(rawPonto),null);} }

  function fetchFromApi(showStatus){
    if(!hasApiCreds())return;
    var cache=window.SGCache&&window.SGCache.get('ponto');
    var temCache=!!(cache&&cache.dados);
    if(temCache){
      var pVendedoresC=window.SGAuth?window.SGAuth.filterByOwner(cache.dados.vendedores||[],'IdVendedor'):(cache.dados.vendedores||[]);
      var pPontoC=window.SGAuth?window.SGAuth.filterByOwner(cache.dados.ponto||[],'Funcionario'):(cache.dados.ponto||[]);
      buildReportFrom(processVendedoresFromObjects(pVendedoresC),processPontoFromObjects(pPontoC),cache.dados.overrides||{});
      setSyncPill('ok','Sincronizado');
    }
    var epocaInicio=_epoca.atual();
    apiCall('getData').then(function(resp){
      if(!resp||!resp.ok){if(showStatus&&!temCache)window.SGToast.mostrar((resp&&resp.erro)||'Não foi possível conectar.',true);return;}
      if(window.SGCache)window.SGCache.set('ponto',resp);
      if(_epoca.atual()!==epocaInicio)return;
      var pVendedores=window.SGAuth?window.SGAuth.filterByOwner(resp.vendedores||[],'IdVendedor'):(resp.vendedores||[]);
      var pPonto=window.SGAuth?window.SGAuth.filterByOwner(resp.ponto||[],'Funcionario'):(resp.ponto||[]);
      buildReportFrom(processVendedoresFromObjects(pVendedores),processPontoFromObjects(pPonto),resp.overrides||{});
      setSyncPill('ok','Sincronizado');
    }).catch(function(err){if(showStatus&&!temCache)window.SGToast.mostrar('Erro: '+err.message,true);});
  }

  function wireUpload(inputId,cardId,detailId,clearId,onLoaded){
    var input=document.getElementById(inputId),card=document.getElementById(cardId),detail=document.getElementById(detailId),clearBtn=document.getElementById(clearId);
    function handleFile(file){if(!file)return;detail.textContent='Lendo '+file.name+'…';readFile(file,function(rows){onLoaded(rows);card.classList.add('has-file');detail.textContent=file.name;clearBtn.style.display='inline';tryBuildReport();});}
    input.addEventListener('change',function(e){handleFile(e.target.files[0]);});
    card.addEventListener('dragover',function(e){e.preventDefault();card.classList.add('drag');});
    card.addEventListener('dragleave',function(){card.classList.remove('drag');});
    card.addEventListener('drop',function(e){e.preventDefault();card.classList.remove('drag');if(e.dataTransfer.files&&e.dataTransfer.files[0])handleFile(e.dataTransfer.files[0]);});
    clearBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();input.value='';card.classList.remove('has-file');detail.textContent='Arraste o arquivo ou clique para selecionar (.xlsx, .xls, .csv)';clearBtn.style.display='none';if(inputId==='fileVendedores')rawVendedores=null;if(inputId==='filePonto')rawPonto=null;document.getElementById('p-mainContent').style.display='none';document.getElementById('p-emptyState').style.display='block';});
  }

  wireUpload('fileVendedores','cardVendedores','detailVendedores','clearVendedores',function(rows){rawVendedores=rows;});
  wireUpload('filePonto','cardPonto','detailPonto','clearPonto',function(rows){rawPonto=rows;});
  document.getElementById('toggleManualBtn').addEventListener('click',function(){
    var grid=document.getElementById('uploadGrid'),isHidden=grid.style.display==='none';
    grid.style.display=isHidden?'grid':'none';useApi=!isHidden;
    document.getElementById('toggleManualBtn').textContent=isHidden?'Prefiro conectar pela planilha do Google':'Prefiro subir os arquivos manualmente';
  });
  (function autoConnect(){if(!window.SG_SESSION)return;if(getApiUrl()&&getApiKey())fetchFromApi(true);})();
  document.getElementById('p-dateFrom').addEventListener('change',render);
  document.getElementById('p-dateTo').addEventListener('change',render);
  document.getElementById('selColaborador').addEventListener('change',render);
  document.getElementById('p-resetFiltros').addEventListener('click',function(){document.getElementById('selColaborador').value='__all__';setDefaultDateRange();document.querySelectorAll('.qr-btn[data-range]').forEach(function(b){b.classList.remove('active');});statusFilter='ativos';document.querySelectorAll('.status-btn').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-status')==='ativos');});populateColaboradorSelect();render();});
  document.querySelectorAll('.qr-btn[data-range]').forEach(function(btn){
    btn.addEventListener('click',function(){
      document.querySelectorAll('.qr-btn[data-range]').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');
      if(!dailyRecords.length)return;
      var max=dailyRecords[dailyRecords.length-1].dateObj,range=btn.getAttribute('data-range');
      if(range==='all'){setDefaultDateRange();}else if(range==='month'){var first=new Date(max.getFullYear(),max.getMonth(),1);document.getElementById('p-dateFrom').value=dateKey(first);document.getElementById('p-dateTo').value=dateKey(max);}else{var n=parseInt(range,10),from=new Date(max);from.setDate(from.getDate()-(n-1));document.getElementById('p-dateFrom').value=dateKey(from);document.getElementById('p-dateTo').value=dateKey(max);}
      render();
    });
  });
  document.querySelectorAll('.status-btn').forEach(function(btn){btn.addEventListener('click',function(){document.querySelectorAll('.status-btn').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');statusFilter=btn.getAttribute('data-status');populateColaboradorSelect();render();});});

  var editingFuncionario=null,editingDateKey=null;
  function fmtHMfromTimeForInput(dt){if(!dt)return '';return String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0');}
  function openEditModal(funcionario,dk){
    editingFuncionario=funcionario;editingDateKey=dk;
    var record=dailyRecords.filter(function(d){return d.funcionario===funcionario&&d.dateKey===dk;})[0];if(!record)return;
    var override=getOverride(funcionario,dk)||{};
    document.getElementById('editModalTitle').textContent=nomeFor(funcionario);
    document.getElementById('editModalSub').textContent=String(record.dateObj.getDate()).padStart(2,'0')+'/'+String(record.dateObj.getMonth()+1).padStart(2,'0')+'/'+record.dateObj.getFullYear()+' · '+DOW_NAMES[record.dow];
    document.getElementById('editAbonado').checked=!!override.abonado;
    document.getElementById('editEntrada').value=override.entrada||fmtHMfromTimeForInput(record.entrada);
    document.getElementById('editAlmoco').value=override.almoco||fmtHMfromTimeForInput(record.almoco);
    document.getElementById('editRetorno').value=override.retorno||fmtHMfromTimeForInput(record.retorno);
    document.getElementById('editSaida').value=override.saida||fmtHMfromTimeForInput(record.saida);
    document.getElementById('editModal').classList.remove('hidden');
  }
  function closeEditModal(){document.getElementById('editModal').classList.add('hidden');editingFuncionario=null;editingDateKey=null;}
  document.getElementById('editCancelBtn').addEventListener('click',closeEditModal);
  document.getElementById('editModal').addEventListener('click',function(e){if(e.target.id==='editModal')closeEditModal();});
  document.getElementById('editSaveBtn').addEventListener('click',function(){
    if(!editingFuncionario||!editingDateKey)return;
    var data={abonado:document.getElementById('editAbonado').checked,entrada:document.getElementById('editEntrada').value||'',almoco:document.getElementById('editAlmoco').value||'',retorno:document.getElementById('editRetorno').value||'',saida:document.getElementById('editSaida').value||''};
    setOverride(editingFuncionario,editingDateKey,data);buildDailyRecords();closeEditModal();render();
  });
  document.getElementById('editClearBtn').addEventListener('click',function(){if(!editingFuncionario||!editingDateKey)return;setOverride(editingFuncionario,editingDateKey,null);buildDailyRecords();closeEditModal();render();});

})();
})();

