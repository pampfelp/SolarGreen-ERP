(function (root) {
  'use strict';

  const cores = { existente: '#17191e', nova: '#236ed1', telhado: '#91969d', parede: '#e3e5e7' };
  const angulo = Math.PI / 7;
  const margem = 0.3;
  const espaco = 0.02;
  const montagens = new WeakMap();

  function dimensionar({ placasExistentes, placasNovas, alturaM, larguraM } = {}) {
    const quantidade = valor => valor !== null && valor !== '' && Number.isSafeInteger(Number(valor)) && Number(valor) >= 0
      ? Number(valor) : null;
    const dimensao = (valor, padrao) => Number.isFinite(Number(valor)) && Number(valor) > 0 ? Number(valor) : padrao;
    const existentes = quantidade(placasExistentes);
    const novas = quantidade(placasNovas) ?? 0;
    const altura = dimensao(alturaM, 2.38);
    const largura = dimensao(larguraM, 1.13);
    const existentesNoDesenho = existentes ?? 0;
    const total = existentesNoDesenho + novas;
    const porAgua = Math.max(1, Math.ceil(total / 2));
    const colunas = Math.min(porAgua, Math.ceil(Math.sqrt(porAgua * (2 * altura * Math.cos(angulo) / largura))));
    const linhas = Math.ceil(porAgua / colunas);
    const capacidade = linhas * colunas;
    const larguraTelhado = largura * colunas + espaco * (colunas - 1) + 2 * margem;
    const comprimentoAgua = altura * linhas + espaco * (linhas - 1) + 2 * margem;
    const placas = Array.from({ length: total }, (_, indice) => {
      const posicao = indice % capacidade;
      return {
        tipo: indice < existentesNoDesenho ? 'existente' : 'nova',
        agua: indice < capacidade ? 1 : -1,
        x: margem + (posicao % colunas) * (largura + espaco),
        s: margem + Math.floor(posicao / colunas) * (altura + espaco)
      };
    });
    return { existentes, novas, altura, largura, larguraTelhado, comprimentoAgua, placas };
  }

  function legenda(modelo) {
    return (modelo.existentes === null ? 'Quantidade existente não informada' : modelo.existentes + ' existentes')
      + ' · ' + modelo.novas + ' a adicionar';
  }

  function desenharSvg(modelo) {
    const { larguraTelhado, comprimentoAgua, largura, altura, placas } = modelo;
    const projecao = Math.cos(angulo);
    const meio = comprimentoAgua * projecao;
    const comprimento = meio * 2;
    const folga = Math.max(larguraTelhado, comprimento) * 0.06;
    const larguraVista = larguraTelhado + 2 * folga;
    const alturaVista = comprimento + 2 * folga;
    const rects = placas.map(placa => {
      const y = placa.agua === 1 ? meio + placa.s * projecao : meio - (placa.s + altura) * projecao;
      return '<rect data-placa="' + placa.tipo + '" x="' + placa.x + '" y="' + y + '" width="' + largura
        + '" height="' + (altura * projecao) + '" fill="' + cores[placa.tipo] + '" stroke="#b3c0cf" stroke-width="0.012"/>';
    }).join('');
    const escala = 1200 / Math.max(larguraVista, alturaVista);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" role="img" width="' + Math.round(larguraVista * escala)
      + '" height="' + Math.round(alturaVista * escala)
      + '" viewBox="' + [-folga, -folga, larguraVista, alturaVista].join(' ') + '"><title>Vista superior do telhado. ' + legenda(modelo)
      + '.</title><rect width="' + larguraTelhado + '" height="' + comprimento + '" fill="' + cores.telhado
      + '"/><path d="M0 ' + meio + 'H' + larguraTelhado + '" fill="none" stroke="#4c5158" stroke-width="0.04"/>' + rects + '</svg>';
    return { svg, largura: larguraVista, altura: alturaVista };
  }

  function svgParaPng(documento, imagem) {
    return new Promise(resolve => {
      const janela = documento.defaultView;
      const fonte = janela.URL.createObjectURL(new Blob([imagem.svg], { type: 'image/svg+xml;charset=utf-8' }));
      const svg = new janela.Image();
      svg.onload = () => {
        try {
          const canvas = documento.createElement('canvas');
          const escala = 1200 / Math.max(imagem.largura, imagem.altura);
          canvas.width = Math.round(imagem.largura * escala);
          canvas.height = Math.round(imagem.altura * escala);
          const contexto = canvas.getContext('2d');
          if (!contexto) return resolve(null);
          contexto.drawImage(svg, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        } finally {
          janela.URL.revokeObjectURL(fonte);
        }
      };
      svg.onerror = () => {
        janela.URL.revokeObjectURL(fonte);
        resolve(null);
      };
      svg.src = fonte;
    });
  }

  function montarCena(THREE, modelo) {
    const { larguraTelhado, comprimentoAgua, largura, altura, placas } = modelo;
    const larguraCasa = larguraTelhado * 0.95;
    const profundidadeCasa = 2 * comprimentoAgua * Math.cos(angulo) * 0.95;
    const topo = 2.7 + comprimentoAgua * Math.sin(angulo);
    const alturaParede = topo - profundidadeCasa / 2 * Math.tan(angulo);
    const cena = new THREE.Scene();
    const parede = new THREE.MeshLambertMaterial({ color: cores.parede, side: THREE.DoubleSide });
    const cobertura = new THREE.MeshLambertMaterial({ color: cores.telhado });
    const materiais = {
      existente: new THREE.MeshBasicMaterial({ color: cores.existente }),
      nova: new THREE.MeshBasicMaterial({ color: cores.nova })
    };
    const casa = new THREE.Mesh(new THREE.BoxGeometry(larguraCasa, alturaParede, profundidadeCasa), parede);
    casa.position.y = alturaParede / 2;
    cena.add(casa);

    const frontoes = new THREE.BufferGeometry();
    const vertices = [-1, 1].flatMap(sinal => {
      const x = sinal * larguraCasa / 2;
      return [x, alturaParede, -profundidadeCasa / 2, x, topo, 0, x, alturaParede, profundidadeCasa / 2];
    });
    frontoes.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    frontoes.computeVertexNormals();
    cena.add(new THREE.Mesh(frontoes, parede));

    const placaGeo = placas.length ? new THREE.BoxGeometry(largura, 0.036, altura) : null;
    const aguaGeo = new THREE.BoxGeometry(larguraTelhado, 0.14, comprimentoAgua);
    for (const lado of [1, -1]) {
      const agua = new THREE.Group();
      agua.position.y = topo;
      agua.rotation.x = lado * angulo;
      const plano = new THREE.Mesh(aguaGeo, cobertura);
      plano.position.set(0, -0.07, lado * comprimentoAgua / 2);
      agua.add(plano);
      for (const tipo of ['existente', 'nova']) {
        const grupo = placas.filter(placa => placa.agua === lado && placa.tipo === tipo);
        if (!grupo.length) continue;
        const malha = new THREE.InstancedMesh(placaGeo, materiais[tipo], grupo.length);
        malha.name = tipo;
        const matriz = new THREE.Matrix4();
        grupo.forEach((placa, indice) => {
          matriz.makeTranslation(placa.x + largura / 2 - larguraTelhado / 2, 0.024, lado * (placa.s + altura / 2));
          malha.setMatrixAt(indice, matriz);
        });
        malha.instanceMatrix.needsUpdate = true;
        agua.add(malha);
      }
      cena.add(agua);
    }
    cena.add(new THREE.HemisphereLight(0xffffff, 0xa4a9b2, 2.5));
    const luz = new THREE.DirectionalLight(0xffffff, 1.4);
    luz.position.set(3, 8, 4);
    cena.add(luz);
    const recursos = new Set([parede, cobertura, ...Object.values(materiais), casa.geometry, frontoes, aguaGeo, placaGeo]);
    cena.traverse(objeto => { if (objeto.isInstancedMesh) recursos.add(objeto); });
    return { cena, dispose: () => recursos.forEach(recurso => recurso?.dispose()) };
  }

  async function importarThree() {
    const [THREE, { OrbitControls }] = await Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]);
    return { THREE, OrbitControls };
  }

  function montar(elemento, dados, importar = importarThree) {
    montagens.get(elemento)?.dispose();
    const modelo = dimensionar(dados);
    const imagem = desenharSvg(modelo);
    const documento = elemento.ownerDocument;
    const janela = documento.defaultView;
    const figura = documento.createElement('div');
    figura.className = 'exp-telhado-figura';
    const rodape = documento.createElement('div');
    rodape.className = 'exp-telhado-legenda';
    const itens = [
      [modelo.existentes === null ? 'Quantidade existente não informada' : modelo.existentes + ' existentes', 'existente'],
      [modelo.novas + ' a adicionar', 'nova']
    ];
    for (const [texto, tipo] of itens) {
      const item = documento.createElement('span');
      item.className = 'exp-telhado-' + tipo;
      item.textContent = texto;
      rodape.append(item);
    }
    const nota = documento.createElement('small');
    nota.textContent = 'Desenho ilustrativo.';
    rodape.append(nota);
    const reset = documento.createElement('button');
    reset.type = 'button';
    reset.className = 'btn btn-ghost exp-telhado-reset';
    reset.textContent = 'Vista padrão';
    reset.hidden = true;
    elemento.replaceChildren(figura, rodape, reset);

    let recurso3d;
    let descartado = false;
    function mostrarSvg() {
      figura.innerHTML = imagem.svg;
      const svg = figura.firstElementChild;
      svg.style.display = 'block';
      svg.style.width = '100%';
      svg.style.height = 'auto';
      svg.style.maxHeight = '420px';
      reset.hidden = true;
    }
    mostrarSvg();

    function liberar3d() {
      recurso3d?.dispose();
      recurso3d = null;
    }

    const pronto = (async () => {
      if (!janela.WebGLRenderingContext && !janela.WebGL2RenderingContext) return;
      let renderer;
      let geometria;
      let controles;
      let observador;
      let canvas;
      let contexto;
      const perderContexto = evento => {
        evento.preventDefault();
        liberar3d();
        if (!descartado) mostrarSvg();
      };
      const liberar = () => {
        observador?.disconnect();
        controles?.dispose();
        geometria?.dispose();
        canvas?.removeEventListener('webglcontextlost', perderContexto);
        renderer?.dispose();
        contexto?.getExtension('WEBGL_lose_context')?.loseContext();
      };
      try {
        const { THREE, OrbitControls } = await importar();
        if (descartado) return;
        canvas = documento.createElement('canvas');
        const atributos = { alpha: true, antialias: true, preserveDrawingBuffer: true };
        contexto = canvas.getContext('webgl2', atributos) || canvas.getContext('webgl', atributos);
        if (!contexto) return;
        renderer = new THREE.WebGLRenderer({ canvas, context: contexto, ...atributos });
        renderer.setPixelRatio(Math.min(janela.devicePixelRatio || 1, 2));
        canvas.style.display = 'block';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'Telhado em três dimensões. ' + legenda(modelo) + '.');
        geometria = montarCena(THREE, modelo);
        const escala = Math.max(modelo.larguraTelhado, 2 * modelo.comprimentoAgua);
        const camera = new THREE.PerspectiveCamera(36, 1, 0.05, escala * 30);
        const volume = new THREE.Box3().setFromObject(geometria.cena).getBoundingSphere(new THREE.Sphere());
        const alvo = volume.center;
        const distancia = volume.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.06;
        const posicao = new THREE.Vector3(1.25, 2.2, 1.6).normalize().multiplyScalar(distancia).add(alvo);
        camera.position.copy(posicao);
        controles = new OrbitControls(camera, canvas);
        controles.target.copy(alvo);
        controles.enablePan = false;
        controles.minDistance = escala * 0.55;
        controles.maxDistance = escala * 4;
        controles.update();
        controles.saveState();
        const render = () => renderer.render(geometria.cena, camera);
        controles.addEventListener('change', render);
        const ajustar = () => {
          const largura = Math.max(1, figura.clientWidth || 640);
          const altura = Math.min(420, Math.max(180, Math.round(largura * 0.56)));
          renderer.setSize(largura, altura);
          camera.aspect = largura / altura;
          camera.updateProjectionMatrix();
          render();
        };
        ajustar();
        figura.replaceChildren(canvas);
        if (janela.ResizeObserver) {
          observador = new janela.ResizeObserver(ajustar);
          observador.observe(figura);
        }
        canvas.addEventListener('webglcontextlost', perderContexto);
        recurso3d = { canvas, render, reset: () => controles.reset(), dispose: liberar };
        reset.hidden = false;
      } catch {
        liberar();
        if (!descartado) mostrarSvg();
      }
    })();

    const controle = {
      pronto,
      get modo() { return recurso3d ? '3d' : 'svg'; },
      vistaPadrao() { recurso3d?.reset(); },
      async snapshotPNG() {
        if (descartado) return null;
        if (recurso3d) {
          try {
            recurso3d.render();
            const png = recurso3d.canvas.toDataURL('image/png');
            if (png.startsWith('data:image/png;base64,')) return png;
          } catch {
            // O mesmo desenho permanece disponível para a versão impressa.
          }
        }
        return svgParaPng(documento, imagem).catch(() => null);
      },
      dispose() {
        descartado = true;
        liberar3d();
        if (montagens.get(elemento) === controle) {
          montagens.delete(elemento);
          elemento.replaceChildren();
        }
      }
    };
    reset.addEventListener('click', controle.vistaPadrao);
    montagens.set(elemento, controle);
    return controle;
  }

  const api = { dimensionar, desenharSvg, montar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SGExpansaoTelhado3D = api;
})(typeof window !== 'undefined' ? window : null);
