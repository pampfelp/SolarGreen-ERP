// Dados fictícios que reproduzem a maquete validada em 2026-10-21 (SolarGreen-ERP Refatoração/maquetes/trafego-pago.html).
// Usados por tests/trafego-dashboard.test.js e por _tools/testar-trafego.html. Nenhum cliente real.
(function(root){
  var origem={};
  ['t1','t2','t3','t7','t8','t9'].forEach(function(id){origem[id]='Tráfego pago';});
  origem.t4='tráfego'; origem.t5='Trafego pago'; origem.t6='- tráfego';
  ['s1','s2','s3','s4','s5'].forEach(function(id){origem[id]='Site';});
  origem.o1='indicação Bene'; // outra origem: não entra
  var vendas=[
    ['t1',3000,'2026-08-05'],['t2',2800,'2026-08-12'],['s1',4000,'2026-08-20'],
    ['t3',3500,'2026-09-02'],['t4',3000,'2026-09-09'],['t1',2000,'2026-09-15'],['s2',4400,'2026-09-18'],['s3',3500,'2026-09-25'],
    ['t5',3000,'2026-10-01'],['t6',2500,'2026-10-03'],['t7',2200,'2026-10-06'],['t8',2100,'2026-10-08'],['t9',2000,'2026-10-10'],
    ['t2',1800,'2026-10-13'],['t3',1800,'2026-10-15'],['s4',1500,'2026-10-16'],['s5',1200,'2026-10-18'],['s1',800,'2026-10-20'],
    ['x1',3000,'2026-09-01'],['x2',2200,'2026-10-02'],['x3',2000,'2026-10-11'], // sem origem: 3 vendas, R$ 7.200
    ['o1',9999,'2026-10-05'] // outra origem: fora de tudo
  ].map(function(v){return {idCliente:v[0],valor:v[1],dateKey:v[2]};});
  var leads=[], i;
  for(i=0;i<142;i++){ origem['lt'+i]=i%3?'Tráfego pago':'tráfego'; leads.push({idCliente:'lt'+i,origem:''}); }
  for(i=0;i<60;i++){ origem['ls'+i]='Site'; leads.push({idCliente:'ls'+i,origem:''}); }
  for(i=0;i<9;i++)leads.push({idCliente:'lx'+i,origem:'Site'}); // cliente sem origem, lead do formulário do site
  for(i=0;i<20;i++){ origem['lo'+i]='indicação Bene'; leads.push({idCliente:'lo'+i,origem:''}); }
  var custos=[
    {valor:900,categoria:'trafego_pago',dateKey:'2026-08-10'},{valor:700,categoria:'trafego_pago',dateKey:'2026-09-03'},
    {valor:750,categoria:'trafego_pago',dateKey:'2026-09-20'},{valor:2100,categoria:'trafego_pago',dateKey:'2026-10-07'},
    {valor:300,categoria:'marketing',dateKey:'2026-10-07'},{valor:5000,categoria:'folha',dateKey:'2026-10-07'}
  ];
  var origensCadastradas=Object.keys(origem).map(function(k){return origem[k];}).concat(['',' Tráfego pago']);
  var fx={origem:origem,params:{custos:custos,vendas:vendas,leads:leads,origemDe:function(id){return origem[id]||'';},
    funil:{conversas:148,propostas:41},origensCadastradas:origensCadastradas,ate:'2026-10-21'}};
  if(typeof module!=='undefined'&&module.exports)module.exports=fx;
  if(root)root.SGTrafegoFixture=fx;
})(typeof window!=='undefined'?window:null);
