const test=require('node:test');
const assert=require('node:assert/strict');
const dia=require('../js/agendamentos-dia.js');
function os(inicio,fim,status='Agendado',extra={}){return {'Data Inicio':'2026-11-26','Hora inicio':inicio,'Hora Fim':fim,'Status Agendamento':status,...extra};}
function calcular(itens){return dia.calcular(itens,'2026-11-26',480,1080);}
test('sobreposições e intervalos adjacentes contam união e complemento',()=>{
  const r=calcular([os('08:00','10:00'),os('09:00','11:00'),os('11:00','12:00'),os('15:00','17:00')]);
  assert.deepEqual(r.ocupados,[{ini:480,fim:720},{ini:900,fim:1020}]);
  assert.deepEqual(r.livres,[{ini:720,fim:900},{ini:1020,fim:1080}]);
  assert.equal(r.minutosOcupados,360);assert.equal(r.minutosLivres,240);
});
test('cancelado permanece no histórico e concluído ocupa',()=>{
  const r=calcular([os('08:00','12:00','Cancelado'),os('09:00','10:00','Concluído'),os('10:00','11:00','Em Andamento')]);
  assert.equal(r.itens.length,3);assert.equal(r.minutosOcupados,120);assert.equal(r.minutosLivres,480);
});
test('horário ausente ou inválido impede falso livre; cancelado sem horário não bloqueia',()=>{
  for(const a of [os('','10:00'),os('25:00','26:00'),os('10:00','09:00'),os('08:70','12:00')]){
    const r=calcular([a]);assert.equal(r.calculado,false);assert.deepEqual(r.livres,[]);assert.equal(r.minutosLivres,null);
  }
  assert.equal(calcular([os('','','Cancelado')]).minutosLivres,600);
});
test('compromisso fora da jornada fica visível e KPI usa apenas interseção',()=>{
  const r=calcular([os('06:00','09:00'),os('17:00','22:00'),os('04:00','05:00')]);
  assert.equal(r.itens.length,3);assert.equal(r.minutosOcupados,120);assert.equal(r.minutosLivres,480);
});
test('ISO e BR mantêm dia local, sem aceitar data impossível',()=>{
  assert.equal(dia.dataISO('26/11/2026'),'2026-11-26');assert.equal(dia.dataISO('2026-11-26T00:00:00Z'),'2026-11-26');
  assert.equal(dia.dataISO('2026-02-30'),'');assert.equal(dia.dataISO('31/11/2026'),'');
  assert.equal(calcular([os('08:00','09:00','Agendado',{'Data Inicio':'26/11/2026'})]).minutosOcupados,60);
});
test('navegação local cruza mês, ano e ano bissexto',()=>{
  assert.equal(dia.deslocarDia('2026-12-31',1),'2027-01-01');assert.equal(dia.deslocarDia('2027-01-01',-1),'2026-12-31');
  assert.equal(dia.deslocarDia('2028-02-28',1),'2028-02-29');assert.equal(dia.deslocarDia('2026-11-30',1),'2026-12-01');
});
test('OS de vários dias ocupa primeiro dia, meio e último conforme regra de período',()=>{
  const a=os('16:00','18:00','Agendado',{'Data Inicio':'2026-11-25','Data Fim':'2026-11-27','Hora Fim Servico':'10:00'});
  assert.equal(dia.calcular([a],'2026-11-25',480,1080).minutosOcupados,120);
  assert.equal(calcular([a]).minutosOcupados,600);
  assert.equal(dia.calcular([a],'2026-11-27',480,1080).minutosOcupados,120);
  assert.equal(dia.calcular([a],'2026-11-28',480,1080).itens.length,0);
});
test('OS de vários dias sem hora final ocupa até o fim do último dia, conforme período',()=>{
  const a=os('16:00','18:00','Agendado',{'Data Inicio':'2026-11-25','Data Fim':'2026-11-27'});
  assert.equal(calcular([a]).calculado,true);assert.equal(calcular([a]).minutosOcupados,600);
  assert.equal(dia.calcular([a],'2026-11-27',480,1080).minutosOcupados,600);
  assert.equal(dia.calcular([a],'2026-11-28',480,1080).itens.length,0);
});
test('OS de vários dias com hora final presente e inválida não afirma disponibilidade',()=>{
  const a=os('16:00','18:00','Agendado',{'Data Inicio':'2026-11-25','Data Fim':'2026-11-27','Hora Fim Servico':'25:00'});
  assert.equal(calcular([a]).calculado,false);assert.equal(calcular([a]).livres.length,0);
});
test('técnico sem compromissos tem jornada inteira livre',()=>{
  assert.deepEqual(calcular([]).livres,[{ini:480,fim:1080}]);assert.equal(calcular([]).minutosLivres,600);
});
