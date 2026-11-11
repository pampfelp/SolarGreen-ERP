'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../legado/CODE GS.txt'), 'utf8');
const fatura = Buffer.from('%PDF-1.7\nFatura de teste');
const fixture = fatura.toString('base64');

function ambiente({ equipe = true, publico = false, foraDaRaiz = false } = {}) {
  const iterar = valores => { let i = 0; return { hasNext: () => i < valores.length, next: () => valores[i++] }; };
  const raiz = { getId: () => 'raiz', isTrashed: () => false,
    getSharingAccess: () => publico ? 'anyone' : 'private',
    getFoldersByName: () => iterar([pasta]) };
  const arquivos = [];
  const pasta = { isTrashed: () => false, getSharingAccess: () => 'private',
    getParents: () => iterar(foraDaRaiz ? [] : [raiz]),
    getFilesByName: nome => iterar(arquivos.filter(a => a.nome === nome)),
    createFile: blob => {
      const arquivo = {
        nome: blob.nome,
        getId: () => 'arquivo', getUrl: () => 'https://drive.google.com/file/d/arquivo/view',
        getMimeType: () => blob.mime, getSize: () => blob.bytes.length,
        getBlob: () => ({ getBytes: () => blob.bytes }), getParents: () => iterar([pasta]),
        isTrashed: () => false, getSharingAccess: () => 'private',
        setDescription: desc => { arquivo.desc = desc; }, getDescription: () => arquivo.desc
      };
      arquivos.push(arquivo);
      return arquivo;
    } };
  const ctx = {
    Utilities: { base64Decode: s => Buffer.from(s, 'base64'), base64Encode: b => Buffer.from(b).toString('base64'),
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64url'),
      newBlob: (bytes, mime, nome) => ({ bytes, mime, nome }),
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, bytes) => require('node:crypto').createHash(alg).update(bytes).digest() },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'raiz' }) },
    DriveApp: { Access: { ANYONE: 'anyone', ANYONE_WITH_LINK: 'anyone-with-link' },
      getFolderById: () => raiz, getFileById: () => arquivos[0] },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  ctx.fbConfig_ = () => ({});
  ctx.disparoAutenticar_ = (cfg, body) => body.idToken === 'valido' ? { uid: 'vendedor' } : { erro: 'não autorizado' };
  ctx.fsGet_ = (cfg, path) => ({
    'expansao_equipe/vendedor': { dados: { Ativo: equipe } },
    'clientes/cliente': { dados: { Nome: 'Cliente Teste' } },
    'propostas_expansao/proposta': { dados: { Anexos: { Fatura: { DriveFileId: 'arquivo' } } } }
  }[path] ?? null);
  return { ctx, arquivos };
}

const upload = { idToken: 'valido', idCliente: 'cliente', tipo: 'Fatura', nome: 'conta.pdf',
  mime: 'application/pdf', base64: fixture };
const download = { idToken: 'valido', idProposta: 'proposta', tipo: 'Fatura' };

test('envia ao Drive, repete com a mesma referência e recupera bytes da proposta', () => {
  const { ctx, arquivos } = ambiente();
  const primeira = ctx.actionUploadAnexoExpansao(upload);
  assert.equal(primeira.ok, true);
  assert.equal(primeira.anexo.Tamanho, fatura.length);
  assert.equal(primeira.anexo.DriveFileId, ctx.actionUploadAnexoExpansao(upload).anexo.DriveFileId);
  assert.equal(arquivos.length, 1);
  assert.equal(ctx.actionBaixarAnexoExpansao(download).base64, fixture);
});

test('exige token válido e marcador de equipe protegido em todas as ações', () => {
  for (const entrada of [ambiente({ equipe: false }).ctx, ambiente().ctx]) {
    const token = entrada.fsGet_({}, 'expansao_equipe/vendedor').dados.Ativo ? '' : 'valido';
    assert.equal(entrada.actionUploadAnexoExpansao({ ...upload, idToken: token }).ok, false);
    assert.equal(entrada.actionBaixarAnexoExpansao({ ...download, idToken: token }).ok, false);
  }
});

test('impede arquivo de outra pasta, destino público e tipo incompatível', () => {
  const externo = ambiente({ foraDaRaiz: true }).ctx;
  assert.equal(externo.actionUploadAnexoExpansao(upload).ok, true);
  assert.equal(externo.actionBaixarAnexoExpansao(download).ok, false);
  assert.equal(ambiente({ publico: true }).ctx.actionUploadAnexoExpansao(upload).ok, false);
  const { ctx, arquivos } = ambiente();
  assert.equal(ctx.actionUploadAnexoExpansao({ ...upload, base64: Buffer.from('HTML').toString('base64') }).ok, false);
  assert.equal(ctx.actionUploadAnexoExpansao({ ...upload, mime: 'image/png' }).ok, false);
  assert.equal(arquivos.length, 0);
});
