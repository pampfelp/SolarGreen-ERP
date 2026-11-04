// Regra da confirmação de OS por WhatsApp: quando sai e qual texto.
const assert=require('node:assert/strict');
const C=require('../js/confirmacao-os.js');

const hoje='2026-11-03';
const os=(extra)=>Object.assign({'Status Agendamento':'Agendado','Data Inicio':'2026-11-05','Hora inicio':'08:00','Hora Fim':'10:00'},extra||{});

// criação futura sai; de hoje também
assert.equal(C.precisaConfirmar(null,os(),hoje),true);
assert.equal(C.precisaConfirmar(null,os({'Data Inicio':'2026-11-03'}),hoje),true);
// criação com data passada não sai
assert.equal(C.precisaConfirmar(null,os({'Data Inicio':'2026-11-02'}),hoje),false);
// sem data não sai
assert.equal(C.precisaConfirmar(null,os({'Data Inicio':''}),hoje),false);
// edição sem mudar data nem hora não sai (mesmo em OS antiga nunca confirmada)
assert.equal(C.precisaConfirmar(os(),os({Valor:500}),hoje),false);
// data em dd/mm/yyyy no anterior e yyyy-mm-dd no novo contam como a mesma data
assert.equal(C.precisaConfirmar(os({'Data Inicio':'05/11/2026'}),os(),hoje),false);
// remarcação sai: data, hora inicial ou hora final
assert.equal(C.precisaConfirmar(os(),os({'Data Inicio':'2026-11-06'}),hoje),true);
assert.equal(C.precisaConfirmar(os(),os({'Hora inicio':'09:00'}),hoje),true);
assert.equal(C.precisaConfirmar(os(),os({'Hora Fim':'11:00'}),hoje),true);
// remarcar para o passado não sai
assert.equal(C.precisaConfirmar(os(),os({'Data Inicio':'2026-11-01'}),hoje),false);
// cancelada e concluída não saem, com ou sem acento
assert.equal(C.precisaConfirmar(null,os({'Status Agendamento':'Cancelado'}),hoje),false);
assert.equal(C.precisaConfirmar(null,os({'Status Agendamento':'Concluído'}),hoje),false);
assert.equal(C.precisaConfirmar(os(),os({'Status Agendamento':'concluido','Data Inicio':'2026-11-09'}),hoje),false);
// Em Andamento sai
assert.equal(C.precisaConfirmar(null,os({'Status Agendamento':'Em Andamento'}),hoje),true);
// hoje como Date: 03/11 às 22h em Belém ainda é dia 03, mesmo sendo dia 04 em UTC
assert.equal(C.hojeBelem(new Date(Date.UTC(2026,10,4,1,0))),'2026-11-03');
assert.equal(C.precisaConfirmar(null,os({'Data Inicio':'2026-11-03'}),new Date(Date.UTC(2026,10,4,1,0))),true);

// formatarHora
assert.equal(C.formatarHora('08:00'),'8h');
assert.equal(C.formatarHora('08:30'),'8h30');
assert.equal(C.formatarHora('14:00'),'14h');
assert.equal(C.formatarHora('8:05'),'8h05');
assert.equal(C.formatarHora('08:00:00'),'8h');
assert.equal(C.formatarHora(''),'');
assert.equal(C.formatarHora('abc'),'');
assert.equal(C.formatarHora('25:00'),'');

// textos letra a letra
assert.equal(C.textoConfirmacao({nome:'MARIA SILVA',servico:'Limpeza',data:'2026-11-05',horaInicio:'08:00',horaFim:'10:30'}),
  'Tudo certo, Maria! Seu agendamento de limpeza foi confirmado e está marcado para o dia 05/11, das 8h às 10h30. Se precisar remarcar ou tiver qualquer dúvida, é só responder essa mensagem.');
assert.equal(C.textoConfirmacao({nome:'Maria',servico:'Limpeza',data:'05/11/2026',horaInicio:'',horaFim:'10:00'}),
  'Tudo certo, Maria! Seu agendamento de limpeza foi confirmado e está marcado para o dia 05/11. Se precisar remarcar ou tiver qualquer dúvida, é só responder essa mensagem.');
assert.equal(C.modeloConfirmacao({horaInicio:'08:00',horaFim:'10:00'}),'os_confirmacao');
assert.equal(C.modeloConfirmacao({horaInicio:'08:00',horaFim:''}),'os_confirmacao_dia');

console.log('confirmacao-os: ok');
