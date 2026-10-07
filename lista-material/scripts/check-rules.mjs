import assert from 'node:assert/strict';
import {generateMaterials, sizeAcCircuit} from '../rules.js';
const result = generateMaterials({
  modules: 9, watts: 620, inverter: 5, floors: 2, ac: 25, dc: 25, ground: 3,
  connection: 'Bifásico 220 V', inverterOutput: 'Mono 220 V', roof: 'Fibrocimento sobre madeira',
  sun: 'Não', point: 'Padrão de entrada', conduit: 'Aparente'
});
const qty = starts => result.items.find(i => i.description.startsWith(starts))?.quantity;
assert.equal(result.stats.kwp, 5.58);
assert.equal(qty('Cabo flexível de cobre PVC 70 °C 6 mm², fase (preto)'), '30');
assert.equal(qty('Cabo flexível de cobre PVC 70 °C 6 mm², PE'), '30');
assert.equal(qty('Eletroduto PVC rígido 3/4"'), '10');
assert.equal(qty('Curva 90° 3/4"'), '8');
assert.equal(qty('Abraçadeira tipo D 3/4"'), '35');
assert.equal(qty('Disjuntor bipolar 32 A curva C'), '1');
assert.match(result.warning, /Inversor monofásico 220 V entre fases; rede bifásica 127\/220 V/);
assert.match(result.warning, /fase 10 mm²; disjuntor 50 A até 10 kW ou 63 A/);
assert.equal(qty('Cabo solar 6 mm², vermelho'), '28');
assert.equal(qty('Eletroduto PVC rígido preto 3/4"'), '9');
assert.equal(qty('Fixador para telha de fibrocimento'), '36');
assert.equal(qty('Módulo fotovoltaico 620 W'), '9');
assert.equal(qty('Perfil de alumínio'), 'conforme layout');
assert.throws(() => generateMaterials({...result, modules: 0}), /Preencha/);
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
const triGridMonoInverter = generateMaterials({...result, modules: 9, watts: 620, inverter: 5, ac: 25, dc: 25, connection: 'Trifásico', inverterOutput: 'Mono 220 V'});
assert.ok(triGridMonoInverter.items.some(i => i.description.startsWith('Disjuntor bipolar 32 A')));
assert.ok(triGridMonoInverter.items.some(i => i.description.includes('fase (preto)')));
assert.ok(!triGridMonoInverter.items.some(i => i.description.includes('fase L3')));
assert.throws(() => generateMaterials({...result, modules: 9, watts: 620, inverter: 5, ac: 25, dc: 25, connection: 'Mono 127 V', inverterOutput: 'Mono 220 V'}), /não oferece 220 V/);
assert.throws(() => generateMaterials({...result, modules: 9, watts: 620, inverter: 5, ac: 25, dc: 25, connection: 'Bifásico 220 V', inverterOutput: 'Trifásico 220 V'}), /exige rede trifásica/);
assert.ok(generateMaterials({...result, modules: 9, watts: 620, inverter: 5, ac: 25, dc: 25, connection: 'Bifásico 220 V'}).items.some(i => i.description.startsWith('Disjuntor bipolar')));
console.log('Dimensionamento CA: tensão, ampacidade, disjuntor, queda e caso de referência conferidos.');
