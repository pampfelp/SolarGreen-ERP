// Envio pra assinatura no Code.gs: no contrato de vínculo com imóvel assinam
// locador e locatário (sem a Solar Green); os outros contratos seguem com
// cliente + Solar Green assinando sozinha.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const fonte=fs.readFileSync(path.join(__dirname,'../legado/CODE GS.txt'),'utf8');
let chamadas,linhas;
const pdf={getDataAsString:()=>'<< /Type /Pages /Count 3 >>'};
const context={
  JSON,Math,Date,String,Object,Array,parseInt,parseFloat,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='AUTENTIQUE_API_TOKEN'?'tk':null})},
  DriveApp:{getFileById:()=>({getBlob:()=>pdf}),Access:{},Permission:{}},
  Utilities:{formatDate:()=>'22-10-2026 10-00',newBlob:()=>({getAs:()=>({setName(){return this;}})})},
  Session:{getScriptTimeZone:()=>'GMT-3'},
  UrlFetchApp:{fetch(url,opts){
    chamadas.push(opts);
    const ops=opts.payload&&opts.payload.operations?JSON.parse(opts.payload.operations):null;
    const signatures=ops?ops.variables.signers.map((s,i)=>({email:s.email.toUpperCase(),link:{short_link:'https://assina.ae/'+i}})):[];
    return {getContentText:()=>JSON.stringify({data:{createDocument:{id:'doc1',signatures}}})};
  }}
};
vm.runInNewContext(fonte,context);
context.getOrCreatePastaContratosProposta_=()=>({createFile:()=>({setSharing(){},getId:()=>'f1',getUrl:()=>'https://drive/f1'})});
context.getOrCreateContratosAssinadosSheet_=()=>({appendRow:l=>linhas.push(l)});
context.generateShortId=()=>'id1';

function enviar(body){ chamadas=[];linhas=[]; return context.actionEnviarContratoParaAssinatura(body); }
function signers(){ return JSON.parse(chamadas[0].payload.operations).variables.signers; }
const sig=[{papel:'locador',nome:'Isaias',email:'isaias@exemplo.com'},{papel:'locatario',nome:'Marah',email:'marah@exemplo.com'}];

// 1) Vínculo: dois signatários (locador, locatário), sem a Solar Green e sem auto-assinatura.
let r=enviar({tipoContrato:'vinculo_imovel',html:'<p>x</p>',clienteNome:'Isaias e Marah',clienteEmail:'isaias@exemplo.com, marah@exemplo.com',signatarios:sig.slice().reverse()});
assert.equal(r.ok,true,r.erro);
assert.equal(chamadas.length,1,'não pode chamar signDocument');
let s=signers();
assert.deepEqual(s.map(x=>x.email),['isaias@exemplo.com','marah@exemplo.com']);
assert.deepEqual(s.map(x=>x.name),['Isaias','Marah']);
assert.ok(!s.some(x=>/solargreen/i.test(x.email)));
// PDF de 3 páginas: marca no rodapé das páginas 1 e 2 e assinatura no topo da 3.
assert.deepEqual(s[0].positions,[
  {x:'7',y:'93',z:1,element:'SIGNATURE'},{x:'7',y:'93',z:2,element:'SIGNATURE'},{x:'14.7',y:'13',z:3,element:'SIGNATURE'}]);
assert.deepEqual(s[1].positions,[
  {x:'52.5',y:'93',z:1,element:'SIGNATURE'},{x:'52.5',y:'93',z:2,element:'SIGNATURE'},{x:'65.3',y:'13',z:3,element:'SIGNATURE'}]);
assert.equal(r.link,'https://assina.ae/0 https://assina.ae/1','links achados mesmo com e-mail em outra caixa');
assert.equal(linhas[0][3],'isaias@exemplo.com, marah@exemplo.com');

// 2) Vínculo com dado faltando ou repetido não chega na Autentique.
r=enviar({tipoContrato:'vinculo_imovel',html:'<p>x</p>',signatarios:[sig[0]]});
assert.equal(r.ok,false); assert.match(r.erro,/locador e locatario/); assert.equal(chamadas.length,0);
r=enviar({tipoContrato:'vinculo_imovel',html:'<p>x</p>',signatarios:[sig[0],{papel:'locatario',nome:'Marah',email:'ISAIAS@exemplo.com'}]});
assert.equal(r.ok,false); assert.match(r.erro,/e-mail diferente/); assert.equal(chamadas.length,0);
r=enviar({tipoContrato:'vinculo_imovel',html:'<p>x</p>',signatarios:[sig[0],{papel:'locatario',nome:'Marah',email:'marah@hotmail.com00'}]});
assert.equal(r.ok,false); assert.match(r.erro,/não é um endereço válido/); assert.equal(chamadas.length,0);

// 3) Monitoramento continua igual: cliente + Solar Green, e a Solar Green assina sozinha.
r=enviar({tipoContrato:'monitoramento',html:'<p>x</p>',clienteNome:'Cliente',clienteEmail:'cliente@exemplo.com'});
assert.equal(r.ok,true,r.erro);
assert.equal(chamadas.length,2,'createDocument + signDocument');
s=signers();
assert.deepEqual(s.map(x=>x.email),['cliente@exemplo.com','solargreensuporte@gmail.com']);
assert.equal(s[0].positions[2].x,'61.7'); assert.equal(s[1].positions[2].x,'3');
assert.match(chamadas[1].payload,/signDocument/);

// 4) Contrato comum sem e-mail continua recusado como antes.
r=enviar({tipoContrato:'homologacao',html:'<p>x</p>',clienteNome:'Cliente',clienteEmail:''});
assert.equal(r.ok,false); assert.match(r.erro,/e-mail cadastrado/);

console.log('contrato-vinculo-assinatura: ok');
