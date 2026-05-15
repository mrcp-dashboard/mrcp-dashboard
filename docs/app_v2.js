(function(){
'use strict';

var DATA = null;
var app = document.getElementById('app');
var deferredPrompt = null;
var ADMIN_CFG_KEY = 'mrcp_admin_api_config';
var state = { track:'all', isAdmin: !!getAdminConfig().token };

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
function getAdminConfig(){try{var raw=JSON.parse(localStorage.getItem(ADMIN_CFG_KEY)||'{}');return{apiUrl:String(raw.apiUrl||'').replace(/\/+$/,''),token:String(raw.token||'')};}catch(e){return{apiUrl:'',token:''};}}
function setAdminConfig(cfg){localStorage.setItem(ADMIN_CFG_KEY,JSON.stringify({apiUrl:String(cfg.apiUrl||'').replace(/\/+$/,''),token:String(cfg.token||'')},null,2));}
function clearAdminConfig(){localStorage.removeItem(ADMIN_CFG_KEY);}
async function adminFetch(path, options){
  var cfg=getAdminConfig();
  if(!cfg.apiUrl||!cfg.token) throw new Error('Configuration API admin manquante');
  options=options||{};
  var headers=Object.assign({'X-MRCP-Admin-Token':cfg.token},options.headers||{});
  if(options.body&&!headers['Content-Type']) headers['Content-Type']='application/json';
  var res=await fetch(cfg.apiUrl+path,Object.assign({},options,{headers:headers}));
  var data=await res.json().catch(function(){return{};});
  if(!res.ok) throw new Error(data.error||('Erreur API HTTP '+res.status));
  return data;
}
async function checkAdminToken(apiUrl, token){
  setAdminConfig({apiUrl:apiUrl,token:token});
  try{
    await adminFetch('/check-auth',{method:'POST'});
    state.isAdmin=true;
    updateAdminNav();
    return true;
  }catch(e){
    clearAdminConfig();
    state.isAdmin=false;
    updateAdminNav();
    throw e;
  }
}
function adminCorrectionSummary(){
  var o=getOverrides(), p=getPilotCorrections();
  return {
    excluded:Object.keys(o.excluded).length,
    forced:Object.keys(o.forced_track).length,
    pilots:Object.keys(p.transponders).length
  };
}
function hasAdminCorrections(){
  var s=adminCorrectionSummary();
  return s.excluded+s.forced+s.pilots>0;
}
function adminSummaryText(){
  var s=adminCorrectionSummary();
  return s.excluded+' exclusions, '+s.forced+' pistes forcees, '+s.pilots+' associations pilotes';
}
function adminPreviewHtml(){
  var s=adminCorrectionSummary();
  return '<div class="admin-preview">' +
    '<div><span class="small">Tours exclus</span><strong>'+s.excluded+'</strong></div>' +
    '<div><span class="small">Pistes forcees</span><strong>'+s.forced+'</strong></div>' +
    '<div><span class="small">Pilotes associes</span><strong>'+s.pilots+'</strong></div>' +
  '</div>';
}
function setAdminStatus(targetId, stateName, title, body){
  var el=targetId ? document.getElementById(targetId) : null;
  if(!el) return;
  el.className='admin-status '+(stateName||'');
  el.innerHTML='<strong>'+escapeHtml(title)+'</strong>'+(body?'<div>'+body+'</div>':'');
}
function commandListHtml(commands){
  if(!Array.isArray(commands)||!commands.length) return '';
  return '<details><summary>Details techniques</summary><ol>'+commands.map(function(c){
    var ok=c.returncode===0;
    return '<li><code>'+escapeHtml(c.cmd||'commande')+'</code> <span class="'+(ok?'status-ok':'status-ko')+'">'+(ok?'OK':'Erreur '+c.returncode)+'</span></li>';
  }).join('')+'</ol></details>';
}
function historyCountsText(item){
  var c=item&&item.counts?item.counts:{};
  return (c.excluded_laps||0)+' exclusions, '+(c.forced_tracks||0)+' pistes forcees, '+(c.pilot_transponders||0)+' puces, '+(c.pilot_names||0)+' noms';
}
function adminHistoryHtml(history){
  if(!Array.isArray(history)||!history.length) return '<div class="small">Aucune action admin enregistree pour le moment.</div>';
  return '<div class="admin-history-list">'+history.map(function(item){
    var status=item.status||'unknown';
    var commit=item.commit?'<span>Commit '+escapeHtml(item.commit)+'</span>':'';
    return '<div class="admin-history-item">' +
      '<div class="admin-history-top"><strong>'+escapeHtml(item.message||'Correction admin')+'</strong><span class="admin-history-status">'+escapeHtml(status)+'</span></div>' +
      '<div class="admin-history-meta"><span>'+escapeHtml(item.time||'date inconnue')+'</span>'+commit+'</div>' +
      '<div class="small">'+escapeHtml(historyCountsText(item))+'</div>' +
    '</div>';
  }).join('')+'</div>';
}
async function loadAdminHistory(){
  var box=document.getElementById('adminHistory');
  if(!box) return;
  box.innerHTML='<div class="small">Chargement...</div>';
  try{
    var result=await adminFetch('/admin-history');
    box.innerHTML=adminHistoryHtml(result.history||[]);
  }catch(e){
    box.innerHTML='<div class="admin-status warn"><strong>Historique indisponible</strong><div>'+escapeHtml(e.message)+'</div></div>';
  }
}
function adminBackupHtml(backups){
  if(!Array.isArray(backups)||!backups.length) return '<div class="small">Aucune sauvegarde disponible pour le moment.</div>';
  return '<div class="admin-history-list">'+backups.map(function(item){
    var files=Array.isArray(item.files)?item.files.join(', '):'';
    return '<div class="admin-history-item">' +
      '<div class="admin-history-top"><strong>'+escapeHtml(item.id||'sauvegarde')+'</strong><button class="btn-secondary restore-admin-backup" data-backup-id="'+escapeHtml(item.id||'')+'">Restaurer</button></div>' +
      '<div class="admin-history-meta"><span>'+escapeHtml(item.time||'date inconnue')+'</span><span>'+escapeHtml(item.reason||'backup')+'</span></div>' +
      '<div class="small">'+escapeHtml(files||'Aucun fichier liste')+'</div>' +
    '</div>';
  }).join('')+'</div>';
}
async function loadAdminBackups(){
  var box=document.getElementById('adminBackups');
  if(!box) return;
  box.innerHTML='<div class="small">Chargement...</div>';
  try{
    var result=await adminFetch('/admin-backups');
    box.innerHTML=adminBackupHtml(result.backups||[]);
    document.querySelectorAll('.restore-admin-backup').forEach(function(btn){
      btn.onclick=function(){restoreAdminBackup(btn.getAttribute('data-backup-id'),btn);};
    });
  }catch(e){
    box.innerHTML='<div class="admin-status warn"><strong>Sauvegardes indisponibles</strong><div>'+escapeHtml(e.message)+'</div></div>';
  }
}
async function restoreAdminBackup(backupId, trigger){
  if(!backupId) return;
  if(!confirm('Restaurer la sauvegarde '+backupId+' et pousser sur GitHub ?')) return;
  var message=prompt('Message de commit', 'Restaure sauvegarde admin '+backupId);
  if(message===null) return;
  if(trigger) trigger.disabled=true;
  setAdminStatus('adminHubStatus','pending','Restauration en cours','Restauration des JSON, regeneration des donnees, commit et push...');
  try{
    var result=await adminFetch('/restore-backup',{
      method:'POST',
      body:JSON.stringify({backup_id:backupId,message:message||('Restaure sauvegarde admin '+backupId)})
    });
    setAdminStatus('adminHubStatus','ok','Sauvegarde restauree',escapeHtml(result.message||'Termine')+commandListHtml(result.commands));
    loadAdminHistory();
    loadAdminBackups();
    alert(result.message||'Sauvegarde restauree');
  }catch(e){
    setAdminStatus('adminHubStatus','error','Echec restauration',escapeHtml(e.message));
    alert('API admin : '+e.message);
  }finally{
    if(trigger) trigger.disabled=false;
  }
}
async function applyAdminCorrections(statusId, trigger){
  if(!hasAdminCorrections()){
    setAdminStatus(statusId,'warn','Aucune correction a appliquer','Corrige un tour ou une association pilote avant de pousser.');
    alert('Aucune correction locale a appliquer.');
    return;
  }
  var confirmed=confirm('Appliquer ces corrections et pousser sur GitHub ?\n\n'+adminSummaryText());
  if(!confirmed) return;
  var message=prompt('Message de commit', 'Maj corrections admin dashboard');
  if(message===null) return;
  if(trigger) trigger.disabled=true;
  setAdminStatus(statusId,'pending','Application en cours','Ecriture des JSON, generation des donnees, commit et push...');
  try{
    var result=await adminFetch('/apply-corrections',{
      method:'POST',
      body:JSON.stringify({
        lap_overrides:getOverrides(),
        corrections:getPilotCorrections(),
        message:message||'Maj corrections admin dashboard'
      })
    });
    setAdminStatus(statusId,'ok','Corrections appliquees',escapeHtml(result.message||'Termine')+commandListHtml(result.commands));
    loadAdminHistory();
    loadAdminBackups();
    alert(result.message||'Corrections appliquees');
  }catch(e){
    setAdminStatus(statusId,'error','Echec API admin',escapeHtml(e.message));
    throw e;
  }finally{
    if(trigger) trigger.disabled=false;
  }
}

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
        tracks:{}
      };
    }
    map[key].laps += 1;
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
  var insights = pilotAiInsights(s);
  var consistency = pilotConsistency(s);

  return '<section class="pilot-hero">' +
    '<div class="card pilot-main-card">' +
      '<div class="pilot-name">🏎️ '+escapeHtml(name)+'</div>' +
      '<p class="pilot-sub">Profil pilote complet : performances, progression, régularité et QR code.</p>' +
      '<div class="goal-box">' +
        '<div class="goal-pill"><span class="small">Best TT1/8</span><strong>'+fmtTimeS(best18&&best18._time)+'</strong></div>' +
        '<div class="goal-pill"><span class="small">Best TT1/10</span><strong>'+fmtTimeS(best10&&best10._time)+'</strong></div>' +
        '<div class="goal-pill"><span class="small">Moyenne</span><strong>'+fmtTimeS(s.avg)+'</strong></div>' +
        '<div class="goal-pill"><span class="small">Régularité</span><strong>'+fmtTimeS(consistency)+'</strong></div>' +
      '</div>' +
      '<div class="share-row">' +
        '<button id="setMyProfile">C’est mon profil</button>' +
        '<button id="copyPilotLink">Copier lien fiche</button>' +
        '<button id="printPilotProfile">Imprimer fiche</button>' +
      '</div>' +
    '</div>' +
    '<div class="card qr-card">' +
      '<h3>📱 QR code pilote</h3>' +
      '<img class="qr-img" src="'+qrUrlForPilot(name)+'" alt="QR code fiche pilote">' +
      '<p class="small">À afficher au club : le pilote scanne et arrive directement sur sa fiche.</p>' +
    '</div>' +
  '</section>' +

  '<section class="grid">' +
    '<div class="card"><h3>Tours</h3><div class="big">'+s.laps.length+'</div></div>' +
    '<div class="card"><h3>Sessions</h3><div class="big">'+s.sessions+'</div></div>' +
    '<div class="card"><h3>Écart record TT1/8</h3><div class="big">'+(gap18!=null?fmtTimeS(gap18):'-')+'</div></div>' +
    '<div class="card"><h3>Écart record TT1/10</h3><div class="big">'+(gap10!=null?fmtTimeS(gap10):'-')+'</div></div>' +
  '</section>' +

  '<section class="card ai-card">' +
    '<h3>🧠 Analyse progression IA</h3>' +
    '<div class="ai-list">' + insights.map(function(x){return '<div class="ai-item">💡 '+escapeHtml(x)+'</div>';}).join('') + '</div>' +
  '</section>' +

  '<section class="card">' +
    '<h3>📈 Progression récente — '+escapeHtml(chartTrack)+'</h3>' +
    renderProgressSvg(progress) +
  '</section>' +

  '<section class="card">' +
    '<h3>📅 Sessions du pilote</h3>' +
    '<div class="table-wrap"><table><thead><tr><th>Session</th><th>Tours</th><th>Best</th><th>Moyenne</th><th>Pistes</th></tr></thead><tbody>' +
      sessions.slice(0,40).map(function(x){
        return '<tr><td>'+escapeHtml(x.name)+'</td><td>'+x.laps+'</td><td><strong>'+fmtTimeS(x.best)+'</strong></td><td>'+fmtTimeS(x.avg)+'</td><td><span class="badge">'+escapeHtml(Object.keys(x.tracks).join(' / '))+'</span></td></tr>';
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
}

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

  app.innerHTML = '<section class="card"><h2>Mes chronos</h2><button id="changePilot">Changer de pilote</button></section>' + pilotFullProfileHtml(saved) + '<div class="mobile-sticky-action"><a href="#/podiums" class="btn-primary">Voir podiums du club</a></div>';

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
function adminRecords(){
  var laps=suspiciousLaps();
  var o=getOverrides();

  var rows=laps.slice(0,500).map(function(l){
    var reason=[];
    if(l._excluded) reason.push('exclu');
    if(l._time<8) reason.push('< 8s');
    if(l._time>=30&&l._time<=45&&l._track==='TT1/8') reason.push('30-45s TT1/8');
    if(l._pilot.indexOf('Inconnu')>=0||l._pilot==='Pilote inconnu'||/^[0-9]+/.test(String(l._pilot))) reason.push('pilote inconnu');

    return '<tr data-lap-id="'+escapeHtml(l.lap_id)+'" data-search="'+escapeHtml((l._pilot+' '+l.transponder+' '+l.session_name+' '+l._track+' '+reason.join(' ')).toLowerCase())+'">' +
      '<td data-label="ID tour"><code>'+escapeHtml(l.lap_id)+'</code></td>' +
      '<td data-label="Pilote/Puce">'+escapeHtml(l._pilot)+'<div class="small">'+escapeHtml(l.transponder||'')+'</div></td>' +
      '<td data-label="Temps"><strong>'+fmtTimeS(l._time)+'</strong></td>' +
      '<td data-label="Piste"><span class="badge">'+escapeHtml(l._track)+'</span></td>' +
      '<td data-label="Session">'+escapeHtml(l.session_name||l._date||'-')+'</td>' +
      '<td data-label="Raison">'+escapeHtml(reason.join(', ')||'-')+'</td>' +
      '<td data-label="Actions">' +
        '<div class="admin-actions">' +
          '<button class="record-action btn-danger" data-action="exclude" data-id="'+escapeHtml(l.lap_id)+'">Supprimer tour</button>' +
          '<button class="record-action btn-good" data-action="tt10" data-id="'+escapeHtml(l.lap_id)+'">Mettre TT1/10</button>' +
          '<button class="record-action btn-warn" data-action="tt8" data-id="'+escapeHtml(l.lap_id)+'">Mettre TT1/8</button>' +
          '<button class="record-action" data-action="reset" data-id="'+escapeHtml(l.lap_id)+'">Annuler</button>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }).join('');

  if(!adminOnly('Records admin',
    '<p class="small">Mode correction rapide : après un clic sur Supprimer / TT1/10 / TT1/8, la ligne disparaît automatiquement pour passer à la suivante. Ensuite exporte <strong>lap_overrides.json</strong>.</p>' +
    '<div class="grid">' +
      '<div class="card"><h3>Exclusions</h3><div class="big" id="excludedCount">'+Object.keys(o.excluded).length+'</div></div>' +
      '<div class="card"><h3>Forçages piste</h3><div class="big" id="forcedTrackCount">'+Object.keys(o.forced_track).length+'</div></div>' +
      '<div class="card"><h3>Tours suspects restants</h3><div class="big" id="suspectCount">'+laps.length+'</div></div>' +
    '</div>' +
    adminPreviewHtml() +
    '<p><button id="exportLapOverrides" class="btn-primary">Exporter lap_overrides.json</button> <button id="applyLapOverridesApi" class="btn-good">Appliquer via API</button> <button id="copyLapOverrides" class="btn-secondary">Copier JSON</button> <button id="clearLapOverrides" class="btn-danger">Vider corrections records</button></p>' +
    '<div id="adminRecordsStatus" class="admin-status hidden"></div>' +
    '<textarea class="admin-json" id="lapOverridesText">'+escapeHtml(JSON.stringify(o,null,2))+'</textarea>' +
    '<p><button id="importLapOverrides" class="btn-secondary">Importer le JSON ci-dessus</button></p>' +
    '<input class="searchBox" id="adminRecordSearch" placeholder="Rechercher pilote, puce, session, raison...">' +
    '<div class="table-wrap admin-table-wrap"><table><thead><tr><th>ID tour</th><th>Pilote/Puce</th><th>Temps</th><th>Piste</th><th>Session</th><th>Raison</th><th>Actions</th></tr></thead><tbody id="adminRecordRows">'+rows+'</tbody></table></div>'
  )) return;

  function refreshOverrideText(){
    var current=getOverrides();
    var txt=document.getElementById('lapOverridesText');
    if(txt) txt.value=JSON.stringify(current,null,2);

    var excluded=document.getElementById('excludedCount');
    if(excluded) excluded.textContent=Object.keys(current.excluded).length;

    var forced=document.getElementById('forcedTrackCount');
    if(forced) forced.textContent=Object.keys(current.forced_track).length;

    var suspect=document.getElementById('suspectCount');
    if(suspect) suspect.textContent=document.querySelectorAll('#adminRecordRows tr').length;
  }

  function removeCorrectedRow(btn){
    var row=btn.closest('tr');
    if(row){
      row.classList.add('row-fixed');
      setTimeout(function(){
        if(row && row.parentNode){
          row.parentNode.removeChild(row);
          refreshOverrideText();
        }
      },120);
    }else{
      refreshOverrideText();
    }
  }

  document.querySelectorAll('.record-action').forEach(function(btn){
    btn.onclick=function(){
      var id=btn.getAttribute('data-id');
      var action=btn.getAttribute('data-action');
      var x=getOverrides();

      if(action==='exclude'){
        x.excluded[id]={reason:'Exclu admin'};
        delete x.forced_track[id];
        setOverrides(x);
        removeCorrectedRow(btn);
        return;
      }

      if(action==='tt10'){
        x.forced_track[id]='TT1/10';
        delete x.excluded[id];
        setOverrides(x);
        removeCorrectedRow(btn);
        return;
      }

      if(action==='tt8'){
        x.forced_track[id]='TT1/8';
        delete x.excluded[id];
        setOverrides(x);
        removeCorrectedRow(btn);
        return;
      }

      if(action==='reset'){
        delete x.excluded[id];
        delete x.forced_track[id];
        setOverrides(x);
        removeCorrectedRow(btn);
        return;
      }
    };
  });

  document.getElementById('exportLapOverrides').onclick=function(){
    downloadJson('lap_overrides.json',getOverrides());
  };

  document.getElementById('applyLapOverridesApi').onclick=function(){
    applyAdminCorrections('adminRecordsStatus',this).catch(function(e){alert('API admin : '+e.message);});
  };

  document.getElementById('copyLapOverrides').onclick=function(){
    navigator.clipboard.writeText(JSON.stringify(getOverrides(),null,2));
    alert('JSON copié');
  };

  document.getElementById('clearLapOverrides').onclick=function(){
    if(confirm('Vider toutes les corrections records locales ?')){
      setOverrides({excluded:{},forced_track:{}});
      adminRecords();
    }
  };

  document.getElementById('importLapOverrides').onclick=function(){
    try{
      var imported=JSON.parse(document.getElementById('lapOverridesText').value);

      // Compatibilité anciens exports : excluded: {id: true}
      if(imported.excluded){
        Object.keys(imported.excluded).forEach(function(k){
          if(imported.excluded[k]===true){
            imported.excluded[k]={reason:'Exclu admin'};
          }
        });
      }

      setOverrides(imported);
      alert('Corrections records importées');
      adminRecords();
    }catch(e){
      alert('JSON invalide : '+e.message);
    }
  };

  document.getElementById('adminRecordSearch').oninput=function(e){
    var q=e.target.value.toLowerCase();
    document.querySelectorAll('#adminRecordRows tr').forEach(function(tr){
      tr.style.display = tr.getAttribute('data-search').indexOf(q) !== -1 ? '' : 'none';
    });
  };
}
function quality(){adminOnly('Qualité données','<div class="grid"><div class="card"><h3>Tours suspects</h3><div class="big">'+suspiciousLaps().length+'</div></div><div class="card"><h3>Tours lus</h3><div class="big">'+getAllLaps().length+'</div></div></div><p><a href="#/admin-records" class="btn-primary">Corriger les tours suspects</a></p>');}
function getPilotCorrections(){
  try{
    var raw=JSON.parse(localStorage.getItem('mrcp_pilot_corrections')||'{}');
    return {
      names: raw.names && typeof raw.names==='object' ? raw.names : {},
      transponders: raw.transponders && typeof raw.transponders==='object' ? raw.transponders : {}
    };
  }catch(e){
    return {names:{}, transponders:{}};
  }
}

function setPilotCorrections(c){
  localStorage.setItem('mrcp_pilot_corrections', JSON.stringify({
    names:c.names||{},
    transponders:c.transponders||{}
  }, null, 2));
}

function exportPilotCorrections(){
  downloadJson('corrections.json', getPilotCorrections());
}

function transponderSummary(){
  var map = {};
  getAllLapsRaw(true).forEach(function(l){
    var tp = normalizeTransponder(l.transponder || '');
    if(!tp) tp = 'sans-transpondeur';
    if(!map[tp]){
      map[tp] = {
        transponder: tp,
        names: {},
        laps: 0,
        best: Infinity,
        tracks: {}
      };
    }
    map[tp].names[l._pilot] = true;
    map[tp].laps += 1;
    if(l._time < map[tp].best) map[tp].best = l._time;
    map[tp].tracks[l._track] = true;
  });
  return Object.values(map).sort(function(a,b){return b.laps-a.laps;});
}

function adminPilots(){
  var corrections = getPilotCorrections();
  var rows = transponderSummary();
  var q = '';
  var htmlRows = rows.map(function(r){
    var currentName = corrections.transponders[r.transponder] || Object.keys(r.names)[0] || '';
    var names = Object.keys(r.names).join(' / ');
    var tracks = Object.keys(r.tracks).join(' / ');
    return '<tr data-search="'+escapeHtml((r.transponder+' '+names+' '+currentName).toLowerCase())+'">' +
      '<td data-label="Puce"><strong>'+escapeHtml(r.transponder)+'</strong></td>' +
      '<td data-label="Noms vus">'+escapeHtml(names)+'</td>' +
      '<td data-label="Tours">'+r.laps+'</td>' +
      '<td data-label="Best">'+fmtTimeS(r.best)+'</td>' +
      '<td data-label="Piste"><span class="badge">'+escapeHtml(tracks)+'</span></td>' +
      '<td data-label="Nom officiel"><input class="pilot-name-input" data-tp="'+escapeHtml(r.transponder)+'" value="'+escapeHtml(currentName)+'" placeholder="Nom pilote officiel"></td>' +
      '<td data-label="Action"><button class="save-pilot-name btn-primary" data-tp="'+escapeHtml(r.transponder)+'">Sauver</button></td>' +
    '</tr>';
  }).join('');

  if(!adminOnly('Pilotes admin',
    '<p class="small">Associe une puce/transpondeur à un nom pilote officiel. Ensuite exporte <strong>corrections.json</strong>, copie-le dans le projet, puis relance <code>python build_data_v2.py</code>.</p>' +
    '<div class="grid">' +
      '<div class="card"><h3>Transpondeurs détectés</h3><div class="big">'+rows.length+'</div></div>' +
      '<div class="card"><h3>Associations locales</h3><div class="big">'+Object.keys(corrections.transponders).length+'</div></div>' +
    '</div>' +
    adminPreviewHtml() +
    '<p><button id="exportPilotCorrections" class="btn-primary">Exporter corrections.json</button> <button id="applyPilotCorrectionsApi" class="btn-good">Appliquer via API</button> <button id="copyPilotCorrections" class="btn-secondary">Copier JSON</button> <button id="clearPilotCorrections" class="btn-danger">Vider corrections pilotes</button></p>' +
    '<div id="adminPilotsStatus" class="admin-status hidden"></div>' +
    '<textarea class="admin-json" id="pilotCorrectionsText">'+escapeHtml(JSON.stringify(corrections,null,2))+'</textarea>' +
    '<p><button id="importPilotCorrections" class="btn-secondary">Importer le JSON ci-dessus</button></p>' +
    '<input class="searchBox" id="adminPilotSearch" placeholder="Rechercher transpondeur ou pilote...">' +
    '<div class="table-wrap admin-table-wrap"><table><thead><tr><th>Puce</th><th>Noms vus</th><th>Tours</th><th>Best</th><th>Piste</th><th>Nom officiel</th><th>Action</th></tr></thead><tbody id="adminPilotRows">'+htmlRows+'</tbody></table></div>'
  )) return;

  document.querySelectorAll('.save-pilot-name').forEach(function(btn){
    btn.onclick=function(){
      var tp=btn.getAttribute('data-tp');
      var input=null; document.querySelectorAll('.pilot-name-input').forEach(function(el){ if(el.getAttribute('data-tp')===tp) input=el; });
      var name=input ? input.value.trim() : '';
      var c=getPilotCorrections();
      if(name){
        c.transponders[tp]=name;
      }else{
        delete c.transponders[tp];
      }
      setPilotCorrections(c);
      document.getElementById('pilotCorrectionsText').value=JSON.stringify(c,null,2);
      alert('Association enregistrée localement pour '+tp);
    };
  });

  document.getElementById('exportPilotCorrections').onclick=function(){
    exportPilotCorrections();
  };

  document.getElementById('applyPilotCorrectionsApi').onclick=function(){
    applyAdminCorrections('adminPilotsStatus',this).catch(function(e){alert('API admin : '+e.message);});
  };

  document.getElementById('copyPilotCorrections').onclick=function(){
    navigator.clipboard.writeText(JSON.stringify(getPilotCorrections(),null,2));
    alert('JSON copié');
  };

  document.getElementById('clearPilotCorrections').onclick=function(){
    if(confirm('Vider toutes les corrections pilotes locales ?')){
      setPilotCorrections({names:{},transponders:{}});
      adminPilots();
    }
  };

  document.getElementById('importPilotCorrections').onclick=function(){
    try{
      var obj=JSON.parse(document.getElementById('pilotCorrectionsText').value);
      setPilotCorrections(obj);
      alert('Corrections pilotes importées');
      adminPilots();
    }catch(e){
      alert('JSON invalide : '+e.message);
    }
  };

  document.getElementById('adminPilotSearch').oninput=function(e){
    var query=e.target.value.toLowerCase();
    document.querySelectorAll('#adminPilotRows tr').forEach(function(tr){
      tr.style.display = tr.getAttribute('data-search').indexOf(query) !== -1 ? '' : 'none';
    });
  };
}
function adminPage(){
  var cfg=getAdminConfig();
  adminOnly('Admin',
    '<p><a href="#/admin-records" class="btn-primary">Records admin</a> <a href="#/admin-pilotes" class="btn-primary">Pilotes admin</a> <a href="#/quality" class="btn-secondary">Qualite</a></p>' +
    '<div class="grid">' +
      '<div class="card"><h3>API admin</h3><p class="small">Les corrections peuvent etre exportees en JSON ou appliquees directement via l API locale.</p><div class="goal-box"><div class="goal-pill"><span class="small">URL</span><strong>'+escapeHtml(cfg.apiUrl||'Non configuree')+'</strong></div><div class="goal-pill"><span class="small">Token</span><strong>'+(cfg.token?'Configure':'Manquant')+'</strong></div></div><p><button id="testAdminApi" class="btn-secondary">Tester API</button> <button id="applyAllCorrections" class="btn-good">Appliquer corrections + push</button> <button id="resetAdminApi" class="btn-danger">Oublier acces admin</button></p></div>' +
      '<div class="card"><h3>Corrections locales</h3>'+adminPreviewHtml()+'</div>' +
    '</div>' +
    '<div id="adminHubStatus" class="admin-status hidden"></div>' +
    '<ol><li>Corrige les tours dans Records admin.</li><li>Associe les puces dans Pilotes admin.</li><li>Clique sur Appliquer corrections + push si l API locale est configuree.</li><li>Sinon exporte les JSON et lance la generation manuellement.</li></ol>' +
    '<div class="admin-history"><div class="panel-title"><h2>Sauvegardes admin</h2><button id="refreshAdminBackups" class="btn-secondary">Rafraichir</button></div><div id="adminBackups"><div class="small">Chargement...</div></div></div>' +
    '<div class="admin-history"><div class="panel-title"><h2>Historique admin</h2><button id="refreshAdminHistory" class="btn-secondary">Rafraichir</button></div><div id="adminHistory"><div class="small">Chargement...</div></div></div>'
  );
  var test=document.getElementById('testAdminApi');
  if(test)test.onclick=function(){adminFetch('/check-auth',{method:'POST'}).then(function(){alert('API admin OK');}).catch(function(e){alert('API admin : '+e.message);});};
  var apply=document.getElementById('applyAllCorrections');
  if(apply)apply.onclick=function(){applyAdminCorrections('adminHubStatus',this).catch(function(e){alert('API admin : '+e.message);});};
  var refresh=document.getElementById('refreshAdminHistory');
  if(refresh)refresh.onclick=function(){loadAdminHistory();};
  var refreshBackups=document.getElementById('refreshAdminBackups');
  if(refreshBackups)refreshBackups.onclick=function(){loadAdminBackups();};
  loadAdminBackups();
  loadAdminHistory();
  var reset=document.getElementById('resetAdminApi');
  if(reset)reset.onclick=function(){if(confirm('Oublier acces admin sur ce navigateur ?')){clearAdminConfig();state.isAdmin=false;location.hash='#/';router();}};
}
function showError(title,err){app.innerHTML='<section class="card"><h2>'+escapeHtml(title)+'</h2><p>'+escapeHtml(err&&err.message?err.message:String(err))+'</p></section>';console.error(err);}
function router(){try{updateAdminNav();setActiveNav();var h=location.hash||'#/';if(h.indexOf('#/live')===0)return livePage();
    if(h.indexOf('#/mes-chronos')===0)return myChronos();if(h.indexOf('#/pilotes')===0)return pilots();if(h.indexOf('#/pilote/')===0)return pilotPage(h.replace('#/pilote/',''));if(h.indexOf('#/podiums')===0)return podiums();if(h.indexOf('#/quality')===0)return quality();if(h.indexOf('#/admin-pilotes')===0)return adminPilots();if(h.indexOf('#/admin-records')===0)return adminRecords();if(h.indexOf('#/admin')===0)return adminPage();return home();}catch(e){showError('Erreur affichage',e);}}
function bindAdmin(){
  async function unlock(){
    var current=getAdminConfig();
    var apiUrl=prompt('URL API admin', current.apiUrl||'http://127.0.0.1:5055');
    if(!apiUrl) return;
    var token=prompt('Token admin', current.token||'');
    if(!token) return;
    try{
      await checkAdminToken(apiUrl, token);
      alert('Mode admin active');
      router();
    }catch(e){
      alert('Acces admin refuse : '+e.message);
    }
  }
  var a=document.getElementById('adminBtn');if(a)a.onclick=unlock;
  var b=document.getElementById('adminBtnTop');if(b)b.onclick=unlock;
  var e=document.getElementById('adminExit');if(e)e.onclick=function(){clearAdminConfig();state.isAdmin=false;location.hash='#/';router();};
}

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
