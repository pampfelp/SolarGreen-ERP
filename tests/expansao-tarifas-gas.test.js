'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { compararFioB } = require('../js/expansao-calculo.js');

const source = fs.readFileSync(path.join(__dirname, '../legado/CODE GS.txt'), 'utf8');
const config = 'config/tarifas_equatorial_pa';
const lei = 'config/fiob_gd2';
const recurso = 'e8717aa8-2521-453f-bf16-fbb9a16eea39';
const reg = {
  SigNomeAgente: 'EQUATORIAL PA', DscComponenteTarifario: 'TUSD_FioB',
  DscSubGrupoTarifario: 'B1', DscBaseTarifaria: 'Tarifa de Aplicação', DscUnidade: 'R$/MWh',
  DatInicioVigencia: '2026-09-18', DatFimVigencia: '2027-08-06',
  DscSubClasseConsumidor: 'Residencial', DscModalidadeTarifaria: 'Convencional',
  DscPostoTarifario: 'Não se aplica', DscResolucaoHomologatoria: 'REH 3.608',
  VlrComponenteTarifario: '379,352320561'
};
const social = { ...reg, DscSubClasseConsumidor: 'Residencial Desconto Social – faixa 02' };

function ambiente({ data = '2026-11-11', registros = [reg], documentos = {}, equipe = true } = {}) {
  const banco = new Map(Object.entries(documentos).map(([k, dados]) => [k, { dados, updateTime: '1' }]));
  const chamadas = [];
  const pushes = [];
  let falha = false;
  let sequencia = 0;
  const ctx = vm.createContext({
    console,
    Date: class extends Date { static now() { return Date.parse(data + 'T12:00:00Z'); } },
    Utilities: {
      formatDate(d, fuso, formato) {
        assert.equal(fuso, 'America/Belem');
        return d.toISOString().slice(0, formato === 'yyyy-MM' ? 7 : 10);
      },
      getUuid() { return 'id-' + ++sequencia; },
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest(alg, s) { return crypto.createHash(alg).update(s).digest(); },
      base64EncodeWebSafe(bytes) { return bytes.toString('base64url'); }
    },
    UrlFetchApp: {
      fetch(url) {
        const u = new URL(url);
        chamadas.push(u);
        if (falha) return { getResponseCode: () => 503 };
        let result;
        if (u.pathname.endsWith('package_show')) {
          result = { resources: [
            { name: 'componentes-tarifarias-' + data.slice(0, 4) + '.parquet', id: 'parquet' },
            { name: 'componentes-tarifarias-' + data.slice(0, 4) + '.csv', id: recurso, datastore_active: true }
          ] };
        } else {
          const offset = Number(u.searchParams.get('offset'));
          const limit = Number(u.searchParams.get('limit'));
          result = { records: registros.slice(offset, offset + limit), total: registros.length };
        }
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ success: true, result }) };
      }
    }
  });
  vm.runInContext(source, ctx);
  ctx.fbConfig_ = () => ({});
  ctx.fsGet_ = (_, key) => banco.get(key) || null;
  ctx.fsListar_ = (_, coll) => {
    assert.equal(coll, 'expansao_equipe');
    return [
      { _id: 'uid-admin', Ativo: true, Admin: true, IdVendedor: 'legado-admin' },
      { _id: 'uid-inativo', Ativo: false, Admin: true },
      { _id: 'uid-vendedor', Ativo: true, Admin: false }
    ];
  };
  ctx.fsUpdateRico_ = (_, key, campos, condicao) => ({ key, campos, condicao });
  ctx.fsCommit_ = (_, writes) => {
    for (const { key, condicao } of writes) {
      if (condicao.exists === false && banco.has(key)) return false;
      if (condicao.updateTime && condicao.updateTime !== banco.get(key)?.updateTime) return false;
    }
    for (const { key, campos } of writes) {
      const velho = banco.get(key);
      banco.set(key, { dados: { ...velho?.dados, ...structuredClone(campos) }, updateTime: String(++sequencia) });
    }
    return true;
  };
  ctx.notifEnviarDoc_ = (_, n) => pushes.push(structuredClone(n));
  ctx.expansaoAutenticarEquipe_ = (_, body) => equipe && body.idToken === 'token-equipe';
  const docs = coll => [...banco.entries()].filter(([key]) => key.startsWith(coll + '/')).map(([, doc]) => doc.dados);
  return { ctx, banco, chamadas, pushes, docs, falhar() { falha = true; } };
}

test('seleciona a tarifa de aplicação, pagina e preserva subclasse, modalidade e posto', () => {
  const branca = { ...reg, DscModalidadeTarifaria: 'Branca', DscPostoTarifario: 'Ponta',
    VlrComponenteTarifario: '1157,024706618' };
  const registros = Array.from({ length: 50 }, () => ({ ...reg, DscDetalheConsumidor: 'SCEE' }));
  registros.push(social, branca,
    { ...reg, DscBaseTarifaria: 'Base Econômica', VlrComponenteTarifario: '12' },
    { ...reg, DscBaseTarifaria: 'CVA', VlrComponenteTarifario: '15' });
  const { ctx, banco, chamadas } = ambiente({ registros });
  assert.equal(ctx.atualizarTarifasEquatorialPA().ok, true);
  assert.deepEqual(chamadas.slice(1).map(u => u.searchParams.get('offset')), ['0', '50']);
  assert.equal(JSON.parse(chamadas[1].searchParams.get('filters')).DscBaseTarifaria, 'Tarifa de Aplicação');
  const v = banco.get(config).dados.vigencias;
  assert.equal(v.length, 3);
  assert.equal(v.find(r => r.posto === 'Ponta').tarifa, 1.157024706618);
  const tarifa = v.find(r => r.subclasse === social.DscSubClasseConsumidor);
  assert.equal(tarifa.tarifa, 0.379352320561);
  assert.equal(tarifa.inicio, '2026-09-18');
  assert.equal(tarifa.fim, '2027-08-06');
  assert.match(tarifa.fonte, new RegExp(recurso));
  assert.equal(banco.get(lei).dados.percentualVigente, 0.60);
});

test('mudança gera histórico, um aviso e push somente para admin ativo', () => {
  const { ctx, docs, pushes } = ambiente();
  assert.equal(ctx.atualizarTarifasEquatorialPA().registrosAlterados, 1);
  assert.equal(ctx.atualizarTarifasEquatorialPA().registrosAlterados, 0);
  const [historico] = docs('tarifas_historico');
  assert.equal(historico.mudancas[0].depois.tarifa, 0.379352320561);
  assert.equal(docs('notificacoes').length, 1);
  assert.deepEqual(pushes.map(n => n.para), [['legado-admin']]);
});

test('conserva os valores em falha e avisa só na segunda falha consecutiva', () => {
  const { ctx, banco, docs, pushes, falhar } = ambiente();
  ctx.atualizarTarifasEquatorialPA();
  const anterior = banco.get(config).dados;
  falhar();
  assert.equal(ctx.atualizarTarifasEquatorialPA().falhasConsecutivas, 1);
  assert.equal(ctx.atualizarTarifasEquatorialPA().falhasConsecutivas, 2);
  assert.equal(ctx.atualizarTarifasEquatorialPA().falhasConsecutivas, 3);
  assert.equal(banco.get(config).dados.atualizadoEm, anterior.atualizadoEm);
  assert.deepEqual(banco.get(config).dados.vigencias, anterior.vigencias);
  assert.match(banco.get(config).dados.ultimaFalha, /503/);
  assert.equal(docs('tarifas_historico').length, 1);
  assert.equal(pushes.length, 2);
  assert.match(pushes[1].corpo, /duas consultas/);
});

test('valores incompatíveis na mesma vigência não atualizam o dado', () => {
  const { ctx, banco } = ambiente({ registros: [reg, { ...reg, VlrComponenteTarifario: '380' }] });
  assert.equal(ctx.atualizarTarifasEquatorialPA().ok, false);
  assert.match(banco.get(config).dados.ultimaFalha, /divergentes/);
  assert.equal(banco.get(config).dados.vigencias, undefined);
});

test('avisa e grava a mudança anual de GD II mesmo quando a consulta da ANEEL falha', () => {
  const { ctx, banco, docs, pushes, falhar } = ambiente({
    data: '2027-01-04', documentos: { [lei]: { anoVigente: 2026, percentualVigente: 0.60, percentuais: { 2026: 0.60 } } }
  });
  falhar();
  assert.equal(ctx.atualizarTarifasEquatorialPA().ok, false);
  assert.equal(banco.get(lei).dados.percentualVigente, 0.75);
  assert.equal(docs('tarifas_historico')[0].gd2Anterior.percentualVigente, 0.60);
  assert.match(pushes[0].corpo, /60% → 75%/);
});

test('registra só valores anônimos e compara a referência da fatura', () => {
  const { ctx, banco, docs } = ambiente({ registros: [reg, social] });
  ctx.atualizarTarifasEquatorialPA();
  const subclasse = social.DscSubClasseConsumidor;
  const comparacao = compararFioB({
    inicio: '2026-09-21', fim: '2026-10-21', subclasse, modalidade: 'Convencional',
    vigencias: banco.get(config).dados.vigencias,
    percentuais: banco.get(lei).dados.percentuais, cobrado: 0.260931, kwhCompensados: 1410.42
  });
  assert.equal(comparacao.comparavel, true);
  assert.equal(comparacao.diferencaPct.toFixed(1), '14.6');
  const semVigencia = compararFioB({
    inicio: '2026-09-12', fim: '2026-10-12', subclasse, modalidade: 'Convencional',
    vigencias: banco.get(config).dados.vigencias,
    percentuais: banco.get(lei).dados.percentuais, cobrado: 0.260931
  });
  assert.equal(semVigencia.comparavel, false);

  const body = { idToken: 'token-equipe', observacao: {
    referencia: '2026-10', subclasse, modalidade: 'Convencional', icmsPct: 19,
    pisPct: 0.73, cofinsPct: 3.38, tarifaConsumo: 0.91, tarifaGD2: 0.260931, bandeira: 0,
    fioBPrevisto: comparacao.previsto, nome: 'NOME SIMULADO', uc: 'UC SIMULADA', cpf: 'DOCUMENTO SIMULADO'
  } };
  assert.equal(ctx.actionRegistrarTarifaObservada(body).ok, true);
  assert.equal(ctx.actionRegistrarTarifaObservada(body).repetida, true);
  const [obs] = docs('tarifas_observadas');
  assert.equal(docs('tarifas_observadas').length, 1);
  assert.deepEqual(Object.keys(obs).sort(), ['bandeira', 'cofinsPct', 'diferencaFioBPct',
    'fioBPrevisto', 'fonte', 'icmsPct', 'modalidade', 'observadoEm', 'pisPct', 'referencia',
    'subclasse', 'tarifaConsumo', 'tarifaGD2'].sort());
  assert.equal(obs.bandeira, 0);
  assert.equal(obs.diferencaFioBPct.toFixed(1), '14.6');
  assert.equal(ctx.actionRegistrarTarifaObservada({ ...body, idToken: '' }).ok, false);
});

test('registra divergência de alíquota observada e não substitui referência recente por anterior', () => {
  const { ctx, banco, docs, pushes } = ambiente();
  const registrar = (referencia, icmsPct) => ctx.actionRegistrarTarifaObservada({
    idToken: 'token-equipe', observacao: { referencia, subclasse: 'Residencial', modalidade: 'Convencional', icmsPct }
  });
  assert.equal(registrar('2026-10', 19).ok, true);
  assert.equal(registrar('2026-11', 20).ok, true);
  assert.equal(registrar('2026-09', 18).ok, true);
  assert.equal(registrar('2027-01', 21).ok, false);
  assert.equal(docs('tarifas_observadas').length, 3);
  assert.equal(docs('tarifas_historico').length, 1);
  assert.equal(pushes.length, 1);
  const ultima = banco.get(config).dados.observacoes['Residencial | Convencional'];
  assert.deepEqual(ultima.icmsPct, { referencia: '2026-11', valor: 20 });
});

test('ignora texto livre em campos de classificação e alíquotas fora do intervalo', () => {
  const { ctx, docs } = ambiente();
  assert.equal(ctx.actionRegistrarTarifaObservada({ idToken: 'token-equipe', observacao: {
    referencia: '2026-10', subclasse: 'PESSOA SIMULADA', modalidade: 'ENDEREÇO SIMULADO',
    icmsPct: 101, pisPct: 'TEXTO SIMULADO', tarifaConsumo: 0.92
  } }).ok, true);
  const [obs] = docs('tarifas_observadas');
  assert.equal(obs.subclasse, 'Não informada');
  assert.equal(obs.modalidade, 'Não informada');
  assert.equal(obs.icmsPct, undefined);
  assert.equal(obs.pisPct, undefined);
});
