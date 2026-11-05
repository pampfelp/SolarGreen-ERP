// Notificações centrais no Apps Script: enviarPush_ grava notificacoes/{notifId},
// avisos agendados só gravam, a varredura manda o que venceu e a ação notifPush.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const fonte=fs.readFileSync(path.join(__dirname,'../legado/CODE GS.txt'),'utf8');
let commits,pushes,consultas,tokens,docs;
const resp=(corpo,cod)=>({getResponseCode:()=>cod||200,getContentText:()=>JSON.stringify(corpo)});
const context={
  JSON,Math,Date,String,Object,Array,Number,parseInt,parseFloat,encodeURIComponent,console,
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},
  CacheService:{getScriptCache:()=>({get:()=>null,put(){}})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,waitLock(){},releaseLock(){}})},
  ScriptApp:{},Utilities:{},Logger:{log(){}},
  UrlFetchApp:{fetchAll(pedidos){ pushes.push(...pedidos.map(p=>JSON.parse(p.payload).message)); return pedidos.map(()=>({getResponseCode:()=>200,getContentText:()=>'{}'})); }}
};
vm.runInNewContext(fonte,context);
const cfg={projeto:'p',base:'https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents'};
context.fbAccessToken_=()=>'tok';
context.fbConfig_=()=>cfg;
context.fsListar_=(c,col)=>col==='push_tokens'?tokens:[];
context.fsPedir_=(c,metodo,url,corpo)=>{
  if(/:commit$/.test(url)){ commits.push(...JSON.parse(JSON.stringify(corpo.writes))); return resp({}); }
  if(/:runQuery$/.test(url)){
    consultas.push(corpo.structuredQuery.where.compositeFilter.filters[0].fieldFilter.field.fieldPath);
    return resp(docs.map(d=>({document:{name:'projects/p/databases/(default)/documents/notificacoes/'+d.id,fields:d.fields}})));
  }
  throw new Error('pedido inesperado '+url);
};
function reiniciar(){ commits=[];pushes=[];consultas=[];docs=[]; tokens=[{_id:'t1',idVendedor:'V1',token:'tokV1'},{_id:'t2',idVendedor:'V2',token:'tokV2'}]; }
const campo=(w,k)=>w.update.fields[k];
const str=v=>({stringValue:v}),num=v=>({integerValue:String(v)});

// 1) Aviso imediato: grava o documento com o notifId, junta a lista em `para`, manda o push e marca pushEnviadoEm.
reiniciar();
let n=context.enviarPush_(cfg,['V1'],{titulo:'Pagou',corpo:'Fulano pagou',url:'index.html?cobranca=a',tag:'c-a',notifId:'cobranca:T1',tipo:'cobranca'});
assert.equal(n,1);
assert.equal(commits.length,2);
assert.equal(commits[0].update.name,cfg.base.replace('https://firestore.googleapis.com/v1/','')+'/notificacoes/cobranca:T1');
assert.deepEqual(campo(commits[0],'tipo'),str('cobranca'));
assert.deepEqual(campo(commits[0],'titulo'),str('Pagou'));
assert.equal(campo(commits[0],'enviarEmMs'),undefined);
assert.deepEqual(commits[0].updateTransforms,[{fieldPath:'para',appendMissingElements:{values:[str('V1')]}}]);
assert.deepEqual(commits[1].updateMask.fieldPaths,['pushEnviadoEm']);
assert.deepEqual(commits[1].currentDocument,{exists:true});
assert.equal(pushes.length,1);
assert.equal(pushes[0].token,'tokV1');
assert.equal(pushes[0].data.notifId,'cobranca:T1');

// 2) Agendado no futuro: só grava, com enviarEmMs, sem push e sem pushEnviadoEm. acao vai como mapa.
reiniciar();
const futuro=Date.now()+3600000;
n=context.enviarPush_(cfg,['V1','V2'],{titulo:'Falar com Ana',corpo:'x',url:'index.html',tag:'s',notifId:'sup:1',tipo:'supervisor_contato',enviarEmMs:futuro,acao:{tipo:'supervisor_enviar',lead:'L1'}});
assert.equal(n,0);
assert.equal(pushes.length,0);
assert.equal(commits.length,1);
assert.deepEqual(campo(commits[0],'enviarEmMs'),num(futuro));
assert.deepEqual(campo(commits[0],'acao'),{mapValue:{fields:{tipo:str('supervisor_enviar'),lead:str('L1')}}});
assert.equal(commits[0].updateTransforms[0].appendMissingElements.values.length,2);

// 3) Ninguém com aparelho: o aviso fica gravado e marcado como enviado (a varredura não tenta de novo).
reiniciar(); tokens=[];
n=context.enviarPush_(cfg,['V9'],{titulo:'a',corpo:'b',url:'u',tag:'t',notifId:'x:1',tipo:'os'});
assert.equal(n,0);
assert.equal(commits.length,2);
assert.deepEqual(commits[1].updateMask.fieldPaths,['pushEnviadoEm']);

// 4) Sem notifId: só o push, como antes. Sem destinatário: nada.
reiniciar();
n=context.enviarPush_(cfg,['V1'],{titulo:'a',corpo:'b',url:'u',tag:'t'});
assert.equal(n,1); assert.equal(commits.length,0);
assert.equal(context.enviarPush_(cfg,[],{titulo:'a',notifId:'z'}),0);
assert.equal(commits.length,0);

// 5) Falha ao gravar não impede o push.
reiniciar();
const pedirOriginal=context.fsPedir_;
context.fsPedir_=(c,m,u,corpo)=>/:commit$/.test(u)?resp({error:'x'},500):pedirOriginal(c,m,u,corpo);
n=context.enviarPush_(cfg,['V1'],{titulo:'a',corpo:'b',url:'u',tag:'t',notifId:'y:1',tipo:'os'});
assert.equal(n,1);
context.fsPedir_=pedirOriginal;

// 6) notificacoesVarrer: manda só o que venceu e não tem pushEnviadoEm.
reiniciar();
const agora=Date.now();
const doc=(id,extra)=>({id,fields:Object.assign({para:{arrayValue:{values:[str('V1')]}},titulo:str('T '+id),corpo:str('C'),url:str('index.html'),tag:str('t'),tipo:str('supervisor_contato'),criadoEmMs:num(agora-600000)},extra)});
docs=[doc('devido',{enviarEmMs:num(agora-1000)}),doc('futuro',{enviarEmMs:num(agora+600000)}),doc('jaEnviado',{enviarEmMs:num(agora-1000),pushEnviadoEm:num(agora-500)}),doc('imediato',{tipo:str('cobranca')})];
context.notificacoesVarrer();
assert.deepEqual(consultas,['enviarEmMs','criadoEmMs']);
// as duas consultas devolvem os mesmos documentos: cada um sai uma vez só
assert.deepEqual(pushes.map(p=>p.data.notifId).sort(),['devido','imediato']);
assert.equal(commits.filter(w=>w.updateMask.fieldPaths[0]==='pushEnviadoEm').length,2);

// 6b) Vários avisos do supervisor para o mesmo vendedor (lote das 17h30): um push de resumo, todos marcados.
reiniciar();
docs=[doc('p1',{tipo:str('supervisor_pergunta'),enviarEmMs:num(agora-1000)}),doc('p2',{tipo:str('supervisor_pergunta'),enviarEmMs:num(agora-1000)}),doc('p3',{tipo:str('supervisor_pergunta'),enviarEmMs:num(agora-1000)}),doc('outro',{tipo:str('cobranca')})];
context.notificacoesVarrer();
const resumos=pushes.filter(p=>/^supervisor_resumo:V1:/.test(p.data.notifId));
assert.equal(resumos.length,1);
assert.match(resumos[0].data.corpo,/^3 clientes esperam a próxima data/);
assert.equal(resumos[0].data.url,'index.html?sininho=1');
assert.deepEqual(pushes.map(p=>p.data.notifId).filter(id=>!/^supervisor_resumo/.test(id)),['outro']);
assert.equal(commits.filter(w=>w.updateMask.fieldPaths[0]==='pushEnviadoEm').length,4);

// 6c) semPush: grava já marcado como enviado e não manda push.
reiniciar();
n=context.enviarPush_(cfg,['V1'],{titulo:'a',corpo:'b',url:'u',tag:'t',notifId:'sup:2',tipo:'supervisor_lembrete',semPush:true});
assert.equal(n,0); assert.equal(pushes.length,0); assert.equal(commits.length,1);
assert.ok(campo(commits[0],'pushEnviadoEm'));

// 7) notifPush: autenticação, id inválido, já enviado, agendado e envio.
reiniciar();
context.disparoAutenticar_=(c,body)=>body.idToken==='ok'?{vendedor:{IdVendedor:'V1',Status:'Ativo'},uid:'u'}:{erro:'não autorizado'};
let lido={dados:{para:['V1'],titulo:'t',corpo:'c',url:'u',tag:'g'}};
context.fsGet_=()=>lido;
assert.equal(context.actionNotifPush({notifId:'a:1'}).ok,false);
assert.equal(context.actionNotifPush({idToken:'ruim',notifId:'a:1'}).erro,'não autorizado');
assert.equal(context.actionNotifPush({idToken:'ok',notifId:'a/b'}).ok,false);
assert.equal(context.actionNotifPush({idToken:'ok',notifId:''}).ok,false);
let r=context.actionNotifPush({idToken:'ok',notifId:'a:1'});
assert.equal(r.acao,'enviado'); assert.equal(r.enviados,1); assert.equal(pushes.length,1);
lido={dados:{para:['V1'],pushEnviadoEm:1}};
assert.equal(context.actionNotifPush({idToken:'ok',notifId:'a:1'}).acao,'já enviado');
lido={dados:{para:['V1'],enviarEmMs:Date.now()+999999}};
assert.equal(context.actionNotifPush({idToken:'ok',notifId:'a:1'}).acao,'agendada');
context.fsGet_=()=>null;
assert.equal(context.actionNotifPush({idToken:'ok',notifId:'a:1'}).ok,false);

// 8) Roteador: notifPush é aceito sem a chave da API (a autenticação é o idToken).
assert.match(fonte,/=== 'notifPush'\)\s+return jsonOutput\(actionNotifPush\(body\)\);/);
assert.ok(fonte.indexOf("'notifPush'")<fonte.indexOf('Chave inválida'));

// 9) Todo enviarPush_ que já existia leva `tipo`.
const chamadas=fonte.split('enviarPush_(cfg,').length-1+fonte.split('enviarPush_(cfg, ').length-1;
const comTipo=(fonte.match(/\btipo: ('[a-z_]+'|daConfirmacao \? 'os' : 'cobranca'|tipo)/g)||[]).length;
assert.ok(chamadas>=12&&comTipo>=12,'chamadas '+chamadas+' com tipo '+comTipo);
console.log('notificacoes-central: ok');
