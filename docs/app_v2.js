(function(){
'use strict';

var DATA = null;
var app = document.getElementById('app');
var deferredPrompt = null;
var state = { track:'all', isAdmin: localStorage.getItem('mrcp_admin') === '1' };

function escapeHtml(value){return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function fmtTime(v){var n=Number(v);return Number.isFinite(n)?n.toFixed(3):'-';}
function fmtTimeS(v){return fmtTime(v)+' s';}
function lapSeconds(l){return Number(l.lap_time ?? l.time ?? l.seconds ?? l.best_lap ?? l.duration);}
function normalizeTrack(l){if(l.track)return l.track;var t=lapSeconds(l);if(!Number.isFinite(t))return'unknown';return t<30?'TT1/10':'TT1/8';}
function normalizeTransponder(v){return String(v||'').replace('/0','').trim();}
function lapPilot(l){return l.pilot_name||l.pilot||l.driver||l.name||l.participant_name||l.transponder||'Pilote inconnu';}
function lapKey(activityId, transponder, lapNo, startTime, lapTime){var n=Number(lapTime);return [activityId||'',normalizeTransponder(transponder),lapNo||'',startTime||'',Number.isFinite(n)?n.toFixed(3):''].join('|');}
function getOverrides(){try{var raw=JSON.parse(localStorage.getItem('mrcp_lap_overrides')||'{}');return{excluded:raw.excluded&&typeof raw.excluded==='object'?raw.excluded:{},forced_track:raw.forced_track&&typeof raw.forced_track==='object'?raw.forced_track:{}};}catch(e){return{excluded:{},forced_track:{}};}}
function setOverrides(o){localStorage.setItem('mrcp_lap_overrides',JSON.stringify({excluded:o.excluded||{},forced_track:o.forced_track||{}},null,2));}
function forcedTrack(lapId){return getOverrides().forced_track[lapId]||null;}

function getAllLapsRaw(includeExcluded){
  var rows=[], o=getOverrides();
  function addLap(l,ctx){
    var t=lapSeconds(l); if(!Number.isFinite(t)||t<=0)return;
    var lapNo=l.lap_no||l.lap||l.number||'', startTime=l.start_time||l.started_at||'', tp=ctx.transponder||l.transponder||'';
    var lapId=l.lap_id||l.id||lapKey(ctx.activity_id,tp,lapNo,startTime,t);
    var excluded=!!o.excluded[lapId]||!!l.exclude_from_records||!!l.excluded;
    if(excluded&&!includeExcluded)return;
    var pilot=ctx.pilot_name||lapPilot(l);
    rows.push(Object.assign({},l,{lap_id:lapId,activity_id:ctx.activity_id||'',session_id:ctx.session_id||ctx.activity_id||'',session_name:ctx.session_name||'',session_date:ctx.session_date||'',transponder:tp,pilot_name:pilot,_time:t,_track:forcedTrack(lapId)||l.track||ctx.track||normalizeTrack(l),_pilot:pilot,_date:ctx.session_date||l.date||l.session_date||'',_excluded:excluded}));
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
  var seen={}; return rows.filter(function(r){if(seen[r.lap_id])return false;seen[r.lap_id]=true;return true;});
}
function getAllLaps(){return getAllLapsRaw(false);}
function applyFilters(laps){return state.track==='all'?laps:laps.filter(function(l){return l._track===state.track;});}
function bestByPilot(laps){var m=new Map();laps.forEach(function(l){if(!m.has(l._pilot)||l._time<m.get(l._pilot)._time)m.set(l._pilot,l);});return Array.from(m.values()).sort(function(a,b){return a._time-b._time;});}
function allPilots(){return bestByPilot(getAllLaps()).map(function(l){return l._pilot;}).sort(function(a,b){return a.localeCompare(b);});}
function latestActivities(){var map={};getAllLaps().forEach(function(l){var key=l.session_id||l.session_name||l._date||'session';if(!map[key])map[key]={name:l.session_name||l._date||key,date:l._date||'',pilots:{},tracks:{},laps:0};map[key].pilots[l._pilot]=true;map[key].tracks[l._track]=true;map[key].laps++;});return Object.values(map).sort(function(a,b){return String(b.date).localeCompare(String(a.date));}).slice(0,5);}

function pilotStats(name){
  var laps=getAllLaps().filter(function(l){return l._pilot===name;});
  var sorted=laps.slice().sort(function(a,b){return a._time-b._time;});
  var avg=laps.length?laps.reduce(function(s,l){return s+l._time;},0)/laps.length:null;
  var sessions={};laps.forEach(function(l){sessions[l.session_name||l._date||'session']=true;});
  return {name:name,laps:laps,best:sorted[0],avg:avg,sessions:Object.keys(sessions).length};
}
function clubBest(track){var rows=bestByPilot(getAllLaps().filter(function(l){return track==='all'||l._track===track;}));return rows[0]||null;}
function pilotBestByTrack(stats,track){return bestByPilot(stats.laps.filter(function(l){return l._track===track;}))[0]||null;}
function pilotProgressData(stats,track){
  var groups={};
  stats.laps.filter(function(l){return track==='all'||l._track===track;}).forEach(function(l){
    var key=l.session_name||l._date||l.session_id||'session';
    if(!groups[key]||l._time<groups[key].time)groups[key]={label:key,time:l._time,date:l._date};
  });
  return Object.values(groups).sort(function(a,b){return String(a.date||a.label).localeCompare(String(b.date||b.label));}).slice(-18);
}
function renderProgressSvg(points){
  if(points.length<2)return '<p class="small">Pas encore assez de sessions pour afficher une progression.</p>';
  var w=720,h=220,pad=28;
  var times=points.map(function(p){return p.time;});
  var min=Math.min.apply(null,times),max=Math.max.apply(null,times);
  if(max===min)max=min+1;
  function x(i){return pad+(i/(points.length-1))*(w-pad*2);}
  function y(v){return pad+((v-min)/(max-min))*(h-pad*2);}
  // Chrono plus bas = mieux, donc meilleur en haut
  function yy(v){return h-y(v)+pad;}
  var d=points.map(function(p,i){return (i?'L':'M')+x(i).toFixed(1)+' '+yy(p.time).toFixed(1);}).join(' ');
  var dots=points.map(function(p,i){return '<circle class="progress-dot" cx="'+x(i).toFixed(1)+'" cy="'+yy(p.time).toFixed(1)+'" r="5"><title>'+escapeHtml(p.label)+' — '+fmtTimeS(p.time)+'</title></circle>';}).join('');
  return '<div class="progress-wrap"><svg class="progress-svg" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none"><line class="progress-axis" x1="'+pad+'" y1="'+(h-pad)+'" x2="'+(w-pad)+'" y2="'+(h-pad)+'"></line><line class="progress-axis" x1="'+pad+'" y1="'+pad+'" x2="'+pad+'" y2="'+(h-pad)+'"></line><path class="progress-line" d="'+d+'"></path>'+dots+'<text class="progress-label" x="'+pad+'" y="16">Meilleur</text><text class="progress-label" x="'+(w-95)+'" y="'+(h-8)+'">Dernières sessions</text></svg></div>';
}

function updateAdminNav(){var nav=document.getElementById('adminNav');if(nav)nav.classList.toggle('hidden',!state.isAdmin);}
function setActiveNav(){var hash=location.hash||'#/';document.querySelectorAll('.nav-link').forEach(function(el){el.classList.remove('active');});document.querySelectorAll('.nav-link[href]').forEach(function(el){var href=el.getAttribute('href');if(href===hash||(hash.startsWith(href)&&href!=='#/'))el.classList.add('active');});if(hash==='#/'){var home=document.querySelector('.nav-link[href="#/"]');if(home)home.classList.add('active');}}
function renderFilters(){return '<div class="filters"><select id="trackFilter"><option value="all">Toutes pistes</option><option value="TT1/8">TT1/8</option><option value="TT1/10">TT1/10</option></select></div>';}
function bindFilters(cb){var t=document.getElementById('trackFilter');if(t){t.value=state.track;t.onchange=function(e){state.track=e.target.value;cb();};}}
function podiumHtml(rows){var top=rows.slice(0,3);if(!top.length)return'<p class="small">Aucun chrono trouvé.</p>';var order=[1,0,2];return'<div class="podium">'+order.map(function(i){var r=top[i];if(!r)return'<div></div>';var cls=i===0?'first':i===1?'second':'third';var med=i===0?'🥇':i===1?'🥈':'🥉';return'<div class="step '+cls+'"><span class="medal">'+med+'</span><strong>'+escapeHtml(r._pilot)+'</strong><div class="time">'+fmtTime(r._time)+'</div><div class="small">'+escapeHtml(r._track)+'</div></div>';}).join('')+'</div>';}
function recordsTable(rows,limit){limit=limit||20;return'<div class="table-wrap"><table><thead><tr><th>#</th><th>Pilote</th><th>Temps</th><th>Piste</th><th>Session</th></tr></thead><tbody>'+rows.slice(0,limit).map(function(r,i){return'<tr><td>'+(i+1)+'</td><td><a href="#/pilote/'+encodeURIComponent(r._pilot)+'">'+escapeHtml(r._pilot)+'</a></td><td><strong>'+fmtTimeS(r._time)+'</strong></td><td><span class="badge">'+escapeHtml(r._track)+'</span></td><td>'+escapeHtml(r.session_name||r._date||'-')+'</td></tr>';}).join('')+'</tbody></table></div>';}

function home(){
  var laps=getAllLaps(), filtered=applyFilters(laps), best=bestByPilot(filtered), activities=latestActivities(), pilotsCount=bestByPilot(laps).length;
  app.innerHTML='<section class="hero-dashboard"><div class="hero-card"><h1>Bienvenue sur le<br>dashboard du MRCP</h1><p>Consulte tes chronos, ta progression personnelle, les records du club et les podiums.</p><div class="hero-actions"><a href="#/mes-chronos" class="btn-primary">Voir mes chronos ›</a><a href="#/podiums" class="btn-secondary">Voir les podiums ›</a></div></div><div class="card kpi-card"><h2>〽️ Chiffres clés</h2><div class="kpi-grid"><div class="kpi"><div class="kpi-icon">🏁</div><div><div class="kpi-label">Activités</div><div class="kpi-value">'+activities.length+'</div><div class="kpi-label">sessions</div></div></div><div class="kpi"><div class="kpi-icon">👥</div><div><div class="kpi-label">Pilotes</div><div class="kpi-value">'+pilotsCount+'</div><div class="kpi-label">inscrits</div></div></div><div class="kpi"><div class="kpi-icon">⏱️</div><div><div class="kpi-label">Tours</div><div class="kpi-value">'+laps.length.toLocaleString('fr-FR')+'</div><div class="kpi-label">enregistrés</div></div></div><div class="kpi"><div class="kpi-icon">🏆</div><div><div class="kpi-label">Records</div><div class="kpi-value">'+best.length+'</div><div class="kpi-label">meilleurs tours</div></div></div></div></div></section><section class="dashboard-grid"><div class="card"><div class="panel-title"><h2>📅 Dernières activités</h2></div><div>'+activities.map(function(a){var tracks=Object.keys(a.tracks).join(' / ')||'-';return'<div class="activity-row"><div class="activity-date">'+escapeHtml(a.date||a.name)+'</div><div><div class="activity-track">☀️ '+escapeHtml(tracks)+'</div><div class="activity-sub">'+a.laps+' tours</div></div><div><strong>'+Object.keys(a.pilots).length+'</strong><div class="activity-sub">pilotes</div></div></div>';}).join('')+'</div></div><div class="card"><div class="panel-title"><h2>⭐ Meilleurs tours</h2><a class="mini-button" href="#/podiums">Voir tous</a></div>'+best.slice(0,5).map(function(r,i){return'<div class="record-row"><div class="record-rank">'+(i+1)+'</div><div><div class="record-name">'+escapeHtml(r._pilot)+'</div><div class="record-sub"><span class="badge">'+escapeHtml(r._track)+'</span></div></div><div class="record-time">'+fmtTime(r._time)+'<div class="record-sub">'+escapeHtml(r._date||'')+'</div></div></div>';}).join('')+'</div><div class="card"><div class="panel-title"><h2>🏆 Podiums du moment</h2></div>'+renderFilters()+podiumHtml(best)+'</div></section>';
  bindFilters(home);
}

function myChronos(){
  var saved=localStorage.getItem('mrcp_my_pilot'), pilots=allPilots();
  if(!saved){
    app.innerHTML='<section class="card pilot-main-card"><h2>Mes chronos</h2><p>Choisis ton profil une fois. Il sera mémorisé sur ce téléphone.</p><select id="pilotSelect"><option value="">Choisir un pilote</option>'+pilots.map(function(p){return'<option value="'+escapeHtml(p)+'">'+escapeHtml(p)+'</option>';}).join('')+'</select><div class="share-row"><button id="savePilot" class="btn-primary">C’est mon profil</button></div></section><section class="card"><h3>Pourquoi choisir mon profil ?</h3><p>Ensuite, tu retrouves directement tes meilleurs temps, ta moyenne, ta progression et ton objectif à battre.</p></section>';
    document.getElementById('savePilot').onclick=function(){var v=document.getElementById('pilotSelect').value;if(v){localStorage.setItem('mrcp_my_pilot',v);myChronos();}};
    return;
  }
  var s=pilotStats(saved), best18=pilotBestByTrack(s,'TT1/8'), best10=pilotBestByTrack(s,'TT1/10'), club18=clubBest('TT1/8'), club10=clubBest('TT1/10');
  var trackForChart=best18?'TT1/8':(best10?'TT1/10':'all');
  var progress=pilotProgressData(s,trackForChart);
  var gap18=(best18&&club18)?best18._time-club18._time:null, gap10=(best10&&club10)?best10._time-club10._time:null;
  var recent=s.laps.slice(-30).reverse();
  app.innerHTML='<section class="pilot-hero"><div class="card pilot-main-card"><div class="pilot-name">👋 '+escapeHtml(saved)+'</div><p class="pilot-sub">Ton espace pilote personnel sur ce téléphone.</p><div class="goal-box"><div class="goal-pill"><span class="small">Best TT1/8</span><strong>'+fmtTimeS(best18&&best18._time)+'</strong></div><div class="goal-pill"><span class="small">Best TT1/10</span><strong>'+fmtTimeS(best10&&best10._time)+'</strong></div><div class="goal-pill"><span class="small">Moyenne</span><strong>'+fmtTimeS(s.avg)+'</strong></div></div><div class="share-row"><button id="changePilot">Changer de pilote</button><button id="copyMyLink">Copier ma fiche</button></div></div><div class="card"><h3>🎯 Objectifs club</h3><p class="small">Écart avec le record club.</p><div class="goal-box"><div class="goal-pill"><span class="small">TT1/8</span><strong>'+(gap18!=null?fmtTimeS(gap18):'-')+'</strong></div><div class="goal-pill"><span class="small">TT1/10</span><strong>'+(gap10!=null?fmtTimeS(gap10):'-')+'</strong></div></div><p class="small">Plus l’écart est proche de 0, plus tu es proche du record.</p></div></section><section class="grid"><div class="card"><h3>Tours</h3><div class="big">'+s.laps.length+'</div></div><div class="card"><h3>Sessions</h3><div class="big">'+s.sessions+'</div></div><div class="card"><h3>Meilleur absolu</h3><div class="big">'+fmtTimeS(s.best&&s.best._time)+'</div></div><div class="card"><h3>Piste graphique</h3><div class="big">'+escapeHtml(trackForChart)+'</div></div></section><section class="card"><h3>📈 Progression récente</h3>'+renderProgressSvg(progress)+'</section><section class="card"><h3>Derniers tours</h3>'+recordsTable(recent,30)+'</section><div class="mobile-sticky-action"><a href="#/podiums" class="btn-primary">Voir podiums du club</a></div>';
  document.getElementById('changePilot').onclick=function(){localStorage.removeItem('mrcp_my_pilot');myChronos();};
  document.getElementById('copyMyLink').onclick=function(){navigator.clipboard.writeText(location.origin+location.pathname+'#/pilote/'+encodeURIComponent(saved));alert('Lien copié');};
}

function pilots(){var best=bestByPilot(getAllLaps());app.innerHTML='<section class="card"><h2>Pilotes</h2><input class="searchBox" id="pilotSearch" placeholder="Rechercher un pilote..."><div id="pilotList">'+recordsTable(best,100)+'</div></section>';document.getElementById('pilotSearch').oninput=function(e){var q=e.target.value.toLowerCase();document.getElementById('pilotList').innerHTML=recordsTable(best.filter(function(r){return r._pilot.toLowerCase().indexOf(q)!==-1;}),100);};}
function pilotPage(encoded){var name=decodeURIComponent(encoded),s=pilotStats(name),best18=pilotBestByTrack(s,'TT1/8'),best10=pilotBestByTrack(s,'TT1/10');app.innerHTML='<section class="card pilot-main-card"><h2>'+escapeHtml(name)+'</h2><button id="setMyProfile">C’est mon profil</button></section><section class="grid"><div class="card"><h3>Meilleur TT1/8</h3><div class="big">'+fmtTimeS(best18&&best18._time)+'</div></div><div class="card"><h3>Meilleur TT1/10</h3><div class="big">'+fmtTimeS(best10&&best10._time)+'</div></div><div class="card"><h3>Moyenne</h3><div class="big">'+fmtTimeS(s.avg)+'</div></div><div class="card"><h3>Tours</h3><div class="big">'+s.laps.length+'</div></div></section><section class="card"><h3>Progression</h3>'+renderProgressSvg(pilotProgressData(s,best18?'TT1/8':'all'))+'</section><section class="card"><h3>Tours récents</h3>'+recordsTable(s.laps.slice(-50).reverse(),50)+'</section>';document.getElementById('setMyProfile').onclick=function(){localStorage.setItem('mrcp_my_pilot',name);location.hash='#/mes-chronos';};}
function podiums(){var best=bestByPilot(applyFilters(getAllLaps()));app.innerHTML='<section class="card"><h2>Podiums</h2>'+renderFilters()+podiumHtml(best)+'</section><section class="card"><h2>Classement</h2>'+recordsTable(best,100)+'</section>';bindFilters(podiums);}


var liveTimer = null;

function latestSessionLaps(){
  var laps = getAllLaps();
  if(!laps.length) return {sessionName:'Aucune activité', date:'', laps:[]};

  var groups = {};
  laps.forEach(function(l){
    var key = l.session_id || l.session_name || l._date || 'session';
    if(!groups[key]){
      groups[key] = {
        key:key,
        sessionName:l.session_name || l._date || key,
        date:l._date || '',
        laps:[]
      };
    }
    groups[key].laps.push(l);
  });

  var sessions = Object.values(groups).sort(function(a,b){
    return String(b.date || b.sessionName).localeCompare(String(a.date || a.sessionName));
  });

  return sessions[0] || {sessionName:'Aucune activité', date:'', laps:[]};
}

function liveRanking(sessionLaps){
  var map = new Map();

  sessionLaps.forEach(function(l){
    var item = map.get(l._pilot) || {
      pilot:l._pilot,
      best:Infinity,
      last:null,
      laps:0,
      track:l._track,
      session:l.session_name,
      date:l._date
    };

    item.laps += 1;
    item.last = l;
    item.track = l._track;
    if(l._time < item.best) item.best = l._time;

    map.set(l._pilot, item);
  });

  return Array.from(map.values()).sort(function(a,b){return a.best-b.best;});
}

function renderLiveRows(rows){
  if(!rows.length){
    return '<p class="small">Aucun tour live disponible pour le moment.</p>';
  }

  return rows.map(function(r,i){
    return '<div class="live-ranking-row">' +
      '<div class="live-rank '+(i===0?'first':'')+'">'+(i+1)+'</div>' +
      '<div>' +
        '<div class="live-pilot">'+escapeHtml(r.pilot)+'</div>' +
        '<div class="live-last">'+r.laps+' tours · Dernier : '+fmtTimeS(r.last && r.last._time)+'</div>' +
      '</div>' +
      '<div><span class="badge">'+escapeHtml(r.track)+'</span></div>' +
      '<div class="live-time">'+fmtTimeS(r.best)+'</div>' +
    '</div>';
  }).join('');
}

function livePage(){
  if(liveTimer) clearTimeout(liveTimer);

  var session = latestSessionLaps();
  var filtered = applyFilters(session.laps);
  var rows = liveRanking(filtered);
  var best = rows[0] || null;
  var lastUpdate = new Date().toLocaleTimeString('fr-FR');

  app.innerHTML =
    '<section class="live-hero">' +
      '<div class="card live-card">' +
        '<div class="live-status"><span class="live-dot"></span> LIVE / quasi-live</div>' +
        '<h1 class="live-title">Live Timing MRCP</h1>' +
        '<p class="pilot-sub">Classement automatique basé sur la dernière activité SpeedHive récupérée par le LXC.</p>' +
        '<div class="goal-box">' +
          '<div class="goal-pill"><span class="small">Activité</span><strong>'+escapeHtml(session.sessionName)+'</strong></div>' +
          '<div class="goal-pill"><span class="small">Pilotes</span><strong>'+rows.length+'</strong></div>' +
          '<div class="goal-pill"><span class="small">Tours</span><strong>'+filtered.length+'</strong></div>' +
        '</div>' +
        '<div class="live-refresh">' +
          '<button id="manualRefreshLive" class="btn-primary">Rafraîchir</button>' +
          '<button id="toggleTvMode" class="btn-secondary">Mode TV</button>' +
          '<span class="small">Dernier rafraîchissement : '+lastUpdate+'</span>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<h3>🏆 Meilleur tour live</h3>' +
        '<div class="big">'+fmtTimeS(best && best.best)+'</div>' +
        '<p>'+(best ? escapeHtml(best.pilot) : '-')+'</p>' +
        '<p class="small">Le classement se met à jour automatiquement toutes les 60 secondes.</p>' +
      '</div>' +
    '</section>' +

    '<section class="live-grid">' +
      '<div class="card">' +
        '<div class="panel-title"><h2>📡 Classement live</h2></div>' +
        renderFilters() +
        '<div id="liveRows">'+renderLiveRows(rows)+'</div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>🚨 Alertes</h2>' +
        '<p class="small">Cette première version détecte la dernière session. La prochaine pourra signaler automatiquement un nouveau record.</p>' +
        '<div class="goal-box">' +
          '<div class="goal-pill"><span class="small">Piste</span><strong>'+escapeHtml(state.track === 'all' ? 'Toutes' : state.track)+'</strong></div>' +
          '<div class="goal-pill"><span class="small">Source</span><strong>data_v2.json</strong></div>' +
        '</div>' +
      '</div>' +
    '</section>';

  bindFilters(livePage);

  var manual = document.getElementById('manualRefreshLive');
  if(manual) manual.onclick = function(){ location.reload(); };

  var tv = document.getElementById('toggleTvMode');
  if(tv) tv.onclick = function(){ document.body.classList.toggle('live-tv'); };

  liveTimer = setTimeout(function(){
    // Recharge complet pour récupérer un data_v2.json neuf poussé par le LXC
    location.reload();
  }, 60000);
}


function adminOnly(title, body){if(!state.isAdmin){app.innerHTML='<section class="card"><h2>Accès admin</h2><p>Page réservée à l’administrateur.</p></section>';return false;}app.innerHTML='<section class="card"><h2>'+escapeHtml(title)+'</h2>'+body+'</section>';return true;}
function suspiciousLaps(){return getAllLapsRaw(true).filter(function(l){if(l._excluded)return true;if(l._time<8)return true;if(l._time>=30&&l._time<=45&&l._track==='TT1/8')return true;if(l._pilot.indexOf('Inconnu')>=0||l._pilot==='Pilote inconnu')return true;return false;}).sort(function(a,b){return a._time-b._time;});}
function downloadJson(filename,obj){var blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}
function adminRecords(){var laps=suspiciousLaps(),o=getOverrides();var rows=laps.slice(0,300).map(function(l){return'<tr><td><code>'+escapeHtml(l.lap_id)+'</code></td><td>'+escapeHtml(l._pilot)+'</td><td><strong>'+fmtTimeS(l._time)+'</strong></td><td>'+escapeHtml(l._track)+'</td><td>'+escapeHtml(l.session_name||l._date||'-')+'</td><td><div class="admin-actions"><button class="btn-danger" data-action="exclude" data-id="'+escapeHtml(l.lap_id)+'">Exclure</button><button class="btn-good" data-action="tt10" data-id="'+escapeHtml(l.lap_id)+'">TT1/10</button><button class="btn-warn" data-action="tt8" data-id="'+escapeHtml(l.lap_id)+'">TT1/8</button><button data-action="reset" data-id="'+escapeHtml(l.lap_id)+'">Reset</button></div></td></tr>';}).join('');if(!adminOnly('Records admin','<p class="small">Corrections locales. Exporte ensuite lap_overrides.json.</p><div class="grid"><div class="card"><h3>Exclusions</h3><div class="big">'+Object.keys(o.excluded).length+'</div></div><div class="card"><h3>Forçages piste</h3><div class="big">'+Object.keys(o.forced_track).length+'</div></div><div class="card"><h3>Tours suspects</h3><div class="big">'+laps.length+'</div></div></div><p><button id="exportLapOverrides">Exporter lap_overrides.json</button> <button id="copyLapOverrides">Copier JSON</button> <button id="clearLapOverrides" class="btn-danger">Vider corrections locales</button></p><textarea class="admin-json" id="lapOverridesText">'+escapeHtml(JSON.stringify(o,null,2))+'</textarea><p><button id="importLapOverrides">Importer le JSON ci-dessus</button></p><div class="table-wrap"><table><thead><tr><th>ID tour</th><th>Pilote</th><th>Temps</th><th>Piste</th><th>Session</th><th>Actions</th></tr></thead><tbody>'+rows+'</tbody></table></div>'))return;document.querySelectorAll('[data-action]').forEach(function(btn){btn.onclick=function(){var id=btn.getAttribute('data-id'),a=btn.getAttribute('data-action'),x=getOverrides();if(a==='exclude')x.excluded[id]=true;if(a==='tt10')x.forced_track[id]='TT1/10';if(a==='tt8')x.forced_track[id]='TT1/8';if(a==='reset'){delete x.excluded[id];delete x.forced_track[id];}setOverrides(x);adminRecords();};});document.getElementById('exportLapOverrides').onclick=function(){downloadJson('lap_overrides.json',getOverrides());};document.getElementById('copyLapOverrides').onclick=function(){navigator.clipboard.writeText(JSON.stringify(getOverrides(),null,2));alert('JSON copié');};document.getElementById('clearLapOverrides').onclick=function(){if(confirm('Vider toutes les corrections locales ?')){setOverrides({excluded:{},forced_track:{}});adminRecords();}};document.getElementById('importLapOverrides').onclick=function(){try{setOverrides(JSON.parse(document.getElementById('lapOverridesText').value));alert('Corrections importées');adminRecords();}catch(e){alert('JSON invalide : '+e.message);}};}
function quality(){adminOnly('Qualité données','<div class="grid"><div class="card"><h3>Tours suspects</h3><div class="big">'+suspiciousLaps().length+'</div></div><div class="card"><h3>Tours lus</h3><div class="big">'+getAllLaps().length+'</div></div></div><p><a href="#/admin-records" class="btn-primary">Corriger les tours suspects</a></p>');}
function adminPilots(){adminOnly('Pilotes admin','<p>Corrections pilotes / transpondeurs.</p>');}
function adminPage(){adminOnly('Admin','<p><a href="#/admin-records" class="btn-primary">Records admin</a> <a href="#/quality" class="btn-secondary">Qualité</a></p><ol><li>Corrige dans Records admin.</li><li>Exporte lap_overrides.json.</li><li>Copie dans le projet.</li><li>Lance python build_data_v2.py.</li><li>Commit/push.</li></ol>');}
function showError(title,err){app.innerHTML='<section class="card"><h2>'+escapeHtml(title)+'</h2><p>'+escapeHtml(err&&err.message?err.message:String(err))+'</p></section>';console.error(err);}
function router(){try{updateAdminNav();setActiveNav();var h=location.hash||'#/';if(h.indexOf('#/live')===0)return livePage();
    if(h.indexOf('#/mes-chronos')===0)return myChronos();if(h.indexOf('#/pilotes')===0)return pilots();if(h.indexOf('#/pilote/')===0)return pilotPage(h.replace('#/pilote/',''));if(h.indexOf('#/podiums')===0)return podiums();if(h.indexOf('#/quality')===0)return quality();if(h.indexOf('#/admin-pilotes')===0)return adminPilots();if(h.indexOf('#/admin-records')===0)return adminRecords();if(h.indexOf('#/admin')===0)return adminPage();return home();}catch(e){showError('Erreur affichage',e);}}
function bindAdmin(){function unlock(){var c=prompt('Code admin');if(c==='mrcp'){localStorage.setItem('mrcp_admin','1');state.isAdmin=true;updateAdminNav();alert('Mode admin activé');}else if(c)alert('Code incorrect');}var a=document.getElementById('adminBtn');if(a)a.onclick=unlock;var b=document.getElementById('adminBtnTop');if(b)b.onclick=unlock;var e=document.getElementById('adminExit');if(e)e.onclick=function(){localStorage.removeItem('mrcp_admin');state.isAdmin=false;location.hash='#/';router();};}

function setupPwa(){
  if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(function(e){console.log('SW non enregistré',e);});}
  var installBtn=document.getElementById('installPwaBtn');
  window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferredPrompt=e;if(installBtn)installBtn.classList.remove('hidden');});
  if(installBtn){installBtn.onclick=async function(){if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installBtn.classList.add('hidden');};}
}

async function init(){
  try{
    bindAdmin(); setupPwa(); updateAdminNav();
    var today=document.getElementById('todayLabel');if(today)today.textContent=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
    var res=await fetch('data_v2.json?ts='+Date.now());if(!res.ok)throw new Error('Impossible de charger data_v2.json : HTTP '+res.status);
    DATA=await res.json();router();
  }catch(e){showError('Erreur de chargement',e);}
}
window.addEventListener('hashchange',router);
init();

})();
