/**
 * dre-dashboard.js — cálculo e HTML dos blocos financeiros do Dashboard (DRE de
 * caixa, gasto por categoria, custo fixo, produção). 2026-10-14.
 *
 * Tudo aqui é função pura sobre listas já filtradas pelo dashboard.js; o
 * dashboard.js só pega o resultado e põe no DOM. Assim os números (e o HTML) se
 * testam em Node, sem tela. Desenho validado no mockup de 2026-10-14.
 *
 * Regras da DRE (padrões propostos, o Felipe confirma):
 *   - caixa: só custo com status Pago (o filtro é feito pelo dashboard.js);
 *   - retirada e pró-labore de sócio ficam abaixo do resultado;
 *   - parcela de empréstimo entra inteira em despesas financeiras;
 *   - sem deduções da receita (regime tributário e alíquota não estão no sistema).
 */
(function(root){
  'use strict';

  var DRE=(root&&root.SGDre)||(typeof require!=='undefined'?require('./dre-categorias.js'):null);
  var GRUPOS_DRE=['cpv','pessoal','comercial','administrativo','financeiro','perdas']; // ordem das linhas; 'socios' fica abaixo do resultado
  var CURTO={cpv:'Custo dos serviços',pessoal:'Pessoal',comercial:'Comerciais',administrativo:'Administrativas',financeiro:'Financeiras',perdas:'Perdas',socios:'Sócios'};

  function esc(s){
    if(root&&root.SGUtil&&root.SGUtil.escapeHtml)return root.SGUtil.escapeHtml(s);
    return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
  }
  function arred(n,casas){ var f=Math.pow(10,casas); return Math.round(n*f)/f; }
  function fmtNum(n,casas){ return arred(n,casas).toLocaleString('pt-BR',{minimumFractionDigits:casas,maximumFractionDigits:casas}); }
  function brl(n){ n=arred(n||0,2); return (n<0?'-R$ ':'R$ ')+fmtNum(Math.abs(n),2); }
  function pct(v){ return (v==null||!isFinite(v))?'—':fmtNum(v,1)+'%'; }
  function pctDe(parte,base){ return base>0?parte/base*100:null; }
  function larg(p){ return p==null?0:Math.max(0,Math.min(100,Math.abs(p))); }
  function soma(lista,f){ return lista.reduce(function(s,x){return s+f(x);},0); }
  function norm(s){ return String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim(); }
  function curto(nome){ return String(nome).split(' (')[0]; }

  /* ─── DRE de caixa ─────────────────────────────────────────────── */

  /** custos: [{valor,categoria}], já só os pagos e com o rateio do escritório aplicado. */
  function calcularDre(receita,custos){
    var porGrupo={}, semCat={valor:0,n:0}, socios=0;
    GRUPOS_DRE.forEach(function(g){porGrupo[g]=0;});
    custos.forEach(function(c){
      var g=DRE.grupoDe(c.categoria);
      if(!g){ semCat.valor+=c.valor; semCat.n++; return; }
      if(g.id==='socios')socios+=c.valor; else porGrupo[g.id]+=c.valor;
    });
    var despesas=soma(GRUPOS_DRE.slice(1),function(g){return porGrupo[g];})+semCat.valor;
    var margemBruta=receita-porGrupo.cpv;
    var antes=margemBruta-despesas;
    return {receita:receita,porGrupo:porGrupo,semCategoria:semCat,margemBruta:margemBruta,
      resultadoAntes:antes,retiradas:socios,resultadoApos:antes-socios,totalCustos:soma(custos,function(c){return c.valor;})};
  }

  function nomeGrupo(id){ var g=DRE.GRUPOS.filter(function(x){return x.id===id;})[0]; return g?g.nome:id; }

  function linhaDre(cls,nome,valor,base){
    var p=pctDe(valor,base);
    return '<div class="dd-row '+cls+'"><div class="n">'+nome+'</div><div class="v">'+brl(valor)+'</div><div class="p">'+pct(p)+'</div><div class="b"><i style="width:'+larg(p)+'%"></i></div></div>';
  }
  function kpiDre(tag,valor,sub,cor){
    return '<div class="kpi"><div class="tag">'+tag+'</div><div class="num">'+valor+'</div><div class="sub">'+sub+'</div><div class="bar" style="'+(cor?'background:'+cor:'')+'"></div></div>';
  }

  function htmlDre(d,nVendas){
    if(!d.receita&&!d.totalCustos)return '<div class="chart-empty" style="height:80px;">Nenhum dado no período</div>';
    var r=d.receita, h='<div class="dd-kpis">'+
      kpiDre('Receita no período',brl(r),(nVendas||0)+' venda(s), sem o cliente "teste 1"')+
      kpiDre('Resultado antes das retiradas',brl(d.resultadoAntes),pct(pctDe(d.resultadoAntes,r))+' da receita')+
      kpiDre('Resultado após retiradas',brl(d.resultadoApos),pct(pctDe(d.resultadoApos,r))+' da receita','var(--info)')+
    '</div>';
    h+=linhaDre('rec','Receita (vendas faturadas)',r,r);
    h+=linhaDre('','(−) '+esc(nomeGrupo('cpv')),d.porGrupo.cpv,r);
    h+=linhaDre('tot','= Margem bruta',d.margemBruta,r);
    GRUPOS_DRE.slice(1).forEach(function(g){ h+=linhaDre('','(−) '+esc(nomeGrupo(g)),d.porGrupo[g],r); });
    if(d.semCategoria.n)h+=linhaDre('rev','(−) A revisar, sem categoria <span class="dd-peq">· '+d.semCategoria.n+' lançamento(s)</span>',d.semCategoria.valor,r);
    h+=linhaDre('tot','= Resultado antes das retiradas',d.resultadoAntes,r);
    h+=linhaDre('soc','(−) '+esc(nomeGrupo('socios')),d.retiradas,r);
    h+=linhaDre('tot','= Resultado após retiradas',d.resultadoApos,r);
    h+='<div class="dd-nota">Regime de caixa: entram os custos com status Pago, na data do custo. Impostos sobre a venda não aparecem porque o regime tributário e a alíquota ainda não estão no sistema. A parcela de empréstimo entra inteira em despesas financeiras, sem separar o juro.</div>';
    return h;
  }

  /* ─── Gasto por categoria ──────────────────────────────────────── */

  /** Agrupa por categoria. grupoSel: '' = todas, id de grupo, ou '__sem__'. Percentual é sobre o total de saídas. */
  function agruparPorCategoria(custos,grupoSel){
    var total=soma(custos,function(c){return c.valor;}), mapa={}, nSem=0;
    custos.forEach(function(c){
      var cat=DRE.ehCategoriaValida(c.categoria)?c.categoria:'';
      if(!cat)nSem++;
      var g=cat?DRE.grupoDe(cat):null;
      if(grupoSel==='__sem__'&&cat)return;
      if(grupoSel&&grupoSel!=='__sem__'&&(!g||g.id!==grupoSel))return;
      var k=cat||'__sem__';
      if(!mapa[k])mapa[k]={id:k,valor:0,n:0};
      mapa[k].valor+=c.valor; mapa[k].n++;
    });
    var itens=Object.keys(mapa).map(function(k){var o=mapa[k];o.pct=pctDe(o.valor,total);return o;})
      .sort(function(a,b){return b.valor-a.valor;});
    return {itens:itens,total:total,nSemCategoria:nSem};
  }

  function htmlCategorias(ag,grupoSel){
    var chips=[['','Todas']].concat(['cpv','pessoal','comercial','administrativo','financeiro','perdas','socios'].map(function(g){return [g,CURTO[g]];}));
    var h='<div class="dd-chips">'+chips.map(function(c){
      return '<button type="button" class="dd-chip'+((grupoSel||'')===c[0]?' on':'')+'" data-grupo="'+esc(c[0])+'">'+esc(c[1])+'</button>';
    }).join('')+'<button type="button" class="dd-chip rev'+(grupoSel==='__sem__'?' on':'')+'" data-grupo="__sem__">A revisar ('+ag.nSemCategoria+')</button></div>';
    var barras;
    if(!ag.itens.length){ barras='<div class="chart-empty" style="height:80px;">Nenhum custo nesta seleção</div>'; }
    else{
      var maxV=ag.itens[0].valor||1;
      barras=ag.itens.map(function(i){
        var sem=i.id==='__sem__', g=sem?null:DRE.grupoDe(i.id);
        var nome=sem?'A revisar, sem categoria':DRE.rotuloDe(i.id);
        var cls=sem?' w':(g&&g.id==='socios'?' s':'');
        return '<div class="dd-bar click" role="button" tabindex="0" data-cat="'+esc(i.id)+'" title="'+esc(nome)+'"><div class="l'+(sem?' w':'')+'">'+esc(curto(nome))+' <small>'+i.n+' lanç.</small></div>'+
          '<div class="t"><i class="'+cls.trim()+'" style="width:'+Math.max(1.5,i.valor/maxV*100).toFixed(1)+'%"></i></div>'+
          '<div class="r">'+brl(i.valor)+'<small>'+pct(i.pct)+'</small></div></div>';
      }).join('');
    }
    return {chips:h,barras:barras,nota:ag.itens.length?('Total de saídas no período: <b>'+brl(ag.total)+'</b>.'+notaTop3(ag)):''};
  }
  function notaTop3(ag){
    if(ag.itens.length<3)return '';
    var top=ag.itens.slice(0,3), p=pctDe(soma(top,function(i){return i.valor;}),ag.total);
    return ' As três maiores ('+top.map(function(i){return esc(i.id==='__sem__'?'a revisar':curto(DRE.rotuloDe(i.id)).toLowerCase());}).join(', ')+') somam <b>'+pct(p)+'</b> da seleção.';
  }

  /* ─── Custo fixo mensal comprometido ───────────────────────────── */

  /** recorrentes: [{descricao,categoria,valor,status}]. Só os de status Ativo. A categoria deles ainda é texto livre: classifica pelo mesmo vocabulário. */
  function calcularFixo(recorrentes){
    var ativos=recorrentes.filter(function(c){return norm(c.status)==='ativo'&&c.valor>0;});
    var mapa={};
    ativos.forEach(function(c){
      var cat=DRE.sugerir((c.descricao||'')+' '+(c.categoria||'')).categoria;
      var k=cat||'__sem__';
      if(!mapa[k])mapa[k]={id:k,valor:0,n:0};
      mapa[k].valor+=c.valor; mapa[k].n++;
    });
    var itens=Object.keys(mapa).map(function(k){return mapa[k];}).sort(function(a,b){return b.valor-a.valor;});
    var total=soma(itens,function(i){return i.valor;});
    var socios=mapa.retirada_socios?mapa.retirada_socios.valor:0;
    return {itens:itens,total:total,socios:socios,semSocios:total-socios,nAtivos:ativos.length,nSemCategoria:mapa.__sem__?mapa.__sem__.n:0};
  }

  function htmlFixo(fx){
    if(!fx.itens.length)return {barras:'<div class="chart-empty" style="height:80px;">Nenhum custo recorrente ativo</div>',total:''};
    var maxV=fx.itens[0].valor||1;
    var barras='<div class="dd-sub">Por categoria, por mês</div>'+fx.itens.map(function(i){
      var sem=i.id==='__sem__', nome=sem?'Sem categoria reconhecida':curto(DRE.rotuloDe(i.id));
      return '<div class="dd-bar fixo"><div class="l'+(sem?' w':'')+'" title="'+esc(nome)+'">'+esc(nome)+'</div><div class="t"><i class="'+(sem?'w':(i.id==='retirada_socios'?'s':''))+'" style="width:'+Math.max(1.5,i.valor/maxV*100).toFixed(1)+'%"></i></div><div class="r">'+brl(i.valor)+'</div></div>';
    }).join('');
    var total='<div class="dd-sub">Total comprometido por mês</div><div class="dd-grande">'+brl(fx.total)+'</div>'+
      '<div class="dd-texto">'+fx.nAtivos+' custo(s) recorrente(s) ativo(s).'+
      (fx.socios>0?' Sem os '+brl(fx.socios)+' de retirada de sócio, o piso mensal da operação é <b>'+brl(fx.semSocios)+'</b>.':'')+'</div>'+
      '<div class="dd-nota neutro">A categoria dos Custos Recorrentes ainda é texto livre, então este agrupamento é aproximado até esse campo virar lista fechada.</div>';
    return {barras:barras,total:total};
  }

  /* ─── Produção de serviços e comercial ─────────────────────────── */

  /** agendamentos: [{tecnico,servico,status}] já filtrados por período e serviço. */
  function calcularProducao(agendamentos){
    var mapa={}, tiposMapa={}, concl=0;
    agendamentos.forEach(function(a){
      var tp=a.servico||'__sem__';
      if(!tiposMapa[tp])tiposMapa[tp]={id:tp,ok:0,total:0};
      tiposMapa[tp].total++;
      if(norm(a.status).indexOf('conclu')===0)tiposMapa[tp].ok++;
      var t=a.tecnico||'__sem__';
      if(!mapa[t])mapa[t]={id:t,ok:0,total:0,canc:0};
      mapa[t].total++;
      var s=norm(a.status);
      if(s.indexOf('conclu')===0){mapa[t].ok++;concl++;}
      if(s.indexOf('cancel')===0)mapa[t].canc++;
    });
    var tecnicos=Object.keys(mapa).map(function(k){return mapa[k];}).filter(function(t){return t.total>0;})
      .sort(function(a,b){return b.ok-a.ok||b.total-a.total;});
    var top2=tecnicos.slice(0,2);
    var tipos=Object.keys(tiposMapa).map(function(k){return tiposMapa[k];}).sort(function(a,b){return b.total-a.total;});
    return {tecnicos:tecnicos,tipos:tipos,concluidos:concl,top2Pct:pctDe(soma(top2,function(t){return t.ok;}),concl)};
  }

  function htmlTecnicos(pr,nomeDe){
    if(!pr.tecnicos.length)return '<div class="dd-sub">Serviços concluídos por técnico</div><div class="chart-empty" style="height:80px;">Sem agendamentos no período</div>';
    var lista=pr.tecnicos.slice(0,6), maxV=Math.max(lista[0].ok,1);
    var h='<div class="dd-sub">Serviços concluídos por técnico</div>'+lista.map(function(t){
      var nome=t.id==='__sem__'?'Sem técnico':nomeDe(t.id);
      return '<div class="dd-bar sm"><div class="l" title="'+esc(nome)+'">'+esc(nome)+'</div><div class="t"><i class="d" style="width:'+Math.max(t.ok?3:0,t.ok/maxV*100).toFixed(1)+'%"></i></div><div class="r">'+t.ok+'<small>/ '+t.total+'</small></div></div>';
    }).join('');
    // Menor taxa de conclusão entre quem tem volume (20+ agendamentos); abaixo disso a taxa é ruído.
    var volume=pr.tecnicos.filter(function(t){return t.total>=20;}).sort(function(a,b){return a.ok/a.total-b.ok/b.total;})[0];
    var nota=pr.concluidos?('Os dois primeiros fazem '+pct(pr.top2Pct)+' dos '+pr.concluidos+' concluídos.'+
      (volume?' '+esc(nomeDe(volume.id))+' concluiu '+pct(pctDe(volume.ok,volume.total))+' do que agendou.':'')):'Nenhum serviço concluído no período.';
    return h+'<div class="dd-peq2">'+nota+'</div>';
  }

  /** Agendamentos por tipo de serviço (volume de trabalho; a receita por serviço já tem gráfico próprio acima). */
  function htmlTipos(pr,nomeDe){
    if(!pr.tipos.length)return '<div class="dd-sub">Agendamentos por tipo de serviço</div><div class="chart-empty" style="height:80px;">Sem agendamentos no período</div>';
    var lista=pr.tipos.slice(0,6), maxV=lista[0].total||1;
    return '<div class="dd-sub">Agendamentos por tipo de serviço</div>'+lista.map(function(t){
      var nome=t.id==='__sem__'?'Sem serviço':nomeDe(t.id);
      return '<div class="dd-bar sm click" role="button" tabindex="0" data-servico="'+(t.id==='__sem__'?'':esc(t.id))+'" title="'+esc(nome)+' · '+t.total+' agendamento(s), '+t.ok+' concluído(s)"><div class="l">'+esc(nome)+'</div><div class="t"><i style="width:'+Math.max(1.5,t.total/maxV*100).toFixed(1)+'%"></i></div><div class="r">'+t.total+'<small>· '+t.ok+' ok</small></div></div>';
    }).join('')+'<div class="dd-peq2">Clique numa barra para filtrar o dashboard por esse serviço.</div>';
  }

  // Agrupamento aproximado do texto livre de MotivoPerda (mesma regra da análise de setembro).
  function classificarMotivo(m){
    var s=String(m==null?'':m).toLowerCase();
    if(!s.trim())return 'Sem motivo preenchido';
    if(/errad|ddd|breves|fortaleza|n[ºo]\.?\s|contato err/.test(s))return 'Contato / número errado';
    if(/j[áa] tem|outra empresa|contratou|fechou com|presta servi|suporte de/.test(s))return 'Já tem empresa / fechou com outra';
    if(/sem interesse|n[ãa]o tem mas interesse|surtad/.test(s))return 'Sem interesse';
    if(/bloque|bloqui|n[ãa]o atende|n[ãa]o responde|n[ãa]o retorn|sem resposta|sem retorno|tentativa|visualiz|viaj/.test(s))return 'Bloqueou / não responde';
    if(/desqualific/.test(s))return 'Lead desqualificado';
    if(/lgpd|desconfian|processar|bene/.test(s))return 'Desconfiança / LGPD / benefício';
    if(/dinheiro|condi[çc][õo]es|limite|cart[ãa]o|pagar a taxa/.test(s))return 'Sem condição financeira';
    return 'Outros';
  }
  /** perdidos: lista de textos de MotivoPerda dos leads perdidos. */
  function agruparMotivos(perdidos){
    var mapa={};
    perdidos.forEach(function(m){var k=classificarMotivo(m);mapa[k]=(mapa[k]||0)+1;});
    return {itens:Object.keys(mapa).map(function(k){return {motivo:k,n:mapa[k]};}).sort(function(a,b){return b.n-a.n;}),total:perdidos.length};
  }
  function htmlMotivos(mo){
    if(!mo.total)return '<div class="dd-sub">Motivos de perda no funil</div><div class="chart-empty" style="height:80px;">Nenhum lead perdido no período</div>';
    var lista=mo.itens.slice(0,5), maxV=lista[0].n||1;
    return '<div class="dd-sub">Motivos de perda no funil</div>'+lista.map(function(i){
      return '<div class="dd-bar sm mot"><div class="l" title="'+esc(i.motivo)+'">'+esc(i.motivo)+'</div><div class="t"><i class="w" style="width:'+Math.max(3,i.n/maxV*100).toFixed(1)+'%"></i></div><div class="r">'+i.n+'</div></div>';
    }).join('')+'<div class="dd-peq2">'+mo.total+' lead(s) perdido(s) criados no período, agrupados a partir de texto livre; o agrupamento é aproximado.</div>';
  }

  var api={calcularDre:calcularDre,htmlDre:htmlDre,agruparPorCategoria:agruparPorCategoria,htmlCategorias:htmlCategorias,
    calcularFixo:calcularFixo,htmlFixo:htmlFixo,calcularProducao:calcularProducao,htmlTecnicos:htmlTecnicos,htmlTipos:htmlTipos,
    classificarMotivo:classificarMotivo,agruparMotivos:agruparMotivos,htmlMotivos:htmlMotivos,brl:brl,pct:pct};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.SGDreDash=api;
})(typeof window!=='undefined'?window:null);
