import assert from 'node:assert/strict';
import {generateMaterials, sizeAcCircuit, peSection} from '../rules.js';
const base = {
  modules: 9, watts: 620, inverter: 5, floors: 2, ground: 3,
  acIn: 5, acOut: 20, acFlex: 0, dcIn: 3, dcOut: 12, dcRoof: 10,
  connection: 'Bifásico 220 V', inverterOutput: 'Mono 220 V', roof: 'Fibrocimento sobre madeira',
  point: 'Padrão de entrada', conduit: 'Aparente'
};
const result = generateMaterials(base);
const qty = starts => result.items.find(i => i.description.startsWith(starts))?.quantity;
assert.equal(result.stats.kwp, 5.58);
assert.equal(qty('Cabo flexível de cobre PVC 70 °C 6 mm², fase (preto)'), '30');
assert.equal(qty('Cabo flexível de cobre PVC 70 °C 6 mm², PE'), '30');
// CA: 5 m internos (branco, plástica) e 20 m externos (preto, cunha); 3/4" para 6 mm².
const ca = starts => result.items.find(i => i.group === 'Parte CA' && i.description.startsWith(starts))?.quantity;
const cc = starts => result.items.find(i => i.group === 'Parte CC' && i.description.startsWith(starts))?.quantity;
assert.equal(ca('Eletroduto PVC rígido 3/4" branco'), '2');
assert.equal(ca('Eletroduto PVC rígido 3/4" preto'), '8');
assert.equal(ca('Curva 90° 3/4" branca'), '3');
assert.equal(ca('Curva 90° 3/4" preta'), '6');
assert.equal(ca('Abraçadeira plástica tipo D 3/4"'), '8');
assert.equal(ca('Abraçadeira tipo D com cunha 3/4"'), '26');
assert.equal(ca('Eletroduto corrugado'), undefined);
assert.equal(qty('Disjuntor bipolar 32 A curva C'), '1');
assert.match(result.warning, /Inversor monofásico 220 V entre fases; rede bifásica 127\/220 V/);
assert.match(result.warning, /fase 10 mm²; disjuntor 50 A até 10 kW ou 63 A/);
assert.equal(qty('Cabo solar 6 mm², vermelho'), '28');
assert.equal(cc('Eletroduto PVC rígido 3/4" branco'), '2');
assert.equal(cc('Eletroduto PVC rígido 3/4" preto'), '5');
assert.equal(cc('Eletroduto corrugado flexível preto 3/4"'), '11');
assert.equal(cc('Abraçadeira tipo D com cunha 3/4"'), String(12 + 4 + 10));
// Aterramento: haste da NT.00001 e cabo com a seção do PE.
assert.equal(qty('Haste de aterramento de aço cobreado 5/8"'), '1');
assert.equal(qty('Conector tipo cunha para haste'), '1');
assert.equal(qty('Cabo flexível de cobre 6 mm² verde, inversor até a haste'), '3');
assert.equal(qty('Eletroduto PVC rígido 1/2" para o cabo de terra'), '1');
const withFlex = generateMaterials({...base, acOut: 15, acFlex: 5});
assert.equal(withFlex.items.find(i => i.group === 'Parte CA' && i.description.startsWith('Eletroduto corrugado'))?.quantity, '6');
assert.equal(withFlex.items.find(i => i.description.startsWith('Cabo flexível de cobre PVC 70 °C 6 mm², fase (preto)'))?.quantity, '30');
const mono127 = generateMaterials({...base, connection: 'Mono 127 V', inverterOutput: 'Mono 127 V'});
assert.ok(mono127.items.some(i => i.description.startsWith('Cabo flexível de cobre 10 mm² verde, inversor até a haste')));
assert.ok(mono127.items.some(i => i.description.startsWith('Eletroduto PVC rígido 1/2" para o cabo de terra')));
const long = generateMaterials({...base, inverter: 6, acIn: 0, acOut: 80});
assert.ok(long.items.some(i => i.description.startsWith('Cabo flexível de cobre 16 mm² verde, inversor até a haste')));
assert.ok(long.items.some(i => i.description.startsWith('Eletroduto PVC rígido 1" para o cabo de terra')));
assert.deepEqual([6, 10, 16, 25, 35, 50].map(peSection), [6, 10, 16, 16, 16, 25]);
assert.throws(() => generateMaterials({...base, acIn: 0, acOut: 0, acFlex: 0}), /percurso CA/);
assert.throws(() => generateMaterials({...base, dcIn: -1}), /Preencha/);
assert.equal(qty('Fixador para telha de fibrocimento'), '36');
assert.equal(qty('Módulo fotovoltaico 620 W'), '9');
assert.equal(qty('Perfil de alumínio'), 'conforme layout');
assert.throws(() => generateMaterials({...base, modules: 0}), /Preencha/);
const mono = sizeAcCircuit(5, 25, 'Mono 127 V');
const bi = sizeAcCircuit(5, 25, 'Mono 220 V');
assert.ok(mono.current > bi.current);
assert.equal(mono.section, 10);
assert.equal(mono.breaker, 50);
assert.equal(bi.section, 6);
assert.equal(bi.breaker, 32);
assert.ok(bi.current <= bi.breaker && bi.breaker <= bi.ampacity);
assert.ok(mono.current <= mono.breaker && mono.breaker <= mono.ampacity);
assert.ok(bi.dropPercent <= 4 && mono.dropPercent <= 4);
assert.equal(sizeAcCircuit(6, 10, 'Mono 220 V').section, 6);
assert.equal(sizeAcCircuit(6, 80, 'Mono 220 V').section, 16);
assert.equal(sizeAcCircuit(10, 20, 'Trifásico 220 V').section, 6);
assert.throws(() => sizeAcCircuit(100, 500, 'Mono 127 V'), /projeto elétrico/);
const triGridMonoInverter = generateMaterials({...base, connection: 'Trifásico', inverterOutput: 'Mono 220 V'});
assert.ok(triGridMonoInverter.items.some(i => i.description.startsWith('Disjuntor bipolar 32 A')));
assert.ok(triGridMonoInverter.items.some(i => i.description.includes('fase (preto)')));
assert.ok(!triGridMonoInverter.items.some(i => i.description.includes('fase L3')));
assert.throws(() => generateMaterials({...base, connection: 'Mono 127 V', inverterOutput: 'Mono 220 V'}), /não oferece 220 V/);
assert.throws(() => generateMaterials({...base, connection: 'Bifásico 220 V', inverterOutput: 'Trifásico 220 V'}), /exige rede trifásica/);
assert.ok(generateMaterials({...base, connection: 'Bifásico 220 V'}).items.some(i => i.description.startsWith('Disjuntor bipolar')));
console.log('Dimensionamento CA, trechos interno/externo/corrugado, aterramento e caso de referência conferidos.');
