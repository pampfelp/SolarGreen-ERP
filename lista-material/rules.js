// Sugestões de compra. A especificação elétrica final depende do projeto e dos manuais.
export const GROUPS = ['Parte CA', 'Proteção', 'Aterramento', 'Parte CC', 'Estrutura', 'Equipamentos'];

// Cobre/PVC 70 °C em eletroduto, método B1, 35 °C e um circuito.
// Capacidades B1: Corfio, tabela 02; fator térmico: tabela 11.
// Queda de tensão: Corfio, tabela 16, eletroduto não magnético (PVC).
const AC_SECTIONS = [
  {mm2: 6, ampacity: [41, 36], drop: [6.03, 7.05], drop3: [5.26, 6.15], conduit: '3/4"'},
  {mm2: 10, ampacity: [57, 50], drop: [3.62, 4.21], drop3: [3.16, 3.66], conduit: '1"'},
  {mm2: 16, ampacity: [76, 68], drop: [2.33, 2.69], drop3: [2.03, 2.34], conduit: '1 1/4"'},
  {mm2: 25, ampacity: [101, 89], drop: [1.51, 1.71], drop3: [1.33, 1.49], conduit: '1 1/2"'},
  {mm2: 35, ampacity: [125, 110], drop: [1.12, 1.25], drop3: [0.98, 1.09], conduit: '2"'},
  {mm2: 50, ampacity: [151, 134], drop: [0.85, 0.94], drop3: [0.76, 0.82], conduit: '2"'},
];
const BREAKER_RATINGS = [10, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100, 125];

export function sizeAcCircuit(inverterKw, acMetres, inverterOutput) {
  const voltage = inverterOutput === 'Mono 127 V' ? 127 : 220;
  const phases = inverterOutput === 'Trifásico 220 V' ? 3 : 1;
  const loaded = phases === 3 ? 3 : 2;
  const powerFactor = 0.9;
  const current = inverterKw * 1000 / (voltage * powerFactor * (phases === 3 ? Math.sqrt(3) : 1));
  for (const candidate of AC_SECTIONS) {
    const ampacity = candidate.ampacity[loaded - 2] * 0.94;
    const breaker = BREAKER_RATINGS.find(rating => rating >= current && rating <= ampacity);
    const table = phases === 3 ? candidate.drop3 : candidate.drop;
    const mvPerAmpMetre = table[0] + (powerFactor - 0.8) / 0.15 * (table[1] - table[0]);
    const dropPercent = mvPerAmpMetre * current * acMetres / (10 * voltage);
    if (breaker && dropPercent <= 4) {
      return {section: candidate.mm2, conduit: candidate.conduit, current, ampacity, breaker, dropPercent, voltage};
    }
  }
  throw new Error('Percurso ou potência CA fora do dimensionamento simplificado. Solicite projeto elétrico para definir cabos e proteção.');
}

export function generateMaterials(m) {
  const modules = Number(m.modules);
  const watts = Number(m.watts);
  const inverter = Number(m.inverter);
  const ac = Number(m.ac);
  const dc = Number(m.dc);
  if (![modules, watts, inverter, ac, dc].every(n => Number.isFinite(n) && n > 0)) {
    throw new Error('Preencha módulos, potência, inversor, percurso CA e percurso CC com valores maiores que zero.');
  }
  const floors = Math.max(1, Number(m.floors) || 1);
  const ground = Math.max(0, Number(m.ground) || 0);
  const inverterOutput = m.inverterOutput || (m.connection === 'Mono 127 V' ? 'Mono 127 V' : m.connection === 'Trifásico' ? 'Trifásico 220 V' : 'Mono 220 V');
  if (!['Mono 127 V', 'Mono 220 V', 'Trifásico 220 V'].includes(inverterOutput) || !['Mono 127 V', 'Bifásico 220 V', 'Trifásico'].includes(m.connection)) {
    throw new Error('Selecione a rede no padrão e a saída CA do inversor.');
  }
  if (inverterOutput === 'Mono 220 V' && m.connection === 'Mono 127 V') {
    throw new Error('Rede monofásica 127 V não oferece 220 V entre fases para este inversor. Confira o fornecimento e a saída CA do modelo.');
  }
  if (inverterOutput === 'Trifásico 220 V' && m.connection !== 'Trifásico') {
    throw new Error('Inversor trifásico exige rede trifásica compatível. Confira o fornecimento antes de gerar a lista.');
  }
  const active = inverterOutput === 'Trifásico 220 V' ? 3 : inverterOutput === 'Mono 127 V' ? 1 : 2;
  const acSizing = sizeAcCircuit(inverter, ac, inverterOutput);
  const acSection = acSizing.section;
  const conduit = acSizing.conduit;
  const acLength = Math.ceil(ac * 1.1 + floors);
  const dcLength = Math.ceil(dc * 1.1);
  const acBars = Math.ceil(acLength / 3);
  const dcBars = Math.ceil(dcLength / 3);
  const roof = String(m.roof || 'A conferir');
  const sun = m.sun === 'Sim';
  const inverterLabel = inverterOutput === 'Trifásico 220 V' ? 'trifásico 220 V' : inverterOutput === 'Mono 127 V' ? 'monofásico 127 V' : 'monofásico 220 V entre fases';
  const networkLabel = m.connection === 'Trifásico' ? 'trifásica 127/220 V' : m.connection === 'Mono 127 V' ? 'monofásica 127 V' : 'bifásica 127/220 V';
  const items = [];
  const add = (group, quantity, unit, description, note = '') => items.push({id: crypto.randomUUID(), group, quantity: String(quantity), unit, description, note, source: 'Regra', checked: true});

  const conductorNames = active === 1 ? ['fase (preto)', 'neutro (azul)'] : active === 2 ? ['fase (preto)', 'fase (vermelho)'] : ['fase L1', 'fase L2', 'fase L3'];
  conductorNames.forEach(name => add('Parte CA', acLength, 'm', `Cabo flexível de cobre PVC 70 °C ${acSection} mm², ${name}`, 'Comprimento de percurso com subida, descida e reserva.'));
  add('Parte CA', acLength, 'm', `Cabo flexível de cobre PVC 70 °C ${acSection} mm², PE (verde)`);
  add('Parte CA', acBars, 'barras', `Eletroduto PVC rígido ${conduit}, ${sun ? 'preto resistente a UV' : 'branco'}, barra de 3 m`, 'Pré-seleção: confirmar trajeto, ocupação e diâmetro real dos cabos.');
  add('Parte CA', Math.max(4, Math.ceil(ac / 4) + 1), 'un', `Curva 90° ${conduit}`, 'Contar mudanças de direção no desenho.');
  add('Parte CA', acBars, 'un', `Luva ${conduit}`);
  add('Parte CA', ac > 15 ? 3 : 2, 'un', `Caixa de passagem de sobrepor ${conduit}`);
  add('Parte CA', 4, 'pares', `Bucha e arruela ${conduit}`);
  add('Parte CA', acLength + 5, 'un', `Abraçadeira tipo D ${conduit}, com parafuso e bucha`);
  add('Parte CA', 1, 'un', 'Prensa-cabo ou adaptador para a caixa do ponto de conexão', 'Confirmar furo disponível.');
  add('Parte CA', (active + 1) * 2 + 2, 'un', `Terminal tubular pré-isolado ${acSection} mm²`);
  add('Parte CA', 1, 'm', 'Espiral protetor de cabo');

  const poles = active === 3 ? 'tripolar' : active === 2 ? 'bipolar' : 'monopolar';
  add('Proteção', 1, 'un', `Disjuntor ${poles} ${acSizing.breaker} A curva C, dedicado`, `No ${m.point || 'ponto de conexão'}; estimativa com Ib ${acSizing.current.toFixed(1)} A e Iz corrigida ${acSizing.ampacity.toFixed(1)} A. Confirmar corrente máxima e proteção no manual do inversor.`);
  add('Proteção', 1, 'un', 'Etiqueta de identificação do disjuntor');
  add('Proteção', 1, 'un', 'Quadro DIN de sobrepor com porta, 6 módulos', 'Confirmar grau de proteção conforme local.');
  add('Proteção', active, 'un', 'DPS classe II, 275 V, 20 kA / 40 kA', 'Uc e coordenação devem ser conferidos no projeto.');
  add('Proteção', 1, 'un', 'Barra de terra para o quadro');
  add('Proteção', 2, 'm', 'Cabo 6 mm² verde para DPS e barra', 'Ligação curta e reta.');

  add('Aterramento', ground || 'medir', 'm', 'Cabo 6 mm² verde, aterramento do inversor');
  add('Aterramento', 4, 'un', 'Terminal olhal e parafuso M6');
  add('Aterramento', 'medir', 'm', 'Cabo 6 mm² verde, aterramento da estrutura');
  add('Aterramento', 'conforme layout', 'un', 'Terminal de aterramento da estrutura com arruela dentada');

  add('Parte CC', dcLength, 'm', 'Cabo solar 6 mm², vermelho');
  add('Parte CC', dcLength, 'm', 'Cabo solar 6 mm², preto');
  add('Parte CC', 3, 'pares', 'Conector MC4 fêmea e macho', 'String e conectores compatíveis com o inversor.');
  add('Parte CC', Math.ceil(dc / 3), 'barras', 'Eletroduto PVC rígido preto 3/4", barra de 3 m', 'Ajustar ao trecho efetivamente protegido por eletroduto.');
  add('Parte CC', Math.max(4, Math.ceil(dc / 4)), 'un', 'Curva 90° 3/4"');
  add('Parte CC', dcBars, 'un', 'Luva 3/4"');
  add('Parte CC', Math.ceil(dcLength), 'un', 'Abraçadeira 3/4"');
  add('Parte CC', Math.ceil(modules * 5.5), 'un', 'Abraçadeira de nylon com proteção UV');
  add('Parte CC', 1, 'm', 'Espiral protetor de cabo');

  const roofFix = /fibrocimento/i.test(roof) ? 'Fixador para telha de fibrocimento, conforme caibro' : `Fixador de estrutura para ${roof}`;
  add('Estrutura', modules * 4, 'un', roofFix, 'Conferir estrutura e layout da vistoria.');
  add('Estrutura', 'conforme layout', 'barras', 'Perfil de alumínio', 'O ERP dimensiona trilhos a partir do desenho dos blocos; só as medidas desta tela não dão o número de fileiras.');
  add('Estrutura', 'conforme layout', 'un', 'Emenda de perfil');
  add('Estrutura', 'conforme layout', 'un', 'Grampo final');
  add('Estrutura', 'conforme layout', 'un', 'Grampo intermediário');
  add('Estrutura', modules * 4, 'un', 'Vedação dos pontos de fixação');

  add('Equipamentos', modules, 'un', `Módulo fotovoltaico ${watts} W`);
  add('Equipamentos', 1, 'un', `Inversor on-grid ${String(inverter).replace('.', ',')} kW, ${inverterLabel}`, 'Conferir tensão, Isc e Voc da string nos manuais.');
  add('Equipamentos', 1, 'un', 'Módulo Wi-Fi do fabricante');
  add('Equipamentos', 2, 'jogos', 'Parafuso e bucha para fixar inversor e quadro');

  const standardNote = m.point !== 'Padrão de entrada' ? '' : m.connection === 'Bifásico 220 V'
    ? ' Padrão bifásico: NT.00001, tabela 2, indica fase 10 mm²; disjuntor 50 A até 10 kW ou 63 A de 10,1 a 12 kW de carga instalada total.'
    : ' Padrão: disjuntor geral e fase dependem da carga instalada total (NT.00001, tabela 2).';
  return {items, stats: {kwp: modules * watts / 1000, acLength, dcLength, acSizing}, warning: `Inversor ${inverterLabel}; rede ${networkLabel}: Ib ${acSizing.current.toFixed(1)} A, Iz ${acSizing.ampacity.toFixed(1)} A, queda ${acSizing.dropPercent.toFixed(2)}% (limite 4%). Premissas: FP 0,9; cobre/PVC 70 °C; B1; 35 °C; um circuito.${standardNote} Confirme bornes CA no manual e instalação real antes da compra.`};
}
