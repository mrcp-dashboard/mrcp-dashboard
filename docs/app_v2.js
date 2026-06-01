(function(){
'use strict';

var DATA = null;
var app = document.getElementById('app');
var deferredPrompt = null;
var ADMIN_CFG_KEY = 'mrcp_admin_api_config';
var DATA_CACHE_NAME = 'mrcp-dashboard-data-v1';
var DATA_URL = 'data_v2.json';
var DEFAULT_LAP_DISTANCE_METERS = 250;
var TRACK_LAP_DISTANCE_METERS = {'TT1/8':250,'TT1/10':180};
var state = { track:'all', recordPeriod:'total', isAdmin: !!getAdminConfig().token };
var lapsCache = null;

function escapeHtml(value){return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function fmtTime(v){var n=Number(v);return Number.isFinite(n)?n.toFixed(3):'-';}
function fmtTimeS(v){return fmtTime(v)+' s';}
function lapSeconds(l){return Number(l.lap_time ?? l.time ?? l.seconds ?? l.best_lap ?? l.duration);}
function normalizeTrack(l){if(l.track)return l.track;var t=lapSeconds(l);if(!Number.isFinite(t))return'unknown';return t<30?'TT1/10':'TT1/8';}
function normalizeTransponder(v){return String(v||'').replace('/0','').trim();}
function normalizeTrackValue(track,l){
  var s=String(track||'').trim();
  if(s&&s.toLowerCase()!=='mixte'&&s.toLowerCase()!=='unknown')return s;
  return normalizeTrack(l);
}
function displayTrack(track){
  var s=String(track||'').trim();
  if(!s||s==='unknown')return '-';
  if(s.toLowerCase()==='mixte')return 'TT1/10';
  return s;
}
function lapPilot(l){return l.pilot_name||l.pilot||l.driver||l.name||l.participant_name||l.transponder||'Pilote inconnu';}
function lapKey(activityId, transponder, lapNo, startTime, lapTime){var n=Number(lapTime);return [activityId||'',normalizeTransponder(transponder),lapNo||'',startTime||'',Number.isFinite(n)?n.toFixed(3):''].join('|');}
function getOverrides(){try{var raw=JSON.parse(localStorage.getItem('mrcp_lap_overrides')||'{}');return{excluded:raw.excluded&&typeof raw.excluded==='object'?raw.excluded:{},forced_track:raw.forced_track&&typeof raw.forced_track==='object'?raw.forced_track:{}};}catch(e){return{excluded:{},forced_track:{}};}}
function clearDerivedCache(){lapsCache=null;}
function setOverrides(o){localStorage.setItem('mrcp_lap_overrides',JSON.stringify({excluded:o.excluded||{},forced_track:o.forced_track||{}},null,2));clearDerivedCache();}
function forcedTrack(lapId,o){return (o||getOverrides()).forced_track[lapId]||null;}
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
function lapDistanceMeters(track){
  var distances=(DATA&&DATA.meta&&DATA.meta.track_distances_m)||{};
  var value=Number(distances[track]||TRACK_LAP_DISTANCE_METERS[track]||distances.default||DEFAULT_LAP_DISTANCE_METERS);
  return Number.isFinite(value)&&value>0?value:DEFAULT_LAP_DISTANCE_METERS;
}
function totalDistanceKm(laps){
  var meters=laps.reduce(function(sum,l){return sum+lapDistanceMeters(l._track);},0);
  return meters/1000;
}
function fmtKm(v){
  var n=Number(v);
  if(!Number.isFinite(n))return '-';
  return n>=1000?n.toLocaleString('fr-FR',{maximumFractionDigits:0}):n.toLocaleString('fr-FR',{maximumFractionDigits:1});
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

function personalRecordMap(){
  var map={}, best={};
  getAllLaps().slice().sort(function(a,b){
    return parseDateValue(a._date||a.session_date||a.date)-parseDateValue(b._date||b.session_date||b.date)||lapSortValue(a)-lapSortValue(b)||a._time-b._time;
  }).forEach(function(l){
    var key=l._pilot+'|'+l._track;
    if(best[key]!=null&&l._time<best[key]){
      map[l.lap_id]=true;
    }
    if(best[key]==null||l._time<best[key])best[key]=l._time;
  });
  return map;
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
function podiumHtml(rows){var top=rows.slice(0,3);if(!top.length)return'<p class="small">Aucun chrono trouvé.</p>';var order=[1,0,2];return'<div class="podium">'+order.map(function(i){var r=top[i];if(!r)return'<div></div>';var cls=i===0?'first':i===1?'second':'third';var med=i===0?'🥇':i===1?'🥈':'🥉';return'<div class="step '+cls+'"><span class="medal">'+med+'</span><strong>'+escapeHtml(r._pilot)+'</strong><div class="time">'+fmtTime(r._time)+'</div><div class="small">'+escapeHtml(r._track)+'</div></div>';}).join('')+'</div>';}
function recordsTable(rows,limit){limit=limit||20;return'<div class="table-wrap"><table><thead><tr><th>#</th><th>Pilote</th><th>Temps</th><th>Piste</th><th>Session</th></tr></thead><tbody>'+rows.slice(0,limit).map(function(r,i){return'<tr><td>'+(i+1)+'</td><td><a href="#/pilote/'+encodeURIComponent(r._pilot)+'">'+escapeHtml(r._pilot)+'</a></td><td><strong>'+fmtTimeS(r._time)+'</strong></td><td><span class="badge">'+escapeHtml(displayTrack(r._track))+'</span></td><td>'+escapeHtml(r.session_name||r._date||'-')+'</td></tr>';}).join('')+'</tbody></table></div>';}
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
  app.innerHTML='<section class="hero-dashboard"><div class="hero-card"><h1>Dashboard MRCP</h1><p>Chronos, records, podiums et progression personnelle.</p><div class="hero-actions"><a href="#/sessions" class="btn-primary">Sessions</a><a href="#/journee?date='+todayKey()+'" class="btn-secondary">Vue journée</a></div></div><div class="card kpi-card"><h2>Chiffres clés</h2><div class="kpi-grid"><div class="kpi"><div class="kpi-icon">👥</div><div><div class="kpi-label">Pilotes</div><div class="kpi-value">'+pilotsCount+'</div><div class="kpi-label">inscrits</div></div></div><div class="kpi"><div class="kpi-icon">⏱️</div><div><div class="kpi-label">Tours</div><div class="kpi-value">'+laps.length.toLocaleString('fr-FR')+'</div><div class="kpi-label">enregistrés</div></div></div><div class="kpi"><div class="kpi-icon">📍</div><div><div class="kpi-label">Kilomètres</div><div class="kpi-value">'+fmtKm(distanceKm)+'</div><div class="kpi-label">estimés</div></div></div><div class="kpi"><div class="kpi-icon">📋</div><div><div class="kpi-label">Tours aujourd hui</div><div class="kpi-value">'+dayLaps.length.toLocaleString('fr-FR')+'</div><div class="kpi-label">'+escapeHtml(todayKey())+'</div></div></div><div class="kpi"><div class="kpi-icon">👤</div><div><div class="kpi-label">Pilotes jour</div><div class="kpi-value">'+dayRows.length+'</div><div class="kpi-label">actifs</div></div></div><div class="kpi"><div class="kpi-icon">⚡</div><div><div class="kpi-label">Best jour</div><div class="kpi-value">'+fmtTime(dayBest&&dayBest.best)+'</div><div class="kpi-label">'+escapeHtml(dayBest?dayBest.pilot:'-')+'</div></div></div></div></div></section><section class="dashboard-grid home-dashboard-grid"><div class="card home-sessions-card"><div class="panel-title"><h2>📅 10 dernières sessions</h2><a class="mini-button" href="#/sessions">Voir tout</a></div><div>'+(sessionRows||'<p class="small">Aucune session trouvée.</p>')+'</div></div><div class="card"><div class="panel-title"><h2>🏁 Records du jour</h2><a class="mini-button" href="#/journee?date='+todayKey()+'">Voir journée</a></div><div class="day-record-grid"><div><span class="badge">TT1/8</span><strong>'+fmtTimeS(dayBest18&&dayBest18.best)+'</strong><small>'+escapeHtml(dayBest18?dayBest18.pilot:'-')+'</small></div><div><span class="badge">TT1/10</span><strong>'+fmtTimeS(dayBest10&&dayBest10.best)+'</strong><small>'+escapeHtml(dayBest10?dayBest10.pilot:'-')+'</small></div></div>'+homePodiumsHtml()+'</div></section>';
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
      '</div>' +
      '<div class="share-row">' +
        '<button id="setMyProfile" class="btn-primary">C’est mon profil</button>' +
        '<button id="copyPilotLink" class="btn-secondary">Copier lien fiche</button>' +
        '<button id="printPilotProfile" class="btn-secondary">Imprimer fiche</button>' +
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

  app.innerHTML = '<section class="card"><h2>Mes chronos</h2><button id="changePilot" class="btn-secondary">Changer de pilote</button></section>' + pilotFullProfileHtml(saved) + '<div class="mobile-sticky-action"><a href="#/podiums" class="btn-primary">Voir podiums du club</a></div>';

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
  app.innerHTML='<section class="card"><div class="panel-title"><h2>Vue journée</h2><input id="dayViewDate" type="date" value="'+escapeHtml(date)+'"></div><div class="grid"><div class="card"><h3>Tours</h3><div class="big">'+dayLaps.length+'</div></div><div class="card"><h3>Pilotes</h3><div class="big">'+rows.length+'</div></div><div class="card"><h3>TT1/8</h3><div class="big">'+(counts['TT1/8']||0)+'</div><p class="small">'+fmtTimeS(best18&&best18.best)+' '+escapeHtml(best18?best18.pilot:'')+'</p></div><div class="card"><h3>TT1/10</h3><div class="big">'+(counts['TT1/10']||0)+'</div><p class="small">'+fmtTimeS(best10&&best10.best)+' '+escapeHtml(best10?best10.pilot:'')+'</p></div></div></section><section class="card"><div class="panel-title"><h2>Classement du jour</h2><a class="mini-button" href="#/jour">Live jour</a></div>'+liveDayTable(rows)+'</section><section class="card"><div class="panel-title"><h2>Sessions du jour</h2></div>'+(sessionRows||'<p class="small">Aucune session pour cette date.</p>')+'</section>';
  var input=document.getElementById('dayViewDate');
  if(input)input.onchange=function(){location.hash='#/journee?date='+input.value;};
}
function podiums(){
  var laps=getAllLaps();
  var filtered=applyRecordFilters(laps);
  var best=bestByPilot(filtered);
  app.innerHTML=
    '<section class="card"><h2>Podiums</h2>'+renderFilters(true)+podiumHtml(best)+'</section>' +
    '<section class="card"><div class="panel-title"><h2>Resume par piste</h2></div>'+podiumTrackSummaryHtml(laps)+'</section>' +
    '<section class="card"><h2>Classement</h2>'+recordsTable(best,100)+'</section>';
  bindFilters(podiums,true);
}

var liveTimer = null;

function liveTrackCounts(laps){
  var counts={};
  laps.forEach(function(l){var track=l._track||'Non classe';counts[track]=(counts[track]||0)+1;});
  return counts;
}

function dateKeyFromValue(value){
  var s=String(value||'').trim();
  var m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return m[1]+'-'+m[2]+'-'+m[3];
  m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(m)return m[3]+'-'+m[2]+'-'+m[1];
  var t=Date.parse(s);
  if(Number.isFinite(t)){
    var d=new Date(t);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  return '';
}

function todayKey(){
  var d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function liveDayPilotName(l){
  var name=String(l._pilot||'').trim();
  if(!name||name==='Pilote inconnu'||name.indexOf('Inconnu')>=0||/^[0-9]+/.test(name)){
    return normalizeTransponder(l.transponder)||name||'Puce inconnue';
  }
  return name;
}

function liveDaySourceLaps(dayKey){
  var rows=[], o=getOverrides(), order=0;
  function add(l,ctx){
    var dateKey=dateKeyFromValue(l.date||l.session_date||ctx.session_date||ctx.session_name);
    if(dateKey!==dayKey)return;
    var t=lapSeconds(l);
    if(!Number.isFinite(t)||t<=0)return;
    var tp=ctx.transponder||l.transponder||'';
    var lapNo=l.lap_no||l.lap||l.number||'';
    var startTime=l.start_time||l.started_at||'';
    var lapId=l.lap_id||l.id||lapKey(ctx.activity_id,tp,lapNo,startTime,t);
    if(o.excluded[lapId]||l.exclude_from_records||l.excluded)return;
    order++;
    rows.push(Object.assign({},l,{
      lap_id:lapId,
      activity_id:ctx.activity_id||'',
      session_id:ctx.session_id||ctx.activity_id||'',
      session_name:ctx.session_name||'',
      session_date:ctx.session_date||'',
      transponder:tp,
      pilot_name:ctx.pilot_name||lapPilot(l),
      _time:t,
      _track:forcedTrack(lapId)||normalizeTrackValue(l.track||ctx.track,l),
      _pilot:ctx.pilot_name||lapPilot(l),
      _date:ctx.session_date||l.date||l.session_date||'',
      _order:order
    }));
  }
  if(DATA&&Array.isArray(DATA.activities)&&DATA.activities.length){
    DATA.activities.forEach(function(a){
      var id=a.id||a.activity_id||a.session_id||'', name=a.name||a.title||a.session_name||a.date_fr||a.date||'', date=a.date||a.session_date||a.created_at||'';
      (a.participants||[]).forEach(function(p){
        var pilot=p.pilot_name||p.name||p.driver||('Inconnu #'+(p.transponder||'')), tp=p.transponder||p.transponder_id||'';
        (p.laps||[]).forEach(function(l){add(l,{activity_id:id,session_id:id,session_name:name,session_date:date,pilot_name:pilot,transponder:tp,track:l.track||p.track||null});});
      });
    });
    return rows;
  }
  return getAllLaps().filter(function(l){return dateKeyFromValue(l._date||l.session_date||l.date||l.session_name)===dayKey;});
}

function liveDayRows(laps){
  var map=new Map();
  laps.forEach(function(l){
    var key=liveDayPilotName(l);
    var item=map.get(key)||{pilot:key,laps:0,best:Infinity,last:null,total:0,tracks:{},lastDate:''};
    item.laps++;
    item.total+=l._time;
    if(!item.last||(l._order||0)>((item.last&&item.last._order)||0))item.last=l;
    item.lastDate=l._date||l.session_name||'';
    item.tracks[l._track]=true;
    if(l._time<item.best)item.best=l._time;
    map.set(key,item);
  });
  return Array.from(map.values()).map(function(r){
    r.avg=r.laps?r.total/r.laps:null;
    r.track=Object.keys(r.tracks).join(' / ')||'-';
    return r;
  }).sort(function(a,b){return a.best-b.best||b.laps-a.laps||a.pilot.localeCompare(b.pilot);});
}

function liveDayTable(rows){
  if(!rows.length)return '<p class="small">Aucun tour date du jour pour le moment.</p>';
  return '<div class="table-wrap live-day-table"><table><thead><tr><th>#</th><th>Pilote / puce</th><th>Tours</th><th>Meilleur</th><th>Tour actuel</th><th>Moyenne</th><th>Piste</th></tr></thead><tbody>'+
    rows.map(function(r,i){
      return '<tr>' +
        '<td>'+(i+1)+'</td>' +
        '<td><strong>'+escapeHtml(r.pilot)+'</strong></td>' +
        '<td>'+r.laps+'</td>' +
        '<td><strong>'+fmtTimeS(r.best)+'</strong></td>' +
        '<td>'+fmtTimeS(r.last&&r.last._time)+'</td>' +
        '<td>'+fmtTimeS(r.avg)+'</td>' +
        '<td><span class="badge">'+escapeHtml(r.track)+'</span></td>' +
      '</tr>';
    }).join('')+'</tbody></table></div>';
}

function liveDayPage(){
  if(liveTimer) clearTimeout(liveTimer);
  var key=todayKey();
  var dayLaps=liveDaySourceLaps(key);
  var filtered=applyFilters(dayLaps);
  var rows=liveDayRows(filtered);
  var best=rows[0]||null;
  var counts=liveTrackCounts(dayLaps);
  var lastUpdate=new Date().toLocaleTimeString('fr-FR');

  app.innerHTML=
    '<section class="live-hero">' +
      '<div class="card live-card">' +
        '<div class="live-status"><span class="live-dot"></span> LIVE JOUR</div>' +
        '<h1 class="live-title">Live reel du jour</h1>' +
        '<p class="pilot-sub">Tableau classe par meilleur tour du jour. Les pilotes inconnus sont affiches par puce.</p>' +
        '<div class="goal-box">' +
          '<div class="goal-pill"><span class="small">Date</span><strong>'+escapeHtml(key)+'</strong></div>' +
          '<div class="goal-pill"><span class="small">Pilotes / puces</span><strong>'+rows.length+'</strong></div>' +
          '<div class="goal-pill"><span class="small">Tours du jour</span><strong>'+dayLaps.length+'</strong></div>' +
          '<div class="goal-pill"><span class="small">TT1/8</span><strong>'+(counts['TT1/8']||0)+'</strong></div>' +
          '<div class="goal-pill"><span class="small">TT1/10</span><strong>'+(counts['TT1/10']||0)+'</strong></div>' +
        '</div>' +
        '<div class="live-refresh">' +
          '<button id="manualRefreshLiveDay" class="btn-primary">Rafraichir</button>' +
          '<span class="small">Dernier rafraichissement : '+lastUpdate+'</span>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<h3>Meilleur tour du jour</h3>' +
        '<div class="big">'+fmtTimeS(best&&best.best)+'</div>' +
        '<p>'+(best?escapeHtml(best.pilot):'-')+'</p>' +
        '<p class="small">Rafraichissement automatique toutes les 30 secondes.</p>' +
      '</div>' +
    '</section>' +
    '<section class="card">' +
      '<div class="panel-title"><h2>Classement live du jour</h2></div>' +
      renderFilters() +
      liveDayTable(rows) +
    '</section>';

  bindFilters(liveDayPage);
  var manual=document.getElementById('manualRefreshLiveDay');
  if(manual)manual.onclick=function(){location.reload();};
  liveTimer=setTimeout(function(){location.reload();},30000);
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
function hashParam(name, fallback){
  var raw=(location.hash.split('?')[1]||'');
  var params=new URLSearchParams(raw);
  return params.get(name)||fallback;
}
function adminRecordLapsForView(view){
  var rows;
  if(view==='tt10') rows=getAllLapsRaw(true).filter(function(l){return l._track==='TT1/10';});
  else if(view==='tt8') rows=getAllLapsRaw(true).filter(function(l){return l._track==='TT1/8';});
  else if(view==='all') rows=getAllLapsRaw(true);
  else rows=suspiciousLaps();
  return rows.sort(function(a,b){
    return (a._time-b._time)||String(b._date||b.session_name).localeCompare(String(a._date||a.session_name));
  });
}
function adminRecordViewLabel(view){
  if(view==='tt10')return'Tours TT1/10';
  if(view==='tt8')return'Tours TT1/8';
  if(view==='all')return'Tous les tours';
  return'Tours suspects';
}
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
  var view=hashParam('view','suspect');
  var laps=adminRecordLapsForView(view);
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
    '<p class="small">Mode correction rapide : après un clic sur Supprimer / TT1/10 / TT1/8, la ligne disparaît automatiquement pour passer à la suivante. Ensuite applique via API ou exporte <strong>lap_overrides.json</strong>. L API fusionne avec les corrections déjà publiées.</p>' +
    '<div class="grid">' +
      '<div class="card"><h3>Exclusions</h3><div class="big" id="excludedCount">'+Object.keys(o.excluded).length+'</div></div>' +
      '<div class="card"><h3>Forçages piste</h3><div class="big" id="forcedTrackCount">'+Object.keys(o.forced_track).length+'</div></div>' +
      '<div class="card"><h3>Tours affiches</h3><div class="big" id="suspectCount">'+laps.length+'</div><p class="small">'+escapeHtml(adminRecordViewLabel(view))+'</p></div>' +
    '</div>' +
    adminPreviewHtml() +
    '<p><button id="exportLapOverrides" class="btn-primary">Exporter lap_overrides.json</button> <button id="applyLapOverridesApi" class="btn-good">Appliquer via API</button> <button id="copyLapOverrides" class="btn-secondary">Copier JSON</button> <button id="clearLapOverrides" class="btn-danger">Vider corrections records</button></p>' +
    '<div id="adminRecordsStatus" class="admin-status hidden"></div>' +
    '<div class="admin-record-toolbar"><label class="small" for="adminRecordView">Vue</label><select id="adminRecordView"><option value="suspect">Tours suspects</option><option value="tt10">Tous les TT1/10</option><option value="tt8">Tous les TT1/8</option><option value="all">Tous les tours</option></select><span class="small">Utilise cette vue pour corriger un tour TT1/10 qui n apparait pas dans les suspects.</span></div>' +
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

  var recordView=document.getElementById('adminRecordView');
  if(recordView){
    recordView.value=view;
    recordView.onchange=function(){
      location.hash='#/admin-records?view='+encodeURIComponent(recordView.value);
      adminRecords();
    };
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
    if(confirm('Vider uniquement les corrections records locales de ce navigateur ? Les corrections déjà publiées sur GitHub seront conservées par l API.')){
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
function router(){try{updateAdminNav();setActiveNav();var h=location.hash||'#/';if(h.indexOf('#/journee')===0)return dayViewPage();if(h.indexOf('#/jour')===0)return liveDayPage();
    if(h.indexOf('#/mes-chronos')===0)return myChronos();if(h.indexOf('#/sessions')===0)return sessionsPage();if(h.indexOf('#/pilotes')===0)return pilots();if(h.indexOf('#/pilote-session/')===0)return pilotSessionPage(h.replace('#/pilote-session/',''));if(h.indexOf('#/pilote/')===0)return pilotPage(h.replace('#/pilote/',''));if(h.indexOf('#/podiums')===0)return podiums();if(h.indexOf('#/quality')===0)return quality();if(h.indexOf('#/admin-pilotes')===0)return adminPilots();if(h.indexOf('#/admin-records')===0)return adminRecords();if(h.indexOf('#/admin')===0)return adminPage();return home();}catch(e){showError('Erreur affichage',e);}}
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
  var installBtn=document.getElementById('installPwaBtn');
  var standalone=window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches;
  if(window.navigator&&window.navigator.standalone)standalone=true;
  if(installBtn&&standalone)installBtn.classList.add('hidden');
  if('serviceWorker' in navigator){
    var refreshing=false;
    navigator.serviceWorker.addEventListener('controllerchange',function(){
      if(refreshing)return;
      refreshing=true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js?v=20260528-install1').then(function(reg){
      if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
      reg.addEventListener('updatefound',function(){
        var worker=reg.installing;
        if(!worker)return;
        worker.addEventListener('statechange',function(){
          if(worker.state==='installed'&&navigator.serviceWorker.controller){
            worker.postMessage({type:'SKIP_WAITING'});
          }
        });
      });
    }).catch(function(e){console.log('SW non enregistré',e);});
  }
  window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferredPrompt=e;if(installBtn){installBtn.classList.remove('hidden');installBtn.textContent="Installer l'app";}});
  window.addEventListener('appinstalled',function(){deferredPrompt=null;if(installBtn)installBtn.classList.add('hidden');});
  if(installBtn){installBtn.onclick=async function(){
    if(deferredPrompt){
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt=null;
      installBtn.classList.add('hidden');
      return;
    }
    var ua=navigator.userAgent||'';
    var ios=/iphone|ipad|ipod/i.test(ua);
    if(ios){
      alert("Sur iPhone : ouvre le bouton Partager de Safari, puis choisis \"Sur l'ecran d'accueil\".");
    }else{
      alert("Si le bouton installation ne s'ouvre pas, utilise le menu du navigateur puis \"Installer l'application\" ou \"Ajouter a l'ecran d'accueil\".");
    }
  };}
}

async function readCachedDashboardData(){
  if(!('caches' in window))return null;
  var cache=await caches.open(DATA_CACHE_NAME);
  var res=await cache.match(DATA_URL);
  if(!res||!res.ok)return null;
  return res.json();
}

async function fetchFreshDashboardData(){
  var res=await fetch(DATA_URL+'?ts='+Date.now(),{cache:'no-store'});
  if(!res.ok)throw new Error('Impossible de charger data_v2.json : HTTP '+res.status);
  var text=await res.text();
  if('caches' in window){
    var cache=await caches.open(DATA_CACHE_NAME);
    await cache.put(DATA_URL,new Response(text,{headers:{'Content-Type':'application/json'}}));
  }
  return JSON.parse(text);
}

async function init(){
  try{
    bindAdmin(); setupPwa(); updateAdminNav();
    var today=document.getElementById('todayLabel');if(today)today.textContent=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
    var renderedFromCache=false;
    try{
      var cached=await readCachedDashboardData();
      if(cached){DATA=cached;clearDerivedCache();router();renderedFromCache=true;}
    }catch(cacheError){console.log('Cache data ignore',cacheError);}
    try{
      DATA=await fetchFreshDashboardData();
      clearDerivedCache();
      router();
    }catch(fetchError){
      if(!renderedFromCache)throw fetchError;
      console.log('Rafraichissement data impossible',fetchError);
    }
  }catch(e){showError('Erreur de chargement',e);}
}
window.addEventListener('hashchange',router);
init();

})();
