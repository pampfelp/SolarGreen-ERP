// ════ FATURAMENTO (visão da empresa, para administradores e vendedores) ════
(function(){
  var iniciado=false, carregado={vendas:false,metas:false,vendedores:false,metasIndividuais:false};
  var dados={vendas:[],metas:[],vendedores:[],metasIndividuais:[]};
  var ID_CLIENTE_APORTE_SOCIOS='da6dbd89'; // mesma exceção da tela Vendas
  var dinheiro=window.SGUtil.fmtMoney, numero=window.SGUtil.parseBRNumber, data=window.SGUtil.parseBRDate, chave=window.SGUtil.dateKey;
  var animacaoValor=0, valorAnimado=0, percentualAnimado=0, animacaoGrafico=0, ultimoGrafico=null, resizeGrafico=0, primeiraRenderizacao=true;
  var filtro={vendedor:'__all__',de:0,ate:0,ancora:0};
  var aba='faturamento',visaoRanking='podio',animacaoRanking=0,animacaoCorrida=0,ultimaCorrida=null,geracaoGrafico=0;
  function el(id){return document.getElementById(id);}
  function mesKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
  function diaUtil(d){return d.getDay()!==0&&d.getDay()!==6;}
  function mesSelecionado(){var p=el('fat-month').value.split('-');return {ano:+p[0],mes:+p[1]};}
  function vendasValidas(){
    var ceos={};dados.vendedores.forEach(function(v){if((v.Tipo||'').trim().toLowerCase()==='ceo')ceos[v.IdVendedor]=true;});
    return dados.vendas.map(function(v){var dt=data(v.DataVenda);return {id:v.IdVenda,cliente:v.IdCliente,vendedor:v.IdVendedor,dt:dt,dia:dt?chave(dt):'',valor:numero(v.Valor),nome:(v.NomeCliente||'').trim()};})
      .filter(function(v){return v.id&&v.dt&&v.cliente!==ID_CLIENTE_APORTE_SOCIOS&&!ceos[v.vendedor];});
  }
  function metaDoMes(ano,mes,idVendedor){
    var registro=dados.metas.filter(function(m){return +m.Ano===ano&&+m.Mes===mes;})[0];
    var bruta=registro?numero(registro.Valor):0;
    var ativos=dados.vendedores.filter(function(v){return (v.Tipo||'').trim()==='Vendedor'&&(v.Status||'').trim()==='Ativo';});
    var padrao=ativos.length?bruta/ativos.length:0;
    function individual(id){
      var manual=dados.metasIndividuais.filter(function(m){return m.IdVendedor===id&&+m.Ano===ano&&+m.Mes===mes;})[0];
      return manual?numero(manual.ValorMeta):padrao;
    }
    if(idVendedor!=='__all__')return individual(idVendedor);
    return ativos.reduce(function(total,v){
      return total+individual(v.IdVendedor);
    },0);
  }
  function preencherVendedores(){
    var seletor=el('fat-seller'),selecionado=filtro.vendedor;
    seletor.innerHTML='<option value="__all__">Todos os vendedores</option>';
    dados.vendedores.filter(function(v){return v.IdVendedor&&(v.Tipo||'').trim().toLowerCase()==='vendedor';})
      .sort(function(a,b){return (a.Nome||'').localeCompare(b.Nome||'','pt-BR');})
      .forEach(function(v){var o=document.createElement('option');o.value=v.IdVendedor;o.textContent=v.Nome||v.IdVendedor;seletor.appendChild(o);});
    if([].some.call(seletor.options,function(o){return o.value===selecionado;}))seletor.value=selecionado;
    else filtro.vendedor=seletor.value='__all__';
  }
  function dataDoDia(ano,mes,dia){return ano+'-'+String(mes).padStart(2,'0')+'-'+String(dia).padStart(2,'0');}
  function atualizarDatas(ano,mes,limite){
    var de=el('fat-date-from'),ate=el('fat-date-to'),min=dataDoDia(ano,mes,1),max=dataDoDia(ano,mes,Math.max(limite,1));
    [de,ate].forEach(function(c){c.min=min;c.max=max;c.disabled=!limite;});
    if(filtro.de>limite){filtro.de=0;filtro.ate=0;filtro.ancora=0;}
    if(filtro.ate>limite)filtro.ate=limite;
    de.value=filtro.de?dataDoDia(ano,mes,filtro.de):'';
    ate.value=filtro.ate?dataDoDia(ano,mes,filtro.ate):'';
    el('fat-clear-filter').hidden=!filtro.de&&!filtro.ate;
    el('fat-filter-hint').textContent=filtro.de&&filtro.ate?(filtro.de===filtro.ate?'Dia '+String(filtro.de).padStart(2,'0')+' selecionado':'Dias '+String(filtro.de).padStart(2,'0')+' a '+String(filtro.ate).padStart(2,'0')+' selecionados'):'Clique num dia do gráfico · Shift+clique seleciona um intervalo';
  }
  function preencherMeses(){
    var seletor=el('fat-month'),atual=seletor.value||mesKey(new Date()),hoje=new Date();
    var datas=dados.vendas.map(function(v){return data(v.DataVenda);}).filter(Boolean);
    dados.metas.forEach(function(m){if(+m.Ano&&+m.Mes)datas.push(new Date(+m.Ano,+m.Mes-1,1));});
    var inicio=datas.length?new Date(Math.min.apply(null,datas)):new Date(hoje.getFullYear(),hoje.getMonth(),1);
    var opcoes=[];
    for(var d=new Date(hoje.getFullYear(),hoje.getMonth(),1);d>=new Date(inicio.getFullYear(),inicio.getMonth(),1);d.setMonth(d.getMonth()-1)){
      opcoes.push('<option value="'+mesKey(d)+'">'+d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})+'</option>');
    }
    seletor.innerHTML=opcoes.join('');
    if([].some.call(seletor.options,function(o){return o.value===atual;}))seletor.value=atual;
  }
  // A meta nasce enorme e encolhe conforme o faturado cresce, para a tela mostrar a disputa.
  function escalarDisputa(meta,pct){
    var hero=el('fat-hero'),bloco=el('fat-meta');
    if(!(meta>0)){bloco.hidden=true;hero.style.setProperty('--fat-escala-valor','1');return;}
    bloco.hidden=false;
    el('fat-meta-label').textContent=filtro.de?'Meta proporcional':'Meta';
    el('fat-meta-value').textContent=dinheiro(meta);
    var p=Math.min(Math.max(pct,0),100)/100;
    hero.style.setProperty('--fat-escala-valor',(.45+.55*p).toFixed(3));
    hero.style.setProperty('--fat-escala-meta',(1-.74*p).toFixed(3));
  }
  function animarIndicadores(valor,meta,animar,doZero){
    cancelAnimationFrame(animacaoValor);
    var inicio=doZero?0:valorAnimado,inicioPct=doZero?0:percentualAnimado,pctFinal=meta>0?valor/meta*100:0,t0=0;
    function escrever(v,pct){
      valorAnimado=v;percentualAnimado=pct;
      el('fat-value').textContent=dinheiro(v);
      escalarDisputa(meta,pct);
      el('fat-progress-faturado').textContent=dinheiro(v)+' faturados';
      el('fat-percent').textContent=meta>0?pct.toLocaleString('pt-BR',{maximumFractionDigits:1,minimumFractionDigits:1})+'%':'—';
      el('fat-progress-fill').style.width=Math.min(Math.max(pct,0),100)+'%';
      el('fat-progress-track').setAttribute('aria-valuenow',String(Math.min(Math.max(Math.round(pct),0),100)));
    }
    if(!animar||window.matchMedia('(prefers-reduced-motion: reduce)').matches||(inicio===valor&&inicioPct===pctFinal)){escrever(valor,pctFinal);return;}
    escrever(inicio,inicioPct);
    function passo(t){
      if(!t0)t0=t;
      var p=Math.min((t-t0)/900,1),e=1-Math.pow(1-p,3);
      escrever(inicio+(valor-inicio)*e,inicioPct+(pctFinal-inicioPct)*e);
      if(p<1)animacaoValor=requestAnimationFrame(passo);else escrever(valor,pctFinal);
    }
    animacaoValor=requestAnimationFrame(passo);
  }
  function fmtEixo(n){if(n>=1000000)return (n/1000000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mi';if(n>=1000)return (n/1000).toLocaleString('pt-BR',{maximumFractionDigits:0})+' mil';return Math.round(n).toLocaleString('pt-BR');}
  function desenharGrafico(vendas,ano,mes,meta,limite,animar){
    var dias=new Date(ano,mes,0).getDate(),total=0,uteis=0,uteisMes=0,serieReal=[],serieEsperada=[],porDia={};
    vendas.forEach(function(v){var d=v.dt.getDate();porDia[d]=(porDia[d]||0)+v.valor;});
    for(var i=1;i<=dias;i++)if(diaUtil(new Date(ano,mes-1,i)))uteisMes++;
    for(var dia=1;dia<=dias;dia++){
      total+=porDia[dia]||0;
      if(diaUtil(new Date(ano,mes-1,dia)))uteis++;
      serieEsperada.push(uteisMes?meta*uteis/uteisMes:0);
      if(dia<=limite)serieReal.push(total);
    }
    var area=el('fat-chart'),max=Math.max(meta,total,1)*1.12;
    var w=Math.max(650,area.clientWidth||1000);
    var h=window.innerWidth<=760?220:Math.round(Math.max(210,Math.min(260,(window.innerHeight||900)*.27)));
    var left=65,right=122,top=16,bottom=31,plotW=w-left-right,plotH=h-top-bottom;
    var x=function(i){return left+i*plotW/(dias-1);},y=function(v){return top+plotH-(v/max)*plotH;};
    function pontos(s,inicio){return s.map(function(v,i){return x(i+(inicio||0)).toFixed(1)+','+y(v).toFixed(1);}).join(' ');}
    ultimoGrafico={args:[vendas,ano,mes,meta,limite],real:serieReal,esperado:serieEsperada,porDia:porDia,x:x,w:w};
    var svg='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Faturado em linha verde contínua e esperado em linha verde escura tracejada, dia a dia">';
    if(filtro.de){var faixaInicio=Math.max(left,x(filtro.de-1)-plotW/(dias-1)/2),faixaFim=Math.min(w-right,x(filtro.ate-1)+plotW/(dias-1)/2);svg+='<rect class="fat-selected-band" x="'+faixaInicio+'" y="'+top+'" width="'+(faixaFim-faixaInicio)+'" height="'+plotH+'"/>';}
    for(var g=0;g<=4;g++){var gy=top+g*plotH/4;svg+='<line class="fat-grid" x1="'+left+'" y1="'+gy+'" x2="'+(w-right)+'" y2="'+gy+'"/><text x="'+(left-10)+'" y="'+(gy+4)+'" text-anchor="end">'+fmtEixo(max*(1-g/4))+'</text>';}
    for(var t=1;t<=dias;t++){if(t===1||t===dias||t%5===0){var tx=x(t-1);svg+='<line class="fat-grid" x1="'+tx+'" y1="'+top+'" x2="'+tx+'" y2="'+(top+plotH)+'"/><text x="'+tx+'" y="'+(h-6)+'" text-anchor="middle">'+String(t).padStart(2,'0')+'</text>';}}
    svg+='<line class="fat-axis" x1="'+left+'" y1="'+(top+plotH)+'" x2="'+(w-right)+'" y2="'+(top+plotH)+'"/>';
    svg+='<defs><clipPath id="fat-reveal-clip"><rect id="fat-reveal-window" x="'+left+'" y="0" width="'+plotW+'" height="'+h+'"/></clipPath></defs><g clip-path="url(#fat-reveal-clip)">';
    svg+='<polyline class="fat-line-expected'+(filtro.de?' fat-series-muted':'')+'" points="'+pontos(serieEsperada)+'"/>';
    if(serieReal.length)svg+='<polyline class="fat-line-actual'+(filtro.de?' fat-series-muted':'')+'" points="'+pontos(serieReal)+'"/>';
    if(filtro.de){
      svg+='<polyline class="fat-line-expected" points="'+pontos(serieEsperada.slice(filtro.de-1,filtro.ate),filtro.de-1)+'"/>';
      if(filtro.de<=limite)svg+='<polyline class="fat-line-actual" points="'+pontos(serieReal.slice(filtro.de-1,Math.min(filtro.ate,limite)),filtro.de-1)+'"/>';
      for(var ponto=filtro.de;ponto<=filtro.ate;ponto++){
        svg+='<circle class="fat-dot-expected" cx="'+x(ponto-1)+'" cy="'+y(serieEsperada[ponto-1])+'" r="3"/>';
        if(ponto<=limite)svg+='<circle class="fat-dot-actual" cx="'+x(ponto-1)+'" cy="'+y(serieReal[ponto-1])+'" r="4"/>';
      }
    }else{
      if(serieReal.length){var ri=serieReal.length-1,rv=serieReal[ri],ly=y(rv);svg+='<circle class="fat-dot-actual" cx="'+x(ri)+'" cy="'+ly+'" r="5"/>';
        if(ri===dias-1&&Math.abs(rv-meta)<max*.13)ly+=rv>=meta?-16:16;
        svg+='<text class="fat-end-label-actual" x="'+(x(ri)+10)+'" y="'+(ly+4)+'">'+fmtEixo(rv)+'</text>';}
      svg+='<circle class="fat-dot-expected" cx="'+x(dias-1)+'" cy="'+y(meta)+'" r="5"/><text class="fat-end-label-expected" x="'+(x(dias-1)+10)+'" y="'+(y(meta)+4)+'">'+fmtEixo(meta)+'</text>';
    }
    svg+='</g><line id="fat-hover-guide" class="fat-hover-guide" x1="0" x2="0" y1="'+top+'" y2="'+(top+plotH)+'" visibility="hidden"/>';
    for(var diaHit=1;diaHit<=limite;diaHit++){
      var centro=x(diaHit-1),metade=plotW/(dias-1)/2;
      svg+='<rect class="fat-hit" data-fat-day="'+diaHit+'" role="button" tabindex="0" aria-label="'+String(diaHit).padStart(2,'0')+'/'+String(mes).padStart(2,'0')+': faturado acumulado '+dinheiro(serieReal[diaHit-1])+', esperado acumulado '+dinheiro(serieEsperada[diaHit-1])+'" x="'+Math.max(left,centro-metade)+'" y="'+top+'" width="'+(Math.min(w-right,centro+metade)-Math.max(left,centro-metade))+'" height="'+plotH+'"/>';
    }
    svg+='</svg>';
    el('fat-chart-canvas').innerHTML=svg;
    el('fat-tooltip').hidden=true;
    cancelAnimationFrame(animacaoGrafico);
    var minhaGeracao=++geracaoGrafico;
    if(animar&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      var janela=el('fat-reveal-window'),inicio=0;
      animacaoGrafico=requestAnimationFrame(function(){
        janela.setAttribute('width','0');
        function passo(t){if(!inicio)inicio=t;var p=Math.min((t-inicio)/2500,1);janela.setAttribute('width',String(plotW*(1-Math.pow(1-p,2))));if(p<1)animacaoGrafico=requestAnimationFrame(passo);else janela.setAttribute('width',String(plotW));}
        animacaoGrafico=requestAnimationFrame(passo);
        setTimeout(function(){if(minhaGeracao===geracaoGrafico)janela.setAttribute('width',String(plotW));},2800);
      });
    }
  }
  function textoSeguro(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function fotoSegura(uri){return /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(uri||'')&&uri.length<80000?uri:'';}
  function iniciais(nome){return (nome||'').trim().split(/\s+/).slice(0,2).map(function(p){return p[0]||'';}).join('').toUpperCase()||'SG';}
  function vendedoresRanking(vendas){
    var totais={};vendas.forEach(function(v){totais[v.vendedor]=(totais[v.vendedor]||0)+v.valor;});
    return dados.vendedores.filter(function(v){return v.IdVendedor&&(v.Tipo||'').trim().toLowerCase()==='vendedor'&&
      (filtro.vendedor==='__all__'||v.IdVendedor===filtro.vendedor)&&((v.Status||'').trim().toLowerCase()==='ativo'||totais[v.IdVendedor]>0);})
      .map(function(v){return {id:v.IdVendedor,nome:v.Nome||'Sem nome',foto:fotoSegura(v.FotoPerfil),valor:totais[v.IdVendedor]||0};})
      .sort(function(a,b){return b.valor-a.valor||a.nome.localeCompare(b.nome,'pt-BR');});
  }
  function medalha(pos){
    if(pos===1)return '<svg viewBox="0 0 32 27" aria-hidden="true"><path d="M3 9l5 4 7-9 7 9 6-4-2 14H5L3 9z"/><path d="M7 19h18"/><circle cx="3" cy="8" r="1"/><circle cx="15" cy="4" r="1"/><circle cx="28" cy="8" r="1"/></svg>';
    if(pos===2)return '<svg viewBox="0 0 32 27" aria-hidden="true"><path d="M3 19c4-9 8-12 13-12s9 3 13 12M5 19h22"/><path d="M9 11l2 3 5-5 5 5 2-3"/><circle cx="16" cy="5" r="1"/></svg>';
    return '<svg viewBox="0 0 32 27" aria-hidden="true"><path d="M7 7c0 9 4 13 9 13s9-4 9-13"/><circle cx="16" cy="20" r="4"/><path d="M13 20h6"/></svg>';
  }
  function desenharPodio(vendedores,animar){
    var cont=el('fat-ranking-podium'),top=vendedores.slice(0,3),max=top.length?Math.max(top[0].valor,1):1;
    if(!top.length){cont.innerHTML='<p class="fat-ranking-empty">Nenhum vendedor para o período selecionado.</p>';return;}
    cont.innerHTML=top.map(function(v,i){var foto=v.foto?'<img src="'+v.foto+'" alt="">':textoSeguro(iniciais(v.nome));
      return '<button type="button" class="fat-rank-person" data-rank-seller="'+textoSeguro(v.id)+'" aria-label="Filtrar por '+textoSeguro(v.nome)+'">'+
        '<span class="fat-rank-medal">'+medalha(i+1)+'</span><span class="fat-rank-photo">'+foto+'</span><span class="fat-rank-place">'+(i+1)+'º</span>'+
        '<span class="fat-rank-plinth"><span class="fat-rank-name">'+textoSeguro(v.nome)+'</span><strong class="fat-rank-value" data-rank-value="'+v.valor+'">'+dinheiro(v.valor)+'</strong><span class="fat-rank-track"><i data-rank-width="'+(v.valor/max*100)+'"></i></span></span></button>';
    }).join('');
    if(!cont.querySelectorAll)return;
    var valores=cont.querySelectorAll('[data-rank-value]'),barras=cont.querySelectorAll('[data-rank-width]');
    cancelAnimationFrame(animacaoRanking);
    if(!animar||window.matchMedia('(prefers-reduced-motion: reduce)').matches){barras.forEach(function(b){b.style.width=b.dataset.rankWidth+'%';});return;}
    valores.forEach(function(v){v.textContent=dinheiro(0);});barras.forEach(function(b){b.style.width='0%';});
    var inicio=0;
    function passo(t){if(!inicio)inicio=t;var p=Math.min((t-inicio)/900,1),e=1-Math.pow(1-p,3);
      valores.forEach(function(v){v.textContent=dinheiro(+v.dataset.rankValue*e);});
      barras.forEach(function(b){b.style.width=(+b.dataset.rankWidth*e)+'%';});
      if(p<1)animacaoRanking=requestAnimationFrame(passo);
    }
    animacaoRanking=requestAnimationFrame(passo);
  }
  function desenharCorrida(vendas,ano,mes,metaEfetiva,limite,animar){
    var area=el('fat-ranking-race'),rank=vendedoresRanking(vendas),dias=new Date(ano,mes,0).getDate(),ativos=dados.vendedores.filter(function(v){return (v.Tipo||'').trim().toLowerCase()==='vendedor'&&(v.Status||'').trim().toLowerCase()==='ativo';}).length;
    var referencia=ativos?metaEfetiva/ativos:0,uteisMes=0,uteis=0,esperado=[],serie=[],porId={};
    for(var d=1;d<=dias;d++)if(diaUtil(new Date(ano,mes-1,d)))uteisMes++;
    for(var dia=1;dia<=dias;dia++){if(diaUtil(new Date(ano,mes-1,dia)))uteis++;esperado.push(uteisMes?referencia*uteis/uteisMes:0);}
    rank.forEach(function(v){var total=0,pontos=[];for(var d=1;d<=limite;d++){total+=vendas.filter(function(s){return s.vendedor===v.id&&s.dt.getDate()===d;}).reduce(function(s,x){return s+x.valor;},0);pontos.push(total);}serie.push({v:v,pontos:pontos});porId[v.id]=pontos;});
    var max=Math.max(referencia,1);serie.forEach(function(s){max=Math.max(max,s.pontos[s.pontos.length-1]||0);});max*=1.15;
    var w=Math.max(650,area.clientWidth||1000),h=238,left=62,right=64,top=14,bottom=30,plotW=w-left-right,plotH=h-top-bottom;
    var x=function(i){return left+i*plotW/(dias-1);},y=function(n){return top+plotH-n/max*plotH;};
    var pontos=function(arr){return arr.map(function(n,i){return x(i).toFixed(1)+','+y(n).toFixed(1);}).join(' ');};
    ultimaCorrida={serie:serie,esperado:esperado,ano:ano,mes:mes,limite:limite};
    var cores=['#65c600','#248650','#3c8f86','#a37831','#427a9c','#709a35'];
    var svg='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Evolução acumulada das vendas por colaborador e meta média individual tracejada">';
    if(filtro.de){var xi=Math.max(left,x(filtro.de-1)-plotW/(dias-1)/2),xf=Math.min(w-right,x(filtro.ate-1)+plotW/(dias-1)/2);svg+='<rect class="fat-selected-band" x="'+xi+'" y="'+top+'" width="'+(xf-xi)+'" height="'+plotH+'"/>';}
    for(var g=0;g<=4;g++){var gy=top+g*plotH/4;svg+='<line class="fat-grid" x1="'+left+'" y1="'+gy+'" x2="'+(w-right)+'" y2="'+gy+'"/><text x="'+(left-8)+'" y="'+(gy+4)+'" text-anchor="end">'+fmtEixo(max*(1-g/4))+'</text>';}
    for(var d=1;d<=dias;d++)if(d===1||d===dias||d%5===0)svg+='<text x="'+x(d-1)+'" y="'+(h-5)+'" text-anchor="middle">'+String(d).padStart(2,'0')+'</text>';
    svg+='<defs><clipPath id="fat-race-clip"><rect id="fat-race-window" x="'+left+'" y="0" width="'+(plotW+16)+'" height="'+h+'"/></clipPath>';
    serie.forEach(function(s,i){if(s.v.foto)svg+='<clipPath id="fat-face-'+i+'"><circle cx="'+x(Math.max(limite-1,0))+'" cy="'+y(s.pontos[s.pontos.length-1]||0)+'" r="10"/></clipPath>';});
    svg+='</defs><g clip-path="url(#fat-race-clip)"><polyline class="fat-race-reference" points="'+pontos(esperado)+'"/>';
    serie.forEach(function(s,i){if(!s.pontos.length)return;var cx=x(s.pontos.length-1),cy=y(s.pontos[s.pontos.length-1]);
      svg+='<polyline class="fat-race-line" stroke="'+cores[i%cores.length]+'" points="'+pontos(s.pontos)+'"/>';
      svg+='<circle class="fat-race-avatar" fill="'+cores[i%cores.length]+'" cx="'+cx+'" cy="'+cy+'" r="11"/>';
      if(s.v.foto)svg+='<image href="'+s.v.foto+'" x="'+(cx-10)+'" y="'+(cy-10)+'" width="20" height="20" preserveAspectRatio="xMidYMid slice" clip-path="url(#fat-face-'+i+')"/>';
      else svg+='<text x="'+cx+'" y="'+(cy+3)+'" text-anchor="middle" fill="#fff" style="fill:#fff;font-size:9px;font-weight:800">'+textoSeguro(iniciais(s.v.nome))+'</text>';
    });svg+='</g>';
    for(var hit=1;hit<=limite;hit++){var cx=x(hit-1),meio=plotW/(dias-1)/2;svg+='<rect class="fat-race-hit" data-rank-day="'+hit+'" role="button" tabindex="0" aria-label="Dia '+String(hit).padStart(2,'0')+'" x="'+Math.max(left,cx-meio)+'" y="'+top+'" width="'+(Math.min(w-right,cx+meio)-Math.max(left,cx-meio))+'" height="'+plotH+'"/>';}
    svg+='</svg>';area.innerHTML=svg;
    cancelAnimationFrame(animacaoCorrida);
    if(animar&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){var janela=el('fat-race-window'),inicio=0;
      janela.setAttribute('width','0');function passo(t){if(!inicio)inicio=t;var p=Math.min((t-inicio)/2500,1);janela.setAttribute('width',String((plotW+16)*(1-Math.pow(1-p,2))));if(p<1)animacaoCorrida=requestAnimationFrame(passo);else janela.setAttribute('width',String(plotW+16));}
      animacaoCorrida=requestAnimationFrame(passo);
    }
  }
  function atualizarVisao(){
    el('fat-tab-faturamento').classList.toggle('active',aba==='faturamento');el('fat-tab-ranking').classList.toggle('active',aba==='ranking');
    el('fat-tab-faturamento').setAttribute('aria-current',aba==='faturamento'?'page':'false');el('fat-tab-ranking').setAttribute('aria-current',aba==='ranking'?'page':'false');
    el('fat-chart-card').hidden=aba!=='faturamento';el('fat-ranking-card').hidden=aba!=='ranking';
    el('fat-ranking-podium').hidden=visaoRanking!=='podio';el('fat-ranking-race').hidden=visaoRanking!=='evolucao';
    el('fat-ranking-reference').hidden=visaoRanking!=='evolucao';
    ['podio','evolucao'].forEach(function(m){var b=el('fat-ranking-'+m);b.classList.toggle('active',visaoRanking===m);b.setAttribute('aria-pressed',String(visaoRanking===m));});
    if(aba==='ranking'&&visaoRanking==='podio'&&!filtro.de)el('fat-filter-hint').textContent='Use os filtros de período ou clique num colaborador do pódio';
  }
  function render(forcarAnimacao,doZero){
    if(!Object.keys(carregado).every(function(k){return carregado[k];}))return;
    var sel=mesSelecionado(),ano=sel.ano,mes=sel.mes,mesId=el('fat-month').value,hoje=new Date(),mesAtual=mesKey(hoje);
    var todas=vendasValidas(),vendasMes=todas.filter(function(v){return v.dia.slice(0,7)===mesId&&(filtro.vendedor==='__all__'||v.vendedor===filtro.vendedor);});
    var limite=mesId<mesAtual?new Date(ano,mes,0).getDate():(mesId===mesAtual?hoje.getDate():0);
    vendasMes=vendasMes.filter(function(v){return v.dt.getDate()<=limite;});
    atualizarDatas(ano,mes,limite);
    var inicio=filtro.de||1,fim=filtro.ate||limite;
    var vendas=vendasMes.filter(function(v){return v.dt.getDate()>=inicio&&v.dt.getDate()<=fim;});
    var total=vendas.reduce(function(s,v){return s+v.valor;},0),metaMes=metaDoMes(ano,mes,filtro.vendedor),meta=metaMes;
    if(filtro.de){
      var diasUteisMes=0,diasUteisFiltro=0,diasMes=new Date(ano,mes,0).getDate();
      for(var d=1;d<=diasMes;d++)if(diaUtil(new Date(ano,mes-1,d))){diasUteisMes++;if(d>=inicio&&d<=fim)diasUteisFiltro++;}
      meta=diasUteisMes?metaMes*diasUteisFiltro/diasUteisMes:0;
    }
    var animar=!!forcarAnimacao||primeiraRenderizacao||ultimoValor!==total;
    animarIndicadores(total,meta,animar,!!doZero||primeiraRenderizacao||ultimoValor!==total);
    ultimoValor=total;primeiraRenderizacao=false;
    el('fat-title').textContent=filtro.de?(inicio===fim?'Faturamento no dia':'Faturamento no período'):'Faturamento no mês';
    el('fat-progress-title').textContent=filtro.de?'Faturado vs. meta proporcional':'Faturado vs. meta do mês';
    el('fat-sales-count').textContent=String(vendas.length);
    el('fat-ticket').textContent=dinheiro(vendas.length?total/vendas.length:0);
    el('fat-progress-meta').textContent=metaMes>0?(filtro.de?'Meta proporcional ':'Meta ')+dinheiro(meta)+' · Faltam '+dinheiro(Math.max(meta-total,0)):'Meta não cadastrada';
    var anterior=new Date(ano,mes-2,1),idAnterior=mesKey(anterior),limiteAnterior=new Date(anterior.getFullYear(),anterior.getMonth()+1,0).getDate();
    var totalAnterior=todas.filter(function(v){var dia=v.dt.getDate();return v.dia.slice(0,7)===idAnterior&&dia>=inicio&&dia<=Math.min(fim,limiteAnterior)&&(filtro.vendedor==='__all__'||v.vendedor===filtro.vendedor);}).reduce(function(s,v){return s+v.valor;},0);
    var comparacao=el('fat-compare');comparacao.classList.remove('negative');comparacao.textContent='';
    if(totalAnterior>0){var variacao=(total/totalAnterior-1)*100;comparacao.classList.toggle('negative',variacao<0);var icone=document.createElement('span');icone.textContent=variacao<0?'↘':'↗';var forte=document.createElement('strong');forte.textContent=(variacao>=0?'+':'')+variacao.toLocaleString('pt-BR',{maximumFractionDigits:1,minimumFractionDigits:1})+'%';comparacao.append(icone,forte,document.createTextNode(filtro.de?'vs. mesmos dias do mês anterior':mesId===mesAtual?'vs. mesmo período anterior':'vs. mês anterior'));}
    if(vendas.length){var ultima=vendas.slice().sort(function(a,b){return b.dia.localeCompare(a.dia);})[0];el('fat-latest-name').textContent=ultima.nome||'Venda registrada';el('fat-latest-value').textContent=dinheiro(ultima.valor);el('fat-latest-date').textContent='Registrada em '+window.SGUtil.fmtDateBR(ultima.dt);}
    else{el('fat-latest-name').textContent='Nenhuma venda';el('fat-latest-value').textContent='—';el('fat-latest-date').textContent='No mês selecionado';}
    el('fat-latest').classList.toggle('has-sale',!!vendas.length);
    atualizarVisao();
    if(aba==='faturamento')desenharGrafico(vendasMes,ano,mes,metaMes,limite,animar);
    else if(visaoRanking==='podio')desenharPodio(vendedoresRanking(vendas),animar);
    else desenharCorrida(vendasMes,ano,mes,metaDoMes(ano,mes,'__all__'),limite,animar);
    el('fat-status').textContent=metaMes>0?'':'Sem meta efetiva cadastrada para este mês.';
  }
  var ultimoValor=null;
  function selecionarDia(dia,shift){
    if(shift&&filtro.ancora){filtro.de=Math.min(filtro.ancora,dia);filtro.ate=Math.max(filtro.ancora,dia);}
    else{filtro.de=dia;filtro.ate=dia;filtro.ancora=dia;}
    render(true,true);
  }
  function alvoDia(e){var alvo=e.target.closest&&e.target.closest('[data-fat-day]');return alvo&&el('fat-chart').contains(alvo)?alvo:null;}
  function mostrarDia(alvo){
    var dia=+alvo.getAttribute('data-fat-day'),grafico=ultimoGrafico;if(!grafico||grafico.real[dia-1]===undefined)return;
    var real=grafico.real[dia-1],esperado=grafico.esperado[dia-1],delta=real-esperado,tooltip=el('fat-tooltip');
    var sel=mesSelecionado();
    el('fat-tooltip-day').textContent='Dia '+String(dia).padStart(2,'0')+'/'+String(sel.mes).padStart(2,'0')+'/'+sel.ano;
    el('fat-tooltip-sales').textContent='Vendas no dia: '+dinheiro(grafico.porDia[dia]||0);
    el('fat-tooltip-actual').textContent='Faturado até o dia: '+dinheiro(real);
    el('fat-tooltip-expected').textContent='Esperado até o dia: '+dinheiro(esperado);
    el('fat-tooltip-delta').textContent=(delta>=0?'Superávit: ':'Déficit: ')+dinheiro(Math.abs(delta));
    tooltip.classList.toggle('positive',delta>=0);tooltip.classList.toggle('negative',delta<0);
    var caixa=tooltip.parentElement.getBoundingClientRect(),alvoCaixa=alvo.getBoundingClientRect();
    tooltip.style.left=Math.max(110,Math.min(caixa.width-110,alvoCaixa.left+alvoCaixa.width/2-caixa.left))+'px';
    tooltip.hidden=false;
    var guia=el('fat-hover-guide');guia.setAttribute('x1',grafico.x(dia-1));guia.setAttribute('x2',grafico.x(dia-1));guia.setAttribute('visibility','visible');
  }
  function esconderDia(){el('fat-tooltip').hidden=true;var guia=el('fat-hover-guide');if(guia)guia.setAttribute('visibility','hidden');}
  function alvoDiaCorrida(e){var alvo=e.target.closest&&e.target.closest('[data-rank-day]');return alvo&&el('fat-ranking-race').contains(alvo)?alvo:null;}
  function mostrarDiaCorrida(alvo){
    var dia=+alvo.getAttribute('data-rank-day'),corrida=ultimaCorrida;if(!corrida||dia>corrida.limite)return;
    var html='<strong>Dia '+String(dia).padStart(2,'0')+'/'+String(corrida.mes).padStart(2,'0')+'/'+corrida.ano+'</strong><span>Meta média até o dia: '+dinheiro(corrida.esperado[dia-1])+'</span>';
    corrida.serie.forEach(function(s){var real=s.pontos[dia-1]||0,delta=real-corrida.esperado[dia-1];html+='<span>'+textoSeguro(s.v.nome)+': '+dinheiro(real)+' · '+(delta>=0?'superávit ':'déficit ')+dinheiro(Math.abs(delta))+'</span>';});
    var dica=el('fat-ranking-tooltip');dica.innerHTML=html;
    var caixa=el('fat-ranking-card').getBoundingClientRect(),alvoCaixa=alvo.getBoundingClientRect();
    dica.style.left=Math.max(125,Math.min(caixa.width-125,alvoCaixa.left+alvoCaixa.width/2-caixa.left))+'px';dica.hidden=false;
  }
  function init(){
    if(!window.SGAuth||!window.SGAuth.podeVerFaturamento())return;
    if(iniciado){render(true,true);return;}
    iniciado=true;
    el('fat-tab-faturamento').addEventListener('click',function(){aba='faturamento';render(true,true);});
    el('fat-tab-ranking').addEventListener('click',function(){aba='ranking';render(true,true);});
    ['podio','evolucao'].forEach(function(m){el('fat-ranking-'+m).addEventListener('click',function(){visaoRanking=m;render(true,true);});});
    el('fat-ranking-podium').addEventListener('click',function(e){
      var alvo=e.target.closest&&e.target.closest('[data-rank-seller]');if(!alvo)return;
      filtro.vendedor=alvo.getAttribute('data-rank-seller');el('fat-seller').value=filtro.vendedor;render(true,true);
    });
    var corrida=el('fat-ranking-race');
    corrida.addEventListener('mouseover',function(e){var alvo=alvoDiaCorrida(e);if(alvo)mostrarDiaCorrida(alvo);});
    corrida.addEventListener('focusin',function(e){var alvo=alvoDiaCorrida(e);if(alvo)mostrarDiaCorrida(alvo);});
    corrida.addEventListener('mouseleave',function(){el('fat-ranking-tooltip').hidden=true;});
    corrida.addEventListener('focusout',function(){el('fat-ranking-tooltip').hidden=true;});
    corrida.addEventListener('click',function(e){var alvo=alvoDiaCorrida(e);if(alvo)selecionarDia(+alvo.getAttribute('data-rank-day'),e.shiftKey);});
    corrida.addEventListener('keydown',function(e){var alvo=alvoDiaCorrida(e);if(alvo&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selecionarDia(+alvo.getAttribute('data-rank-day'),e.shiftKey);}});
    if(window.addEventListener)window.addEventListener('resize',function(){
      clearTimeout(resizeGrafico);
      resizeGrafico=setTimeout(function(){if(aba==='faturamento'&&ultimoGrafico)desenharGrafico.apply(null,ultimoGrafico.args);else if(aba==='ranking'&&visaoRanking==='evolucao')render(false);},100);
    });
    var seletor=el('fat-month'),agora=new Date();seletor.innerHTML='<option value="'+mesKey(agora)+'">'+agora.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})+'</option>';
    seletor.addEventListener('change',function(){filtro.de=0;filtro.ate=0;filtro.ancora=0;render(true,true);});
    el('fat-seller').addEventListener('change',function(){filtro.vendedor=this.value;render(true,true);});
    function mudarDatas(e){
      var mesId=seletor.value,limite=ultimoGrafico?ultimoGrafico.args[4]:new Date(+mesId.slice(0,4),+mesId.slice(5),0).getDate();
      var de=el('fat-date-from').value,ate=el('fat-date-to').value;
      var d=de.slice(0,7)===mesId?+de.slice(8):0,a=ate.slice(0,7)===mesId?+ate.slice(8):0;
      if(d&&a&&d>a){if(e&&e.target&&e.target.id==='fat-date-from')a=d;else d=a;}
      filtro.de=d|| (a?1:0);filtro.ate=a|| (d?limite:0);filtro.ancora=filtro.de;
      render(true,true);
    }
    el('fat-date-from').addEventListener('change',mudarDatas);
    el('fat-date-to').addEventListener('change',mudarDatas);
    el('fat-clear-filter').addEventListener('click',function(){filtro.de=0;filtro.ate=0;filtro.ancora=0;render(true,true);});
    var grafico=el('fat-chart');
    grafico.addEventListener('mouseover',function(e){var alvo=alvoDia(e);if(alvo)mostrarDia(alvo);});
    grafico.addEventListener('focusin',function(e){var alvo=alvoDia(e);if(alvo)mostrarDia(alvo);});
    grafico.addEventListener('mouseleave',esconderDia);
    grafico.addEventListener('focusout',esconderDia);
    grafico.addEventListener('click',function(e){var alvo=alvoDia(e);if(alvo)selecionarDia(+alvo.getAttribute('data-fat-day'),e.shiftKey);});
    grafico.addEventListener('keydown',function(e){var alvo=alvoDia(e);if(alvo&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selecionarDia(+alvo.getAttribute('data-fat-day'),e.shiftKey);}});
    window.SGFireReady.then(function(){
      [['vendas','vendas'],['metas','metas'],['vendedores','vendedores'],['metas_individuais','metasIndividuais']].forEach(function(par){
        window.SGUtil.assinarColecao(par[0],function(lista){dados[par[1]]=lista;carregado[par[1]]=true;preencherMeses();if(par[1]==='vendedores')preencherVendedores();render();});
      });
    }).catch(function(){el('fat-status').textContent='Não foi possível conectar ao Firestore.';});
  }
  window.faturamentoApp={init:init};
})();
