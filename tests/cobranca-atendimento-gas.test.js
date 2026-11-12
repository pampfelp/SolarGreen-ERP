// Contato do vendedor na cobrança (Code.gs, 12/11): o modelo atendimento_vendedor
// sai pelo botão da tela; a resposta automática do webhook continua em texto livre.
// Firestore e Meta de mentira; confere parâmetros do modelo, gravações, trava de
// clique duplo, recusas e a resposta automática depois da refatoração.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const fonte=fs.readFileSync(path.join(__dirname,'../legado/CODE GS.txt'),'utf8');
let agoraMs=Date.UTC(2026,10,12,15,0,0);
class FakeDate extends Date{
  constructor(...a){ if(a.length)super(...a); else super(agoraMs); }
  static now(){ return agoraMs; }
}
const context={
  JSON,Math,String,Object,Array,Number,RegExp,parseInt,parseFloat,isNaN,isFinite,console,Date:FakeDate,
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>null,setProperty(){}})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,waitLock(){},releaseLock(){}})},
  CacheService:{getScriptCache:()=>({get:()=>null,put(){}})},
  Utilities:{formatDate:()=>'',getUuid:()=>'uuid'},Session:{getScriptTimeZone:()=>'America/Belem'},
  UrlFetchApp:{fetch(){ throw new Error('rede não usada no teste'); }}
};
vm.runInNewContext(fonte,context);
const C=context;

let db,escritas,graph,pushes,respostaMeta;
C.fsGet_=(cfg,caminho)=>db[caminho]?{dados:JSON.parse(JSON.stringify(db[caminho])),updateTime:'t1'}:null;
C.fsConsulta_=()=>[];
C.fsUpdate_=(cfg,caminho,campos,cond)=>({caminho,campos,cond});
C.fsCommit_=(cfg,ws)=>{ ws.forEach(w=>{ escritas.push(w); db[w.caminho]=Object.assign({},db[w.caminho]||{},w.campos); }); return true; };
C.cobrancaEspelho_=(cfg,direcao,wamid,cliente,campos)=>({caminho:'mensagens_disparo/'+direcao+'-'+wamid,campos});
C.disparoProps_=()=>({token:'tk',phoneId:'ph',versao:'v21.0',wabaId:'waba'});
C.disparoGraph_=(props,corpo)=>{ graph.push(corpo); return respostaMeta(); };
C.enviarPush_=(cfg,para,msg)=>{ pushes.push({para,msg}); };

const cliente={'Nome Razao Social':'ALESSANDRA LAMA FERREIRA',Telefone:'(93) 99111-2222','Vendedor Responsavel':'v1'};
function reset(){
  db={'vendedores/v1':{Nome:'Marcilene Rodrigues',Telefone:'93 99123-4567',Status:'Ativo'}};
  escritas=[];graph=[];pushes=[];
  respostaMeta=()=>({ok:true,wamid:'wamid.ABC'});
}

// ── O modelo respeita as regras da Meta ──
{
  const m=C.ATENDIMENTO_MODELO;
  assert.equal(m.nome,'atendimento_vendedor');
  assert.ok(!/^\s*\{\{/.test(m.texto),'o texto não pode começar com variável');
  assert.ok(!/\}\}\s*[.!]?\s*$/.test(m.texto),'o texto não pode terminar em variável');
  const nums=(m.texto.match(/\{\{(\d+)\}\}/g)||[]).map(x=>Number(x.replace(/\D/g,'')));
  assert.deepEqual(nums,Array.from(m.campos,(_,i)=>i+1),'variáveis em sequência, uma por campo');
  assert.ok(!/\}\}\s*\{\{/.test(m.texto),'duas variáveis seguidas');
}

// ── Envio pelo botão: modelo, histórico, reserva e aviso ──
reset();
let r=C.cobrancaEnviarAtendimentoModelo_({},cliente,{idPlano:'p1'},'Felipe','index.html?cobrancaPlano=p1');
assert.equal(r.ok,true,JSON.stringify(r));
assert.equal(r.vendedor,'Marcilene');
assert.equal(graph.length,1);
const corpo=graph[0];
assert.equal(corpo.to,'5593991112222');
assert.equal(corpo.type,'template');
assert.equal(corpo.template.name,'atendimento_vendedor');
assert.equal(corpo.template.language.code,'pt_BR');
assert.deepEqual(JSON.parse(JSON.stringify(corpo.template.components)),[{type:'body',parameters:[
  {type:'text',text:'Alessandra'},{type:'text',text:'Marcilene'},{type:'text',text:'(93) 99123-4567'}]}]);
const out=db['cobranca_mensagens/out-wamid.ABC'];
assert.equal(out.direcao,'saida');assert.equal(out.tipo,'atendimento');assert.equal(out.idPlano,'p1');
assert.equal(out.telFim8,'91112222');
assert.equal(db['cobranca_mensagens/atendimento-559391112222'].em,agoraMs,'reserva de 24h marcada');
const espelho=db['mensagens_disparo/saida-wamid.ABC'];
assert.equal(espelho.texto,'Olá, Alessandra! Aqui é da Solar Green. Recebemos o seu pedido de atendimento. Quem vai te atender é Marcilene, pelo WhatsApp (93) 99123-4567. É só chamar nesse número.');
assert.equal(espelho.cobrancaTipo,'atendimento');
assert.equal(pushes.length,1);assert.deepEqual(Array.from(pushes[0].para),['v1']);
assert.equal(pushes[0].msg.url,'index.html?cobrancaPlano=p1');

// ── Segundo clique logo em seguida não manda de novo; 3 min depois, manda ──
graph=[];
r=C.cobrancaEnviarAtendimentoModelo_({},cliente,{idPlano:'p1'},'Felipe','');
assert.equal(r.ok,false);assert.match(r.erro,/acabou de ser enviado/);assert.equal(graph.length,0);
agoraMs+=3*60*1000;
r=C.cobrancaEnviarAtendimentoModelo_({},cliente,{idPlano:'p1'},'Felipe','');
assert.equal(r.ok,true);assert.equal(graph.length,1);

// ── Recusas: vendedor inativo, sem celular, cliente sem celular, Meta recusa ──
reset(); db['vendedores/v1'].Status='Inativo';
r=C.cobrancaEnviarAtendimentoModelo_({},cliente,{idAgendamento:'os1'},'Felipe','');
assert.equal(r.ok,false);assert.match(r.erro,/vendedor responsável não tem um contato ativo válido/);assert.equal(graph.length,0);
reset(); db['vendedores/v1'].Telefone='';
r=C.cobrancaEnviarAtendimentoModelo_({},cliente,{idAgendamento:'os1'},'Felipe','');
assert.equal(r.ok,false);assert.equal(graph.length,0);
reset();
r=C.cobrancaEnviarAtendimentoModelo_({},Object.assign({},cliente,{Telefone:'123'}),{idAgendamento:'os1'},'Felipe','');
assert.equal(r.ok,false);assert.match(r.erro,/celular válido/);
reset(); respostaMeta=()=>({ok:false,http:400,codigo:132001,erro:'Template name does not exist in the translation'});
r=C.cobrancaEnviarAtendimentoModelo_({},cliente,{idAgendamento:'os1'},'Felipe','');
assert.equal(r.ok,false);assert.match(r.erro,/132001/);
assert.equal(escritas.length,0,'recusa da Meta não grava histórico nem reserva');

// ── A resposta automática (texto livre) segue igual depois da refatoração ──
reset();
let a=C.cobrancaEnviarAtendimento_({},C.disparoProps_(),cliente,{idAgendamento:'os1'},'5593991112222',agoraMs-60*1000);
assert.equal(a.ok,true,JSON.stringify(a));
assert.equal(graph[0].type,'text');
assert.match(graph[0].text.body,/Quem vai te atender é Marcilene\. Toque aqui pra falar direto: https:\/\/wa\.me\/5593991234567/);
reset(); db['vendedores/v1'].Status='Inativo';
a=C.cobrancaEnviarAtendimento_({},C.disparoProps_(),cliente,{idAgendamento:'os1'},'5593991112222',agoraMs-60*1000);
assert.equal(a.ok,false);assert.match(a.motivo,/contato ativo válido/);
reset();
a=C.cobrancaEnviarAtendimento_({},C.disparoProps_(),cliente,{idAgendamento:'os1'},'5593991112222',agoraMs-25*60*60*1000);
assert.equal(a.ok,false);assert.match(a.motivo,/Janela/);

console.log('cobranca-atendimento-gas: ok');
