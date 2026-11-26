(function(root){
  'use strict';
  var periodo=typeof module!=='undefined'&&module.exports?require('./agenda-periodo.js'):root.SGAgendaPeriodo;
  function dataISO(v){
    var iso=periodo.dataISO(v); if(!iso)return '';
    var p=iso.split('-'),d=new Date(+p[0],+p[1]-1,+p[2]);
    return d.getFullYear()===+p[0]&&d.getMonth()===+p[1]-1&&d.getDate()===+p[2]?iso:'';
  }
  function deslocarDia(iso,delta){
    if(!dataISO(iso))return '';
    var p=iso.split('-'),d=new Date(+p[0],+p[1]-1,+p[2]+delta);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function minutos(v){
    var m=String(v||'').trim().match(/^(\d{1,2}):(\d{2})(?::00)?$/);
    return m&&+m[1]<24&&+m[2]<60?+m[1]*60 + +m[2]:null;
  }
  function hora(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
  function cancelado(a){return String(a['Status Agendamento']||'').trim().toLowerCase()==='cancelado';}
  function intervaloNoDia(a,dia){
    var ini=dataISO(a['Data Inicio']),fim=periodo.dataFim(a),inicio=minutos(a['Hora inicio']);
    var horaFimServico=String(a['Hora Fim Servico']||'').trim();
    var termino=fim&&!horaFimServico?1440:minutos(fim?horaFimServico:a['Hora Fim']);
    if(!ini||inicio===null||termino===null||(fim&&!dataISO(fim))||(!fim&&termino<=inicio))return null;
    if(dia<ini||dia>(fim||ini))return null;
    return {ini:dia===ini?inicio:0,fim:dia===(fim||ini)?termino:1440};
  }
  function unir(intervalos){
    var unidos=[];
    intervalos.slice().sort(function(a,b){return a.ini-b.ini;}).forEach(function(i){
      if(i.fim<=i.ini)return;
      var ultimo=unidos[unidos.length-1];
      if(ultimo&&i.ini<=ultimo.fim)ultimo.fim=Math.max(ultimo.fim,i.fim);
      else unidos.push({ini:i.ini,fim:i.fim});
    });
    return unidos;
  }
  function calcular(lista,dia,inicio,fim){
    var itens=lista.filter(function(a){return dataISO(a['Data Inicio'])&&periodo.ocupaEntre(a,dia,dia);});
    var incerto=false,intervalos=[];
    itens.forEach(function(a){
      if(cancelado(a))return;
      var i=intervaloNoDia(a,dia);
      if(!i){incerto=true;return;}
      intervalos.push({ini:Math.max(inicio,i.ini),fim:Math.min(fim,i.fim)});
    });
    var ocupados=unir(intervalos),livres=[],cursor=inicio;
    ocupados.forEach(function(i){if(i.ini>cursor)livres.push({ini:cursor,fim:i.ini});cursor=Math.max(cursor,i.fim);});
    if(cursor<fim)livres.push({ini:cursor,fim:fim});
    return {itens:itens,ocupados:ocupados,livres:incerto?[]:livres,calculado:!incerto,
      minutosOcupados:ocupados.reduce(function(s,i){return s+i.fim-i.ini;},0),
      minutosLivres:incerto?null:livres.reduce(function(s,i){return s+i.fim-i.ini;},0)};
  }
  var api={dataISO:dataISO,deslocarDia:deslocarDia,minutos:minutos,hora:hora,cancelado:cancelado,intervaloNoDia:intervaloNoDia,unir:unir,calcular:calcular};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.SGAgendaDia=api;
})(typeof window!=='undefined'?window:null);
