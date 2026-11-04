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

// formatarValor: menos de 2 é gratuito; senão formato de cobrancaDinheiro_
assert.equal(C.formatarValor(0),'gratuito');
assert.equal(C.formatarValor(''),'gratuito');
assert.equal(C.formatarValor(undefined),'gratuito');
assert.equal(C.formatarValor(1.99),'gratuito');
assert.equal(C.formatarValor(2),'R$ 2,00');
assert.equal(C.formatarValor(150),'R$ 150,00');
assert.equal(C.formatarValor(1234.5),'R$ 1.234,50');
assert.equal(C.formatarValor('R$ 1.234,50'),'R$ 1.234,50');

// textos letra a letra
const base={nome:'MARIA SILVA',servico:'Limpeza',data:'2026-11-05',horaInicio:'08:00',horaFim:'10:30',tecnico:'João',valor:150,endereco:'Rua das Flores, 100, Marco'};
assert.equal(C.textoConfirmacao(base),
  'Tudo certo, Maria! Seu agendamento de limpeza foi confirmado e está marcado para o dia 05/11.\n\n* Horário: de 8h até 10h30\n* Técnico: João\n* Valor do serviço: R$ 150,00\n* Endereço do serviço: Rua das Flores, 100, Marco\n\nSe precisar remarcar ou tiver qualquer dúvida, é só responder essa mensagem.');
assert.equal(C.textoConfirmacao(Object.assign({},base,{nome:'Maria',data:'05/11/2026',horaInicio:'',valor:1234.5})),
  'Tudo certo, Maria! Seu agendamento de limpeza foi confirmado e está marcado para o dia 05/11.\n\n* Técnico: João\n* Valor do serviço: R$ 1.234,50\n* Endereço do serviço: Rua das Flores, 100, Marco\n\nSe precisar remarcar ou tiver qualquer dúvida, é só responder essa mensagem.');
// valor 0 e 1.99 viram gratuito; técnico e endereço vazios têm padrão
assert.ok(C.textoConfirmacao(Object.assign({},base,{valor:0})).includes('* Valor do serviço: gratuito\n'));
assert.ok(C.textoConfirmacao(Object.assign({},base,{valor:1.99})).includes('* Valor do serviço: gratuito\n'));
assert.ok(C.textoConfirmacao(Object.assign({},base,{tecnico:''})).includes('* Técnico: equipe Solar Green\n'));
assert.ok(C.textoConfirmacao(Object.assign({},base,{tecnico:undefined})).includes('* Técnico: equipe Solar Green\n'));
assert.ok(C.textoConfirmacao(Object.assign({},base,{endereco:'  '})).includes('* Endereço do serviço: -\n'));
// nenhum {{n}} sobra nem campo fica indefinido
assert.ok(!/\{\{|undefined/.test(C.textoConfirmacao({nome:'a'})));
assert.equal(C.modeloConfirmacao({horaInicio:'08:00',horaFim:'10:00'}),'os_confirmacao_v2');
assert.equal(C.modeloConfirmacao({horaInicio:'08:00',horaFim:''}),'os_confirmacao_v2_dia');

console.log('confirmacao-os: ok');
