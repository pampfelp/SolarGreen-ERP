// Aviso ao vendedor quando o técnico conclui a OS: quem recebe, o texto e o link.
const assert=require('node:assert/strict');
const N=require('../js/notif-os-concluida.js');

const ag={IdAgendamento:'ag1',IdCliente:'c1',NomeCliente:'Maria Souza'};
const nomes={cliente:'Maria Souza',servico:'Limpeza de placas',tecnico:'João'};

// vai para o vendedor do cliente, com id fixo por OS (não repete)
const n=N.montarDoc(ag,'v1','t1',nomes,1763300000000);
assert.equal(n.id,'os_concluida:ag1');
assert.deepEqual(n.doc.para,['v1']);
assert.equal(n.doc.tipo,'os_concluida');
assert.equal(n.doc.titulo,'Serviço concluído');
assert.equal(n.doc.corpo,'Maria Souza · Limpeza de placas · por João');
assert.equal(n.doc.criadoEmMs,1763300000000);
// contrato de `notificacoes`: sem pushEnviadoEm, para o notifPush mandar
assert.deepEqual(Object.keys(n.doc).sort(),['corpo','criadoEmMs','para','tag','tipo','titulo','url']);
// o clique abre a OS no ERP (o service worker manda para o ERP o que não é indexdotecnico)
assert.equal(n.doc.url,'index.html?agendamento=ag1&notif='+encodeURIComponent('os_concluida:ag1'));
assert.ok(!/indexdotecnico/.test(n.doc.url));

// cliente sem vendedor: ninguém
assert.equal(N.montarDoc(ag,'','t1',nomes,1),null);
assert.equal(N.montarDoc(ag,undefined,'t1',nomes,1),null);
// o técnico é o próprio vendedor do cliente: não avisa a si mesmo
assert.equal(N.montarDoc(ag,'t1','t1',nomes,1),null);
// sem id da OS: nada
assert.equal(N.montarDoc({IdCliente:'c1'},'v1','t1',nomes,1),null);

// texto sem serviço nem técnico; sem nome cai no denormalizado e depois em "Cliente"
assert.equal(N.montarDoc(ag,'v1','t1',{cliente:'',servico:'',tecnico:''},1).doc.corpo,'Maria Souza');
assert.equal(N.montarDoc({IdAgendamento:'ag2'},'v1','t1',{},1).doc.corpo,'Cliente');

console.log('notif-os-concluida: ok');
