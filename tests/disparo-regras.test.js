// Regras da tela de campanhas de disparo: telefone, tipo, referência, dono/rodízio, exclusões, contagem e importação.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const R=require('../js/disparo-regras.js');

// Telefones montados por pedaços (nada de número real no repositório).
const cel=(ddd,fim)=>ddd+'9'+fim;          // 11 dígitos
const fmt=(ddd,fim)=>'('+ddd+') 9'+fim.slice(0,4)+'-'+fim.slice(4);
const A='88810001', B='88810002', C='88810003';

// ── Telefone e telFim8 ──
assert.equal(R.e164(fmt('91',A)),'55'+cel('91',A));
assert.equal(R.e164(cel('91',A)),'55'+cel('91',A));
assert.equal(R.e164('55'+cel('91',A)),'55'+cel('91',A));
assert.equal(R.e164('+55 '+fmt('91',A)),'55'+cel('91',A));
assert.equal(R.e164('91'+A),'55'+cel('91',A));              // celular sem o nono dígito ganha o 9
assert.equal(R.e164('91'+'32221000'),'55913'+'2221000');     // fixo: não ganha nono dígito
assert.equal(R.e164('12345'),'');
assert.equal(R.e164(''),'');
assert.equal(R.e164(null),'');
assert.equal(R.fim8(fmt('91',A)),A);
assert.equal(R.fim8('55'+cel('91',A)),A);
assert.equal(R.fim8('123'),'123');
assert.equal(R.formatarTelefone('55'+cel('91',A)),fmt('91',A));
assert.equal(R.formatarTelefone('abc'),'abc');
// Célula do Excel: número perde o formato, volta inteiro como texto.
assert.equal(R.telefoneDeCelula(Number('55'+cel('91',A))),'55'+cel('91',A));
assert.equal(R.telefoneDeCelula('  '+fmt('91',A)+' '),fmt('91',A));
assert.equal(R.telefoneDeCelula(undefined),'');

// ── Primeiro nome ──
assert.equal(R.primeiroNome('  maria DA silva '),'Maria');
assert.equal(R.primeiroNome(''),'');

// ── Tipo do contato ──
const agora=Date.parse('2026-10-29T12:00:00-03:00');
const dias=n=>agora-n*86400000;
assert.equal(R.tipoDoContato({temLead:true,papel:'perdido',ultimo:dias(2)},agora),'perdido');
assert.equal(R.tipoDoContato({temLead:true,papel:'',ultimo:dias(30)},agora),'parado');
assert.equal(R.tipoDoContato({temLead:true,papel:'',ultimo:dias(29)},agora),'aberto');
assert.equal(R.tipoDoContato({temLead:true,papel:'',ultimo:0},agora),'parado');   // sem data de movimento
assert.equal(R.tipoDoContato({temLead:false,origem:'Site'},agora),'sem funil');
assert.equal(R.tipoDoContato({temLead:false,origem:'Base Importada'},agora),'importado');
assert.equal(R.tipoDoContato({temLead:true,papel:'',ultimo:dias(1),origem:'Base Importada'},agora),'aberto');

// ── Referência {{2}} ──
assert.equal(R.referenciaDoContato('sem funil',0,agora),'outra ocasião');
assert.equal(R.referenciaDoContato('importado',dias(5),agora),'outra ocasião');
assert.equal(R.referenciaDoContato('perdido',Date.parse('2026-03-10T12:00:00-03:00'),agora),'março');
assert.equal(R.referenciaDoContato('parado',Date.parse('2025-12-10T12:00:00-03:00'),agora),'dezembro de 2025');
assert.equal(R.referenciaDoContato('aberto',0,agora),'outubro');   // sem data: usa o mês de hoje

// ── Último movimento ──
assert.equal(R.ultimoEm([{Em:'2026-01-02T00:00:00Z'},{Em:'2026-05-01T00:00:00Z'},{Em:'lixo'}]),Date.parse('2026-05-01T00:00:00Z'));
assert.equal(R.ultimoEm(undefined),0);

// ── Dono e rodízio ──
const vends=[
  {id:'v3',Nome:'Carla',Tipo:'Vendedor',Status:'Ativo',Telefone:fmt('91',A)},
  {id:'v1',Nome:'ana',Tipo:'vendedor',Status:'Ativo',Telefone:fmt('91',B)},
  {id:'v2',Nome:'Bia',Tipo:'Vendedor',Status:'Inativo',Telefone:fmt('91',C)},
  {id:'v4',Nome:'Duda',Tipo:'Vendedor',Status:'Ativo',Telefone:''},
  {id:'ad',Nome:'Chefe',Tipo:'admin',Status:'Ativo',Telefone:fmt('91',C)}
];
const ativos=R.vendedoresAtivos(vends);
assert.deepEqual(ativos.map(v=>v.id),['v1','v3']);                // ordenado por id; inativo, sem WhatsApp e admin ficam fora
assert.equal(R.donoPreferido(['v3','v1'],ativos),'v3');           // dono do lead ativo fica
assert.equal(R.donoPreferido(['v2','v1'],ativos),'v1');           // dono inativo: cai no Vendedor Responsavel
assert.equal(R.donoPreferido(['v2','v4'],ativos),'');             // ninguém serve: rodízio
assert.equal(R.donoPreferido(['',null],ativos),'');
const donos=R.atribuirDonos([
  {candidatos:['v3']},{candidatos:['v2']},{candidatos:[]},{candidatos:['v9','v2']},{candidatos:['v1']}
],ativos);
assert.deepEqual(donos.map(d=>d.vendedor.id),['v3','v1','v3','v1','v1']);   // rodízio v1, v3, v1... só pra quem não tem dono válido
assert.deepEqual(donos.map(d=>d.rodizio),[false,true,true,true,false]);
assert.equal(R.atribuirDonos([{candidatos:['x']}],[])[0].vendedor,null);

// ── Ordem de envio: mais antigo primeiro, depois nome ──
const ordem=R.ordenarParaEnvio([
  {nome:'Zeca',ultimo:50},{nome:'Bia',ultimo:0},{nome:'Ana',ultimo:50},{nome:'Caio',ultimo:10}
]);
assert.deepEqual(ordem.map(x=>x.nome),['Bia','Caio','Ana','Zeca']);

// ── Resposta na última campanha ──
const d=(o)=>Object.assign({campanha:'c1',criadoEm:100,status:'enviado',enviadoEm:200},o);
assert.equal(R.respostaNaUltimaCampanha([]).resposta,'nunca');
assert.equal(R.respostaNaUltimaCampanha([d({status:'fila',enviadoEm:undefined})]).resposta,'nunca');
assert.equal(R.respostaNaUltimaCampanha([d({})]).resposta,'nao_interagiu');
assert.equal(R.respostaNaUltimaCampanha([d({tocouEm:300})]).resposta,'clicou');
assert.equal(R.respostaNaUltimaCampanha([d({tocouEm:300,respondeuEm:400})]).resposta,'respondeu');
assert.equal(R.respostaNaUltimaCampanha([d({status:'saiu',respondeuEm:400})]).resposta,'saiu');
// Erro 131026 (número sem WhatsApp) é "não entregue"; qualquer outro erro é "falha de envio".
const erro=(cod)=>d({status:'erro',enviadoEm:undefined,erroCodigo:cod});
assert.equal(R.respostaNaUltimaCampanha([erro(131026)]).resposta,'nao_entregue');
assert.equal(R.respostaNaUltimaCampanha([erro('131026')]).resposta,'nao_entregue');
assert.equal(R.respostaNaUltimaCampanha([erro(131042)]).resposta,'falha_envio');
assert.equal(R.respostaNaUltimaCampanha([erro(130472)]).resposta,'falha_envio');
assert.equal(R.respostaNaUltimaCampanha([erro(131049)]).resposta,'falha_envio');
assert.equal(R.respostaNaUltimaCampanha([erro(undefined)]).resposta,'falha_envio');
// Vale a campanha mais recente, não a antiga.
const dois=[d({campanha:'c0',criadoEm:50,tocouEm:60}),d({campanha:'c1',criadoEm:100})];
assert.deepEqual(R.respostaNaUltimaCampanha(dois),{campanha:'c1',resposta:'nao_interagiu'});

// ── Exclusões da seleção ──
const ok={tel:'55'+cel('91',A),fim8:A,resposta:'nunca'};
const optout=new Set([B]);
assert.equal(R.motivoDeExclusao(ok,optout,new Set()),'');
assert.equal(R.motivoDeExclusao({tel:'',fim8:'',resposta:'nunca'},optout,new Set()),'Telefone inválido');
assert.equal(R.motivoDeExclusao({tel:'55'+cel('91',B),fim8:B,resposta:'nunca'},optout,new Set()),'Pediu para não receber');
assert.equal(R.motivoDeExclusao(Object.assign({},ok,{resposta:'nao_entregue'}),optout,new Set()),'Número sem WhatsApp na última campanha');
assert.equal(R.motivoDeExclusao(ok,optout,new Set([A])),'Já está nesta campanha');
// Falha de envio por outro motivo (ex.: pagamento da conta) NÃO exclui.
assert.equal(R.motivoDeExclusao(Object.assign({},ok,{resposta:'falha_envio'}),optout,new Set()),'');
// Optout aceita objeto simples também.
assert.equal(R.motivoDeExclusao(ok,{[A]:true},{}),'Pediu para não receber');

// ── Disparo do passo 1: id, campos exatos ──
const vend={id:'v1',Nome:'ana',Telefone:fmt('91',B)};
const m=R.montarDisparo({campanha:'ab12cd34',idOportunidade:'op1',idCliente:'cl1',nomeCompleto:'joão da silva',telefone:fmt('91',A),
  vendedor:vend,tipo:'perdido',modelo:'reativacao_v2',ultimo:Date.parse('2026-03-10T12:00:00-03:00'),ordem:7,agora});
assert.equal(m.id,'ab12cd34-op1-p1');
assert.deepEqual(Object.keys(m.dados).sort(),R.CAMPOS_CRIACAO.slice().sort());
assert.equal(m.dados.status,'fila');
assert.equal(m.dados.passo,1);
assert.equal(m.dados.telLead,'55'+cel('91',A));
assert.equal(m.dados.telFim8,A);
assert.equal(m.dados.telVendedor,'55'+cel('91',B));
assert.equal(m.dados.nomeLead,'João');
assert.equal(m.dados.nomeVendedor,'Ana');
assert.equal(m.dados.referencia,'março');
assert.equal(m.dados.criadoEm,agora);
// Sem funil: chave c<IdCliente>, referência "outra ocasião", sem nome vira "tudo bem".
const sf=R.montarDisparo({campanha:'ab12cd34',idOportunidade:'',idCliente:'cl9',nomeCompleto:'',telefone:fmt('91',C),vendedor:vend,tipo:'sem funil',modelo:'x',ordem:0,agora});
assert.equal(sf.id,'ab12cd34-ccl9-p1');
assert.equal(sf.dados.idOportunidade,'');
assert.equal(sf.dados.referencia,'outra ocasião');
assert.equal(sf.dados.nomeLead,'tudo bem');

// As firestore.rules aceitam exatamente os campos que a página grava.
const rules=fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8');
const bloco=rules.slice(rules.indexOf('match /disparos/{id}'));
const lista=bloco.match(/hasOnly\(\[([\s\S]*?)\]\)/);
assert.ok(lista,'regra de create de disparos sem hasOnly');
const naRegra=lista[1].match(/'([^']+)'/g).map(s=>s.slice(1,-1)).sort();
assert.deepEqual(naRegra,R.CAMPOS_CRIACAO.slice().sort());

// ── Contagem (definições das telas) ──
const lote=[
  {status:'fila'},
  {status:'enviado',enviadoEm:1,entregueEm:2,lidoEm:3,tocouEm:4,respondeuEm:5},
  {status:'enviado',enviadoEm:1,entregueEm:2},
  {status:'saiu',enviadoEm:1,entregueEm:2},
  {status:'saiu'},                       // saiu antes de enviar: não conta como enviado
  {status:'erro',erroCodigo:131026},
  {status:'erro',erroCodigo:131042}      // qualquer erro conta em "Não entregue" nos números
];
const n=R.contar(lote,0.5);
assert.deepEqual(
  {total:n.total,fila:n.fila,enviados:n.enviados,entregues:n.entregues,lidos:n.lidos,clicaram:n.clicaram,responderam:n.responderam,sairam:n.sairam,naoEntregues:n.naoEntregues,custo:n.custo},
  {total:7,fila:1,enviados:3,entregues:3,lidos:1,clicaram:1,responderam:1,sairam:2,naoEntregues:2,custo:1.5}
);
assert.equal(R.contar([{status:'enviado'}]).custo,0.32);   // custo padrão

// ── Status do contato (selo da tabela) ──
assert.equal(R.statusDoContato([{status:'fila'}]),'fila');
assert.equal(R.statusDoContato([{status:'enviado',enviadoEm:1,lidoEm:2},{status:'fila'}]),'lido');
assert.equal(R.statusDoContato([{status:'enviado',enviadoEm:1,tocouEm:2},{status:'erro'}]),'erro');
assert.equal(R.statusDoContato([{status:'enviado',enviadoEm:1,respondeuEm:2},{status:'erro'}]),'respondeu');
assert.equal(R.statusDoContato([{status:'saiu',enviadoEm:1,respondeuEm:2}]),'saiu');

// ── Importação ──
const clientes=[{id:'k1',nome:'Já Existe',telefone:fmt('91',A)},{id:'k2',nome:'Sem fone',telefone:''}];
const r=R.analisarImportacao([
  {nome:'Novo Um',telefone:fmt('91',B),etiqueta:'feira'},
  {nome:'Duplicado do cadastro',telefone:'55'+cel('91',A)},
  {nome:'Telefone ruim',telefone:'123'},
  {nome:'Novo Um repetido',telefone:cel('91',B)},
  {nome:'',telefone:fmt('91',C)},
  {nome:'Novo Dois',telefone:Number('55'+cel('91','88810004')),etiqueta:''}
],clientes,'geral');
assert.deepEqual(r.novos.map(x=>[x.nome,x.etiqueta]),[['Novo Um','feira'],['Novo Dois','geral']]);
assert.equal(r.novos[0].tel,'55'+cel('91',B));
assert.equal(r.novos[0].formatado,fmt('91',B));
assert.equal(r.existentes.length,1);
assert.equal(r.existentes[0].cadastro.id,'k1');
assert.equal(r.existentes[0].etiqueta,'geral');
assert.deepEqual(r.pulados.map(x=>x.motivo),['Telefone inválido','Telefone repetido no arquivo (linha 2)','Nome em branco']);
assert.equal(r.pulados[0].linha,4);

console.log('disparo-regras: ok');
