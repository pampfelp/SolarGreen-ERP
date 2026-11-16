'use strict';

// Caso real anonimizado (só números): três faturas Equatorial GD II e a geração colada do monitoramento.
const faturas = [
  {
    referencia: '2026-09', dataLeituraAnterior: '2026-08-07', dataLeituraAtual: '2026-09-08',
    consumoMedido: 706, injetadoNoCiclo: 771, consumoCompensado: 693.11, consumoSemCompensacao: 0,
    total: 398.23, saldoDisponivel: 223.06,
    itens: [
      { tipo: 'consumoCompensado', valor: 642.09 }, { tipo: 'energiaInjetada', valor: -642.09 },
      { tipo: 'gd2', valor: 202.10, precoComTributos: 0.291584 }, { tipo: 'sceeBruto', valor: 433.91 },
      { tipo: 'sceeLiquido', valor: -344.50 }, { tipo: 'bandeira', valor: 1.20 }, { tipo: 'cip', valor: 97.12 },
      { tipo: 'financeiro', descricao: 'Multa', valor: 5.61 },
      { tipo: 'financeiro', descricao: 'Correção Monetária', valor: 0.36 },
      { tipo: 'financeiro', descricao: 'Juros', valor: 2.43 }
    ]
  },
  {
    referencia: '2026-10', dataLeituraAnterior: '2026-09-08', dataLeituraAtual: '2026-10-08',
    consumoMedido: 723, injetadoNoCiclo: 625, consumoCompensado: 709.48, consumoSemCompensacao: 0,
    total: 431.06, saldoDisponivel: 138.58,
    itens: [
      { tipo: 'consumoCompensado', valor: 660.78 }, { tipo: 'energiaInjetada', valor: -582.10 },
      { tipo: 'creditoAnterior', valor: -78.68 }, { tipo: 'gd2', valor: 205.57 }, { tipo: 'sceeBruto', valor: 455.04 },
      { tipo: 'sceeLiquido', valor: -359.93 }, { tipo: 'bandeira', valor: 0.87 }, { tipo: 'cip', valor: 122.72 },
      { tipo: 'multa', valor: 4.79 }, { tipo: 'juros', valor: 2.00 }
    ]
  },
  {
    referencia: '2026-11', dataLeituraAnterior: '2026-10-08', dataLeituraAtual: '2026-11-10',
    consumoMedido: 845, injetadoNoCiclo: 629, consumoCompensado: 767.58, consumoSemCompensacao: 58.95,
    total: 579.36, saldoDisponivel: 0,
    itens: [
      { tipo: 'consumo', valor: 79.60, quantidade: 58.95, precoComTributos: 1.350297 },
      { tipo: 'consumoCompensado', valor: 735.00 },
      { tipo: 'energiaInjetada', valor: -602.31 }, { tipo: 'energiaInjetada', valor: -58.11 },
      { tipo: 'energiaInjetada', valor: -74.58 }, { tipo: 'gd2', valor: 226.92 }, { tipo: 'sceeBruto', valor: 510.78 },
      { tipo: 'sceeLiquido', valor: -393.24 }, { tipo: 'cip', valor: 141.88 },
      { tipo: 'multa', valor: 5.85 }, { tipo: 'correcaoMonetaria', valor: 4.74 }, { tipo: 'juros', valor: 2.83 }
    ]
  }
];

// Texto no formato colado do app. "null" vira "sem dado".
function montarTexto() {
  const linhas = ['Dia\tGerado\tPrognóstico\tVariação'];
  const fmt = n => n.toFixed(2).replace('.', ',') + ' kWh';
  function mes(mm, previsto, valores) {
    valores.forEach((v, i) => {
      const dia = String(i + 1).padStart(2, '0');
      linhas.push(v === null ? `${dia}/${mm}\tsem dado\t${fmt(previsto)}\t—`
        : `${dia}/${mm}\t${fmt(v)}\t${fmt(previsto)}\t${fmt(v - previsto)}`);
    });
  }
  const sd = null;
  mes('08', 37.44, [39.4, 35.6, 43.5, 39.9, 38.3, 36.2, 36.5, 37.8, 37.1, 30.7, 32.7, 31.0, 36.6, 38.9, 37.7, 32.8,
    30.5, 36.2, 40.2, 28.1, 36.1, 38.0, sd, sd, sd, sd, sd, sd, sd, sd, sd]);
  mes('09', 38.26, [sd, sd, 36.9, 60.0, 31.4, 30.7, 33.0, 28.8, 32.4, 33.0, 32.0, 31.3, 32.2, 33.3, 34.4, 34.3, 31.7,
    38.2, 33.5, 31.0, 28.3, sd, 30.7, 34.4, 28.5, 32.3, 28.7, 26.6, 31.6, 37.1]);
  mes('10', 37.6, [28.9, 33.4, 39.1, 28.9, 24.3, 35.0, 32.5, 33.4, 31.3, 30.9, 30.2, 26.2, 28.3, 33.3, 35.6, 31.2,
    25.2, 23.2, 30.9, 26.1, 30.7, 27.2, 28.6, 28.9, 28.9, 34.3, 33.5, 31.9, 24.1, 33.3, 33.6]);
  mes('11', 36.9, [27.8, 28.4, 29.4, 27.5, 31.3, 33.1, 25.1, 25.1, 27.2, 23.2, 29.7, 29.4, 30.4, 27.7, 33.1, 17.3]);
  return linhas.join('\n');
}

module.exports = { faturas, montarTexto, excluir: ['2026-11-16'] };
