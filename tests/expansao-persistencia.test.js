const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

const router = readFileSync(join(__dirname, '../js/firestore-router.js'), 'utf8');

function contexto() {
  let usuario = { uid: 'equipe-a' };
  let contador = 0;
  let agora = 0;
  const docs = new Map();
  const snap = id => ({
    exists: docs.has(id),
    data: () => docs.get(id)
  });
  const firestore = () => ({
    collection(nome) {
      assert.equal(nome, 'propostas_expansao');
      return {
        doc(id = 'exp-' + ++contador) {
          return { id, get: async () => snap(id) };
        },
        get: async () => ({
          forEach: fn => docs.forEach((doc, id) => fn(snap(id)))
        })
      };
    },
    async runTransaction(executar) {
      return executar({
        get: async ref => snap(ref.id),
        set: (ref, doc) => docs.set(ref.id, doc),
        update: (ref, patch) => docs.set(ref.id, { ...docs.get(ref.id), ...patch })
      });
    }
  });
  firestore.FieldValue = { serverTimestamp: () => ++agora };
  const window = { SGFireReady: Promise.resolve() };
  runInNewContext(router, { window, firebase: { auth: () => ({ currentUser: usuario }), firestore } });
  return { api: window.SGFireActions, usuario: valor => { usuario = valor; }, docs };
}

const proposta = () => ({
  IdCliente: 'cliente-sintetico',
  Numero: 'EXP-1',
  Status: 'Rascunho',
  Fatura: { consumoFaturado: 1200 },
  Expansao: { fracaoUtil: 1 },
  Resumo: { KwpAdicional: 8.06 }
});
const geracao = (ano, percentual) => ({
  AnoFioB: ano,
  PercentualFioBGD2: percentual,
  ParametrosTarifarios: { consumo: 1.24 },
  DataGeracao: 'forjada'
});
const anexo = () => ({
  DriveFileId: 'arquivo_sintetico',
  DriveLink: 'https://outro.example',
  Nome: 'fatura-sintetica.pdf',
  Mime: 'application/pdf',
  Tamanho: 42,
  Base64: 'arquivo-ignorado',
  StoragePath: 'caminho-ignorado'
});

test('salva rascunho e reabre dados com metadados exclusivos do Drive', async () => {
  const { api, docs } = contexto();
  const p = proposta();
  p.Anexos = { Fatura: anexo() };
  p.OwnerUid = 'outro-uid';
  const salvo = await api.salvarPropostaExpansao({ proposta: p, geracao: geracao(2026, 0.6) });
  assert.equal(salvo.ok, true);
  const { proposta: aberta } = await api.getPropostasExpansao({ id: salvo.id });
  assert.equal(aberta.OwnerUid, 'equipe-a');
  assert.equal(aberta.Geracao, undefined);
  assert.equal(aberta.Anexos.Fatura.DriveLink, 'https://drive.google.com/file/d/arquivo_sintetico/view');
  assert.equal(aberta.Anexos.Fatura.Base64, undefined);
  assert.equal(aberta.Anexos.Fatura.StoragePath, undefined);
  assert.equal(docs.size, 1);
});

test('congela geração de 2026, exige revisão explícita e grava versão anterior ao recalcular para 2027', async () => {
  const { api } = contexto();
  const criada = await api.salvarPropostaExpansao({ proposta: proposta(), gerar: true, geracao: geracao(2026, 0.6) });
  assert.equal(criada.ok, true);
  assert.equal(criada.proposta.Geracao.DataGeracao, criada.proposta.AtualizadoEm);
  assert.equal(criada.proposta.Geracao.PercentualFioBGD2, 0.6);
  const id = criada.id;
  const nova = await api.salvarPropostaExpansao({
    id, versaoEsperada: criada.versao, proposta: { Observacoes: 'Revisão do atendimento', Status: 'Enviada' },
    geracao: geracao(2027, 0.75)
  });
  assert.equal(nova.ok, true);
  assert.equal(nova.novaGeracao, false);
  const modificada = await api.salvarPropostaExpansao({
    id, versaoEsperada: nova.versao, proposta: { Resumo: { KwpAdicional: 9 } }
  });
  assert.equal(modificada.ok, false);
  assert.match(modificada.erro, /Recalcular/);
  const recalculada = await api.salvarPropostaExpansao({
    id, versaoEsperada: nova.versao, proposta: { Resumo: { KwpAdicional: 9 } },
    recalcular: true, geracao: geracao(2027, 0.75)
  });
  assert.equal(recalculada.ok, true);
  assert.equal(recalculada.proposta.Geracao.PercentualFioBGD2, 0.75);
  assert.equal(recalculada.proposta.Geracao.DataGeracao, recalculada.proposta.AtualizadoEm);
  assert.equal(recalculada.proposta.CriadoEm, criada.proposta.CriadoEm);
  assert.equal(recalculada.proposta.GeracoesAnteriores.length, 1);
  assert.equal(recalculada.proposta.GeracoesAnteriores[0].Geracao.PercentualFioBGD2, 0.6);
  assert.equal(recalculada.proposta.GeracoesAnteriores[0].Resumo.KwpAdicional, 8.06);
});

test('bloqueia versão velha, conta alheia e sessão anônima', async () => {
  const { api, usuario } = contexto();
  const criada = await api.salvarPropostaExpansao({ proposta: proposta() });
  const id = criada.id;
  const atualizada = await api.salvarPropostaExpansao({ id, versaoEsperada: criada.versao, proposta: { Observacoes: 'Nota' } });
  assert.equal(atualizada.ok, true);
  const atrasada = await api.salvarPropostaExpansao({ id, versaoEsperada: criada.versao, proposta: { Observacoes: 'Velha' } });
  assert.equal(atrasada.ok, false);
  assert.match(atrasada.erro, /outra sessão/);
  usuario({ uid: 'equipe-b' });
  assert.equal((await api.getPropostasExpansao()).propostas.length, 1);
  const alheia = await api.salvarPropostaExpansao({ id, versaoEsperada: atualizada.versao, proposta: { Observacoes: 'Alheia' } });
  assert.equal(alheia.ok, false);
  usuario({ uid: 'anonimo', isAnonymous: true });
  assert.equal((await api.getPropostasExpansao()).ok, false);
});

test('valida o tipo da fatura e permite retirar um anexo antes de nova geração', async () => {
  const { api } = contexto();
  const invalida = await api.salvarPropostaExpansao({
    proposta: { ...proposta(), Anexos: { Fatura: { ...anexo(), Mime: 'image/png' } } }
  });
  assert.equal(invalida.ok, false);
  const criada = await api.salvarPropostaExpansao({ proposta: { ...proposta(), Anexos: { Fatura: anexo() } } });
  const id = criada.id;
  const atualizada = await api.salvarPropostaExpansao({ id, versaoEsperada: criada.versao, proposta: { Anexos: {} } });
  assert.equal(atualizada.ok, true);
  const aberta = await api.getPropostasExpansao({ id });
  assert.equal(aberta.proposta.Anexos.Fatura, undefined);
});

