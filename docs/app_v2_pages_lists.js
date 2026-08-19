// Extrait de app_v2.js (decoupage modules) - voir docs/DEVELOPMENT.md
// Pages listes : mes chronos, pilotes, sessions, records club, rouleurs, comparatif.
function myChronos(){
  var saved=localStorage.getItem('mrcp_my_pilot'), pilots=allPilots();

  if(!saved){
    app.innerHTML='<section class="card pilot-main-card"><h2>Mes chronos</h2><p>Choisis ton profil une fois. Il sera mémorisé sur ce téléphone.</p><select id="pilotSelect"><option value="">Choisir un pilote</option>'+pilots.map(function(p){return'<option value="'+escapeHtml(p)+'">'+escapeHtml(p)+'</option>';}).join('')+'</select><div class="share-row"><button id="savePilot" class="btn-primary">C’est mon profil</button></div></section><section class="card"><h3>Pourquoi choisir mon profil ?</h3><p>Ensuite, tu retrouves directement tes meilleurs temps, ta moyenne, ta progression, ton QR code et ton analyse automatique.</p></section>';
    document.getElementById('savePilot').onclick=function(){
      var v=document.getElementById('pilotSelect').value;
      if(v){localStorage.setItem('mrcp_my_pilot',v);myChronos();}
    };
    return;
  }

  app.innerHTML = '<section class="card"><h2>Mes chronos</h2><button id="changePilot" class="btn-secondary">Changer de pilote</button></section>' + pilotFullProfileHtml(saved) + '<div class="mobile-sticky-action"><a href="#/records-club" class="btn-primary">Voir records club</a></div>';

  document.getElementById('changePilot').onclick=function(){
    localStorage.removeItem('mrcp_my_pilot');
    myChronos();
  };

  bindPilotProfileButtons(saved);
}
function pilots(){var best=bestByPilot(getAllLaps());app.innerHTML='<section class="card"><h2>Pilotes</h2><input class="searchBox" id="pilotSearch" placeholder="Rechercher un pilote..."><div id="pilotList">'+recordsTable(best,100)+'</div></section>';document.getElementById('pilotSearch').oninput=function(e){var q=e.target.value.toLowerCase();document.getElementById('pilotList').innerHTML=recordsTable(best.filter(function(r){return r._pilot.toLowerCase().indexOf(q)!==-1;}),100);};}
function pilotPage(encoded){
  var name=decodeURIComponent(encoded);
  app.innerHTML = pilotFullProfileHtml(name);
  bindPilotProfileButtons(name);
}
function pilotSessionPage(path){
  var parts=path.split('/');
  var name=decodeURIComponent(parts.shift()||'');
  var sessionKey=decodeURIComponent(parts.join('/')||'');
  app.innerHTML=pilotSessionDetailHtml(name,sessionKey);
  var copy=document.getElementById('copySessionLink');
  if(copy)copy.onclick=function(){
    navigator.clipboard.writeText(location.origin+location.pathname+'#/pilote-session/'+encodeURIComponent(name)+'/'+encodeURIComponent(sessionKey));
    alert('Lien session copié');
  };
  var print=document.getElementById('printPilotProfile');
  if(print)print.onclick=function(){window.print();};
}
function sessionListRows(){
  var rows=[];
  var pr=personalRecordMap();
  (DATA&&DATA.activities||[]).forEach(function(a){
    var sessionKey=a.id||a.activity_id||a.session_id||'';
    var date=a.date_fr||a.date||a.session_date||'';
    (a.participants||[]).forEach(function(p){
      var laps=p.laps||[];
      var first=laps[0]||{};
      var last=laps[laps.length-1]||{};
      var pilot=p.pilot_name||p.name||('Inconnu #'+(p.transponder||''));
      var hasPr=laps.some(function(l){return pr[l.lap_id]||l.personal_record;});
      rows.push({
        key:sessionKey,
        pilot:pilot,
        transponder:p.transponder||p.transponder_id||'',
        date:date,
        dateKey:dateInputValue(a.date||a.session_date||date),
        sortDate:parseDateValue(a.date||a.session_date||date),
        time:first.start_time||last.start_time||'',
        laps:p.laps_count||laps.length||0,
        best:p.best_lap||null,
        avg:p.avg_lap||null,
        personalRecord:hasPr,
        track:p.track||Object.keys((p.track_counts||{})).join(' / ')||'-',
        search:(pilot+' '+(p.transponder||'')+' '+date+' '+sessionKey).toLowerCase()
      });
    });
  });
  return rows.sort(function(a,b){
    return b.sortDate-a.sortDate||String(b.time).localeCompare(String(a.time))||a.pilot.localeCompare(b.pilot);
  });
}
function sessionListTable(rows, page){
  var perPage=20;
  var totalPages=Math.max(1,Math.ceil(rows.length/perPage));
  page=Math.min(Math.max(1,page||1),totalPages);
  var start=(page-1)*perPage;
  var pageRows=rows.slice(start,start+perPage);
  if(!pageRows.length)return '<p class="small">Aucune session trouvee.</p>';
  var lastDate='';
  var body=pageRows.map(function(r){
      var group='';
      if(r.date!==lastDate){
        lastDate=r.date;
        group='<tr class="session-day-row"><td colspan="8">'+escapeHtml(r.date||'Date inconnue')+'</td></tr>';
      }
      return group+'<tr data-search="'+escapeHtml(r.search)+'">' +
        '<td><a href="#/pilote-session/'+encodeURIComponent(r.pilot)+'/'+encodeURIComponent(r.key)+'"><strong>'+escapeHtml(r.pilot)+'</strong></a><div class="small">'+escapeHtml(r.transponder||'Sans puce')+(r.personalRecord?' · Record perso':'')+'</div></td>' +
        '<td>'+escapeHtml(r.date||'-')+'</td>' +
        '<td>'+escapeHtml(r.time||'-')+'</td>' +
        '<td>'+r.laps+'</td>' +
        '<td><strong>'+fmtTimeS(r.best)+'</strong></td>' +
        '<td>'+fmtTimeS(r.avg)+'</td>' +
        '<td><span class="badge">'+escapeHtml(r.track)+'</span></td>' +
        '<td><a class="mini-button" href="#/pilote-session/'+encodeURIComponent(r.pilot)+'/'+encodeURIComponent(r.key)+'">Ouvrir</a></td>' +
      '</tr>';
    }).join('');
  return '<div class="table-wrap sessions-table"><table><thead><tr><th>Transpondeur / pilote</th><th>Date</th><th>Heure</th><th>Tours</th><th>Best</th><th>Moyenne</th><th>Piste</th><th></th></tr></thead><tbody>'+body+'</tbody></table></div>'+sessionPagerHtml(page,totalPages);
}
function sessionPagerHtml(page,totalPages){
  if(totalPages<=1)return '';
  var prev=Math.max(1,page-1), next=Math.min(totalPages,page+1);
  return '<div class="session-pager">' +
    '<a class="btn-secondary '+(page===1?'disabled':'')+'" href="#/sessions?page='+prev+'">Precedent</a>' +
    '<span class="small">Page '+page+' / '+totalPages+'</span>' +
    '<a class="btn-secondary '+(page===totalPages?'disabled':'')+'" href="#/sessions?page='+next+'">Suivant</a>' +
  '</div>';
}
function sessionsPage(){
  var page=Number(hashParam('page','1'))||1;
  var all=sessionListRows();
  function applySessionFilters(){
    var q=(document.getElementById('sessionSearch')&&document.getElementById('sessionSearch').value||'').toLowerCase();
    var track=document.getElementById('sessionTrack')&&document.getElementById('sessionTrack').value||'all';
    var date=document.getElementById('sessionDate')&&document.getElementById('sessionDate').value||'';
    var filtered=all.filter(function(r){
      return (!q||r.search.indexOf(q)!==-1) && (track==='all'||String(r.track).indexOf(track)!==-1) && (!date||r.dateKey===date);
    });
    document.getElementById('sessionsCount').textContent=filtered.length+' sessions pilotes';
    document.getElementById('sessionsList').innerHTML=sessionListTable(filtered,1);
  }
  app.innerHTML='<section class="card"><div class="panel-title"><h2>Sessions</h2><span id="sessionsCount" class="small">'+all.length+' sessions pilotes</span></div><div class="session-filter-bar"><input class="searchBox" id="sessionSearch" placeholder="Rechercher pilote, puce, date..."><select id="sessionTrack"><option value="all">Toutes pistes</option><option value="TT1/8">TT1/8</option><option value="TT1/10">TT1/10</option></select><input id="sessionDate" type="date"><button id="sessionToday" class="btn-secondary">Aujourd hui</button><button id="sessionReset" class="btn-secondary">Reset</button></div><div id="sessionsList">'+sessionListTable(all,page)+'</div></section>';
  ['sessionSearch','sessionTrack','sessionDate'].forEach(function(id){var el=document.getElementById(id);if(el)el.oninput=applySessionFilters;if(el)el.onchange=applySessionFilters;});
  var today=document.getElementById('sessionToday');
  if(today)today.onclick=function(){document.getElementById('sessionDate').value=todayKey();applySessionFilters();};
  var reset=document.getElementById('sessionReset');
  if(reset)reset.onclick=function(){document.getElementById('sessionSearch').value='';document.getElementById('sessionTrack').value='all';document.getElementById('sessionDate').value='';applySessionFilters();};
}

function dayViewPage(){
  if(liveTimer) clearTimeout(liveTimer);
  var date=hashParam('date',todayKey());
  var dayLaps=liveDaySourceLaps(date);
  var rows=liveDayRows(dayLaps);
  var sessions=latestActivities(200).filter(function(s){return dateInputValue(s.date)===date;});
  var counts=liveTrackCounts(dayLaps);
  var best18=liveDayRows(dayLaps.filter(function(l){return l._track==='TT1/8';}))[0]||null;
  var best10=liveDayRows(dayLaps.filter(function(l){return l._track==='TT1/10';}))[0]||null;
  var sessionRows=sessions.map(function(s){
    var pilot=s.bestPilot||('Inconnu #'+(s.bestTransponder||''));
    return '<a class="activity-row session-home-row session-home-link" href="#/pilote-session/'+encodeURIComponent(pilot)+'/'+encodeURIComponent(s.key)+'"><div class="activity-date">'+escapeHtml(s.date||s.name)+'</div><div><div class="activity-track">'+escapeHtml(s.bestPilot||s.bestTransponder||'-')+'</div><div class="activity-sub">'+s.laps+' tours · '+Object.keys(s.pilots).length+' pilotes · '+escapeHtml(Object.keys(s.tracks).join(' / ')||'-')+'</div></div><div><strong>'+fmtTimeS(s.best)+'</strong><div class="activity-sub">best</div></div></a>';
  }).join('');
  app.innerHTML='<section class="card"><div class="panel-title"><h2>Vue journée</h2><input id="dayViewDate" type="date" value="'+escapeHtml(date)+'"></div><div class="grid"><div class="card"><h3>Tours</h3><div class="big">'+dayLaps.length+'</div></div><div class="card"><h3>Pilotes</h3><div class="big">'+rows.length+'</div></div><div class="card"><h3>TT1/8</h3><div class="big">'+(counts['TT1/8']||0)+'</div><p class="small">'+fmtTimeS(best18&&best18.best)+' '+escapeHtml(best18?best18.pilot:'')+'</p></div><div class="card"><h3>TT1/10</h3><div class="big">'+(counts['TT1/10']||0)+'</div><p class="small">'+fmtTimeS(best10&&best10.best)+' '+escapeHtml(best10?best10.pilot:'')+'</p></div></div></section><section class="card"><div class="panel-title"><h2>Classement du jour</h2><a class="mini-button" href="#/club-today?date='+escapeHtml(date)+'">Aujourd hui</a></div>'+liveDayTable(rows)+'</section><section class="card"><div class="panel-title"><h2>Sessions du jour</h2></div>'+(sessionRows||'<p class="small">Aucune session pour cette date.</p>')+'</section>';
  var input=document.getElementById('dayViewDate');
  if(input)input.onchange=function(){location.hash='#/journee?date='+input.value;};
}
function podiums(){
  var laps=getAllLaps();
  var filtered=applyRecordFilters(laps);
  var best=bestByPilot(filtered);
  app.innerHTML=
    '<section class="card podium-page-card"><div class="panel-title"><div><h2>Podiums</h2><p class="small">Les trois meilleurs chronos selon la piste et la periode selectionnees.</p></div><a class="mini-button" href="#/historique-records">Historique records</a></div>'+renderFilters(true)+podiumHtml(best)+'</section>' +
    '<section class="card"><div class="panel-title"><h2>Resume par piste</h2></div>'+podiumTrackSummaryHtml(laps)+'</section>' +
    '<section class="card"><h2>Classement</h2>'+recordsTable(best,100)+'</section>';
  bindFilters(podiums,true);
}

function clubRecordBox(title, value, detail, href){
  var tag=href?'a':'div';
  var attr=href?' href="'+href+'"':'';
  return '<'+tag+' class="club-record-box"'+attr+'><span>'+escapeHtml(title)+'</span><strong>'+escapeHtml(value||'-')+'</strong><small>'+escapeHtml(detail||'')+'</small></'+tag+'>';
}
function biggestRider(laps){
  var rows=riderRows(laps);
  return rows[0]||null;
}
function bestProgression(period){
  var laps=periodFilteredLaps(period||'month'), rows=[];
  bestByPilot(laps).forEach(function(current){
    var previous=getAllLaps().filter(function(l){return l._pilot===current._pilot&&l._track===current._track&&lapDateMs(l)!=null&&lapDateMs(l)<lapDateMs(current);}).sort(function(a,b){return a._time-b._time;})[0]||null;
    if(previous&&previous._time>current._time)rows.push({pilot:current._pilot,track:current._track,gain:previous._time-current._time,best:current._time});
  });
  return rows.sort(function(a,b){return b.gain-a.gain;})[0]||null;
}
function seriesTable(rows,limit){
  if(!rows.length)return '<p class="small">Aucune série de '+SERIES_LAP_COUNT+' tours enchaînés pour l’instant.</p>';
  return '<div class="table-wrap"><table><thead><tr><th>#</th><th>Pilote</th><th>Moyenne</th><th>Meilleur</th><th>Session</th></tr></thead><tbody>'+
    rows.slice(0,limit||10).map(function(s,i){
      var fastest=s.laps.reduce(function(a,b){return b._time<a._time?b:a;});
      return '<tr><td>'+(i+1)+'</td>'+
        '<td><a href="#/pilote/'+encodeURIComponent(s.pilot)+'">'+escapeHtml(s.pilot)+'</a></td>'+
        '<td><strong>'+fmtTimeS(s.avg)+'</strong></td>'+
        '<td>'+fmtTimeS(fastest._time)+'</td>'+
        '<td>'+escapeHtml(dateFrFromValue(s.date))+'</td></tr>';
    }).join('')+
  '</tbody></table></div>';
}
function clubProgressHtml(){
  var rows = clubSeasonProgress();
  if(!rows.length) return '';
  var items = rows.slice(0, 5).map(function(r, i){
    var medal = ['🥇','🥈','🥉'][i] || (i + 1);
    return '<a class="record-row" href="#/pilote/' + encodeURIComponent(r.pilot) + '">' +
      '<div class="record-rank">' + medal + '</div>' +
      '<div><div class="record-name">' + escapeHtml(r.pilot) + '</div>' +
        '<div class="record-sub">' + escapeHtml(displayTrack(r.track)) + ' · depuis le ' + escapeHtml(dateFrFromValue(r.firstDay)) + ' · ' + r.days + ' journées</div></div>' +
      '<div class="record-time"><span class="progress-gain">-' + r.gain.toFixed(3) + ' s</span>' +
        '<div class="record-sub">' + fmtTimeS(r.first) + ' → ' + fmtTimeS(r.best) + '</div></div>' +
    '</a>';
  }).join('');
  return '<section class="card"><h2>📈 Plus grosses progressions du club</h2>' +
    '<p class="small">Écart entre le meilleur tour de la première journée de roulage et le meilleur temps atteint depuis. Minimum ' + SEASON_PROGRESS_MIN_DAYS + ' journées pour être classé.</p>' +
    '<div>' + items + '</div></section>';
}

function clubRecordsPage(){
  var all=getAllLaps(), month=periodFilteredLaps('month');
  var series18=bestSeriesByPilot(all.filter(function(l){return l._track==='TT1/8';}));
  var series10=bestSeriesByPilot(all.filter(function(l){return l._track==='TT1/10';}));
  var topSeries18=series18[0]||null, topSeries10=series10[0]||null;
  var best18=bestByPilot(all.filter(function(l){return l._track==='TT1/8';}))[0]||null;
  var best10=bestByPilot(all.filter(function(l){return l._track==='TT1/10';}))[0]||null;
  var month18=bestByPilot(month.filter(function(l){return l._track==='TT1/8';}))[0]||null;
  var month10=bestByPilot(month.filter(function(l){return l._track==='TT1/10';}))[0]||null;
  var rider=biggestRider(month), progress=bestProgression('month');
  app.innerHTML='<section class="card club-record-hero"><div><span class="badge">Tableau officiel</span><h1>Records club MRCP</h1><p class="pilot-sub">Les références du club : records absolus, records du mois et pilotes les plus actifs.</p></div><a class="mini-button" href="#/historique-records">Historique records</a></section>'+
    '<section class="club-record-grid">'+
      clubRecordBox('Record absolu TT1/8',fmtTimeS(best18&&best18._time),best18?best18._pilot+' · '+dateFrFromValue(best18._date):'',best18?'#/pilote/'+encodeURIComponent(best18._pilot):'')+
      clubRecordBox('Record absolu TT1/10',fmtTimeS(best10&&best10._time),best10?best10._pilot+' · '+dateFrFromValue(best10._date):'',best10?'#/pilote/'+encodeURIComponent(best10._pilot):'')+
      clubRecordBox('Record du mois TT1/8',fmtTimeS(month18&&month18._time),month18?month18._pilot+' · '+dateFrFromValue(month18._date):'',month18?'#/pilote/'+encodeURIComponent(month18._pilot):'')+
      clubRecordBox('Record du mois TT1/10',fmtTimeS(month10&&month10._time),month10?month10._pilot+' · '+dateFrFromValue(month10._date):'',month10?'#/pilote/'+encodeURIComponent(month10._pilot):'')+
      clubRecordBox('Gros rouleur du mois',rider?rider.laps+' tours':'-',rider?rider.pilot+' · '+fmtKm(rider.km)+' km':'',rider?'#/pilote/'+encodeURIComponent(rider.pilot):'')+
      clubRecordBox('Progression du mois',progress?'+'+progress.gain.toFixed(3)+' s':'-',progress?progress.pilot+' · '+progress.track+' · '+fmtTimeS(progress.best):'')+
      clubRecordBox('Série '+SERIES_LAP_COUNT+' tours TT1/8',fmtTimeS(topSeries18&&topSeries18.avg),topSeries18?topSeries18.pilot+' · '+dateFrFromValue(topSeries18.date):'',topSeries18?'#/pilote/'+encodeURIComponent(topSeries18.pilot):'')+
      clubRecordBox('Série '+SERIES_LAP_COUNT+' tours TT1/10',fmtTimeS(topSeries10&&topSeries10.avg),topSeries10?topSeries10.pilot+' · '+dateFrFromValue(topSeries10.date):'',topSeries10?'#/pilote/'+encodeURIComponent(topSeries10.pilot):'')+
    '</section>'+
    '<section class="report-columns"><div class="card"><h2>Top TT1/8</h2>'+recordsTable(bestByPilot(all.filter(function(l){return l._track==='TT1/8';})),5)+'</div><div class="card"><h2>Top TT1/10</h2>'+recordsTable(bestByPilot(all.filter(function(l){return l._track==='TT1/10';})),5)+'</div></section>'+
    '<section class="card"><h2>🔥 Meilleures séries de '+SERIES_LAP_COUNT+' tours</h2>'+
      '<p class="small">Moyenne sur '+SERIES_LAP_COUNT+' tours qui s’enchaînent, sans relance. Le meilleur tour récompense un tour isolé : la série montre le rythme réellement tenu.</p>'+
      '<div class="report-columns"><div><h3>TT1/8</h3>'+seriesTable(series18,5)+'</div><div><h3>TT1/10</h3>'+seriesTable(series10,5)+'</div></div>'+
    '</section>'+
    clubProgressHtml();
}

function riderRows(laps){
  var map={};
  laps.forEach(function(l){
    var key=l._pilot;
    if(!map[key])map[key]={pilot:key,laps:0,km:0,best:null,tracks:{}};
    map[key].laps++;
    map[key].km+=lapDistanceMeters(l._track)/1000;
    map[key].tracks[l._track]=true;
    if(!map[key].best||l._time<map[key].best._time)map[key].best=l;
  });
  return Object.values(map).sort(function(a,b){return b.laps-a.laps||b.km-a.km||a.pilot.localeCompare(b.pilot);});
}
function ridersPage(){
  var period=hashParam('period','month');
  var laps=periodFilteredLaps(period);
  var rows=riderRows(laps);
  var options=[['day','Jour'],['week','Semaine'],['month','Mois'],['year','Année'],['total','Total']].map(function(o){return '<option value="'+o[0]+'" '+(period===o[0]?'selected':'')+'>'+o[1]+'</option>';}).join('');
  app.innerHTML='<section class="card"><div class="panel-title"><div><h2>Qui roule le plus ?</h2><p class="small">Classement par nombre de tours, avec distance estimee selon les longueurs TT1/8 et TT1/10.</p></div><select id="riderPeriod">'+options+'</select></div></section>'+
    '<section class="card"><div class="table-wrap"><table><thead><tr><th>#</th><th>Pilote</th><th>Tours</th><th>Km</th><th>Meilleur tour</th><th>Pistes</th></tr></thead><tbody>'+
    rows.slice(0,80).map(function(r,i){return '<tr><td>'+(i+1)+'</td><td><a href="#/pilote/'+encodeURIComponent(r.pilot)+'"><strong>'+escapeHtml(r.pilot)+'</strong></a></td><td>'+r.laps.toLocaleString('fr-FR')+'</td><td>'+fmtKm(r.km)+'</td><td>'+fmtTimeS(r.best&&r.best._time)+'</td><td><span class="badge">'+escapeHtml(Object.keys(r.tracks).join(' / ')||'-')+'</span></td></tr>';}).join('')+
    '</tbody></table></div></section>';
  var select=document.getElementById('riderPeriod');
  if(select)select.onchange=function(){location.hash='#/rouleurs?period='+select.value;};
}

function clubTodayPage(){
  if(liveTimer) clearTimeout(liveTimer);
  var date=hashParam('date',todayKey());
  var dayLaps=liveDaySourceLaps(date);
  var rows=liveDayRows(dayLaps);
  var sessions=latestActivities(300).filter(function(s){return dateInputValue(s.date)===date;});
  var counts=liveTrackCounts(dayLaps);
  var pilots=rows.map(function(r){return r.pilot;});
  var progress=rows.map(function(r){
    var previous=getAllLaps().filter(function(l){return l._pilot===r.pilot&&dateInputValue(l._date)!==date&&l._track===r.track;}).sort(function(a,b){return a._time-b._time;})[0]||null;
    return {pilot:r.pilot,track:r.track,best:r.best,previous:previous&&previous._time,gain:previous?previous._time-r.best:null};
  }).filter(function(r){return r.gain!=null&&r.gain>0;}).sort(function(a,b){return b.gain-a.gain;}).slice(0,5);
  var sessionHtml=sessions.slice(0,12).map(function(s){
    var pilot=s.bestPilot||('Inconnu #'+(s.bestTransponder||''));
    return '<a class="activity-row session-home-row session-home-link" href="#/pilote-session/'+encodeURIComponent(pilot)+'/'+encodeURIComponent(s.key)+'"><div class="activity-date">'+escapeHtml(s.date||s.name)+'</div><div><div class="activity-track">'+escapeHtml(s.bestPilot||s.bestTransponder||'-')+'</div><div class="activity-sub">'+s.laps+' tours · '+Object.keys(s.pilots).length+' pilotes · '+escapeHtml(Object.keys(s.tracks).join(' / ')||'-')+'</div></div><div><strong>'+fmtTimeS(s.best)+'</strong><div class="activity-sub">best</div></div></a>';
  }).join('');
  app.innerHTML=
    '<section class="club-today-hero card"><div><span class="badge">MRCP aujourd hui</span><h1>Aujourd hui au club</h1><p class="pilot-sub">Vue rapide de la journee : pilotes actifs, tours, records et progressions.</p></div><input id="clubTodayDate" type="date" value="'+escapeHtml(date)+'"></section>' +
    '<section class="grid today-kpis"><div class="card"><h3>Tours</h3><div class="big">'+dayLaps.length+'</div></div><div class="card"><h3>Pilotes</h3><div class="big">'+rows.length+'</div><p class="small">'+escapeHtml(pilots.slice(0,4).join(', ')||'-')+'</p></div><div class="card"><h3>TT1/8</h3><div class="big">'+(counts['TT1/8']||0)+'</div></div><div class="card"><h3>TT1/10</h3><div class="big">'+(counts['TT1/10']||0)+'</div></div></section>' +
    '<section class="report-columns"><div class="card"><div class="panel-title"><h2>Classement du jour</h2><a class="mini-button" href="#/journee?date='+escapeHtml(date)+'">Vue detaillee</a></div>'+liveDayTable(rows)+'</div><div class="card"><h2>Progressions du jour</h2>'+(progress.length?progress.map(function(r){return '<div class="record-row"><div class="record-rank">+'+r.gain.toFixed(1)+'</div><div><div class="record-name">'+escapeHtml(r.pilot)+'</div><div class="record-sub">'+escapeHtml(r.track)+' ancien '+fmtTimeS(r.previous)+'</div></div><div class="record-time">'+fmtTimeS(r.best)+'</div></div>';}).join(''):'<p class="small">Pas encore de progression detectee pour cette date.</p>')+'</div></section>' +
    '<section class="card"><div class="panel-title"><h2>Sessions de la journee</h2><a class="mini-button" href="#/journee?date='+escapeHtml(date)+'">Vue detaillee</a></div>'+(sessionHtml||'<p class="small">Aucune session pour cette date.</p>')+'</section>';
  var input=document.getElementById('clubTodayDate');
  if(input)input.onchange=function(){location.hash='#/club-today?date='+input.value;};
}

function comparePilotRow(name){
  var s=pilotStats(name), b18=pilotBestByTrack(s,'TT1/8'), b10=pilotBestByTrack(s,'TT1/10'), cons=pilotConsistency(s);
  return '<tr><td><a href="#/pilote/'+encodeURIComponent(name)+'"><strong>'+escapeHtml(name)+'</strong></a></td><td>'+s.laps.length+'</td><td>'+s.sessions+'</td><td><strong>'+fmtTimeS(b18&&b18._time)+'</strong></td><td><strong>'+fmtTimeS(b10&&b10._time)+'</strong></td><td>'+fmtTimeS(s.avg)+'</td><td>'+fmtTimeS(cons)+'</td></tr>';
}
function comparePilotData(name){
  var s=pilotStats(name), b18=pilotBestByTrack(s,'TT1/8'), b10=pilotBestByTrack(s,'TT1/10'), cons=pilotConsistency(s);
  return {name:name,stats:s,b18:b18,b10:b10,consistency:cons,km:totalDistanceKm(s.laps)};
}
function compareSummaryCards(items){
  return '<section class="compare-summary-grid">'+items.map(function(x){
    var fav=x.b18?'TT1/8':(x.b10?'TT1/10':'-');
    var best=x.b18&&x.b10?(x.b18._time<x.b10._time?x.b18:x.b10):(x.b18||x.b10);
    return '<a class="compare-driver-card" href="#/pilote/'+encodeURIComponent(x.name)+'"><span>Pilote</span><strong>'+escapeHtml(x.name)+'</strong><div class="compare-card-stats"><div><small>Best</small><b>'+fmtTimeS(best&&best._time)+'</b></div><div><small>Tours</small><b>'+x.stats.laps.length.toLocaleString('fr-FR')+'</b></div><div><small>Km</small><b>'+fmtKm(x.km)+'</b></div><div><small>Piste</small><b>'+escapeHtml(fav)+'</b></div></div></a>';
  }).join('')+'</section>';
}
function compareBarChart(title, items, valueFn, labelFn, lowerBetter){
  var ranked=items.slice().sort(function(a,b){
    var av=Number(valueFn(a)), bv=Number(valueFn(b));
    var aok=Number.isFinite(av)&&av>0, bok=Number.isFinite(bv)&&bv>0;
    if(aok&&!bok)return -1;
    if(!aok&&bok)return 1;
    if(!aok&&!bok)return a.name.localeCompare(b.name);
    return lowerBetter?av-bv:bv-av;
  });
  var values=ranked.map(function(x){return Number(valueFn(x));}).filter(function(v){return Number.isFinite(v)&&v>0;});
  if(!values.length)return '<section class="card compare-chart-card"><h3>'+escapeHtml(title)+'</h3><p class="small">Pas assez de donnees pour ce graphique.</p></section>';
  var max=Math.max.apply(null,values), min=Math.min.apply(null,values);
  return '<section class="card compare-chart-card"><h3>'+escapeHtml(title)+'</h3><div class="compare-bars">'+ranked.map(function(x,i){
    var v=Number(valueFn(x));
    var ok=Number.isFinite(v)&&v>0;
    var pct=ok?(lowerBetter?(min/v)*100:(v/max)*100):0;
    pct=Math.max(4,Math.min(100,pct));
    return '<div class="compare-bar-row"><div class="compare-bar-label"><span class="compare-rank">'+(i+1)+'</span>'+escapeHtml(x.name)+'</div><div class="compare-bar-track"><div class="compare-bar-fill" style="width:'+pct.toFixed(1)+'%"></div></div><div class="compare-bar-value">'+escapeHtml(ok?labelFn(v,x):'-')+'</div></div>';
  }).join('')+'</div></section>';
}
function comparePieChart(title, items, valueFn, labelFn){
  var colors=['#3ee66f','#12a4ff','#ffd23f','#ff9f31'];
  var ranked=items.map(function(x){return {item:x,value:Number(valueFn(x))};}).filter(function(x){return Number.isFinite(x.value)&&x.value>0;}).sort(function(a,b){return b.value-a.value;});
  var total=ranked.reduce(function(sum,x){return sum+x.value;},0);
  if(!total)return '<section class="card compare-chart-card"><h3>'+escapeHtml(title)+'</h3><p class="small">Pas assez de donnees pour ce graphique.</p></section>';
  var cursor=0;
  var gradient=ranked.map(function(x,i){
    var start=cursor;
    cursor+=x.value/total*100;
    return colors[i%colors.length]+' '+start.toFixed(2)+'% '+cursor.toFixed(2)+'%';
  }).join(',');
  return '<section class="card compare-chart-card compare-pie-card"><h3>'+escapeHtml(title)+'</h3><div class="compare-pie-layout"><div class="compare-pie" style="background:conic-gradient('+gradient+')"></div><div class="compare-pie-legend">'+ranked.map(function(x,i){
    var pct=x.value/total*100;
    return '<div class="compare-pie-row"><span style="background:'+colors[i%colors.length]+'"></span><strong>#'+(i+1)+' '+escapeHtml(x.item.name)+'</strong><em>'+escapeHtml(labelFn(x.value,x.item))+' · '+pct.toFixed(1).replace('.',',')+'%</em></div>';
  }).join('')+'</div></div></section>';
}
function comparePage(){
  var pilots=allPilots();
  var selected=(hashParam('pilots','')||'').split('|').filter(Boolean).slice(0,4);
  if(!selected.length)selected=pilots.slice(0,3);
  var selects=[0,1,2,3].map(function(i){
    return '<select class="compare-select" data-index="'+i+'"><option value="">Pilote '+(i+1)+'</option>'+pilots.map(function(p){return '<option value="'+escapeHtml(p)+'" '+(selected[i]===p?'selected':'')+'>'+escapeHtml(p)+'</option>';}).join('')+'</select>';
  }).join('');
  var names=selected.filter(Boolean);
  var items=names.map(comparePilotData);
  var rows=names.map(comparePilotRow).join('');
  app.innerHTML='<section class="card compare-hero"><div class="panel-title"><div><h2>Comparatif pilotes</h2><p class="small">Compare jusqu a 4 pilotes sur leurs meilleurs tours, volume, distance et regularite.</p></div></div><div class="compare-controls">'+selects+'</div></section>'+
    compareSummaryCards(items)+
    '<section class="compare-chart-grid">'+
      compareBarChart('Best TT1/8',items,function(x){return x.b18&&x.b18._time;},function(v){return fmtTimeS(v);},true)+
      compareBarChart('Best TT1/10',items,function(x){return x.b10&&x.b10._time;},function(v){return fmtTimeS(v);},true)+
      comparePieChart('Tours enregistres',items,function(x){return x.stats.laps.length;},function(v){return Math.round(v).toLocaleString('fr-FR')+' tours';})+
      comparePieChart('Kilometres estimes',items,function(x){return x.km;},function(v){return fmtKm(v)+' km';})+
      compareBarChart('Regularite',items,function(x){return x.consistency;},function(v){return fmtTimeS(v);},true)+
      comparePieChart('Nombre de sessions',items,function(x){return x.stats.sessions;},function(v){return Math.round(v).toLocaleString('fr-FR')+' sessions';})+
    '</section>'+
    '<section class="card"><div class="panel-title"><h2>Tableau detaille</h2></div><div class="table-wrap"><table><thead><tr><th>Pilote</th><th>Tours</th><th>Sessions</th><th>Best TT1/8</th><th>Best TT1/10</th><th>Moyenne</th><th>Regularite</th></tr></thead><tbody>'+rows+'</tbody></table></div></section>';
  document.querySelectorAll('.compare-select').forEach(function(el){
    el.onchange=function(){
      var values=Array.from(document.querySelectorAll('.compare-select')).map(function(s){return s.value;}).filter(Boolean);
      location.hash='#/comparatif?pilots='+encodeURIComponent(values.join('|'));
    };
  });
}

function qrProfilePage(){
  app.innerHTML='<section class="pilot-hero"><div class="card pilot-main-card"><h2>QR code choisir mon profil</h2><p class="pilot-sub">A afficher au club : chaque pilote scanne, choisit son nom, puis retrouve automatiquement ses chronos sur son telephone.</p><div class="share-row"><a class="btn-primary" href="#/mes-chronos">Tester le choix profil</a></div></div><div class="card qr-card"><img class="qr-img qr-img-large" src="'+qrUrlForProfileChoice()+'" alt="QR code choisir mon profil"><p class="small">'+escapeHtml(location.origin+location.pathname+'#/mes-chronos')+'</p></div></section>';
}

function recordHistoryRows(track){
  var best=Infinity, rows=[];
  getAllLaps().filter(function(l){return l._track===track;}).sort(function(a,b){return parseDateValue(a._date)-parseDateValue(b._date)||a._time-b._time;}).forEach(function(l){
    if(l._time<best){best=l._time;rows.push(l);}
  });
  return rows.reverse();
}
function recordHistoryPage(){
  var tracks=['TT1/8','TT1/10'];
  app.innerHTML='<section class="card"><div class="panel-title"><div><h2>Historique des records</h2><p class="small">Les records successifs du club, du plus recent au plus ancien.</p></div><a class="mini-button" href="#/records-club">Retour records club</a></div></section>'+
    tracks.map(function(track){
      var rows=recordHistoryRows(track);
      return '<section class="card"><h2>'+escapeHtml(track)+'</h2><div class="table-wrap"><table><thead><tr><th>Date</th><th>Pilote</th><th>Temps</th><th>Session</th></tr></thead><tbody>'+rows.map(function(l){return '<tr><td>'+escapeHtml(l._date||'-')+'</td><td><a href="#/pilote/'+encodeURIComponent(l._pilot)+'">'+escapeHtml(l._pilot)+'</a></td><td><strong>'+fmtTimeS(l._time)+'</strong></td><td>'+escapeHtml(l.session_name||'-')+'</td></tr>';}).join('')+'</tbody></table></div></section>';
    }).join('');
}

function downloadPilotShareImage(name){
  var s=pilotStats(name), b18=pilotBestByTrack(s,'TT1/8'), b10=pilotBestByTrack(s,'TT1/10');
  var canvas=document.createElement('canvas'), w=1200, h=630, ctx=canvas.getContext('2d');
  canvas.width=w;canvas.height=h;
  var grad=ctx.createLinearGradient(0,0,w,h);grad.addColorStop(0,'#052d34');grad.addColorStop(1,'#07142a');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
  ctx.fillStyle='rgba(62,230,111,.18)';ctx.beginPath();ctx.arc(980,80,260,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#f7fbff';ctx.font='900 58px Segoe UI, Arial';ctx.fillText('MRCP Dashboard',70,95);
  ctx.font='900 70px Segoe UI, Arial';ctx.fillText(name.slice(0,28),70,205);
  ctx.fillStyle='#b9c9d3';ctx.font='28px Segoe UI, Arial';ctx.fillText('Resume pilote partageable',70,255);
  [['Best TT1/8',fmtTimeS(b18&&b18._time)],['Best TT1/10',fmtTimeS(b10&&b10._time)],['Tours',String(s.laps.length)],['Sessions',String(s.sessions)]].forEach(function(item,i){
    var x=70+(i%2)*520,y=340+Math.floor(i/2)*125;
    ctx.fillStyle='rgba(255,255,255,.08)';ctx.fillRect(x,y,440,88);
    ctx.fillStyle='#9fd0ff';ctx.font='24px Segoe UI, Arial';ctx.fillText(item[0],x+24,y+32);
    ctx.fillStyle='#ffffff';ctx.font='900 38px Segoe UI, Arial';ctx.fillText(item[1],x+24,y+72);
  });
  ctx.fillStyle='#ffd23f';ctx.font='26px Segoe UI, Arial';ctx.fillText(location.origin+location.pathname+'#/pilote/'+encodeURIComponent(name),70,590);
  var filename='mrcp-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.png';
  canvas.toBlob(function(blob){
    var file=blob&&window.File?new File([blob],filename,{type:'image/png'}):null;
    if(file&&navigator.canShare&&navigator.canShare({files:[file]})&&navigator.share){
      navigator.share({title:'MRCP Dashboard - '+name,text:'Resume pilote MRCP',files:[file]}).catch(function(){});
      return;
    }
    var a=document.createElement('a');a.download=filename;a.href=canvas.toDataURL('image/png');a.click();
  },'image/png');
}

