// Extrait de app_v2.js (decoupage modules) - voir docs/DEVELOPMENT.md
// Navigation/filtres, page d'accueil, podiums, profil pilote complet.
function updateAdminNav(){var nav=document.getElementById('adminNav');if(nav)nav.classList.toggle('hidden',!state.isAdmin);}
function setActiveNav(){var hash=location.hash||'#/';document.querySelectorAll('.nav-link').forEach(function(el){el.classList.remove('active');});document.querySelectorAll('.nav-link[href]').forEach(function(el){var href=el.getAttribute('href');if(href===hash||(hash.startsWith(href)&&href!=='#/'))el.classList.add('active');});if(hash==='#/'){var home=document.querySelector('.nav-link[href="#/"]');if(home)home.classList.add('active');}}
function renderFilters(includePeriod){
  return '<div class="filters"><select id="trackFilter"><option value="all">Toutes pistes</option><option value="TT1/8">TT1/8</option><option value="TT1/10">TT1/10</option></select>' +
    (includePeriod?'<select id="recordPeriodFilter"><option value="day">Journalier</option><option value="week">Semaine</option><option value="month">Mois</option><option value="year">Année</option><option value="total">Total</option></select>':'') +
  '</div>';
}
function bindFilters(cb,includePeriod){
  var t=document.getElementById('trackFilter');if(t){t.value=state.track;t.onchange=function(e){state.track=e.target.value;cb();};}
  var p=document.getElementById('recordPeriodFilter');if(p){p.value=state.recordPeriod;p.onchange=function(e){state.recordPeriod=e.target.value;cb();};}
}
function recordsTable(rows,limit){limit=limit||20;return'<div class="table-wrap"><table><thead><tr><th>#</th><th>Pilote</th><th>Temps</th><th>Piste</th><th>Session</th></tr></thead><tbody>'+rows.slice(0,limit).map(function(r,i){return'<tr><td>'+(i+1)+'</td><td><a href="#/pilote/'+encodeURIComponent(r._pilot)+'">'+escapeHtml(r._pilot)+'</a></td><td><strong>'+fmtTimeS(r._time)+'</strong></td><td><span class="badge">'+escapeHtml(displayTrack(r._track))+'</span></td><td>'+escapeHtml(r.session_name||r._date||'-')+'</td></tr>';}).join('')+'</tbody></table></div>';}
function podiumHtml(rows,compact){
  var top=rows.slice(0,3);
  if(!top.length)return'<p class="small">Aucun chrono trouve.</p>';
  var order=[1,0,2], labels=['Champion','Deuxieme','Troisieme'], tones=['gold','silver','bronze'];
  var cards='<div class="podium '+(compact?'podium-compact':'podium-showcase')+'">'+order.map(function(i){
    var r=top[i];
    if(!r)return'<div></div>';
    var cls=i===0?'first':i===1?'second':'third';
    var rank=i+1;
    var gap=top[0]&&i!==0 ? r._time-top[0]._time : 0;
    var meta=compact ? escapeHtml(r._track) : '<span class="podium-track-pill">'+escapeHtml(displayTrack(r._track))+'</span><span>'+escapeHtml(r.session_name||r._date||'-')+'</span>';
    return'<a class="step '+cls+'" href="#/pilote/'+encodeURIComponent(r._pilot)+'">'+
      (!compact?'<span class="podium-giant-rank">'+rank+'</span>':'')+
      '<span class="podium-rank podium-rank-'+tones[i]+'">'+rank+'</span>'+
      '<span class="podium-logo-wrap"><img class="podium-logo" src="icon-192.png" alt=""></span>'+
      '<span class="medal">'+labels[i]+'</span>'+
      '<strong class="podium-driver">'+escapeHtml(r._pilot)+'</strong>'+
      '<div class="time">'+fmtTime(r._time)+'</div>'+
      '<div class="podium-meta">'+meta+'</div>'+
      (!compact?'<div class="podium-gap">'+(i===0?'Leader actuel':'+'+fmtTimeS(gap)+' sur P1')+'</div>':'')+
      (!compact?'<div class="podium-profile">Profil</div>':'')+
      (!compact?'<div class="podium-plinth">'+rank+'</div>':'')+
    '</a>';
  }).join('')+'</div>';
  if(compact)return cards;
  return '<div class="podium-arena"><div class="podium-arena-bg"><img src="mrcp-logo-bg.png" alt=""></div><div class="podium-arena-head"><div><div class="podium-kicker">Top 3 MRCP</div><h3>Podium officiel</h3></div><div class="podium-cup">🏆</div></div>'+cards+'</div>';
}
function homePodiumsHtml(){var laps=getAllLaps();return '<div class="podium-stack">'+['TT1/10','TT1/8'].map(function(track){var rows=bestByPilot(laps.filter(function(l){return l._track===track;}));return '<div class="podium-block"><div class="podium-block-title">'+escapeHtml(track)+'</div>'+podiumHtml(rows,true)+'</div>';}).join('')+'</div>';}
function podiumTrackSummaryHtml(laps){
  return '<div class="podium-summary-grid">'+['TT1/10','TT1/8'].map(function(track){
    var rows=bestByPilot(laps.filter(function(l){return l._track===track;}));
    var leader=rows[0], second=rows[1], gap=leader&&second ? second._time-leader._time : null;
    return '<div class="podium-summary-card">' +
      '<div class="podium-summary-head"><span class="badge">'+escapeHtml(track)+'</span><span>'+rows.length+' pilotes</span></div>' +
      '<strong>'+escapeHtml(leader?leader._pilot:'-')+'</strong>' +
      '<div class="podium-summary-time">'+fmtTimeS(leader&&leader._time)+'</div>' +
      '<div class="small">'+(gap!=null?'Avance sur P2 : '+fmtTimeS(gap):'Pas encore de P2')+'</div>' +
    '</div>';
  }).join('')+'</div>';
}
function podiumHallOfFameHtml(laps){
  var medals={};
  ['TT1/10','TT1/8'].forEach(function(track){
    bestByPilot(laps.filter(function(l){return l._track===track;})).slice(0,3).forEach(function(r,i){
      if(!medals[r._pilot])medals[r._pilot]={pilot:r._pilot,gold:0,silver:0,bronze:0,total:0,best:r._time,tracks:{}};
      if(i===0)medals[r._pilot].gold++;
      if(i===1)medals[r._pilot].silver++;
      if(i===2)medals[r._pilot].bronze++;
      medals[r._pilot].total++;
      medals[r._pilot].tracks[track]=true;
      if(r._time<medals[r._pilot].best)medals[r._pilot].best=r._time;
    });
  });
  var rows=Object.values(medals).sort(function(a,b){return b.gold-a.gold||b.silver-a.silver||b.bronze-a.bronze||a.best-b.best;});
  if(!rows.length)return '<p class="small">Aucun podium disponible.</p>';
  return '<div class="table-wrap"><table><thead><tr><th>Pilote</th><th>Or</th><th>Argent</th><th>Bronze</th><th>Pistes</th><th>Best</th></tr></thead><tbody>'+
    rows.map(function(r){return '<tr><td><a href="#/pilote/'+encodeURIComponent(r.pilot)+'">'+escapeHtml(r.pilot)+'</a></td><td>'+r.gold+'</td><td>'+r.silver+'</td><td>'+r.bronze+'</td><td><span class="badge">'+escapeHtml(Object.keys(r.tracks).join(' / '))+'</span></td><td><strong>'+fmtTimeS(r.best)+'</strong></td></tr>';}).join('')+
  '</tbody></table></div>';
}

function homeRecordBreakersHtml(){
  var rows=latestPersonalRecords(6);
  if(!rows.length)return '';
  var items=rows.map(function(r){
    return '<a class="record-row" href="#/pilote/'+encodeURIComponent(r.pilot)+'">' +
      '<div class="record-rank">🔥</div>' +
      '<div><div class="record-name">'+escapeHtml(r.pilot)+'</div>' +
        '<div class="record-sub">'+escapeHtml(displayTrack(r.track))+' · '+escapeHtml(dateFrFromValue(r.date))+'</div></div>' +
      '<div class="record-time">'+fmtTimeS(r.time)+
        '<div class="record-sub">-'+r.gain.toFixed(3)+' s</div></div>' +
    '</a>';
  }).join('');
  return '<section class="card"><div class="panel-title"><h2>🔥 Ils ont battu leur record</h2>' +
      '<a class="mini-button" href="#/historique-records">Historique</a></div>' +
    '<p class="small">Derniers pilotes à avoir amélioré leur propre meilleur temps, avec le gain réalisé.</p>' +
    '<div>'+items+'</div></section>';
}

function home(){
  var laps=getAllLaps(), sessions=latestActivities(10), pilotsCount=bestByPilot(laps).length, distanceKm=totalDistanceKm(laps);
  var dayLaps=liveDaySourceLaps(todayKey());
  var dayRows=liveDayRows(dayLaps);
  var dayBest=dayRows[0]||null;
  var dayBest18=liveDayRows(dayLaps.filter(function(l){return l._track==='TT1/8';}))[0]||null;
  var dayBest10=liveDayRows(dayLaps.filter(function(l){return l._track==='TT1/10';}))[0]||null;
  var sessionRows=sessions.map(function(a){
    var tracks=Object.keys(a.tracks).join(' / ')||'-';
    var pilot=a.bestPilot||('Inconnu #'+(a.bestTransponder||''));
    var pilotLabel=a.bestPilot||a.bestTransponder||'Pilote inconnu';
    var href='#/pilote-session/'+encodeURIComponent(pilot)+'/'+encodeURIComponent(a.key);
    return '<a class="activity-row session-home-row session-home-link" href="'+href+'">' +
      '<div class="activity-date">'+escapeHtml(a.date||a.name)+'</div>' +
      '<div><div class="activity-track">'+escapeHtml(pilotLabel)+'</div><div class="activity-sub">'+escapeHtml(tracks)+' · '+a.laps+' tours · '+Object.keys(a.pilots).length+' pilotes</div></div>' +
      '<div><strong>'+fmtTimeS(a.best)+'</strong><div class="activity-sub">best</div></div>' +
    '</a>';
  }).join('');
  app.innerHTML='<section class="hero-dashboard"><div class="hero-card"><h1>Dashboard MRCP</h1><p>Chronos, records, podiums et progression personnelle.</p><div class="hero-actions"><a href="#/sessions" class="btn-primary">Sessions</a><a href="#/journee?date='+todayKey()+'" class="btn-secondary">Vue journée</a></div></div><div class="card kpi-card"><h2>Chiffres clés</h2><div class="kpi-grid"><div class="kpi"><div class="kpi-icon">👥</div><div><div class="kpi-label">Pilotes</div><div class="kpi-value">'+pilotsCount+'</div><div class="kpi-label">inscrits</div></div></div><div class="kpi"><div class="kpi-icon">⏱️</div><div><div class="kpi-label">Tours</div><div class="kpi-value">'+laps.length.toLocaleString('fr-FR')+'</div><div class="kpi-label">enregistrés</div></div></div><div class="kpi"><div class="kpi-icon">📍</div><div><div class="kpi-label">Kilomètres</div><div class="kpi-value">'+fmtKm(distanceKm)+'</div><div class="kpi-label">estimés</div></div></div><div class="kpi"><div class="kpi-icon">📋</div><div><div class="kpi-label">Tours aujourd hui</div><div class="kpi-value">'+dayLaps.length.toLocaleString('fr-FR')+'</div><div class="kpi-label">'+escapeHtml(todayKey())+'</div></div></div><div class="kpi"><div class="kpi-icon">👤</div><div><div class="kpi-label">Pilotes jour</div><div class="kpi-value">'+dayRows.length+'</div><div class="kpi-label">actifs</div></div></div><div class="kpi"><div class="kpi-icon">⚡</div><div><div class="kpi-label">Best jour</div><div class="kpi-value">'+fmtTime(dayBest&&dayBest.best)+'</div><div class="kpi-label">'+escapeHtml(dayBest?dayBest.pilot:'-')+'</div></div></div></div></div></section><section class="dashboard-grid home-dashboard-grid"><div class="card home-sessions-card"><div class="panel-title"><h2>📅 10 dernières sessions</h2><a class="mini-button" href="#/sessions">Voir tout</a></div><div>'+(sessionRows||'<p class="small">Aucune session trouvée.</p>')+'</div></div><div class="card"><div class="panel-title"><h2>🏁 Records du jour</h2><a class="mini-button" href="#/journee?date='+todayKey()+'">Voir journée</a></div><div class="day-record-grid"><div><span class="badge">TT1/8</span><strong>'+fmtTimeS(dayBest18&&dayBest18.best)+'</strong><small>'+escapeHtml(dayBest18?dayBest18.pilot:'-')+'</small></div><div><span class="badge">TT1/10</span><strong>'+fmtTimeS(dayBest10&&dayBest10.best)+'</strong><small>'+escapeHtml(dayBest10?dayBest10.pilot:'-')+'</small></div></div>'+homePodiumsHtml()+'</div></section>'+homeRecordBreakersHtml();
}

function sessionPaceBlocksHtml(laps){
  if(laps.length<2)return '<p class="small">Pas assez de tours pour analyser le rythme.</p>';
  var blocks=[];
  for(var i=0;i<laps.length;i+=5){
    var part=laps.slice(i,i+5);
    var avg=part.reduce(function(sum,l){return sum+l._time;},0)/part.length;
    var best=part.reduce(function(min,l){return Math.min(min,l._time);},Infinity);
    blocks.push({from:i+1,to:i+part.length,avg:avg,best:best});
  }
  return '<div class="pace-blocks">'+blocks.map(function(b){
    return '<div class="pace-block"><strong>Tours '+b.from+'-'+b.to+'</strong><span>Moy. '+fmtTimeS(b.avg)+'</span><span>Best '+fmtTimeS(b.best)+'</span></div>';
  }).join('')+'</div>';
}


function pilotSessions(stats){
  var map = {};
  stats.laps.forEach(function(l){
    var key = l.session_id || l.session_name || l._date || 'session';
    if(!map[key]){
      map[key] = {
        key:key,
        name:l.session_name || l._date || key,
        date:l._date || '',
        laps:0,
        best:Infinity,
        avg:0,
        total:0,
        tracks:{},
        lapsList:[]
      };
    }
    map[key].laps += 1;
    map[key].lapsList.push(l);
    map[key].total += l._time;
    if(l._time < map[key].best) map[key].best = l._time;
    map[key].tracks[l._track] = true;
  });
  return Object.values(map).map(function(s){
    s.avg = s.laps ? s.total / s.laps : null;
    return s;
  }).sort(function(a,b){
    return String(b.date || b.name).localeCompare(String(a.date || a.name));
  });
}

function pilotConsistency(stats){
  if(!stats.laps.length) return null;
  var avg = stats.avg;
  var variance = stats.laps.reduce(function(sum,l){return sum + Math.pow(l._time - avg, 2);}, 0) / stats.laps.length;
  return Math.sqrt(variance);
}

function lapSortValue(l){
  var start=String(l.start_time||l.started_at||'');
  var n=Number(String(start).replace(/:/g,''));
  if(Number.isFinite(n)&&n>0)return n;
  return Number(l.lap_no||l.lap||l.number||0);
}

function sortedSessionLaps(session){
  return (session.lapsList||[]).slice().sort(function(a,b){
    return lapSortValue(a)-lapSortValue(b)||Number(a.lap_no||0)-Number(b.lap_no||0)||a._time-b._time;
  });
}

function sessionLapsTable(session){
  var laps=sortedSessionLaps(session);
  if(!laps.length)return '<p class="small">Aucun tour dans cette session.</p>';
  var best=session.best;
  return '<div class="table-wrap session-laps-table"><table><thead><tr><th>#</th><th>Temps</th><th>Ecart best</th><th>Piste</th><th>Heure</th></tr></thead><tbody>'+
    laps.map(function(l,i){
      var gap=l._time-best;
      var cls=gap===0?' class="best-lap-row"':'';
      return '<tr'+cls+'><td>'+(l.lap_no||i+1)+'</td><td><strong>'+fmtTimeS(l._time)+'</strong></td><td>'+(gap===0?'Best':'+'+fmtTimeS(gap))+'</td><td><span class="badge">'+escapeHtml(l._track)+'</span></td><td>'+escapeHtml(l.start_time||l.started_at||'-')+'</td></tr>';
    }).join('')+'</tbody></table></div>';
}

function pilotSessionDetailHtml(name, sessionKey){
  var stats=pilotStats(name);
  var session=pilotSessions(stats).filter(function(s){return s.key===sessionKey;})[0];
  if(!session){
    return '<section class="card"><h2>Session introuvable</h2><p class="small">Impossible de retrouver cette session pour '+escapeHtml(name)+'.</p><p><a class="btn-secondary" href="#/pilote/'+encodeURIComponent(name)+'">Retour fiche pilote</a></p></section>';
  }
  var laps=sortedSessionLaps(session);
  var consistency=session.laps>1?Math.sqrt(laps.reduce(function(sum,l){return sum+Math.pow(l._time-session.avg,2);},0)/laps.length):0;
  var points=laps.map(function(l,i){return{lapNo:i+1,time:l._time};});
  return '<section class="card session-detail-hero">' +
    '<div><a class="mini-button" href="#/pilote/'+encodeURIComponent(name)+'">Retour pilote</a><h1>'+escapeHtml(session.name)+'</h1><p class="small">'+escapeHtml(name)+' · '+escapeHtml(Object.keys(session.tracks).join(' / ')||'-')+'</p></div>' +
    '<div class="session-detail-actions"><button id="copySessionLink" class="btn-secondary">Copier lien</button><button id="printPilotProfile" class="btn-secondary">Imprimer</button></div>' +
  '</section>' +
  '<section class="grid">' +
    '<div class="card"><h3>Tours</h3><div class="big">'+session.laps+'</div></div>' +
    '<div class="card"><h3>Meilleur</h3><div class="big">'+fmtTimeS(session.best)+'</div></div>' +
    '<div class="card"><h3>Moyenne</h3><div class="big">'+fmtTimeS(session.avg)+'</div></div>' +
    '<div class="card"><h3>Regularite</h3><div class="big">'+fmtTimeS(consistency)+'</div></div>' +
  '</section>' +
  '<section class="card"><h3>Courbe de session</h3>'+renderSessionLapSvg(points)+'</section>' +
  '<section class="card"><h3>Rythme par blocs de 5 tours</h3>'+sessionPaceBlocksHtml(laps)+'</section>' +
  '<section class="card"><h3>Tours de la session</h3>'+sessionLapsTable(session)+'</section>';
}

function pilotTrackTarget(stats, track){
  var best = pilotBestByTrack(stats, track);
  var club = clubBest(track);
  var laps = stats.laps.filter(function(l){return l._track===track;});
  if(!best || !club || !laps.length) return null;

  var gap = best._time - club._time;
  var gain = gap > 1 ? 0.5 : (gap > 0.35 ? 0.2 : 0.1);
  var target = gap <= 0 ? best._time : Math.max(club._time, best._time - gain);
  var avg = laps.reduce(function(sum,l){return sum+l._time;},0)/laps.length;
  var consistency = Math.sqrt(laps.reduce(function(sum,l){return sum+Math.pow(l._time-avg,2);},0)/laps.length);
  var message = gap <= 0 ? 'Record club actuel' : (gap <= 0.35 ? 'Objectif record a portee' : 'Prochain palier realiste');

  return {track:track,best:best,club:club,gap:gap,target:target,avg:avg,consistency:consistency,laps:laps.length,message:message};
}

function pilotTargetsHtml(stats){
  var targets=['TT1/8','TT1/10'].map(function(track){return pilotTrackTarget(stats,track);}).filter(Boolean);
  if(!targets.length)return '<p class="small">Pas encore assez de chronos par piste pour proposer des objectifs.</p>';
  return '<div class="target-grid">'+targets.map(function(t){
    var gapText=t.gap<=0?'+'+fmtTimeS(Math.abs(t.gap))+' sur le record':'-'+fmtTimeS(t.gap)+' du record';
    return '<div class="target-card">' +
      '<div class="target-head"><span class="badge">'+escapeHtml(t.track)+'</span><strong>'+escapeHtml(t.message)+'</strong></div>' +
      '<div class="target-time">'+fmtTimeS(t.target)+'</div>' +
      '<div class="target-meta">' +
        '<span>Best '+fmtTimeS(t.best._time)+'</span>' +
        '<span>Record '+fmtTimeS(t.club._time)+'</span>' +
        '<span>'+escapeHtml(gapText)+'</span>' +
        '<span>'+t.laps+' tours, regul. '+fmtTimeS(t.consistency)+'</span>' +
      '</div>' +
    '</div>';
  }).join('')+'</div>';
}

function pilotPersonalRecordsHtml(stats){
  return '<div class="table-wrap"><table><thead><tr><th>Piste</th><th>Record perso</th><th>Date</th><th>Session</th><th>Tours piste</th></tr></thead><tbody>'+
    ['TT1/8','TT1/10'].map(function(track){
      var laps=stats.laps.filter(function(l){return l._track===track;});
      var best=pilotBestByTrack(stats,track);
      return '<tr><td><span class="badge">'+escapeHtml(track)+'</span></td><td><strong>'+fmtTimeS(best&&best._time)+'</strong></td><td>'+escapeHtml(best&&(best._date||best.session_date)||'-')+'</td><td>'+escapeHtml(best&&(best.session_name||best.session_id)||'-')+'</td><td>'+laps.length+'</td></tr>';
    }).join('')+
  '</tbody></table></div>';
}

function pilotAiInsights(stats){
  var sessions = pilotSessions(stats).slice().reverse();
  var insights = [];

  if(!stats.laps.length){
    return ['Pas encore assez de données pour analyser ce pilote.'];
  }

  var best = stats.best ? stats.best._time : null;
  var avg = stats.avg;
  var consistency = pilotConsistency(stats);

  if(best && avg){
    var gap = avg - best;
    if(gap < 2){
      insights.push('Très bonne régularité : la moyenne est proche du meilleur tour.');
    }else if(gap < 5){
      insights.push('Régularité correcte : il y a encore un peu de temps à gagner sur les tours moyens.');
    }else{
      insights.push('Gros potentiel de régularité : les meilleurs tours sont bons mais les tours moyens peuvent beaucoup progresser.');
    }
  }

  if(sessions.length >= 4){
    var firstBlock = sessions.slice(0, Math.min(3, sessions.length));
    var lastBlock = sessions.slice(-Math.min(3, sessions.length));

    var firstAvgBest = firstBlock.reduce(function(s,x){return s+x.best;},0)/firstBlock.length;
    var lastAvgBest = lastBlock.reduce(function(s,x){return s+x.best;},0)/lastBlock.length;
    var gain = firstAvgBest - lastAvgBest;

    if(gain > 0.5){
      insights.push('Progression positive : environ ' + gain.toFixed(2) + ' s gagnées sur les meilleures sessions récentes.');
    }else if(gain < -0.5){
      insights.push('Les dernières sessions sont un peu moins rapides : à vérifier selon météo, pneus ou trafic.');
    }else{
      insights.push('Niveau stable sur les dernières sessions.');
    }
  }else{
    insights.push('Ajoute encore quelques sessions pour obtenir une analyse de progression plus fiable.');
  }

  if(consistency !== null){
    if(consistency < 2){
      insights.push('Style de roulage très constant, bon pour travailler les réglages fins.');
    }else if(consistency < 5){
      insights.push('Régularité moyenne : viser des runs propres peut faire baisser la moyenne rapidement.');
    }else{
      insights.push('Écart important entre les tours : priorité au rythme constant avant de chercher le tour parfait.');
    }
  }

  var best18 = pilotBestByTrack(stats, 'TT1/8');
  var best10 = pilotBestByTrack(stats, 'TT1/10');

  if(best18 && best10){
    insights.push('Le pilote a des données sur TT1/8 et TT1/10 : garder les comparaisons séparées pour éviter les faux records.');
  }else if(best18){
    insights.push('Profil principalement TT1/8.');
  }else if(best10){
    insights.push('Profil principalement TT1/10.');
  }

  return insights.slice(0, 5);
}

function qrUrlForPilot(name){
  var url = location.origin + location.pathname + '#/pilote/' + encodeURIComponent(name);
  return 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(url);
}
function qrUrlForProfileChoice(){
  var url = location.origin + location.pathname + '#/mes-chronos';
  return 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=' + encodeURIComponent(url);
}

function pilotProgressSentenceHtml(name){
  var lines = ['TT1/8','TT1/10'].map(function(track){
    var p = pilotSeasonProgress(name, track);
    if(!p || p.gain <= 0) return '';
    return '<li><strong>' + escapeHtml(displayTrack(track)) + '</strong> : ' +
      '<span class="progress-gain">-' + p.gain.toFixed(3) + ' s</span> depuis le ' +
      escapeHtml(dateFrFromValue(p.firstDay)) + ' (' + fmtTimeS(p.first) + ' → ' + fmtTimeS(p.best) + ')</li>';
  }).filter(Boolean).join('');
  if(!lines) return '';
  return '<section class="card"><h3>📈 Progression depuis le début</h3>' +
    '<ul class="progress-list">' + lines + '</ul></section>';
}

function pilotFullProfileHtml(name){
  var s = pilotStats(name);
  var best18 = pilotBestByTrack(s,'TT1/8');
  var best10 = pilotBestByTrack(s,'TT1/10');
  var club18 = clubBest('TT1/8');
  var club10 = clubBest('TT1/10');
  var gap18 = (best18 && club18) ? best18._time - club18._time : null;
  var gap10 = (best10 && club10) ? best10._time - club10._time : null;
  var sessions = pilotSessions(s);
  var chartTrack = best18 ? 'TT1/8' : (best10 ? 'TT1/10' : 'all');
  var progress = pilotProgressData(s, chartTrack);
  var progress18 = pilotProgressData(s, 'TT1/8');
  var progress10 = pilotProgressData(s, 'TT1/10');
  var insights = pilotAiInsights(s);
  var consistency = pilotConsistency(s);
  var badges = pilotBadges(s);
  var series18 = bestLapSeries(s.laps.filter(function(l){return l._track==='TT1/8';}));
  var series10 = bestLapSeries(s.laps.filter(function(l){return l._track==='TT1/10';}));

  return '<section class="pilot-hero">' +
    '<div class="card pilot-main-card">' +
      '<div class="pilot-name">🏎️ '+escapeHtml(name)+'</div>' +
      badgesHtml(badges) +
      '<p class="pilot-sub">Profil pilote complet : performances, progression, régularité et QR code.</p>' +
      '<div class="goal-box">' +
        '<div class="goal-pill"><span class="small">Best TT1/8</span><strong>'+fmtTimeS(best18&&best18._time)+'</strong></div>' +
        '<div class="goal-pill"><span class="small">Best TT1/10</span><strong>'+fmtTimeS(best10&&best10._time)+'</strong></div>' +
        '<div class="goal-pill"><span class="small">Moyenne</span><strong>'+fmtTimeS(s.avg)+'</strong></div>' +
        '<div class="goal-pill"><span class="small">Régularité</span><strong>'+fmtTimeS(consistency)+'</strong></div>' +
        '<div class="goal-pill"><span class="small">Série '+SERIES_LAP_COUNT+' tours TT1/8</span><strong>'+fmtTimeS(series18&&series18.avg)+'</strong></div>' +
        '<div class="goal-pill"><span class="small">Série '+SERIES_LAP_COUNT+' tours TT1/10</span><strong>'+fmtTimeS(series10&&series10.avg)+'</strong></div>' +
      '</div>' +
      '<div class="share-row">' +
        '<button id="setMyProfile" class="btn-primary">C’est mon profil</button>' +
        '<button id="copyPilotLink" class="btn-secondary">Copier lien fiche</button>' +
        '<button id="sharePilotImage" class="btn-secondary">Image partageable</button>' +
        '<button id="printPilotProfile" class="btn-secondary">Imprimer fiche</button>' +
      '</div>' +
    '</div>' +
    '<div class="card qr-card">' +
      '<h3>📱 QR code pilote</h3>' +
      '<img class="qr-img" src="'+qrUrlForPilot(name)+'" alt="QR code fiche pilote">' +
      '<p class="small">À afficher au club : le pilote scanne et arrive directement sur sa fiche.</p>' +
    '</div>' +
  '</section>' +
  pilotProgressSentenceHtml(name) +

  '<section class="grid">' +
    '<div class="card"><h3>Tours</h3><div class="big">'+s.laps.length+'</div></div>' +
    '<div class="card"><h3>Sessions</h3><div class="big">'+s.sessions+'</div></div>' +
    '<div class="card"><h3>Écart record TT1/8</h3><div class="big">'+(gap18!=null?fmtTimeS(gap18):'-')+'</div></div>' +
    '<div class="card"><h3>Écart record TT1/10</h3><div class="big">'+(gap10!=null?fmtTimeS(gap10):'-')+'</div></div>' +
  '</section>' +

  pilotSocialCardHtml(name,s,best18,best10) +

  '<section class="card">' +
    '<div class="panel-title"><h3>Objectifs pilote</h3></div>' +
    pilotTargetsHtml(s) +
  '</section>' +

  '<section class="card">' +
    '<div class="panel-title"><h3>Records personnels par piste</h3></div>' +
    pilotPersonalRecordsHtml(s) +
  '</section>' +

  '<section class="card ai-card">' +
    '<h3>🧠 Analyse progression IA</h3>' +
    '<div class="ai-list">' + insights.map(function(x){return '<div class="ai-item">💡 '+escapeHtml(x)+'</div>';}).join('') + '</div>' +
  '</section>' +

  '<section class="card">' +
    '<h3>📈 Progression récente — '+escapeHtml(chartTrack)+'</h3>' +
    renderProgressSvg(progress) +
  '</section>' +

  '<section class="report-columns">' +
    '<div class="card"><h3>Progression TT1/8</h3>'+renderProgressSvg(progress18)+'</div>' +
    '<div class="card"><h3>Progression TT1/10</h3>'+renderProgressSvg(progress10)+'</div>' +
  '</section>' +

  '<section class="card">' +
    '<h3>📅 Dernières sessions cliquables</h3>' +
    '<div class="table-wrap"><table><thead><tr><th>Session</th><th>Tours</th><th>Best</th><th>Moyenne</th><th>Pistes</th></tr></thead><tbody>' +
      sessions.slice(0,40).map(function(x){
        return '<tr><td><a href="#/pilote-session/'+encodeURIComponent(name)+'/'+encodeURIComponent(x.key)+'">'+escapeHtml(x.name)+'</a></td><td>'+x.laps+'</td><td><strong>'+fmtTimeS(x.best)+'</strong></td><td>'+fmtTimeS(x.avg)+'</td><td><span class="badge">'+escapeHtml(Object.keys(x.tracks).join(' / '))+'</span></td></tr>';
      }).join('') +
    '</tbody></table></div>' +
  '</section>' +

  '<section class="card">' +
    '<h3>⏱️ Derniers tours</h3>' +
    recordsTable(s.laps.slice(-60).reverse(),60) +
  '</section>';
}

function bindPilotProfileButtons(name){
  var set = document.getElementById('setMyProfile');
  if(set) set.onclick=function(){localStorage.setItem('mrcp_my_pilot',name);location.hash='#/mes-chronos';};

  var copy = document.getElementById('copyPilotLink');
  if(copy) copy.onclick=function(){
    navigator.clipboard.writeText(location.origin+location.pathname+'#/pilote/'+encodeURIComponent(name));
    alert('Lien fiche pilote copié');
  };

  var print = document.getElementById('printPilotProfile');
  if(print) print.onclick=function(){window.print();};

  var share = document.getElementById('sharePilotImage');
  if(share) share.onclick=function(){downloadPilotShareImage(name);};

}

