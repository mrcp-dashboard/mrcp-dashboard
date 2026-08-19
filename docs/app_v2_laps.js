// Extrait de app_v2.js (decoupage modules) - voir docs/DEVELOPMENT.md
// Agregation des tours (laps) a partir de DATA, stats, et rendu des graphiques SVG.
function getAllLapsRaw(includeExcluded){
  if(!includeExcluded&&lapsCache)return lapsCache;
  var rows=[], o=getOverrides();
  function addLap(l,ctx){
    var t=lapSeconds(l); if(!Number.isFinite(t)||t<=0)return;
    var lapNo=l.lap_no||l.lap||l.number||'', startTime=l.start_time||l.started_at||'', tp=ctx.transponder||l.transponder||'';
    var lapId=l.lap_id||l.id||lapKey(ctx.activity_id,tp,lapNo,startTime,t);
    var excluded=!!o.excluded[lapId]||!!l.exclude_from_records||!!l.excluded;
    if(excluded&&!includeExcluded)return;
    var pilot=ctx.pilot_name||lapPilot(l);
    rows.push(Object.assign({},l,{lap_id:lapId,activity_id:ctx.activity_id||'',session_id:ctx.session_id||ctx.activity_id||'',session_name:ctx.session_name||'',session_date:ctx.session_date||'',transponder:tp,pilot_name:pilot,_time:t,_track:forcedTrack(lapId,o)||normalizeTrackValue(l.track||ctx.track,l),_pilot:pilot,_date:ctx.session_date||l.date||l.session_date||'',_excluded:excluded}));
  }
  if(DATA&&Array.isArray(DATA.activities)){
    DATA.activities.forEach(function(a){
      var id=a.id||a.activity_id||a.session_id||'', name=a.name||a.title||a.session_name||a.date_fr||a.date||'', date=a.date||a.session_date||a.created_at||'';
      (a.participants||[]).forEach(function(p){
        var pilot=p.pilot_name||p.name||p.driver||('Inconnu #'+(p.transponder||'')), tp=p.transponder||p.transponder_id||'';
        (p.laps||[]).forEach(function(l){addLap(l,{activity_id:id,session_id:id,session_name:name,session_date:date,pilot_name:pilot,transponder:tp,track:l.track||p.track||null});});
      });
    });
  }
  if(DATA&&Array.isArray(DATA.sessions)){
    DATA.sessions.forEach(function(s){
      var id=s.id||s.session_id||'', name=s.name||s.title||s.session_name||s.date_fr||s.date||'', date=s.date||s.session_date||'';
      if(Array.isArray(s.participants)){
        s.participants.forEach(function(p){
          var pilot=p.pilot_name||p.name||p.driver||('Inconnu #'+(p.transponder||'')), tp=p.transponder||p.transponder_id||'';
          (p.laps||[]).forEach(function(l){addLap(l,{activity_id:id,session_id:id,session_name:name,session_date:date,pilot_name:pilot,transponder:tp,track:l.track||p.track||null});});
        });
      }
      (s.laps||s.results||[]).forEach(function(l){addLap(l,{activity_id:id,session_id:id,session_name:name,session_date:date,pilot_name:lapPilot(l),transponder:l.transponder||'',track:l.track||null});});
    });
  }
  if(DATA&&Array.isArray(DATA.laps)){
    DATA.laps.forEach(function(l){addLap(l,{activity_id:l.activity_id||l.session_id||'',session_id:l.session_id||l.activity_id||'',session_name:l.session_name||'',session_date:l.date||l.session_date||'',pilot_name:lapPilot(l),transponder:l.transponder||'',track:l.track||null});});
  }
  var seen={};
  var result=rows.filter(function(r){if(seen[r.lap_id])return false;seen[r.lap_id]=true;return true;});
  if(!includeExcluded)lapsCache=result;
  return result;
}
function getAllLaps(){return getAllLapsRaw(false);}
function applyFilters(laps){return state.track==='all'?laps:laps.filter(function(l){return l._track===state.track;});}
function lapDateMs(l){
  var key=dateKeyFromValue(l._date||l.session_date||l.date||l.session_name);
  if(!key)return null;
  var p=key.split('-');
  return new Date(Number(p[0]),Number(p[1])-1,Number(p[2])).getTime();
}
function recordPeriodRange(period){
  if(period==='total')return null;
  var now=new Date();
  var start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(period==='week'){
    var day=start.getDay()||7;
    start.setDate(start.getDate()-day+1);
  }else if(period==='month'){
    start=new Date(now.getFullYear(),now.getMonth(),1);
  }else if(period==='year'){
    start=new Date(now.getFullYear(),0,1);
  }
  var end=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).getTime();
  return {start:start.getTime(),end:end};
}
function applyRecordFilters(laps){
  var filtered=applyFilters(laps);
  var range=recordPeriodRange(state.recordPeriod);
  if(!range)return filtered;
  return filtered.filter(function(l){
    var t=lapDateMs(l);
    return t!=null&&t>=range.start&&t<range.end;
  });
}
function bestByPilot(laps){var m=new Map();laps.forEach(function(l){if(!m.has(l._pilot)||l._time<m.get(l._pilot)._time)m.set(l._pilot,l);});return Array.from(m.values()).sort(function(a,b){return a._time-b._time;});}
function allPilots(){return bestByPilot(getAllLaps()).map(function(l){return l._pilot;}).sort(function(a,b){return a.localeCompare(b);});}

// Series de tours consecutifs.
// Le best lap recompense un tour isole : la moyenne sur N tours qui s'enchainent
// mesure le rythme reellement tenu. Dans les CSV SpeedHive, lap_no repart a 1 a
// chaque relance, donc une "serie" = suite de lap_no qui s'incrementent de 1.
// N=5 couvre ~96% des pilotes sur les donnees actuelles (voir DEVELOPMENT.md).
var SERIES_LAP_COUNT = 5;

function lapSeriesRuns(laps){
  // Regroupe par pilote + session avant de decouper : sans ca, une suite
  // pourrait melanger deux pilotes ou deux sessions differentes.
  var groups={};
  laps.forEach(function(l){
    var key=String(l._pilot||'')+'|'+String(l.activity_id||l.session_id||'');
    (groups[key]=groups[key]||[]).push(l);
  });
  var runs=[];
  Object.keys(groups).forEach(function(key){
    var rows=groups[key].slice().sort(function(a,b){
      return String(a.start_time||'').localeCompare(String(b.start_time||''))||(Number(a.lap_no||0)-Number(b.lap_no||0));
    });
    var current=[];
    rows.forEach(function(l){
      var n=Number(l.lap_no);
      var last=current.length?current[current.length-1]:null;
      // Coupure si le numero de tour ne suit pas, ou si on change de piste.
      if(last&&(!Number.isFinite(n)||n!==Number(last.lap_no)+1||last._track!==l._track)){
        runs.push(current);
        current=[];
      }
      current.push(l);
    });
    if(current.length)runs.push(current);
  });
  return runs;
}

function bestLapSeries(laps,n){
  n=n||SERIES_LAP_COUNT;
  var best=null;
  lapSeriesRuns(laps).forEach(function(run){
    if(run.length<n)return;
    var sum=0;
    for(var i=0;i<run.length;i++){
      sum+=run[i]._time;
      if(i>=n)sum-=run[i-n]._time;
      if(i>=n-1){
        var avg=sum/n;
        if(!best||avg<best.avg){
          var window=run.slice(i-n+1,i+1);
          best={
            avg:avg,
            n:n,
            laps:window,
            pilot:window[0]._pilot,
            track:window[0]._track,
            date:window[0]._date,
            activity_id:window[0].activity_id,
            start_time:window[0].start_time
          };
        }
      }
    }
  });
  return best;
}

function bestSeriesByPilot(laps,n){
  var byPilot={};
  laps.forEach(function(l){(byPilot[l._pilot]=byPilot[l._pilot]||[]).push(l);});
  return Object.keys(byPilot).map(function(name){
    return bestLapSeries(byPilot[name],n);
  }).filter(Boolean).sort(function(a,b){return a.avg-b.avg;});
}
function lapDistanceMeters(track){
  var distances=(DATA&&DATA.meta&&DATA.meta.track_distances_m)||{};
  var value=Number(distances[track]||TRACK_LAP_DISTANCE_METERS[track]||distances.default||DEFAULT_LAP_DISTANCE_METERS);
  return Number.isFinite(value)&&value>0?value:DEFAULT_LAP_DISTANCE_METERS;
}
function totalDistanceKm(laps){
  var meters=laps.reduce(function(sum,l){return sum+lapDistanceMeters(l._track);},0);
  return meters/1000;
}
function periodFilteredLaps(period){
  var range=recordPeriodRange(period||'total');
  var laps=getAllLaps();
  if(!range)return laps;
  return laps.filter(function(l){
    var t=lapDateMs(l);
    return t!=null&&t>=range.start&&t<range.end;
  });
}
function fmtKm(v){
  var n=Number(v);
  if(!Number.isFinite(n))return '-';
  return n>=1000?n.toLocaleString('fr-FR',{maximumFractionDigits:0}):n.toLocaleString('fr-FR',{maximumFractionDigits:1});
}
// ISO (2026-05-10) -> format francais (10/05/2026). Les laps portent leur date
// en ISO dans _date, alors que le reste du site affiche du jj/mm/aaaa.
function dateFrFromValue(value){
  var m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m?m[3]+'/'+m[2]+'/'+m[1]:String(value||'');
}
function dateInputValue(value){
  var s=String(value||'').trim();
  var m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return m[1]+'-'+m[2]+'-'+m[3];
  m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(m)return m[3]+'-'+m[2]+'-'+m[1];
  return '';
}
function latestActivities(limit){var map={};getAllLaps().forEach(function(l){var key=l.session_id||l.session_name||l._date||'session';if(!map[key]){var sortDate=parseDateValue(l._date||l.session_date||l.date||key);if(sortDate===Number.MAX_SAFE_INTEGER)sortDate=0;map[key]={key:key,name:l.session_name||l._date||key,date:l._date||'',sortDate:sortDate,pilots:{},tracks:{},laps:0,best:null,bestPilot:'',bestTransponder:''};}map[key].pilots[l._pilot]=true;map[key].tracks[l._track]=true;map[key].laps++;if(!map[key].best||l._time<map[key].best){map[key].best=l._time;map[key].bestPilot=l._pilot;map[key].bestTransponder=normalizeTransponder(l.transponder||'');}});return Object.values(map).sort(function(a,b){return b.sortDate-a.sortDate||String(b.date||b.name).localeCompare(String(a.date||a.name));}).slice(0,limit||5);}

function lapsChronologically(laps){
  return laps.slice().sort(function(a,b){
    return parseDateValue(a._date||a.session_date||a.date)-parseDateValue(b._date||b.session_date||b.date)||lapSortValue(a)-lapSortValue(b)||a._time-b._time;
  });
}

function personalRecordMap(){
  var map={}, best={};
  lapsChronologically(getAllLaps()).forEach(function(l){
    var key=l._pilot+'|'+l._track;
    if(best[key]!=null&&l._time<best[key]){
      map[l.lap_id]=true;
    }
    if(best[key]==null||l._time<best[key])best[key]=l._time;
  });
  return map;
}

// Chaque fois qu'un pilote ameliore son propre record sur une piste, avec le
// temps precedent : c'est ce qui permet d'afficher le gain ("-0.412 s").
// Le tout premier tour d'un pilote sur une piste n'est pas un record battu.
function personalRecordEvents(){
  var events=[], best={};
  lapsChronologically(getAllLaps()).forEach(function(l){
    var key=l._pilot+'|'+l._track;
    var previous=best[key];
    if(previous!=null&&l._time<previous){
      events.push({
        pilot:l._pilot,
        track:l._track,
        time:l._time,
        previous:previous,
        gain:previous-l._time,
        date:l._date,
        dateMs:lapDateMs(l),
        lap_id:l.lap_id
      });
    }
    if(previous==null||l._time<previous)best[key]=l._time;
  });
  return events;
}

// Derniers records battus, un seul par pilote (le plus recent) pour ne pas
// qu'un pilote en forme remplisse toute la liste.
function latestPersonalRecords(limit){
  var seen={}, rows=[];
  personalRecordEvents().reverse().forEach(function(e){
    if(seen[e.pilot])return;
    seen[e.pilot]=true;
    rows.push(e);
  });
  return rows.slice(0,limit||6);
}

// --- Progression sur la saison ---------------------------------------------
// Compare le meilleur tour de la PREMIERE journee de roulage au meilleur tour
// atteint depuis, sur une piste donnee. On raisonne par journee et non par tour
// : un premier tour isole (echauffement, sortie de piste) fausserait le point
// de depart.
var SEASON_PROGRESS_MIN_DAYS = 3;

function seasonProgressFor(laps){
  var byDay = {};
  laps.forEach(function(l){
    var day = l._date || '';
    if(!day) return;
    if(byDay[day] === undefined || l._time < byDay[day]) byDay[day] = l._time;
  });
  var days = Object.keys(byDay).sort();
  if(days.length < 2) return null;
  var first = byDay[days[0]];
  var best = first;
  days.forEach(function(d){ if(byDay[d] < best) best = byDay[d]; });
  return {
    first: first,
    best: best,
    gain: first - best,
    firstDay: days[0],
    days: days.length
  };
}

function pilotSeasonProgress(name, track){
  return seasonProgressFor(getAllLaps().filter(function(l){
    return l._pilot === name && l._track === track;
  }));
}

// Classement club. Seuil plus exigeant que pour la fiche pilote : sur deux
// journees seulement, une premiere sortie sous la pluie suffirait a fabriquer
// une fausse grosse progression.
function clubSeasonProgress(minDays){
  minDays = minDays || SEASON_PROGRESS_MIN_DAYS;
  var groups = {};
  getAllLaps().forEach(function(l){
    var key = l._pilot + '|' + l._track;
    (groups[key] = groups[key] || []).push(l);
  });
  var rows = [];
  Object.keys(groups).forEach(function(key){
    var p = seasonProgressFor(groups[key]);
    if(!p || p.days < minDays || p.gain <= 0) return;
    var parts = key.split('|');
    p.pilot = parts[0];
    p.track = parts[1];
    rows.push(p);
  });
  return rows.sort(function(a, b){ return b.gain - a.gain; });
}

function pilotBadges(stats){
  var badges=[];
  var dayKey=todayKey();
  var dayLaps=stats.laps.filter(function(l){return dateKeyFromValue(l._date||l.session_date||l.date||l.session_name)===dayKey;});
  var pr=personalRecordMap();
  if(stats.sessions<=1)badges.push('Premier roulage');
  if(dayLaps.length>=50)badges.push('+50 tours aujourd hui');
  if(dayLaps.some(function(l){return pr[l.lap_id]||l.personal_record;}))badges.push('Record perso battu');
  if(pilotConsistency(stats)!=null&&pilotConsistency(stats)<2)badges.push('Regulier');
  if(liveDayRows(liveDaySourceLaps(dayKey)).slice(0,3).some(function(r){return r.pilot===stats.name;}))badges.push('Top 3 du jour');
  return badges.slice(0,5);
}
function pilotRankByTrack(name,track){
  var rows=bestByPilot(getAllLaps().filter(function(l){return l._track===track;}));
  for(var i=0;i<rows.length;i++)if(rows[i]._pilot===name)return i+1;
  return null;
}
function pilotSocialCardHtml(name,stats,best18,best10){
  var rank18=pilotRankByTrack(name,'TT1/8'), rank10=pilotRankByTrack(name,'TT1/10');
  var last=stats.laps.slice().sort(function(a,b){return parseDateValue(b._date)-parseDateValue(a._date);})[0]||null;
  return '<section class="card pilot-social-card"><div><span class="badge">Carte pilote</span><h3>'+escapeHtml(name)+'</h3><p class="small">Résumé rapide à montrer ou partager au club.</p></div><div class="pilot-social-grid">'+
    '<div><span>Rang TT1/8</span><strong>'+(rank18?'#'+rank18:'-')+'</strong><small>'+fmtTimeS(best18&&best18._time)+'</small></div>'+
    '<div><span>Rang TT1/10</span><strong>'+(rank10?'#'+rank10:'-')+'</strong><small>'+fmtTimeS(best10&&best10._time)+'</small></div>'+
    '<div><span>Tours total</span><strong>'+stats.laps.length.toLocaleString('fr-FR')+'</strong><small>'+fmtKm(totalDistanceKm(stats.laps))+' km</small></div>'+
    '<div><span>Dernière session</span><strong>'+escapeHtml(last?dateInputValue(last._date)||last._date:'-')+'</strong><small>'+escapeHtml(last?last._track:'-')+'</small></div>'+
  '</div></section>';
}

function badgesHtml(badges){
  if(!badges||!badges.length)return '';
  return '<div class="badge-row">'+badges.map(function(b){return '<span class="pilot-badge">'+escapeHtml(b)+'</span>';}).join('')+'</div>';
}

function pilotStats(name){
  var laps=getAllLaps().filter(function(l){return l._pilot===name;});
  var sorted=laps.slice().sort(function(a,b){return a._time-b._time;});
  var avg=laps.length?laps.reduce(function(s,l){return s+l._time;},0)/laps.length:null;
  var sessions={};laps.forEach(function(l){sessions[l.session_name||l._date||'session']=true;});
  return {name:name,laps:laps,best:sorted[0],avg:avg,sessions:Object.keys(sessions).length};
}
function clubBest(track){var rows=bestByPilot(getAllLaps().filter(function(l){return track==='all'||l._track===track;}));return rows[0]||null;}
function pilotBestByTrack(stats,track){return bestByPilot(stats.laps.filter(function(l){return l._track===track;}))[0]||null;}
function parseDateValue(value){
  var s=String(value||'').trim();
  var m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(m)return new Date(Number(m[3]),Number(m[2])-1,Number(m[1])).getTime();
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return new Date(Number(m[1]),Number(m[2])-1,Number(m[3])).getTime();
  var t=Date.parse(s);
  return Number.isFinite(t)?t:Number.MAX_SAFE_INTEGER;
}
function pilotProgressData(stats,track){
  var groups={};
  stats.laps.filter(function(l){return track==='all'||l._track===track;}).forEach(function(l){
    var key=l.session_name||l._date||l.session_id||'session';
    var sortDate=parseDateValue(l._date||l.session_date||l.date||key);
    if(!groups[key]||l._time<groups[key].time)groups[key]={label:key,time:l._time,date:l._date,sortDate:sortDate};
  });
  return Object.values(groups).sort(function(a,b){
    return (a.sortDate-b.sortDate)||String(a.label).localeCompare(String(b.label));
  }).slice(-18);
}
function progressDateLabel(point){
  var key=dateKeyFromValue(point.date||point.label);
  if(key){
    var p=key.split('-');
    return p[2]+'/'+p[1];
  }
  return String(point.label||'').slice(0,8);
}
function renderProgressSvg(points){
  if(points.length<2)return '<p class="small">Pas encore assez de sessions pour afficher une progression.</p>';
  var w=760,h=250,left=58,right=18,top=18,bottom=48;
  var times=points.map(function(p){return p.time;});
  var min=Math.min.apply(null,times),max=Math.max.apply(null,times);
  var margin=Math.max((max-min)*0.08,0.2);
  min=Math.max(0,min-margin);
  max=max+margin;
  if(max===min)max=min+1;
  function x(i){return left+(i/(points.length-1))*(w-left-right);}
  function y(v){return top+((max-v)/(max-min))*(h-top-bottom);}
  var d=points.map(function(p,i){return (i?'L':'M')+x(i).toFixed(1)+' '+y(p.time).toFixed(1);}).join(' ');
  var best=Math.min.apply(null,times);
  var yTicks=[];
  for(var yi=0;yi<5;yi++){
    var tv=min+((max-min)/4)*yi;
    var ty=y(tv);
    yTicks.push('<line class="progress-grid" x1="'+left+'" y1="'+ty.toFixed(1)+'" x2="'+(w-right)+'" y2="'+ty.toFixed(1)+'"></line><text class="progress-label" x="8" y="'+(ty+4).toFixed(1)+'">'+fmtTime(tv)+'</text>');
  }
  var step=Math.max(1,Math.ceil(points.length/6));
  var xTicks=points.map(function(p,i){
    if(i!==0&&i!==points.length-1&&(i%step)!==0)return '';
    var tx=x(i);
    return '<line class="progress-axis" x1="'+tx.toFixed(1)+'" y1="'+(h-bottom)+'" x2="'+tx.toFixed(1)+'" y2="'+(h-bottom+5)+'"></line><text class="progress-label" text-anchor="middle" x="'+tx.toFixed(1)+'" y="'+(h-20)+'">'+escapeHtml(progressDateLabel(p))+'</text>';
  }).join('');
  var dots=points.map(function(p,i){
    var isBest=Math.abs(p.time-best)<0.0005;
    return '<circle class="progress-dot '+(isBest?'progress-dot-best':'')+'" cx="'+x(i).toFixed(1)+'" cy="'+y(p.time).toFixed(1)+'" r="'+(isBest?6:4)+'"><title>'+escapeHtml(p.label)+' - '+fmtTimeS(p.time)+(isBest?' - Best':'')+'</title></circle>';
  }).join('');
  return '<div class="progress-wrap"><svg class="progress-svg" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="xMidYMid meet">'+
    yTicks.join('')+
    '<line class="progress-axis" x1="'+left+'" y1="'+(h-bottom)+'" x2="'+(w-right)+'" y2="'+(h-bottom)+'"></line>'+
    '<line class="progress-axis" x1="'+left+'" y1="'+top+'" x2="'+left+'" y2="'+(h-bottom)+'"></line>'+
    xTicks+
    '<path class="progress-line" d="'+d+'"></path>'+dots+
    '<text class="progress-label axis-title" x="'+(left+8)+'" y="12">Secondes</text>'+
    '<text class="progress-label axis-title" text-anchor="end" x="'+(w-right)+'" y="'+(h-4)+'">Dates des sessions</text>'+
  '</svg></div>';
}
function renderSessionLapSvg(points){
  if(points.length<2)return '<p class="small">Pas encore assez de tours pour afficher une courbe.</p>';
  var w=760,h=250,left=58,right=18,top=18,bottom=42;
  var times=points.map(function(p){return p.time;}).filter(function(v){return Number.isFinite(v);});
  if(!times.length)return '<p class="small">Aucun chrono exploitable pour cette courbe.</p>';
  var min=Math.min.apply(null,times),max=Math.max.apply(null,times);
  var margin=Math.max((max-min)*0.08,0.2);
  min=Math.max(0,min-margin);
  max=max+margin;
  if(max===min)max=min+1;
  function x(i){return left+(points.length===1?0.5:i/(points.length-1))*(w-left-right);}
  function y(v){return top+((max-v)/(max-min))*(h-top-bottom);}
  var d=points.map(function(p,i){return (i?'L':'M')+x(i).toFixed(1)+' '+y(p.time).toFixed(1);}).join(' ');
  var best=Math.min.apply(null,times);
  var yTicks=[];
  for(var yi=0;yi<5;yi++){
    var tv=min+((max-min)/4)*yi;
    var ty=y(tv);
    yTicks.push('<line class="progress-grid" x1="'+left+'" y1="'+ty.toFixed(1)+'" x2="'+(w-right)+'" y2="'+ty.toFixed(1)+'"></line><text class="progress-label" x="8" y="'+(ty+4).toFixed(1)+'">'+fmtTime(tv)+'</text>');
  }
  var step=Math.max(1,Math.ceil(points.length/6));
  var xTicks=points.map(function(p,i){
    if(i!==0&&i!==points.length-1&&(i%step)!==0)return '';
    var tx=x(i);
    return '<line class="progress-axis" x1="'+tx.toFixed(1)+'" y1="'+(h-bottom)+'" x2="'+tx.toFixed(1)+'" y2="'+(h-bottom+5)+'"></line><text class="progress-label" text-anchor="middle" x="'+tx.toFixed(1)+'" y="'+(h-18)+'">'+escapeHtml(String(p.lapNo))+'</text>';
  }).join('');
  var dots=points.map(function(p,i){
    var isBest=Math.abs(p.time-best)<0.0005;
    return '<circle class="progress-dot '+(isBest?'progress-dot-best':'')+'" cx="'+x(i).toFixed(1)+'" cy="'+y(p.time).toFixed(1)+'" r="'+(isBest?6:4)+'"><title>Tour '+escapeHtml(String(p.lapNo))+' - '+fmtTimeS(p.time)+(isBest?' - Best':'')+'</title></circle>';
  }).join('');
  return '<div class="progress-wrap session-chart-wrap"><svg class="progress-svg session-chart-svg" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="xMidYMid meet">'+
    yTicks.join('')+
    '<line class="progress-axis" x1="'+left+'" y1="'+(h-bottom)+'" x2="'+(w-right)+'" y2="'+(h-bottom)+'"></line>'+
    '<line class="progress-axis" x1="'+left+'" y1="'+top+'" x2="'+left+'" y2="'+(h-bottom)+'"></line>'+
    xTicks+
    '<path class="progress-line" d="'+d+'"></path>'+dots+
    '<text class="progress-label axis-title" x="'+(left+8)+'" y="12">Secondes</text>'+
    '<text class="progress-label axis-title" text-anchor="end" x="'+(w-right)+'" y="'+(h-4)+'">Numero de tour</text>'+
  '</svg></div>';
}

