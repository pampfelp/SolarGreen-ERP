const assert = require('node:assert/strict');
const { test } = require('node:test');
const { dimensionar, desenharSvg, montar } = require('../js/expansao-telhado3d.js');

test('distribui 10 existentes e 13 novas e preserva as contagens e cores no SVG', () => {
  const modelo = dimensionar({ placasExistentes: 10, placasNovas: 13, alturaM: 2.17, larguraM: 1.09 });
  const { placas } = modelo;
  assert.equal(placas.length, 23);
  assert.ok(placas.slice(0, 10).every(placa => placa.tipo === 'existente' && placa.agua === 1));
  assert.ok(placas.slice(10).every(placa => placa.tipo === 'nova'));
  assert.ok(placas.some(placa => placa.agua === -1));
  assert.ok(placas.slice(placas.findIndex(placa => placa.agua === -1)).every(placa => placa.agua === -1));

  const quaseIgual = (a, b) => Math.abs(a - b) < 1e-10;
  assert.equal(placas[0].x, 0.3);
  assert.equal(placas[0].s, 0.3);
  assert.ok(quaseIgual(placas[1].x - placas[0].x - modelo.largura, 0.02));
  for (const placa of placas) {
    assert.ok(placa.x >= 0.3 && placa.s >= 0.3);
    assert.ok(placa.x + modelo.largura <= modelo.larguraTelhado - 0.3 + 1e-10);
    assert.ok(placa.s + modelo.altura <= modelo.comprimentoAgua - 0.3 + 1e-10);
  }

  const { svg } = desenharSvg(modelo);
  assert.match(svg, /10 existentes · 13 a adicionar/);
  assert.equal((svg.match(/data-placa="existente"[^>]+fill="#17191e"/g) || []).length, 10);
  assert.equal((svg.match(/data-placa="nova"[^>]+fill="#236ed1"/g) || []).length, 13);
});

test('mostra somente as novas quando a quantidade instalada é desconhecida', () => {
  const modelo = dimensionar({ placasExistentes: null, placasNovas: 13 });
  const { svg } = desenharSvg(modelo);
  assert.equal(modelo.existentes, null);
  assert.equal(modelo.altura, 2.38);
  assert.equal(modelo.largura, 1.13);
  assert.equal(modelo.placas.length, 13);
  assert.ok(modelo.placas.every(placa => placa.tipo === 'nova'));
  assert.match(svg, /Quantidade existente não informada · 13 a adicionar/);
  assert.doesNotMatch(svg, /data-placa="existente"/);
  assert.match(desenharSvg(dimensionar({ placasExistentes: 0 })).svg, /0 existentes · 0 a adicionar/);
});

function documentoSimulado(webgl = false) {
  const urlLiberadas = [];
  const defaultView = {
    WebGLRenderingContext: webgl ? function () {} : undefined,
    URL: {
      createObjectURL() { return 'blob:teste'; },
      revokeObjectURL(url) { urlLiberadas.push(url); }
    },
    Image: class { set src(url) { queueMicrotask(() => this.onload()); } }
  };
  const documento = {
    defaultView, urlLiberadas,
    createElement(tag) {
      return {
        ownerDocument: documento, children: [], firstElementChild: { style: {} },
        append(filho) { this.children.push(filho); },
        replaceChildren(...filhos) { this.children = filhos; },
        addEventListener() {},
        getContext: tag === 'canvas' ? () => ({ drawImage() {} }) : undefined,
        toDataURL: tag === 'canvas' ? () => 'data:image/png;base64,test' : undefined
      };
    }
  };
  return documento;
}

test('permanece no SVG sem WebGL, gera o PNG de impressão e limpa a montagem', async () => {
  const documento = documentoSimulado();
  const elemento = documento.createElement('div');
  let importou = false;
  const controle = montar(elemento, { placasExistentes: 10, placasNovas: 13 }, () => { importou = true; });
  await controle.pronto;
  assert.equal(importou, false);
  assert.equal(controle.modo, 'svg');
  assert.equal(elemento.children[2].hidden, true);
  assert.equal(await controle.snapshotPNG(), 'data:image/png;base64,test');
  assert.deepEqual(documento.urlLiberadas, ['blob:teste']);
  controle.dispose();
  controle.dispose();
  assert.equal(elemento.children.length, 0);
  assert.equal(await controle.snapshotPNG(), null);
});

test('troca de montagem enquanto o Three carrega e mantém o SVG quando o import falha', async () => {
  const elemento = documentoSimulado(true).createElement('div');
  let rejeitar;
  const primeiro = montar(elemento, { placasNovas: 1 }, () => new Promise((_, reject) => { rejeitar = reject; }));
  const segundo = montar(elemento, { placasNovas: 13 }, async () => { throw new Error('offline'); });
  rejeitar(new Error('offline'));
  await Promise.all([primeiro.pronto, segundo.pronto]);
  assert.equal(await primeiro.snapshotPNG(), null);
  assert.equal(segundo.modo, 'svg');
  assert.match(elemento.children[0].innerHTML, /13 a adicionar/);
  primeiro.dispose();
  assert.equal(elemento.children.length, 3);
  segundo.dispose();
  assert.equal(elemento.children.length, 0);
});
