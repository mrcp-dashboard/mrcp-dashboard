// Extrait de app_v2.js (decoupage modules) - voir docs/DEVELOPMENT.md
// Appels a l'API admin locale (docs/admin_api.py) : auth, corrections, historique, backups.
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

