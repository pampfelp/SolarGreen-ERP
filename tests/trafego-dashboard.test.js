// Seção Tráfego pago do Dashboard: números e HTML. Os dados abaixo reproduzem a maquete validada em 2026-10-21
// (SolarGreen-ERP Refatoração/maquetes/trafego-pago.html). Números fictícios, sem cliente real.
const assert=require('node:assert/strict');
const T=require('../js/trafego-dashboard.js');
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<0.005,(msg||'')+' esperado '+b+' veio '+a);
const tem=(h,trechos,onde)=>trechos.forEach(t=>assert.ok(h.includes(t),onde+' sem: '+t));

// ── Origem: qualquer grafia de tráfego, Site exato, vazio separado
assert.equal(T.tipoOrigem('Tráfego pago'),'trafego'); assert.equal(T.tipoOrigem('- tráfego'),'trafego');
assert.equal(T.tipoOrigem('TRAFEGO'),'trafego'); assert.equal(T.tipoOrigem(' Site '),'site');
assert.equal(T.tipoOrigem('site da prefeitura'),'outra'); assert.equal(T.tipoOrigem('indicação Bene'),'outra');
assert.equal(T.tipoOrigem(''),'sem'); assert.equal(T.tipoOrigem(null),'sem');

// ── Base da maquete (tests/trafego-dashboard.fixture.js)
const r=T.calcular(require('./trafego-dashboard.fixture.js').params);

near(r.investido,4450,'investido'); assert.equal(r.nLeads,211); assert.equal(r.nClientes,14); assert.equal(r.nVendas,18);
near(r.faturamento,45100,'faturamento'); near(r.cpl,4450/211,'cpl'); near(r.cac,4450/14,'cac'); near(r.retorno,45100/4450,'retorno');
assert.equal(r.porOrigem.trafego.leads,142); assert.equal(r.porOrigem.site.leads,69,'lead do site entra pela origem do próprio lead');
assert.equal(r.porOrigem.trafego.nClientes,9); assert.equal(r.porOrigem.site.nClientes,5);
near(r.porOrigem.trafego.fat,29700); near(r.porOrigem.site.fat,15400);
assert.deepEqual(r.semOrigem,{n:3,valor:7200});
assert.deepEqual(r.meses.map(m=>[m.mes,m.investido,m.fat]),[['2026-08',900,9800],['2026-09',1450,16400],['2026-10',2100,18900]]);
assert.deepEqual(r.variantes,['Tráfego pago','tráfego','Trafego pago','- tráfego'],'grafias sem repetir, na ordem em que aparecem');

const h=T.html(r);
tem(h.kpis,['R$ 4.450,00','>211<','R$ 21,09 por lead','>14<','6,6% dos leads','R$ 45.100,00','18 vendas desses clientes','R$ 317,86','10,1x','num pos'],'KPIs');
tem(h.meses,['ago/2026','set/2026','out/2026 (até dia 21)','retorno 10,9x','retorno 11,3x','retorno 9,0x','R$ 9.800','R$ 16.400','R$ 18.900','R$ 900','R$ 1.450','R$ 2.100',
  'class="tp-chart mob"','out (até 21)','>10,9x<','>16.400<','Valores em R$'],'Meses');
assert.ok(!h.meses.includes('últimos'),'3 meses não mostram aviso de corte');
tem(h.origens,['>142<','>69<','R$ 29.700','66%','R$ 15.400','34%','6,3%','7,2%','R$ 45.100','<strong>Tráfego pago</strong>, <strong>tráfego</strong>, <strong>Trafego pago</strong> e <strong>- tráfego</strong> (lidas como uma só)','<strong>Site</strong>'],'Origens');
tem(h.funil,['Novos contatos</span><span>211<','148 · 70% dos contatos','41 · 19% dos contatos','18 · 9% dos contatos','Abrir Custos da Venda só com Tráfego pago'],'Funil');
tem(h.semOrigem,['3 vendas do período (R$ 7.200,00) são de clientes <strong>sem origem</strong>','Ver quais são'],'Sem origem');

// ── Bordas
const zero=T.calcular({});
const hz=T.html(zero);
assert.ok(!JSON.stringify(hz).match(/NaN|undefined|Infinity/),'vazio não mostra NaN');
tem(hz.kpis,['R$ 0,00','sem lead no período','>—<'],'KPIs vazios'); assert.ok(hz.meses.includes('Nenhum investimento nem venda'));
assert.equal(hz.semOrigem,'','sem aviso quando não há venda sem origem');
assert.ok(hz.origens.includes('Nenhum cliente tem origem com "tráfego"'));
// Venda sem investimento: retorno "—", não infinito.
const semInv=T.calcular({vendas:[{idCliente:'a',valor:100,dateKey:'2026-10-01'}],origemDe:()=>'Site'});
assert.equal(semInv.retorno,null); assert.ok(T.htmlKpis(semInv).includes('>—<'));
assert.ok(T.htmlKpis(semInv).includes('1 venda desse cliente'));
// Retorno abaixo de 1 fica vermelho.
const prej=T.calcular({custos:[{valor:1000,categoria:'trafego_pago',dateKey:'2026-10-01'}],vendas:[{idCliente:'a',valor:500,dateKey:'2026-10-02'}],origemDe:()=>'tráfego'});
assert.ok(T.htmlKpis(prej).includes('num neg')); assert.ok(T.htmlKpis(prej).includes('0,5x'));
// Uma venda sem origem: singular.
assert.ok(T.htmlSemOrigem(T.calcular({vendas:[{idCliente:'z',valor:50,dateKey:'2026-10-01'}]})).includes('1 venda do período (R$ 50,00) é de cliente'));
// Mais de 6 meses: mostra os últimos 6 e avisa.
const longo=T.calcular({custos:['01','02','03','04','05','06','07','08'].map(m=>({valor:100,categoria:'trafego_pago',dateKey:'2026-'+m+'-10'})),ate:'2026-08-31'});
const hl=T.htmlMeses(longo);
assert.ok(hl.includes('últimos 6 meses')); assert.ok(!hl.includes('jan/2026')); assert.ok(hl.includes('mar/2026'));
assert.ok(!hl.includes('até dia'),'mês fechado não leva "até dia"');
// Origem com HTML é escapada.
assert.ok(T.htmlOrigens(T.calcular({origensCadastradas:['<b>tráfego</b>']})).includes('&lt;b&gt;tráfego&lt;/b&gt;'));
// Mês com só investimento (sem venda): barra de faturamento zerada, sem NaN.
const soInv=T.htmlMeses(T.calcular({custos:[{valor:500,categoria:'trafego_pago',dateKey:'2026-10-01'}]}));
assert.ok(!soInv.match(/NaN/)); assert.ok(soInv.includes('retorno 0,0x'));

console.log('trafego-dashboard: todos os testes passaram');
