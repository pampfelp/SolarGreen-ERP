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

// ── Interromper a mensalidade (12/11): sem venda, sem mensagem, mês fechado ──
{
  let gestao=true;
  const plano={IdCliente:'c1',Valor:39.9,CobrancaUltimoMes:'2026-11',CobrancaMes:{Ativa:true,Meses:['2026-11'],Valor:39.9,Url:'https://checkout.infinitepay.io/x/abc',OrderNsu:'n1',Desde:'2026-11-11',PagoEm:'2026-10-12T10:00:00.000Z'}};
  let gravado=null;
  C.cobrancaPlanoAuth_=()=>({cfg:{},auth:{vendedor:{IdVendedor:'adm'}},por:'Felipe',c:C.cobrancaPlanoContexto_({},'p1',JSON.parse(JSON.stringify(plano)))});
  C.ehGestaoAtivaFs_=()=>gestao;
  C.fsUpdateRico_=(cfg,caminho,campos,cond)=>({caminho,campos,cond});
  reset(); db['clientes/c1']=cliente;
  C.fsCommit_=(cfg,ws)=>{ escritas.push(...ws); gravado=ws; return true; };
  let ri=C.actionCobrancaPlanoInterromper({idPlano:'p1'});
  assert.equal(ri.ok,true,JSON.stringify(ri));
  assert.deepEqual(Array.from(ri.meses),['2026-11']);
  assert.equal(gravado.length,1,'só o plano é gravado');
  assert.equal(gravado[0].caminho,'planos/p1');
  const cm=gravado[0].campos.CobrancaMes;
  assert.equal(cm.Ativa,false);assert.equal(cm.Meses.length,0);assert.equal(cm.Url,'');assert.equal(cm.OrderNsu,'');
  assert.deepEqual(Array.from(cm.InterrompidoMeses),['2026-11']);assert.equal(cm.InterrompidoPor,'Felipe');
  assert.equal(cm.PagoEm,'2026-10-12T10:00:00.000Z','não marca pagamento');
  assert.equal(gravado[0].campos.CobrancaUltimoMes,undefined,'novembro já era o último mês posto em cobrança');
  assert.ok(!escritas.some(w=>/^vendas\//.test(w.caminho)),'não lança venda');
  assert.equal(graph.length,0,'não manda mensagem');
  // A tela lê o resultado como interrompido
  const R=require('../js/cobranca-regra.js');
  const depois=Object.assign({},plano,{CobrancaMes:JSON.parse(JSON.stringify(cm))});
  assert.equal(R.situacaoPlano(depois,new Date(2026,10,12)).situacao,'interrompido');
  // Vendedor (não gestão) não interrompe
  gestao=false; gravado=null;
  ri=C.actionCobrancaPlanoInterromper({idPlano:'p1'});
  assert.equal(ri.ok,false);assert.match(ri.erro,/Só a gestão/);assert.equal(gravado,null);
  // Sem mês em aberto: interrompe o próximo e avança o último mês
  gestao=true;
  C.cobrancaPlanoAuth_=()=>({cfg:{},auth:{vendedor:{IdVendedor:'adm'}},por:'Felipe',c:C.cobrancaPlanoContexto_({},'p1',Object.assign({},plano,{CobrancaMes:{Ativa:false,Meses:[],PagoEm:'2026-11-05T10:00:00.000Z'}}))});
  ri=C.actionCobrancaPlanoInterromper({idPlano:'p1'});
  assert.equal(ri.ok,true);assert.deepEqual(Array.from(ri.meses),['2026-12']);
  assert.equal(gravado[0].campos.CobrancaUltimoMes,'2026-12');
}

console.log('cobranca-atendimento-gas: ok');
