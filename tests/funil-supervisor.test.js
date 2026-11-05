// Funil com o supervisor de vendas: a Tentativa de Contato zera só a cor do
// prazo (não a data da etapa) e mover para etapa do supervisor pede a data e a
// hora do próximo contato, gravando ProximoContatoEm pelo salvarFunil.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const R=require('../js/supervisor-regras.js');
let chamadas=[], respostaDialogo=null, dialogos=[];
const context={
  localStorage:{getItem:()=>null},
  document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({style:{}})},
  window:{
    SupervisorRegras:R,
    SGEpoca:{criar:()=>({marcar(){},atual(){return 0;}})},
    SGUtil:{escapeHtml:s=>String(s),dateKey:d=>d.toISOString().slice(0,10),fmtDateBR:d=>String(d)},
    SGAuth:{apiCall:(acao,dados)=>{ chamadas.push({acao,dados}); return Promise.resolve({ok:true}); }},
    SGSupervisor:{pedirProximoContato:o=>{ dialogos.push(o); return Promise.resolve(respostaDialogo); }},
    SGPerda:{sugerir:()=>({tipo:'outros',origem:'palavra'})},
    SGConfirm:{pedirTexto:()=>Promise.resolve('Contratou outra empresa')}
  }
};
const source=fs.readFileSync(path.join(__dirname,'../js/funil.js'),'utf8');
const marker='  window.funilApp={init:init,atualizarClienteCache:atualizarClienteCache,abrirLead:abrirLead};';
assert.ok(source.includes(marker),'linha do funilApp mudou: atualize o marcador do teste');
vm.runInNewContext(source.replace(marker,`  render=function(){}; garantirDataVisivelNoFiltro=function(){}; mostrarToastFunil=function(){};
  window.funilTeste={
    definir:function(leads,pipes){ funilRecords=leads; funilPipelines=pipes; },
    lead:function(id){ return funilRecords.filter(function(x){return x.id===id;})[0]; },
    enriquecer:enriquecerComSLA, mover:moverLeadParaEtapa, pede:pedeProximoContato
  };\n${marker}`),context);
const F=context.window.funilTeste;

const pipes=[
  {IdPipeline:'com',Nome:'Comercial',Ordem:1,Etapas:[
    {Nome:'Novo Lead',Papel:''},{Nome:'Tentativa de Contato',Papel:'',DiasAmarelo:2,DiasVermelho:4},
    {Nome:'Negociação',Papel:'proposta',DiasVermelho:7},{Nome:'Serviço Agendado',Papel:'proposta'},
    {Nome:'Ganho',Papel:'ganho'},{Nome:'Perdido',Papel:'perdido'}]},
  {IdPipeline:'adm',Nome:'Administrativo',Ordem:2,Etapas:[{Nome:'A fazer',Papel:''},{Nome:'Feito',Papel:''}]}
];
const DIA=86400000, agora=Date.now();
function lead(id,o){
  return Object.assign({id,idCliente:'c'+id,idVendedor:'v1',etapa:'Tentativa de Contato',pipeline:'com',obs:'',valor:400,motivoPerda:'',
    dt:new Date(agora-30*DIA),transicoes:[{Etapa:'Tentativa de Contato',Em:new Date(agora-10*DIA).toISOString()}],atividades:[],
    etapasPassadas:[],proximoContatoEm:null,supervisorAvisoId:''},o);
}
const espera=()=>new Promise(r=>setImmediate(r));

(async()=>{
  // Cor do prazo: Tentativa deixa verde, data da etapa e dias continuam.
  F.definir([lead('a'),lead('b',{atividades:[{Tipo:'Tentativa de Contato',Em:new Date(agora-60000).toISOString()}]})],pipes);
  F.enriquecer([F.lead('a'),F.lead('b')]);
  assert.equal(F.lead('a').slaColor,'red');
  assert.equal(F.lead('b').slaColor,'green');
  assert.equal(F.lead('b').diasNaEtapa,10);
  assert.equal(F.lead('b').dataProcesso.getTime(),F.lead('a').dataProcesso.getTime());

  // Quem pede data.
  assert.equal(F.pede('Negociação','com'),true);
  assert.equal(F.pede('Serviço Agendado','com'),false);
  assert.equal(F.pede('Feito','adm'),false);

  // Mover para etapa do supervisor: pede a data; cancelar não move.
  let cancelou=false;
  respostaDialogo=null;
  F.mover('a','Negociação',()=>{cancelou=true;});
  await espera();
  assert.equal(dialogos.length,1);
  assert.equal(cancelou,true);
  assert.equal(F.lead('a').etapa,'Tentativa de Contato');
  assert.equal(chamadas.length,0);

  // Com a data: move e grava ProximoContatoEm, apaga a pergunta pendente e resolve o aviso.
  const marcada=agora+2*DIA;
  respostaDialogo=marcada;
  F.lead('a').supervisorAvisoId='supervisor_lembrete:a:2026-11-05-9';
  F.mover('a','Negociação');
  await espera();
  assert.equal(F.lead('a').etapa,'Negociação');
  assert.equal(F.lead('a').proximoContatoEm,marcada);
  const salvar=chamadas.find(c=>c.acao==='salvarFunil');
  assert.equal(salvar.dados.proximoContatoEm,marcada);
  assert.equal(salvar.dados.supervisorPerguntaEm,null);
  assert.equal(salvar.dados.resolverAviso,'supervisor_lembrete:a:2026-11-05-9');

  // Etapa fora do supervisor: não pede data e resolve o aviso pendente.
  chamadas=[]; dialogos=[];
  F.lead('b').supervisorAvisoId='supervisor_contato:b:1';
  F.mover('b','Serviço Agendado');
  await espera();
  assert.equal(dialogos.length,0);
  const s2=chamadas.find(c=>c.acao==='salvarFunil');
  assert.equal(s2.dados.proximoContatoEm,undefined);
  assert.equal(s2.dados.resolverAviso,'supervisor_contato:b:1');

  console.log('funil-supervisor: ok');
})().catch(e=>{ console.error(e); process.exit(1); });
