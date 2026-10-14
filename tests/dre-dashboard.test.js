// Blocos financeiros do Dashboard: números e HTML. Valores de referência do instantâneo de 2026-09-01
// (analises/2026-09-diagnostico-financeiro), os mesmos do mockup validado em 2026-10-14.
const assert=require('node:assert/strict');
const D=require('../js/dre-dashboard.js');
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<0.005,(msg||'')+' esperado '+b+' veio '+a);

const custos=[
  ['execucao_servico',22033.35],['folha',11863.93],['beneficios',269.12],['retirada_socios',7354.75],['aluguel',5067.65],
  ['taxas_bancarias',4445.13],['limpeza',2760],['utilidades',2122.84],['software',1756.75],['transporte',1076.99],
  ['perdas',730.65],['comissoes',540],['marketing',360.32],['',340]
].map(([categoria,valor])=>({categoria,valor}));

// ── DRE: fecha com os números aprovados
const d=D.calcularDre(82318.22,custos);
near(d.porGrupo.cpv,22033.35,'cpv'); near(d.margemBruta,60284.87,'margem');
near(d.porGrupo.pessoal,12133.05,'pessoal'); near(d.porGrupo.comercial,900.32,'comercial');
near(d.porGrupo.administrativo,12784.23,'administrativo'); near(d.porGrupo.financeiro,4445.13,'financeiro');
near(d.porGrupo.perdas,730.65,'perdas'); near(d.semCategoria.valor,340,'sem categoria'); assert.equal(d.semCategoria.n,1);
near(d.resultadoAntes,28951.49,'antes'); near(d.retiradas,7354.75,'retiradas'); near(d.resultadoApos,21596.74,'apos');
// Invariante: resultado após retiradas = receita - todos os custos (é o "lucro operacional" do dashboard).
near(d.resultadoApos,d.receita-d.totalCustos,'invariante lucro');

const h=D.htmlDre(d,160);
for(const trecho of ['R$ 82.318,22','R$ 60.284,87','R$ 28.951,49','R$ 21.596,74','R$ 7.354,75','35,2%','26,2%','A revisar, sem categoria','Regime de caixa'])
  assert.ok(h.includes(trecho),'DRE sem: '+trecho);
assert.ok(!D.htmlDre(D.calcularDre(1000,[{categoria:'folha',valor:100}]),1).includes('A revisar, sem categoria'),'linha "a revisar" só aparece quando há sem categoria');
assert.ok(D.htmlDre(D.calcularDre(0,[]),0).includes('Nenhum dado'));
// Resultado negativo e receita zero não quebram nem dividem por zero.
const neg=D.calcularDre(100,[{categoria:'folha',valor:300}]); near(neg.resultadoApos,-200);
assert.ok(D.htmlDre(neg,1).includes('-R$ 200,00'));
assert.ok(D.htmlDre(D.calcularDre(0,[{categoria:'folha',valor:50}]),0).includes('—'));

// ── Categorias: total, percentual sobre as saídas e filtro por grupo
const ag=D.agruparPorCategoria(custos,'');
near(ag.total,60721.48,'total saídas'); assert.equal(ag.itens[0].id,'execucao_servico'); assert.equal(ag.nSemCategoria,1);
assert.equal(ag.itens.length,14);
assert.equal(D.agruparPorCategoria(custos,'administrativo').itens.length,5); // aluguel, limpeza, utilidades, software, transporte
assert.deepEqual(D.agruparPorCategoria(custos,'__sem__').itens.map(i=>i.id),['__sem__']);
assert.deepEqual(D.agruparPorCategoria(custos,'socios').itens.map(i=>i.id),['retirada_socios']);
near(D.agruparPorCategoria(custos,'socios').itens[0].pct,7354.75/60721.48*100,'pct é sobre o total, não sobre a seleção');
// ID de categoria desconhecido cai em "a revisar", nunca some (crença 32)
assert.equal(D.agruparPorCategoria([{categoria:'id_que_nao_existe',valor:10}],'').itens[0].id,'__sem__');
const hc=D.htmlCategorias(ag,'');
assert.ok(hc.chips.includes('A revisar (1)')&&hc.chips.includes('dd-chip on" data-grupo=""'));
assert.ok(hc.barras.includes('data-cat="execucao_servico"')&&hc.barras.includes('data-cat="__sem__"'));
assert.ok(hc.nota.includes('R$ 60.721,48'));
assert.ok(D.htmlCategorias(D.agruparPorCategoria(custos,'socios'),'socios').chips.includes('dd-chip on" data-grupo="socios"'));
assert.ok(D.htmlCategorias(D.agruparPorCategoria([],''),'').barras.includes('Nenhum custo'));

// ── Custo fixo (13 recorrentes ativos do instantâneo; categoria é texto livre)
const rec=[['Energia, internet, água e escritório',300],['Diarista / faxina',1040],['Software e sistemas',169.9],['Folha da equipe',1700],
  ['Software e sistemas',300],['Vale transporte e refeição',300],['Software e sistemas',99.9],['Software e sistemas',700],['Aluguel',2300],
  ['Folha da equipe',2000],['Pró-labore e retirada de sócio',5500],['Local',160],['Vale transporte e refeição',1160]]
  .map(([categoria,valor])=>({descricao:'',categoria,valor,status:'Ativo'}));
rec.push({descricao:'Antigo',categoria:'Aluguel',valor:999,status:'Inativo'});
const fx=D.calcularFixo(rec);
near(fx.total,15729.8,'fixo total'); near(fx.socios,5500,'fixo sócios'); near(fx.semSocios,10229.8,'fixo sem sócios');
assert.equal(fx.nAtivos,13); assert.equal(fx.nSemCategoria,1,'"Local" não é reconhecido: aparece como sem categoria');
const hf=D.htmlFixo(fx);
assert.ok(hf.total.includes('R$ 15.729,80')&&hf.total.includes('R$ 10.229,80')&&hf.total.includes('13 custo(s)'));
assert.ok(hf.barras.includes('Sem categoria reconhecida'));
assert.ok(D.htmlFixo(D.calcularFixo([])).barras.includes('Nenhum custo recorrente'));

// ── Produção
const ags=[];
for(let i=0;i<167;i++)ags.push({tecnico:'t1',status:'Concluído'}); for(let i=0;i<16;i++)ags.push({tecnico:'t1',status:'Cancelado'});
for(let i=0;i<89;i++)ags.push({tecnico:'t2',status:'Concluído'}); for(let i=0;i<52;i++)ags.push({tecnico:'t2',status:'Agendado'});
const pr=D.calcularProducao(ags);
assert.equal(pr.concluidos,256); assert.equal(pr.tecnicos[0].id,'t1'); assert.equal(pr.tecnicos[0].total,183);
near(pr.top2Pct,100,'top2'); assert.equal(pr.tecnicos[1].total,141);
const ht=D.htmlTecnicos(pr,id=>({t1:'Marcio Batista',t2:'Oziel Vanzeler'}[id]));
assert.ok(ht.includes('Marcio Batista')&&ht.includes('167')&&ht.includes('/ 183')&&ht.includes('63,1%'));
assert.ok(D.htmlTecnicos(D.calcularProducao([]),String).includes('Sem agendamentos'));
const pt=D.calcularProducao([{tecnico:'t1',servico:'s1',status:'Concluído'},{tecnico:'t1',servico:'s1',status:'Agendado'},{tecnico:'t2',servico:'s2',status:'Concluído'}]);
assert.deepEqual(pt.tipos.map(t=>[t.id,t.total,t.ok]),[['s1',2,1],['s2',1,1]]);
const hs=D.htmlTipos(pt,id=>({s1:'Vistoria de Diagnóstico',s2:'Plano Anual'}[id]));
assert.ok(hs.includes('Vistoria de Diagnóstico')&&hs.includes('data-servico="s1"')&&hs.includes('2 agendamento(s), 1 concluído(s)'));
assert.ok(D.htmlTipos(D.calcularProducao([]),String).includes('Sem agendamentos'));

// Motivos de perda: a mesma classificação da análise de setembro
assert.equal(D.classificarMotivo(''),'Sem motivo preenchido');
assert.equal(D.classificarMotivo('número errado'),'Contato / número errado');
assert.equal(D.classificarMotivo('já tem empresa'),'Já tem empresa / fechou com outra');
assert.equal(D.classificarMotivo('bloqueou o contato'),'Bloqueou / não responde');
assert.equal(D.classificarMotivo('sem condições financeiras'),'Sem condição financeira');
assert.equal(D.classificarMotivo('qualquer outra coisa'),'Outros');
const mo=D.agruparMotivos(['número errado','número errado','','sem interesse']);
assert.equal(mo.total,4); assert.equal(mo.itens[0].motivo,'Contato / número errado'); assert.equal(mo.itens[0].n,2);
assert.ok(D.htmlMotivos(mo).includes('4 lead(s) perdido(s)'));
assert.ok(D.htmlMotivos(D.agruparMotivos([])).includes('Nenhum lead perdido'));

// Texto vindo do banco entra escapado (nome de técnico, motivo, categoria)
assert.ok(!D.htmlTecnicos(D.calcularProducao([{tecnico:'x',status:'Concluído'}]),()=>'<img src=x onerror=1>').includes('<img'));
assert.ok(!D.htmlTipos(D.calcularProducao([{servico:'x',status:'Concluído'}]),()=>'<b>').includes('<b>'));

console.log('dre-dashboard: todos os testes passaram');
