// Aviso de agendamento ao técnico: quem recebe o quê, o texto e o link.
const assert=require('node:assert/strict');
const N=require('../js/notif-agendamento.js');

const hoje='2026-11-05';
const os=(extra)=>Object.assign({IdCliente:'c1',IdServico:'s1',NomeCliente:'Maria Souza',TecnicoResponsavel:'t1','Status Agendamento':'Agendado','Data Inicio':'2026-11-07','Hora inicio':'08:00','Hora Fim':'10:00'},extra||{});
const titulos=(r)=>r.map((x)=>x.titulo+'>'+x.para);

// criada com técnico: ele recebe Agendado
assert.deepEqual(titulos(N.decidir(null,os(),hoje)),['Agendado>t1']);
// criada sem técnico: ninguém
assert.deepEqual(N.decidir(null,os({TecnicoResponsavel:''}),hoje),[]);
// criada para hoje conta; para o passado (lançamento retroativo) não
assert.deepEqual(titulos(N.decidir(null,os({'Data Inicio':'2026-11-05'}),hoje)),['Agendado>t1']);
assert.deepEqual(N.decidir(null,os({'Data Inicio':'2026-11-04'}),hoje),[]);
// sem data: nada para avisar
assert.deepEqual(N.decidir(null,os({'Data Inicio':''}),hoje),[]);

// remarcada: dia, hora inicial ou hora final
assert.deepEqual(titulos(N.decidir(os(),os({'Data Inicio':'2026-11-08'}),hoje)),['Remarcado>t1']);
assert.deepEqual(titulos(N.decidir(os(),os({'Hora inicio':'09:00'}),hoje)),['Remarcado>t1']);
assert.deepEqual(titulos(N.decidir(os(),os({'Hora Fim':'11:00'}),hoje)),['Remarcado>t1']);
// data em dd/mm/aaaa no anterior e aaaa-mm-dd no novo é a mesma data
assert.deepEqual(N.decidir(os({'Data Inicio':'07/11/2026'}),os(),hoje),[]);
// remarcar para o passado não avisa
assert.deepEqual(N.decidir(os(),os({'Data Inicio':'2026-11-01'}),hoje),[]);

// serviço de vários dias: pôr, mudar ou tirar a data fim (e a hora fim do serviço) remarca
const dois=(extra)=>os(Object.assign({'Data Fim':'2026-11-08','Hora Fim Servico':'12:00'},extra||{}));
assert.deepEqual(titulos(N.decidir(os(),dois(),hoje)),['Remarcado>t1']);
assert.deepEqual(titulos(N.decidir(dois(),os(),hoje)),['Remarcado>t1']);
assert.deepEqual(titulos(N.decidir(dois(),dois({'Data Fim':'2026-11-09'}),hoje)),['Remarcado>t1']);
assert.deepEqual(titulos(N.decidir(dois(),dois({'Hora Fim Servico':'15:00'}),hoje)),['Remarcado>t1']);
assert.deepEqual(N.decidir(dois(),dois({Valor:500}),hoje),[]);
// OS que começou ontem e termina amanhã ainda avisa o técnico novo
assert.deepEqual(titulos(N.decidir(null,dois({'Data Inicio':'2026-11-04','Data Fim':'2026-11-06'}),hoje)),['Agendado>t1']);
assert.equal(N.corpo(dois(),'Maria Souza','Instalação'),'Maria Souza · Instalação · 07/11/2026 das 8h às 10h, até 08/11/2026 às 12h');

// edição que não muda data, hora, técnico nem status não avisa
assert.deepEqual(N.decidir(os(),os({Valor:900,'Observacao Comercial':'portão azul'}),hoje),[]);
assert.deepEqual(N.decidir(os(),os({'Status Agendamento':'Em Andamento'}),hoje),[]);

// técnico trocado: o antigo recebe Cancelado, o novo Agendado
assert.deepEqual(titulos(N.decidir(os(),os({TecnicoResponsavel:'t2'}),hoje)),['Cancelado>t1','Agendado>t2']);
// técnico trocado junto com a data: o novo recebe Agendado (não Remarcado)
assert.deepEqual(titulos(N.decidir(os(),os({TecnicoResponsavel:'t2','Data Inicio':'2026-11-09'}),hoje)),['Cancelado>t1','Agendado>t2']);
// técnico tirado: o antigo recebe Cancelado
assert.deepEqual(titulos(N.decidir(os(),os({TecnicoResponsavel:''}),hoje)),['Cancelado>t1']);
// técnico posto numa OS que não tinha: Agendado
assert.deepEqual(titulos(N.decidir(os({TecnicoResponsavel:''}),os(),hoje)),['Agendado>t1']);

// cancelada: o técnico recebe Cancelado, com ou sem acento no status, e só uma vez
assert.deepEqual(titulos(N.decidir(os(),os({'Status Agendamento':'Cancelado'}),hoje)),['Cancelado>t1']);
assert.deepEqual(titulos(N.decidir(os(),os({'Status Agendamento':'cancelado'}),hoje)),['Cancelado>t1']);
assert.deepEqual(N.decidir(os({'Status Agendamento':'Cancelado'}),os({'Status Agendamento':'Cancelado','Motivo Cancelamento':'x'}),hoje),[]);
// cancelada e reaberta: volta a ser Agendado
assert.deepEqual(titulos(N.decidir(os({'Status Agendamento':'Cancelado'}),os(),hoje)),['Agendado>t1']);
// excluída: Cancelado; excluir uma já cancelada ou concluída não avisa de novo
assert.deepEqual(titulos(N.decidir(os(),null,hoje)),['Cancelado>t1']);
assert.deepEqual(N.decidir(os({'Status Agendamento':'Cancelado'}),null,hoje),[]);
assert.deepEqual(N.decidir(os({'Status Agendamento':'Concluído'}),null,hoje),[]);
// concluída pelo técnico: não é cancelamento
assert.deepEqual(N.decidir(os(),os({'Status Agendamento':'Concluído'}),hoje),[]);
assert.deepEqual(N.decidir(os(),os({'Status Agendamento':'Concluido'}),hoje),[]);
// status vazio vale Agendado
assert.deepEqual(titulos(N.decidir(null,os({'Status Agendamento':''}),hoje)),['Agendado>t1']);

// texto: cliente, serviço, data e hora
assert.equal(N.corpo(os(),'Maria Souza','Instalação solar'),'Maria Souza · Instalação solar · 07/11/2026 das 8h às 10h');
assert.equal(N.corpo(os({'Hora Fim':''}),'Maria Souza','Visita'),'Maria Souza · Visita · 07/11/2026 às 8h');
assert.equal(N.corpo(os({'Hora inicio':'','Hora Fim':''}),'','' ),'Cliente · 07/11/2026');
assert.equal(N.corpo(os({'Hora inicio':'14:30','Hora Fim':'16:00'}),'Ana','Limpeza'),'Ana · Limpeza · 07/11/2026 das 14h30 às 16h');

// documento gravado: contrato de `notificacoes`, sem pushEnviadoEm
const dec=N.decidir(os(),os({TecnicoResponsavel:'t2'}),hoje);
const docs=N.montarDocs(dec,'ag1',{cliente:'',servico:'Instalação solar'},1762300000000);
assert.equal(docs.length,2);
assert.equal(docs[0].id,'agendamento:ag1:cancelado:1762300000000');
assert.equal(docs[1].id,'agendamento:ag1:agendado:1762300000000-1');
docs.forEach((d)=>{
  assert.deepEqual(Object.keys(d.doc).sort(),['corpo','criadoEmMs','para','tag','tipo','titulo','url']);
  assert.equal(d.doc.tipo,'agendamento');
  assert.equal(d.doc.tag,'agendamento-ag1');
  assert.equal(d.doc.criadoEmMs,1762300000000);
  assert.ok(!('pushEnviadoEm' in d.doc));
});
assert.deepEqual(docs[0].doc.para,['t1']);
assert.deepEqual(docs[1].doc.para,['t2']);
assert.equal(docs[0].doc.titulo,'Cancelado');
assert.equal(docs[1].doc.corpo,'Maria Souza · Instalação solar · 07/11/2026 das 8h às 10h');
// quem perdeu a OS não abre uma OS que já não é dele; o novo técnico abre
assert.equal(docs[0].doc.url,'indexdotecnico.html?notif='+encodeURIComponent(docs[0].id));
assert.equal(docs[1].doc.url,'indexdotecnico.html?agendamento=ag1&notif='+encodeURIComponent(docs[1].id));
// cancelada com o mesmo técnico: a OS continua na lista dele, o clique abre
const canc=N.montarDocs(N.decidir(os(),os({'Status Agendamento':'Cancelado'}),hoje),'ag1',{cliente:'',servico:''},1);
assert.ok(canc[0].doc.url.indexOf('agendamento=ag1')!==-1);
// excluída: abre só o app
const exc=N.montarDocs(N.decidir(os(),null,hoje),'ag1',{cliente:'',servico:''},1);
assert.ok(exc[0].doc.url.indexOf('agendamento=')===-1);
assert.equal(exc[0].doc.titulo,'Cancelado');

console.log('notif-agendamento: ok');
