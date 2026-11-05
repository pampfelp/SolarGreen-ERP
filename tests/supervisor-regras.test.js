// Supervisor de vendas: hora de Belém, etapas fora, pergunta de 1h30 e lote das
// 17h30, lembretes 9h/13h/16h, cor do prazo com a Tentativa, fila de 25 dividida
// entre etapas, validade dos avisos, mensagens por etapa e a cópia no Apps Script.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const R=require('../js/supervisor-regras.js');
const M=require('../js/supervisor-mensagens.js');

const B=(a,m,d,h,mi)=>R.msBelem(a,m,d,h,mi);   // hora de Belém
const MIN=60000, HORA=60*MIN, DIA=24*HORA;
// 05/11/2026 é quinta; 06 sexta; 07 sábado; 09 segunda.

// ── Hora de Belém ──
assert.equal(B(2026,11,5,9,0),Date.UTC(2026,10,5,12,0));
assert.deepEqual(R.partes(Date.UTC(2026,10,6,2,30)),{ano:2026,mes:11,dia:5,hora:23,minuto:30,semana:4});
assert.equal(R.chaveDia(Date.UTC(2026,10,6,2,30)),'2026-11-05');
assert.equal(R.inicioDoDia(B(2026,11,5,15,40)),B(2026,11,5,0,0));
assert.equal(R.ehDiaUtil(B(2026,11,6,10)),true);
assert.equal(R.ehDiaUtil(B(2026,11,7,10)),false);
assert.equal(R.ehDiaUtil(B(2026,11,8,10)),false);
assert.equal(R.diasEntre(B(2026,11,4,23,50),B(2026,11,5,0,10)),1);
assert.equal(R.dataTextoMs('2026-11-05'),B(2026,11,5));
assert.equal(R.dataTextoMs('05/11/2026'),B(2026,11,5));
assert.equal(R.dataTextoMs(''),null);

// ── Campos de data e hora ──
assert.equal(R.msDosCampos('2026-11-05','14:30'),B(2026,11,5,14,30));
assert.equal(R.msDosCampos('2026-11-05',''),null);
assert.equal(R.msDosCampos('','14:30'),null);
assert.equal(R.msDosCampos('2026-11-05','25:00'),null);
assert.deepEqual(R.camposDoMs(B(2026,11,5,8,5)),{data:'2026-11-05',hora:'08:05'});
assert.deepEqual(R.camposDoMs(null),{data:'',hora:''});
assert.equal(R.textoDataHora(B(2026,11,5,8,5)),'05/11/2026 às 08:05');
assert.equal(R.erroDaData(null,B(2026,11,5,9)),'Informe a data e a hora do próximo contato.');
assert.match(R.erroDaData(B(2026,11,5,8),B(2026,11,5,9)),/daqui para a frente/);
assert.equal(R.erroDaData(B(2026,11,5,9),B(2026,11,5,9)),'');

// ── Pergunta: 1h30 depois, teto 17h30, fim de semana e noite vão para o próximo dia útil ──
assert.equal(R.horarioDaPergunta(B(2026,11,5,10,0)),B(2026,11,5,11,30));
assert.equal(R.horarioDaPergunta(B(2026,11,5,16,0)),B(2026,11,5,17,30));   // cairia 17h30 em ponto
assert.equal(R.horarioDaPergunta(B(2026,11,5,16,30)),B(2026,11,5,17,30));  // cairia 18h
assert.equal(R.horarioDaPergunta(B(2026,11,5,17,30)),B(2026,11,6,17,30));  // clique às 17h30
assert.equal(R.horarioDaPergunta(B(2026,11,5,21,0)),B(2026,11,6,17,30));
assert.equal(R.horarioDaPergunta(B(2026,11,6,18,0)),B(2026,11,9,17,30));   // sexta à noite -> segunda
assert.equal(R.horarioDaPergunta(B(2026,11,7,10,0)),B(2026,11,9,17,30));   // sábado
assert.equal(R.horarioDaPergunta(B(2026,11,8,23,59)),B(2026,11,9,17,30));  // domingo
assert.equal(R.horarioDaPergunta(B(2026,11,9,0,30)),B(2026,11,9,2,0));     // madrugada de dia útil: 1h30 depois

// ── Lembrete: 9h, 13h, 16h, seg a sex, com 1 h de folga ──
assert.equal(R.horarioDoLembrete(B(2026,11,5,8,59)),null);
assert.equal(R.horarioDoLembrete(B(2026,11,5,9,0)).chave,'2026-11-05-9');
assert.equal(R.horarioDoLembrete(B(2026,11,5,9,59)).chave,'2026-11-05-9');
assert.equal(R.horarioDoLembrete(B(2026,11,5,10,0)),null);
assert.equal(R.horarioDoLembrete(B(2026,11,5,13,14)).hora,13);
assert.equal(R.horarioDoLembrete(B(2026,11,5,16,45)).hora,16);
assert.equal(R.horarioDoLembrete(B(2026,11,7,9,5)),null);   // sábado

// ── Pipelines e etapas fora ──
const etapas=[
  {Nome:'Novo Lead',Papel:'',Ordem:1},
  {Nome:'Tentativa de Contato',Papel:'',Ordem:2,DiasAmarelo:2,DiasVermelho:4},
  {Nome:'Retomar Contato',Papel:'',Ordem:3,DiasAmarelo:1,DiasVermelho:3},
  {Nome:'Gerar Proposta',Papel:'',Ordem:4,DiasAmarelo:'',DiasVermelho:2},
  {Nome:'Negociação',Papel:'proposta',Ordem:5,DiasAmarelo:3,DiasVermelho:7},
  {Nome:'Serviço Agendado',Papel:'proposta',Ordem:6,DiasVermelho:1},
  {Nome:'Ganho',Papel:'ganho',Ordem:7,DiasVermelho:1},
  {Nome:'Perdido',Papel:'perdido',Ordem:8,DiasVermelho:1},
  {Nome:'Desistiu',Papel:'perdido',Ordem:9,DiasVermelho:1}
];
const PIPES=[
  {IdPipeline:'adm',Nome:'Administrativo',Ordem:2,Etapas:[{Nome:'A fazer',Papel:'',DiasVermelho:1}]},
  {IdPipeline:'com',Nome:'Comercial',Ordem:1,Etapas:etapas},
  {IdPipeline:'exp',Nome:'Expansão',Ordem:3,Etapas:[{Nome:'Novo Lead',Papel:''},{Nome:'Reunião Agendada',Papel:''}]}
];
assert.equal(R.pipelineDoSupervisor(PIPES),'com');
assert.equal(R.pipelineDoSupervisor([PIPES[2]]),'exp');    // sem Comercial: o que tem Novo Lead
assert.equal(R.pipelineDoSupervisor([PIPES[0]]),'');
assert.equal(R.idPipelineDoLead('',PIPES),'com');           // card antigo sem Pipeline
['Tentativa de Contato','Retomar Contato','Gerar Proposta','Negociação'].forEach(e=>assert.equal(R.etapaNoSupervisor(e,'com',PIPES),true,e));
['Novo Lead','Serviço Agendado','Servico agendado','Ganho','Perdido','Desistiu',''].forEach(e=>assert.equal(R.etapaNoSupervisor(e,'com',PIPES),false,e));
assert.equal(R.etapaNoSupervisor('A fazer','adm',PIPES),false);
assert.equal(R.etapaNoSupervisor('Reunião Agendada','exp',PIPES),false);
assert.equal(R.etapaNoSupervisor('Tentativa de Contato','',PIPES),true);

// ── Cor do prazo: Tentativa zera só a bolinha ──
const agora=B(2026,11,5,9,30);
const lead=(o)=>Object.assign({id:'L',etapa:'Tentativa de Contato',pipeline:'com',idVendedor:'v1',transicoes:[],atividades:[],criadoMs:B(2026,10,1),proximoContatoEm:null},o);
const entrou=(etapa,ms)=>({Etapa:etapa,Em:new Date(ms).toISOString()});
const ativ=(tipo,ms)=>({Tipo:tipo,Em:new Date(ms).toISOString(),Observacao:''});

let l=lead({transicoes:[entrou('Tentativa de Contato',B(2026,10,30,10))]});
assert.equal(R.dataProcessoMs(l),B(2026,10,30,10));
assert.equal(R.situacaoDoLead(l,PIPES,agora).cor,'red');      // 6 dias, vermelho em 4
assert.equal(R.situacaoDoLead(l,PIPES,agora).atraso,2);
l=lead({transicoes:[entrou('Tentativa de Contato',B(2026,10,30,10))],atividades:[ativ('Tentativa de Contato',B(2026,11,4,15))]});
assert.equal(R.dataProcessoMs(l),B(2026,10,30,10));           // data da etapa não muda
assert.equal(R.situacaoDoLead(l,PIPES,agora).cor,'green');    // bolinha conta da tentativa
l=lead({transicoes:[entrou('Tentativa de Contato',B(2026,10,30,10))],atividades:[ativ('Ligação',B(2026,11,2,15))]});
assert.equal(R.dataProcessoMs(l),B(2026,11,2,15));            // conversa continua movendo a data
assert.equal(R.situacaoDoLead(l,PIPES,agora).cor,'yellow');
assert.equal(R.situacaoDoLead(lead({}),PIPES,agora).cor,'red');               // sem transição: conta da criação
assert.equal(R.situacaoDoLead(lead({etapa:'Gerar Proposta',transicoes:[entrou('Gerar Proposta',B(2026,11,4))]}),PIPES,agora).cor,'green');
assert.equal(R.corDoPrazo(0,{DiasAmarelo:0,DiasVermelho:''}),'yellow');
assert.equal(R.corDoPrazo(99,{DiasAmarelo:'',DiasVermelho:''}),'green');
assert.equal(R.corDoPrazo(99,null),'green');

// ── Data do próximo contato ──
assert.equal(R.temDataValida(B(2026,11,5,8,0),agora),true);   // hoje, mesmo já passada a hora
assert.equal(R.temDataValida(B(2026,11,4,17,0),agora),false); // ontem: vale como sem data
assert.equal(R.temDataValida(null,agora),false);
assert.equal(R.contatoNaHora(lead({proximoContatoEm:B(2026,11,5,9,40)}),PIPES,agora,15*MIN),true);
assert.equal(R.contatoNaHora(lead({proximoContatoEm:B(2026,11,5,9,50)}),PIPES,agora,15*MIN),false);
assert.equal(R.contatoNaHora(lead({proximoContatoEm:B(2026,11,4,9,0)}),PIPES,agora,15*MIN),false);
assert.equal(R.contatoNaHora(lead({etapa:'Perdido',proximoContatoEm:B(2026,11,5,9,0)}),PIPES,agora,0),false);

// ── Fila: até 25 por vendedor ativo, dividida entre etapas, o mais vermelho primeiro ──
function vermelhos(v,etapa,n,diasBase,prefixo){
  return Array.from({length:n},(_,i)=>lead({id:prefixo+String(i).padStart(2,'0'),idVendedor:v,etapa:etapa,
    transicoes:[entrou(etapa,agora-(diasBase+i)*DIA)]}));
}
const base=[].concat(
  vermelhos('v1','Tentativa de Contato',30,5,'t'),  // atraso 1..30
  vermelhos('v1','Negociação',3,8,'n'),             // atraso 1..3
  vermelhos('v1','Gerar Proposta',2,40,'g'),        // atraso 38..39, o mais vermelho de todos
  vermelhos('v2','Retomar Contato',4,3,'r'),
  vermelhos('inativo','Tentativa de Contato',5,5,'x'),
  [lead({id:'comdata',idVendedor:'v1',transicoes:[entrou('Tentativa de Contato',agora-20*DIA)],proximoContatoEm:B(2026,11,6,10)})],
  [lead({id:'datavelha',idVendedor:'v1',transicoes:[entrou('Tentativa de Contato',agora-60*DIA)],proximoContatoEm:B(2026,11,3,10)})],
  [lead({id:'agendado',idVendedor:'v1',etapa:'Serviço Agendado',transicoes:[entrou('Serviço Agendado',agora-60*DIA)]})],
  [lead({id:'verde',idVendedor:'v1',transicoes:[entrou('Tentativa de Contato',agora-60*DIA)],atividades:[ativ('Tentativa de Contato',agora-HORA)]})]
);
const fila=R.montarFila(base,PIPES,['v1','v2'],agora,25);
assert.deepEqual(Object.keys(fila).sort(),['v1','v2']);
assert.equal(fila.v1.length,25);
// rodada 1: Tentativa (datavelha, atraso 56), Gerar Proposta (39), Negociação (3); rodada 2 idem.
assert.deepEqual(fila.v1.slice(0,6),['datavelha','g01','n02','t29','g00','n01']);
assert.ok(fila.v1.indexOf('n02')!==-1&&fila.v1.indexOf('n00')!==-1);  // as 3 da Negociação entram
assert.ok(fila.v1.indexOf('g00')!==-1);
assert.equal(fila.v1.indexOf('comdata'),-1);
assert.equal(fila.v1.indexOf('agendado'),-1);
assert.equal(fila.v1.indexOf('verde'),-1);
assert.equal(fila.v1.filter(id=>id[0]==='t'||id==='datavelha').length,20);   // o resto da cota vai para a Tentativa
assert.deepEqual(fila.v2,['r03','r02','r01','r00']);  // r00: 3 dias, vermelho a partir de 3
assert.equal(R.montarFila(base,PIPES,['v1'],agora,3).v1.length,3);
const comPergunta=base.map(x=>x.id==='datavelha'?Object.assign({},x,{avisoId:'supervisor_pergunta:datavelha:1'}):x);
assert.equal(R.montarFila(comPergunta,PIPES,['v1'],agora).v1.indexOf('datavelha'),-1);   // pergunta pendente já pede a data
assert.equal(R.perguntaPendente(lead({avisoId:'supervisor_lembrete:L:2026-11-05-9'}),PIPES,agora),false);
assert.deepEqual(R.montarFila([],PIPES,['v1'],agora),{});

// ── Avisos: id, validade e texto ──
const T=R.TIPOS_AVISO;
assert.equal(R.idAviso(T.contato,'ab12cd34',1762344000000),'supervisor_contato:ab12cd34:1762344000000');
assert.deepEqual(R.lerIdAviso('supervisor_lembrete:ab12cd34:2026-11-05-9'),{tipo:'supervisor_lembrete',idLead:'ab12cd34',chave:'2026-11-05-9'});
assert.equal(R.lerIdAviso('cobranca:x'),null);
const marcado=B(2026,11,5,9,0);
const lc=lead({transicoes:[entrou('Tentativa de Contato',agora-DIA)],proximoContatoEm:marcado});
assert.equal(R.avisoAindaVale(R.idAviso(T.contato,'L',marcado),lc,PIPES,agora),true);
assert.equal(R.avisoAindaVale(R.idAviso(T.contato,'L',marcado-HORA),lc,PIPES,agora),false);           // remarcado
assert.equal(R.avisoAindaVale(R.idAviso(T.contato,'L',marcado),Object.assign({},lc,{etapa:'Ganho'}),PIPES,agora),false);
assert.equal(R.avisoAindaVale(R.idAviso(T.pergunta,'L',1),Object.assign({},lc,{proximoContatoEm:null}),PIPES,agora),true);
assert.equal(R.avisoAindaVale(R.idAviso(T.pergunta,'L',1),lc,PIPES,agora),false);                     // já marcou a data
const lv=lead({transicoes:[entrou('Tentativa de Contato',agora-10*DIA)]});
assert.equal(R.avisoAindaVale(R.idAviso(T.lembrete,'L','2026-11-05-9'),lv,PIPES,agora),true);
assert.equal(R.avisoAindaVale(R.idAviso(T.lembrete,'L','2026-11-04-16'),lv,PIPES,agora),false);       // de ontem
assert.equal(R.avisoAindaVale(R.idAviso(T.lembrete,'L','2026-11-05-9'),Object.assign({},lv,{atividades:[ativ('Tentativa de Contato',agora-MIN)]}),PIPES,agora),false); // enviou
assert.equal(R.avisoAindaVale(R.idAviso(T.lembrete,'L','2026-11-05-9'),Object.assign({},lv,{proximoContatoEm:B(2026,11,6,9)}),PIPES,agora),false); // pôs data
assert.equal(R.avisoAindaVale(R.idAviso(T.lembrete,'L','2026-11-05-9'),null,PIPES,agora),false);       // lead excluído
assert.deepEqual(R.textoDoAviso(T.contato,{nome:'MARIA DA SILVA',etapa:'Negociação',temTelefone:true}),
  {titulo:'Falar com Maria hoje',corpo:'Negociação. A mensagem da etapa está pronta para enviar.'});
assert.match(R.textoDoAviso(T.contato,{nome:'Maria',etapa:'Negociação',temTelefone:false}).corpo,/sem telefone/);
assert.match(R.textoDoAviso(T.lembrete,{nome:'Maria',etapa:'Negociação',temTelefone:true,atrasoDias:1}).corpo,/há 1 dia\./);
assert.equal(R.textoDoAviso(T.pergunta,{nome:'Maria'}).titulo,'Qual a próxima data para falar com Maria?');
// Telefones montados por pedaços (nada de número real no repositório).
const FIM='8888'+'1000';
assert.equal(R.telefoneWa('(91) 9'+FIM.slice(0,4)+'-'+FIM.slice(4)),'55919'+FIM);
assert.equal(R.telefoneWa('91'+FIM),'55919'+FIM);   // celular sem o nono dígito
assert.equal(R.telefoneWa(''),'');

// ── Mensagens por etapa: um lugar só, rascunho marcado, sem preço/prazo/emoji ──
assert.equal(M.APROVADO,false);
['Tentativa de Contato','Retomar Contato','Gerar Proposta','Negociação'].forEach(e=>assert.ok(M.POR_ETAPA[e],e));
Object.keys(M.POR_ETAPA).forEach(e=>assert.equal(R.etapaNoSupervisor(e,'com',PIPES),true,'texto para etapa fora do supervisor: '+e));
[].concat(Object.values(M.POR_ETAPA),[M.PADRAO]).forEach(t=>{
  assert.doesNotMatch(t,/R\$|\d|gr[aá]tis|desconto|garant|hoje|amanh|prazo/i,t);
  assert.doesNotMatch(t,/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u,t);
  assert.match(t,/\{nome\}/); assert.match(t,/\{vendedor\}/);
});
assert.equal(M.mensagem('Negociação',{nome:'JOÃO pedro',vendedor:'marcilene rodrigues'}),
  'Oi, João! Aqui é Marcilene, da Solar Green Suporte. Conseguiu olhar com calma a proposta da sua usina? Se ficou alguma dúvida, me fala que eu te explico.');
assert.equal(M.mensagem('Etapa Nova',{nome:'Ana',vendedor:'Leo'}),M.PADRAO.replace('{nome}','Ana').replace('{vendedor}','Leo'));
assert.match(M.mensagem('Tentativa de Contato',{nome:'',vendedor:'Leo'}),/^Oi! Aqui é Leo/);

// ── Apps Script: cópia literal deste arquivo na seção do supervisor ──
const gs=fs.readFileSync(path.join(__dirname,'..','legado','CODE GS.txt'),'utf8').replace(/\r\n/g,'\n');
const js=fs.readFileSync(path.join(__dirname,'..','js','supervisor-regras.js'),'utf8').replace(/\r\n/g,'\n');
const ini='// >>> cópia literal de js/supervisor-regras.js >>>\n', fim='// <<< fim da cópia de js/supervisor-regras.js <<<';
const a=gs.indexOf(ini), b=gs.indexOf(fim);
assert.ok(a!==-1&&b>a,'CODE GS.txt sem a cópia de js/supervisor-regras.js');
assert.equal(gs.slice(a+ini.length,b),js,'a cópia no CODE GS.txt divergiu de js/supervisor-regras.js: copie o arquivo de novo');

console.log('supervisor-regras: ok');
