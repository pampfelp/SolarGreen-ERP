// Regra da sub-aba Cobrança: quais OS concluídas ainda não foram pagas, vínculo com vendas e KPIs.
const assert=require('node:assert/strict');
const R=require('../js/cobranca-regra.js');

const hoje=new Date(2026,9,30); // 30/10/2026, data local
const clientes=[{IdCliente:'c1','Vendedor Responsavel':'v1'},{IdCliente:'c2','Vendedor Responsavel':'v2'}];
const os=(id,extra)=>Object.assign({IdAgendamento:id,IdCliente:'c1',IdServico:'s1',Valor:400,'Status Agendamento':'Concluído','Data Inicio':'2026-10-05'},extra||{});
const venda=(id,valor,extra)=>Object.assign({IdVenda:id,IdCliente:'c1',IdServico:'s1',IdVendedor:'v1',DataVenda:'2026-10-10',Valor:valor},extra||{});
const rodar=(ags,vds)=>R.classificar({agendamentos:ags,vendas:vds||[],clientes:clientes,hoje:hoje});
const uma=(ags,vds)=>rodar(ags,vds)[0];

// OS que não está concluída é ignorada; o status ignora acento e caixa
assert.equal(rodar([os('a',{'Status Agendamento':'Agendado'}),os('b',{'Status Agendamento':'Cancelado'})]).length,0);
assert.equal(rodar([os('a',{'Status Agendamento':'concluido'})]).length,1);

// 0,01 é a marca de "não cobrar"; vazio, 0 e lixo são valor não definido
assert.equal(uma([os('a',{Valor:0.01})]).situacao,'sem_cobranca');
assert.equal(uma([os('a',{Valor:'0,01'})]).situacao,'sem_cobranca');
assert.equal(uma([os('a',{Valor:''})]).situacao,'sem_valor');
assert.equal(uma([os('a',{Valor:0})]).situacao,'sem_valor');
assert.equal(uma([os('a',{Valor:undefined})]).situacao,'sem_valor');
assert.equal(uma([os('a',{Valor:'abc'})]).situacao,'sem_valor');
assert.equal(uma([os('a',{Valor:'1.234,50'})]).valor,1234.5);

// Sem venda nenhuma: em aberto, com dias, data local e vendedor do cliente
let l=uma([os('a')]);
assert.equal(l.situacao,'em_aberto');
assert.equal(l.saldo,400);
assert.equal(l.pago,0);
assert.equal(l.dias,25);
assert.equal(l.idVendedorResp,'v1');

// Venda ligada com o valor exato quita
l=uma([os('a')],[venda('x',400,{OsVinculadas:['a']})]);
assert.equal(l.situacao,'quitada');
assert.equal(l.saldo,0);
assert.deepEqual(l.vendasLigadas,[{idVenda:'x',valorAplicado:400,automatico:false}]);

// 370 de 400: diferença a confirmar, saldo 30
l=uma([os('a')],[venda('x',370,{OsVinculadas:['a']})]);
assert.equal(l.situacao,'diferenca');
assert.equal(l.pago,370);
assert.equal(l.saldo,30);

// Ajuste Desconto quita; ajuste Parcial continua em aberto com saldo 30
const ajuste=tipo=>({Tipo:tipo,Valor:30,Por:'Admin',PorId:'v9',Em:'2026-10-20T12:00:00.000Z'});
l=uma([os('a',{CobrancaAjuste:ajuste('Desconto')})],[venda('x',370,{OsVinculadas:['a']})]);
assert.equal(l.situacao,'quitada');
assert.equal(l.ajuste.Tipo,'Desconto');
l=uma([os('a',{CobrancaAjuste:ajuste('Parcial')})],[venda('x',370,{OsVinculadas:['a']})]);
assert.equal(l.situacao,'em_aberto');
assert.equal(l.saldo,30);
assert.equal(l.ajuste.Tipo,'Parcial');

// Duas vendas parciais somam
l=uma([os('a')],[venda('x',150,{OsVinculadas:['a']}),venda('y',250,{OsVinculadas:['a']})]);
assert.equal(l.pago,400);
assert.equal(l.situacao,'quitada');

// Pago acima do valor: quitada, sem aviso
l=uma([os('a')],[venda('x',500,{OsVinculadas:['a']})]);
assert.equal(l.situacao,'quitada');
assert.equal(l.saldo,0);

// Venda do plano ligada a 2 OS quita as duas, mesmo valendo mais que cada uma
let ls=rodar([os('a'),os('b',{'Data Inicio':'05/11/2026'})],[venda('p',300,{OsVinculadas:['a','b']})]);
assert.deepEqual(ls.map(x=>x.situacao),['quitada','quitada']);
assert.equal(ls[0].pago,400);

// Vínculo automático: um cliente/serviço, uma OS e uma venda
l=uma([os('a')],[venda('x',400)]);
assert.equal(l.situacao,'quitada');
assert.deepEqual(l.vendasLigadas,[{idVenda:'x',valorAplicado:400,automatico:true}]);
// cliente ou serviço diferente não liga
assert.equal(uma([os('a')],[venda('x',400,{IdServico:'s2'})]).situacao,'em_aberto');
assert.equal(uma([os('a')],[venda('x',400,{IdCliente:'c2'})]).situacao,'em_aberto');

// 2 OS e 1 venda do mesmo cliente/serviço: não é único, as duas ficam a conferir
ls=rodar([os('a'),os('b')],[venda('x',400)]);
assert.deepEqual(ls.map(x=>x.situacao),['a_conferir','a_conferir']);
assert.deepEqual(ls[0].candidatas,['x']);
// 1 OS e 2 vendas: também a conferir
l=uma([os('a')],[venda('x',200),venda('y',200)]);
assert.equal(l.situacao,'a_conferir');
assert.deepEqual(l.candidatas,['x','y']);

// OS sem valor também disputa a venda (caso Marcos): nada liga sozinho
ls=rodar([os('a',{Valor:'','Data Inicio':'2026-05-11'}),os('b')],[venda('x',400)]);
assert.deepEqual(ls.map(x=>x.situacao),['sem_valor','a_conferir']);
assert.deepEqual(ls[0].candidatas,['x']);
assert.deepEqual(ls[1].candidatas,['x']);

// Venda com OsVinculadas vazio é decisão explícita: não entra no automático
l=uma([os('a')],[venda('x',400,{OsVinculadas:[]})]);
assert.equal(l.situacao,'em_aberto');
assert.deepEqual(l.vendasLigadas,[]);
assert.deepEqual(l.candidatas,[]);

// Venda explícita não vira candidata nem automática de outra OS
ls=rodar([os('a'),os('b')],[venda('x',400,{OsVinculadas:['a']})]);
assert.equal(ls[0].situacao,'quitada');
assert.equal(ls[1].situacao,'em_aberto');

// Mesmo dia local nos dois formatos de data
assert.equal(R.parseData('2026-10-05').getTime(),R.parseData('05/10/2026').getTime());
assert.equal(R.parseData('2026-10-05').getDate(),5);
assert.equal(uma([os('a',{'Data Inicio':'05/10/2026'})]).dias,25);

// Valor não definido recebe candidatas: mesmo cliente, mesmo serviço primeiro
l=uma([os('a',{Valor:''})],[venda('x',100,{IdServico:'s2',DataVenda:'2026-09-01'}),venda('y',200,{DataVenda:'2026-10-02'}),venda('z',300,{IdCliente:'c2'}),venda('w',50,{OsVinculadas:[]})]);
assert.equal(l.situacao,'sem_valor');
assert.deepEqual(l.candidatas,['y','x']);

// Resumo para os KPIs
const desconto={Tipo:'Desconto',Valor:50};
const linhas=rodar(
  [os('a'),os('b'),os('c'),os('d',{Valor:''}),os('e',{Valor:0.01}),os('f'),os('g',{CobrancaAjuste:desconto}),os('h',{CobrancaAjuste:desconto})],
  [venda('x',370,{OsVinculadas:['b']}),venda('y',400,{OsVinculadas:['c']}),venda('z',80,{OsVinculadas:[]}),
   venda('w',350,{OsVinculadas:['g']}),venda('k',400,{OsVinculadas:['h']})]
);
const r=R.resumo(linhas);
assert.deepEqual(r.emAberto,{valor:830,qtd:3}); // a (400) + f (400) + b (30)
assert.deepEqual(r.diferencas,{valor:30,qtd:1});
assert.deepEqual(r.quitado,{valor:1150,qtd:3}); // c (400) + g (350) + h (400)
// g fica com 50 de desconto; h tinha desconto gravado, mas uma venda depois cobriu tudo
assert.deepEqual(r.desconto,{valor:50,qtd:1});

// Os KPIs seguem a situação: a tela passa só as linhas do grupo escolhido
const doGrupo=g=>linhas.filter(x=>R.GRUPOS[g].indexOf(x.situacao)!==-1);
assert.deepEqual(doGrupo('pendentes').map(x=>x.idAgendamento),['a','b','f']);
assert.deepEqual(doGrupo('concluidos').map(x=>x.idAgendamento),['c','g','h']);
assert.deepEqual(doGrupo('sem_valor').map(x=>x.idAgendamento),['d']);
assert.deepEqual(R.resumo(doGrupo('pendentes')).quitado,{valor:0,qtd:0});
assert.deepEqual(R.resumo(doGrupo('concluidos')).emAberto,{valor:0,qtd:0});

console.log('cobranca-regra: ok');
