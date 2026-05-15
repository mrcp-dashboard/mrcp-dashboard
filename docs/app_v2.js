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
function bytesText(value){
  var n=Number(value);
  if(!Number.isFinite(n)) return '-';
  if(n<1024) return n+' o';
  if(n<1024*1024) return (n/1024).toFixed(1)+' Ko';
  return (n/1024/1024).toFixed(1)+' Mo';
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
function adminStatusHtml(status){
  var git=status.git||{}, files=status.files||{}, data=files.data_v2||{};
  var gitState=git.dirty?'Modifs locales':'Propre';
  var dataText=data.exists ? bytesText(data.size)+' - '+(data.modified||'date inconnue') : 'Manquant';
  var latest=status.latest_history?status.latest_history.message||status.latest_history.status:'Aucune action';
  return '<div class="admin-diagnostic-grid">' +
    '<div><span class="small">API</span><strong>'+escapeHtml(status.service||'admin')+'</strong><small>'+escapeHtml(status.time||'')+'</small></div>' +
    '<div><span class="small">Git</span><strong>'+escapeHtml((git.branch||'-')+' @ '+(git.head||'-'))+'</strong><small>'+escapeHtml(gitState)+'</small></div>' +
    '<div><span class="small">data_v2.json</span><strong>'+escapeHtml(data.exists?'OK':'Manquant')+'</strong><small>'+escapeHtml(dataText)+'</small></div>' +
    '<div><span class="small">Historique</span><strong>'+escapeHtml(String(status.history_count||0))+'</strong><small>'+escapeHtml(latest)+'</small></div>' +
    '<div><span class="small">Sauvegardes</span><strong>'+escapeHtml(String(status.backup_count||0))+'</strong><small>'+escapeHtml(status.latest_backup?status.latest_backup.id:'Aucune')+'</small></div>' +
    '<div><span class="small">Dossier</span><strong>'+escapeHtml(status.docs_dir||'-')+'</strong><small>'+escapeHtml(status.project_root||'-')+'</small></div>' +
  '</div>' +
  (git.status&&git.status.length?'<details><summary>Modifs Git locales</summary><pre>'+escapeHtml(git.status.join('\n'))+'</pre></details>':'');
}
async function loadAdminStatus(){
  var box=document.getElementById('adminDiagnostics');
  if(!box) return;
  box.innerHTML='<div class="small">Chargement...</div>';
  try{
    var result=await adminFetch('/admin-status');
    box.innerHTML=adminStatusHtml(result);
  }catch(e){
    box.innerHTML='<div class="admin-status warn"><strong>Diagnostic indisponible</strong><div>'+escapeHtml(e.message)+'</div></div>';
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
    loadAdminStatus();
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
    loadAdminStatus();
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
function podiumHtml(rows,compact){var top=rows.slice(0,3);if(!top.length)return'<p class="small">Aucun chrono trouvé.</p>';var order=[1,0,2];return'<div class="podium '+(compact?'podium-compact':'')+'">'+order.map(function(i){var r=top[i];if(!r)return'<div></div>';var cls=i===0?'first':i===1?'second':'third';var med=i===0?'🥇':i===1?'🥈':'🥉';return'<div class="step '+cls+'"><span class="medal">'+med+'</span><strong>'+escapeHtml(r._pilot)+'</strong><div class="time">'+fmtTime(r._time)+'</div><div class="small">'+escapeHtml(r._track)+'</div></div>';}).join('')+'</div>';}
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

function home(){
  var laps=getAllLaps(), best=bestByPilot(laps), activities=latestActivities(), pilotsCount=bestByPilot(laps).length;
  app.innerHTML='<section class="hero-dashboard"><div class="hero-card"><h1>Dashboard MRCP</h1><p>Chronos, records, podiums et progression personnelle.</p><div class="hero-actions"><a href="#/mes-chronos" class="btn-primary">Mes chronos</a><a href="#/podiums" class="btn-secondary">Podiums</a></div></div><div class="card kpi-card"><h2>Chiffres clés</h2><div class="kpi-grid"><div class="kpi"><div class="kpi-icon">🏁</div><div><div class="kpi-label">Activités</div><div class="kpi-value">'+activities.length+'</div><div class="kpi-label">sessions</div></div></div><div class="kpi"><div class="kpi-icon">👥</div><div><div class="kpi-label">Pilotes</div><div class="kpi-value">'+pilotsCount+'</div><div class="kpi-label">inscrits</div></div></div><div class="kpi"><div class="kpi-icon">⏱️</div><div><div class="kpi-label">Tours</div><div class="kpi-value">'+laps.length.toLocaleString('fr-FR')+'</div><div class="kpi-label">enregistrés</div></div></div><div class="kpi"><div class="kpi-icon">🏆</div><div><div class="kpi-label">Records</div><div class="kpi-value">'+best.length+'</div><div class="kpi-label">meilleurs tours</div></div></div></div></div></section><section class="dashboard-grid"><div class="card"><div class="panel-title"><h2>📅 Dernières activités</h2></div><div>'+activities.map(function(a){var tracks=Object.keys(a.tracks).join(' / ')||'-';return'<div class="activity-row"><div class="activity-date">'+escapeHtml(a.date||a.name)+'</div><div><div class="activity-track">☀️ '+escapeHtml(tracks)+'</div><div class="activity-sub">'+a.laps+' tours</div></div><div><strong>'+Object.keys(a.pilots).length+'</strong><div class="activity-sub">pilotes</div></div></div>';}).join('')+'</div></div><div class="card"><div class="panel-title"><h2>⭐ Meilleurs tours</h2><a class="mini-button" href="#/podiums">Voir tous</a></div>'+best.slice(0,5).map(function(r,i){return'<div class="record-row"><div class="record-rank">'+(i+1)+'</div><div><div class="record-name">'+escapeHtml(r._pilot)+'</div><div class="record-sub"><span class="badge">'+escapeHtml(r._track)+'</span></div></div><div class="record-time">'+fmtTime(r._time)+'<div class="record-sub">'+escapeHtml(r._date||'')+'</div></div></div>';}).join('')+'</div><div class="card"><div class="panel-title"><h2>🏆 Podiums du moment</h2></div>'+homePodiumsHtml()+'</div></section>';
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

  '<section class="card">' +
    '<div class="panel-title"><h3>Objectifs pilote</h3></div>' +
    pilotTargetsHtml(s) +
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
function podiums(){
  var laps=getAllLaps();
  var filtered=applyFilters(laps);
  var best=bestByPilot(filtered);
  app.innerHTML=
    '<section class="card"><h2>Podiums</h2>'+renderFilters()+podiumHtml(best)+'</section>' +
    '<section class="card"><div class="panel-title"><h2>Resume par piste</h2></div>'+podiumTrackSummaryHtml(laps)+'</section>' +
    '<section class="card"><div class="panel-title"><h2>Hall of fame podiums</h2></div>'+podiumHallOfFameHtml(laps)+'</section>' +
    '<section class="card"><h2>Classement</h2>'+recordsTable(best,100)+'</section>';
  bindFilters(podiums);
}

function reportTopRows(rows, limit){
  return rows.slice(0,limit||5).map(function(r,i){
    return '<tr><td>'+(i+1)+'</td><td><a href="#/pilote/'+encodeURIComponent(r._pilot)+'">'+escapeHtml(r._pilot)+'</a></td><td><strong>'+fmtTimeS(r._time)+'</strong></td><td><span class="badge">'+escapeHtml(r._track)+'</span></td><td>'+escapeHtml(r._date||r.session_name||'-')+'</td></tr>';
  }).join('');
}
function reportActivityRows(activities){
  if(!activities.length)return '<p class="small">Aucune activite disponible.</p>';
  return '<div class="report-activity-list">'+activities.map(function(a){
    return '<div class="report-activity-item"><strong>'+escapeHtml(a.date||a.name)+'</strong><span>'+a.laps+' tours</span><span>'+Object.keys(a.pilots).length+' pilotes</span><span>'+escapeHtml(Object.keys(a.tracks).join(' / ')||'-')+'</span></div>';
  }).join('')+'</div>';
}
function reportPage(){
  var laps=getAllLaps();
  var all=getAllLapsRaw(true);
  var activities=latestActivities();
  var bestAll=bestByPilot(laps);
  var best10=bestByPilot(laps.filter(function(l){return l._track==='TT1/10';}));
  var best18=bestByPilot(laps.filter(function(l){return l._track==='TT1/8';}));
  var latest=activities[0];
  var generated=new Date().toLocaleString('fr-FR');

  app.innerHTML=
    '<section class="report-hero card">' +
      '<div><h1>Rapport club MRCP</h1><p class="small">Genere le '+escapeHtml(generated)+' depuis les donnees du dashboard.</p></div>' +
      '<button id="printReport" class="btn-primary">Imprimer</button>' +
    '</section>' +
    '<section class="report-grid">' +
      '<div class="card"><h3>Tours actifs</h3><div class="big">'+laps.length.toLocaleString('fr-FR')+'</div><p class="small">'+all.length.toLocaleString('fr-FR')+' tours lus au total</p></div>' +
      '<div class="card"><h3>Pilotes classes</h3><div class="big">'+bestAll.length+'</div><p class="small">avec au moins un chrono actif</p></div>' +
      '<div class="card"><h3>Derniere activite</h3><div class="big">'+escapeHtml(latest?String(latest.laps):'-')+'</div><p class="small">'+escapeHtml(latest?(latest.date||latest.name):'Aucune')+'</p></div>' +
      '<div class="card"><h3>Qualite</h3><div class="big">'+suspiciousLaps().length+'</div><p class="small">tours suspects restants</p></div>' +
    '</section>' +
    '<section class="card"><div class="panel-title"><h2>Records par piste</h2></div>'+podiumTrackSummaryHtml(laps)+'</section>' +
    '<section class="report-columns">' +
      '<div class="card"><h2>Top TT1/10</h2><div class="table-wrap"><table><thead><tr><th>#</th><th>Pilote</th><th>Temps</th><th>Piste</th><th>Date</th></tr></thead><tbody>'+reportTopRows(best10,8)+'</tbody></table></div></div>' +
      '<div class="card"><h2>Top TT1/8</h2><div class="table-wrap"><table><thead><tr><th>#</th><th>Pilote</th><th>Temps</th><th>Piste</th><th>Date</th></tr></thead><tbody>'+reportTopRows(best18,8)+'</tbody></table></div></div>' +
    '</section>' +
    '<section class="card"><div class="panel-title"><h2>Dernieres activites</h2></div>'+reportActivityRows(activities)+'</section>';

  var print=document.getElementById('printReport');
  if(print)print.onclick=function(){window.print();};
}


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
    return (parseDateValue(b.date || b.sessionName)-parseDateValue(a.date || a.sessionName))||String(b.sessionName).localeCompare(String(a.sessionName));
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

function liveTrackCounts(laps){
  var counts={};
  laps.forEach(function(l){var track=l._track||'Non classe';counts[track]=(counts[track]||0)+1;});
  return counts;
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
  var trackCounts = liveTrackCounts(session.laps);
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
          '<div class="goal-pill"><span class="small">Tours total</span><strong>'+session.laps.length+'</strong></div>' +
          '<div class="goal-pill"><span class="small">TT1/8</span><strong>'+(trackCounts['TT1/8']||0)+'</strong></div>' +
          '<div class="goal-pill"><span class="small">TT1/10</span><strong>'+(trackCounts['TT1/10']||0)+'</strong></div>' +
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
function lapSuspicionReasons(l){
  var reason=[];
  if(l._excluded) reason.push('exclu');
  if(l._time<8) reason.push('< 8s');
  if(l._time>=30&&l._time<=45&&l._track==='TT1/8') reason.push('30-45s TT1/8');
  if(l._pilot.indexOf('Inconnu')>=0||l._pilot==='Pilote inconnu'||/^[0-9]+/.test(String(l._pilot))) reason.push('pilote inconnu');
  return reason;
}
function suspiciousLaps(){return getAllLapsRaw(true).filter(function(l){return lapSuspicionReasons(l).length>0;}).sort(function(a,b){return a._time-b._time;});}
function downloadJson(filename,obj){var blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}
function qualityGroupKey(l, type){
  return type==='session' ? (l.session_id||l.session_name||l._date||'session') : (normalizeTransponder(l.transponder)||'sans-puce');
}
function qualityGroups(laps, type){
  var map={};
  laps.forEach(function(l){
    var key=qualityGroupKey(l,type);
    if(!map[key])map[key]={key:key,label:type==='session'?(l.session_name||l._date||key):(normalizeTransponder(l.transponder)||'Sans puce'),laps:[],pilots:{},tracks:{},best:null};
    map[key].laps.push(l);
    map[key].pilots[l._pilot]=true;
    map[key].tracks[l._track]=true;
    if(!map[key].best||l._time<map[key].best._time)map[key].best=l;
  });
  return Object.values(map).sort(function(a,b){return b.laps.length-a.laps.length||((a.best?a.best._time:999)-(b.best?b.best._time:999));});
}
function qualityGroupHtml(groups, type){
  if(!groups.length)return '<p class="small">Aucun groupe à traiter.</p>';
  return '<div class="quality-groups">'+groups.slice(0,10).map(function(g){
    var pilots=Object.keys(g.pilots).slice(0,3).join(', ');
    var tracks=Object.keys(g.tracks).join(' / ');
    return '<div class="quality-group">' +
      '<div><strong>'+escapeHtml(g.label)+'</strong><div class="small">'+g.laps.length+' tours · '+escapeHtml(tracks||'-')+' · '+escapeHtml(pilots||'-')+'</div><div class="small">Meilleur : '+fmtTimeS(g.best&&g.best._time)+'</div></div>' +
      '<div class="admin-actions">' +
        '<button class="bulk-quality btn-danger" data-type="'+type+'" data-key="'+escapeHtml(g.key)+'" data-action="exclude">Exclure groupe</button>' +
        '<button class="bulk-quality btn-good" data-type="'+type+'" data-key="'+escapeHtml(g.key)+'" data-action="tt10">Tout TT1/10</button>' +
      '</div>' +
    '</div>';
  }).join('')+'</div>';
}
function adminRecords(){
  var laps=suspiciousLaps();
  var o=getOverrides();
  var puceGroups=qualityGroups(laps.filter(function(l){return normalizeTransponder(l.transponder);}), 'transponder');
  var sessionGroups=qualityGroups(laps, 'session');

  var rows=laps.slice(0,500).map(function(l){
    var reason=lapSuspicionReasons(l);

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
    '<section class="admin-history"><div class="panel-title"><h2>Nettoyage par puce</h2></div>'+qualityGroupHtml(puceGroups,'transponder')+'</section>' +
    '<section class="admin-history"><div class="panel-title"><h2>Nettoyage par session</h2></div>'+qualityGroupHtml(sessionGroups,'session')+'</section>' +
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

  document.querySelectorAll('.bulk-quality').forEach(function(btn){
    btn.onclick=function(){
      var type=btn.getAttribute('data-type');
      var key=btn.getAttribute('data-key');
      var action=btn.getAttribute('data-action');
      var groupLaps=laps.filter(function(l){return qualityGroupKey(l,type)===key;});
      var label=type==='session'?'cette session':'cette puce';

      if(!groupLaps.length){
        alert('Aucun tour trouve pour ce groupe.');
        return;
      }

      if(action==='exclude' && !confirm('Exclure '+groupLaps.length+' tours de '+label+' ?')) return;
      if(action==='tt10' && !confirm('Forcer '+groupLaps.length+' tours de '+label+' en TT1/10 ?')) return;

      var x=getOverrides();
      groupLaps.forEach(function(l){
        if(action==='exclude'){
          x.excluded[l.lap_id]={reason:'Exclu admin groupe '+(type==='session'?'session':'puce')};
          delete x.forced_track[l.lap_id];
        }
        if(action==='tt10'){
          x.forced_track[l.lap_id]='TT1/10';
          delete x.excluded[l.lap_id];
        }
      });
      setOverrides(x);
      adminRecords();
      alert(groupLaps.length+' tours corriges. Pense a appliquer via API ou exporter le JSON.');
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
function qualityTrackStats(laps){
  var map={};
  laps.forEach(function(l){
    var track=l._track||'unknown';
    if(!map[track])map[track]={track:track,laps:0,pilots:{},best:null,sum:0};
    map[track].laps++;
    map[track].pilots[l._pilot]=true;
    map[track].sum+=l._time;
    if(!map[track].best||l._time<map[track].best._time)map[track].best=l;
  });
  return Object.values(map).sort(function(a,b){return a.track.localeCompare(b.track);});
}
function qualityReasonStats(laps){
  var map={};
  laps.forEach(function(l){
    lapSuspicionReasons(l).forEach(function(reason){map[reason]=(map[reason]||0)+1;});
  });
  return Object.keys(map).sort(function(a,b){return map[b]-map[a];}).map(function(k){return{reason:k,count:map[k]};});
}
function qualityGroupRows(groups, type){
  if(!groups.length)return '<p class="small">Aucun groupe prioritaire.</p>';
  return '<div class="table-wrap"><table><thead><tr><th>'+escapeHtml(type==='session'?'Session':'Puce')+'</th><th>Tours</th><th>Pistes</th><th>Pilotes vus</th><th>Meilleur</th></tr></thead><tbody>'+
    groups.slice(0,8).map(function(g){
      return '<tr><td><strong>'+escapeHtml(g.label)+'</strong></td><td>'+g.laps.length+'</td><td>'+escapeHtml(Object.keys(g.tracks).join(' / ')||'-')+'</td><td>'+escapeHtml(Object.keys(g.pilots).slice(0,4).join(' / ')||'-')+'</td><td>'+fmtTimeS(g.best&&g.best._time)+'</td></tr>';
    }).join('')+'</tbody></table></div>';
}
function quality(){
  var all=getAllLapsRaw(true);
  var active=getAllLaps();
  var suspect=suspiciousLaps();
  var o=getOverrides();
  var reasons=qualityReasonStats(suspect);
  var tracks=qualityTrackStats(active);
  var puceGroups=qualityGroups(suspect.filter(function(l){return normalizeTransponder(l.transponder);}), 'transponder');
  var sessionGroups=qualityGroups(suspect, 'session');
  var unknownPilots=active.filter(function(l){return l._pilot.indexOf('Inconnu')>=0||l._pilot==='Pilote inconnu'||/^[0-9]+/.test(String(l._pilot));}).length;
  var fastLaps=active.filter(function(l){return l._time<8;}).length;
  var corrected=Object.keys(o.excluded).length+Object.keys(o.forced_track).length;

  var reasonHtml=reasons.length?'<div class="quality-reason-grid">'+reasons.map(function(r){
    return '<div><span class="small">'+escapeHtml(r.reason)+'</span><strong>'+r.count+'</strong></div>';
  }).join('')+'</div>':'<p class="small">Aucune raison suspecte detectee.</p>';

  var trackRows=tracks.map(function(t){
    return '<tr><td><span class="badge">'+escapeHtml(t.track)+'</span></td><td>'+t.laps+'</td><td>'+Object.keys(t.pilots).length+'</td><td><strong>'+fmtTimeS(t.best&&t.best._time)+'</strong><div class="small">'+escapeHtml((t.best&&t.best._pilot)||'-')+'</div></td><td>'+fmtTimeS(t.sum/t.laps)+'</td></tr>';
  }).join('');

  adminOnly('Qualite donnees',
    '<div class="grid">' +
      '<div class="card"><h3>Tours suspects</h3><div class="big">'+suspect.length+'</div><p class="small">A traiter dans Records admin</p></div>' +
      '<div class="card"><h3>Tours actifs</h3><div class="big">'+active.length+'</div><p class="small">'+all.length+' tours lus au total</p></div>' +
      '<div class="card"><h3>Corrections locales</h3><div class="big">'+corrected+'</div><p class="small">'+Object.keys(o.excluded).length+' exclusions, '+Object.keys(o.forced_track).length+' pistes forcees</p></div>' +
      '<div class="card"><h3>Pilotes inconnus</h3><div class="big">'+unknownPilots+'</div><p class="small">'+fastLaps+' tours sous 8s</p></div>' +
    '</div>' +
    '<p><a href="#/admin-records" class="btn-primary">Corriger les tours suspects</a> <a href="#/admin-pilotes" class="btn-secondary">Associer les pilotes</a></p>' +
    '<section class="admin-history"><div class="panel-title"><h2>Raisons detectees</h2></div>'+reasonHtml+'</section>' +
    '<section class="admin-history"><div class="panel-title"><h2>Etat par piste</h2></div><div class="table-wrap"><table><thead><tr><th>Piste</th><th>Tours</th><th>Pilotes</th><th>Meilleur</th><th>Moyenne</th></tr></thead><tbody>'+trackRows+'</tbody></table></div></section>' +
    '<section class="admin-history"><div class="panel-title"><h2>Puces a verifier</h2></div>'+qualityGroupRows(puceGroups,'transponder')+'</section>' +
    '<section class="admin-history"><div class="panel-title"><h2>Sessions a verifier</h2></div>'+qualityGroupRows(sessionGroups,'session')+'</section>'
  );
}
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
    '<div class="admin-history"><div class="panel-title"><h2>Diagnostic admin</h2><button id="refreshAdminDiagnostics" class="btn-secondary">Rafraichir</button></div><div id="adminDiagnostics"><div class="small">Chargement...</div></div></div>' +
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
  var refreshDiagnostics=document.getElementById('refreshAdminDiagnostics');
  if(refreshDiagnostics)refreshDiagnostics.onclick=function(){loadAdminStatus();};
  loadAdminStatus();
  loadAdminBackups();
  loadAdminHistory();
  var reset=document.getElementById('resetAdminApi');
  if(reset)reset.onclick=function(){if(confirm('Oublier acces admin sur ce navigateur ?')){clearAdminConfig();state.isAdmin=false;location.hash='#/';router();}};
}
function showError(title,err){app.innerHTML='<section class="card"><h2>'+escapeHtml(title)+'</h2><p>'+escapeHtml(err&&err.message?err.message:String(err))+'</p></section>';console.error(err);}
function router(){try{updateAdminNav();setActiveNav();var h=location.hash||'#/';if(h.indexOf('#/live')===0)return livePage();
    if(h.indexOf('#/mes-chronos')===0)return myChronos();if(h.indexOf('#/pilotes')===0)return pilots();if(h.indexOf('#/pilote/')===0)return pilotPage(h.replace('#/pilote/',''));if(h.indexOf('#/podiums')===0)return podiums();if(h.indexOf('#/rapport')===0)return reportPage();if(h.indexOf('#/quality')===0)return quality();if(h.indexOf('#/admin-pilotes')===0)return adminPilots();if(h.indexOf('#/admin-records')===0)return adminRecords();if(h.indexOf('#/admin')===0)return adminPage();return home();}catch(e){showError('Erreur affichage',e);}}
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
