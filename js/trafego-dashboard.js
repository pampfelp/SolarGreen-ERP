/**
 * trafego-dashboard.js — cálculo e HTML da seção "Tráfego pago" do Dashboard
 * (2026-10-21). Desenho validado na maquete de 2026-10-21.
 *
 * Função pura sobre listas já filtradas pelo dashboard.js, como dre-dashboard.js:
 * os números e o HTML se testam em Node, sem tela.
 *
 * Regras (decididas pelo Felipe em 2026-10-21):
 *   - investido = custos pagos da categoria trafego_pago no período;
 *   - cliente do tráfego = Origem com "tráfego" em qualquer grafia, ou "Site";
 *   - vendas do período de clientes do tráfego, mesmo que o lead tenha entrado antes.
 */
(function(root){
  'use strict';

  var MESES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  var MAX_MESES=6;

  function esc(s){
    if(root&&root.SGUtil&&root.SGUtil.escapeHtml)return root.SGUtil.escapeHtml(s);
    return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
  }
  function arred(n,casas){ var f=Math.pow(10,casas); return Math.round(n*f)/f; }
  function fmtNum(n,casas){ return arred(n,casas).toLocaleString('pt-BR',{minimumFractionDigits:casas,maximumFractionDigits:casas}); }
  function brl(n){ n=arred(n||0,2); return (n<0?'-R$ ':'R$ ')+fmtNum(Math.abs(n),2); }
  function brl0(n){ return 'R$ '+fmtNum(n||0,0); }
  function pct1(v){ return v==null?'—':fmtNum(v,1)+'%'; }
  function div(a,b){ return b>0?a/b:null; }
  function norm(s){ return String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim(); }

  /** 'trafego' | 'site' | 'outra' | 'sem' (vazio). */
  function tipoOrigem(origem){
    var o=norm(origem);
    if(!o)return 'sem';
    if(o.indexOf('trafego')>=0)return 'trafego';
    if(o==='site')return 'site';
    return 'outra';
  }

  /**
   * p.custos:   [{valor,categoria,dateKey}] pagos, no período (mesma lista da DRE).
   * p.vendas:   [{idCliente,valor,dateKey}] faturadas no período.
   * p.leads:    [{idCliente,origem}] criados no período (origem = campo Origem do próprio lead, quando existe).
   * p.origemDe: function(idCliente) -> Origem do cadastro do cliente ('' se não tem).
   * p.funil:    {conversas,propostas} dos leads do tráfego, calculado pelo dashboard.js.
   * p.origensCadastradas: todas as Origens da base, para dizer quais grafias contaram como tráfego.
   * p.ate:      'AAAA-MM-DD' do fim do período (marca o mês incompleto).
   */
  function calcular(p){
    var origemDe=p.origemDe||function(){return '';};
    function tipoCliente(id){ return tipoOrigem(origemDe(id)); }
    var investido=0, mesesMapa={};
    function mes(k){ var m=String(k||'').slice(0,7); if(!m)return null; if(!mesesMapa[m])mesesMapa[m]={mes:m,investido:0,fat:0}; return mesesMapa[m]; }
    (p.custos||[]).forEach(function(c){
      if(c.categoria!=='trafego_pago')return;
      investido+=c.valor; var m=mes(c.dateKey); if(m)m.investido+=c.valor;
    });
    var por={trafego:{leads:0,clientes:{},fat:0,nVendas:0},site:{leads:0,clientes:{},fat:0,nVendas:0}};
    (p.leads||[]).forEach(function(l){
      var t=tipoCliente(l.idCliente); if(t==='sem')t=tipoOrigem(l.origem);
      if(por[t])por[t].leads++;
    });
    var semOrigem={n:0,valor:0};
    (p.vendas||[]).forEach(function(v){
      var t=tipoCliente(v.idCliente);
      if(t==='sem'){ semOrigem.n++; semOrigem.valor+=v.valor; return; }
      if(!por[t])return;
      por[t].fat+=v.valor; por[t].nVendas++; por[t].clientes[v.idCliente]=true;
      var m=mes(v.dateKey); if(m)m.fat+=v.valor;
    });
    ['trafego','site'].forEach(function(k){ por[k].nClientes=Object.keys(por[k].clientes).length; delete por[k].clientes; });
    var nLeads=por.trafego.leads+por.site.leads, nClientes=por.trafego.nClientes+por.site.nClientes;
    var fat=por.trafego.fat+por.site.fat, nVendas=por.trafego.nVendas+por.site.nVendas;
    var meses=Object.keys(mesesMapa).sort().map(function(k){ var m=mesesMapa[k]; m.retorno=div(m.fat,m.investido); return m; });
    var variantes=[];
    (p.origensCadastradas||[]).forEach(function(o){ o=String(o||'').trim(); if(tipoOrigem(o)==='trafego'&&variantes.indexOf(o)<0)variantes.push(o); });
    var f=p.funil||{};
    return {investido:investido,nLeads:nLeads,nClientes:nClientes,faturamento:fat,nVendas:nVendas,
      cpl:div(investido,nLeads),cac:div(investido,nClientes),retorno:div(fat,investido),conversaoLeads:div(nClientes,nLeads),
      porOrigem:por,meses:meses,semOrigem:semOrigem,variantes:variantes,ate:p.ate||'',
      funil:{contatos:nLeads,conversas:f.conversas||0,propostas:f.propostas||0,vendas:nVendas}};
  }

  /* ─── KPIs ─────────────────────────────────────────────────────── */
  function kpi(tag,valor,sub,barra,cls){
    return '<div class="kpi"><div class="tag">'+tag+'</div><div class="num'+(cls?' '+cls:'')+'">'+valor+'</div><div class="sub">'+sub+'</div><div class="bar"'+(barra?' style="background:'+barra+';"':'')+'></div></div>';
  }
  function htmlKpis(r){
    var ret=r.retorno;
    return kpi('Investido',brl(r.investido),'categoria Tráfego pago, status Pago','var(--debit)')+
      kpi('Leads do tráfego',String(r.nLeads),r.cpl==null?'sem lead no período':brl(r.cpl)+' por lead','var(--info)')+
      kpi('Clientes que compraram',String(r.nClientes),r.conversaoLeads==null?'sem lead no período':pct1(r.conversaoLeads*100)+' dos leads','var(--accent)')+
      kpi('Faturamento do tráfego',brl(r.faturamento),r.nVendas===1?'1 venda desse cliente':r.nVendas+' vendas desses clientes','var(--accent)')+
      kpi('Custo por cliente',r.cac==null?'—':brl(r.cac),'investido ÷ clientes','')+
      kpi('Retorno',ret==null?'—':fmtNum(ret,1)+'x','faturamento ÷ investido','var(--accent-deep)',ret==null?'':(ret>=1?'pos':'neg'));
  }

  /* ─── Investido × faturamento por mês ──────────────────────────── */
  function rotuloMes(m,curto){ var a=m.split('-'); var nome=MESES[+a[1]-1]; return curto?nome:nome+'/'+a[0]; }
  function fimDoMes(m){ var a=m.split('-'); return new Date(+a[0],+a[1],0).getDate(); }
  function incompleto(m,ate){ return ate&&ate.slice(0,7)===m&&+ate.slice(8,10)<fimDoMes(m)?+ate.slice(8,10):0; }

  /** Barras em SVG. largura: 900 (computador) ou 340 (celular); no celular os valores saem sem "R$". */
  function svgMeses(meses,ate,largura){
    var cel=largura<500, n=meses.length, grupo=largura/n, barra=cel?26:56, base=196, alt=160;
    var maxV=Math.max.apply(null,meses.map(function(m){return Math.max(m.fat,m.investido);}))||1;
    function h(v){ return v>0?Math.max(2,v/maxV*alt):0; }
    var s='<svg class="tp-chart'+(cel?' mob':'')+'" viewBox="0 0 '+largura+' '+(cel?240:236)+'" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Investido e faturamento do tráfego por mês">'+
      '<line class="eixo" x1="0" y1="'+base+'" x2="'+largura+'" y2="'+base+'"/>';
    meses.forEach(function(m,i){
      var cx=grupo*i+grupo/2, xi=cx-barra-(cel?2:3), xf=cx+(cel?2:3), hi=h(m.investido), hf=h(m.fat);
      var dia=incompleto(m.mes,ate);
      var rot=cel?(rotuloMes(m.mes,true)+(dia?' (até '+dia+')':'')):(rotuloMes(m.mes)+(dia?' (até dia '+dia+')':''));
      var val=function(v){ return cel?fmtNum(v,0):brl0(v); };
      s+='<rect x="'+xi.toFixed(1)+'" y="'+(base-hi).toFixed(1)+'" width="'+barra+'" height="'+hi.toFixed(1)+'" rx="3" class="inv"/>'+
        '<rect x="'+xf.toFixed(1)+'" y="'+(base-hf).toFixed(1)+'" width="'+barra+'" height="'+hf.toFixed(1)+'" rx="'+(cel?3:4)+'" class="fat"/>'+
        '<text class="vl" x="'+(xi+barra/2).toFixed(1)+'" y="'+(base-hi-7).toFixed(1)+'" text-anchor="middle">'+val(m.investido)+'</text>'+
        '<text class="vl" x="'+(xf+barra/2).toFixed(1)+'" y="'+(base-hf-7).toFixed(1)+'" text-anchor="middle">'+val(m.fat)+'</text>'+
        '<text class="lb" x="'+cx.toFixed(1)+'" y="'+(cel?214:213)+'" text-anchor="middle">'+esc(rot)+'</text>'+
        '<text class="roas" x="'+cx.toFixed(1)+'" y="'+(cel?232:230)+'" text-anchor="middle">'+(cel?'':'retorno ')+(m.retorno==null?'—':fmtNum(m.retorno,1)+'x')+'</text>';
    });
    return s+'</svg>';
  }
  function htmlMeses(r){
    var h='<div class="dd-sub">Investido × faturamento, por mês</div>';
    if(!r.meses.length)return h+'<div class="chart-empty" style="height:80px;">Nenhum investimento nem venda do tráfego no período</div>';
    var meses=r.meses.slice(-MAX_MESES);
    h+='<div class="tp-legenda"><span><i class="inv"></i>Investido</span><span><i class="fat"></i>Faturamento do tráfego</span></div>'+
      svgMeses(meses,r.ate,900)+svgMeses(meses,r.ate,340)+
      '<div class="tp-nota-mob">Valores em R$. Embaixo de cada mês, o retorno.</div>';
    if(r.meses.length>MAX_MESES)h+='<div class="dd-peq2">Mostrando os últimos '+MAX_MESES+' meses do período; os números de cima somam o período inteiro.</div>';
    return h;
  }

  /* ─── Por origem do cliente ────────────────────────────────────── */
  function linhaOrigem(nome,o,fatTotal){
    var share=fatTotal>0?Math.round(o.fat/fatTotal*100)+'%':'—';
    return '<div class="tp-ori"><span class="n">'+nome+'</span><span class="v">'+o.leads+'</span>'+
      '<span class="v">'+o.nClientes+'<small>'+(o.leads>0?pct1(o.nClientes/o.leads*100):'—')+'</small></span>'+
      '<span class="v">'+brl0(o.fat)+'<small>'+share+'</small></span></div>';
  }
  function listaE(itens){ return itens.length<2?itens.join(''):itens.slice(0,-1).join(', ')+' e '+itens[itens.length-1]; }
  function htmlOrigens(r){
    var h='<div class="dd-sub">Por origem do cliente</div>'+
      '<div class="tp-ori h"><span>Origem</span><span class="v">Leads</span><span class="v">Clientes</span><span class="v">Faturamento</span></div>'+
      linhaOrigem('Tráfego pago',r.porOrigem.trafego,r.faturamento)+linhaOrigem('Site',r.porOrigem.site,r.faturamento)+
      '<div class="tp-ori tot"><span class="n">Total</span><span class="v">'+r.nLeads+'</span><span class="v">'+r.nClientes+'</span><span class="v">'+brl0(r.faturamento)+'</span></div>';
    var v=r.variantes.map(function(o){return '<strong>'+esc(o)+'</strong>';});
    var quais=!v.length?'Nenhum cliente tem origem com "tráfego" no cadastro. Conta como tráfego':
      (v.length===1?'Contam como tráfego a origem '+v[0]:'Contam como tráfego as origens '+listaE(v)+' (lidas como uma só)')+',';
    return h+'<div class="dd-nota neutro">'+quais+' e <strong>Site</strong>, que é onde o formulário do anúncio cai.</div>';
  }

  /* ─── Funil dos leads do tráfego ───────────────────────────────── */
  function htmlFunil(r){
    var f=r.funil, c=f.contatos, maxV=Math.max(c,1);
    var etapas=[['Novos contatos',c,'#3b82f6'],['Conversas',f.conversas,'var(--accent)'],['Propostas apresentadas',f.propostas,'var(--warn)'],['Vendas fechadas',f.vendas,'var(--accent-deep)']];
    return '<div class="dd-sub">Funil dos leads do tráfego</div>'+etapas.map(function(e,i){
      var larg=e[1]>0?Math.max(2,Math.round(e[1]/maxV*100)):0;
      var pctC=c>0?Math.round(e[1]/c*100):0;
      return '<div class="tp-et"><div class="tp-et-l"><span>'+e[0]+'</span><span>'+e[1]+(i?' · '+pctC+'% dos contatos':'')+'</span></div>'+
        '<div class="hbar-track"><div class="hbar-fill" style="width:'+larg+'%;background:'+e[2]+';"></div></div></div>';
    }).join('')+'<button type="button" class="dd-link" id="db-tpAbrirCustos">Abrir Custos da Venda só com Tráfego pago</button>';
  }

  /* ─── Vendas de clientes sem origem ────────────────────────────── */
  function htmlSemOrigem(r){
    if(!r.semOrigem.n)return '';
    var n=r.semOrigem.n;
    return '<div class="dd-nota">'+(n===1?'1 venda do período ('+brl(r.semOrigem.valor)+') é de cliente <strong>sem origem</strong> no cadastro e ficou':
      n+' vendas do período ('+brl(r.semOrigem.valor)+') são de clientes <strong>sem origem</strong> no cadastro e ficaram')+
      ' fora desta conta. <button type="button" class="dd-link" id="db-tpVerSemOrigem">Ver quais são</button></div>';
  }

  /** Tudo de uma vez, pelo id do contêiner. */
  function html(r){
    return {kpis:htmlKpis(r),meses:htmlMeses(r),origens:htmlOrigens(r),funil:htmlFunil(r),semOrigem:htmlSemOrigem(r)};
  }

  var api={tipoOrigem:tipoOrigem,calcular:calcular,html:html,htmlKpis:htmlKpis,htmlMeses:htmlMeses,htmlOrigens:htmlOrigens,htmlFunil:htmlFunil,htmlSemOrigem:htmlSemOrigem};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.SGTrafegoDash=api;
})(typeof window!=='undefined'?window:null);
