// ════ FATURAMENTO (visão da empresa, somente administrador) ════
(function(){
  var iniciado=false, carregado={vendas:false,metas:false,vendedores:false,metasIndividuais:false};
  var dados={vendas:[],metas:[],vendedores:[],metasIndividuais:[]};
  var ID_CLIENTE_APORTE_SOCIOS='da6dbd89'; // mesma exceção da tela Vendas
  var dinheiro=window.SGUtil.fmtMoney, numero=window.SGUtil.parseBRNumber, data=window.SGUtil.parseBRDate, chave=window.SGUtil.dateKey;
  var animacaoValor=0, ultimoGrafico=null, resizeGrafico=0;
  function el(id){return document.getElementById(id);}
  function mesKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
  function diaUtil(d){return d.getDay()!==0&&d.getDay()!==6;}
  function mesSelecionado(){var p=el('fat-month').value.split('-');return {ano:+p[0],mes:+p[1]};}
  function vendasValidas(){
    var ceos={};dados.vendedores.forEach(function(v){if((v.Tipo||'').trim().toLowerCase()==='ceo')ceos[v.IdVendedor]=true;});
    return dados.vendas.map(function(v){var dt=data(v.DataVenda);return {id:v.IdVenda,cliente:v.IdCliente,vendedor:v.IdVendedor,dt:dt,dia:dt?chave(dt):'',valor:numero(v.Valor),nome:(v.NomeCliente||'').trim()};})
      .filter(function(v){return v.id&&v.dt&&v.cliente!==ID_CLIENTE_APORTE_SOCIOS&&!ceos[v.vendedor];});
  }
  function metaDoMes(ano,mes){
    var registro=dados.metas.filter(function(m){return +m.Ano===ano&&+m.Mes===mes;})[0];
    var bruta=registro?numero(registro.Valor):0;
    var ativos=dados.vendedores.filter(function(v){return (v.Tipo||'').trim()==='Vendedor'&&(v.Status||'').trim()==='Ativo';});
    if(!ativos.length)return 0;
    var padrao=bruta/ativos.length;
    return ativos.reduce(function(total,v){
      var manual=dados.metasIndividuais.filter(function(m){return m.IdVendedor===v.IdVendedor&&+m.Ano===ano&&+m.Mes===mes;})[0];
      return total+(manual?numero(manual.ValorMeta):padrao);
    },0);
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
  function animarNumero(valor){
    cancelAnimationFrame(animacaoValor);
    var elemento=el('fat-value'),inicio=numero(elemento.textContent),t0=performance.now();
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){elemento.textContent=dinheiro(valor);return;}
    function passo(t){var p=Math.min((t-t0)/850,1),e=1-Math.pow(1-p,3);elemento.textContent=dinheiro(inicio+(valor-inicio)*e);if(p<1)animacaoValor=requestAnimationFrame(passo);}
    animacaoValor=requestAnimationFrame(passo);
  }
  function fmtEixo(n){if(n>=1000000)return (n/1000000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mi';if(n>=1000)return (n/1000).toLocaleString('pt-BR',{maximumFractionDigits:0})+' mil';return Math.round(n).toLocaleString('pt-BR');}
  function desenharGrafico(vendas,ano,mes,meta,limite){
    ultimoGrafico=[vendas,ano,mes,meta,limite];
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
    function pontos(s){return s.map(function(v,i){return x(i).toFixed(1)+','+y(v).toFixed(1);}).join(' ');}
    var svg='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Faturado em linha verde contínua e esperado em linha verde escura tracejada, dia a dia">';
    for(var g=0;g<=4;g++){var gy=top+g*plotH/4;svg+='<line class="fat-grid" x1="'+left+'" y1="'+gy+'" x2="'+(w-right)+'" y2="'+gy+'"/><text x="'+(left-10)+'" y="'+(gy+4)+'" text-anchor="end">'+fmtEixo(max*(1-g/4))+'</text>';}
    for(var t=1;t<=dias;t++){if(t===1||t===dias||t%5===0){var tx=x(t-1);svg+='<line class="fat-grid" x1="'+tx+'" y1="'+top+'" x2="'+tx+'" y2="'+(top+plotH)+'"/><text x="'+tx+'" y="'+(h-6)+'" text-anchor="middle">'+String(t).padStart(2,'0')+'</text>';}}
    svg+='<line class="fat-axis" x1="'+left+'" y1="'+(top+plotH)+'" x2="'+(w-right)+'" y2="'+(top+plotH)+'"/>';
    svg+='<polyline class="fat-line-expected" points="'+pontos(serieEsperada)+'"/>';
    if(serieReal.length){svg+='<polyline class="fat-line-actual" points="'+pontos(serieReal)+'"/>';var ri=serieReal.length-1,rv=serieReal[ri],ly=y(rv);svg+='<circle class="fat-dot-actual" cx="'+x(ri)+'" cy="'+ly+'" r="5"/>';
      if(ri===dias-1&&Math.abs(rv-meta)<max*.13)ly+=rv>=meta?-16:16;
      svg+='<text class="fat-end-label-actual" x="'+(x(ri)+10)+'" y="'+(ly+4)+'">'+fmtEixo(rv)+'</text>';}
    svg+='<circle class="fat-dot-expected" cx="'+x(dias-1)+'" cy="'+y(serieEsperada[dias-1])+'" r="5"/><text class="fat-end-label-expected" x="'+(x(dias-1)+10)+'" y="'+(y(meta)+4)+'">'+fmtEixo(meta)+'</text></svg>';
    area.innerHTML=svg;
  }
  function render(){
    if(!Object.keys(carregado).every(function(k){return carregado[k];}))return;
    var sel=mesSelecionado(),ano=sel.ano,mes=sel.mes,mesId=el('fat-month').value,hoje=new Date(),mesAtual=mesKey(hoje);
    var todas=vendasValidas(),vendas=todas.filter(function(v){return v.dia.slice(0,7)===mesId;});
    var limite=mesId<mesAtual?new Date(ano,mes,0).getDate():(mesId===mesAtual?hoje.getDate():0);
    vendas=vendas.filter(function(v){return v.dt.getDate()<=limite;});
    var total=vendas.reduce(function(s,v){return s+v.valor;},0),meta=metaDoMes(ano,mes),pct=meta>0?total/meta*100:0;
    animarNumero(total);
    el('fat-sales-count').textContent=String(vendas.length);
    el('fat-ticket').textContent=dinheiro(vendas.length?total/vendas.length:0);
    el('fat-percent').textContent=meta>0?pct.toLocaleString('pt-BR',{maximumFractionDigits:1,minimumFractionDigits:1})+'%':'—';
    el('fat-progress-fill').style.width=Math.min(Math.max(pct,0),100)+'%';
    el('fat-progress-track').setAttribute('aria-valuenow',String(Math.min(Math.max(Math.round(pct),0),100)));
    el('fat-progress-faturado').textContent=dinheiro(total)+' faturados';
    el('fat-progress-meta').textContent=meta>0?'Meta '+dinheiro(meta)+' · Faltam '+dinheiro(Math.max(meta-total,0)):'Meta não cadastrada';
    var anterior=new Date(ano,mes-2,1),idAnterior=mesKey(anterior),limiteAnterior=mesId===mesAtual?Math.min(limite,new Date(anterior.getFullYear(),anterior.getMonth()+1,0).getDate()):new Date(anterior.getFullYear(),anterior.getMonth()+1,0).getDate();
    var totalAnterior=todas.filter(function(v){return v.dia.slice(0,7)===idAnterior&&v.dt.getDate()<=limiteAnterior;}).reduce(function(s,v){return s+v.valor;},0);
    var comparacao=el('fat-compare');comparacao.classList.remove('negative');comparacao.textContent='';
    if(totalAnterior>0){var variacao=(total/totalAnterior-1)*100;comparacao.classList.toggle('negative',variacao<0);var icone=document.createElement('span');icone.textContent=variacao<0?'↘':'↗';var forte=document.createElement('strong');forte.textContent=(variacao>=0?'+':'')+variacao.toLocaleString('pt-BR',{maximumFractionDigits:1,minimumFractionDigits:1})+'%';comparacao.append(icone,forte,document.createTextNode(mesId===mesAtual?'vs. mesmo período anterior':'vs. mês anterior'));}
    if(vendas.length){var ultima=vendas.slice().sort(function(a,b){return b.dia.localeCompare(a.dia);})[0];el('fat-latest-name').textContent=ultima.nome||'Venda registrada';el('fat-latest-value').textContent=dinheiro(ultima.valor);el('fat-latest-date').textContent='Registrada em '+window.SGUtil.fmtDateBR(ultima.dt);}
    else{el('fat-latest-name').textContent='Nenhuma venda';el('fat-latest-value').textContent='—';el('fat-latest-date').textContent='No mês selecionado';}
    desenharGrafico(vendas,ano,mes,meta,limite);
    el('fat-status').textContent=meta>0?'':'Sem meta efetiva cadastrada para este mês.';
  }
  function init(){
    if(iniciado||!window.SGAuth||!window.SGAuth.isAdmin())return;
    iniciado=true;
    if(window.addEventListener)window.addEventListener('resize',function(){
      clearTimeout(resizeGrafico);
      resizeGrafico=setTimeout(function(){if(ultimoGrafico)desenharGrafico.apply(null,ultimoGrafico);},100);
    });
    var seletor=el('fat-month'),agora=new Date();seletor.innerHTML='<option value="'+mesKey(agora)+'">'+agora.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})+'</option>';
    seletor.addEventListener('change',render);
    window.SGFireReady.then(function(){
      [['vendas','vendas'],['metas','metas'],['vendedores','vendedores'],['metas_individuais','metasIndividuais']].forEach(function(par){
        window.SGUtil.assinarColecao(par[0],function(lista){dados[par[1]]=lista;carregado[par[1]]=true;preencherMeses();render();});
      });
    }).catch(function(){el('fat-status').textContent='Não foi possível conectar ao Firestore.';});
  }
  window.faturamentoApp={init:init};
})();
