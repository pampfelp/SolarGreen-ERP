// Supervisor de vendas no Code.gs: a varredura de 15 min roda contra um
// Firestore de mentira, com a hora de Belém controlada. Confere contato na
// hora, pergunta, lembrete nos horários, aviso resolvido que não volta e o
// lembrete trocado pelo do horário seguinte.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const fonte=fs.readFileSync(path.join(__dirname,'../legado/CODE GS.txt'),'utf8');
let agoraMs=0;
class FakeDate extends Date{
  constructor(...a){ if(a.length)super(...a); else super(agoraMs); }
  static now(){ return agoraMs; }
}
const props={};
const context={
  JSON,Math,String,Object,Array,Number,parseInt,parseFloat,isNaN,isFinite,console,Date:FakeDate,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]===undefined?null:props[k],setProperty:(k,v)=>{props[k]=String(v);}})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  CacheService:{getScriptCache:()=>({get:()=>null,put(){}})},
  Utilities:{formatDate:()=>''},Session:{getScriptTimeZone:()=>'America/Belem'},
  UrlFetchApp:{fetch(){ throw new Error('rede não usada no teste'); }}
};
vm.runInNewContext(fonte,context);
const C=context, S=context.SupervisorRegras;
assert.ok(S&&typeof S.montarFila==='function','a cópia da regra não definiu SupervisorRegras no Apps Script');

// ── Firestore de mentira ──
let db, pushes, apagados;
const BASE='https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents';
const caminhoDe=nome=>nome.split('/documents/')[1];
function doc(col,id){ return (db[col]||{})[id]; }
C.fbConfig_=()=>({projeto:'p',base:BASE});
C.vendedoresFs_=()=>[
  {IdVendedor:'v1',Nome:'Marcilene Rodrigues',Tipo:'Vendedor',Status:'Ativo'},
  {IdVendedor:'v2',Nome:'Leonardo Lins',Tipo:'Vendedor',Status:'Inativo'},
  {IdVendedor:'ceo',Nome:'Felipe',Tipo:'CEO',Status:'Ativo'}
];
C.fsListar_=(cfg,col)=>Object.keys(db[col]||{}).map(id=>Object.assign({_id:id},JSON.parse(JSON.stringify(db[col][id]))));
C.fsApagar_=(cfg,caminho)=>{ const [col,id]=caminho.split('/'); apagados.push(caminho); delete db[col][id]; };
C.fsBatchGet_=(cfg,caminhos)=>{ const out={}; caminhos.forEach(c=>{ const [col,id]=c.split('/'); if(doc(col,id))out[c]=JSON.parse(JSON.stringify(doc(col,id))); }); return out; };
C.fsCommit_=(cfg,writes)=>{
  for(const w of writes){
    const [col,id]=caminhoDe(w.update.name).split('/');
    if(w.currentDocument&&w.currentDocument.exists&&!doc(col,id))return false;
  }
  writes.forEach(w=>{
    const [col,id]=caminhoDe(w.update.name).split('/');
    db[col]=db[col]||{}; const d=db[col][id]=db[col][id]||{};
    w.updateMask.fieldPaths.forEach(k=>{
      if(w.update.fields[k]!==undefined)d[k]=C.fsLerValor_(w.update.fields[k]); else delete d[k];
    });
  });
  return true;
};
function valor(v){ return C.fsLerValor_(v); }
function passa(d,f){
  if(f.compositeFilter)return f.compositeFilter.filters.every(x=>passa(d,x));
  const ff=f.fieldFilter, v=d[ff.field.fieldPath], alvo=valor(ff.value);
  if(v===undefined||typeof v!==typeof alvo)return false;
  return {GREATER_THAN:v>alvo,GREATER_THAN_OR_EQUAL:v>=alvo,LESS_THAN_OR_EQUAL:v<=alvo,EQUAL:v===alvo}[ff.op];
}
C.fsPedir_=(cfg,metodo,url,corpo)=>{
  assert.ok(url.endsWith(':runQuery'),'pedido inesperado: '+url);
  const q=corpo.structuredQuery, col=q.from[0].collectionId;
  const docs=Object.keys(db[col]||{}).filter(id=>passa(db[col][id],q.where)).map(id=>{
    const fields={}; Object.keys(db[col][id]).forEach(k=>{ fields[k]=C.fsValorRico_(db[col][id][k]); });
    return {document:{name:BASE+'/'+col+'/'+id,fields}};
  });
  return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(docs)};
};
// enviarPush_ da sessão A grava o documento em notificacoes; aqui só registra.
C.enviarPush_=(cfg,ids,msg)=>{ pushes.push(Object.assign({para:ids},msg)); db.notificacoes[msg.notifId]=Object.assign({para:ids,criadoEmMs:agoraMs},JSON.parse(JSON.stringify(msg))); return 1; };
// Push de resumo (sem documento): só registra.
let resumos=[];
C.notifMandarPush_=(cfg,ids,msg)=>{ resumos.push(Object.assign({para:ids},msg)); return {enviados:1,aparelhos:1}; };

// ── Dados ──
const B=(a,m,d,h,mi)=>S.msBelem(a,m,d,h,mi), DIA=86400000;
const iso=ms=>new Date(ms).toISOString();
const etapas=[
  {Nome:'Novo Lead',Papel:''},{Nome:'Tentativa de Contato',Papel:'',DiasAmarelo:2,DiasVermelho:4},
  {Nome:'Negociação',Papel:'proposta',DiasAmarelo:3,DiasVermelho:7},{Nome:'Serviço Agendado',Papel:'proposta'},
  {Nome:'Ganho',Papel:'ganho'},{Nome:'Perdido',Papel:'perdido'}
];
// Telefone montado por pedaços (nada de número real no repositório).
const telefone=id=>'(91) 9'+'8888'+'-10'+String(id.charCodeAt(0)).slice(-2);
function lead(id,o){
  return Object.assign({IdOportunidade:id,IdVendedor:'v1',IdCliente:'c-'+id,Etapa:'Tentativa de Contato',Pipeline:'com',
    NomeCliente:'Cliente '+id.toUpperCase(),TelefoneCliente:telefone(id),
    DataCriacao:'2026-09-01',Transicoes:[{Etapa:'Tentativa de Contato',Em:iso(B(2026,10,20,10))}]},o);
}
function reset(){
  pushes=[]; apagados=[]; resumos=[];
  Object.keys(props).forEach(k=>delete props[k]);
  db={
    funil_pipelines:{com:{IdPipeline:'com',Nome:'Comercial',Ordem:1,Etapas:etapas}},
    clientes:{'c-e':{Telefone:''}},
    notificacoes:{'supervisor_contato:d:1':{tipo:'supervisor_contato'}},
    funil:{
      a:lead('a',{ProximoContatoEm:B(2026,11,5,9,10)}),                 // contato daqui a 10 min
      b:lead('b'),                                                      // vermelho sem data
      c:lead('c',{SupervisorPerguntaEm:B(2026,11,5,8,50)}),              // pergunta vencida
      d:lead('d',{Etapa:'Perdido',SupervisorAvisoId:'supervisor_contato:d:1'}),
      e:lead('e',{TelefoneCliente:''}),                                 // vermelho, sem telefone
      f:lead('f',{SupervisorPerguntaEm:B(2026,11,5,8,0),ProximoContatoEm:B(2026,11,7,10)}),
      g:lead('g',{Etapa:'Serviço Agendado',ProximoContatoEm:B(2026,11,5,9,5)}),
      h:lead('h',{IdVendedor:'v2'}),                                   // dono inativo: fora da fila
      i:lead('i',{IdVendedor:'ceo'}),                                  // gestão: fora da fila
      j:lead('j',{ProximoContatoEm:B(2026,11,5,11,0)})                  // contato mais tarde
    }
  };
}
const tipos=()=>pushes.map(p=>p.tipo+':'+p.acao.idOportunidade).sort();

// ── 1) Quinta 05/11, 9h: contato, pergunta, lembretes; Perdido resolve o aviso pendente ──
reset();
agoraMs=B(2026,11,5,9,0);
C.supervisorVarrer();
assert.deepEqual(tipos(),['supervisor_contato:a','supervisor_lembrete:b','supervisor_lembrete:e','supervisor_pergunta:c']);
const pa=pushes.find(p=>p.acao.idOportunidade==='a');
assert.equal(pa.notifId,'supervisor_contato:a:'+B(2026,11,5,9,10));
assert.equal(pa.enviarEmMs,B(2026,11,5,9,10));           // agendado para a hora marcada
assert.equal(pa.titulo,'Falar com Cliente hoje');
assert.equal(pa.para[0],'v1');
assert.deepEqual(JSON.parse(JSON.stringify(pa.acao)),{tipo:'supervisor_contato',idOportunidade:'a',etapa:'Tentativa de Contato',nome:'Cliente A',telefone:'55919'+'8888'+'1097',nomeVendedor:'Marcilene Rodrigues'});
assert.equal(pa.url,'index.html?lead=a&notif='+encodeURIComponent(pa.notifId));
assert.equal(db.funil.a.SupervisorAvisoId,pa.notifId);
const pe=pushes.find(p=>p.acao.idOportunidade==='e');
assert.equal(pe.acao.telefone,'');
assert.match(pe.corpo,/sem telefone/);
assert.equal(pe.notifId,'supervisor_lembrete:e:2026-11-05-9');
assert.equal(pe.enviarEmMs,undefined);
const pc=pushes.find(p=>p.tipo==='supervisor_pergunta');
assert.equal(pc.titulo,'Qual a próxima data para falar com Cliente?');
assert.equal(db.funil.c.SupervisorPerguntaEm,undefined);            // pergunta saiu: campo limpo
assert.equal(db.funil.c.SupervisorAvisoId,pc.notifId);
assert.equal(db.funil.f.SupervisorPerguntaEm,undefined);            // já tinha data: só perde a pergunta
assert.equal(db.funil.d.SupervisorAvisoId,undefined);               // Perdido: aviso resolvido
assert.ok(db.notificacoes['supervisor_contato:d:1'].resolvidaEm);
assert.equal(JSON.parse(props.SUPERVISOR_FILA).dia,'2026-11-05');
// Queixa de 05/11: os três avisos de agora do v1 (b, e, c) vão para o sininho sem push
// próprio e saem num push só de resumo; o contato agendado (a) segue com o seu.
assert.deepEqual(pushes.filter(p=>p.semPush).map(p=>p.acao.idOportunidade).sort(),['b','c','e']);
assert.equal(pa.semPush,undefined);
assert.equal(resumos.length,1);
assert.deepEqual(JSON.parse(JSON.stringify(resumos[0].para)),['v1']);
assert.equal(resumos[0].corpo,'3 clientes para chamar agora. Abra o sininho: cada um tem a mensagem pronta.');
assert.equal(resumos[0].url,'index.html?sininho=1');
// c entrou na fila, mas na mesma volta recebeu a pergunta (um aviso por lead); às 13h fica fora.
assert.deepEqual(JSON.parse(props.SUPERVISOR_FILA).porVendedor,{v1:['b','c','e']});

// ── 2) Nova volta no mesmo horário não repete nada ──
pushes=[];
agoraMs=B(2026,11,5,9,15);
C.supervisorVarrer();
assert.deepEqual(tipos(),[]);

// ── 3) Vendedor enviou para B (Tentativa, data limpa, pergunta às 11h30). 13h: B não volta, E troca de lembrete ──
db.funil.b.Atividades=[{Tipo:'Tentativa de Contato',Em:iso(B(2026,11,5,10,0)),Observacao:''}];
db.funil.b.SupervisorPerguntaEm=S.horarioDaPergunta(B(2026,11,5,10,0));
db.notificacoes['supervisor_lembrete:b:2026-11-05-9'].resolvidaEm=B(2026,11,5,10,0);   // o navegador resolveu
agoraMs=B(2026,11,5,11,30);
C.supervisorVarrer();
assert.deepEqual(tipos(),['supervisor_contato:j','supervisor_pergunta:b']);   // contato de j (11h) e pergunta de b (11h30)
assert.ok(db.notificacoes['supervisor_lembrete:b:2026-11-05-9'].resolvidaEm);
pushes=[];
agoraMs=B(2026,11,5,13,0);
C.supervisorVarrer();
assert.deepEqual(tipos(),['supervisor_lembrete:e']);
assert.equal(pushes[0].notifId,'supervisor_lembrete:e:2026-11-05-13');
assert.ok(apagados.indexOf('notificacoes/supervisor_lembrete:e:2026-11-05-9')!==-1);   // o das 9h sai do sininho
assert.equal(db.funil.e.SupervisorAvisoId,'supervisor_lembrete:e:2026-11-05-13');

// ── 4) Fora dos horários: nada de lembrete. 16h de novo; sábado não lembra ──
pushes=[];
agoraMs=B(2026,11,5,14,30);
C.supervisorVarrer();
assert.deepEqual(tipos(),[]);
agoraMs=B(2026,11,5,16,10);
C.supervisorVarrer();
assert.deepEqual(tipos(),['supervisor_lembrete:e']);
pushes=[];
agoraMs=B(2026,11,7,9,0);
C.supervisorVarrer();
assert.equal(pushes.filter(p=>p.tipo==='supervisor_lembrete').length,0);

// ── 5) Segunda 09/11, 9h: fila nova do dia; lembrete de quinta resolvido; A, que não foi tratado, entra como sem data ──
pushes=[];
agoraMs=B(2026,11,9,9,0);
C.supervisorVarrer();
const fila=JSON.parse(props.SUPERVISOR_FILA);
assert.equal(fila.dia,'2026-11-09');
assert.ok(fila.porVendedor.v1.indexOf('a')!==-1,'data vencida sem ação volta para a fila');
assert.ok(db.notificacoes['supervisor_contato:a:'+B(2026,11,5,9,10)].resolvidaEm,'contato de quinta trocado pelo lembrete');
assert.equal(db.funil.e.SupervisorAvisoId,'supervisor_lembrete:e:2026-11-09-9');
assert.ok(pushes.every(p=>p.para[0]==='v1'));

console.log('supervisor-gas: ok');
