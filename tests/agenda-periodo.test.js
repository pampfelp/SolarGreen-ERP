// Período que a OS ocupa na agenda do técnico: um dia ou vários (Data Fim).
const assert=require('node:assert/strict');
const P=require('../js/agenda-periodo.js');

const os=(extra)=>Object.assign({'Data Inicio':'2026-11-13','Hora inicio':'08:00','Hora Fim':'18:00'},extra||{});
const dois=(extra)=>os(Object.assign({'Data Fim':'2026-11-14','Hora Fim Servico':'12:00'},extra||{}));

// um dia: mesma regra de antes (sobreposição de horário no mesmo dia)
assert.equal(P.sobrepoe(os({'Hora inicio':'08:00','Hora Fim':'10:00'}),os({'Hora inicio':'10:00','Hora Fim':'12:00'})),false);
assert.equal(P.sobrepoe(os({'Hora inicio':'08:00','Hora Fim':'11:00'}),os({'Hora inicio':'10:00','Hora Fim':'12:00'})),true);
assert.equal(P.sobrepoe(os(),os({'Data Inicio':'2026-11-14'})),false);
// data em dd/mm/aaaa e aaaa-mm-dd é a mesma
assert.equal(P.sobrepoe(os({'Data Inicio':'13/11/2026'}),os()),true);

// vários dias: ocupa o técnico até Data Fim às Hora Fim Servico
assert.equal(P.sobrepoe(dois(),os({'Data Inicio':'2026-11-14','Hora inicio':'08:00','Hora Fim':'10:00'})),true);
assert.equal(P.sobrepoe(dois(),os({'Data Inicio':'2026-11-14','Hora inicio':'11:00','Hora Fim':'13:00'})),true);
// a partir da hora fim do serviço já pode
assert.equal(P.sobrepoe(dois(),os({'Data Inicio':'2026-11-14','Hora inicio':'12:00','Hora Fim':'14:00'})),false);
assert.equal(P.sobrepoe(dois(),os({'Data Inicio':'2026-11-15'})),false);
// a noite e o dia do meio também ficam ocupados
assert.equal(P.sobrepoe(dois({'Data Fim':'2026-11-16'}),os({'Data Inicio':'2026-11-15'})),true);
// o primeiro dia fica ocupado mesmo depois da Hora Fim
assert.equal(P.sobrepoe(dois({'Hora Fim':'10:00'}),os({'Hora inicio':'14:00','Hora Fim':'16:00'})),true);
// antes do início no primeiro dia ainda está livre
assert.equal(P.sobrepoe(dois({'Hora inicio':'13:00'}),os({'Hora inicio':'08:00','Hora Fim':'12:00'})),false);
// duas OS de vários dias que se cruzam
assert.equal(P.sobrepoe(dois(),dois({'Data Inicio':'2026-11-14','Hora inicio':'09:00','Data Fim':'2026-11-15'})),true);
// nova OS de vários dias que alcança uma OS já marcada no dia seguinte
assert.equal(P.sobrepoe(os({'Data Inicio':'2026-11-14','Hora inicio':'08:00','Hora Fim':'10:00'}),dois({'Hora Fim Servico':'09:00'})),true);
assert.equal(P.sobrepoe(os({'Data Inicio':'2026-11-14','Hora inicio':'09:00','Hora Fim':'10:00'}),dois({'Hora Fim Servico':'09:00'})),false);
// virada de mês
assert.equal(P.sobrepoe(dois({'Data Inicio':'2026-11-30','Data Fim':'2026-12-01'}),os({'Data Inicio':'2026-12-01','Hora inicio':'08:00','Hora Fim':'09:00'})),true);

// Data Fim igual ou antes do início é ignorada (vale como um dia)
assert.equal(P.variosDias(dois({'Data Fim':'2026-11-13'})),false);
assert.equal(P.variosDias(dois({'Data Fim':'2026-11-12'})),false);
assert.equal(P.sobrepoe(dois({'Data Fim':'2026-11-12'}),os({'Data Inicio':'2026-11-14'})),false);
// sem Hora Fim Servico: ocupa o último dia inteiro
assert.equal(P.sobrepoe(dois({'Hora Fim Servico':''}),os({'Data Inicio':'2026-11-14','Hora inicio':'17:00','Hora Fim':'18:00'})),true);
// sem hora: não entra na conta
assert.equal(P.intervalo(os({'Hora inicio':''})),null);

// filtro por dia: a OS aparece em todos os dias que ocupa
assert.equal(P.ocupaEntre(dois(),'2026-11-14','2026-11-14'),true);
assert.equal(P.ocupaEntre(dois(),'2026-11-15',''),false);
assert.equal(P.ocupaEntre(dois(),'','2026-11-12'),false);
assert.equal(P.ocupaEntre(os(),'2026-11-14','2026-11-14'),false);
assert.equal(P.ocupaEntre(os(),'',''),true);
assert.equal(P.ultimoDia(dois()),'2026-11-14');
assert.equal(P.ultimoDia(os({'Data Inicio':'13/11/2026'})),'2026-11-13');

// texto do horário
assert.equal(P.textoHorario(os()),'08:00 – 18:00');
assert.equal(P.textoHorario(dois()),'08:00 – 18:00 · até 14/11 às 12:00');
assert.equal(P.textoHorario(dois(),'–'),'08:00–18:00 · até 14/11 às 12:00');

console.log('agenda-periodo: ok');
