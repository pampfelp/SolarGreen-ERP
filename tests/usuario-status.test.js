// Status Aviso: trava de agendamento novo e de edição antiga para técnico; Ativo para o resto.
const assert=require('node:assert/strict');
const S=require('../js/usuario-status.js');

const tecAviso={IdVendedor:'T1',Tipo:'Técnico',Status:'Aviso'};
const tecAtivo={IdVendedor:'T2',Tipo:'Tecnico',Status:'Ativo'};
const vendAviso={IdVendedor:'V1',Tipo:'Vendedor',Status:'Aviso'};

// Aviso conta como Ativo; Inativo e vazio não
assert.equal(S.contaComoAtivo(vendAviso),true);
assert.equal(S.contaComoAtivo({Status:' ativo '}),true);
assert.equal(S.contaComoAtivo({Status:'Inativo'}),false);
assert.equal(S.contaComoAtivo({}),false);

// a trava só vale para técnico
assert.equal(S.tecnicoEmAviso(tecAviso),true);
assert.equal(S.tecnicoEmAviso(vendAviso),false);
assert.equal(S.tecnicoEmAviso(tecAtivo),false);

// prazo de 3 dias contado pela data da OS; hoje = 10/11/2026 às 15h
const hoje=new Date(2026,10,10,15,0);
assert.equal(S.osForaDoPrazoAviso('07/11/2026',hoje),false);
assert.equal(S.osForaDoPrazoAviso('2026-11-07',hoje),false);
assert.equal(S.osForaDoPrazoAviso('06/11/2026',hoje),true);
assert.equal(S.osForaDoPrazoAviso('2026-11-06',hoje),true);
assert.equal(S.osForaDoPrazoAviso('20/11/2026',hoje),false);
assert.equal(S.osForaDoPrazoAviso('',hoje),false);
// virada de mês
assert.equal(S.osForaDoPrazoAviso('29/10/2026',new Date(2026,10,1)),false);
assert.equal(S.osForaDoPrazoAviso('28/10/2026',new Date(2026,10,1)),true);

// edição no app do técnico
assert.equal(S.tecnicoPodeEditarOS(tecAviso,{'Data Inicio':'06/11/2026'},hoje),false);
assert.equal(S.tecnicoPodeEditarOS(tecAviso,{'Data Inicio':'09/11/2026'},hoje),true);
assert.equal(S.tecnicoPodeEditarOS(tecAtivo,{'Data Inicio':'01/01/2026'},hoje),true);

// agendamento novo: recusa criação e troca para ele; edição da OS dele passa
assert.equal(S.podeReceberAgendamento(tecAviso,'T1',null),false);
assert.equal(S.podeReceberAgendamento(tecAviso,'T1',{TecnicoResponsavel:'T2'}),false);
assert.equal(S.podeReceberAgendamento(tecAviso,'T1',{TecnicoResponsavel:'T1'}),true);
assert.equal(S.podeReceberAgendamento(tecAtivo,'T2',null),true);
assert.equal(S.podeReceberAgendamento(undefined,'X',null),true);

console.log('usuario-status: ok');
